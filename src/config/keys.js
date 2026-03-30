// ==========================================
// MODULE CENTRAL — Clés de stockage et synchronisation
// Source unique pour éviter les chaînes en dur et standardiser la config.
// Les secrets (Supabase URL/anonKey) restent gérés par preload + supabase-config.js.
//
// --- Portée des données (logout + ensureUserDataIsolation) ---
// Toutes les entrées de STORAGE_KEYS sont supprimées au logout et au changement d’utilisateur,
// sauf celles listées par LOGOUT_KEEP_STORAGE_KEYS() (volontairement « globales appareil »).
// Clés hors de cet objet : préfixe sb-* (session Supabase Auth), darkOrbit_lastUserId, pending_baseline_scan, etc.
//
// USER (par compte, via Supabase ou recréées au pull) : SESSIONS, EVENTS, SETTINGS, CUSTOM_LINKS,
//   BOOSTERS, CURRENT_STATS, IMPORTED_RANKINGS, CURRENT_EVENTS, MIGRATION_DONE, LAST_SYNC, PENDING_SYNC, …
// USER (local seulement aujourd’hui — effacées au switch pour éviter fuite) : FOLLOWED_PLAYERS, FOLLOWED_PLAYERS_STATS,
//   USER_COUPONS, USER_COUPON_HISTORY (voir commentaire sync-manager pull).
// LOCAL raw : THEME, VIEW_MODE, LANGUAGE, THEME_AUTO (dupliquées dans user_settings au sync).
// ==========================================

(function () {
  'use strict';

  var STORAGE_KEYS = {
    SESSIONS: 'darkOrbitSessions',
    CURRENT_STATS: 'darkOrbitCurrentStats',
    THEME: 'darkOrbitTheme',
    VIEW_MODE: 'darkOrbitViewMode',
    THEME_AUTO: 'darkOrbitThemeAuto',
    EVENTS: 'darkOrbitEvents',
    SETTINGS: 'darkOrbitSettings',
    CUSTOM_LINKS: 'darkOrbitCustomLinks',
    BOOSTERS: 'darkOrbitBoosters',
    VERSION_BADGE: 'darkOrbitVersionBadge',
    PROFILE_CACHE: 'darkOrbitProfileCache',
    MIGRATION_HINT: 'darkOrbitMigrationHint',
    MIGRATION_DONE: 'darkOrbitDataMigrated',
    LAST_SYNC: 'darkOrbitLastSync',
    PENDING_SYNC: 'darkOrbitPendingSync',
    REFERENCE_DATE: 'darkOrbitDailyReferenceDate',
    ADMIN_USERS: 'darkOrbitAdminUsers',
    ADMIN_ACTION_LOGS: 'darkOrbitAdminActionLogs',
    REMEMBER_ME: 'darkOrbitRememberMe',
    IMPORTED_RANKINGS: 'darkOrbitImportedRankings',
    RANKING_SERVER_SAVED_AT: 'darkOrbitRankingServerSavedAt',
    CURRENT_EVENTS: 'darkOrbitCurrentEvents',
    LANGUAGE: 'darkOrbitLanguage',
    SCRAPING_CONFIG: 'darkOrbitScrapingConfig',
    FOLLOWED_PLAYERS: 'darkOrbitFollowedPlayers',
    FOLLOWED_PLAYERS_STATS: 'darkOrbitFollowedPlayersStats',
    USER_COUPONS: 'darkOrbitUserCoupons',
    USER_COUPON_HISTORY: 'darkOrbitUserCouponHistory',
    /** Legacy : ancien throttle (record_user_login utilise sessionStorage par session app). */
    RECORD_USER_LOGIN_THROTTLE: 'darkorbit_lastLoginRecord',
    /** Dernière version dont l’utilisateur a validé le changelog (machine, survit au logout). */
    LAST_APP_VERSION_ACK: 'doStatsTracker_appVersionLastAcked',
    /** Snapshot subscription (badge + subscription_status + trial) pour transitions PRO et cold start. */
    LAST_PROFILE_SUB_SNAPSHOT: 'darkOrbitLastProfileSubSnapshot'
  };

  var SYNC_KEYS = [
    STORAGE_KEYS.EVENTS,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.CUSTOM_LINKS,
    STORAGE_KEYS.BOOSTERS,
    STORAGE_KEYS.CURRENT_STATS,
    STORAGE_KEYS.IMPORTED_RANKINGS,
    STORAGE_KEYS.CURRENT_EVENTS,
    STORAGE_KEYS.FOLLOWED_PLAYERS,
    STORAGE_KEYS.FOLLOWED_PLAYERS_STATS
  ];

  /**
   * Clés UnifiedStorage à ne pas effacer au logout / changement de compte.
   * Par défaut : aucune — tout le reste de STORAGE_KEYS est considéré comme lié au compte ou sensible.
   * N’y ajouter que des clés réellement « machine » (ex. jamais de données d’un utilisateur A visibles par B).
   */
  function LOGOUT_KEEP_STORAGE_KEYS() {
    // Confort : si on revient au même compte après logout,
    // on garde les sessions et la UI "stats actuelles" (CURRENT_STATS).
    // Sécurité : en cas de changement de compte, `ensureUserDataIsolation()`
    // purgera quand même les données user-scoped.
    return [
      STORAGE_KEYS.LAST_APP_VERSION_ACK,
      STORAGE_KEYS.SESSIONS,
      STORAGE_KEYS.CURRENT_STATS
    ];
  }

  window.APP_KEYS = {
    STORAGE_KEYS: STORAGE_KEYS,
    SYNC_KEYS: SYNC_KEYS,
    LOGOUT_KEEP_STORAGE_KEYS: LOGOUT_KEEP_STORAGE_KEYS
  };
})();
