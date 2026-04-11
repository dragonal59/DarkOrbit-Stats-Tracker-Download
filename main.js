require('dotenv').config();
if (process.stdout?.setEncoding) process.stdout.setEncoding('utf8');
if (process.stderr?.setEncoding) process.stderr.setEncoding('utf8');

const { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const { initAutoUpdater } = require('./electron/auto-updater');
const { readMergedSupabaseConfigFromDisk } = require('./electron/supabase-config-from-disk');

Menu.setApplicationMenu(null);

if (app.isPackaged) {
  app.on('web-contents-created', (_, wc) => {
    wc.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
        event.preventDefault();
      }
    });
    wc.debugger?.detach?.();
  });
}

// FIX 2 — reset explicite au boot (crash brutal session précédente : le finally peut ne pas s’exécuter)
global.dostatsPipelineRunning = false;
global.dostatsPipelineRunningSince = null;

let autoUpdateManager = null;
let alwaysOnTop = false;

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:is-packaged', () => app.isPackaged);

function resolveBundledChangelogPath() {
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'changelog.json');
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return path.join(__dirname, 'changelog.json');
}

ipcMain.handle('app:read-bundled-changelog', () => {
  try {
    const p = resolveBundledChangelogPath();
    if (!fs.existsSync(p)) return { ok: false, error: 'not_found' };
    const raw = fs.readFileSync(p, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.versions)) return { ok: false, error: 'invalid_json' };
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

/** Injecte config Supabase dans process.env AVANT création de la fenêtre (pour que le preload lise process.env). */
function loadSupabaseConfigIntoEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return;
  try {
    const disk = readMergedSupabaseConfigFromDisk(app.isPackaged, app);
    if (disk.url || disk.anonKey) {
      process.env.SUPABASE_URL = disk.url || process.env.SUPABASE_URL;
      process.env.SUPABASE_ANON_KEY = disk.anonKey || process.env.SUPABASE_ANON_KEY;
      if (disk.authRedirectBase) process.env.AUTH_REDIRECT_BASE = disk.authRedirectBase || process.env.AUTH_REDIRECT_BASE;
    }
    if (disk.paypalClientId || disk.paypalPlanId) {
      process.env.PAYPAL_CLIENT_ID = disk.paypalClientId || process.env.PAYPAL_CLIENT_ID;
      process.env.PAYPAL_PLAN_ID = disk.paypalPlanId || process.env.PAYPAL_PLAN_ID;
    }
  } catch (_e) {}
}
loadSupabaseConfigIntoEnv();

/** Chemin vers preload.js — toujours depuis l'ASAR (preload doit rester dans l'ASAR pour avoir accès aux modules Node). */
function getPreloadPath() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'src', 'preload.js');
  }
  return path.join(__dirname, 'src', 'preload.js');
}

/** Chemin vers HTML/img/etc — en build utilise app.asar pour loadFile. */
function getSrcPath(relativePath) {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'src', relativePath || '');
  }
  const p = relativePath ? path.join('src', relativePath) : 'src';
  return path.join(__dirname, p);
}
app.getSrcPath = getSrcPath;

const DarkOrbitAccounts = require('./electron/darkorbit-accounts');
const ScraperBridge = require('./electron/scraper-bridge');
const { DEFAULT_SCRAPING_CONFIG, setConfig: setScrapingConfig } = require('./electron/scraping-config');
const SessionScraper = require('./electron/session-scraper');
const ClientLauncher = require('./electron/client-launcher');
const PlayerStatsScraper = require('./electron/player-stats-scraper');
const PlayerStatsCredentials = require('./electron/player-stats-credentials');
const { DOSTATS_GROUPS, runDostatsRankingScraper, getLatestRanking, checkDostatsHealth, measureDostatsLatency, measureDostatsLatencyAndScanProfiles } = require('./electron/dostats-scraper');
const { runDostatsProfilesScraper, getLatestProfile } = require('./electron/dostats-profile-scraper');

let mainWindow;

/** Une seule exécution DOSTATS (classements + suite profils/Supabase) à la fois : plusieurs `invoke` sans await enchaînés saturaient DOStats / Chromium. */
let dostatsScraperStartQueue = Promise.resolve();

let tray;
let isQuitting = false;
let schedulerIntervalId = null;

const SCHEDULER_CONFIG_PATH = path.join(app.getPath('userData'), 'scheduler-config.json');
const SCRAPER_APP_SETTINGS_PATH = path.join(app.getPath('userData'), 'scraper-app-settings.json');
const SCRAPER_APP_PLANNING_PATH = path.join(app.getPath('userData'), 'scraper-app-planning.json');
const DO_EVENTS_CACHE_PATH = path.join(app.getPath('userData'), 'do-events-cache.json');
global.dostatsProfilesConcurrency = 3;

function getBlockingOperationsState() {
  const reasons = [];
  // FIX 2 — garde-fou : flag DOStats bloqué > 30 min (crash sans finally, etc.)
  const DOSTATS_STUCK_MS = 30 * 60 * 1000;
  try {
    if (global.dostatsPipelineRunning) {
      const since = global.dostatsPipelineRunningSince;
      if (since == null) {
        console.warn('[Main] FIX 2 — dostatsPipelineRunning sans timestamp, reset');
        global.dostatsPipelineRunning = false;
      } else if (Date.now() - since > DOSTATS_STUCK_MS) {
        console.warn('[Main] FIX 2 — dostatsPipelineRunning réinitialisé (durée > 30 min, probable état stale)');
        global.dostatsPipelineRunning = false;
        global.dostatsPipelineRunningSince = null;
      }
    }
    if (global.dostatsPipelineRunning) reasons.push('dostats');
  } catch (_) {}
  try {
    if (ScraperBridge.getState().running) reasons.push('events');
  } catch (_) {}
  try {
    if (SessionScraper.getState().running) reasons.push('session');
  } catch (_) {}
  try {
    if (ClientLauncher.getScanState && ClientLauncher.getScanState().running) reasons.push('client_scan');
  } catch (_) {}
  return { blocking: reasons.length > 0, reasons };
}

function getScraperAppSettings() {
  try {
    if (!fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) return null;
    const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

function shouldShowDesktopNotification(kind) {
  try {
    const data = getScraperAppSettings();
    if (!data || !data.notifications) return false;
    const n = data.notifications;
    if (!n.desktopEnabled) return false;
    if (kind === 'error') return !!n.notifyOnError;
    if (kind === 'complete') return !!n.notifyOnComplete;
    return false;
  } catch (e) {
    return false;
  }
}

function showDesktopNotification(title, body) {
  try {
    // Notification Electron (Windows)
    // eslint-disable-next-line no-new
    new Notification({ title, body }).show();
  } catch (e) {
    // ignore notification errors
  }
}

global.shouldShowDesktopNotification = shouldShowDesktopNotification;
global.showDesktopNotification = showDesktopNotification;

function loadSchedulerConfig() {
  try {
    if (fs.existsSync(SCHEDULER_CONFIG_PATH)) {
      const raw = fs.readFileSync(SCHEDULER_CONFIG_PATH, 'utf8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.slots) && data.slots.length > 0) {
        const cleaned = data.slots.map(s => ({
          time: s.time,
          scrapers: (s.scrapers || []).filter(x => x !== 'evenements')
        })).filter(s => s.time && /^\d{1,2}:\d{2}$/.test(s.time) && s.scrapers.length > 0);
        const hadEvenements = data.slots.some(s => (s.scrapers || []).includes('evenements'));
        const hadLegacy = data.slots.some(s => (s.scrapers || []).some(x => x === 'statistiques_joueurs' || x === 'classements' || x === 'dostats'));
        if (hadEvenements || hadLegacy) saveSchedulerConfig({ slots: cleaned });
        return { slots: cleaned };
      }
      if (data && Array.isArray(data.slotsEvents)) {
        saveSchedulerConfig({ slots: [] });
        return { slots: [] };
      }
    }
  } catch (e) { console.warn('[Scheduler] loadConfig:', e?.message || e); }
  return { slots: [] };
}

function saveSchedulerConfig(config) {
  try {
    fs.writeFileSync(SCHEDULER_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Scheduler] saveConfig:', e?.message || e);
    return false;
  }
}

const PROTOCOL_NAME = 'darkorbit-tracker';

function parseDeepLinkUrl(argvOrCommandLine) {
  const args = Array.isArray(argvOrCommandLine) ? argvOrCommandLine : process.argv;
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i] || '');
    if (arg.startsWith(PROTOCOL_NAME + '://')) return arg;
  }
  return null;
}

function handleDeepLink(url) {
  if (!url || !mainWindow) return;
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || parsed.hostname || '';
    const hash = parsed.hash || '';
    if (pathname.includes('confirm-email')) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.loadFile(getSrcPath('confirm-email.html'), { hash: hash || '' });
    } else if (pathname.includes('reset-password')) {
      mainWindow.show();
      mainWindow.focus();
      const success = parsed.searchParams.get('success');
      const opts = success ? { query: { password_reset: '1' } } : {};
      mainWindow.loadFile(getSrcPath('auth.html'), opts);
    }
  } catch (e) {
    console.warn('[DeepLink] Erreur parsing URL:', e?.message || e);
  }
}

/** Ouvre une URL http(s) dans le navigateur par défaut du système (pas dans Electron). */
function openHttpUrlInSystemBrowser(url) {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (!u.startsWith('https://') && !u.startsWith('http://')) return false;
  try {
    shell.openExternal(u);
    return true;
  } catch (e) {
    console.warn('[Main] shell.openExternal:', e?.message || e);
    return false;
  }
}

function isPayPalHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const h = hostname.toLowerCase();
  return h === 'paypal.com' || h.endsWith('.paypal.com') || h === 'paypal.cn' || h.endsWith('.paypal.cn');
}

/**
 * PayPal (boutons / abonnement) : popups et redirections vers le navigateur par défaut,
 * pas une fenêtre Chromium intégrée à l’app.
 */
function setupPayPalAndExternalPopupsInBrowserWindow(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  const wc = browserWindow.webContents;

  wc.setWindowOpenHandler((details) => {
    const url = details.url || '';
    if (openHttpUrlInSystemBrowser(url)) {
      return { action: 'deny' };
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: browserWindow,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      }
    };
  });

  wc.on('did-create-window', (childWindow) => {
    if (!childWindow || childWindow.isDestroyed()) return;
    const childWc = childWindow.webContents;
    const redirectPopupToBrowser = (event, navigationUrl) => {
      if (!openHttpUrlInSystemBrowser(navigationUrl)) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      try {
        if (!childWindow.isDestroyed()) childWindow.close();
      } catch (_) {}
    };
    childWc.on('will-navigate', redirectPopupToBrowser);
    childWc.on('will-redirect', redirectPopupToBrowser);
  });

  wc.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl || navigationUrl.startsWith('file:')) return;
    try {
      if (isPayPalHost(new URL(navigationUrl).hostname)) {
        event.preventDefault();
        openHttpUrlInSystemBrowser(navigationUrl);
      }
    } catch (_) {}
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    // FIX 1 — ne pas afficher tant que ready-to-show (install pending quitte avant tout affichage)
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    // Icône principale de l'application (barre des tâches / fenêtre)
    // On pointe vers l'ICO via getSrcPath pour que ça fonctionne
    // aussi bien en dev qu'en version packagée.
    icon: getSrcPath(path.join('img', 'icon_app', 'icon_app.ico')),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.resolve(getPreloadPath())
    },
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(getSrcPath('auth.html'));
  mainWindow.setTitle(`DO Stats Tracker v${app.getVersion()}`);
  setupPayPalAndExternalPopupsInBrowserWindow(mainWindow);
  if (autoUpdateManager && autoUpdateManager.setWindowRef) autoUpdateManager.setWindowRef(mainWindow);
  // FIX 1 — affichage uniquement après ready-to-show (évite flash si quitAndInstall au prochain boot)
  mainWindow.once('ready-to-show', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    } catch (e) {
      console.warn('[Main] FIX 1 ready-to-show show:', e?.message || e);
    }
  });

  // DevTools : F12 uniquement en développement (build packagée : désactivé globalement)
  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        event.preventDefault();
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  // Minimisation dans la barre système au clic sur X
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const trayIconPath = getSrcPath(path.join('img', 'icon_app', 'icon_app.ico'));
    if (!fs.existsSync(trayIconPath)) {
      console.warn('[Tray] Icône introuvable:', trayIconPath);
      return;
    }
    tray = new Tray(trayIconPath);
    tray.setToolTip('DarkOrbit Stats Tracker Pro');

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    const trayMenu = Menu.buildFromTemplate([
      {
        label: 'Ouvrir',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Quitter',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(trayMenu);
  } catch (e) {
    console.warn('[Tray] Impossible de créer le tray:', e?.message || e);
  }
}

function setupDarkOrbitAccounts() {
  ipcMain.handle('darkorbit-accounts:list', () => DarkOrbitAccounts.listAccounts());
  ipcMain.handle('darkorbit-accounts:save', (_, input) => DarkOrbitAccounts.saveAccount(input));
  ipcMain.handle('darkorbit-accounts:delete', (_, id) => DarkOrbitAccounts.deleteAccount(id));
  ipcMain.handle('darkorbit-accounts:getAssignments', () => DarkOrbitAccounts.getServerAssignments());
  ipcMain.handle('darkorbit-accounts:saveAssignments', (_, assignments) => DarkOrbitAccounts.saveServerAssignments(assignments));
  ipcMain.handle('darkorbit-accounts:isEncryptionAvailable', () => DarkOrbitAccounts.isEncryptionAvailable());
  ipcMain.handle('darkorbit-accounts:getCredentials', (_, accountId) => {
    return DarkOrbitAccounts.getCredentials(accountId);
  });
  ipcMain.handle('darkorbit-accounts:getAccountForServer', (_, serverCode) => {
    return DarkOrbitAccounts.getAccountForServer(serverCode);
  });
  ipcMain.handle('darkorbit-accounts:SERVERS', () => DarkOrbitAccounts.SERVERS);
}

function setupPlayerStatsCredentials() {
  ipcMain.handle('player-stats-credentials:get', () => PlayerStatsCredentials.getCredentials());
  ipcMain.handle('player-stats-credentials:getAll', () => PlayerStatsCredentials.getAll());
  ipcMain.handle('player-stats-credentials:getActive', () => PlayerStatsCredentials.getActive());
  ipcMain.handle('player-stats-credentials:getActiveWithPassword', () => PlayerStatsCredentials.getActiveWithPassword());
  ipcMain.handle('player-stats-credentials:getByIdWithPassword', (_, id) => PlayerStatsCredentials.getByIdWithPassword(id));
  ipcMain.handle('player-stats-credentials:add', (_, account) => PlayerStatsCredentials.add(account || {}));
  ipcMain.handle('player-stats-credentials:setActive', (_, id) => PlayerStatsCredentials.setActive(id));
  ipcMain.handle('player-stats-credentials:remove', (_, id) => PlayerStatsCredentials.remove(id));
  ipcMain.handle('player-stats-credentials:update', (_, id, fields) => PlayerStatsCredentials.update(id, fields || {}));
  // load() pointe sur loadWithoutPassword() — ne transmet jamais le password au renderer.
  ipcMain.handle('player-stats-credentials:load', () => PlayerStatsCredentials.load());
  ipcMain.handle('player-stats-credentials:save', (_, obj) => {
    if (obj && typeof obj === 'object') PlayerStatsCredentials.savePayload(obj);
  });
  ipcMain.handle('player-stats-credentials:isEncryptionAvailable', () => PlayerStatsCredentials.isEncryptionAvailable());
}

function setupOpenExternal() {
  ipcMain.on('open-external-link', (event, url) => {
    if (typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      console.warn('[security] openExternal bloqué — protocole non autorisé :', url);
      return;
    }
    shell.openExternal(url);
  });
  ipcMain.on('app:openExternal', (event, url) => {
    if (typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      console.warn('[security] openExternal bloqué — protocole non autorisé :', url);
      return;
    }
    shell.openExternal(url);
  });
  ipcMain.on('app:navigateToAuth', () => {
    ScraperBridge.setUserContext(null, null);
    var authPath = getSrcPath('auth.html');
    if (mainWindow) {
      mainWindow.loadFile(authPath);
    }
  });
  ipcMain.on('app:navigateToSubscription', () => {
    var subPath = getSrcPath('subscription.html');
    if (mainWindow) {
      mainWindow.loadFile(subPath);
    }
  });
  ipcMain.on('app:reload', () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.reload();
    }
  });
}

/** Fenêtre qui a invoqué l’IPC (ex. Scraper React) — sinon fenêtre principale. Pour `dostats:log` vers le bon renderer. */
function ipcSenderBrowserWindow(sender) {
  try {
    if (sender) {
      const w = BrowserWindow.fromWebContents(sender);
      if (w && !w.isDestroyed()) return w;
    }
  } catch (_) {}
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function setupScraper() {
  ipcMain.handle('scraping:get-config', async () => {
    const def = { ...DEFAULT_SCRAPING_CONFIG };
    if (!mainWindow || mainWindow.isDestroyed()) return def;
    try {
      const raw = await mainWindow.webContents.executeJavaScript(`
        (function(){
          const k = (window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.SCRAPING_CONFIG) || 'darkOrbitScrapingConfig';
          try {
            if (window.UnifiedStorage && typeof window.UnifiedStorage.get === 'function') return window.UnifiedStorage.get(k);
            const r = localStorage.getItem(k);
            return r ? JSON.parse(r) : null;
          } catch(e) { return null; }
        })()
      `);
      if (raw && typeof raw === 'object') return { ...def, ...raw };

      const sched = loadSchedulerConfig();
      if (sched && Array.isArray(sched.slots) && sched.slots.length > 0) {
        const hours = sched.slots.map(s => (s && typeof s.time === 'string' ? s.time : null)).filter(Boolean);
        if (hours.length > 0) return { ...def, scheduledHours: hours };
      }
    } catch (e) { console.warn('[Main] scraping:get-config:', e?.message || e); }
    return def;
  });
  ipcMain.handle('scraping:save-config', (_, config) => {
    if (!config || typeof config !== 'object') return { ok: false, error: 'Config invalide' };
    const merged = {
      delayBetweenServers: Math.max(10000, Math.min(600000, parseInt(config.delayBetweenServers, 10) || 60000)),
      scheduledHours: Array.isArray(config.scheduledHours) ? config.scheduledHours.filter(h => /^\d{1,2}:\d{2}$/.test(String(h))) : [],
      enabledServers: Array.isArray(config.enabledServers) ? config.enabledServers : [],
      enabledScrapers: { evenements: false },
      eventsScraperAccount: config.eventsScraperAccount && typeof config.eventsScraperAccount === 'object'
        ? { username: String(config.eventsScraperAccount.username || '').trim(), password: String(config.eventsScraperAccount.password || '') }
        : { username: '', password: '' }
    };
    setScrapingConfig(merged);
    const hours = merged.scheduledHours.length > 0 ? merged.scheduledHours : [];
    const scrapers = [];
    const newSlots = hours.map(t => {
      const [hh, mm] = t.split(':').map(Number);
      const norm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      return { time: norm, scrapers: [...scrapers] };
    }).filter(s => s.scrapers.length > 0);
    const prev = loadSchedulerConfig();
    const prevSlots = (prev.slots || []).map(s => ({ time: s.time, scrapers: (s.scrapers || []).slice().sort() })).sort((a, b) => a.time.localeCompare(b.time));
    const nextSlots = newSlots.map(s => ({ time: s.time, scrapers: (s.scrapers || []).slice().sort() })).sort((a, b) => a.time.localeCompare(b.time));
    if (JSON.stringify(prevSlots) !== JSON.stringify(nextSlots)) {
      saveSchedulerConfig({ slots: newSlots });
      setupScheduler();
    }
    return { ok: true };
  });

  ipcMain.handle('scraper:start', async () => {
    return { ok: false, error: 'Collecte classements/profils désactivée.' };
  });
  ipcMain.handle('scraper:startEventsOnly', async () => {
    try {
      const cfg = await mainWindow?.webContents?.executeJavaScript?.(
        `(function(){ const k = (window.APP_KEYS?.STORAGE_KEYS?.SCRAPING_CONFIG) || 'darkOrbitScrapingConfig';
          try { return window.UnifiedStorage?.get?.(k) || JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; }
        })()`
      );
      if (cfg && typeof cfg === 'object') setScrapingConfig(cfg);
    } catch (e) {}
    return ScraperBridge.startEventsOnlyScraping();
  });
  ipcMain.handle('scraper:pause', (_, paused) => ScraperBridge.pauseScraping(paused));
  ipcMain.handle('scraper:stop', () => ScraperBridge.stopScraping());
  ipcMain.handle('scraper:getState', () => ScraperBridge.getState());
  // scraper:showDebugWindow supprimé — feature abandonnée, jamais exposée dans preload.js
  ipcMain.on('scraper:setUserContext', (_, { userId, accessToken }) => {
    ScraperBridge.setUserContext(userId, accessToken);
  });

  ipcMain.on('fresh-token-response', (_, { userId, accessToken }) => {
    if (userId && accessToken) {
      ScraperBridge.setUserContext(userId, accessToken);
    }
    if (typeof global._freshTokenResolve === 'function') {
      if (global._freshTokenTimeout) clearTimeout(global._freshTokenTimeout);
      global._freshTokenTimeout = null;
      global._freshTokenResolve(!!userId && !!accessToken);
      global._freshTokenResolve = null;
    }
  });

  // Méthode 2 — Session scraper (sans extension Chrome ni serveur HTTP)
  ipcMain.handle('session-scraper:start',    async () => SessionScraper.startScraping());
  ipcMain.handle('session-scraper:stop',           () => SessionScraper.stopScraping());
  ipcMain.handle('session-scraper:getState',       () => SessionScraper.getState());

  // Profile scraper — récupération des firmes depuis les pages profil DarkOrbit

  // Client launcher — lance le client DarkOrbit avec interception CDP
  ipcMain.handle('client-launcher:launch', async (_, opts) => ClientLauncher.launch({ ...opts, mainWindow }));
  ipcMain.handle('client-launcher:stop', () => ClientLauncher.stop());
  ipcMain.handle('client-launcher:getState', () => ClientLauncher.getState());

  // Scan CDP profil — scraping automatisé des profils joueurs
  ipcMain.handle('client-launcher:start-scan', async (_, opts) =>
    ClientLauncher.startScan({ ...opts, mainWindow })
  );
  ipcMain.handle('client-launcher:stop-scan', () => ClientLauncher.stopScan());
  ipcMain.handle('client-launcher:get-exe-path', () => ClientLauncher.DEFAULT_CLIENT_PATH);
  ipcMain.handle('client-launcher:browse-exe', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Sélectionner DarkOrbit.exe',
      defaultPath: ClientLauncher.DEFAULT_CLIENT_PATH,
      filters: [{ name: 'Exécutable Windows', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    return result.canceled ? null : (result.filePaths[0] || null);
  });

  ipcMain.handle('client-launcher:collect-player-stats', async (_, opts) =>
    ClientLauncher.collectPlayerStats({ ...opts, mainWindow })
  );

  ipcMain.handle('player-stats-scraper:collect', async (_, opts) => {
    const { serverId, username, password } = opts || {};
    const onProgress = (data) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('player-stats-scraper:progress', data);
      }
    };
    return PlayerStatsScraper.collectPlayerStatsWithLogin({ serverId, username, password, onProgress });
  });
  ipcMain.handle('player-stats-scraper:collect-manual', async (_, opts) => {
    const { serverId } = opts || {};
    return PlayerStatsScraper.collectPlayerStatsManual({ serverId: serverId || 'gbl5' });
  });

  ipcMain.handle('dostats-scraper:start', (event, payload) => {
    const runJob = async () => {
      global.dostatsPipelineRunning = true;
      global.dostatsPipelineRunningSince = Date.now();
      try {
      const groupId = payload && payload.groupId ? String(payload.groupId) : null;
      const serverCode = payload && payload.serverCode ? String(payload.serverCode) : null;
      const serverCodes = Array.isArray(payload?.serverCodes)
        ? payload.serverCodes.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
        : null;
      const payloadServerConfigs = payload && payload.serverConfigs && typeof payload.serverConfigs === 'object'
        ? payload.serverConfigs
        : null;
      const targetWin = event.sender && BrowserWindow.fromWebContents(event.sender);
      const logWin = targetWin || mainWindow;

      function readServerConfigFromSettings(code) {
        try {
          if (!code) return { enabled: true, scrapeRankings: true, scrapeProfiles: false };
          if (!fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) return { enabled: true, scrapeRankings: true, scrapeProfiles: false };
          const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
          const data = JSON.parse(raw);
          const profilesMap = data && typeof data.scrapeProfilesByServer === 'object' ? data.scrapeProfilesByServer : {};
          const rankingsMap = data && typeof data.scrapeRankingsByServer === 'object' ? data.scrapeRankingsByServer : {};
          const enabledMap = data && typeof data.serverEnabledByServer === 'object' ? data.serverEnabledByServer : {};
          return {
            enabled: Object.prototype.hasOwnProperty.call(enabledMap, code) ? !!enabledMap[code] : true,
            scrapeRankings: Object.prototype.hasOwnProperty.call(rankingsMap, code) ? !!rankingsMap[code] : true,
            scrapeProfiles: !!profilesMap[code],
          };
        } catch (_) {
          return { enabled: true, scrapeRankings: true, scrapeProfiles: false };
        }
      }

      function resolveConfigForServer(code) {
        const fromPayload = payloadServerConfigs && payloadServerConfigs[code] && typeof payloadServerConfigs[code] === 'object'
          ? payloadServerConfigs[code]
          : null;
        const fromSettings = readServerConfigFromSettings(code);
        const cfg = {
          enabled: fromSettings.enabled,
          scrapeRankings: fromSettings.scrapeRankings,
          scrapeProfiles: fromSettings.scrapeProfiles,
        };
        if (fromPayload) {
          if (typeof fromPayload.enabled === 'boolean') cfg.enabled = fromPayload.enabled;
          if (typeof fromPayload.scrapeRankings === 'boolean') cfg.scrapeRankings = fromPayload.scrapeRankings;
          if (typeof fromPayload.scrapeProfiles === 'boolean') cfg.scrapeProfiles = fromPayload.scrapeProfiles;
        } else if (serverCode && code === String(serverCode).trim().toLowerCase()) {
          if (payload && Object.prototype.hasOwnProperty.call(payload, 'enabled')) cfg.enabled = !!payload.enabled;
          if (payload && Object.prototype.hasOwnProperty.call(payload, 'scrapeRankings')) cfg.scrapeRankings = !!payload.scrapeRankings;
          if (payload && Object.prototype.hasOwnProperty.call(payload, 'scrapeProfiles')) cfg.scrapeProfiles = !!payload.scrapeProfiles;
        }
        if (!cfg.scrapeRankings) cfg.scrapeProfiles = false;
        return cfg;
      }

      const requestedServerCodes = (serverCodes && serverCodes.length)
        ? serverCodes
        : (serverCode
          ? [String(serverCode).trim().toLowerCase()]
          : (groupId && DOSTATS_GROUPS && DOSTATS_GROUPS[groupId]
            ? DOSTATS_GROUPS[groupId].map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
            : []));
      const enabledRequestedServerCodes = requestedServerCodes.filter((code) => resolveConfigForServer(code).enabled !== false);
      if (requestedServerCodes.length && !enabledRequestedServerCodes.length) {
        sendDostatsSupabaseLog(logWin, null, 'warning', 'Tous les serveurs ciblés sont désactivés.');
        return { ok: true, skipped: 'all_target_servers_disabled' };
      }

      const rankingResult = await runDostatsRankingScraper({
        groupId,
        serverCode,
        serverCodes: enabledRequestedServerCodes.length ? enabledRequestedServerCodes : serverCodes,
        mainWindowRef: targetWin || mainWindow,
      });
      if (!rankingResult || !rankingResult.ok) return rankingResult;

      const targetServersOrdered = [];
      (rankingResult.results || []).forEach((r) => {
        const s = r && r.serverCode ? String(r.serverCode).trim().toLowerCase() : null;
        if (!s) return;
        if (targetServersOrdered.indexOf(s) === -1) targetServersOrdered.push(s);
      });
      if (serverCodes && serverCodes.length) {
        serverCodes.forEach((s) => {
          if (targetServersOrdered.indexOf(s) === -1) targetServersOrdered.push(s);
        });
      }

      const serverConfigByCode = {};
      targetServersOrdered.forEach((code) => {
        serverConfigByCode[code] = resolveConfigForServer(code);
      });

      const enabledServers = targetServersOrdered.filter((code) => serverConfigByCode[code]?.enabled !== false);
      if (!enabledServers.length) {
        sendDostatsSupabaseLog(logWin, null, 'warning', 'Aucun serveur activé pour ce lancement (tout est désactivé).');
        return { ok: true, skipped: 'all_servers_disabled' };
      }

      const serversForRankings = enabledServers.filter((code) => serverConfigByCode[code]?.scrapeRankings !== false);
      if (!serversForRankings.length) {
        return { ok: true, skipped: 'rankings_disabled' };
      }

      const perServerUserIds = new Map(); // server -> Set(userId)
      const dostatsCombosByServer = new Map(); // server -> [{ typeKey, periodKey, entries }]

      (rankingResult.results || []).forEach((r) => {
        if (!r || !r.path || !r.serverCode) return;
        const key = String(r.serverCode).trim().toLowerCase() || 'unknown';
        if (serversForRankings.indexOf(key) === -1) return;
        try {
          const raw = fs.readFileSync(r.path, 'utf8');
          const json = JSON.parse(raw);
          const entries = Array.isArray(json?.entries) ? json.entries : [];
          if (!dostatsCombosByServer.has(key)) dostatsCombosByServer.set(key, []);
          dostatsCombosByServer.get(key).push({
            typeKey: r.type,
            periodKey: r.period,
            entries,
          });

          if (!entries.length) return;
          if (!perServerUserIds.has(key)) perServerUserIds.set(key, new Set());
          const set = perServerUserIds.get(key);
          entries.forEach((e) => {
            if (e && e.user_id) {
              set.add(String(e.user_id).trim());
            }
          });
        } catch (_) {
          // ignore per-file errors
        }
      });

      if (enabledServers.some((code) => serverConfigByCode[code]?.scrapeProfiles)) {
        let concurrency;
        try {
          if (fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) {
            const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
            const data = JSON.parse(raw);
            const v = data && data.scraper && typeof data.scraper.profilesConcurrency === 'number'
              ? data.scraper.profilesConcurrency
              : 3;
            const n = Math.floor(Number.isFinite(v) ? v : 3);
            concurrency = Math.max(1, Math.min(10, n));
          }
        } catch (e) {
          concurrency = undefined;
        }

        // Cycle 2 : profils/gates, seulement après avoir fini les classements.
        for (const server of enabledServers) {
          if (!serverConfigByCode[server]?.scrapeProfiles) continue;
          const idsSet = perServerUserIds.get(server);
          const ids = idsSet ? Array.from(idsSet) : [];
          if (!ids.length) {
            sendDostatsSupabaseLog(logWin, server, 'warning', 'Aucun user_id HoF pour ce serveur (profiles skip).');
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          await runDostatsProfilesScraper({
            serverCode: server,
            userIds: ids,
            mainWindowRef: targetWin || mainWindow,
            concurrency,
          });
        }
      }

      return rankingResult;
      } finally {
        global.dostatsPipelineRunning = false;
        global.dostatsPipelineRunningSince = null;
      }
    };

    const p = dostatsScraperStartQueue.then(() => runJob());
    dostatsScraperStartQueue = p.catch(() => {});
    return p;
  });

  ipcMain.handle('dostats:get-ranking', async (_, { serverCode, typeKey, periodKey }) => {
    const server = (serverCode != null && serverCode !== '') ? String(serverCode).trim().toLowerCase() : '';
    const type = (typeKey != null && typeKey !== '') ? String(typeKey).trim() : 'honor';
    const period = (periodKey != null && periodKey !== '') ? String(periodKey).trim() : 'current';
    return getLatestRanking(server, type, period) ?? null;
  });

  ipcMain.handle('dostats:check-health', async (_, { serverCode, typeKey, periodKey }) => {
    const server = (serverCode != null && serverCode !== '') ? String(serverCode).trim().toLowerCase() : 'gbl5';
    const type = (typeKey != null && typeKey !== '') ? String(typeKey).trim() : 'honor';
    const period = (periodKey != null && periodKey !== '') ? String(periodKey).trim() : 'current';
    return checkDostatsHealth(server, type, period);
  });

  ipcMain.handle('dostats:measure-latency', async (_, { serverCode, typeKey, periodKey, attempts }) => {
    const server = (serverCode != null && serverCode !== '') ? String(serverCode).trim().toLowerCase() : 'gbl5';
    const type = (typeKey != null && typeKey !== '') ? String(typeKey).trim() : 'honor';
    const period = (periodKey != null && periodKey !== '') ? String(periodKey).trim() : 'current';
    const n = (attempts != null && attempts !== '') ? Number(attempts) : undefined;
    return measureDostatsLatency(server, type, period, n);
  });

  ipcMain.handle('dostats:measure-latency-and-scan-profiles', async (event, { serverCode, typeKey, periodKey, attempts, profilesToScan, profilesConcurrency }) => {
    const server = (serverCode != null && serverCode !== '') ? String(serverCode).trim().toLowerCase() : 'gbl5';
    const type = (typeKey != null && typeKey !== '') ? String(typeKey).trim() : 'honor';
    const period = (periodKey != null && periodKey !== '') ? String(periodKey).trim() : 'current';
    const n = (attempts != null && attempts !== '') ? Number(attempts) : undefined;
    const pScan = (profilesToScan != null && profilesToScan !== '') ? Number(profilesToScan) : 1;
    const pConc = (profilesConcurrency != null && profilesConcurrency !== '') ? Number(profilesConcurrency) : 1;
    const logTarget = ipcSenderBrowserWindow(event.sender);
    return measureDostatsLatencyAndScanProfiles(server, type, period, n, pScan, pConc, logTarget);
  });

  ipcMain.handle('dostats-profiles-scraper:start', async (event, payload) => {
    const serverCode = payload && payload.serverCode ? String(payload.serverCode) : null;
    const userIds = Array.isArray(payload?.userIds) ? payload.userIds : [];
    let concurrency = payload && typeof payload.concurrency === 'number' ? payload.concurrency : undefined;

    // Si la concurrence n'est pas fournie explicitement, on la lit depuis les settings du scraper.
    if (typeof concurrency !== 'number') {
      try {
        if (fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) {
          const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
          const data = JSON.parse(raw);
          const v = data && data.scraper && typeof data.scraper.profilesConcurrency === 'number'
            ? data.scraper.profilesConcurrency
            : 3;
          const n = Math.floor(Number.isFinite(v) ? v : 3);
          concurrency = Math.max(1, Math.min(10, n));
        }
      } catch (e) {
        concurrency = undefined;
      }
    }

    if (typeof concurrency === 'number') {
      global.dostatsProfilesConcurrency = concurrency;
    }

    const logTarget = ipcSenderBrowserWindow(event.sender);
    return runDostatsProfilesScraper({ serverCode, userIds, mainWindowRef: logTarget, concurrency });
  });

  ipcMain.handle('dostats:get-latest-profile', async (_, { serverCode, userId }) => {
    const server = (serverCode != null && serverCode !== '') ? String(serverCode).trim().toLowerCase() : 'gbl5';
    const uid = userId != null ? String(userId).trim() : '';
    if (!uid) return null;
    return getLatestProfile(server, uid);
  });

  // Sauvegarde des données scrappées depuis le client DarkOrbit
  // Émis par client-launcher.js via ipcMain.emit('client-launcher:save-data', null, payload)
  // try/catch/finally garantit que 'save-complete' est TOUJOURS émis, même si
  // saveClientScrapedData lève une exception — sinon client-launcher.js se bloquerait
  // en attendant un signal qui n'arriverait jamais.
  ipcMain.on('client-launcher:save-data', async (_, payload) => {
    try {
      await saveClientScrapedData(payload);
    } catch (e) {
      console.error('[main] saveClientScrapedData error:', e?.message || e);
    } finally {
      // Signaler à client-launcher.js que saveClientScrapedData() est terminé
      ipcMain.emit('client-launcher:save-complete', null, { targetId: payload?.targetId });
    }
  });
}

/**
 * Crée un client Supabase.
 * Si un token est fourni (ou disponible dans global), il est injecté en Authorization.
 * Sans token, le client utilise la clé anonyme seule (pour les tables public-readable).
 */
function makeMainSupabaseClient(token) {
  const url     = process.env.SUPABASE_URL     || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const bearer  = token || global.supabaseAccessToken || null;
  const opts    = bearer
    ? { global: { headers: { Authorization: `Bearer ${bearer}` } } }
    : {};
  return createClient(url, anonKey, opts);
}

function sendDostatsSupabaseLog(logWin, server, type, message) {
  if (!logWin || logWin.isDestroyed?.() || !logWin.webContents) return;
  try {
    logWin.webContents.send('dostats:log', {
      type,
      server: server || null,
      metric_type: 'supabase_dostats',
      period: 'current',
      message,
      at: new Date().toISOString(),
    });
  } catch (_) {}
}

/**
 * Persiste firme / CDP dans profiles_players (merge company, cdp_grade, game_time).
 *
 * @param {{ pseudo, userId, company, grade, server, url, date }} payload
 */
async function saveClientScrapedData(payload) {
  const { pseudo, userId, company, grade, game_time, server, url, date } = payload || {};

  if (!company || !server) {
    console.warn('[Main] saveClientScrapedData — données insuffisantes (company ou server manquant)');
    return;
  }

  // ── Résolution de l'identité (polling 500 ms, timeout 10 s) ─────────────
  let resolvedUserId = global.currentUserId || null;

  if (!resolvedUserId) {
    const idPollStart = Date.now();
    while (!global.currentUserId && (Date.now() - idPollStart) < 10000) {
      await new Promise((r) => setTimeout(r, 500));
    }
    resolvedUserId = global.currentUserId || null;
  }

  if (!resolvedUserId) {
    const superAdminId = process.env.SUPERADMIN_USER_ID;
    if (!superAdminId) {
      console.error('[SECURITY] SUPERADMIN_USER_ID manquant dans .env — opération annulée');
      return;
    }
    resolvedUserId = superAdminId;
  }

  // ── Attente du token (obligatoire pour toute opération SUPERADMIN) ────────
  if (!global.supabaseAccessToken) {
    const tokenPollStart = Date.now();
    while (!global.supabaseAccessToken && (Date.now() - tokenPollStart) < 10000) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (!global.supabaseAccessToken) {
    console.warn('[Main] saveClientScrapedData — token introuvable après 10 s — abandon (SUPERADMIN requiert un token valide)');
    return;
  }

  // ── Vérification du rôle superadmin via Supabase ──────────────────────────
  // Utilise le token si disponible, sinon tente avec la clé anonyme.
  const supabase = makeMainSupabaseClient();
  let role = 'unknown';
  try {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('badge')
      .eq('id', resolvedUserId)
      .single();
    if (profileErr) {
      console.warn(`[Main] saveClientScrapedData — lecture profil ÉCHEC: ${profileErr.message} (code: ${profileErr.code})`);
    } else {
      role = (profile?.badge || '').toLowerCase();
    }
  } catch (e) {
    console.warn('[Main] saveClientScrapedData — exception lecture profil:', e?.message);
  }

  if (role !== 'superadmin') {
    console.warn(`[Main] Droits insuffisants pour le scraping (Rôle: ${role})`);
    return;
  }

  try {
    const srv = String(server || '').toLowerCase().trim();
    const uid = userId ? String(userId).trim() : '';
    if (!srv || !uid) {
      console.warn('[Main] saveClientScrapedData — server ou userId manquant pour profiles_players');
      return;
    }

    const { data: cur, error: readErr } = await supabase
      .from('profiles_players')
      .select('company, cdp_grade, game_time, pseudo')
      .eq('server', srv)
      .eq('user_id', uid)
      .maybeSingle();

    if (readErr && readErr.code !== 'PGRST116') {
      console.error('[Main] saveClientScrapedData — lecture profiles_players:', readErr.message);
      return;
    }

    const companyKnown = cur?.company && String(cur.company).trim() !== '';
    const cdpKnown = cur?.cdp_grade && String(cur.cdp_grade).trim() !== '';
    const gtKnown = cur?.game_time && String(cur.game_time).trim() !== '';

    const nowIso = date || new Date().toISOString();
    const patch = {
      client_scraped_at: nowIso,
      scraped_at: new Date().toISOString(),
    };
    if (pseudo) patch.pseudo = pseudo;
    if (!companyKnown && company) patch.company = company;
    if (!cdpKnown && grade) patch.cdp_grade = grade;
    if (!gtKnown && game_time) patch.game_time = game_time;

    let writeErr;
    if (cur) {
      const resUp = await supabase.from('profiles_players').update(patch).eq('server', srv).eq('user_id', uid);
      writeErr = resUp.error;
    } else {
      const resIn = await supabase.from('profiles_players').insert({
        server: srv,
        user_id: uid,
        pseudo: pseudo || null,
        company: company || null,
        cdp_grade: grade || null,
        game_time: game_time || null,
        client_scraped_at: nowIso,
        scraped_at: new Date().toISOString(),
      });
      writeErr = resIn.error;
    }

    if (writeErr) {
      console.error('[Main] saveClientScrapedData — écriture profiles_players:', writeErr.message);
      return;
    }

    const displayName = pseudo || userId || 'Joueur inconnu';
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('client-launcher:save-success', {
        pseudo: displayName,
        company,
        server,
        url,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('[Main] saveClientScrapedData — exception:', e?.message);
  }
}

async function runScheduledScrapers(scrapers) {
  if (!Array.isArray(scrapers) || scrapers.length === 0) return;
  const sessionStateRunning = (() => {
    try {
      return !!SessionScraper?.getState?.().running;
    } catch (_) {
      return false;
    }
  })();
  if (global.scrapingState?.running || sessionStateRunning) {
    sendSchedulerLog('Scraping déjà en cours, ignoré.', 'warning');
    return;
  }
  if (!global.currentUserId || !global.supabaseAccessToken) {
    sendSchedulerLog('Scraping automatique ignoré : utilisateur non authentifié.', 'warning');
    return;
  }
  sendSchedulerLog('Démarrage planifié — ' + scrapers.join(', '), 'info');
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      const cfg = await mainWindow.webContents.executeJavaScript(
        `(function(){ const k = (window.APP_KEYS?.STORAGE_KEYS?.SCRAPING_CONFIG) || 'darkOrbitScrapingConfig';
          try { return window.UnifiedStorage?.get?.(k) || JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; }
        })()`
      );
      if (cfg && typeof cfg === 'object') setScrapingConfig(cfg);
    }
  } catch (e) {}
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('scheduler-started');
  }
  const unique = [...new Set(scrapers)];
  for (const s of unique) {
    if (s === 'serveurs') {
      sendSchedulerLog('Déclenchement Scraping serveurs (SessionScraper)', 'info');
      await SessionScraper.startScraping();
      // SessionScraper n'utilise pas global.scrapingState ; on poll son state interne.
      while (true) {
        const st = (() => {
          try { return SessionScraper?.getState?.(); } catch (_) { return null; }
        })();
        if (!st?.running) break;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  sendSchedulerLog('Planifié terminé.', 'info');
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('scheduler-finished');
  }
}

function sendSchedulerLog(message, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('scheduler-log', { message, type, time: new Date().toISOString() });
  }
}

function setupScheduler() {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
  }
  const config = loadSchedulerConfig();
  const slots = (config.slots || []).filter(s => s.time && Array.isArray(s.scrapers) && s.scrapers.length > 0);
  if (slots.length === 0) {
    sendSchedulerLog('Aucun créneau configuré.', 'info');
    return;
  }
  const check = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const key = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const slot = slots.find(s => s.time === key);
    if (slot) {
      sendSchedulerLog(`Heure ${key} — Déclenchement: ${slot.scrapers.join(', ')}`, 'info');
      runScheduledScrapers(slot.scrapers).catch(e => {
        sendSchedulerLog('Erreur: ' + (e?.message || e), 'error');
      });
    }
  };
  schedulerIntervalId = setInterval(check, 60000);
  sendSchedulerLog('Créneaux auto actifs — ' + slots.map(s => s.time).join(', '), 'info');
}

function cleanupBeforeQuit() {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    console.log('[Main] Scheduler arrêté');
  }
  try {
    ScraperBridge.cleanup();
  } catch (e) {
    console.warn('[Main] Erreur ScraperBridge.cleanup:', e?.message || e);
  }
  try {
    SessionScraper.cleanup();
  } catch (e) {
    console.warn('[Main] Erreur SessionScraper.cleanup:', e?.message || e);
  }
  try {
    ClientLauncher.stop();
  } catch (e) {
    console.warn('[Main] Erreur ClientLauncher.stop:', e?.message || e);
  }
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

app.on('ready', async () => {
  var lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return;
  }

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  }

  ipcMain.handle('scheduler:getConfig', () => loadSchedulerConfig());
  ipcMain.handle('scheduler:saveConfig', (_, config) => {
    if (!config || !Array.isArray(config.slots)) return { ok: false, error: 'Config invalide' };
    // slots vide = désactiver le scheduler
    if (config.slots.length === 0) {
      if (!saveSchedulerConfig({ slots: [] })) return { ok: false, error: 'Erreur écriture fichier' };
      setupScheduler();
      return { ok: true };
    }
    const seen = {};
    const normalized = { slots: config.slots.map((s) => {
      if (!s.time || !/^\d{1,2}:\d{2}$/.test(s.time)) return null;
      const [hh, mm] = s.time.split(':').map(Number);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
      const norm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      if (seen[norm]) return null;
      seen[norm] = true;
      const scrapers = Array.isArray(s.scrapers) ? s.scrapers.filter(Boolean) : [];
      if (scrapers.length === 0) return null;
      return { time: norm, scrapers };
    }).filter(Boolean) };
    if (!saveSchedulerConfig(normalized)) return { ok: false, error: 'Erreur écriture fichier' };
    setupScheduler();
    return { ok: true };
  });
  ipcMain.handle('scheduler:reload', () => { setupScheduler(); return { ok: true }; });

  const pkg = require('./package.json');
  autoUpdateManager = initAutoUpdater(mainWindow, pkg);
  // FIX 1 — avant toute fenêtre visible : install en attente → quitAndInstall immédiat, pas de createWindow
  if (autoUpdateManager.checkPendingInstall()) {
    return;
  }
  createWindow();
  createTray();
  // FIX 3 — vérif MAJ déclenchée sur ready-to-show (voir setup(win) dans auto-updater.js)
  if (autoUpdateManager.setup) autoUpdateManager.setup(mainWindow);
  ipcMain.on('update:check', () => {
    if (autoUpdateManager && autoUpdateManager.checkNow) autoUpdateManager.checkNow();
  });
  ipcMain.handle('update:check-blocking-operations', () => getBlockingOperationsState());
  ipcMain.handle('update:quit-and-install', () => {
    const s = getBlockingOperationsState();
    if (s.blocking) return { ok: false, blocking: true, reasons: s.reasons };
    if (!autoUpdateManager || !autoUpdateManager.quitAndInstallNow) return { ok: false };
    return { ok: !!autoUpdateManager.quitAndInstallNow() };
  });
  ipcMain.handle('update:quit-and-install-confirmed', () => {
    if (!autoUpdateManager || !autoUpdateManager.quitAndInstallNow) return { ok: false };
    return { ok: !!autoUpdateManager.quitAndInstallNow() };
  });
  ipcMain.on('window:toggle-always-on-top', (event, desiredState) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (typeof desiredState === 'boolean') {
      alwaysOnTop = desiredState;
    } else {
      alwaysOnTop = !mainWindow.isAlwaysOnTop();
    }
    try {
      mainWindow.setAlwaysOnTop(alwaysOnTop);
    } catch (e) {}
    const payload = { enabled: !!alwaysOnTop };
    try {
      if (event && event.sender) {
        event.sender.send('window:always-on-top-changed', payload);
      }
      if (mainWindow && mainWindow.webContents && event.sender !== mainWindow.webContents) {
        mainWindow.webContents.send('window:always-on-top-changed', payload);
      }
    } catch (e) {}
  });
  ipcMain.on('window:controls:minimize', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) win.minimize();
    } catch (e) {}
  });
  ipcMain.on('window:controls:maximize-toggle', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      }
    } catch (e) {}
  });
  ipcMain.on('window:controls:close', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) win.close();
    } catch (e) {}
  });
  setupOpenExternal();
  setupDarkOrbitAccounts();
  setupPlayerStatsCredentials();
  setupScraper();
  setupScheduler();

  ipcMain.handle('do-events:scrape', async () => ({
    ok: false,
    error: 'Collecte événements DarkOrbit désactivée.',
    events: [],
    pushedToSupabase: false
  }));

  const { pathToFileURL } = require('url');
  function listMultillinguesEventJsonFiles() {
    try {
      const baseDir = getSrcPath('multillingues_events');
      if (!fs.existsSync(baseDir)) return [];
      return fs.readdirSync(baseDir)
        .filter(function (name) {
          return /\.json$/i.test(name) && name.toLowerCase() !== 'manifest.json';
        })
        .sort(function (a, b) { return a.localeCompare(b, 'en'); });
    } catch (e) {
      console.warn('[Main] listMultillinguesEventJsonFiles:', e?.message || e);
      return [];
    }
  }
  ipcMain.handle('events:list-multillingues-json', () => {
    try {
      return { ok: true, files: listMultillinguesEventJsonFiles() };
    } catch (e) {
      return { ok: false, files: [], error: e.message };
    }
  });
  ipcMain.handle('do-events:get-definitions', () => {
    try {
      const baseDir = getSrcPath('multillingues_events');
      const srcDir = getSrcPath('');
      let baseUrlForImages = pathToFileURL(path.join(srcDir)).href;
    if (!baseUrlForImages.endsWith('/')) baseUrlForImages += '/';
      const definitions = [];
      for (const filename of listMultillinguesEventJsonFiles()) {
        const filePath = path.join(baseDir, filename);
        if (!fs.existsSync(filePath)) continue;
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw);
          if (data && typeof data === 'object') {
            definitions.push({
              id: data.id || '',
              names: data.names || {},
              keywords: (data.keywords || []).slice(0, 30),
              exclude_keywords: (data.exclude_keywords || []).slice(0, 20),
              image: data.image || '',
            });
          }
        } catch (parseErr) { console.warn('[Main] do-events:get-definitions — JSON invalide dans', filename, ':', parseErr?.message); }
      }
      return { ok: true, baseUrlForImages, definitions };
    } catch (e) {
      console.warn('[Main] do-events:get-definitions:', e?.message || e);
      return { ok: false, definitions: [], baseUrlForImages: '' };
    }
  });

  ipcMain.handle('scraper-app:clear-visu-data', async () => {
    try {
      const rankingsRoot = path.join(app.getPath('userData'), 'rankings_output');
      if (fs.existsSync(rankingsRoot)) {
        fs.rmSync(rankingsRoot, { recursive: true, force: true });
      }
      return { ok: true };
    } catch (e) {
      console.warn('[Main] scraper-app:clear-visu-data:', e?.message || e);
      return { ok: false, error: e?.message || 'Erreur suppression' };
    }
  });

  ipcMain.handle('scraper-app:save-do-events', (_, events) => {
    try {
      if (!Array.isArray(events)) return { ok: false, error: 'events doit être un tableau' };
      const payload = { events, savedAt: new Date().toISOString() };
      fs.writeFileSync(DO_EVENTS_CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      console.warn('[Main] scraper-app:save-do-events:', e?.message || e);
      return { ok: false, error: e?.message || 'Erreur écriture' };
    }
  });

  ipcMain.handle('scraper-app:load-do-events', () => {
    try {
      if (!fs.existsSync(DO_EVENTS_CACHE_PATH)) return { ok: true, events: [] };
      const raw = fs.readFileSync(DO_EVENTS_CACHE_PATH, 'utf8');
      const data = JSON.parse(raw);
      const events = Array.isArray(data?.events) ? data.events : [];
      return { ok: true, events };
    } catch (e) {
      console.warn('[Main] scraper-app:load-do-events — cache corrompu, réinitialisation:', e?.message || e);
      try { fs.unlinkSync(DO_EVENTS_CACHE_PATH); } catch (_) {}
      return { ok: true, events: [] };
    }
  });

  ipcMain.handle('scraper-app:test-webhook', async (_, { url, type }) => {
    const https = require('https');
    const http = require('http');
    if (!url || typeof url !== 'string') return { ok: false, error: 'URL manquante' };
    let parsed;
    try { parsed = new URL(url); } catch (_) { return { ok: false, error: 'URL invalide' }; }
    const isDiscord = type === 'discord';
    const body = JSON.stringify(
      isDiscord
        ? { content: '🔔 Test de connexion depuis **DarkOrbit Tracker**' }
        : { test: true, source: 'DarkOrbit Tracker', timestamp: new Date().toISOString() }
    );
    return new Promise((resolve) => {
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.pathname + (parsed.search || ''), method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 8000 },
        (res) => {
          res.resume();
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          resolve({ ok, statusCode: res.statusCode });
        }
      );
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
      req.on('error', (e) => resolve({ ok: false, error: e.message || 'Erreur réseau' }));
      req.write(body);
      req.end();
    });
  });

  ipcMain.handle('scraper-app:test-proxy', async (_, { host, port, username, password, testUrl }) => {
    const http = require('http');
    const target = (() => { try { return new URL(testUrl || 'https://dostats.info'); } catch (_) { return new URL('https://dostats.info'); } })();
    const targetHost = target.hostname;
    const targetPort = target.protocol === 'https:' ? 443 : 80;
    return new Promise((resolve) => {
      const start = Date.now();
      const TIMEOUT = 8000;
      const req = http.request({
        host: String(host || ''),
        port: parseInt(port, 10) || 8080,
        method: 'CONNECT',
        path: `${targetHost}:${targetPort}`,
        timeout: TIMEOUT,
        headers: {
          'Proxy-Connection': 'keep-alive',
          ...(username && password
            ? { 'Proxy-Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') }
            : {}),
        },
      });
      const tid = setTimeout(() => { try { req.destroy(); } catch (_) {} resolve({ ok: false, error: 'Timeout', latency: null }); }, TIMEOUT);
      req.on('connect', (res, socket) => {
        clearTimeout(tid);
        try { socket.destroy(); } catch (_) {}
        if (res.statusCode !== 200) return resolve({ ok: false, error: `CONNECT ${res.statusCode}`, latency: null });
        resolve({ ok: true, latency: Date.now() - start });
      });
      req.on('error', (e) => { clearTimeout(tid); resolve({ ok: false, error: e.message || 'Erreur connexion', latency: null }); });
      req.end();
    });
  });

  ipcMain.handle('scraper-app:load-settings', () => {
    try {
      if (!fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) return null;
      const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch (e) {
      console.warn('[Main] scraper-app:load-settings:', e?.message || e);
      return null;
    }
  });

  ipcMain.handle('scraper-app:save-settings', (_, settings) => {
    try {
      if (!settings || typeof settings !== 'object') return { ok: false, error: 'Paramètre invalide' };
      fs.writeFileSync(SCRAPER_APP_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      console.warn('[Main] scraper-app:save-settings:', e?.message || e);
      return { ok: false, error: e?.message || 'Erreur écriture' };
    }
  });

  ipcMain.handle('scraper-app:get-scrape-profiles-preference', (_, serverCode) => {
    try {
      const code = serverCode != null ? String(serverCode).trim().toLowerCase() : '';
      if (!code) return false;
      if (!fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) return false;
      const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
      const data = JSON.parse(raw);
      const map = data && typeof data.scrapeProfilesByServer === 'object' ? data.scrapeProfilesByServer : {};
      return !!map[code];
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('scraper-app:set-scrape-profiles-preference', (_, { serverCode, value }) => {
    try {
      const code = serverCode != null ? String(serverCode).trim().toLowerCase() : '';
      if (!code) return { ok: true };
      let data = {};
      if (fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) {
        const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
        data = JSON.parse(raw);
      }
      if (!data || typeof data !== 'object') data = {};
      if (typeof data.scrapeProfilesByServer !== 'object') data.scrapeProfilesByServer = {};
      data.scrapeProfilesByServer[code] = !!value;
      fs.writeFileSync(SCRAPER_APP_SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      console.warn('[Main] scraper-app:set-scrape-profiles-preference:', e?.message || e);
      return { ok: false, error: e?.message || 'Erreur écriture' };
    }
  });

  ipcMain.handle('scraper-app:get-server-scrape-config', (_, serverCode) => {
    try {
      const code = serverCode != null ? String(serverCode).trim().toLowerCase() : '';
      if (!code) {
        return {
          enabled: true,
          scrapeRankings: true,
          scrapeProfiles: false,
        };
      }
      if (!fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) {
        return {
          enabled: true,
          scrapeRankings: true,
          scrapeProfiles: false,
        };
      }
      const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
      const data = JSON.parse(raw);
      const profilesMap = data && typeof data.scrapeProfilesByServer === 'object' ? data.scrapeProfilesByServer : {};
      const rankingsMap = data && typeof data.scrapeRankingsByServer === 'object' ? data.scrapeRankingsByServer : {};
      const enabledMap = data && typeof data.serverEnabledByServer === 'object' ? data.serverEnabledByServer : {};
      return {
        enabled: Object.prototype.hasOwnProperty.call(enabledMap, code) ? !!enabledMap[code] : true,
        scrapeRankings: Object.prototype.hasOwnProperty.call(rankingsMap, code) ? !!rankingsMap[code] : true,
        scrapeProfiles: !!profilesMap[code],
      };
    } catch (e) {
      return {
        enabled: true,
        scrapeRankings: true,
        scrapeProfiles: false,
      };
    }
  });

  ipcMain.handle('scraper-app:set-server-scrape-config', (_, { serverCode, scrapeRankings, scrapeProfiles, enabled }) => {
    try {
      const code = serverCode != null ? String(serverCode).trim().toLowerCase() : '';
      if (!code) return { ok: true };
      let data = {};
      if (fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) {
        const raw = fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8');
        data = JSON.parse(raw);
      }
      if (!data || typeof data !== 'object') data = {};
      if (typeof data.scrapeProfilesByServer !== 'object') data.scrapeProfilesByServer = {};
      if (typeof data.scrapeRankingsByServer !== 'object') data.scrapeRankingsByServer = {};
      if (typeof data.serverEnabledByServer !== 'object') data.serverEnabledByServer = {};
      if (typeof scrapeProfiles === 'boolean') {
        data.scrapeProfilesByServer[code] = scrapeProfiles;
      }
      if (typeof scrapeRankings === 'boolean') {
        data.scrapeRankingsByServer[code] = scrapeRankings;
      }
      if (typeof enabled === 'boolean') {
        data.serverEnabledByServer[code] = enabled;
      }
      fs.writeFileSync(SCRAPER_APP_SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      console.warn('[Main] scraper-app:set-server-scrape-config:', e?.message || e);
      return { ok: false, error: e?.message || 'Erreur écriture' };
    }
  });

  ipcMain.handle('scraper-app:load-planning-extra', () => {
    try {
      if (!fs.existsSync(SCRAPER_APP_PLANNING_PATH)) return { ok: true, schedules: [], banned: [] };
      const raw = fs.readFileSync(SCRAPER_APP_PLANNING_PATH, 'utf8');
      const data = JSON.parse(raw);
      const schedules = Array.isArray(data?.schedules) ? data.schedules : [];
      const banned = Array.isArray(data?.banned) ? data.banned : [];
      return { ok: true, schedules, banned };
    } catch (e) {
      console.warn('[Main] scraper-app:load-planning-extra:', e?.message || e);
      return { ok: true, schedules: [], banned: [] };
    }
  });

  ipcMain.handle('scraper-app:save-planning-extra', (_, payload) => {
    try {
      const schedules = Array.isArray(payload?.schedules) ? payload.schedules : [];
      const banned = Array.isArray(payload?.banned) ? payload.banned : [];
      fs.writeFileSync(SCRAPER_APP_PLANNING_PATH, JSON.stringify({ schedules, banned }, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      console.warn('[Main] scraper-app:save-planning-extra:', e?.message || e);
      return { ok: false, error: e?.message || 'Erreur écriture' };
    }
  });

  ipcMain.handle('scraper-app:pick-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Sélectionner un dossier',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] || null);
  });

  try {
    await ScraperBridge.init(mainWindow);
  } catch (e) {
    console.warn('[Scraper] Init:', e?.message || e);
  }

  SessionScraper.init(mainWindow);
  ClientLauncher.init(mainWindow);

  var deepLinkUrl = parseDeepLinkUrl(process.argv);
  if (deepLinkUrl) handleDeepLink(deepLinkUrl);
});

app.on('second-instance', (event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  var deepLinkUrl = parseDeepLinkUrl(argv);
  if (deepLinkUrl) handleDeepLink(deepLinkUrl);
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) handleDeepLink(url);
  else setTimeout(() => handleDeepLink(url), 500);
});

app.on('before-quit', () => {
  // Mise à jour standard : installée au prochain lancement (pas ici)
  isQuitting = true;
  cleanupBeforeQuit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});