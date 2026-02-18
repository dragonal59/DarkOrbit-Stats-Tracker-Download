/**
 * Serveur HTTP local (port 3000) pour la communication Extension ↔ Main Process.
 * Validation token obligatoire sur tous les endpoints.
 */
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const path = require('path');
const DarkOrbitAccounts = require('./darkorbit-accounts');
const SERVER_NAMES = require(path.join(__dirname, '..', 'src', 'backend', 'server-mappings.js'));
const PORT = 3000;

/** Middleware : vérifie le token Authorization Bearer */
function validateToken(req, body) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Token manquant' };
  }
  const token = authHeader.substring(7);
  if (token !== global.scraperAuthToken) {
    return { valid: false, error: 'Token invalide' };
  }
  return { valid: true };
}

/** Réponse JSON avec status */
function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** Parse le body JSON d'une requête POST */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Timeout pour POST /execute (évite blocage infini si la page ne répond pas) */
const EXECUTE_TIMEOUT_MS = 15000;

/** Code exécuté dans la page pour détecter si le login est réussi (formulaire disparu ou page interne) */
const CHECK_LOGIN_SUCCESS_CODE = `(function(){
  try {
    if (window.location.href.indexOf('indexInternal') !== -1) return true;
    var form = document.querySelector('#login_btn, #login_button, .login-form, form[action*="login"]');
    return !form;
  } catch (e) { return false; }
})()`;

function createScraperServer(mainWindowRef, options = {}) {
  const { navigateTo, executeInScrapingWindow, getCookies, setCookies, onCookiesSaved, onCookiesRemoved, showWindowForCaptcha, hideScrapingWindow, onScrapingDone } = options;
  global.savedScraperCookies = global.savedScraperCookies || {};
  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0] || '/';
    const method = req.method;

    console.log('[ScraperServer]', method, url);

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }

    const tokenCheck = validateToken(req);
    if (!tokenCheck.valid) {
      console.warn('[ScraperServer] 403 Token invalide:', tokenCheck.error);
      jsonResponse(res, 403, { error: tokenCheck.error });
      return;
    }

    try {
      if (url === '/accounts' && method === 'GET') {
        const accounts = DarkOrbitAccounts.getScraperAccounts();
        console.log('[ScraperServer] GET /accounts →', accounts.length, 'comptes');
        jsonResponse(res, 200, { success: true, accounts });
        return;
      }

      if (url === '/progress' && method === 'POST') {
        const body = await parseBody(req);
        const { currentServer, currentServerIndex, action, completed } = body;
        if (global.scrapingState) {
          global.scrapingState.currentServer = currentServer || global.scrapingState.currentServer;
          global.scrapingState.currentServerIndex = currentServerIndex ?? global.scrapingState.currentServerIndex;
          global.scrapingState.completed = completed || global.scrapingState.completed || [];
          global.scrapingState.lastUpdate = new Date().toISOString();
          if (action === 'all_completed') global.scrapingState.running = false;
        }
        const serverLabel = (currentServer && SERVER_NAMES[currentServer]) ? SERVER_NAMES[currentServer] : currentServer;
        console.log(`[ScraperServer] PROGRESS ${serverLabel || '?'} (${currentServerIndex || '?'}/23) - ${action || '?'}`);
        if (mainWindowRef?.webContents) {
          mainWindowRef.webContents.send('scraping-progress', global.scrapingState || {});
        }
        jsonResponse(res, 200, { success: true, message: 'Progression enregistrée' });
        return;
      }

      if (url === '/collect' && method === 'POST') {
        const body = await parseBody(req);
        const { server_id, server_name, timestamp, players } = body;
        const userId = global.currentUserId;
        const accessToken = global.supabaseAccessToken;

        if (!userId || !accessToken) {
          jsonResponse(res, 500, { success: false, error: 'User non authentifié' });
          return;
        }

        const supabase = createClient(
          process.env.SUPABASE_URL || '',
          process.env.SUPABASE_ANON_KEY || '',
          { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        );

        const { data: settings, error: fetchError } = await supabase
          .from('user_settings')
          .select('imported_rankings_json, settings_json, links_json, booster_config_json, current_stats_json, theme, view_mode')
          .eq('user_id', userId)
          .single();

        let rankings = {};
        if (!fetchError && settings) {
          rankings = settings.imported_rankings_json || {};
        }

        const existingTs = rankings[server_id]?.timestamp;
        if (existingTs && new Date(existingTs) >= new Date(timestamp)) {
          console.log(`[ScraperServer] /collect ${server_id} ignoré (données anciennes)`);
          jsonResponse(res, 200, { success: true, message: 'Données ignorées (anciennes)', saved: false });
          return;
        }

        rankings[server_id] = { server_id, server_name, timestamp, players };

        const row = {
          user_id: userId,
          imported_rankings_json: rankings,
          updated_at: new Date().toISOString()
        };
        if (settings) {
          row.settings_json = settings.settings_json || {};
          row.links_json = settings.links_json || [];
          row.booster_config_json = settings.booster_config_json || {};
          row.current_stats_json = settings.current_stats_json || {};
          row.theme = settings.theme || 'dark';
          row.view_mode = settings.view_mode || 'detailed';
        }

        const { error: upsertError } = await supabase
          .from('user_settings')
          .upsert(row, { onConflict: 'user_id' });

        if (upsertError) throw upsertError;

        const serverLabel = SERVER_NAMES[server_id] || server_id;
        console.log(`[ScraperServer] /collect ${serverLabel} (${server_id}) enregistré - ${(players || []).length} joueurs`);
        if (mainWindowRef?.webContents) {
          mainWindowRef.webContents.send('rankings-updated', { server_id, playersCount: (players || []).length });
        }

        jsonResponse(res, 200, {
          success: true,
          message: 'Données enregistrées',
          playersCount: (players || []).length,
          saved: true
        });
        return;
      }

      if (url === '/scrape-events' && method === 'POST') {
        const body = await parseBody(req);
        const events = Array.isArray(body?.events) ? body.events : [];
        const userId = global.currentUserId;
        const accessToken = global.supabaseAccessToken;

        if (!userId || !accessToken) {
          jsonResponse(res, 500, { success: false, error: 'User non authentifié' });
          return;
        }

        const supabase = createClient(
          process.env.SUPABASE_URL || '',
          process.env.SUPABASE_ANON_KEY || '',
          { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
        );

        const { data: settings, error: fetchError } = await supabase
          .from('user_settings')
          .select('imported_rankings_json, settings_json, links_json, booster_config_json, current_stats_json, current_events_json, theme, view_mode')
          .eq('user_id', userId)
          .single();

        const row = {
          user_id: userId,
          current_events_json: events,
          updated_at: new Date().toISOString()
        };
        if (!fetchError && settings) {
          row.imported_rankings_json = settings.imported_rankings_json || {};
          row.settings_json = settings.settings_json || {};
          row.links_json = settings.links_json || [];
          row.booster_config_json = settings.booster_config_json || {};
          row.current_stats_json = settings.current_stats_json || {};
          row.theme = settings.theme || 'dark';
          row.view_mode = settings.view_mode || 'detailed';
        }

        const { error: upsertError } = await supabase
          .from('user_settings')
          .upsert(row, { onConflict: 'user_id' });

        if (upsertError) {
          console.error('[ScraperServer] /scrape-events upsert:', upsertError.message);
          jsonResponse(res, 500, { success: false, error: upsertError.message });
          return;
        }

        console.log('[ScraperServer] Événements enregistrés:', events.length);
        if (mainWindowRef?.webContents) {
          mainWindowRef.webContents.send('events-updated', { events });
        }
        jsonResponse(res, 200, { success: true, eventsCount: events.length });
        return;
      }

      if (url === '/error' && method === 'POST') {
        const body = await parseBody(req);
        const { server_id, error_type, message, timestamp } = body;
        if (global.scrapingState) {
          global.scrapingState.errors = global.scrapingState.errors || [];
          global.scrapingState.errors.push({ server_id, error_type, message, timestamp });
        }
        const serverLabel = SERVER_NAMES[server_id] || server_id;
        console.error(`[ScraperServer] ERROR ${serverLabel} (${server_id}) - ${error_type}: ${message}`);
        if (mainWindowRef?.webContents) {
          mainWindowRef.webContents.send('scraping-error', { server_id, error_type, message });
          if (error_type === 'captcha_manual_required') {
            mainWindowRef.webContents.send('scraping-captcha-required', { server_id, message: message || `CAPTCHA requis pour ${server_id}` });
          }
        }
        jsonResponse(res, 200, { success: true, action: 'continue', message: 'Erreur enregistrée' });
        return;
      }

      if (url === '/save-cookies' && method === 'POST') {
        const body = await parseBody(req);
        const server_id = body?.server_id;
        if (!server_id || typeof getCookies !== 'function') {
          jsonResponse(res, 400, { success: false, error: 'server_id manquant ou getCookies non disponible' });
          return;
        }
        try {
          const cookies = await getCookies(server_id);
          global.savedScraperCookies[server_id] = cookies;
          console.log(`[ScraperServer] Cookies sauvegardés pour ${server_id}: ${cookies.length} cookies`);
          if (typeof onCookiesSaved === 'function') onCookiesSaved(server_id);
          jsonResponse(res, 200, { success: true, count: cookies.length });
          return;
        } catch (err) {
          console.error('[ScraperServer] /save-cookies:', err.message);
          jsonResponse(res, 500, { success: false, error: err.message });
          return;
        }
      }

      if (url === '/restore-cookies' && method === 'POST') {
        const body = await parseBody(req);
        const server_id = body?.server_id;
        if (!server_id || typeof setCookies !== 'function') {
          jsonResponse(res, 400, { success: false, error: 'server_id manquant ou setCookies non disponible' });
          return;
        }
        const cookies = global.savedScraperCookies[server_id];
        if (!cookies || cookies.length === 0) {
          jsonResponse(res, 200, { success: false, message: 'Aucun cookie sauvegardé' });
          return;
        }
        try {
          await setCookies(server_id, cookies);
          console.log(`[ScraperServer] Cookies restaurés pour ${server_id}: ${cookies.length} cookies`);
          jsonResponse(res, 200, { success: true, count: cookies.length });
          return;
        } catch (err) {
          console.error('[ScraperServer] /restore-cookies:', err.message);
          jsonResponse(res, 500, { success: false, error: err.message });
          return;
        }
      }

      if (url === '/remove-cookies' && method === 'POST') {
        const body = await parseBody(req);
        const server_id = body?.server_id;
        if (!server_id) {
          jsonResponse(res, 400, { success: false, error: 'server_id manquant' });
          return;
        }
        if (global.savedScraperCookies && global.savedScraperCookies[server_id]) {
          delete global.savedScraperCookies[server_id];
          if (typeof onCookiesRemoved === 'function') onCookiesRemoved(server_id);
          console.log(`[ScraperServer] Cookies expirés supprimés pour ${server_id}`);
        }
        jsonResponse(res, 200, { success: true, message: 'Cookies supprimés' });
        return;
      }

      if (url === '/navigate' && method === 'POST') {
        const body = await parseBody(req);
        const targetUrl = body?.url;
        const waitForLoad = body?.wait === true;
        if (!targetUrl || typeof targetUrl !== 'string') {
          jsonResponse(res, 400, { success: false, error: 'url manquante ou invalide' });
          return;
        }
        if (typeof navigateTo !== 'function') {
          jsonResponse(res, 500, { success: false, error: 'Navigation non disponible' });
          return;
        }
        console.log('[ScraperServer] POST /navigate →', targetUrl, waitForLoad ? '(attente chargement)' : '');
        try {
          const nav = navigateTo(targetUrl);
          if (waitForLoad && nav && typeof nav.then === 'function') {
            await nav;
          }
          jsonResponse(res, 200, { success: true, message: 'Navigation effectuée' });
          return;
        } catch (err) {
          console.error('[ScraperServer] /navigate erreur:', err.message);
          jsonResponse(res, 500, { success: false, error: err.message });
          return;
        }
      }

      if (url === '/execute' && method === 'POST') {
        const body = await parseBody(req);
        const code = body?.code;
        if (!code || typeof code !== 'string') {
          jsonResponse(res, 400, { success: false, error: 'code manquant ou invalide' });
          return;
        }
        if (typeof executeInScrapingWindow !== 'function') {
          jsonResponse(res, 500, { success: false, error: 'Execute non disponible' });
          return;
        }
        try {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout ' + EXECUTE_TIMEOUT_MS + 'ms')), EXECUTE_TIMEOUT_MS);
          });
          const result = await Promise.race([
            executeInScrapingWindow(code),
            timeoutPromise
          ]);
          jsonResponse(res, 200, { success: true, result });
          return;
        } catch (err) {
          if (err?.message && err.message.startsWith('Timeout ')) {
            console.warn('[ScraperServer] /execute timeout - continuation forcée');
            jsonResponse(res, 200, { success: true, result: null, timeout: true });
            return;
          }
          console.error('[ScraperServer] /execute erreur:', err.message);
          jsonResponse(res, 500, { success: false, error: err.message });
          return;
        }
      }

      if (url === '/captcha-wait' && method === 'POST') {
        const body = await parseBody(req);
        const server_id = body?.server_id;
        if (!server_id) {
          jsonResponse(res, 400, { success: false, error: 'server_id manquant' });
          return;
        }
        const serverLabel = SERVER_NAMES[server_id] || server_id;
        if (mainWindowRef?.webContents) {
          mainWindowRef.webContents.send('scraping-captcha-required', {
            server_id,
            message: `Valide le CAPTCHA pour ${serverLabel}`
          });
        }
        if (typeof showWindowForCaptcha === 'function') showWindowForCaptcha();
        const POLL_MS = 3000;
        const TIMEOUT_MS = 120000;
        const maxAttempts = Math.floor(TIMEOUT_MS / POLL_MS);
        let success = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (global.scraperShouldStop) {
            console.log('[ScraperServer] /captcha-wait interrompu (stop demandé)');
            break;
          }
          try {
            if (typeof executeInScrapingWindow === 'function') {
              const loggedIn = await executeInScrapingWindow(CHECK_LOGIN_SUCCESS_CODE);
              if (loggedIn === true) {
                success = true;
                console.log(`[ScraperServer] Login manuel détecté pour ${server_id} après ${attempt + 1} vérification(s)`);
                break;
              }
            }
          } catch (e) {
            console.warn('[ScraperServer] /captcha-wait check:', e?.message);
          }
          await sleep(POLL_MS);
        }
        if (typeof hideScrapingWindow === 'function') hideScrapingWindow();
        if (success && mainWindowRef?.webContents) {
          mainWindowRef.webContents.send('scraping-captcha-resolved', { server_id });
          jsonResponse(res, 200, { success: true });
          return;
        }
        if (mainWindowRef?.webContents) {
          mainWindowRef.webContents.send('scraping-captcha-timeout', { server_id });
        }
        jsonResponse(res, 200, { success: false, timeout: true });
        return;
      }

      if (url === '/stop' && method === 'POST') {
        global.scraperShouldStop = true;
        if (global.scrapingState) {
          global.scrapingState.running = false;
          global.scrapingState.currentServer = null;
          global.scrapingState.currentServerIndex = 0;
        }
        console.log('[ScraperServer] POST /stop → arrêt demandé, running = false');
        jsonResponse(res, 200, { success: true, message: 'Arrêt demandé' });
        return;
      }

      if (url === '/scraping-done' && method === 'POST') {
        const body = await parseBody(req).catch(() => ({}));
        const action = body?.action || 'all_completed';
        const completedCount = body?.completedCount ?? (global.scrapingState?.completed?.length ?? 0);
        console.log('[ScraperServer] POST /scraping-done reçu, action:', action, 'completedCount:', completedCount);
        if (typeof onScrapingDone === 'function') onScrapingDone();
        global.scraperShouldStop = false;
        if (global.scrapingState) {
          global.scrapingState.running = false;
          global.scrapingState.currentServer = null;
          global.scrapingState.currentServerIndex = 0;
          global.scrapingState.completed = [];
          global.scrapingState.lastUpdate = new Date().toISOString();
        }
        if (mainWindowRef?.webContents) {
          mainWindowRef.webContents.send('scraping-finished', { action, completedCount });
        }
        console.log('[ScraperServer] Scraping terminé - système prêt pour une nouvelle collecte');
        jsonResponse(res, 200, { success: true, message: 'Scraping terminé' });
        return;
      }

      if (url === '/status' && method === 'GET') {
        let estimatedCompletion = null;
        const state = global.scrapingState || {};
        if (state.running && state.startTime && state.currentServerIndex > 0) {
          const elapsed = Date.now() - new Date(state.startTime).getTime();
          const avgPerServer = elapsed / state.currentServerIndex;
          const remaining = (23 - state.currentServerIndex) * avgPerServer;
          estimatedCompletion = new Date(Date.now() + remaining).toISOString();
        }
        jsonResponse(res, 200, {
          success: true,
          state: {
            ...state,
            estimatedCompletion,
            stopRequested: !!global.scraperShouldStop
          }
        });
        return;
      }

      jsonResponse(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('[ScraperServer] Erreur:', err);
      jsonResponse(res, 500, { success: false, error: err.message });
    }
  });

  server.listen(PORT, () => {
    console.log(`[ScraperServer] Serveur HTTP démarré sur port ${PORT}`);
  });

  return server;
}

module.exports = { createScraperServer };
