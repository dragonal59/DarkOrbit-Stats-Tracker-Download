// ==========================================
// CLASSEMENT — UI (filtres, tableau, popup)
// ==========================================

// Même liste que formulaire d'inscription (config.js SERVERS_LIST), avec "Tous les serveurs" en premier
const RANKING_SERVERS = typeof SERVERS_LIST !== 'undefined' && Array.isArray(SERVERS_LIST) ? ['Tous les serveurs', ...SERVERS_LIST] : ['Tous les serveurs'];

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

function getRankImg(rankName) {
  if (!rankName) return '';
  var s = String(rankName).trim();
  if (typeof GRADE_KEY_TO_IMG !== 'undefined') {
    var key = s.toLowerCase().replace(/-/g, '_').replace(/^(rank_|hof_|hof_rank_)/, '');
    if (GRADE_KEY_TO_IMG[key]) return GRADE_KEY_TO_IMG[key];
  }
  const normalized = normalizeRankName(rankName);
  if (typeof RANKS_DATA !== 'undefined') {
    const rank = RANKS_DATA.find(r => r.name === normalized || normalizeRankName(r.name) === normalized);
    if (rank?.img) return rank.img;
  }
  if (typeof RANK_NAME_TO_IMG !== 'undefined') {
    const key = normalizeRankKey(rankName);
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

  function updateFilterServerOptions() {
    if (!filterServer) return;
    const baseList = RANKING_SERVERS || ['Tous'];
    const imported = typeof getImportedServerList === 'function' ? getImportedServerList() : [];
    const seen = new Set();
    const opts = baseList.map(s => {
      const val = (s === 'Tous' || s === 'Tous les serveurs') ? '' : (typeof SERVER_DISPLAY_TO_CODE !== 'undefined' && SERVER_DISPLAY_TO_CODE[s]) || s;
      seen.add(val);
      return { value: val || '', label: s };
    });
    imported.forEach(code => {
      if (seen.has(code)) return;
      seen.add(code);
      const display = (typeof SERVER_CODE_TO_DISPLAY !== 'undefined' && SERVER_CODE_TO_DISPLAY[code]) || code;
      opts.push({ value: code, label: display });
    });
    const prevVal = filterServer.value;
    filterServer.innerHTML = opts.map(o => `<option value="${escapeHtml(String(o.value))}">${escapeHtml(o.label)}</option>`).join('');
    if (opts.some(o => String(o.value) === prevVal)) filterServer.value = prevVal;
  }

  if (filterServer) {
    updateFilterServerOptions();
    filterServer.addEventListener('change', load);
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase.from('profiles').select('server').eq('id', user.id).single().then(({ data: p }) => {
            var profileServer = (p?.server || '').toLowerCase();
            if (profileServer) {
              var hasOpt = Array.from(filterServer.options).some(function(o) { return o.value === profileServer; });
              if (hasOpt) filterServer.value = profileServer;
            }
          });
        }
      });
    }
  }

  // Type : honor (défaut), xp, rank_points — champs name="ranking-filter-type" value honor|xp|rank_points
  const typeInputs = filterType ? filterType.querySelectorAll('input[name="ranking-filter-type"]') : [];
  if (typeInputs.length) {
    const def = filterType.querySelector('input[value="honor"]');
    if (def) def.checked = true;
    typeInputs.forEach(function(inp) {
      inp.addEventListener('change', load);
    });
  }

  function getFilters() {
    let server = filterServer?.value?.trim() || null;
    if (server === 'Tous' || server === 'Tous les serveurs' || !server) server = null;
    let type = 'honor';
    typeInputs.forEach(inp => { if (inp.checked) type = inp.value || 'honor'; });
    return { server, type, limit: 100 };
  }

  function setLoading(loading) {
    if (tableWrap) tableWrap.classList.toggle('ranking-loading', !!loading);
    if (table) table.classList.toggle('ranking-loading', !!loading);
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
      el.textContent = 'Aucune donnée';
      el.style.display = '';
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
      el.textContent = 'Aucune donnée';
    }
    el.style.display = '';
  }

  async function load() {
    setLoading(true);
    const filters = getFilters();
    const data = typeof loadRanking === 'function' ? await loadRanking(filters) : [];
    setLoading(false);
    renderRanking(data, filters.type);
    updateLastUpdateDisplay(filters.server);
  }

  // Exposer pour switchTab, DataSync.pull et super-admin onRankingsUpdated
  window.refreshRanking = function() {
    if (typeof updateFilterServerOptions === 'function') updateFilterServerOptions();
    load();
  };

  // Clic sur une ligne → popup
  table.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-ranking-user-id]');
    if (!row) return;
    const userId = row.getAttribute('data-ranking-user-id');
    const payload = row.getAttribute('data-ranking-payload');
    let rowData = null;
    try {
      rowData = payload ? JSON.parse(payload) : null;
    } catch (_) {}
    if (rowData) showPlayerDetails(rowData);
  });

  load();
}

function renderRanking(data, sortType) {
  const table = document.getElementById('ranking-table');
  const thead = table?.querySelector('thead');
  const tbody = table?.querySelector('tbody');
  if (!tbody) return;

  const typeCol = sortType === 'xp' ? 'xp' : sortType === 'rank_points' ? 'rank_points' : 'honor';
  thead?.querySelectorAll('th').forEach(th => {
    th.classList.remove('ranking-col-sorted');
    if (th.dataset.col === typeCol) th.classList.add('ranking-col-sorted');
    th.classList.remove('ranking-col-hidden');
    if (th.dataset.col && ['honor', 'xp', 'rank_points'].indexOf(th.dataset.col) !== -1 && th.dataset.col !== typeCol) th.classList.add('ranking-col-hidden');
  });

  tbody.innerHTML = '';
  var invalidGrade = /^(splitter_|spacer_|line_|decoration|unknown)/i;
  data.forEach((row, index) => {
    const pos = index + 1;
    const pseudo = row.game_pseudo != null ? String(row.game_pseudo) : '—';
    var rawRank = (row.current_rank ? String(row.current_rank) : null) || (row.grade_normalized ? String(row.grade_normalized) : null);
    if (rawRank && invalidGrade.test(rawRank)) rawRank = null;
    const rankLabel = rawRank || (row.grade_level != null ? 'Niveau ' + row.grade_level : '');
    const rankImg = getRankImg(rawRank);
    if (index < 3 && rawRank) {
      console.log('[RANKING UI DEBUG] Ligne', index + 1, 'rawRank:', rawRank, 'rankImg:', rankImg || '(vide)');
    }
    const rankAlt = rankLabel || '—';
    const honor = formatRankingNumber(row.honor);
    const xp = formatRankingNumber(row.xp);
    const rankPoints = formatRankingNumber(row.rank_points);
    const payload = JSON.stringify(row);
    const posClass = pos === 1 ? 'ranking-pos-gold' : pos === 2 ? 'ranking-pos-silver' : pos === 3 ? 'ranking-pos-bronze' : '';
    const tr = document.createElement('tr');
    tr.setAttribute('data-ranking-user-id', row.id || '');
    tr.setAttribute('data-ranking-payload', payload);
    tr.classList.add('ranking-row');
    const sortedClass = (col) => (typeCol === col ? ' ranking-col-sorted' : '');
    const hiddenClass = (col) => (col !== typeCol && ['honor', 'xp', 'rank_points'].indexOf(col) !== -1 ? ' ranking-col-hidden' : '');
    const gradeCellContent = rankImg
      ? `<img src="${escapeHtml(rankImg)}" alt="${escapeHtml(rankAlt)}" class="ranking-grade-img" width="28" height="28" onerror="var p=this.parentNode;if(p)p.textContent=p.getAttribute('data-fallback')||'—';">`
      : (rankAlt ? escapeHtml(rankAlt) : '—');
    tr.innerHTML = `
      <td class="ranking-pos ${posClass}">${pos}</td>
      <td class="ranking-pseudo">${escapeHtml(pseudo)}</td>
      <td class="ranking-grade" data-fallback="${escapeHtml(rankAlt || '—')}">${gradeCellContent}</td>
      <td class="ranking-num ranking-col-honor${sortedClass('honor')}${hiddenClass('honor')}">${honor}</td>
      <td class="ranking-num ranking-col-xp${sortedClass('xp')}${hiddenClass('xp')}">${xp}</td>
      <td class="ranking-num ranking-col-rank_points${sortedClass('rank_points')}${hiddenClass('rank_points')}">${rankPoints}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showPlayerDetails(row) {
  const modal = document.getElementById('ranking-detail-modal');
  const overlay = document.getElementById('ranking-detail-overlay');
  if (!modal || !overlay) return;

  const pseudo = row.game_pseudo != null ? String(row.game_pseudo) : '—';
  const rankName = row.current_rank ? String(row.current_rank) : '—';
  const rankImg = getRankImg(row.current_rank);
  const honor = formatRankingNumber(row.honor);
  const xp = formatRankingNumber(row.xp);
  const rankPoints = formatRankingNumber(row.rank_points);
  const nextRankPoints = formatRankingNumber(row.next_rank_points);
  let dateStr = '—';
  if (row.session_timestamp) {
    try {
      const d = new Date(row.session_timestamp);
      dateStr = d.toLocaleString('fr-FR');
    } catch (_) {}
  } else if (row.session_date) {
    dateStr = String(row.session_date);
  }
  const note = row.note != null && String(row.note).trim() !== '' ? String(row.note).trim() : 'Aucune note';

  modal.querySelector('[data-ranking-detail-pseudo]').textContent = pseudo;
  modal.querySelector('[data-ranking-detail-grade-text]').textContent = rankName;
  const gradeImgEl = modal.querySelector('[data-ranking-detail-grade-img]');
  if (gradeImgEl) {
    gradeImgEl.src = rankImg || '';
    gradeImgEl.alt = rankName;
    gradeImgEl.style.display = rankImg ? '' : 'none';
  }
  modal.querySelector('[data-ranking-detail-honor]').textContent = honor;
  modal.querySelector('[data-ranking-detail-xp]').textContent = xp;
  modal.querySelector('[data-ranking-detail-rank-points]').textContent = rankPoints;
  modal.querySelector('[data-ranking-detail-next-rank]').textContent = nextRankPoints;
  modal.querySelector('[data-ranking-detail-date]').textContent = dateStr;
  modal.querySelector('[data-ranking-detail-note]').textContent = note;

  modal.classList.add('active');
  overlay.classList.add('active');
}

function closeRankingDetailModal() {
  const modal = document.getElementById('ranking-detail-modal');
  const overlay = document.getElementById('ranking-detail-overlay');
  if (modal) modal.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

(function() {
  function setupRanking() {
    if (document.getElementById('ranking-table')) initRankingTab();
  }
  function setupModal() {
    const closeBtn = document.getElementById('ranking-detail-close');
    const overlay = document.getElementById('ranking-detail-overlay');
    if (closeBtn) closeBtn.addEventListener('click', closeRankingDetailModal);
    if (overlay) overlay.addEventListener('click', closeRankingDetailModal);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setupRanking(); setupModal(); });
  } else {
    setupRanking();
    setupModal();
  }
  window.addEventListener('permissionsApplied', setupRanking);
})();

console.log('🏆 Module Ranking UI chargé');
