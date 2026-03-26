// Preload Electron — expose config Supabase et IPC au renderer
// Config injectée par main.js dans process.env AVANT création de la fenêtre
// (.env, puis build/src/config.supabase.prod.js ou config.supabase.local.js en dev)
const { contextBridge, ipcRenderer } = require('electron');

const supabaseConfig = {
  url: process.env.SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_ANON_KEY || '',
  authRedirectBase: process.env.AUTH_REDIRECT_BASE || 'https://dragonal59.github.io/darkorbit-tracker-auth/'
};

contextBridge.exposeInMainWorld('SUPABASE_CONFIG', supabaseConfig);

contextBridge.exposeInMainWorld('PAYPAL_CONFIG', {
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  planId: process.env.PAYPAL_PLAN_ID || ''
});

contextBridge.exposeInMainWorld('electronScraper', {
  start: () => ipcRenderer.invoke('scraper:start'),
  startEventsOnly: () => ipcRenderer.invoke('scraper:startEventsOnly'),
  pause: (paused) => ipcRenderer.invoke('scraper:pause', paused),
  stop: () => ipcRenderer.invoke('scraper:stop'),
  getState: () => ipcRenderer.invoke('scraper:getState'),
  setUserContext: (userId, accessToken) => ipcRenderer.send('scraper:setUserContext', { userId, accessToken }),
  onProgress: (cb) => { ipcRenderer.on('scraping-progress', (_e, d) => cb(d)); },
  // scraping-error : émis par scraper-bridge.sendScrapingError() depuis le main process
  onError: (cb) => { ipcRenderer.on('scraping-error', (_e, d) => cb(d)); },
  onRankingsUpdated: (cb) => { ipcRenderer.on('rankings-updated', (_e, d) => cb(d)); },
  onScrapingFinished: (cb) => { ipcRenderer.on('scraping-finished', (_e, d) => cb(d)); },
  onEventsCollected: (cb) => { ipcRenderer.on('scraping:events-collected', (_e, d) => cb(d)); },
  onEventsUpdated: (cb) => { ipcRenderer.on('events-updated', (_e, d) => cb(d)); }
});

contextBridge.exposeInMainWorld('electronRequestFreshToken', {
  onRequest: (cb) => { ipcRenderer.on('request-fresh-token', () => { try { cb(); } catch (e) { console.warn('[Supabase] request-fresh-token callback error:', e?.message); } }); },
  sendResponse: (userId, accessToken) => { ipcRenderer.send('fresh-token-response', { userId, accessToken }); }
});

contextBridge.exposeInMainWorld('electronAPI', {
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url),
  openExternal: (url) => ipcRenderer.send('app:openExternal', url),
  navigateToAuth: () => ipcRenderer.send('app:navigateToAuth'),
  navigateToSubscription: () => ipcRenderer.send('app:navigateToSubscription'),
  reload: () => ipcRenderer.send('app:reload'),
  toggleAlwaysOnTop: (desiredState) => ipcRenderer.send('window:toggle-always-on-top', desiredState),
  onAlwaysOnTopChanged: (cb) => { ipcRenderer.on('window:always-on-top-changed', (_e, d) => { try { cb(d); } catch (e) {} }); },
  minimizeWindow: () => ipcRenderer.send('window:controls:minimize'),
  maximizeToggle: () => ipcRenderer.send('window:controls:maximize-toggle'),
  closeWindow: () => ipcRenderer.send('window:controls:close'),
  loadSettings: () => ipcRenderer.invoke('scraper-app:load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('scraper-app:save-settings', settings),
  loadPlanningExtra: () => ipcRenderer.invoke('scraper-app:load-planning-extra'),
  savePlanningExtra: (payload) => ipcRenderer.invoke('scraper-app:save-planning-extra', payload),
  clearVisuData: () => ipcRenderer.invoke('scraper-app:clear-visu-data'),
  getScrapeProfilesPreference: (serverCode) => ipcRenderer.invoke('scraper-app:get-scrape-profiles-preference', serverCode),
  setScrapeProfilesPreference: (serverCode, value) => ipcRenderer.invoke('scraper-app:set-scrape-profiles-preference', { serverCode, value }),
  getServerScrapeConfig: (serverCode) => ipcRenderer.invoke('scraper-app:get-server-scrape-config', serverCode),
  setServerScrapeConfig: (serverCode, config) => ipcRenderer.invoke('scraper-app:set-server-scrape-config', { serverCode, ...(config || {}) }),
});

contextBridge.exposeInMainWorld('electronApp', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  isPackaged: () => ipcRenderer.invoke('app:is-packaged')
});

contextBridge.exposeInMainWorld('electronAppUpdater', {
  onUpdateReadyToInstall: (cb) => { ipcRenderer.on('update-ready-to-install', (_e, d) => { try { cb(d); } catch (e) {} }); },
  onUpdateNotAvailable: (cb) => { ipcRenderer.on('update-not-available', (_e, d) => { try { cb(d); } catch (e) {} }); },
  onUpdateError: (cb) => { ipcRenderer.on('update-error', (_e, d) => { try { cb(d); } catch (e) {} }); },
  checkForUpdates: () => { ipcRenderer.send('update:check'); },
  checkBlockingOperations: () => ipcRenderer.invoke('update:check-blocking-operations'),
  quitAndInstall: () => ipcRenderer.invoke('update:quit-and-install'),
  quitAndInstallConfirmed: () => ipcRenderer.invoke('update:quit-and-install-confirmed'),
});

contextBridge.exposeInMainWorld('electronSessionScraper', {
  start:      () => ipcRenderer.invoke('session-scraper:start'),
  stop:       () => ipcRenderer.invoke('session-scraper:stop'),
  getState:   () => ipcRenderer.invoke('session-scraper:getState'),
  onProgress: (cb) => { ipcRenderer.on('session-scraper-progress', (_e, d) => cb(d)); },
});


contextBridge.exposeInMainWorld('electronClientLauncher', {
  // CDP interception (client DarkOrbit.exe)
  launch:   (opts) => ipcRenderer.invoke('client-launcher:launch', opts),
  stop:     ()     => ipcRenderer.invoke('client-launcher:stop'),
  getState: ()     => ipcRenderer.invoke('client-launcher:getState'),
  onPacket:          (cb) => { ipcRenderer.on('client-launcher:packet',           (_e, d) => cb(d)); },
  onProfileDetected: (cb) => { ipcRenderer.on('client-launcher:profile-detected', (_e, d) => cb(d)); },
  onFirmFound:       (cb) => { ipcRenderer.on('client-launcher:firm-found',        (_e, d) => cb(d)); },
  onSaveSuccess:     (cb) => { ipcRenderer.on('client-launcher:save-success',      (_e, d) => cb(d)); },

  // Scan automatisé des profils (BrowserWindow)
  startScan:    (opts) => ipcRenderer.invoke('client-launcher:start-scan', opts),
  stopScan:     ()     => ipcRenderer.invoke('client-launcher:stop-scan'),
  getExePath:   ()     => ipcRenderer.invoke('client-launcher:get-exe-path'),
  browseExe:    ()     => ipcRenderer.invoke('client-launcher:browse-exe'),
  collectPlayerStats: (opts) => ipcRenderer.invoke('client-launcher:collect-player-stats', opts),
  onScanProgress: (cb) => { ipcRenderer.on('client-launcher:scan-progress', (_e, d) => cb(d)); },
  onScanStats:    (cb) => { ipcRenderer.on('client-launcher:scan-stats',    (_e, d) => cb(d)); },
  onScanDone:     (cb) => { ipcRenderer.on('client-launcher:scan-done',     (_e, d) => cb(d)); },
});

contextBridge.exposeInMainWorld('electronPlayerStatsScraper', {
  collectWithLogin: (opts) => ipcRenderer.invoke('player-stats-scraper:collect', opts),
  collectManual: (opts) => ipcRenderer.invoke('player-stats-scraper:collect-manual', opts),
  onProgress: (cb) => { ipcRenderer.on('player-stats-scraper:progress', (_e, d) => cb(d)); },
});
contextBridge.exposeInMainWorld('electronPlayerStatsCredentials', {
  get: () => ipcRenderer.invoke('player-stats-credentials:get'),
  getAll: () => ipcRenderer.invoke('player-stats-credentials:getAll'),
  getActive: () => ipcRenderer.invoke('player-stats-credentials:getActive'),
  getActiveWithPassword: () => ipcRenderer.invoke('player-stats-credentials:getActiveWithPassword'),
  getByIdWithPassword: (id) => ipcRenderer.invoke('player-stats-credentials:getByIdWithPassword', id),
  add: (account) => ipcRenderer.invoke('player-stats-credentials:add', account),
  setActive: (id) => ipcRenderer.invoke('player-stats-credentials:setActive', id),
  remove: (id) => ipcRenderer.invoke('player-stats-credentials:remove', id),
  update: (id, fields) => ipcRenderer.invoke('player-stats-credentials:update', id, fields),
  load: () => ipcRenderer.invoke('player-stats-credentials:load'),
  save: (obj) => ipcRenderer.invoke('player-stats-credentials:save', obj),
  isEncryptionAvailable: () => ipcRenderer.invoke('player-stats-credentials:isEncryptionAvailable'),
});

contextBridge.exposeInMainWorld('electronDostatsScraper', {
  start: (payloadOrGroupId) => {
    const payload = typeof payloadOrGroupId === 'object' && payloadOrGroupId !== null
      ? payloadOrGroupId
      : { groupId: payloadOrGroupId };
    return ipcRenderer.invoke('dostats-scraper:start', payload);
  },
  onLog: (cb) => { ipcRenderer.on('dostats:log', (_e, d) => { try { cb(d); } catch (e) {} }); },
  getRanking: (serverCode, typeKey, periodKey) =>
    ipcRenderer.invoke('dostats:get-ranking', {
      serverCode: serverCode != null ? String(serverCode).trim() : '',
      typeKey: typeKey != null ? String(typeKey).trim() : 'honor',
      periodKey: periodKey != null ? String(periodKey).trim() : 'current',
    }),
  checkHealth: (serverCode, typeKey, periodKey) =>
    ipcRenderer.invoke('dostats:check-health', {
      serverCode: serverCode != null ? String(serverCode).trim() : '',
      typeKey: typeKey != null ? String(typeKey).trim() : 'honor',
      periodKey: periodKey != null ? String(periodKey).trim() : 'current',
    }),
  measureLatency: (serverCode, typeKey, periodKey, attempts) =>
    ipcRenderer.invoke('dostats:measure-latency', {
      serverCode: serverCode != null ? String(serverCode).trim() : '',
      typeKey: typeKey != null ? String(typeKey).trim() : 'honor',
      periodKey: periodKey != null ? String(periodKey).trim() : 'current',
      attempts: attempts != null ? attempts : undefined,
    }),
  measureLatencyAndScanProfiles: (serverCode, typeKey, periodKey, attempts, profilesToScan, profilesConcurrency) =>
    ipcRenderer.invoke('dostats:measure-latency-and-scan-profiles', {
      serverCode: serverCode != null ? String(serverCode).trim() : '',
      typeKey: typeKey != null ? String(typeKey).trim() : 'honor',
      periodKey: periodKey != null ? String(periodKey).trim() : 'current',
      attempts: attempts != null ? attempts : undefined,
      profilesToScan: profilesToScan != null ? profilesToScan : 1,
      profilesConcurrency: profilesConcurrency != null ? profilesConcurrency : 1,
    }),
  getLatestProfile: (serverCode, userId) =>
    ipcRenderer.invoke('dostats:get-latest-profile', {
      serverCode: serverCode != null ? String(serverCode).trim() : '',
      userId: userId != null ? String(userId).trim() : '',
    }),
});

contextBridge.exposeInMainWorld('electronDostatsProfilesScraper', {
  start: (serverCode, userIds, concurrency) => ipcRenderer.invoke('dostats-profiles-scraper:start', { serverCode, userIds, concurrency }),
  onProfileProgress: (cb) => {
    const fn = (_e, d) => {
      try {
        cb(d);
      } catch (e) {
        /* ignore */
      }
    };
    ipcRenderer.on('dostats:profile-progress', fn);
    return () => ipcRenderer.removeListener('dostats:profile-progress', fn);
  },
});

contextBridge.exposeInMainWorld('electronScrapingConfig', {
  get: () => ipcRenderer.invoke('scraping:get-config'),
  save: (config) => ipcRenderer.invoke('scraping:save-config', config)
});

contextBridge.exposeInMainWorld('electronScheduler', {
  getConfig: () => ipcRenderer.invoke('scheduler:getConfig'),
  saveConfig: (config) => ipcRenderer.invoke('scheduler:saveConfig', config),
  reload: () => ipcRenderer.invoke('scheduler:reload'),
  onStarted: (cb) => { ipcRenderer.on('scheduler-started', () => { try { cb(); } catch (e) {} }); },
  onFinished: (cb) => { ipcRenderer.on('scheduler-finished', () => { try { cb(); } catch (e) {} }); },
  onLog: (cb) => { ipcRenderer.on('scheduler-log', (_e, d) => { try { cb(d); } catch (e) {} }); },
});

contextBridge.exposeInMainWorld('electronHofPlanning', {
  get: () => ipcRenderer.invoke('hof-planning:get'),
  getHistory: () => ipcRenderer.invoke('hof-planning:history'),
  save: (config) => ipcRenderer.invoke('hof-planning:save', config),
  onNext: (cb) => { ipcRenderer.on('hof-planning:next', (_e, d) => { try { cb(d); } catch (e) {} }); },
  runStarted: (payload) => { ipcRenderer.send('hof-run:start', payload || {}); },
  runEnded: () => { ipcRenderer.send('hof-run:end'); },
});

contextBridge.exposeInMainWorld('electronPythscrap', {
  launch: () => ipcRenderer.invoke('pythscrap:launch'),
});

contextBridge.exposeInMainWorld('electronScraperWindow', {
  open: () => ipcRenderer.invoke('scraper-window:open'),
});

contextBridge.exposeInMainWorld('scraperBridge', {
  start: (payload) => ipcRenderer.invoke('scraper-window:start', payload),
  stop: () => ipcRenderer.invoke('scraper-window:stop'),
  test: (serverId) => ipcRenderer.invoke('scraper-window:test', { serverId }),
  browserLogin: (serverId) => ipcRenderer.invoke('scraper-window:browser-login', { serverId }),
  openOutputDir: () => ipcRenderer.invoke('scraper-window:open-output-dir'),
  scrapeDoEvents: () => ipcRenderer.invoke('do-events:scrape'),
  getDoEventsDefinitions: () => ipcRenderer.invoke('do-events:get-definitions'),
  saveDoEventsCache: (events) => ipcRenderer.invoke('scraper-app:save-do-events', events),
  loadDoEventsCache: () => ipcRenderer.invoke('scraper-app:load-do-events'),
  onLine: (cb) => { ipcRenderer.on('scraper:line', (_e, line) => { try { cb(line); } catch (err) { console.warn('[scraperBridge] onLine:', err); } }); },
  onClosed: (cb) => { ipcRenderer.on('scraper:closed', (_e, data) => { try { cb(data); } catch (err) { console.warn('[scraperBridge] onClosed:', err); } }); },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('scraper:line');
    ipcRenderer.removeAllListeners('scraper:closed');
  },
});

contextBridge.exposeInMainWorld('electronDarkorbitAccounts', {
  list: () => ipcRenderer.invoke('darkorbit-accounts:list'),
  save: (input) => ipcRenderer.invoke('darkorbit-accounts:save', input),
  delete: (id) => ipcRenderer.invoke('darkorbit-accounts:delete', id),
  getAssignments: () => ipcRenderer.invoke('darkorbit-accounts:getAssignments'),
  saveAssignments: (assignments) => ipcRenderer.invoke('darkorbit-accounts:saveAssignments', assignments),
  isEncryptionAvailable: () => ipcRenderer.invoke('darkorbit-accounts:isEncryptionAvailable'),
  getCredentials: (accountId) => ipcRenderer.invoke('darkorbit-accounts:getCredentials', accountId),
  getAccountForServer: (serverCode) => ipcRenderer.invoke('darkorbit-accounts:getAccountForServer', serverCode),
  getServers: () => ipcRenderer.invoke('darkorbit-accounts:SERVERS')
});
