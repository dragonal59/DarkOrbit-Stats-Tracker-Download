// ==========================================
// CLASSEMENT — UI (filtres, tableau, popup)
// ==========================================

var _lastRankingFilters = null;
var _rankingRenderToken = 0;
var _rankingCompanyFilter = null;
var _renderRankingFn = null; // Exposé pour délégation document (filtre firme)
var _lastRankingData = [];
var _currentRankingDetailRow = null;
var _playerMatchKey = null;
var _hasScrolledToPlayer = false;
var _rankingPlayerSearchTerm = '';

// Init classement : une seule fois (évite listeners / onSaveSuccess dupliqués et reset du throttle)
var _rankingTabInitialized = false;
var _lastRefreshRankingAt = 0;
var REFRESH_RANKING_THROTTLE_MS = 30000;
var _rankingCdpSaveHookRegistered = false;

function tryRegisterRankingCdpRefreshHook() {
  _rankingCdpSaveHookRegistered = true;
}

// Cache local pour les classements All Time (indépendants des filtres période)
// Structure : { honor: { [serverCode]: rows[] }, xp: { ... }, rank_points: { ... } }
var _allTimeRankingCache = {
  honor: {},
  xp: {},
  rank_points: {}
};

// Cache classements 24h par serveur pour le delta « joueur suivi 24h » dans la sidebar
// Structure : { [serverCode]: { honor: rows[], xp: rows[], rank_points: rows[] } }
var _last24hByServer = {};
var _rpDeltaByServer = {}; // { srv: { userId: deltaRp, _readyRp: true } }

// Même liste que formulaire d'inscription (config.js SERVERS_LIST), avec "Tous les serveurs" en premier
const RANKING_SERVERS = typeof SERVERS_LIST !== 'undefined' && Array.isArray(SERVERS_LIST) ? ['Tous les serveurs', ...SERVERS_LIST] : ['Tous les serveurs'];

const INVALID_GRADE_PATTERN = /^(splitter_|spacer_|line_|decoration|unknown)/i;

function parseLooseRankingNumber(n) {
  if (n == null || n === undefined || n === '') return NaN;
  if (typeof n === 'number') return Number.isFinite(n) ? n : NaN;
  const s = String(n).replace(/,/g, '').replace(/\s/g, '');
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : NaN;
}

function formatRankingNumber(n) {
  if (n == null || n === undefined) return '—';
  const num = parseLooseRankingNumber(n);
  if (!Number.isFinite(num)) return '—';
  const parts = String(num).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function normalizeGgJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    } catch (_e) {
      return null;
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}

function ggBucketNumeric(v) {
  if (v == null) return NaN;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const x =
      v.score != null
        ? v.score
        : v.points != null
          ? v.points
          : v.value != null
            ? v.value
            : v.kills != null
              ? v.kills
              : v.total != null
                ? v.total
                : null;
    return parseLooseRankingNumber(x);
  }
  return parseLooseRankingNumber(v);
}

function formatGgJsonCell(v) {
  const n = ggBucketNumeric(v);
  return Number.isFinite(n) ? formatRankingNumber(n) : '—';
}

/** 6 tuiles périodes (clés DOStats / scraper : last_100d, last_365d pour année). */
var GG_PERIOD_TILES_DEF = [
  { i18nKey: 'gg_period_label_total', keys: ['current'] },
  { i18nKey: 'gg_period_label_24h', keys: ['last_24h', 'last_24'] },
  { i18nKey: 'gg_period_label_7d', keys: ['last_7d'] },
  { i18nKey: 'gg_period_label_30d', keys: ['last_30d'] },
  { i18nKey: 'gg_period_label_90d', keys: ['last_90d', 'last_100d'] },
  { i18nKey: 'gg_period_label_year', keys: ['last_365d', 'last_year'] }
];

var GG_GATE_ORDER = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda', 'kronos', 'hades', 'kuipper', 'other'];

var GG_IMG_MAP = { lambda: 'lamba_gate', other: 'kuipper_gate', kuiper: 'kuipper_gate' };

var _ggModalState = { row: null, tree: null, drillKey: null, drillI18nKey: null };

function ggTranslate(i18nKey) {
  if (typeof window.i18nT === 'function' && i18nKey) {
    var s = window.i18nT(i18nKey);
    if (s != null && String(s).trim() !== '') return String(s);
  }
  return String(i18nKey || '');
}

function ggParseStatsMaybe(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      var p = JSON.parse(raw);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    } catch (_e) {
      return null;
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}

function ggResolvePeriodEntry(tree, keyCandidates) {
  if (!tree || typeof tree !== 'object') return null;
  for (var i = 0; i < keyCandidates.length; i++) {
    var k = keyCandidates[i];
    if (tree[k] != null && typeof tree[k] === 'object') return { storageKey: k, node: tree[k] };
  }
  return null;
}

function ggSumPeriodTotal(node) {
  if (!node || typeof node !== 'object') return NaN;
  if (node.galaxy_gates && typeof node.galaxy_gates === 'object') {
    var sum = 0;
    var any = false;
    for (var gk in node.galaxy_gates) {
      if (gk === 'total') continue;
      var gv = node.galaxy_gates[gk];
      if (gv == null) continue;
      var n = parseLooseRankingNumber(gv);
      if (Number.isFinite(n)) {
        sum += n;
        any = true;
      }
    }
    if (any) return sum;
  }
  if (node.score != null || node.points != null || node.value != null || node.rank != null) {
    return ggBucketNumeric(node);
  }
  return NaN;
}

function ggGetGatesMapForPeriod(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.galaxy_gates && typeof node.galaxy_gates === 'object') {
    var out = {};
    var any = false;
    for (var k in node.galaxy_gates) {
      var v = node.galaxy_gates[k];
      if (v == null) continue;
      out[k] = v;
      any = true;
    }
    return any ? out : null;
  }
  var skip = {
    rank: 1,
    score: 1,
    points: 1,
    value: 1,
    hours: 1,
    galaxy_gates: 1,
    top_user: 1,
    experience: 1,
    honor: 1,
    alien_kills: 1,
    ship_kills: 1
  };
  var out2 = {};
  var any2 = false;
  for (var pk in node) {
    if (skip[pk]) continue;
    var nv = node[pk];
    if (nv != null && typeof nv !== 'object') {
      out2[pk] = nv;
      any2 = true;
    }
  }
  return any2 ? out2 : null;
}

/** Portail avec la plus grande valeur sur la période (ex aequo → ordre GG_GATE_ORDER). */
function ggMaxGateEntry(node) {
  var map = ggGetGatesMapForPeriod(node);
  if (!map || !Object.keys(map).length) {
    var tOnly = ggSumPeriodTotal(node);
    return Number.isFinite(tOnly) ? { gateKey: null, value: tOnly } : null;
  }
  var bestK = null;
  var bestV = -Infinity;
  var bestRank = 999;
  for (var k in map) {
    if (k === 'total') continue;
    var n = parseLooseRankingNumber(map[k]);
    if (!Number.isFinite(n)) continue;
    var ir = GG_GATE_ORDER.indexOf(String(k).toLowerCase());
    var rnk = ir === -1 ? 500 : ir;
    if (n > bestV || (n === bestV && rnk < bestRank)) {
      bestV = n;
      bestK = k;
      bestRank = rnk;
    }
  }
  if (bestK == null) {
    var t2 = ggSumPeriodTotal(node);
    return Number.isFinite(t2) ? { gateKey: null, value: t2 } : null;
  }
  return { gateKey: bestK, value: bestV };
}

function buildGgTreeFromRow(row) {
  var gj = normalizeGgJson(row && row.galaxy_gates_json);
  var st = ggParseStatsMaybe(row && row.stats);
  var list = [];
  if (st) list.push(st);
  if (gj) list.push(gj);
  var li;
  for (li = 0; li < list.length; li++) {
    var raw = list[li];
    if (!raw || typeof raw !== 'object') continue;
    var nPeriod = 0;
    var pi;
    for (pi = 0; pi < GG_PERIOD_TILES_DEF.length; pi++) {
      if (ggResolvePeriodEntry(raw, GG_PERIOD_TILES_DEF[pi].keys)) nPeriod++;
    }
    if (nPeriod >= 2) return raw;
  }
  if (gj && typeof gj === 'object') {
    var gateKeys = {
      alpha: 1,
      beta: 1,
      gamma: 1,
      delta: 1,
      epsilon: 1,
      zeta: 1,
      kappa: 1,
      lambda: 1,
      kronos: 1,
      hades: 1,
      other: 1,
      kuiper: 1
    };
    var tops = Object.keys(gj);
    var nGate = tops.filter(function (k) {
      return gateKeys[k.toLowerCase()];
    }).length;
    if (nGate >= 1) {
      var inner = {};
      var ti;
      for (ti = 0; ti < tops.length; ti++) {
        var tk = tops[ti];
        if (gateKeys[tk.toLowerCase()]) inner[tk] = gj[tk];
      }
      return { current: { galaxy_gates: Object.keys(inner).length ? inner : gj } };
    }
  }
  return gj || st || null;
}

function rowHasGalaxyGatesPopupData(row) {
  var t = buildGgTreeFromRow(row);
  return t != null && typeof t === 'object' && Object.keys(t).length > 0;
}

function ggModalGetGridEl() {
  var modal = document.getElementById('ranking-gg-modal');
  return modal ? modal.querySelector('[data-gg-modal-tbody]') : null;
}

function ggModalRenderPeriodTilesView() {
  var grid = ggModalGetGridEl();
  if (!grid) return;
  var tree = _ggModalState.tree;
  var html = [];
  var i;
  for (i = 0; i < GG_PERIOD_TILES_DEF.length; i++) {
    var def = GG_PERIOD_TILES_DEF[i];
    var hit = tree ? ggResolvePeriodEntry(tree, def.keys) : null;
    var sk = hit ? hit.storageKey : '';
    var node = hit ? hit.node : null;
    var maxEntry = node ? ggMaxGateEntry(node) : null;
    var fmt = maxEntry && Number.isFinite(maxEntry.value) ? formatRankingNumber(maxEntry.value) : '—';
    var active = maxEntry && Number.isFinite(maxEntry.value) && maxEntry.value > 0;
    var cls = 'gg-gate-card gg-period-tile' + (active ? ' gg-gate-card--active' : '') + (sk ? '' : ' gg-period-tile--empty');
    var periodText = ggTranslate(def.i18nKey);
    var imgHtml = '';
    if (maxEntry && maxEntry.gateKey) {
      var lk = String(maxEntry.gateKey).toLowerCase();
      var imgKey = GG_IMG_MAP[lk] || lk + '_gate';
      var imgSrc = 'img/gates/' + imgKey + '.png';
      imgHtml =
        '<div class="gg-period-tile-img-wrap">' +
        '<img class="gg-period-tile-img" src="' +
        escapeHtml(imgSrc) +
        '" alt="" onerror="this.style.opacity=\'0.15\'">' +
        '</div>';
    } else {
      imgHtml = '<div class="gg-period-tile-img-wrap gg-period-tile-img-wrap--empty"></div>';
    }
    var inner =
      '<div class="gg-period-tile-stack">' +
      '<span class="gg-period-tile-label">' +
      escapeHtml(periodText) +
      '</span>' +
      imgHtml +
      '<span class="gg-period-tile-value gg-gate-count' +
      (active ? ' gg-gate-count--active' : '') +
      '">' +
      fmt +
      '</span>' +
      '</div>';
    if (sk) {
      html.push(
        '<button type="button" class="' +
          cls +
          '" data-gg-period-key="' +
          escapeHtml(sk) +
          '" data-gg-period-i18n="' +
          escapeHtml(def.i18nKey) +
          '">' +
          inner +
          '</button>'
      );
    } else {
      html.push('<div class="' + cls + '">' + inner + '</div>');
    }
  }
  grid.innerHTML = html.join('');
}

function ggModalRenderDrillGatesView(gatesMap) {
  var grid = ggModalGetGridEl();
  if (!grid) return;
  var entries = Object.entries(gatesMap || {});
  entries.sort(function (a, b) {
    var ia = GG_GATE_ORDER.indexOf(String(a[0]).toLowerCase());
    var ib = GG_GATE_ORDER.indexOf(String(b[0]).toLowerCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return String(a[0]).localeCompare(String(b[0]));
  });
  var parts = [];
  var j;
  for (j = 0; j < entries.length; j++) {
    var k = entries[j][0];
    var v = entries[j][1];
    var lk = String(k).toLowerCase();
    var n = parseLooseRankingNumber(v);
    var active = Number.isFinite(n) && n > 0;
    var display = Number.isFinite(n) ? formatRankingNumber(n) : '—';
    var label = k.charAt(0).toUpperCase() + k.slice(1);
    var noImg = lk === 'total';
    var imgKey = GG_IMG_MAP[lk] || lk + '_gate';
    var imgSrc = 'img/gates/' + imgKey + '.png';
    var imgBlock = noImg
      ? ''
      : '<div class="gg-gate-img-wrap">' +
        '<img class="gg-gate-img" src="' +
        escapeHtml(imgSrc) +
        '" alt="' +
        escapeHtml(label) +
        '" onerror="this.parentElement.style.display=\'none\'">' +
        '</div>';
    var cardCls = 'gg-gate-card' + (noImg ? ' gg-gate-card--period' : '') + (active ? ' gg-gate-card--active' : '');
    parts.push(
      '<div class="' +
        cardCls +
        '">' +
        imgBlock +
        '<div class="gg-gate-info">' +
        '<span class="gg-gate-name">' +
        escapeHtml(label) +
        '</span>' +
        '<span class="gg-gate-count' +
        (active ? ' gg-gate-count--active' : '') +
        '">' +
        display +
        '</span>' +
        '</div>' +
        '</div>'
    );
  }
  grid.innerHTML = parts.join('');
}

function ggModalShowPeriodView() {
  _ggModalState.drillKey = null;
  _ggModalState.drillI18nKey = null;
  var modal = document.getElementById('ranking-gg-modal');
  var sub = modal && modal.querySelector('[data-gg-modal-sub]');
  if (sub) sub.textContent = '';
  var back = modal && modal.querySelector('[data-gg-back]');
  if (back) back.hidden = true;
  ggModalRenderPeriodTilesView();
}

function ggModalDrillToPeriod(storageKey, periodI18nKey) {
  var tree = _ggModalState.tree;
  if (!tree || !storageKey) return;
  var node = tree[storageKey];
  if (!node || typeof node !== 'object') return;
  var gatesMap = ggGetGatesMapForPeriod(node);
  if (!gatesMap || !Object.keys(gatesMap).length) {
    var t = ggSumPeriodTotal(node);
    gatesMap = Number.isFinite(t) ? { total: t } : {};
  }
  ggModalRenderDrillGatesView(gatesMap);
  _ggModalState.drillKey = storageKey;
  _ggModalState.drillI18nKey = periodI18nKey || null;
  var modal = document.getElementById('ranking-gg-modal');
  var sub = modal && modal.querySelector('[data-gg-modal-sub]');
  var ptxt = periodI18nKey ? ggTranslate(periodI18nKey) : '';
  if (sub) sub.textContent = ptxt ? ' · ' + ptxt : '';
  var back = modal && modal.querySelector('[data-gg-back]');
  if (back) back.hidden = false;
}

function normalizeRankName(s) {
  if (!s || typeof s !== 'string') return '';
  return s.replace(/\u2019/g, "'").replace(/\u2018/g, "'").trim();
}

function normalizeRankKey(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
}

function normalizeRankKeyTr(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
}

function rankLower(s, lang) {
  if (!s || typeof s !== 'string') return '';
  return lang === 'tr' ? s.toLocaleLowerCase('tr-TR') : s.toLowerCase();
}

const COMPANY_LETTERS = { mmo: 'MMO', eic: 'EIC', vru: 'VRU' };
function getCompanyBadgeKey(company) {
  if (!company || typeof company !== 'string') return '';
  const c = String(company).trim().toLowerCase();
  return COMPANY_LETTERS[c] ? c : '';
}
function getCompanyBadgeText(company) {
  const key = getCompanyBadgeKey(company);
  if (key) return COMPANY_LETTERS[key];
  if (company == null) return '';
  return String(company).trim().toUpperCase();
}
function getCompanyBadgeClass(company) {
  const key = getCompanyBadgeKey(company);
  if (!key) return 'company-other';
  return key === 'mmo' ? 'company-mmo' : (key === 'eic' ? 'company-eic' : 'company-vru');
}
function getCompanyBadgeHtml(company) {
  const text = getCompanyBadgeText(company);
  if (!text) return '';
  const cls = getCompanyBadgeClass(company);
  return '<span class="company-badge ' + cls + '">' + escapeHtml(text) + '</span>';
}

function getRankKey(rawRank) {
  if (!rawRank) return null;
  var s = String(rawRank).trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_').replace(/^(rank_|hof_|hof_rank_)/, '');
  var num = parseInt(s, 10);
  if (num >= 1 && num <= 21 && typeof RANK_ID_TO_KEY !== 'undefined') return RANK_ID_TO_KEY[num];
  if (s && typeof GRADE_KEY_TO_IMG !== 'undefined' && GRADE_KEY_TO_IMG[s]) return s;
  if (typeof RANKS_DATA !== 'undefined') {
    var normalized = normalizeRankName(rawRank);
    var nLower = normalized.toLowerCase();
    var rank = RANKS_DATA.find(function (r) {
      return r.name === normalized || normalizeRankName(r.name) === normalized || (nLower && normalizeRankName(r.name).toLowerCase() === nLower);
    });
    if (rank) return rank.rank;
  }
  if (typeof EN_RANK_NAMES !== 'undefined' && typeof RANK_KEY_TO_ID !== 'undefined') {
    var idx = EN_RANK_NAMES.findIndex(function (n) { return normalizeRankName(n) === normalizeRankName(rawRank) || (n && n.toLowerCase() === String(rawRank).toLowerCase()); });
    if (idx >= 0) return RANKS_DATA[idx].rank;
  }
  return null;
}

function getGradeTooltip(rawRank, fallback) {
  var key = getRankKey(rawRank);
  if (!key || typeof GRADES_TRANSLATIONS === 'undefined') return fallback || '';
  var lang = (typeof getCurrentLang === 'function' ? getCurrentLang() : 'fr') || 'fr';
  var t = GRADES_TRANSLATIONS[key];
  if (!t) return fallback || '';
  return t[lang] || t.de || t.en || t.fr || fallback || '';
}

function getRankImg(rankName, server) {
  if (!rankName) return '';
  var s = String(rankName).trim();
  if (/^\d+$/.test(s) && typeof RANK_ID_TO_KEY !== 'undefined' && typeof GRADE_KEY_TO_IMG !== 'undefined') {
    var rid = parseInt(s, 10);
    if (rid >= 1 && rid <= 21) {
      var rkey = RANK_ID_TO_KEY[rid];
      if (rkey && GRADE_KEY_TO_IMG[rkey]) return GRADE_KEY_TO_IMG[rkey];
    }
  }
  if (typeof RANK_KEY_TO_RANK_NAME !== 'undefined' && s.startsWith('rank_') && RANK_KEY_TO_RANK_NAME[s]) s = RANK_KEY_TO_RANK_NAME[s];
  if (typeof GRADE_KEY_TO_IMG !== 'undefined') {
    var key = s.toLowerCase().replace(/-/g, '_').replace(/^(rank_|hof_|hof_rank_)/, '');
    if (GRADE_KEY_TO_IMG[key]) return GRADE_KEY_TO_IMG[key];
  }
  var serverCode = (server != null && server !== '') ? String(server).toLowerCase().trim() : '';
  if (serverCode && typeof SERVER_TO_LANG !== 'undefined' && typeof RANK_NAMES_BY_LANG !== 'undefined' && typeof RANKS_DATA !== 'undefined') {
    var lang = SERVER_TO_LANG[serverCode] || 'en';
    var namesForLang = RANK_NAMES_BY_LANG[lang] || RANK_NAMES_BY_LANG.en;
    var normalized = normalizeRankName(rankName);
    var nLower = rankLower(normalized, lang);
    function matchNameList(list, langForLower) {
      if (!list) return '';
      for (var i = 0; i < list.length && i < RANKS_DATA.length; i++) {
        var refName = list[i];
        if (!refName) continue;
        var refNorm = normalizeRankName(refName);
        if (normalized === refName || refNorm === normalized) return RANKS_DATA[i].img;
        if (nLower && rankLower(refNorm, langForLower) === nLower) return RANKS_DATA[i].img;
      }
      return '';
    }
    var hit = matchNameList(namesForLang, lang);
    if (hit) return hit;
    // DOStats TR peut afficher le grade en anglais : éviter de bloquer sur la liste turque seule (fr exclu : Colonel FR ≠ EN).
    if (lang !== 'fr' && typeof EN_RANK_NAMES !== 'undefined') {
      hit = matchNameList(EN_RANK_NAMES, 'en');
      if (hit) return hit;
    }
  }
  var normalized = normalizeRankName(rankName);
  if (typeof RANKS_DATA !== 'undefined') {
    var nLower = normalized.toLowerCase();
    var rank = RANKS_DATA.find(function (r) {
      return r.rank === s || r.name === normalized || normalizeRankName(r.name) === normalized || (nLower && normalizeRankName(r.name).toLowerCase() === nLower);
    });
    if (rank && rank.img) return rank.img;
  }
  if (typeof RANK_NAME_TO_IMG !== 'undefined') {
    var key = normalizeRankKey(rankName);
    if (RANK_NAME_TO_IMG[key]) return RANK_NAME_TO_IMG[key];
    if (serverCode && typeof SERVER_TO_LANG !== 'undefined' && SERVER_TO_LANG[serverCode] === 'tr') {
      var keyTr = normalizeRankKeyTr(rankName);
      if (keyTr && keyTr !== key && RANK_NAME_TO_IMG[keyTr]) return RANK_NAME_TO_IMG[keyTr];
    }
  }
  return '';
}

if (typeof window !== 'undefined') {
  window.getCompanyBadgeHtml = getCompanyBadgeHtml;
  window.getGradeTooltip = getGradeTooltip;
  window.getRankImg = getRankImg;
}

function initRankingTab() {
  const filterServer = document.getElementById('ranking-filter-server');
  const filterServerTrigger = document.getElementById('ranking-filter-server-trigger');
  const filterServerList = document.getElementById('ranking-filter-server-listbox');
  const serverDropdownRoot = filterServer && filterServer.closest('.ranking-server-dropdown');
  const filterType = document.getElementById('ranking-filter-type');
  const tableWrap = document.getElementById('ranking-table-wrap');
  const table = document.getElementById('ranking-table');

  if (!table) return;

  if (_rankingTabInitialized) return;
  _rankingTabInitialized = true;

  if (typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerInfo) {
    UserPreferencesAPI.getActivePlayerInfo().catch(function () {});
  }

  var RETIRED_RANKING_SERVER_CODE = 'gbl2';

  function syncRankingServerRetiredStyle() {
    if (!filterServerTrigger || !filterServer) return;
    filterServerTrigger.classList.toggle('ranking-filter-server--retired-active', filterServer.value === RETIRED_RANKING_SERVER_CODE);
  }

  function updateTriggerTextFromSelect() {
    if (!filterServerTrigger || !filterServer) return;
    var sel = filterServer.options[filterServer.selectedIndex];
    filterServerTrigger.textContent = sel ? sel.textContent : '';
  }

  function setServerPanelOpen(open) {
    if (!filterServerList || !filterServerTrigger) return;
    if (open) {
      filterServerList.removeAttribute('hidden');
      filterServerTrigger.setAttribute('aria-expanded', 'true');
      buildServerListboxFromSelect();
    } else {
      filterServerList.setAttribute('hidden', '');
      filterServerTrigger.setAttribute('aria-expanded', 'false');
    }
  }

  function buildServerListboxFromSelect() {
    if (!filterServerList || !filterServer) return;
    filterServerList.innerHTML = '';
    for (var i = 0; i < filterServer.options.length; i++) {
      var opt = filterServer.options[i];
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('data-value', opt.value);
      li.textContent = opt.textContent;
      if (opt.className) li.className = opt.className;
      li.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
      li.addEventListener('click', function (ev) {
        var v = ev.currentTarget.getAttribute('data-value');
        filterServer.value = v;
        updateTriggerTextFromSelect();
        syncRankingServerRetiredStyle();
        setServerPanelOpen(false);
        filterServer.dispatchEvent(new Event('change', { bubbles: true }));
      });
      filterServerList.appendChild(li);
    }
  }

  async function updateFilterServerOptions() {
    if (!filterServer) return;
    const prevVal = filterServer.value;
    const opts = [{ value: '', label: 'Tous les serveurs' }];
    // Source de vérité : SERVER_CODE_TO_DISPLAY (24 serveurs), lu au moment de l'appel
    var mapping = (typeof window !== 'undefined' && window.SERVER_CODE_TO_DISPLAY) || (typeof SERVER_CODE_TO_DISPLAY !== 'undefined' ? SERVER_CODE_TO_DISPLAY : {});
    var entries = Object.entries(mapping).sort(function(a, b) { return a[1].localeCompare(b[1]); });
    entries.forEach(function([code, label]) {
      opts.push({ value: code, label: label });
    });
    // Ajouter les serveurs importés localement qui ne seraient pas dans le mapping
    var imported = typeof getImportedServerList === 'function' ? getImportedServerList() : [];
    var seen = new Set(opts.map(function(o) { return o.value; }));
    imported.forEach(function(c) {
      var code = (typeof SERVER_DISPLAY_TO_CODE !== 'undefined' && SERVER_DISPLAY_TO_CODE[c]) ? SERVER_DISPLAY_TO_CODE[c] : c;
      if (code && !seen.has(code)) {
        seen.add(code);
        opts.push({ value: code, label: mapping[code] || c });
      }
    });
    filterServer.innerHTML = opts.map(function(o) {
      var v = escapeHtml(String(o.value));
      var lbl = escapeHtml(o.label);
      var optCls = String(o.value) === RETIRED_RANKING_SERVER_CODE ? ' class="ranking-server-option--retired"' : '';
      return '<option value="' + v + '"' + optCls + '>' + lbl + '</option>';
    }).join('');
    if (opts.some(function(o) { return String(o.value) === prevVal; })) filterServer.value = prevVal;
    syncRankingServerRetiredStyle();
    updateTriggerTextFromSelect();
    if (filterServerList && !filterServerList.hasAttribute('hidden')) buildServerListboxFromSelect();
  }

  async function getFavoriteServer() {
    if (typeof UserPreferencesAPI !== 'undefined') {
      var p = await UserPreferencesAPI.getPreferences();
      return p.ranking_favorite_server || null;
    }
    return null;
  }

  async function saveFavoriteServer(value) {
    if (typeof UserPreferencesAPI !== 'undefined') {
      await UserPreferencesAPI.setPreferences({ ranking_favorite_server: value || null });
    }
  }

  /** Attend la liste serveurs + favori / serveur profil avant le 1er chargement (évite course au refresh). */
  async function applySavedServerSelectionThenLoad() {
    if (!filterServer) {
      load();
      return;
    }
    try {
      await updateFilterServerOptions();
      var savedFav = null;
      try {
        savedFav = await getFavoriteServer();
      } catch (_e) {}
      if (savedFav) {
        var hasFavOpt = Array.from(filterServer.options).some(function (o) {
          return o.value === savedFav;
        });
        if (hasFavOpt) filterServer.value = savedFav;
      }
      syncRankingServerRetiredStyle();
      if (!savedFav && typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getUserServer) {
        try {
          var profileServer = await UserPreferencesAPI.getUserServer();
          if (profileServer) {
            var hasOpt = Array.from(filterServer.options).some(function (o) {
              return o.value === profileServer;
            });
            if (hasOpt) filterServer.value = profileServer;
          }
        } catch (_e2) {}
      }
      syncRankingServerRetiredStyle();
      updateTriggerTextFromSelect();
    } catch (_e3) {}
    load();
  }

  if (filterServer) {
    applySavedServerSelectionThenLoad();

    filterServer.addEventListener('change', function () {
      syncRankingServerRetiredStyle();
      updateTriggerTextFromSelect();
      if (filterServerList && !filterServerList.hasAttribute('hidden')) buildServerListboxFromSelect();
      saveFavoriteServer(filterServer.value);
      load();
    });

    if (filterServerTrigger && filterServerList && serverDropdownRoot) {
      filterServerTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = filterServerList.hasAttribute('hidden');
        setServerPanelOpen(willOpen);
      });
      document.addEventListener('click', function rankingServerDropdownOutside(e) {
        if (filterServerList.hasAttribute('hidden')) return;
        if (serverDropdownRoot.contains(e.target)) return;
        setServerPanelOpen(false);
      });
      document.addEventListener('keydown', function rankingServerDropdownEsc(e) {
        if (e.key !== 'Escape' || filterServerList.hasAttribute('hidden')) return;
        setServerPanelOpen(false);
      });
    }
  }

  // Bouton \"📍 Ma position\" dans la carte de filtres
  (function setupScrollToMeButton() {
    var scrollBtn = document.getElementById('ranking-scroll-to-me');
    if (!scrollBtn) {
      scrollBtn = document.createElement('button');
      scrollBtn.type = 'button';
      scrollBtn.id = 'ranking-scroll-to-me';
      scrollBtn.className = 'ranking-scroll-to-me-button';
      scrollBtn.textContent = '📌';
      scrollBtn.style.display = 'none';
    }
    var lastUpdateEl = document.getElementById('ranking-last-update');
    var filtersCard = lastUpdateEl ? lastUpdateEl.closest('.ranking-filters') : null;
    if (filtersCard) {
      var header = filtersCard.querySelector('.ranking-filters-header');
      if (!header) {
        header = document.createElement('div');
        header.className = 'ranking-filters-header';
        // Insère le header en haut de la carte et y place le texte \"Dernière maj\"
        filtersCard.insertBefore(header, filtersCard.firstChild);
        header.appendChild(lastUpdateEl);
      }
      if (!scrollBtn.parentElement) {
        header.appendChild(scrollBtn);
      }
    }
    if (!scrollBtn._boundClick) {
      scrollBtn._boundClick = true;
      scrollBtn.addEventListener('click', function () {
        var tbody = document.querySelector('#ranking-table tbody');
        if (!tbody) return;
        var row = tbody.querySelector('tr.ranking-row--player-inplace');
        if (row && typeof row.scrollIntoView === 'function') {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  })();

  // Type : honor (défaut), xp, rank_points — champs name="ranking-filter-type" value honor|xp|rank_points
  const typeInputs = filterType ? filterType.querySelectorAll('input[name="ranking-filter-type"]') : [];
  if (typeInputs.length) {
    const def = filterType.querySelector('input[value="honor"]');
    if (def) def.checked = true;
    typeInputs.forEach(function(inp) {
      inp.addEventListener('change', load);
    });
  }

  const filterPeriod = document.getElementById('ranking-filter-period');
  if (filterPeriod) filterPeriod.addEventListener('change', load);

  // Filtre recherche joueur (client-side, sur les données déjà chargées)
  const filterPlayerSearch = document.getElementById('ranking-player-search');
  if (filterPlayerSearch) {
    // Initialisation du terme (utile si une valeur est déjà présente via restore UI)
    _rankingPlayerSearchTerm = (filterPlayerSearch.value || '').toString().trim().toLowerCase();
    filterPlayerSearch.addEventListener('input', function () {
      _rankingPlayerSearchTerm = (filterPlayerSearch.value || '').toString().trim().toLowerCase();
      _hasScrolledToPlayer = false;
      if (typeof _renderRankingFn === 'function' && Array.isArray(_lastRankingData) && _lastRankingData.length) {
        _renderRankingFn(_lastRankingData, (_lastRankingFilters && _lastRankingFilters.type) || 'honor');
      }
    });
  }

  // Filtre firme : géré par délégation document (IIFE en bas de fichier) pour garantir
  // que les clics fonctionnent même si initRankingTab() a retourné tôt (ex. #ranking-table absent).

  function getFilters() {
    let server = filterServer?.value?.trim() || null;
    if (server === 'Tous' || server === 'Tous les serveurs' || !server) server = null;
    let type = 'honor';
    typeInputs.forEach(inp => { if (inp.checked) type = inp.value || 'honor'; });
    const period = filterPeriod?.value?.trim() || null;
    return { server, type, limit: 100, period: period || null };
  }

  function setLoading(loading) {
    if (tableWrap) tableWrap.classList.toggle('ranking-loading', !!loading);
    if (table) table.classList.toggle('ranking-loading', !!loading);
  }

  function setError(msg) {
    const tbody = table?.querySelector('tbody');
    if (tbody) {
      const colCount = table?.querySelector('thead')?.querySelectorAll('th')?.length || 7;
      tbody.innerHTML = '<tr><td colspan="' + colCount + '" style="text-align:center;padding:2rem;opacity:0.6;">' +
        (msg || 'Impossible de charger le classement. Réessayez.') + '</td></tr>';
    }
  }

  function updateLastUpdateDisplay(server) {
    const el = document.getElementById('ranking-last-update');
    if (!el) return;
    if (!server) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    const ts = typeof getImportedRankingTimestamp === 'function' ? getImportedRankingTimestamp(server) : null;
    if (!ts) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    try {
      const d = new Date(ts);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      el.textContent = 'Dernière maj : ' + dd + '/' + mm + '/' + yyyy + ' à ' + hh + ':' + min;
    } catch (_) {
      el.textContent = '';
    }
    el.style.display = 'none';
  }

  var _loadDebounceTimer = null;
  var _loadDebounceMs = 80;

  async function load() {
    clearTimeout(_loadDebounceTimer);
    _loadDebounceTimer = setTimeout(function () {
      _loadDebounceTimer = null;
      loadImpl();
    }, _loadDebounceMs);
  }

  function updateComparisonBar(data, filters) {
    var bar = document.getElementById('ranking-comparison-bar');
    if (!bar) return;
    if (!filters.period || !data || data.length === 0) {
      bar.style.display = 'none';
      bar.innerHTML = '';
      return;
    }
    if (data[0] && data[0]._comparison_needs_server) {
      bar.style.display = '';
      bar.innerHTML = '<span class="comparison-bar-info">Sélectionnez un serveur pour utiliser la comparaison temporelle.</span>';
      return;
    }
    if (data[0] && data[0]._comparison_mode) {
      var latestAt    = data[0]._latest_at;
      var referenceAt = data[0]._reference_at;
      var hasRef      = data.some(function(r) { return r._has_reference; });
      function fmtDate(iso) {
        if (!iso) return '—';
        try {
          var d = new Date(iso);
          return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
               + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        } catch (_) { return iso; }
      }
      if (!hasRef || !referenceAt) {
        bar.style.display = '';
        bar.innerHTML = '<span class="comparison-bar-warn">Aucun snapshot de référence disponible pour ce serveur il y a ' + (filters.period) + '.</span>';
        return;
      }
      bar.style.display = '';
      bar.innerHTML =
        '<span class="comparison-bar-label">Progression ' + escapeHtml(filters.period) + '</span>' +
        '<span class="comparison-bar-dates">' +
          '<span class="comparison-bar-ref">Réf. : ' + escapeHtml(fmtDate(referenceAt)) + '</span>' +
          '<span class="comparison-bar-arrow">→</span>' +
          '<span class="comparison-bar-now">Actuel : ' + escapeHtml(fmtDate(latestAt)) + '</span>' +
        '</span>';
      return;
    }
    bar.style.display = 'none';
    bar.innerHTML = '';
  }

  async function loadImpl() {
    _hasScrolledToPlayer = false;
    setLoading(true);
    const filters = getFilters();
    _lastRankingFilters = filters;
    try {
      let data;
      if (typeof loadRanking === 'function' && filters.period && filters.server) {
        Logger.debug('[RankingUI] loadImpl period mode start', filters);
        // Mode période (24h / 7j / 30j) : on laisse le backend décider (DOStats ou comparaison)
        data = await loadRanking(filters);
        Logger.debug('[RankingUI] loadImpl period mode result', {
          filters,
          count: Array.isArray(data) ? data.length : null,
          sample: Array.isArray(data) && data.length ? data[0] : null
        });
      } else if (typeof loadRanking === 'function' && !filters.period && filters.server) {
        Logger.debug('[RankingUI] loadImpl today mode start', filters);
        try {
          const [mainData, daily24hData] = await Promise.all([
            loadRanking(filters),
            // "24h" = période DOStats (Last 24 Hours) => modèle normalisé periodKey=daily
            // On s'en sert uniquement pour la colonne "24h" (flèche + tooltip).
            // Ne pas activer de "mode progression" sur la table principale (filters.period reste null).
            (filters.type === 'galaxy_gates' || filters.type === 'npc_kills' || filters.type === 'ship_kills')
              ? Promise.resolve([])
              : loadRanking(Object.assign({}, filters, { period: '24h' }))
          ]);
          Logger.debug('[RankingUI] loadImpl today mode with delta', {
            filters,
            mainCount: Array.isArray(mainData) ? mainData.length : null,
            deltaCount: Array.isArray(daily24hData) ? daily24hData.length : null
          });
          // Merge valeur "Last 24 Hours" dans les lignes principales (colonne 24h).
          // On évite tout calcul de delta : on affiche directement la value daily (peut être négative si DOStats le fournit).
          if (Array.isArray(mainData) && Array.isArray(daily24hData) && daily24hData.length > 0) {
            const VALUE_COLS = ['honor', 'xp', 'rank_points', 'npc_kills', 'ship_kills', 'galaxy_gates'];
            const typeCol = VALUE_COLS.includes(filters.type) ? filters.type : 'honor';
            const valField = typeCol;

            const mapById = {};
            daily24hData.forEach(function (d) {
              if (!d) return;
              const uid = (d.userId != null ? String(d.userId) : (d.user_id != null ? String(d.user_id) : '')).trim();
              const srv = ((d._server || d.server || '')).toString().trim();
              const key = (uid ? ('uid:' + uid) : ('pseudo:' + (d.game_pseudo || d.name || ''))) + '|' + srv;
              mapById[key] = d;
            });

            mainData.forEach(function (row) {
              if (!row) return;
              const uid = (row.userId != null ? String(row.userId) : (row.user_id != null ? String(row.user_id) : '')).trim();
              const srv = ((row._server || row.server || '')).toString().trim();
              const key = (uid ? ('uid:' + uid) : ('pseudo:' + (row.game_pseudo || row.name || ''))) + '|' + srv;
              const dailyRow = mapById[key];
              if (!dailyRow) return;
              const raw = dailyRow[valField];
              const n = raw != null && raw !== '' ? parseLooseRankingNumber(raw) : NaN;
              row._daily_24h = Number.isFinite(n) ? n : null;
            });
          }
          data = mainData;
        } catch (err) {
          // En cas d'échec du second appel, on continue avec les données principales
          Logger.warn('[RankingUI] loadImpl today mode delta error:', err && err.message);
          data = await loadRanking(filters);
        }
      } else {
        data = typeof loadRanking === 'function' ? await loadRanking(filters) : [];
        Logger.debug('[RankingUI] loadImpl generic mode', {
          filters,
          count: Array.isArray(data) ? data.length : null
        });
      }
      if (_loadDebounceTimer) return;
      setLoading(false);
      // Signal : comparaison demandée sans serveur sélectionné
      if (data.length === 1 && data[0] && data[0]._comparison_needs_server) {
        updateComparisonBar(data, filters);
        setError('Sélectionnez un serveur pour afficher la progression ' + (filters.period || '') + '.');
        return;
      }
      if (filters.period && data.length === 0) {
        updateComparisonBar([], filters);
        setError('Aucune donnée de comparaison disponible pour cette période.');
        return;
      }
      if (data.length === 0 && typeof navigator !== 'undefined' && !navigator.onLine) {
        setError('Hors ligne. Connectez-vous pour afficher le classement.');
      } else {
        _lastRankingData = Array.isArray(data) ? data : [];
        Logger.debug('[RankingUI] loadImpl render', {
          filters,
          count: _lastRankingData.length
        });
        // FIX 1 + FIX 3 — même enrichissement que renderRanking, uniquement en vue "Aujourd'hui".
        try {
          var _isPeriodFiltered2 = !!(filters && filters.period);
          if (!_isPeriodFiltered2 && typeof isPlayerFollowed === 'function') {
            for (var _fj = 0; _fj < _lastRankingData.length; _fj++) {
              if (isPlayerFollowed(_lastRankingData[_fj])) _mergePersistedFollowedStatsFromRow(_lastRankingData[_fj]);
            }
          }
        } catch (_fe2) {}
        updateComparisonBar(_lastRankingData, filters);
        renderRanking(_lastRankingData, filters.type);
      }
    } catch (e) {
      if (_loadDebounceTimer) return;
      setLoading(false);
      setError('Erreur de chargement. Réessayez dans quelques instants.');
    }
    updateLastUpdateDisplay(filters.server);
  }

  _renderRankingFn = renderRanking;
  window.refreshRanking = async function() {
    if (typeof updateFilterServerOptions === 'function') await updateFilterServerOptions();
    var now = Date.now();
    if (now - _lastRefreshRankingAt < REFRESH_RANKING_THROTTLE_MS && _lastRefreshRankingAt > 0) return;
    _lastRefreshRankingAt = now;
    clearTimeout(_loadDebounceTimer);
    _loadDebounceTimer = null;
    loadImpl();
  };

  table.addEventListener('click', (e) => {
    if (e.target.closest('.ranking-gg-eye')) {
      e.stopPropagation();
      const row = e.target.closest('tr[data-ranking-user-id]');
      if (!row) return;
      const payload = row.getAttribute('data-ranking-payload');
      try {
        const rowData = payload ? JSON.parse(payload) : null;
        if (rowData && rowData.galaxy_gates_json) showGalaxyGatesPopup(rowData);
      } catch (_) {}
      return;
    }
    const row = e.target.closest('tr[data-ranking-user-id]');
    if (!row) return;
    const payload = row.getAttribute('data-ranking-payload');
    const position = row.getAttribute('data-ranking-position');
    const sortType = row.getAttribute('data-ranking-sort-type');
    let rowData = null;
    try {
      rowData = payload ? JSON.parse(payload) : null;
    } catch (_) {}
    if (rowData) {
      rowData._position = position ? parseInt(position, 10) : null;
      rowData._sortType = sortType || 'honor';
      showPlayerDetails(rowData);
    }
  });

  if (!filterServer) {
    load();
  }
  tryRegisterRankingCdpRefreshHook();
}

function renderRanking(data, sortType) {
  const table = document.getElementById('ranking-table');
  const thead = table?.querySelector('thead');
  const tbody = table?.querySelector('tbody');
  if (!tbody) {
    Logger.warn('[RankingUI] renderRanking: tbody introuvable pour #ranking-table', {
      hasTable: !!table,
      sortType: sortType,
      count: Array.isArray(data) ? data.length : null,
    });
    return;
  }

  Logger.debug('[RankingUI] renderRanking start', {
    sortType: sortType,
    count: Array.isArray(data) ? data.length : null,
    sample: Array.isArray(data) && data.length ? data[0] : null,
  });

  const VALUE_COLS = ['honor', 'xp', 'rank_points', 'npc_kills', 'ship_kills', 'galaxy_gates'];
  const typeCol = VALUE_COLS.includes(sortType) ? sortType : 'honor';
  var isAllServers = !_lastRankingFilters || !_lastRankingFilters.server;
  var isTodayPeriodOnly = !_lastRankingFilters?.period;
  var is24hTypeAllowed = (typeCol === 'honor' || typeCol === 'xp' || typeCol === 'rank_points');
  var shouldShow24hCol = isTodayPeriodOnly && is24hTypeAllowed;

  if (thead) {
    var headerRow = thead.querySelector('tr');
    if (headerRow) {
      var existingServerTh = headerRow.querySelector('th[data-col="server"]');
      if (isAllServers && !existingServerTh) {
        var serverTh = document.createElement('th');
        serverTh.dataset.col = 'server';
        serverTh.className = 'ranking-col-server';
        serverTh.textContent = 'Serveur';
        var pseudoTh = headerRow.querySelector('th[data-col="pseudo"]');
        if (pseudoTh && pseudoTh.nextSibling) {
          headerRow.insertBefore(serverTh, pseudoTh.nextSibling);
        } else {
          headerRow.appendChild(serverTh);
        }
      } else if (!isAllServers && existingServerTh && existingServerTh.parentNode) {
        existingServerTh.parentNode.removeChild(existingServerTh);
      }
    }
  }

  thead?.querySelectorAll('th').forEach(th => {
    th.classList.remove('ranking-col-sorted');
    if (th.dataset.col === typeCol) th.classList.add('ranking-col-sorted');
    th.classList.remove('ranking-col-hidden');
    if (th.dataset.col && VALUE_COLS.indexOf(th.dataset.col) !== -1 && th.dataset.col !== typeCol) th.classList.add('ranking-col-hidden');
    if (th.dataset.col === 'delta_24h' && !shouldShow24hCol) th.classList.add('ranking-col-hidden');
  });

  var isProgressMode = Array.isArray(data) && data.length > 0 && data[0]._comparison_mode && _lastRankingFilters && _lastRankingFilters.period;
  if (isProgressMode && thead) {
    var sortedTh = thead.querySelector('th[data-col="' + typeCol + '"]');
    if (sortedTh) {
      sortedTh.textContent = 'PROGRESSION';
    }
  }

  tbody.innerHTML = '';
  var rows = Array.isArray(data) ? data : [];
  // Filtre firme actif sur tous les modes (Aujourd'hui + 24h/7j/30j)
  if (_rankingCompanyFilter) {
    var cmp = _rankingCompanyFilter;
    rows = rows.filter(function (row) {
      var c = (row && row.company != null ? String(row.company) : '').trim().toLowerCase();
      return c === cmp;
    });
  }
  // Filtre recherche joueur (pseudo) : client-side, insensible à la casse
  if (_rankingPlayerSearchTerm) {
    var term = _rankingPlayerSearchTerm;
    rows = rows.filter(function (row) {
      if (!row) return false;
      var pseudo = (row.game_pseudo || row.name || '').toString().trim().toLowerCase();
      if (!pseudo) return false;
      return pseudo.indexOf(term) !== -1;
    });
  }
  // Helper : tri par delta en mode progression
  if (isProgressMode) {
    var deltaField = null;
    if (typeCol === 'honor') deltaField = '_honor_delta';
    else if (typeCol === 'xp') deltaField = '_xp_delta';
    else if (typeCol === 'rank_points') deltaField = '_rp_delta';
    else if (typeCol === 'npc_kills') deltaField = '_npc_kills_delta';
    else if (typeCol === 'ship_kills') deltaField = '_ship_kills_delta';
    else if (typeCol === 'galaxy_gates') deltaField = '_galaxy_gates_delta';
    if (deltaField) {
      var withDelta = rows.filter(function (r) { return r && r[deltaField] != null; });
      var withoutDelta = rows.filter(function (r) { return !r || r[deltaField] == null; });
      withDelta.sort(function (a, b) {
        var va = a[deltaField] != null ? Number(a[deltaField]) : -Infinity;
        var vb = b[deltaField] != null ? Number(b[deltaField]) : -Infinity;
        return vb - va;
      });
      rows = withDelta.concat(withoutDelta);
    }
  }
  // Helper : badge delta pour position et valeurs
  function _deltaClass(v) {
    if (v == null) return 'delta-neutral';
    return v > 0 ? 'delta-up' : v < 0 ? 'delta-down' : 'delta-neutral';
  }
  function _deltaIcon(v) {
    if (v == null) return '';
    return v > 0 ? '▲' : v < 0 ? '▼' : '=';
  }
  function _fmtDelta(v) {
    if (v == null) return '';
    var abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v >= 0 ? '+' : '-') + abs;
  }
  function _posDeltaBadge(row) {
    if (!row._comparison_mode || row._pos_delta == null) return '';
    var cls  = _deltaClass(row._pos_delta);
    var icon = _deltaIcon(row._pos_delta);
    var txt  = row._pos_delta === 0 ? '=' : (row._pos_delta > 0 ? '+' + row._pos_delta : String(row._pos_delta));
    return `<span class="ranking-pos-delta ${cls}" title="Variation de position">${icon}${txt}</span>`;
  }
  var RANKING_DELTA_ZERO_STYLE = 'color:#555';

  function _statDeltaBadge(delta) {
    if (delta == null) return '';
    if (Number(delta) === 0) {
      return '<small class="ranking-stat-delta ranking-stat-delta--zero" title="Variation" style="' + RANKING_DELTA_ZERO_STYLE + '">—</small>';
    }
    var cls  = _deltaClass(delta);
    var icon = _deltaIcon(delta);
    return `<small class="ranking-stat-delta ${cls}" title="Variation">${icon} ${_fmtDelta(delta)}</small>`;
  }

  // Colonne "24h" : valeur daily DOStats (Last 24 Hours) (peut être négative si DOStats le fournit)
  function _fmtSignedAbs(v) {
    if (v == null) return '';
    var n = Number(v);
    if (!Number.isFinite(n)) return '';
    var abs = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n >= 0 ? '+ ' : '- ') + abs;
  }

  function _buildDaily24hArrowHtml(dailyVal) {
    if (!shouldShow24hCol) return '<span>—</span>';
    var n = Number(dailyVal);
    if (!Number.isFinite(n)) return '<span>—</span>';
    if (n === 0) return '<span class="ranking-delta24h-zero" style="' + RANKING_DELTA_ZERO_STYLE + '">—</span>';
    var isPos = n > 0;
    var wrapperClass = isPos ? 'delta24h-tooltip-wrap--pos' : 'delta24h-tooltip-wrap--neg';
    var arrowSrc = isPos ? 'img/icon_btn/delta24h_arrow_green.png' : 'img/icon_btn/delta24h_arrow_red.png';
    var tooltip = _fmtSignedAbs(n);
    // Tooltip via CSS (couleur dépend du wrapperClass)
    return '<span class="watched-player-tooltip-wrap ' + wrapperClass + '" data-tooltip="' + escapeHtml(tooltip) + '">' +
      '<img class="ranking-delta24h-arrow" src="' + arrowSrc + '" alt="">' +
      '</span>';
  }

  rows.forEach((row, index) => {
    const pos = index + 1;
    const pseudo = row.game_pseudo != null ? String(row.game_pseudo) : '—';
    var serverCode = (row._server || row.server || '').toString();
    var serverMapping = (typeof SERVER_CODE_TO_DISPLAY !== 'undefined' ? SERVER_CODE_TO_DISPLAY : {});
    var serverLabel = serverCode ? (serverMapping[serverCode] || serverCode) : '—';
    var rawRank = (row.current_rank ? String(row.current_rank) : null) || (row.grade_normalized ? String(row.grade_normalized) : null) || (row.grade ? String(row.grade) : null);
    if (rawRank && INVALID_GRADE_PATTERN.test(rawRank)) rawRank = null;
    const rankLabel = rawRank || (row.grade_level != null ? 'Niveau ' + row.grade_level : '');
    const rankImg = getRankImg(rawRank, row._server || row.server);
    const rankAlt = rankLabel || '—';
    const honor = formatRankingNumber(row.honor);
    const xp = formatRankingNumber(row.xp);
    const rankPoints = formatRankingNumber(row.rank_points);
    const npcKills = row.npc_kills != null ? formatRankingNumber(row.npc_kills) : '—';
    const shipKills = row.ship_kills != null ? formatRankingNumber(row.ship_kills) : '—';
    const galaxyGates = row.galaxy_gates != null ? formatRankingNumber(row.galaxy_gates) : '—';
    const hasGGJson = row.galaxy_gates_json && Object.keys(row.galaxy_gates_json).length > 0;
    const ggEyeBtn = hasGGJson ? '<button type="button" class="ranking-gg-eye" title="Voir le détail" aria-label="Voir le détail">👁</button>' : '';
    const payload = JSON.stringify(row);
    const posClass = pos === 1 ? 'ranking-pos-gold' : pos === 2 ? 'ranking-pos-silver' : pos === 3 ? 'ranking-pos-bronze' : '';
    const tr = document.createElement('tr');
    tr.setAttribute('data-ranking-user-id', row.id || '');
    tr.setAttribute('data-ranking-payload', payload);
    tr.setAttribute('data-ranking-position', String(pos));
    tr.setAttribute('data-ranking-sort-type', typeCol);
    tr.classList.add('ranking-row');
    // Joueurs suivis : surlignage rouge doux (éventuellement surchargé par le vert du joueur connecté)
    try {
      if (isPlayerFollowed && typeof isPlayerFollowed === 'function' && isPlayerFollowed(row)) {
        tr.classList.add('ranking-row--player-watched');
      }
    } catch (_) {}
    if (row._comparison_mode) tr.classList.add('ranking-row-comparison');
    const sortedClass = (col) => (typeCol === col ? ' ranking-col-sorted' : '');
    const hiddenClass = (col) => (col !== typeCol && VALUE_COLS.indexOf(col) !== -1 ? ' ranking-col-hidden' : '');
    const gradeTooltip = getGradeTooltip(rawRank, rankAlt);
    const gradeCellContent = rankImg
      ? `<img src="${escapeHtml(rankImg)}" alt="${escapeHtml(rankAlt)}" title="${escapeHtml(gradeTooltip)}" class="ranking-grade-img" width="26" height="26" onerror="var p=this.parentNode;if(p)p.textContent=p.getAttribute('data-fallback')||'—';">`
      : (rankAlt ? escapeHtml(rankAlt) : '—');
    const companyCellHtml = getCompanyBadgeHtml(row.company);
    const dostatsBadge = '';
    // Deltas pour la colonne triée active
    const honorDelta     = _statDeltaBadge(row._honor_delta);
    const xpDelta        = _statDeltaBadge(row._xp_delta);
    const rpDelta        = _statDeltaBadge(row._rp_delta);
    const posDeltaBadge  = _posDeltaBadge(row);

    // 24h (Last 24 hours DOStats) basé sur la value daily déjà extraite en backend
    var delta24hCellHtml = _buildDaily24hArrowHtml(row._daily_24h);
    var delta24hHiddenClass = shouldShow24hCol ? '' : ' ranking-col-hidden';
    // Mode progression : delta principal
    function buildDeltaMain(deltaValue) {
      if (deltaValue == null) return '—';
      if (Number(deltaValue) === 0) {
        return '<span class="ranking-delta-main ranking-delta-main--zero" style="' + RANKING_DELTA_ZERO_STYLE + '">—</span>';
      }
      var cls = deltaValue > 0 ? 'stat-up' : deltaValue < 0 ? 'stat-down' : 'stat-neutral';
      var abs = Math.abs(deltaValue).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      var sign = deltaValue >= 0 ? '+' : '-';
      return '<span class="ranking-delta-main ' + cls + '">' + sign + abs + '</span>';
    }

    var honorCellContent, xpCellContent, rpCellContent;
    if (isProgressMode) {
      if (typeCol === 'honor') {
        honorCellContent = buildDeltaMain(row._honor_delta);
      } else {
        honorCellContent = honor + (typeCol === 'honor' ? honorDelta : '');
      }
      if (typeCol === 'xp') {
        xpCellContent = buildDeltaMain(row._xp_delta);
      } else {
        xpCellContent = xp + (typeCol === 'xp' ? xpDelta : '');
      }
      if (typeCol === 'rank_points') {
        rpCellContent = buildDeltaMain(row._rp_delta);
      } else {
        rpCellContent = rankPoints + (typeCol === 'rank_points' ? rpDelta : '');
      }
    } else {
      honorCellContent = honor + (typeCol === 'honor' ? honorDelta : '');
      xpCellContent    = xp + (typeCol === 'xp' ? xpDelta : '');
      rpCellContent    = rankPoints + (typeCol === 'rank_points' ? rpDelta : '');
    }
    var serverCellHtml = '';
    if (isAllServers) {
      serverCellHtml = '<td class="ranking-col-server">' + escapeHtml(serverLabel) + '</td>';
    }

    tr.innerHTML = `
      <td class="ranking-pos ${posClass}">${pos}${posDeltaBadge}</td>
      <td class="ranking-pseudo">${escapeHtml(pseudo)}${dostatsBadge}</td>
      ${serverCellHtml}
      <td class="ranking-firme">${companyCellHtml}</td>
      <td class="ranking-grade" data-fallback="${escapeHtml(rankAlt || '—')}">${gradeCellContent}</td>
      <td class="ranking-delta24h-cell${delta24hHiddenClass}">${delta24hCellHtml}</td>
      <td class="ranking-num ranking-col-honor${sortedClass('honor')}${hiddenClass('honor')}">${honorCellContent}</td>
      <td class="ranking-num ranking-col-xp${sortedClass('xp')}${hiddenClass('xp')}">${xpCellContent}</td>
      <td class="ranking-num ranking-col-rank_points${sortedClass('rank_points')}${hiddenClass('rank_points')}">${rpCellContent}</td>
      <td class="ranking-num ranking-col-npc_kills${sortedClass('npc_kills')}${hiddenClass('npc_kills')}">${npcKills}</td>
      <td class="ranking-num ranking-col-ship_kills${sortedClass('ship_kills')}${hiddenClass('ship_kills')}">${shipKills}</td>
      <td class="ranking-num ranking-col-galaxy_gates${sortedClass('galaxy_gates')}${hiddenClass('galaxy_gates')}"><span class="ranking-gg-cell">${galaxyGates}${ggEyeBtn}</span></td>
    `;
    tbody.appendChild(tr);
  });
  var token = ++_rankingRenderToken;
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      highlightActiveUserRow(tbody, token);
    });
  });
  // FIX 1 + FIX 3 — cache persistant : enrichit uniquement en vue "Aujourd'hui" (pas de filtre période).
  // En vue filtrée (7j/30j/24h), data.honor/xp/rank_points sont des deltas, pas des totaux absolus.
  try {
    var _isPeriodFiltered = !!((_lastRankingFilters && _lastRankingFilters.period));
    if (!_isPeriodFiltered && Array.isArray(data) && typeof isPlayerFollowed === 'function') {
      for (var _fri = 0; _fri < data.length; _fri++) {
        if (isPlayerFollowed(data[_fri])) _mergePersistedFollowedStatsFromRow(data[_fri]);
      }
    }
  } catch (_fe) {}
}

function highlightActiveUserRow(tbody, renderToken) {
  // Réinitialisé à chaque rendu complet du classement
  _playerMatchKey = null;

  function doHighlight(active) {
    if (renderToken !== _rankingRenderToken) return;
    if (!active || (!active.player_pseudo && !active.player_id)) return;

    var pseudoNorm = (active.player_pseudo || active.player_id || '').toString().trim().toLowerCase();
    var serverNorm = (active.player_server || '').toString().trim().toLowerCase();
    if (!pseudoNorm) return;

    // Calcul du matching pseudo+serveur une seule fois par rendu
    if (_playerMatchKey) return;
    _playerMatchKey = pseudoNorm + '|' + serverNorm;

    var rows = tbody.querySelectorAll('tr.ranking-row');
    var tr = null;
    for (var i = 0; i < rows.length; i++) {
      var payload = rows[i].getAttribute('data-ranking-payload');
      if (!payload) continue;
      try {
        var row = JSON.parse(payload);
        var pPseudo = (row.game_pseudo || row.name || '').toString().trim().toLowerCase();
        var pServer = ((row._server || row.server) || '').toString().trim().toLowerCase();
        if (pPseudo === pseudoNorm && (!serverNorm || pServer === serverNorm)) {
          tr = rows[i];
          break;
        }
      } catch (_) {}
    }
    if (!tr) return;

    // Mise en avant visuelle uniquement (pas de déplacement DOM)
    tr.classList.add('ranking-row--player-inplace');

    // Scroll automatique vers la ligne du joueur une seule fois par chargement
    if (!_hasScrolledToPlayer && typeof tr.scrollIntoView === 'function') {
      _hasScrolledToPlayer = true;
      try {
        tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
    }

    // Bouton \"Ma position\" visible uniquement si une ligne est trouvée
    var scrollBtn = document.getElementById('ranking-scroll-to-me');
    if (scrollBtn) {
      scrollBtn.style.display = '';
    }
  }

  var syncActive = typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerInfoSync
    ? UserPreferencesAPI.getActivePlayerInfoSync() : null;
  if (syncActive) doHighlight(syncActive);
  if (typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerInfo) {
    UserPreferencesAPI.getActivePlayerInfo().then(function (active) {
      if (!active) return;
      if (syncActive && active.player_id === syncActive.player_id && active.player_server === syncActive.player_server) return;
      doHighlight(active);
    }).catch(function () {});
  } else if (!syncActive && window.electronPlayerStatsCredentials && typeof window.electronPlayerStatsCredentials.getActive === 'function') {
    window.electronPlayerStatsCredentials.getActive().then(function (el) {
      if (!el) return;
      doHighlight({ player_pseudo: el.player_pseudo || el.username, player_id: el.player_id, player_server: el.player_server });
    }).catch(function () {});
  }
}

// escapeHtml centralisé dans utils.js


function findPlayerPositionInRanking(ranking, pseudo, server, userId) {
  if (!ranking || !Array.isArray(ranking)) return null;
  if (userId != null && userId !== '') {
    var uid = String(userId).trim();
    for (var i = 0; i < ranking.length; i++) {
      var pu = ranking[i].userId || ranking[i].user_id;
      if (pu != null && String(pu).trim() === uid) return i + 1;
    }
  }
  var pseudoNorm = (pseudo || '').toString().trim().toLowerCase();
  var serverNorm = (server || '').toString().toLowerCase();
  for (var j = 0; j < ranking.length; j++) {
    var p = ranking[j];
    var pPseudo = (p.game_pseudo || p.name || '').toString().trim().toLowerCase();
    var pServer = ((p._server || p.server) || '').toString().toLowerCase();
    if (pPseudo === pseudoNorm && (!serverNorm || pServer === serverNorm)) return j + 1;
  }
  return null;
}

function getFollowedPlayers() {
  var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
  var key = sk.FOLLOWED_PLAYERS || 'darkOrbitFollowedPlayers';
  if (typeof UnifiedStorage !== 'undefined') return UnifiedStorage.get(key, []);
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function setFollowedPlayers(list) {
  var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
  var key = sk.FOLLOWED_PLAYERS || 'darkOrbitFollowedPlayers';
  if (typeof UnifiedStorage !== 'undefined') {
    UnifiedStorage.set(key, list);
    if (typeof UnifiedStorage.invalidateCache === 'function') UnifiedStorage.invalidateCache(key);
  } else {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (_) {}
  }
}

function rowToFollowKey(row) {
  var userId = (row.userId != null ? String(row.userId) : null) || (row.user_id != null ? String(row.user_id) : null) || '';
  var server = ((row._server != null ? String(row._server) : null) || (row.server != null ? String(row.server) : null) || '').toLowerCase().trim();
  return (userId || '') + '|' + (server || '');
}

function isPlayerFollowed(row) {
  var key = rowToFollowKey(row);
  var list = getFollowedPlayers();
  return list.some(function (p) { return rowToFollowKey(p) === key; });
}

function addFollowedPlayer(row) {
  // Empêche de se suivre soi-même
  try {
    var active = typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerInfoSync
      ? UserPreferencesAPI.getActivePlayerInfoSync()
      : null;
    if (active) {
      var activePseudo = (active.player_pseudo || active.player_id || '').toString().trim().toLowerCase();
      var activeServer = (active.player_server || '').toString().trim().toLowerCase();
      var rowPseudo = (row.game_pseudo || row.name || '').toString().trim().toLowerCase();
      var rowServer = ((row._server || row.server) || '').toString().trim().toLowerCase();
      if (activePseudo && activeServer && rowPseudo === activePseudo && rowServer === activeServer) {
        if (typeof showToast === 'function') {
          showToast('Vous ne pouvez pas vous suivre vous-même', 'warning');
        }
        return;
      }
    }
  } catch (_) {}

  var key = rowToFollowKey(row);
  var list = getFollowedPlayers().filter(function (p) { return rowToFollowKey(p) !== key; });
  var gradeVal = (row.grade != null ? String(row.grade) : null) || (row.current_rank != null ? String(row.current_rank) : null) || (row.grade_normalized != null ? String(row.grade_normalized) : null);
  // FIX 7 — normaliser avant stockage (estimated_rp si aucune métrique brute)
  var entry = {
    userId: row.userId != null ? String(row.userId) : (row.user_id != null ? String(row.user_id) : ''),
    user_id: row.user_id != null ? String(row.user_id) : (row.userId != null ? String(row.userId) : ''),
    server: (row._server || row.server || '').toString().toLowerCase().trim(),
    _server: (row._server || row.server || '').toString().toLowerCase().trim(),
    game_pseudo: row.game_pseudo != null ? String(row.game_pseudo) : (row.name != null ? String(row.name) : '—'),
    company: row.company != null ? String(row.company) : null,
    grade: gradeVal,
    level: row.level != null ? Number(row.level) : null,
    honor: row.honor != null ? Number(row.honor) : null,
    xp: row.xp != null ? Number(row.xp) : null,
    rank_points: row.rank_points != null ? Number(row.rank_points) : null,
    estimated_rp: row.estimated_rp != null ? Number(row.estimated_rp) : null
  };
  var hasHonor = entry.honor != null && Number.isFinite(Number(entry.honor));
  var hasXp = entry.xp != null && Number.isFinite(Number(entry.xp));
  var hasRp = entry.rank_points != null && Number.isFinite(Number(entry.rank_points));
  if (!hasHonor && !hasXp && !hasRp) {
    var est = _computeEstimatedRpFromStats(entry.honor, entry.xp, entry.rank_points);
    if (est != null && Number.isFinite(est)) entry.estimated_rp = est;
    else Logger.warn('[FollowedPlayers] Suivi sans métrique honneur/XP/rank_points (cache pourra enrichir)', entry.game_pseudo, entry.server);
  }
  list.push(entry);
  setFollowedPlayers(list);
  try {
    _mergePersistedFollowedStatsFromRow(row);
  } catch (_e) {}
  // Invalider le cache RP du serveur pour forcer un rechargement des deltas
  var _entrySrv = entry.server || entry._server || '';
  if (_entrySrv && _rpDeltaByServer[_entrySrv]) {
    delete _rpDeltaByServer[_entrySrv];
  }
}

function removeFollowedPlayer(userId, server) {
  var norm = (userId != null ? String(userId) : '') + '|' + ((server != null ? String(server) : '').toLowerCase().trim());
  var list = getFollowedPlayers().filter(function (p) { return rowToFollowKey(p) !== norm; });
  setFollowedPlayers(list);
}

function _getFollowedStatsHistory() {
  var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
  var key = sk.FOLLOWED_PLAYERS_STATS || 'darkOrbitFollowedPlayersStats';
  if (typeof UnifiedStorage !== 'undefined') return UnifiedStorage.get(key, {});
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function _setFollowedStatsHistory(map) {
  var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
  var key = sk.FOLLOWED_PLAYERS_STATS || 'darkOrbitFollowedPlayersStats';
  if (typeof UnifiedStorage !== 'undefined') {
    UnifiedStorage.set(key, map);
    if (typeof UnifiedStorage.invalidateCache === 'function') UnifiedStorage.invalidateCache(key);
  } else {
    try { localStorage.setItem(key, JSON.stringify(map)); } catch (_) {}
  }
}

// FIX 1 — clé stable cache persistant (user_id + serveur)
function _followedPersistKey(userId, server) {
  var uid = (userId != null && userId !== '') ? String(userId).trim() : '';
  var srv = (server || '').toString().toLowerCase().trim();
  return uid + '|' + srv;
}

function _isEmptyFollowedPersistValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function _mergeFollowedPersistedStatsObjects(prev, incoming) {
  var out = {};
  for (var k in prev) {
    if (Object.prototype.hasOwnProperty.call(prev, k)) out[k] = prev[k];
  }
  if (!incoming || typeof incoming !== 'object') return out;
  for (var k2 in incoming) {
    if (!Object.prototype.hasOwnProperty.call(incoming, k2)) continue;
    var v = incoming[k2];
    if (_isEmptyFollowedPersistValue(v)) continue;
    out[k2] = v;
  }
  return out;
}

function _rowToPersistedFollowedStatsPayload(row) {
  if (!row) return {};
  var rawRank = (row.current_rank ? String(row.current_rank) : null) ||
    (row.grade_normalized ? String(row.grade_normalized) : null) ||
    (row.grade ? String(row.grade) : null);
  var serverForImg = (row._server || row.server || '').toString().toLowerCase().trim();
  var gradeImg = '';
  var companyBadgeHtml = '';
  try {
    gradeImg = getRankImg(rawRank, serverForImg) || '';
    companyBadgeHtml = getCompanyBadgeHtml(row.company) || '';
  } catch (_) {}
  var gradeName = (row.grade && String(row.grade).trim()) || (row.current_rank && String(row.current_rank).trim()) || (row.grade_normalized && String(row.grade_normalized).trim()) || '';
  var estRp = row.estimated_rp != null ? Number(row.estimated_rp) : null;
  if (estRp == null || !Number.isFinite(estRp)) {
    estRp = _computeEstimatedRpFromStats(row.honor, row.xp, row.rank_points);
  }
  var estScrape = row.estimated_rp_delta_scrape != null ? Number(row.estimated_rp_delta_scrape) : null;
  if (estScrape != null && !Number.isFinite(estScrape)) estScrape = null;
  return {
    honor: row.honor != null ? Number(row.honor) : null,
    xp: row.xp != null ? Number(row.xp) : null,
    rank_points: row.rank_points != null ? Number(row.rank_points) : null,
    estimated_rp: estRp,
    estimated_rp_delta_scrape: estScrape,
    level: row.level != null ? Number(row.level) : null,
    company: row.company != null ? String(row.company) : null,
    grade: gradeName || rawRank || null,
    gradeImg: gradeImg,
    gradeName: gradeName,
    companyBadgeHtml: companyBadgeHtml,
    game_pseudo: row.game_pseudo != null ? String(row.game_pseudo) : (row.name != null ? String(row.name) : null),
    server: serverForImg,
    user_id: row.userId != null ? String(row.userId) : (row.user_id != null ? String(row.user_id) : null),
    npc_kills: row.npc_kills != null ? Number(row.npc_kills) : null,
    ship_kills: row.ship_kills != null ? Number(row.ship_kills) : null,
    galaxy_gates: row.galaxy_gates != null ? Number(row.galaxy_gates) : null
  };
}

function _mergePersistedFollowedStatsFromRow(row) {
  if (!row || typeof isPlayerFollowed !== 'function' || !isPlayerFollowed(row)) return;
  var uid = row.userId != null ? String(row.userId) : (row.user_id != null ? String(row.user_id) : '');
  var srv = (row._server || row.server || '').toString().toLowerCase().trim();
  var key = _followedPersistKey(uid, srv);
  if (!key || key === '|') return;
  var map = _getFollowedStatsHistory();
  var payload = _rowToPersistedFollowedStatsPayload(row);
  var prev = map[key] && typeof map[key] === 'object' ? map[key] : {};
  map[key] = _mergeFollowedPersistedStatsObjects(prev, payload);
  _setFollowedStatsHistory(map);
}

function _statsFromFollowedSnapshot(followed) {
  if (!followed) return null;
  var gradeNameFromFollowed = (followed.grade && String(followed.grade).trim()) || (followed.current_rank && String(followed.current_rank).trim()) || '';
  var est = followed.estimated_rp != null ? Number(followed.estimated_rp) : null;
  if (est == null || !Number.isFinite(est)) {
    est = _computeEstimatedRpFromStats(followed.honor, followed.xp, followed.rank_points);
  }
  var gradeImgSnap = '';
  try {
    var raw = (followed.grade && String(followed.grade)) || (followed.current_rank && String(followed.current_rank)) || '';
    var srv = (followed.server || followed._server || '').toString().toLowerCase().trim();
    gradeImgSnap = raw ? (getRankImg(raw, srv) || '') : '';
  } catch (_) {}
  var companyBadgeHtml = '';
  try {
    companyBadgeHtml = getCompanyBadgeHtml(followed.company) || '';
  } catch (_) {}
  var scrapeDelta = followed.estimated_rp_delta_scrape != null ? Number(followed.estimated_rp_delta_scrape) : null;
  if (scrapeDelta != null && !Number.isFinite(scrapeDelta)) scrapeDelta = null;
  return {
    honor: followed.honor != null ? Number(followed.honor) : null,
    xp: followed.xp != null ? Number(followed.xp) : null,
    rank_points: followed.rank_points != null ? Number(followed.rank_points) : null,
    estimated_rp: est,
    estimated_rp_delta_scrape: scrapeDelta,
    level: followed.level != null ? Number(followed.level) : null,
    company: followed.company != null ? String(followed.company) : null,
    gradeImg: gradeImgSnap,
    companyBadgeHtml: companyBadgeHtml,
    gradeName: gradeNameFromFollowed
  };
}

function _pickFirstNonEmptyStat() {
  for (var i = 0; i < arguments.length; i++) {
    var v = arguments[i];
    if (_isEmptyFollowedPersistValue(v)) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    return v;
  }
  return null;
}

// FIX 5 — recherche dans un tableau import : user_id + serveur d'abord, pseudo ensuite
function _findImportedRankingRowForFollowed(list, srv, pseudoNorm, userId) {
  if (!Array.isArray(list)) return null;
  var srvNorm = (srv || '').toString().toLowerCase().trim();
  var uid = (userId || '').toString().trim();
  var pseudoN = (pseudoNorm || '').toString().trim().toLowerCase();
  if (uid) {
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r) continue;
      var rs = ((r._server || r.server) || '').toString().toLowerCase().trim();
      if (rs !== srvNorm) continue;
      var ru = (r.userId != null ? String(r.userId) : (r.user_id != null ? String(r.user_id) : '')).trim();
      if (ru === uid) return r;
    }
  }
  if (pseudoN) {
    for (var j = 0; j < list.length; j++) {
      var r2 = list[j];
      if (!r2) continue;
      var rs2 = ((r2._server || r2.server) || '').toString().toLowerCase().trim();
      if (rs2 !== srvNorm) continue;
      var pPseudo = (r2.game_pseudo || r2.name || '').toString().trim().toLowerCase();
      if (pPseudo === pseudoN) return r2;
    }
  }
  return null;
}

function _buildLiveStatsFromImports(srv, pseudoNorm, userId) {
  if (typeof getImportedRanking !== 'function') return null;
  var rowH = _findImportedRankingRowForFollowed(getImportedRanking(srv, 'honor'), srv, pseudoNorm, userId);
  var rowX = _findImportedRankingRowForFollowed(getImportedRanking(srv, 'xp'), srv, pseudoNorm, userId);
  var rowR = _findImportedRankingRowForFollowed(getImportedRanking(srv, 'rank_points'), srv, pseudoNorm, userId);
  var found = rowH || rowX || rowR;
  if (!found) return null;
  var estRp = (rowH && rowH.estimated_rp != null) ? Number(rowH.estimated_rp)
    : (rowX && rowX.estimated_rp != null) ? Number(rowX.estimated_rp)
    : (rowR && rowR.estimated_rp != null) ? Number(rowR.estimated_rp)
    : (found.estimated_rp != null ? Number(found.estimated_rp) : null);
  if (estRp == null || !Number.isFinite(estRp)) {
    var baseHonor = rowH ? rowH.honor : (rowX ? rowX.honor : (rowR ? rowR.honor : found.honor));
    var baseXp = rowX ? rowX.xp : (rowH ? rowH.xp : (rowR ? rowR.xp : found.xp));
    var baseRp = rowR ? rowR.rank_points : found.rank_points;
    estRp = _computeEstimatedRpFromStats(baseHonor, baseXp, baseRp);
  }
  var rawRank = (found.current_rank ? String(found.current_rank) : null) ||
    (found.grade_normalized ? String(found.grade_normalized) : null) ||
    (found.grade ? String(found.grade) : null);
  var serverForImg = (found._server || found.server || srv || '').toString().toLowerCase().trim();
  var gradeImg = '';
  var companyBadgeHtml = '';
  try {
    gradeImg = getRankImg(rawRank, serverForImg) || '';
    companyBadgeHtml = getCompanyBadgeHtml(found.company) || '';
  } catch (_) {}
  var gradeNameFromRow = (found.grade && String(found.grade).trim()) || (found.current_rank && String(found.current_rank).trim()) || (found.grade_normalized && String(found.grade_normalized).trim()) || '';
  var scrapeDelta = null;
  if (rowR && rowR.estimated_rp_delta_scrape != null) scrapeDelta = Number(rowR.estimated_rp_delta_scrape);
  else if (found.estimated_rp_delta_scrape != null) scrapeDelta = Number(found.estimated_rp_delta_scrape);
  if (scrapeDelta != null && !Number.isFinite(scrapeDelta)) scrapeDelta = null;
  return {
    honor: rowH && rowH.honor != null ? Number(rowH.honor) : (found.honor != null ? Number(found.honor) : null),
    xp: rowX && rowX.xp != null ? Number(rowX.xp) : (found.xp != null ? Number(found.xp) : null),
    rank_points: rowR && rowR.rank_points != null ? Number(rowR.rank_points) : (found.rank_points != null ? Number(found.rank_points) : null),
    estimated_rp: estRp,
    estimated_rp_delta_scrape: scrapeDelta,
    gradeImg: gradeImg || '',
    companyBadgeHtml: companyBadgeHtml || '',
    company: found.company != null ? String(found.company) : null,
    level: found.level != null ? Number(found.level) : null,
    gradeName: gradeNameFromRow
  };
}

function _computeEstimatedRpFromStats(honor, xp, rankPoints) {
  if (rankPoints != null && Number.isFinite(Number(rankPoints))) {
    return Number(rankPoints);
  }
  var hasHonor = honor != null && Number.isFinite(Number(honor));
  var hasXp = xp != null && Number.isFinite(Number(xp));
  if (!hasHonor && !hasXp) return null;
  var h = hasHonor ? Number(honor) : 0;
  var x = hasXp ? Number(xp) : 0;
  var rp = (h / 100) + (x / 100000);
  return Math.round(rp);
}

/**
 * FIX 2 + FIX 4 + FIX 5 — Stats joueur suivi : fusion champ par champ
 * (import live → cache persistant → snapshot au clic Suivre). Plus de _lastRankingData ici.
 */
function _getFollowedPlayerCurrentStats(followed) {
  var srv = (followed.server || followed._server || '').toString().toLowerCase().trim();
  var pseudo = (followed.game_pseudo || '').toString().trim().toLowerCase();
  var userId = (followed.userId != null ? String(followed.userId) : (followed.user_id != null ? String(followed.user_id) : '')).trim();
  if (!srv) return null;
  if (!userId && !pseudo) return null;

  var live = _buildLiveStatsFromImports(srv, pseudo, userId);
  var cacheKey = _followedPersistKey(userId || followed.userId || followed.user_id, srv);
  var map = _getFollowedStatsHistory();
  var cache = (cacheKey && map[cacheKey] && typeof map[cacheKey] === 'object') ? map[cacheKey] : null;
  var snap = _statsFromFollowedSnapshot(followed);

  var honor = _pickFirstNonEmptyStat(live && live.honor, cache && cache.honor, snap && snap.honor);
  var xp = _pickFirstNonEmptyStat(live && live.xp, cache && cache.xp, snap && snap.xp);
  var rank_points = _pickFirstNonEmptyStat(live && live.rank_points, cache && cache.rank_points, snap && snap.rank_points);
  var level = _pickFirstNonEmptyStat(live && live.level, cache && cache.level, snap && snap.level);
  var estimated_rp = _pickFirstNonEmptyStat(live && live.estimated_rp, cache && cache.estimated_rp, snap && snap.estimated_rp);
  var estimated_rp_delta_scrape = _pickFirstNonEmptyStat(
    live && live.estimated_rp_delta_scrape,
    cache && cache.estimated_rp_delta_scrape,
    snap && snap.estimated_rp_delta_scrape
  );
  if (estimated_rp_delta_scrape != null) {
    var _sd = Number(estimated_rp_delta_scrape);
    estimated_rp_delta_scrape = Number.isFinite(_sd) ? _sd : null;
  }
  var gradeImg = _pickFirstNonEmptyStat(live && live.gradeImg, cache && cache.gradeImg, snap && snap.gradeImg);
  var companyBadgeHtml = _pickFirstNonEmptyStat(live && live.companyBadgeHtml, cache && cache.companyBadgeHtml, snap && snap.companyBadgeHtml);
  var gradeName = _pickFirstNonEmptyStat(live && live.gradeName, cache && cache.gradeName, snap && snap.gradeName);
  if (gradeName != null && typeof gradeName !== 'string') gradeName = String(gradeName);

  if (_isEmptyFollowedPersistValue(companyBadgeHtml)) {
    var c = _pickFirstNonEmptyStat(live && live.company, cache && cache.company, snap && snap.company, followed.company);
    if (!_isEmptyFollowedPersistValue(c)) {
      try { companyBadgeHtml = getCompanyBadgeHtml(c) || ''; } catch (_) {}
    }
  }

  if (estimated_rp == null || !Number.isFinite(Number(estimated_rp))) {
    estimated_rp = _computeEstimatedRpFromStats(honor, xp, rank_points);
  }

  if (
    honor == null && xp == null && rank_points == null &&
    (estimated_rp == null || !Number.isFinite(Number(estimated_rp))) &&
    _isEmptyFollowedPersistValue(gradeImg) && _isEmptyFollowedPersistValue(gradeName) &&
    _isEmptyFollowedPersistValue(companyBadgeHtml) && level == null
  ) {
    return null;
  }

  return {
    honor: honor,
    xp: xp,
    rank_points: rank_points,
    estimated_rp: estimated_rp,
    estimated_rp_delta_scrape: estimated_rp_delta_scrape,
    level: level,
    gradeImg: gradeImg || '',
    companyBadgeHtml: companyBadgeHtml || '',
    gradeName: gradeName || ''
  };
}

/**
 * Retourne les stats utilisateur utilisées pour la comparaison (honneur, XP, points de grade).
 * Même source que l'onglet Statistiques : getLastSessionStats() (dernière session globale),
 * pour que la différence affichée corresponde à "Il vous reste X points" et soit à jour après "Récupérer mes stats".
 */
function _getUserStatsForComparison() {
  if (typeof getLastSessionStats !== 'function') return null;
  var last = getLastSessionStats();
  if (!last) return null;
  return {
    honor:      last.honor      != null ? Number(last.honor)      : null,
    xp:         last.xp         != null ? Number(last.xp)         : null,
    rankPoints: last.rankPoints != null ? Number(last.rankPoints) : (last.rank_points != null ? Number(last.rank_points) : null)
  };
}

/**
 * Diff du point de vue utilisateur : userVal - playerVal.
 * Si > 0 : tu es devant → "+ X" vert ; si < 0 : tu es derrière → "- X" rouge.
 * @param {number} userVal - valeur utilisateur
 * @param {number} playerVal - valeur joueur
 * @returns {{ sign: string, formatted: string, cls: string }} ou null si valeurs manquantes
 */
function _formatComparisonDiff(userVal, playerVal) {
  // FIX 8 — delta partiel : pas de blocage si une seule valeur joueur manque
  if (userVal == null || !Number.isFinite(Number(userVal))) return null;
  if (playerVal == null || !Number.isFinite(Number(playerVal))) {
    return { missing: true };
  }
  var u = Number(userVal);
  var p = Number(playerVal);
  var diff = u - p;
  var abs = Math.abs(diff);
  var formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (diff > 0) return { sign: '+ ', formatted: formatted, cls: 'comparison-diff-positive' };
  if (diff < 0) return { sign: '- ', formatted: formatted, cls: 'comparison-diff-negative' };
  return { sign: '', formatted: '0', cls: 'comparison-diff-neutral' };
}

function _buildComparisonDeltasHtml(userStats, playerHonor, playerXp, playerRp) {
  if (!userStats) return '';
  if (userStats.honor == null && userStats.xp == null && userStats.rankPoints == null) return '';
  function span(part) {
    if (!part) return '<span class="comparison-diff-item comparison-diff-missing">—</span>';
    if (part.missing) return '<span class="comparison-diff-item comparison-diff-missing">—</span>';
    return '<span class="comparison-diff-item ' + part.cls + '">' + part.sign + part.formatted + '</span>';
  }
  function cell(userStat, playerStat) {
    if (userStat == null || !Number.isFinite(Number(userStat))) return span(null);
    return span(_formatComparisonDiff(userStat, playerStat));
  }
  var honorPart = cell(userStats.honor, playerHonor);
  var xpPart = cell(userStats.xp, playerXp);
  var rpPart = cell(userStats.rankPoints, playerRp);
  return '<div class="watched-player-stat-group">' + honorPart + '</div>' +
    '<div class="watched-player-stat-group">' + xpPart + '</div>' +
    '<div class="watched-player-stat-group">' + rpPart + '</div>';
}

/**
 * Retourne le delta 24h du joueur suivi (gains honneur, XP, points de grade sur 24h).
 * @param {string} server - Code serveur
 * @param {string} pseudo - Pseudo du joueur
 * @param {string} userId - userId si connu
 * @returns {{ honorDelta: number|null, xpDelta: number|null, rpDelta: number|null }|null}
 */
function _getFollowedPlayer24hDelta(server, pseudo, userId) {
  // FIX 8 — deltas 24h partiels si un seul classement 24h a échoué
  var srv = (server || '').toString().toLowerCase().trim();
  var cache = _last24hByServer[srv];
  if (!cache) return null;
  var pseudoNorm = (pseudo || '').toString().trim().toLowerCase();
  var uid = (userId || '').toString().trim();

  function findInRows(rows) {
    if (!Array.isArray(rows)) return null;
    return rows.find(function (r) {
      var rPseudo = (r.game_pseudo || r.name || '').toString().trim().toLowerCase();
      var rUid = (r.userId || r.user_id || '').toString().trim();
      if (uid && rUid === uid) return true;
      return rPseudo === pseudoNorm;
    }) || null;
  }
  var rowH = cache.honor ? findInRows(cache.honor) : null;
  var rowX = cache.xp ? findInRows(cache.xp) : null;
  var rowR = cache.rank_points ? findInRows(cache.rank_points) : null;
  if (!rowH && !rowX && !rowR) return null;
  var honorDelta = rowH && rowH.honor != null ? Number(rowH.honor) : null;
  var xpDelta = rowX && rowX.xp != null ? Number(rowX.xp) : null;
  var rpDelta = null;
  if (rowR && rowR.rank_points != null) {
    rpDelta = Number(rowR.rank_points);
  }
  // Snapshot-based RP delta (source fiable — DOStats n'a pas de classement top_user par période)
  if (rpDelta == null && uid) {
    var rpMap = _rpDeltaByServer[srv];
    if (rpMap && rpMap[uid] != null && Number.isFinite(Number(rpMap[uid]))) {
      rpDelta = Number(rpMap[uid]);
    }
  }
  // Dernier recours : estimation approximative depuis honneur/XP 24h
  if (rpDelta == null && (honorDelta != null || xpDelta != null)) {
    var h = Number.isFinite(Number(honorDelta)) ? Number(honorDelta) : 0;
    var x = Number.isFinite(Number(xpDelta)) ? Number(xpDelta) : 0;
    rpDelta = Math.round((h / 100) + (x / 100000));
  }
  return {
    honorDelta: honorDelta,
    xpDelta: xpDelta,
    rpDelta: rpDelta
  };
}

/**
 * Charge les classements 24h pour un serveur (honor, xp, rank_points) et met en cache.
 * Appelle onDone() quand c'est prêt ; si des données ont été ajoutées, onDone(true) pour re-render la sidebar.
 */
function _ensure24hDataForServer(server, onDone) {
  // FIX 8 — un échec sur un des 3 loads ne vide pas tout le cache 24h
  var srv = (server || '').toString().toLowerCase().trim();
  if (!srv || typeof loadRanking !== 'function') {
    if (typeof onDone === 'function') onDone(false);
    return;
  }
  if (_last24hByServer[srv] && _last24hByServer[srv]._ready24h) {
    if (typeof onDone === 'function') onDone(false);
    return;
  }
  var hadBefore = !!_last24hByServer[srv];
  Promise.all([
    loadRanking({ server: srv, type: 'honor', period: '24h', limit: 500 }).catch(function () { return []; }),
    loadRanking({ server: srv, type: 'xp', period: '24h', limit: 500 }).catch(function () { return []; }),
    loadRanking({ server: srv, type: 'rank_points', period: '24h', limit: 500 }).catch(function () { return []; })
  ]).then(function (results) {
    var honor = Array.isArray(results[0]) ? results[0] : [];
    var xp = Array.isArray(results[1]) ? results[1] : [];
    var rank_points = Array.isArray(results[2]) ? results[2] : [];
    _last24hByServer[srv] = { honor: honor, xp: xp, rank_points: rank_points, _ready24h: true };
    if (typeof onDone === 'function') onDone(!hadBefore);
  }).catch(function () {
    if (typeof onDone === 'function') onDone(false);
  });
}

/**
 * Charge les deltas RP (points de grade) depuis les snapshots Supabase pour les joueurs suivis
 * sur un serveur donné. DOStats ne fournit pas de classement top_user par période —
 * on compare deux snapshots : le plus récent et celui d'il y a ~24h.
 */
function _ensureRpDeltasForServer(server, followedList, onDone) {
  var srv = (server || '').toString().toLowerCase().trim();
  if (!srv || typeof getSupabaseClient !== 'function') {
    if (typeof onDone === 'function') onDone(false);
    return;
  }
  if (_rpDeltaByServer[srv] && _rpDeltaByServer[srv]._readyRp) {
    if (typeof onDone === 'function') onDone(false);
    return;
  }
  var supabase = getSupabaseClient();
  if (!supabase) { if (typeof onDone === 'function') onDone(false); return; }
  var userIds = (followedList || []).map(function(p) {
    return String(p.userId || p.user_id || '').trim();
  }).filter(Boolean);
  if (!userIds.length) { if (typeof onDone === 'function') onDone(false); return; }
  var hadBefore = !!_rpDeltaByServer[srv];
  supabase.rpc('get_rp_deltas', { p_server: srv, p_user_ids: userIds, p_hours: 24 })
    .then(function(res) {
      if (!res.error && Array.isArray(res.data) && res.data.length > 0) {
        var map = { _readyRp: true };
        res.data.forEach(function(row) {
          if (row.user_id && row.delta != null) map[row.user_id] = Number(row.delta);
        });
        _rpDeltaByServer[srv] = map;
        if (typeof onDone === 'function') onDone(!hadBefore);
      } else {
        _rpDeltaByServer[srv] = { _readyRp: true };
        if (typeof onDone === 'function') onDone(false);
      }
    })
    .catch(function() { if (typeof onDone === 'function') onDone(false); });
}

/**
 * Construit le HTML des 3 cellules pour la ligne « Delta 24h » du joueur suivi.
 * Toujours 3 cellules (— si pas de donnée) pour garder la grille alignée.
 */
function _build24hDeltasRowHtml(deltas) {
  function cell(val) {
    if (val == null || !Number.isFinite(Number(val))) return '<div class="watched-player-stat-group watched-player-delta-24h-cell"><span class="watched-player-delta-24h-value">—</span></div>';
    var n = Number(val);
    var formatted = (n >= 0 ? '+' : '') + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var cls = n > 0 ? 'watched-player-delta-24h-value comparison-diff-positive' : (n < 0 ? 'watched-player-delta-24h-value comparison-diff-negative' : 'watched-player-delta-24h-value');
    return '<div class="watched-player-stat-group watched-player-delta-24h-cell"><span class="' + cls + '">' + escapeHtml(formatted) + '</span></div>';
  }
  function cellRp(d) {
    if (d && d._rpScrapeMissing) {
      return '<div class="watched-player-stat-group watched-player-delta-24h-cell"><span class="watched-player-delta-24h-value comparison-diff-negative">null</span></div>';
    }
    return cell(d && d.rpDelta);
  }
  return cell(deltas && deltas.honorDelta) + cell(deltas && deltas.xpDelta) + cellRp(deltas);
}

function _formatFollowedDelta(followed, userStats) {
  // FIX 8 — comparaison partielle si les stats joueur sont incomplètes
  if (!followed || !userStats) return '';
  var playerStats = _getFollowedPlayerCurrentStats(followed);
  return _buildComparisonDeltasHtml(
    userStats,
    playerStats && playerStats.honor != null ? Number(playerStats.honor) : null,
    playerStats && playerStats.xp != null ? Number(playerStats.xp) : null,
    playerStats && playerStats.estimated_rp != null ? Number(playerStats.estimated_rp) : null
  );
}

var _FREE_FOLLOW_DEMO = [
  { pseudo: 'StarHunter_', server: 'gbl5', company: 'eic', level: 26, honor: 1842000, xp: 412000000, rp: 8120000, rankKey: 'rank_12' },
  { pseudo: 'Nova-7', server: 'fr1', company: 'mmo', level: 22, honor: 920000, xp: 98500000, rp: 3100000, rankKey: 'rank_9' },
  { pseudo: 'Vega_K', server: 'int5', company: 'vru', level: 19, honor: 510000, xp: 45200000, rp: 1200000, rankKey: 'rank_7' },
  { pseudo: 'Orion.Legacy', server: 'de2', company: 'eic', level: 31, honor: 3200000, xp: 890000000, rp: 15800000, rankKey: 'rank_15' }
];

function renderFreeShowcaseFollowedPlayers() {
  var container = document.getElementById('sidebarFollowedPlayers');
  if (!container) return;
  var serverDisplay = typeof SERVER_CODE_TO_DISPLAY !== 'undefined' ? SERVER_CODE_TO_DISPLAY : {};
  var demos = _FREE_FOLLOW_DEMO;

  function esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  var html = demos.map(function (p) {
    var displayServer = serverDisplay[p.server] ? serverDisplay[p.server] + ' (' + p.server + ')' : p.server;
    var companyBadgeHtml = typeof window.getCompanyBadgeHtml === 'function' ? window.getCompanyBadgeHtml(p.company) : '';
    var companyName = (p.company || '').toString().trim().toUpperCase() || '—';
    var line2Firme = companyBadgeHtml
      ? '<span class="watched-player-tooltip-wrap" data-tooltip="' + esc(companyName) + '">' + companyBadgeHtml + '</span>'
      : '<span class="watched-player-tooltip-wrap" data-tooltip="' + esc(companyName) + '">—</span>';

    var gradeImg = '';
    var gradeName = '—';
    if (typeof window.getRankImg === 'function' && p.rankKey) {
      gradeImg = window.getRankImg(p.rankKey, p.server) || '';
    }
    if (typeof window.getGradeTooltip === 'function' && p.rankKey) {
      gradeName = window.getGradeTooltip(p.rankKey, p.rankKey) || p.rankKey;
    }
    var gradeImgHtml = gradeImg
      ? '<img class="watched-player-grade-icon" src="' + esc(gradeImg) + '" alt="" title="' + esc(gradeName) + '" />'
      : '';
    var line2Grade = gradeImgHtml
      ? '<span class="watched-player-tooltip-wrap" data-tooltip="' + esc(gradeName) + '">' + gradeImgHtml + '</span>'
      : '<span class="watched-player-tooltip-wrap" data-tooltip="' + esc(gradeName) + '">—</span>';

    var honorLine = '<span class="watched-player-stat-line"><span class="watched-player-stat-label"><img src="img/icon_btn/honor_icon.png" alt="" class="watched-player-stat-icon"></span><span class="watched-player-stat-value">' + esc(formatRankingNumber(p.honor)) + '</span></span>';
    var xpLine = '<span class="watched-player-stat-line"><span class="watched-player-stat-label"><img src="img/icon_btn/xp_icon.png" alt="" class="watched-player-stat-icon"></span><span class="watched-player-stat-value">' + esc(formatRankingNumber(p.xp)) + '</span></span>';
    var gradeLine = '<span class="watched-player-stat-line"><span class="watched-player-stat-label"><img src="img/icon_btn/rp_icon.png" alt="" class="watched-player-stat-icon"></span><span class="watched-player-stat-value">' + esc(formatRankingNumber(p.rp)) + '</span></span>';

    return (
      '<div class="watched-player-card watched-player-card--free-demo" data-free-demo="1">' +
        '<div class="watched-player-header">' +
          '<div class="watched-player-header-main">' +
            '<div class="watched-player-header-line1">' +
              '<span class="watched-player-pseudo">' + esc(p.pseudo) + '</span>' +
              '<span class="watched-player-server">' + esc(displayServer) + '</span>' +
            '</div>' +
            '<div class="watched-player-header-line2">' +
              '<span class="watched-player-line2-block"><span class="watched-player-line2-label">Firme :</span> ' + line2Firme + '</span>' +
              '<span class="watched-player-line2-block"><span class="watched-player-line2-label">Niveau :</span> ' + esc(String(p.level)) + '</span>' +
              '<span class="watched-player-line2-block"><span class="watched-player-line2-label">Grade :</span> ' + line2Grade + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="watched-player-separator"></div>' +
        '<div class="watched-player-stats">' +
          '<div class="watched-player-stat-group">' + honorLine + '</div>' +
          '<div class="watched-player-stat-group">' + xpLine + '</div>' +
          '<div class="watched-player-stat-group">' + gradeLine + '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  container.innerHTML = html;
}

function _hideFollowedPlayerInfoTooltip() {
  var el = document.getElementById('watchedPlayerInfoTooltip');
  if (el) {
    el.classList.remove('is-visible');
    el.textContent = '';
  }
}

function _showFollowedPlayerInfoTooltip(icon) {
  var text = icon.getAttribute('data-tooltip');
  if (!text) return;
  var el = document.getElementById('watchedPlayerInfoTooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'watchedPlayerInfoTooltip';
    el.className = 'watched-player-floating-tooltip';
    el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
  }
  el.textContent = text;
  var r = icon.getBoundingClientRect();
  var vw = window.innerWidth || 800;
  var maxW = Math.max(200, Math.min(300, vw - 32));
  el.style.width = maxW + 'px';
  el.style.maxWidth = maxW + 'px';
  var cx = r.left + r.width / 2;
  cx = Math.max(maxW / 2 + 8, Math.min(cx, vw - maxW / 2 - 8));
  el.style.left = cx + 'px';
  el.style.top = (r.bottom + 6) + 'px';
  el.classList.add('is-visible');
}

function _bindFollowedPlayerInfoTooltips(container) {
  if (!container) return;
  container.querySelectorAll('.watched-player-row-info-icon').forEach(function (icon) {
    icon.addEventListener('mouseenter', function () { _showFollowedPlayerInfoTooltip(icon); });
    icon.addEventListener('mouseleave', function () { _hideFollowedPlayerInfoTooltip(); });
  });
  if (!container._followedInfoScrollBound) {
    container._followedInfoScrollBound = true;
    container.addEventListener('scroll', function () { _hideFollowedPlayerInfoTooltip(); }, true);
  }
  if (!window._followedInfoWindowScrollBound) {
    window._followedInfoWindowScrollBound = true;
    window.addEventListener('scroll', function () { _hideFollowedPlayerInfoTooltip(); }, true);
  }
}

function renderFollowedPlayersSidebar() {
  var container = document.getElementById('sidebarFollowedPlayers');
  if (!container) return;
  if (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'FREE') {
    renderFreeShowcaseFollowedPlayers();
    return;
  }
  var list = getFollowedPlayers();
  var noFollowedText = typeof window.i18nT === 'function' ? window.i18nT('no_followed_players') : 'Aucun joueur suivi';
  var unfollowText = typeof window.i18nT === 'function' ? window.i18nT('unfollow_player') : 'Ne plus suivre';
  if (list.length === 0) {
    container.innerHTML = '<div class="no-event">' + escapeHtml(noFollowedText) + '</div>';
    return;
  }
  var serverDisplay = typeof SERVER_CODE_TO_DISPLAY !== 'undefined' ? SERVER_CODE_TO_DISPLAY : {};

  function buildStatLine(icon, cur) {
    var hasCurrent = cur != null && Number.isFinite(Number(cur));
    var valueStr = hasCurrent ? formatRankingNumber(cur) : '—';
    return '<span class="watched-player-stat-line">' +
      '<span class="watched-player-stat-label">' + icon + '</span>' +
      '<span class="watched-player-stat-value">' + valueStr + '</span>' +
    '</span>';
  }

  var html = list.map(function (p) {
    var pseudo = (p.game_pseudo || '—').toString();
    var srv = (p.server || p._server || '').toString();
    var displayServer = serverDisplay[srv] ? serverDisplay[srv] + ' (' + srv + ')' : (srv || '—');
    var key = rowToFollowKey(p);

    var playerStats = _getFollowedPlayerCurrentStats(p);
    var curHonor = playerStats && playerStats.honor != null ? Number(playerStats.honor) : null;
    var curXp = playerStats && playerStats.xp != null ? Number(playerStats.xp) : null;
    var curGrade = playerStats && playerStats.estimated_rp != null ? Number(playerStats.estimated_rp) : null;
    var curLevel = playerStats && playerStats.level != null ? Number(playerStats.level) : (p.level != null ? Number(p.level) : null);

    if (playerStats && curGrade == null && typeof window !== 'undefined' && window.DEBUG) {
      Logger.warn('[FollowedPlayers] estimated_rp manquant pour', pseudo, srv, playerStats);
    }

    var levelValue = curLevel != null && Number.isFinite(curLevel) ? String(Math.round(curLevel)) : '—';

    var honorLine = buildStatLine('<img src="img/icon_btn/honor_icon.png" alt="" class="watched-player-stat-icon">', curHonor);
    var xpLine = buildStatLine('<img src="img/icon_btn/xp_icon.png" alt="" class="watched-player-stat-icon">', curXp);
    var gradeLine = buildStatLine('<img src="img/icon_btn/rp_icon.png" alt="" class="watched-player-stat-icon">', curGrade);

    var userStats = _getUserStatsForComparison();
    var comparisonDeltasHtml = _formatFollowedDelta(p, userStats);
    var deltas24h = _getFollowedPlayer24hDelta(srv, pseudo, p.userId || p.user_id || '');
    if (!deltas24h) deltas24h = { honorDelta: null, xpDelta: null, rpDelta: null };
    else deltas24h = Object.assign({}, deltas24h);
    var scrapeRp = playerStats && playerStats.estimated_rp_delta_scrape != null ? Number(playerStats.estimated_rp_delta_scrape) : null;
    if (scrapeRp != null && Number.isFinite(scrapeRp)) {
      deltas24h.rpDelta = scrapeRp;
      deltas24h._rpScrapeMissing = false;
    } else {
      deltas24h.rpDelta = null;
      deltas24h._rpScrapeMissing = true;
    }
    var row24hHtml = _build24hDeltasRowHtml(deltas24h);

    // FIX 6 — icône grade en priorité ; texte si pas d’image ou erreur de chargement
    var gradeImg = playerStats && playerStats.gradeImg ? String(playerStats.gradeImg) : '';
    var companyBadgeHtml = playerStats && playerStats.companyBadgeHtml ? String(playerStats.companyBadgeHtml) : '';
    var companyName = (p.company || '').toString().trim().toUpperCase() || '—';
    var gradeNameRaw = (playerStats && playerStats.gradeName) || p.grade || p.current_rank || '';
    gradeNameRaw = gradeNameRaw.toString().trim();
    var gradeName = gradeNameRaw ? gradeNameRaw.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : '';
    var gradeTip = gradeName || gradeNameRaw || '';
    var gradeFallbackText = gradeName || gradeNameRaw || '';
    var line2Firme = companyBadgeHtml
      ? '<span class="watched-player-tooltip-wrap" data-tooltip="' + escapeHtml(companyName) + '">' + companyBadgeHtml + '</span>'
      : '<span class="watched-player-tooltip-wrap" data-tooltip="' + escapeHtml(companyName) + '">—</span>';
    var line2Grade;
    if (gradeImg) {
      line2Grade = '<span class="watched-player-tooltip-wrap" data-tooltip="' + escapeHtml(gradeTip) + '">' +
        '<span class="watched-player-grade-cell" data-fallback="' + escapeHtml(gradeFallbackText) + '">' +
        '<img class="watched-player-grade-icon" src="' + escapeHtml(gradeImg) + '" alt="" onerror="var p=this.parentNode;if(p)p.textContent=p.getAttribute(\'data-fallback\')||\'\';this.style.display=\'none\';" />' +
        '</span></span>';
    } else {
      line2Grade = '<span class="watched-player-tooltip-wrap" data-tooltip="' + escapeHtml(gradeTip) + '">' +
        (gradeFallbackText ? escapeHtml(gradeFallbackText) : '—') +
        '</span>';
    }

    return (
      '<div class="watched-player-card" data-user-id="' + escapeHtml(p.userId || p.user_id || '') + '" data-server="' + escapeHtml(srv) + '">' +
        '<div class="watched-player-header">' +
          '<span class="watched-player-drag-handle" draggable="true" title="Déplacer" aria-label="Déplacer">⋮⋮</span>' +
          '<div class="watched-player-header-main">' +
            '<div class="watched-player-header-line1">' +
              '<span class="watched-player-pseudo">' + escapeHtml(pseudo) + '</span>' +
              '<span class="watched-player-server">' + escapeHtml(displayServer) + '</span>' +
            '</div>' +
            '<div class="watched-player-header-line2">' +
              '<span class="watched-player-line2-block">' +
                '<span class="watched-player-line2-label">Firme :</span> ' + line2Firme +
              '</span>' +
              '<span class="watched-player-line2-block">' +
                '<span class="watched-player-line2-label">Niveau :</span> ' + escapeHtml(levelValue) +
              '</span>' +
              '<span class="watched-player-line2-block">' +
                '<span class="watched-player-line2-label">Grade :</span> ' + line2Grade +
              '</span>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="watched-player-remove" title="' + escapeHtml(unfollowText) + '">×</button>' +
        '</div>' +
        '<div class="watched-player-separator"></div>' +
        '<div class="watched-player-stats-grid watched-player-stats-grid-with-labels">' +
          '<div class="watched-player-stat-group">' + honorLine + '</div>' +
          '<div class="watched-player-stat-group">' + xpLine + '</div>' +
          '<div class="watched-player-stat-group">' + gradeLine + '</div>' +
          '<div class="watched-player-row-label watched-player-row-label-empty"></div>' +
          (comparisonDeltasHtml
            ? comparisonDeltasHtml +
              '<span class="watched-player-row-info-icon" data-tooltip="Différence de points entre vous et ' + escapeHtml(pseudo) + '" aria-label="Info">ℹ</span>'
            : '') +
          row24hHtml +
          '<span class="watched-player-row-info-icon" data-tooltip="Points réalisés par ' + escapeHtml(pseudo) + ' sur les dernières 24 heures" aria-label="Info">ℹ</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  container.innerHTML = html;
  _bindFollowedPlayerInfoTooltips(container);

  // Charger les classements 24h pour les serveurs des joueurs suivis (cache) ; re-render quand des données arrivent
  var servers = [];
  list.forEach(function (p) {
    var s = (p.server || p._server || '').toString().toLowerCase().trim();
    if (s && servers.indexOf(s) === -1) servers.push(s);
  });
  servers.forEach(function (srv) {
    var followedOnSrv = list.filter(function(p) {
      return (p.server || p._server || '').toString().toLowerCase().trim() === srv;
    });
    _ensure24hDataForServer(srv, function (shouldRerender) {
      if (shouldRerender && typeof renderFollowedPlayersSidebar === 'function') renderFollowedPlayersSidebar();
    });
    _ensureRpDeltasForServer(srv, followedOnSrv, function (shouldRerender) {
      if (shouldRerender && typeof renderFollowedPlayersSidebar === 'function') renderFollowedPlayersSidebar();
    });
  });

  container.querySelectorAll('.watched-player-remove').forEach(function (btn) {
    btn.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      window._followedCardDragDisabled = true;
    });
    btn.addEventListener('mouseup', function () {
      window._followedCardDragDisabled = false;
    });
    btn.addEventListener('mouseleave', function () {
      window._followedCardDragDisabled = false;
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      window._followedCardDragDisabled = false;
      var item = btn.closest('.watched-player-card');
      if (!item) return;
      var userId = item.getAttribute('data-user-id');
      var server = item.getAttribute('data-server');
      removeFollowedPlayer(userId, server);
      renderFollowedPlayersSidebar();
      if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('unfollow_player') : 'Ne plus suivre', 'info');
    });
  });

  // Drag & drop avec placeholder : poignée "⋮⋮" pour démarrer le drag (évite conflit avec scroll/clic)
  var placeholder = null;

  function getFlowChildren() {
    return Array.prototype.filter.call(container.children, function (el) {
      return !el.classList.contains('watched-player-card--dragging');
    });
  }

  function getPlaceholderIndex() {
    if (!placeholder || !placeholder.parentNode) return -1;
    var flow = getFlowChildren();
    var idx = flow.indexOf(placeholder);
    return idx;
  }

  function getTargetIndex(clientY) {
    var flow = getFlowChildren();
    if (flow.length === 0) return 0;
    for (var i = 0; i < flow.length; i++) {
      var rect = flow[i].getBoundingClientRect();
      var mid = rect.top + rect.height / 2;
      if (clientY <= mid) return i;
    }
    return flow.length;
  }

  container.querySelectorAll('.watched-player-drag-handle').forEach(function (handle) {
    var card = handle.closest('.watched-player-card');
    if (!card) return;

    handle.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    handle.addEventListener('dragstart', function (e) {
      if (window._followedCardDragDisabled) {
        e.preventDefault();
        return;
      }
      var idx = Array.prototype.indexOf.call(container.children, card);
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setDragImage(card, 0, 0);
      } catch (_) {}
      card.classList.add('watched-player-card--dragging');

      var h = card.offsetHeight;
      var place = document.createElement('div');
      place.className = 'watched-player-drag-placeholder';
      place.style.minHeight = h + 'px';

      function applyPlaceholder() {
        placeholder = place;
        container.insertBefore(placeholder, card);
        card.style.height = '0';
        card.style.minHeight = '0';
        card.style.overflow = 'hidden';
        card.style.padding = '0';
        card.style.margin = '0';
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
      }
      setTimeout(applyPlaceholder, 0);
    });
  });

  container.querySelectorAll('.watched-player-card').forEach(function (card) {
    card.addEventListener('dragend', function (e) {
      card.classList.remove('watched-player-card--dragging');
      card.style.height = '';
      card.style.minHeight = '';
      card.style.overflow = '';
      card.style.padding = '';
      card.style.margin = '';
      card.style.opacity = '';
      card.style.pointerEvents = '';
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
        placeholder = null;
        if (typeof renderFollowedPlayersSidebar === 'function') renderFollowedPlayersSidebar();
      }
    });

    card.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!placeholder || !placeholder.parentNode) return;
      var targetIdx = getTargetIndex(e.clientY);
      var currentIdx = getPlaceholderIndex();
      if (currentIdx === -1 || targetIdx === currentIdx) return;
      var flow = getFlowChildren();
      var targetEl = flow[targetIdx];
      if (targetEl && targetEl !== placeholder) {
        container.insertBefore(placeholder, targetEl);
      } else if (targetIdx >= flow.length && container.lastChild !== placeholder) {
        container.appendChild(placeholder);
      }
    });

    card.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!placeholder || !placeholder.parentNode) return;
      var toIndex = getPlaceholderIndex();
      var fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (Number.isNaN(fromIndex) || toIndex === -1) return;
      var list = getFollowedPlayers();
      if (fromIndex >= list.length) return;
      var item = list[fromIndex];
      var newList = list.slice();
      newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, item);
      setFollowedPlayers(newList);
      if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      placeholder = null;
      renderFollowedPlayersSidebar();
    });
  });

  container.addEventListener('dragenter', function (e) {
    if (!container.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });

  container.addEventListener('dragover', function (e) {
    if (!container.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    if (!placeholder || !placeholder.parentNode) return;
    var targetIdx = getTargetIndex(e.clientY);
    var currentIdx = getPlaceholderIndex();
    if (currentIdx === -1 || targetIdx === currentIdx) return;
    var flow = getFlowChildren();
    var targetEl = flow[targetIdx];
    if (targetEl && targetEl !== placeholder) {
      container.insertBefore(placeholder, targetEl);
    } else if (targetIdx >= flow.length && container.lastChild !== placeholder) {
      container.appendChild(placeholder);
    }
  });

  container.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (!placeholder || !placeholder.parentNode) return;
    var toIndex = getPlaceholderIndex();
    var fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (Number.isNaN(fromIndex) || toIndex === -1) return;
    var list = getFollowedPlayers();
    if (fromIndex >= list.length) return;
    var item = list[fromIndex];
    var newList = list.slice();
    newList.splice(fromIndex, 1);
    newList.splice(toIndex, 0, item);
    setFollowedPlayers(newList);
    if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
    placeholder = null;
    renderFollowedPlayersSidebar();
  });

  // Clic sur la carte : ouvre le popup de détail si possible
  function findRankingRowForFollowed(userId, server) {
    // FIX 2 — ouvrir le détail même si le classement courant est un autre serveur (imports + cache)
    var uid = (userId || '').toString().trim();
    var srv = (server || '').toString().toLowerCase().trim();
    if (typeof getImportedRanking === 'function' && srv) {
      var imp = getImportedRanking(srv, 'honor');
      if (Array.isArray(imp)) {
        for (var ii = 0; ii < imp.length; ii++) {
          var ir = imp[ii];
          var iru = (ir.userId != null ? String(ir.userId) : (ir.user_id != null ? String(ir.user_id) : '')).trim();
          var irs = ((ir._server || ir.server) || '').toString().toLowerCase().trim();
          if (uid && iru === uid && irs === srv) return ir;
        }
      }
    }
    // FIX 2b — sans serveur suivi explicite, ne pas utiliser _lastRankingData (évite match user_id seul sur le mauvais serveur)
    if (srv && Array.isArray(_lastRankingData) && _lastRankingData.length > 0) {
      for (var i = 0; i < _lastRankingData.length; i++) {
        var r = _lastRankingData[i];
        var ru = (r.userId != null ? String(r.userId) : (r.user_id != null ? String(r.user_id) : '')).trim();
        var rs = ((r._server || r.server) || '').toString().toLowerCase().trim();
        // FIX 2b — ligne sans serveur : ne jamais matcher ; sinon exiger rs === srv avec uid aligné
        if (!rs) continue;
        if (uid && ru === uid && rs === srv) return r;
      }
    }
    var flist = getFollowedPlayers();
    for (var f = 0; f < flist.length; f++) {
      var p = flist[f];
      var pu = (p.userId != null ? String(p.userId) : (p.user_id != null ? String(p.user_id) : '')).trim();
      var ps = ((p._server || p.server) || '').toString().toLowerCase().trim();
      if (uid && pu === uid && ps === srv) {
        var ck = _followedPersistKey(pu, srv);
        var cmap = _getFollowedStatsHistory();
        var c = (ck && cmap[ck] && typeof cmap[ck] === 'object') ? cmap[ck] : {};
        return Object.assign({}, p, c, { game_pseudo: p.game_pseudo, _server: srv, server: srv });
      }
    }
    return null;
  }

  container.querySelectorAll('.watched-player-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('.watched-player-remove')) return;
      if (typeof showPlayerDetails !== 'function') return;
      var userId = card.getAttribute('data-user-id');
      var server = card.getAttribute('data-server');
      var row = findRankingRowForFollowed(userId, server);
      if (row) showPlayerDetails(row);
    });
  });
}

if (typeof window !== 'undefined') {
  window.refreshFollowedPlayersSidebar = renderFollowedPlayersSidebar;
  // FIX 3 — autres modules peuvent enrichir le cache (ex. ranking.js après enrichissement profils)
  window.mergeFollowedPlayerStatsCacheFromRow = function (row) {
    if (!row) return;
    try {
      if (typeof isPlayerFollowed === 'function' && isPlayerFollowed(row)) {
        _mergePersistedFollowedStatsFromRow(row);
      }
    } catch (_e) {}
  };
}

function _toastFreeRankingDetailsLocked(playerName) {
  const badge = (typeof getCurrentBadge === 'function' ? getCurrentBadge() : null) || 'FREE';
  if (badge !== 'FREE') return;

  const p = playerName != null ? String(playerName) : '';
  const name = p.trim() || 'le joueur';

  var msg = (typeof window !== 'undefined' && typeof window.i18nT === 'function')
    ? window.i18nT('upgrade_free_ranking_details_toast')
    : 'Passer à PRO pour voir les détails du {{player}}';

  if (typeof msg === 'string') msg = msg.replace('{{player}}', name);
  if (typeof showToast === 'function') showToast(msg, 'warning');
}

function showPlayerDetails(row) {
  if ((typeof getCurrentBadge === 'function' ? getCurrentBadge() : null) === 'FREE') {
    const pseudo = row && (row.game_pseudo != null ? String(row.game_pseudo) : (row.name != null ? String(row.name) : ''));
    _toastFreeRankingDetailsLocked(pseudo);
    return;
  }
  _currentRankingDetailRow = row;
  try {
    if (typeof _mergePersistedFollowedStatsFromRow === 'function') _mergePersistedFollowedStatsFromRow(row);
  } catch (_e) {}
  const modal = document.getElementById('ranking-detail-modal');
  const overlay = document.getElementById('ranking-detail-overlay');
  if (!modal || !overlay) return;

  const pseudo = row.game_pseudo != null ? String(row.game_pseudo) : '—';
  const rawRank = (row.current_rank ? String(row.current_rank) : null) || (row.grade_normalized ? String(row.grade_normalized) : null) || (row.grade ? String(row.grade) : null);
  const rankImg = getRankImg(rawRank, row._server || row.server);
  const gradeName = getGradeTooltip(rawRank, rawRank || '—');
  const honor = formatRankingNumber(row.honor);
  const xp = formatRankingNumber(row.xp);
  const rankPoints = formatRankingNumber(row.rank_points);
  var level = (row.level != null && Number.isFinite(Number(row.level))) ? String(row.level) : '—';
  const serverCode = (row._server || row.server || '').toString().toLowerCase();
  var serverDisplay = '—';
  if (serverCode) {
    var displayName = typeof SERVER_CODE_TO_DISPLAY !== 'undefined' && SERVER_CODE_TO_DISPLAY[serverCode];
    serverDisplay = displayName ? displayName + ' — ' + serverCode : serverCode;
  }

  var posHonor = (row.honor_rank != null ? String(row.honor_rank) : null) || (row._sortType === 'honor' && row._position ? String(row._position) : null);
  var posXp = (row.experience_rank != null ? String(row.experience_rank) : null) || (row._sortType === 'xp' && row._position ? String(row._position) : null);
  var posGeneral = (row.top_user_rank != null ? String(row.top_user_rank) : null) || (row._sortType === 'rank_points' && row._position ? String(row._position) : null);

  function updatePositions() {
    var ph = modal.querySelector('[data-ranking-detail-pos-honor]');
    var px = modal.querySelector('[data-ranking-detail-pos-xp]');
    var pg = modal.querySelector('[data-ranking-detail-pos-general]');
    if (ph) ph.textContent = posHonor != null ? String(posHonor) : '—';
    if (px) px.textContent = posXp != null ? String(posXp) : '—';
    if (pg) pg.textContent = posGeneral != null ? String(posGeneral) : '—';
  }

  let dateStr = '—';
  if (row.session_timestamp) {
    try {
      const d = new Date(row.session_timestamp);
      dateStr = d.toLocaleString(typeof getCurrentLang === 'function' ? getCurrentLang() : 'fr');
    } catch (_) {}
  } else if (row._uploaded_at) {
    try {
      dateStr = new Date(row._uploaded_at).toLocaleString(typeof getCurrentLang === 'function' ? getCurrentLang() : 'fr');
    } catch (_) {}
  } else if (row.session_date) {
    dateStr = String(row.session_date);
  }

  const companyBadgeEl = modal.querySelector('[data-ranking-detail-company-badge]');
  if (companyBadgeEl) {
    var companyText = getCompanyBadgeText(row.company);
    companyBadgeEl.textContent = companyText || '—';
    companyBadgeEl.classList.remove('company-mmo', 'company-eic', 'company-vru', 'company-other');
    companyBadgeEl.classList.add(getCompanyBadgeClass(row.company));
  }

  modal.querySelector('[data-ranking-detail-pseudo]').textContent = pseudo;
  modal.querySelector('[data-ranking-detail-server]').textContent = serverDisplay;
  modal.querySelector('[data-ranking-detail-xp]').textContent = xp;
  modal.querySelector('[data-ranking-detail-honor]').textContent = honor;
  modal.querySelector('[data-ranking-detail-rank-points]').textContent = rankPoints;
  const levelEl = modal.querySelector('[data-ranking-detail-level]');
  if (levelEl) levelEl.textContent = level;
  const estimatedRpEl = modal.querySelector('[data-ranking-detail-estimated-rp]');
  if (estimatedRpEl) estimatedRpEl.textContent = row.estimated_rp != null ? formatRankingNumber(row.estimated_rp) : '—';
  modal.querySelector('[data-ranking-detail-pos-xp]').textContent = posXp != null ? String(posXp) : '—';
  modal.querySelector('[data-ranking-detail-pos-honor]').textContent = posHonor != null ? String(posHonor) : '—';
  modal.querySelector('[data-ranking-detail-pos-general]').textContent = posGeneral != null ? String(posGeneral) : '—';
  modal.querySelector('[data-ranking-detail-grade-text]').textContent = gradeName;

  const gradeImgEl = modal.querySelector('[data-ranking-detail-grade-img]');
  if (gradeImgEl) {
    gradeImgEl.src = rankImg || '';
    gradeImgEl.alt = gradeName;
    gradeImgEl.title = gradeName;
    gradeImgEl.style.display = rankImg ? '' : 'none';
  }

  // Le badge firme est mis à jour ici au moment du rendu, puis re-sync en async dans l'enrichissement all-time.

  modal.querySelector('[data-ranking-detail-date]').textContent = dateStr;

  // Comparaison avec les stats utilisateur (même serveur) : + vert (tu es devant), - rouge (tu es derrière), affichée tout le temps dans le popup
  var comparisonWrap = document.getElementById('ranking-detail-comparison');
  var comparisonBody = document.getElementById('ranking-detail-comparison-body');
  if (comparisonWrap && comparisonBody) {
    var userStatsForModal = _getUserStatsForComparison();
    var playerHonor = row.honor != null ? Number(row.honor) : (row.honor_value != null ? Number(row.honor_value) : null);
    var playerXp = row.xp != null ? Number(row.xp) : (row.experience != null ? Number(row.experience) : null);
    var playerRp = row.estimated_rp != null ? Number(row.estimated_rp) : (row.rank_points != null ? Number(row.rank_points) : (row.top_user != null ? Number(row.top_user) : null));
    var comparisonHtml = _buildComparisonDeltasHtml(userStatsForModal, playerHonor, playerXp, playerRp);
    if (comparisonHtml) {
      comparisonBody.innerHTML = comparisonHtml;
      comparisonBody.removeAttribute('hidden');
      comparisonWrap.style.display = '';
    } else {
      comparisonBody.innerHTML = '';
      comparisonWrap.style.display = 'none';
    }
  }

  // Positions All Time : toujours basées sur les classements globaux, indépendamment du filtre période.
  // On utilise un cache par serveur + type pour limiter les appels réseau et on ne remplit
  // que les positions manquantes (on ne remplace jamais une valeur déjà connue).
  if (serverCode && typeof loadRanking === 'function') {
    var rowUserId = row.userId || row.user_id || null;

    function getAllTimeRankingCached(type) {
      var cache = _allTimeRankingCache[type] || (_allTimeRankingCache[type] = {});
      if (cache[serverCode] && Array.isArray(cache[serverCode])) {
        return Promise.resolve(cache[serverCode]);
      }
      return loadRanking({ server: serverCode, type: type, limit: 100, period: null }).then(function (data) {
        var list = Array.isArray(data) ? data : [];
        cache[serverCode] = list;
        return list;
      }).catch(function () {
        return [];
      });
    }

    if (posHonor == null) {
      getAllTimeRankingCached('honor').then(function (honorData) {
        if (posHonor == null) {
          var p = findPlayerPositionInRanking(honorData, pseudo, serverCode, rowUserId);
          if (p != null) posHonor = p;
          updatePositions();
        }
      });
    }
    if (posXp == null) {
      getAllTimeRankingCached('xp').then(function (xpData) {
        if (posXp == null) {
          var p = findPlayerPositionInRanking(xpData, pseudo, serverCode, rowUserId);
          if (p != null) posXp = p;
          updatePositions();
        }
      });
    }
    if (posGeneral == null) {
      getAllTimeRankingCached('rank_points').then(function (generalData) {
        if (posGeneral == null) {
          var p = findPlayerPositionInRanking(generalData, pseudo, serverCode, rowUserId);
          if (p != null) posGeneral = p;
          updatePositions();
        }
      });
    }
  }

  const dostatsWrap = document.getElementById('ranking-detail-dostats');
  const dostatsBody = document.getElementById('ranking-detail-dostats-body');
  function renderDostatsSection(srcRow) {
    if (!dostatsWrap || !dostatsBody) return;
    if (typeof window !== 'undefined') window._rankingDetailDostatsGgRow = null;
    if (srcRow.dostats_updated_at && (srcRow.total_hours != null || srcRow.registered || srcRow.npc_kills != null || srcRow.ship_kills != null || srcRow.galaxy_gates != null || rowHasGalaxyGatesPopupData(srcRow))) {
      dostatsWrap.style.display = '';
      var blocks = [];
      if (srcRow.total_hours != null) blocks.push({ text: '⏱️ Temps de jeu : ' + formatRankingNumber(srcRow.total_hours) + 'h' });
      if (srcRow.registered) blocks.push({ text: '📅 Inscrit le : ' + String(srcRow.registered) });
      if (srcRow.npc_kills != null) blocks.push({ text: '🎯 NPCs détruits : ' + formatRankingNumber(srcRow.npc_kills) });
      if (srcRow.ship_kills != null) blocks.push({ text: '⚔️ Vaisseaux détruits : ' + formatRankingNumber(srcRow.ship_kills) });
      if (rowHasGalaxyGatesPopupData(srcRow)) {
        if (typeof window !== 'undefined') window._rankingDetailDostatsGgRow = srcRow;
        var gv = srcRow.galaxy_gates != null ? formatRankingNumber(srcRow.galaxy_gates) : '—';
        blocks.push({
          html: '🌀 Galaxy Gates : <span class="ranking-gg-cell ranking-dostats-gg-cell">' + escapeHtml(gv) + ' <button type="button" class="ranking-gg-eye ranking-dostats-gg-eye" title="Voir le détail" aria-label="Voir le détail">👁</button></span>'
        });
      } else if (srcRow.galaxy_gates != null) {
        var ggt = parseLooseRankingNumber(srcRow.galaxy_gates);
        if (Number.isFinite(ggt) && ggt >= 1) blocks.push({ text: '🌀 Galaxy Gates : Total : ' + formatRankingNumber(ggt) });
      }
      dostatsBody.innerHTML = blocks.length
        ? blocks.map(function (b) {
          return '<div class="ranking-modal-dostats-line">' + (b.html != null ? b.html : escapeHtml(b.text)) + '</div>';
        }).join('')
        : '';
    } else {
      dostatsWrap.style.display = '';
      dostatsBody.innerHTML = '<div class="ranking-modal-dostats-line ranking-modal-dostats-pending">Stats joueur : en attente</div>';
    }
  }
  if (dostatsWrap && dostatsBody) {
    if (dostatsWrap.dataset.ggDostatsBound !== '1') {
      dostatsWrap.dataset.ggDostatsBound = '1';
      dostatsWrap.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('.ranking-dostats-gg-eye')) return;
        e.preventDefault();
        e.stopPropagation();
        var ref = typeof window !== 'undefined' ? window._rankingDetailDostatsGgRow : null;
        if (ref) showGalaxyGatesPopup(ref);
      });
    }
    renderDostatsSection(row);
  }

  const followBtn = document.getElementById('ranking-detail-follow');
  if (followBtn) {
    const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
    const isPro = badge === 'PRO' || badge === 'ADMIN' || badge === 'SUPERADMIN';
    const alreadyFollowed = isPlayerFollowed(row);

    // Empêche de se suivre soi-même : bouton désactivé si ligne = joueur actif
    var isSelf = false;
    try {
      var active = typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerInfoSync
        ? UserPreferencesAPI.getActivePlayerInfoSync()
        : null;
      if (active) {
        var activePseudo = (active.player_pseudo || active.player_id || '').toString().trim().toLowerCase();
        var activeServer = (active.player_server || '').toString().trim().toLowerCase();
        var rowPseudo = (row.game_pseudo || row.name || '').toString().trim().toLowerCase();
        var rowServer = ((row._server || row.server) || '').toString().trim().toLowerCase();
        if (activePseudo && activeServer && rowPseudo === activePseudo && rowServer === activeServer) {
          isSelf = true;
        }
      }
    } catch (_) {}

    followBtn.disabled = !isPro || alreadyFollowed || isSelf;
    if (isSelf) {
      followBtn.title = typeof window.i18nT === 'function'
        ? (window.i18nT('cannot_follow_self') || 'Vous ne pouvez pas vous suivre vous-même')
        : 'Vous ne pouvez pas vous suivre vous-même';
      followBtn.textContent = typeof window.i18nT === 'function'
        ? (window.i18nT('follow_player') || 'Suivre ce joueur')
        : 'Suivre ce joueur';
    } else {
      followBtn.title = alreadyFollowed ? '' : (isPro ? '' : (typeof window.i18nT === 'function' ? window.i18nT('pro_feature') : 'Fonctionnalité PRO'));
      followBtn.textContent = alreadyFollowed
        ? (typeof window.i18nT === 'function' ? (window.i18nT('followed_ok') || 'Suivi') : 'Suivi')
        : (typeof window.i18nT === 'function' ? window.i18nT('follow_player') : 'Suivre ce joueur');
    }
    if (!followBtn._followClickBound) {
      followBtn._followClickBound = true;
      followBtn.addEventListener('click', function () {
        if (!_currentRankingDetailRow || followBtn.disabled) return;
        addFollowedPlayer(_currentRankingDetailRow);
        renderFollowedPlayersSidebar();
        followBtn.disabled = true;
        followBtn.textContent = typeof window.i18nT === 'function' ? (window.i18nT('followed_ok') || 'Suivi') : 'Suivi';
        if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('followed_toast') : 'Joueur ajouté au suivi.', 'success');
      });
    }
  }

  // Enrichissement All Time indépendant du filtre période : profiles_players + classements globaux
  (async function enrichFromProfilesAndAllTime() {
    try {
      var supabase = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
      if (!supabase || !serverCode) return;

      var rowUserId = row.userId || row.user_id || null;
      var pp = null;
      if (rowUserId) {
        var { data: ppData } = await supabase
          .from('profiles_players')
          .select('user_id, server, pseudo, company, grade, level, honor, experience, top_user, estimated_rp, total_hours, registered, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, stats, scraped_at')
          .eq('server', serverCode)
          .eq('user_id', rowUserId)
          .maybeSingle();
        pp = ppData || null;
      }
      if (!pp) {
        var { data: ppData2 } = await supabase
          .from('profiles_players')
          .select('user_id, server, pseudo, company, grade, level, honor, experience, top_user, estimated_rp, total_hours, registered, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, stats, scraped_at')
          .eq('server', serverCode)
          .eq('pseudo', pseudo)
          .maybeSingle();
        pp = ppData2 || null;
      }
      if (!pp) return;

      // Points All Time
      var honorAll = pp.honor != null ? formatRankingNumber(pp.honor) : honor;
      var xpAll = pp.experience != null ? formatRankingNumber(pp.experience) : xp;
      var rpAll = pp.top_user != null ? formatRankingNumber(pp.top_user) : rankPoints;
      modal.querySelector('[data-ranking-detail-honor]').textContent = honorAll;
      modal.querySelector('[data-ranking-detail-xp]').textContent = xpAll;
      modal.querySelector('[data-ranking-detail-rank-points]').textContent = rpAll;

      // Grade / level / firme
      var rawRank2 = pp.grade || rawRank;
      var gradeName2 = getGradeTooltip(rawRank2, rawRank2 || gradeName || '—');
      modal.querySelector('[data-ranking-detail-grade-text]').textContent = gradeName2;
      var rankImg2 = getRankImg(rawRank2, serverCode);
      if (gradeImgEl) {
        gradeImgEl.src = rankImg2 || '';
        gradeImgEl.alt = gradeName2;
        gradeImgEl.title = gradeName2;
        gradeImgEl.style.display = rankImg2 ? '' : 'none';
      }
      var levelVal = pp.level != null ? String(pp.level) : level;
      if (levelEl) levelEl.textContent = levelVal;
      if (companyBadgeEl) {
        var companyText2 = getCompanyBadgeText(pp.company || row.company);
        companyBadgeEl.textContent = companyText2 || '—';
        companyBadgeEl.classList.remove('company-mmo', 'company-eic', 'company-vru', 'company-other');
        companyBadgeEl.classList.add(getCompanyBadgeClass(pp.company || row.company));
      }

      // Estimated RP
      if (estimatedRpEl) {
        estimatedRpEl.textContent = pp.estimated_rp != null
          ? formatRankingNumber(pp.estimated_rp)
          : (row.estimated_rp != null ? formatRankingNumber(row.estimated_rp) : '—');
      }

      // Détails DOStats
      var mergedRow = Object.assign({}, row, {
        total_hours: pp.total_hours != null ? pp.total_hours : row.total_hours,
        registered: pp.registered != null ? pp.registered : row.registered,
        npc_kills: pp.npc_kills != null ? pp.npc_kills : row.npc_kills,
        ship_kills: pp.ship_kills != null ? pp.ship_kills : row.ship_kills,
        galaxy_gates: pp.galaxy_gates != null ? pp.galaxy_gates : row.galaxy_gates,
        galaxy_gates_json: pp.galaxy_gates_json || row.galaxy_gates_json,
        stats: pp.stats != null ? pp.stats : row.stats,
        dostats_updated_at: pp.scraped_at || pp.dostats_updated_at || row.dostats_updated_at
      });
      renderDostatsSection(mergedRow);

      // Propagation des stats absolues (profiles_players) dans row pour que "Suivre ce joueur"
      // enregistre toujours les totaux, peu importe le filtre de période actif.
      if (pp.honor != null) row.honor = Number(pp.honor);
      if (pp.experience != null) row.xp = Number(pp.experience);
      if (pp.top_user != null) row.rank_points = Number(pp.top_user);
      if (pp.estimated_rp != null) row.estimated_rp = Number(pp.estimated_rp);
      if (pp.level != null) row.level = Number(pp.level);
      if (pp.company != null) row.company = String(pp.company);

      // Propagation du grade mis à jour dans les données en mémoire pour harmoniser tableau et popup.
      var normalizedRank2 = (rawRank2 && String(rawRank2).trim()) || null;
      row.current_rank = rawRank2 || row.current_rank || null;
      row.grade = rawRank2 || row.grade || null;
      row.grade_normalized = normalizedRank2 || row.grade_normalized || null;
      _currentRankingDetailRow = row;
      try {
        if (Array.isArray(_lastRankingData) && _lastRankingData.length && typeof _renderRankingFn === 'function') {
          var uidKey = (row.userId != null ? String(row.userId) : (row.user_id != null ? String(row.user_id) : '')).trim();
          var srvKey = serverCode;
          if (uidKey && srvKey) {
            _lastRankingData = _lastRankingData.map(function (r) {
              var rUid = (r.userId != null ? String(r.userId) : (r.user_id != null ? String(r.user_id) : '')).trim();
              var rSrv = ((r._server || r.server) || '').toString().toLowerCase().trim();
              if (rUid === uidKey && rSrv === srvKey) {
                return Object.assign({}, r, {
                  current_rank: row.current_rank,
                  grade: row.grade,
                  grade_normalized: row.grade_normalized
                });
              }
              return r;
            });
            _renderRankingFn(_lastRankingData, (_lastRankingFilters && _lastRankingFilters.type) || 'honor');
          }
        }
      } catch (_) {}
    } catch (e) {
      // silencieux en cas d'erreur
    }
  })();

  const chartWrap = document.getElementById('ranking-detail-chart-wrap');
  if (chartWrap) chartWrap.style.display = 'none';

  modal.classList.add('active');
  overlay.classList.add('active');
}

function showGalaxyGatesPopup(row) {
  if ((typeof getCurrentBadge === 'function' ? getCurrentBadge() : null) === 'FREE') {
    const pseudo = row && (row.game_pseudo != null ? String(row.game_pseudo) : (row.name != null ? String(row.name) : ''));
    _toastFreeRankingDetailsLocked(pseudo);
    return;
  }
  const modal = document.getElementById('ranking-gg-modal');
  const overlay = document.getElementById('ranking-gg-overlay');
  if (!modal || !overlay) return;

  _ggModalState.row = row;
  _ggModalState.tree = buildGgTreeFromRow(row);
  _ggModalState.drillKey = null;
  _ggModalState.drillI18nKey = null;

  const pseudo = row.game_pseudo != null ? String(row.game_pseudo)
    : row.name != null ? String(row.name)
      : row.pseudo != null ? String(row.pseudo)
        : '—';
  const pseudoEl = modal.querySelector('[data-gg-modal-pseudo]');
  if (pseudoEl) pseudoEl.textContent = pseudo;
  const sub = modal.querySelector('[data-gg-modal-sub]');
  if (sub) sub.textContent = '';
  const back = modal.querySelector('[data-gg-back]');
  if (back) back.hidden = true;

  if (typeof window.applyTranslations === 'function') window.applyTranslations();

  ggModalRenderPeriodTilesView();

  modal.classList.add('active');
  overlay.classList.add('active');
}

function closeGalaxyGatesModal() {
  const modal = document.getElementById('ranking-gg-modal');
  const overlay = document.getElementById('ranking-gg-overlay');
  if (modal) modal.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
  _ggModalState.row = null;
  _ggModalState.tree = null;
  _ggModalState.drillKey = null;
  _ggModalState.drillI18nKey = null;
  if (modal) {
    const sub = modal.querySelector('[data-gg-modal-sub]');
    if (sub) sub.textContent = '';
    const bk = modal.querySelector('[data-gg-back]');
    if (bk) bk.hidden = true;
  }
}

if (typeof window !== 'undefined') window.closeGalaxyGatesModal = closeGalaxyGatesModal;

function closeRankingDetailModal() {
  const modal = document.getElementById('ranking-detail-modal');
  const overlay = document.getElementById('ranking-detail-overlay');
  if (modal) modal.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

(function() {
  // Référence du handler Escape pour pouvoir le retirer avant ré-enregistrement
  // si setupModal() était appelé plusieurs fois.
  var _rankingEscHandler = null;

  // Délégation document pour le filtre firme : garantit que les clics sont gérés même si
  // initRankingTab() a fait un return prématuré (ex. #ranking-table absent au premier run).
  document.addEventListener('click', function (e) {
    var container = document.getElementById('ranking-filter-company');
    if (!container || !container.contains(e.target)) return;
    var btn = e.target.closest && e.target.closest('[data-company]');
    if (!btn) return;
    var value = (btn.getAttribute('data-company') || '').trim().toLowerCase();
    if (!value) return;
    _rankingCompanyFilter = (_rankingCompanyFilter === value) ? null : value;
    container.querySelectorAll('[data-company]').forEach(function (el) {
      var v = (el.getAttribute('data-company') || '').trim().toLowerCase();
      el.classList.toggle('active', !!_rankingCompanyFilter && v === _rankingCompanyFilter);
    });
    if (typeof _renderRankingFn === 'function' && Array.isArray(_lastRankingData) && _lastRankingData.length) {
      _renderRankingFn(_lastRankingData, (_lastRankingFilters && _lastRankingFilters.type) || 'honor');
    }
  });

  function setupRanking() {
    if (document.getElementById('ranking-table')) initRankingTab();
    tryRegisterRankingCdpRefreshHook();
  }
  function setupModal() {
    const overlay = document.getElementById('ranking-detail-overlay');
    const modal = document.getElementById('ranking-detail-modal');
    const ggOverlay = document.getElementById('ranking-gg-overlay');
    const ggModal = document.getElementById('ranking-gg-modal');
    if (overlay) overlay.addEventListener('click', closeRankingDetailModal);
    if (ggOverlay) ggOverlay.addEventListener('click', closeGalaxyGatesModal);
    if (ggModal && ggModal.dataset.ggNavBound !== '1') {
      ggModal.dataset.ggNavBound = '1';
      ggModal.addEventListener('click', function (e) {
        var tile = e.target.closest && e.target.closest('.gg-period-tile');
        if (tile && tile.getAttribute('data-gg-period-key')) {
          e.preventDefault();
          ggModalDrillToPeriod(tile.getAttribute('data-gg-period-key'), tile.getAttribute('data-gg-period-i18n') || '');
          return;
        }
        if (e.target.closest && e.target.closest('[data-gg-back]')) {
          e.preventDefault();
          ggModalShowPeriodView();
        }
      });
    }
    if (_rankingEscHandler) {
      document.removeEventListener('keydown', _rankingEscHandler);
    }
    _rankingEscHandler = function (e) {
      if (e.key === 'Escape') {
        if (ggModal && ggModal.classList.contains('active')) closeGalaxyGatesModal();
        else if (modal && modal.classList.contains('active')) closeRankingDetailModal();
      }
    };
    document.addEventListener('keydown', _rankingEscHandler);
  }
  function onReady() {
    setupRanking();
    setupModal();
    if (typeof renderFollowedPlayersSidebar === 'function') renderFollowedPlayersSidebar();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
  window.addEventListener('permissionsApplied', function () { setupRanking(); if (typeof renderFollowedPlayersSidebar === 'function') renderFollowedPlayersSidebar(); });
  window.addEventListener('languageChanged', function () {
    var ggM = document.getElementById('ranking-gg-modal');
    if (ggM && ggM.classList.contains('active')) {
      if (_ggModalState.drillKey) {
        ggModalDrillToPeriod(_ggModalState.drillKey, _ggModalState.drillI18nKey || '');
      } else {
        ggModalRenderPeriodTilesView();
      }
    }
    var tbody = document.querySelector('#ranking-table tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr.ranking-row').forEach(function (tr) {
      var payload = tr.getAttribute('data-ranking-payload');
      if (!payload) return;
      try {
        var row = JSON.parse(payload);
        var rawRank = (row.current_rank ? String(row.current_rank) : null) || (row.grade_normalized ? String(row.grade_normalized) : null) || (row.grade ? String(row.grade) : null);
        var img = tr.querySelector('.ranking-grade img.ranking-grade-img');
        if (img) img.title = getGradeTooltip(rawRank, img.alt || '—');
      } catch (_) {}
    });
  });
})();

