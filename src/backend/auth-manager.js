// ==========================================
// Auth Manager — Gestion de l'authentification Supabase
// ==========================================

const AuthManager = {
  _listeners: [],
  // Subscription Supabase unique — créée une seule fois dans _ensureSupabaseSubscription().
  // Stockée ici pour pouvoir appeler unsubscribe() via destroy().
  _supabaseSubscription: null,

  async login(email, password) {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Supabase non configuré' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data && data.user && data.user.id) {
      try {
        await supabase.rpc('update_last_seen');
      } catch (e) {}
    }
    return { data };
  },

  async register(email, password, registrationData = {}) {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Supabase non configuré' };
    const meta = {
      username: registrationData.game_pseudo || email.split('@')[0],
      game_pseudo: registrationData.game_pseudo,
      server: registrationData.server,
      company: registrationData.company,
      initial_honor: registrationData.initial_honor,
      initial_xp: registrationData.initial_xp,
      initial_rank: registrationData.initial_rank,
      initial_rank_points: registrationData.initial_rank_points,
      next_rank_points: registrationData.next_rank_points
    };
    var base = (typeof window !== 'undefined' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.authRedirectBase) ? window.SUPABASE_CONFIG.authRedirectBase : null;
    var emailRedirectTo = base ? (base.replace(/\/$/, '') + '/confirm-email.html') : (typeof window !== 'undefined' && window.location ? new URL('confirm-email.html', window.location.href).href : undefined);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        emailRedirectTo: emailRedirectTo
      }
    });
    if (error) return { error: error.message };
    if (data.session) {
      const done = await this._afterSignUpComplete(supabase, data.user, meta);
      if (done.error) return { error: done.error };
      return { data, redirectPending: true };
    }
    return { data };
  },

  /**
   * À appeler au chargement de l'app si l'utilisateur a une session mais le profil
   * n'a pas encore été rempli (cas confirmation email). Complète profil + session baseline.
   */
  async completeRegistrationFromMetadata() {
    const supabase = getSupabaseClient();
    if (!supabase) return { done: false };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !user.user_metadata || !user.user_metadata.game_pseudo) return { done: false };
    const { data: profile } = await supabase.from('profiles').select('verification_status, status, badge').eq('id', user.id).single();
    if (profile && (profile.badge != null || profile.status === 'active' || profile.verification_status != null || profile.status === 'pending')) return { done: false };
    const meta = {
      game_pseudo: user.user_metadata.game_pseudo,
      server: user.user_metadata.server,
      company: user.user_metadata.company,
      initial_honor: user.user_metadata.initial_honor,
      initial_xp: user.user_metadata.initial_xp,
      initial_rank: user.user_metadata.initial_rank,
      initial_rank_points: user.user_metadata.initial_rank_points,
      next_rank_points: user.user_metadata.next_rank_points
    };
    const done = await this._afterSignUpComplete(supabase, user, meta);
    if (done.error) return { done: false, error: done.error };
    if (typeof BackendAPI !== 'undefined') BackendAPI.invalidateProfileCache();
    return { done: true };
  },

  async _afterSignUpComplete(supabase, user, meta) {
    const profileUpdate = {
      game_pseudo: meta.game_pseudo || null,
      server: meta.server || null,
      company: meta.company || null,
      initial_honor: meta.initial_honor != null ? Number(meta.initial_honor) : 0,
      initial_xp: meta.initial_xp != null ? Number(meta.initial_xp) : 0,
      initial_rank: meta.initial_rank || null,
      initial_rank_points: meta.initial_rank_points != null ? Number(meta.initial_rank_points) : 0,
      next_rank_points: meta.next_rank_points != null ? Number(meta.next_rank_points) : null,
      verification_status: 'pending',
      status: 'pending'
    };
    const { error: updateError } = await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
    if (updateError) return { error: 'Mise à jour du profil impossible : ' + updateError.message };
    // Si l'utilisateur a déjà des stats (inscription avec initial_*), supprimer toutes les sessions existantes avant de créer la baseline
    var delRes = await supabase.rpc('delete_all_sessions_for_current_user');
    if (delRes.error) {
      return { error: 'Impossible de réinitialiser les sessions : ' + (delRes.error.message || String(delRes.error)) };
    }
    const now = Date.now();
    const sessionDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    let honor, xp, rankPoints, nextRankPoints, currentRank;
    try {
      const pending = typeof localStorage !== 'undefined' ? localStorage.getItem('pending_baseline_scan') : null;
      if (pending) {
        if (window.DEBUG) Logger.debug('[AuthManager] pending_baseline_scan trouvé:', pending);
        const scan = JSON.parse(pending);
        honor = scan.initial_honor != null ? Number(scan.initial_honor) : 0;
        xp = scan.initial_xp != null ? Number(scan.initial_xp) : 0;
        rankPoints = scan.initial_rank_points != null ? Number(scan.initial_rank_points) : 0;
        nextRankPoints = scan.next_rank_points != null ? Number(scan.next_rank_points) : rankPoints;
        currentRank = (scan.initial_rank || '').toString().trim();
      }
    } catch (e) {}
    if (honor === undefined) {
      honor = profileUpdate.initial_honor;
      xp = profileUpdate.initial_xp;
      rankPoints = profileUpdate.initial_rank_points;
      nextRankPoints = profileUpdate.next_rank_points || 0;
      currentRank = profileUpdate.initial_rank || '';
    }
    const pRow = {
      local_id: 'baseline-' + now,
      honor,
      xp,
      rank_points: rankPoints,
      next_rank_points: nextRankPoints || 0,
      current_rank: currentRank,
      note: 'Base (scan inscription)',
      session_date: sessionDate,
      session_timestamp: now,
      is_baseline: true
    };
    const { data: rpcData, error: rpcError } = await supabase.rpc('insert_user_session_secure', { p_row: pRow });
    if (rpcError) return { error: 'Création de la session de référence impossible : ' + rpcError.message };
    if (rpcData && rpcData.success === false) return { error: rpcData.error || 'Erreur lors de la création de la session.' };
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('pending_baseline_scan'); } catch (e) {}
    return {};
  },

  async logout() {
    const supabase = getSupabaseClient();
    var userId = null;
    if (supabase) {
      try {
        const r = await supabase.auth.getUser();
        userId = r && r.data && r.data.user ? r.data.user.id : null;
      } catch (_) {}
      try {
        if (userId && typeof window !== 'undefined' && typeof window.persistBelowRankCacheForUser === 'function') {
          window.persistBelowRankCacheForUser(userId);
        }
      } catch (_) {}
      await supabase.auth.signOut();
    }
    if (typeof UnifiedStorage !== 'undefined') {
      const sk = window.APP_KEYS?.STORAGE_KEYS || {};
      // Ne rien garder par défaut : toutes les clés APP_KEYS.STORAGE_KEYS sont des données métier ou profil.
      // (Les « joueurs suivis » sont stockés sous clés globales non namespacées par user_id et ne sont pas
      // persistés dans user_settings — les conserver au logout / changement de compte provoquait une fuite
      // vers le compte suivant sur la même machine.)
      const keepDeviceGlobal = new Set(
        (typeof window.APP_KEYS?.LOGOUT_KEEP_STORAGE_KEYS === 'function')
          ? window.APP_KEYS.LOGOUT_KEEP_STORAGE_KEYS()
          : []
      );
      Object.values(sk).forEach((key) => {
        if (typeof key === 'string' && !keepDeviceGlobal.has(key)) UnifiedStorage.remove(key);
      });
    }
    if (typeof setSessionsCache === 'function') setSessionsCache([]);
    if (typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.invalidateCache) UserPreferencesAPI.invalidateCache();
    // Important : on ne supprime pas `darkOrbit_lastUserId`.
    // `ensureUserDataIsolation()` l’utilise pour détecter un changement de compte et purger les données
    // uniquement quand on n’est pas revenu au même user.
    if (typeof BackendAPI !== 'undefined') BackendAPI.invalidateProfileCache();
    if (typeof setProfileCache === 'function') setProfileCache(null);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('userLoggedOut'));
    this._notifyListeners(null);
  },

  async getCurrentUser() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async getSession() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  /**
   * Valide la session côté serveur (getUser). À utiliser au démarrage pour détecter
   * un token invalide ou un utilisateur supprimé côté Supabase.
   * Retourne la session seulement si l'utilisateur existe encore.
   */
  async getValidSession() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        Logger.warn('[AuthManager] getValidSession: getUser error', error?.message || error);
        const isAuthFailure = error.status === 401 || error.status === 403 || error.status === 404;
        if (isAuthFailure) await this.logout();
        return null;
      }
      if (!user) {
        Logger.warn('[AuthManager] getValidSession: getUser returned no user');
        await this.logout();
        return null;
      }
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (e) {
      Logger.warn('[AuthManager] getValidSession erreur réseau:', e?.message || e);
      return null;
    }
  },

  isAuthenticated() {
    return new Promise((resolve) => {
      this.getSession().then(session => resolve(!!session)).catch(() => resolve(false));
    });
  },

  async ensureUserDataIsolation(user) {
    if (!user || !user.id) return;
    const lastUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('darkOrbit_lastUserId') : null;
    const currentUserId = user.id;
    if (lastUserId !== currentUserId) {
      if (typeof UnifiedStorage !== 'undefined') {
        const sk = window.APP_KEYS?.STORAGE_KEYS || {};
        // Purger quoi qu'il arrive sur un changement de compte (zéro fuite),
        // sauf les clés explicitement "machine".
        const machineKeys = new Set([
          sk.THEME,
          sk.VIEW_MODE,
          sk.THEME_AUTO,
          sk.LANGUAGE,
          sk.LAST_APP_VERSION_ACK
        ]);
        Object.values(sk).forEach((key) => {
          if (typeof key !== 'string') return;
          if (!machineKeys.has(key)) UnifiedStorage.remove(key);
        });
      }
      if (typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.invalidateCache) UserPreferencesAPI.invalidateCache();
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem('darkOrbit_lastUserId', currentUserId);
  },

  /**
   * Garantit qu'une unique subscription Supabase est active.
   * Idempotent : sans effet si la subscription existe déjà.
   * @private
   */
  _ensureSupabaseSubscription() {
    if (this._supabaseSubscription) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      this._notifyListeners(session?.user ?? null);
    });
    this._supabaseSubscription = subscription;
  },

  /**
   * Enregistre un callback appelé à chaque changement d'état d'authentification.
   * Chaque appelant DOIT appeler offAuthStateChange(callback) au cleanup pour
   * éviter l'accumulation de listeners et les appels sur des composants détruits.
   *
   * @param {function(user: object|null): void} callback
   */
  onAuthStateChange(callback) {
    if (typeof callback !== 'function') return;
    this._listeners.push(callback);
    this._ensureSupabaseSubscription();
  },

  /**
   * Retire un callback précédemment enregistré via onAuthStateChange().
   * Si _listeners devient vide, la subscription Supabase est résiliée
   * pour libérer les ressources.
   *
   * @param {function} callback — la même référence de fonction passée à onAuthStateChange()
   */
  offAuthStateChange(callback) {
    this._listeners = this._listeners.filter(fn => fn !== callback);
    if (this._listeners.length === 0 && this._supabaseSubscription) {
      try { this._supabaseSubscription.unsubscribe(); } catch (_) {}
      this._supabaseSubscription = null;
    }
  },

  /**
   * Résilie toutes les subscriptions et vide les listeners.
   * À appeler lors d'un hot-reload ou dans les tests.
   */
  destroy() {
    this._listeners = [];
    if (this._supabaseSubscription) {
      try { this._supabaseSubscription.unsubscribe(); } catch (_) {}
      this._supabaseSubscription = null;
    }
  },

  _notifyListeners(user) {
    this._listeners.forEach(fn => { try { fn(user); } catch (e) { Logger.error(e); } });
  }
};

window.AuthManager = AuthManager;
