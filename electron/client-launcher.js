/**
 * Client Launcher DarkOrbit — Lance le client et intercepte le trafic via CDP
 *
 * Architecture :
 *   _browserClient  → connexion browser-level, gère Target.setDiscoverTargets
 *   _targetClients  → Map<targetId, CDPClient> — un client CDP par page surveillée
 *
 * Prérequis : client Electron/Chromium avec --remote-debugging-port.
 * Le client officiel Unity ne supporte pas CDP.
 */

const { spawn } = require('child_process');
const { ipcMain, BrowserWindow, app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

const DARKORBIT_COMMON_PATHS = [
  path.join('C:\\', 'Program Files', 'DarkOrbit', 'DarkOrbit.exe'),
  path.join('C:\\', 'Program Files (x86)', 'DarkOrbit', 'DarkOrbit.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'DarkOrbit', 'DarkOrbit.exe'),
  path.join(process.env.APPDATA || '', 'DarkOrbit', 'DarkOrbit.exe'),
];
const DEFAULT_CLIENT_PATH = DARKORBIT_COMMON_PATHS.find(p => p && fs.existsSync(p)) || '';

const PATH_JSON = 'darkorbit-path.json';

function getSavedClientPath() {
  try {
    const p = path.join(app.getPath('userData'), PATH_JSON);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const data = JSON.parse(raw);
      const pth = data?.path;
      if (pth && typeof pth === 'string' && fs.existsSync(pth)) return pth;
    }
  } catch (e) {}
  return '';
}

function saveClientPath(pth) {
  try {
    const p = path.join(app.getPath('userData'), PATH_JSON);
    fs.writeFileSync(p, JSON.stringify({ path: pth }), 'utf8');
  } catch (e) {
    console.warn('[ClientLauncher] saveClientPath:', e?.message);
  }
}
const CDP_PORT = 9222;
const CDP_RETRY_MS = 500;
const CDP_RETRY_MAX = 60;       // 30 secondes max
const CDP_INIT_DELAY_MS = 5000; // délai avant première tentative (client needs to init)
const INJECT_DELAY_MS = 800;    // délai fixe avant injection DOM après navigation CDP
const HOME_DOM_READY_MS = 4000; // délai sur internalStart avant extraction (DOM #userInfoSheet, #companyLogo, etc.)
const RANK_PAGE_READY_MS = 3500; // délai sur dailyRank avant extraction

// ─── État ────────────────────────────────────────────────────────────────────

let _clientProcess = null;
let _browserClient = null;           // connexion browser-level (Target domain)
let _targetClients = new Map();      // targetId → CDPClient (une entrée par page)
let _lastProfileTargetId = null;     // targetId de la dernière fenêtre profil ouverte (pour fermeture explicite)
let _mainWindow = null;

// ─── État scan ───────────────────────────────────────────────────────────────

let _scanRunning = false;
let _scanStopRequested = false;

// ─── Patterns de détection ───────────────────────────────────────────────────

const FIRM_PATTERNS = ['MMO', 'EIC', 'VRU'];
const PLAYER_ID_PATTERN = /(?:userId|user_id|playerId|player_id|showuser)[\s"':=]+([a-zA-Z0-9_-]{5,})/i;

/**
 * Mots-clés multilingues désignant la "firme" dans les profils joueurs DarkOrbit.
 * Couvre : FR, EN, DE, RU, PL, TR, ES, RO.
 */
const FIRM_KEYWORDS = [
  'Firma',       // DE, PL, TR
  'Gesellschaft',// DE
  'фирма',       // RU
  'компания',    // RU
  'spółka',      // PL
  'company',     // EN
  'firm',        // EN
  'şirket',      // TR
  'empresa',     // ES
  'compañía',    // ES
  'Firme',       // FR/RO
  'Compagnie',   // FR
];

/**
 * Correspondances étendues : noms de planètes/factions → abréviation standard.
 * DarkOrbit utilise parfois les noms complets selon la langue du serveur.
 */
const FIRM_ALIASES = {
  // MMO (Mars Military Organisation)
  mmo: 'MMO', mars: 'MMO',
  'mars military': 'MMO', 'organisation militaire': 'MMO',
  'militärische': 'MMO',
  // EIC (Earth Industries Corporation)
  eic: 'EIC', earth: 'EIC',
  'earth industries': 'EIC', 'industries terrestres': 'EIC',
  'erdische': 'EIC',
  // VRU (Venus Resources Unlimited)
  vru: 'VRU', venus: 'VRU',
  'venus resources': 'VRU', 'ressources de vénus': 'VRU',
  'venerische': 'VRU',
};

const FIRM_IN_TEXT = new RegExp(
  '(?:' + FIRM_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')' +
  '[\\s"\']*[:\\s]+[\\s"\']*([A-Za-z\u00C0-\u024F\u0400-\u04FF\\s]{2,40})',
  'i'
);

// ─── Script injecté dans les popups de profil ─────────────────────────────────

/**
 * Construit la regex multilingue à injecter sous forme de chaîne littérale.
 * Les mots-clés sont échappés pour RegExp et encodés en unicode pour les
 * caractères non-ASCII (cyrillique, diacritiques) afin d'être sûrs dans le
 * contexte de la page cible indépendamment de l'encodage du document.
 */
function buildFirmKeywordsRegexSrc() {
  return FIRM_KEYWORDS
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}

/**
 * Table d'alias injectée directement dans le script (JSON sérialisé).
 * Permet de normaliser les noms de factions vers MMO / EIC / VRU.
 */
function buildFirmAliasesJson() {
  return JSON.stringify(FIRM_ALIASES);
}

/**
 * Script injecté via Runtime.evaluate dans les pages de profil joueur.
 *
 * Stratégie (dans l'ordre) :
 *   1. Attributs title sur <td> (sélecteurs CSS multilingues)
 *   2. Parcours de tous les nœuds texte de la page → regex mot-clé + valeur suivante
 *   3. Regex directe sur MMO|EIC|VRU dans le texte brut
 *
 * Retourne :
 *   { company: 'MMO'|'EIC'|'VRU'|null, method: string, keyword?: string }
 */
const JS_EXTRACT_FIRM = (() => {
  const keywordsRegexSrc = buildFirmKeywordsRegexSrc();
  const aliasesJson = buildFirmAliasesJson();

  return `(function(){
  try {
    /* ── Normalisation via la table d'alias ─────────────────────────── */
    var ALIASES = ${aliasesJson};
    function normalize(raw) {
      if (!raw) return null;
      var clean = raw.trim().toLowerCase().replace(/\\s+/g, ' ');
      if (ALIASES[clean]) return ALIASES[clean];
      /* Correspondance partielle : on cherche si une clé est contenue dans clean */
      for (var key in ALIASES) {
        if (clean.indexOf(key) !== -1) return ALIASES[key];
      }
      /* Dernière chance : MMO / EIC / VRU en majuscules */
      var direct = clean.match(/\\b(mmo|eic|vru)\\b/i);
      if (direct) return direct[1].toUpperCase();
      return null;
    }

    /* ── Étape 1 : sélecteurs CSS sur attributs title ────────────────── */
    var TITLE_SELECTORS = [
      'td[title="COMPANY"]', 'td[title="Company"]', 'td[title="Firme"]',
      'td[title="Firma"]', 'td[title="firma"]', 'td[title="Gesellschaft"]',
      'td[title="empresa"]', 'td[title="şirket"]', 'td[title="compañía"]',
      'td[title="Clan"]', 'td[title="CLAN"]', '.hof_clanname', '[class*="company"]'
    ];
    for (var si = 0; si < TITLE_SELECTORS.length; si++) {
      var el = document.querySelector(TITLE_SELECTORS[si]);
      if (el) {
        var t = (el.textContent || '').trim();
        var norm = normalize(t);
        if (norm) return { company: norm, method: 'selector_' + si, keyword: TITLE_SELECTORS[si] };
      }
    }

    /* ── Étape 2 : parcours des nœuds texte, regex mot-clé multilingue ─ */
    var KW_RX = new RegExp(
      '(?:${keywordsRegexSrc})' +
      '[\\\\s"\\']*[:\\\\s]+[\\\\s"\\']*([A-Za-z\\\\u00C0-\\\\u024F\\\\u0400-\\\\u04FF][A-Za-z\\\\u00C0-\\\\u024F\\\\u0400-\\\\u04FF\\\\s]{1,39})',
      'i'
    );
    var bodyText = (document.body && document.body.innerText) || document.documentElement.innerText || '';
    var kwResult = KW_RX.exec(bodyText);
    if (kwResult && kwResult[1]) {
      var normKw = normalize(kwResult[1].trim());
      if (normKw) {
        /* Retrouver le mot-clé qui a matché */
        var kwUsed = (function() {
          var allKw = '${keywordsRegexSrc}'.split('|');
          var kwRxSingle;
          for (var ki = 0; ki < allKw.length; ki++) {
            kwRxSingle = new RegExp(allKw[ki], 'i');
            if (kwRxSingle.test(bodyText.substring(0, kwResult.index + allKw[ki].length + 10))) return allKw[ki];
          }
          return 'unknown';
        })();
        return { company: normKw, method: 'keyword_regex', keyword: kwUsed };
      }
    }

    /* ── Étape 3 : correspondance directe MMO / EIC / VRU ────────────── */
    var directMatch = bodyText.match(/\\b(MMO|EIC|VRU)\\b/i);
    if (directMatch && directMatch[1]) {
      return { company: directMatch[1].toUpperCase(), method: 'direct', keyword: null };
    }

    return { company: null, method: 'fail', keyword: null };
  } catch(e) {
    return { company: null, method: 'error', error: e.message, keyword: null };
  }
})()`;
})();

/**
 * Script injecté dans la page de profil pour récupérer pseudo, grade, userId et server.
 *
 * - server     : window.location.hostname (gbl5.darkorbit.com → 'gbl5')
 * - userId     : regex sur window.location.href (/p/[id]/ · profile= · userId= · user=)
 * - playerName : #nickname (prioritaire) → cascade DOM → document.title → userId
 * - grade      : td.playerTableBody div[style*="rank_"] → innerText ; défaut "Inconnu"
 *
 * Retourne : { playerName, grade, userId, server, _debug }
 */
const JS_EXTRACT_PROFILE_INFO = `(function(){
  try {
    var href     = window.location.href     || '';
    var hostname = window.location.hostname || '';

    /* ── server depuis l'hostname ─────────────────────────────────── */
    var server = null;
    var hostM = hostname.match(/^([a-z0-9_-]+)\\.darkorbit\\.com$/i);
    if (hostM) server = hostM[1];

    /* ── userId — regex sur window.location.href ─────────────────── */
    var userId = null;
    var hrefPatterns = [
      /\\/p\\/([A-Za-z0-9_%-]{2,30})(?:\\/|\\?|$)/,
      /[?&]profile=([A-Za-z0-9_%-]{2,30})(?:&|$)/i,
      /[?&]userId=([A-Za-z0-9_%-]{2,30})(?:&|$)/i,
      /[?&]user=([A-Za-z0-9_%-]{2,30})(?:&|$)/i
    ];
    for (var pi = 0; pi < hrefPatterns.length; pi++) {
      var pm = href.match(hrefPatterns[pi]);
      if (pm && pm[1]) { userId = decodeURIComponent(pm[1]); break; }
    }

    /* ── Rejet des placeholders et termes génériques ──────────────── */
    function isPlaceholder(s) {
      if (!s || s.length < 2 || s.length > 40) return true;
      if (s.indexOf('%') !== -1 || s.indexOf('&') !== -1 || s.indexOf('#') !== -1) return true;
      return /^(username|player|joueur|spieler|profil|profile|nom|name|user)$/i.test(s);
    }

    /* ── pseudo : #nickname en priorité absolue ───────────────────── */
    var playerName = null;
    var nicknameEl = document.querySelector('#nickname');
    if (nicknameEl) {
      var nRaw = (nicknameEl.textContent || nicknameEl.innerText || '').trim();
      if (!isPlaceholder(nRaw)) playerName = nRaw;
    }

    /* Cascade de sélecteurs secondaires si #nickname absent ou vide */
    if (!playerName) {
      var NAME_SELECTORS = [
        '.name_stats', '.player_name', '#player_name',
        '.hof_entry_name', '.profile-name', '.playername',
        '.player-name', '.username',
        '[class*="name_stats"]', '[class*="playername"]',
        'h1'
      ];
      for (var si = 0; si < NAME_SELECTORS.length; si++) {
        var el = document.querySelector(NAME_SELECTORS[si]);
        var raw = el ? (el.textContent || '').trim() : null;
        if (raw && !isPlaceholder(raw)) { playerName = raw; break; }
      }
    }

    /* Fallback document.title */
    var _debugTitle = document.title || '';
    if (!playerName) {
      var titleClean = _debugTitle
        .replace(/DarkOrbit\\s*[-\\u2013|:]\\s*/i, '')
        .replace(/\\s*[-\\u2013|:].*$/, '')
        .trim();
      if (!isPlaceholder(titleClean)) playerName = titleClean;
    }

    /* Dernier recours : userId comme pseudo temporaire */
    if (!playerName && userId) playerName = userId;

    /* ── grade : div[style*="rank_"] dans td.playerTableBody ─────── */
    var grade = 'Inconnu';
    var gradeEl = document.querySelector('td.playerTableBody div[style*="rank_"]');
    if (gradeEl) {
      var gradeRaw = (gradeEl.innerText || gradeEl.textContent || '').trim();
      if (gradeRaw.length >= 1) grade = gradeRaw;
    }

    /* ── Données de debug ─────────────────────────────────────────── */
    var _debug = {
      href:     href,
      title:    _debugTitle,
      nickname: nicknameEl ? (nicknameEl.textContent || '').trim() : '(absent)',
      grade:    grade
    };

    return { playerName: playerName, grade: grade, userId: userId, server: server, _debug: _debug };
  } catch(e) {
    return { playerName: null, grade: 'Inconnu', userId: null, server: null, _debug: { error: e.message } };
  }
})()`;

// ─── Récolte stats joueur (page d'accueil + page Classement / Votre Grade) ───

const JS_EXTRACT_HOME_STATS = (() => {
  const keywordsRegexSrc = buildFirmKeywordsRegexSrc();
  const aliasesJson = buildFirmAliasesJson();
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
    if (wrapper) {
      var sp = wrapper.querySelector('span');
      if (sp) player_id = (sp.textContent || '').trim();
    }
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
    function getText(el){ return el ? (el.textContent || '').trim() : ''; }
    function parseNum(s){ if (s == null || s === '') return null; var n = parseInt(String(s).replace(/\\s/g,'').replace(/[.,]/g,''), 10); return isNaN(n) ? null : n; }
    var body = (document.body && document.body.innerText) || document.documentElement.innerText || '';
    var initial_rank_points = null, next_rank_points = null, initial_rank = null;

    var amountCells = document.querySelectorAll('td.hof_units_amount');
    if (amountCells.length >= 1) initial_rank_points = parseNum(getText(amountCells[0]));
    if (amountCells.length >= 2 && next_rank_points === null) next_rank_points = parseNum(getText(amountCells[1]));

    var pNodes = document.querySelectorAll('p');
    for (var pi = 0; pi < pNodes.length; pi++) {
      var pText = getText(pNodes[pi]);
      if (pText.indexOf('grade suivant') !== -1 || pText.indexOf('points de grade') !== -1) {
        var nextM = pText.match(/(?:environ|total)?\\s*([\\d\\s.,]+)\\s*points?\\s*de\\s*grade/i) || pText.match(/([\\d\\s.,]+)\\s*points?/i);
        if (nextM && nextM[1] && next_rank_points === null) next_rank_points = parseNum(nextM[1]);
        var img = pNodes[pi].querySelector('img[src*="/ranks/"]');
        if (img && img.src && !initial_rank) { var m = img.src.match(/\\/ranks\\/([a-zA-Z0-9_-]+)\\./i); if (m) initial_rank = m[1].replace(/-/g,'_'); }
        break;
      }
    }

    if (initial_rank_points === null || next_rank_points === null) {
      var table = document.querySelector('.hof_ranking_table, table[class*="hof"], table[class*="ranking"]');
      if (table) {
        var cells = table.querySelectorAll('td');
        for (var i = 0; i < cells.length; i++) {
          var n = parseNum(getText(cells[i]));
          if (n !== null && n >= 0) {
            if (initial_rank_points === null) initial_rank_points = n;
            else if (next_rank_points === null) next_rank_points = n;
          }
        }
      }
    }
    if (!initial_rank) {
      var rankEl = document.querySelector('img[src*="/ranks/"], .rank_name_font, [class*="rank_"]');
      if (rankEl && rankEl.src) { var m = rankEl.src.match(/\\/ranks\\/([a-zA-Z0-9_-]+)\\./i); if (m) initial_rank = m[1].replace(/-/g,'_'); }
      else if (rankEl) initial_rank = getText(rankEl);
    }
    if (next_rank_points === null) {
      var nextM = body.match(/(?:point|points)?\\s*(?:avant|until|bis|to)\\s*(?:prochain|next)?\\s*(?:grade|rank)?[\\s:]*([\\d\\s.,]+)/i);
      if (nextM) next_rank_points = parseNum(nextM[1]);
    }

    return { initial_rank_points: initial_rank_points, next_rank_points: next_rank_points, initial_rank: initial_rank };
  } catch(e) { return { initial_rank_points: null, next_rank_points: null, initial_rank: null, _error: e.message }; }
})()`;

/**
 * Extrait le code serveur depuis une URL DarkOrbit.
 * Ex : https://gbl5.darkorbit.com/p/123/ → 'gbl5'
 *      https://fr1.darkorbit.com/...      → 'fr1'
 * Retourne null si non détectable.
 */
function extractServerFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname; // ex: gbl5.darkorbit.com
    const match = host.match(/^([a-z0-9_-]+)\.darkorbit\.com$/i);
    return match ? match[1] : null;
  } catch (_e) { return null; }
}

// ─── Utilitaires réseau ───────────────────────────────────────────────────────

function fetchJson(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${CDP_PORT}${endpoint}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse erreur sur ${endpoint}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => { req.destroy(); reject(new Error(`Timeout GET ${endpoint}`)); });
  });
}

async function waitForCdp() {
  for (let i = 0; i < CDP_RETRY_MAX; i++) {
    try {
      const json = await fetchJson('/json/version');
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
    } catch (_e) { /* pas encore disponible */ }
    await new Promise((r) => setTimeout(r, CDP_RETRY_MS));
  }
  throw new Error(`CDP non disponible après ${CDP_RETRY_MAX} tentatives (port ${CDP_PORT})`);
}

// ─── Détection des URLs de profil ────────────────────────────────────────────

function isProfileUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('/p/') || url.includes('indexInternal.es?action=internalUserDetails');
}

// ─── Envoi vers l'UI principale ───────────────────────────────────────────────

function emitToUI(channel, data) {
  if (_mainWindow && !_mainWindow.isDestroyed() && _mainWindow.webContents) {
    _mainWindow.webContents.send(channel, data);
  }
}

// ─── Traitement des paquets WebSocket ────────────────────────────────────────

function searchPatternsInBinary(base64Payload) {
  try {
    return searchPatternsInText(Buffer.from(base64Payload, 'base64').toString('utf8'));
  } catch (_e) { return null; }
}

/**
 * Normalise un texte brut vers MMO/EIC/VRU via la table d'alias (côté Node.js).
 * Même logique que la fonction normalize() injectée dans le DOM.
 */
function normalizeFirm(raw) {
  if (!raw) return null;
  const clean = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (FIRM_ALIASES[clean]) return FIRM_ALIASES[clean];
  for (const key of Object.keys(FIRM_ALIASES)) {
    if (clean.includes(key)) return FIRM_ALIASES[key];
  }
  const direct = clean.match(/\b(mmo|eic|vru)\b/i);
  return direct ? direct[1].toUpperCase() : null;
}

function searchPatternsInText(text) {
  if (!text || typeof text !== 'string') return null;
  const matches = [];
  let hasFirm = false;
  let hasPlayerId = false;

  // Correspondance directe des abréviations
  for (const firm of FIRM_PATTERNS) {
    if (text.includes(firm)) { matches.push(`firm:${firm}`); hasFirm = true; }
  }

  // Regex multilingue mot-clé + valeur suivante
  const firmMatch = text.match(FIRM_IN_TEXT);
  if (firmMatch && firmMatch[1]) {
    const norm = normalizeFirm(firmMatch[1]);
    if (norm) { matches.push(`firm:${norm}`); hasFirm = true; }
  }

  const playerMatch = text.match(PLAYER_ID_PATTERN);
  if (playerMatch && playerMatch[1]) { matches.push(`playerId:${playerMatch[1]}`); hasPlayerId = true; }

  if (matches.length === 0) return null;
  let type = 'both';
  if (hasFirm && !hasPlayerId) type = 'firm';
  else if (!hasFirm && hasPlayerId) type = 'player_id';
  return { type, matches };
}

function processWebSocketPayload(payloadData, direction, targetId) {
  if (!payloadData) return;
  const dirLabel = direction === 'sent' ? '[SENT]' : '[RECV]';
  const tag = targetId ? `[${targetId.slice(0, 8)}]` : '';
  let result = searchPatternsInText(payloadData);
  if (!result && /^[A-Za-z0-9+/=]+$/.test(payloadData)) result = searchPatternsInBinary(payloadData);
  if (result) {
    const preview = payloadData.length > 200 ? payloadData.slice(0, 200) + '...' : payloadData;
    console.log(`[ClientLauncher] ${tag} ${dirLabel} Paquet pertinent:`, result.matches);
    console.log(`[ClientLauncher] ${tag} ${dirLabel} Aperçu:`, preview.replace(/\s+/g, ' '));
    emitToUI('client-launcher:packet', {
      direction, matches: result.matches,
      preview: preview.slice(0, 300),
      targetId, timestamp: new Date().toISOString(),
    });
  }
}

// ─── Injection DOM dans les pages de profil ───────────────────────────────────

async function tryInjectFirmInPage(sub, url, targetId) {
  if (!isProfileUrl(url)) return;

  const tag = `[${targetId.slice(0, 8)}]`;
  console.log(`[ClientLauncher] Fenêtre de profil détectée : ${url}`);
  emitToUI('client-launcher:profile-detected', { url, targetId, timestamp: new Date().toISOString() });

  await new Promise((r) => setTimeout(r, INJECT_DELAY_MS));

  // ── Extraction de la firme ───────────────────────────────────────────────
  let firmResult = null;
  try {
    const res = await sub.Runtime.evaluate({
      expression: JS_EXTRACT_FIRM,
      returnByValue: true,
      awaitPromise: false,
    });
    firmResult = res?.result?.value ?? null;
  } catch (e) {
    console.warn(`[ClientLauncher] ${tag} Runtime.evaluate (firm) ÉCHEC:`, e?.message);
    return;
  }

  if (!firmResult || !firmResult.company) {
    console.log(`[ClientLauncher] ${tag} Firme introuvable dans le DOM (méthode: ${firmResult?.method ?? 'fail'}, erreur: ${firmResult?.error ?? '-'})`);
    return;
  }

  const kwLabel = firmResult.keyword ? `mot-clé '${firmResult.keyword}'` : `méthode '${firmResult.method}'`;
  console.log(`[ClientLauncher] Firme détectée via ${kwLabel} : ${firmResult.company}`);

  // ── Extraction du profil (pseudo + userId + server) ─────────────────────
  // Délai 2500 ms : laisse le temps aux éléments dynamiques (.name_stats,
  // .player_name) d'être injectés et aux placeholders d'être remplacés.
  await new Promise((r) => setTimeout(r, 2500));

  let profileInfo = { playerName: null, grade: 'Inconnu', userId: null, server: null, _debug: null };
  try {
    const res2 = await sub.Runtime.evaluate({
      expression: JS_EXTRACT_PROFILE_INFO,
      returnByValue: true,
      awaitPromise: false,
    });
    profileInfo = res2?.result?.value ?? profileInfo;
  } catch (e) {
    console.warn(`[ClientLauncher] ${tag} Runtime.evaluate (profile) ÉCHEC:`, e?.message);
  }

  // Log de debug si pseudo ou userId manquants
  if (!profileInfo.playerName || !profileInfo.userId) {
    const dbg = profileInfo._debug;
    console.warn(`[ClientLauncher] ${tag} Extraction incomplète — playerName="${profileInfo.playerName}" userId="${profileInfo.userId}"`);
    if (dbg) {
      console.warn(`[ClientLauncher] ${tag} DEBUG href="${dbg.href}" title="${dbg.title}" #nickname="${dbg.nickname}"`);
      if (dbg.error) console.warn(`[ClientLauncher] ${tag} DEBUG erreur script: ${dbg.error}`);
    }
  }

  // server : priorité window.location (depuis le script), fallback URL transmise
  const server = profileInfo.server || extractServerFromUrl(url);
  const payload = {
    pseudo:   profileInfo.playerName,
    grade:    profileInfo.grade ?? 'Inconnu',
    userId:   profileInfo.userId,
    company:  firmResult.company,
    method:   firmResult.method,
    keyword:  firmResult.keyword ?? null,
    server,
    url,
    targetId,
    date: new Date().toISOString(),
  };

  console.log(`[ClientLauncher] ${tag} Profil extrait — pseudo="${payload.pseudo}" grade="${payload.grade}" userId="${payload.userId}" server="${server}" firme="${payload.company}"`);

  // ── Notification UI (client-launcher:firm-found) ─────────────────────────
  emitToUI('client-launcher:firm-found', payload);

  // ── Sauvegarde via main.js ────────────────────────────────────────────────
  // ipcMain.emit permet d'envoyer un événement intra-processus sans passer
  // par le renderer, exactement comme un `ipcMain.on` classique.
  if (payload.company && (payload.pseudo || payload.userId) && server) {
    ipcMain.emit('client-launcher:save-data', null, payload);
  } else {
    console.warn(`[ClientLauncher] ${tag} Sauvegarde ignorée — données incomplètes (pseudo="${payload.pseudo}", userId="${payload.userId}", server="${server}")`);
  }
}

// ─── Attachement à une cible de page ─────────────────────────────────────────

async function attachToTarget(targetId, initialUrl) {
  const short = targetId.slice(0, 8);
  if (_targetClients.has(targetId)) {
    console.log(`[ClientLauncher] [${short}] Cible déjà attachée, skip`);
    return;
  }
  // Placeholder immédiat : bloque tout second appel concurrent sur le même targetId
  // avant que l'await CDP() ait terminé et que _targetClients.set(sub) soit exécuté.
  _targetClients.set(targetId, null);

  const CDP = require('chrome-remote-interface');
  let sub;
  try {
    sub = await CDP({ target: targetId, host: '127.0.0.1', port: CDP_PORT });
  } catch (e) {
    console.warn(`[ClientLauncher] [${short}] Connexion cible ÉCHEC:`, e?.message);
    _targetClients.delete(targetId); // libérer le placeholder en cas d'échec
    return;
  }

  _targetClients.set(targetId, sub);
  const tag = `[${targetId.slice(0, 8)}]`;

  // Tracker cette cible si c'est une page de profil (pour fermeture explicite après scan)
  if (isProfileUrl(initialUrl || '')) {
    _lastProfileTargetId = targetId;
    console.log(`[ClientLauncher] ${tag} Fenêtre profil trackée`);
  }

  // Network
  try {
    await sub.Network.enable();
    console.log(`[ClientLauncher] ${tag} Network.enable() OK`);
  } catch (e) {
    console.error(`[ClientLauncher] ${tag} Network.enable() ÉCHEC:`, e?.message, '| code:', e?.code, '| data:', JSON.stringify(e));
  }

  // Runtime (nécessaire pour Runtime.evaluate)
  try {
    await sub.Runtime.enable();
    console.log(`[ClientLauncher] ${tag} Runtime.enable() OK`);
  } catch (e) {
    console.warn(`[ClientLauncher] ${tag} Runtime.enable() ÉCHEC (non bloquant):`, e?.message);
  }

  // Page (pour suivre les navigations internes)
  try {
    await sub.Page.enable();
    console.log(`[ClientLauncher] ${tag} Page.enable() OK`);
  } catch (e) {
    console.warn(`[ClientLauncher] ${tag} Page.enable() ÉCHEC (non bloquant):`, e?.message);
  }

  // WebSocket
  sub.Network.webSocketCreated((params) => {
    console.log(`[ClientLauncher] ${tag} WS ouvert: ${params.url}`);
  });
  sub.Network.webSocketClosed((params) => {
    console.log(`[ClientLauncher] ${tag} WS fermé | requestId: ${params.requestId}`);
  });
  sub.Network.webSocketFrameReceived((params) => {
    const payload = params.response?.payloadData;
    if (payload) processWebSocketPayload(payload, 'received', targetId);
  });
  sub.Network.webSocketFrameSent((params) => {
    const payload = params.response?.payloadData;
    if (payload) processWebSocketPayload(payload, 'sent', targetId);
  });

  // HTTP — log des réponses DarkOrbit uniquement
  sub.Network.responseReceived((params) => {
    const url = params.response?.url || '';
    if (url.includes('darkorbit.com')) {
      console.log(`[ClientLauncher] ${tag} HTTP ${params.response.status} ${url}`);
    }
  });

  // Navigations dans cette cible → injection si page de profil
  sub.Page.frameNavigated((params) => {
    const url = params.frame?.url || '';
    if (isProfileUrl(url) && _lastProfileTargetId !== targetId) {
      _lastProfileTargetId = targetId;
      console.log(`[ClientLauncher] ${tag} Fenêtre profil trackée (navigation)`);
    }
    tryInjectFirmInPage(sub, url, targetId);
  });

  sub.on('disconnect', () => {
    console.log(`[ClientLauncher] ${tag} Déconnecté`);
    _targetClients.delete(targetId);
  });

  // Si la cible a déjà une URL de profil au moment de l'attachement
  if (initialUrl) await tryInjectFirmInPage(sub, initialUrl, targetId);
}

// ─── Sélection de la cible initiale ──────────────────────────────────────────

async function selectBestTarget() {
  const targets = await fetchJson('/json/list');

  console.log(`[ClientLauncher] CDP — ${targets.length} cible(s) détectée(s) sur le port ${CDP_PORT}:`);
  targets.forEach((t, i) => {
    console.log(`  [${i}] type="${t.type}" url="${t.url}" id="${t.id}" ws="${t.webSocketDebuggerUrl || '(none)'}"`);
  });

  const eligible = targets.filter((t) => t.webSocketDebuggerUrl);
  if (eligible.length === 0) throw new Error('Aucune cible CDP avec webSocketDebuggerUrl disponible');

  const darkorbitPage = eligible.find((t) => t.type === 'page' && t.url?.includes('darkorbit.com'));
  if (darkorbitPage) {
    console.log(`[ClientLauncher] Cible initiale (darkorbit.com): "${darkorbitPage.url}"`);
    return darkorbitPage;
  }
  const anyPage = eligible.find((t) => t.type === 'page');
  if (anyPage) {
    console.log(`[ClientLauncher] Cible initiale (page): "${anyPage.url}"`);
    return anyPage;
  }
  console.log(`[ClientLauncher] Cible initiale (fallback): type="${eligible[0].type}" url="${eligible[0].url}"`);
  return eligible[0];
}

// ─── Connexion principale ─────────────────────────────────────────────────────

async function connectAndIntercept(browserWsUrl) {
  const CDP = require('chrome-remote-interface');

  // ── Client browser-level (Target domain) ──
  _browserClient = await CDP({ target: browserWsUrl });
  console.log('[ClientLauncher] Client browser-level connecté:', browserWsUrl);

  // Activer la découverte des nouvelles cibles
  try {
    await _browserClient.Target.setDiscoverTargets({ discover: true });
    console.log('[ClientLauncher] Target.setDiscoverTargets OK — surveillance des nouvelles fenêtres active');
  } catch (e) {
    console.warn('[ClientLauncher] Target.setDiscoverTargets ÉCHEC:', e?.message,
      '— le fallback /json/list sera utilisé');
  }

  // Écouter les nouvelles cibles
  _browserClient.Target.targetCreated(async ({ targetInfo }) => {
    const { targetId, type, url } = targetInfo;
    console.log(`[ClientLauncher] Nouvelle cible détectée: type="${type}" url="${url}" id="${targetId}"`);
    if (type === 'page') {
      await attachToTarget(targetId, url);
    }
  });

  // Écouter les cibles modifiées (URL peut changer après navigation)
  _browserClient.Target.targetInfoChanged(async ({ targetInfo }) => {
    const { targetId, type, url } = targetInfo;
    if (type === 'page' && isProfileUrl(url) && !_targetClients.has(targetId)) {
      console.log(`[ClientLauncher] Cible mise à jour vers profil: ${url}`);
      await attachToTarget(targetId, url);
    }
  });

  // Écouter les fermetures de cibles
  _browserClient.Target.targetDestroyed(({ targetId }) => {
    const sub = _targetClients.get(targetId);
    if (sub) {
      sub.close().catch(() => {});
      _targetClients.delete(targetId);
      console.log(`[ClientLauncher] Cible fermée: ${targetId.slice(0, 8)}`);
    }
  });

  // ── Attacher toutes les pages existantes ──
  let existingTargets;
  try {
    existingTargets = await fetchJson('/json/list');
  } catch (e) {
    console.warn('[ClientLauncher] Impossible de lister les cibles existantes:', e?.message);
    existingTargets = [];
  }
  const pageTargets = existingTargets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  console.log(`[ClientLauncher] Attachement aux ${pageTargets.length} page(s) existante(s)...`);
  await Promise.all(pageTargets.map((t) => attachToTarget(t.id, t.url)));

  return _browserClient;
}

// ─── API publique ─────────────────────────────────────────────────────────────

async function launch(opts = {}) {
  _mainWindow = opts.mainWindow || _mainWindow;
  let clientPath = opts.clientPath || getSavedClientPath() || DEFAULT_CLIENT_PATH;

  if (_clientProcess) return { ok: false, error: 'Client déjà lancé' };

  if (!clientPath || !fs.existsSync(clientPath)) {
    const win = _mainWindow || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win || {}, {
      title: 'Sélectionner DarkOrbit.exe',
      defaultPath: process.env.LOCALAPPDATA || 'C:\\',
      filters: [{ name: 'Exécutable', extensions: ['exe'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, error: 'Chemin DarkOrbit.exe non fourni.' };
    }
    clientPath = result.filePaths[0];
    saveClientPath(clientPath);
  }

  return new Promise((resolve) => {
    const args = [`--remote-debugging-port=${CDP_PORT}`];
    _clientProcess = spawn(clientPath, args, {
      cwd: path.dirname(clientPath),
      detached: true,
      stdio: 'ignore',
    });
    _clientProcess.unref();

    const pid = _clientProcess.pid;
    console.log(`[ClientLauncher] Client lancé PID=${pid} avec --remote-debugging-port=${CDP_PORT}`);

    _clientProcess.on('error', (err) => {
      console.error('[ClientLauncher] Erreur processus:', err?.message);
      _clientProcess = null;
      resolve({ ok: false, error: err?.message });
    });
    _clientProcess.on('exit', (code, signal) => {
      console.log(`[ClientLauncher] Client terminé code=${code} signal=${signal}`);
      _clientProcess = null;
      _scanStopRequested = true;
      console.log('[ClientLauncher] Client fermé — scan interrompu');
      _closeAllClients();
    });

    (async () => {
      try {
        console.log(`[ClientLauncher] Attente ${CDP_INIT_DELAY_MS / 1000}s avant connexion CDP...`);
        await new Promise((r) => setTimeout(r, CDP_INIT_DELAY_MS));

        const browserWsUrl = await waitForCdp();
        console.log('[ClientLauncher] CDP disponible:', browserWsUrl);

        await connectAndIntercept(browserWsUrl);
        resolve({ ok: true, pid });
      } catch (e) {
        console.warn('[ClientLauncher] CDP non disponible:', e?.message);
        resolve({
          ok: true, pid,
          error: `Client lancé mais CDP non disponible: ${e?.message}. Le client officiel Unity ne supporte pas CDP.`,
        });
      }
    })();
  });
}

function _closeAllClients() {
  for (const [, sub] of _targetClients) {
    sub.close().catch(() => {});
  }
  _targetClients.clear();
  if (_browserClient) {
    _browserClient.close().catch(() => {});
    _browserClient = null;
  }
}

function stop() {
  if (_clientProcess) {
    try { _clientProcess.kill('SIGTERM'); } catch (_e) { _clientProcess.kill('SIGKILL'); }
    _clientProcess = null;
  }
  _closeAllClients();
  console.log('[ClientLauncher] Client arrêté');
  return { ok: true };
}

function getState() {
  return {
    running: !!_clientProcess,
    pid: _clientProcess?.pid,
    watchedTargets: _targetClients.size,
  };
}

function init(mainWindow) {
  _mainWindow = mainWindow;
}

// ─── Helpers scan ─────────────────────────────────────────────────────────────

function _makeScanSupabase() {
  const url     = process.env.SUPABASE_URL     || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  const token   = global.supabaseAccessToken   || null;
  const opts    = token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {};
  return createClient(url, anonKey, opts);
}

function _emitScan(channel, data) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send(channel, data);
  }
}

/**
 * Navigue un CDPClient (sub) vers une URL et attend Page.loadEventFired ou timeout 20 s.
 * Enregistre le listener AVANT d'appeler navigate pour éviter la race condition.
 */
function _cdpNavigate(sub, url) {
  return new Promise((resolve) => {
    let done = false;
    function cleanup() {
      sub.removeListener('Page.loadEventFired', onLoad);
      clearTimeout(timer);
    }
    function onLoad() {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    }
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    }, 20000);
    sub.Page.loadEventFired(onLoad);
    sub.Page.navigate({ url }).catch(() => {
      if (!done) { done = true; cleanup(); resolve(); }
    });
  });
}

/**
 * Retourne le premier CDPClient page-level disponible dans _targetClients.
 * Lance une erreur si CDP n'est pas connecté (launch() n'a pas encore été appelé).
 */
function _getActiveSub() {
  for (const [, sub] of _targetClients) {
    return sub;
  }
  throw new Error('Aucun CDPClient disponible — lance DarkOrbit.exe via launch() avant startScan()');
}

/**
 * Vérifie si la page actuelle correspond à une session DarkOrbit authentifiée.
 */
function _isLoggedIn(url) {
  return (
    url.includes('indexInternal') ||
    url.includes('internalHallofFame') ||
    url.includes('internalStart') ||
    url.includes('internalHome')
  );
}

/** Page d'accueil post-login : internalStart&prc=100 — déclenche le scrape home. */
function _isOnHomeStart(url) {
  return url.includes('internalStart') && url.includes('prc=100');
}

/**
 * Connecte le CDPClient au serveur DarkOrbit donné.
 * Tente d'abord la navigation directe (cookies session), puis login par formulaire.
 * Retourne true si connecté avec succès.
 *
 * @param {CDPClient} sub      Client CDP page-level (_targetClients)
 * @param {string} serverId    Code serveur (ex: "gbl5")
 * @param {string} username    Identifiant DarkOrbit
 * @param {string} password    Mot de passe DarkOrbit
 */
async function _loginToServer(sub, serverId, username, password) {
  const hofUrl = `https://${serverId}.darkorbit.com/indexInternal.es?action=internalHallofFame&view=User`;

  console.log(`[ClientLauncher] _loginToServer — serveur=${serverId} user=${username}`);

  // ── Tentative directe (cookies potentiellement valides) ────────────────────
  await _cdpNavigate(sub, hofUrl);
  await new Promise((r) => setTimeout(r, 2000));

  const urlRes = await sub.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true });
  const urlAfterCookies = urlRes?.result?.value || '';
  const cookieOk = _isLoggedIn(urlAfterCookies);
  console.log(`[ClientLauncher] _loginToServer — après cookies : url=${urlAfterCookies} connecté=${cookieOk}`);
  if (cookieOk) return true;

  // ── Cookies expirés → login par formulaire ─────────────────────────────────
  await _cdpNavigate(sub, `https://${serverId}.darkorbit.com/`);
  await new Promise((r) => setTimeout(r, 2000));

  const loginUrlRes = await sub.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true });
  console.log(`[ClientLauncher] _loginToServer — page login chargée : ${loginUrlRes?.result?.value}`);

  // Acceptation bannière cookies
  const bannerRes = await sub.Runtime.evaluate({
    expression: `(function(){
      const btn = document.querySelector(
        '#consent-button, .cookie-accept, [id*="cookie"] button, .accept-btn, button[data-accept]'
      );
      if (btn) { btn.click(); return true; }
      return false;
    })()`,
    returnByValue: true,
    awaitPromise: false,
  }).catch(() => null);
  if (bannerRes?.result?.value) {
    console.log('[ClientLauncher] _loginToServer — bannière cookies acceptée');
    await new Promise((r) => setTimeout(r, 800));
  }

  // Remplissage formulaire "bgcdw_login_form"
  const fillRes = await sub.Runtime.evaluate({
    expression: `(function(){
      const form = document.querySelector('form[name="bgcdw_login_form"], form.bgcdw_login_form');
      if (!form) {
        var allForms = Array.from(document.querySelectorAll('form')).map(f => f.name || f.className || f.id || '?');
        return { ok: false, reason: 'form_not_found', forms: allForms };
      }
      const userEl = form.querySelector('#bgcdw_login_form_username, [name="username"]');
      const passEl = form.querySelector('#bgcdw_login_form_password, [type="password"]');
      if (!userEl) return { ok: false, reason: 'username_field_not_found' };
      if (!passEl) return { ok: false, reason: 'password_field_not_found' };
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(userEl, ${JSON.stringify(username)});
      userEl.dispatchEvent(new Event('input',  { bubbles: true }));
      userEl.dispatchEvent(new Event('change', { bubbles: true }));
      nativeSetter.call(passEl, ${JSON.stringify(password)});
      passEl.dispatchEvent(new Event('input',  { bubbles: true }));
      passEl.dispatchEvent(new Event('change', { bubbles: true }));
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn) { submitBtn.click(); return { ok: true, method: 'button' }; }
      form.submit();
      return { ok: true, method: 'form.submit' };
    })()`,
    returnByValue: true,
    awaitPromise: false,
  }).catch((err) => ({ result: { value: { ok: false, reason: 'cdp_error', error: err?.message } } }));

  const fillResult = fillRes?.result?.value ?? { ok: false, reason: 'evaluate_null' };
  console.log(`[ClientLauncher] _loginToServer — remplissage formulaire :`, JSON.stringify(fillResult));

  if (!fillResult?.ok) return false;

  // Attendre la redirection post-login (Bigpoint → retour DarkOrbit)
  await new Promise((r) => setTimeout(r, 5000));

  const finalUrlRes = await sub.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true });
  const finalUrl = finalUrlRes?.result?.value || '';
  const loggedIn = _isLoggedIn(finalUrl);
  console.log(`[ClientLauncher] _loginToServer — résultat final : url=${finalUrl} connecté=${loggedIn}`);
  return loggedIn;
}

/**
 * Récupère depuis shared_rankings_snapshots les joueurs sans company pour le serveur donné.
 * Seuls les joueurs avec un userId valide sont retournés (clé de jointure pour l'URL directe).
 */
async function _getPlayersWithoutCompany(serverId) {
  try {
    const supabase = _makeScanSupabase();
    const { data, error } = await supabase
      .from('shared_rankings_snapshots')
      .select('players_json')
      .eq('server_id', serverId)
      .order('scraped_at', { ascending: false })
      .limit(1)
      .single();
    if (error || !Array.isArray(data?.players_json)) return [];
    return data.players_json
      .filter((p) => p.userId && typeof p.userId === 'string' && p.userId.trim() !== '' && (!p.company || p.company === ''))
      .map((p) => ({ name: p.name, userId: p.userId }));
  } catch (e) {
    console.warn('[ClientLauncher] _getPlayersWithoutCompany:', e?.message);
    return [];
  }
}

// ─── API publique scan ─────────────────────────────────────────────────────────

/**
 * Pour chaque serveur configuré, récupère les joueurs sans company depuis shared_rankings_snapshots.
 * (Enrichissement company supprimé.)
 */
async function startScan(opts = {}) {
  if (_scanRunning) return { ok: false, error: 'Scan déjà en cours' };

  _scanRunning = true;
  _scanStopRequested = false;
  _mainWindow = opts.mainWindow || _mainWindow;

  const scanStart = Date.now();
  const stats = { total: 0, success: 0, failed: 0 };
  const DarkOrbitAccounts = require('./darkorbit-accounts');

  try {
    const accounts = DarkOrbitAccounts.getScraperAccounts();
    if (accounts.length === 0) return { ok: false, error: 'Aucun compte DarkOrbit configuré' };

    for (let ai = 0; ai < accounts.length; ai++) {
      if (_scanStopRequested) break;
      const { server_id } = accounts[ai];

      _emitScan('client-launcher:scan-progress', {
        server: server_id, playerName: null, status: 'fetching',
        serverIdx: ai + 1, serverTotal: accounts.length,
        timestamp: new Date().toISOString(),
      });

      try {
        const players = await _getPlayersWithoutCompany(server_id);
        const total = players.length;

        console.log(`[ClientLauncher] ${server_id} : ${total} joueur(s) sans company`);
        _emitScan('client-launcher:scan-progress', {
          server: server_id, playerName: null, status: 'scan_start',
          playerTotal: total, serverIdx: ai + 1, serverTotal: accounts.length,
          timestamp: new Date().toISOString(),
        });

        if (total === 0) continue;
        stats.total += total;

        _emitScan('client-launcher:scan-progress', {
          server: server_id, playerName: null, status: 'scan_done',
          playerTotal: total, saved: 0, serverIdx: ai + 1, serverTotal: accounts.length,
          timestamp: new Date().toISOString(),
        });
        _emitScan('client-launcher:scan-stats', { ...stats, server: server_id });

      } catch (e) {
        console.error(`[ClientLauncher] Scan serveur ${server_id}:`, e?.message);
        _emitScan('client-launcher:scan-progress', {
          server: server_id, playerName: null, status: 'error',
          error: e?.message || 'Erreur inconnue',
          timestamp: new Date().toISOString(),
        });
      }
    }

    const duration = Date.now() - scanStart;
    _emitScan('client-launcher:scan-done', { totalServers: accounts.length, totalPlayers: stats.total, duration, stats });
    return { ok: true, stats };
  } catch (e) {
    console.error('[ClientLauncher] startScan exception:', e?.message);
    return { ok: false, error: e?.message };
  } finally {
    _scanRunning = false;
  }
}

function stopScan() {
  _scanStopRequested = true;
  console.log('[ClientLauncher] Scan arrêté par l\'utilisateur');
  return { ok: true };
}

function getScanState() {
  return {
    running: _scanRunning,
    stopRequested: _scanStopRequested,
  };
}

/**
 * Récolte stats joueur depuis le client Flash (page d'accueil + page Classement / Votre Grade).
 * Prérequis : client Dark Orbit Flash lancé avec --remote-debugging-port=9222, utilisateur connecté.
 * opts.clientPath : chemin exe Flash (optionnel ; si fourni et client non lancé, on lance le client).
 * opts.mainWindow : fenêtre principale (pour launch).
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
async function collectPlayerStats(opts = {}) {
  _mainWindow = opts.mainWindow || _mainWindow;
  let result;

  try {
    if (!_clientProcess && opts.clientPath) {
      const launchResult = await launch({ clientPath: opts.clientPath, mainWindow: opts.mainWindow });
      if (!launchResult.ok) {
        result = { ok: false, error: launchResult.error || 'Échec lancement client' };
        return result;
      }
    } else if (!_clientProcess) {
      try {
        const wsUrl = await waitForCdp();
        await connectAndIntercept(wsUrl);
      } catch (e) {
        result = { ok: false, error: 'Client Dark Orbit non détecté. Lancez le client Flash avec l\'option de débogage (port 9222) ou renseignez le chemin du client dans les paramètres.' };
        return result;
      }
    }

    if (_targetClients.size === 0) {
      result = { ok: false, error: 'Aucune page Dark Orbit détectée.' };
      return result;
    }

    let sub;
    try {
      sub = _getActiveSub();
    } catch (e) {
      result = { ok: false, error: 'Aucun client CDP disponible.' };
      return result;
    }

    const loggedInDeadline = Date.now() + 90000;
    let currentUrl = '';
    while (Date.now() < loggedInDeadline) {
      const res = await sub.Runtime.evaluate({ expression: 'window.location.href', returnByValue: true });
      currentUrl = res?.result?.value || '';
      if (_isLoggedIn(currentUrl)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!_isLoggedIn(currentUrl)) {
      result = { ok: false, error: 'Connexion au jeu non détectée. Connectez-vous puis réessayez.' };
      return result;
    }

    let server = extractServerFromUrl(currentUrl);
    if (!server) {
      result = { ok: false, error: 'Serveur non détecté.' };
      return result;
    }

    if (!_isOnHomeStart(currentUrl)) {
      const homeStartUrl = `https://${server}.darkorbit.com/indexInternal.es?action=internalStart&prc=100`;
      await _cdpNavigate(sub, homeStartUrl);
    }
    console.log('[ClientLauncher] Attente ' + (HOME_DOM_READY_MS / 1000) + 's (DOM page d\'accueil)...');
    await new Promise((r) => setTimeout(r, HOME_DOM_READY_MS));

    const homeRes = await sub.Runtime.evaluate({ expression: JS_EXTRACT_HOME_STATS, returnByValue: true });
    const home = homeRes?.result?.value ?? {};
    console.log('[ClientLauncher] Scan home (internalStart) récupéré:', JSON.stringify(home, null, 2));
    server = home.server || server;
    if (!server) {
      result = { ok: false, error: 'Serveur non détecté.' };
      return result;
    }

    const rankUrl = `https://${server}.darkorbit.com/indexInternal.es?action=internalHallofFame&view=dailyRank`;
    await _cdpNavigate(sub, rankUrl);
    console.log('[ClientLauncher] Attente ' + (RANK_PAGE_READY_MS / 1000) + 's (page Classement)...');
    await new Promise((r) => setTimeout(r, RANK_PAGE_READY_MS));

    const rankRes = await sub.Runtime.evaluate({ expression: JS_EXTRACT_RANK_PAGE, returnByValue: true });
    const rank = rankRes?.result?.value ?? {};
    console.log('[ClientLauncher] Scan rank (dailyRank) récupéré:', JSON.stringify(rank, null, 2));

    const data = {
      server,
      game_pseudo: home.game_pseudo || null,
      player_id: home.player_id || null,
      company: home.company || null,
      initial_rank: rank.initial_rank || home.initial_rank || null,
      initial_xp: home.initial_xp != null ? home.initial_xp : null,
      initial_honor: home.initial_honor != null ? home.initial_honor : null,
      initial_rank_points: rank.initial_rank_points != null ? rank.initial_rank_points : null,
      next_rank_points: rank.next_rank_points != null ? rank.next_rank_points : null,
    };
    console.log('[ClientLauncher] Scan terminé — données fusionnées:', JSON.stringify(data, null, 2));
    result = { ok: true, data };
    return result;
  } finally {
    // Le renderer ferme le client après enregistrement Supabase + session (stats-collect-auto)
  }
}

module.exports = { init, launch, stop, getState, startScan, stopScan, getScanState, collectPlayerStats, DEFAULT_CLIENT_PATH };
