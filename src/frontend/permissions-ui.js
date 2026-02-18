// ==========================================
// MODULE: PERMISSIONS UI
// Applique visibilité et masquage selon le badge (Supabase ou fallback)
// Source de vérité : BackendAPI / version-badges.js
// ==========================================

var _freePromoImageIntervalId = null;
var FREE_PROMO_IMAGE_ROTATE_MS = 15000;
var FREE_PROMO_IMAGES = { honor: 'img/events/honnor_day.png', xp: 'img/events/xp_day.png' };

function startFreePromoImageRotation() {
  if (_freePromoImageIntervalId) {
    clearInterval(_freePromoImageIntervalId);
    _freePromoImageIntervalId = null;
  }
  var promo = document.getElementById('boosterFreePromo');
  var img = promo ? promo.querySelector('.booster-free-promo-img') : null;
  if (!img) return;
  var current = 'honor';
  img.src = FREE_PROMO_IMAGES.honor;
  img.alt = '50% Honneur';
  _freePromoImageIntervalId = setInterval(function () {
    current = current === 'honor' ? 'xp' : 'honor';
    img.src = FREE_PROMO_IMAGES[current];
    img.alt = current === 'honor' ? '50% Honneur' : '50% XP';
  }, FREE_PROMO_IMAGE_ROTATE_MS);
}

function stopFreePromoImageRotation() {
  if (_freePromoImageIntervalId) {
    clearInterval(_freePromoImageIntervalId);
    _freePromoImageIntervalId = null;
  }
}

function applyPermissionsUI() {
  if (typeof getCurrentBadge !== 'function' || typeof currentHasFeature !== 'function' || typeof currentCanAccessTab !== 'function') {
    console.warn('⚠️ Permissions UI : version-badges.js requis');
    return;
  }

  applyTabVisibility();
  applySidebarVisibility();
  applySettingsVisibility();
  applyBoosterVisibility();
  applyStreakVisibility();
  applyTitleBadge();
  applyMessagesVisibility();
  applyExportVisibility();
  if (typeof window.updatePayPalButtonsVisibility === 'function') window.updatePayPalButtonsVisibility();
  window.dispatchEvent(new CustomEvent('permissionsApplied'));
}

/**
 * Export : pour FREE/PRO connectés, masquer le bouton et afficher le message "Export uniquement disponible si les données sont locales".
 * Appel synchrone : pour FREE/PRO on affiche d'abord le message (on suppose connecté), puis updateExportButtonVisibility() affine.
 */
function applyExportVisibility() {
  const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
  const isFreeOrPro = badge === 'FREE' || badge === 'PRO';
  const exportBtn = document.getElementById('exportData');
  const settingsExportBtn = document.getElementById('settingsExportBtn');
  const exportMsg = document.getElementById('exportLocalOnlyMessage');
  const settingsExportMsg = document.getElementById('settingsExportLocalOnlyMessage');
  if (!isFreeOrPro) {
    if (exportBtn) exportBtn.style.display = '';
    if (settingsExportBtn) settingsExportBtn.style.display = '';
    if (exportMsg) exportMsg.style.display = 'none';
    if (settingsExportMsg) settingsExportMsg.style.display = 'none';
    return;
  }
  if (exportBtn) exportBtn.style.display = 'none';
  if (settingsExportBtn) settingsExportBtn.style.display = 'none';
  if (exportMsg) exportMsg.style.display = '';
  if (settingsExportMsg) settingsExportMsg.style.display = '';
}

/**
 * À appeler après applyPermissionsUI() (async). Pour FREE/PRO, vérifie si l'utilisateur est connecté :
 * si non connecté, affiche les boutons Export et masque le message ; sinon garde message visible et boutons masqués.
 */
async function updateExportButtonVisibility() {
  const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
  if (badge !== 'FREE' && badge !== 'PRO') return;
  if (typeof AuthManager === 'undefined' || typeof AuthManager.getCurrentUser !== 'function') {
    return;
  }
  const user = await AuthManager.getCurrentUser();
  const exportBtn = document.getElementById('exportData');
  const settingsExportBtn = document.getElementById('settingsExportBtn');
  const exportMsg = document.getElementById('exportLocalOnlyMessage');
  const settingsExportMsg = document.getElementById('settingsExportLocalOnlyMessage');
  if (user) {
    if (exportBtn) exportBtn.style.display = 'none';
    if (settingsExportBtn) settingsExportBtn.style.display = 'none';
    if (exportMsg) exportMsg.style.display = '';
    if (settingsExportMsg) settingsExportMsg.style.display = '';
  } else {
    if (exportBtn) exportBtn.style.display = '';
    if (settingsExportBtn) settingsExportBtn.style.display = '';
    if (exportMsg) exportMsg.style.display = 'none';
    if (settingsExportMsg) settingsExportMsg.style.display = 'none';
  }
}
window.updateExportButtonVisibility = updateExportButtonVisibility;

function applyTabVisibility() {
  const tabIds = ['stats', 'progression', 'history', 'events', 'classement', 'settings', 'superadmin'];
  const visibleTabs = tabIds.filter(id => currentCanAccessTab(id));
  let activeTabVisible = false;

  tabIds.forEach(tabId => {
    const canAccess = currentCanAccessTab(tabId);
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    const content = document.getElementById(`tab-${tabId}`);
    if (btn) btn.style.display = canAccess ? '' : 'none';
    if (content) content.style.display = canAccess ? '' : 'none';
    if (btn?.classList.contains('active')) activeTabVisible = canAccess;
  });

  if (!activeTabVisible && visibleTabs.length > 0 && typeof switchTab === 'function') {
    switchTab(visibleTabs[0]);
  }
}

function applySidebarVisibility() {
  const viewAllBtn = document.getElementById('viewAllEventsBtn');
  const addBtn = document.getElementById('addEventBtn');
  const eventsSidebar = document.querySelector('.events-sidebar');
  const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : '';
  const hasEventsTab = currentCanAccessTab('events') || ['PRO', 'ADMIN', 'SUPERADMIN'].includes(badge);
  const isAdminOrSuperadmin = ['ADMIN', 'SUPERADMIN'].includes(badge);
  const showViewAll = isAdminOrSuperadmin && currentHasFeature('eventsSidebarViewAllButton');
  const showAdd = isAdminOrSuperadmin && currentHasFeature('eventsSidebarAddButton');
  if (viewAllBtn) viewAllBtn.style.display = showViewAll ? '' : 'none';
  if (addBtn) addBtn.style.display = showAdd ? '' : 'none';
  if (eventsSidebar) eventsSidebar.style.display = hasEventsTab ? '' : 'none';
}

function applySettingsVisibility() {
  const notifGroup = document.getElementById('settingsNotificationsEnabled')?.closest('.settings-group');
  const autoSaveGroup = document.getElementById('settingsAutoSaveEnabled')?.closest('.settings-group');
  const streakGroup = document.getElementById('settingsStreakEnabled')?.closest('.settings-group');
  const linksSection = document.getElementById('manageLinksBtnSettings')?.closest('.settings-section');

  if (notifGroup) notifGroup.style.display = currentHasFeature('notificationsWindows') ? '' : 'none';
  if (autoSaveGroup) autoSaveGroup.style.display = currentHasFeature('autoSave') ? '' : 'none';
  if (streakGroup) streakGroup.style.display = currentHasFeature('streakCounter') ? '' : 'none';
  if (linksSection) linksSection.style.display = currentHasFeature('usefulLinks') ? '' : 'none';
}

function applyBoosterVisibility() {
  const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
  const boosterSidebar = document.getElementById('boosterSidebar');
  const boosterFreePromo = document.getElementById('boosterFreePromo');
  const boosterWidget = document.getElementById('boosterWidget');
  const boosterAlert = document.getElementById('boosterAlert');
  const appLayout = document.querySelector('.app-layout');

  if (badge === 'FREE') {
    if (boosterSidebar) boosterSidebar.style.display = '';
    if (appLayout) appLayout.classList.add('has-booster-sidebar');
    if (boosterFreePromo) boosterFreePromo.style.display = 'flex';
    if (boosterWidget) boosterWidget.style.display = 'none';
    if (boosterAlert) boosterAlert.style.display = 'none';
    startFreePromoImageRotation();
    return;
  }

  stopFreePromoImageRotation();
  if (boosterFreePromo) boosterFreePromo.style.display = 'none';
  if (boosterSidebar) boosterSidebar.style.display = currentHasFeature('boosterDisplay') ? '' : 'none';
  if (currentHasFeature('boosterDisplay') && typeof updateBoosterAlert === 'function' && typeof updateBoosterWidget === 'function') {
    updateBoosterAlert();
    updateBoosterWidget();
  }
}

function applyStreakVisibility() {
  if (!currentHasFeature('streakCounter')) {
    const streakEl = document.getElementById('streakCounter');
    if (streakEl) streakEl.style.display = 'none';
  }
}

function applyTitleBadge() {
  const badgeEl = document.getElementById('headerUserBadge');
  if (!badgeEl) return;
  const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
  badgeEl.innerHTML = typeof generateUserBadge === 'function' ? generateUserBadge(badge) : '';
}

function applyMessagesVisibility() {
  const btn = document.getElementById('messagesInboxBtn');
  if (!btn) return;
  const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : '';
  btn.style.display = ['ADMIN', 'SUPERADMIN'].includes(badge) ? 'none' : '';
}

document.addEventListener('DOMContentLoaded', () => {
  applyPermissionsUI();
});
window.applyPermissionsUI = applyPermissionsUI;
window.applyExportVisibility = applyExportVisibility;
console.log('🔐 Module Permissions UI chargé');
