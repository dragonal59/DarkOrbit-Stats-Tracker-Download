// ==========================================
// DARKORBIT STATS TRACKER PRO
// Point d'entrée principal - Architecture Modulaire
// ==========================================
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

// ==========================================
// INITIALISATION DES EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DarkOrbit Stats Tracker Pro - Initialisation...');
  
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

  // ========== ACCÈS APP : aucun accès sans au moins une session (sauf utilisateur Supabase connecté sans session = nouveau compte, afficher pour baseline) ==========
  const sessions = typeof getSessions === 'function' ? getSessions() : [];
  const effectiveCount = sessions.length > 0 ? sessions.length : (window.__supabaseAuthenticated ? 1 : 0);
  if (typeof setAppAccessFromSessions === 'function') setAppAccessFromSessions(effectiveCount);
  if (sessions.length === 0 && typeof initBaselineSetup === 'function') initBaselineSetup(true);
  
  // ========== DÉMARRER LE TIMER ==========
  startSessionTimer();
  
  // ========== BOUTON RELOAD ==========
  const reloadBtn = document.getElementById('reloadAppBtn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      if (typeof localStorage !== 'undefined') localStorage.setItem('pendingReloadToast', '1');
      location.reload();
    });
  }
  
  console.log('✅ Application initialisée avec succès !');
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
  
  // Sauvegarder la note automatiquement (si option activée)
  const noteField = document.getElementById('sessionNote');
  if (noteField) {
    noteField.addEventListener('input', debounce(() => {
      if (typeof getSetting === 'function' && getSetting('autoSaveEnabled')) {
        saveCurrentStats();
      }
    }, CONFIG.UI.DEBOUNCE_DELAY));
  }
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
      document.getElementById('honor').value = '';
      document.getElementById('xp').value = '';
      document.getElementById('rankPoints').value = '';
      document.getElementById('nextRankPoints').value = '';
      document.getElementById('sessionNote').value = '';
      document.getElementById('currentLevel').value = '';
      
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
  
  // Bouton Effacer Historique
  const clearHistoryBtn = document.getElementById('clearHistory');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', function () {
      clearHistory().catch(function () {});
    });
  }
  
  // Bouton Hard Reset
  const hardResetBtn = document.getElementById('hardReset');
  if (hardResetBtn) {
    hardResetBtn.addEventListener('click', async () => { await hardReset(); });
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
if (typeof window.addNoteTemplate === 'undefined') {
  window.addNoteTemplate = addNoteTemplate;
}
if (typeof window.clearNote === 'undefined') {
  window.clearNote = clearNote;
}
if (typeof window.deleteSession === 'undefined') {
  window.deleteSession = deleteSession;
}
if (typeof window.loadSession === 'undefined') {
  window.loadSession = loadSession;
}
if (typeof window.toggleNote === 'undefined') {
  window.toggleNote = toggleNote;
}

console.log('📦 Script principal (modulaire) chargé');
