// ==========================================
// Auth Manager — Gestion de l'authentification Supabase
// ==========================================

const AuthManager = {
  _listeners: [],

  async login(email, password) {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: 'Supabase non configuré' };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
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
    const { data: profile } = await supabase.from('profiles').select('verification_status, status').eq('id', user.id).single();
    if (profile && (profile.status === 'active' || profile.verification_status != null || profile.status === 'pending')) return { done: false };
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
    const { data: existingSessions } = await supabase.from('user_sessions').select('id').eq('user_id', user.id);
    if (existingSessions && existingSessions.length > 0) {
      await supabase.from('user_sessions').delete().eq('user_id', user.id);
    }
    // Créer la session baseline immédiatement à partir des stats d'inscription (seuil de référence)
    const now = Date.now();
    const sessionDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const pRow = {
      local_id: 'baseline-' + now,
      honor: profileUpdate.initial_honor,
      xp: profileUpdate.initial_xp,
      rank_points: profileUpdate.initial_rank_points,
      next_rank_points: profileUpdate.next_rank_points || 0,
      current_rank: profileUpdate.initial_rank || '',
      note: 'Baseline automatique (inscription)',
      session_date: sessionDate,
      session_timestamp: now,
      is_baseline: true
    };
    const { data: rpcData, error: rpcError } = await supabase.rpc('insert_user_session_secure', { p_row: pRow });
    if (rpcError) return { error: 'Création de la session de référence impossible : ' + rpcError.message };
    if (rpcData && rpcData.success === false) return { error: rpcData.error || 'Erreur lors de la création de la session.' };
    return {};
  },

  async logout() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    var k = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS.VERSION_BADGE : 'darkOrbitVersionBadge';
    if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.remove(k);
    if (typeof BackendAPI !== 'undefined') BackendAPI.invalidateProfileCache();
    if (typeof setProfileCache === 'function') setProfileCache(null);
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
        console.warn('[AuthManager] getValidSession: getUser error', error?.message || error);
        await this.logout();
        return null;
      }
      if (!user) {
        console.warn('[AuthManager] getValidSession: getUser returned no user');
        await this.logout();
        return null;
      }
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (e) {
      console.warn('[AuthManager] getValidSession erreur:', e?.message || e);
      await this.logout();
      return null;
    }
  },

  isAuthenticated() {
    return new Promise((resolve) => {
      this.getSession().then(session => resolve(!!session)).catch(() => resolve(false));
    });
  },

  onAuthStateChange(callback) {
    this._listeners.push(callback);
    const supabase = getSupabaseClient();
    if (supabase) {
      supabase.auth.onAuthStateChange((event, session) => {
        this._notifyListeners(session?.user ?? null);
      });
    }
  },

  _notifyListeners(user) {
    this._listeners.forEach(fn => { try { fn(user); } catch (e) { console.error(e); } });
  }
};

window.AuthManager = AuthManager;
