// ==========================================
// MODULE: RACCOURCIS CLAVIER
// ==========================================

// Historique pour Undo/Redo
const ActionHistory = {
  history: [],
  redoStack: [],
  maxSize: 50,
  
  // Sauvegarder un état
  push(action) {
    this.history.push({
      type: action.type,
      data: JSON.parse(JSON.stringify(action.data)),
      timestamp: Date.now()
    });
    
    // Limiter la taille
    if (this.history.length > this.maxSize) {
      this.history.shift();
    }
    
    // Vider le redo stack quand on fait une nouvelle action
    this.redoStack = [];
  },
  
  // Annuler la dernière action
  undo() {
    if (this.history.length === 0) {
      showToast('⚠️ Rien à annuler', 'warning');
      return false;
    }
    
    const lastAction = this.history.pop();
    this.redoStack.push(lastAction);
    
    // Restaurer l'état précédent
    this.restoreState(lastAction);
    showToast('↩️ Action annulée', 'success');
    return true;
  },
  
  // Rétablir l'action annulée
  redo() {
    if (this.redoStack.length === 0) {
      showToast('⚠️ Rien à rétablir', 'warning');
      return false;
    }
    
    const action = this.redoStack.pop();
    this.history.push(action);
    
    // Réappliquer l'action
    this.applyState(action);
    showToast('↪️ Action rétablie', 'success');
    return true;
  },
  
  // Restaurer un état (pour undo)
  restoreState(action) {
    switch(action.type) {
      case 'stats_change':
        // Restaurer les stats précédentes
        if (action.data.previous) {
          document.getElementById('honor').value = action.data.previous.honor || '';
          document.getElementById('xp').value = action.data.previous.xp || '';
          document.getElementById('rankPoints').value = action.data.previous.rankPoints || '';
          document.getElementById('nextRankPoints').value = action.data.previous.nextRankPoints || '';
          if (typeof saveCurrentStats === 'function') saveCurrentStats();
        }
        break;
        
      case 'session_delete':
        // Restaurer la session supprimée
        if (action.data.session) {
          const sessions = getSessions();
          sessions.push(action.data.session);
          SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, sessions);
          if (typeof renderHistory === 'function') renderHistory();
          if (typeof updateProgressionTab === 'function') updateProgressionTab();
        }
        break;
        
      case 'session_save':
        // Annuler la sauvegarde (supprimer la dernière session)
        if (action.data.sessionId) {
          const sessions = getSessions();
          const index = sessions.findIndex(s => s.id === action.data.sessionId);
          if (index > -1) {
            sessions.splice(index, 1);
            SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, sessions);
            if (typeof renderHistory === 'function') renderHistory();
            if (typeof updateProgressionTab === 'function') updateProgressionTab();
          }
        }
        break;
    }
  },
  
  // Appliquer un état (pour redo)
  applyState(action) {
    switch(action.type) {
      case 'stats_change':
        if (action.data.current) {
          document.getElementById('honor').value = action.data.current.honor || '';
          document.getElementById('xp').value = action.data.current.xp || '';
          document.getElementById('rankPoints').value = action.data.current.rankPoints || '';
          document.getElementById('nextRankPoints').value = action.data.current.nextRankPoints || '';
          if (typeof saveCurrentStats === 'function') saveCurrentStats();
        }
        break;
        
      case 'session_delete':
        // Re-supprimer la session
        if (action.data.session) {
          const sessions = getSessions();
          const index = sessions.findIndex(s => s.id === action.data.session.id);
          if (index > -1) {
            sessions.splice(index, 1);
            SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, sessions);
            if (typeof renderHistory === 'function') renderHistory();
            if (typeof updateProgressionTab === 'function') updateProgressionTab();
          }
        }
        break;
        
      case 'session_save':
        // Re-sauvegarder la session
        if (action.data.session) {
          const sessions = getSessions();
          sessions.push(action.data.session);
          SafeStorage.set(CONFIG.STORAGE_KEYS.SESSIONS, sessions);
          if (typeof renderHistory === 'function') renderHistory();
          if (typeof updateProgressionTab === 'function') updateProgressionTab();
        }
        break;
    }
  }
};

// Exposer globalement
window.ActionHistory = ActionHistory;

// ==========================================
// GESTIONNAIRE DE RACCOURCIS
// ==========================================

const KeyboardShortcuts = {
  enabled: true,
  
  init() {
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    console.log('⌨️ Raccourcis clavier initialisés');
  },
  
  handleKeydown(e) {
    if (!this.enabled) return;
    
    // Ignorer si on est dans un input/textarea (sauf pour certains raccourcis)
    const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    
    // Ctrl + S : Sauvegarder
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      if (typeof saveSession === 'function') {
        saveSession();
      }
      return;
    }
    
    // Ctrl + Z : Annuler
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      ActionHistory.undo();
      return;
    }
    
    // Ctrl + Y ou Ctrl + Shift + Z : Rétablir
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
      e.preventDefault();
      ActionHistory.redo();
      return;
    }
    
    // Ctrl + E : Exporter
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      if (typeof exportData === 'function') {
        exportData();
      }
      return;
    }
    
    // Ne pas traiter les raccourcis de navigation si dans un input
    if (isInputFocused) return;
    
    // Ctrl + 1-5 : Navigation onglets
    if (e.ctrlKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
      e.preventDefault();
      const tabs = ['stats', 'progression', 'history', 'events', 'settings'];
      const tabIndex = parseInt(e.key) - 1;
      if (tabs[tabIndex] && typeof switchTab === 'function') {
        switchTab(tabs[tabIndex]);
      }
      return;
    }
    
    // Ctrl + H : Historique
    if (e.ctrlKey && e.key === 'h') {
      e.preventDefault();
      if (typeof switchTab === 'function') {
        switchTab('history');
      }
      return;
    }
    
    // Ctrl + P : Progression
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      if (typeof switchTab === 'function') {
        switchTab('progression');
      }
      return;
    }
    
    // Ctrl + Shift + T : Changer thème
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      if (typeof setTheme === 'function') {
        setTheme(newTheme);
        showToast(`🎨 Thème ${newTheme === 'dark' ? 'sombre' : 'clair'}`, 'success');
      }
      return;
    }
    
    // Ctrl + Shift + C : Mode compact/détaillé
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      const currentMode = document.documentElement.getAttribute('data-view-mode') || 'detailed';
      const newMode = currentMode === 'detailed' ? 'compact' : 'detailed';
      if (typeof setViewMode === 'function') {
        setViewMode(newMode);
        showToast(`📋 Mode ${newMode === 'detailed' ? 'détaillé' : 'compact'}`, 'success');
      }
      return;
    }
    
    // ? : Afficher l'aide
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      if (typeof showShortcutsHelp === 'function') {
        showShortcutsHelp();
      }
      return;
    }
    
    // Escape : Fermer les modals (sauf le modal baseline, obligatoire sans session)
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal[style*="flex"], .modal[style*="block"]');
      modals.forEach(modal => {
        if (modal.id === 'baselineSetupModal') return;
        modal.style.display = 'none';
      });
      return;
    }
  }
};

// ==========================================
// INITIALISATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  KeyboardShortcuts.init();
});

// Mettre à jour la modal d'aide avec tous les raccourcis
window.showShortcutsHelp = function() {
  const modal = document.createElement('div');
  modal.id = 'shortcutsHelpModal';
  modal.innerHTML = `
    <div class="shortcuts-help-overlay">
      <div class="shortcuts-help-content">
        <div class="shortcuts-help-header">
          <h2>⌨️ Raccourcis Clavier</h2>
          <button class="shortcuts-help-close" onclick="this.closest('#shortcutsHelpModal').remove()">✕</button>
        </div>
        
        <div class="shortcuts-help-body">
          <div class="shortcuts-category">
            <h3>💾 Actions</h3>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>S</kbd>
              <span>Sauvegarder la session</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>Z</kbd>
              <span>Annuler la dernière action</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>Y</kbd>
              <span>Rétablir l'action annulée</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>E</kbd>
              <span>Exporter les données</span>
            </div>
          </div>
          
          <div class="shortcuts-category">
            <h3>📑 Navigation</h3>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>1</kbd>
              <span>Onglet Statistiques</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>2</kbd>
              <span>Onglet Progression</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>3</kbd>
              <span>Onglet Historique</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>4</kbd>
              <span>Onglet Événements</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>5</kbd>
              <span>Onglet Paramètres</span>
            </div>
          </div>
          
          <div class="shortcuts-category">
            <h3>🎨 Affichage</h3>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>
              <span>Changer le thème</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>
              <span>Mode Compact/Détaillé</span>
            </div>
          </div>
          
          <div class="shortcuts-category">
            <h3>❓ Autres</h3>
            <div class="shortcut-item">
              <kbd>?</kbd>
              <span>Afficher cette aide</span>
            </div>
            <div class="shortcut-item">
              <kbd>Échap</kbd>
              <span>Fermer les fenêtres</span>
            </div>
          </div>
        </div>
        
        <div class="shortcuts-help-footer">
          <p>💡 Ces raccourcis fonctionnent partout sauf dans les champs de texte</p>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  setTimeout(() => {
    modal.querySelector('.shortcuts-help-content').style.transform = 'scale(1)';
    modal.querySelector('.shortcuts-help-content').style.opacity = '1';
  }, 10);
  
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  
  modal.querySelector('.shortcuts-help-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      modal.remove();
    }
  });
};

console.log('⌨️ Module Raccourcis Clavier chargé');
