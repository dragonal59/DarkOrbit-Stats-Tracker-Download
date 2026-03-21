// ==========================================
// MODULE: HISTORY DISPLAY
// ==========================================

function renderHistory() {
  const sessions = typeof getSessions === 'function' ? (getSessions() || []) : [];
  const historyList = document.getElementById("historyList");
  if (!historyList) return;

  if (!Array.isArray(sessions) || sessions.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>Aucune session sauvegardée pour le moment</p>
      </div>
    `;
    return;
  }
  
  // Trier par date décroissante (plus récent en premier)
  const sortedSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  
  // Gains par session : toujours par rapport à la session chronologiquement précédente (toutes périodes),
  // ou par rapport à la baseline pour la plus ancienne — pas par rapport à la première de la semaine.
  const gainsBySessionId = computeGainsBySession(sortedSessions);
  
  // Grouper les sessions par période
  const grouped = groupSessionsByPeriod(sortedSessions);
  
  // Générer le HTML
  let html = '';
  
  for (const [period, periodData] of Object.entries(grouped)) {
    const { label, sessions: periodSessions, totalHonor, totalXp } = periodData;
    const isCurrentPeriod = period === getCurrentPeriodKey();
    
    html += `
      <div class="history-period ${isCurrentPeriod ? 'current' : ''}">
        <div class="history-period-header" onclick="toggleHistoryPeriod('${period}')">
          <div class="history-period-info">
            <span class="history-period-icon" id="period-icon-${period}">${isCurrentPeriod ? '▼' : '▶'}</span>
            <span class="history-period-label">${label}</span>
          </div>
          <div class="history-period-summary">
            <span class="period-stat">🏆 +${formatNumberCompact(totalHonor)}</span>
            <span class="period-stat">⭐ +${formatNumberCompact(totalXp)}</span>
          </div>
        </div>
        <div class="history-period-content ${isCurrentPeriod ? 'show' : ''}" id="period-content-${period}">
          <div class="history-period-inner">
            ${renderPeriodSessions(periodSessions, gainsBySessionId)}
          </div>
        </div>
      </div>
    `;
  }
  
  historyList.innerHTML = html;
}

/**
 * Grouper les sessions par période (cette semaine, semaine dernière, ce mois, mois précédents)
 */
function groupSessionsByPeriod(sessions) {
  const now = new Date();
  const groups = {};
  
  // Définir les périodes
  const thisWeekStart = getWeekStart(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  
  sessions.forEach(session => {
    const sessionDate = new Date(session.timestamp);
    let periodKey, periodLabel;
    
    if (sessionDate >= thisWeekStart) {
      periodKey = 'this-week';
      periodLabel = '📅 Cette semaine';
    } else if (sessionDate >= lastWeekStart) {
      periodKey = 'last-week';
      periodLabel = '📅 Semaine dernière';
    } else {
      // Grouper par mois
      const monthKey = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}`;
      const monthName = sessionDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      periodKey = monthKey;
      periodLabel = `📆 ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;
    }
    
    if (!groups[periodKey]) {
      groups[periodKey] = {
        label: periodLabel,
        sessions: [],
        totalHonor: 0,
        totalXp: 0
      };
    }
    
    groups[periodKey].sessions.push(session);
  });
  
  // Calculer les gains par période
  for (const periodKey of Object.keys(groups)) {
    const periodSessions = groups[periodKey].sessions;
    if (periodSessions.length > 1) {
      const sorted = [...periodSessions].sort((a, b) => a.timestamp - b.timestamp);
      groups[periodKey].totalHonor = sorted[sorted.length - 1].honor - sorted[0].honor;
      groups[periodKey].totalXp = sorted[sorted.length - 1].xp - sorted[0].xp;
    }
  }
  
  return groups;
}

/**
 * Obtenir la clé de la période actuelle
 */
function getCurrentPeriodKey() {
  return 'this-week';
}

/** Échappe un ID de session pour l'utiliser en toute sécurité dans un attribut onclick. */
function attrSessionId(id) {
  return "'" + String(id).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/**
 * Calcule les gains pour chaque session par rapport à la session chronologiquement précédente
 * (toutes périodes confondues). Pour la plus ancienne session, utilise la baseline si elle existe.
 * @param {Array} sortedSessions - Sessions triées par date décroissante (plus récent en premier)
 * @returns {Object} Map sessionId -> { honor, xp, rankPoints }
 */
function computeGainsBySession(sortedSessions) {
  const out = {};
  if (!sortedSessions || sortedSessions.length === 0) return out;
  const baseline = sortedSessions.find(s => s.is_baseline === true);
  for (let i = 0; i < sortedSessions.length; i++) {
    const session = sortedSessions[i];
    const sid = session.id != null ? String(session.id) : 's-' + (session.timestamp || i);
    const prev = sortedSessions[i + 1]; // session chronologiquement précédente (plus ancienne)
    if (prev) {
      out[sid] = {
        honor: session.honor - prev.honor,
        xp: session.xp - prev.xp,
        rankPoints: session.rankPoints - prev.rankPoints
      };
    } else if (baseline && baseline.id !== session.id && !session.is_baseline) {
      out[sid] = {
        honor: session.honor - baseline.honor,
        xp: session.xp - baseline.xp,
        rankPoints: session.rankPoints - baseline.rankPoints
      };
    } else {
      out[sid] = { honor: null, xp: null, rankPoints: null };
    }
  }
  return out;
}

/**
 * Rendre les sessions d'une période.
 * Règles :
 * - Une seule carte par jour de calendrier (regroupement par date).
 * - La baseline (is_baseline) n'affiche jamais de gain (0 / vide).
 * - Les gains d'un jour = somme des gains de toutes les sessions de ce jour,
 *   en réutilisant computeGainsBySession pour chaque session.
 */
function renderPeriodSessions(sessions, gainsBySessionId) {
  if (!gainsBySessionId) gainsBySessionId = {};
  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return '';

  // Grouper les sessions de la période par jour (YYYY-MM-DD)
  const byDay = {};
  sessions.forEach(function (session) {
    const d = new Date(session.timestamp);
    if (Number.isNaN(d.getTime())) return;
    const dayKey =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    if (!byDay[dayKey]) {
      byDay[dayKey] = { sessions: [], hasBaseline: false };
    }
    byDay[dayKey].sessions.push(session);
    if (session.is_baseline) byDay[dayKey].hasBaseline = true;
  });

  const dailyGroups = Object.values(byDay).map(function (g) {
    // session la plus récente du jour pour l'affichage
    const last = g.sessions.slice().sort((a, b) => b.timestamp - a.timestamp)[0];
    return { last, sessions: g.sessions, hasBaseline: g.hasBaseline };
  });

  // Trier les jours par date décroissante (jour le plus récent en haut)
  dailyGroups.sort(function (a, b) {
    return b.last.timestamp - a.last.timestamp;
  });

  return dailyGroups.map(({ last, sessions: daySessions, hasBaseline }) => {
    const session = last;
    let rankKey = session.currentRank || '';
    if (rankKey.startsWith('rank_') && typeof RANK_KEY_TO_RANK_NAME !== 'undefined') rankKey = RANK_KEY_TO_RANK_NAME[rankKey] || rankKey;
    const rankData = typeof RANKS_DATA !== 'undefined' ? RANKS_DATA.find(r => r.rank === rankKey || r.name === rankKey) : null;
    const rankImg = rankData ? rankData.img : '';
    const rankDisplay = rankData ? rankData.name : rankKey || session.currentRank || '';
    const currentLevel = getCurrentLevel(session.xp);

    // Gains du jour = somme des gains de toutes les sessions de ce jour,
    // basés sur computeGainsBySession.
    let gains = { honor: 0, xp: 0, rankPoints: 0 };
    daySessions.forEach(function (s) {
      const sid = s.id != null ? String(s.id) : 's-' + (s.timestamp || 0);
      const g = gainsBySessionId[sid];
      if (!g) return;
      if (typeof g.honor === 'number') gains.honor += g.honor;
      if (typeof g.xp === 'number') gains.xp += g.xp;
      if (typeof g.rankPoints === 'number') gains.rankPoints += g.rankPoints;
    });

    // Baseline : aucun gain affiché
    if (hasBaseline) {
      gains = { honor: null, xp: null, rankPoints: null };
    }

    var baselineBadge = (hasBaseline && typeof window !== 'undefined' && typeof window.i18nT === 'function')
      ? window.i18nT('baseline_label')
      : (hasBaseline ? 'Seuil de départ' : '');
    return `
    <div class="session-card">
      <div class="session-header">
        <div class="session-date">📅 ${session.date}${baselineBadge ? ' • <span class="session-baseline-badge">' + baselineBadge + '</span>' : ''}</div>
        <div class="session-actions">
          <button class="session-btn error" onclick="deleteSession(${attrSessionId(session.id)})" title="Supprimer">🗑️</button>
        </div>
      </div>
      <div class="session-stats">
        <div class="session-stat">
          <div class="session-stat-label">Grade</div>
          <div class="session-stat-main">
            <div class="grade-block grade-block--compact">
              <div class="grade-block-name">${rankDisplay}</div>
              <div class="grade-block-icon">
                ${rankImg ? `<img src="${rankImg}" alt="${rankDisplay}" class="grade-block-img">` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="session-stat">
          <div class="session-stat-label">Niveau</div>
          <div class="session-stat-main">Niveau ${currentLevel}</div>
        </div>
        <div class="session-stat">
          <div class="session-stat-label"><img src="img/icon_btn/honor_icon.png" alt="" class="session-stat-icon"> Honneur</div>
          <div class="session-stat-values">
            <div class="session-stat-main">${formatNumberDisplay(session.honor)}</div>
            <div class="session-stat-gain session-gain ${getGainClass(gains.honor, 'pn')}">${formatSignedGain(gains.honor, true)}</div>
          </div>
        </div>
        <div class="session-stat">
          <div class="session-stat-label"><img src="img/icon_btn/xp_icon.png" alt="" class="session-stat-icon"> XP</div>
          <div class="session-stat-values">
            <div class="session-stat-main">${formatNumberDisplay(session.xp)}</div>
            <div class="session-stat-gain session-gain ${getGainClass(gains.xp, 'pn')}">${formatSignedGain(gains.xp, true)}</div>
          </div>
        </div>
        <div class="session-stat">
          <div class="session-stat-label"><img src="img/icon_btn/rp_icon.png" alt="" class="session-stat-icon"> Points de grade</div>
          <div class="session-stat-values">
            <div class="session-stat-main">${formatNumberDisplay(session.rankPoints)}</div>
            <div class="session-stat-gain session-gain ${getGainClass(gains.rankPoints, 'pn')}">${formatSignedGain(gains.rankPoints, true)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

/**
 * Toggle une période dans l'historique
 */
function toggleHistoryPeriod(periodId) {
  const icon = document.getElementById(`period-icon-${periodId}`);
  const content = document.getElementById(`period-content-${periodId}`);
  
  if (content.classList.contains('show')) {
    content.classList.remove('show');
    icon.textContent = '▶';
  } else {
    content.classList.add('show');
    icon.textContent = '▼';
  }
}

// formatSignedGain et getGainClass sont centralisés dans utils.js

// Make functions globally available
window.toggleHistoryPeriod = toggleHistoryPeriod;
window.attrSessionId = attrSessionId;

