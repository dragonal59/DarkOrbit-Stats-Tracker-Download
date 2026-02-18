/**
 * Gestionnaire du scraper DarkOrbit : fenêtre cachée, extension, serveur HTTP
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const { createScraperServer } = require('./scraper-server');

let scrapingWindow = null;
let scraperServer = null;
let extensionId = null;
let mainWindowRef = null;

const COOKIES_FILE = path.join(app.getPath('userData'), 'scraper-cookies.json');
const CAPTCHA_ALWAYS_ON_TOP_MS = 2500;

function loadCookiesFromDisk() {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const raw = fs.readFileSync(COOKIES_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        global.savedScraperCookies = data;
        const count = Object.keys(data).length;
        console.log('[ScraperManager] Cookies chargés depuis disque:', count, 'serveur(s)');
        return;
      }
    }
  } catch (e) {
    console.warn('[ScraperManager] loadCookiesFromDisk:', e?.message || e);
  }
  global.savedScraperCookies = global.savedScraperCookies || {};
}

function saveCookiesToDisk() {
  try {
    const data = global.savedScraperCookies || {};
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(data), 'utf8');
    console.log('[ScraperManager] Cookies sauvegardés sur disque');
  } catch (e) {
    console.error('[ScraperManager] saveCookiesToDisk:', e?.message || e);
  }
}

function showScrapingWindowForCaptcha() {
  if (!scrapingWindow || scrapingWindow.isDestroyed()) return;
  scrapingWindow.show();
  scrapingWindow.focus();
  scrapingWindow.setAlwaysOnTop(true, 'floating');
  setTimeout(() => {
    if (scrapingWindow && !scrapingWindow.isDestroyed()) {
      scrapingWindow.setAlwaysOnTop(false);
    }
  }, CAPTCHA_ALWAYS_ON_TOP_MS);
  console.log('[ScraperManager] Fenêtre scraping affichée pour CAPTCHA');
}

function hideScrapingWindow() {
  if (!scrapingWindow || scrapingWindow.isDestroyed()) return;
  scrapingWindow.hide();
  console.log('[ScraperManager] Fenêtre scraping masquée');
}

/** Ferme et détruit la fenêtre scraping, remet la référence à null. Appelé après fin du cycle (scraping-done). */
function closeAndResetScrapingWindow() {
  if (scrapingWindow && !scrapingWindow.isDestroyed()) {
    scrapingWindow.hide();
    scrapingWindow.destroy();
    console.log('[ScraperManager] Fenêtre scraping fermée et détruite');
  }
  scrapingWindow = null;
}

function generateAuthToken() {
  const token = crypto.randomBytes(32).toString('hex');
  global.scraperAuthToken = token;
  console.log('[ScraperManager] Token généré:', token.substring(0, 8) + '...');
  return token;
}

function resetScrapingState() {
  global.scrapingState = {
    running: false,
    startTime: null,
    currentServer: null,
    currentServerIndex: 0,
    totalServers: 23,
    completed: [],
    errors: [],
    lastUpdate: null
  };
}

async function createScrapingWindow(mainWindowRef) {
  const extensionPath = path.join(__dirname, '..', 'src', 'extensions', 'scraper');

  scrapingWindow = new BrowserWindow({
    show: false,
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,
      partition: 'persist:scraping'
    }
  });

  const ext = await scrapingWindow.webContents.session.loadExtension(extensionPath);
  extensionId = ext?.id || ext;
  console.log('[ScraperManager] Extension chargée, ID:', extensionId);

  const token = global.scraperAuthToken;
  const blankUrl = extensionId
    ? `chrome-extension://${extensionId}/blank.html?token=${encodeURIComponent(token)}`
    : 'about:blank';
  await scrapingWindow.loadURL(blankUrl);
  console.log('[ScraperManager] Page chargée avec token dans URL');

  return scrapingWindow;
}

function stopScraping() {
  global.scraperShouldStop = true;
  if (global.scrapingState) {
    global.scrapingState.running = false;
    global.scrapingState.currentServer = null;
    global.scrapingState.currentServerIndex = 0;
    global.scrapingState.completed = global.scrapingState.completed || [];
    global.scrapingState.lastUpdate = new Date().toISOString();
  }
  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send('scraping-progress', global.scrapingState || { running: false });
  }
  console.log('[ScraperManager] Arrêt demandé, scrapingState.running = false, scraperShouldStop = true');
  return { ok: true };
}

async function startScraping(trigger = 'manual') {
  if (global.scrapingState?.running === true) {
    console.warn('[Scraper] Déjà en cours, refus du second démarrage');
    return { ok: false, error: 'Scraping déjà en cours' };
  }
  global.scraperShouldStop = false;
  resetScrapingState();
  global.scrapingState.running = true;
  global.scrapingState.startTime = new Date().toISOString();

  if (!scrapingWindow || scrapingWindow.isDestroyed()) {
    if (!mainWindowRef) {
      return { ok: false, error: 'Fenêtre principale non disponible' };
    }
    try {
      await createScrapingWindow(mainWindowRef);
    } catch (e) {
      console.error('[ScraperManager] Recréation fenêtre scraping:', e?.message);
      return { ok: false, error: e?.message || 'Impossible de créer la fenêtre scraping' };
    }
  }
  if (!scrapingWindow?.webContents) {
    return { ok: false, error: 'Fenêtre scraper non disponible' };
  }

  console.log('[ScraperManager] Appel executeJavaScript startScraping...');
  scrapingWindow.webContents.executeJavaScript(`
    (function() {
      console.log('[CONTENT] startScraping appelé, window.startScraping existe?', typeof window.startScraping);
      if (typeof window.startScraping === 'function') {
        window.startScraping();
        return 'called';
      }
      return 'not_found';
    })();
  `).then(result => {
    console.log('[ScraperManager] executeJavaScript startScraping résultat:', result);
  }).catch(e => {
    console.error('[ScraperManager] executeJavaScript startScraping erreur:', e.message);
  });

  return { ok: true };
}

function getState() {
  return global.scrapingState || resetScrapingState();
}

function setUserContext(userId, accessToken) {
  global.currentUserId = userId;
  global.supabaseAccessToken = accessToken;
}

async function init(mainWindow) {
  mainWindowRef = mainWindow;
  loadCookiesFromDisk();
  generateAuthToken();
  resetScrapingState();
  global.scraperShouldStop = false;

  scraperServer = createScraperServer(mainWindow, {
    navigateTo: (url) => {
      if (!scrapingWindow?.webContents) return Promise.resolve();
      console.log('[ScraperManager] Navigation vers:', url);
      return new Promise((resolve) => {
        const wc = scrapingWindow.webContents;
        const onLoad = () => {
          wc.removeListener('did-fail-load', onFail);
          resolve();
        };
        const onFail = () => {
          wc.removeListener('did-finish-load', onLoad);
          resolve();
        };
        wc.once('did-finish-load', onLoad);
        wc.once('did-fail-load', onFail);
        scrapingWindow.loadURL(url);
      });
    },
    executeInScrapingWindow: async (code) => {
      if (!scrapingWindow?.webContents) throw new Error('Fenêtre scraper non disponible');
      return scrapingWindow.webContents.executeJavaScript(code);
    },
    getCookies: async (serverId) => {
      if (!scrapingWindow?.webContents?.session) return [];
      const sess = scrapingWindow.webContents.session;
      const list = await sess.cookies.get({ url: `https://${serverId}.darkorbit.com` });
      return list || [];
    },
    setCookies: async (serverId, cookies) => {
      if (!scrapingWindow?.webContents?.session || !Array.isArray(cookies)) return;
      const sess = scrapingWindow.webContents.session;
      const baseUrl = `https://${serverId}.darkorbit.com`;
      for (const c of cookies) {
        try {
          await sess.cookies.set({
            url: baseUrl,
            name: c.name,
            value: c.value,
            domain: c.domain || undefined,
            path: c.path || '/',
            secure: c.secure,
            httpOnly: c.httpOnly,
            expirationDate: c.expirationDate
          });
        } catch (e) { /* ignore single cookie error */ }
      }
    },
    onCookiesSaved: (serverId) => {
      saveCookiesToDisk();
    },
    onCookiesRemoved: (serverId) => {
      if (global.savedScraperCookies) delete global.savedScraperCookies[serverId];
      saveCookiesToDisk();
    },
    showWindowForCaptcha: showScrapingWindowForCaptcha,
    hideScrapingWindow: hideScrapingWindow,
    onScrapingDone: closeAndResetScrapingWindow
  });

  await createScrapingWindow(mainWindowRef);

  return { ok: true };
}

function showDebugWindow() {
  if (!scrapingWindow) {
    console.warn('[ScraperManager] showDebugWindow: fenêtre non disponible');
    return { ok: false, error: 'Fenêtre non disponible' };
  }
  scrapingWindow.show();
  scrapingWindow.focus();
  scrapingWindow.webContents.openDevTools();
  console.log('[ScraperManager] Fenêtre debug affichée + DevTools ouvert');
  return { ok: true };
}

module.exports = {
  init,
  startScraping,
  stopScraping,
  getState,
  setUserContext,
  showDebugWindow,
  get scrapingWindow() { return scrapingWindow; }
};
