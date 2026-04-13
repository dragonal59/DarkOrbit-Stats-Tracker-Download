require('dotenv').config();
if (process.stdout?.setEncoding) process.stdout.setEncoding('utf8');
if (process.stderr?.setEncoding) process.stderr.setEncoding('utf8');

const { app, BrowserWindow, Menu, Tray, ipcMain, shell } = require('electron');
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

const PlayerStatsScraper = require('./electron/player-stats-scraper');
const PlayerStatsCredentials = require('./electron/player-stats-credentials');

let mainWindow;

let tray;
let isQuitting = false;

function getBlockingOperationsState() {
  return { blocking: false, reasons: [] };
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
    global.currentUserId = null;
    global.supabaseAccessToken = null;
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

function setupAuthAndPlayerStatsIpc() {
  ipcMain.on('auth:set-user-context', (_, { userId, accessToken }) => {
    global.currentUserId = userId || null;
    global.supabaseAccessToken = accessToken || null;
  });
  ipcMain.on('scraper:setUserContext', (_, { userId, accessToken }) => {
    global.currentUserId = userId || null;
    global.supabaseAccessToken = accessToken || null;
  });
  ipcMain.on('fresh-token-response', (_, { userId, accessToken }) => {
    global.currentUserId = userId || null;
    global.supabaseAccessToken = accessToken || null;
    if (typeof global._freshTokenResolve === 'function') {
      if (global._freshTokenTimeout) clearTimeout(global._freshTokenTimeout);
      global._freshTokenTimeout = null;
      global._freshTokenResolve(!!userId && !!accessToken);
      global._freshTokenResolve = null;
    }
  });
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
}

function cleanupBeforeQuit() {
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
  setupPlayerStatsCredentials();
  setupAuthAndPlayerStatsIpc();

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