// ==========================================
// CLASSEMENT – Backend (RPC get_ranking)
// Données publiques : profiles_public + dernière session par user
// Fallback : shared_rankings_snapshots (classements scrapés partagés)
// ==========================================

const RANKING_LIMIT_DEFAULT = 100;
const RANKING_LIMIT_MAX = 100;
var _lastDostatsPeriodWarnKey = '';
var _lastDostatsPeriodWarnAt = 0;
var DOSTATS_PERIOD_WARN_THROTTLE_MS = 15000;

/**
 * Nombre max de snapshots DOStats (par scraped_at desc.) à parcourir pour trouver
 * la combinaison hof_type + period. Un limit trop bas (ex. 5) laissait le classement
 * période vide si les derniers scrapes ne contenaient pas encore cette variante.
 */
var DOSTATS_PERIOD_SNAPSHOT_LOOKBACK = 30;

/** Mapping libellé affiché → code serveur (pour import fusion) */
var RANKING_SERVER_DISPLAY_TO_CODE = { 'Global PvE 5 (Steam)': 'gbl5' };
if (typeof SERVER_DISPLAY_TO_CODE !== 'undefined') {
  for (var k in SERVER_DISPLAY_TO_CODE) if (Object.prototype.hasOwnProperty.call(SERVER_DISPLAY_TO_CODE, k)) {
    RANKING_SERVER_DISPLAY_TO_CODE[k] = SERVER_DISPLAY_TO_CODE[k];
  }
}

/**
 * Supprime les anciens snapshots d'un serveur dans shared_rankings_dostats_snapshots
 * et shared_rankings_snapshots afin qu'il n'existe jamais plus d'un snapshot par serveur.
 * À appeler avant d'insérer un nouveau snapshot pour ce serveur (ou s'appuyer sur les RPC
 * insert_ranking_snapshot / insert_dostats_snapshot qui font cette suppression côté serveur).
 * @param {object} supabase - Client Supabase
 * @param {string} serverId - Code serveur (ex: gbl5)
 * @returns {Promise<void>}
 */
async function deleteOldSnapshotsForServer(supabase, serverId) {
  if (!supabase || !serverId) return;
  try {
    await supabase.from('shared_rankings_dostats_snapshots').delete().eq('server_id', serverId);
    await supabase.from('shared_rankings_snapshots').delete().eq('server_id', serverId);
  } catch (e) {
    if (typeof Logger !== 'undefined' && Logger.warn) {
      Logger.warn('[Ranking] deleteOldSnapshotsForServer:', e && e.message ? e.message : e);
    }
  }
}

if (typeof window !== 'undefined') {
  window.deleteOldSnapshotsForServer = deleteOldSnapshotsForServer;
}

/**
 * Retourne les server_id présents dans shared_rankings_snapshots.
 * @returns {Promise<string[]>}
 */
async function getSharedRankingServersList() {
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (!supabase) return [];
  try {
      var r = await supabase.rpc('get_ranking_latest_per_server', { p_limit: 50 });
      if (r.error) {
        try {
          Logger.error('[Ranking] get_ranking_latest_per_server ERROR (servers list):', JSON.stringify(r.error));
        } catch (_e) {
          Logger.error('[Ranking] get_ranking_latest_per_server ERROR (servers list):', r.error);
        }
      }
      if (r.error || !r.data || !Array.isArray(r.data)) return [];
      return [...new Set(r.data.map(function(x) { return x.server_id; }).filter(Boolean))];
  } catch (e) {
    return [];
  }
}

/**
 * Convertit le libellé serveur en code (ex: "Global PvE 5 (Steam)" → "gbl5").
 */
function rankingDisplayToCode(display) {
  if (!display) return null;
  const code = RANKING_SERVER_DISPLAY_TO_CODE[display] || display;
  return typeof code === 'string' ? code.toLowerCase() : code;
}

/**
 * Lit le classement partagé depuis Supabase (table shared_rankings).
 * Accessible à tous les utilisateurs authentifiés peu importe le badge.
 * @param {Object} supabase - Client Supabase
 * @param {string|null} server - Code serveur (ex: gbl5) ou null pour tous
 * @param {string} type - 'honor' | 'xp' | 'rank_points'
 * @param {number} limit - Nombre max de joueurs
 * @returns {Promise<Array>}
 */
function transformPlayerToRow(p, rowServer, uploadedAt, index) {
  var company =
    (p.company_from_dostats && String(p.company_from_dostats).trim()) ? String(p.company_from_dostats).trim() :
    (p.company && String(p.company).trim()) ? String(p.company).trim() :
    (p.firme && String(p.firme).trim()) ? String(p.firme).trim() :
    (p.firm && String(p.firm).trim()) ? String(p.firm).trim() :
    (p.clan && String(p.clan).trim()) ? String(p.clan).trim() :
    (p.faction && String(p.faction).trim()) ? String(p.faction).trim() :
    null;
  return {
    id: 'shared-' + rowServer + '-' + index,
    game_pseudo: p.name || p.game_pseudo || '—',
    company: company,
    honor_rank: p.honor_rank ?? p.honorRank ?? null,
    experience_rank: p.experience_rank ?? p.experienceRank ?? null,
    top_user_rank: p.top_user_rank ?? p.topUserRank ?? null,
    ship_kills_rank: p.ship_kills_rank ?? p.shipKillsRank ?? null,
    npc_kills_rank: p.npc_kills_rank ?? p.npcKillsRank ?? null,
    honor: parseSharedNumber(p.honor ?? p.honor_value ?? p.honorValue ?? 0),
    xp: parseSharedNumber(p.experience ?? p.experience_value ?? p.experienceValue ?? p.xp ?? 0),
    rank_points: parseSharedNumber(p.top_user ?? p.top_user_value ?? p.topUserValue ?? p.rank_points ?? 0),
    next_rank_points: null,
    current_rank: p.grade || p.current_rank || null,
    grade: p.grade || p.current_rank || null,
    // grade/ current_rank can be a number (DOStats writes numbers),
    // so we coerce to string before calling .trim().
    grade_normalized: (() => {
      const raw = (p.grade != null && p.grade !== '') ? p.grade : p.current_rank;
      if (raw == null || raw === '') return null;
      try { return String(raw).trim() || null; } catch (_) { return null; }
    })(),
    level: p.level ?? null,
    session_date: null,
    session_timestamp: uploadedAt ? new Date(uploadedAt).getTime() : null,
    note: null,
    _source: 'shared',
    _server: rowServer,
    _uploaded_at: uploadedAt,
    userId: p.userId || p.user_id || null,
    estimated_rp: p.estimated_rp,
    total_hours: p.total_hours,
    registered: p.registered,
    npc_kills: p.npc_kills ?? p.npc_kills_value ?? null,
    ship_kills: p.ship_kills ?? p.ship_kills_value ?? null,
    galaxy_gates: p.galaxy_gates,
    galaxy_gates_json: p.galaxy_gates_json,
    dostats_updated_at: p.dostats_updated_at
  };
}

function periodToSince(period) {
  if (!period) return null;
  var h = { '24h': 24, '7j': 168, '30j': 720, '24h_today': 24 }[period];
  if (!h) return null;
  var d = new Date();
  d.setHours(d.getHours() - h);
  return d.toISOString();
}

var PERIOD_TO_HOURS = { '24h': 24, '7j': 168, '30j': 720, '24h_today': 24 };

var PERIOD_TO_DOSTATS_DURATION = { '24h': 1, '7j': 7, '30j': 30 };

/**
 * Charge le classement en mode comparaison :
 * snapshot le plus récent vs snapshot de référence il y a p_hours heures.
 * Chaque joueur reçoit les champs _pos_delta, _honor_delta, _xp_delta, _rp_delta,
 * _pos_current, _pos_reference, _has_reference, _comparison_mode,
 * _latest_at, _reference_at.
 */
async function loadRankingComparison(supabase, server, type, period) {
  var hours = PERIOD_TO_HOURS[period];
  if (!hours) return [];
  try {
    Logger.debug('[Ranking] get_ranking_comparison', {
      server: server,
      type: type,
      period: period,
      hours: hours
    });
    var rpcRes = await supabase.rpc('get_ranking_comparison', { p_server: server, p_hours: hours });
    if (rpcRes.error) {
      Logger.warn('[Ranking] get_ranking_comparison error:', rpcRes.error?.message || rpcRes.error);
      return [];
    }
    var d = rpcRes.data;
    if (!d || !d.success || !Array.isArray(d.players)) return [];

    var latestAt    = d.latest_scraped_at || null;
    var referenceAt = d.ref_scraped_at || null;
    var hasRef      = !!d.has_reference;

    var players = d.players.map(function(p, i) {
      if (typeof window !== 'undefined' && window.DEBUG && i === 0) {
        try {
          Logger.warn('[Ranking][debug] get_ranking_comparison player keys:', Object.keys(p || {}));
        } catch (_) {}
      }
      var row = transformPlayerToRow(p, server, latestAt, i);
      row._comparison_mode  = true;
      row._latest_at        = latestAt;
      row._reference_at     = referenceAt;
      row._has_reference    = hasRef && !!p._has_reference;
      row._pos_current      = p._pos_current   != null ? Number(p._pos_current)   : null;
      row._pos_reference    = p._pos_reference != null ? Number(p._pos_reference) : null;
      row._pos_delta        = p._pos_delta      != null ? Number(p._pos_delta)     : null;
      row._honor_delta      = p._honor_delta    != null ? Number(p._honor_delta)   : null;
      row._xp_delta         = p._xp_delta       != null ? Number(p._xp_delta)      : null;
      row._rp_delta         = p._rp_delta       != null ? Number(p._rp_delta)      : null;
      return row;
    });

    // Tri selon le type sélectionné
    var col = type === 'xp' ? 'xp' : type === 'rank_points' ? 'rank_points'
            : type === 'npc_kills' ? 'npc_kills' : type === 'ship_kills' ? 'ship_kills'
            : type === 'galaxy_gates' ? 'galaxy_gates' : 'honor';
    players.sort(function(a, b) {
      var va = a[col] != null ? Number(a[col]) : -Infinity;
      var vb = b[col] != null ? Number(b[col]) : -Infinity;
      return vb - va;
    });

    var top = players.slice(0, 100);
    Logger.debug('[Ranking] get_ranking_comparison result', {
      server: server,
      type: type,
      period: period,
      count: top.length
    });
    return top;
  } catch (e) {
    Logger.warn('[Ranking] loadRankingComparison exception:', e?.message);
    return [];
  }
}

/**
 * Charge le classement directement depuis les snapshots DOStats par période
 * (shared_rankings_dostats_snapshots), pour coller exactement aux pages
 * "Last 24 Hours / Last 7 Days / Last 30 Days" de DOStats.
 */
async function loadDostatsPeriodRanking(supabase, server, type, period, limit) {
  var duration = PERIOD_TO_DOSTATS_DURATION[period];
  if (!duration) return [];
  try {
    // Mapping type UI → type DOStats (hof_type)
    var hofType = type;
    if (type === 'xp') hofType = 'experience';
    else if (type === 'rank_points') hofType = 'topuser';
    else if (type === 'npc_kills') hofType = 'aliens';
    else if (type === 'ship_kills') hofType = 'ships';
    else if (type === 'galaxy_gates') {
      // DOStats n'a pas de classement Galaxy Gates → pas de données duration
      Logger.warn('[Ranking] loadDostatsPeriodRanking: aucun équivalent DOStats pour galaxy_gates');
      return [];
    }

    // Cohérence avec le scraper : server_id stocké en minuscules (PostgreSQL sensible à la casse)
    var serverNorm = (server || '').toString().trim().toLowerCase();
    Logger.debug('[Ranking] loadDostatsPeriodRanking', {
      server: server,
      serverNorm: serverNorm,
      type: type,
      hofType: hofType,
      period: period,
      duration: duration,
      limit: limit,
    });

    var { data, error } = await supabase
      .from('shared_rankings_dostats_snapshots')
      .select('server_id, scraped_at, players_json')
      .eq('server_id', serverNorm)
      .order('scraped_at', { ascending: false })
      .limit(DOSTATS_PERIOD_SNAPSHOT_LOOKBACK);

    if (error || !data || data.length === 0) return [];

    var players = [];
    var latestTs = null;

    // On cherche le snapshot le plus récent qui contient des joueurs pour ce hofType + duration.
    // Comparaison tolérante : hof_type et period peuvent être string ou number côté JSONB.
    outer: for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var arr = Array.isArray(row.players_json) ? row.players_json : [];
      if (!arr.length) continue;
      var filtered = arr.filter(function(p) {
        var pType = (p.hof_type != null && p.hof_type !== '') ? String(p.hof_type).toLowerCase() : null;
        var refType = (hofType != null && hofType !== '') ? String(hofType).toLowerCase() : null;
        var pDur = (p.period != null && p.period !== '') ? Number(p.period) : null;
        return pType === refType && pDur === duration;
      });
      if (filtered.length > 0) {
        players = filtered;
        latestTs = row.scraped_at || row.uploaded_at || null;
        break outer;
      }
    }

    if (!players.length) {
      var warnKey = serverNorm + '|' + type + '|' + period;
      var now = Date.now();
      if (warnKey !== _lastDostatsPeriodWarnKey || now - _lastDostatsPeriodWarnAt > DOSTATS_PERIOD_WARN_THROTTLE_MS) {
        _lastDostatsPeriodWarnKey = warnKey;
        _lastDostatsPeriodWarnAt = now;
        Logger.warn('[Ranking] loadDostatsPeriodRanking: aucun joueur trouvé pour', {
          server: server,
          type: type,
          hofType: hofType,
          period: period,
          duration: duration,
        });
      }
      return [];
    }

    // Transforme vers le format de ligne standard.
    // IMPORTANT : en mode période DOStats, on NE réécrit PAS les valeurs d'honneur/xp/top_user/npc_kills/ship_kills/galaxy_gates
    // avec player_profiles, sinon on retomberait sur les valeurs "All Time".
    var rows = players.map(function(p, idx) {
      return transformPlayerToRow(p, server, latestTs, idx);
    });

    // Enrichissement léger avec player_profiles uniquement pour les métadonnées
    // (grade, level, company, estimated_rp, total_hours, registered, dostats_updated_at),
    // sans toucher aux compteurs de points déjà fournis par DOStats pour la période.
    try {
      // On récupère uniquement les profils correspondant aux joueurs présents dans ce snapshot
      // pour éviter de rater des grades à cause d'une limite de lignes fixe.
      var userIds = [];
      var pseudos = [];
      rows.forEach(function(r) {
        var uid = r.userId || r.user_id;
        if (uid && userIds.indexOf(String(uid)) === -1) userIds.push(String(uid));
        var pseudo = (r.game_pseudo || '').trim();
        if (pseudo && pseudos.indexOf(pseudo) === -1) pseudos.push(pseudo);
      });

      var byUid = {};
      var byPseudo = {};

      if (userIds.length || pseudos.length) {
        var baseQuery = supabase
          .from('player_profiles')
          .select('user_id, server, pseudo, company, grade, level, estimated_rp, total_hours, registered, dostats_updated_at')
          .eq('server', serverNorm);

        // Priorité au matching par user_id
        var ppResUid = null;
        if (userIds.length) {
          ppResUid = await baseQuery.in('user_id', userIds);
          if (!ppResUid.error && ppResUid.data && ppResUid.data.length) {
            ppResUid.data.forEach(function(pp) {
              if (pp && pp.user_id && pp.server) {
                var keySrv = String(pp.server).toLowerCase().trim();
                var keyUid = String(pp.user_id).toLowerCase().trim();
                if (keySrv && keyUid) {
                  byUid[keySrv + ':' + keyUid] = pp;
                }
              }
            });
          }
        }

        // Complément par pseudo pour les joueurs sans userId connu
        if (pseudos.length) {
          var ppResPseudo = await baseQuery.in('pseudo', pseudos);
          if (!ppResPseudo.error && ppResPseudo.data && ppResPseudo.data.length) {
            ppResPseudo.data.forEach(function(pp) {
              if (pp && pp.pseudo && pp.server) {
                var keySrv = String(pp.server).toLowerCase().trim();
                var keyPseudo = String(pp.pseudo).toLowerCase().trim();
                if (keySrv && keyPseudo) {
                  byPseudo[keySrv + ':' + keyPseudo] = pp;
                }
              }
            });
          }
        }

        rows = rows.map(function(r) {
          var s = (r._server || r.server || server || '').toString().toLowerCase().trim();
          var uid = r.userId || r.user_id;
          var pseudo = (r.game_pseudo || '').trim().toLowerCase();
          var ppByUid = (uid && byUid[s + ':' + String(uid).toLowerCase()]) || null;
          var ppByPseudo = (pseudo && byPseudo[s + ':' + pseudo]) || null;
          // Sécurité anti-mauvaise association :
          // si le matching par user_id renvoie un pseudo différent, on préfère le matching par pseudo.
          var pp = ppByUid;
          if (ppByUid && ppByPseudo) {
            var ppPseudoOfUid = (ppByUid.pseudo != null ? String(ppByUid.pseudo) : '').trim().toLowerCase();
            if (pseudo && ppPseudoOfUid && ppPseudoOfUid !== pseudo) pp = ppByPseudo;
          }
          if (!pp) pp = ppByPseudo;
          if (!pp) return r;
          var mergedGrade =
            (pp.grade && String(pp.grade).trim()) ||
            (r.grade && String(r.grade).trim()) ||
            r.grade;
          var mergedGradeNorm = (mergedGrade != null && mergedGrade !== '')
            ? String(mergedGrade).trim()
            : null;
          return Object.assign({}, r, {
            // En mode période, la source de vérité pour le grade reste player_profiles si disponible.
            grade: mergedGrade,
            // IMPORTANT : le frontend affiche d’abord `current_rank`, donc on le synchronise
            // avec le grade fusionné pour que l'image de grade apparaisse directement.
            current_rank: mergedGrade,
            grade_normalized: mergedGradeNorm,
            level: r.level != null ? r.level : (pp.level != null ? pp.level : null),
            company: r.company || pp.company || null,
            estimated_rp: r.estimated_rp != null ? r.estimated_rp : (pp.estimated_rp != null ? pp.estimated_rp : null),
            total_hours: r.total_hours != null ? r.total_hours : (pp.total_hours != null ? pp.total_hours : null),
            registered: r.registered != null ? r.registered : (pp.registered != null ? pp.registered : null),
            dostats_updated_at: r.dostats_updated_at != null ? r.dostats_updated_at : (pp.dostats_updated_at != null ? pp.dostats_updated_at : null),
          });
        });
      }
    } catch (e) {
      Logger.warn('[Ranking] loadDostatsPeriodRanking enrich profiles error:', e?.message);
    }

    var col = type === 'xp'
      ? 'xp'
      : type === 'rank_points'
      ? 'rank_points'
      : type === 'npc_kills'
      ? 'npc_kills'
      : type === 'ship_kills'
      ? 'ship_kills'
      : type === 'galaxy_gates'
      ? 'galaxy_gates'
      : 'honor';

    if (['npc_kills', 'ship_kills', 'galaxy_gates'].includes(type)) {
      rows = rows.filter(function(p) {
        var v = p[col];
        return v != null && Number(v) > 0;
      });
    }

    rows.sort(function(a, b) {
      var va = a[col] != null ? Number(a[col]) : -Infinity;
      var vb = b[col] != null ? Number(b[col]) : -Infinity;
      return vb - va;
    });

    var top = rows.slice(0, limit);
    Logger.debug('[Ranking] loadDostatsPeriodRanking result', {
      server: server,
      type: type,
      period: period,
      duration: duration,
      count: top.length,
    });
    // FIX 3 — enrichir le cache suivi (ranking-ui) sans fetch supplémentaire
    try {
      if (typeof window !== 'undefined' && typeof window.mergeFollowedPlayerStatsCacheFromRow === 'function') {
        for (var _fci = 0; _fci < top.length; _fci++) {
          window.mergeFollowedPlayerStatsCacheFromRow(top[_fci]);
        }
      }
    } catch (_e) {}
    return top;
  } catch (e) {
    Logger.warn('[Ranking] loadDostatsPeriodRanking exception:', e?.message);
    return [];
  }
}

async function loadSharedRanking(supabase, server, type, limit, period) {
  try {
    if (server) {
      var params = { p_server: server };
      var since = periodToSince(period);
      if (since) params.p_since = since;
      Logger.debug('[Ranking] get_ranking_with_profiles', {
        server: server,
        type: type,
        since: since || null
      });
      var rpcRes = await supabase.rpc('get_ranking_with_profiles', params);
      if (!rpcRes.error && rpcRes.data && rpcRes.data.players) {
        var players = Array.isArray(rpcRes.data.players) ? rpcRes.data.players : [];
        var uploadedAt = rpcRes.data.scraped_at || null;
        var allPlayers = players.map(function(p, i) {
          return transformPlayerToRow(p, server, uploadedAt, i);
        });
        var col = type === 'xp' ? 'xp' : type === 'rank_points' ? 'rank_points' : type === 'npc_kills' ? 'npc_kills' : type === 'ship_kills' ? 'ship_kills' : type === 'galaxy_gates' ? 'galaxy_gates' : 'honor';
        if (['npc_kills', 'ship_kills', 'galaxy_gates'].includes(type)) {
          allPlayers = allPlayers.filter(function(p) { var v = p[col]; return v != null && Number(v) > 0; });
        }
        allPlayers.sort(function(a, b) {
          var va = a[col] != null ? Number(a[col]) : -Infinity;
          var vb = b[col] != null ? Number(b[col]) : -Infinity;
          return vb - va;
        });
        var topRpc = allPlayers.slice(0, limit);
        Logger.debug('[Ranking] get_ranking_with_profiles result', {
          server: server,
          type: type,
          since: since || null,
          count: topRpc.length
        });
        return topRpc;
      }
    }

    var data, error;
    if (server) {
      var q = supabase.from('shared_rankings_snapshots').select('server_id, scraped_at, players_json').eq('server_id', server);
      var since = periodToSince(period);
      if (since) q = q.gte('scraped_at', since);
      var res = await q.order('scraped_at', { ascending: false }).limit(1);
      data = res.data; error = res.error;
    } else {
      var rpcRes = await supabase.rpc('get_ranking_latest_per_server', { p_limit: 5 });
      if (rpcRes.error) {
        try {
          Logger.error('[Ranking] get_ranking_latest_per_server ERROR (snapshots):', JSON.stringify(rpcRes.error));
        } catch (_e) {
          Logger.error('[Ranking] get_ranking_latest_per_server ERROR (snapshots):', rpcRes.error);
        }
      }
      data = rpcRes.data; error = rpcRes.error;
    }
    if (error || !data || data.length === 0) return [];

    var profileMap = {};
    var servers = server ? [server] : [...new Set(data.map(function(r) { return r.server_id; }))].filter(Boolean);
    if (servers.length) {
      var ppRes = await supabase.from('player_profiles').select('user_id, server, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, company, grade, level, top_user, experience, honor, dostats_updated_at').in('server', servers);
      if (!ppRes.error && ppRes.data) {
        ppRes.data.forEach(function(pp) {
          if (pp && pp.user_id && pp.server) {
            var srvKey = String(pp.server).toLowerCase().trim();
            var uidKey = String(pp.user_id).toLowerCase().trim();
            if (srvKey && uidKey) {
              profileMap[srvKey + ':' + uidKey] = pp;
            }
          }
        });
      }
    }

    var allPlayers = [];
    data.forEach(function(row) {
        var players = Array.isArray(row.players_json) ? row.players_json : [];
        var rowServer = row.server_id || row.server;
        var rowServerKey = (rowServer != null ? String(rowServer) : '').toLowerCase().trim();
      var rowTs = row.scraped_at || row.uploaded_at;
      players.forEach(function(p, i) {
        var uid = p.userId || p.user_id;
          var key = null;
          if (uid && rowServerKey) {
            key = rowServerKey + ':' + String(uid).toLowerCase().trim();
          }
        var pp = key && profileMap[key];
        var merged = pp ? Object.assign({}, p, {
          grade: (p.grade && String(p.grade).trim()) || pp.grade || p.grade,
          level: pp.level ?? p.level,
          honor: pp.honor ?? p.honor_value ?? p.honor,
          experience: pp.experience ?? p.experience_value ?? p.xp ?? p.experience,
          top_user: pp.top_user ?? p.top_user_value ?? p.rank_points ?? p.top_user,
          npc_kills: pp.npc_kills ?? p.npc_kills_value,
          ship_kills: pp.ship_kills ?? p.ship_kills_value,
          galaxy_gates: pp.galaxy_gates ?? p.galaxy_gates,
          galaxy_gates_json: pp.galaxy_gates_json ?? p.galaxy_gates_json,
          estimated_rp: pp.estimated_rp ?? p.estimated_rp,
          total_hours: pp.total_hours ?? p.total_hours,
          registered: pp.registered ?? p.registered,
          company_from_dostats: pp.company ?? p.company,
          dostats_updated_at: pp.dostats_updated_at ?? p.dostats_updated_at
        }) : p;
        allPlayers.push(transformPlayerToRow(merged, rowServer, rowTs, i));
      });
    });

    var col = type === 'xp' ? 'xp' : type === 'rank_points' ? 'rank_points' : type === 'npc_kills' ? 'npc_kills' : type === 'ship_kills' ? 'ship_kills' : type === 'galaxy_gates' ? 'galaxy_gates' : 'honor';
    if (['npc_kills', 'ship_kills', 'galaxy_gates'].includes(type)) {
      allPlayers = allPlayers.filter(function(p) { var v = p[col]; return v != null && Number(v) > 0; });
    }
    allPlayers.sort(function(a, b) {
      var va = a[col] != null ? Number(a[col]) : -Infinity;
      var vb = b[col] != null ? Number(b[col]) : -Infinity;
      return vb - va;
    });

    var topSnap = allPlayers.slice(0, limit);
    Logger.debug('[Ranking] shared_rankings_snapshots result', {
      server: server || 'all',
      type: type,
      period: period || null,
      count: topSnap.length
    });
    return topSnap;
  } catch (e) {
    return [];
  }
}

/**
 * Parse un nombre depuis les snapshots (number ou string).
 * Les snapshots DOStats peuvent contenir des décimales : on tronque en entier pour un tri / affichage stables.
 * Important : même règle pour number et string (évite 1.6 → 2 en number vs 1 en string).
 */
function parseSharedNumber(val) {
  if (val == null || val === '') return 0;
  var num;
  if (typeof val === 'number') {
    num = val;
  } else {
    var cleaned = String(val).replace(/,/g, '').replace(/\s/g, '');
    num = parseFloat(cleaned);
  }
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

async function enrichImportedWithProfiles(rows, supabase) {
  if (!rows || rows.length === 0) return rows;
  var servers = [...new Set(rows.map(function(r) { return r._server; }).filter(Boolean))];
  if (servers.length === 0) return rows;
  var ppRes;
  try {
    ppRes = await supabase.from('player_profiles').select('user_id, server, pseudo, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, company, grade, level, top_user, experience, honor, dostats_updated_at').in('server', servers);
  } catch (e) {
    Logger.error('[Ranking] enrichImportedWithProfiles error:', e?.message || e);
    return rows;
  }
  if (ppRes.error || !ppRes.data) return rows;
  var byUid = {}, byPseudo = {};
  ppRes.data.forEach(function(pp) {
    if (pp.user_id && pp.server) byUid[pp.server + ':' + String(pp.user_id).toLowerCase()] = pp;
    if (pp.pseudo && pp.server) byPseudo[pp.server + ':' + String(pp.pseudo).toLowerCase()] = pp;
  });
  return rows.map(function(r) {
    var s = r._server || '';
    var uid = r.userId || r.user_id;
    var pseudo = (r.game_pseudo || '').trim();
    var pp = (uid && byUid[s + ':' + String(uid).toLowerCase()]) || (pseudo && byPseudo[s + ':' + pseudo.toLowerCase()]);
    if (!pp) return r;
    return Object.assign({}, r, {
      grade: (r.grade && String(r.grade).trim()) || pp.grade || r.grade,
      level: pp.level ?? r.level,
      honor: pp.honor ?? r.honor,
      xp: pp.experience ?? r.xp,
      rank_points: pp.top_user ?? r.rank_points,
      npc_kills: pp.npc_kills ?? r.npc_kills,
      ship_kills: pp.ship_kills ?? r.ship_kills,
      galaxy_gates: pp.galaxy_gates ?? r.galaxy_gates,
      galaxy_gates_json: pp.galaxy_gates_json ?? r.galaxy_gates_json,
      estimated_rp: pp.estimated_rp ?? r.estimated_rp,
      total_hours: pp.total_hours ?? r.total_hours,
      registered: pp.registered ?? r.registered,
      dostats_updated_at: pp.dostats_updated_at ?? r.dostats_updated_at,
      company: r.company || pp.company
    });
  });
}

/** Types de tri / colonne classement supportés par loadRanking */
var RANKING_VALID_TYPES = ['honor', 'xp', 'rank_points', 'npc_kills', 'ship_kills', 'galaxy_gates'];

/** Périodes UI reconnues */
var RANKING_VALID_PERIODS = ['24h', '7j', '30j', '24h_today'];

/**
 * Routes de chargement — une seule source de vérité pour loadRanking (voir docs/RANKING_SOURCES.md).
 */
var RANKING_LOAD_ROUTE = {
  UI_NEEDS_SERVER: 'ui_needs_server',
  PERIOD_DOSTATS: 'period_dostats',
  PERIOD_COMPARISON: 'period_comparison',
  STANDARD: 'standard'
};

/**
 * Normalise les filtres UI (sans I/O).
 * @param {Object} filters
 * @returns {{ displayServer: string|null, server: string|null, type: string, limit: number, period: string|null }}
 */
function normalizeRankingFilters(filters) {
  var displayServer = filters?.server && String(filters.server).trim() !== '' ? String(filters.server).trim() : null;
  var type = (filters?.type && RANKING_VALID_TYPES.indexOf(filters.type) !== -1) ? filters.type : 'honor';
  var server = displayServer ? rankingDisplayToCode(displayServer) : null;
  var limit = Math.min(RANKING_LIMIT_MAX, Math.max(1, parseInt(filters?.limit, 10) || RANKING_LIMIT_DEFAULT));
  var period = (filters?.period && RANKING_VALID_PERIODS.indexOf(filters.period) !== -1) ? filters.period : null;
  return { displayServer: displayServer, server: server, type: type, limit: limit, period: period };
}

/**
 * Choisit la stratégie de chargement (sans I/O). Toute évolution des priorités doit passer par ici + la doc.
 * @param {{ displayServer: string|null, server: string|null, type: string, limit: number, period: string|null }} norm
 * @returns {{ route: string }}
 */
function resolveRankingLoadRoute(norm) {
  if (norm.period && !norm.server) {
    return { route: RANKING_LOAD_ROUTE.UI_NEEDS_SERVER };
  }
  if (norm.period && norm.server) {
    if (PERIOD_TO_DOSTATS_DURATION[norm.period]) {
      return { route: RANKING_LOAD_ROUTE.PERIOD_DOSTATS };
    }
    return { route: RANKING_LOAD_ROUTE.PERIOD_COMPARISON };
  }
  return { route: RANKING_LOAD_ROUTE.STANDARD };
}

/**
 * Charge le classement avec filtres.
 * La chaîne STANDARD est : import local → snapshots partagés ; RPC get_ranking uniquement si loadSharedRanking lève une exception.
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
async function loadRanking(filters) {
  var norm = normalizeRankingFilters(filters);
  var decision = resolveRankingLoadRoute(norm);

  Logger.debug('[Ranking] loadRanking', {
    route: decision.route,
    displayServer: norm.displayServer,
    server: norm.server,
    type: norm.type,
    period: norm.period || null,
    limit: norm.limit
  });

  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;

  if (decision.route === RANKING_LOAD_ROUTE.UI_NEEDS_SERVER) {
    return [{ _comparison_needs_server: true }];
  }

  if (decision.route === RANKING_LOAD_ROUTE.PERIOD_DOSTATS) {
    if (!supabase) return [];
    return await loadDostatsPeriodRanking(supabase, norm.server, norm.type, norm.period, norm.limit);
  }

  if (decision.route === RANKING_LOAD_ROUTE.PERIOD_COMPARISON) {
    if (!supabase) return [];
    return await loadRankingComparison(supabase, norm.server, norm.type, norm.period);
  }

  // --- STANDARD : pas de période ---

  if (typeof getImportedRanking === 'function') {
    var imported = [];
    if (norm.server) {
      imported = getImportedRanking(norm.server, norm.type);
      if (imported.length === 0 && norm.displayServer) {
        imported = getImportedRanking(norm.displayServer, norm.type);
      }
    }
    if (imported.length > 0) {
      var enrichedImp = supabase ? await enrichImportedWithProfiles(imported, supabase) : imported;
      var col1 = norm.type === 'xp' ? 'xp' : norm.type === 'rank_points' ? 'rank_points' : norm.type === 'npc_kills' ? 'npc_kills' : norm.type === 'ship_kills' ? 'ship_kills' : norm.type === 'galaxy_gates' ? 'galaxy_gates' : 'honor';
      if (['npc_kills', 'ship_kills', 'galaxy_gates'].indexOf(norm.type) !== -1) {
        enrichedImp = enrichedImp.filter(function(p) { var v = p[col1]; return v != null && Number(v) > 0; });
        enrichedImp.sort(function(a, b) { var va = a[col1] != null ? Number(a[col1]) : -Infinity; var vb = b[col1] != null ? Number(b[col1]) : -Infinity; return vb - va; });
      }
      return enrichedImp.slice(0, norm.limit);
    }
    if (!norm.server) {
      var importedServers = getImportedServerList();
      if (importedServers.length > 0) {
        var merged = [];
        importedServers.forEach(function(s) {
          var rows = getImportedRanking(s, norm.type);
          merged = merged.concat(rows);
        });
        var col2 = norm.type === 'xp' ? 'xp' : norm.type === 'rank_points' ? 'rank_points' : norm.type === 'npc_kills' ? 'npc_kills' : norm.type === 'ship_kills' ? 'ship_kills' : norm.type === 'galaxy_gates' ? 'galaxy_gates' : 'honor';
        var enrichedMerged = supabase ? await enrichImportedWithProfiles(merged, supabase) : merged;
        if (['npc_kills', 'ship_kills', 'galaxy_gates'].indexOf(norm.type) !== -1) {
          enrichedMerged = enrichedMerged.filter(function(p) { var v = p[col2]; return v != null && Number(v) > 0; });
        }
        enrichedMerged.sort(function(a, b) { var va = a[col2] != null ? Number(a[col2]) : -Infinity; var vb = b[col2] != null ? Number(b[col2]) : -Infinity; return vb - va; });
        return enrichedMerged.slice(0, norm.limit);
      }
    }
  }

  if (!supabase) return [];

  try {
    var shared = await loadSharedRanking(supabase, norm.server, norm.type, norm.limit, null);
    return shared.length > 0 ? shared : [];
  } catch (e) {}

  try {
    const { data, error } = await supabase.rpc('get_ranking', {
      p_server: norm.displayServer,
      p_companies: null,
      p_type: norm.type,
      p_limit: norm.limit
    });
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

if (typeof window !== 'undefined' && window.DEBUG) {
  window.normalizeRankingFilters = normalizeRankingFilters;
  window.resolveRankingLoadRoute = resolveRankingLoadRoute;
  window.RANKING_LOAD_ROUTE = RANKING_LOAD_ROUTE;
}
