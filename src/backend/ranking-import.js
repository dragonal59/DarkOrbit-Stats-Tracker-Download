// ==========================================
// IMPORT CLASSEMENT — Fichier fusion unique (format fusion)
// Format attendu : { exportedAt, players: [{ name, grade, top_user_rank, top_user_value, honor_rank, honor_value, experience_rank, experience_value }] }
// Nom du serveur extrait du nom de fichier (ex: "classement 2026-02-14 16-02-58 gbl5 fusion.json" -> gbl5)
// ==========================================

/**
 * Indique si le JSON est au format fusion (players avec rangs ou valeurs).
 */
function isFusionFormat(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.players) || json.players.length === 0) return false;
  var p = json.players[0];
  if (!p) return false;
  var hasRank = (p.top_user_rank != null || p.topUserRank != null || p.rank != null) ||
    (p.honor_rank != null || p.honorRank != null) ||
    (p.experience_rank != null || p.experienceRank != null);
  var hasValue = (p.top_user_value != null || p.topUserValue != null) ||
    (p.honor_value != null || p.honorValue != null) ||
    (p.experience_value != null || p.experienceValue != null);
  return hasRank || hasValue;
}

function _fusionVal(p, snake, camel, fallback) {
  var v = p[snake] != null ? p[snake] : (p[camel] != null ? p[camel] : null);
  return v != null ? v : (fallback != null ? p[fallback] : null);
}

var GRADE_INVALID = /^(splitter_|spacer_|line_|decoration|hof_|rank_arrow|unknown)/i;

/** Limite garde-fou (taille mémoire / UI) */
var RANKING_IMPORT_MAX_PLAYERS = 25000;

function _rankingImportFmt(key, params) {
  var raw = (typeof i18nT === 'function') ? i18nT(key) : key;
  if (!params) return raw;
  var s = raw;
  for (var pk in params) {
    if (Object.prototype.hasOwnProperty.call(params, pk)) {
      s = s.split('{{' + pk + '}}').join(String(params[pk]));
    }
  }
  return s;
}

function _fusionGrade(p) {
  var g = _fusionVal(p, 'grade', 'grade', null) || p.rank_title || p.rankTitle || _fusionVal(p, 'grade_normalized', 'gradeNormalized', null) || null;
  if (g && typeof g === 'string' && GRADE_INVALID.test(g.trim())) return null;
  return g;
}

/**
 * Transforme un joueur fusion vers le format UI. Le grade est toujours présent (issu du top-user ou grade_normalized).
 * Supporte snake_case et camelCase.
 */
function transformFusionPlayerToUI(p, server, index) {
  const currentRank = _fusionGrade(p);
  const gradeLevel = _fusionVal(p, 'grade_level', 'gradeLevel', null);
  const gradeNormalized = _fusionVal(p, 'grade_normalized', 'gradeNormalized', null);
  var npcKills = _fusionVal(p, 'npc_kills', 'npcKills', null) ?? _fusionVal(p, 'npc_kills_value', 'npcKillsValue', null);
  var shipKills = _fusionVal(p, 'ship_kills', 'shipKills', null) ?? _fusionVal(p, 'ship_kills_value', 'shipKillsValue', null);
  var galaxyGates = _fusionVal(p, 'galaxy_gates', 'galaxyGates', null);
  return {
    id: 'imported-' + server + '-fusion-' + index,
    game_pseudo: p.name != null ? String(p.name) : '—',
    company: p.company || null,
    honor_rank: _fusionVal(p, 'honor_rank', 'honorRank', null),
    experience_rank: _fusionVal(p, 'experience_rank', 'experienceRank', null),
    top_user_rank: _fusionVal(p, 'top_user_rank', 'topUserRank', 'rank'),
    ship_kills_rank: _fusionVal(p, 'ship_kills_rank', 'shipKillsRank', null),
    npc_kills_rank: _fusionVal(p, 'npc_kills_rank', 'npcKillsRank', null),
    honor: parseRankingNumber(_fusionVal(p, 'honor_value', 'honorValue', 'honor')),
    xp: parseRankingNumber(_fusionVal(p, 'experience_value', 'experienceValue', 'experience')),
    rank_points: parseRankingNumber(_fusionVal(p, 'top_user_value', 'topUserValue', 'top_user')),
    npc_kills: npcKills != null ? parseRankingNumber(npcKills) : null,
    ship_kills: shipKills != null ? parseRankingNumber(shipKills) : null,
    galaxy_gates: galaxyGates != null ? parseRankingNumber(galaxyGates) : null,
    galaxy_gates_json: p.galaxy_gates_json || p.galaxyGatesJson || null,
    next_rank_points: null,
    current_rank: currentRank,
    grade_level: gradeLevel != null ? Number(gradeLevel) : null,
    level: _fusionVal(p, 'level', 'level', null) != null ? Number(_fusionVal(p, 'level', 'level', null)) : null,
    grade_normalized: gradeNormalized || null,
    session_date: null,
    session_timestamp: null,
    note: null,
    _source: 'imported',
    _server: server || null,
    userId: _fusionVal(p, 'userId', 'user_id', null)
  };
}

/**
 * Parse une valeur brute (number) ou formatée (string) et retourne un entier.
 * Extension : valeurs brutes = valeurs complètes du jeu (ex: 4582498746). Pas de multiplication.
 * Ancien format : string "2,488,759,644" → on parse tel quel.
 */
function parseRankingNumber(val) {
  if (val == null || val === undefined) return 0;
  var num;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 0;
    num = val;
  } else {
    const cleaned = String(val).replace(/,/g, '').replace(/\s/g, '');
    num = parseFloat(cleaned);
    if (!Number.isFinite(num)) return 0;
  }
  return Math.round(num);
}

/**
 * Extrait le code serveur du nom de fichier.
 * Ex: "gbl5_honor.json" -> "gbl5"
 * Ex: "classement 2026-02-14 gbl5.json" -> "gbl5"
 * Ex: "classement 2026-02-14 16-02-58 fr1 fusion.json" -> "fr1"
 */
function extractServerFromFilename(filename) {
  if (!filename || typeof filename !== 'string') return null;
  var base = filename.replace(/\.json$/i, '').trim().toLowerCase();
  var parts = base.split(/[\s_-]+/);
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p && /^[a-z]{2,4}\d+$/i.test(p)) return p.toLowerCase();
  }
  var last = parts[parts.length - 1];
  if (last && /^[a-z0-9]+$/i.test(last)) return last.toLowerCase();
  return null;
}

/**
 * Format extension par type : { rankingHonor | rankingExperience | rankingTopUser } = [{ name, grade, rank, value }]
 * Format ancien : { players } = [{ name, honor, experience, top_user, grade, company }]
 */
var RANKING_KEYS = { honor: 'rankingHonor', xp: 'rankingExperience', general: 'rankingTopUser' };

/**
 * Transforme les joueurs du format extension (par type) vers le format attendu par l'UI.
 * @param {Array} entries - [{ name, grade, rank, value }] (format extension) ou [{ name, honor, experience, top_user, grade }] (format ancien)
 * @param {string} server - Code serveur
 * @param {string} rankType - 'honor' | 'xp' | 'general'
 */
function transformRankingEntries(entries, server, rankType) {
  if (!Array.isArray(entries)) return [];
  var isExtensionFormat = rankType && (rankType === 'honor' || rankType === 'xp' || rankType === 'general');
  return entries.map(function(p, i) {
    var honor = 0, xp = 0, rankPoints = 0;
    if (isExtensionFormat && p.value != null) {
      if (rankType === 'honor') honor = parseRankingNumber(p.value);
      else if (rankType === 'xp') xp = parseRankingNumber(p.value);
      else rankPoints = parseRankingNumber(p.value);
    } else {
      honor = parseRankingNumber(p.honor);
      xp = parseRankingNumber(p.experience);
      rankPoints = parseRankingNumber(p.top_user);
    }
    return {
      id: 'imported-' + server + '-' + rankType + '-' + i,
      game_pseudo: p.name != null ? String(p.name) : '—',
      company: p.company || null,
      honor: honor,
      xp: xp,
      rank_points: rankPoints,
      next_rank_points: null,
      current_rank: p.grade || null,
      session_date: null,
      session_timestamp: null,
      note: null,
      _source: 'imported'
    };
  });
}


/**
 * Importe le fichier fusion JSON de classement.
 * @param {File} file - Fichier File (input type=file)
 * @returns {Promise<{ success: boolean, server?: string, count?: number, error?: string }>}
 */
function importRankingFile(file) {
  return new Promise(function(resolve) {
    if (!file || !file.name) {
      resolve({ success: false, error: 'Fichier invalide' });
      return;
    }
    const server = extractServerFromFilename(file.name);
    if (!server) {
      resolve({ success: false, error: 'Impossible d\'extraire le serveur du nom de fichier (ex: gbl5, fr1)' });
      return;
    }
    const reader = new FileReader();
    reader.onload = function() {
      try {
        var raw = reader.result;
        if (typeof raw !== 'string' || !raw.trim()) {
          resolve({ success: false, error: 'Fichier vide ou illisible' });
          return;
        }
        var json;
        try {
          json = JSON.parse(raw);
        } catch (parseErr) {
          resolve({ success: false, error: 'JSON invalide : ' + (parseErr?.message || 'Erreur de parsing') });
          return;
        }
        if (!json || typeof json !== 'object') {
          resolve({ success: false, error: 'Format JSON invalide' });
          return;
        }
        if (!isFusionFormat(json)) {
          resolve({ success: false, error: 'Format fusion attendu : { players: [{ name, grade, top_user_rank, top_user_value, honor_rank, honor_value, experience_rank, experience_value }] }' });
          return;
        }
        var players = json.players;
        if (players.length > RANKING_IMPORT_MAX_PLAYERS) {
          resolve({
            success: false,
            error: _rankingImportFmt('ranking_import_too_many_players', { max: RANKING_IMPORT_MAX_PLAYERS })
          });
          return;
        }
        var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
        const key = sk.IMPORTED_RANKINGS || 'darkOrbitImportedRankings';
        const current = typeof UnifiedStorage !== 'undefined' ? UnifiedStorage.get(key, {}) : {};
        var updated = {};
        for (var k in current) if (Object.prototype.hasOwnProperty.call(current, k)) updated[k] = current[k];
        var serverData = updated[server];
        if (!serverData || typeof serverData !== 'object') serverData = {};
        var hadFusion = serverData.fusion && Array.isArray(serverData.fusion.players) && serverData.fusion.players.length > 0;
        if (hadFusion) {
          var prevN = serverData.fusion.players.length;
          var cmsg = _rankingImportFmt('ranking_import_replace_confirm', { server: server, count: prevN, newcount: players.length });
          if (typeof window !== 'undefined' && window.confirm && !window.confirm(cmsg)) {
            resolve({ success: false, error: _rankingImportFmt('ranking_import_user_cancelled') });
            return;
          }
        }
        var copy = {};
        for (var skey in serverData) if (Object.prototype.hasOwnProperty.call(serverData, skey)) copy[skey] = serverData[skey];
        copy.fusion = {
          exportedAt: json.exportedAt || Date.now(),
          players: players
        };
        updated[server] = copy;
        if (typeof UnifiedStorage !== 'undefined') {
          UnifiedStorage.set(key, updated);
          if (typeof UnifiedStorage.invalidateCache === 'function') UnifiedStorage.invalidateCache(key);
        }
        if (typeof DataSync !== 'undefined' && DataSync.queueSync) DataSync.queueSync();
        resolve({ success: true, server: server, count: players.length });
      } catch (e) {
        resolve({ success: false, error: 'Erreur de lecture JSON : ' + (e?.message || 'Inconnue') });
      }
    };
    reader.onerror = function() {
      resolve({ success: false, error: 'Erreur de lecture du fichier' });
    };
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Lit les données importées depuis le stockage (force relecture, fallback localStorage direct).
 */
function _readImportedRankingsStorage() {
  var key = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.IMPORTED_RANKINGS) || 'darkOrbitImportedRankings';
  if (typeof UnifiedStorage !== 'undefined') {
    if (typeof UnifiedStorage.invalidateCache === 'function') UnifiedStorage.invalidateCache(key);
    var d = UnifiedStorage.get(key, {});
    if (d && typeof d === 'object' && Object.keys(d).length > 0) return d;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      var raw = localStorage.getItem(key);
      var isComp = localStorage.getItem(key + '_compressed') === '1';
      if (raw && typeof raw === 'string' && !isComp) {
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      }
    }
  } catch (e) { /* ignore */ }
  return {};
}

/**
 * Récupère le top 100 du classement importé (fusion) pour un serveur et type donnés.
 * Le grade est toujours affiché (issu du fichier fusion).
 * @param {string} server - Code serveur (ex: gbl5, fr1)
 * @param {string} type - 'honor' | 'xp' | 'rank_points' (rank_points = général)
 * @returns {Array} Top 100 pour l'affichage
 */
function getImportedRanking(server, type) {
  const data = _readImportedRankingsStorage();
  var entry = data[server];
  var useKey = server;
  if (!entry || typeof entry !== 'object') {
    var keys = Object.keys(data);
    if (keys.length === 1) {
      entry = data[keys[0]];
      useKey = keys[0];
    } else if (server === 'gbl5' && (data['Global PvE 5 (Steam)'] || data['global pve 5 (steam)'])) {
      useKey = data['Global PvE 5 (Steam)'] ? 'Global PvE 5 (Steam)' : 'global pve 5 (steam)';
      entry = data[useKey];
    }
  }
  if (!entry || typeof entry !== 'object') return [];
  var raw = null;
  if (entry.fusion && Array.isArray(entry.fusion.players)) raw = entry.fusion.players;
  else if (Array.isArray(entry.players)) raw = entry.players;
  if (!raw || raw.length === 0) return [];
  var sorted = [];
  var rankType = type === 'xp' ? 'xp' : type === 'rank_points' ? 'general' : 'honor';
  function rankVal(p, snake, camel, alt) {
    var v = p[snake] != null ? p[snake] : (p[camel] != null ? p[camel] : (alt ? p[alt] : null));
    return v != null ? Number(v) : 999;
  }
  function valCol(p, snake, camel, alt) {
    return parseRankingNumber(p[snake] != null ? p[snake] : (p[camel] != null ? p[camel] : (alt ? p[alt] : 0)));
  }
  function filterAndSort(rankSnake, rankCamel, rankAlt, valSnake, valCamel, valAlt) {
    var withRank = raw.filter(function(p) {
      var r = rankVal(p, rankSnake, rankCamel, rankAlt);
      return r >= 0 && r <= 100;
    });
    if (withRank.length > 0) {
      return withRank.sort(function(a, b) {
        return rankVal(a, rankSnake, rankCamel, rankAlt) - rankVal(b, rankSnake, rankCamel, rankAlt);
      }).slice(0, 100);
    }
    var byVal = raw.slice().sort(function(a, b) {
      return valCol(b, valSnake, valCamel, valAlt) - valCol(a, valSnake, valCamel, valAlt);
    });
    return byVal.slice(0, 100);
  }
  if (rankType === 'honor') {
    sorted = filterAndSort('honor_rank', 'honorRank', null, 'honor_value', 'honorValue', 'honor');
  } else if (rankType === 'xp') {
    sorted = filterAndSort('experience_rank', 'experienceRank', null, 'experience_value', 'experienceValue', 'experience');
  } else {
    sorted = filterAndSort('top_user_rank', 'topUserRank', 'rank', 'top_user_value', 'topUserValue', 'top_user');
  }
  return sorted.map(function(p, i) { return transformFusionPlayerToUI(p, useKey, i); });
}

/**
 * Liste les serveurs pour lesquels au moins un classement a été importé.
 */
function getImportedServerList() {
  const data = _readImportedRankingsStorage();
  return Object.keys(data).filter(function(k) {
    var e = data[k];
    if (!e || typeof e !== 'object') return false;
    return (e.fusion && Array.isArray(e.fusion.players) && e.fusion.players.length > 0) ||
      (Array.isArray(e.players) && e.players.length > 0);
  });
}

/**
 * Retourne le timestamp de la dernière mise à jour du classement pour un serveur (même résolution de clé que getImportedRanking).
 * @param {string} server - Code ou libellé serveur
 * @returns {string|null} ISO timestamp ou null
 */
function getImportedRankingTimestamp(server) {
  if (!server) return null;
  const data = _readImportedRankingsStorage();
  var entry = data[server];
  if (!entry || typeof entry !== 'object') {
    var keys = Object.keys(data);
    if (keys.length === 1) entry = data[keys[0]];
    else if (server === 'gbl5' && (data['Global PvE 5 (Steam)'] || data['global pve 5 (steam)'])) {
      entry = data['Global PvE 5 (Steam)'] || data['global pve 5 (steam)'];
    }
  }
  if (!entry || typeof entry !== 'object') return null;
  return entry.timestamp || null;
}

window.importRankingFile = importRankingFile;
window.getImportedRanking = getImportedRanking;
window.getImportedServerList = getImportedServerList;
window.getImportedRankingTimestamp = getImportedRankingTimestamp;

