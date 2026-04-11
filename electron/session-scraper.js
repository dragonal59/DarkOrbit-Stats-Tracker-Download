/**
 * Session Scraper — Méthode 2 de collecte DarkOrbit
 *
 * Architecture : BrowserWindow dédié + executeJavaScript direct + Supabase direct
 * Aucune extension Chrome, aucun serveur HTTP local.
 *
 * Différences vs Méthode 1 :
 *   M1 : Extension Chrome → HTTP server (port 3000) → Main → Supabase
 *   M2 : BrowserWindow → executeJavaScript → Main → Supabase (direct)
 *
 * La Méthode 1 reste 100% intacte et opérationnelle.
 */

const { BrowserWindow, app } = require('electron');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const { readMergedSupabaseConfigFromDisk } = require('./supabase-config-from-disk');
const { applyScraperSessionProxyPolicy } = require('./scraper-app-settings');

// ─── Config ──────────────────────────────────────────────────────────────────

const PARTITION = 'persist:session-scraper';
const COOKIES_FILE = path.join(app.getPath('userData'), 'session-scraper-cookies.json');

const DELAY = {
  pageLoad:       { min: 2500,  max: 4000  },
  betweenPages:   { min: 500,   max: 500   },
  betweenServers: { min: 8000,  max: 12000 },
  afterLogin:     { min: 3000,  max: 5000  },
};

const TIMEOUT = {
  pageLoad: 30000,
  execute:  15000,
};

// ─── État ────────────────────────────────────────────────────────────────────

let _window     = null;
let _mainWindow = null;
let _running    = false;
let _shouldStop = false;
let _savedCookies = {};

/** @type {{ running: boolean, currentServer: string|null, currentServerIndex: number, totalServers: number, completed: string[], errors: Array, startTime: string|null, lastUpdate: string|null }} */
let _state = {
  running: false,
  currentServer: null,
  currentServerIndex: 0,
  totalServers: 0,
  completed: [],
  errors: [],
  startTime: null,
  lastUpdate: null,
};

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(min, max) {
  return new Promise(r => setTimeout(r, rand(min, max)));
}

function updateState(patch) {
  Object.assign(_state, patch, { lastUpdate: new Date().toISOString() });
  if (_mainWindow && !_mainWindow.isDestroyed() && _mainWindow.webContents) {
    _mainWindow.webContents.send('session-scraper-progress', { ..._state });
  }
}

// ─── Config Supabase ─────────────────────────────────────────────────────────

function getSupabaseConfig() {
  let url = process.env.SUPABASE_URL || '';
  let anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (url && anonKey) return { url, anonKey };
  try {
    const disk = readMergedSupabaseConfigFromDisk(app.isPackaged, app);
    url = disk.url || url;
    anonKey = disk.anonKey || anonKey;
  } catch (_e) { /* fichier absent, on garde process.env */ }
  return { url, anonKey };
}

function makeSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();
  const token = global.supabaseAccessToken;
  const opts = token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {};
  return createClient(url, anonKey, opts);
}

// ─── Persistance des cookies ──────────────────────────────────────────────────

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      const raw = fs.readFileSync(COOKIES_FILE, 'utf8');
      _savedCookies = JSON.parse(raw) || {};
    }
  } catch (_e) {
    _savedCookies = {};
  }
}

function writeCookies() {
  try {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(_savedCookies), 'utf8');
  } catch (e) {
    console.warn('[SessionScraper] writeCookies:', e?.message);
  }
}

async function restoreServerCookies(serverId) {
  const list = _savedCookies[serverId];
  if (!list || !list.length) return false;
  const sess = _window?.webContents?.session;
  if (!sess) return false;
  const base = `https://${serverId}.darkorbit.com`;
  let ok = 0;
  for (const c of list) {
    try {
      await sess.cookies.set({
        url:            base,
        name:           c.name,
        value:          c.value,
        domain:         c.domain   || undefined,
        path:           c.path     || '/',
        secure:         c.secure,
        httpOnly:       c.httpOnly,
        expirationDate: c.expirationDate,
      });
      ok++;
    } catch (_e) { /* ignorer cookie invalide */ }
  }
  return ok > 0;
}

async function saveServerCookies(serverId) {
  const sess = _window?.webContents?.session;
  if (!sess) return;
  const cookies = await sess.cookies.get({ url: `https://${serverId}.darkorbit.com` });
  if (cookies && cookies.length > 0) {
    _savedCookies[serverId] = cookies;
    writeCookies();
  }
}

async function clearServerCookies(serverId) {
  delete _savedCookies[serverId];
  writeCookies();
  const sess = _window?.webContents?.session;
  if (!sess) return;
  const cookies = await sess.cookies.get({ url: `https://${serverId}.darkorbit.com` });
  for (const c of cookies) {
    await sess.cookies.remove(`https://${serverId}.darkorbit.com`, c.name).catch(() => {});
  }
}

// ─── Fenêtre de scraping ──────────────────────────────────────────────────────

async function createWindow() {
  _window = new BrowserWindow({
    show: false,
    width: 1366,
    height: 768,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      true,
      // sandbox: true — compatible car le scraper n'utilise pas Node.js dans le renderer
      // (nodeIntegration: false). executeJavaScript et session.cookies sont des APIs
      // main-process non affectées par le sandbox. La partition nommée fonctionne
      // indépendamment du mode sandbox. Cohérent avec le défaut Electron 20+.
      sandbox:          true,
      partition:        PARTITION,
    },
  });
  await applyScraperSessionProxyPolicy(_window.webContents.session);
  _window.on('closed', () => { _window = null; });
  return _window;
}

function destroyWindow() {
  if (_window && !_window.isDestroyed()) {
    _window.destroy();
  }
  _window = null;
}

// ─── Navigation + exécution ──────────────────────────────────────────────────

function navigateTo(url) {
  return new Promise((resolve) => {
    if (!_window || _window.isDestroyed()) { resolve(); return; }
    const wc = _window.webContents;
    const timer = setTimeout(() => {
      wc.removeListener('did-finish-load', onLoad);
      wc.removeListener('did-fail-load',   onFail);
      resolve();
    }, TIMEOUT.pageLoad);
    const onLoad = () => { clearTimeout(timer); wc.removeListener('did-fail-load', onFail); resolve(); };
    const onFail = () => { clearTimeout(timer); wc.removeListener('did-finish-load', onLoad); resolve(); };
    wc.once('did-finish-load', onLoad);
    wc.once('did-fail-load',   onFail);
    _window.loadURL(url);
  });
}

async function exec(code) {
  if (!_window || _window.isDestroyed()) throw new Error('Fenêtre non disponible');
  return Promise.race([
    _window.webContents.executeJavaScript(code),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout exec')), TIMEOUT.execute)),
  ]);
}

// ─── Code JS injecté dans la page ────────────────────────────────────────────

const JS_IS_LOGGED_IN = `(function(){
  try {
    if (window.location.href.indexOf('indexInternal') !== -1) return true;
    var f = document.querySelector('#login_btn,#login_button,.login-form,form[action*="login"]');
    return !f;
  } catch(e) { return false; }
})()`;

const JS_ACCEPT_BANNER = `(function(){
  try {
    var sel = 'button,[role="button"]';
    var btns = document.querySelectorAll(sel);
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
    function findUsernameField(doc){
      doc=doc||document;
      var byId=doc.querySelector('#username,#user,#login,#email');
      if(byId){console.log('[Scraper] Champ username trouvé : #id');return byId;}
      var terms=['Username','Pseudonyme','Nombre de usuario','Användarnamn','Nome utente','Kullanıcı adı','Имя пользователя','Nazwa użytkownika'];
      for(var i=0;i<terms.length;i++){
        var f=doc.querySelector('input[placeholder*="'+terms[i]+'"]');
        if(f){console.log('[Scraper] Champ username trouvé : placeholder "'+terms[i]+'"');return f;}
      }
      var byName=doc.querySelector('input[name*="user"],input[name*="login"],input[name*="email"]');
      if(byName){console.log('[Scraper] Champ username trouvé : name');return byName;}
      var fb=doc.querySelector('form input[type="text"],form input[type="email"]');
      if(fb){console.log('[Scraper] Champ username trouvé : fallback');return fb;}
      return null;
    }
    function findPasswordField(doc){
      doc=doc||document;
      var byId=doc.querySelector('#password,#pass,#pwd');
      if(byId){console.log('[Scraper] Champ password trouvé : #id');return byId;}
      var terms=['Passwort','Password','Mot de passe','Contraseña','Lösenord','Şifre','Пароль','Hasło'];
      for(var i=0;i<terms.length;i++){
        var f=doc.querySelector('input[placeholder*="'+terms[i]+'"]');
        if(f){console.log('[Scraper] Champ password trouvé : placeholder "'+terms[i]+'"');return f;}
      }
      var fb=doc.querySelector('input[type="password"]');
      if(fb){console.log('[Scraper] Champ password trouvé : fallback');return fb;}
      return null;
    }
    try {
      var uf=findUsernameField(document);
      var pf=findPasswordField(document);
      var sb=document.querySelector('#login_btn,#login_button,button[type="submit"],input[type="submit"]');
      if(!uf||!pf)return{success:false,error:'no_form'};
      uf.value=${u};
      pf.value=${p};
      uf.dispatchEvent(new Event('input',{bubbles:true}));
      pf.dispatchEvent(new Event('input',{bubbles:true}));
      if(sb){sb.click();return{success:true,method:'click'};}
      var form=uf.closest('form');
      if(form){form.submit();return{success:true,method:'submit'};}
      return{success:false,error:'no_submit'};
    }catch(e){return{success:false,error:e.message};}
  })()`;
}

function jsExtractRanking(rankKey, valueKey, page) {
  const rk = JSON.stringify(rankKey);
  const vk = JSON.stringify(valueKey);
  const pg = page || 1;
  return `(function(){
    var page = ${pg};
    function getText(el){ return el ? (el.textContent || '').trim() : ''; }
    function parseNum(s){
      if (s == null || s === '') return null;
      var n = parseInt(String(s).replace(/\\s/g,'').replace(/[.,]/g,''), 10);
      return isNaN(n) ? null : n;
    }
    var BLACKLIST = /^(splitter_|spacer_|line_|decoration|hof_|rank_arrow|rank_bg)/i;
    function getGrade(tr) {
      var img = tr.querySelector('img[src*="/ranks/"]');
      if (img && img.src) {
        var m = img.src.match(/\\/ranks\\/([a-zA-Z0-9_-]+)\\.(png|gif|webp|jpg)/i);
        if (m) { var raw = m[1].replace(/-/g,'_'); if (!BLACKLIST.test(raw)) return raw; }
      }
      return null;
    }
    var table = document.querySelector('.hof_ranking_table') ||
                document.querySelector('table[class*="hof"]') ||
                document.querySelector('table[class*="ranking"]');
    if (!table) return { ok: false, players: [], reason: 'no_table' };
    var rows   = table.querySelectorAll('tr');
    var players = [];
    var offset = (page === 2) ? 100 : 0;
    rows.forEach(function(tr) {
      if (tr.querySelector('.hof_spacer_vc')) return;
      var posEl    = tr.querySelector('.rank_position,.rank_position_font,td:first-child');
      var nameEl   = tr.querySelector('.rank_name,.rank_name_font,td.rank_name');
      var pointsEl = tr.querySelector('.rank_points,.rank_points_font,td.rank_points');
      if (!posEl || !nameEl || !pointsEl) return;
      var pos = parseInt(getText(posEl), 10);
      if (!pos || pos < 1 || pos > 200) return;
      var rank = (pos <= 100) ? offset + pos : (offset === 0 ? -1 : pos);
      if (rank < 1) return;
      var name = ((nameEl.getAttribute('title') || '').trim() || getText(nameEl)).slice(0, 100);
      var val  = parseNum(getText(pointsEl)) || 0;
      var userId = nameEl.getAttribute('showuser') || null;
      if (!name) return;
      var p = { name: name, grade: getGrade(tr), userId: userId };
      p[${rk}] = rank;
      p[${vk}] = val;
      players.push(p);
    });
    return { ok: true, players: players };
  })()`;
}

// ─── Fusion des classements (identique à l'extension) ────────────────────────

function mergeRankings(honorP1, honorP2, xpP1, xpP2, topUserP1, topUserP2) {
  const map = new Map();
  const BLACKLIST = /^(splitter_|spacer_|line_|unknown)/i;
  const key = (n) => (n || '').trim().toLowerCase();

  const add = (list, rk, vk, useGrade) => {
    (list || []).forEach(p => {
      const name = (p.name || '').trim();
      if (!name) return;
      const k = key(name);
      if (!map.has(k)) {
        map.set(k, { name, grade: null, userId: null, top_user_rank: null, top_user_value: null, honor_rank: null, honor_value: null, experience_rank: null, experience_value: null });
      }
      const e = map.get(k);
      if (rk && p[rk] != null) e[rk] = p[rk];
      if (vk && p[vk] != null) e[vk] = p[vk];
      if (useGrade && p.grade && !BLACKLIST.test(String(p.grade))) e.grade = p.grade;
      if (p.userId != null) e.userId = p.userId;
    });
  };

  add(honorP1,   'honor_rank',      'honor_value',      false);
  add(honorP2,   'honor_rank',      'honor_value',      false);
  add(xpP1,      'experience_rank', 'experience_value', false);
  add(xpP2,      'experience_rank', 'experience_value', false);
  add(topUserP1, 'top_user_rank',   'top_user_value',   true);
  add(topUserP2, 'top_user_rank',   'top_user_value',   true);

  return Array.from(map.values())
    .map(p => ({
      name:              p.name,
      grade:             p.grade || 'unknown',
      userId:            p.userId || null,
      top_user_rank:     p.top_user_rank,
      top_user_value:    p.top_user_value,
      honor_rank:        p.honor_rank,
      honor_value:       p.honor_value,
      experience_rank:   p.experience_rank,
      experience_value:  p.experience_value,
    }))
    .sort((a, b) => ((a.top_user_rank ?? 999) - (b.top_user_rank ?? 999)))
    .slice(0, 200);
}

// ─── Sauvegarde Supabase (direct, sans serveur HTTP) ─────────────────────────

async function saveRankingToSupabase(serverId, serverName, players) {
  const userId  = global.currentUserId;
  const supabase = makeSupabaseClient();

  const { data: settings, error: fetchErr } = await supabase
    .from('user_settings')
    .select('imported_rankings_json,settings_json,links_json,booster_config_json,current_stats_json,theme,view_mode')
    .eq('user_id', userId)
    .single();

  let rankings = {};
  if (!fetchErr && settings) rankings = settings.imported_rankings_json || {};

  const timestamp = new Date().toISOString();
  rankings[serverId] = { server_id: serverId, server_name: serverName, timestamp, players };

  const row = {
    user_id:                userId,
    imported_rankings_json: rankings,
    updated_at:             timestamp,
    ...(!fetchErr && settings ? {
      settings_json:        settings.settings_json        || {},
      links_json:           settings.links_json           || [],
      booster_config_json:  settings.booster_config_json  || {},
      current_stats_json:   settings.current_stats_json   || {},
      theme:                settings.theme                || 'dark',
      view_mode:            settings.view_mode            || 'detailed',
    } : {}),
  };

  const { error } = await supabase.from('user_settings').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;

  try {
    // Le scraper classement ne doit jamais écrire company — strip défensif
    const playersForShared = players.map(({ company: _c, ...rest }) => rest);
    await supabase.rpc('insert_ranking_snapshot', { p_server_id: serverId, p_players: playersForShared });
  } catch (e) {
    console.warn('[SessionScraper] insert_ranking_snapshot:', e?.message);
  }

  if (_mainWindow && !_mainWindow.isDestroyed() && _mainWindow.webContents) {
    _mainWindow.webContents.send('rankings-updated', { server_id: serverId, playersCount: players.length });
  }
}

// ─── Login par serveur ────────────────────────────────────────────────────────

async function loginForServer(serverId, username, password) {
  const hofBase = `https://${serverId}.darkorbit.com/indexInternal.es?action=internalHallofFame`;

  // 1 — Essai cookies sauvegardés
  const hasCookies = await restoreServerCookies(serverId);
  if (hasCookies) {
    await navigateTo(hofBase);
    await delay(DELAY.pageLoad.min, DELAY.pageLoad.max);
    let loggedIn = false;
    try { loggedIn = await exec(JS_IS_LOGGED_IN); } catch (_e) { /* ignore */ }
    if (loggedIn) {
      console.log(`[SessionScraper] ${serverId} : connecté via cookies`);
      return { ok: true, method: 'cookies' };
    }
    console.log(`[SessionScraper] ${serverId} : cookies expirés, fallback identifiants`);
    await clearServerCookies(serverId);
  }

  // 2 — Login avec identifiants
  await navigateTo(`https://${serverId}.darkorbit.com/`);
  await delay(DELAY.afterLogin.min, DELAY.afterLogin.max);

  try { await exec(JS_ACCEPT_BANNER); } catch (_e) { /* ignore */ }
  await delay(1000, 2000);

  let loginResult = null;
  try {
    loginResult = await exec(jsLogin(username, password));
  } catch (e) {
    loginResult = { success: false, error: e.message };
  }

  if (loginResult && loginResult.success) {
    await delay(DELAY.afterLogin.min, DELAY.afterLogin.max);
    let loggedIn = false;
    try { loggedIn = await exec(JS_IS_LOGGED_IN); } catch (_e) { /* ignore */ }
    if (loggedIn) {
      await saveServerCookies(serverId);
      console.log(`[SessionScraper] ${serverId} : login réussi via identifiants`);
      return { ok: true, method: 'credentials' };
    }
  }

  console.warn(`[SessionScraper] ${serverId} : login échoué`);
  return { ok: false, error: loginResult?.error || 'login_failed' };
}

// ─── Scraping d'un serveur ────────────────────────────────────────────────────

async function scrapeOneServer(serverId, serverName, username, password, playerId, playerPseudo) {
  const loginRes = await loginForServer(serverId, username, password);
  if (!loginRes.ok) return { ok: false, error: loginRes.error };

  const baseUrl = `https://${serverId}.darkorbit.com/indexInternal.es?action=internalHallofFame`;

  // 3 vues × pages : Honneur p1+p2, XP p1+p2, TopUser p1+p2
  const views = [
    { view: 'UserHonor', rankKey: 'honor_rank',      valueKey: 'honor_value',      pages: [1, 2] },
    { view: 'UserEP',    rankKey: 'experience_rank',  valueKey: 'experience_value', pages: [1, 2] },
    { view: 'User',      rankKey: 'top_user_rank',   valueKey: 'top_user_value',  pages: [1, 2] },
  ];

  let honorP1 = [], honorP2 = [], xpP1 = [], xpP2 = [], topUserP1 = [], topUserP2 = [];

  for (const v of views) {
    if (_shouldStop) break;
    for (const page of v.pages) {
      if (_shouldStop) break;
      await navigateTo(`${baseUrl}&view=${v.view}&dps=${page}`);
      await delay(DELAY.betweenPages.min, DELAY.betweenPages.max);
      if (page === 2) {
        console.log('[Scraper] PAGE 2 - exécution dans session-scraper.js');
        const SEL1 = '.hof_ranking_table';
        const SEL2 = 'table[class*="hof"]';
        const SEL3 = 'table[class*="ranking"]';
        const waitDiag = `(function(){
          var html = (document.documentElement.outerHTML||'').substring(0,2000);
          var iframes = document.querySelectorAll('iframe');
          var t1 = document.querySelector('${SEL1.replace(/'/g, "\\'")}');
          var t2 = document.querySelector('${SEL2.replace(/'/g, "\\'")}');
          var t3 = document.querySelector('${SEL3.replace(/'/g, "\\'")}');
          var table = t1 || t2 || t3;
          var rows = table ? table.querySelectorAll('tr') : [];
          return {
            html: html,
            iframeCount: iframes.length,
            selectorTests: [
              {sel:'${SEL1.replace(/'/g, "\\'")}',found:!!t1},
              {sel:'${SEL2.replace(/'/g, "\\'")}',found:!!t2},
              {sel:'${SEL3.replace(/'/g, "\\'")}',found:!!t3}
            ],
            tableFound: !!table,
            rowCount: rows.length
          };
        })()`;
        try {
          const diag = await exec(waitDiag);
          console.log('[Scraper] HTML page 2 complet (2000 chars):', diag?.html || '(vide)');
          console.log('[Scraper] Iframes présentes:', diag?.iframeCount ?? '?');
          (diag?.selectorTests || []).forEach(s => console.log('[Scraper] Test sélecteur:', s.sel, '→', s.found ? 'trouvé' : 'absent'));
          console.log('[Scraper]', diag?.tableFound ? `Tableau trouvé : ${diag.rowCount || 0} lignes` : 'Tableau introuvable');
        } catch (e) { console.warn('[SessionScraper] Diagnostic page 2:', e?.message); }
      }
      try {
        const res = await exec(jsExtractRanking(v.rankKey, v.valueKey, page));
        const list = (res?.ok && Array.isArray(res.players)) ? res.players : [];
        if      (v.view === 'UserHonor')          page === 1 ? (honorP1 = list) : (honorP2 = list);
        else if (v.view === 'UserEP')             page === 1 ? (xpP1 = list) : (xpP2 = list);
        else if (page === 1)                      topUserP1 = list;
        else                                      topUserP2 = list;
      } catch (e) {
        console.warn(`[SessionScraper] ${serverId} ${v.view} p${page}:`, e?.message);
      }
      await delay(DELAY.betweenPages.min, DELAY.betweenPages.max);
    }
  }

  if (honorP1.length || honorP2.length || xpP1.length || xpP2.length || topUserP1.length || topUserP2.length) {
    console.log('[Scraper] Avant fusion — honorP1:', honorP1.slice(0, 3).map(p => ({ n: p.name, r: p.honor_rank })), 'honorP2:', honorP2.slice(0, 3).map(p => ({ n: p.name, r: p.honor_rank })), 'xpP1:', xpP1.slice(0, 3).map(p => ({ n: p.name, r: p.experience_rank })), 'xpP2:', xpP2.slice(0, 3).map(p => ({ n: p.name, r: p.experience_rank })), 'topUserP1:', topUserP1.slice(0, 3).map(p => ({ n: p.name, r: p.top_user_rank })), 'topUserP2:', topUserP2.slice(0, 3).map(p => ({ n: p.name, r: p.top_user_rank })));
  }
  const players = mergeRankings(honorP1, honorP2, xpP1, xpP2, topUserP1, topUserP2);
  const sample = [...new Map(players.slice(0, 3).concat(players.filter(p => (p.top_user_rank ?? 0) >= 100 && (p.top_user_rank ?? 0) <= 150).slice(0, 3)).map(p => [p.name, p])).values()];
  sample.forEach(p => console.log(`[Scraper] Fusion : ${p.name} — honor_rank: ${p.honor_rank ?? '—'}, xp_rank: ${p.experience_rank ?? '—'}, tu_rank: ${p.top_user_rank ?? '—'}`));
  if (playerId && playerPseudo) {
    const pseudo = (playerPseudo || '').trim().toLowerCase();
    for (const p of players) {
      if ((p.name || '').trim().toLowerCase() === pseudo && !p.userId) p.userId = playerId;
    }
  }
  console.log(`[Scraper] Honneur p1: ${honorP1.length}, Honneur p2: ${honorP2.length}, XP p1: ${xpP1.length}, XP p2: ${xpP2.length}, TopUser p1: ${topUserP1.length}, p2: ${topUserP2.length} — Total fusionné unique: ${players.length}`);

  try {
    let serverMappings = {};
    try { serverMappings = require(app.getSrcPath('backend/server-mappings.js')); } catch (_e) { /* ignore */ }
    const displayName = serverName || serverMappings[serverId] || serverId;
    await saveRankingToSupabase(serverId, displayName, players);
    console.log(`[SessionScraper] ${serverId} : ${players.length} joueurs sauvegardés`);
  } catch (e) {
    console.error(`[SessionScraper] ${serverId} saveRanking:`, e?.message);
    return { ok: false, error: e?.message };
  }

  return { ok: true, count: players.length };
}

// ─── Cycle complet ────────────────────────────────────────────────────────────

async function runCycle(accounts) {
  const completed = [];
  let stopped = false;

  for (let i = 0; i < accounts.length; i++) {
    if (_shouldStop) { stopped = true; break; }

    const acc = accounts[i];
    const { server_id, server_name, username, password } = acc;

    updateState({ currentServer: server_id, currentServerIndex: i + 1 });

    try {
      const res = await scrapeOneServer(server_id, server_name, username, password, acc.player_id, acc.player_pseudo);
      if (res.ok) {
        completed.push(server_id);
        updateState({ completed: [...completed] });
      } else {
        _state.errors.push({ server_id, error: res.error });
      }
    } catch (e) {
      console.error(`[SessionScraper] ${server_id}:`, e?.message);
      _state.errors.push({ server_id, error: e?.message });
    }

    if (i < accounts.length - 1 && !_shouldStop) {
      await delay(DELAY.betweenServers.min, DELAY.betweenServers.max);
    }
  }

  return { completed, stopped };
}

// ─── API publique ─────────────────────────────────────────────────────────────

async function startScraping() {
  if (_running) {
    return { ok: false, error: 'Scraping session déjà en cours' };
  }
  if (!global.currentUserId || !global.supabaseAccessToken) {
    return { ok: false, error: 'Utilisateur non authentifié' };
  }

  const DarkOrbitAccounts = require('./darkorbit-accounts');
  let accounts = DarkOrbitAccounts.getScraperAccounts ? DarkOrbitAccounts.getScraperAccounts() : [];
  if (accounts.length === 0) {
    return { ok: false, error: 'Aucun compte DarkOrbit configuré' };
  }
  try {
    const supabase = makeSupabaseClient();
    const { data: doAccounts } = await supabase.rpc('get_user_darkorbit_accounts');
    const doMap = new Map();
    (doAccounts || []).filter(a => a.is_active).forEach(a => {
      const s = (a.player_server || '').trim().toLowerCase();
      if (s) doMap.set(s, { player_id: a.player_id || null, player_pseudo: a.player_pseudo || null });
    });
    accounts = accounts.map(acc => {
      const s = (acc.server_id || '').trim().toLowerCase();
      const doAcc = doMap.get(s);
      return { ...acc, player_id: doAcc?.player_id || null, player_pseudo: doAcc?.player_pseudo || null };
    });
    accounts.filter(a => a.player_id || a.player_pseudo).forEach(a => {
      console.log(`[Scraper] Compte DarkOrbit détecté : ${a.player_pseudo || a.player_id} sur ${a.server_id}`);
    });
  } catch (e) {
    console.warn('[SessionScraper] Enrichissement comptes:', e?.message);
  }

  _running    = true;
  _shouldStop = false;
  _state = {
    running:            true,
    currentServer:      null,
    currentServerIndex: 0,
    totalServers:       accounts.length,
    completed:          [],
    errors:             [],
    startTime:          new Date().toISOString(),
    lastUpdate:         new Date().toISOString(),
  };
  updateState({});

  // Lancement asynchrone — retour immédiat au renderer
  (async () => {
    try {
      await createWindow();
      const { completed, stopped } = await runCycle(accounts);
      console.log(
        `[SessionScraper] Cycle terminé. ${completed.length}/${accounts.length} serveur(s).` +
        (stopped ? ' (arrêté par l\'utilisateur)' : '')
      );
    } catch (e) {
      console.error('[SessionScraper] Erreur cycle:', e?.message);
    } finally {
      destroyWindow();
      _running = false;
      updateState({ running: false, currentServer: null, currentServerIndex: 0 });
    }
  })().catch(e => console.error('[session-scraper] IIFE error:', e));

  return { ok: true };
}

function stopScraping() {
  _shouldStop = true;
  updateState({ running: false });
  return { ok: true };
}

function getState() {
  return { ..._state };
}

function init(mainWindow) {
  _mainWindow = mainWindow;
  loadCookies();
}

function cleanup() {
  stopScraping();
  destroyWindow();
  _mainWindow = null;
}

/**
 * Connexion manuelle (fallback) : ouvre la fenêtre, se connecte aux serveurs avec les identifiants
 * stockés (Comptes DarkOrbit), enregistre les cookies. Utilisable quand les cookies sont expirés.
 * @param {string[]} serverIds - Liste de server_id (ex. ['gbl5', 'gbl2'])
 * @returns {{ ok: boolean, logged?: string[], failed?: Array<{ server_id: string, error: string }>, error?: string }}
 */
async function loginServersOnly(serverIds) {
  if (!Array.isArray(serverIds) || serverIds.length === 0) {
    return { ok: false, error: 'Aucun serveur sélectionné' };
  }
  const DarkOrbitAccounts = require('./darkorbit-accounts');
  const all = DarkOrbitAccounts.getScraperAccounts ? DarkOrbitAccounts.getScraperAccounts() : [];
  const wanted = new Set(serverIds.map((s) => String(s).trim().toLowerCase()));
  const accounts = all.filter((a) => a && a.server_id && wanted.has(String(a.server_id).toLowerCase()));
  if (accounts.length === 0) {
    return { ok: false, error: 'Aucun compte DarkOrbit assigné pour les serveurs sélectionnés. Configurez les comptes et attributions.' };
  }
  try {
    await createWindow();
    const logged = [];
    const failed = [];
    for (const acc of accounts) {
      const res = await loginForServer(acc.server_id, acc.username, acc.password);
      if (res.ok) {
        logged.push(acc.server_id);
      } else {
        failed.push({ server_id: acc.server_id, error: res.error || 'login_failed' });
      }
    }
    return { ok: true, logged, failed };
  } finally {
    destroyWindow();
  }
}

module.exports = { init, startScraping, stopScraping, getState, cleanup, loginServersOnly };
