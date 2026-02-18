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
  const selected = document.getElementById("selected");
  const currentRankText = selected.innerText.trim();
  const currentRank = currentRankText === "Sélectionner votre grade actuel" ? "" : currentRankText;
  
  const note = document.getElementById("sessionNote").value.trim();
  
  // Validate note length
  if (note.length > CONFIG.LIMITS.MAX_NOTE_LENGTH) {
    showToast(`⚠️ Note trop longue (max ${CONFIG.LIMITS.MAX_NOTE_LENGTH} caractères)`, "warning");
  }
  
  const rawHonor = parseFormattedNumber(document.getElementById("honor").value);
  const rawXp = parseFormattedNumber(document.getElementById("xp").value);
  const rawRankPoints = parseFormattedNumber(document.getElementById("rankPoints").value);
  const rawNextRankPoints = parseFormattedNumber(document.getElementById("nextRankPoints").value);
  return {
    honor: Math.max(0, rawHonor),
    xp: Math.max(0, rawXp),
    rankPoints: Math.max(0, rawRankPoints),
    nextRankPoints: Math.max(0, rawNextRankPoints),
    currentRank: sanitizeHTML(currentRank),
    note: sanitizeHTML(note.substring(0, CONFIG.LIMITS.MAX_NOTE_LENGTH)),
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
  const currentRankText = selected ? selected.innerText.trim() : "";
  const hasRank = currentRankText && currentRankText !== "Sélectionner votre grade actuel";
  return !hasNumericValue && !hasRank;
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
  const sessions = SafeStorage.get(CONFIG.STORAGE_KEYS.SESSIONS, []);
  if (!sessions.length) return null;
  
  return sessions.reduce((latest, session) => {
    return session.timestamp > latest.timestamp ? session : latest;
  }, sessions[0]);
}

function getHeaderStatsSource() {
  const lastSession = getLastSessionStats();
  if (lastSession && lastSession.currentRank) {
    return normalizeStatsForDisplay(lastSession);
  }
  const storedStats = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
  if (storedStats && storedStats.currentRank) {
    return normalizeStatsForDisplay(storedStats);
  }
  return null;
}

function normalizeStatsForDisplay(s) {
  if (!s) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const rankPoints = num(s.rankPoints ?? s.rank_points);
  const nextRankPoints = num(s.nextRankPoints ?? s.next_rank_points);
  return {
    ...s,
    honor: num(s.honor),
    xp: num(s.xp),
    rankPoints: rankPoints,
    nextRankPoints: nextRankPoints || rankPoints,
    currentRank: ((s.currentRank ?? s.current_rank ?? '').toString().trim()) || s.currentRank || s.current_rank
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
  
  const result = SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, stats);
  
  if (!result.success) {
    console.error('Failed to save current stats');
  }
}

function loadCurrentStats() {
  const stats = SafeStorage.get(CONFIG.STORAGE_KEYS.CURRENT_STATS);
  const selected = document.getElementById("selected");
  
  if (stats && (stats.honor != null || stats.xp != null || stats.currentRank)) {
    document.getElementById("honor").value = stats.honor != null ? numFormat(stats.honor) : '';
    document.getElementById("xp").value = stats.xp != null ? numFormat(stats.xp) : '';
    document.getElementById("rankPoints").value = stats.rankPoints != null ? numFormat(stats.rankPoints) : '';
    document.getElementById("nextRankPoints").value = stats.nextRankPoints != null ? numFormat(stats.nextRankPoints) : '';
    document.getElementById("sessionNote").value = stats.note || '';
    
    if (stats.currentRank && selected) {
      const rankData = RANKS_DATA.find(r => r.name === stats.currentRank);
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
      const sessionNoteEl = document.getElementById("sessionNote");
      if (honorEl) honorEl.value = lastSession.honor != null && lastSession.honor !== '' ? numFormat(lastSession.honor) : '';
      if (xpEl) xpEl.value = lastSession.xp != null && lastSession.xp !== '' ? numFormat(lastSession.xp) : '';
      if (rankPointsEl) rankPointsEl.value = lastSession.rankPoints != null && lastSession.rankPoints !== '' ? numFormat(lastSession.rankPoints) : '';
      if (nextRankPointsEl) nextRankPointsEl.value = lastSession.nextRankPoints != null && lastSession.nextRankPoints !== '' ? numFormat(lastSession.nextRankPoints) : '';
      if (sessionNoteEl) sessionNoteEl.value = lastSession.note || '';
      if (lastSession.currentRank && selected) {
        const rankData = RANKS_DATA.find(r => r.name === lastSession.currentRank);
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
      SafeStorage.set(CONFIG.STORAGE_KEYS.CURRENT_STATS, {
        honor: lastSession.honor,
        xp: lastSession.xp,
        rankPoints: lastSession.rankPoints,
        nextRankPoints: lastSession.nextRankPoints != null ? lastSession.nextRankPoints : lastSession.rankPoints,
        currentRank: lastSession.currentRank,
        note: lastSession.note || '',
        timestamp: lastSession.timestamp || Date.now()
      });
    }
  }

  // Toujours rafraîchir l'affichage (header, barres) même sans stats stockées (fallback last session)
  updateStatsDisplay();
}

// ==========================================
// DISPLAY UPDATE
// ==========================================

function updateStatsDisplay() {
  const headerStats = getHeaderStatsSource();
  const sessions = SafeStorage.get(CONFIG.STORAGE_KEYS.SESSIONS, []);
  const hasSessions = sessions && sessions.length > 0;
  let stats = (headerStats && hasSessions) ? headerStats : getDisplayStats();
  if (stats) {
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
      statsPanel.style.display = 'block';
      document.getElementById("honorDisplay").textContent = "-";
      document.getElementById("xpDisplay").textContent = "-";
      document.getElementById("rankPointsDisplay").textContent = "-";
      document.getElementById("levelDisplay").textContent = "-";
      document.getElementById("currentLevel").value = '';
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
      document.getElementById("rankProgress").textContent = "0%";
      document.getElementById("rankBar").style.width = "0%";
      document.getElementById("rankDetails").textContent = "-";
      document.getElementById("levelProgress").textContent = "0%";
      document.getElementById("levelBar").style.width = "0%";
      document.getElementById("levelDetails").textContent = "-";
    } else {
      statsPanel.style.display = 'none';
    }
    return;
  }
  
  statsPanel.style.display = 'block';
  
  // Update current stats display with image
  const currentRankData = RANKS_DATA.find(r => r.name === stats.currentRank);
  if (currentRankData) {
    const rankImg = document.getElementById("currentRankImg");
    const rankName = document.getElementById("currentRankName");
    rankImg.src = currentRankData.img;
    rankImg.style.display = 'block';
    if (rankName) {
      rankName.textContent = currentRankData.name;
    }
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
  
  document.getElementById("currentLevel").value = `Niveau ${currentLevel}`;
  document.getElementById("levelDisplay").textContent = `Niveau ${currentLevel}`;
  
  const honorVal = Number(stats.honor);
  const xpVal = Number(stats.xp);
  const rankPointsVal = Number(stats.rankPoints);
  
  document.getElementById("honorDisplay").textContent = formatNumberDisplay(honorVal);
  document.getElementById("xpDisplay").textContent = formatNumberDisplay(xpVal);
  document.getElementById("rankPointsDisplay").textContent = formatNumberDisplay(rankPointsVal);
  
  // Calculate progress to next rank
  const currentRankIndex = RANKS_DATA.indexOf(currentRankData);
  
  if (currentRankIndex === -1) {
    const nextRankImg = document.getElementById("nextRankImg");
    const nextRankText = document.getElementById("nextRankText");
    nextRankImg.style.display = 'none';
    nextRankText.textContent = "-";
      document.getElementById("rankProgress").textContent = "0%";
    document.getElementById("rankBar").style.width = "0%";
    document.getElementById("rankDetails").textContent = "-";
  } else if (currentRankIndex === RANKS_DATA.length - 1) {
    const nextRankImg = document.getElementById("nextRankImg");
    const nextRankText = document.getElementById("nextRankText");
    nextRankImg.style.display = 'none';
    nextRankText.textContent = "Grade maximum atteint ! 🎉";
    document.getElementById("rankProgress").textContent = "100%";
    document.getElementById("rankBar").style.width = "100%";
    document.getElementById("rankDetails").textContent = "Vous êtes au grade maximum";
  } else {
    const nextRankData = RANKS_DATA[currentRankIndex + 1];
    
    // Display next rank with image
    const nextRankImg = document.getElementById("nextRankImg");
    const nextRankText = document.getElementById("nextRankText");
    nextRankImg.src = nextRankData.img;
    nextRankImg.style.display = 'block';
    nextRankText.textContent = nextRankData.name;
    
    const currentRankPts = Number.isFinite(rankPointsVal) ? rankPointsVal : 0;
    
    // Rank points progress
    const targetPoints = Number(stats.nextRankPoints) || nextRankData.rankPoints;
    const rankPercent = targetPoints > 0
      ? Math.min(100, Math.max(0, (currentRankPts / targetPoints) * 100))
      : 100;
    const rankRemaining = Math.max(0, targetPoints - currentRankPts);
    
    document.getElementById("rankProgress").textContent = `${rankPercent.toFixed(1)}%`;
    document.getElementById("rankBar").style.width = `${rankPercent}%`;
    document.getElementById("rankDetails").textContent = 
      rankRemaining > 0 
        ? `Il vous reste ${formatNumberDisplay(rankRemaining)} points` 
        : "✅ Objectif atteint !";
    
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
    
    document.getElementById("levelProgress").textContent = `${levelPercent.toFixed(1)}%`;
    document.getElementById("levelBar").style.width = `${levelPercent}%`;
    document.getElementById("levelDetails").textContent = 
      xpRemaining > 0 
        ? `Il vous reste ${formatNumberDisplay(xpRemaining)} XP pour le niveau ${nextLevelData.level}` 
        : "✅ Niveau suivant atteint !";
  } else {
    // Max level reached
    document.getElementById("levelProgress").textContent = "100%";
    document.getElementById("levelBar").style.width = "100%";
    document.getElementById("levelDetails").textContent = "🎉 Niveau maximum atteint !";
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
    if (typeof CONFIG !== 'undefined' && CONFIG.DEBUG?.progression) {
      console.log('[Progression] updateHeaderProgressBar: masqué (pas de data ou currentRank)');
    }
    return;
  }
  
  progressBar.style.display = 'block';
  
  const currentRankData = RANKS_DATA.find(r => r.name === data.currentRank);
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
      nextName.textContent = currentRankData ? "Grade maximum" : "-";
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
  
  if (typeof CONFIG !== 'undefined' && CONFIG.DEBUG?.progression) {
    const pctEl = document.getElementById('headerProgressPercent');
    const fillEl = document.getElementById('headerProgressFill');
    console.log('[Progression] updateHeaderProgressBar:', {
      rank: data.currentRank,
      rankPoints: data.rankPoints,
      nextRankPoints: data.nextRankPoints,
      affiché: pctEl?.textContent || fillEl?.style?.width
    });
  }
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
  const currentIndex = RANKS_DATA.findIndex(r => r.name === current);
  if (currentIndex === -1 || currentIndex === RANKS_DATA.length - 1) return '';
  return RANKS_DATA[currentIndex + 1].name;
}

function formatNumberDisplay(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return '-';
  if (value < 0) return '0';
  return numFormat(value);
}

if (typeof window !== 'undefined') window.numFormat = numFormat;

console.log('📊 Module Stats chargé');