/**
 * Récolte des stats joueur via une BrowserWindow masquée (login DO + scrape home + rank).
 * Identifiants DO passés en paramètre, jamais stockés.
 */

const { BrowserWindow } = require('electron');

const PARTITION = 'persist:player-stats-scraper';
const HOME_DOM_READY_MS = 4000;
const RANK_PAGE_READY_MS = 3500;
const TIMEOUT = { pageLoad: 30000, execute: 15000, afterLogin: 6000 };

const FIRM_KEYWORDS = ['Firma', 'Gesellschaft', 'company', 'firm', 'Firme', 'Compagnie'];
const FIRM_ALIASES = { mmo: 'MMO', mars: 'MMO', eic: 'EIC', earth: 'EIC', vru: 'VRU', venus: 'VRU' };

function buildKeywordsRegexSrc() {
  return FIRM_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

const JS_EXTRACT_HOME_STATS = (() => {
  const keywordsRegexSrc = buildKeywordsRegexSrc();
  const aliasesJson = JSON.stringify(FIRM_ALIASES);
  return `(function(){
  try {
    var body = (document.body && document.body.innerText) || document.documentElement.innerText || '';
    var hostname = window.location.hostname || '';
    var server = null;
    var hostM = hostname.match(/^([a-z0-9_-]+)\\.darkorbit\\.com$/i);
    if (hostM) server = hostM[1];
    function parseNum(s) {
      if (s == null || s === '') return null;
      var n = parseInt(String(s).replace(/\\s/g,'').replace(/[.,]/g,''), 10);
      return isNaN(n) ? null : n;
    }
    function normalizeCompany(raw) {
      if (!raw) return null;
      var clean = raw.trim().toLowerCase().replace(/\\s+/g, ' ');
      var ALIASES = ${aliasesJson};
      if (ALIASES[clean]) return ALIASES[clean];
      for (var k in ALIASES) { if (clean.indexOf(k) !== -1) return ALIASES[k]; }
      var m = clean.match(/\\b(mmo|eic|vru)\\b/i);
      return m ? m[1].toUpperCase() : null;
    }
    var pseudo = null;
    var sheet = document.querySelector('#userInfoSheet');
    if (sheet) {
      var lines = sheet.querySelectorAll('.userInfoLine');
      for (var i = 0; i < lines.length; i++) {
        var txt = (lines[i].textContent || '').trim();
        if (txt.indexOf('Nom') !== -1) {
          pseudo = txt.replace(/^Nom\\s*[:\\s]*/i, '').trim();
          if (pseudo && pseudo.length >= 2) break;
        }
        if (txt.indexOf('Username') !== -1) {
          pseudo = txt.replace(/^Username\\s*[:\\s]*/i, '').trim();
          if (pseudo && pseudo.length >= 2) break;
        }
      }
    }
    if (!pseudo) {
      var nick = document.querySelector('#nickname');
      if (nick) { var t = (nick.textContent || '').trim(); if (t && t.length >= 2) pseudo = t; }
    }
    if (!pseudo) {
      var sel = document.querySelector('.name_stats, .player_name, #player_name, .hof_entry_name');
      if (sel) { var t = (sel.textContent || '').trim(); if (t && t.length >= 2) pseudo = t; }
    }
    if (!pseudo) {
      var av = document.querySelector('#pilotAvatar');
      if (av && av.getAttribute('alt')) { var t = (av.getAttribute('alt') || '').trim(); if (t && t.length >= 2) pseudo = t; }
    }
    var company = null;
    var logo = document.querySelector('#companyLogo');
    if (logo && logo.className) {
      if (/companyLogoSmall_vru/i.test(logo.className)) company = 'VRU';
      else if (/companyLogoSmall_mmo/i.test(logo.className)) company = 'MMO';
      else if (/companyLogoSmall_eic/i.test(logo.className)) company = 'EIC';
    }
    if (!company) {
      var KW_RX = new RegExp('(?:${keywordsRegexSrc})[\\\\s"\\']*[:\\\\s]+[\\\\s"\\']*([A-Za-z\\\\u00C0-\\\\u024F\\\\u0400-\\\\u04FF\\\\s]{2,40})','i');
      var kwM = KW_RX.exec(body);
      if (kwM && kwM[1]) company = normalizeCompany(kwM[1].trim());
    }
    if (!company) { var m = body.match(/\\b(MMO|EIC|VRU)\\b/i); if (m) company = m[1]; }
    var player_id = null;
    var wrapper = document.querySelector('.header_item_wrapper');
    if (wrapper) { var sp = wrapper.querySelector('span'); if (sp) player_id = (sp.textContent || '').trim(); }
    if (!player_id) {
      var elWithId = document.querySelector('[data-userid],[showuser],[data-player-id]');
      if (elWithId) player_id = elWithId.getAttribute('data-userid') || elWithId.getAttribute('showuser') || elWithId.getAttribute('data-player-id');
    }
    if (!player_id && body.match(/userId|user_id|playerId|player_id/)) {
      var idM = body.match(/(?:userId|user_id|playerId|player_id)[\\s"':=]+([a-zA-Z0-9_-]{5,})/i);
      if (idM) player_id = idM[1];
    }
    var grade = null;
    var rankImg = document.querySelector('#userRankIcon');
    if (rankImg && rankImg.src) { var gm = rankImg.src.match(/\\/ranks\\/([a-zA-Z0-9_-]+)\\./i); if (gm) grade = gm[1].replace(/-/g,'_'); }
    if (!grade && rankImg && rankImg.nextSibling) grade = (rankImg.nextSibling.textContent || '').trim();
    if (!grade) {
      var gradeEl = document.querySelector('td.playerTableBody div[style*="rank_"], img[src*="/ranks/"], [class*="rank_"]');
      if (gradeEl) {
        if (gradeEl.tagName === 'IMG' && gradeEl.src) { var gm = gradeEl.src.match(/\\/ranks\\/([a-zA-Z0-9_-]+)\\./i); if (gm) grade = gm[1].replace(/-/g,'_'); }
        else { var t = (gradeEl.innerText || gradeEl.textContent || '').trim(); if (t) grade = t; }
      }
    }
    var initial_xp = null, initial_honor = null;
    function parseFromEl(el) {
      if (!el) return null;
      var t = (el.textContent || '').trim();
      var n = parseNum(t);
      if (n !== null) return n;
      var digits = t.replace(/[^\\d.,\\s]/g, '').trim();
      return parseNum(digits) || null;
    }
    var expSelectors = ['.header_top_exp span', '.header_top_exp', '#header_top_exp', '[class*="header_top_exp"] span', '[class*="header_top_exp"]'];
    for (var ei = 0; ei < expSelectors.length && initial_xp === null; ei++) {
      var ex = document.querySelector(expSelectors[ei]);
      if (ex) initial_xp = parseFromEl(ex);
    }
    var honSelectors = ['.header_top_hnr span', '.header_top_hnr', '#header_top_hnr', '[class*="header_top_hnr"] span', '[class*="header_top_hnr"]'];
    for (var hi = 0; hi < honSelectors.length && initial_honor === null; hi++) {
      var ho = document.querySelector(honSelectors[hi]);
      if (ho) initial_honor = parseFromEl(ho);
    }
    if (initial_xp === null || initial_honor === null) {
      var xpLabels = /(?:experience|expérience|erfahrung|xp|exp)[\\s:]*([\\d\\s.,]+)/gi;
      var honLabels = /(?:honor|honneur|ehre)[\\s:]*([\\d\\s.,]+)/gi;
      var xpM = xpLabels.exec(body); if (xpM) initial_xp = initial_xp !== null ? initial_xp : parseNum(xpM[1]);
      var honM = honLabels.exec(body); if (honM) initial_honor = initial_honor !== null ? initial_honor : parseNum(honM[1]);
    }
    return { server: server, game_pseudo: pseudo, player_id: player_id, company: company, initial_rank: grade, initial_xp: initial_xp, initial_honor: initial_honor };
  } catch(e) { return { server: null, game_pseudo: null, player_id: null, company: null, initial_rank: null, initial_xp: null, initial_honor: null, _error: e.message }; }
})()`;
})();

const JS_EXTRACT_RANK_PAGE = `(function(){
  try {
    function getText(el){ return el ? (el.textContent || '').trim().replace(/\\s+/g, ' ') : ''; }
    function parseNum(s){ if (s == null || s === '') return null; var n = parseInt(String(s).replace(/\\s/g,'').replace(/[.,]/g,''), 10); return isNaN(n) ? null : n; }
    function rankFromImgSrc(src) {
      if (!src) return null;
      var m = String(src).match(/\\/ranks\\/(rank_\\d+|[a-zA-Z0-9_-]+)\\./i);
      return m ? m[1].replace(/-/g,'_') : null;
    }
    function maxNumInString(txt) {
      var best = null;
      var rx = /\\d[\\d\\s.,]*/g;
      var m;
      while ((m = rx.exec(txt)) !== null) {
        var n = parseNum(m[0]);
        if (n !== null && n >= 100) { if (best === null || n > best) best = n; }
      }
      return best;
    }
    var BELOW_RX = /au-dessous|en dessous|juste au-dessous|just below|rank below|grade below|lower rank|darunter|rang darunter|rang en dessous|inferior|inferior rank|debajo|rango inferior|ниже|звание ниже|derecesinin altında|rütbesinin altında|ünvanının altında/i;
    var ENV_RX = /environ|approximately|approx\\.\\s*|~|ungefähr|ca\\.\\s*|circa|aprox|\\bca\\b|около|примерно|yaklaşık|yaklasik/i;

    var initial_rank_points = null, next_rank_points = null;
    var below_rank_raw = null, below_rank_points = null;

    var sumDiv = document.querySelector('#hof_daily_sum');
    if (sumDiv) {
      var rows = sumDiv.querySelectorAll('tr');
      for (var r = 0; r < rows.length; r++) {
        var rowText = getText(rows[r]);
        var isTotal = rowText.indexOf('Total ranking points') !== -1 || (rowText.indexOf('ranking') !== -1 && rowText.indexOf('points') !== -1);
        if (isTotal || (rows.length === 1 && rowText.length > 0)) {
          var amt = rows[r].querySelector('td.hof_units_amount');
          if (amt) { initial_rank_points = parseNum(getText(amt)); if (initial_rank_points !== null) break; }
        }
      }
    }
    var wrapper = document.querySelector('#hof_daily_wrapper') || document.querySelector('#hof_daily_formulaUnits') || document.querySelector('.hof_inner_content');
    var pNodes = wrapper ? wrapper.querySelectorAll('p') : document.querySelectorAll('p');

    var rankParagraphs = [];
    for (var pi = 0; pi < pNodes.length; pi++) {
      var p = pNodes[pi];
      var img = p.querySelector('img[src*="/ranks/"], img[src*="do_img/global/ranks/"]');
      if (!img) continue;
      rankParagraphs.push({ text: getText(p), img: img });
    }

    var belowIdx = -1;
    for (var ri = 0; ri < rankParagraphs.length; ri++) {
      if (!BELOW_RX.test(rankParagraphs[ri].text)) continue;
      belowIdx = ri;
      var t = rankParagraphs[ri].text;
      var em = ENV_RX.exec(t);
      var bp = null;
      if (em) {
        var sub = t.slice(em.index + em[0].length);
        var nm = sub.match(/([\\d\\s.,]{3,})/);
        if (nm) bp = parseNum(nm[1]);
      }
      if (bp === null) bp = maxNumInString(t);
      if (bp !== null) {
        below_rank_points = bp;
        below_rank_raw = rankFromImgSrc(rankParagraphs[ri].img.getAttribute('src') || rankParagraphs[ri].img.src || '');
      }
      break;
    }

    for (var ri2 = 0; ri2 < rankParagraphs.length; ri2++) {
      if (ri2 === belowIdx) continue;
      var best = maxNumInString(rankParagraphs[ri2].text);
      if (best !== null && best >= 1000) {
        next_rank_points = best;
        break;
      }
    }

    if (next_rank_points === null) {
      for (var pi2 = 0; pi2 < pNodes.length; pi2++) {
        var p2 = pNodes[pi2];
        if (!p2.querySelector('img[src*="/ranks/rank_"]')) continue;
        var pText2 = getText(p2);
        if (BELOW_RX.test(pText2)) continue;
        var numRx = /[\\d\\s.,]+/g;
        var match2;
        var best2 = null;
        while ((match2 = numRx.exec(pText2)) !== null) {
          var n2 = parseNum(match2[0]);
          if (n2 !== null && n2 >= 1000) { best2 = best2 === null ? n2 : Math.max(best2, n2); }
        }
        if (best2 !== null) { next_rank_points = best2; break; }
      }
    }

    return {
      initial_rank_points: initial_rank_points,
      next_rank_points: next_rank_points,
      below_rank_raw: below_rank_raw,
      below_rank_points: below_rank_points
    };
  } catch(e) {
    return { initial_rank_points: null, next_rank_points: null, below_rank_raw: null, below_rank_points: null, _error: e.message };
  }
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

let _win = null;

function createWindow(visible) {
  _win = new BrowserWindow({
    show: !!visible,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: PARTITION,
    },
  });
  _win.on('closed', () => { _win = null; });
  return _win;
}

function destroyWindow() {
  if (_win && !_win.isDestroyed()) _win.destroy();
  _win = null;
}

function navigateTo(url) {
  return new Promise((resolve) => {
    if (!_win || _win.isDestroyed()) { resolve(); return; }
    const wc = _win.webContents;
    const timer = setTimeout(() => {
      wc.removeListener('did-stop-loading', onStop);
      wc.removeListener('did-fail-load', onFail);
      resolve();
    }, TIMEOUT.pageLoad);
    const onStop = () => { clearTimeout(timer); wc.removeListener('did-fail-load', onFail); resolve(); };
    const onFail = () => { clearTimeout(timer); wc.removeListener('did-stop-loading', onStop); resolve(); };
    wc.once('did-stop-loading', onStop);
    wc.once('did-fail-load', onFail);
    _win.loadURL(url);
  });
}

function exec(code) {
  if (!_win || _win.isDestroyed()) return Promise.reject(new Error('Fenêtre non disponible'));
  return Promise.race([
    _win.webContents.executeJavaScript(code),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), TIMEOUT.execute)),
  ]);
}

const AUTH_ERROR_MSG = 'Authentification échouée, vérifiez vos identifiants DarkOrbit.';
const TOTAL_TIMEOUT_MS = 90000;

async function _collectPlayerStatsWithLogin(opts) {
  const serverId = (opts && opts.serverId) ? String(opts.serverId).trim() : 'gbl5';
  const username = opts && opts.username ? String(opts.username).trim() : '';
  const password = opts && opts.password != null ? String(opts.password) : '';
  const onProgress = opts && typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  if (!username || !password) {
    return { ok: false, error: AUTH_ERROR_MSG };
  }

  try {
    onProgress({ step: 'init', percent: 5, label: 'Démarrage…' });
    console.log('[PlayerStatsScraper] Démarrage', serverId);
    createWindow();
    const baseUrl = `https://${serverId}.darkorbit.com`;
    onProgress({ step: 'page', percent: 10, label: 'Chargement de la page…' });
    console.log('[PlayerStatsScraper] Chargement', baseUrl);
    await navigateTo(baseUrl);
    await new Promise((r) => setTimeout(r, 2000));
    onProgress({ step: 'cookies', percent: 15, label: 'Bannière cookies…' });
    await exec(JS_ACCEPT_BANNER);
    await new Promise((r) => setTimeout(r, 800));
    onProgress({ step: 'login', percent: 25, label: 'Connexion…' });
    console.log('[PlayerStatsScraper] Soumission login');
    const loginResult = await exec(jsLogin(username, password));
    if (!loginResult || !loginResult.success) {
      console.warn('[PlayerStatsScraper] Login form failed', loginResult);
      destroyWindow();
      return { ok: false, error: AUTH_ERROR_MSG };
    }
    await new Promise((r) => setTimeout(r, TIMEOUT.afterLogin));
    const href = await exec('window.location.href');
    if (!href || (href.indexOf('indexInternal') === -1 && href.indexOf('internalStart') === -1)) {
      console.warn('[PlayerStatsScraper] Pas connecté après login, href=', href ? href.slice(0, 80) : '');
      destroyWindow();
      return { ok: false, error: AUTH_ERROR_MSG };
    }
    onProgress({ step: 'connected', percent: 35, label: 'Connecté…' });
    onProgress({ step: 'home', percent: 50, label: 'Page d\'accueil…' });
    console.log('[PlayerStatsScraper] Connecté, page home');
    const homeUrl = `https://${serverId}.darkorbit.com/indexInternal.es?action=internalStart&prc=100`;
    await navigateTo(homeUrl);
    await new Promise((r) => setTimeout(r, HOME_DOM_READY_MS));
    onProgress({ step: 'home_extract', percent: 55, label: 'Extraction stats…' });
    const home = await exec(JS_EXTRACT_HOME_STATS);
    onProgress({ step: 'rank', percent: 65, label: 'Page classement…' });
    console.log('[PlayerStatsScraper] Home extrait');
    const rankUrl = `https://${serverId}.darkorbit.com/indexInternal.es?action=internalHallofFame&view=dailyRank`;
    await navigateTo(rankUrl);
    await new Promise((r) => setTimeout(r, RANK_PAGE_READY_MS));
    onProgress({ step: 'rank_extract', percent: 85, label: 'Extraction classement…' });
    const rank = await exec(JS_EXTRACT_RANK_PAGE);
    onProgress({ step: 'done', percent: 100, label: 'Terminé' });
    console.log('[PlayerStatsScraper] Rank extrait, fin');

    const data = {
      server: (home && home.server) || serverId,
      game_pseudo: home && home.game_pseudo,
      player_id: home && home.player_id,
      player_pseudo: home && home.game_pseudo,
      player_server: (home && home.server) || serverId,
      company: home && home.company,
      initial_rank: home && home.initial_rank,
      initial_xp: home && home.initial_xp,
      initial_honor: home && home.initial_honor,
      initial_rank_points: rank && rank.initial_rank_points,
      next_rank_points: rank && rank.next_rank_points,
      below_rank_raw: rank && rank.below_rank_raw,
      below_rank_points: rank && rank.below_rank_points,
    };
    destroyWindow();
    return { ok: true, data };
  } catch (e) {
    console.warn('[PlayerStatsScraper] Erreur', e && e.message ? e.message : e);
    destroyWindow();
    return { ok: false, error: (e && e.message) ? e.message : AUTH_ERROR_MSG };
  }
}

function collectPlayerStatsWithLogin(opts) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (_win && !_win.isDestroyed()) {
        console.warn('[PlayerStatsScraper] Timeout global ' + (TOTAL_TIMEOUT_MS / 1000) + 's');
        destroyWindow();
      }
      reject(new Error('Récolte annulée (timeout ' + (TOTAL_TIMEOUT_MS / 1000) + ' s)'));
    }, TOTAL_TIMEOUT_MS);
  });
  const mainPromise = _collectPlayerStatsWithLogin(opts).then(result => {
    clearTimeout(timeoutId);
    return result;
  });
  return Promise.race([mainPromise, timeoutPromise]);
}

const MANUAL_WAIT_MS = 30000;
const MANUAL_POLL_MS = 60000;
const MANUAL_POLL_INTERVAL_MS = 2000;

const JS_CHECK_LOGGED_IN = `(function(){
  try {
    var href = window.location.href || '';
    if (href.indexOf('indexInternal') !== -1 || href.indexOf('internalStart') !== -1) return true;
    var loginForm = document.querySelector('#loginForm');
    if (!loginForm && document.querySelector('.main-layout')) return true;
    if (!document.querySelector('input[name="password"]')) return true;
    return false;
  } catch(e) { return false; }
})()`;

async function _collectPlayerStatsManual(opts) {
  const serverId = (opts && opts.serverId) ? String(opts.serverId).trim() : 'gbl5';
  try {
    console.log('[PlayerStatsScraper] Mode manuel', serverId);
    createWindow(true);
    const baseUrl = `https://${serverId}.darkorbit.com`;
    await navigateTo(baseUrl);
    await new Promise((r) => setTimeout(r, 2000));
    await exec(JS_ACCEPT_BANNER);
    await new Promise((r) => setTimeout(r, 800));
    console.log('[PlayerStatsScraper] Attente 30s pour connexion manuelle');
    await new Promise((r) => setTimeout(r, MANUAL_WAIT_MS));
    let connected = false;
    const pollDeadline = Date.now() + MANUAL_POLL_MS;
    while (!connected && Date.now() < pollDeadline) {
      if (!_win || _win.isDestroyed()) break;
      const href = await exec('window.location.href');
      if (href && (href.indexOf('indexInternal') !== -1 || href.indexOf('internalStart') !== -1)) {
        connected = true;
        break;
      }
      const pageLoggedIn = await exec(JS_CHECK_LOGGED_IN);
      if (pageLoggedIn) {
        connected = true;
        break;
      }
      await new Promise((r) => setTimeout(r, MANUAL_POLL_INTERVAL_MS));
    }
    if (!connected) {
      return { ok: false, error: 'Non connecté après délai' };
    }
    console.log('[PlayerStatsScraper] Connecté, extraction stats');
    const homeUrl = `https://${serverId}.darkorbit.com/indexInternal.es?action=internalStart&prc=100`;
    await navigateTo(homeUrl);
    await new Promise((r) => setTimeout(r, HOME_DOM_READY_MS));
    const home = await exec(JS_EXTRACT_HOME_STATS);
    const rankUrl = `https://${serverId}.darkorbit.com/indexInternal.es?action=internalHallofFame&view=dailyRank`;
    await navigateTo(rankUrl);
    await new Promise((r) => setTimeout(r, RANK_PAGE_READY_MS));
    const rank = await exec(JS_EXTRACT_RANK_PAGE);
    const data = {
      server: (home && home.server) || serverId,
      game_pseudo: home && home.game_pseudo,
      player_id: home && home.player_id,
      player_pseudo: home && home.game_pseudo,
      player_server: (home && home.server) || serverId,
      company: home && home.company,
      initial_rank: home && home.initial_rank,
      initial_xp: home && home.initial_xp,
      initial_honor: home && home.initial_honor,
      initial_rank_points: rank && rank.initial_rank_points,
      next_rank_points: rank && rank.next_rank_points,
      below_rank_raw: rank && rank.below_rank_raw,
      below_rank_points: rank && rank.below_rank_points,
    };
    console.log('[PlayerStatsScraper] player_id extrait:', data.player_id);
    return { ok: true, data };
  } catch (e) {
    console.warn('[PlayerStatsScraper] Erreur manuel', e && e.message ? e.message : e);
    return { ok: false, error: (e && e.message) ? e.message : AUTH_ERROR_MSG };
  } finally {
    destroyWindow();
  }
}

function collectPlayerStatsManual(opts) {
  const totalTimeout = MANUAL_WAIT_MS + MANUAL_POLL_MS + 60000;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => {
      if (_win && !_win.isDestroyed()) {
        console.warn('[PlayerStatsScraper] Timeout manuel');
        destroyWindow();
      }
      reject(new Error('Récolte annulée (timeout)'));
    }, totalTimeout)
  );
  return Promise.race([_collectPlayerStatsManual(opts), timeoutPromise]);
}

module.exports = {
  collectPlayerStatsWithLogin,
  collectPlayerStatsManual,
  AUTH_ERROR_MSG,
};
