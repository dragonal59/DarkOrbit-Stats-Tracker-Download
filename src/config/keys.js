// ==========================================
// MODULE CENTRAL — Clés de stockage et synchronisation
// Source unique pour éviter les chaînes en dur et standardiser la config.
// Les secrets (Supabase URL/anonKey) restent gérés par preload + supabase-config.js.
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
    CUSTOM_ICONS: 'darkOrbitCustomIcons',
    BOOSTERS: 'darkOrbitBoosters',
    BOOSTER_LEARNING: 'boosterLearning',
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
    LANGUAGE: 'darkOrbitLanguage'
  };

  var SYNC_KEYS = [
    STORAGE_KEYS.SESSIONS,
    STORAGE_KEYS.EVENTS,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.CUSTOM_LINKS,
    STORAGE_KEYS.BOOSTERS,
    STORAGE_KEYS.CURRENT_STATS,
    STORAGE_KEYS.IMPORTED_RANKINGS,
    STORAGE_KEYS.CURRENT_EVENTS
  ];

  window.APP_KEYS = {
    STORAGE_KEYS: STORAGE_KEYS,
    SYNC_KEYS: SYNC_KEYS
  };
})();
