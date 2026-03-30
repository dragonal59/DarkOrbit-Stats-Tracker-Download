// ==========================================
// MODULE: STATS MANAGEMENT
// ==========================================

// ==========================================
// INPUT FORMATTING & VALIDATION
// ==========================================

/** Format nombre pour affichage (virgules, séparateur de milliers). Utiliser pour tous les champs XP, points, honneur. */
function numFormat(num) {
  const n = Number(num);
  if (!Number.isFinite(n) || n < 0) return '0';
  return Math.round(n).toLocaleString("en-US");
}

function formatNumber(value) {
  const num = String(value || '').replace(/\D/g, '');
  return num ? Number(num).toLocaleString("en-US") : '';
}

function parseFormattedNumber(value) {
  return parseInt(value.replace(/,/g, '') || '0', 10);
}

/**
 * Valider une valeur d'input
 * @returns {object} { valid: boolean, value: number, error: string|null }
 */
function validateInputValue(value, fieldName) {
  const num = parseFormattedNumber(value);
  
  // Vérifier si négatif
  if (num < 0) {
    return { valid: false, value: 0, error: `${fieldName} ne peut pas être négatif` };
  }
  
  // Vérifier les limites absurdes
  const limits = {
    honor: 999999999999, // 999 milliards max
    xp: 999999999999,
    rankPoints: 9999999999,
    nextRankPoints: 9999999999
  };
  
  const limit = limits[fieldName] || 999999999999;
  
  if (num > limit) {
    return { valid: false, value: limit, error: `${fieldName} dépasse la limite maximale` };
  }
  
  return { valid: true, value: num, error: null };
}

function formatAndSave(input) {
  const fieldName = input.id;
  const validation = validateInputValue(input.value, fieldName);
  
  if (!validation.valid) {
    showToast(`⚠️ ${validation.error}`, 'warning');
    input.value = formatNumber(String(validation.value));
  } else {
    input.value = formatNumber(input.value);
  }
  
  if (typeof getSetting === 'function' && getSetting('autoSaveEnabled')) {
    debouncedSaveStats();
  }
  debouncedUpdateDisplay();
}

// Create debounced versions
const debouncedSaveStats = debounce(saveCurrentStats, CONFIG.UI.DEBOUNCE_DELAY);
const debouncedUpdateDisplay = debounce(updateStatsDisplay, CONFIG.UI.DEBOUNCE_DELAY);

// ==========================================
// STATS MANAGEMENT
// ==========================================

function getCurrentStats() {
  const honorEl = document.getElementById("honor");
  if (!honorEl) {
    const stored = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
    if (stored && (stored.currentRank || stored.honor != null || stored.xp != null))
      return { ...stored, timestamp: Date.now() };
    const last = getLastSessionStats();
    if (last) return { ...last, timestamp: Date.now() };
    return { honor: 0, xp: 0, rankPoints: 0, nextRankPoints: 0, currentRank: 'Inconnu', note: '', timestamp: Date.now() };
  }
  const selected = document.getElementById("selected");
  const isGradePlaceholder = !selected || !!selected.querySelector('[data-i18n="select_grade"]');
  const currentRank = isGradePlaceholder ? "" : selected.innerText.trim();
  const rawHonor = parseFormattedNumber(honorEl.value || '');
  const rawXp = parseFormattedNumber((document.getElementById("xp") || {}).value || '');
  const rawRankPoints = parseFormattedNumber((document.getElementById("rankPoints") || {}).value || '');
  const rawNextRankPoints = parseFormattedNumber((document.getElementById("nextRankPoints") || {}).value || '');
  return {
    honor: Math.max(0, rawHonor),
    xp: Math.max(0, rawXp),
    rankPoints: Math.max(0, rawRankPoints),
    nextRankPoints: Math.max(0, rawNextRankPoints),
    currentRank: sanitizeHTML(currentRank),
    note: '',
    timestamp: Date.now()
  };
}

function isStatsFormEmpty() {
  const numericFields = ["honor", "xp", "rankPoints", "nextRankPoints"];
  const hasNumericValue = numericFields.some(id => {
    const el = document.getElementById(id);
    return el && el.value.trim() !== "";
  });
  
  const selected = document.getElementById("selected");
  const hasRank = selected && !selected.querySelector('[data-i18n="select_grade"]') && selected.innerText.trim();
  return !hasNumericValue && !hasRank;
}

function mergeBelowRankFromStorage(stats) {
  if (!stats) return stats;
  var bp = stats.belowRankPoints != null ? Number(stats.belowRankPoints) : NaN;
  if (Number.isFinite(bp) && bp > 0 && stats.belowRankRaw) return stats;
  var st = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
  if (!st) return stats;
  var sbp = st.belowRankPoints != null ? Number(st.belowRankPoints) : NaN;
  if (!Number.isFinite(sbp) || sbp <= 0 || !st.belowRankRaw) return stats;
  return { ...stats, belowRankPoints: sbp, belowRankRaw: st.belowRankRaw };
}

/**
 * Fallback : si belowRankRaw / belowRankPoints ne sont plus présents
 * (ex: logout => nettoyage CURRENT_STATS), on les dérive depuis currentRank
 * en utilisant la table RANKS_DATA (ordre des grades).
 */
function deriveBelowRankFromCurrentRank(stats) {
  if (!stats || !stats.currentRank) return stats;

  var bp = stats.belowRankPoints != null ? Number(stats.belowRankPoints) : NaN;
  if (Number.isFinite(bp) && bp > 0 && stats.belowRankRaw) return stats;

  var cr = stats.currentRank;
  if (typeof cr === 'string' && cr.startsWith('rank_') && typeof RANK_KEY_TO_RANK_NAME !== 'undefined') {
    cr = RANK_KEY_TO_RANK_NAME[cr] || cr;
  }

  var currentRankData = (typeof RANKS_DATA !== 'undefined' && Array.isArray(RANKS_DATA))
    ? RANKS_DATA.find(r => r && (r.name === cr || r.rank === cr))
    : null;

  if (!currentRankData) return stats;

  var idx = RANKS_DATA.indexOf(currentRankData);
  if (idx <= 0) {
    // Rang le plus bas => pas de grade en dessous.
    return { ...stats, belowRankPoints: null, belowRankRaw: null };
  }

  var below = RANKS_DATA[idx - 1];
  if (!below) return stats;

  var next = (idx + 1 < RANKS_DATA.length) ? RANKS_DATA[idx + 1] : null;

  // Quand on dérive belowRank*, on veut que le plafond (nextRankPoints) soit cohérent
  // avec le même repère que belowRankPoints. Sinon le % et l'info "a environ X"
  // deviennent faux.
  var finalNextRankPoints = stats.nextRankPoints;
  if (next && Number.isFinite(Number(next.rankPoints))) finalNextRankPoints = Number(next.rankPoints);

  return {
    ...stats,
    belowRankPoints: Number.isFinite(Number(below.rankPoints)) ? Number(below.rankPoints) : null,
    belowRankRaw: below.rank || null,
    nextRankPoints: finalNextRankPoints
  };
}

function getDisplayStats() {
  if (!isStatsFormEmpty()) {
    return getCurrentStats();
  }
  
  const lastSession = getLastSessionStats();
  if (lastSession && lastSession.currentRank) {
    return lastSession;
  }
  
  const storedStats = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
  if (storedStats && storedStats.currentRank) {
    return storedStats;
  }
  
  return storedStats || getCurrentStats();
}

function getLastSessionStats() {
  var sessions = typeof getSessions === 'function' ? getSessions() : [];
  if (!sessions || !sessions.length) return null;
  
  return sessions.reduce((latest, session) => {
    return session.timestamp > latest.timestamp ? session : latest;
  }, sessions[0]);
}

function getHeaderStatsSource() {
  const lastSession = getLastSessionStats();
  if (lastSession && lastSession.currentRank) {
    return mergeBelowRankFromStorage(normalizeStatsForDisplay(lastSession));
  }
  const storedStats = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
  if (storedStats && storedStats.currentRank) {
    return mergeBelowRankFromStorage(normalizeStatsForDisplay(storedStats));
  }
  return null;
}

function normalizeStatsForDisplay(s) {
  if (!s) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const rankPoints = num(s.rankPoints ?? s.rank_points);
  const rawNrp = s.nextRankPoints ?? s.next_rank_points;
  const nextRankPoints = (rawNrp != null && Number.isFinite(Number(rawNrp))) ? Number(rawNrp) : rankPoints;
  const belowPts = s.belowRankPoints ?? s.below_rank_points;
  const belowN = belowPts != null && belowPts !== '' ? Number(belowPts) : NaN;
  return {
    ...s,
    honor: num(s.honor),
    xp: num(s.xp),
    rankPoints: rankPoints,
    nextRankPoints: nextRankPoints,
    currentRank: ((s.currentRank ?? s.current_rank ?? '').toString().trim()) || s.currentRank || s.current_rank,
    belowRankPoints: Number.isFinite(belowN) && belowN > 0 ? belowN : null,
    belowRankRaw: (s.belowRankRaw ?? s.below_rank_raw ?? '').toString().trim() || null
  };
}

function saveCurrentStats() {
  const stats = getCurrentStats();
  
  if (isStatsFormEmpty()) {
    const existingStats = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
    if (existingStats) {
      const mergedStats = {
        ...existingStats,
        note: stats.note,
        timestamp: stats.timestamp
      };
      
      SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, mergedStats);
      return;
    }
  }
  
  const prevSave = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS) || {};
  const payloadSave = {
    ...stats,
    belowRankPoints: prevSave.belowRankPoints != null ? prevSave.belowRankPoints : null,
    belowRankRaw: prevSave.belowRankRaw != null ? prevSave.belowRankRaw : null
  };
  const result = SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, payloadSave);

  if (!result.success) {
    Logger.error('Failed to save current stats');
  }
}

function loadCurrentStats() {
  const stats = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
  const selected = document.getElementById("selected");
  
  if (stats && (stats.honor != null || stats.xp != null || stats.currentRank)) {
    const honorEl = document.getElementById("honor");
    const xpEl = document.getElementById("xp");
    const rpEl = document.getElementById("rankPoints");
    const nrpEl = document.getElementById("nextRankPoints");
    const noteEl = document.getElementById("sessionNote");
    if (honorEl) honorEl.value = stats.honor != null ? numFormat(stats.honor) : '';
    if (xpEl) xpEl.value = stats.xp != null ? numFormat(stats.xp) : '';
    if (rpEl) rpEl.value = stats.rankPoints != null ? numFormat(stats.rankPoints) : '';
    if (nrpEl) nrpEl.value = stats.nextRankPoints != null ? numFormat(stats.nextRankPoints) : '';
    if (noteEl) noteEl.value = stats.note || '';
    
    if (stats.currentRank && selected) {
      const cr = typeof stats.currentRank === 'string' && stats.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[stats.currentRank] || stats.currentRank) : stats.currentRank;
      const rankData = RANKS_DATA.find(r => r.name === cr || r.rank === cr);
      if (rankData) {
        selected.innerHTML = `<div class="selected-rank">
          <div class="grade-block">
            <div class="grade-block-name">${sanitizeHTML(stats.currentRank)}</div>
            <div class="grade-block-icon">
              <img src="${rankData.img}" alt="${sanitizeHTML(stats.currentRank)}" class="grade-block-img">
            </div>
          </div>
        </div>`;
      } else {
        selected.innerHTML = `<span>${sanitizeHTML(stats.currentRank)}</span>`;
      }
    }
  } else if (typeof getSessions === 'function') {
    const sessions = getSessions();
    if (sessions && sessions.length > 0) {
      const lastSession = sessions.reduce((latest, s) => (s.timestamp > latest.timestamp ? s : latest), sessions[0]);
      const honorEl = document.getElementById("honor");
      const xpEl = document.getElementById("xp");
      const rankPointsEl = document.getElementById("rankPoints");
      const nextRankPointsEl = document.getElementById("nextRankPoints");
      if (honorEl) honorEl.value = lastSession.honor != null && lastSession.honor !== '' ? numFormat(lastSession.honor) : '';
      if (xpEl) xpEl.value = lastSession.xp != null && lastSession.xp !== '' ? numFormat(lastSession.xp) : '';
      if (rankPointsEl) rankPointsEl.value = lastSession.rankPoints != null && lastSession.rankPoints !== '' ? numFormat(lastSession.rankPoints) : '';
      if (nextRankPointsEl) nextRankPointsEl.value = lastSession.nextRankPoints != null && lastSession.nextRankPoints !== '' ? numFormat(lastSession.nextRankPoints) : '';
      if (lastSession.currentRank && selected) {
        const cr = typeof lastSession.currentRank === 'string' && lastSession.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[lastSession.currentRank] || lastSession.currentRank) : lastSession.currentRank;
        const rankData = RANKS_DATA.find(r => r.name === cr || r.rank === cr);
        if (rankData) {
          selected.innerHTML = `<div class="selected-rank">
            <div class="grade-block">
              <div class="grade-block-name">${sanitizeHTML(lastSession.currentRank)}</div>
              <div class="grade-block-icon">
                <img src="${rankData.img}" alt="${sanitizeHTML(lastSession.currentRank)}" class="grade-block-img">
              </div>
            </div>
          </div>`;
        } else {
          selected.innerHTML = `<span>${sanitizeHTML(lastSession.currentRank)}</span>`;
        }
      }
      var prevBelow = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS) || {};
      SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, {
        honor: lastSession.honor,
        xp: lastSession.xp,
        rankPoints: lastSession.rankPoints,
        nextRankPoints: lastSession.nextRankPoints != null ? lastSession.nextRankPoints : lastSession.rankPoints,
        currentRank: lastSession.currentRank,
        note: lastSession.note || '',
        timestamp: lastSession.timestamp || Date.now(),
        belowRankPoints: prevBelow.belowRankPoints != null ? prevBelow.belowRankPoints : null,
        belowRankRaw: prevBelow.belowRankRaw != null ? prevBelow.belowRankRaw : null
      });
    }
  }

  // Toujours rafraîchir l'affichage (header, barres) même sans stats stockées (fallback last session)
  updateStatsDisplay();
}

// ==========================================
// DISPLAY UPDATE
// ==========================================

function updateBelowRankProgress(stats) {
  const wrap = document.getElementById('belowRankProgressWrap');
  const bar = document.getElementById('belowRankBar');
  const pctEl = document.getElementById('belowRankProgressPct');
  const det = document.getElementById('belowRankDetails');
  if (!wrap || !bar || !pctEl || !det) return;
  if (!stats) {
    wrap.style.display = 'none';
    return;
  }
  const belowFloor = Number(stats.belowRankPoints);
  const ceiling = Number(stats.nextRankPoints);
  const cur = Number(stats.rankPoints);
  if (!Number.isFinite(belowFloor) || belowFloor <= 0 || !Number.isFinite(ceiling) || ceiling <= belowFloor || !stats.belowRankRaw) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const span = ceiling - belowFloor;
  // Barre rouge : proximité du seuil du grade inférieur (B) vs vos points (cur) / plafond palier (C).
  // Plus cur est proche de B, plus la barre se remplit ; proche de C (prochain grade) → vide.
  const frac = span > 0 ? Math.min(1, Math.max(0, (ceiling - cur) / span)) : 0;
  const pct = frac * 100;
  bar.style.width = `${pct.toFixed(1)}%`;
  pctEl.textContent = `${pct.toFixed(1)}%`;

  let server = 'gbl5';
  try {
    if (typeof UserPreferencesAPI !== 'undefined' && UserPreferencesAPI.getActivePlayerInfoSync) {
      const inf = UserPreferencesAPI.getActivePlayerInfoSync();
      if (inf && inf.player_server) server = inf.player_server;
    }
  } catch (_e) {}

  const rawRank = stats.belowRankRaw;
  const imgUrl = (typeof window.getRankImg === 'function' && rawRank) ? window.getRankImg(rawRank, server) : '';
  const tip = (typeof window.getGradeTooltip === 'function' && rawRank)
    ? window.getGradeTooltip(rawRank, rawRank)
    : (rawRank || '');

  det.innerHTML = '';
  const intro = document.createElement('span');
  intro.className = 'stats-below-rank-intro';
  const tIntro = typeof window.i18nT === 'function' ? window.i18nT('stats_below_rank_intro') : 'Le grade juste au-dessous';
  intro.textContent = `${tIntro}\u00a0`;
  det.appendChild(intro);
  if (imgUrl) {
    const im = document.createElement('img');
    im.className = 'stats-below-rank-grade-img';
    im.src = imgUrl;
    im.width = 26;
    im.height = 26;
    im.alt = '';
    im.title = tip;
    det.appendChild(im);
    det.appendChild(document.createTextNode('\u00a0'));
  }
  const rest = document.createElement('span');
  const tpl = typeof window.i18nT === 'function' ? window.i18nT('stats_below_rank_rest') : 'a environ {{points}} points de grade.';
  rest.textContent = tpl.split('{{points}}').join(formatNumberDisplay(belowFloor));
  det.appendChild(rest);
}

/**
 * Cache local (par user_id) des valeurs "below rank" afin que la barre
 * "Progression du grade juste au dessous de vous" reste cohérente après logout/reconnexion.
 * La raison : AuthManager.logout() supprime CURRENT_STATS (et donc belowRankRaw/Points).
 */
function persistBelowRankCacheForUser(userId) {
  try {
    if (!userId) return;
    if (typeof localStorage === 'undefined') return;
    var cur = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
    if (!cur) return;
    var raw = cur.belowRankRaw;
    var pts = cur.belowRankPoints != null ? Number(cur.belowRankPoints) : NaN;
    if (!raw || !Number.isFinite(pts) || pts <= 0) return;
    var key = 'darkOrbitBelowRankCache:' + String(userId);
    localStorage.setItem(key, JSON.stringify({ belowRankRaw: raw, belowRankPoints: pts }));
  } catch (_) {}
}

function restoreBelowRankCacheForUser(userId) {
  try {
    if (!userId) return;
    if (typeof localStorage === 'undefined') return;
    var key = 'darkOrbitBelowRankCache:' + String(userId);
    var raw = localStorage.getItem(key);
    if (!raw) return;
    var payload = null;
    try { payload = JSON.parse(raw); } catch (_) { payload = null; }
    if (!payload || !payload.belowRankRaw) return;
    var pts = payload.belowRankPoints != null ? Number(payload.belowRankPoints) : NaN;
    if (!Number.isFinite(pts) || pts <= 0) return;
    var cur = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS) || {};
    cur.belowRankRaw = String(payload.belowRankRaw).trim();
    cur.belowRankPoints = pts;
    SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, cur);
    if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  } catch (_) {}
}

function updateStatsDisplay() {
  const headerStats = getHeaderStatsSource();
  var sessions = typeof getSessions === 'function' ? getSessions() : [];
  var hasSessions = sessions && sessions.length > 0;
  let stats = (headerStats && hasSessions) ? headerStats : getDisplayStats();
  if (stats) {
    stats = mergeBelowRankFromStorage(normalizeStatsForDisplay(stats));
    stats = deriveBelowRankFromCurrentRank(stats);
    stats = {
      ...stats,
      honor: Number(stats.honor) || 0,
      xp: Number(stats.xp) || 0,
      rankPoints: Number(stats.rankPoints) || 0,
      nextRankPoints: Number(stats.nextRankPoints) || 0
    };
  }
  const statsPanel = document.getElementById("statsPanel");

  updateHeaderProgressBar(headerStats);
  
  if (!stats || !stats.currentRank) {
    if (hasSessions) {
      if (statsPanel) statsPanel.style.display = 'block';
      const honorD = document.getElementById("honorDisplay");
      const xpD = document.getElementById("xpDisplay");
      const rpD = document.getElementById("rankPointsDisplay");
      const lvlD = document.getElementById("levelDisplay");
      if (honorD) honorD.textContent = "-";
      if (xpD) xpD.textContent = "-";
      if (rpD) rpD.textContent = "-";
      if (lvlD) lvlD.textContent = "-";
      var clEmpty = document.getElementById("currentLevel"); if (clEmpty) clEmpty.value = '';
      const rankImg = document.getElementById("currentRankImg");
      const rankName = document.getElementById("currentRankName");
      if (rankImg) {
        rankImg.style.display = 'none';
      }
      if (rankName) {
        rankName.textContent = "-";
      }
      const nextRankImg = document.getElementById("nextRankImg");
      const nextRankText = document.getElementById("nextRankText");
      if (nextRankImg) {
        nextRankImg.style.display = 'none';
      }
      if (nextRankText) {
        nextRankText.textContent = "-";
      }
      const setT = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      const setW = (id, v) => { const e = document.getElementById(id); if (e) e.style.width = v; };
      setT("rankProgress", "0%"); setW("rankBar", "0%"); setT("rankDetails", "-");
      setT("levelProgress", "0%"); setW("levelBar", "0%"); setT("levelDetails", "-");
      updateBelowRankProgress(null);
      var nk = document.getElementById('npcKillsDisplay');
      var sk = document.getElementById('shipKillsDisplay');
      var gg = document.getElementById('galaxyGatesDisplay');
      if (nk) nk.textContent = '—';
      if (sk) sk.textContent = '—';
      if (gg) gg.textContent = '—';
    } else {
      if (statsPanel) statsPanel.style.display = 'none';
      updateBelowRankProgress(null);
    }
    return;
  }
  
  if (statsPanel) statsPanel.style.display = 'block';
  
  // Update current stats display with image
  const cr = typeof stats.currentRank === 'string' && stats.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[stats.currentRank] || stats.currentRank) : stats.currentRank;
  const currentRankData = RANKS_DATA.find(r => r.name === cr || r.rank === cr);
  if (currentRankData) {
    const rankImg = document.getElementById("currentRankImg");
    const rankName = document.getElementById("currentRankName");
    if (rankImg) { rankImg.src = currentRankData.img; rankImg.style.display = 'block'; }
    if (rankName) rankName.textContent = currentRankData.name;
  } else {
    const rankImg = document.getElementById("currentRankImg");
    const rankName = document.getElementById("currentRankName");
    if (rankImg) {
      rankImg.style.display = 'none';
    }
    if (rankName) {
      rankName.textContent = stats.currentRank;
    }
  }
  
  // Calculate and display current level
  const currentLevel = getCurrentLevel(stats.xp);
  const nextLevelData = getNextLevel(stats.xp);
  
  const clEl = document.getElementById("currentLevel");
  const ldEl = document.getElementById("levelDisplay");
  if (clEl) clEl.value = `Niveau ${currentLevel}`;
  if (ldEl) ldEl.textContent = `Niveau ${currentLevel}`;
  
  const honorVal = Number(stats.honor);
  const xpVal = Number(stats.xp);
  const rankPointsVal = Number(stats.rankPoints);
  
  const hEl = document.getElementById("honorDisplay");
  const xEl = document.getElementById("xpDisplay");
  const rpEl = document.getElementById("rankPointsDisplay");
  if (hEl) hEl.textContent = formatNumberDisplay(honorVal);
  if (xEl) xEl.textContent = formatNumberDisplay(xpVal);
  if (rpEl) rpEl.textContent = formatNumberDisplay(rankPointsVal);

  if (typeof updateCurrentPlayerRankingCounters === 'function') {
    Promise.resolve(updateCurrentPlayerRankingCounters()).catch(function (e) {
      if (typeof window !== 'undefined' && window.DEBUG && typeof Logger !== 'undefined' && Logger.warn) {
        Logger.warn('[Stats] updateCurrentPlayerRankingCounters:', e && e.message ? e.message : e);
      }
    });
  }
  
  // Calculate progress to next rank
  const currentRankIndex = RANKS_DATA.indexOf(currentRankData);
  
  const nextRankImg = document.getElementById("nextRankImg");
  const nextRankText = document.getElementById("nextRankText");
  const rankProgressEl = document.getElementById("rankProgress");
  const rankBarEl = document.getElementById("rankBar");
  const rankDetailsEl = document.getElementById("rankDetails");

  if (currentRankIndex === -1) {
    if (nextRankImg) nextRankImg.style.display = 'none';
    if (nextRankText) nextRankText.textContent = "-";
    if (rankProgressEl) rankProgressEl.textContent = "0%";
    if (rankBarEl) rankBarEl.style.width = "0%";
    if (rankDetailsEl) rankDetailsEl.textContent = "-";
    updateBelowRankProgress(stats);
  } else if (currentRankIndex === RANKS_DATA.length - 1) {
    if (nextRankImg) nextRankImg.style.display = 'none';
    if (nextRankText) nextRankText.textContent = (typeof window.i18nT === 'function' ? window.i18nT('max_rank_reached') : null) || "Grade maximum atteint ! 🎉";
    if (rankProgressEl) rankProgressEl.textContent = "100%";
    if (rankBarEl) rankBarEl.style.width = "100%";
    if (rankDetailsEl) rankDetailsEl.textContent = "Vous êtes au grade maximum";
    updateBelowRankProgress(stats);
  } else {
    const nextRankData = RANKS_DATA[currentRankIndex + 1];
    if (nextRankImg) { nextRankImg.src = nextRankData.img; nextRankImg.style.display = 'block'; }
    if (nextRankText) nextRankText.textContent = nextRankData.name;

    const currentRankPts = Number.isFinite(rankPointsVal) ? rankPointsVal : 0;
    const targetPoints = Number(stats.nextRankPoints) || nextRankData.rankPoints;
    const rankPercent = targetPoints > 0
      ? Math.min(100, Math.max(0, (currentRankPts / targetPoints) * 100))
      : 100;
    const rankRemaining = Math.max(0, targetPoints - currentRankPts);

    if (rankProgressEl) rankProgressEl.textContent = `${rankPercent.toFixed(1)}%`;
    if (rankBarEl) rankBarEl.style.width = `${rankPercent}%`;
    if (rankDetailsEl) rankDetailsEl.textContent =
      rankRemaining > 0
        ? `Il vous reste ${formatNumberDisplay(rankRemaining)} points`
        : "✅ Objectif atteint !";
    updateBelowRankProgress(stats);
  }
  
  // Calculate level progress
  if (nextLevelData) {
    const currentLevelData = LEVELS_DATA.find(l => l.level === currentLevel);
    const xpInCurrentLevel = xpVal - currentLevelData.xp;
    const xpNeededForNextLevel = nextLevelData.xp - currentLevelData.xp;
    const levelPercent = xpNeededForNextLevel > 0
      ? Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForNextLevel) * 100))
      : 100;
    const xpRemaining = nextLevelData.xp - xpVal;
    
    const lvlProgEl = document.getElementById("levelProgress");
    const lvlBarEl = document.getElementById("levelBar");
    const lvlDetailsEl = document.getElementById("levelDetails");
    if (lvlProgEl) lvlProgEl.textContent = `${levelPercent.toFixed(1)}%`;
    if (lvlBarEl) lvlBarEl.style.width = `${levelPercent}%`;
    if (lvlDetailsEl) lvlDetailsEl.textContent =
      xpRemaining > 0
        ? `Il vous reste ${formatNumberDisplay(xpRemaining)} XP pour le niveau ${nextLevelData.level}`
        : "✅ Niveau suivant atteint !";
  } else {
    const lvlProgEl = document.getElementById("levelProgress");
    const lvlBarEl = document.getElementById("levelBar");
    const lvlDetailsEl = document.getElementById("levelDetails");
    if (lvlProgEl) lvlProgEl.textContent = "100%";
    if (lvlBarEl) lvlBarEl.style.width = "100%";
    if (lvlDetailsEl) lvlDetailsEl.textContent = "🎉 Niveau maximum atteint !";
  }
}

/**
 * Mettre à jour la barre de progression dans le header
 */
function updateHeaderProgressBar(data) {
  const progressBar = document.getElementById('headerProgressBar');
  if (!progressBar) return;
  
  if (!data || !data.currentRank) {
    progressBar.style.display = 'none';
    return;
  }
  const cr = typeof data.currentRank === 'string' && data.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[data.currentRank] || data.currentRank) : data.currentRank;
  progressBar.style.display = 'block';
  
  const currentRankData = RANKS_DATA.find(r => r.name === cr || r.rank === cr);
  const currentRankIndex = currentRankData ? RANKS_DATA.indexOf(currentRankData) : -1;
  const nextRankData = currentRankIndex >= 0 && currentRankIndex < RANKS_DATA.length - 1
    ? RANKS_DATA[currentRankIndex + 1]
    : null;
  
  // Images des grades
  const currentImg = document.getElementById('headerCurrentRankImg');
  const currentName = document.getElementById('headerCurrentRankName');
  const nextImg = document.getElementById('headerNextRankImg');
  const nextName = document.getElementById('headerNextRankName');
  const progressFill = document.getElementById('headerProgressFill');
  const progressPercent = document.getElementById('headerProgressPercent');
  
  if (currentRankData) {
    if (currentImg) {
      currentImg.src = currentRankData.img;
      currentImg.alt = currentRankData.name;
      currentImg.style.display = 'block';
    }
    if (currentName) {
      currentName.textContent = currentRankData.name;
    }
  } else {
    if (currentImg) {
      currentImg.style.display = 'none';
    }
    if (currentName) {
      currentName.textContent = data.currentRank;
    }
  }

  if (nextRankData) {
    if (nextImg) {
      nextImg.src = nextRankData.img;
      nextImg.alt = nextRankData.name;
      nextImg.style.display = 'block';
    }
    if (nextName) {
      nextName.textContent = nextRankData.name;
    }
  } else {
    if (nextImg) {
      nextImg.style.display = 'none';
    }
    if (nextName) {
      nextName.textContent = currentRankData ? ((typeof window.i18nT === 'function' ? window.i18nT('max_rank') : null) || "Grade maximum") : "-";
    }
  }
  
  if (progressFill) {
    if (nextRankData) {
      const targetPoints = Number(data.nextRankPoints) || nextRankData.rankPoints;
      const rankProgress = Number(data.rankPoints) || 0;
      const rankPercent = targetPoints > 0
        ? Math.min(100, Math.max(0, (rankProgress / targetPoints) * 100))
        : (currentRankData ? 100 : 0);
      
      progressFill.style.width = `${rankPercent}%`;
      
      if (rankPercent >= 90) {
        progressFill.classList.add('almost-complete');
      } else {
        progressFill.classList.remove('almost-complete');
      }
    } else {
      progressFill.style.width = currentRankData ? '100%' : '0%';
      if (currentRankData) progressFill.classList.add('almost-complete');
    }
  }

  if (progressPercent) {
    if (nextRankData) {
      const targetPoints = Number(data.nextRankPoints) || nextRankData.rankPoints;
      const rankProgress = Number(data.rankPoints) || 0;
      const rankPercent = targetPoints > 0
        ? Math.min(100, Math.max(0, (rankProgress / targetPoints) * 100))
        : (currentRankData ? 100 : 0);
      progressPercent.textContent = `${rankPercent.toFixed(1)}%`;
    } else {
      progressPercent.textContent = currentRankData ? '100%' : '0%';
    }
  }
  
}

/**
 * Met à jour les compteurs aliens / vaisseaux / Galaxy Gates
 * pour le joueur actif.
 *
 * Ordre de priorité pour la source de données :
 *   1) Table player_profiles (profil DOStats du joueur actif : player_id + server)
 *   2) Snapshots importés localement (getImportedRanking)
 *   3) Dernier classement affiché en mémoire (_lastRankingData)
 *   4) Appel loadRanking(server actif, type 'honor')
 */
async function updateCurrentPlayerRankingCounters() {
  var npcEl = document.getElementById('npcKillsDisplay');
  var shipEl = document.getElementById('shipKillsDisplay');
  var ggEl = document.getElementById('galaxyGatesDisplay');
  if (!npcEl || !shipEl || !ggEl) return;

  var setAll = function (v) {
    npcEl.textContent = v;
    shipEl.textContent = v;
    ggEl.textContent = v;
  };

  // 1) Récupérer un joueur actif fiable (cache sync, puis async si nécessaire)
  var active = (typeof UserPreferencesAPI !== 'undefined' && typeof UserPreferencesAPI.getActivePlayerInfoSync === 'function')
    ? UserPreferencesAPI.getActivePlayerInfoSync()
    : null;
  if (!active && typeof UserPreferencesAPI !== 'undefined' && typeof UserPreferencesAPI.getActivePlayerInfo === 'function') {
    try {
      active = await UserPreferencesAPI.getActivePlayerInfo();
    } catch (e) {}
  }
  if (!active) {
    setAll('—');
    return;
  }

  var pseudo = (active.player_pseudo || '').toString().trim();
  var playerId = (active.player_id || '').toString().trim();
  var serverCode = (active.player_server || '').toString().trim().toLowerCase();
  if (!playerId || !serverCode) {
    setAll('—');
    return;
  }
  var pseudoNorm = pseudo.toLowerCase();

  function findPlayerInList(list) {
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row) continue;
      var pPseudo = (row.game_pseudo || row.name || '').toString().trim().toLowerCase();
      var pServer = ((row._server || row.server) || '').toString().trim().toLowerCase();
      if (pPseudo === pseudoNorm && pServer === serverCode) return row;
    }
    return null;
  }

  var row = null;

  // 2) Priorité 1 : profil DOStats du joueur actif dans player_profiles (user_id DO + server)
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  if (supabase) {
    try {
      var ppRes = await supabase
        .from('player_profiles')
        .select('npc_kills, ship_kills, galaxy_gates, server')
        .eq('user_id', playerId)
        .eq('server', serverCode)
        .single();
      var profileRow = ppRes && !ppRes.error ? ppRes.data : null;
      if (profileRow) {
        var npcP = profileRow.npc_kills != null ? Number(profileRow.npc_kills) : null;
        var shipsP = profileRow.ship_kills != null ? Number(profileRow.ship_kills) : null;
        var gatesP = profileRow.galaxy_gates != null ? Number(profileRow.galaxy_gates) : null;
        if (npcP != null || shipsP != null || gatesP != null) {
          npcEl.textContent = npcP != null ? formatNumberDisplay(npcP) : '—';
          shipEl.textContent = shipsP != null ? formatNumberDisplay(shipsP) : '—';
          ggEl.textContent = gatesP != null ? formatNumberDisplay(gatesP) : '—';
          return;
        }
      }
    } catch (e) {
      // en cas d'erreur, on tombera en fallback sur les classements
    }
  }

  // 3) Priorité 2 : données importées localement (snapshots complets)
  if (typeof getImportedRanking === 'function') {
    try {
      var imported = getImportedRanking(serverCode, 'honor');
      row = findPlayerInList(imported);
    } catch (e) {}
  }

  // 4) Priorité 3 : dernier classement affiché (_lastRankingData)
  if (!row && typeof _lastRankingData !== 'undefined' && Array.isArray(_lastRankingData) && _lastRankingData.length > 0) {
    row = findPlayerInList(_lastRankingData);
  }

  // 5) Priorité 4 : loadRanking côté backend (type honor, pour ne pas restreindre aux top NPC)
  if (!row && typeof loadRanking === 'function') {
    try {
      var rows = await loadRanking({ server: serverCode, type: 'honor', limit: 500 });
      row = findPlayerInList(rows);
    } catch (e) {}
  }

  if (!row) {
    setAll('—');
    return;
  }

  var npc = row.npc_kills != null ? Number(row.npc_kills) : null;
  var ships = row.ship_kills != null ? Number(row.ship_kills) : null;
  var gates = row.galaxy_gates != null ? Number(row.galaxy_gates) : null;

  npcEl.textContent = npc != null ? formatNumberDisplay(npc) : '—';
  shipEl.textContent = ships != null ? formatNumberDisplay(ships) : '—';
  ggEl.textContent = gates != null ? formatNumberDisplay(gates) : '—';
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getCurrentLevel(xp) {
  for (let i = LEVELS_DATA.length - 1; i >= 0; i--) {
    if (xp >= LEVELS_DATA[i].xp) {
      return LEVELS_DATA[i].level;
    }
  }
  return 1;
}

function getNextLevel(currentXp) {
  const currentLevel = getCurrentLevel(currentXp);
  const nextLevelData = LEVELS_DATA.find(l => l.level === currentLevel + 1);
  return nextLevelData || null;
}

function getNextRank(current) {
  const c = typeof current === 'string' && current.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[current] || current) : current;
  const currentIndex = RANKS_DATA.findIndex(r => r.name === c || r.rank === c);
  if (currentIndex === -1 || currentIndex === RANKS_DATA.length - 1) return '';
  return RANKS_DATA[currentIndex + 1].name;
}

if (typeof window !== 'undefined') window.numFormat = numFormat;

if (typeof window !== 'undefined') {
  window.persistBelowRankCacheForUser = persistBelowRankCacheForUser;
  window.restoreBelowRankCacheForUser = restoreBelowRankCacheForUser;
  window.addEventListener('languageChanged', function () {
    try {
      if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
    } catch (_e) {}
  });
}