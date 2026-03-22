// ==========================================
// BACKEND API — Façade pour le frontend
// Source de vérité : Supabase get_user_permissions (fallback version-badges.js)
// ==========================================

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PERMISSIONS_CACHE_TTL_MS = 5 * 60 * 1000;
const PERMISSIONS_STORAGE_KEY = 'userPermissionsCache';
const PERMISSIONS_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;

const BackendAPI = {
  _profileCache: null,
  _profileCacheTime: 0,
  _permissionsCache: null,
  _permissionsCacheTime: 0,

  async loadUserProfile() {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) {
      return this._syncFromLocalStorage();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return this._syncFromLocalStorage();
    }
    const now = Date.now();
    if (this._profileCache && now - this._profileCacheTime < PROFILE_CACHE_TTL_MS) {
      return this._profileCache;
    }
    var badgeKey = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VERSION_BADGE) ? CONFIG.STORAGE_KEYS.VERSION_BADGE : 'darkOrbitVersionBadge';
    const prevBadge = typeof UnifiedStorage !== 'undefined' ? UnifiedStorage.get(badgeKey, null) : null;
    try {
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error) {
        const errMsg = error?.message || '';
        const errCode = error?.code || '';
        // Si la ligne `profiles` n'existe pas encore (ex: trigger pas exécuté, ou utilisateur fraîchement créé),
        // la lecture `.single()` peut échouer. Dans ce cas on ne doit pas forcer FREE :
        // on récupère le badge via le RPC centralisé `get_user_permissions`.
        const isNoProfileRow = errCode === 'PGRST116' || errCode === '406' || errMsg.includes('JSON object requested') || errMsg.includes('multiple (or no) rows returned') || errMsg.toLowerCase().includes('not acceptable');
        if (isNoProfileRow) {
          try {
            const { data: permsData, error: permsErr } = await supabase.rpc('get_user_permissions', { p_user_id: user.id });
            if (!permsErr && permsData) {
              const inferredBadge = permsData.badge || 'FREE';
              const inferredStatus = permsData.status || 'active';
              const inferredRole = permsData.role || 'USER';
              const subscription_status = inferredBadge === 'FREE' ? 'free' : (permsData.subscription_status || 'pro');

              const p = {
                badge: inferredBadge,
                role: inferredRole,
                status: inferredStatus,
                subscription_status,
                trial_expires_at: null
              };
              if (typeof setProfileCache === 'function') setProfileCache(p);
              if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.set((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VERSION_BADGE) || 'darkOrbitVersionBadge', inferredBadge);
              this._profileCache = p;
              this._profileCacheTime = now;
              return p;
            }
          } catch (rpcE) {
            // On retombe sur la logique existante ci-dessous.
          }
        }
        const isRecursion = errMsg.includes('infinite recursion') || errCode === '42P01' || (error?.code && String(error.code).includes('500'));
        Logger.error('[BackendAPI] Erreur Supabase profiles:', { message: errMsg, code: errCode, details: error?.details, hint: error?.hint });
        if (isRecursion || errMsg.includes('500') || errCode === '42P01') {
          Logger.warn('[BackendAPI] Fallback localStorage (erreur RLS ou serveur) - profil par défaut FREE');
          const fallback = { badge: 'FREE', role: 'USER', status: 'active', subscription_status: 'free', trial_expires_at: null };
          if (typeof setProfileCache === 'function') setProfileCache(fallback);
          if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.set(badgeKey || 'darkOrbitVersionBadge', 'FREE');
          this._profileCache = fallback;
          this._profileCacheTime = now;
          return fallback;
        }
        return this._syncFromLocalStorage();
      }
      if (!profile) {
        return this._syncFromLocalStorage();
      }
      const p = {
        badge: profile.badge || 'FREE',
        role: profile.role,
        status: profile.status || 'active',
        subscription_status: profile.subscription_status || 'free',
        trial_expires_at: profile.trial_expires_at || null
      };
      if (typeof setProfileCache === 'function') setProfileCache(p);
      if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.set((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VERSION_BADGE) || 'darkOrbitVersionBadge', p.badge);
      this._profileCache = p;
      this._profileCacheTime = now;
      if (prevBadge && prevBadge !== 'FREE' && prevBadge !== p.badge && typeof UnifiedStorage !== 'undefined') {
        UnifiedStorage.set((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.MIGRATION_HINT) || 'darkOrbitMigrationHint', { had: prevBadge, now: p.badge });
      }
      return p;
    } catch (e) {
      Logger.error('[BackendAPI] Exception profiles:', e?.message || e, e);
      // Dernier recours : le RPC `get_user_permissions` peut fonctionner même si la ligne `profiles`
      // n'est pas encore disponible / lisible.
      try {
        const { data: permsData, error: permsErr } = await supabase.rpc('get_user_permissions', { p_user_id: user.id });
        if (!permsErr && permsData) {
          const inferredBadge = permsData.badge || 'FREE';
          const inferredStatus = permsData.status || 'active';
          const inferredRole = permsData.role || 'USER';
          const subscription_status = inferredBadge === 'FREE' ? 'free' : (permsData.subscription_status || 'pro');
          const p = {
            badge: inferredBadge,
            role: inferredRole,
            status: inferredStatus,
            subscription_status,
            trial_expires_at: null
          };
          if (typeof setProfileCache === 'function') setProfileCache(p);
          if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.set((typeof CONFIG !== 'undefined' && CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.VERSION_BADGE) || 'darkOrbitVersionBadge', inferredBadge);
          this._profileCache = p;
          this._profileCacheTime = Date.now();
          return p;
        }
      } catch (_) {}

      Logger.warn('[BackendAPI] Fallback localStorage - profil par défaut FREE');
      const fallback = { badge: 'FREE', role: 'USER', status: 'active', subscription_status: 'free', trial_expires_at: null };
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
    const p = { badge, role: null, status: 'active', subscription_status: 'free', trial_expires_at: null };
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
  async getPermissions(forceRefresh) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    const now = Date.now();
    const force = !!forceRefresh;
    if (!force && this._permissionsCache && now - this._permissionsCacheTime < PERMISSIONS_CACHE_TTL_MS) {
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
          if (typeof UnifiedStorage !== 'undefined' && data.source === 'supabase') {
            try {
              UnifiedStorage.set(PERMISSIONS_STORAGE_KEY, { data: data, timestamp: now });
            } catch (_) {}
          }
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
    if (typeof UnifiedStorage !== 'undefined') {
      try {
        const cached = UnifiedStorage.get(PERMISSIONS_STORAGE_KEY, null);
        if (cached && cached.data && cached.timestamp && (Date.now() - cached.timestamp) < PERMISSIONS_STORAGE_TTL_MS) {
          return cached.data;
        }
      } catch (_) {}
    }
    if (typeof getFeaturesFromBadge === 'function' && typeof getTabsFromBadge === 'function') {
      const features = getFeaturesFromBadge(badge);
      const tabs = getTabsFromBadge(badge);
      const limits = { maxSessions: -1, exportFormats: badge === 'FREE' ? ['json'] : ['json', 'csv'] };
      return {
        badge,
        role: p?.role || 'USER',
        status: p?.status || 'active',
        features: features || {},
        tabs: tabs || ['stats', 'history', 'settings'],
        limits,
        source: 'fallback'
      };
    }
    return {
      badge: badge || 'FREE',
      role: 'USER',
      status: 'active',
      features: {},
      tabs: ['stats', 'history', 'settings'],
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
