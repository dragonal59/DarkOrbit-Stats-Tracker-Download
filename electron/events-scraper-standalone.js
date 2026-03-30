/**
 * Collecte événements DarkOrbit — sans extension, BrowserWindow + login.
 * 1 compte fr1, config dans scraping-config.eventsScraperAccount.
 */
const { BrowserWindow, app } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const { readMergedSupabaseConfigFromDisk } = require('./supabase-config-from-disk');
const { getConfig } = require('./scraping-config');
const { getDoEventsCredentials } = require('./do-events-credentials');
const { applyScraperSessionProxyPolicy } = require('./scraper-app-settings');
const { JS_EXTRACT_EVENTS } = require('./extract-events');

const SERVER_ID = 'fr1';
const EVENTS_URL = `https://${SERVER_ID}.darkorbit.com/indexInternal.es?action=internalStart&prc=100`;
const LOGIN_URL = `https://${SERVER_ID}.darkorbit.com/?lang=fr`;

const DELAY = { afterLoad: 3000, afterLogin: 5000 };

function getSupabaseConfig() {
  let url = process.env.SUPABASE_URL || '';
  let anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (url && anonKey) return { url, anonKey };
  try {
    const disk = readMergedSupabaseConfigFromDisk(app.isPackaged, app);
    url = disk.url || url;
    anonKey = disk.anonKey || anonKey;
  } catch (_) {}
  return { url, anonKey };
}

function makeSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();
  const token = global.supabaseAccessToken;
  const opts = token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {};
  return createClient(url, anonKey, opts);
}

const JS_ACCEPT_BANNER = `(function(){
  try {
    var btns = document.querySelectorAll('button,[role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var t = (btns[i].textContent || '').toLowerCase();
      if (t.indexOf('accept') !== -1 || t.indexOf('agree') !== -1 || t.indexOf('akzept') !== -1 || t.indexOf('ok') === 0) {
        btns[i].click(); return true;
      }
    }
    return false;
  } catch(e) { return false; }
})()`;

function jsLogin(username, password) {
  const u = JSON.stringify(username);
  const p = JSON.stringify(password);
  return `(function(){
    // Cibler le formulaire de CONNEXION, indépendamment de la langue de la page.
    function findField(placeholders) {
      for (var i = 0; i < placeholders.length; i++) {
        var el = document.querySelector('input[placeholder*="' + placeholders[i] + '"]');
        if (el) return el;
      }
      return null;
    }
    function getLoginForm() {
      var pseudo = findField(['Pseudonyme','Username','Benutzername','Nombre de usuario','Kullanıcı','Имя пользователя','nickname','login','user'])
        || document.querySelector('input[name*="user"],input[name*="login"],input[name*="nick"]')
        || document.querySelector('#username,#user,#login,#nick');
      var mdp = findField(['Mot de passe','Password','Passwort','Contraseña','Şifre','Пароль','password','pass'])
        || document.querySelector('input[type="password"]');
      if (!pseudo || !mdp) return null;
      var forms = document.querySelectorAll('form');
      for (var i = 0; i < forms.length; i++) {
        var f = forms[i];
        var hasPseudo = f.contains(pseudo);
        var hasMdp = f.contains(mdp);
        var hasEmail = f.querySelector('input[placeholder*="e-mail"],input[placeholder*="email"],input[type="email"]');
        if (hasPseudo && hasMdp && !hasEmail) return { uf: pseudo, pf: mdp, form: f };
      }
      return { uf: pseudo, pf: mdp, form: pseudo.closest('form') };
    }
    try {
      var ctx = getLoginForm();
      if (!ctx || !ctx.uf || !ctx.pf) return { success: false, error: 'no_login_form' };
      ctx.uf.value = ${u};
      ctx.pf.value = ${p};
      ctx.uf.dispatchEvent(new Event('input', { bubbles: true }));
      ctx.pf.dispatchEvent(new Event('input', { bubbles: true }));
      var sb = ctx.form ? ctx.form.querySelector('button[type="submit"], input[type="submit"]') : null;
      if (sb) { sb.click(); return { success: true }; }
      if (ctx.form) { ctx.form.submit(); return { success: true }; }
      return { success: false, error: 'no_submit' };
    } catch (e) { return { success: false, error: e.message }; }
  })()`;
}

async function runEventsScraping(options = {}) {
  const { mainWindowRef } = options;
  const cfg = getConfig();
  let acc = cfg.eventsScraperAccount;
  if (!acc || !acc.username || !acc.password) {
    acc = getDoEventsCredentials();
  }
  if (!acc || !acc.username || !acc.password) {
    return { ok: false, error: 'Compte fr1 non configuré' };
  }
  if (!global.currentUserId || !global.supabaseAccessToken) {
    return { ok: false, error: 'Utilisateur non authentifié' };
  }

  global.scrapingState = global.scrapingState || {};
  global.scrapingState.running = true;
  global.scrapingState.currentServer = SERVER_ID;
  global.scrapingState.currentAction = 'events_connecting';
  if (mainWindowRef?.webContents) mainWindowRef.webContents.send('scraping-progress', global.scrapingState);

  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      // sandbox: true — compatible car le scraper n'utilise pas Node.js dans le renderer
      // (nodeIntegration: false). executeJavaScript est une API main-process non affectée
      // par le sandbox. Cohérent avec le défaut Electron 20+.
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true, sandbox: true }
    });
    await applyScraperSessionProxyPolicy(win.webContents.session);

    const loadUrl = (url) => new Promise((resolve) => {
      const wc = win.webContents;
      const t = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 30000);
      wc.once('did-fail-load', (_e, errCode, errDesc) => { clearTimeout(t); resolve({ ok: false, reason: errDesc || String(errCode) }); });
      wc.once('did-finish-load', () => { clearTimeout(t); resolve({ ok: true }); });
      win.loadURL(url);
    });

    const exec = (code) => win.webContents.executeJavaScript(code);

    const loginLoad = await loadUrl(LOGIN_URL);
    if (!loginLoad.ok) {
      return { ok: false, error: `Impossible de charger la page DarkOrbit (${loginLoad.reason})` };
    }
    await new Promise(r => setTimeout(r, DELAY.afterLoad));
    try { await exec(JS_ACCEPT_BANNER); await new Promise(r => setTimeout(r, 500)); } catch (_) {}
    const loginRes = await exec(jsLogin(acc.username, acc.password));
    if (!loginRes?.success) {
      return { ok: false, error: loginRes?.error || 'Login échoué' };
    }
    await new Promise(r => setTimeout(r, DELAY.afterLogin));

    const hasEvents = await exec('document.querySelector(".news-base-container") !== null');
    if (!hasEvents) {
      await loadUrl(EVENTS_URL);
      await new Promise(r => setTimeout(r, DELAY.afterLoad));
    }

    const evRes = await exec(JS_EXTRACT_EVENTS);
    if (!evRes?.ok || !Array.isArray(evRes.events)) {
      return { ok: false, error: 'Extraction événements échouée' };
    }

    const events = evRes.events.map(ev => ({
      id: ev.id || '',
      name: (ev.name || '').trim(),
      description: (ev.description || '').trim(),
      timer: (ev.timer || '').trim(),
      imageUrl: (ev.imageUrl || '').trim(),
      scrapedAt: ev.scrapedAt || new Date().toISOString(),
      endTimestamp: ev.endTimestamp != null ? ev.endTimestamp : null
    }));

    const nowMs = Date.now();
    const filtered = events.filter(ev => {
      const t = (ev.timer || '').trim();
      const m = t.match(/(\d+):(\d+):(\d+)/);
      if (!m) return true;
      const h = parseInt(m[1], 10) || 0, mn = parseInt(m[2], 10) || 0, s = parseInt(m[3], 10) || 0;
      const scrapedAt = ev.scrapedAt ? new Date(ev.scrapedAt).getTime() : nowMs;
      const endMs = scrapedAt + (h * 3600 + mn * 60 + s) * 1000;
      return endMs > nowMs;
    });

    const supabase = makeSupabaseClient();
    const { data: settings } = await supabase.from('user_settings').select('imported_rankings_json,settings_json,links_json,booster_config_json,current_stats_json,theme,view_mode').eq('user_id', global.currentUserId).single();
    const row = {
      user_id: global.currentUserId,
      current_events_json: filtered,
      updated_at: new Date().toISOString()
    };
    if (settings) {
      row.imported_rankings_json = settings.imported_rankings_json || {};
      row.settings_json = settings.settings_json || {};
      row.links_json = settings.links_json || [];
      row.booster_config_json = settings.booster_config_json || {};
      row.current_stats_json = settings.current_stats_json || {};
      row.theme = settings.theme || 'dark';
      row.view_mode = settings.view_mode || 'detailed';
    }
    const { error: upsertErr } = await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
    if (upsertErr) throw upsertErr;
    const { data: sharedResult, error: sharedError } = await supabase.rpc('upsert_shared_events', {
      p_events: filtered,
      p_uploaded_by: global.currentUserId
    });
    if (sharedError || !sharedResult?.success) {
      console.error('[EventsScraper] upsert_shared_events échoué — token invalide ou Supabase injoignable:', sharedError || sharedResult);
      if (sharedError) throw sharedError;
      throw new Error('upsert_shared_events: ' + (sharedResult?.code || 'échec'));
    }

    global.scrapingState.running = false;
    global.scrapingState.currentAction = 'events_completed';
    if (mainWindowRef?.webContents) {
      mainWindowRef.webContents.send('scraping-progress', global.scrapingState);
      mainWindowRef.webContents.send('scraping-finished', { action: 'events_completed', completedCount: 1 });
      mainWindowRef.webContents.send('events-updated', { events: filtered, eventsCount: filtered.length });
      mainWindowRef.webContents.send('scraping:events-collected', { server_id: SERVER_ID, count: filtered.length });
    }

    console.log(`[EventsScraper] ${filtered.length} événements enregistrés`);
    return { ok: true, eventsCount: filtered.length, events: filtered };
  } catch (e) {
    global.scrapingState.running = false;
    global.scrapingState.currentAction = 'events_error';
    if (mainWindowRef?.webContents) {
      mainWindowRef.webContents.send('scraping-progress', global.scrapingState);
      mainWindowRef.webContents.send('scraping-finished', { action: 'events_error', completedCount: 0, error: e.message });
    }
    console.error('[EventsScraper] Erreur lors de la collecte ou de l\'upsert des événements:', e?.message || e);
    return { ok: false, error: e?.message || 'Erreur' };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
}

/**
 * Connexion + extraction des événements uniquement (sans Supabase).
 * Utilise les identifiants en dur (do-events-credentials) ou la config.
 * Pour l'onglet "Événements DO" du scraper app.
 * options.sendLog({ type, message }) envoie vers la console live si fourni.
 */
async function loginAndExtractEventsOnly(options = {}) {
  const sendLog = options.sendLog && typeof options.sendLog === 'function' ? options.sendLog : () => {};
  const log = (type, message) => sendLog({ type, message, at: new Date().toISOString() });

  let acc = getConfig().eventsScraperAccount;
  if (!acc || !acc.username || !acc.password) {
    acc = getDoEventsCredentials();
  }
  if (!acc || !acc.username || !acc.password) {
    return { ok: false, error: 'Compte fr1 non configuré', events: [] };
  }

  let win = null;
  try {
    log('info', 'Connexion en cours…');
    win = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true, sandbox: true }
    });
    await applyScraperSessionProxyPolicy(win.webContents.session);

    const loadUrl = (url) => new Promise((resolve) => {
      const wc = win.webContents;
      const t = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 30000);
      wc.once('did-fail-load', (_e, errCode, errDesc) => { clearTimeout(t); resolve({ ok: false, reason: errDesc || String(errCode) }); });
      wc.once('did-finish-load', () => { clearTimeout(t); resolve({ ok: true }); });
      win.loadURL(url);
    });

    const exec = (code) => win.webContents.executeJavaScript(code);

    const loginLoad = await loadUrl(LOGIN_URL);
    if (!loginLoad.ok) {
      log('error', `Impossible de charger la page DarkOrbit (${loginLoad.reason})`);
      return { ok: false, error: `Impossible de charger la page DarkOrbit (${loginLoad.reason})`, events: [] };
    }
    await new Promise(r => setTimeout(r, DELAY.afterLoad));
    try { await exec(JS_ACCEPT_BANNER); await new Promise(r => setTimeout(r, 500)); } catch (_) {}
    const loginRes = await exec(jsLogin(acc.username, acc.password));
    if (!loginRes?.success) {
      log('error', 'Connexion échouée');
      return { ok: false, error: loginRes?.error || 'Login échoué', events: [] };
    }
    log('success', 'Connexion réussie');
    await new Promise(r => setTimeout(r, DELAY.afterLogin));

    log('info', 'Arrivé sur page d\'accueil');
    const hasEvents = await exec('document.querySelector(".news-base-container") !== null');
    if (!hasEvents) {
      await loadUrl(EVENTS_URL);
      await new Promise(r => setTimeout(r, DELAY.afterLoad));
    }

    const evRes = await exec(JS_EXTRACT_EVENTS);
    if (!evRes?.ok || !Array.isArray(evRes.events)) {
      log('error', 'Extraction événements échouée');
      return { ok: false, error: 'Extraction événements échouée', events: [] };
    }

    const events = (evRes.events || []).map(ev => ({
      id: ev.id || '',
      name: (ev.name || '').trim(),
      description: (ev.description || '').trim(),
      timer: (ev.timer || '').trim(),
      imageUrl: (ev.imageUrl || '').trim(),
      scrapedAt: ev.scrapedAt || new Date().toISOString(),
      endTimestamp: ev.endTimestamp != null ? ev.endTimestamp : null
    }));

    log('success', `Événements extraits : ${events.length}`);
    log('info', 'Fin du scraping');
    console.log(`[EventsScraper] ${events.length} événements extraits (sans Supabase)`);
    return { ok: true, events };
  } catch (e) {
    log('error', e?.message || 'Erreur');
    console.error('[EventsScraper] loginAndExtractEventsOnly:', e?.message || e);
    return { ok: false, error: e?.message || 'Erreur', events: [] };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
}

module.exports = { runEventsScraping, loginAndExtractEventsOnly };
