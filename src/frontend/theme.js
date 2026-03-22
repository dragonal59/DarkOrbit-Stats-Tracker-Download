// ==========================================
// MODULE: THEME & VIEW MODE MANAGEMENT
// ==========================================

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  SafeStorage.set(CONFIG.STORAGE_KEYS.THEME, theme);
  if (typeof DataSync !== 'undefined' && DataSync.syncSettingsOnly) DataSync.syncSettingsOnly().catch(() => {});
  
  // Mettre à jour les boutons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const themeBtn = document.querySelector(`[data-theme="${theme}"]`);
  if (themeBtn) {
    themeBtn.classList.add('active');
  }
  
}

function loadTheme() {
  const savedTheme = SafeStorage.get(CONFIG.STORAGE_KEYS.THEME, CONFIG.DEFAULTS.THEME);
  setTheme(savedTheme);
}

// ==========================================
// VIEW MODE MANAGEMENT (Compact/Detailed)
// ==========================================

function setViewMode(mode) {
  document.documentElement.setAttribute('data-view-mode', mode);
  SafeStorage.set(CONFIG.STORAGE_KEYS.VIEW_MODE, mode);
  if (typeof DataSync !== 'undefined' && DataSync.syncSettingsOnly) DataSync.syncSettingsOnly().catch(() => {});
  
  // Mettre à jour les boutons
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const modeBtn = document.querySelector(`[data-mode="${mode}"]`);
  if (modeBtn) {
    modeBtn.classList.add('active');
  }
}

function loadViewMode() {
  const savedMode = SafeStorage.get(CONFIG.STORAGE_KEYS.VIEW_MODE, CONFIG.DEFAULTS.VIEW_MODE);
  setViewMode(savedMode);
}
