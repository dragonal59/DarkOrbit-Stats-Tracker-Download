// ==========================================
// AMÉLIORATIONS UI - PHASE 3
// ==========================================

// ==========================================
// 1. INDICATEURS DE CHARGEMENT (Bug #10)
// ==========================================

const UI_Z_INDEX = {
  fab: 1000,
  overlay: 10000,
  modal: 10001,
  tooltip: 10002
};

const LoadingIndicator = {
  // Créer un spinner
  create(message = 'Chargement...') {
    const existing = document.getElementById('globalLoadingIndicator');
    if (existing) {
      this.updateMessage(message);
      return existing;
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'globalLoadingIndicator';
    overlay.innerHTML = `
      <div class="loading-overlay">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-message">${message}</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    return overlay;
  },
  
  // Mettre à jour le message
  updateMessage(message) {
    const messageEl = document.querySelector('#globalLoadingIndicator .loading-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
  },
  
  // Retirer le spinner
  remove() {
    const indicator = document.getElementById('globalLoadingIndicator');
    if (indicator) {
      indicator.remove();
    }
  },
  
  // Montrer pendant une action async
  async during(asyncFunction, message = 'Chargement...') {
    this.create(message);
    try {
      const result = await asyncFunction();
      return result;
    } finally {
      this.remove();
    }
  }
};

// Ajouter les styles CSS pour le loading
const STYLE_ID_LOADING = 'ui-improvements-styles-1';
if (!document.getElementById(STYLE_ID_LOADING)) {
  const loadingStyles = document.createElement('style');
  loadingStyles.id = STYLE_ID_LOADING;
  loadingStyles.textContent = `
  #globalLoadingIndicator {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: ${UI_Z_INDEX.overlay};
  }
  
  .loading-overlay {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
    animation: fadeIn 0.2s ease;
  }
  
  .loading-content {
    background: var(--card-bg, #2a2a3e);
    padding: 30px 40px;
    border-radius: 12px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }
  
  .loading-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-top-color: var(--primary-color, #38bdf8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 15px;
  }
  
  .loading-message {
    color: var(--text-primary, #fff);
    font-size: 16px;
    font-weight: 500;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
`;
  document.head.appendChild(loadingStyles);
}

// ==========================================
// 2. MODAL DE CONFIRMATION MODERNE (Bug #13)
// ==========================================

const ModernConfirm = {
  show(options = {}) {
    return new Promise((resolve) => {
      const {
        title = 'Confirmation',
        message = 'Êtes-vous sûr ?',
        confirmText = 'Confirmer',
        cancelText = 'Annuler',
        type = 'warning' // warning, error, info, success
      } = options;
      
      // Retirer l'ancienne modal si elle existe
      const existing = document.getElementById('modernConfirmModal');
      if (existing) existing.remove();
      
      const modal = document.createElement('div');
      modal.id = 'modernConfirmModal';
      modal.innerHTML = `
        <div class="modern-confirm-overlay">
          <div class="modern-confirm-content ${type}">
            <div class="modern-confirm-icon">
              ${this.getIcon(type)}
            </div>
            <h3 class="modern-confirm-title">${title}</h3>
            <p class="modern-confirm-message">${message}</p>
            <div class="modern-confirm-actions">
              <button class="modern-confirm-btn cancel">${cancelText}</button>
              <button class="modern-confirm-btn confirm ${type}">${confirmText}</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Animation d'entrée
      setTimeout(() => {
        modal.querySelector('.modern-confirm-content').style.transform = 'scale(1)';
        modal.querySelector('.modern-confirm-content').style.opacity = '1';
      }, 10);
      
      // Event listeners
      const confirmBtn = modal.querySelector('.confirm');
      const cancelBtn = modal.querySelector('.cancel');
      
      confirmBtn.addEventListener('click', () => {
        this.close(modal);
        resolve(true);
      });
      
      cancelBtn.addEventListener('click', () => {
        this.close(modal);
        resolve(false);
      });
      
      // Cliquer sur overlay = annuler
      modal.querySelector('.modern-confirm-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
          this.close(modal);
          resolve(false);
        }
      });
      
      // ESC = annuler
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          this.close(modal);
          resolve(false);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  },
  
  getIcon(type) {
    const icons = {
      warning: '⚠️',
      error: '🚨',
      info: 'ℹ️',
      success: '✅'
    };
    return `<span style="font-size: 48px;">${icons[type] || icons.warning}</span>`;
  },
  
  close(modal) {
    const overlay = modal.querySelector('.modern-confirm-overlay');
    const content = modal.querySelector('.modern-confirm-content');
    content.style.transform = 'scale(0.9)';
    content.style.opacity = '0';
    if (overlay) overlay.classList.add('closing');
    setTimeout(() => modal.remove(), 200);
  }
};

// Ajouter les styles pour la modal
const STYLE_ID_CONFIRM = 'ui-improvements-styles-2';
if (!document.getElementById(STYLE_ID_CONFIRM)) {
  const confirmStyles = document.createElement('style');
  confirmStyles.id = STYLE_ID_CONFIRM;
  confirmStyles.textContent = `
  #modernConfirmModal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: ${UI_Z_INDEX.modal};
  }
  
  .modern-confirm-overlay {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
    animation: fadeIn 0.2s ease;
    transition: opacity 0.2s ease;
  }

  .modern-confirm-overlay.closing {
    opacity: 0;
  }
  
  .modern-confirm-content {
    background: var(--card-bg, #2a2a3e);
    padding: 30px;
    border-radius: 16px;
    max-width: 400px;
    width: 90%;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    transform: scale(0.9);
    opacity: 0;
    transition: all 0.2s ease;
  }
  
  .modern-confirm-icon {
    margin-bottom: 15px;
  }
  
  .modern-confirm-title {
    color: var(--text-primary, #fff);
    font-size: 22px;
    font-weight: 600;
    margin: 0 0 10px 0;
  }
  
  .modern-confirm-message {
    color: var(--text-secondary, #b0b0b0);
    font-size: 15px;
    margin: 0 0 25px 0;
    line-height: 1.5;
  }
  
  .modern-confirm-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
  }
  
  .modern-confirm-btn {
    padding: 12px 24px;
    border-radius: 8px;
    border: none;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 100px;
  }
  
  .modern-confirm-btn.cancel {
    background: var(--bg-secondary, #3a3a4e);
    color: var(--text-primary, #fff);
  }
  
  .modern-confirm-btn.cancel:hover {
    background: var(--bg-tertiary, #4a4a5e);
  }
  
  .modern-confirm-btn.confirm {
    background: var(--primary-color, #38bdf8);
    color: white;
  }
  
  .modern-confirm-btn.confirm.error {
    background: #ef4444;
  }
  
  .modern-confirm-btn.confirm.warning {
    background: #f59e0b;
  }
  
  .modern-confirm-btn.confirm.success {
    background: #22c55e;
  }
  
  .modern-confirm-btn.confirm:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }
`;
  document.head.appendChild(confirmStyles);
}

// ==========================================
// 3. BOUTON AIDE RACCOURCIS (Bug #12)
// ==========================================

function createShortcutsHelpButton() {
  // Vérifier si le bouton existe déjà
  if (document.getElementById('shortcutsHelpBtn')) {
    return;
  }
  
  const button = document.createElement('button');
  button.id = 'shortcutsHelpBtn';
  button.className = 'shortcuts-help-btn';
  button.innerHTML = '⌨️';
  button.title = 'Raccourcis clavier (?)';
  
  button.addEventListener('click', () => {
    // Utiliser la fonction globale si elle existe
    if (typeof window.showShortcutsHelp === 'function') {
      window.showShortcutsHelp();
    } else {
      alert('Fonction showShortcutsHelp non trouvée. Assurez-vous que shortcuts-help-modal.js est chargé.');
    }
  });
  
  document.body.appendChild(button);
}

// Styles pour le bouton
const STYLE_ID_SHORTCUTS = 'ui-improvements-styles-3';
if (!document.getElementById(STYLE_ID_SHORTCUTS)) {
  const shortcutsButtonStyles = document.createElement('style');
  shortcutsButtonStyles.id = STYLE_ID_SHORTCUTS;
  shortcutsButtonStyles.textContent = `
  .shortcuts-help-btn {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--primary-color, #38bdf8);
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(56, 189, 248, 0.3);
    transition: all 0.3s ease;
    z-index: ${UI_Z_INDEX.fab};
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .shortcuts-help-btn:hover {
    transform: translateY(-2px) scale(1.05);
    box-shadow: 0 6px 20px rgba(56, 189, 248, 0.4);
  }
  
  .shortcuts-help-btn:active {
    transform: translateY(0) scale(0.98);
  }
`;
  document.head.appendChild(shortcutsButtonStyles);
}

// ==========================================
// INITIALISATION
// ==========================================

// Créer le bouton dès que le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    createShortcutsHelpButton();
  });
} else {
  createShortcutsHelpButton();
}

// Export pour utilisation externe
window.LoadingIndicator = LoadingIndicator;
window.ModernConfirm = ModernConfirm;