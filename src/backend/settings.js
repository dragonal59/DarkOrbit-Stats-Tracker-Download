// ==========================================
// GESTION DES PARAMÈTRES
// ==========================================

var _sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
const SETTINGS_STORAGE_KEY = _sk.SETTINGS || 'darkOrbitSettings';

// Paramètres par défaut
const DEFAULT_SETTINGS = {
  soundsEnabled: true,
  confettiEnabled: true,
  notificationsEnabled: false,
  autoSaveEnabled: true,
  streakEnabled: true,
  scrollbarsEnabled: true
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
    DataSync.syncSettingsOnly().catch(function(e) { Logger.warn('[Settings] Sync reportée:', e?.message || e); });
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

/**
 * Fusion pull Supabase : valeur serveur si présente, sinon conservation locale, sinon défaut.
 * Évite d'écraser une clé absente du JSON serveur (ex. notificationsEnabled jamais poussée).
 */
function mergeSettingsForPull(serverJson, localJson) {
  const server = serverJson && typeof serverJson === 'object' ? serverJson : {};
  const local = localJson && typeof localJson === 'object' ? localJson : {};
  const out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(server, k)) out[k] = server[k];
    else if (Object.prototype.hasOwnProperty.call(local, k)) out[k] = local[k];
    else out[k] = DEFAULT_SETTINGS[k];
  });
  return out;
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
    { id: 'settingsStreakEnabled', key: 'streakEnabled' },
    { id: 'settingsScrollbarsEnabled', key: 'scrollbarsEnabled' }
  ];
  
  checkboxes.forEach(({ id, key }) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.checked = settings[key] !== undefined ? settings[key] : DEFAULT_SETTINGS[key];
    }
  });
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
        icon: 'img/ranks/basic_space_pilot.png'
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
    icon: 'img/ranks/basic_space_pilot.png'
  });
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function applyScrollbarsSetting(enabled) {
  document.body.classList.toggle('scrollbars-hidden', !enabled);
}

document.addEventListener('DOMContentLoaded', () => {
  // Appliquer le paramètre scrollbars dès le chargement
  applyScrollbarsSetting(getSetting('scrollbarsEnabled') !== false);

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

  // Checkbox scrollbars
  const scrollbarsCheckbox = document.getElementById('settingsScrollbarsEnabled');
  if (scrollbarsCheckbox) {
    scrollbarsCheckbox.addEventListener('change', (e) => {
      saveSetting('scrollbarsEnabled', e.target.checked);
      applyScrollbarsSetting(e.target.checked);
      const lang = typeof window.getCurrentLang === 'function' ? window.getCurrentLang() : 'fr';
      const key = e.target.checked ? 'scrollbars_shown' : 'scrollbars_hidden';
      const msg = (typeof window.i18nT === 'function' ? window.i18nT(key, lang) : null) || (e.target.checked ? '↕ Scrollbars affichées' : '↕ Scrollbars masquées');
      showToast(msg, 'success');
    });
  }
  
  // Boutons export / import / reset baseline / vider cache : gérés ailleurs (header, raccourcis, modules dédiés)

  // Initialiser l'onglet paramètres quand on clique dessus
  const settingsTab = document.querySelector('[data-tab="settings"]');
  if (settingsTab) {
    settingsTab.addEventListener('click', () => {
      setTimeout(initSettingsTab, 50);
      setTimeout(initChangelogSection, 100);
    });
  }
  setTimeout(initChangelogSection, 500);

});

// ==========================================
// CHANGELOG (Paramètres)
// ==========================================

var CHANGELOG_FETCH_URL = 'https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json';

function initChangelogSection() {
  var container = document.getElementById('settingsChangelogList');
  if (!container) return;
  container.innerHTML = '<p class="settings-description">Chargement…</p>';
  fetch(CHANGELOG_FETCH_URL)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var versions = (data && data.versions) ? data.versions : [];
      if (versions.length === 0) {
        container.innerHTML = '<p class="settings-description">Aucune version.</p>';
        return;
      }
      container.innerHTML = '';
      versions.forEach(function (entry) {
        var v = entry.version || '';
        var date = entry.date || '';
        var type = (entry.type === 'critical') ? 'CRITIQUE' : 'STANDARD';
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'settings-changelog-item';
        row.innerHTML =
          '<span class="settings-changelog-version">v' + (v) + '</span>' +
          '<span class="settings-changelog-date">' + (date) + '</span>' +
          '<span class="settings-changelog-badge settings-changelog-badge--' + (entry.type === 'critical' ? 'critical' : 'standard') + '">' + type + '</span>';
        row.addEventListener('click', function () {
          if (typeof window.showChangelogPopup === 'function') {
            window.showChangelogPopup('Version ' + v, entry, function () {});
          }
        });
        container.appendChild(row);
      });
    })
    .catch(function () {
      container.innerHTML = '<p class="settings-description">Impossible de charger le changelog.</p>';
    });
}

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
window.initSettingsTab = initSettingsTab;
window.mergeSettingsForPull = mergeSettingsForPull;
window.applyScrollbarsSetting = applyScrollbarsSetting;

