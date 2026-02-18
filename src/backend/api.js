// ==========================================
// BACKEND API — Façade pour le frontend
// Source de vérité : Supabase get_user_permissions (fallback version-badges.js)
// ==========================================

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PERMISSIONS_CACHE_TTL_MS = 5 * 60 * 1000;

const BackendAPI = {
  _profileCache: null,
  _profileCacheTime: 0,
  _permissionsCache: null,
  _permissionsCacheTime: 0,

  async loadUserProfile() {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) {
      console.log('[BackendAPI] loadUserProfile: Supabase non disponible → fallback localStorage');
      return this._syncFromLocalStorage();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[BackendAPI] loadUserProfile: Pas d\'utilisateur connecté → fallback localStorage');
      return this._syncFromLocalStorage();
    }
    const now = Date.now();
    if (this._profileCache && now - this._profileCacheTime < PROFILE_CACHE_TTL_MS) {
      return this._profileCache;
    }
    var badgeKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VERSION_BADGE) ? CONFIG.STORAGE_KEYS.VERSION_BADGE : 'darkOrbitVersionBadge';
    const prevBadge = typeof UnifiedStorage !== 'undefined' ? UnifiedStorage.get(badgeKey, null) : null;
    try {
      console.log('[BackendAPI] Requête profiles pour user.id=', user.id);
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) {
        const errMsg = error?.message || '';
        const errCode = error?.code || '';
        const isRecursion = errMsg.includes('infinite recursion') || errCode === '42P01' || (error?.code && String(error.code).includes('500'));
        console.error('[BackendAPI] Erreur Supabase profiles:', { message: errMsg, code: errCode, details: error?.details, hint: error?.hint });
        if (isRecursion || errMsg.includes('500') || errCode === '42P01') {
          console.warn('[BackendAPI] Fallback localStorage (erreur RLS ou serveur) - profil par défaut FREE');
          const fallback = { badge: 'FREE', role: 'USER', status: 'active' };
          if (typeof setProfileCache === 'function') setProfileCache(fallback);
          if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.set(badgeKey || 'darkOrbitVersionBadge', 'FREE');
          this._profileCache = fallback;
          this._profileCacheTime = now;
          return fallback;
        }
        return this._syncFromLocalStorage();
      }
      if (!profile) {
        console.log('[BackendAPI] loadUserProfile: Profil vide pour user.id=' + user.id + ' → fallback localStorage');
        return this._syncFromLocalStorage();
      }
      console.log('[BackendAPI] loadUserProfile: Profil chargé OK (badge=' + (profile.badge || 'FREE') + ')');
      const p = { badge: profile.badge || 'FREE', role: profile.role, status: profile.status || 'active' };
      if (typeof setProfileCache === 'function') setProfileCache(p);
      if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.set((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VERSION_BADGE) || 'darkOrbitVersionBadge', p.badge);
      this._profileCache = p;
      this._profileCacheTime = now;
      if (prevBadge && prevBadge !== 'FREE' && prevBadge !== p.badge && typeof UnifiedStorage !== 'undefined') {
        UnifiedStorage.set((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.MIGRATION_HINT) || 'darkOrbitMigrationHint', { had: prevBadge, now: p.badge });
      }
      return p;
    } catch (e) {
      console.error('[BackendAPI] Exception profiles:', e?.message || e, e);
      console.warn('[BackendAPI] Fallback localStorage - profil par défaut FREE');
      const fallback = { badge: 'FREE', role: 'USER', status: 'active' };
      if (typeof setProfileCache === 'function') setProfileCache(fallback);
      if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.set((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VERSION_BADGE) || 'darkOrbitVersionBadge', 'FREE');
      this._profileCache = fallback;
      this._profileCacheTime = Date.now();
      return fallback;
    }
  },

  _syncFromLocalStorage() {
    const badgeKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VERSION_BADGE) ? CONFIG.STORAGE_KEYS.VERSION_BADGE : 'darkOrbitVersionBadge';
    const stored = typeof UnifiedStorage !== 'undefined' ? UnifiedStorage.get(badgeKey, null) : localStorage?.getItem(badgeKey);
    const badge = stored && ['FREE', 'PRO', 'ADMIN', 'SUPERADMIN'].includes(stored) ? stored : 'FREE';
    const p = { badge, role: null, status: 'active' };
    if (typeof setProfileCache === 'function') setProfileCache(p);
    this._profileCache = p;
    this._profileCacheTime = Date.now();
    return p;
  },

  getUserProfile() {
    return this._profileCache || (typeof getProfileCache === 'function' ? getProfileCache() : null);
  },

  getUserBadge() {
    const p = this.getUserProfile();
    if (p?.badge) return p.badge;
    return typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
  },

  invalidateProfileCache() {
    this._profileCache = null;
    this._profileCacheTime = 0;
    this._permissionsCache = null;
    this._permissionsCacheTime = 0;
  },

  /**
   * Récupère les permissions centralisées côté serveur (Phase 4)
   * Retourne { badge, role, status, features, tabs, limits, source }
   */
  async getPermissions() {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    const now = Date.now();
    if (this._permissionsCache && now - this._permissionsCacheTime < PERMISSIONS_CACHE_TTL_MS) {
      return this._permissionsCache;
    }
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase.rpc('get_user_permissions', { p_user_id: user.id });
        if (!error && data) {
          this._permissionsCache = data;
          this._permissionsCacheTime = now;
          if (typeof setProfileCache === 'function') {
            setProfileCache({ badge: data.badge, role: data.role, status: data.status });
          }
          if (typeof setPermissionsCache === 'function') setPermissionsCache(data);
          return data;
        }
      }
    }
    const fallback = this._buildPermissionsFallback();
    this._permissionsCache = fallback;
    this._permissionsCacheTime = now;
    return fallback;
  },

  _buildPermissionsFallback() {
    const badge = this.getUserBadge();
    const p = this.getUserProfile();
    if (typeof getFeaturesFromBadge === 'function' && typeof getTabsFromBadge === 'function') {
      const features = getFeaturesFromBadge(badge);
      const tabs = getTabsFromBadge(badge);
      const limits = { maxSessions: -1, exportFormats: badge === 'FREE' ? ['json'] : ['json', 'csv'] };
      return {
        badge,
        role: p?.role || 'USER',
        status: p?.status || 'active',
        features: features || {},
        tabs: tabs || ['stats', 'progression', 'history', 'settings'],
        limits,
        source: 'fallback'
      };
    }
    return {
      badge: badge || 'FREE',
      role: 'USER',
      status: 'active',
      features: {},
      tabs: ['stats', 'progression', 'history', 'settings'],
      limits: { maxSessions: -1, exportFormats: ['json'] },
      source: 'default'
    };
  },

  getPermissionsSync() {
    if (typeof getPermissionsCache === 'function') {
      const c = getPermissionsCache();
      if (c) return c;
    }
    return this._permissionsCache || this._buildPermissionsFallback();
  },

  getCurrentBadge: () => (typeof getCurrentBadge === 'function' ? getCurrentBadge() : null),
  setCurrentBadge: (badge) => (typeof setCurrentBadge === 'function' ? setCurrentBadge(badge) : false),
  currentHasFeature: (key) => (typeof currentHasFeature === 'function' ? currentHasFeature(key) : false),
  currentCanAccessTab: (tabId) => (typeof currentCanAccessTab === 'function' ? currentCanAccessTab(tabId) : false),
  getVisibleTabs: () => (typeof getVisibleTabs === 'function' && typeof getCurrentBadge === 'function' ? getVisibleTabs(getCurrentBadge()) : [])
};

window.BackendAPI = BackendAPI;
console.log('🔌 Backend API façade chargée');
