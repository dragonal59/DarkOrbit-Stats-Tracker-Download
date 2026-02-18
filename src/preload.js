// Preload Electron — expose config Supabase et IPC au renderer
// En prod (build) : charge config.supabase.prod.js injectée au build
// En dev : utilise process.env (dotenv chargé par main.js)
const { contextBridge, ipcRenderer } = require('electron');

let supabaseConfig = { url: '', anonKey: '', authRedirectBase: '' };
try {
  const injected = require('./config.supabase.prod.js');
  if (injected && (injected.url || injected.anonKey)) {
    supabaseConfig = {
      url: injected.url || '',
      anonKey: injected.anonKey || '',
      authRedirectBase: injected.authRedirectBase || 'https://GITHUB_USERNAME.github.io/REPO_NAME/'
    };
  }
} catch (_) {
  supabaseConfig = {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    authRedirectBase: process.env.AUTH_REDIRECT_BASE || 'https://GITHUB_USERNAME.github.io/REPO_NAME/'
  };
}

contextBridge.exposeInMainWorld('SUPABASE_CONFIG', supabaseConfig);

contextBridge.exposeInMainWorld('electronScraper', {
  start: () => ipcRenderer.invoke('scraper:start'),
  stop: () => ipcRenderer.invoke('scraper:stop'),
  getState: () => ipcRenderer.invoke('scraper:getState'),
  setUserContext: (userId, accessToken) => ipcRenderer.send('scraper:setUserContext', { userId, accessToken }),
  showDebugWindow: () => ipcRenderer.invoke('scraper:showDebugWindow'),
  onProgress: (cb) => { ipcRenderer.on('scraping-progress', (_e, d) => cb(d)); },
  onError: (cb) => { ipcRenderer.on('scraping-error', (_e, d) => cb(d)); },
  onRankingsUpdated: (cb) => { ipcRenderer.on('rankings-updated', (_e, d) => cb(d)); },
  onCaptchaRequired: (cb) => { ipcRenderer.on('scraping-captcha-required', (_e, d) => cb(d)); },
  onCaptchaResolved: (cb) => { ipcRenderer.on('scraping-captcha-resolved', (_e, d) => cb(d)); },
  onCaptchaTimeout: (cb) => { ipcRenderer.on('scraping-captcha-timeout', (_e, d) => cb(d)); },
  onScrapingFinished: (cb) => { ipcRenderer.on('scraping-finished', (_e, d) => cb(d)); },
  onEventsUpdated: (cb) => { ipcRenderer.on('events-updated', (_e, d) => cb(d)); }
});

contextBridge.exposeInMainWorld('electronAPI', {
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url)
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
