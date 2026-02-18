// ==========================================
// GESTION DES PARAMÈTRES
// ==========================================

var _sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
const SETTINGS_STORAGE_KEY = _sk.SETTINGS || 'darkOrbitSettings';
const CUSTOM_ICONS_STORAGE_KEY = _sk.CUSTOM_ICONS || 'darkOrbitCustomIcons';

// Paramètres par défaut
const DEFAULT_SETTINGS = {
  soundsEnabled: true,
  confettiEnabled: true,
  notificationsEnabled: false,
  autoSaveEnabled: true,
  streakEnabled: true
};

// ==========================================
// STOCKAGE (avec cache)
// ==========================================

function getSettings() {
  if (typeof StorageCache !== 'undefined') {
    return StorageCache.get(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
  }
  return SafeStorage.get(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
}

var SETTINGS_MODIFIED_KEY = 'darkOrbit_settingsModifiedAt';

function saveSetting(key, value) {
  const settings = getSettings();
  settings[key] = value;
  try { localStorage.setItem(SETTINGS_MODIFIED_KEY, String(Date.now())); } catch (_) {}
  
  var result;
  if (typeof StorageCache !== 'undefined') {
    result = StorageCache.set(SETTINGS_STORAGE_KEY, settings);
  } else {
    result = SafeStorage.set(SETTINGS_STORAGE_KEY, settings);
  }
  // Sync immédiate vers Supabase (utilisateur connecté)
  if (typeof DataSync !== 'undefined' && DataSync.syncSettingsOnly && DataSync.isReady && DataSync.isReady()) {
    DataSync.syncSettingsOnly().catch(function(e) { console.warn('[Settings] Sync reportée:', e?.message || e); });
  }
  return result;
}

function isSettingsDirty() {
  try {
    return !!localStorage.getItem(SETTINGS_MODIFIED_KEY);
  } catch (_) { return false; }
}

function clearSettingsDirtyFlag() {
  try { localStorage.removeItem(SETTINGS_MODIFIED_KEY); } catch (_) {}
}

function getSetting(key) {
  const settings = getSettings();
  return settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
}

function clearCustomIconsData() {
  if (typeof StorageCache !== 'undefined' && typeof StorageCache.remove === 'function') {
    StorageCache.remove(CUSTOM_ICONS_STORAGE_KEY);
    return;
  }
  if (typeof SafeStorage !== 'undefined' && typeof SafeStorage.remove === 'function') {
    SafeStorage.remove(CUSTOM_ICONS_STORAGE_KEY);
  }
}

// ==========================================
// INITIALISATION DES CONTRÔLES
// ==========================================

function initSettingsTab() {
  // Thème
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('.settings-theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === currentTheme);
  });
  
  // Mode d'affichage
  const currentViewMode = document.documentElement.getAttribute('data-view-mode') || 'detailed';
  document.querySelectorAll('.settings-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === currentViewMode);
  });
  
  // Checkboxes
  const settings = getSettings();
  
  const checkboxes = [
    { id: 'settingsSoundsEnabled', key: 'soundsEnabled' },
    { id: 'settingsConfettiEnabled', key: 'confettiEnabled' },
    { id: 'settingsNotificationsEnabled', key: 'notificationsEnabled' },
    { id: 'settingsAutoSaveEnabled', key: 'autoSaveEnabled' },
    { id: 'settingsStreakEnabled', key: 'streakEnabled' }
  ];
  
  checkboxes.forEach(({ id, key }) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.checked = settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
    }
  });
  
  // Mettre à jour les infos de données
  updateDataInfo();
}

function updateDataInfo() {
  const dataInfo = document.getElementById('settingsDataInfo');
  if (!dataInfo) return;
  
  const sessions = typeof getSessions === 'function' ? getSessions() : [];
  
  const dataSize = JSON.stringify(localStorage).length;
  const dataSizeKB = (dataSize / 1024).toFixed(1);
  
  dataInfo.innerHTML = `
    <p>📊 <strong>${sessions.length}</strong> sessions sauvegardées</p>
    <p>💾 Espace utilisé : <strong>${dataSizeKB} KB</strong></p>
  `;
}

// ==========================================
// NOTIFICATIONS WINDOWS
// ==========================================

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('❌ Les notifications ne sont pas supportées', 'error');
    return;
  }
  
  if (Notification.permission === 'granted') {
    saveSetting('notificationsEnabled', true);
    showToast('🔔 Notifications Windows activées', 'success');
    return;
  }
  
  Notification.requestPermission().then(permission => {
    const notifCheckbox = document.getElementById('settingsNotificationsEnabled');
    if (permission === 'granted') {
      saveSetting('notificationsEnabled', true);
      if (notifCheckbox) notifCheckbox.checked = true;
      showToast('🔔 Notifications Windows activées', 'success');
      new Notification('DarkOrbit Stats Tracker', {
        body: 'Les notifications sont maintenant activées !',
        icon: 'img/basic_space_pilot.png'
      });
    } else {
      saveSetting('notificationsEnabled', false);
      if (notifCheckbox) notifCheckbox.checked = false;
      showToast('🔔 Notifications Windows désactivées', 'success');
    }
  });
}

function sendNotification(title, body) {
  if (typeof currentHasFeature === 'function' && !currentHasFeature('notificationsWindows')) return;
  if (!getSetting('notificationsEnabled')) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  
  new Notification(title, {
    body: body,
    icon: 'img/basic_space_pilot.png'
  });
}

// ==========================================
// EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Nettoyage données des icônes personnalisées (feature retirée)
  clearCustomIconsData();
  
  // Boutons de thème
  document.querySelectorAll('.settings-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      setTheme(theme);
      
      document.querySelectorAll('.settings-theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Boutons de mode d'affichage
  document.querySelectorAll('.settings-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      setViewMode(mode);
      
      document.querySelectorAll('.settings-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Checkbox sons
  const soundsCheckbox = document.getElementById('settingsSoundsEnabled');
  if (soundsCheckbox) {
    soundsCheckbox.addEventListener('change', (e) => {
      saveSetting('soundsEnabled', e.target.checked);
      showToast(e.target.checked ? '🔊 Sons activés' : '🔇 Sons désactivés', 'success');
    });
  }
  
  // Checkbox confettis
  const confettiCheckbox = document.getElementById('settingsConfettiEnabled');
  if (confettiCheckbox) {
    confettiCheckbox.addEventListener('change', (e) => {
      saveSetting('confettiEnabled', e.target.checked);
      showToast(e.target.checked ? '🎉 Confettis activés' : '🎉 Confettis désactivés', 'success');
    });
  }
  
  // Checkbox notifications
  const notifCheckbox = document.getElementById('settingsNotificationsEnabled');
  if (notifCheckbox) {
    notifCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        requestNotificationPermission();
      } else {
        saveSetting('notificationsEnabled', false);
        showToast('🔔 Notifications Windows désactivées', 'success');
      }
    });
  }
  
  // Checkbox auto-save
  const autoSaveCheckbox = document.getElementById('settingsAutoSaveEnabled');
  if (autoSaveCheckbox) {
    autoSaveCheckbox.addEventListener('change', (e) => {
      saveSetting('autoSaveEnabled', e.target.checked);
      showToast(e.target.checked ? '💾 Sauvegarde auto activée' : '💾 Sauvegarde auto désactivée', 'success');
    });
  }
  
  // Checkbox streak
  const streakCheckbox = document.getElementById('settingsStreakEnabled');
  if (streakCheckbox) {
    streakCheckbox.addEventListener('change', (e) => {
      saveSetting('streakEnabled', e.target.checked);
      const streakCounter = document.getElementById('streakCounter');
      if (streakCounter) {
        streakCounter.style.display = e.target.checked ? 'inline-flex' : 'none';
      }
      showToast(e.target.checked ? '🔥 Streak affiché' : '🔥 Streak masqué', 'success');
    });
  }
  
  // Bouton export
  const exportBtn = document.getElementById('settingsExportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (typeof exportData === 'function') {
        exportData();
      }
    });
  }
  
  // Bouton import
  const importBtn = document.getElementById('settingsImportBtn');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      if (typeof importData === 'function') {
        importData();
      }
    });
  }

  // Bouton réinitialiser seuil de départ
  const resetBaselineBtn = document.getElementById('resetBaselineBtn');
  if (resetBaselineBtn) {
    resetBaselineBtn.addEventListener('click', () => {
      if (typeof resetBaseline === 'function') resetBaseline();
    });
  }

  // Bouton vider cache : suppression complète des données locales + sync Supabase, puis popup stats obligatoire
  const clearCacheBtn = document.getElementById('settingsClearCacheBtn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      var ok = false;
      if (typeof ModernConfirm !== 'undefined' && ModernConfirm.show) {
        ok = await ModernConfirm.show({ title: 'Vider le cache', message: 'Cela supprimera TOUTES les données locales (sessions, stats, paramètres). Si vous êtes connecté, les sessions Supabase seront aussi supprimées. Un formulaire vous demandera de ressaisir vos stats.', confirmText: 'Vider le cache', cancelText: 'Annuler', type: 'warning' });
      } else {
        ok = confirm('⚠️ Vider le cache ?\n\nCela supprimera TOUTES les données locales (sessions, stats, paramètres). Si vous êtes connecté, les sessions Supabase seront aussi supprimées. Un formulaire vous demandera de ressaisir vos stats.');
      }
      if (!ok) return;
      try {
        if (typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' && typeof getSupabaseClient === 'function') {
          const user = await AuthManager.getCurrentUser();
          if (user && user.id) {
            const supabase = getSupabaseClient();
            await supabase.from('user_sessions').delete().eq('user_id', user.id);
          }
        }
        if (typeof UnifiedStorage !== 'undefined' && typeof UnifiedStorage.clearAllAppDataExceptAuth === 'function') {
          UnifiedStorage.clearAllAppDataExceptAuth();
        } else {
          if (typeof UnifiedStorage !== 'undefined' && typeof UnifiedStorage.clearCacheExceptRegisteredKeys === 'function') {
            UnifiedStorage.clearCacheExceptRegisteredKeys();
          }
          var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
          if (sk.SESSIONS) SafeStorage.remove(sk.SESSIONS);
          if (sk.CURRENT_STATS) SafeStorage.remove(sk.CURRENT_STATS);
          if (sk.THEME) SafeStorage.remove(sk.THEME);
          if (sk.VIEW_MODE) SafeStorage.remove(sk.VIEW_MODE);
        }
        updateDataInfo();
        if (typeof setAppAccessFromSessions === 'function') setAppAccessFromSessions(0);
        if (typeof initBaselineSetup === 'function') initBaselineSetup(true);
        showToast('🗑️ Cache vidé. Saisissez vos stats pour continuer.', 'warning');
      } catch (e) {
        console.error('Vider le cache:', e);
        showToast('❌ Erreur lors du vidage du cache', 'error');
      }
    });
  }
  
  // Initialiser l'onglet paramètres quand on clique dessus
  const settingsTab = document.querySelector('[data-tab="settings"]');
  if (settingsTab) {
    settingsTab.addEventListener('click', () => {
      setTimeout(initSettingsTab, 50);
    });
  }
});

// ==========================================
// OVERRIDE DES FONCTIONS SONS/CONFETTIS
// ==========================================

const originalPlaySound = window.playSound;
if (originalPlaySound) {
  window.playSound = function(type) {
    if (getSetting('soundsEnabled')) {
      originalPlaySound(type);
    }
  };
}

const originalCelebrateSuccess = window.celebrateSuccess;
if (originalCelebrateSuccess) {
  window.celebrateSuccess = function(type) {
    if (getSetting('confettiEnabled')) {
      originalCelebrateSuccess(type);
    }
  };
}

// Exposer les fonctions pour les autres modules
window.getSetting = getSetting;
window.sendNotification = sendNotification;
window.isSettingsDirty = isSettingsDirty;
window.clearSettingsDirtyFlag = clearSettingsDirtyFlag;

console.log('⚙️ Système de paramètres chargé');