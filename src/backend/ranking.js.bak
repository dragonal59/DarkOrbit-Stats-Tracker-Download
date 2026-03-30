// ==========================================
// CLASSEMENT – Backend (RPC get_ranking)
// Données publiques : profiles_public + dernière session par user
// Fallback : shared_rankings_snapshots (classements scrapés partagés)
// ==========================================
// Empreinte debug : dans la console du classement, tapez window.__RANKING_ENGINE_BUILD_ID__
// Si la valeur n’existe pas ou est différente, l’UI ne charge pas ce fichier (ex. exe issu de build/ obfusqué).
var RANKING_ENGINE_BUILD_ID = 'player_rankings_v2+legacy_fallback_2026-03-23c';

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
  window.__RANKING_ENGINE_BUILD_ID__ = RANKING_ENGINE_BUILD_ID;
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
 * Code serveur stable pour les requêtes (player_rankings, RPC).
 * Le select UI utilise en général le code (gbl5) ; on tolère libellés et suffixes "(code)".
 */
function resolveRankingServerCode(raw) {
  if (raw == null || raw === '') return null;
  var s = String(raw).trim();
  if (!s) return null;
  var direct = s.toLowerCase();
  if (/^[a-z0-9]{2,12}$/.test(direct)) return direct;
  var viaMap = rankingDisplayToCode(s);
  if (viaMap != null && typeof viaMap === 'string') {
    var v = viaMap.trim().toLowerCase();
    if (v) return v;
  }
  var m = s.match(/\(([a-z0-9]{2,12})\)\s*$/i);
  if (m) return m[1].toLowerCase();
  return direct;
}

/**
 * Firme depuis une ligne player_profiles (colonne + profile_json racine + stats + alias scrapers).
 */
function companyFromPlayerProfile(pp) {
  if (!pp || typeof pp !== 'object') return null;
  if (pp.company != null && String(pp.company).trim() !== '') return String(pp.company).trim();
  var pj = (pp.profile_json && typeof pp.profile_json === 'object') ? pp.profile_json : {};
  var st = (pj.stats && typeof pj.stats === 'object') ? pj.stats : {};
  var candidates = [
    pj.company,
    st.company,
    pj.firme,
    st.firme,
    pj.firm,
    st.firm,
    pj.faction,
    st.faction,
    pj.clan,
    st.clan
  ];
  for (var i = 0; i < candidates.length; i++) {
    var v = candidates[i];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

/**
 * Firme depuis un objet joueur snapshot / RPC (champs racine + stats imbriqué).
 */
function companyFromRankingPlayerPayload(p) {
  if (!p || typeof p !== 'object') return null;
  var st = (p.stats && typeof p.stats === 'object') ? p.stats : {};
  var candidates = [
    p.company_from_dostats,
    p.company,
    st.company,
    p.firme,
    st.firme,
    p.firm,
    st.firm,
    p.faction,
    st.faction,
    p.clan,
    st.clan
  ];
  for (var i = 0; i < candidates.length; i++) {
    var v = candidates[i];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
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
  var company = companyFromRankingPlayerPayload(p);
  // Ancien bug push Supabase : `grade` contenait la position HoF (1,2,3…) au lieu du grade militaire.
  // Si `grade` === `dostats_table_rank`, on ignore `grade` pour l’affichage (le profil enrichit ensuite).
  var rawGrade = (p.grade != null && p.grade !== '') ? p.grade : null;
  var rawCurrent = (p.current_rank != null && p.current_rank !== '') ? p.current_rank : null;
  var tr = (p.dostats_table_rank != null && p.dostats_table_rank !== '') ? Number(p.dostats_table_rank) : null;
  if (tr != null && Number.isFinite(tr) && rawGrade != null && Number(rawGrade) === tr) {
    rawGrade = null;
  }
  if (tr != null && Number.isFinite(tr) && rawCurrent != null && Number(rawCurrent) === tr) {
    rawCurrent = null;
  }
  var effectiveGrade = rawGrade != null ? rawGrade : rawCurrent;
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
    current_rank: effectiveGrade,
    grade: effectiveGrade,
    // grade/ current_rank can be a number (DOStats writes numbers),
    // so we coerce to string before calling .trim().
    grade_normalized: (() => {
      const raw = (effectiveGrade != null && effectiveGrade !== '') ? effectiveGrade : null;
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
var UI_PERIOD_TO_NEW_PERIOD = {
  '24h': 'daily',
  '7j': 'weekly',
  '30j': 'monthly',
  '24h_today': 'daily'
};

function rankingTypeToHofType(type) {
  if (type === 'xp') return 'experience';
  if (type === 'rank_points') return 'topuser';
  if (type === 'npc_kills') return 'aliens';
  if (type === 'ship_kills') return 'ships';
  if (type === 'honor') return 'honor';
  return null;
}

function metricColumnForType(type) {
  if (type === 'xp') return 'xp';
  if (type === 'rank_points') return 'rank_points';
  if (type === 'npc_kills') return 'npc_kills';
  if (type === 'ship_kills') return 'ship_kills';
  if (type === 'galaxy_gates') return 'galaxy_gates';
  return 'honor';
}

async function loadProfilesOnlyRanking(supabase, server, type, limit) {
  var serverNorm = server ? resolveRankingServerCode(server) : null;
  var q = supabase
    .from('player_profiles')
    .select('user_id, server, pseudo, company, grade, level, top_user, experience, honor, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, dostats_updated_at, profile_json');
  if (serverNorm) q = q.eq('server', serverNorm);
  var res = await q.limit(Math.max(limit * 5, 500));
  if (res.error || !Array.isArray(res.data)) return [];
  var rows = res.data.map(function(pp, i) {
    var pj = (pp && pp.profile_json && typeof pp.profile_json === 'object') ? pp.profile_json : {};
    var pjStats = (pj.stats && typeof pj.stats === 'object') ? pj.stats : {};
    var company = companyFromPlayerProfile(pp);
    var ggTotal = pp.galaxy_gates != null ? pp.galaxy_gates : (pjStats.galaxy_gates != null ? pjStats.galaxy_gates : null);
    var ggDetail = pp.galaxy_gates_json != null ? pp.galaxy_gates_json : (pjStats.galaxy_gates_detail != null ? pjStats.galaxy_gates_detail : null);
    return transformPlayerToRow({
      name: pp.pseudo,
      user_id: pp.user_id,
      company: company,
      grade: pp.grade,
      level: pp.level,
      top_user: pp.top_user,
      experience: pp.experience,
      honor: pp.honor,
      npc_kills: pp.npc_kills,
      ship_kills: pp.ship_kills,
      galaxy_gates: ggTotal,
      galaxy_gates_json: ggDetail,
      estimated_rp: pp.estimated_rp,
      total_hours: pp.total_hours,
      registered: pp.registered,
      dostats_updated_at: pp.dostats_updated_at
    }, pp.server || serverNorm || '', pp.dostats_updated_at || null, i);
  });
  var col = metricColumnForType(type);
  rows = rows.filter(function(r) {
    var v = r[col];
    return v != null && Number(v) > 0;
  });
  rows.sort(function(a, b) {
    var va = a[col] != null ? Number(a[col]) : -Infinity;
    var vb = b[col] != null ? Number(b[col]) : -Infinity;
    return vb - va;
  });
  return rows.slice(0, limit);
}

async function loadFromNewModel(supabase, server, type, periodKey, limit) {
  if (type === 'galaxy_gates') return await loadProfilesOnlyRanking(supabase, server, type, limit);
  var hofType = rankingTypeToHofType(type);
  if (!hofType) return [];
  var serverNorm = server ? resolveRankingServerCode(server) : null;
  if (!serverNorm) {
    return [];
  }

  var q = supabase
    .from('player_rankings')
    .select('user_id, server, rank, points, value, scraped_at')
    .eq('hof_type', hofType)
    .eq('period', periodKey)
    .eq('server', serverNorm);
  q = q.order('rank', { ascending: true }).order('points', { ascending: false })
    .limit(Math.max(limit * 5, 500));
  var rr = await q;
  if (rr.error) {
    if (typeof Logger !== 'undefined' && Logger.warn) {
      Logger.warn('[Ranking] player_rankings query error:', rr.error.message || String(rr.error));
    }
    return [];
  }
  if (!Array.isArray(rr.data) || rr.data.length === 0) return [];
  var rankedRows = rr.data.filter(function(r) {
    return r && r.rank != null && Number(r.rank) > 0;
  });
  var sourceRows = rankedRows.length ? rankedRows : rr.data;

  var ids = [];
  var servers = [];
  sourceRows.forEach(function(r) {
    if (r && r.user_id && ids.indexOf(String(r.user_id)) === -1) ids.push(String(r.user_id));
    if (r && r.server && servers.indexOf(String(r.server)) === -1) servers.push(String(r.server));
  });
  if (!ids.length) return [];

  var pq = supabase
    .from('player_profiles')
    .select('user_id, server, pseudo, company, grade, level, top_user, experience, honor, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, dostats_updated_at, profile_json')
    .in('user_id', ids)
    .in('server', servers);
  var pr = await pq;
  var profileMap = {};
  if (!pr.error && Array.isArray(pr.data)) {
    pr.data.forEach(function(pp) {
      if (pp && pp.server && pp.user_id) {
        var k = String(pp.server).toLowerCase().trim() + ':' + String(pp.user_id).trim();
        profileMap[k] = pp;
      }
    });
  }

  var rows = sourceRows.map(function(r, i) {
    var key = String(r.server || '').toLowerCase().trim() + ':' + String(r.user_id || '').trim();
    var pp = profileMap[key] || {};
    var pj = (pp && pp.profile_json && typeof pp.profile_json === 'object') ? pp.profile_json : {};
    var pjStats = (pj.stats && typeof pj.stats === 'object') ? pj.stats : {};
    var points = r.points != null ? r.points : r.value;
    var rankNum = (r.rank != null && Number.isFinite(Number(r.rank))) ? Number(r.rank) : null;
    var honorRank = type === 'honor' ? rankNum : null;
    var experienceRank = type === 'xp' ? rankNum : null;
    var topUserRank = type === 'rank_points' ? rankNum : null;
    var npcKillsRank = type === 'npc_kills' ? rankNum : null;
    var shipKillsRank = type === 'ship_kills' ? rankNum : null;
    var company = companyFromPlayerProfile(pp);
    var ggTotal = pp.galaxy_gates != null ? pp.galaxy_gates : (pjStats.galaxy_gates != null ? pjStats.galaxy_gates : null);
    var ggDetail = pp.galaxy_gates_json != null ? pp.galaxy_gates_json : (pjStats.galaxy_gates_detail != null ? pjStats.galaxy_gates_detail : null);
    return transformPlayerToRow({
      name: pp.pseudo,
      user_id: r.user_id,
      company: company,
      honor_rank: honorRank,
      experience_rank: experienceRank,
      top_user_rank: topUserRank,
      npc_kills_rank: npcKillsRank,
      ship_kills_rank: shipKillsRank,
      grade: pp.grade,
      level: pp.level,
      honor: type === 'honor' ? points : pp.honor,
      experience: type === 'xp' ? points : pp.experience,
      top_user: type === 'rank_points' ? points : pp.top_user,
      npc_kills: type === 'npc_kills' ? points : pp.npc_kills,
      ship_kills: type === 'ship_kills' ? points : pp.ship_kills,
      galaxy_gates: ggTotal,
      galaxy_gates_json: ggDetail,
      estimated_rp: pp.estimated_rp,
      total_hours: pp.total_hours,
      registered: pp.registered,
      dostats_updated_at: pp.dostats_updated_at
    }, r.server || serverNorm || '', r.scraped_at || pp.dostats_updated_at || null, i);
  });

  var col = metricColumnForType(type);
  if (['npc_kills', 'ship_kills', 'galaxy_gates'].indexOf(type) !== -1) {
    rows = rows.filter(function(p) { var v = p[col]; return v != null && Number(v) > 0; });
  }
  rows.sort(function(a, b) {
    var ra =
      a && a.honor_rank != null ? Number(a.honor_rank) :
      a && a.experience_rank != null ? Number(a.experience_rank) :
      a && a.top_user_rank != null ? Number(a.top_user_rank) :
      a && a.npc_kills_rank != null ? Number(a.npc_kills_rank) :
      a && a.ship_kills_rank != null ? Number(a.ship_kills_rank) : null;
    var rb =
      b && b.honor_rank != null ? Number(b.honor_rank) :
      b && b.experience_rank != null ? Number(b.experience_rank) :
      b && b.top_user_rank != null ? Number(b.top_user_rank) :
      b && b.npc_kills_rank != null ? Number(b.npc_kills_rank) :
      b && b.ship_kills_rank != null ? Number(b.ship_kills_rank) : null;
    if (ra != null && rb != null && Number.isFinite(ra) && Number.isFinite(rb)) return ra - rb;
    var va = a[col] != null ? Number(a[col]) : -Infinity;
    var vb = b[col] != null ? Number(b[col]) : -Infinity;
    return vb - va;
  });
  return rows.slice(0, limit);
}

/**
 * Fallback : RPC + snapshot courant (shared_rankings_snapshots), inchangé côté serveur.
 */
async function loadSharedRankingViaRpcOneServer(supabase, serverCode, type, limit, period) {
  if (!supabase || !serverCode) return [];
  try {
    var params = { p_server: serverCode };
    var since = periodToSince(period);
    if (since) params.p_since = since;
    var rpcRes = await supabase.rpc('get_ranking_with_profiles', params);
    if (rpcRes.error || !rpcRes.data || !rpcRes.data.players) return [];
    var players = Array.isArray(rpcRes.data.players) ? rpcRes.data.players : [];
    var uploadedAt = rpcRes.data.scraped_at || null;
    var allPlayers = players.map(function(p, i) {
      return transformPlayerToRow(p, serverCode, uploadedAt, i);
    });
    var col = metricColumnForType(type);
    if (['npc_kills', 'ship_kills', 'galaxy_gates'].indexOf(type) !== -1) {
      allPlayers = allPlayers.filter(function(p) { var v = p[col]; return v != null && Number(v) > 0; });
    }
    allPlayers.sort(function(a, b) {
      var va = a[col] != null ? Number(a[col]) : -Infinity;
      var vb = b[col] != null ? Number(b[col]) : -Infinity;
      return vb - va;
    });
    return allPlayers.slice(0, limit);
  } catch (_e) {
    return [];
  }
}

/**
 * Vue « tous les serveurs » : derniers snapshots par serveur + fusion player_profiles.
 */
async function loadSharedRankingAllServersSnapshots(supabase, type, limit, period) {
  if (!supabase) return [];
  try {
    var rpcRes = await supabase.rpc('get_ranking_latest_per_server', { p_limit: 24 });
    if (rpcRes.error) {
      try {
        Logger.error('[Ranking] get_ranking_latest_per_server ERROR:', JSON.stringify(rpcRes.error));
      } catch (_e) {
        Logger.error('[Ranking] get_ranking_latest_per_server ERROR:', rpcRes.error);
      }
    }
    var data = rpcRes.data;
    if (!data || !data.length) return [];

    var profileMap = {};
    var servers = [...new Set(data.map(function(r) { return r.server_id; }).filter(Boolean))];
    if (servers.length) {
      var ppRes = await supabase.from('player_profiles').select('user_id, server, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, company, grade, level, top_user, experience, honor, dostats_updated_at, profile_json').in('server', servers);
      if (!ppRes.error && ppRes.data) {
        ppRes.data.forEach(function(pp) {
          if (pp && pp.user_id && pp.server) {
            var srvKey = String(pp.server).toLowerCase().trim();
            var uidKey = String(pp.user_id).trim();
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
          key = rowServerKey + ':' + String(uid).trim();
        }
        var pp = key && profileMap[key];
        var pj = (pp && pp.profile_json && typeof pp.profile_json === 'object') ? pp.profile_json : {};
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
          company_from_dostats: companyFromPlayerProfile(pp) || companyFromRankingPlayerPayload(p) || null,
          dostats_updated_at: pp.dostats_updated_at ?? p.dostats_updated_at
        }) : p;
        allPlayers.push(transformPlayerToRow(merged, rowServer, rowTs, i));
      });
    });

    var col = metricColumnForType(type);
    if (['npc_kills', 'ship_kills', 'galaxy_gates'].indexOf(type) !== -1) {
      allPlayers = allPlayers.filter(function(p) { var v = p[col]; return v != null && Number(v) > 0; });
    }
    allPlayers.sort(function(a, b) {
      var va = a[col] != null ? Number(a[col]) : -Infinity;
      var vb = b[col] != null ? Number(b[col]) : -Infinity;
      return vb - va;
    });
    return allPlayers.slice(0, limit);
  } catch (_e) {
    return [];
  }
}

/**
 * Fallback périodes DOStats : shared_rankings_dostats_snapshots (comportement historique).
 */
async function loadDostatsPeriodRankingLegacy(supabase, server, type, period, limit) {
  var duration = PERIOD_TO_DOSTATS_DURATION[period];
  if (!duration) return [];
  var hofType = type;
  if (type === 'xp') hofType = 'experience';
  else if (type === 'rank_points') hofType = 'topuser';
  else if (type === 'npc_kills') hofType = 'aliens';
  else if (type === 'ship_kills') hofType = 'ships';
  else if (type === 'galaxy_gates') {
    Logger.warn('[Ranking] loadDostatsPeriodRankingLegacy: aucun équivalent DOStats pour galaxy_gates');
    return [];
  }
  var serverNorm = resolveRankingServerCode(server) || String(server || '').trim().toLowerCase();
  if (!serverNorm) return [];

  var res = await supabase
    .from('shared_rankings_dostats_snapshots')
    .select('server_id, scraped_at, players_json')
    .eq('server_id', serverNorm)
    .order('scraped_at', { ascending: false })
    .limit(DOSTATS_PERIOD_SNAPSHOT_LOOKBACK);
  var data = res.data;
  var error = res.error;
  if (error || !data || data.length === 0) return [];

  var players = [];
  var latestTs = null;
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
  if (!players.length) return [];

  var rows = players.map(function(p, idx) {
    return transformPlayerToRow(p, serverNorm, latestTs, idx);
  });
  try {
    var userIds = [];
    var pseudos = [];
    rows.forEach(function(r) {
      var uid = r.userId || r.user_id;
      if (uid && userIds.indexOf(String(uid).trim()) === -1) userIds.push(String(uid).trim());
      var pseudo = (r.game_pseudo || '').trim();
      if (pseudo && pseudos.indexOf(pseudo) === -1) pseudos.push(pseudo);
    });
    var byUid = {};
    var byPseudo = {};
    if (userIds.length || pseudos.length) {
      if (userIds.length) {
        var ppResUid = await supabase
          .from('player_profiles')
          .select('user_id, server, pseudo, company, grade, level, estimated_rp, total_hours, registered, dostats_updated_at, profile_json')
          .eq('server', serverNorm)
          .in('user_id', userIds);
        if (!ppResUid.error && ppResUid.data && ppResUid.data.length) {
          ppResUid.data.forEach(function(pp) {
            if (pp && pp.user_id && pp.server) {
              var keySrv = String(pp.server).toLowerCase().trim();
              var keyUid = String(pp.user_id).trim();
              if (keySrv && keyUid) byUid[keySrv + ':' + keyUid] = pp;
            }
          });
        }
      }
      if (pseudos.length) {
        var ppResPseudo = await supabase
          .from('player_profiles')
          .select('user_id, server, pseudo, company, grade, level, estimated_rp, total_hours, registered, dostats_updated_at, profile_json')
          .eq('server', serverNorm)
          .in('pseudo', pseudos);
        if (!ppResPseudo.error && ppResPseudo.data && ppResPseudo.data.length) {
          ppResPseudo.data.forEach(function(pp) {
            if (pp && pp.pseudo && pp.server) {
              var keySrv = String(pp.server).toLowerCase().trim();
              var keyPseudo = String(pp.pseudo).toLowerCase().trim();
              if (keySrv && keyPseudo) byPseudo[keySrv + ':' + keyPseudo] = pp;
            }
          });
        }
      }
      rows = rows.map(function(r) {
        var s = (r._server || r.server || server || '').toString().toLowerCase().trim();
        var uid = r.userId || r.user_id;
        var pseudo = (r.game_pseudo || '').trim().toLowerCase();
        var ppByUid = (uid && byUid[s + ':' + String(uid).trim()]) || null;
        var ppByPseudo = (pseudo && byPseudo[s + ':' + pseudo]) || null;
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
          grade: mergedGrade,
          current_rank: mergedGrade,
          grade_normalized: mergedGradeNorm,
          level: r.level != null ? r.level : (pp.level != null ? pp.level : null),
          company: (r.company != null && String(r.company).trim() !== '') ? String(r.company).trim() : (companyFromPlayerProfile(pp) || null),
          estimated_rp: r.estimated_rp != null ? r.estimated_rp : (pp.estimated_rp != null ? pp.estimated_rp : null),
          total_hours: r.total_hours != null ? r.total_hours : (pp.total_hours != null ? pp.total_hours : null),
          registered: r.registered != null ? r.registered : (pp.registered != null ? pp.registered : null),
          dostats_updated_at: r.dostats_updated_at != null ? r.dostats_updated_at : (pp.dostats_updated_at != null ? pp.dostats_updated_at : null),
        });
      });
    }
  } catch (e) {
    Logger.warn('[Ranking] loadDostatsPeriodRankingLegacy enrich profiles error:', e?.message);
  }

  var col = metricColumnForType(type);
  if (['npc_kills', 'ship_kills', 'galaxy_gates'].indexOf(type) !== -1) {
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
  return rows.slice(0, limit);
}

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
    Logger.debug('[Ranking] loadRankingComparison(new-model)', {
      server: server,
      type: type,
      period: period,
      hours: hours
    });
    var periodKey = UI_PERIOD_TO_NEW_PERIOD[period];
    var players = await loadFromNewModel(supabase, server, type, periodKey, 100);
    var latestAt = (players[0] && players[0]._uploaded_at) || null;
    var top = players.map(function(row) {
      var out = Object.assign({}, row);
      out._comparison_mode = true;
      out._latest_at = latestAt;
      out._reference_at = null;
      out._has_reference = false;
      out._pos_current = null;
      out._pos_reference = null;
      out._pos_delta = null;
      out._honor_delta = null;
      out._xp_delta = null;
      out._rp_delta = null;
      return out;
    });
    Logger.debug('[Ranking] loadRankingComparison(new-model) result', {
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
    var periodKey = UI_PERIOD_TO_NEW_PERIOD[period];
    Logger.debug('[Ranking] loadDostatsPeriodRanking(new-model)', {
      server: server,
      type: type,
      period: period,
      periodKey: periodKey,
      limit: limit,
    });
    var top = await loadFromNewModel(supabase, server, type, periodKey, limit);
    if (!top || top.length === 0) {
      top = await loadDostatsPeriodRankingLegacy(supabase, server, type, period, limit);
    }
    Logger.debug('[Ranking] loadDostatsPeriodRanking result', {
      server: server,
      type: type,
      period: period,
      periodKey: periodKey,
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
    var periodKey = period ? (UI_PERIOD_TO_NEW_PERIOD[period] || null) : 'alltime';
    if (!periodKey) periodKey = 'alltime';
    var serverCode = server ? resolveRankingServerCode(server) : null;

    if (serverCode) {
      var topSnap = await loadFromNewModel(supabase, serverCode, type, periodKey, limit);
      if (topSnap && topSnap.length > 0) {
        Logger.debug('[Ranking] loadSharedRanking(new-model) result', {
          server: serverCode,
          type: type,
          period: periodKey,
          count: topSnap.length
        });
        return topSnap;
      }
      var legacyRpc = await loadSharedRankingViaRpcOneServer(supabase, serverCode, type, limit, period);
      if (legacyRpc && legacyRpc.length > 0) {
        Logger.debug('[Ranking] loadSharedRanking(legacy rpc) result', {
          server: serverCode,
          type: type,
          count: legacyRpc.length
        });
        return legacyRpc;
      }
      return [];
    }

    var allSrv = await loadSharedRankingAllServersSnapshots(supabase, type, limit, period);
    Logger.debug('[Ranking] loadSharedRanking(all-servers) result', {
      type: type,
      count: Array.isArray(allSrv) ? allSrv.length : 0
    });
    return allSrv || [];
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
    ppRes = await supabase.from('player_profiles').select('user_id, server, pseudo, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, company, grade, level, top_user, experience, honor, dostats_updated_at, profile_json').in('server', servers);
  } catch (e) {
    Logger.error('[Ranking] enrichImportedWithProfiles error:', e?.message || e);
    return rows;
  }
  if (ppRes.error || !ppRes.data) return rows;
  var byUid = {}, byPseudo = {};
  ppRes.data.forEach(function(pp) {
    if (pp.user_id && pp.server) byUid[String(pp.server).toLowerCase().trim() + ':' + String(pp.user_id).trim()] = pp;
    if (pp.pseudo && pp.server) byPseudo[String(pp.server).toLowerCase().trim() + ':' + String(pp.pseudo).toLowerCase()] = pp;
  });
  return rows.map(function(r) {
    var s = String(r._server || '').toLowerCase().trim();
    var uid = r.userId || r.user_id;
    var pseudo = (r.game_pseudo || '').trim();
    var pp = (uid && byUid[s + ':' + String(uid).trim()]) || (pseudo && byPseudo[s + ':' + pseudo.toLowerCase()]);
    if (!pp) return r;
    var pj = (pp.profile_json && typeof pp.profile_json === 'object') ? pp.profile_json : {};
    var pjStats = (pj.stats && typeof pj.stats === 'object') ? pj.stats : {};
    return Object.assign({}, r, {
      grade: (r.grade && String(r.grade).trim()) || pp.grade || r.grade,
      level: pp.level ?? r.level,
      honor: pp.honor ?? r.honor,
      xp: pp.experience ?? r.xp,
      rank_points: pp.top_user ?? r.rank_points,
      npc_kills: pp.npc_kills ?? r.npc_kills,
      ship_kills: pp.ship_kills ?? r.ship_kills,
      galaxy_gates: pp.galaxy_gates ?? pjStats.galaxy_gates ?? r.galaxy_gates,
      galaxy_gates_json: pp.galaxy_gates_json ?? pjStats.galaxy_gates_detail ?? r.galaxy_gates_json,
      estimated_rp: pp.estimated_rp ?? r.estimated_rp,
      total_hours: pp.total_hours ?? r.total_hours,
      registered: pp.registered ?? r.registered,
      dostats_updated_at: pp.dostats_updated_at ?? r.dostats_updated_at,
      company: (r.company != null && String(r.company).trim() !== '') ? String(r.company).trim() : (companyFromPlayerProfile(pp) || null)
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
  var server = displayServer ? resolveRankingServerCode(displayServer) : null;
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
 * La chaîne STANDARD est : nouveau modèle (player_rankings) → RPC get_ranking_with_profiles → import local → get_ranking.
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
  if (supabase) {
    try {
      // Priorité au nouveau modèle Supabase pour éviter les écarts avec les imports locaux legacy.
      var primary = await loadSharedRanking(supabase, norm.server, norm.type, norm.limit, null);
      if (primary && primary.length > 0) return primary;
    } catch (_ePrimary) {}
  }

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
  // IMPORTANT : on ne doit pas fallback sur `get_ranking` car ce RPC s'appuie sur
  // `user_sessions` (stats utilisateur de l'app) et non sur DOStats/snapshots.
  // Si les tables DOStats/models sont vides, le classement doit rester vide.
  return [];
}

if (typeof window !== 'undefined' && window.DEBUG) {
  window.normalizeRankingFilters = normalizeRankingFilters;
  window.resolveRankingLoadRoute = resolveRankingLoadRoute;
  window.RANKING_LOAD_ROUTE = RANKING_LOAD_ROUTE;
  window.resolveRankingServerCode = resolveRankingServerCode;
}
