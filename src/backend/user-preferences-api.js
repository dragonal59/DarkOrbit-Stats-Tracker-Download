// ==========================================
// API user_preferences + user_darkorbit_accounts (Supabase)
// Remplace localStorage pour active_player, events_hidden, ranking_favorite
//
// Synchro Supabase : setPreferences() utilise un upsert direct sur la table
// user_preferences (avec RLS) plutôt que la RPC upsert_user_preferences.
// Choix volontaire : même résultat, moins de couplage au schéma RPC.
// ==========================================

const UserPreferencesAPI = {
  _cache: null,
  _accountsCache: null,
  _activePlayerCache: { player_id: null, player_server: null, player_pseudo: null },

  setActivePlayerCache(info) {
    this._activePlayerCache = info ? { player_id: info.player_id || null, player_server: info.player_server || null, player_pseudo: info.player_pseudo || null } : { player_id: null, player_server: null, player_pseudo: null };
  },

  async getPreferences() {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return this._cache || { active_player_id: null, active_player_server: null, events_hidden: [], ranking_favorite_server: null };
    try {
      const { data, error } = await supabase.rpc('get_user_preferences');
      if (error) return this._cache || {};
      const row = Array.isArray(data) && data[0] ? data[0] : (data || {});
      this._cache = {
        active_player_id: row.active_player_id || null,
        active_player_server: row.active_player_server || null,
        events_hidden: Array.isArray(row.events_hidden) ? row.events_hidden : [],
        ranking_favorite_server: row.ranking_favorite_server || null
      };
      return this._cache;
    } catch (e) {
      return this._cache || {};
    }
  },

  async setPreferences(partial) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return { success: false };
    try {
      var user = (await supabase.auth.getUser()).data?.user;
      if (!user?.id) return { success: false };
      var existing = (await supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle()).data;
      var row = {
        user_id: user.id,
        active_player_id: partial.active_player_id !== undefined ? (partial.active_player_id || null) : (existing?.active_player_id ?? null),
        active_player_server: partial.active_player_server !== undefined ? (partial.active_player_server || null) : (existing?.active_player_server ?? null),
        events_hidden: partial.events_hidden !== undefined ? (Array.isArray(partial.events_hidden) ? partial.events_hidden : []) : (existing?.events_hidden ?? []),
        ranking_favorite_server: partial.ranking_favorite_server !== undefined ? (partial.ranking_favorite_server || null) : (existing?.ranking_favorite_server ?? null),
        updated_at: new Date().toISOString()
      };
      var res = await supabase.from('user_preferences').upsert(row, { onConflict: 'user_id' });
      if (res.error) return { success: false, error: res.error.message };
      if (partial.active_player_id !== undefined) {
        this._cache = null;
        this._emitActivePlayerChanged();
      }
      if (partial.events_hidden !== undefined && this._cache) this._cache.events_hidden = partial.events_hidden;
      if (partial.ranking_favorite_server !== undefined && this._cache) this._cache.ranking_favorite_server = partial.ranking_favorite_server;
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message };
    }
  },

  async getDarkOrbitAccounts() {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return this._accountsCache || [];
    try {
      const { data, error } = await supabase.rpc('get_user_darkorbit_accounts');
      if (error) return this._accountsCache || [];
      this._accountsCache = Array.isArray(data) ? data : [];
      return this._accountsCache;
    } catch (e) {
      return this._accountsCache || [];
    }
  },

  async upsertDarkOrbitAccount(opts) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return { success: false };
    try {
      const { data, error } = await supabase.rpc('upsert_user_darkorbit_account', {
        p_id: opts.id || null,
        p_player_id: opts.player_id || null,
        p_player_pseudo: opts.player_pseudo || null,
        p_player_server: opts.player_server || 'gbl5',
        p_is_active: !!opts.is_active
      });
      if (error) return { success: false, error: error.message };
      this._accountsCache = null;
      this._emitActivePlayerChanged();
      return data || { success: false };
    } catch (e) {
      return { success: false, error: e?.message };
    }
  },

  async deleteDarkOrbitAccount(id) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return { success: false };
    try {
      const { data, error } = await supabase.rpc('delete_user_darkorbit_account', { p_id: id });
      if (error) return { success: false, error: error.message };
      this._accountsCache = null;
      this._emitActivePlayerChanged();
      return data || { success: false };
    } catch (e) {
      return { success: false, error: e?.message };
    }
  },

  invalidateCache() {
    this._cache = null;
    this._accountsCache = null;
    this.setActivePlayerCache(null);
  },

  async getActivePlayerInfo() {
    const accounts = await this.getDarkOrbitAccounts();
    const active = accounts.find(function (a) { return a.is_active; });
    if (active) {
      const info = { player_id: active.player_id, player_server: active.player_server, player_pseudo: active.player_pseudo };
      this.setActivePlayerCache(info);
      return info;
    }
    const prefs = await this.getPreferences();
    if (prefs.active_player_id || prefs.active_player_server) {
      const info = { player_id: prefs.active_player_id, player_server: prefs.active_player_server, player_pseudo: null };
      this.setActivePlayerCache(info);
      return info;
    }
    if (typeof window.electronPlayerStatsCredentials !== 'undefined' && typeof window.electronPlayerStatsCredentials.getActive === 'function') {
      const el = await window.electronPlayerStatsCredentials.getActive();
      if (el) {
        const info = { player_id: el.player_id, player_server: el.player_server, player_pseudo: el.player_pseudo || el.username };
        this.setActivePlayerCache(info);
        return info;
      }
    }
    this.setActivePlayerCache(null);
    return null;
  },

  getActivePlayerIdSync() {
    return this._activePlayerCache?.player_id || null;
  },

  getActivePlayerInfoSync() {
    const c = this._activePlayerCache;
    if (!c || (!c.player_id && !c.player_pseudo)) return null;
    return { player_id: c.player_id, player_server: c.player_server, player_pseudo: c.player_pseudo };
  },

  /**
   * Retourne le serveur DarkOrbit de l'utilisateur connecté depuis son profil Supabase.
   * Encapsule l'accès direct à profiles.server pour éviter les appels DB bruts depuis le renderer.
   * @returns {Promise<string|null>}
   */
  async getUserServer() {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return null;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user?.id) return null;
      const { data: p } = await supabase.from('profiles').select('server').eq('id', user.id).single();
      return (p?.server || '').toLowerCase() || null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Retourne les IDs d'événements masqués depuis le cache local.
   * @returns {string[]}
   */
  getHiddenEventIds() {
    return (this._cache && Array.isArray(this._cache.events_hidden)) ? this._cache.events_hidden : [];
  },

  /**
   * Met à jour les IDs d'événements masqués dans le cache et persiste via setPreferences.
   * @param {string[]} ids
   */
  setHiddenEventIds(ids) {
    if (!this._cache) this._cache = {};
    this._cache.events_hidden = Array.isArray(ids) ? ids : [];
    this.setPreferences({ events_hidden: this._cache.events_hidden });
  },

  _emitActivePlayerChanged() {
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('darkorbitCredentialsChanged'));
      }
    } catch (e) {}
  }
};

window.UserPreferencesAPI = UserPreferencesAPI;
