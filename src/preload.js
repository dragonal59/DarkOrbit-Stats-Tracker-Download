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
  onRequest: (cb) => {
    const handler = () => { try { cb(); } catch (e) { console.warn('[Supabase] request-fresh-token callback error:', e?.message); } };
    ipcRenderer.removeAllListeners('request-fresh-token');
    ipcRenderer.on('request-fresh-token', handler);
  },
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
  listMultillinguesEventJsonFiles: () => ipcRenderer.invoke('events:list-multillingues-json'),
});

contextBridge.exposeInMainWorld('electronApp', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  isPackaged: () => ipcRenderer.invoke('app:is-packaged'),
  readBundledChangelog: () => ipcRenderer.invoke('app:read-bundled-changelog')
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
