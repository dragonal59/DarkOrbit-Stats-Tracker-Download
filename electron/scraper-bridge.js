/**
 * Pont entre main.js et les modules de scraping (état / token).
 */
let mainWindowRef = null;

function resetScrapingState(totalServers = 0, patch = {}) {
  global.scrapingState = {
    running: false,
    paused: false,
    currentServer: null,
    currentServerIndex: 0,
    totalServers: totalServers,
    completed: [],
    serverList: [],
    startTime: null,
    lastUpdate: new Date().toISOString(),
    ...patch
  };
  return global.scrapingState;
}

/**
 * Émet un événement d'erreur de scraping vers le renderer.
 * Utilisé par les wrappers start* en cas d'erreur de démarrage.
 * Le renderer écoute ce canal via window.electronScraper.onError().
 * @param {string} server_id - ID du serveur concerné, ou '' pour une erreur globale
 * @param {string} message   - Message d'erreur lisible
 */
function sendScrapingError(server_id, message) {
  if (mainWindowRef?.webContents && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('scraping-error', { server_id: server_id || '', message: message || 'Erreur inconnue' });
  }
  try {
    if (typeof global.shouldShowDesktopNotification === 'function'
      && global.shouldShowDesktopNotification('error')
      && typeof global.showDesktopNotification === 'function') {
      global.showDesktopNotification('Erreur scraping', message || 'Erreur inconnue');
    }
  } catch (e) {
    // ignore notification failures
  }
}

async function startEventsOnlyScraping() {
  return { ok: false, error: 'Collecte événements DarkOrbit désactivée.' };
}

function getState() {
  return global.scrapingState || resetScrapingState();
}

function pauseScraping(paused = true) {
  global.scraperPaused = !!paused;
  if (global.scrapingState) {
    global.scrapingState.paused = global.scraperPaused;
    global.scrapingState.lastUpdate = new Date().toISOString();
  }
  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send('scraping-progress', global.scrapingState || {});
  }
  return { ok: true, paused: global.scraperPaused };
}

function stopScraping() {
  global.scraperPaused = false;
  global.scraperShouldStop = true;
  if (global.scrapingState) {
    global.scrapingState.running = false;
    global.scrapingState.currentServer = null;
    global.scrapingState.currentServerIndex = 0;
    global.scrapingState.lastUpdate = new Date().toISOString();
  }
  if (mainWindowRef?.webContents) {
    mainWindowRef.webContents.send('scraping-progress', global.scrapingState || { running: false });
  }
  return { ok: true };
}

function setUserContext(userId, accessToken) {
  global.currentUserId = userId;
  global.supabaseAccessToken = accessToken;
}

const FRESH_TOKEN_TIMEOUT_MS = 10000;

/**
 * Demande un token frais au renderer (refreshSession) et met à jour le contexte.
 * À appeler depuis le main ; le renderer doit être prêt (listener request-fresh-token).
 *
 * Guard contre les appels simultanés : si un refresh est déjà en cours, tous les
 * appelants concurrents reçoivent la même promesse au lieu d'écraser
 * global._freshTokenResolve et de laisser l'appelant précédent en attente indéfinie.
 *
 * @returns {Promise<boolean>} true si un nouveau token a été reçu, false si timeout ou pas de fenêtre
 */
function refreshSupabaseToken() {
  if (global._tokenRefreshPromise) {
    return global._tokenRefreshPromise;
  }

  global._tokenRefreshPromise = new Promise((resolve) => {
    if (!mainWindowRef || mainWindowRef.isDestroyed() || !mainWindowRef.webContents) {
      console.warn('[Supabase] Pas de fenêtre disponible pour le refresh token');
      resolve(false);
      return;
    }
    global._freshTokenResolve = resolve;
    mainWindowRef.webContents.send('request-fresh-token');
    global._freshTokenTimeout = setTimeout(() => {
      if (typeof global._freshTokenResolve === 'function') {
        global._freshTokenResolve(false);
        global._freshTokenResolve = null;
        console.warn('[Supabase] Timeout 10s — pas de réponse du renderer pour le refresh token');
      }
      global._freshTokenTimeout = null;
    }, FRESH_TOKEN_TIMEOUT_MS);
  }).finally(() => {
    global._tokenRefreshPromise = null;
  });

  return global._tokenRefreshPromise;
}

function init(mainWindow) {
  mainWindowRef = mainWindow;
  resetScrapingState();
  global.scraperShouldStop = false;
  return Promise.resolve();
}

function cleanup() {
  stopScraping();
  mainWindowRef = null;
}

module.exports = {
  init,
  startEventsOnlyScraping,
  pauseScraping,
  stopScraping,
  getState,
  setUserContext,
  refreshSupabaseToken,
  sendScrapingError,
  cleanup
};
