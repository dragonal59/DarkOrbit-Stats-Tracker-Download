// ==========================================
// DARKORBIT STATS TRACKER PRO
// Point d'entrée principal - Architecture Modulaire
// ==========================================

window.doReloadApp = function () {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('pendingReloadToast', '1');
    if (window.electronAPI && typeof window.electronAPI.reload === 'function') {
      window.electronAPI.reload();
    } else {
      location.reload();
    }
  } catch (e) {
    location.reload();
  }
};
// 
// Ce fichier initialise l'application et connecte tous les modules.
// Les fonctions sont définies dans leurs modules respectifs :
// - config.js        : Configuration et constantes
// - utils.js         : Fonctions utilitaires
// - unified-storage.js : Système de stockage
// - stats.js         : Gestion des statistiques
// - sessions.js      : Gestion des sessions
// - history.js       : Affichage de l'historique
// - progression.js   : Onglet progression
// - charts.js        : Graphiques (Chart.js)
// - comparaison.js   : Comparaison de sessions
// - timer.js         : Timer de session 24h
// - tabs.js          : Navigation par onglets
// - theme.js         : Thèmes et modes d'affichage
// - dropdown.js      : Menu déroulant des grades
// - reset.js         : Hard reset
// ==========================================

// ==========================================
// VÉRIFICATION AU DÉMARRAGE
// ==========================================

// Vérifier que localStorage est disponible
if (typeof isLocalStorageAvailable === 'function' && !isLocalStorageAvailable()) {
  alert("⚠️ Le stockage local n'est pas disponible. L'application ne pourra pas sauvegarder vos données.\n\nVérifiez que :\n- Vous n'êtes pas en navigation privée\n- Les cookies sont activés\n- Votre navigateur supporte localStorage");
}

// ==========================================
// ACCÈS APP : masquer le contenu principal si aucune session (obligation de saisir le seuil)
// ==========================================
function setAppAccessFromSessions(sessionCount) {
  const mainContent = document.querySelector('.main-content');
  const aside = document.querySelector('aside.booster-sidebar');
  const hasSession = sessionCount > 0;
  if (mainContent) mainContent.style.display = hasSession ? '' : 'none';
  if (aside) aside.style.display = hasSession ? '' : 'none';
}
window.setAppAccessFromSessions = setAppAccessFromSessions;

async function updateActiveAccountDisplay() {
  var el = document.getElementById('headerActiveAccount');
  if (!el) return;
  try {
    var active = (typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerInfo) ? await UserPreferencesAPI.getActivePlayerInfo() : null;
    if (!active && typeof window.electronPlayerStatsCredentials !== 'undefined' && typeof window.electronPlayerStatsCredentials.getActive === 'function') {
      active = await window.electronPlayerStatsCredentials.getActive();
      if (active) active = { player_id: active.player_id, player_server: active.player_server, player_pseudo: active.player_pseudo || active.username };
    }
    if (active && (active.player_pseudo || active.player_id)) {
      var server = (active.player_server || '').toUpperCase();
      el.textContent = 'Connecté : ' + (active.player_pseudo || active.player_id || '—') + (server ? ' — ' + server : '');
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  } catch (_) {
    el.style.display = 'none';
  }
}
window.updateActiveAccountDisplay = updateActiveAccountDisplay;

// ==========================================
// INITIALISATION DES EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof window.electronApp?.getVersion === 'function') {
    try {
      const v = await window.electronApp.getVersion();
      document.querySelectorAll('.app-version').forEach(el => { el.textContent = v; });
    } catch (e) {}
  }
  if (typeof window.buildManualStatsDropdown === 'function') window.buildManualStatsDropdown();
  // ========== NAVIGATION ==========
  initTabNavigation();
  
  // ========== DROPDOWN GRADES ==========
  initDropdown();
  
  // ========== CHAMPS DE SAISIE ==========
  initInputFields();
  
  // ========== BOUTONS PRINCIPAUX ==========
  initMainButtons();
  
  // ========== IMPORT/EXPORT ==========
  initImportExport();
  
  // ========== THÈME ET AFFICHAGE ==========
  loadTheme();
  loadViewMode();
  if (typeof localStorage !== 'undefined' && localStorage.getItem('pendingReloadToast')) {
    localStorage.removeItem('pendingReloadToast');
    if (typeof showToast === 'function') showToast('Actualisation réussie', 'success');
  }
  
  // ========== CHARGER LES DONNÉES ==========
  loadCurrentStats();
  renderHistory();
  updateProgressionTab();
  if (typeof window.updateActiveAccountDisplay === 'function') window.updateActiveAccountDisplay();

  // ========== ACCÈS APP : aucun accès sans au moins une session (sauf utilisateur Supabase connecté sans session = nouveau compte, afficher pour baseline) ==========
  const sessions = typeof getSessions === 'function' ? getSessions() : [];
  const effectiveCount = sessions.length > 0 ? sessions.length : (window.__supabaseAuthenticated ? 1 : 0);
  if (typeof setAppAccessFromSessions === 'function') setAppAccessFromSessions(effectiveCount);
  const hasPendingScan = !!(typeof localStorage !== 'undefined' && localStorage.getItem('pending_baseline_scan'));
  
  // ========== DÉMARRER LE TIMER ==========
  startSessionTimer();
  
  // ========== BOUTON RELOAD ==========
  var reloadBtn = document.getElementById('reloadAppBtn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('pendingReloadToast', '1');
        if (window.electronAPI && typeof window.electronAPI.reload === 'function') {
          window.electronAPI.reload();
        } else {
          location.reload();
        }
      } catch (err) {
        location.reload();
      }
    });
  }

  // ========== BOUTON TOUJOURS AU PREMIER PLAN ==========
  var alwaysBtn = document.getElementById('alwaysOnTopBtn');
  var ALWAYS_KEY = 'alwaysOnTop';

  function applyAlwaysOnTopUI(enabled) {
    if (!alwaysBtn) return;
    if (enabled) {
      alwaysBtn.classList.add('always-on-top-active');
    } else {
      alwaysBtn.classList.remove('always-on-top-active');
    }
  }

  if (alwaysBtn) {
    var saved = false;
    try {
      if (typeof localStorage !== 'undefined') {
        var v = localStorage.getItem(ALWAYS_KEY);
        saved = v === '1' || v === 'true';
      }
    } catch (e) {}
    if (saved) {
      applyAlwaysOnTopUI(true);
      if (window.electronAPI && typeof window.electronAPI.toggleAlwaysOnTop === 'function') {
        window.electronAPI.toggleAlwaysOnTop(true);
      }
    }
    alwaysBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var next = !alwaysBtn.classList.contains('always-on-top-active');
      applyAlwaysOnTopUI(next);
      try {
        if (typeof localStorage !== 'undefined') {
          if (next) localStorage.setItem(ALWAYS_KEY, '1');
          else localStorage.removeItem(ALWAYS_KEY);
        }
      } catch (err) {}
      if (window.electronAPI && typeof window.electronAPI.toggleAlwaysOnTop === 'function') {
        window.electronAPI.toggleAlwaysOnTop(next);
      }
    });
  }

  if (window.electronAPI && typeof window.electronAPI.onAlwaysOnTopChanged === 'function') {
    window.electronAPI.onAlwaysOnTopChanged(function (state) {
      if (!alwaysBtn) return;
      var enabled = !!(state && state.enabled);
      applyAlwaysOnTopUI(enabled);
      try {
        if (typeof localStorage !== 'undefined') {
          if (enabled) localStorage.setItem(ALWAYS_KEY, '1');
          else localStorage.removeItem(ALWAYS_KEY);
        }
      } catch (e) {}
    });
  }

  // ========== SCRAPER IPC — sync locale après écriture Supabase directe ==========
  if (typeof window.electronScraper === 'object' && window.electronScraper.onRankingsUpdated) {
    window.electronScraper.onRankingsUpdated(async () => {
      try {
        // pull() invalide déjà le cache (IMPORTED_RANKINGS, etc.) et appelle window.refreshRanking()
        if (typeof DataSync !== 'undefined' && DataSync.pull) await DataSync.pull();
      } catch (e) {
        if (window.DEBUG) Logger.warn('[Script] Pull après rankings-updated:', e?.message || e);
      }
    });
  }

  // ========== NOTIFICATIONS WINDOWS — scraper terminé (SUPERADMIN) et planificateur (SUPERADMIN) ==========
  if (!window._scrapingNotificationListenersRegistered && typeof window.sendNotification === 'function') {
    window._scrapingNotificationListenersRegistered = true;
    if (window.electronScraper && window.electronScraper.onScrapingFinished) {
      window.electronScraper.onScrapingFinished((d) => {
        var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : '';
        if (badge !== 'SUPERADMIN') return;
        if (typeof getSetting !== 'function' || !getSetting('notificationsEnabled')) return;
        if (typeof currentHasFeature === 'function' && !currentHasFeature('notificationsWindows')) return;
        if (d && d.action === 'events_completed') {
          window.sendNotification('Scraper événements', 'Collecte des événements terminée.');
        } else if (d && d.action === 'statistics_completed') {
          window.sendNotification('Scraper classement & profils', 'Collecte classement et profils terminée.');
        }
      });
    }
    if (window.electronScheduler && window.electronScheduler.onStarted) {
      window.electronScheduler.onStarted(() => {
        var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : '';
        if (badge !== 'SUPERADMIN') return;
        if (typeof getSetting !== 'function' || !getSetting('notificationsEnabled')) return;
        if (typeof currentHasFeature === 'function' && !currentHasFeature('notificationsWindows')) return;
        window.sendNotification('Planificateur', 'Scraping automatique programmé démarré.');
      });
    }
    if (window.electronScheduler && window.electronScheduler.onFinished) {
      window.electronScheduler.onFinished(() => {
        var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : '';
        if (badge !== 'SUPERADMIN') return;
        if (typeof getSetting !== 'function' || !getSetting('notificationsEnabled')) return;
        if (typeof currentHasFeature === 'function' && !currentHasFeature('notificationsWindows')) return;
        window.sendNotification('Planificateur', 'Scraping automatique programmé terminé à 100 %.');
      });
    }
  }

});

// ==========================================
// INITIALISATION DES CHAMPS DE SAISIE
// ==========================================

function initInputFields() {
  // Formater et sauvegarder automatiquement les champs numériques
  ['honor', 'xp', 'rankPoints', 'nextRankPoints'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => formatAndSave(el));
    }
  });
  
}

// ==========================================
// INITIALISATION DES BOUTONS PRINCIPAUX
// ==========================================

function initMainButtons() {
  // Bouton Sauvegarder Session
  const saveBtn = document.getElementById('saveSession');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSession);
  }
  
  // Bouton Réinitialiser Stats
  const resetStatsBtn = document.getElementById('resetStats');
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener('click', () => {
      ['honor','xp','rankPoints','nextRankPoints','currentLevel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const selected = document.getElementById('selected');
      if (selected) {
        selected.innerHTML = '<span>Sélectionner votre grade actuel</span>';
      }
      saveCurrentStats();
      updateStatsDisplay();
      showToast('🔄 Formulaire réinitialisé', 'success');
    });
  }
  
  // Bouton Remplir depuis la dernière session
  const fillLastSessionBtn = document.getElementById('fillLastSession');
  if (fillLastSessionBtn) {
    fillLastSessionBtn.addEventListener('click', () => {
      if (typeof loadLastSessionIntoForm === 'function') {
        loadLastSessionIntoForm();
      }
    });
  }
  
  // Bouton Comparer Sessions
  const compareBtn = document.getElementById('compareBtn');
  if (compareBtn) {
    compareBtn.addEventListener('click', compareSessions);
  }
}

// ==========================================
// INITIALISATION IMPORT/EXPORT
// ==========================================

function initImportExport() {
  // Bouton Export
  const exportBtn = document.getElementById('exportData');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportData);
  }
  
  // Bouton Import (déclenche le file input)
  const importBtn = document.getElementById('importData');
  if (importBtn) {
    importBtn.addEventListener('click', importData);
  }
  
  // File input pour l'import
  const importFile = document.getElementById('importFile');
  if (importFile) {
    importFile.addEventListener('change', handleImportFile);
  }
}

// ==========================================
// GESTION DE LA VISIBILITÉ DE LA PAGE
// ==========================================

document.addEventListener('visibilitychange', function() {
  if (typeof isPageVisible !== 'undefined') {
    isPageVisible = !document.hidden;
    
    if (isPageVisible) {
      // Page visible: relancer timer si pas actif
      if (typeof timerInterval !== 'undefined' && !timerInterval) {
        startSessionTimer();
      }
    } else {
      // Page cachée: stopper timer (économie CPU)
      if (typeof stopSessionTimer === 'function') {
        stopSessionTimer();
      }
    }
  }
});

// ==========================================
// CLEANUP AU DÉCHARGEMENT
// ==========================================

window.addEventListener('beforeunload', () => {
  if (typeof stopSessionTimer === 'function') {
    stopSessionTimer();
  }
});

// ==========================================
// EXPORTS GLOBAUX (pour les onclick inline)
// ==========================================

// Ces fonctions sont déjà exportées dans leurs modules respectifs
// On les ré-exporte ici uniquement si elles ne sont pas déjà définies
if (typeof window.deleteSession === 'undefined') {
  window.deleteSession = deleteSession;
}
if (typeof window.loadSession === 'undefined') {
  window.loadSession = loadSession;
}
