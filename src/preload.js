// Preload Electron — expose config Supabase et IPC au renderer
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

contextBridge.exposeInMainWorld('electronAuth', {
  setUserContext: (userId, accessToken) => { ipcRenderer.send('auth:set-user-context', { userId, accessToken }); },
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
