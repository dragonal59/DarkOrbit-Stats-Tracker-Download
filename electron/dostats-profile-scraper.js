const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

const DOSTATS_PLAYER_URL = 'https://dostats.info/player/';

// Mapping DarkOrbit grades (toutes langues) -> rank key (basic_space_pilot, chief_general, etc.)
const DARKORBIT_GRADES = (() => {
  try {
    // Chemin relatif depuis electron/ vers src/data
    // En dev: __dirname = .../electron, en prod: asar garde la même structure logique.
    // On ne met pas ce require en haut niveau direct pour éviter de casser si le fichier manque.
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require('../src/data/darkorbit-grades-mapping.json');
  } catch (_) {
    return null;
  }
})();

function normalizeLabel(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const PER_LANG_LABEL_TO_RANK = (() => {
  const out = {};
  if (!DARKORBIT_GRADES || !Array.isArray(DARKORBIT_GRADES.grades)) return out;
  ['en', 'fr', 'es', 'ru', 'tr', 'pl'].forEach((lang) => {
    out[lang] = {};
  });
  DARKORBIT_GRADES.grades.forEach((g) => {
    if (!g || !g.rank) return;
    ['en', 'fr', 'es', 'ru', 'tr', 'pl'].forEach((lang) => {
      const label = g[lang];
      if (!label) return;
      const k = normalizeLabel(label);
      if (k && !out[lang][k]) {
        out[lang][k] = g.rank;
      }
    });
  });
  return out;
})();

const SERVER_TO_LANG = (() => {
  const map = {};
  if (!DARKORBIT_GRADES || !DARKORBIT_GRADES.language_detection) return map;
  const det = DARKORBIT_GRADES.language_detection;
  Object.keys(det).forEach((server) => {
    let lang = det[server];
    if (lang === 'dynamic') lang = 'en';
    map[server] = lang;
  });
  return map;
})();

function mapGradeLabelToRankKey(label, serverCode) {
  if (!label) return null;
  const normalized = normalizeLabel(label);
  if (!normalized) return null;
  const server = (serverCode || '').toString().trim().toLowerCase();
  const lang = SERVER_TO_LANG[server] || 'en';
  const perLang = PER_LANG_LABEL_TO_RANK[lang] || {};
  if (perLang[normalized]) return perLang[normalized];
  // fallbacks: anglais puis toutes langues confondues
  if (PER_LANG_LABEL_TO_RANK.en && PER_LANG_LABEL_TO_RANK.en[normalized]) {
    return PER_LANG_LABEL_TO_RANK.en[normalized];
  }
  for (const l of Object.keys(PER_LANG_LABEL_TO_RANK)) {
    if (PER_LANG_LABEL_TO_RANK[l][normalized]) return PER_LANG_LABEL_TO_RANK[l][normalized];
  }
  return null;
}

function getProfilesBaseDir() {
  const dir = path.join(app.getPath('userData'), 'rankings_output', 'player_profiles');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildServerProfilesPath(serverCode) {
  const base = getProfilesBaseDir();
  const safeServer = (serverCode || 'unknown').toString().trim().toLowerCase() || 'unknown';
  return path.join(base, `${safeServer}.json`);
}

function getNowIso() {
  return new Date().toISOString();
}

function getLatestProfile(serverCode, userId) {
  const base = getProfilesBaseDir();
  const safeServer = (serverCode || 'unknown').toString().trim().toLowerCase() || 'unknown';
  const filePath = path.join(base, `${safeServer}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    if (!entries.length) return null;
    const uid = (userId || '').toString().trim();
    const found = entries.find((e) => {
      const eu = (e && (e.user_id != null ? String(e.user_id) : '')).toString().trim();
      return uid && eu === uid;
    });
    return found || null;
  } catch (_) {
    return null;
  }
}

const {
  getTimeoutMs,
  getRetries,
  getProfilesConcurrency,
  getUserAgentString,
  applyScraperSessionProxyPolicy,
  applyResourceBlockingPolicy,
  captureScreenshotOnError,
} = require('./scraper-app-settings');

/**
 * Harmonise les valeurs Galaxy Gates:
 * - si une gate est indisponible en "current" (null),
 *   alors les zéros des périodes dérivées sont normalisés en null
 *   pour éviter les ambiguïtés 0 vs N/A.
 */
function normalizeGalaxyGatesConsistency(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const current = entry?.stats?.current?.galaxy_gates;
  if (!current || typeof current !== 'object') return entry;

  const periodKeys = ['last_24h', 'last_7d', 'last_30d', 'last_100d', 'last_365d'];
  const gateKeys = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda', 'kronos', 'hades', 'other'];

  for (const gate of gateKeys) {
    if (current[gate] !== null && current[gate] !== undefined) continue;
    for (const period of periodKeys) {
      const g = entry?.stats?.[period]?.galaxy_gates;
      if (!g || typeof g !== 'object') continue;
      if (g[gate] === 0) g[gate] = null;
    }
  }

  return entry;
}

function writeJsonFile(targetPath, payload) {
  const tmp = `${targetPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, targetPath);
}

/**
 * Copie les métriques HoF (ligne « Current ») à la racine de l’entrée pour alignement avec
 * player_profiles Supabase / imports classement (top_user, honor, experience, npc_kills, ship_kills).
 */
function attachFlatHallOfFameStats(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const cur = entry.stats && entry.stats.current && typeof entry.stats.current === 'object'
    ? entry.stats.current
    : null;
  if (!cur) return { ...entry };
  const out = { ...entry };
  if (out.top_user == null && cur.top_user != null) out.top_user = cur.top_user;
  if (out.experience == null && cur.experience != null) out.experience = cur.experience;
  if (out.honor == null && cur.honor != null) out.honor = cur.honor;
  if (out.npc_kills == null && cur.alien_kills != null) out.npc_kills = cur.alien_kills;
  if (out.ship_kills == null && cur.ship_kills != null) out.ship_kills = cur.ship_kills;
  return out;
}

async function loadPlayerWindow(url) {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.webContents.setUserAgent(getUserAgentString());
  await applyScraperSessionProxyPolicy(win.webContents.session);
  applyResourceBlockingPolicy(win.webContents.session);

  const ok = await new Promise((resolve) => {
    const wc = win.webContents;
    let settled = false;
    let timeout = null;
    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      wc.removeListener('did-finish-load', onFinish);
      wc.removeListener('did-fail-load', onFail);
    };
    const settle = (okValue) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(okValue);
    };
    const onFinish = () => settle(true);
    const onFail = () => settle(false);
    timeout = setTimeout(() => settle(false), getTimeoutMs());
    wc.once('did-finish-load', onFinish);
    wc.once('did-fail-load', onFail);
    win.loadURL(url).catch(() => settle(false));
  });

  return { win, ok };
}

async function waitForPlayerProfileReady(win, maxWaitMs = 25000) {
  // Attendre que le contenu client-side (HoF / Galaxy Gates) soit rendu
  await new Promise((r) => setTimeout(r, 1000));
  const pollInterval = 400;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const ready = await win.webContents.executeJavaScript(`
        (function(){
          var header = document.querySelector('h1, h2, .player-name, .page-title');
          var tables = document.querySelectorAll('table');
          if (!header) return false;
          if (tables && tables.length >= 1) return true;
          return false;
        })();
      `);
      if (ready) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return false;
}

/**
 * Attend spécifiquement que le tableau "Galaxy Gates" soit rendu
 * après le clic sur l'onglet correspondant.
 */
async function waitForGalaxyGatesReady(win, maxWaitMs = 25000) {
  // Petit délai initial pour laisser React / le client rendre l'onglet
  await new Promise((r) => setTimeout(r, 500));
  const pollInterval = 500;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const ready = await win.webContents.executeJavaScript(`
        (function(){
          function text(el){
            var s = el ? (el.textContent || '') : '';
            // Normalise les espaces non standards (NBSP, narrow NBSP, etc.)
            s = s.replace(/[\\u00A0\\u202F]/g, ' ').trim();
            s = s.replace(/\\s+/g, ' ');
            return s;
          }
          function gateNorm(s){
            var t = text({ textContent: s });
            t = (t || '').toLowerCase();
            t = t.replace(/\\s*Gates?$/i, '');
            t = t.replace(/[^a-z]/g, '');
            return t;
          }
          var gateNames = {
            'alpha': true,
            'beta': true,
            'gamma': true,
            'delta': true,
            'epsilon': true,
            'zeta': true,
            'kappa': true,
            'lambda': true,
            'kronos': true,
            'hades': true,
            'kuiper': true
          };

          // Rendre l'attente déterministe : on ne regarde QUE le tabpanel Galaxy Gates.
          var panel =
            document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"][data-state="active"]:not([hidden])') ||
            document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"]:not([hidden])') ||
            document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"][hidden]'); // fallback

          if (!panel) return false;

          // Si le panel est hidden, on ne peut pas avoir le table de manière fiable.
          if (panel.hasAttribute('hidden')) return false;

          var tables = panel.querySelectorAll('table');
          if (!tables || tables.length === 0) return false;

          // Heuristique: la bonne table doit contenir "Galaxy Gates" en en-tête + au moins 2 colonnes de portes.
          for (var ti = 0; ti < tables.length; ti++) {
            var t = tables[ti];
            var ths = t.querySelectorAll('thead tr th');
            if (!ths || ths.length === 0) continue;
            var headerTexts = Array.from(ths).map(function(c){ return text(c); });
            var hasGalaxyGatesLabel = headerTexts.some(function(h){
              var n = (h || '').toLowerCase();
              n = n.replace(/\\s+/g,' ').trim();
              return n === 'galaxy gates' || n === 'galaxy gate';
            });
            if (!hasGalaxyGatesLabel) continue;

            var hits = 0;
            for (var i = 0; i < headerTexts.length; i++) {
              var gateKey = gateNorm(headerTexts[i]);
              if (gateNames[gateKey]) hits++;
            }
            if (hits >= 2) return true;
          }

          return false;
        })();
      `);
      if (ready) return true;
    } catch (_) {}

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return false;
}

/**
 * Active l'onglet « Main Stats » (Hall of Fame, Time Played).
 * Nécessaire avant l’extraction : si « Galaxy Gates » est actif, le panneau principal est masqué
 * et les tableaux HoF ne sont plus dans le DOM (stats toutes null).
 */
async function activateMainStatsTab(win) {
  try {
    const res = await win.webContents.executeJavaScript(`
      (function(){
        function text(el){
          var s = el ? (el.textContent || '') : '';
          s = s.replace(/[\\u00A0\\u202F]/g, ' ').trim();
          s = s.replace(/\\s+/g, ' ');
          return s;
        }
        function fireClick(el){
          if (!el) return false;
          try { el.focus && el.focus(); } catch(e) {}
          try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true })); } catch(e) {}
          try { el.dispatchEvent(new MouseEvent('mouseup',   { bubbles:true, cancelable:true })); } catch(e) {}
          try { el.dispatchEvent(new MouseEvent('click',     { bubbles:true, cancelable:true })); } catch(e) {}
          try { if (typeof el.click === 'function') el.click(); } catch(e) {}
          return true;
        }
        function isMainPanelActive(){
          var panel = document.querySelector('div[role="tabpanel"][id*="content-main-stats"]');
          if (!panel) return false;
          if (panel.hasAttribute('hidden')) return false;
          var state = (panel.getAttribute('data-state') || '').toLowerCase();
          return state === 'active';
        }
        try{
          var btn =
            document.querySelector('button[role="tab"][aria-controls*="content-main-stats"]') ||
            document.querySelector('button[role="tab"][id*="trigger-main-stats"]') ||
            document.querySelector('button[role="tab"][aria-controls*="main-stats"]');
          if (btn) {
            fireClick(btn);
            if (isMainPanelActive()) return true;
          }
        } catch(e) {}
        try{
          var candidates = Array.from(document.querySelectorAll('button, a, div, span'))
            .filter(function(el){
              var t = text(el);
              return t === 'Main Stats' || t === 'Main statistics' || t === 'Statistics';
            });
          if (candidates.length > 0) {
            fireClick(candidates[0]);
            if (isMainPanelActive()) return true;
          }
        } catch(e) {}
        return isMainPanelActive();
      })();
    `);
    return !!res;
  } catch (_) {
    return false;
  }
}

/**
 * Attend que le tableau Hall of Fame soit visible dans le panneau Main Stats.
 */
async function waitForMainStatsHoFReady(win, maxWaitMs = 20000) {
  await new Promise((r) => setTimeout(r, 400));
  const pollInterval = 400;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const ready = await win.webContents.executeJavaScript(`
        (function(){
          function text(el){
            var s = el ? (el.textContent || '') : '';
            s = s.replace(/[\\u00A0\\u202F]/g, ' ').trim();
            s = s.replace(/\\s+/g, ' ');
            return s;
          }
          var panel =
            document.querySelector('div[role="tabpanel"][id*="content-main-stats"][data-state="active"]:not([hidden])') ||
            document.querySelector('div[role="tabpanel"][id*="content-main-stats"]:not([hidden])') ||
            null;
          if (!panel || panel.hasAttribute('hidden')) return false;
          var tables = panel.querySelectorAll('table');
          for (var ti = 0; ti < tables.length; ti++) {
            var rows = tables[ti].querySelectorAll('tr');
            if (rows.length < 2) continue;
            var headerCells = rows[0].querySelectorAll('th, td');
            var headerTexts = Array.from(headerCells).map(function(c){ return text(c); });
            var isHof = headerTexts.some(function(h){
              return h === 'Topuser' || h === 'Top User' || h === 'Experience' || h === 'Honor';
            });
            if (isHof) return true;
          }
          return false;
        })();
      `);
      if (ready) return true;
    } catch (_) {}

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return false;
}

async function activateGalaxyGatesTab(win) {
  try {
    const res = await win.webContents.executeJavaScript(`
      (function(){
        function text(el){
          var s = el ? (el.textContent || '') : '';
          s = s.replace(/[\\u00A0\\u202F]/g, ' ').trim();
          s = s.replace(/\\s+/g, ' ');
          return s;
        }
        function fireClick(el){
          if (!el) return false;
          try { el.focus && el.focus(); } catch(e) {}
          try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true })); } catch(e) {}
          try { el.dispatchEvent(new MouseEvent('mouseup',   { bubbles:true, cancelable:true })); } catch(e) {}
          try { el.dispatchEvent(new MouseEvent('click',     { bubbles:true, cancelable:true })); } catch(e) {}
          try { if (typeof el.click === 'function') el.click(); } catch(e) {}
          return true;
        }
        function isGalaxyPanelActive(){
          var panel = document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"]');
          if (!panel) return false;
          if (panel.hasAttribute('hidden')) return false;
          var state = panel.getAttribute('data-state') || '';
          return state.toLowerCase() === 'active';
        }
        try{
          var btn =
            document.querySelector('button[role="tab"][aria-controls*="content-galaxy-gates"]') ||
            document.querySelector('button[role="tab"][id*="trigger-galaxy-gates"]') ||
            document.querySelector('button[role="tab"][aria-controls*="galaxy-gates"]');
          if (btn) {
            fireClick(btn);
            if (isGalaxyPanelActive()) return true;
          }
        } catch(e) {}
        try{
          var candidates = Array.from(document.querySelectorAll('button, a, div, span'))
            .filter(function(el){
              var t = text(el);
              return t === 'Galaxy Gates' || t === 'Galaxy Gate' || t === 'Gates';
            });
          if (candidates.length > 0) {
            fireClick(candidates[0]);
            if (isGalaxyPanelActive()) return true;
          }
        } catch(e) {}
        return isGalaxyPanelActive();
      })();
    `);
    return !!res;
  } catch (_) {
    return false;
  }
}

async function extractPlayerProfile(win, meta, options) {
  const skipGalaxy = !!(options && options.skipGalaxy);
  const js = `(function(){
    function text(el){
      var s = el ? (el.textContent || '') : '';
      // Normalise les espaces non standards (NBSP, narrow NBSP, etc.)
      s = s.replace(/[\\u00A0\\u202F]/g, ' ').trim();
      s = s.replace(/\\s+/g, ' ');
      return s;
    }
    function gateNorm(s){
      var t = (s || '').toLowerCase();
      t = t.replace(/\\s*Gates?$/i, '');
      t = t.replace(/[^a-z]/g, '');
      return t;
    }
    function toInt(str){
      if (!str) return null;
      var cleaned = (str + '').replace(/[^0-9]/g,'');
      if (!cleaned) return null;
      try { return parseInt(cleaned, 10); } catch(e){ return null; }
    }
    function findLabelValue(label){
      var nodes = Array.from(document.querySelectorAll('div,p,span,li,td'));
      for (var i=0;i<nodes.length;i++){
        var t = text(nodes[i]);
        if (!t) continue;
        var idx = t.indexOf(label + ':');
        if (idx === -1) continue;
        return t.substring(idx + label.length + 1).trim();
      }
      return null;
    }
    // Cartes \"Rank / Estimated RP / Total Hours\" : label dans un div, valeur dans le sibling suivant
    function findCardValue(label){
      var cards = Array.from(document.querySelectorAll('div'));
      for (var i=0;i<cards.length;i++){
        if (text(cards[i]) === label) {
          var next = cards[i].nextElementSibling;
          if (next) {
            var v = text(next);
            if (v) return v;
          }
        }
      }
      return null;
    }
    try {
      var header = document.querySelector('h1, h2, .player-name, .page-title');
      var title = text(header);
      var nameMatch = title || '';
      // DOSTATS affiche \"<pseudo>'s Stats\" dans le header : on supprime ce suffixe.
      var mName = nameMatch.match(/^(.*?)(?:['’]s\\s+Stats)?$/i);
      var name = mName && mName[1] ? mName[1].trim() : (nameMatch || null);
      // Pages d'erreur / recherche ratée : ne pas garder \"Search Failed\" comme pseudo
      if (name && /search\\s+failed/i.test(name)) name = null;
      var level = null;
      var mLevel = nameMatch.match(/\\((\\d+)lvl\\)/i);
      if (mLevel) level = parseInt(mLevel[1], 10);

      var company = null;
      var companyGuess = (title.match(/\\b(MMO|EIC|VRU)\\b/i) || [])[1];
      if (companyGuess) company = companyGuess.toUpperCase();
      // Souvent le h1 ne contient que le pseudo : la firme est dans le bloc sous le titre (texte collé « …Steam)MMOLevel ») ou en image.
      if (!company && document.body) {
        var bt = document.body.innerText || '';
        var mCo = bt.match(/\\b(MMO|EIC|VRU)\\b/);
        if (mCo) company = mCo[1].toUpperCase();
      }
      if (!company) {
        var cimgs = document.querySelectorAll('img[src*="gfx"], img[alt*="MMO"], img[alt*="mmo"], img[alt*="EIC"], img[alt*="eic"], img[alt*="VRU"], img[alt*="vru"]');
        for (var ci = 0; ci < cimgs.length; ci++) {
          var ialt = (cimgs[ci].getAttribute('alt') || '').trim();
          if (/^(MMO|EIC|VRU)$/i.test(ialt)) { company = ialt.toUpperCase(); break; }
          var isrc = (cimgs[ci].getAttribute('src') || '').toLowerCase();
          if (isrc.indexOf('avatar') !== -1 || isrc.indexOf('profile') !== -1) continue;
          if (isrc.indexOf('/mmo') !== -1 || isrc.indexOf('mmo.png') !== -1) { company = 'MMO'; break; }
          if (isrc.indexOf('/eic') !== -1 || isrc.indexOf('eic.png') !== -1) { company = 'EIC'; break; }
          if (isrc.indexOf('/vru') !== -1 || isrc.indexOf('vru.png') !== -1) { company = 'VRU'; break; }
        }
      }

      var grade = findLabelValue('Rank') || findCardValue('Rank') || null;
      if (!grade) {
        var gradeDiv = document.querySelector('div.text-2xl.font-bold.mt-1.text-white, div.text-2xl.font-bold.mt-1');
        var gText = text(gradeDiv);
        if (gText) grade = gText;
      }
      var estimatedRp = toInt(findLabelValue('Estimated RP')) || toInt(findCardValue('Estimated RP'));
      if (!level) level = toInt(findLabelValue('Level'));
      if (!level && document.body) {
        var levelM = document.body.innerText.match(/Level\\s*(\\d+)/i);
        if (levelM) level = parseInt(levelM[1], 10);
      }
      var totalHours = toInt(findLabelValue('Total Hours')) || toInt(findCardValue('Total Hours'));
      if (!totalHours && document.body) {
        var hoursM = document.body.innerText.match(/Total\\s*Hours\\s*([0-9,]+)/i);
        if (hoursM) totalHours = toInt(hoursM[1]);
      }

      var lastSeenRaw = findLabelValue('Last Seen');
      var lastUpdateRaw = findLabelValue('Last Update');
      var registeredRaw = findLabelValue('Registered');

      var serverLabel = null;
      var serverEl = document.querySelector('img[alt*="Global"], img[alt*="Steam"]');
      if (serverEl && serverEl.nextSibling) serverLabel = text(serverEl.nextSibling);
      if (!serverLabel) {
        var allText = document.body ? document.body.innerText : '';
        var mServer = allText.match(/Global\\s*5\\s*\\(Steam\\)|Global\\s*[0-9]+\\s*\\([^)]+\\)/);
        if (mServer) serverLabel = mServer[0];
      }

      function normDate(d){
        if (!d) return null;
        var m = d.match(/(\\d{4})[\\/\\-](\\d{2})[\\/\\-](\\d{2})/);
        if (!m) return null;
        return m[1] + '-' + m[2] + '-' + m[3];
      }

      var periodMap = { 'Current': 'current', 'Last 24 Hours': 'last_24h', 'Last 7 Days': 'last_7d', 'Last 30 Days': 'last_30d', 'Last 100 Days': 'last_100d', 'Last Year': 'last_365d' };
      var hofColMap = { 'Topuser': 'top_user', 'Top user': 'top_user', 'Top User': 'top_user', 'Experience': 'experience', 'Honor': 'honor', 'NPCs': 'alien_kills', 'Kills': 'ship_kills' };
      var mainStats = { current: {}, last_24h: {}, last_7d: {}, last_30d: {}, last_100d: {}, last_365d: {} };
      var gates = null;
      var gatesParseDebug = null;
      var foundGatesTable = false;
      var globalMaxGateHeaderHits = 0;
      var globalBestGateHeaderTexts = null;
      var __skipGalaxy__ = ${skipGalaxy ? 'true' : 'false'};

      // Parsing direct du panel Galaxy Gates (plus fiable que scanner tous les tableaux).
      if (!__skipGalaxy__) { (function parseGalaxyPanelFirst(){
        var gateMap = {
          'alpha': 'alpha',
          'beta': 'beta',
          'gamma': 'gamma',
          'delta': 'delta',
          'epsilon': 'epsilon',
          'zeta': 'zeta',
          'kappa': 'kappa',
          'lambda': 'lambda',
          'kronos': 'kronos',
          'hades': 'hades',
          'kuiper': 'other'
        };
        var panel =
          document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"][data-state="active"]:not([hidden])') ||
          document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"]:not([hidden])') ||
          document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"]');
        if (!panel) return;
        var table = panel.querySelector('table');
        if (!table) return;

        var rows = table.querySelectorAll('tr');
        if (!rows || rows.length < 2) return;
        var headerCells = rows[0].querySelectorAll('th, td');
        var headerTexts = Array.from(headerCells).map(function(c){ return text(c); });

        // Certaines variantes ont l'en-tête de colonnes de gates en 2e ligne.
        var headerHits = 0;
        for (var hi = 0; hi < headerTexts.length; hi++) {
          if (gateMap[gateNorm(headerTexts[hi])]) headerHits++;
        }
        if (headerHits < 2 && rows.length >= 2) {
          headerCells = rows[1].querySelectorAll('th, td');
          headerTexts = Array.from(headerCells).map(function(c){ return text(c); });
        }

        var headerToIdx = {};
        headerTexts.forEach(function(h, i){
          var key = gateNorm(h);
          if (gateMap[key]) headerToIdx[gateMap[key]] = i;
        });
        var indexToPeriodKey = ['current', 'last_24h', 'last_7d', 'last_30d', 'last_100d', 'last_365d'];
        var dataRows = table.querySelectorAll('tbody tr');
        if (!dataRows || dataRows.length === 0) dataRows = Array.from(rows).slice(1);
        else dataRows = Array.from(dataRows);
        var localHits = 0;

        for (var ri = 0; ri < dataRows.length; ri++) {
          var cells = dataRows[ri].querySelectorAll('td, th');
          if (cells.length <= 1) continue;
          var rowLabel = text(cells[0]);
          var periodKeyByIndex = indexToPeriodKey[ri] || null;
          var periodKeyByLabel = periodMap[rowLabel] || null;
          var periodKey = periodKeyByIndex || periodKeyByLabel;
          if (!periodKey) continue;
          if (!mainStats[periodKey]) mainStats[periodKey] = {};
          if (!mainStats[periodKey].galaxy_gates) {
            mainStats[periodKey].galaxy_gates = {
              alpha: null, beta: null, gamma: null, delta: null, epsilon: null,
              zeta: null, kappa: null, lambda: null, kronos: null, hades: null, other: null
            };
          }
          Object.keys(headerToIdx).forEach(function(key){
            var idx = headerToIdx[key];
            if (!cells[idx]) return;
            var v = toInt(text(cells[idx]));
            mainStats[periodKey].galaxy_gates[key] = v;
            if (v != null) localHits += 1;
            if (ri === 0) {
              if (!gates) {
                gates = {
                  total: null, alpha: null, beta: null, gamma: null, delta: null, epsilon: null,
                  zeta: null, kappa: null, lambda: null, kronos: null, hades: null, other: null
                };
              }
              gates[key] = v;
            }
          });
        }
        if (localHits > 0) {
          foundGatesTable = true;
        } else {
          gatesParseDebug = {
            panelFound: true,
            tableFound: true,
            headerTexts: headerTexts,
            headerToIdx: headerToIdx
          };
        }
      })(); }

      var tables = document.querySelectorAll('table');
      for (var ti = 0; ti < tables.length; ti++) {
        var t = tables[ti];
        var rows = t.querySelectorAll('tr');
        if (rows.length < 2) continue;

        // Ligne d'en-tête principale (HoF / Time Played)
        var headerCells = rows[0].querySelectorAll('th, td');
        var headerTexts = Array.from(headerCells).map(function(c){ return text(c); });

        var isHof = headerTexts.some(function(h){
          return h === 'Topuser' || h === 'Top User' || h === 'Experience' || h === 'Honor';
        });
        var isTimePlayed = headerTexts.some(function(h){ return h === 'Hours'; }) && headerTexts.some(function(h){ return h === 'Time Played' || h === 'Current'; });

        // Détection du tableau Galaxy Gates : l'en-tête utile peut être sur la 2ᵉ ligne
        var isGates = false;
        var gateHeaderRow = null;
        var gateHeaderTexts = null;
        if (isHof) {
          var colIdx = {};
          headerTexts.forEach(function(h, i){ if (hofColMap[h]) colIdx[hofColMap[h]] = i; });
          for (var ri = 1; ri < rows.length; ri++) {
            var cells = rows[ri].querySelectorAll('td, th');
            if (cells.length < 2) continue;
            var periodName = text(cells[0]);
            var periodKey = periodMap[periodName] || (periodName && periodName.toLowerCase().replace(/\\s+/g, '_').replace(/last_24_hours/, 'last_24h').replace(/last_7_days/, 'last_7d').replace(/last_30_days/, 'last_30d').replace(/last_100_days/, 'last_100d').replace(/last_year/, 'last_365d'));
            if (!mainStats[periodKey]) mainStats[periodKey] = {};
            for (var col in colIdx) {
              var idx = colIdx[col];
              if (cells[idx]) mainStats[periodKey][col] = toInt(text(cells[idx]));
            }
          }
        }
        if (isTimePlayed) {
          var hourCol = headerTexts.indexOf('Hours') >= 0 ? headerTexts.indexOf('Hours') : 1;
          for (var ri = 1; ri < rows.length; ri++) {
            var cells = rows[ri].querySelectorAll('td, th');
            var periodName = text(cells[0]);
            var periodKey = periodMap[periodName];
            if (periodKey && mainStats[periodKey] && cells[hourCol]) mainStats[periodKey].hours = toInt(text(cells[hourCol]));
          }
        }
        if (!isGates && !__skipGalaxy__) {
          // Détection plus robuste du tableau Galaxy Gates :
          // on cherche une ligne d'en-tête (parmi les 2–3 premières) contenant au moins 2 noms de portes connus.
          var _gateMapDetect = {
            'alpha': true,
            'beta': true,
            'gamma': true,
            'delta': true,
            'epsilon': true,
            'zeta': true,
            'kappa': true,
            'lambda': true,
            'kronos': true,
            'hades': true,
            'kuiper': true
          };

          var maxHeaderRowProbe = Math.min(rows.length, 3);
          for (var hr = 0; hr < maxHeaderRowProbe; hr++) {
            var hrCells = rows[hr].querySelectorAll('th, td');
            var hrTexts = Array.from(hrCells).map(function(c){ return text(c); });
            var gateHeaderHits = 0;
            hrTexts.forEach(function(h){
              var gateKey = gateNorm(h);
              if (_gateMapDetect[gateKey]) gateHeaderHits++;
            });
            if (gateHeaderHits > globalMaxGateHeaderHits) {
              globalMaxGateHeaderHits = gateHeaderHits;
              globalBestGateHeaderTexts = hrTexts;
            }
            if (gateHeaderHits >= 2) {
              isGates = true;
              gateHeaderRow = rows[hr];
              gateHeaderTexts = hrTexts;
              foundGatesTable = true;
              break;
            }
          }
        }

        if (isGates && !__skipGalaxy__) {
          var gateMap = {
            'alpha': 'alpha',
            'beta': 'beta',
            'gamma': 'gamma',
            'delta': 'delta',
            'epsilon': 'epsilon',
            'zeta': 'zeta',
            'kappa': 'kappa',
            'lambda': 'lambda',
            'kronos': 'kronos',
            'hades': 'hades',
            'kuiper': 'other'
          };
          // Les valeurs sont en colonnes (Alpha, Beta, ...) et les lignes sont les périodes.
          var headerToIdx = {};
          var ghTexts = gateHeaderTexts || headerTexts;
          ghTexts.forEach(function(h, i){
            var gateKey = gateNorm(h);
            if (gateMap[gateKey]) headerToIdx[gateMap[gateKey]] = i;
          });
          var localGatesHits = 0;
          var currentRowSnapshot = null;
          // La 1ère ligne du tbody correspond à la période "All time" (même si le label est localisé).
          // On s'appuie sur l'index de ligne pour éviter les échecs du type rowLabel === 'Current'.
          var indexToPeriodKey = ['current', 'last_24h', 'last_7d', 'last_30d', 'last_100d', 'last_365d'];
          var dataRows = (function(){
            var tbodyRows = t.querySelectorAll('tbody tr');
            if (tbodyRows && tbodyRows.length) return Array.from(tbodyRows);
            // fallback: au moins on saute l'éventuelle ligne d'entête
            return Array.from(rows).slice(1);
          })();
          for (var ri = 0; ri < dataRows.length; ri++) {
            var cells = dataRows[ri].querySelectorAll('td, th');
            if (cells.length <= 1) continue;

            var rowLabel = text(cells[0]);
            var periodKeyByIndex = indexToPeriodKey[ri] || null;
            var periodKeyByLabel = periodMap[rowLabel] || (rowLabel && rowLabel.toLowerCase().replace(/\\s+/g, '_').replace(/last_24_hours/, 'last_24h').replace(/last_7_days/, 'last_7d').replace(/last_30_days/, 'last_30d').replace(/last_100_days/, 'last_100d').replace(/last_year/, 'last_365d'));
            var periodKey = periodKeyByIndex || periodKeyByLabel;
            if (!periodKey) continue;

            if (!mainStats[periodKey]) mainStats[periodKey] = {};
            if (!mainStats[periodKey].galaxy_gates) {
              mainStats[periodKey].galaxy_gates = {
                alpha:   null,
                beta:    null,
                gamma:   null,
                delta:   null,
                epsilon: null,
                zeta:    null,
                kappa:   null,
                lambda:  null,
                kronos:  null,
                hades:   null,
                other:   null
              };
            }

            var isCurrentRow = ri === 0;
            if (isCurrentRow && !currentRowSnapshot) {
              try {
                currentRowSnapshot = {
                  gateHeaderTexts: ghTexts,
                  headerToIdx: headerToIdx,
                  currentRowCells: Array.from(cells).map(function(c){ return text(c); })
                };
              } catch (_) {}
            }

            Object.keys(headerToIdx).forEach(function(key){
              var idx = headerToIdx[key];
              if (cells[idx]) {
                var cellText = text(cells[idx]);
                var v = toInt(cellText);
                mainStats[periodKey].galaxy_gates[key] = v;
                if (v != null) localGatesHits += 1;
                if (isCurrentRow) {
                  if (!gates) {
                    gates = {
                      total:   null,
                      alpha:   null,
                      beta:    null,
                      gamma:   null,
                      delta:   null,
                      epsilon: null,
                      zeta:    null,
                      kappa:   null,
                      lambda:  null,
                      kronos:  null,
                      hades:   null,
                      other:   null
                    };
                  }
                  gates[key] = v;
                }
              }
            });
          }
          if (localGatesHits === 0 && !gatesParseDebug) {
            gatesParseDebug = currentRowSnapshot || { gateHeaderTexts: ghTexts, headerToIdx: headerToIdx };
          }
        }
      }

      // Debug global : si aucun tableau "Galaxy Gates" n'a été reconnu, on expose le meilleur score observé.
      if (!__skipGalaxy__ && !foundGatesTable && !gatesParseDebug) {
        gatesParseDebug = {
          maxGateHeaderHits: globalMaxGateHeaderHits,
          bestGateHeaderTexts: globalBestGateHeaderTexts
        };
      }

      // Si les Galaxy Gates ont été renseignées dans les stats (ligne "Current"),
      // on les réutilise comme source principale pour entry.galaxy_gates si besoin.
      var gatesFromStats = null;
      if (mainStats && mainStats.current && typeof mainStats.current.galaxy_gates === 'object') {
        gatesFromStats = mainStats.current.galaxy_gates;
      }
      var finalGates = gates || gatesFromStats || {
        total:   null,
        alpha:   null,
        beta:    null,
        gamma:   null,
        delta:   null,
        epsilon: null,
        zeta:    null,
        kappa:   null,
        lambda:  null,
        kronos:  null,
        hades:   null,
        other:   null
      };

      var entry = {
        user_id: ${JSON.stringify(meta.userId)},
        name: name,
        company: company,
        server_code: ${JSON.stringify(meta.serverCode)},
        server_label: serverLabel,
        level: level,
        grade: grade,
        estimated_rp: estimatedRp,
        total_hours: totalHours,
        last_seen: normDate(lastSeenRaw),
        last_update: normDate(lastUpdateRaw),
        registered: normDate(registeredRaw),
        stats: mainStats,
        galaxy_gates: finalGates,
        galaxy_gates_parse_debug: gatesParseDebug
      };

      return { ok:true, entry: entry };
    } catch(e){
      return { ok:false, error: e && e.message ? e.message : String(e) };
    }
  })()`;

  const res = await win.webContents.executeJavaScript(js);
  const entry = res && res.ok && res.entry ? res.entry : null;

  const metaOut = {
    type: 'player_profile',
    period: null,
    server_code: meta.serverCode || null,
    server_label: null,
    scraped_at: meta.scrapedAt,
    source_url: meta.url,
    total_entries: entry ? 1 : 0,
    page: 1,
    pages_total: 1,
  };

  return {
    meta: metaOut,
    entries: entry ? [entry] : [],
  };
}

/**
 * Extrait uniquement les Galaxy Gates (2ᵉ phase : onglet Galaxy actif).
 */
async function extractGalaxyGatesPatch(win) {
  const js = `(function(){
    function text(el){
      var s = el ? (el.textContent || '') : '';
      s = s.replace(/[\\u00A0\\u202F]/g, ' ').trim();
      s = s.replace(/\\s+/g, ' ');
      return s;
    }
    function gateNorm(s){
      var t = (s || '').toLowerCase();
      t = t.replace(/\\s*Gates?$/i, '');
      t = t.replace(/[^a-z]/g, '');
      return t;
    }
    function toInt(str){
      if (!str) return null;
      var cleaned = (str + '').replace(/[^0-9]/g,'');
      if (!cleaned) return null;
      try { return parseInt(cleaned, 10); } catch(e){ return null; }
    }
    try {
      var periodMap = { 'Current': 'current', 'Last 24 Hours': 'last_24h', 'Last 7 Days': 'last_7d', 'Last 30 Days': 'last_30d', 'Last 100 Days': 'last_100d', 'Last Year': 'last_365d' };
      var mainStats = { current: {}, last_24h: {}, last_7d: {}, last_30d: {}, last_100d: {}, last_365d: {} };
      var gates = null;
      var gatesParseDebug = null;
      var foundGatesTable = false;

      var gateMap = {
        'alpha': 'alpha',
        'beta': 'beta',
        'gamma': 'gamma',
        'delta': 'delta',
        'epsilon': 'epsilon',
        'zeta': 'zeta',
        'kappa': 'kappa',
        'lambda': 'lambda',
        'kronos': 'kronos',
        'hades': 'hades',
        'kuiper': 'other'
      };
      var panel =
        document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"][data-state="active"]:not([hidden])') ||
        document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"]:not([hidden])') ||
        document.querySelector('div[role="tabpanel"][id*="content-galaxy-gates"]');
      if (!panel) {
        return { ok: true, stats: mainStats, galaxy_gates: null, galaxy_gates_parse_debug: { panelFound: false }, foundGatesTable: false };
      }
      var table = panel.querySelector('table');
      if (!table) {
        return { ok: true, stats: mainStats, galaxy_gates: null, galaxy_gates_parse_debug: { panelFound: true, tableFound: false }, foundGatesTable: false };
      }

      var rows = table.querySelectorAll('tr');
      if (!rows || rows.length < 2) {
        return { ok: true, stats: mainStats, galaxy_gates: null, galaxy_gates_parse_debug: { panelFound: true, tableFound: true, rows: 0 }, foundGatesTable: false };
      }
      var headerCells = rows[0].querySelectorAll('th, td');
      var headerTexts = Array.from(headerCells).map(function(c){ return text(c); });

      var headerHits = 0;
      for (var hi = 0; hi < headerTexts.length; hi++) {
        if (gateMap[gateNorm(headerTexts[hi])]) headerHits++;
      }
      if (headerHits < 2 && rows.length >= 2) {
        headerCells = rows[1].querySelectorAll('th, td');
        headerTexts = Array.from(headerCells).map(function(c){ return text(c); });
      }

      var headerToIdx = {};
      headerTexts.forEach(function(h, i){
        var key = gateNorm(h);
        if (gateMap[key]) headerToIdx[gateMap[key]] = i;
      });
      var indexToPeriodKey = ['current', 'last_24h', 'last_7d', 'last_30d', 'last_100d', 'last_365d'];
      var dataRows = table.querySelectorAll('tbody tr');
      if (!dataRows || dataRows.length === 0) dataRows = Array.from(rows).slice(1);
      else dataRows = Array.from(dataRows);
      var localHits = 0;

      for (var ri = 0; ri < dataRows.length; ri++) {
        var cells = dataRows[ri].querySelectorAll('td, th');
        if (cells.length <= 1) continue;
        var rowLabel = text(cells[0]);
        var periodKeyByIndex = indexToPeriodKey[ri] || null;
        var periodKeyByLabel = periodMap[rowLabel] || null;
        var periodKey = periodKeyByIndex || periodKeyByLabel;
        if (!periodKey) continue;
        if (!mainStats[periodKey]) mainStats[periodKey] = {};
        if (!mainStats[periodKey].galaxy_gates) {
          mainStats[periodKey].galaxy_gates = {
            alpha: null, beta: null, gamma: null, delta: null, epsilon: null,
            zeta: null, kappa: null, lambda: null, kronos: null, hades: null, other: null
          };
        }
        Object.keys(headerToIdx).forEach(function(key){
          var idx = headerToIdx[key];
          if (!cells[idx]) return;
          var v = toInt(text(cells[idx]));
          mainStats[periodKey].galaxy_gates[key] = v;
          if (v != null) localHits += 1;
          if (ri === 0) {
            if (!gates) {
              gates = {
                total: null, alpha: null, beta: null, gamma: null, delta: null, epsilon: null,
                zeta: null, kappa: null, lambda: null, kronos: null, hades: null, other: null
              };
            }
            gates[key] = v;
          }
        });
      }
      if (localHits > 0) {
        foundGatesTable = true;
      } else {
        gatesParseDebug = {
          panelFound: true,
          tableFound: true,
          headerTexts: headerTexts,
          headerToIdx: headerToIdx
        };
      }

      return {
        ok: true,
        stats: mainStats,
        galaxy_gates: gates,
        galaxy_gates_parse_debug: gatesParseDebug,
        foundGatesTable: foundGatesTable
      };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  })()`;

  try {
    return await win.webContents.executeJavaScript(js);
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function mergeGalaxyGatesPatchIntoEntry(entry, patch) {
  if (!entry || !patch || !patch.ok) return;
  if (patch.galaxy_gates && typeof patch.galaxy_gates === 'object') {
    entry.galaxy_gates = patch.galaxy_gates;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'galaxy_gates_parse_debug')) {
    entry.galaxy_gates_parse_debug = patch.galaxy_gates_parse_debug;
  }
  const periods = ['current', 'last_24h', 'last_7d', 'last_30d', 'last_100d', 'last_365d'];
  if (!entry.stats) entry.stats = {};
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (!patch.stats || !patch.stats[p] || !patch.stats[p].galaxy_gates) continue;
    if (!entry.stats[p]) entry.stats[p] = {};
    entry.stats[p].galaxy_gates = patch.stats[p].galaxy_gates;
  }
}

async function scrapeOneProfile(serverCode, userId, mainWindowRef, scrapeOpts = {}) {
  const quietLogs = !!(scrapeOpts && scrapeOpts.quietLogs);
  const scrapedAt = getNowIso();
  const baseUrl = `${DOSTATS_PLAYER_URL}${encodeURIComponent(userId)}`;
  const url = serverCode ? `${baseUrl}?server=${encodeURIComponent(serverCode)}` : baseUrl;

  let win = null;
  try {
    const { win: w, ok } = await loadPlayerWindow(url);
    win = w;
    if (!ok) {
      await captureScreenshotOnError(win, `profile_${serverCode}_${playerId}`);
      if (!quietLogs && mainWindowRef?.webContents) {
        mainWindowRef.webContents.send('dostats:log', {
          type: 'error',
          server: serverCode,
          metric_type: 'player_profile',
          period: 'current',
          message: `DOSTATS player ${userId} : échec chargement`,
          at: scrapedAt,
        });
      }
      return null;
    }
    await waitForPlayerProfileReady(win);
    // 1) Main Stats : HoF + Time Played ne sont pas dans le DOM si l’onglet Galaxy est actif.
    await activateMainStatsTab(win);
    const mainReady = await waitForMainStatsHoFReady(win);
    if (!mainReady && !quietLogs && mainWindowRef?.webContents) {
      mainWindowRef.webContents.send('dostats:log', {
        type: 'warning',
        server: serverCode,
        metric_type: 'player_profile',
        period: 'current',
        message: `DOSTATS player ${userId} : onglet Main Stats / HoF non prêt (timeout)`,
        at: scrapedAt,
      });
    }
    const data = await extractPlayerProfile(win, { serverCode, userId, scrapedAt, url }, { skipGalaxy: true });
    // 2) Galaxy Gates : onglet dédié, puis fusion dans l’entrée.
    await activateGalaxyGatesTab(win);
    const gatesReady = await waitForGalaxyGatesReady(win);
    if (!gatesReady && !quietLogs && mainWindowRef?.webContents) {
      mainWindowRef.webContents.send('dostats:log', {
        type: 'warning',
        server: serverCode,
        metric_type: 'player_profile',
        period: 'current',
        message: `DOSTATS player ${userId} : Galaxy Gates tab non détecté (timeout)`,
        at: scrapedAt,
      });
    }
    const galaxyPatch = await extractGalaxyGatesPatch(win);
    if (Array.isArray(data?.entries) && data.entries[0] && galaxyPatch && galaxyPatch.ok) {
      mergeGalaxyGatesPatchIntoEntry(data.entries[0], galaxyPatch);
    }
    const hasEntry = Array.isArray(data?.entries) && data.entries.length > 0;
    if (hasEntry && data.entries[0].grade) {
      const mapped = mapGradeLabelToRankKey(data.entries[0].grade, serverCode);
      if (mapped) {
        data.entries[0].grade = mapped;
      }
    }
    if (hasEntry && data.entries[0]) {
      normalizeGalaxyGatesConsistency(data.entries[0]);
    }
    if (!quietLogs && mainWindowRef?.webContents) {
      const upperServer = (serverCode || '').toString().toUpperCase();
      const entry = hasEntry && data.entries[0] ? data.entries[0] : null;
      const pseudo = entry && entry.name ? entry.name : '?';
      const count = hasEntry ? 1 : 0;
      const baseMsg = `[${upperServer}] Profil <${pseudo}> - ${userId} → `;
      const ok = count > 0;
      const message = ok
        ? `${baseMsg}${count} entrée(s) ✔`
        : `${baseMsg}${count} entrée(s) ✖`;
      mainWindowRef.webContents.send('dostats:log', {
        type: ok ? 'success' : 'error',
        server: serverCode,
        metric_type: 'player_profile',
        period: 'current',
        message,
        at: scrapedAt,
      });
    }
    if (!hasEntry) return null;
    return { entry: data.entries[0], userId, serverCode };
  } catch (e) {
    if (!quietLogs && mainWindowRef?.webContents) {
      mainWindowRef.webContents.send('dostats:log', {
        type: 'error',
        server: serverCode,
        metric_type: 'player_profile',
        period: 'current',
        message: `DOSTATS player ${serverCode}/${userId} : ${e?.message || 'Erreur'}`,
        at: scrapedAt,
      });
    }
    return null;
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
}

function sendProfileProgress(mainWindowRef, serverCode, current, total, active) {
  if (!mainWindowRef?.webContents || mainWindowRef.isDestroyed?.()) return;
  mainWindowRef.webContents.send('dostats:profile-progress', {
    server: (serverCode || '').toString().trim().toLowerCase(),
    current: Math.max(0, Number(current) || 0),
    total: Math.max(0, Number(total) || 0),
    active: !!active,
    at: getNowIso(),
  });
}

function sendProfileBatchLog(mainWindowRef, payload) {
  if (!mainWindowRef?.webContents || mainWindowRef.isDestroyed?.()) return;
  mainWindowRef.webContents.send('dostats:log', payload);
}

async function runDostatsProfilesScraper(options = {}) {
  const serverCode = options.serverCode || null;
  const userIdsRaw = Array.isArray(options.userIds) ? options.userIds : [];
  const mainWindowRef = options.mainWindowRef || null;

  const userIds = [...new Set(userIdsRaw.map((u) => String(u || '').trim()).filter(Boolean))];
  if (userIds.length === 0) {
    return { ok: false, error: 'Aucun user_id fourni' };
  }

  const totalPlayers = userIds.length;
  const serverNorm = (serverCode || '').toString().trim().toLowerCase();

  sendProfileBatchLog(mainWindowRef, {
    type: 'info',
    server: serverNorm,
    metric_type: 'player_profile_batch_start',
    message: `Début de la récupération de ${totalPlayers} joueur${totalPlayers > 1 ? 's' : ''}…`,
    at: getNowIso(),
  });

  sendProfileProgress(mainWindowRef, serverNorm, 0, totalPlayers, true);

  const results = [];
  const collectedEntries = [];
  const failures = [];

  const queue = [...userIds];
  let processed = 0;

  while (queue.length > 0) {
    // Résolution dynamique de la concurrence : si options.concurrency est fourni, on le respecte,
    // sinon on lit la valeur courante depuis les settings (slider "Profils concurrents DoStats").
    const dynamicConcurrency = options && typeof options.concurrency === 'number'
      ? options.concurrency
      : getProfilesConcurrency();
    const CONCURRENCY = Math.max(1, Math.min(10, Math.floor(dynamicConcurrency || 3)));

    const batch = queue.splice(0, CONCURRENCY);
    const maxRetries = getRetries();
    // eslint-disable-next-line no-await-in-loop
    const batchResults = await Promise.all(
      batch.map(async (userId) => {
        let attempt = 0;
        let r = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          r = await scrapeOneProfile(serverCode, userId, mainWindowRef, { quietLogs: true });
          if (r || attempt >= maxRetries) break;
          attempt += 1;
        }
        return { userId, result: r };
      }),
    );
    batchResults.forEach(({ userId, result: r }) => {
      if (r && r.entry) {
        const enriched = attachFlatHallOfFameStats(r.entry);
        r.entry = enriched;
        results.push(r);
        collectedEntries.push(enriched);
      } else {
        const pseudo = r && r.entry && r.entry.name ? String(r.entry.name).trim() : null;
        failures.push({ userId, pseudo: pseudo || null });
      }
    });
    processed += batch.length;
    sendProfileProgress(mainWindowRef, serverNorm, Math.min(processed, totalPlayers), totalPlayers, true);
  }

  const okCount = collectedEntries.length;
  const failCount = failures.length;

  if (failCount === 0) {
    sendProfileBatchLog(mainWindowRef, {
      type: 'success',
      server: serverNorm,
      metric_type: 'player_profile_batch_end',
      message: `Récupération terminée — ${okCount} joueur${okCount > 1 ? 's' : ''} récupéré${okCount > 1 ? 's' : ''}`,
      symbol: 'check',
      at: getNowIso(),
    });
  } else {
    sendProfileBatchLog(mainWindowRef, {
      type: 'warning',
      server: serverNorm,
      metric_type: 'player_profile_batch_end',
      message: `Récupération terminée — ${okCount} ✔ · ${failCount} non récupéré${failCount > 1 ? 's' : ''}`,
      symbol: 'cross',
      at: getNowIso(),
    });
    const maxShow = 12;
    const lines = failures.slice(0, maxShow).map((f) => {
      const name = f.pseudo && f.pseudo.length ? f.pseudo : '?';
      return `${name} (${f.userId}) — non récupéré`;
    });
    const more = failures.length > maxShow ? `\n… +${failures.length - maxShow} autre${failures.length - maxShow > 1 ? 's' : ''}` : '';
    sendProfileBatchLog(mainWindowRef, {
      type: 'warning',
      server: serverNorm,
      metric_type: 'player_profile_failures_list',
      message: lines.join('\n') + more,
      at: getNowIso(),
    });
  }

  sendProfileProgress(mainWindowRef, serverNorm, totalPlayers, totalPlayers, false);

  if (collectedEntries.length > 0) {
    const outPath = buildServerProfilesPath(serverCode);
    const payload = {
      type: 'player_profiles',
      server_code: serverCode || null,
      scraped_at: getNowIso(),
      total_entries: collectedEntries.length,
      entries: collectedEntries,
    };
    writeJsonFile(outPath, payload);
  }

  return {
    ok: true,
    serverCode,
    requestedCount: userIds.length,
    writtenCount: collectedEntries.length,
    results,
  };
}

module.exports = {
  runDostatsProfilesScraper,
  getLatestProfile,
};

