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

// Init classement : une seule fois (évite listeners / onSaveSuccess dupliqués et reset du throttle)
var _rankingTabInitialized = false;
var _lastRefreshRankingAt = 0;
var REFRESH_RANKING_THROTTLE_MS = 30000;
var _rankingCdpSaveHookRegistered = false;

/** Un seul hook CDP : appelé depuis setupRanking/onReady pour ne pas rater electronClientLauncher si retardé au preload */
function tryRegisterRankingCdpRefreshHook() {
  if (_rankingCdpSaveHookRegistered) return;
  if (typeof window.electronClientLauncher?.onSaveSuccess !== 'function') return;
  _rankingCdpSaveHookRegistered = true;
  var _cdpRefreshTimer = null;
  window.electronClientLauncher.onSaveSuccess(function () {
    clearTimeout(_cdpRefreshTimer);
    _cdpRefreshTimer = setTimeout(function () {
      if (typeof window.refreshRanking === 'function') window.refreshRanking();
    }, 3000);
  });
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

// Même liste que formulaire d'inscription (config.js SERVERS_LIST), avec "Tous les serveurs" en premier
const RANKING_SERVERS = typeof SERVERS_LIST !== 'undefined' && Array.isArray(SERVERS_LIST) ? ['Tous les serveurs', ...SERVERS_LIST] : ['Tous les serveurs'];

const INVALID_GRADE_PATTERN = /^(splitter_|spacer_|line_|decoration|unknown)/i;

function formatRankingNumber(n) {
  if (n == null || n === undefined) return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function normalizeRankName(s) {
  if (!s || typeof s !== 'string') return '';
  return s.replace(/\u2019/g, "'").replace(/\u2018/g, "'").trim();
}

function normalizeRankKey(s) {
  if (!s || typeof s !== 'string') return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
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
    var nLower = normalized.toLowerCase();
    for (var i = 0; i < namesForLang.length && i < RANKS_DATA.length; i++) {
      var refName = namesForLang[i];
      if (!refName) continue;
      if (normalized === refName || normalizeRankName(refName) === normalized) return RANKS_DATA[i].img;
      if (nLower && normalizeRankName(refName).toLowerCase() === nLower) return RANKS_DATA[i].img;
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
  }
  return '';
}

function initRankingTab() {
  const filterServer = document.getElementById('ranking-filter-server');
  const filterType = document.getElementById('ranking-filter-type');
  const tableWrap = document.getElementById('ranking-table-wrap');
  const table = document.getElementById('ranking-table');

  if (!table) return;

  if (_rankingTabInitialized) return;
  _rankingTabInitialized = true;

  if (typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerInfo) {
    UserPreferencesAPI.getActivePlayerInfo().catch(function () {});
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
    filterServer.innerHTML = opts.map(function(o) { return '<option value="' + escapeHtml(String(o.value)) + '">' + escapeHtml(o.label) + '</option>'; }).join('');
    if (opts.some(function(o) { return String(o.value) === prevVal; })) filterServer.value = prevVal;
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

  if (filterServer) {
    updateFilterServerOptions().then(function () {
      return getFavoriteServer();
    }).then(function (savedFav) {
      if (savedFav) {
        var hasFavOpt = Array.from(filterServer.options).some(function(o) { return o.value === savedFav; });
        if (hasFavOpt) filterServer.value = savedFav;
      }
      if (!savedFav && typeof UserPreferencesAPI !== 'undefined') {
        UserPreferencesAPI.getUserServer().then(function(profileServer) {
          if (profileServer) {
            var hasOpt = Array.from(filterServer.options).some(function(o) { return o.value === profileServer; });
            if (hasOpt) filterServer.value = profileServer;
          }
        }).catch(function () {});
      }
    }).catch(function () {});

    filterServer.addEventListener('change', function () {
      saveFavoriteServer(filterServer.value);
      load();
    });
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
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;opacity:0.6;">' +
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
          const [mainData, deltaData] = await Promise.all([
            loadRanking(filters),
            // '24h_today' = mode comparaison interne (snapshots) pour calculer la progression 24h
            loadRanking(Object.assign({}, filters, { period: '24h_today' }))
          ]);
          Logger.debug('[RankingUI] loadImpl today mode with delta', {
            filters,
            mainCount: Array.isArray(mainData) ? mainData.length : null,
            deltaCount: Array.isArray(deltaData) ? deltaData.length : null
          });
          if (Array.isArray(mainData) && Array.isArray(deltaData) && deltaData.length > 0) {
            const deltaMap = {};
            deltaData.forEach(function (d) {
              const key = ((d.game_pseudo || '') + '|' + ((d._server || d.server || '')).toString())
                .toLowerCase()
                .trim();
              deltaMap[key] = d;
            });
            mainData.forEach(function (row) {
              const key = ((row.game_pseudo || '') + '|' + ((row._server || row.server || '')).toString())
                .toLowerCase()
                .trim();
              const delta = deltaMap[key];
              if (delta) {
                row._honor_delta = delta._honor_delta;
                row._xp_delta = delta._xp_delta;
                row._rp_delta = delta._rp_delta;
                row._pos_delta = delta._pos_delta;
                row._has_reference = delta._has_reference;
              }
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

  load();
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
  function _statDeltaBadge(delta) {
    if (delta == null) return '';
    var cls  = _deltaClass(delta);
    var icon = _deltaIcon(delta);
    return `<small class="ranking-stat-delta ${cls}" title="Variation">${icon} ${_fmtDelta(delta)}</small>`;
  }

  // Mode "Aujourd'hui" avec deltas 24h disponibles pour le type courant:
  // on affiche la progression 24h comme valeur principale, mais on ne change pas l'ordre du classement.
  var isTodayDeltaMode =
    !_lastRankingFilters?.period &&
    Array.isArray(rows) &&
    rows.some(function (r) {
      if (!r) return false;
      if (typeCol === 'honor') return r._honor_delta != null;
      if (typeCol === 'xp') return r._xp_delta != null;
      if (typeCol === 'rank_points') return r._rp_delta != null;
      return false;
    });

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
    // Mode progression : delta principal
    function buildDeltaMain(deltaValue) {
      if (deltaValue == null) return '—';
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
    } else if (isTodayDeltaMode) {
      // "Aujourd'hui" : afficher la progression 24h comme valeur principale pour le type courant
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
    var pseudoSuffix = '';
    if (isAllServers) {
      pseudoSuffix = '<span class="ranking-server-badge">' + escapeHtml(serverLabel) + '</span>';
      serverCellHtml = '<td class="ranking-col-server">' + escapeHtml(serverLabel) + '</td>';
    }

    tr.innerHTML = `
      <td class="ranking-pos ${posClass}">${pos}${posDeltaBadge}</td>
      <td class="ranking-pseudo">${escapeHtml(pseudo)}${dostatsBadge}${pseudoSuffix}</td>
      ${serverCellHtml}
      <td class="ranking-firme">${companyCellHtml}</td>
      <td class="ranking-grade" data-fallback="${escapeHtml(rankAlt || '—')}">${gradeCellContent}</td>
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
  list.push(entry);
  setFollowedPlayers(list);
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
 * Cherche un joueur suivi dans les données de classement disponibles.
 * Ordre de priorité :
 *   1. Classements scrapés (getImportedRanking — via Supabase sync)
 *   2. Classement affiché en mémoire (_lastRankingData, même serveur)
 *   3. Stats sauvegardées au moment du clic "Suivre" (followed.honor/xp/rank_points)
 * Retourne { honor, xp, rank_points } ou null si rien n'est disponible.
 */
function _getFollowedPlayerCurrentStats(followed) {
  var srv = (followed.server || followed._server || '').toString().toLowerCase().trim();
  var pseudo = (followed.game_pseudo || '').toString().trim().toLowerCase();
  if (!srv || !pseudo) return null;

  function findInList(list) {
    if (!Array.isArray(list)) return null;
    return list.find(function (r) {
      return (r.game_pseudo || r.name || '').toString().trim().toLowerCase() === pseudo;
    }) || null;
  }

  // 1. Classements scrapés en localStorage (getImportedRanking)
  if (typeof getImportedRanking === 'function') {
    var rowH = findInList(getImportedRanking(srv, 'honor'));
    var rowX = findInList(getImportedRanking(srv, 'xp'));
    var rowR = findInList(getImportedRanking(srv, 'rank_points'));
    var found = rowH || rowX || rowR;
    if (found) {
      var estRp = (rowH && rowH.estimated_rp != null) ? Number(rowH.estimated_rp)
                : (rowX && rowX.estimated_rp != null) ? Number(rowX.estimated_rp)
                : (rowR && rowR.estimated_rp != null) ? Number(rowR.estimated_rp)
                : (found.estimated_rp != null ? Number(found.estimated_rp) : null);
      if (estRp == null) {
        var baseHonor = rowH ? rowH.honor : (rowX ? rowX.honor : (rowR ? rowR.honor : found.honor));
        var baseXp    = rowX ? rowX.xp    : (rowH ? rowH.xp    : (rowR ? rowR.xp    : found.xp));
        var baseRp    = rowR ? rowR.rank_points : found.rank_points;
        estRp = _computeEstimatedRpFromStats(baseHonor, baseXp, baseRp);
      }
      var gradeImg = '';
      var companyBadgeHtml = '';
      try {
        var rawRank = (found.current_rank ? String(found.current_rank) : null) ||
          (found.grade_normalized ? String(found.grade_normalized) : null) ||
          (found.grade ? String(found.grade) : null);
        var serverForImg = (found._server || found.server || '').toString().toLowerCase().trim();
        gradeImg = getRankImg(rawRank, serverForImg);
        companyBadgeHtml = getCompanyBadgeHtml(found.company);
      } catch (_) {}
      var gradeNameFromRow = (found.grade && String(found.grade).trim()) || (found.current_rank && String(found.current_rank).trim()) || (found.grade_normalized && String(found.grade_normalized).trim()) || '';
      var res1 = {
        honor:        rowH ? Number(rowH.honor || 0)       : (found.honor       != null ? Number(found.honor)       : null),
        xp:           rowX ? Number(rowX.xp || 0)          : (found.xp          != null ? Number(found.xp)          : null),
        rank_points:  rowR ? Number(rowR.rank_points || 0) : (found.rank_points != null ? Number(found.rank_points) : null),
        estimated_rp: estRp,
        gradeImg:     gradeImg || '',
        companyBadgeHtml: companyBadgeHtml || '',
        level:        found.level != null ? Number(found.level) : null,
        gradeName:    gradeNameFromRow
      };
      if (typeof window !== 'undefined' && window.DEBUG) {
        Logger.warn('[debug] estimated_rp (imported):', res1.estimated_rp, 'pour:', pseudo, 'srv:', srv, found);
      }
      return res1;
    }
  }

  // 2. Classement affiché en mémoire (_lastRankingData)
  if (Array.isArray(_lastRankingData) && _lastRankingData.length > 0) {
    var inMemory = findInList(_lastRankingData.filter(function (r) {
      return (r._server || r.server || '').toString().toLowerCase().trim() === srv;
    }));
    if (inMemory) {
      var rawRank = (inMemory.current_rank ? String(inMemory.current_rank) : null) ||
        (inMemory.grade_normalized ? String(inMemory.grade_normalized) : null) ||
        (inMemory.grade ? String(inMemory.grade) : null);
      var gradeNameFromMem = (rawRank && rawRank.trim()) || '';
      var stats = {
        honor:        inMemory.honor        != null ? Number(inMemory.honor)        : null,
        xp:           inMemory.xp           != null ? Number(inMemory.xp)           : null,
        rank_points:  inMemory.rank_points  != null ? Number(inMemory.rank_points)  : null,
        estimated_rp: inMemory.estimated_rp != null ? Number(inMemory.estimated_rp) : null,
        level:        inMemory.level        != null ? Number(inMemory.level)        : null,
        gradeImg:     (function () {
          try {
            var serverForImg = (inMemory._server || inMemory.server || '').toString().toLowerCase().trim();
            return getRankImg(rawRank, serverForImg) || '';
          } catch (_) { return ''; }
        })(),
        companyBadgeHtml:   '',
        gradeName:    gradeNameFromMem
      };
      if (stats.estimated_rp == null) {
        stats.estimated_rp = _computeEstimatedRpFromStats(stats.honor, stats.xp, stats.rank_points);
      }
      try {
        stats.companyBadgeHtml = getCompanyBadgeHtml(inMemory.company);
      } catch (_) {}
      if (typeof window !== 'undefined' && window.DEBUG) {
        Logger.warn('[debug] estimated_rp (inMemory):', stats.estimated_rp, 'pour:', pseudo, 'srv:', srv, inMemory);
      }
      return stats;
    }
  }

  // 3. Stats sauvegardées au moment du follow
  if (followed.honor != null || followed.xp != null || followed.rank_points != null) {
    var gradeNameFromFollowed = (followed.grade && String(followed.grade).trim()) || (followed.current_rank && String(followed.current_rank).trim()) || '';
    var fallbackStats = {
      honor:        followed.honor        != null ? Number(followed.honor)        : null,
      xp:           followed.xp           != null ? Number(followed.xp)           : null,
      rank_points:  followed.rank_points  != null ? Number(followed.rank_points)  : null,
      estimated_rp: followed.estimated_rp != null ? Number(followed.estimated_rp) : null,
      level:        followed.level        != null ? Number(followed.level)        : null,
      gradeImg:     '',
      companyBadgeHtml:   '',
      gradeName:    gradeNameFromFollowed
    };
    if (fallbackStats.estimated_rp == null) {
      fallbackStats.estimated_rp = _computeEstimatedRpFromStats(fallbackStats.honor, fallbackStats.xp, fallbackStats.rank_points);
    }
    try {
      fallbackStats.companyBadgeHtml = getCompanyBadgeHtml(followed.company);
    } catch (_) {}
    if (typeof window !== 'undefined' && window.DEBUG) {
      Logger.warn('[debug] estimated_rp (fallback):', fallbackStats.estimated_rp, 'pour:', pseudo, 'srv:', srv, followed);
    }
    return fallbackStats;
  }

  return null;
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
  if (userVal == null || playerVal == null || !Number.isFinite(Number(userVal)) || !Number.isFinite(Number(playerVal))) return null;
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
  var honorPart = _formatComparisonDiff(userStats.honor, playerHonor);
  var xpPart = _formatComparisonDiff(userStats.xp, playerXp);
  var rpPart = _formatComparisonDiff(userStats.rankPoints, playerRp);
  if (!honorPart && !xpPart && !rpPart) return '';
  function span(part) {
    if (!part) return '<span class="comparison-diff-item comparison-diff-missing">—</span>';
    return '<span class="comparison-diff-item ' + part.cls + '">' + part.sign + part.formatted + '</span>';
  }
  return '<div class="watched-player-stat-group">' + span(honorPart) + '</div>' +
    '<div class="watched-player-stat-group">' + span(xpPart) + '</div>' +
    '<div class="watched-player-stat-group">' + span(rpPart) + '</div>';
}

/**
 * Retourne le delta 24h du joueur suivi (gains honneur, XP, points de grade sur 24h).
 * @param {string} server - Code serveur
 * @param {string} pseudo - Pseudo du joueur
 * @param {string} userId - userId si connu
 * @returns {{ honorDelta: number|null, xpDelta: number|null, rpDelta: number|null }|null}
 */
function _getFollowedPlayer24hDelta(server, pseudo, userId) {
  var srv = (server || '').toString().toLowerCase().trim();
  var cache = _last24hByServer[srv];
  if (!cache || !cache.honor || !cache.xp || !cache.rank_points) return null;
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
  var rowH = findInRows(cache.honor);
  var rowX = findInRows(cache.xp);
  if (!rowH && !rowX) return null;
  var honorDelta = rowH && rowH.honor != null ? Number(rowH.honor) : null;
  var xpDelta = rowX && rowX.xp != null ? Number(rowX.xp) : null;
  var rpDelta = null;
  if (honorDelta != null || xpDelta != null) {
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
  var srv = (server || '').toString().toLowerCase().trim();
  if (!srv || typeof loadRanking !== 'function') {
    if (typeof onDone === 'function') onDone(false);
    return;
  }
  if (_last24hByServer[srv] && _last24hByServer[srv].honor && _last24hByServer[srv].xp && _last24hByServer[srv].rank_points) {
    if (typeof onDone === 'function') onDone(false);
    return;
  }
  var hadBefore = !!_last24hByServer[srv];
  Promise.all([
    loadRanking({ server: srv, type: 'honor', period: '24h', limit: 500 }),
    loadRanking({ server: srv, type: 'xp', period: '24h', limit: 500 }),
    loadRanking({ server: srv, type: 'rank_points', period: '24h', limit: 500 })
  ]).then(function (results) {
    var honor = Array.isArray(results[0]) ? results[0] : [];
    var xp = Array.isArray(results[1]) ? results[1] : [];
    var rank_points = Array.isArray(results[2]) ? results[2] : [];
    _last24hByServer[srv] = { honor: honor, xp: xp, rank_points: rank_points };
    if (typeof onDone === 'function') onDone(!hadBefore);
  }).catch(function () {
    if (typeof onDone === 'function') onDone(false);
  });
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
  return cell(deltas && deltas.honorDelta) + cell(deltas && deltas.xpDelta) + cell(deltas && deltas.rpDelta);
}

function _formatFollowedDelta(followed, userStats) {
  if (!followed || !userStats) return '';
  var playerStats = _getFollowedPlayerCurrentStats(followed);
  if (!playerStats) return '';
  return _buildComparisonDeltasHtml(
    userStats,
    playerStats.honor != null ? Number(playerStats.honor) : null,
    playerStats.xp != null ? Number(playerStats.xp) : null,
    playerStats.estimated_rp != null ? Number(playerStats.estimated_rp) : null
  );
}

function renderFollowedPlayersSidebar() {
  var container = document.getElementById('sidebarFollowedPlayers');
  if (!container) return;
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
    var row24hHtml = _build24hDeltasRowHtml(deltas24h);

    var gradeImg = playerStats && playerStats.gradeImg ? String(playerStats.gradeImg) : '';
    var companyBadgeHtml = playerStats && playerStats.companyBadgeHtml ? String(playerStats.companyBadgeHtml) : '';
    var companyName = (p.company || '').toString().trim().toUpperCase() || '—';
    var gradeNameRaw = (playerStats && playerStats.gradeName) || p.grade || p.current_rank || '';
    gradeNameRaw = gradeNameRaw.toString().trim();
    var gradeName = gradeNameRaw ? gradeNameRaw.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : '—';
    var gradeImgHtml = gradeImg
      ? '<img class="watched-player-grade-icon" src="' + escapeHtml(gradeImg) + '" alt="" />'
      : '';

    var line2Firme = companyBadgeHtml
      ? '<span class="watched-player-tooltip-wrap" data-tooltip="' + escapeHtml(companyName) + '">' + companyBadgeHtml + '</span>'
      : '<span class="watched-player-tooltip-wrap" data-tooltip="' + escapeHtml(companyName) + '">—</span>';
    var line2Grade = gradeImgHtml
      ? '<span class="watched-player-tooltip-wrap" data-tooltip="' + escapeHtml(gradeName) + '">' + gradeImgHtml + '</span>'
      : '<span class="watched-player-tooltip-wrap" data-tooltip="' + escapeHtml(gradeName) + '">—</span>';

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
        (comparisonDeltasHtml
          ? '<div class="watched-player-stats-grid watched-player-stats-grid-with-labels">' +
              '<div class="watched-player-stat-group">' + honorLine + '</div>' +
              '<div class="watched-player-stat-group">' + xpLine + '</div>' +
              '<div class="watched-player-stat-group">' + gradeLine + '</div>' +
              '<div class="watched-player-row-label watched-player-row-label-empty"></div>' +
              comparisonDeltasHtml +
              '<span class="watched-player-row-info-icon" data-tooltip="Différence de points entre vous et ' + escapeHtml(pseudo) + '" aria-label="Info">ℹ</span>' +
              row24hHtml +
              '<span class="watched-player-row-info-icon" data-tooltip="Points que ' + escapeHtml(pseudo) + ' a faits les dernières 24 heures" aria-label="Info">ℹ</span>' +
            '</div>'
          : '<div class="watched-player-stats">' +
              '<div class="watched-player-stat-group">' + honorLine + '</div>' +
              '<div class="watched-player-stat-group">' + xpLine + '</div>' +
              '<div class="watched-player-stat-group">' + gradeLine + '</div>' +
            '</div>') +
      '</div>'
    );
  }).join('');

  container.innerHTML = html;

  // Charger les classements 24h pour les serveurs des joueurs suivis (cache) ; re-render quand des données arrivent
  var servers = [];
  list.forEach(function (p) {
    var s = (p.server || p._server || '').toString().toLowerCase().trim();
    if (s && servers.indexOf(s) === -1) servers.push(s);
  });
  servers.forEach(function (srv) {
    _ensure24hDataForServer(srv, function (shouldRerender) {
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
    if (!Array.isArray(_lastRankingData) || _lastRankingData.length === 0) return null;
    var uid = (userId || '').toString().trim();
    var srv = (server || '').toString().toLowerCase().trim();
    for (var i = 0; i < _lastRankingData.length; i++) {
      var r = _lastRankingData[i];
      var ru = (r.userId != null ? String(r.userId) : (r.user_id != null ? String(r.user_id) : '')).trim();
      var rs = ((r._server || r.server) || '').toString().toLowerCase().trim();
      if (uid && ru === uid && (!srv || rs === srv)) return r;
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

if (typeof window !== 'undefined') window.refreshFollowedPlayersSidebar = renderFollowedPlayersSidebar;

function showPlayerDetails(row) {
  _currentRankingDetailRow = row;
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
    if (srcRow.dostats_updated_at && (srcRow.total_hours != null || srcRow.registered || srcRow.npc_kills != null || srcRow.ship_kills != null || srcRow.galaxy_gates != null)) {
      dostatsWrap.style.display = '';
      var lines = [];
      if (srcRow.total_hours != null) lines.push('⏱️ Temps de jeu : ' + formatRankingNumber(srcRow.total_hours) + 'h');
      if (srcRow.registered) lines.push('📅 Inscrit le : ' + String(srcRow.registered));
      if (srcRow.npc_kills != null) lines.push('🎯 NPCs détruits : ' + formatRankingNumber(srcRow.npc_kills));
      if (srcRow.ship_kills != null) lines.push('⚔️ Vaisseaux détruits : ' + formatRankingNumber(srcRow.ship_kills));
      if (srcRow.galaxy_gates != null || (srcRow.galaxy_gates_json && Object.keys(srcRow.galaxy_gates_json).length)) {
        if (srcRow.galaxy_gates_json && Object.keys(srcRow.galaxy_gates_json).length) {
          const parts = Object.entries(srcRow.galaxy_gates_json).map(([k, v]) => k.charAt(0).toUpperCase() + k.slice(1) + ':' + formatRankingNumber(v));
          lines.push('🌀 Galaxy Gates : ' + parts.join(', '));
        } else lines.push('🌀 Galaxy Gates : ' + formatRankingNumber(srcRow.galaxy_gates));
      }
      dostatsBody.innerHTML = lines.length
        ? lines.map(function (l) { return '<div class="ranking-modal-dostats-line">' + escapeHtml(l) + '</div>'; }).join('')
        : '';
    } else {
      dostatsWrap.style.display = '';
      dostatsBody.innerHTML = '<div class="ranking-modal-dostats-line ranking-modal-dostats-pending">Stats joueur : en attente</div>';
    }
  }
  if (dostatsWrap && dostatsBody) {
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

  // Enrichissement All Time indépendant du filtre période : player_profiles + classements globaux
  (async function enrichFromProfilesAndAllTime() {
    try {
      var supabase = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
      if (!supabase || !serverCode) return;

      var rowUserId = row.userId || row.user_id || null;
      var pp = null;
      if (rowUserId) {
        var { data: ppData } = await supabase
          .from('player_profiles')
          .select('user_id, server, pseudo, company, grade, level, honor, experience, top_user, estimated_rp, total_hours, registered, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, dostats_updated_at')
          .eq('server', serverCode)
          .eq('user_id', rowUserId)
          .maybeSingle();
        pp = ppData || null;
      }
      if (!pp) {
        var { data: ppData2 } = await supabase
          .from('player_profiles')
          .select('user_id, server, pseudo, company, grade, level, honor, experience, top_user, estimated_rp, total_hours, registered, npc_kills, ship_kills, galaxy_gates, galaxy_gates_json, dostats_updated_at')
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
        dostats_updated_at: pp.dostats_updated_at || row.dostats_updated_at
      });
      renderDostatsSection(mergedRow);

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
  const modal = document.getElementById('ranking-gg-modal');
  const overlay = document.getElementById('ranking-gg-overlay');
  if (!modal || !overlay) return;

  const pseudo = row.game_pseudo != null ? String(row.game_pseudo) : '—';
  const pseudoEl = modal.querySelector('[data-gg-modal-pseudo]');
  if (pseudoEl) pseudoEl.textContent = pseudo;

  const grid = modal.querySelector('[data-gg-modal-tbody]');
  if (grid) {
    // lamba_gate.png = typo dans le nom de fichier (lambda → lamba)
    const GG_IMG_MAP = { lambda: 'lamba_gate' };
    const GG_ORDER = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'kappa', 'lambda', 'kronos', 'hades'];
    const entries = Object.entries(row.galaxy_gates_json || {}).sort((a, b) => {
      const ia = GG_ORDER.indexOf(a[0]);
      const ib = GG_ORDER.indexOf(b[0]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });

    grid.innerHTML = entries.map(([k, v]) => {
      const imgKey = GG_IMG_MAP[k] || (k + '_gate');
      const imgSrc = 'img/gates/' + imgKey + '.png';
      const active = v > 0;
      const label = k.charAt(0).toUpperCase() + k.slice(1);
      return (
        '<div class="gg-gate-card' + (active ? ' gg-gate-card--active' : '') + '">' +
          '<div class="gg-gate-img-wrap">' +
            '<img class="gg-gate-img" src="' + escapeHtml(imgSrc) + '" alt="' + escapeHtml(label) + '" ' +
              'onerror="this.parentElement.style.display=\'none\'">' +
          '</div>' +
          '<div class="gg-gate-info">' +
            '<span class="gg-gate-name">' + escapeHtml(label) + '</span>' +
            '<span class="gg-gate-count' + (active ? ' gg-gate-count--active' : '') + '">' + formatRankingNumber(v) + '</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  modal.classList.add('active');
  overlay.classList.add('active');
}

function closeGalaxyGatesModal() {
  const modal = document.getElementById('ranking-gg-modal');
  const overlay = document.getElementById('ranking-gg-overlay');
  if (modal) modal.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

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

