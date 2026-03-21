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
        if (action.data.previous) {
          var h = document.getElementById('honor'); if (h) h.value = action.data.previous.honor || '';
          var x = document.getElementById('xp'); if (x) x.value = action.data.previous.xp || '';
          var r = document.getElementById('rankPoints'); if (r) r.value = action.data.previous.rankPoints || '';
          var n = document.getElementById('nextRankPoints'); if (n) n.value = action.data.previous.nextRankPoints || '';
          if (typeof saveCurrentStats === 'function') saveCurrentStats();
        }
        break;
        
      case 'session_delete':
        if (action.data.session && typeof restoreSessionToSupabase === 'function') {
          restoreSessionToSupabase(action.data.session).then(function (ok) {
            if (ok && typeof renderHistory === 'function') { renderHistory(); updateProgressionTab(); }
          });
        }
        break;
      case 'session_save':
        if (action.data.sessionId && typeof deleteSession === 'function') {
          deleteSession(action.data.sessionId).then(function () {});
        }
        break;
    }
  },
  
  // Appliquer un état (pour redo)
  applyState(action) {
    switch(action.type) {
      case 'stats_change':
        if (action.data.current) {
          var h2 = document.getElementById('honor'); if (h2) h2.value = action.data.current.honor || '';
          var x2 = document.getElementById('xp'); if (x2) x2.value = action.data.current.xp || '';
          var r2 = document.getElementById('rankPoints'); if (r2) r2.value = action.data.current.rankPoints || '';
          var n2 = document.getElementById('nextRankPoints'); if (n2) n2.value = action.data.current.nextRankPoints || '';
          if (typeof saveCurrentStats === 'function') saveCurrentStats();
        }
        break;
        
      case 'session_delete':
        if (action.data.session && action.data.session.id && typeof deleteSession === 'function') {
          deleteSession(action.data.session.id).then(function () {});
        }
        break;
      case 'session_save':
        if (action.data.session && typeof restoreSessionToSupabase === 'function') {
          restoreSessionToSupabase(action.data.session).then(function (ok) {
            if (ok && typeof renderHistory === 'function') { renderHistory(); updateProgressionTab(); }
          });
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
  _keydownHandler: null,

  init() {
    // Retrait de l'ancienne référence avant ré-enregistrement pour éviter
    // l'accumulation si init() est appelé plusieurs fois.
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
    }
    this._keydownHandler = (e) => this.handleKeydown(e);
    document.addEventListener('keydown', this._keydownHandler);
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
    
    // Escape : Fermer les modals
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal[style*="flex"], .modal[style*="block"]');
      modals.forEach(modal => {
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

// showShortcutsHelp : défini uniquement dans shortcuts-help-modal.js (version finale)

