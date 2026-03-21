// ==========================================
// MODULE: GUARDS (Phase 4)
// Vérifie les permissions avant accès aux routes/sections
// Source : BackendAPI.getPermissionsSync() / version-badges
// ==========================================

const ROUTE_PERMISSIONS = Object.freeze({
  stats: null,
  progression: null,
  history: null,
  settings: null,
  classement: null,
  coupons: 'couponsTab',
  events: 'eventsTab',
  superadmin: 'dashboardTab'
});

/**
 * Vérifie si l'utilisateur peut accéder à une route (onglet)
 * @param {string} routeId - ID de l'onglet (stats, progression, events, superadmin, etc.)
 * @returns {boolean}
 */
function canAccessRoute(routeId) {
  if (!routeId) return false;
  const featureKey = ROUTE_PERMISSIONS[routeId];
  if (featureKey === null) return true;
  if (!featureKey) return false;
  if (typeof BackendAPI !== 'undefined' && BackendAPI.currentCanAccessTab) {
    return BackendAPI.currentCanAccessTab(routeId);
  }
  if (typeof currentCanAccessTab === 'function') {
    return currentCanAccessTab(routeId);
  }
  return false;
}

/**
 * Garde une route : si accès refusé, appelle onDenied
 * @param {string} routeId
 * @param {Function} onDenied - callback si accès refusé (optionnel)
 * @returns {boolean} - true si accès autorisé
 */
function guardRoute(routeId, onDenied) {
  const ok = canAccessRoute(routeId);
  if (!ok && typeof onDenied === 'function') {
    onDenied(routeId);
  }
  return ok;
}

/**
 * Vérifie que l'utilisateur est ADMIN ou SUPERADMIN (pour dashboard)
 */
function canAccessAdminDashboard() {
  if (typeof BackendAPI !== 'undefined' && BackendAPI.getPermissionsSync) {
    const p = BackendAPI.getPermissionsSync();
    const role = p?.role || '';
    const badge = p?.badge || '';
    return ['ADMIN', 'SUPERADMIN'].includes(role) || ['ADMIN', 'SUPERADMIN'].includes(badge);
  }
  return typeof currentCanAccessTab === 'function' && currentCanAccessTab('superadmin');
}

window.canAccessRoute = canAccessRoute;
window.guardRoute = guardRoute;
window.canAccessAdminDashboard = canAccessAdminDashboard;

