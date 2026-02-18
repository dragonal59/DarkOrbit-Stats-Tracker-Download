// ==========================================
// CLASSEMENT — Backend (RPC get_ranking)
// Données publiques : profiles_public + dernière session par user
// ==========================================

const RANKING_LIMIT_DEFAULT = 100;
const RANKING_LIMIT_MAX = 500;

/** Mapping libellé affiché → code serveur (pour import fusion) */
var RANKING_SERVER_DISPLAY_TO_CODE = { 'Global PvE 5 (Steam)': 'gbl5' };
if (typeof SERVER_DISPLAY_TO_CODE !== 'undefined') {
  for (var k in SERVER_DISPLAY_TO_CODE) if (Object.prototype.hasOwnProperty.call(SERVER_DISPLAY_TO_CODE, k)) {
    RANKING_SERVER_DISPLAY_TO_CODE[k] = SERVER_DISPLAY_TO_CODE[k];
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
 * Charge le classement avec filtres.
 * Priorité : données importées (extension) si serveur correspondant, sinon Supabase.
 * @param {Object} filters - { server: string|null, type: 'honor'|'xp'|'rank_points', limit?: number }
 * @returns {Promise<Array>} Liste d'objets { id, game_pseudo, honor, xp, rank_points, current_rank, ... }
 */
async function loadRanking(filters) {
  const displayServer = filters?.server && String(filters.server).trim() !== '' ? String(filters.server).trim() : null;
  const type = filters?.type === 'xp' || filters?.type === 'rank_points' ? filters.type : 'honor';
  var server = displayServer ? rankingDisplayToCode(displayServer) : null;
  var limit = Math.min(RANKING_LIMIT_MAX, Math.max(1, parseInt(filters?.limit, 10) || RANKING_LIMIT_DEFAULT));

  if (typeof getImportedRanking === 'function') {
    var imported = [];
    if (server) {
      imported = getImportedRanking(server, type);
      if (imported.length === 0 && displayServer) {
        imported = getImportedRanking(displayServer, type);
      }
    }
    if (imported.length > 0) {
      if (server && typeof console !== 'undefined' && console.log) {
        console.log('[Ranking] Serveur sélectionné (server_id):', server, '→', imported.length, 'joueurs affichés');
      }
      return imported.slice(0, limit);
    }
    if (!server) {
      var importedServers = getImportedServerList();
      if (importedServers.length > 0) {
        var merged = [];
        importedServers.forEach(function(s) {
          var rows = getImportedRanking(s, type);
          merged = merged.concat(rows);
        });
        var col = type === 'xp' ? 'xp' : type === 'rank_points' ? 'rank_points' : 'honor';
        merged.sort(function(a, b) { return (b[col] || 0) - (a[col] || 0); });
        return merged.slice(0, limit);
      }
    }
  }

  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (!supabase) {
    console.warn('[Ranking] Supabase non disponible');
    return [];
  }
  try {
    const { data, error } = await supabase.rpc('get_ranking', {
      p_server: displayServer,
      p_companies: null,
      p_type: type,
      p_limit: limit
    });
    if (error) {
      console.error('[Ranking] Erreur get_ranking:', error.message);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[Ranking] Exception loadRanking:', e?.message || e);
    return [];
  }
}

/**
 * Dernière session d'un joueur : la popup utilise les données déjà chargées dans le tableau (chaque ligne = dernière session).
 * Pas d'appel RPC supplémentaire.
 * @param {string} _userId - UUID du joueur (non utilisé : les données viennent du tableau)
 * @returns {Promise<Object|null>} null (voir showPlayerDetails côté UI avec l'objet ligne)
 */
async function getUserLastSession(_userId) {
  return null;
}
