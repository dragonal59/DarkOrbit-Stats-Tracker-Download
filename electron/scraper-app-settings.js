/**
 * Lecture unique de scraper-app-settings.json (Paramètres > Scraper dans l'app React).
 * - Accepte nombres ou chaînes numériques (JSON / édition manuelle).
 * - Défauts alignés sur src/scraper_app/data/defaultSettings.js
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const SCRAPER_APP_SETTINGS_PATH = path.join(app.getPath('userData'), 'scraper-app-settings.json');

/** Aligné sur defaultSettings.js — scraper */
const DEFAULT_SCRAPER = {
  concurrency: 2,
  profilesConcurrency: 3,
  timeoutMs: 30000,
  rateLimitDelay: 500,
  retries: 3,
};

function parseNum(scraper, key, def, min, max) {
  if (!scraper || typeof scraper !== 'object') return def;
  const raw = scraper[key];
  if (raw === undefined || raw === null || raw === '') return def;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/**
 * Section `scraper` du JSON, ou `{}` si le fichier existe sans clé scraper.
 * `null` seulement si fichier absent ou JSON invalide.
 */
function readScraperSection() {
  try {
    if (!fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    if (data.scraper == null || typeof data.scraper !== 'object') return {};
    return data.scraper;
  } catch (_) {
    return null;
  }
}

function getRateLimitDelayMs() {
  try {
    return parseNum(readScraperSection(), 'rateLimitDelay', DEFAULT_SCRAPER.rateLimitDelay, 0, 10000);
  } catch (_) {
    return DEFAULT_SCRAPER.rateLimitDelay;
  }
}

function getTimeoutMs() {
  try {
    return parseNum(readScraperSection(), 'timeoutMs', DEFAULT_SCRAPER.timeoutMs, 5000, 60000);
  } catch (_) {
    return DEFAULT_SCRAPER.timeoutMs;
  }
}

function getRetries() {
  try {
    return parseNum(readScraperSection(), 'retries', DEFAULT_SCRAPER.retries, 0, 5);
  } catch (_) {
    return DEFAULT_SCRAPER.retries;
  }
}

function getServerConcurrency() {
  try {
    return parseNum(readScraperSection(), 'concurrency', DEFAULT_SCRAPER.concurrency, 1, 10);
  } catch (_) {
    return DEFAULT_SCRAPER.concurrency;
  }
}

function getProfilesConcurrency() {
  try {
    return parseNum(readScraperSection(), 'profilesConcurrency', DEFAULT_SCRAPER.profilesConcurrency, 1, 10);
  } catch (_) {
    return DEFAULT_SCRAPER.profilesConcurrency;
  }
}

function getUserAgentString() {
  try {
    const sc = readScraperSection();
    const ua = sc && typeof sc.userAgent === 'string' ? sc.userAgent.trim() : '';
    if (ua) return ua;
  } catch (_) {}
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

/**
 * Section `proxies` du JSON Paramètres scraper (pool + options).
 * `null` si fichier absent / JSON invalide ; `{}` si pas de clé proxies.
 */
function readProxiesSection() {
  try {
    if (!fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    if (data.proxies == null || typeof data.proxies !== 'object') return {};
    return data.proxies;
  } catch (_) {
    return null;
  }
}

/**
 * Paramètre UI « Scraper sans proxy » : connexion directe explicite (pas de proxy système / pool).
 * Quand false : comportement Chromium par défaut (inchangé tant que le routage proxy pool n’est pas branché).
 */
function getScrapeWithoutProxy() {
  try {
    const px = readProxiesSection();
    if (!px || typeof px !== 'object') return false;
    return px.scrapeWithoutProxy === true;
  } catch (_) {
    return false;
  }
}

function readDatabaseSection() {
  try {
    if (!fs.existsSync(SCRAPER_APP_SETTINGS_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(SCRAPER_APP_SETTINGS_PATH, 'utf8'));
    if (!data || typeof data !== 'object') return null;
    if (data.database == null || typeof data.database !== 'object') return {};
    return data.database;
  } catch (_) { return null; }
}

function getPrettyPrint() {
  try { const db = readDatabaseSection(); return !!(db && db.prettyPrint === true); } catch (_) { return false; }
}

function getFormatCsv() {
  try { const db = readDatabaseSection(); return !!(db && db.format === 'json+csv'); } catch (_) { return false; }
}

function getRetentionDays() {
  try {
    const db = readDatabaseSection();
    if (!db) return 90;
    const v = typeof db.retentionDays === 'number' ? db.retentionDays : 90;
    return Math.max(1, Math.min(3650, Math.floor(v)));
  } catch (_) { return 90; }
}

function getBackupSettings() {
  try {
    const db = readDatabaseSection();
    if (!db) return { enabled: false };
    return {
      enabled: db.backupEnabled === true,
      dir: typeof db.backupDir === 'string' && db.backupDir.trim() ? db.backupDir.trim() : './backups',
      everyH: typeof db.backupEveryH === 'number' ? Math.max(1, db.backupEveryH) : 24,
      maxBackups: typeof db.maxBackups === 'number' ? Math.max(1, db.maxBackups) : 7,
    };
  } catch (_) { return { enabled: false }; }
}

function getBlockImages() {
  try { const sc = readScraperSection(); return !!(sc && sc.blockImages === true); } catch (_) { return false; }
}

function getBlockFonts() {
  try { const sc = readScraperSection(); return !!(sc && sc.blockFonts === true); } catch (_) { return false; }
}

function getBlockCSS() {
  try { const sc = readScraperSection(); return !!(sc && sc.blockCSS === true); } catch (_) { return false; }
}

function getScreenshotOnError() {
  try { const sc = readScraperSection(); return !!(sc && sc.screenshotOnError === true); } catch (_) { return false; }
}

/**
 * Applique la politique proxy sur une session de fenêtre de scraping (DOStats, DarkOrbit, etc.).
 */
async function applyScraperSessionProxyPolicy(session) {
  if (!session || typeof session.setProxy !== 'function') return;
  try {
    if (getScrapeWithoutProxy()) {
      await session.setProxy({ proxyRules: 'direct://' });
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Bloque les ressources selon les options UI (blockImages, blockFonts, blockCSS).
 * Doit être appelé après création de la session, avant le premier chargement.
 */
function applyResourceBlockingPolicy(session) {
  const blockImages = getBlockImages();
  const blockFonts = getBlockFonts();
  const blockCSS = getBlockCSS();
  if (!blockImages && !blockFonts && !blockCSS) return;
  if (!session || typeof session.webRequest?.onBeforeRequest !== 'function') return;
  const imgRe = /\.(jpe?g|png|gif|webp|svg|ico|bmp|avif)(\?|$)/i;
  const fontRe = /\.(woff2?|ttf|eot|otf)(\?|$)/i;
  const cssRe = /\.css(\?|$)/i;
  try {
    session.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url || '';
      if (blockImages && imgRe.test(url)) return callback({ cancel: true });
      if (blockFonts && fontRe.test(url)) return callback({ cancel: true });
      if (blockCSS && cssRe.test(url)) return callback({ cancel: true });
      callback({});
    });
  } catch (_) { /* ignore */ }
}

/**
 * Capture une screenshot si l'option screenshotOnError est activée.
 * Sauvegarde dans userData/screenshots/error_<label>_<ts>.png
 */
async function captureScreenshotOnError(win, label) {
  if (!getScreenshotOnError()) return;
  if (!win || win.isDestroyed() || !win.webContents) return;
  try {
    const image = await win.webContents.capturePage();
    const screenshotsDir = path.join(app.getPath('userData'), 'screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });
    const safe = String(label || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    fs.writeFileSync(path.join(screenshotsDir, `error_${safe}_${Date.now()}.png`), image.toPNG());
  } catch (_) { /* ignore */ }
}

module.exports = {
  SCRAPER_APP_SETTINGS_PATH,
  DEFAULT_SCRAPER,
  readScraperSection,
  readDatabaseSection,
  readProxiesSection,
  parseNum,
  getRateLimitDelayMs,
  getTimeoutMs,
  getRetries,
  getServerConcurrency,
  getProfilesConcurrency,
  getUserAgentString,
  getScrapeWithoutProxy,
  applyScraperSessionProxyPolicy,
  getBlockImages,
  getBlockFonts,
  getBlockCSS,
  getScreenshotOnError,
  applyResourceBlockingPolicy,
  captureScreenshotOnError,
  getPrettyPrint,
  getFormatCsv,
  getRetentionDays,
  getBackupSettings,
};
