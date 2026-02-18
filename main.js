require('dotenv').config();

const { app, BrowserWindow, Menu, Tray, ipcMain, shell } = require('electron');
const path = require('path');
const DarkOrbitAccounts = require('./electron/darkorbit-accounts');
const ScraperManager = require('./electron/scraper-manager');

let mainWindow;
let tray;
let isQuitting = false;

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
      const filePath = path.join(__dirname, 'src', 'confirm-email.html');
      const fileUrl = require('url').pathToFileURL(filePath).href + (hash ? hash : '');
      mainWindow.loadURL(fileUrl);
    } else if (pathname.includes('reset-password')) {
      mainWindow.show();
      mainWindow.focus();
      const success = parsed.searchParams.get('success');
      const authPath = path.join(__dirname, 'src', 'auth.html');
      const authUrl = require('url').pathToFileURL(authPath).href + (success ? '?password_reset=1' : '');
      mainWindow.loadURL(authUrl);
    }
  } catch (e) {
    console.warn('[DeepLink] Erreur parsing URL:', e?.message || e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js')
    },
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'src/auth.html'));

  // Console accessible uniquement via F12 (plus d'ouverture automatique au lancement)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Menu simple
  const menu = Menu.buildFromTemplate([
    {
      label: 'Fichier',
      submenu: [
        { label: 'Quitter', click: () => app.quit() }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

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
    const trayIconPath = path.join(__dirname, 'src', 'ico', 'icon_app.png');
    const fs = require('fs');
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

function setupOpenExternal() {
  ipcMain.on('open-external-link', (event, url) => {
    if (url && typeof url === 'string') shell.openExternal(url);
  });
}

function setupScraper() {
  ipcMain.handle('scraper:start', async () => ScraperManager.startScraping('manual'));
  ipcMain.handle('scraper:stop', () => ScraperManager.stopScraping());
  ipcMain.handle('scraper:getState', () => ScraperManager.getState());
  ipcMain.handle('scraper:showDebugWindow', () => ScraperManager.showDebugWindow());
  ipcMain.on('scraper:setUserContext', (_, { userId, accessToken }) => {
    ScraperManager.setUserContext(userId, accessToken);
  });
}

function setupScheduler() {
  const check = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if ((h === 0 || h === 12) && m === 0) {
      if (!global.scrapingState?.running) {
        console.log('[Scheduler] Déclenchement scraping automatique', h === 0 ? '00h00' : '12h00');
        ScraperManager.startScraping('auto');
      }
    }
  };
  setInterval(check, 60000);
  console.log('[Scheduler] Planificateur actif (00h00, 12h00)');
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

  createWindow();
  createTray();
  setupOpenExternal();
  setupDarkOrbitAccounts();
  setupScraper();
  setupScheduler();

  try {
    await ScraperManager.init(mainWindow);
  } catch (e) {
    console.warn('[Scraper] Init:', e?.message || e);
  }

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
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});