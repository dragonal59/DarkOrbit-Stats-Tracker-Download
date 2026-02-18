// ==========================================
// MODULE: SESSIONS MANAGEMENT
// ==========================================

/**
 * Enregistre le seuil de départ (baseline) - modal premier lancement.
 * Ne crée pas de baseline si une existe déjà (ex. depuis l'inscription).
 */
function saveBaselineSession(stats) {
  const sessions = getSessions();
  const hasBaseline = sessions.some(function(s) { return s.is_baseline === true; });
  if (hasBaseline) {
    if (typeof showToast === 'function') showToast('Un seuil de référence existe déjà.', 'info');
    return;
  }
  const now = Date.now();
  const session = {
    id: 'baseline-' + now,
    date: new Date().toLocaleString('fr-FR'),
    honor: stats.honor,
    xp: stats.xp,
    rankPoints: stats.rankPoints,
    nextRankPoints: stats.nextRankPoints || stats.rankPoints,
    currentRank: stats.currentRank,
    note: 'Seuil de départ',
    timestamp: now,
    is_baseline: true
  };

  const validation = validateSession(session);
  if (!validation.valid) {
    showToast(`❌ Erreur : ${validation.error}`, "error");
    return;
  }

  sessions.push(validation.session);
  const result = SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, sessions);
  if (!result.success) {
    sessions.pop();
    showToast("❌ Échec de la sauvegarde", "error");
    return;
  }

  // Enregistrer aussi les stats actuelles pour que le formulaire principal soit prérempli (évite de retaper)
  SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, {
    honor: stats.honor,
    xp: stats.xp,
    rankPoints: stats.rankPoints,
    nextRankPoints: stats.nextRankPoints != null ? stats.nextRankPoints : stats.rankPoints,
    currentRank: stats.currentRank,
    note: '',
    timestamp: Date.now()
  });

  if (typeof DataSync !== 'undefined' && DataSync.queueSync) DataSync.queueSync();
}

function saveSession() {
  const stats = getCurrentStats();
  
  if (!stats.currentRank || stats.honor === 0) {
    showToast("Veuillez remplir au moins le grade et les points d'honneur", "warning");
    return;
  }
  
  const sessions = getSessions();
  const now = Date.now();
  const session = {
    id: now,
    date: new Date().toLocaleString('fr-FR'),
    honor: stats.honor,
    xp: stats.xp,
    rankPoints: stats.rankPoints,
    nextRankPoints: stats.nextRankPoints,
    currentRank: stats.currentRank,
    note: stats.note,
    timestamp: now,
    is_baseline: false
  };
  
  const validation = validateSession(session);
  if (!validation.valid) {
    showToast(`❌ Erreur de validation : ${validation.error}`, "error");
    return;
  }
  
  sessions.push(validation.session);
  const result = SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, sessions);
  
  if (result.success) {
    showToast("✅ Session sauvegardée !", "success");
    if (typeof playSound === 'function') playSound('success');
    if (typeof celebrateSuccess === 'function') celebrateSuccess('session');
  } else {
    sessions.pop();
    showToast("❌ Échec de la sauvegarde", "error");
    return;
  }
  
  saveCurrentStats();
  renderHistory();
  updateProgressionTab();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  startSessionTimer();
  
  if (typeof updateStreakDisplay === 'function') updateStreakDisplay();
  if (typeof DataSync !== 'undefined' && DataSync.queueSync) DataSync.queueSync();
}

function getSessions() {
  const raw = SafeStorage.get(CONFIG.STORAGE_KEYS.SESSIONS, []);
  return Array.isArray(raw) ? raw : [];
}

function deleteSession(id) {
  const sessions = getSessions();
  const sessionToDelete = sessions.find(s => String(s.id) === String(id));
  
  if (!sessionToDelete) {
    showToast("❌ Session introuvable", "error");
    return;
  }
  
  // Sauvegarder pour undo
  if (typeof ActionHistory !== 'undefined') {
    ActionHistory.push({
      type: 'session_delete',
      data: { session: JSON.parse(JSON.stringify(sessionToDelete)) }
    });
  }
  
  const filtered = sessions.filter(s => String(s.id) !== String(id));
  
  const result = SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, filtered);
  if (result.success && filtered.length === 0) {
    if (typeof localStorage !== 'undefined') localStorage.setItem('darkOrbitSessionsCleared', '1');
    if (typeof UnifiedStorage !== 'undefined' && typeof UnifiedStorage.invalidateCache === 'function') {
      UnifiedStorage.invalidateCache(CONFIG.STORAGE_KEYS.SESSIONS);
    }
  }
  if (result.success) {
    showToast("Session supprimée (Ctrl+Z pour annuler)", "success");
  } else {
    showToast("❌ Erreur lors de la suppression", "error");
    return;
  }
  
  renderHistory();
  updateProgressionTab();
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  startSessionTimer();
}

function loadSession(id) {
  const sessions = getSessions();
  const session = sessions.find(s => String(s.id) === String(id));
  const selected = document.getElementById("selected");
  
  if (!session) return;
  
  const fmt = (typeof window !== 'undefined' && typeof window.numFormat === 'function') ? window.numFormat : function(n) { return Number(n).toLocaleString("en-US"); };
  document.getElementById("honor").value = session.honor != null && session.honor !== '' ? fmt(session.honor) : '';
  document.getElementById("xp").value = session.xp != null && session.xp !== '' ? fmt(session.xp) : '';
  document.getElementById("rankPoints").value = session.rankPoints != null && session.rankPoints !== '' ? fmt(session.rankPoints) : '';
  document.getElementById("nextRankPoints").value = session.nextRankPoints != null && session.nextRankPoints !== '' ? fmt(session.nextRankPoints) : '';
  document.getElementById("sessionNote").value = session.note || '';
  
  if (session.currentRank) {
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

async function clearHistory() {
  var ok = false;
  if (typeof ModernConfirm !== 'undefined' && ModernConfirm.show) {
    ok = await ModernConfirm.show({ title: 'Effacer l\'historique', message: "Êtes-vous sûr de vouloir supprimer tout l'historique ?", confirmText: 'Supprimer', cancelText: 'Annuler', type: 'warning' });
  } else {
    ok = confirm("Êtes-vous sûr de vouloir supprimer tout l'historique ?");
  }
  if (!ok) return;

  try {
    if (typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' && typeof getSupabaseClient === 'function') {
      try {
        const user = await AuthManager.getCurrentUser();
        if (user && user.id) {
          const supabase = getSupabaseClient();
          await supabase.from('user_sessions').delete().eq('user_id', user.id);
        }
      } catch (authErr) {
        console.warn('clearHistory: Supabase delete skipped', authErr);
      }
    }

    SafeStorage.remove(CONFIG.STORAGE_KEYS.SESSIONS);
    if (typeof localStorage !== 'undefined') localStorage.setItem('darkOrbitSessionsCleared', '1');
    if (typeof UnifiedStorage !== 'undefined' && typeof UnifiedStorage.invalidateCache === 'function') {
      UnifiedStorage.invalidateCache(CONFIG.STORAGE_KEYS.SESSIONS);
    }
    var sessionCount = typeof getSessions === 'function' ? getSessions().length : 0;
    if (typeof setAppAccessFromSessions === 'function') setAppAccessFromSessions(sessionCount > 0 ? sessionCount : 1);

    if (typeof renderHistory === 'function') renderHistory();
    if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
    if (typeof updateProgressionTab === 'function') updateProgressionTab();
    if (typeof startSessionTimer === 'function') startSessionTimer();
    if (typeof showToast === 'function') showToast("Historique effacé", "success");
    if (typeof setAppAccessFromSessions === 'function') setAppAccessFromSessions(1);
    if (typeof initBaselineSetup === 'function') {
      requestAnimationFrame(function () { initBaselineSetup(true); });
    }
    if (typeof DataSync !== 'undefined' && DataSync.queueSync) DataSync.queueSync();
  } catch (e) {
    console.error('clearHistory error:', e);
    if (typeof showToast === 'function') showToast("❌ Erreur lors de l'effacement de l'historique", "error");
  }
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
  
  reader.onload = function(event) {
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
            console.error('Import errors:', validationResults.errors);
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
      
      let confirmMessage = 'Voulez-vous importer ces données ?\n\n⚠️ Cela écrasera vos données actuelles !\n\n';
      
      if (sessionsCount > 0) {
        confirmMessage += `📊 Sessions valides : ${sessionsCount}\n`;
        if (skippedCount > 0) {
          confirmMessage += `⚠️ Sessions ignorées (invalides) : ${skippedCount}\n`;
        }
      }
      
      if (eventsCount > 0) {
        confirmMessage += `📅 Événements : ${eventsCount}\n`;
      }
      
      if (data.currentStats) {
        confirmMessage += '✅ Stats actuelles : Oui\n';
      }
      
      if (data.exportDate) {
        confirmMessage += `\n📅 Exporté le : ${data.exportDate}`;
      }
      
      if (!confirm(confirmMessage)) {
        showToast("Import annulé", "warning");
        e.target.value = '';
        return;
      }
      
      // Importer les sessions si elles existent
      if (validationResults.sessions && validationResults.sessions.length > 0) {
        const result = SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, validationResults.sessions);
        
        if (!result.success) {
          showToast("❌ Échec de l'import des sessions", "error");
          e.target.value = '';
          return;
        }
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
      updateProgressionTab();
      startSessionTimer();
      
      // Recharger les événements si fonction disponible
      if (typeof updateEventsDisplay === 'function') {
        updateEventsDisplay();
      }
      
      showToast('✅ Données importées avec succès !', "success");
      
    } catch (error) {
      console.error('Erreur lors de l\'import:', error);
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

/**
 * Réinitialise le seuil de départ - supprime la baseline et réaffiche la modal
 */
async function resetBaseline() {
  var ok = false;
  if (typeof ModernConfirm !== 'undefined' && ModernConfirm.show) {
    ok = await ModernConfirm.show({ title: 'Réinitialiser le seuil', message: 'Réinitialiser le seuil de départ ? Vous devrez ressaisir vos stats actuelles.', confirmText: 'Réinitialiser', cancelText: 'Annuler', type: 'warning' });
  } else {
    ok = confirm('Réinitialiser le seuil de départ ? Vous devrez ressaisir vos stats actuelles.');
  }
  if (!ok) return;

  const sessions = getSessions().filter(s => !s.is_baseline);
  const result = SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, sessions);

  if (result.success) {
    showToast('Seuil réinitialisé', 'success');
    renderHistory();
    updateProgressionTab();
    if (typeof initBaselineSetup === 'function') initBaselineSetup(true);
  } else {
    showToast('❌ Erreur', 'error');
  }
}

// Make functions globally available
window.deleteSession = deleteSession;
window.loadSession = loadSession;
window.loadLastSessionIntoForm = loadLastSessionIntoForm;
window.resetBaseline = resetBaseline;
window.saveBaselineSession = saveBaselineSession;

console.log('💾 Module Sessions chargé');