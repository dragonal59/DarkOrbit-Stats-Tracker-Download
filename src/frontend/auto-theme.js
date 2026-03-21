// ==========================================
// DÉTECTION AUTOMATIQUE DU THÈME SYSTÈME
// Amélioration #37
// ==========================================

const AutoTheme = {
   _mediaCallback: null,
   _watchingSystemChanges: false,

   /**
    * Initialiser la détection auto du thème
    */
   init() {
      var sk = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS) ? CONFIG.STORAGE_KEYS : {};
      const themeKey = sk.THEME || 'darkOrbitTheme';
      const autoKey = sk.THEME_AUTO || 'darkOrbitThemeAuto';
      const savedTheme = localStorage.getItem(themeKey);
      const userPreference = localStorage.getItem(autoKey);

      // Si l'utilisateur veut le mode auto (ou première visite)
      if (userPreference === 'true' || (!savedTheme && !userPreference)) {
         this.applySystemTheme();
         this.watchSystemChanges();
      }
   },

   /**
    * Appliquer le thème selon les préférences système
    */
   applySystemTheme() {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = prefersDark ? 'dark' : 'light';

      // Appliquer le thème
      document.documentElement.setAttribute('data-theme', theme);

   },

   /**
    * Écouter les changements de préférence système (un seul listener actif).
    */
   watchSystemChanges() {
      if (this._watchingSystemChanges) return;

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      var autoKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME_AUTO) ? CONFIG.STORAGE_KEYS.THEME_AUTO : 'darkOrbitThemeAuto';

      if (this._mediaCallback) {
         if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', this._mediaCallback);
         if (mediaQuery.removeListener) mediaQuery.removeListener(this._mediaCallback);
      }

      this._mediaCallback = (e) => {
         const userPreference = localStorage.getItem(autoKey);
         if (userPreference === 'true' || !userPreference) {
            const newTheme = e.matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            if (typeof window.showToast === 'function') {
               window.showToast('🎨 Thème changé : ' + (newTheme === 'dark' ? 'Sombre' : 'Clair'), 'info');
            }
         }
      };

      if (mediaQuery.addEventListener) {
         mediaQuery.addEventListener('change', this._mediaCallback);
      } else if (mediaQuery.addListener) {
         mediaQuery.addListener(this._mediaCallback);
      }
      this._watchingSystemChanges = true;
   },

   _stopWatchingSystemChanges() {
      if (!this._mediaCallback) return;
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', this._mediaCallback);
      if (mediaQuery.removeListener) mediaQuery.removeListener(this._mediaCallback);
      this._mediaCallback = null;
      this._watchingSystemChanges = false;
   },

   /**
    * Activer le mode automatique
    */
   enableAuto() {
      var k = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME_AUTO) ? CONFIG.STORAGE_KEYS.THEME_AUTO : 'darkOrbitThemeAuto';
      try { localStorage.setItem(k, 'true'); if (typeof DataSync !== 'undefined' && DataSync.syncSettingsOnly) DataSync.syncSettingsOnly().catch(() => {}); } catch (_e) { /* quota ou mode privé */ }
      this.applySystemTheme();
      this.watchSystemChanges();

      if (typeof window.showToast === 'function') {
         window.showToast('✅ Mode automatique activé', 'success');
      }
   },

   /**
    * Désactiver le mode automatique
    */
   disableAuto() {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('pendingReloadToast')) return;
      var k = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME_AUTO) ? CONFIG.STORAGE_KEYS.THEME_AUTO : 'darkOrbitThemeAuto';
      try { localStorage.setItem(k, 'false'); if (typeof DataSync !== 'undefined' && DataSync.syncSettingsOnly) DataSync.syncSettingsOnly().catch(() => {}); } catch (_e) { /* quota ou mode privé */ }

      this._stopWatchingSystemChanges();

      if (typeof window.showToast === 'function') {
         window.showToast('✅ Mode manuel activé', 'success');
      }
   },

   /**
    * Vérifier si le mode auto est activé
    */
   isAutoEnabled() {
      var k = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME_AUTO) ? CONFIG.STORAGE_KEYS.THEME_AUTO : 'darkOrbitThemeAuto';
      const userPreference = localStorage.getItem(k);
      return userPreference === 'true' || userPreference === null;
   },

   /**
    * Toggle auto mode
    */
   toggleAuto() {
      if (this.isAutoEnabled()) {
         this.disableAuto();
      } else {
         this.enableAuto();
      }
      return this.isAutoEnabled();
   }
};

// ==========================================
// OVERRIDE DE setTheme POUR SUPPORTER AUTO
// ==========================================

// Sauvegarder la fonction setTheme originale si elle existe
if (typeof window.setTheme !== 'undefined') {
   window._originalSetTheme = window.setTheme;
}

// Nouvelle fonction setTheme qui gère l'auto
window.setTheme = function (theme) {
   if (theme === 'auto') {
      AutoTheme.enableAuto();
      return;
   }

   // Désactiver le mode auto (retire le listener système dans disableAuto)
   AutoTheme.disableAuto();

   // Appliquer le thème
   document.documentElement.setAttribute('data-theme', theme);
   var themeKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME) ? CONFIG.STORAGE_KEYS.THEME : 'darkOrbitTheme';
   try { localStorage.setItem(themeKey, theme); } catch (_e) { /* quota ou mode privé */ }

   // Appeler la fonction originale si elle existe
   if (typeof window._originalSetTheme === 'function') {
      window._originalSetTheme(theme);
   }
};

// ==========================================
// INITIALISATION
// ==========================================

// Initialiser dès que possible (avant DOMContentLoaded pour éviter le flash)
AutoTheme.init();

document.addEventListener('DOMContentLoaded', () => {
   // Ajouter un bouton "Auto" dans les paramètres si possible
   const themeButtons = document.querySelector('.settings-control');
   if (themeButtons && !document.querySelector('[data-theme="auto"]')) {
      const autoButton = document.createElement('button');
      autoButton.className = 'settings-theme-btn' + (AutoTheme.isAutoEnabled() ? ' active' : '');
      autoButton.setAttribute('data-theme', 'auto');
      autoButton.innerHTML = '🌓 Auto';
      autoButton.title = 'Suivre les préférences système';

      autoButton.addEventListener('click', () => {
         setTheme('auto');

         // Mettre à jour les boutons
         document.querySelectorAll('.settings-theme-btn').forEach(b => b.classList.remove('active'));
         autoButton.classList.add('active');
      });

      themeButtons.appendChild(autoButton);
   }
});

// Export
window.AutoTheme = AutoTheme;