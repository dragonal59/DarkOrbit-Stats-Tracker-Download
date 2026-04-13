// ==========================================
// CLASSEMENT — Supabase : hof_servers + profiles_players (scraping_app v2)
// ==========================================
// Empreinte debug : dans la console du classement, tapez window.__RANKING_ENGINE_BUILD_ID__
// Si la valeur n’existe pas ou est différente, l’UI ne charge pas ce fichier (ex. exe issu de build/ obfusqué).
var RANKING_ENGINE_BUILD_ID = 'hof_servers_profiles_players_2026-04-10';

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

if (typeof window !== 'undefined') {
  window.__RANKING_ENGINE_BUILD_ID__ = RANKING_ENGINE_BUILD_ID;
}

/**
 * Retourne les codes serveur présents dans hof_servers.
 * @returns {Promise<string[]>}
 */
async function getSharedRankingServersList() {
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (!supabase) return [];
  try {
    var r = await supabase.from('hof_servers').select('server').limit(100);
    if (r.error || !r.data || !Array.isArray(r.data)) return [];
    return [...new Set(r.data.map(function(x) { return x.server; }).filter(Boolean))];
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
 * Code serveur stable pour les requêtes (hof_servers).
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
 * Firme depuis une ligne profiles_players / player_profiles (colonne + profile_json + stats).
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
 * Transforme une charge utile joueur vers la ligne UI classement.
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
    npc_kills: (function() {
      var nk = p.npc_kills != null ? p.npc_kills : p.npc_kills_value;
      return nk != null && nk !== '' ? parseSharedNumber(nk) : null;
    })(),
    ship_kills: (function() {
      var sk = p.ship_kills != null ? p.ship_kills : p.ship_kills_value;
      return sk != null && sk !== '' ? parseSharedNumber(sk) : null;
    })(),
    galaxy_gates: p.galaxy_gates,
    galaxy_gates_json: p.galaxy_gates_json,
    stats: p.stats != null ? p.stats : null,
    dostats_updated_at: p.dostats_updated_at,
    estimated_rp_previous: (function() {
      var v = p.estimated_rp_previous;
      if (v == null) return null;
      var n = Number(v);
      return Number.isFinite(n) ? n : null;
    })(),
    estimated_rp_delta_scrape: estimatedRpDeltaScrapeFromPayload(p)
  };
}

/** Supabase limite ~1000 lignes par défaut : .in(user_id, ids) tronquait les profils → grades absents dans le tableau. */
var PROFILE_USER_ID_BATCH = 250;
var PROFILE_PLAYERS_SELECT = 'user_id, server, pseudo, company, grade, level, top_user, experience, honor, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, scraped_at, stats';
var ESTIMATED_RP_PAIR_SELECT = 'user_id, server, estimated_rp_previous, estimated_rp_last, captured_at_previous, captured_at_last';

function estimatedRpDeltaScrapeFromPayload(p) {
  if (!p || p.estimated_rp_previous == null || p.estimated_rp == null) return null;
  var a = Number(p.estimated_rp_previous);
  var b = Number(p.estimated_rp);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return b - a;
}

/**
 * Attache les colonnes de profiles_players_estimated_rp_pair sur des lignes profiles_players déjà chargées.
 * @param {Object} supabase
 * @param {Array<Object>} ppList
 */
async function enrichProfileListWithRpPair(supabase, ppList) {
  if (!supabase || !ppList || !ppList.length) return;
  var byServer = {};
  for (var i = 0; i < ppList.length; i++) {
    var pp = ppList[i];
    if (!pp) continue;
    var s = String(pp.server || '').toLowerCase().trim();
    var uid = pp.user_id != null ? String(pp.user_id).trim() : '';
    if (!s || !uid) continue;
    if (!byServer[s]) byServer[s] = [];
    var arr = byServer[s];
    if (arr.indexOf(uid) === -1) arr.push(uid);
  }
  var merged = {};
  for (var srv in byServer) {
    if (!Object.prototype.hasOwnProperty.call(byServer, srv)) continue;
    var ids = byServer[srv];
    for (var off = 0; off < ids.length; off += PROFILE_USER_ID_BATCH) {
      var chunk = ids.slice(off, off + PROFILE_USER_ID_BATCH);
      var prp = await supabase
        .from('profiles_players_estimated_rp_pair')
        .select(ESTIMATED_RP_PAIR_SELECT)
        .eq('server', srv)
        .in('user_id', chunk);
      if (prp.error || !Array.isArray(prp.data)) continue;
      for (var j = 0; j < prp.data.length; j++) {
        var prow = prp.data[j];
        if (!prow || prow.user_id == null) continue;
        var pk = String(prow.server || srv).toLowerCase().trim() + ':' + String(prow.user_id).trim();
        merged[pk] = prow;
      }
    }
  }
  for (var k = 0; k < ppList.length; k++) {
    var row = ppList[k];
    if (!row || row.user_id == null) continue;
    var rk = String(row.server || '').toLowerCase().trim() + ':' + String(row.user_id).trim();
    var pr = merged[rk];
    if (!pr) continue;
    row.estimated_rp_previous = pr.estimated_rp_previous;
    row.estimated_rp_last_stored = pr.estimated_rp_last;
    row.captured_at_previous = pr.captured_at_previous;
    row.captured_at_last_stored = pr.captured_at_last;
  }
}

async function fetchProfilesPlayersBatched(supabase, serverNorm, userIds) {
  var profileMap = {};
  if (!supabase || !serverNorm || !userIds || !userIds.length) return profileMap;
  var seen = {};
  var unique = [];
  for (var i = 0; i < userIds.length; i++) {
    var id = String(userIds[i] || '').trim();
    if (!id || seen[id]) continue;
    seen[id] = true;
    unique.push(id);
  }
  for (var off = 0; off < unique.length; off += PROFILE_USER_ID_BATCH) {
    var chunk = unique.slice(off, off + PROFILE_USER_ID_BATCH);
    var pr = await supabase
      .from('profiles_players')
      .select(PROFILE_PLAYERS_SELECT)
      .eq('server', serverNorm)
      .in('user_id', chunk);
    if (pr.error || !Array.isArray(pr.data)) continue;
    for (var j = 0; j < pr.data.length; j++) {
      var pp = pr.data[j];
      if (pp && pp.server && pp.user_id) {
        var k = String(pp.server).toLowerCase().trim() + ':' + String(pp.user_id).trim();
        profileMap[k] = pp;
      }
    }
    var prp = await supabase
      .from('profiles_players_estimated_rp_pair')
      .select(ESTIMATED_RP_PAIR_SELECT)
      .eq('server', serverNorm)
      .in('user_id', chunk);
    if (!prp.error && Array.isArray(prp.data)) {
      for (var t = 0; t < prp.data.length; t++) {
        var prow = prp.data[t];
        if (!prow || !prow.user_id) continue;
        var pk = String(prow.server || serverNorm).toLowerCase().trim() + ':' + String(prow.user_id).trim();
        var target = profileMap[pk];
        if (!target) continue;
        target.estimated_rp_previous = prow.estimated_rp_previous;
        target.estimated_rp_last_stored = prow.estimated_rp_last;
        target.captured_at_previous = prow.captured_at_previous;
        target.captured_at_last_stored = prow.captured_at_last;
      }
    }
  }
  return profileMap;
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

var HOF_TYPE_TO_JSON_KEY = {
  topuser: 'top_user',
  experience: 'experience',
  honor: 'honor',
  ships: 'ships',
  aliens: 'aliens'
};

function periodModelKey(periodKey) {
  if (periodKey === 'alltime') return 'current';
  if (periodKey === 'daily') return 'last_24h';
  if (periodKey === 'weekly') return 'last_7d';
  if (periodKey === 'monthly') return 'last_30d';
  return 'current';
}

function normalizeHofStats(stats) {
  if (stats == null) return {};
  if (typeof stats === 'string') {
    try {
      var p = JSON.parse(stats);
      return p && typeof p === 'object' ? p : {};
    } catch (_) {
      return {};
    }
  }
  return typeof stats === 'object' ? stats : {};
}

function cellRankScore(cell) {
  if (!cell || typeof cell !== 'object') return { rank: null, score: null };
  var rank = cell.rank != null && Number.isFinite(Number(cell.rank)) ? Number(cell.rank) : null;
  var score =
    cell.score != null ? cell.score
      : (cell.points != null ? cell.points
        : (cell.value != null ? cell.value
          : (cell.kills != null ? cell.kills
            : (cell.total != null ? cell.total : null))));
  return { rank: rank, score: score };
}

function hofNumericPositive(v) {
  if (v == null || v === '') return false;
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) && Math.trunc(n) > 0;
}

function fillHofScoreFromTopLevelStats(hit, type, st) {
  if (!hit || !st || typeof st !== 'object') return hit;
  if (!((hit.rank != null && hit.rank > 0) && !hofNumericPositive(hit.score))) return hit;
  var fill = null;
  if (type === 'npc_kills') {
    if (st.npc_kills != null && typeof st.npc_kills !== 'object') fill = st.npc_kills;
    else if (st.alien_kills != null && typeof st.alien_kills !== 'object') fill = st.alien_kills;
  } else if (type === 'ship_kills' && st.ship_kills != null && typeof st.ship_kills !== 'object') {
    fill = st.ship_kills;
  }
  return hofNumericPositive(fill) ? { rank: hit.rank, score: fill } : hit;
}

function scanHofMetricBuckets(container, bucketKeys, periodOrder, strictWindow) {
  if (!container || typeof container !== 'object') return null;
  var seenB = {};
  for (var bi = 0; bi < bucketKeys.length; bi++) {
    var bk = bucketKeys[bi];
    if (!bk || seenB[bk]) continue;
    seenB[bk] = true;
    var bucket = container[bk] && typeof container[bk] === 'object' ? container[bk] : null;
    if (!bucket) continue;
    var flat = cellRankScore(bucket);
    if (flat.rank != null && flat.rank > 0) return flat;
    if (hofNumericPositive(flat.score)) return flat;
    for (var qi = 0; qi < periodOrder.length; qi++) {
      var periodName = periodOrder[qi];
      var sub = bucket[periodName] && typeof bucket[periodName] === 'object' ? bucket[periodName] : null;
      if (!sub) continue;
      var out = cellRankScore(sub);
      if (out.rank != null && out.rank > 0) return out;
      if (hofNumericPositive(out.score)) return out;
      if (strictWindow && out.score != null && out.score !== '') {
        var zn = parseFloat(String(out.score).replace(/,/g, '').replace(/\s/g, ''));
        if (Number.isFinite(zn) && zn === 0) return out;
      }
    }
  }
  return null;
}

function extractHofCell(stats, type, periodKey) {
  var hofType = rankingTypeToHofType(type);
  if (!hofType) return { rank: null, score: null };
  var jk = HOF_TYPE_TO_JSON_KEY[hofType] || hofType;
  var st = normalizeHofStats(stats);
  var pk = periodModelKey(periodKey);
  // Fenêtre DOStats (24h / 7j / 30j) : ne pas retomber sur current / alltime sinon score 0 → total affiché en delta.
  var strictWindow = periodKey === 'daily' || periodKey === 'weekly' || periodKey === 'monthly';
  var periodTry = strictWindow
    ? [pk]
    : [pk, 'current', 'alltime', 'all_time', 'allTime'];
  var seenP = {};
  var periodOrder = [];
  for (var pi = 0; pi < periodTry.length; pi++) {
    var x = periodTry[pi];
    if (!x || seenP[x]) continue;
    seenP[x] = true;
    periodOrder.push(x);
  }
  var bucketKeys = [jk];
  if (type === 'npc_kills') {
    bucketKeys.push('npc_kills', 'alien_kills');
  } else if (type === 'ship_kills') {
    bucketKeys.push('ship_kills');
  }
  var hit = scanHofMetricBuckets(st, bucketKeys, periodOrder, strictWindow);
  if (hit) return fillHofScoreFromTopLevelStats(hit, type, st);
  var rnk = (st.rankings && typeof st.rankings === 'object') ? st.rankings
    : (st.rankings_json && typeof st.rankings_json === 'object') ? st.rankings_json
      : null;
  if (rnk) {
    hit = scanHofMetricBuckets(rnk, bucketKeys, periodOrder, strictWindow);
    if (hit) return fillHofScoreFromTopLevelStats(hit, type, st);
  }
  if (type === 'npc_kills') {
    var ak = st.alien_kills != null ? st.alien_kills : st.npc_kills;
    if (ak != null && typeof ak !== 'object' && hofNumericPositive(ak)) return { rank: null, score: ak };
  } else if (type === 'ship_kills') {
    var sk = st.ship_kills;
    if (sk != null && typeof sk !== 'object' && hofNumericPositive(sk)) return { rank: null, score: sk };
  }
  return { rank: null, score: null };
}

async function fetchAllHofServerRows(supabase) {
  var page = 100;
  var from = 0;
  var out = [];
  while (true) {
    var r = await supabase
      .from('hof_servers')
      .select('server, user_id, pseudo, company, stats, scraped_at')
      .range(from, from + page - 1)
      .limit(100);
    if (r.error || !r.data || !r.data.length) break;
    for (var i = 0; i < r.data.length; i++) out.push(r.data[i]);
    if (r.data.length < page) break;
    from += page;
  }
  return out;
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
    .from('profiles_players')
    .select('user_id, server, pseudo, company, grade, level, top_user, experience, honor, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, scraped_at, stats');
  if (serverNorm) q = q.eq('server', serverNorm);
  var res = await q.limit(Math.max(limit * 5, 500));
  if (res.error || !Array.isArray(res.data)) return [];
  await enrichProfileListWithRpPair(supabase, res.data);
  var rows = res.data.map(function(pp, i) {
    var pj = (pp && pp.profile_json && typeof pp.profile_json === 'object') ? pp.profile_json : {};
    var pjStats = (pj.stats && typeof pj.stats === 'object') ? pj.stats : {};
    var company = companyFromPlayerProfile(pp);
    var ggTotal = pp.galaxy_gates != null ? pp.galaxy_gates : (pjStats.galaxy_gates != null ? pjStats.galaxy_gates : null);
    var ggDetail = pp.galaxy_gates_json != null ? pp.galaxy_gates_json : (pjStats.galaxy_gates_detail != null ? pjStats.galaxy_gates_detail : null);
    var ts = pp.scraped_at || null;
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
      estimated_rp_previous: pp.estimated_rp_previous,
      total_hours: pp.total_hours,
      registered: pp.registered,
      stats: pp.stats != null ? pp.stats : null,
      dostats_updated_at: ts
    }, pp.server || serverNorm || '', ts, i);
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

  var rr = await supabase
    .from('hof_servers')
    .select('user_id, server, pseudo, company, stats, scraped_at')
    .eq('server', serverNorm)
    .limit(20000);
  if (rr.error) {
    if (typeof Logger !== 'undefined' && Logger.warn) {
      Logger.warn('[Ranking] hof_servers query error:', rr.error.message || String(rr.error));
    }
    return [];
  }
  if (!Array.isArray(rr.data) || rr.data.length === 0) return [];

  var sourceRows = rr.data
    .map(function(h) {
      var cell = extractHofCell(h.stats, type, periodKey);
      return {
        user_id: h.user_id,
        server: h.server || serverNorm,
        rank: cell.rank,
        points: cell.score,
        scraped_at: h.scraped_at,
        _hof_pseudo: h.pseudo,
        _hof_company: h.company
      };
    })
    .filter(function(r) {
      if (!r) return false;
      if (r.rank != null && Number(r.rank) > 0) return true;
      return hofNumericPositive(r.points);
    });
  if (!sourceRows.length) return [];

  var ids = [];
  sourceRows.forEach(function(r) {
    if (r && r.user_id && ids.indexOf(String(r.user_id)) === -1) ids.push(String(r.user_id));
  });
  if (!ids.length) return [];

  var profileMap = await fetchProfilesPlayersBatched(supabase, serverNorm, ids);

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
    if ((company == null || company === '') && r._hof_company) company = String(r._hof_company).trim() || null;
    var ggTotal = pp.galaxy_gates != null ? pp.galaxy_gates : (pjStats.galaxy_gates != null ? pjStats.galaxy_gates : null);
    var ggDetail = pp.galaxy_gates_json != null ? pp.galaxy_gates_json : (pjStats.galaxy_gates_detail != null ? pjStats.galaxy_gates_detail : null);
    var name = (pp.pseudo != null && String(pp.pseudo).trim() !== '') ? pp.pseudo : r._hof_pseudo;
    var ts = r.scraped_at || pp.scraped_at || null;
    return transformPlayerToRow({
      name: name,
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
      estimated_rp_previous: pp.estimated_rp_previous,
      total_hours: pp.total_hours,
      registered: pp.registered,
      dostats_updated_at: ts
    }, r.server || serverNorm || '', ts, i);
  });

  var col = metricColumnForType(type);
  if (['npc_kills', 'ship_kills', 'galaxy_gates'].indexOf(type) !== -1) {
    rows = rows.filter(function(p) { var v = p[col]; return v != null && parseSharedNumber(v) > 0; });
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
 * Vue « tous les serveurs » : toutes les lignes hof_servers + fusion profiles_players.
 */
async function loadSharedRankingAllServersSnapshots(supabase, type, limit, period) {
  if (!supabase) return [];
  if (type === 'galaxy_gates') return [];
  try {
    var periodKey = period ? (UI_PERIOD_TO_NEW_PERIOD[period] || null) : 'alltime';
    if (!periodKey) periodKey = 'alltime';
    if (!rankingTypeToHofType(type)) return [];

    var allHof = await fetchAllHofServerRows(supabase);
    if (!allHof.length) return [];

    var idsByServer = {};
    allHof.forEach(function(h) {
      var cell0 = extractHofCell(h.stats, type, periodKey);
      if (!(cell0.rank != null && Number(cell0.rank) > 0) && !hofNumericPositive(cell0.score)) return;
      var srv0 = (h.server != null ? String(h.server) : '').toLowerCase().trim();
      var uid0 = h.user_id != null ? String(h.user_id).trim() : '';
      if (!srv0 || !uid0) return;
      if (!idsByServer[srv0]) idsByServer[srv0] = [];
      var arr0 = idsByServer[srv0];
      if (arr0.indexOf(uid0) === -1) arr0.push(uid0);
    });
    var profileMap = {};
    var serverKeys = Object.keys(idsByServer);
    var batchMaps = await Promise.all(serverKeys.map(function(srv) {
      return fetchProfilesPlayersBatched(supabase, srv, idsByServer[srv]);
    }));
    for (var bmi = 0; bmi < batchMaps.length; bmi++) {
      Object.assign(profileMap, batchMaps[bmi]);
    }

    var allPlayers = [];
    var i = 0;
    allHof.forEach(function(h) {
      var cell = extractHofCell(h.stats, type, periodKey);
      if (!(cell.rank != null && Number(cell.rank) > 0) && !hofNumericPositive(cell.score)) return;
      var serverNorm = (h.server != null ? String(h.server) : '').toLowerCase().trim();
      var key = serverNorm + ':' + String(h.user_id || '').trim();
      var pp = profileMap[key] || {};
      var pj = (pp && pp.profile_json && typeof pp.profile_json === 'object') ? pp.profile_json : {};
      var pjStats = (pj.stats && typeof pj.stats === 'object') ? pj.stats : {};
      var rankNum = Number(cell.rank);
      var points = cell.score;
      var honorRank = type === 'honor' ? rankNum : null;
      var experienceRank = type === 'xp' ? rankNum : null;
      var topUserRank = type === 'rank_points' ? rankNum : null;
      var npcKillsRank = type === 'npc_kills' ? rankNum : null;
      var shipKillsRank = type === 'ship_kills' ? rankNum : null;
      var company = companyFromPlayerProfile(pp);
      if ((company == null || company === '') && h.company) company = String(h.company).trim() || null;
      var ggTotal = pp.galaxy_gates != null ? pp.galaxy_gates : (pjStats.galaxy_gates != null ? pjStats.galaxy_gates : null);
      var ggDetail = pp.galaxy_gates_json != null ? pp.galaxy_gates_json : (pjStats.galaxy_gates_detail != null ? pjStats.galaxy_gates_detail : null);
      var name = (pp.pseudo != null && String(pp.pseudo).trim() !== '') ? pp.pseudo : h.pseudo;
      var ts = h.scraped_at || pp.scraped_at || null;
      allPlayers.push(transformPlayerToRow({
        name: name,
        user_id: h.user_id,
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
        estimated_rp_previous: pp.estimated_rp_previous,
        total_hours: pp.total_hours,
        registered: pp.registered,
        dostats_updated_at: ts
      }, h.server, ts, i));
      i++;
    });

    var col = metricColumnForType(type);
    if (['npc_kills', 'ship_kills', 'galaxy_gates'].indexOf(type) !== -1) {
      allPlayers = allPlayers.filter(function(p) { var v = p[col]; return v != null && parseSharedNumber(v) > 0; });
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
 * Périodes DOStats : mêmes clés stats que le scrape (hof_servers JSON : last_24h / last_7d / last_30d).
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
    Logger.debug('[Ranking] loadDostatsPeriodRanking result', {
      server: server,
      type: type,
      period: period,
      periodKey: periodKey,
      count: top.length,
    });
    // FIX 3 — enrichir le cache suivi uniquement pour les champs non-statistiques (grade, firme, niveau).
    // Les valeurs honor/xp/rank_points issues d'une période sont des DELTAS, pas des totaux absolus :
    // les écrire dans le cache corromprait la comparaison affichée dans SUIVI JOUEURS.
    try {
      if (typeof window !== 'undefined' && typeof window.mergeFollowedPlayerStatsCacheFromRow === 'function') {
        for (var _fci = 0; _fci < top.length; _fci++) {
          var _r = top[_fci];
          if (!_r) continue;
          var _safeRow = Object.assign({}, _r, {
            honor: null,
            xp: null,
            rank_points: null,
            estimated_rp: null,
            estimated_rp_previous: _r.estimated_rp_previous,
            estimated_rp_delta_scrape: _r.estimated_rp_delta_scrape
          });
          window.mergeFollowedPlayerStatsCacheFromRow(_safeRow);
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
  var ppLimit = Math.min(servers.length * 1000, 5000);
  var ppRes;
  try {
    ppRes = await supabase.from('profiles_players').select('user_id, server, pseudo, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, estimated_rp, total_hours, registered, company, grade, level, top_user, experience, honor, scraped_at, stats').in('server', servers).order('dostats_updated_at', { ascending: false }).limit(ppLimit);
  } catch (e) {
    Logger.error('[Ranking] enrichImportedWithProfiles error:', e?.message || e);
    return rows;
  }
  if (ppRes.error || !ppRes.data) return rows;
  if (ppRes.data.length === ppLimit) {
    Logger.warn('[Ranking] enrichImportedWithProfiles tronqué — augmenter la limite si nécessaire');
  }
  await enrichProfileListWithRpPair(supabase, ppRes.data);
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
      estimated_rp_previous: pp.estimated_rp_previous != null ? Number(pp.estimated_rp_previous) : r.estimated_rp_previous,
      estimated_rp_delta_scrape: estimatedRpDeltaScrapeFromPayload(pp) ?? r.estimated_rp_delta_scrape,
      total_hours: pp.total_hours ?? r.total_hours,
      registered: pp.registered ?? r.registered,
      dostats_updated_at: pp.scraped_at ?? pp.dostats_updated_at ?? r.dostats_updated_at,
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
 * STANDARD : hof_servers + profiles_players ; puis import local si vide.
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
