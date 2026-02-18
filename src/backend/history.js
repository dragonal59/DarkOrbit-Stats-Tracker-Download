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
  
  // Trier par date décroissante
  const sortedSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  
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
            <span class="history-period-count">${periodSessions.length} session${periodSessions.length > 1 ? 's' : ''}</span>
          </div>
          <div class="history-period-summary">
            <span class="period-stat">🏆 +${formatNumberCompact(totalHonor)}</span>
            <span class="period-stat">⭐ +${formatNumberCompact(totalXp)}</span>
          </div>
        </div>
        <div class="history-period-content ${isCurrentPeriod ? 'show' : ''}" id="period-content-${period}">
          <div class="history-period-inner">
            ${renderPeriodSessions(periodSessions)}
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
 * Obtenir le début de la semaine (lundi)
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Obtenir la clé de la période actuelle
 */
function getCurrentPeriodKey() {
  return 'this-week';
}

/**
 * Formater un nombre de façon compacte
 */
function formatNumberCompact(num) {
  if (num < 0) return '-' + formatNumberCompact(-num);
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return Math.round(num).toLocaleString('en-US');
}

function formatNumberDisplay(num) {
  const abs = Math.abs(Number(num) || 0);
  if (abs >= 10000000) {
    return abs.toLocaleString('en-US');
  }
  const padded = String(abs).padStart(8, '0');
  return padded.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Rendre les sessions d'une période
 */
function renderPeriodSessions(sessions) {
  return sessions.map((session, index) => {
    const rankData = RANKS_DATA.find(r => r.name === session.currentRank);
    const rankImg = rankData ? rankData.img : '';
    const currentLevel = getCurrentLevel(session.xp);
    const hasNote = session.note && session.note.trim() !== '';
    
    // Calculer les gains par rapport à la session précédente
    let gains = {
      honor: null,
      xp: null,
      rankPoints: null
    };
    if (index < sessions.length - 1) {
      const prevSession = sessions[index + 1]; // sessions triées par date décroissante
      gains = {
        honor: session.honor - prevSession.honor,
        xp: session.xp - prevSession.xp,
        rankPoints: session.rankPoints - prevSession.rankPoints
      };
    }
    
    return `
    <div class="session-card">
      <div class="session-header">
        <div class="session-date">📅 ${session.date}</div>
        <div class="session-actions">
          <button class="session-btn" onclick="loadSession(${session.id})" title="Charger cette session">📂</button>
          <button class="session-btn error" onclick="deleteSession(${session.id})" title="Supprimer">🗑️</button>
        </div>
      </div>
      <div class="session-stats">
        <div class="session-stat">
          <div class="session-stat-label">Grade</div>
          <div class="session-stat-main">
            <div class="grade-block grade-block--compact">
              <div class="grade-block-name">${session.currentRank}</div>
              <div class="grade-block-icon">
                ${rankImg ? `<img src="${rankImg}" alt="${session.currentRank}" class="grade-block-img">` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="session-stat">
          <div class="session-stat-label">Niveau</div>
          <div class="session-stat-main">Niveau ${currentLevel}</div>
        </div>
        <div class="session-stat">
          <div class="session-stat-label">Honneur</div>
          <div class="session-stat-values">
            <div class="session-stat-main">${formatNumberDisplay(session.honor)}</div>
            <div class="session-stat-gain session-gain ${getGainClass(gains.honor)}">${formatSignedGain(gains.honor)}</div>
          </div>
        </div>
        <div class="session-stat">
          <div class="session-stat-label">XP</div>
          <div class="session-stat-values">
            <div class="session-stat-main">${formatNumberDisplay(session.xp)}</div>
            <div class="session-stat-gain session-gain ${getGainClass(gains.xp)}">${formatSignedGain(gains.xp)}</div>
          </div>
        </div>
        <div class="session-stat">
          <div class="session-stat-label">Points de grade</div>
          <div class="session-stat-values">
            <div class="session-stat-main">${formatNumberDisplay(session.rankPoints)}</div>
            <div class="session-stat-gain session-gain ${getGainClass(gains.rankPoints)}">${formatSignedGain(gains.rankPoints)}</div>
          </div>
        </div>
      </div>
      ${hasNote ? `
      <div class="session-note-container">
        <div class="session-note-toggle" onclick="toggleNote(${session.id})">
          <span class="session-note-icon" id="note-icon-${session.id}">▶</span>
          <span class="session-note-label">📝 Note</span>
        </div>
        <div class="session-note-content" id="note-content-${session.id}">
          <div class="session-note-text">${session.note}</div>
        </div>
      </div>
      ` : ''}
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

function toggleNote(sessionId) {
  const icon = document.getElementById(`note-icon-${sessionId}`);
  const content = document.getElementById(`note-content-${sessionId}`);
  
  if (content.classList.contains('show')) {
    content.classList.remove('show');
    icon.textContent = '▶';
    icon.classList.remove('open');
  } else {
    content.classList.add('show');
    icon.textContent = '▼';
    icon.classList.add('open');
  }
}

function addNoteTemplate(template) {
  const noteField = document.getElementById('sessionNote');
  const currentNote = noteField.value.trim();
  
  if (currentNote === '') {
    noteField.value = template;
  } else {
    noteField.value = currentNote + '\n' + template;
  }
  
  // Auto-save
  saveCurrentStats();
}

function clearNote() {
  document.getElementById('sessionNote').value = '';
  saveCurrentStats();
}

function formatSignedGain(num) {
  if (num === null || typeof num === 'undefined') return '-';
  if (num < 0) return `-${formatNumberCompact(Math.abs(num))}`;
  return `+${formatNumberCompact(num)}`;
}

function getGainClass(num) {
  if (num === null || typeof num === 'undefined') return 'neutral';
  if (num > 0) return 'positive';
  if (num < 0) return 'negative';
  return 'neutral';
}

// Make functions globally available
window.toggleNote = toggleNote;
window.toggleHistoryPeriod = toggleHistoryPeriod;
window.addNoteTemplate = addNoteTemplate;
window.clearNote = clearNote;

console.log('📚 Module History chargé');