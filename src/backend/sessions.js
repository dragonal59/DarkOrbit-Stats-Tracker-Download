// ==========================================
// MODULE: SESSIONS MANAGEMENT (Supabase uniquement)
// ==========================================

var _sessionsCache = [];

function setSessionsCache(sessions) {
  _sessionsCache = Array.isArray(sessions) ? sessions : [];
}
window.setSessionsCache = setSessionsCache;

async function refreshSessionsFromSupabase() {
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (!supabase) return;
  try {
    var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
    if (!user || !user.id) return;
    var res = await supabase.from('user_sessions').select('*').eq('user_id', user.id).order('session_timestamp', { ascending: false });
    if (res.error) return;
    var rows = res.data || [];
    var app = (rows || []).map(function (r) {
      var num = function (v) { return Number.isFinite(Number(v)) ? Number(v) : 0; };
      return {
        id: r.local_id || r.id,
        date: r.session_date,
        honor: num(r.honor),
        xp: num(r.xp),
        rankPoints: num(r.rank_points),
        nextRankPoints: num(r.next_rank_points),
        currentRank: r.current_rank,
        note: r.note,
        timestamp: r.session_timestamp,
        is_baseline: !!r.is_baseline,
        player_id: r.player_id || null,
        player_server: r.player_server || null,
        player_pseudo: r.player_pseudo || null
      };
    });
    setSessionsCache(app);
  } catch (e) {
    Logger.error('[Sessions] refreshSessionsFromSupabase error:', e?.message || e);
  }
}
window.refreshSessionsFromSupabase = refreshSessionsFromSupabase;

async function restoreSessionToSupabase(session) {
  if (!session || !session.id) return false;
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (!supabase) return false;
  try {
    var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
    if (!user || !user.id) return false;
    var row = _sessionToRow(session, String(session.id));
    var rpc = await supabase.rpc('upsert_user_session_secure', { p_row: row });
    if (rpc.error || (rpc.data && rpc.data.success === false)) return false;
    await refreshSessionsFromSupabase();
    return true;
  } catch (e) {
    Logger.error('[Sessions] restoreSessionToSupabase error:', e?.message || e);
    return false;
  }
}
window.restoreSessionToSupabase = restoreSessionToSupabase;

function _sessionToRow(s, localId) {
  var num = function (v) { return Number.isFinite(Number(v)) ? Number(v) : 0; };
  // honor, xp, rank_points, next_rank_points envoyés en String pour éviter
  // toute perte de précision JS au-delà de Number.MAX_SAFE_INTEGER (~9×10^15).
  // Les RPCs Supabase lisent ces champs via ->> (extraction TEXT) puis ::BIGINT.
  return {
    local_id: localId || String(s.id || s.timestamp || Date.now()),
    honor: String(num(s.honor)),
    xp: String(num(s.xp)),
    rank_points: String(num(s.rankPoints)),
    next_rank_points: String(num(s.nextRankPoints)),
    current_rank: s.currentRank || null,
    note: s.note || null,
    session_date: s.date || null,
    session_timestamp: num(s.timestamp) || Date.now(),
    is_baseline: !!s.is_baseline,
    player_id: s.player_id || getActivePlayerId() || null,
    player_server: s.player_server || null,
    player_pseudo: s.player_pseudo || null
  };
}

function getActivePlayerId() {
  if (typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerIdSync) {
    const id = UserPreferencesAPI.getActivePlayerIdSync();
    if (id) return id;
  }
  return null;
}
window.getActivePlayerId = getActivePlayerId;

/** rank_1..rank_21 + slugs (basic_space_pilot, etc.) → libellé FR (pour session depuis récolte auto) */
var RANK_ID_TO_FR = {
  'rank_1': 'Pilote de 1ère classe', 'rank_2': 'Caporal', 'rank_3': 'Caporal-chef', 'rank_4': 'Sergent',
  'rank_5': 'Sergent-chef', 'rank_6': 'Adjudant', 'rank_7': 'Adjudant-chef', 'rank_8': 'Major',
  'rank_9': 'Sous-lieutenant', 'rank_10': 'Lieutenant', 'rank_11': 'Capitaine', 'rank_12': 'Capitaine d\'escadron',
  'rank_13': 'Commandant', 'rank_14': 'Commandant d\'escadron', 'rank_15': 'Lieutenant-colonel', 'rank_16': 'Colonel',
  'rank_17': 'Général de brigade', 'rank_18': 'Général de division', 'rank_19': 'Général de corps d\'armée',
  'rank_20': 'Général d\'armée', 'rank_21': 'Maréchal',
  'basic_space_pilot': 'Pilote de 1ère classe', 'space_pilot': 'Caporal', 'chief_space_pilot': 'Caporal-chef',
  'basic_sergeant': 'Sergent', 'sergeant': 'Sergent-chef', 'chief_sergeant': 'Adjudant',
  'basic_lieutenant': 'Adjudant-chef', 'lieutenant': 'Major', 'chief_lieutenant': 'Sous-lieutenant',
  'basic_captain': 'Lieutenant', 'captain': 'Capitaine', 'chief_captain': 'Capitaine d\'escadron',
  'basic_major': 'Commandant', 'major': 'Commandant d\'escadron', 'chief_major': 'Lieutenant-colonel',
  'basic_colonel': 'Colonel', 'colonel': 'Général de brigade', 'chief_colonel': 'Général de division',
  'basic_general': 'Général de corps d\'armée', 'general': 'Général d\'armée', 'chief_general': 'Maréchal'
};

/**
 * Crée une session depuis les données de la récolte auto (historique). Supabase uniquement.
 * @param {object} data - { server, game_pseudo, player_id, company, initial_rank, initial_xp, initial_honor, initial_rank_points, next_rank_points }
 * @returns {Promise<boolean>} true si session créée
 */
async function addSessionFromScan(data) {
  if (!data || typeof data !== 'object') return false;
  var honor = Number(data.initial_honor);
  var xp = Number(data.initial_xp);
  var rankPoints = Number(data.initial_rank_points);
  var nextRankPoints = data.next_rank_points != null ? Number(data.next_rank_points) : rankPoints;
  var currentRank = (RANK_ID_TO_FR[data.initial_rank] || data.initial_rank || '').trim() || 'Grade inconnu';
  var now = Date.now();
  var session = {
    id: now,
    date: new Date().toLocaleString('fr-FR'),
    honor: Math.max(0, honor),
    xp: Math.max(0, xp),
    rankPoints: Math.max(0, rankPoints),
    nextRankPoints: Math.max(0, nextRankPoints),
    currentRank: currentRank,
    note: 'Récolte auto',
    timestamp: now,
    is_baseline: false,
    player_id: data.player_id || getActivePlayerId() || null,
    player_server: data.player_server || data.server || null,
    player_pseudo: data.game_pseudo || data.player_pseudo || null
  };
  var validation = validateSession(session);
  if (!validation.valid) return false;
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (!supabase) return false;
  try {
    var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
    if (!user || !user.id) return false;
    var row = _sessionToRow(validation.session, String(now));
    var rpc = await supabase.rpc('upsert_user_session_secure', { p_row: row });
    if (rpc.error || (rpc.data && rpc.data.success === false)) {
      if (typeof showToast === 'function') showToast(rpc.data && rpc.data.error ? rpc.data.error : (rpc.error && rpc.error.message) || 'Erreur sauvegarde', 'error');
      return false;
    }
    var belowPts = data.below_rank_points != null ? Number(data.below_rank_points) : NaN;
    var belowRaw = data.below_rank_raw != null ? String(data.below_rank_raw).trim() : '';
    var curPayload = {
      honor: session.honor,
      xp: session.xp,
      rankPoints: session.rankPoints,
      nextRankPoints: session.nextRankPoints,
      currentRank: session.currentRank,
      note: '',
      timestamp: now
    };
    if (Number.isFinite(belowPts) && belowPts > 0 && belowRaw) {
      curPayload.belowRankPoints = belowPts;
      curPayload.belowRankRaw = belowRaw;
    } else {
      curPayload.belowRankPoints = null;
      curPayload.belowRankRaw = null;
    }
    SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, curPayload);
    await refreshSessionsFromSupabase();
    if (typeof renderHistory === 'function') renderHistory();
    if (typeof window.maybeRefreshProgression === 'function') window.maybeRefreshProgression();
    if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
    return true;
  } catch (e) {
    Logger.error('[Sessions] addSessionFromScan error:', e?.message || e);
    if (typeof showToast === 'function') showToast('Erreur lors de l\'enregistrement de la session.', 'error');
    return false;
  }
}

/**
 * Enregistre le seuil de départ (baseline) - modal premier lancement. Supabase uniquement.
 */
async function saveBaselineSession(stats) {
  var sessions = getSessions();
  if (sessions.some(function (s) { return s.is_baseline === true; })) {
    if (typeof showToast === 'function') showToast('Un seuil de référence existe déjà.', 'info');
    return;
  }
  var now = Date.now();
  var session = {
    id: 'baseline-' + now,
    date: new Date().toLocaleString('fr-FR'),
    honor: stats.honor,
    xp: stats.xp,
    rankPoints: stats.rankPoints,
    nextRankPoints: stats.nextRankPoints || stats.rankPoints,
    currentRank: stats.currentRank,
    note: 'Seuil de départ',
    timestamp: now,
    is_baseline: true,
    player_id: getActivePlayerId() || null,
    player_server: null,
    player_pseudo: null
  };
  var validation = validateSession(session);
  if (!validation.valid) {
    if (typeof showToast === 'function') showToast('❌ Erreur : ' + validation.error, 'error');
    return;
  }
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
  if (!supabase || !user || !user.id) {
    if (typeof showToast === 'function') showToast('Connexion requise pour sauvegarder.', 'error');
    return;
  }
  var row = _sessionToRow(validation.session, 'baseline-' + now);
  var rpc = await supabase.rpc('upsert_user_session_secure', { p_row: row });
  if (rpc.error || (rpc.data && rpc.data.success === false)) {
    if (typeof showToast === 'function') showToast(rpc.data && rpc.data.error ? rpc.data.error : 'Échec de la sauvegarde', 'error');
    return;
  }
  SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, {
    honor: stats.honor,
    xp: stats.xp,
    rankPoints: stats.rankPoints,
    nextRankPoints: stats.nextRankPoints != null ? stats.nextRankPoints : stats.rankPoints,
    currentRank: stats.currentRank,
    note: '',
    timestamp: Date.now()
  });
  await refreshSessionsFromSupabase();
  if (typeof renderHistory === 'function') renderHistory();
  if (typeof window.maybeRefreshProgression === 'function') window.maybeRefreshProgression();
}

async function saveSession() {
  var badgeEarly = (typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' && BackendAPI.getUserBadge ? BackendAPI.getUserBadge() : 'FREE') || '').toString().toUpperCase();
  if (badgeEarly === 'FREE') {
    if (typeof showToast === 'function') {
      showToast((typeof window !== 'undefined' && typeof window.i18nT === 'function')
        ? window.i18nT('stats_save_manual_free_use_auto')
        : 'Utilisez « Récupérer mes statistiques » (badge FREE, une fois par 24 h).', 'info');
    }
    return;
  }
  var stats = getCurrentStats();
  if (!stats.currentRank || stats.honor === 0) {
    if (typeof showToast === 'function') showToast("Veuillez remplir au moins le grade et les points d'honneur", "warning");
    return;
  }
  var currentSessions = getSessions();
  var badge = (typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' && BackendAPI.getUserBadge ? BackendAPI.getUserBadge() : 'FREE') || '').toString().toUpperCase();
  if (badge === 'FREE' && currentSessions.some(function (s) { return s.is_baseline; })) {
    if (typeof showToast === 'function') showToast('Les utilisateurs FREE ne peuvent pas ajouter de nouvelles sessions. Passez en PRO !', 'info');
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sessionSaveBlocked', { detail: { reason: 'FREE_LIMIT' } }));
    return;
  }
  var now = Date.now();
  var session = {
    id: now,
    date: new Date().toLocaleString('fr-FR'),
    honor: stats.honor,
    xp: stats.xp,
    rankPoints: stats.rankPoints,
    nextRankPoints: stats.nextRankPoints,
    currentRank: stats.currentRank,
    note: stats.note,
    timestamp: now,
    is_baseline: false,
    player_id: getActivePlayerId() || null,
    player_server: null,
    player_pseudo: null
  };
  var validation = validateSession(session);
  if (!validation.valid) {
    if (typeof showToast === 'function') showToast('❌ Erreur de validation : ' + validation.error, "error");
    return;
  }
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
  if (!supabase || !user || !user.id) {
    if (typeof showToast === 'function') showToast('Connexion requise pour sauvegarder.', 'error');
    return;
  }
  var row = _sessionToRow(validation.session, String(now));
  var rpc = await supabase.rpc('upsert_user_session_secure', { p_row: row });
  if (rpc.error || (rpc.data && rpc.data.success === false)) {
    if (typeof showToast === 'function') showToast(rpc.data && rpc.data.error ? rpc.data.error : 'Échec de la sauvegarde', 'error');
    return;
  }

  showToast("✅ Session sauvegardée !", "success");
  if (typeof playSound === 'function') playSound('success');
  if (typeof celebrateSuccess === 'function') celebrateSuccess('session');
  await refreshSessionsFromSupabase();
  saveCurrentStats();
  renderHistory();
  if (typeof window.maybeRefreshProgression === 'function') window.maybeRefreshProgression();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  startSessionTimer();
  
  if (typeof updateStreakDisplay === 'function') updateStreakDisplay();
  if (typeof DataSync !== 'undefined' && DataSync.queueSync) DataSync.queueSync();
}

function getSessionsAll() {
  return _sessionsCache;
}

function getSessions() {
  var all = getSessionsAll();
  var activeId = getActivePlayerId();
  if (!activeId) return all;
  return all.filter(function (s) { return (s.player_id || '') === activeId; });
}

/** Même règle que l'import bulk : local_id = id || timestamp || imp-index */
function _effectiveImportLocalId(session, index) {
  return String(session.id || session.timestamp || 'imp-' + index);
}

function _i18nFmtImport(key, params) {
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

/**
 * Doublons d'identifiants dans le fichier + collisions avec les sessions déjà chargées (même local_id).
 */
function _analyzeSessionImportRisks(validatedSessions) {
  var idToCount = {};
  var i;
  for (i = 0; i < validatedSessions.length; i++) {
    var lid = _effectiveImportLocalId(validatedSessions[i], i);
    idToCount[lid] = (idToCount[lid] || 0) + 1;
  }
  var duplicateIdKeys = 0;
  var duplicateExtraRows = 0;
  for (var k in idToCount) {
    if (Object.prototype.hasOwnProperty.call(idToCount, k) && idToCount[k] > 1) {
      duplicateIdKeys++;
      duplicateExtraRows += idToCount[k] - 1;
    }
  }
  var existingSet = {};
  var all = getSessionsAll();
  for (i = 0; i < all.length; i++) {
    existingSet[String(all[i].id)] = true;
  }
  var collisionUnique = 0;
  var seenImp = {};
  for (i = 0; i < validatedSessions.length; i++) {
    var id = _effectiveImportLocalId(validatedSessions[i], i);
    if (existingSet[id] && !seenImp[id]) {
      seenImp[id] = true;
      collisionUnique++;
    }
  }
  return { duplicateIdKeys: duplicateIdKeys, duplicateExtraRows: duplicateExtraRows, collisionUnique: collisionUnique };
}

async function deleteSession(id) {
  var all = getSessionsAll();
  var sessionToDelete = all.find(function (s) { return String(s.id) === String(id); });
  if (!sessionToDelete) {
    if (typeof showToast === 'function') showToast("❌ Session introuvable", "error");
    return;
  }
  if (typeof ActionHistory !== 'undefined') {
    ActionHistory.push({ type: 'session_delete', data: { session: JSON.parse(JSON.stringify(sessionToDelete)) } });
  }
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
  if (!supabase || !user || !user.id) {
    if (typeof showToast === 'function') showToast("Connexion requise.", "error");
    return;
  }
  var idStr = String(id);
  var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr);
  var err = isUuid
    ? (await supabase.from('user_sessions').delete().eq('user_id', user.id).eq('id', idStr)).error
    : (await supabase.from('user_sessions').delete().eq('user_id', user.id).eq('local_id', idStr)).error;
  if (err) {
    if (typeof showToast === 'function') showToast("❌ Erreur suppression: " + (err.message || err), "error");
    return;
  }
  await refreshSessionsFromSupabase();
  if (typeof showToast === 'function') showToast("Session supprimée (Ctrl+Z pour annuler)", "success");
  if (typeof renderHistory === 'function') renderHistory();
  if (typeof window.maybeRefreshProgression === 'function') window.maybeRefreshProgression();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  if (typeof startSessionTimer === 'function') startSessionTimer();
}

function loadSession(id) {
  const sessions = getSessions();
  const session = sessions.find(s => String(s.id) === String(id));
  const selected = document.getElementById("selected");
  const honorEl = document.getElementById("honor");
  if (!session || !honorEl) return;

  const fmt = (typeof window !== 'undefined' && typeof window.numFormat === 'function') ? window.numFormat : function(n) { return Number(n).toLocaleString("en-US"); };
  honorEl.value = session.honor != null && session.honor !== '' ? fmt(session.honor) : '';
  var xpEl = document.getElementById("xp"); if (xpEl) xpEl.value = session.xp != null && session.xp !== '' ? fmt(session.xp) : '';
  var rpEl = document.getElementById("rankPoints"); if (rpEl) rpEl.value = session.rankPoints != null && session.rankPoints !== '' ? fmt(session.rankPoints) : '';
  var nrpEl = document.getElementById("nextRankPoints"); if (nrpEl) nrpEl.value = session.nextRankPoints != null && session.nextRankPoints !== '' ? fmt(session.nextRankPoints) : '';

  if (session.currentRank && selected) {
    const rankData = RANKS_DATA.find(r => r.name === session.currentRank);
    if (rankData) {
      selected.innerHTML = `<div class="selected-rank">
        <div class="grade-block">
          <div class="grade-block-name">${session.currentRank}</div>
          <div class="grade-block-icon">
            <img src="${rankData.img}" alt="${session.currentRank}" class="grade-block-img">
          </div>
        </div>
      </div>`;
    }
  }
  
  saveCurrentStats();
  updateStatsDisplay();
  
  switchTab('stats');
  startSessionTimer();
  showToast("Session chargée", "success");
}

function loadLastSessionIntoForm() {
  const sessions = getSessions();
  
  if (!sessions.length) {
    showToast("⚠️ Aucune session enregistrée", "warning");
    return;
  }
  
  const lastSession = sessions.reduce((latest, session) => {
    return session.timestamp > latest.timestamp ? session : latest;
  }, sessions[0]);
  
  loadSession(lastSession.id);
}

// ==========================================
// EXPORT / IMPORT
// ==========================================

function exportData() {
  const badge = typeof BackendAPI !== 'undefined' && BackendAPI.getCurrentBadge ? BackendAPI.getCurrentBadge() : 'FREE';
  if (badge === 'FREE' || badge === 'PRO') {
    if (typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function') {
      const p = AuthManager.getCurrentUser();
      if (p && typeof p.then === 'function') {
        p.then(function(u) {
          if (u) {
            if (typeof showToast === 'function') showToast('Export réservé aux données stockées uniquement en local. Déconnectez-vous pour exporter.', 'error');
            return;
          }
          doExportData();
        });
        return;
      }
    }
    doExportData();
    return;
  }
  doExportData();
}

function doExportData() {
  const sessions = getSessions();
  const currentStats = getCurrentStats();
  const events = typeof getEvents === 'function' ? getEvents() : [];
  
  const data = {
    currentStats,
    sessions,
    events,
    exportDate: new Date().toLocaleString('fr-FR')
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `darkorbit_stats_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast(`📥 Données exportées (${sessions.length} sessions, ${events.length} événements)`, "success");
}

function importData() {
  const fileInput = document.getElementById('importFile');
  fileInput.click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  
  if (!file) return;
  
  // Vérifier la taille du fichier (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showToast("❌ Fichier trop volumineux (max 10MB)", "error");
    e.target.value = '';
    return;
  }
  
  // Vérifier que c'est bien un fichier JSON
  if (!file.name.endsWith('.json')) {
    showToast("❌ Veuillez sélectionner un fichier JSON", "error");
    e.target.value = '';
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = async function(event) {
    try {
      const data = JSON.parse(event.target.result);
      
      // Valider la structure des données
      if (!data.sessions && !data.currentStats && !data.events) {
        showToast("❌ Format de fichier invalide - Aucune donnée trouvée", "error");
        e.target.value = '';
        return;
      }
      
      let validationResults = { valid: true, skipped: 0 };
      let eventsCount = 0;
      
      // Valider les sessions si présentes
      if (data.sessions) {
        validationResults = validateImportedData(data.sessions);
        
        if (!validationResults.valid) {
          showToast(`❌ Validation échouée : ${validationResults.error}`, "error");
          if (validationResults.errors && validationResults.errors.length > 0) {
            Logger.error('Import errors:', validationResults.errors);
          }
          e.target.value = '';
          return;
        }
      }
      
      // Valider les événements si présents
      if (data.events && Array.isArray(data.events)) {
        eventsCount = data.events.length;
      }
      
      // Demander confirmation avant d'écraser les données
      const sessionsCount = validationResults.sessions ? validationResults.sessions.length : 0;
      const skippedCount = validationResults.skipped || 0;
      const IMPORT_MAX_GUARD = 500;
      var risks = { duplicateIdKeys: 0, duplicateExtraRows: 0, collisionUnique: 0 };
      if (sessionsCount > 0 && validationResults.sessions) {
        risks = _analyzeSessionImportRisks(validationResults.sessions);
      }

      var confirmMessage = _i18nFmtImport('import_confirm_intro') + '\n\n' + _i18nFmtImport('import_confirm_overwrite') + '\n\n';

      if (sessionsCount > 0) {
        confirmMessage += _i18nFmtImport('import_confirm_valid_sessions', { n: sessionsCount }) + '\n';
        if (skippedCount > 0) {
          confirmMessage += _i18nFmtImport('import_confirm_skipped_sessions', { n: skippedCount }) + '\n';
        }
        if (sessionsCount > IMPORT_MAX_GUARD) {
          confirmMessage += _i18nFmtImport('import_confirm_truncated', { max: IMPORT_MAX_GUARD }) + '\n';
        }
        if (risks.duplicateIdKeys > 0) {
          confirmMessage += _i18nFmtImport('import_confirm_duplicate_ids', {
            ids: risks.duplicateIdKeys,
            rows: risks.duplicateExtraRows
          }) + '\n';
        }
        if (risks.collisionUnique > 0) {
          confirmMessage += _i18nFmtImport('import_confirm_collisions', { n: risks.collisionUnique }) + '\n';
        }
      }

      if (eventsCount > 0) {
        confirmMessage += _i18nFmtImport('import_confirm_events_count', { n: eventsCount }) + '\n';
      }

      if (data.currentStats) {
        confirmMessage += _i18nFmtImport('import_confirm_has_stats') + '\n';
      }

      if (data.exportDate) {
        confirmMessage += '\n' + _i18nFmtImport('import_confirm_export_date', { date: data.exportDate });
      }

      if (!confirm(confirmMessage)) {
        showToast(_i18nFmtImport('import_cancelled'), 'warning');
        e.target.value = '';
        return;
      }

      var LARGE_IMPORT_THRESHOLD = 50;
      if (sessionsCount >= LARGE_IMPORT_THRESHOLD) {
        var secondMsg = _i18nFmtImport('import_confirm_large_second', { n: sessionsCount });
        if (!confirm(secondMsg)) {
          showToast(_i18nFmtImport('import_cancelled'), 'warning');
          e.target.value = '';
          return;
        }
      }

      if (validationResults.sessions && validationResults.sessions.length > 0) {
        var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
        if (!supabase || !user || !user.id) {
          showToast("Connexion requise pour importer des sessions.", "error");
          e.target.value = '';
          return;
        }

        var IMPORT_MAX = 500;
        // Un RPC bulk par chunk (moins d’allers-retours HTTP qu’un upsert par session)
        var CHUNK_SIZE = 100;
        var CHUNK_DELAY_MS = 150;

        var sessionsToImport = validationResults.sessions;
        if (sessionsToImport.length > IMPORT_MAX) {
          Logger.warn('[import] ' + sessionsToImport.length + ' sessions dans le fichier — tronqué à ' + IMPORT_MAX);
          showToast('⚠️ Fichier trop volumineux : seules les ' + IMPORT_MAX + ' premières sessions seront importées.', 'warning');
          sessionsToImport = sessionsToImport.slice(0, IMPORT_MAX);
        }

        var totalChunks = Math.ceil(sessionsToImport.length / CHUNK_SIZE);
        var importError = null;

        for (var ci = 0; ci < totalChunks; ci++) {
          var chunk = sessionsToImport.slice(ci * CHUNK_SIZE, (ci + 1) * CHUNK_SIZE);
          var rows = chunk.map(function (s, j) {
            var globalIdx = ci * CHUNK_SIZE + j;
            return _sessionToRow(s, String(s.id || s.timestamp || 'imp-' + globalIdx));
          });
          var bulkRpc = await supabase.rpc('upsert_user_sessions_bulk', { p_rows: rows });
          Logger.info('[import] chunk ' + (ci + 1) + '/' + totalChunks + ' traité (bulk ' + rows.length + ')');

          if (bulkRpc.error) {
            importError = (bulkRpc.error && bulkRpc.error.message) || 'Erreur inconnue';
            break;
          }
          if (bulkRpc.data && bulkRpc.data.success === false) {
            importError = (bulkRpc.data.error) || 'Erreur inconnue';
            break;
          }

          if (ci < totalChunks - 1) {
            await new Promise(function (r) { setTimeout(r, CHUNK_DELAY_MS); });
          }
        }

        if (importError) {
          showToast('❌ Échec import session: ' + importError, 'error');
          e.target.value = '';
          return;
        }

        await refreshSessionsFromSupabase();
      }
      
      // Importer les stats actuelles si elles existent
      if (data.currentStats) {
        const sanitizedStats = {
          ...data.currentStats,
          currentRank: sanitizeHTML(data.currentStats.currentRank || ''),
          note: sanitizeHTML(data.currentStats.note || '')
        };
        
        SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, sanitizedStats);
      }
      
      // Importer les événements si présents
      if (data.events && Array.isArray(data.events) && data.events.length > 0) {
        if (typeof saveEvents === 'function') {
          saveEvents(data.events);
        }
      }
      
      // Recharger l'interface
      loadCurrentStats();
      renderHistory();
      if (typeof window.maybeRefreshProgression === 'function') window.maybeRefreshProgression();
      startSessionTimer();
      
      // Recharger les événements si fonction disponible
      if (typeof updateEventsDisplay === 'function') {
        updateEventsDisplay();
      }
      
      showToast('✅ Données importées avec succès !', "success");
      
    } catch (error) {
      Logger.error('Erreur lors de l\'import:', error);
      showToast("❌ Erreur : Fichier JSON invalide ou corrompu", "error");
    }
    
    e.target.value = '';
  };
  
  reader.onerror = function() {
    showToast("❌ Erreur lors de la lecture du fichier", "error");
    e.target.value = '';
  };
  
  reader.readAsText(file);
}

async function saveBaselineFromScan(scanData) {
  if (!scanData || typeof scanData !== 'object') return { ok: false, error: 'Données invalides' };
  // Ne jamais créer une deuxième baseline pour un même couple (player_id, player_server) :
  // garder uniquement la toute première (premier scan) pour ce joueur et ce serveur.
  if (typeof getSessionsAll === 'function') {
    var allSessions = getSessionsAll();
    var pid = scanData.player_id || null;
    var pserver = scanData.server || null;
    if (allSessions.some(function (s) { return s.is_baseline === true && (s.player_id || null) === pid && (s.player_server || null) === pserver; })) {
      return { ok: true };
    }
  }
  const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  const now = Date.now();
  const sessionDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const honor = scanData.initial_honor != null ? Number(scanData.initial_honor) : 0;
  const xp = scanData.initial_xp != null ? Number(scanData.initial_xp) : 0;
  const rankPoints = scanData.initial_rank_points != null ? Number(scanData.initial_rank_points) : 0;
  const nextRankPoints = scanData.next_rank_points != null ? Number(scanData.next_rank_points) : rankPoints;
  const currentRank = (scanData.initial_rank || '').toString().trim();
  const pRow = {
    local_id: 'baseline-' + now,
    // Envoi en String pour éviter la perte de précision JS (Number.MAX_SAFE_INTEGER).
    // Les RPCs lisent via ->> (TEXT) puis ::BIGINT.
    honor: String(honor),
    xp: String(xp),
    rank_points: String(rankPoints),
    next_rank_points: String(nextRankPoints || 0),
    current_rank: currentRank,
    note: 'Base (scan inscription)',
    session_date: sessionDate,
    session_timestamp: now,
    is_baseline: true,
    player_id: scanData.player_id || null,
    player_server: scanData.server || null,
    player_pseudo: scanData.game_pseudo || null
  };
  const { data: rpcData, error: rpcError } = await supabase.rpc('insert_user_session_secure', { p_row: pRow });
  if (rpcError) {
    Logger.error('[sessions] saveBaselineFromScan:', rpcError.message);
    return { ok: false, error: rpcError.message };
  }
  if (rpcData && rpcData.success === false) {
    Logger.error('[sessions] saveBaselineFromScan:', rpcData.error || 'Erreur RPC');
    return { ok: false, error: rpcData.error || 'Erreur RPC' };
  }
  return { ok: true };
}

window.saveBaselineFromScan = saveBaselineFromScan;

// Make functions globally available
window.deleteSession = deleteSession;
window.loadSession = loadSession;
window.loadLastSessionIntoForm = loadLastSessionIntoForm;
window.saveBaselineSession = saveBaselineSession;

