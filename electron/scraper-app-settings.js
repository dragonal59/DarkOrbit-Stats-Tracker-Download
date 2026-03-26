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

module.exports = {
  SCRAPER_APP_SETTINGS_PATH,
  DEFAULT_SCRAPER,
  readScraperSection,
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
};
