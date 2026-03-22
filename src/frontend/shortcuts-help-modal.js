// ==========================================
// MODAL D'AIDE RACCOURCIS AMÉLIORÉE
// Amélioration de Bug #12
// ==========================================

// Override de la fonction showShortcutsHelp pour utiliser une belle modal
window.showShortcutsHelp = function() {
  
  const modal = document.createElement('div');
  modal.id = 'shortcutsHelpModal';
  modal.innerHTML = `
    <div class="shortcuts-help-overlay">
      <div class="shortcuts-help-content">
        <div class="shortcuts-help-header">
          <h2>⌨️ Raccourcis Clavier</h2>
          <button class="shortcuts-help-close">✕</button>
        </div>
        
        <div class="shortcuts-help-body">
          <div class="shortcuts-category">
            <h3>💾 Actions</h3>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>S</kbd>
              <span>Sauvegarder la session</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>E</kbd>
              <span>Exporter les données</span>
            </div>
          </div>
          
          <div class="shortcuts-category">
            <h3>📑 Navigation</h3>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>H</kbd>
              <span>Onglet Historique</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>1</kbd>
              <span>Onglet Statistiques</span>
            </div>
          </div>
          
          <div class="shortcuts-category">
            <h3>🎨 Affichage</h3>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>
              <span>Mode Compact/Détaillé</span>
            </div>
            <div class="shortcut-item">
              <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>
              <span>Changer le thème</span>
            </div>
          </div>
          
          <div class="shortcuts-category">
            <h3>❓ Aide</h3>
            <div class="shortcut-item">
              <kbd>?</kbd>
              <span>Afficher cette aide</span>
            </div>
          </div>
        </div>
        
        <div class="shortcuts-help-footer">
          <p>💡 Astuce : Maintenez <kbd>Ctrl</kbd> ou <kbd>Shift</kbd> en premier, puis appuyez sur la touche</p>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Déclaration anticipée pour que closeModal() puisse référencer escHandler
  // même si celui-ci est défini après (évite le problème de TDZ avec const).
  let escHandler;

  const closeModal = () => {
    // Retrait systématique du handler Escape quelle que soit la façon dont
    // la modal est fermée (bouton, overlay, touche Escape).
    document.removeEventListener('keydown', escHandler);
    const overlay = modal.querySelector('.shortcuts-help-overlay');
    const content = modal.querySelector('.shortcuts-help-content');
    overlay?.classList.add('closing');
    content?.classList.add('closing');
    setTimeout(() => modal.remove(), 200);
  };

  const closeBtn = modal.querySelector('.shortcuts-help-close');
  closeBtn?.addEventListener('click', closeModal);

  // Animation d'entrée
  setTimeout(() => {
    modal.querySelector('.shortcuts-help-content').style.transform = 'scale(1)';
    modal.querySelector('.shortcuts-help-content').style.opacity = '1';
  }, 10);

  // Fermer avec Escape
  escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', escHandler);

  // Fermer en cliquant sur l'overlay
  modal.querySelector('.shortcuts-help-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  });
};

// Styles — injection unique grâce à l'id 'shortcuts-modal-styles'.
// Évite l'accumulation d'une balise <style> à chaque appel de showShortcutsHelp()
// si le module est rechargé ou si la fonction est appelée au niveau module.
if (!document.getElementById('shortcuts-modal-styles')) {
const styles = document.createElement('style');
styles.id = 'shortcuts-modal-styles';
styles.textContent = `
  #shortcutsHelpModal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10002;
  }
  
  .shortcuts-help-overlay {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(6px);
    animation: fadeIn 0.2s ease;
    transition: opacity 0.2s ease;
  }

  .shortcuts-help-overlay.closing {
    opacity: 0;
  }
  
  .shortcuts-help-content {
    background: var(--card-bg, #2a2a3e);
    border-radius: 16px;
    max-width: 700px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    transform: scale(0.9);
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .shortcuts-help-content.closing {
    transform: scale(0.95);
    opacity: 0;
    transition: all 0.2s ease;
  }
  
  .shortcuts-help-header {
    padding: 25px 30px;
    border-bottom: 1px solid var(--border-color, #3a3a4e);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .shortcuts-help-header h2 {
    margin: 0;
    color: var(--text-primary, #fff);
    font-size: 24px;
  }
  
  .shortcuts-help-close {
    background: transparent;
    border: none;
    color: var(--text-secondary, #b0b0b0);
    font-size: 24px;
    cursor: pointer;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    transition: all 0.2s;
  }
  
  .shortcuts-help-close:hover {
    background: var(--bg-secondary, #3a3a4e);
    color: var(--text-primary, #fff);
  }
  
  .shortcuts-help-body {
    padding: 20px 30px;
  }
  
  .shortcuts-category {
    margin-bottom: 25px;
  }
  
  .shortcuts-category:last-child {
    margin-bottom: 0;
  }
  
  .shortcuts-category h3 {
    color: var(--primary-color, #38bdf8);
    font-size: 16px;
    margin: 0 0 12px 0;
    font-weight: 600;
  }
  
  .shortcut-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border-color, #3a3a4e);
  }
  
  .shortcut-item:last-child {
    border-bottom: none;
  }
  
  .shortcut-item kbd {
    background: var(--bg-secondary, #3a3a4e);
    color: var(--text-primary, #fff);
    padding: 4px 10px;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border-color, #4a4a5e);
  }
  
  .shortcut-item span {
    color: var(--text-secondary, #b0b0b0);
    flex: 1;
  }
  
  .shortcuts-help-footer {
    padding: 20px 30px;
    background: var(--bg-secondary, #3a3a4e);
    border-top: 1px solid var(--border-color, #3a3a4e);
    border-radius: 0 0 16px 16px;
  }
  
  .shortcuts-help-footer p {
    margin: 0;
    color: var(--text-secondary, #b0b0b0);
    font-size: 14px;
    text-align: center;
  }
  
  .shortcuts-help-footer kbd {
    background: var(--bg-tertiary, #4a4a5e);
    color: var(--text-primary, #fff);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
  }
`;
document.head.appendChild(styles);
}
