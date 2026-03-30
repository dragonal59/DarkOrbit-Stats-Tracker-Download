require('dotenv').config();
if (process.stdout?.setEncoding) process.stdout.setEncoding('utf8');
if (process.stderr?.setEncoding) process.stderr.setEncoding('utf8');

const { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { initAutoUpdater } = require('./electron/auto-updater');
const { readMergedSupabaseConfigFromDisk } = require('./electron/supabase-config-from-disk');

Menu.setApplicationMenu(null);

// FIX 2 — reset explicite au boot (crash brutal session précédente : le finally peut ne pas s’exécuter)
global.dostatsPipelineRunning = false;
global.dostatsPipelineRunningSince = null;

let autoUpdateManager = null;
let alwaysOnTop = false;

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:is-packaged', () => app.isPackaged);

// Pythscrap — enregistré au démarrage pour être toujours disponible (Dashboard > Planificateur)
ipcMain.handle('pythscrap:launch', async () => {
  const pythscrapDir = process.platform === 'win32'
    ? path.join(process.env.USERPROFILE || '', 'Desktop', 'pythscrap')
    : path.join(process.env.HOME || '', 'Desktop', 'pythscrap');
  const appPy = path.join(pythscrapDir, 'app.py');
  if (!fs.existsSync(appPy)) {
    return { ok: false, error: 'Pythscrap non trouvé (Desktop/pythscrap/app.py)' };
  }
  const pyCmd = process.platform === 'win32' ? 'py' : 'python3';
  try {
    const py = spawn(pyCmd, ['-u', appPy], {
      cwd: pythscrapDir,
      stdio: 'ignore',
      shell: process.platform === 'win32',
      detached: true,
    });
    py.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'Impossible de lancer Python' };
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
const { loginAndExtractEventsOnly, runEventsScraping } = require('./electron/events-scraper-standalone');

let mainWindow;
let scraperWindow = null;

/** Une seule exécution DOSTATS (classements + suite profils/Supabase) à la fois : plusieurs `invoke` sans await enchaînés saturaient DOStats / Chromium. */
let dostatsScraperStartQueue = Promise.resolve();

let tray;
let isQuitting = false;
let schedulerIntervalId = null;
let hofPlanningIntervalId = null;

const hofPlanningState = {
  current: { status: 'idle', groupId: null, startedAt: null, endedAt: null },
  pending: null, // { groupId, scheduledAt, waitMinutesAfterCurrent }
  pendingTimeoutId: null,
  next: null,    // { groupId, from, at }
};

const SCHEDULER_CONFIG_PATH = path.join(app.getPath('userData'), 'scheduler-config.json');
const HOF_PLANNING_CONFIG_PATH = path.join(app.getPath('userData'), 'hof-planning.json');
const HOF_PLANNING_HISTORY_PATH = path.join(app.getPath('userData'), 'hof-planning-history.json');
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
    if (hofPlanningState.current && hofPlanningState.current.status === 'running') reasons.push('hof');
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
        const migrated = data.slots.map(s => ({
          time: s.time,
          scrapers: (s.scrapers || []).filter(x => x === 'evenements')
        })).filter(s => s.scrapers.length > 0);
        if (migrated.length > 0) {
          const needsSave = data.slots.some(s => (s.scrapers || []).some(x => x === 'statistiques_joueurs' || x === 'classements' || x === 'dostats'));
          if (needsSave) saveSchedulerConfig({ slots: migrated });
          return { slots: migrated };
        }
      }
      if (data && Array.isArray(data.slotsEvents)) {
        const e = data.slotsEvents || [];
        const allHours = [...new Set(e)].sort();
        const slots = allHours.map(time => ({ time, scrapers: ['evenements'] }));
        if (slots.length > 0) {
          saveSchedulerConfig({ slots });
          return { slots };
        }
      }
    }
  } catch (e) { console.warn('[Scheduler] loadConfig:', e?.message || e); }
  return { slots: [{ time: '00:00', scrapers: ['evenements'] }, { time: '12:00', scrapers: ['evenements'] }] };
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

function loadHofPlanningConfig() {
  try {
    if (fs.existsSync(HOF_PLANNING_CONFIG_PATH)) {
      const raw = fs.readFileSync(HOF_PLANNING_CONFIG_PATH, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        return data;
      }
    }
  } catch (e) {
    console.warn('[HofPlanning] loadConfig:', e?.message || e);
  }
  return { groups: {} };
}

function saveHofPlanningConfig(config) {
  try {
    fs.writeFileSync(HOF_PLANNING_CONFIG_PATH, JSON.stringify(config || { groups: {} }, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[HofPlanning] saveConfig:', e?.message || e);
    return false;
  }
}

function loadHofPlanningHistory() {
  try {
    if (!fs.existsSync(HOF_PLANNING_HISTORY_PATH)) return [];
    const raw = fs.readFileSync(HOF_PLANNING_HISTORY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[HofPlanning] Erreur lecture historique:', e?.message || e);
    return [];
  }
}

function appendHofPlanningHistory(entry) {
  try {
    if (!entry || typeof entry !== 'object') return;
    const history = loadHofPlanningHistory();
    history.push(entry);
    const MAX = 100;
    const trimmed = history.length > MAX ? history.slice(history.length - MAX) : history;
    fs.writeFileSync(HOF_PLANNING_HISTORY_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
  } catch (e) {
    console.warn('[HofPlanning] Erreur écriture historique:', e?.message || e);
  }
}

function getDayKeyForDate(date) {
  const d = date.getDay(); // 0 = dimanche
  switch (d) {
    case 0: return 'sun';
    case 1: return 'mon';
    case 2: return 'tue';
    case 3: return 'wed';
    case 4: return 'thu';
    case 5: return 'fri';
    case 6: return 'sat';
    default: return null;
  }
}

function checkHofPlanning(now) {
  const cfg = loadHofPlanningConfig();
  const groupsCfg = (cfg && typeof cfg === 'object' && cfg.groups) || {};
  const groupIds = Object.keys(groupsCfg || {});
  if (groupIds.length === 0 && !hofPlanningState.pending) {
    return;
  }

  const dayKey = getDayKeyForDate(now);
  if (!dayKey) return;
  const h = now.getHours();
  const m = now.getMinutes();
  const keyTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // Créneaux candidats pour cette minute
  const candidateSet = new Set();
  for (const groupId of groupIds) {
    const slots = Array.isArray(groupsCfg[groupId]) ? groupsCfg[groupId] : [];
    for (const slot of slots) {
      const slotTime = (slot && typeof slot.time === 'string') ? slot.time : null;
      const days = Array.isArray(slot?.days) ? slot.days : [];
      if (!slotTime || slotTime !== keyTime) continue;
      if (!days.includes(dayKey)) continue;
      candidateSet.add(groupId);
      break;
    }
  }

  if (candidateSet.size === 0) {
    return;
  }

  const candidates = Array.from(candidateSet);
  // Priorité Groupe Global PvE (id 'g3')
  let selectedGroupId = null;
  if (candidates.includes('g3')) {
    selectedGroupId = 'g3';
  } else {
    selectedGroupId = candidates[0];
  }

  if (!selectedGroupId) return;

  const nowIso = now.toISOString();

  // Si un run HoF est en cours, on programme un run différé (+30 min après fin du run courant, logique affinée plus tard)
  if (hofPlanningState.current && hofPlanningState.current.status === 'running') {
    hofPlanningState.pending = {
      groupId: selectedGroupId,
      scheduledAt: nowIso,
      waitMinutesAfterCurrent: 30,
    };
    console.log('[HofPlanning] Run en cours — groupe', selectedGroupId, 'planifié comme pending ( +30 min après fin du run ).');
    appendHofPlanningHistory({
      at: nowIso,
      groupId: selectedGroupId,
      action: 'deferred_30min',
      source: 'scheduler',
      note: 'Créneau détecté mais run déjà en cours — différé +30 min après fin.',
    });
    return;
  }

  // Aucun run en cours : on marque simplement qu'un run devrait être lancé maintenant (logique de lancement faite plus tard)
  hofPlanningState.next = {
    groupId: selectedGroupId,
    from: 'immediate',
    at: nowIso,
  };
  console.log('[HofPlanning] Créneau détecté pour groupe', selectedGroupId, 'à', keyTime, `(${dayKey}) — marqué comme nextRun.`);
  appendHofPlanningHistory({
    at: nowIso,
    groupId: selectedGroupId,
    action: 'slot_matched',
    source: 'scheduler',
    note: `Créneau ${keyTime} (${dayKey}) — lancement immédiat demandé.`,
  });
  const targetWin = mainWindow;
  if (targetWin && !targetWin.isDestroyed() && targetWin.webContents) {
    try {
      targetWin.webContents.send('hof-planning:next', { groupId: selectedGroupId, at: nowIso });
    } catch (e) {
      console.warn('[HofPlanning] send next error:', e?.message || e);
    }
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

  // Console accessible uniquement via F12 (plus d'ouverture automatique au lancement)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

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
      enabledScrapers: config.enabledScrapers && typeof config.enabledScrapers === 'object'
        ? { evenements: !!config.enabledScrapers.evenements }
        : { evenements: true },
      eventsScraperAccount: config.eventsScraperAccount && typeof config.eventsScraperAccount === 'object'
        ? { username: String(config.eventsScraperAccount.username || '').trim(), password: String(config.eventsScraperAccount.password || '') }
        : { username: '', password: '' }
    };
    setScrapingConfig(merged);
    const hours = merged.scheduledHours.length > 0 ? merged.scheduledHours : ['00:00', '12:00'];
    const scrapers = [];
    if (merged.enabledScrapers.evenements) scrapers.push('evenements');
    const newSlots = hours.map(t => {
      const [hh, mm] = t.split(':').map(Number);
      const norm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      return { time: norm, scrapers: scrapers.length > 0 ? scrapers : ['evenements'] };
    });
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

  /** Renderer → fenêtre scraper : même format que sendLog dans do-events:scrape (dostats:log). */
  ipcMain.on('renderer:scraper-log', (_e, data) => {
    try {
      if (scraperWindow && !scraperWindow.isDestroyed()) {
        scraperWindow.webContents.send('dostats:log', {
          type: (data && data.type) || 'info',
          message: (data && data.message) || '',
          at: (data && data.at) || new Date().toISOString(),
          server: data && data.server != null ? data.server : null
        });
      }
    } catch (e) {
      console.warn('[Main] renderer:scraper-log', e?.message);
    }
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
    console.log('[Main] player-stats-scraper:collect', serverId || '');
    const onProgress = (data) => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('player-stats-scraper:progress', data);
      }
    };
    return PlayerStatsScraper.collectPlayerStatsWithLogin({ serverId, username, password, onProgress });
  });
  ipcMain.handle('player-stats-scraper:collect-manual', async (_, opts) => {
    const { serverId } = opts || {};
    console.log('[Main] player-stats-scraper:collect-manual', serverId || '');
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

      let supabase = null;
      try {
        supabase = await requireSuperadminSupabaseClient(logWin);
      } catch (e) {
        sendDostatsSupabaseLog(logWin, null, 'warning', 'DOStats → Supabase désactivé : ' + (e?.message || e));
      }

      if (supabase) {
        for (const server of serversForRankings) {
          const combos = dostatsCombosByServer.get(server) || [];
          // eslint-disable-next-line no-await-in-loop
          await pushDostatsServerToSupabase({
            logWin,
            server,
            combos: Array.isArray(combos) ? combos : [],
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

function getDostatsProfilesJsonPath(serverCode) {
  const safeServer = (serverCode || 'unknown').toString().trim().toLowerCase() || 'unknown';
  return path.join(app.getPath('userData'), 'rankings_output', 'player_profiles', `${safeServer}.json`);
}

function mapDostatsTypeKeyToHofType(typeKey) {
  const k = (typeKey || '').toString().trim().toLowerCase();
  if (k === 'honor') return 'honor';
  if (k === 'experience') return 'experience';
  if (k === 'top_user') return 'topuser';
  if (k === 'alien_kills') return 'aliens';
  if (k === 'ship_kills') return 'ships';
  return null;
}

function mapDostatsTypeKeyToMetricField(typeKey) {
  const k = (typeKey || '').toString().trim().toLowerCase();
  if (k === 'honor') return 'honor';
  if (k === 'experience') return 'experience';
  if (k === 'top_user') return 'top_user';
  if (k === 'alien_kills') return 'npc_kills';
  if (k === 'ship_kills') return 'ship_kills';
  return null;
}

function mapDostatsPeriodKeyToPeriodValue(periodKey) {
  const k = (periodKey || '').toString().trim().toLowerCase();
  if (k === 'last_24h') return 1;
  if (k === 'last_7d') return 7;
  if (k === 'last_30d') return 30;
  if (k === 'last_90d') return 90;
  if (k === 'last_365d') return 365;
  return null; // current => null (non affiché en mode période)
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

async function requireSuperadminSupabaseClient(logWin) {
  const superAdminId = process.env.SUPERADMIN_USER_ID || null;
  let resolvedUserId = global.currentUserId || null;
  if (!resolvedUserId) resolvedUserId = superAdminId;
  if (!resolvedUserId) throw new Error('SUP ERADMIN_USER_ID manquant et user non authentifié.');

  if (!global.supabaseAccessToken) {
    const tokenPollStart = Date.now();
    while (!global.supabaseAccessToken && (Date.now() - tokenPollStart) < 10000) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!global.supabaseAccessToken) throw new Error('Token Supabase absent (timeout).');

  const supabase = makeMainSupabaseClient();
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('badge')
    .eq('id', resolvedUserId)
    .single();

  if (profileErr) {
    sendDostatsSupabaseLog(logWin, null, 'warning', 'Lecture badge supabase failed : ' + (profileErr?.message || profileErr));
    throw new Error('Impossible de vérifier le badge utilisateur.');
  }

  const role = (profile?.badge || '').toLowerCase();
  if (role !== 'superadmin') {
    throw new Error('Rôle insuffisant : ' + role);
  }
  return supabase;
}

/**
 * Rafraîchit le JWT via le renderer (refreshSession) et recrée un client Supabase.
 * Indispensable après un scraping long : le client @supabase/supabase-js garde le Bearer du moment de createClient().
 */
async function getFreshSupabaseClientForDostatsPush(logWin) {
  const refreshed = await ScraperBridge.refreshSupabaseToken();
  if (!refreshed) {
    sendDostatsSupabaseLog(logWin, null, 'info',
      'DOStats → Supabase : refresh token (timeout ou inchangé) — utilisation du jeton actuel.');
  }
  if (!global.supabaseAccessToken) {
    sendDostatsSupabaseLog(logWin, null, 'error', 'DOStats → Supabase : aucun jeton après refresh.');
    return null;
  }
  return makeMainSupabaseClient();
}

async function pushDostatsServerToSupabase({ logWin, server, combos }) {
  const serverNorm = (server || '').toString().trim().toLowerCase();
  if (!serverNorm) return;

  try {
    let supabase = await getFreshSupabaseClientForDostatsPush(logWin);
    if (!supabase) {
      throw new Error('Jeton Supabase indisponible (refresh).');
    }

    {
      const { error: delErr } = await supabase.rpc('delete_dostats_shared_data_for_server', {
        p_server: serverNorm,
      });
      if (delErr) {
        throw new Error('delete_dostats_shared_data_for_server: ' + (delErr?.message || delErr));
      }
      sendDostatsSupabaseLog(logWin, serverNorm, 'info',
        'DOStats → Supabase : données du serveur vidées (profiles + snapshots), puis push…');
    }

    sendDostatsSupabaseLog(logWin, serverNorm, 'info', 'DOStats → Supabase : push profiles (overwrite strict)...');
    const profilesPath = getDostatsProfilesJsonPath(serverNorm);
    let profileEntries = [];
    if (fs.existsSync(profilesPath)) {
      const rawProfiles = fs.readFileSync(profilesPath, 'utf8');
      const json = JSON.parse(rawProfiles);
      const entries = Array.isArray(json?.entries) ? json.entries : [];
      profileEntries = entries;

      // Overwrite strict via RPC dédié (évite de casser les RPC utilisées par le client launcher).
      const RPC = 'overwrite_player_profile_from_dostats';
      const chunkSize = 10;
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.allSettled(chunk.map((e) => {
          if (!e || typeof e !== 'object') return Promise.resolve({ status: 'skipped' });
          // IMPORTANT : conserver la casse brute DOStats (BjYYD != BjYYd).
          const userId = e.user_id != null ? String(e.user_id).trim() : null;
          if (!userId) return Promise.resolve({ status: 'skipped' });

          const galaxy = e.galaxy_gates && typeof e.galaxy_gates === 'object' ? e.galaxy_gates : null;
          const total = galaxy && galaxy.total != null ? Number(galaxy.total) : null;
          const gateKeys = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda', 'kronos', 'hades', 'other'];
          const gateObj = {};
          if (galaxy) {
            gateKeys.forEach((k) => {
              const v = galaxy[k];
              if (v != null) gateObj[k] = v;
            });
          }
          const gatesJson = Object.keys(gateObj).length ? gateObj : null;

          const lastUpdate = e.last_update != null ? String(e.last_update).trim() : null;
          const companyUpdatedAt = lastUpdate && /^\d{4}-\d{2}-\d{2}$/.test(lastUpdate)
            ? (lastUpdate + 'T00:00:00.000Z')
            : (e.company_updated_at != null ? e.company_updated_at : null);

          return supabase.rpc(RPC, {
            p_user_id: userId,
            p_server: serverNorm,
            p_pseudo: e.name != null ? String(e.name) : null,
            p_company: e.company != null ? String(e.company) : null,
            p_company_updated_at: companyUpdatedAt,
            p_estimated_rp: e.estimated_rp != null ? Number(e.estimated_rp) : null,
            p_total_hours: e.total_hours != null ? Number(e.total_hours) : null,
            p_registered: e.registered != null ? String(e.registered) : null,
            p_npc_kills: e.npc_kills != null ? Number(e.npc_kills) : null,
            p_ship_kills: e.ship_kills != null ? Number(e.ship_kills) : null,
            p_galaxy_gates: total != null ? Number(total) : null,
            p_galaxy_gates_json: gatesJson,
            p_grade: e.grade != null ? String(e.grade) : null,
            p_level: e.level != null ? Number(e.level) : null,
            p_top_user: e.top_user != null ? Number(e.top_user) : null,
            p_experience: e.experience != null ? Number(e.experience) : null,
            p_honor: e.honor != null ? Number(e.honor) : null,
          });
        }));

        const rejected = results.filter((r) => r.status === 'rejected');
        if (rejected.length) {
          sendDostatsSupabaseLog(logWin, serverNorm, 'warning', `profiles RPC erreurs: ${rejected.length} (chunk ${i + 1}-${i + chunk.length}).`);
        }
      }
      sendDostatsSupabaseLog(logWin, serverNorm, 'success', `Profiles DOStats upsert OK — ${entries.length} entrées.`);
    } else {
      sendDostatsSupabaseLog(logWin, serverNorm, 'warning', 'profiles JSON introuvable (skip player_profiles overwrite).');
    }

    // JWT peut expirer pendant l’upsert profils (nombreuses RPC) — nouveau jeton + client avant les snapshots.
    {
      const supFresh = await getFreshSupabaseClientForDostatsPush(logWin);
      if (supFresh) {
        supabase = supFresh;
      } else {
        throw new Error('Jeton Supabase indisponible avant insert_dostats_snapshot (refresh).');
      }
    }

    // ── Snapshots DOStats par période (24h / 7j / 30j …) ────────────────
    sendDostatsSupabaseLog(logWin, serverNorm, 'info', 'DOStats → Supabase : insert shared_rankings_dostats_snapshots...');
    const dostatsPlayers = [];

    (combos || []).forEach((c) => {
      if (!c || !Array.isArray(c.entries)) return;
      const hofType = mapDostatsTypeKeyToHofType(c.typeKey);
      const metricField = mapDostatsTypeKeyToMetricField(c.typeKey);
      const periodValue = mapDostatsPeriodKeyToPeriodValue(c.periodKey);
      if (!hofType || !metricField) return;

      c.entries.forEach((e) => {
        if (!e || !e.user_id) return;
        const uid = String(e.user_id).trim();
        if (!uid) return;
        const name = e.name != null ? String(e.name) : null;
        const company = e.company != null ? String(e.company) : null;
        const points = e.points != null ? Number(e.points) : null;
        const rank = e.rank != null ? Number(e.rank) : null;

        const obj = {
          hof_type: hofType,
          period: periodValue,
          userId: uid,
          user_id: uid,
          name,
          company_from_dostats: company,
          company,
          // Position dans le tableau DOStats (1-based). Ne jamais la mettre dans `grade` :
          // le frontend interprète `grade` comme grade militaire (IDs 1–21, clés, etc.).
          dostats_table_rank: rank != null ? Number(rank) : null,
        };
        obj[metricField] = points;
        dostatsPlayers.push(obj);
      });
    });

    {
      const { error: snapErr } = await supabase.rpc('insert_dostats_snapshot', {
        p_server_id: serverNorm,
        p_players: dostatsPlayers,
      });
      if (snapErr) {
        throw new Error('insert_dostats_snapshot: ' + (snapErr?.message || snapErr));
      }
      sendDostatsSupabaseLog(logWin, serverNorm, 'success',
        `shared_rankings_dostats_snapshots OK — ${dostatsPlayers.length} lignes DOStats.`);
    }

    // ── Snapshot "Current" (classement principal) ─────────────────────
    sendDostatsSupabaseLog(logWin, serverNorm, 'info', 'DOStats → Supabase : insert shared_rankings_snapshots (current)...');
    const currentCombos = (combos || []).filter((c) => c && c.periodKey === 'current');
    const playerMap = new Map(); // uid -> player obj

    currentCombos.forEach((c) => {
      const metricField = mapDostatsTypeKeyToMetricField(c.typeKey);
      if (!metricField || !Array.isArray(c.entries)) return;
      c.entries.forEach((e) => {
        if (!e || !e.user_id) return;
        const uid = String(e.user_id).trim();
        if (!uid) return;
        if (!playerMap.has(uid)) {
          playerMap.set(uid, {
            userId: uid,
            user_id: uid,
            name: e.name != null ? String(e.name) : null,
            company_from_dostats: e.company != null ? String(e.company) : null,
            company: e.company != null ? String(e.company) : null,
            // IMPORTANT : NE PAS mettre `grade` ici.
            // Le RPC get_ranking_with_profiles priorise `grade` venant du snapshot,
            // alors que le grade attendu (Lieutenant/Major/...) vient de player_profiles.
          });
        }
        const obj = playerMap.get(uid);
        obj[metricField] = e.points != null ? Number(e.points) : null;
        // top_user est aussi utilisé via rank_points côté UI
        if (metricField === 'top_user') obj.rank_points = e.points != null ? Number(e.points) : null;
      });
    });

    const currentPlayers = Array.from(playerMap.values());
    {
      const { error: snapErr2 } = await supabase.rpc('insert_ranking_snapshot', {
        p_server_id: serverNorm,
        p_players: currentPlayers,
      });
      if (snapErr2) {
        throw new Error('insert_ranking_snapshot: ' + (snapErr2?.message || snapErr2));
      }
      sendDostatsSupabaseLog(logWin, serverNorm, 'success',
        `shared_rankings_snapshots OK — ${currentPlayers.length} joueurs.`);
    }

    // ── Phase 2 (transition) : nouveau modèle normalisé ─────────────────
    // On écrit en parallèle :
    // - player_rankings
    // - player_profiles.rankings_json
    // via la RPC upsert_player_full.
    sendDostatsSupabaseLog(logWin, serverNorm, 'info', 'DOStats → Supabase : upsert_player_full (new model)...');

    var NEW_HOF_TYPES = ['topuser', 'experience', 'honor', 'ships', 'aliens'];
    var NEW_PERIOD_KEYS = ['alltime', 'daily', 'weekly', 'monthly', 'last_90d'];

    function makeEmptyRankingsJson() {
      var out = {};
      NEW_HOF_TYPES.forEach(function(t) {
        out[t] = {};
        NEW_PERIOD_KEYS.forEach(function(p) {
          out[t][p] = { rank: null, value: null };
        });
      });
      return out;
    }

    function mapDostatsPeriodKeyToNewPeriodKey(periodKey) {
      var k = (periodKey || '').toString().trim().toLowerCase();
      if (k === 'current') return 'alltime';
      if (k === 'last_24h') return 'daily';
      if (k === 'last_7d') return 'weekly';
      if (k === 'last_30d') return 'monthly';
      if (k === 'last_90d') return 'last_90d';
      if (k === 'last_365d') return null; // ignoré pour l'instant
      return null;
    }

    // IMPORTANT : conserver la casse brute DOStats sur user_id/userId.
    var playersByUid = new Map(); // uidRaw -> player object for upsert_player_full

    function ensurePlayer(uidRaw) {
      if (!uidRaw) return null;
      if (playersByUid.has(uidRaw)) return playersByUid.get(uidRaw);
      var p = {
        user_id: uidRaw,
        userId: uidRaw,
        pseudo: null,
        company: null,
        company_updated_at: null,
        estimated_rp: null,
        total_hours: null,
        registered: null,
        npc_kills: null,
        ship_kills: null,
        galaxy_gates: null,
        galaxy_gates_json: null,
        grade: null,
        level: null,
        top_user: null,
        experience: null,
        honor: null,
        dostats_updated_at: null,
        rankings_json: makeEmptyRankingsJson()
      };
      playersByUid.set(uidRaw, p);
      return p;
    }

    // 1) Pré-remplissage scalaires depuis le profil scraper (quand disponible)
    (profileEntries || []).forEach(function(e) {
      if (!e || !e.user_id) return;
      var uidRaw = String(e.user_id).trim();
      if (!uidRaw) return;
      var p = ensurePlayer(uidRaw);

      var galaxy = e.galaxy_gates && typeof e.galaxy_gates === 'object' ? e.galaxy_gates : null;
      var total = galaxy && galaxy.total != null ? Number(galaxy.total) : null;
      var gateKeys = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda', 'kronos', 'hades', 'other'];
      var gateObj = {};
      if (galaxy) {
        gateKeys.forEach(function(k) {
          var v = galaxy[k];
          if (v != null) gateObj[k] = v;
        });
      }
      var gatesJson = Object.keys(gateObj).length ? gateObj : null;

      var lastUpdate = e.last_update != null ? String(e.last_update).trim() : null;
      var companyUpdatedAt = lastUpdate && /^\d{4}-\d{2}-\d{2}$/.test(lastUpdate)
        ? (lastUpdate + 'T00:00:00.000Z')
        : (e.company_updated_at != null ? e.company_updated_at : null);

      p.pseudo = e.name != null ? String(e.name) : null;
      p.company = e.company != null ? String(e.company) : null;
      p.company_updated_at = companyUpdatedAt;
      p.estimated_rp = e.estimated_rp != null ? Number(e.estimated_rp) : null;
      p.total_hours = e.total_hours != null ? Number(e.total_hours) : null;
      p.registered = e.registered != null ? String(e.registered) : null;
      p.npc_kills = e.npc_kills != null ? Number(e.npc_kills) : null;
      p.ship_kills = e.ship_kills != null ? Number(e.ship_kills) : null;
      p.galaxy_gates = total != null ? Number(total) : null;
      p.galaxy_gates_json = gatesJson;
      p.grade = e.grade != null ? String(e.grade) : null;
      p.level = e.level != null ? Number(e.level) : null;
      p.top_user = e.top_user != null ? Number(e.top_user) : null;
      p.experience = e.experience != null ? Number(e.experience) : null;
      p.honor = e.honor != null ? Number(e.honor) : null;
      p.dostats_updated_at = companyUpdatedAt;
    });

    // 2) Remplissage rankings_json depuis les HoF scrapés
    (combos || []).forEach(function(c) {
      if (!c || !Array.isArray(c.entries)) return;
      var hofType = mapDostatsTypeKeyToHofType(c.typeKey);
      var newPeriod = mapDostatsPeriodKeyToNewPeriodKey(c.periodKey);
      if (!hofType || !newPeriod) return;

      c.entries.forEach(function(e) {
        if (!e || !e.user_id) return;
        var uidRaw = String(e.user_id).trim();
        if (!uidRaw) return;

        var p = ensurePlayer(uidRaw);
        var rank = e.rank != null ? Number(e.rank) : null;
        var points = e.points != null ? Number(e.points) : null;

        // Rang/points explicitement NULL quand hors top
        p.rankings_json[hofType][newPeriod] = { rank: rank, value: points };
      });
    });

    // 3) Push atomique (remplacement complet par server)
    var p_players = Array.from(playersByUid.values());
    var fullErr = null;
    try {
      const res = await supabase.rpc('upsert_player_full', {
        p_server: serverNorm,
        p_players: p_players,
        p_snapshot_hof: null,
        p_snapshot_stats: null,
        p_scraped_at: new Date().toISOString()
      });
      fullErr = res?.error || null;
    } catch (e) {
      fullErr = e;
    }

    if (fullErr) {
      const msg = String(fullErr?.message || fullErr || '');
      const isSchemaCacheProblem = msg.toLowerCase().includes('schema cache') &&
        msg.toLowerCase().includes('upsert_player_full');

      // Si la fonction vient d'être ajoutée (migrations récentes), le SDK
      // peut encore avoir un schéma cache incomplet dans ce process.
      if (isSchemaCacheProblem) {
        const supFresh2 = await getFreshSupabaseClientForDostatsPush(logWin);
        if (supFresh2) supabase = supFresh2;

        fullErr = null;
        try {
          const res2 = await supabase.rpc('upsert_player_full', {
            p_server: serverNorm,
            p_players: p_players,
            p_snapshot_hof: null,
            p_snapshot_stats: null,
            p_scraped_at: new Date().toISOString()
          });
          fullErr = res2?.error || null;
        } catch (e2) {
          fullErr = e2;
        }
      }
    }

    if (fullErr) throw new Error('upsert_player_full: ' + (fullErr?.message || fullErr));
    sendDostatsSupabaseLog(logWin, serverNorm, 'success',
      `upsert_player_full OK — ${p_players.length} joueurs.`);

    // Snapshots RP : save top_user (points de grade) pour calcul delta 24h/7j côté SUIVI JOUEURS.
    // DOStats ne fournit pas de classement top_user par période — on calcule depuis les snapshots.
    try {
      const rpSnaps = p_players
        .filter(function(p) { return p.top_user != null && p.user_id; })
        .map(function(p) { return { user_id: String(p.user_id), rank_points: Number(p.top_user) }; });
      if (rpSnaps.length > 0) {
        await supabase.rpc('insert_rp_snapshots', { p_server: serverNorm, p_snapshots: rpSnaps });
      }
    } catch (rpErr) {
      console.warn('[Main] insert_rp_snapshots:', rpErr?.message || rpErr);
    }
  } catch (e) {
    sendDostatsSupabaseLog(logWin, serverNorm, 'error', 'DOStats → Supabase push error: ' + (e?.message || e));
  }
}

/**
 * Persiste la firme d'un joueur : player_profiles (affichage) + snapshot (CDP-only).
 * 1. upsert_player_profile si company + userId (visible dans classement).
 * 2. Lire dernier snapshot, merger company/cdp_grade/game_time, insert_ranking_snapshot.
 *
 * @param {{ pseudo, userId, company, grade, server, url, date }} payload
 */
async function saveClientScrapedData(payload) {
  const { pseudo, userId, company, grade, game_time, server, url, date } = payload || {};

  // ── Log de diagnostic systématique ───────────────────────────────────────
  console.log(
    `[Main] DEBUG saveClientScrapedData — userId=${global.currentUserId ?? '(null)'} ` +
    `token=${!!global.supabaseAccessToken} ` +
    `company="${company}" server="${server}" pseudo="${pseudo}" grade="${grade}"`
  );

  if (!company || !server) {
    console.warn('[Main] saveClientScrapedData — données insuffisantes (company ou server manquant)');
    return;
  }

  // ── Résolution de l'identité (polling 500 ms, timeout 10 s) ─────────────
  let resolvedUserId = global.currentUserId || null;

  if (!resolvedUserId) {
    console.log('[Main] Tentative de récupération de l\'identité différée...');
    const idPollStart = Date.now();
    while (!global.currentUserId && (Date.now() - idPollStart) < 10000) {
      await new Promise((r) => setTimeout(r, 500));
    }
    resolvedUserId = global.currentUserId || null;
    console.log(`[Main] DEBUG après polling userId — userId=${resolvedUserId ?? '(null)'} token=${!!global.supabaseAccessToken}`);
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
    console.log('[Main] saveClientScrapedData — token absent, polling (max 10 s)...');
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
      console.log(`[Main] DEBUG badge Supabase="${profile?.badge}" → role="${role}"`);
    }
  } catch (e) {
    console.warn('[Main] saveClientScrapedData — exception lecture profil:', e?.message);
  }

  if (role !== 'superadmin') {
    console.warn(`[Main] Droits insuffisants pour le scraping (Rôle: ${role})`);
    return;
  }

  console.log(`[Main] Autorisation SuperAdmin confirmée. Synchronisation du grade en cours pour ${pseudo || userId}.`);

  if (company && userId) {
    try {
      await supabase.rpc('upsert_player_profile', {
        p_user_id: userId,
        p_server: server,
        p_pseudo: pseudo || null,
        p_company: company,
        p_company_updated_at: new Date().toISOString(),
        p_estimated_rp: null,
        p_total_hours: null,
        p_registered: null,
        p_npc_kills: null,
        p_ship_kills: null,
        p_galaxy_gates: null,
        p_galaxy_gates_json: null,
        p_grade: grade || null,
      });
    } catch (e) {
      console.warn('[Main] saveClientScrapedData — upsert_player_profile:', e?.message);
    }
  }

  try {
    const { data: rows, error: readErr } = await supabase
      .from('shared_rankings_snapshots')
      .select('players_json')
      .eq('server_id', server)
      .order('scraped_at', { ascending: false })
      .limit(1)
      .single();

    if (readErr && readErr.code !== 'PGRST116') {
      console.error('[Main] saveClientScrapedData — lecture snapshots:', readErr.message);
      return;
    }

    const allPlayers = Array.isArray(rows?.players_json) ? rows.players_json.map((p) => ({ ...p })) : [];

    // Chercher le joueur par userId d'abord, puis par pseudo (insensible à la casse)
    let idx = userId ? allPlayers.findIndex((p) => p.userId === userId) : -1;
    if (idx === -1 && pseudo) {
      idx = allPlayers.findIndex((p) => (p.name || '').toLowerCase() === pseudo.toLowerCase());
    }

    if (idx !== -1) {
      const current = allPlayers[idx];

      const companyAlreadyKnown  = current.company   && current.company   !== '';
      const cdpGradeAlreadyKnown = current.cdp_grade && current.cdp_grade !== '';
      const gameTimeAlreadyKnown = current.game_time && current.game_time !== '';

      if (companyAlreadyKnown && cdpGradeAlreadyKnown && gameTimeAlreadyKnown) {
        // Rien de nouveau à compléter — on rafraîchit uniquement le timestamp et on remet le compteur d'échec à 0
        allPlayers[idx] = {
          ...current,
          client_scraped_at: date || new Date().toISOString(),
          profile_scraper_failures: 0,
        };
        console.log(`[Main] saveClientScrapedData — ${pseudo || userId} (${server}) : rien à compléter, timestamp mis à jour`);
      } else {
        allPlayers[idx] = {
          ...current,

          // Règle 1 — company : compléter seulement si absent/vide
          ...(!companyAlreadyKnown && company ? { company } : {}),

          // Règle 2 — grade Scraper 1 (normalisé) jamais touché
          //           grade CDP stocké dans cdp_grade, seulement si absent/vide
          ...(!cdpGradeAlreadyKnown && grade ? { cdp_grade: grade } : {}),

          // Règle 3 — game_time : compléter seulement si absent/vide
          ...(!gameTimeAlreadyKnown && game_time ? { game_time } : {}),

          // Règle 5 — userId : compléter seulement si absent
          ...(userId && !current.userId ? { userId } : {}),

          // Règle 6 — timestamp : toujours mis à jour
          client_scraped_at: date || new Date().toISOString(),

          // Compteur anti-spam : remis à 0 sur chaque passage CDP réussi
          profile_scraper_failures: 0,

          // Règle 7 — needs_review / blacklisted_until : jamais réinitialisés
        };

        const logParts = [
          !companyAlreadyKnown  && company   ? `company=${company}`   : '',
          !cdpGradeAlreadyKnown && grade     ? `cdp_grade=${grade}`   : '',
          !gameTimeAlreadyKnown && game_time ? `game_time=${game_time}` : '',
        ].filter(Boolean).join(' ');
        console.log(`[Main] saveClientScrapedData — complété ${pseudo || userId} (${server}) : ${logParts || '(aucun champ nouveau)'}`);
      }
    } else {
      // Joueur inconnu du Scraper 1 — entrée temporaire CDP-only
      // grade absent volontairement : réservé au Scraper 1 (format normalisé)
      const newPlayer = {
        name:              pseudo || userId || null,
        userId:            userId || null,
        company:           company   || null,
        cdp_grade:         grade     || null,
        game_time:         game_time || null,
        cdp_only:          true,
        client_scraped_at: date || new Date().toISOString(),
      };
      allPlayers.push(newPlayer);
      console.log(`[Main] saveClientScrapedData — nouveau joueur CDP-only : ${pseudo || userId} (${server}) company=${company}`);
    }

    // Upsert via la RPC commune
    const { data: insertResult, error: insertErr } = await supabase.rpc(
      'insert_ranking_snapshot', {
        p_server_id: server,
        p_players: allPlayers,
      }
    );

    if (insertErr) {
      console.error('[Main] saveClientScrapedData — insert erreur client:', insertErr.message);
      return;
    }
    if (!insertResult?.success) {
      console.error('[Main] saveClientScrapedData — insert_ranking_snapshot échec:',
        insertResult?.code, insertResult?.error);
      return;
    }
    console.log('[Main] saveClientScrapedData — snapshot OK');

    // Toast vers l'UI
    const displayName = pseudo || userId || 'Joueur inconnu';
    console.log(`[Main] saveClientScrapedData — OK — Profil de ${displayName} mis à jour dans la base de données`);
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
    if (s === 'evenements') {
      sendSchedulerLog('Déclenchement Événements DarkOrbit', 'info');
      const refreshed = await ScraperBridge.refreshSupabaseToken();
      if (!refreshed && (!global.currentUserId || !global.supabaseAccessToken)) {
        sendSchedulerLog('Événements ignoré : utilisateur non authentifié.', 'warning');
        continue;
      }
      if (!refreshed) { /* token existant utilisé */ }
      await ScraperBridge.startEventsOnlyScraping();
      while (global.scrapingState?.running) await new Promise(r => setTimeout(r, 2000));
    } else if (s === 'serveurs') {
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
  sendSchedulerLog('Planificateur actif — ' + slots.map(s => s.time).join(', '), 'info');
}

function setupHofPlanningScheduler() {
  if (hofPlanningIntervalId) {
    clearInterval(hofPlanningIntervalId);
    hofPlanningIntervalId = null;
  }
  const tick = () => {
    try {
      const now = new Date();
      checkHofPlanning(now);
    } catch (e) {
      console.warn('[HofPlanning] tick error:', e?.message || e);
    }
  };
  hofPlanningIntervalId = setInterval(tick, 60000);
  // Première exécution rapide au démarrage
  tick();
}

function cleanupBeforeQuit() {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    console.log('[Main] Scheduler arrêté');
  }
  if (hofPlanningIntervalId) {
    clearInterval(hofPlanningIntervalId);
    hofPlanningIntervalId = null;
    console.log('[Main] HoF planning scheduler arrêté');
  }
  if (hofPlanningState.pendingTimeoutId) {
    clearTimeout(hofPlanningState.pendingTimeoutId);
    hofPlanningState.pendingTimeoutId = null;
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
  ipcMain.handle('hof-planning:get', () => {
    try {
      return { ok: true, config: loadHofPlanningConfig() };
    } catch (e) {
      return { ok: false, error: e?.message || 'Erreur lecture planning' };
    }
  });
  ipcMain.handle('hof-planning:history', () => {
    try {
      const history = loadHofPlanningHistory();
      return { ok: true, history };
    } catch (e) {
      return { ok: false, error: e?.message || 'Erreur lecture historique planning' };
    }
  });
  ipcMain.handle('hof-planning:save', (_event, config) => {
    try {
      const current = loadHofPlanningConfig();
      const next = config && typeof config === 'object' ? config : current;
      if (!next.groups || typeof next.groups !== 'object') next.groups = {};
      if (!next.groupSettings || typeof next.groupSettings !== 'object') next.groupSettings = {};
      if (!saveHofPlanningConfig(next)) return { ok: false, error: 'Erreur écriture fichier' };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || 'Erreur sauvegarde planning' };
    }
  });

  ipcMain.on('hof-run:start', (_event, payload = {}) => {
    const nowIso = new Date().toISOString();
    const groupId = payload.groupId || null;
    hofPlanningState.current = {
      status: 'running',
      groupId,
      startedAt: nowIso,
      endedAt: null,
    };
    console.log('[HofPlanning] Run démarré', groupId ? `pour groupe ${groupId}` : '(manuel / sans groupe)');
    if (hofPlanningState.pendingTimeoutId) {
      clearTimeout(hofPlanningState.pendingTimeoutId);
      hofPlanningState.pendingTimeoutId = null;
    }
    appendHofPlanningHistory({
      at: nowIso,
      groupId,
      action: 'launched',
      source: groupId ? 'auto' : 'manual',
      note: groupId ? 'Run HoF lancé pour un groupe (auto ou pending).' : 'Run HoF lancé manuellement.',
    });
  });

  ipcMain.on('hof-run:end', () => {
    const now = new Date();
    const nowIso = now.toISOString();
    const prev = hofPlanningState.current || {};
    hofPlanningState.current = {
      status: 'idle',
      groupId: null,
      startedAt: prev.startedAt || null,
      endedAt: nowIso,
    };
    console.log('[HofPlanning] Run terminé à', nowIso);
    appendHofPlanningHistory({
      at: nowIso,
      groupId: prev.groupId || null,
      action: 'ended',
      source: prev.groupId ? 'auto' : 'manual',
      note: 'Run HoF terminé.',
    });
    if (hofPlanningState.pending && hofPlanningState.pending.groupId) {
      const pendingGroupId = hofPlanningState.pending.groupId;
      const delayMs = (hofPlanningState.pending.waitMinutesAfterCurrent || 30) * 60 * 1000;
      if (hofPlanningState.pendingTimeoutId) {
        clearTimeout(hofPlanningState.pendingTimeoutId);
      }
      hofPlanningState.pendingTimeoutId = setTimeout(() => {
        hofPlanningState.pendingTimeoutId = null;
        // Si un autre run est en cours au moment où le délai expire,
        // on repousse encore de waitMinutesAfterCurrent minutes.
        if (hofPlanningState.current && hofPlanningState.current.status === 'running') {
          const againDelayMs = (hofPlanningState.pending && hofPlanningState.pending.waitMinutesAfterCurrent
            ? hofPlanningState.pending.waitMinutesAfterCurrent
            : 30) * 60 * 1000;
          hofPlanningState.pendingTimeoutId = setTimeout(() => {
            hofPlanningState.pendingTimeoutId = null;
            if (hofPlanningState.current && hofPlanningState.current.status === 'running') {
              // Si vraiment on retombe encore sur un run en cours, on redécalera à la prochaine fin via hof-run:end.
              return;
            }
        const atIso2 = new Date().toISOString();
        hofPlanningState.next = {
          groupId: pendingGroupId,
          from: 'pending',
          at: atIso2,
        };
        console.log('[HofPlanning] Pending run déclenché pour groupe', pendingGroupId, 'après second délai post-run.');
        const targetWin2 = mainWindow;
        if (targetWin2 && !targetWin2.isDestroyed() && targetWin2.webContents) {
          try {
            targetWin2.webContents.send('hof-planning:next', { groupId: pendingGroupId, at: atIso2 });
          } catch (e) {
            console.warn('[HofPlanning] send pending next error:', e?.message || e);
          }
        }
            hofPlanningState.pending = null;
          }, againDelayMs);
          console.log('[HofPlanning] Pending run reprogrammé pour groupe', pendingGroupId, 'dans', againDelayMs / 60000, 'minutes (run en cours).');
          return;
        }
        const atIso3 = new Date().toISOString();
        hofPlanningState.next = {
          groupId: pendingGroupId,
          from: 'pending',
          at: atIso3,
        };
        console.log('[HofPlanning] Pending run déclenché pour groupe', pendingGroupId, 'après délai post-run.');
        appendHofPlanningHistory({
          at: atIso3,
          groupId: pendingGroupId,
          action: 'launched_from_pending',
          source: 'pending',
          note: 'Run HoF lancé automatiquement après délai différé.',
        });
        const targetWin3 = mainWindow;
        if (targetWin3 && !targetWin3.isDestroyed() && targetWin3.webContents) {
          try {
            targetWin3.webContents.send('hof-planning:next', { groupId: pendingGroupId, at: atIso3 });
          } catch (e) {
            console.warn('[HofPlanning] send pending next error:', e?.message || e);
          }
        }
        hofPlanningState.pending = null;
      }, delayMs);
      console.log('[HofPlanning] Pending run programmé pour groupe', pendingGroupId, 'dans', delayMs / 60000, 'minutes');
    }
  });

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
  setupHofPlanningScheduler();

  function openScraperWindow() {
    try {
      if (scraperWindow && !scraperWindow.isDestroyed()) {
        scraperWindow.show();
        scraperWindow.focus();
        return;
      }
      scraperWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1100,
        minHeight: 700,
        backgroundColor: '#05070f',
        show: false,
        frame: false,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.resolve(getPreloadPath()),
        },
      });

      const scraperHtml = getSrcPath(path.join('scraper', 'index.html'));
      scraperWindow.loadFile(scraperHtml);

      scraperWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
          event.preventDefault();
          try {
            scraperWindow.webContents.toggleDevTools();
          } catch (_) {}
        }
      });

      scraperWindow.once('ready-to-show', () => {
        if (!scraperWindow.isDestroyed()) {
          scraperWindow.show();
        }
      });

      scraperWindow.on('closed', () => {
        scraperWindow = null;
      });
    } catch (e) {
      console.warn('[ScraperWindow] open error:', e?.message || e);
    }
  }

  ipcMain.handle('scraper-window:open', () => {
    openScraperWindow();
    return { ok: true };
  });
  ipcMain.handle('scraper-window:start', async () => ({ ok: false, error: 'Scraper Python désactivé' }));
  ipcMain.handle('scraper-window:stop', () => {});
  ipcMain.handle('scraper-window:test', async () => ({ ok: false, error: 'Scraper Python désactivé' }));
  ipcMain.handle('scraper-window:browser-login', async () => ({ ok: false, error: 'Scraper Python désactivé' }));
  ipcMain.handle('scraper-window:open-output-dir', async () => {
    try {
      const rankingsDir = path.join(app.getPath('userData'), 'rankings_output');
      if (!fs.existsSync(rankingsDir)) fs.mkdirSync(rankingsDir, { recursive: true });
      await shell.openPath(rankingsDir);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || 'Erreur ouverture dossier' };
    }
  });

  ipcMain.handle('do-events:scrape', async () => {
    const sendLog = (data) => {
      if (scraperWindow && !scraperWindow.isDestroyed()) {
        scraperWindow.webContents.send('dostats:log', {
          type: data.type || 'info',
          message: data.message || '',
          at: data.at || new Date().toISOString(),
          server: data.server ?? null
        });
      }
    };
    try {
      // Même flux que le planificateur : upsert shared_events + user_settings + IPC events-updated (fenêtre principale).
      // Sans session Supabase, on garde l'ancien comportement (aperçu local uniquement).
      await ScraperBridge.refreshSupabaseToken();
      if (!global.currentUserId || !global.supabaseAccessToken) {
        sendLog({
          type: 'warning',
          message: 'Pas de session Supabase — extraction locale uniquement (rien n\'est envoyé au cloud). Ouvrez l\'app principale et connectez-vous.'
        });
        return await loginAndExtractEventsOnly({ sendLog });
      }
      if (global.scrapingState?.running) {
        sendLog({ type: 'error', message: 'Un autre scraping est déjà en cours.' });
        return { ok: false, error: 'Scraping déjà en cours', events: [] };
      }
      sendLog({ type: 'info', message: 'Extraction + envoi Supabase (shared_events)…' });
      const result = await runEventsScraping({ mainWindowRef: mainWindow });
      if (result?.ok && Array.isArray(result.events)) {
        sendLog({
          type: 'success',
          message: `${result.events.length} événement(s) enregistré(s) dans Supabase.`
        });
        return {
          ok: true,
          events: result.events,
          eventsCount: result.eventsCount,
          pushedToSupabase: true
        };
      }
      const errMsg = result?.error || 'Échec du scraping événements';
      sendLog({ type: 'error', message: errMsg });
      return { ok: false, error: errMsg, events: [], pushedToSupabase: false };
    } catch (e) {
      console.warn('[Main] do-events:scrape:', e?.message || e);
      return { ok: false, error: e?.message || 'Erreur', events: [] };
    }
  });

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