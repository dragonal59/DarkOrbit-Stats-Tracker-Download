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
   * La session de base (baseline) n'est créée que à l'inscription via la page auth (scraper), pas ici.
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
      UnifiedStorage.set(MIGRATION_DONE_KEY, true);
      if (typeof showToast === 'function') showToast('Données migrées vers le cloud.', 'success');
      return true;
    } catch (e) {
      Logger.error('Migration erreur:', e);
      if (typeof showToast === 'function') showToast('Migration reportée.', 'warning');
      return false;
    } finally {
      this._migrating = false;
    }
  },

  _sessionToRow(s, userId, localId) {
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const activeId = (typeof getActivePlayerId === 'function' ? getActivePlayerId() : null);
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
      is_baseline: !!s.is_baseline,
      player_id: s.player_id || activeId || null,
      player_server: s.player_server || null,
      player_pseudo: s.player_pseudo || null
    };
  },

  async _migrateSessions(userId) {
    const sessions = UnifiedStorage.get((_k.SESSIONS) || 'darkOrbitSessions', []);
    if (sessions.length === 0) return;
    const userBadge = (typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' && BackendAPI.getUserBadge ? BackendAPI.getUserBadge() : 'FREE') || '').toString().toUpperCase();
    let sessionsToMigrate = sessions;
    if (userBadge === 'FREE') {
      const baselines = sessions.filter(s => s.is_baseline);
      const baseline = baselines.length > 0 ? baselines.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0] : null;
      sessionsToMigrate = baseline ? [baseline] : sessions.slice(0, 1);
    }
    const supabase = getSupabaseClient();
    const byId = new Map();
    for (let i = 0; i < sessionsToMigrate.length; i++) {
      const s = sessionsToMigrate[i];
      let lid = s.id != null && String(s.id).trim() !== '' ? String(s.id) : null;
      if (!lid) {
        lid = 's-' + (s.timestamp || Date.now()) + '-' + i + '-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
      }
      byId.set(lid, s);
    }
    const rows = [];
    for (const [lid, s] of byId.entries()) {
      rows.push(this._sessionToRow(s, userId, lid));
    }
    if (rows.length === 0) return;
    try {
      const { data, error } = await supabase.rpc('upsert_user_sessions_bulk', { p_rows: rows });
      if (error) {
        Logger.error('[DataSync] Erreur Supabase upsert_user_sessions_bulk:', { message: error.message, code: error.code });
        throw error;
      }
      if (data && data.success === false) {
        const msg = data.error || 'Erreur de synchronisation des sessions.';
        if (typeof showToast === 'function') showToast(msg, 'error');
        throw new Error(msg);
      }
    } catch (e) {
      Logger.error('[DataSync] Exception user_sessions (bulk):', e);
      throw e;
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
      const { error: _ueError } = await supabase.from('user_events').upsert(row, { onConflict: 'user_id,local_id', ignoreDuplicates: false });
      if (_ueError) Logger.warn('[SyncManager] user_events upsert error (local_id=' + row.local_id + '):', _ueError.message);
    }
  },

  /**
   * Supprime un événement dans Supabase (user_events) par son id local.
   * À appeler immédiatement après avoir retiré l'événement du localStorage.
   */
  async deleteEventRemote(eventId) {
    if (!this.isReady()) return;
    const userId = await this.getUserId();
    if (!userId) return;
    try {
      const supabase = getSupabaseClient();
      await supabase.from('user_events').delete().eq('user_id', userId).eq('local_id', String(eventId));
    } catch (e) {
      Logger.warn('[DataSync] deleteEventRemote:', e?.message || e);
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
    const currentEvents = UnifiedStorage.get(sk.CURRENT_EVENTS, []);
    const theme = localStorage?.getItem(sk.THEME || 'darkOrbitTheme') || 'dark';
    const viewMode = localStorage?.getItem(sk.VIEW_MODE || 'darkOrbitViewMode') || 'detailed';
    const language = localStorage?.getItem(sk.LANGUAGE || 'darkOrbitLanguage') || 'fr';
    const themeAuto = localStorage?.getItem(sk.THEME_AUTO || 'darkOrbitThemeAuto');
    const themeAutoBool = themeAuto === 'true' || (themeAuto !== 'false' && themeAuto !== null);

    const row = {
      user_id: userId,
      settings_json: settings,
      links_json: Array.isArray(links) ? links : [],
      imported_rankings_json: importedRankings && typeof importedRankings === 'object' ? importedRankings : {},
      booster_config_json: boosterConfig,
      current_stats_json: currentStats,
      current_events_json: Array.isArray(currentEvents) ? currentEvents : [],
      theme,
      view_mode: viewMode,
      language: language || 'fr',
      theme_auto: themeAutoBool,
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
      Logger.warn('[DataSync] syncSettingsOnly erreur:', e?.message || e);
      if (typeof UnifiedStorage !== 'undefined') {
        try { UnifiedStorage.set(PENDING_SYNC_KEY, true); } catch (_) {}
      }
      return { success: false, error: e?.message };
    }
  },

  /**
   * Push : envoie les données locales vers Supabase
   */
  async sync() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (typeof UnifiedStorage !== 'undefined') UnifiedStorage.set(PENDING_SYNC_KEY, true);
      return { success: false, reason: 'offline' };
    }
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
        UnifiedStorage.remove(PENDING_SYNC_KEY);
      }
      return { success: true };
    } catch (e) {
      Logger.error('[DataSync] Sync erreur:', { message: e?.message, error: e });
      if (typeof UnifiedStorage !== 'undefined') {
        UnifiedStorage.set(PENDING_SYNC_KEY, true);
      }
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
      const { data: sessions, error: sessionsErr } = await supabase.from('user_sessions').select('*').eq('user_id', userId).order('session_timestamp', { ascending: false }).limit(100);
      if (sessionsErr) Logger.error('[DataSync] Pull user_sessions erreur:', sessionsErr);
      const { data: events, error: eventsErr } = await supabase.from('user_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
      if (eventsErr) Logger.error('[DataSync] Pull user_events erreur:', eventsErr);

      const { data: settingsRow, error: settingsErr } = await supabase.from('user_settings').select('*').eq('user_id', userId).single();
      if (settingsErr && settingsErr.code !== 'PGRST116') Logger.error('[DataSync] Pull user_settings erreur:', settingsErr);

      const sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
      // Coupons et historique : stockage local uniquement (pas de sync Supabase, responsabilité / confidentialité)
      if (typeof UserPreferencesAPI !== 'undefined') {
        await UserPreferencesAPI.getPreferences();
        await UserPreferencesAPI.getDarkOrbitAccounts();
        await UserPreferencesAPI.getActivePlayerInfo();
      }

      if (sessions !== undefined && sessions !== null) {
        var merged = this._remoteSessionsToApp(sessions);
        if (typeof setSessionsCache === 'function') setSessionsCache(merged);
      }
      if (events !== undefined && events !== null && Array.isArray(events) && typeof UnifiedStorage !== 'undefined') {
        const evKey = sk.EVENTS || 'darkOrbitEvents';
        var eventsFromSupabase = events.map(r => {
          const raw = r.event_data != null ? r.event_data : r;
          const ev = this._normalizeEventData(raw);
          return { ...ev, id: ev.id || r.local_id || r.id || '' };
        }).sort((a, b) => {
          const ta = new Date(a.startDate || a.start_date || a.created_at || 0).getTime();
          const tb = new Date(b.startDate || b.start_date || b.created_at || 0).getTime();
          return tb - ta;
        });
        UnifiedStorage.set(evKey, eventsFromSupabase);
      }
      if (settingsRow && typeof UnifiedStorage !== 'undefined') {
        var settingsKey = sk.SETTINGS || 'darkOrbitSettings';
        var localSettings = UnifiedStorage.get(settingsKey, {});
        var mergedSettings = typeof window.mergeSettingsForPull === 'function'
          ? window.mergeSettingsForPull(settingsRow.settings_json, localSettings)
          : Object.assign({}, localSettings, settingsRow.settings_json || {});
        UnifiedStorage.set(settingsKey, mergedSettings);
        if (Array.isArray(settingsRow.links_json)) UnifiedStorage.set(sk.CUSTOM_LINKS || 'darkOrbitCustomLinks', settingsRow.links_json);
        var impKey = sk.IMPORTED_RANKINGS || 'darkOrbitImportedRankings';
        var serverImp = settingsRow.imported_rankings_json;
        if (serverImp != null && typeof serverImp === 'object') {
          UnifiedStorage.set(impKey, serverImp);
        }
        if (settingsRow.booster_config_json && typeof settingsRow.booster_config_json === 'object') UnifiedStorage.set(sk.BOOSTERS || 'darkOrbitBoosters', settingsRow.booster_config_json);
        if (settingsRow.current_stats_json && typeof settingsRow.current_stats_json === 'object') UnifiedStorage.set(sk.CURRENT_STATS || 'darkOrbitCurrentStats', settingsRow.current_stats_json);
        if (Array.isArray(settingsRow.current_events_json)) UnifiedStorage.set(sk.CURRENT_EVENTS || 'darkOrbitCurrentEvents', settingsRow.current_events_json);
        if (settingsRow.theme) localStorage?.setItem(sk.THEME || 'darkOrbitTheme', settingsRow.theme);
        if (settingsRow.view_mode) localStorage?.setItem(sk.VIEW_MODE || 'darkOrbitViewMode', settingsRow.view_mode);
        if (settingsRow.language) {
          localStorage?.setItem(sk.LANGUAGE || 'darkOrbitLanguage', settingsRow.language);
          if (typeof window.setLanguage === 'function') window.setLanguage(settingsRow.language);
        }
        if (settingsRow.theme_auto !== undefined) localStorage?.setItem(sk.THEME_AUTO || 'darkOrbitThemeAuto', settingsRow.theme_auto ? 'true' : 'false');
      }
      UnifiedStorage?.set(LAST_SYNC_KEY, Date.now());
      if (typeof UnifiedStorage?.invalidateCache === 'function') {
        var keysToInvalidate = [sk.EVENTS || 'darkOrbitEvents', sk.SETTINGS || 'darkOrbitSettings', sk.CUSTOM_LINKS || 'darkOrbitCustomLinks', sk.IMPORTED_RANKINGS || 'darkOrbitImportedRankings', sk.BOOSTERS || 'darkOrbitBoosters', sk.CURRENT_STATS || 'darkOrbitCurrentStats', sk.CURRENT_EVENTS || 'darkOrbitCurrentEvents'];
        keysToInvalidate.forEach(function(k) { if (k) UnifiedStorage.invalidateCache(k); });
      }
      // Rafraîchir toute l'UI concernée par les données synchronisées
      if (typeof renderHistory === 'function') renderHistory();
      if (typeof window.maybeRefreshProgression === 'function') window.maybeRefreshProgression();
      if (typeof updateEventsDisplay === 'function') updateEventsDisplay();
      if (typeof window.refreshEventsFromSupabase === 'function') window.refreshEventsFromSupabase();
      if (typeof window.updateBoosterAlert === 'function') window.updateBoosterAlert();
      if (typeof window.updateBoosterWidget === 'function') window.updateBoosterWidget();
      if (typeof window.applyBoosterVisibility === 'function') window.applyBoosterVisibility();
      if (typeof loadCurrentStats === 'function') loadCurrentStats();
      if (typeof window.refreshRanking === 'function') window.refreshRanking();
      if (typeof window.refreshFollowedPlayersSidebar === 'function') window.refreshFollowedPlayersSidebar();
      if (typeof window.refreshCouponsUI === 'function') window.refreshCouponsUI();
      if (typeof window.initSettingsTab === 'function') window.initSettingsTab();
      if (typeof window.applyScrollbarsSetting === 'function') {
        var scrollEnabled = (mergedSettings && mergedSettings.scrollbarsEnabled !== undefined) ? mergedSettings.scrollbarsEnabled !== false : true;
        window.applyScrollbarsSetting(scrollEnabled);
      }
      return { success: true };
    } catch (e) {
      Logger.error('[DataSync] Pull erreur:', { message: e?.message, error: e });
      return { success: false, error: e?.message };
    }
  },

  _remoteSessionsToApp(remote) {
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    return (remote || []).map(r => ({
      id: r.local_id || r.id,
      date: r.session_date,
      honor: num(r.honor),
      xp: num(r.xp),
      rankPoints: num(r.rank_points),
      nextRankPoints: num(r.next_rank_points),
      currentRank: r.current_rank,
      note: r.note,
      timestamp: r.session_timestamp,
      is_baseline: !!r.is_baseline,
      player_id: r.player_id || null,
      player_server: r.player_server || null,
      player_pseudo: r.player_pseudo || null
    })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
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
  async sendHeartbeat() {
    try {
      var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!supabase) return;
      await supabase.rpc('update_last_seen');
    } catch (e) {
      Logger.warn('[DataSync] Heartbeat échoué:', e?.message || e);
    }
  },

  startPeriodicSync() {
    if (this._intervalId) return;
    if (!this.isReady()) return;
    var hasPending = typeof UnifiedStorage !== 'undefined' && UnifiedStorage.get(PENDING_SYNC_KEY, false);
    if (hasPending) {
      this._pendingSyncTimeout = setTimeout(() => { this.queueSync(); }, 3000);
    }
    // Heartbeat immédiat au démarrage
    this.sendHeartbeat();
    const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
    if (this._heartbeatIntervalId) { clearInterval(this._heartbeatIntervalId); this._heartbeatIntervalId = null; }
    this._heartbeatIntervalId = setInterval(() => { this.sendHeartbeat(); }, HEARTBEAT_INTERVAL_MS);

    const run = async () => {
      if (typeof BackendAPI !== 'undefined') {
        await BackendAPI.loadUserProfile();
        const profile = BackendAPI.getUserProfile();
        if (profile && profile.status === 'banned') {
          this.stopPeriodicSync();
          if (typeof AuthManager !== 'undefined') await AuthManager.logout();
          if (typeof window !== 'undefined') {
            if (typeof electronAPI !== 'undefined' && electronAPI.navigateToAuth) {
              electronAPI.navigateToAuth();
            } else if (window.location) {
              window.location.href = 'auth.html';
            }
          }
          return;
        }
      }
      await this.pull();
      await this.sync();
    };
    this._intervalId = setInterval(run, SYNC_INTERVAL_MS);
  },

  stopPeriodicSync() {
    if (this._pendingSyncTimeout) {
      clearTimeout(this._pendingSyncTimeout);
      this._pendingSyncTimeout = null;
    }
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (this._heartbeatIntervalId) {
      clearInterval(this._heartbeatIntervalId);
      this._heartbeatIntervalId = null;
    }
  },

  /**
   * À appeler après une sauvegarde locale (session, event, settings).
   * Throttle : min. 15 s entre deux syncs pour limiter les appels (rate limiting client).
   * Si une sync précédente a échoué (PENDING_SYNC_KEY), le throttle est ignoré pour rattraper.
   * En cas d'échec, marque PENDING_SYNC_KEY pour réessai au prochain cycle.
   */
  queueSync() {
    if (!this.isReady()) return;
    var now = Date.now();
    var hasPending = typeof UnifiedStorage !== 'undefined' && UnifiedStorage.get(PENDING_SYNC_KEY, false);
    if (!hasPending && now - this._lastQueueSyncAt < SYNC_THROTTLE_MS && this._lastQueueSyncAt > 0) {
      return;
    }
    this._lastQueueSyncAt = now;
    this.sync().catch((e) => {
      Logger.warn('[DataSync] Sync reportée:', e?.message || e);
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

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (typeof showToast === 'function') showToast('Connexion rétablie. Synchronisation en cours…', 'info');
    if (typeof DataSync !== 'undefined' && DataSync.isReady()) DataSync.queueSync();
  });
  window.addEventListener('offline', () => {
    if (typeof showToast === 'function') showToast('Hors ligne. Les données seront synchronisées à la reconnexion.', 'warning');
  });
}
