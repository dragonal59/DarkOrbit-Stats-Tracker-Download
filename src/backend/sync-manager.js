// ==========================================
// SYNC MANAGER (Phase 5)
// Synchronisation bidirectionnelle localStorage ↔ Supabase
// Écriture locale en priorité, sync en arrière-plan
// ==========================================

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const SYNC_THROTTLE_MS = 15000; // Min. 15 s entre deux syncs déclenchées par queueSync (rate limiting client)
var _k = typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS ? window.APP_KEYS.STORAGE_KEYS : {};
const MIGRATION_DONE_KEY = _k.MIGRATION_DONE || 'darkOrbitDataMigrated';
const LAST_SYNC_KEY = _k.LAST_SYNC || 'darkOrbitLastSync';
const PENDING_SYNC_KEY = _k.PENDING_SYNC || 'darkOrbitPendingSync';

const DataSync = {
  _intervalId: null,
  _migrating: false,
  _lastQueueSyncAt: 0,

  /**
   * Vérifie si Supabase est disponible et l'utilisateur connecté
   */
  isReady() {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return false;
    return true;
  },

  /**
   * Récupère l'user_id courant (nécessite session)
   */
  async getUserId() {
    const supabase = this.isReady() ? getSupabaseClient() : null;
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  },

  /**
   * Migration initiale : localStorage → Supabase (au premier lancement post-auth).
   * Pour les comptes existants : si le profil a des initial_* mais pas de baseline, en crée une.
   */
  async migrateIfNeeded() {
    if (typeof UnifiedStorage === 'undefined') return false;
    if (UnifiedStorage.get(MIGRATION_DONE_KEY, false)) return false;
    const userId = await this.getUserId();
    if (!userId) return false;
    this._migrating = true;
    try {
      await this._migrateSessions(userId);
      await this._migrateEvents(userId);
      await this._migrateSettings(userId);
      await this._ensureBaselineFromProfileIfNeeded(userId);
      UnifiedStorage.set(MIGRATION_DONE_KEY, true);
      if (typeof showToast === 'function') showToast('Données migrées vers le cloud.', 'success');
      return true;
    } catch (e) {
      console.error('Migration erreur:', e);
      if (typeof showToast === 'function') showToast('Migration reportée.', 'warning');
      return false;
    } finally {
      this._migrating = false;
    }
  },

  /**
   * Si le profil a des stats d'inscription (initial_*) et qu'aucune baseline n'existe côté serveur,
   * crée une session baseline à partir de ces valeurs (correction comptes existants).
   */
  async _ensureBaselineFromProfileIfNeeded(userId) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const { data: profile, error: profileErr } = await supabase.from('profiles').select('initial_honor, initial_xp, initial_rank, initial_rank_points, next_rank_points').eq('id', userId).single();
      if (profileErr || !profile) return;
      const hasInitial = profile.initial_honor != null || profile.initial_xp != null;
      if (!hasInitial) return;
      const { data: sessions, error: sessionsErr } = await supabase.from('user_sessions').select('id, is_baseline').eq('user_id', userId);
      if (sessionsErr) return;
      const hasBaseline = sessions && sessions.some(function(s) { return s.is_baseline === true; });
      if (hasBaseline) return;
      const now = Date.now();
      const sessionDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const pRow = {
        local_id: 'baseline-migration-' + now,
        honor: Number(profile.initial_honor) || 0,
        xp: Number(profile.initial_xp) || 0,
        rank_points: Number(profile.initial_rank_points) || 0,
        next_rank_points: Number(profile.next_rank_points) || 0,
        current_rank: profile.initial_rank || '',
        note: 'Baseline automatique (migration)',
        session_date: sessionDate,
        session_timestamp: now,
        is_baseline: true
      };
      const { data: rpcData, error: rpcError } = await supabase.rpc('insert_user_session_secure', { p_row: pRow });
      if (!rpcError && rpcData && rpcData.success) {
        console.log('[DataSync] Baseline créée depuis le profil (migration).');
      }
    } catch (e) {
      console.warn('[DataSync] _ensureBaselineFromProfileIfNeeded:', e?.message || e);
    }
  },

  _sessionToRow(s, userId, localId) {
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    // local_id doit être une chaîne non vide pour la contrainte UNIQUE(user_id, local_id)
    const safeLocalId = (localId != null && String(localId).trim() !== '') ? String(localId) : 'local-' + (s.timestamp || Date.now());
    return {
      user_id: userId,
      local_id: safeLocalId,
      honor: num(s.honor),
      xp: num(s.xp),
      rank_points: num(s.rankPoints),
      next_rank_points: num(s.nextRankPoints),
      current_rank: s.currentRank || null,
      note: s.note || null,
      session_date: s.date || null,
      session_timestamp: num(s.timestamp) || Date.now(),
      is_baseline: !!s.is_baseline
    };
  },

  async _migrateSessions(userId) {
    const sessions = UnifiedStorage.get((_k.SESSIONS) || 'darkOrbitSessions', []);
    if (sessions.length === 0) return;
    const supabase = getSupabaseClient();
    const byId = new Map();
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      let lid = s.id != null && String(s.id).trim() !== '' ? String(s.id) : null;
      if (!lid) {
        lid = 's-' + (s.timestamp || Date.now()) + '-' + i + '-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
      }
      byId.set(lid, s);
    }
    const rowsToSync = byId.size;
    console.log('[DataSync] Sync user_sessions:', rowsToSync, 'session(s)');
    for (const [lid, s] of byId.entries()) {
      const row = this._sessionToRow(s, userId, lid);
      try {
        const { data, error } = await supabase.rpc('upsert_user_session_secure', { p_row: row });
        if (error) {
          console.error('[DataSync] Erreur Supabase user_sessions:', { message: error.message, code: error.code });
          throw error;
        }
        if (data && data.success === false) {
          const msg = data.error || 'Erreur de synchronisation des sessions.';
          if (typeof showToast === 'function') showToast(msg, 'error');
          throw new Error(msg);
        }
      } catch (e) {
        console.error('[DataSync] Exception user_sessions:', e);
        throw e;
      }
    }
  },

  async _migrateEvents(userId) {
    const events = UnifiedStorage.get((_k.EVENTS) || 'darkOrbitEvents', []);
    if (events.length === 0) return;
    const supabase = getSupabaseClient();
    for (const e of events) {
      const row = {
        user_id: userId,
        local_id: String(e.id),
        event_data: e
      };
      await supabase.from('user_events').upsert(row, { onConflict: 'user_id,local_id', ignoreDuplicates: false });
    }
  },

  async _migrateSettings(userId) {
    const supabase = getSupabaseClient();
    var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
    const settings = UnifiedStorage.get(sk.SETTINGS || 'darkOrbitSettings', {});
    const links = UnifiedStorage.get(sk.CUSTOM_LINKS || 'darkOrbitCustomLinks', null);
    const importedRankings = UnifiedStorage.get(sk.IMPORTED_RANKINGS || 'darkOrbitImportedRankings', {});
    const boosterConfig = UnifiedStorage.get(sk.BOOSTERS || 'darkOrbitBoosters', {});
    const currentStats = UnifiedStorage.get(sk.CURRENT_STATS || 'darkOrbitCurrentStats', {});
    const theme = localStorage?.getItem(sk.THEME || 'darkOrbitTheme') || 'dark';
    const viewMode = localStorage?.getItem(sk.VIEW_MODE || 'darkOrbitViewMode') || 'detailed';

    const row = {
      user_id: userId,
      settings_json: settings,
      links_json: Array.isArray(links) ? links : [],
      imported_rankings_json: importedRankings && typeof importedRankings === 'object' ? importedRankings : {},
      booster_config_json: boosterConfig,
      current_stats_json: currentStats,
      theme,
      view_mode: viewMode,
      updated_at: new Date().toISOString()
    };
    await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
  },

  /**
   * Sync des paramètres uniquement (rapide). Appelé immédiatement après un changement d'option.
   */
  async syncSettingsOnly() {
    if (!this.isReady() || this._migrating) return { success: false, reason: 'not_ready' };
    const userId = await this.getUserId();
    if (!userId) return { success: false, reason: 'no_user' };
    try {
      await this._migrateSettings(userId);
      if (typeof clearSettingsDirtyFlag === 'function') clearSettingsDirtyFlag();
      return { success: true };
    } catch (e) {
      console.warn('[DataSync] syncSettingsOnly erreur:', e?.message || e);
      return { success: false, error: e?.message };
    }
  },

  /**
   * Push : envoie les données locales vers Supabase
   */
  async sync() {
    if (!this.isReady() || this._migrating) return { success: false, reason: 'not_ready' };
    const userId = await this.getUserId();
    if (!userId) return { success: false, reason: 'no_user' };
    try {
      await this._migrateSessions(userId);
      await this._migrateEvents(userId);
      await this._migrateSettings(userId);
      if (typeof clearSettingsDirtyFlag === 'function') clearSettingsDirtyFlag();
      if (typeof UnifiedStorage !== 'undefined') {
        UnifiedStorage.set(LAST_SYNC_KEY, Date.now());
      }
      console.log('[DataSync] Sync OK');
      return { success: true };
    } catch (e) {
      console.error('[DataSync] Sync erreur:', { message: e?.message, error: e });
      return { success: false, error: e?.message };
    }
  },

  /**
   * Pull : récupère les données Supabase et fusionne avec le local.
   * Stratégie : dernier écrit gagne (server wins par défaut, puis merge intelligent).
   * Après merge, on rafraîchit l'UI (historique, événements, progression, stats, baseline).
   */
  async pull() {
    if (!this.isReady()) return { success: false, reason: 'not_ready' };
    const userId = await this.getUserId();
    if (!userId) return { success: false, reason: 'no_user' };
    const supabase = getSupabaseClient();
    try {
      const { data: sessions, error: sessionsErr } = await supabase.from('user_sessions').select('*').eq('user_id', userId).order('session_timestamp', { ascending: false });
      if (sessionsErr) console.error('[DataSync] Pull user_sessions erreur:', sessionsErr);
      const { data: events, error: eventsErr } = await supabase.from('user_events').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (eventsErr) console.error('[DataSync] Pull user_events erreur:', eventsErr);
      if (events && events.length > 0) {
        console.log('[DataSync] user_events bruts (' + events.length + ')', events.map(function (r) {
          return { id: r.id, local_id: r.local_id, event_data: r.event_data, created_at: r.created_at, updated_at: r.updated_at };
        }));
      }
      const { data: settingsRow, error: settingsErr } = await supabase.from('user_settings').select('*').eq('user_id', userId).single();
      if (settingsErr && settingsErr.code !== 'PGRST116') console.error('[DataSync] Pull user_settings erreur:', settingsErr);

      var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
      if (sessions !== undefined && sessions !== null && typeof UnifiedStorage !== 'undefined') {
        const sessKey = sk.SESSIONS || 'darkOrbitSessions';
        const local = UnifiedStorage.get(sessKey, []);
        const clearedFlag = typeof localStorage !== 'undefined' && localStorage.getItem('darkOrbitSessionsCleared');
        let merged;
        if (clearedFlag && (!local || local.length === 0)) {
          merged = [];
          localStorage.removeItem('darkOrbitSessionsCleared');
        } else {
          merged = sessions.length > 0 ? this._mergeSessions(local, sessions) : [];
        }
        UnifiedStorage.set(sessKey, merged);
      }
      if (events !== undefined && events !== null && Array.isArray(events) && typeof UnifiedStorage !== 'undefined') {
        const evKey = sk.EVENTS || 'darkOrbitEvents';
        const merged = this._mergeEvents(UnifiedStorage.get(evKey, []), events);
        UnifiedStorage.set(evKey, merged);
      }
      if (settingsRow && typeof UnifiedStorage !== 'undefined') {
        if (!(typeof isSettingsDirty === 'function' && isSettingsDirty())) {
          UnifiedStorage.set(sk.SETTINGS || 'darkOrbitSettings', settingsRow.settings_json || {});
        }
        if (Array.isArray(settingsRow.links_json)) UnifiedStorage.set(sk.CUSTOM_LINKS || 'darkOrbitCustomLinks', settingsRow.links_json);
        var impKey = sk.IMPORTED_RANKINGS || 'darkOrbitImportedRankings';
        var serverImp = settingsRow.imported_rankings_json;
        var localImp = UnifiedStorage.get(impKey, {});
        if (serverImp != null && typeof serverImp === 'object') {
          var merged = {};
          for (var k in serverImp) if (Object.prototype.hasOwnProperty.call(serverImp, k)) merged[k] = serverImp[k];
          if (localImp && typeof localImp === 'object') {
            for (var lk in localImp) if (Object.prototype.hasOwnProperty.call(localImp, lk) && localImp[lk] && localImp[lk].fusion) {
              merged[lk] = localImp[lk];
            }
          }
          if (Object.keys(merged).length > 0) UnifiedStorage.set(impKey, merged);
        }
        if (settingsRow.booster_config_json && typeof settingsRow.booster_config_json === 'object') UnifiedStorage.set(sk.BOOSTERS || 'darkOrbitBoosters', settingsRow.booster_config_json);
        if (settingsRow.current_stats_json && typeof settingsRow.current_stats_json === 'object') UnifiedStorage.set(sk.CURRENT_STATS || 'darkOrbitCurrentStats', settingsRow.current_stats_json);
        if (Array.isArray(settingsRow.current_events_json)) UnifiedStorage.set(sk.CURRENT_EVENTS || 'darkOrbitCurrentEvents', settingsRow.current_events_json);
        if (settingsRow.theme) localStorage?.setItem(sk.THEME || 'darkOrbitTheme', settingsRow.theme);
        if (settingsRow.view_mode) localStorage?.setItem(sk.VIEW_MODE || 'darkOrbitViewMode', settingsRow.view_mode);
      }
      UnifiedStorage?.set(LAST_SYNC_KEY, Date.now());
      if (typeof UnifiedStorage?.invalidateCache === 'function') {
        var keysToInvalidate = [sk.SESSIONS || 'darkOrbitSessions', sk.EVENTS || 'darkOrbitEvents', sk.SETTINGS || 'darkOrbitSettings', sk.CUSTOM_LINKS || 'darkOrbitCustomLinks', sk.IMPORTED_RANKINGS || 'darkOrbitImportedRankings', sk.BOOSTERS || 'darkOrbitBoosters', sk.CURRENT_STATS || 'darkOrbitCurrentStats', sk.CURRENT_EVENTS || 'darkOrbitCurrentEvents'];
        keysToInvalidate.forEach(function(k) { if (k) UnifiedStorage.invalidateCache(k); });
      }
      // Rafraîchir toute l'UI concernée par les données synchronisées
      if (typeof renderHistory === 'function') renderHistory();
      if (typeof updateEventsDisplay === 'function') updateEventsDisplay();
      if (typeof window.updateScrapedEventsDisplay === 'function') window.updateScrapedEventsDisplay();
      if (typeof updateProgressionTab === 'function') updateProgressionTab();
      if (typeof loadCurrentStats === 'function') loadCurrentStats();
      if (typeof initBaselineSetup === 'function') initBaselineSetup();
      if (typeof refreshChartColors === 'function') refreshChartColors();
      if (typeof window.refreshRanking === 'function') window.refreshRanking();
      console.log('[DataSync] Pull OK');
      return { success: true };
    } catch (e) {
      console.error('[DataSync] Pull erreur:', { message: e?.message, error: e });
      return { success: false, error: e?.message };
    }
  },

  /**
   * Fusion sessions : stratégie "dernier écrit gagne" (timestamp le plus récent l'emporte).
   * Risque : en cas d'édition concurrente sur deux appareils, les modifications les plus anciennes peuvent être perdues.
   */
  _mergeSessions(local, remote) {
    const byLocalId = new Map(local.map(s => [String(s.id), s]));
    for (const r of remote) {
      const lid = r.local_id || r.id;
      const localTs = byLocalId.get(lid)?.timestamp;
      const remoteTs = r.session_timestamp;
      if (!localTs || remoteTs >= localTs) {
        const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
        byLocalId.set(lid, {
          id: r.local_id || r.id,
          date: r.session_date,
          honor: num(r.honor),
          xp: num(r.xp),
          rankPoints: num(r.rank_points),
          nextRankPoints: num(r.next_rank_points),
          currentRank: r.current_rank,
          note: r.note,
          timestamp: r.session_timestamp,
          is_baseline: !!r.is_baseline
        });
      }
    }
    return Array.from(byLocalId.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  },

  /**
   * Normalise un objet événement pour l'app (camelCase : name, startDate, endDate).
   * Accepte snake_case (start_date, end_date), title, ou champs start/end.
   */
  _normalizeEventData(ev) {
    if (!ev || typeof ev !== 'object') return ev;
    const o = { ...ev, id: ev.id || ev.local_id || null };
    if (o.name == null && o.title != null) o.name = o.title;
    const startSrc = o.startDate ?? o.start_date ?? o.start;
    const endSrc = o.endDate ?? o.end_date ?? o.end;
    if (o.startDate == null && startSrc != null) o.startDate = startSrc;
    if (o.endDate == null && endSrc != null) o.endDate = endSrc;
    return o;
  },

  /**
   * Fusion événements : stratégie "dernier écrit gagne" (updated_at le plus récent l'emporte).
   * Lit event_data (JSONB) et normalise pour l'affichage (name, startDate, endDate).
   */
  _mergeEvents(local, remote) {
    const byLocalId = new Map(local.map(e => [String(e.id || e.local_id || ''), e]));
    for (const r of remote) {
      const raw = r.event_data != null ? r.event_data : r;
      const ev = this._normalizeEventData(raw);
      const lid = String((ev && ev.id) || r.local_id || r.id || '');
      const existing = byLocalId.get(lid);
      const remoteUpdated = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      const localUpdated = existing && (existing.updatedAt || existing.updated_at) ? new Date(existing.updatedAt || existing.updated_at).getTime() : (existing ? 0 : -1);
      if (!existing || remoteUpdated >= localUpdated) {
        const obj = ev && typeof ev === 'object' ? { ...ev, id: ev.id || lid } : { id: lid, name: 'Événement', startDate: r.created_at, endDate: r.updated_at };
        byLocalId.set(lid, obj);
      }
    }
    return Array.from(byLocalId.values()).sort((a, b) => {
      const ta = new Date(a.startDate || a.start_date || a.created_at || 0).getTime();
      const tb = new Date(b.startDate || b.start_date || b.created_at || 0).getTime();
      return tb - ta;
    });
  },

  /**
   * Lance la synchronisation périodique (pull puis sync).
   * Re-vérifie le statut banned à chaque cycle pour couvrir le cas où l'utilisateur est banni pendant que la page est ouverte.
   */
  startPeriodicSync() {
    if (this._intervalId) return;
    if (!this.isReady()) return;
    const run = async () => {
      if (typeof BackendAPI !== 'undefined') {
        await BackendAPI.loadUserProfile();
        const profile = BackendAPI.getUserProfile();
        if (profile && profile.status === 'banned') {
          if (typeof AuthManager !== 'undefined') await AuthManager.logout();
          if (typeof window !== 'undefined' && window.location) window.location.href = 'auth.html';
          return;
        }
      }
      await this.pull();
      await this.sync();
    };
    this._intervalId = setInterval(run, SYNC_INTERVAL_MS);
  },

  stopPeriodicSync() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  },

  /**
   * À appeler après une sauvegarde locale (session, event, settings).
   * Throttle : min. 15 s entre deux syncs pour limiter les appels (rate limiting client).
   * En cas d'échec, log et toast pour informer l'utilisateur (réessai automatique au prochain cycle).
   */
  queueSync() {
    if (!this.isReady()) return;
    var now = Date.now();
    if (now - this._lastQueueSyncAt < SYNC_THROTTLE_MS && this._lastQueueSyncAt > 0) {
      return;
    }
    this._lastQueueSyncAt = now;
    this.sync().catch((e) => {
      console.warn('[DataSync] Sync reportée:', e?.message || e);
      var msg = e?.message || '';
      if (msg.indexOf('RATE_LIMIT') !== -1) {
        if (typeof showToast === 'function') showToast('Trop de requêtes. Réessayez dans une minute.', 'warning');
      } else if (msg.indexOf('invalide') !== -1 || msg.indexOf('check_violation') !== -1) {
        if (typeof showToast === 'function') showToast('Données invalides. Vérifiez vos stats.', 'error');
      } else if (typeof showToast === 'function') {
        showToast('Synchronisation reportée. Réessai automatique…', 'warning');
      }
    });
  }
};

window.DataSync = DataSync;
console.log('🔄 DataSync chargé');
