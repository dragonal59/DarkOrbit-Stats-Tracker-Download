// ==========================================
// DÉTECTION AUTOMATIQUE DU THÈME SYSTÈME
// Amélioration #37
// ==========================================

const AutoTheme = {

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

      console.log(`🎨 Thème auto détecté : ${theme}`);
   },

   /**
    * Écouter les changements de préférence système
    */
   watchSystemChanges() {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      // Utiliser addEventListener si disponible
      var autoKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME_AUTO) ? CONFIG.STORAGE_KEYS.THEME_AUTO : 'darkOrbitThemeAuto';
      if (mediaQuery.addEventListener) {
         mediaQuery.addEventListener('change', (e) => {
            const userPreference = localStorage.getItem(autoKey);

            // Appliquer seulement si le mode auto est activé
            if (userPreference === 'true' || !userPreference) {
               const newTheme = e.matches ? 'dark' : 'light';
               document.documentElement.setAttribute('data-theme', newTheme);

               // Utiliser showToast seulement si disponible
               if (typeof window.showToast === 'function') {
                  window.showToast(`🎨 Thème changé : ${newTheme === 'dark' ? 'Sombre' : 'Clair'}`, 'info');
               }
               console.log(`🎨 Thème système changé : ${newTheme}`);
            }
         });
      } else if (mediaQuery.addListener) {
         mediaQuery.addListener((e) => {
            const userPreference = localStorage.getItem(autoKey);
            if (userPreference === 'true' || !userPreference) {
               const newTheme = e.matches ? 'dark' : 'light';
               document.documentElement.setAttribute('data-theme', newTheme);
            }
         });
      }
   },

   /**
    * Activer le mode automatique
    */
   enableAuto() {
      var k = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME_AUTO) ? CONFIG.STORAGE_KEYS.THEME_AUTO : 'darkOrbitThemeAuto';
      localStorage.setItem(k, 'true');
      this.applySystemTheme();
      this.watchSystemChanges();

      if (typeof window.showToast === 'function') {
         window.showToast('✅ Mode automatique activé', 'success');
      } else {
         console.log('✅ Mode automatique activé');
      }
   },

   /**
    * Désactiver le mode automatique
    */
   disableAuto() {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('pendingReloadToast')) return;
      var k = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME_AUTO) ? CONFIG.STORAGE_KEYS.THEME_AUTO : 'darkOrbitThemeAuto';
      localStorage.setItem(k, 'false');

      if (typeof window.showToast === 'function') {
         window.showToast('✅ Mode manuel activé', 'success');
      } else {
         console.log('✅ Mode manuel activé');
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

   // Désactiver le mode auto si on change manuellement
   AutoTheme.disableAuto();

   // Appliquer le thème
   document.documentElement.setAttribute('data-theme', theme);
   var themeKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.THEME) ? CONFIG.STORAGE_KEYS.THEME : 'darkOrbitTheme';
   localStorage.setItem(themeKey, theme);

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
   console.log('🌓 Système de thème automatique chargé');

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