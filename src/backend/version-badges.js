// ==========================================
// MODULE: VERSION BADGES
// Système de badges pour gestion des droits et visibilité UI
// Prêt pour intégration backend (Supabase) future
// Aucune authentification implémentée à ce stade
// ==========================================

const BADGES = Object.freeze({
  FREE: 'FREE',
  PRO: 'PRO',
  ADMIN: 'ADMIN',
  SUPERADMIN: 'SUPERADMIN'
});

// Hiérarchie des badges (niveau croissant)
const BADGE_LEVEL = Object.freeze({
  [BADGES.FREE]: 1,
  [BADGES.PRO]: 2,
  [BADGES.ADMIN]: 3,
  [BADGES.SUPERADMIN]: 4
});

// Onglets de l'application (identifiants data-tab)
const TABS = Object.freeze({
  STATS: 'stats',
  HISTORY: 'history',
  PROGRESSION: 'progression',
  EVENTS: 'events',
  CLASSEMENT: 'classement',
  SETTINGS: 'settings',
  DASHBOARD: 'superadmin',
  COUPONS: 'coupons'
});

// Onglets visibles par badge (FREE sans Événements, PRO/ADMIN/SUPERADMIN avec Événements)
const BADGE_TABS = Object.freeze({
  [BADGES.FREE]: [TABS.STATS, TABS.HISTORY, TABS.PROGRESSION, TABS.CLASSEMENT, TABS.SETTINGS],
  [BADGES.PRO]: [TABS.STATS, TABS.HISTORY, TABS.PROGRESSION, TABS.CLASSEMENT, TABS.SETTINGS, TABS.COUPONS],
  [BADGES.ADMIN]: [TABS.STATS, TABS.HISTORY, TABS.PROGRESSION, TABS.CLASSEMENT, TABS.SETTINGS, TABS.COUPONS, TABS.DASHBOARD],
  [BADGES.SUPERADMIN]: [TABS.STATS, TABS.HISTORY, TABS.PROGRESSION, TABS.CLASSEMENT, TABS.SETTINGS, TABS.COUPONS, TABS.DASHBOARD]
});

// Fonctionnalités par badge
const BADGE_FEATURES = Object.freeze({
  [BADGES.FREE]: Object.freeze({
    statsPersonal: true,
    historyPersonal: true,
    eventsSidebarReadOnly: true,
    notificationsWindows: false,
    boosterDisplay: false,
    usefulLinks: false,
    autoSave: false,
    streakCounter: false,
    eventsTab: false,
    eventsCreateEdit: false,
    eventsSidebarAddButton: false,
    eventsSidebarViewAllButton: false,
    dashboardTab: false,
    dashboardAdmin: false,
    dashboardBanUnban: false,
    dashboardPromoteDemote: false,
    dashboardViewAdminLogs: false,
    couponsTab: false
  }),
  [BADGES.PRO]: Object.freeze({
    statsPersonal: true,
    historyPersonal: true,
    eventsSidebarReadOnly: true,
    notificationsWindows: true,
    boosterDisplay: true,
    usefulLinks: true,
    autoSave: true,
    streakCounter: true,
    eventsTab: true,
    eventsCreateEdit: false,
    eventsSidebarAddButton: false,
    eventsSidebarViewAllButton: true,
    dashboardTab: false,
    dashboardAdmin: false,
    dashboardBanUnban: false,
    dashboardPromoteDemote: false,
    dashboardViewAdminLogs: false,
    couponsTab: true
  }),
  [BADGES.ADMIN]: Object.freeze({
    statsPersonal: true,
    historyPersonal: true,
    eventsSidebarReadOnly: true,
    notificationsWindows: true,
    boosterDisplay: true,
    usefulLinks: true,
    autoSave: true,
    streakCounter: true,
    eventsTab: true,
    eventsCreateEdit: true,
    eventsSidebarAddButton: true,
    eventsSidebarViewAllButton: true,
    dashboardTab: true,
    dashboardAdmin: true,
    dashboardBanUnban: true,
    dashboardPromoteDemote: false,
    dashboardViewAdminLogs: false,
    dashboardViewUsers: true,
    dashboardEditBadges: false,
    dashboardGenerateKeys: false,
    dashboardCollectRankings: false,
    dashboardDarkOrbitAccounts: false,
    dashboardViewSecurityLogs: false,
    dashboardVueGenerale: false,
    dashboardMessages: false,
    dashboardLogsSecurite: false,
    dashboardClesLicence: false,
    dashboardPlanificateur: false,
    dashboardPermissionsAdmin: false,
    dashboardLogs: false
  }),
  [BADGES.SUPERADMIN]: Object.freeze({
    statsPersonal: true,
    historyPersonal: true,
    eventsSidebarReadOnly: true,
    notificationsWindows: true,
    boosterDisplay: true,
    usefulLinks: true,
    autoSave: true,
    streakCounter: true,
    eventsTab: true,
    eventsCreateEdit: true,
    eventsSidebarAddButton: true,
    eventsSidebarViewAllButton: true,
    dashboardTab: true,
    dashboardAdmin: true,
    dashboardBanUnban: true,
    dashboardPromoteDemote: true,
    dashboardViewAdminLogs: true,
    dashboardViewUsers: true,
    dashboardEditBadges: true,
    dashboardGenerateKeys: true,
    dashboardCollectRankings: true,
    dashboardDarkOrbitAccounts: true,
    dashboardViewSecurityLogs: true,
    dashboardVueGenerale: true,
    dashboardMessages: true,
    dashboardLogsSecurite: true,
    dashboardClesLicence: true,
    dashboardPlanificateur: true,
    dashboardPermissionsAdmin: true,
    dashboardLogs: true,
    couponsTab: true
  })
});

// Clé de stockage (fallback local / cache)
var _vk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
const STORAGE_KEY_BADGE = _vk.VERSION_BADGE || 'darkOrbitVersionBadge';
const STORAGE_KEY_PROFILE = _vk.PROFILE_CACHE || 'darkOrbitProfileCache';

// Badge par défaut (fallback si rien d'autre)
const DEFAULT_BADGE = BADGES.FREE;

// Cache profil Supabase (priorité 1)
let _profileCache = null;
// Cache permissions centralisées (Phase 4)
let _permissionsCache = null;

function setProfileCache(profile) {
  _profileCache = profile;
  if (profile?.badge && BADGE_LEVEL[profile.badge] !== undefined && typeof UnifiedStorage !== 'undefined') {
    UnifiedStorage.set(STORAGE_KEY_BADGE, profile.badge);
  }
}

function getProfileCache() {
  return _profileCache;
}

function setPermissionsCache(perms) {
  _permissionsCache = perms;
}

function getPermissionsCache() {
  return _permissionsCache;
}

/** Pour fallback BackendAPI : retourne l'objet features pour un badge */
function getFeaturesFromBadge(badge) {
  const f = BADGE_FEATURES[badge];
  return f ? { ...f } : null;
}

/** Pour fallback BackendAPI : retourne les tabs pour un badge */
function getTabsFromBadge(badge) {
  return BADGE_TABS[badge] || BADGE_TABS[BADGES.FREE];
}

/**
 * Récupère le badge courant
 * Priorité : 1) Cache permissions RPC  2) Cache profil Supabase  3) localStorage  4) FREE
 */
function getCurrentBadge() {
  try {
    if (_permissionsCache?.badge && BADGE_LEVEL[_permissionsCache.badge] !== undefined) return _permissionsCache.badge;
    if (_profileCache?.badge && BADGE_LEVEL[_profileCache.badge] !== undefined) return _profileCache.badge;
    if (typeof UnifiedStorage !== 'undefined') {
      const stored = UnifiedStorage.get(STORAGE_KEY_BADGE, null);
      if (stored && BADGE_LEVEL[stored] !== undefined) return stored;
    }
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY_BADGE);
      if (stored && BADGE_LEVEL[stored] !== undefined) return stored;
    }
    return DEFAULT_BADGE;
  } catch (e) {
    if (typeof Logger !== 'undefined' && Logger.warn) {
      Logger.warn('[Badges] getCurrentBadge error:', e && e.message ? e.message : e);
    }
    return DEFAULT_BADGE;
  }
}

/**
 * Définit le badge courant (dev/test uniquement)
 * Sera remplacé par le flux auth/Supabase
 */
function setCurrentBadge(badge) {
  if (!BADGE_LEVEL[badge]) return false;
  if (typeof UnifiedStorage !== 'undefined') {
    UnifiedStorage.set(STORAGE_KEY_BADGE, badge);
    return true;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_BADGE, badge);
    return true;
  }
  return false;
}

/**
 * Vérifie si le badge a accès à une fonctionnalité
 */
function hasFeature(badge, featureKey) {
  const features = BADGE_FEATURES[badge];
  if (!features) return false;
  return features[featureKey] === true;
}

/**
 * Vérifie si le badge courant a la fonctionnalité
 * Priorité : cache permissions RPC ( Phase 4 ) puis version-badges local
 */
function currentHasFeature(featureKey) {
  if (_permissionsCache?.features && typeof _permissionsCache.features[featureKey] === 'boolean') {
    return _permissionsCache.features[featureKey] === true;
  }
  return hasFeature(getCurrentBadge(), featureKey);
}

/**
 * Retourne les onglets visibles pour un badge
 * Priorité : cache permissions RPC ( Phase 4 )
 */
function getVisibleTabs(badge) {
  if (_permissionsCache?.tabs && Array.isArray(_permissionsCache.tabs) && _permissionsCache.tabs.length > 0) {
    return _permissionsCache.tabs;
  }
  return BADGE_TABS[badge] || [];
}

/**
 * Vérifie si un badge peut accéder à un onglet
 */
function canAccessTab(badge, tabId) {
  const tabs = BADGE_TABS[badge];
  return tabs ? tabs.includes(tabId) : false;
}

/**
 * Vérifie si le badge courant peut accéder à un onglet
 * Priorité : cache permissions RPC ( Phase 4 )
 */
function currentCanAccessTab(tabId) {
  if (_permissionsCache?.tabs && Array.isArray(_permissionsCache.tabs)) {
    return _permissionsCache.tabs.includes(tabId);
  }
  return canAccessTab(getCurrentBadge(), tabId);
}

/**
 * Vérifie si un badge est >= un autre (hiérarchie)
 */
function hasBadgeOrHigher(badge, minBadge) {
  const level = BADGE_LEVEL[badge];
  const minLevel = BADGE_LEVEL[minBadge];
  if (level === undefined || minLevel === undefined) return false;
  return level >= minLevel;
}

/**
 * Génère le HTML du badge utilisateur (pill coloré)
 * @param {string} badge - FREE, PRO, ADMIN, SUPERADMIN
 * @returns {string} HTML du span badge
 */
function generateUserBadge(badge) {
  const b = (badge || 'FREE').toUpperCase();
  const map = {
    SUPERADMIN: { class: 'user-badge--superadmin', text: 'SA' },
    ADMIN: { class: 'user-badge--admin', text: 'Admin' },
    PRO: { class: 'user-badge--pro', text: 'PRO' },
    FREE: { class: 'user-badge--free', text: 'FREE' }
  };
  const cfg = map[b] || map.FREE;
  return '<span class="user-badge ' + cfg.class + '">' + (cfg.text || b) + '</span>';
}

// Exposition globale (compatibilité et usage futur)
window.BADGES = BADGES;
window.TABS = TABS;
window.BADGE_FEATURES = BADGE_FEATURES;
window.BADGE_TABS = BADGE_TABS;
window.getCurrentBadge = getCurrentBadge;
window.setCurrentBadge = setCurrentBadge;
window.setProfileCache = setProfileCache;
window.getProfileCache = getProfileCache;
window.setPermissionsCache = setPermissionsCache;
window.getPermissionsCache = getPermissionsCache;
window.getFeaturesFromBadge = getFeaturesFromBadge;
window.getTabsFromBadge = getTabsFromBadge;
window.hasFeature = hasFeature;
window.currentHasFeature = currentHasFeature;
window.getVisibleTabs = getVisibleTabs;
window.canAccessTab = canAccessTab;
window.currentCanAccessTab = currentCanAccessTab;
window.hasBadgeOrHigher = hasBadgeOrHigher;
window.generateUserBadge = generateUserBadge;

