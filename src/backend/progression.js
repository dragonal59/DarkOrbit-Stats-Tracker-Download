// ==========================================
// MODULE: PROGRESSION TAB
// ==========================================

function getSessionRankPoints(s) {
  return Number(s?.rankPoints ?? s?.rank_points ?? 0) || 0;
}

function updateProgressionTab() {
  const sessions = typeof getSessions === 'function' ? (getSessions() || []) : [];
  const progressionContent = document.getElementById("progressionContent");
  const advancedStats = document.getElementById("advancedStats");
  const comparisonSection = document.getElementById("comparisonSection");
  const predictionsSection = document.getElementById("predictionsSection");
  const timeComparisonSection = document.getElementById("timeComparisonSection");
  
  if (sessions.length === 0) {
    if (progressionContent) {
      progressionContent.innerHTML = `
        <div class="progression-section-card current-session-card empty">
          <div class="section-header">
            <h3>⚡ ${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_title') : 'Gains du jour'}</h3>
            <p class="progression-gains-legend">${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_legend') : 'Gains par rapport à la dernière session d\'hier'}</p>
          </div>
          <p class="empty-message">${typeof window.i18nT === 'function' ? window.i18nT('progression_save_one_session') : 'Sauvegardez une session pour voir vos gains'}</p>
        </div>
      `;
    }
    if (advancedStats) advancedStats.style.display = 'none';
    if (comparisonSection) comparisonSection.style.display = 'none';
    if (predictionsSection) predictionsSection.style.display = 'none';
    if (timeComparisonSection) timeComparisonSection.style.display = 'none';
    const chartContainer = document.getElementById('chartContainer');
    if (chartContainer) chartContainer.style.display = 'none';
    return;
  }
  
  // Trier les sessions par date (plus ancien en premier)
  const sortedSessions = [...sessions].sort((a, b) => a.timestamp - b.timestamp);

  // Gains du jour : référence = dernière session d'hier (reference-session.js)
  const getRefForComparison = (typeof window !== 'undefined' && window.getReferenceSessionForComparison) || (typeof getReferenceSessionForComparison === 'function' ? getReferenceSessionForComparison : null);
  const calcDailyGains = (typeof window !== 'undefined' && window.calculateDailyGains) || (typeof calculateDailyGains === 'function' ? calculateDailyGains : null);
  const reference = getRefForComparison ? getRefForComparison(sessions) : { session: null, label: '-', isFirstOfDay: false, isFirstEver: false };
  const latestSession = sortedSessions[sortedSessions.length - 1];
  let emptyGainsMessage = null;
  let currentSessionData = null;
  if (reference && reference.session != null) {
    const gainsData = calcDailyGains ? calcDailyGains(latestSession, reference) : { honor: 0, xp: 0, rankPoints: 0, honorGain: 0, xpGain: 0, rankPointsGain: 0, comparedTo: '-', isFirstSession: false };
    currentSessionData = gainsData ? { ...gainsData, isFirstSession: gainsData.isFirstSession } : null;
  } else if (sessions.length > 0) {
    emptyGainsMessage = 'progression_no_session_yesterday';
  }

  // Cas 1 seule session : afficher uniquement la carte Gains du jour
  if (sessions.length === 1) {
    if (!currentSessionData) {
      progressionContent.innerHTML = `
        <div class="progression-section-card current-session-card empty">
          <div class="section-header">
            <h3>⚡ ${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_title') : 'Gains du jour'}</h3>
            <p class="progression-gains-legend">${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_legend') : 'Gains par rapport à la dernière session d\'hier'}</p>
          </div>
          <p class="empty-message">${typeof window.i18nT === 'function' ? window.i18nT('progression_no_session_yesterday') : 'Pas de session hier'}</p>
        </div>
      `;
      advancedStats.style.display = 'none';
      comparisonSection.style.display = 'none';
      predictionsSection.style.display = 'none';
      timeComparisonSection.style.display = 'none';
      const chartContainerHide = document.getElementById('chartContainer');
      if (chartContainerHide) chartContainerHide.style.display = 'none';
      return;
    }
    const badgeLabel = currentSessionData.comparedTo;
    progressionContent.innerHTML = `
      <div class="progression-section-card current-session-card">
        <div class="section-header">
          <h3>⚡ ${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_title') : 'Gains du jour'}</h3>
          <p class="progression-gains-legend">${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_legend') : 'Gains par rapport à la dernière session d\'hier'}</p>
          <span class="time-badge">${badgeLabel}</span>
        </div>
        <div class="current-session-stats">
          <div class="current-stat">
            <span class="current-stat-icon">🏆</span>
            <div class="current-stat-info">
              <span class="current-stat-label">${typeof window.i18nT === 'function' ? window.i18nT('honor') : 'Honneur'}</span>
              <span class="current-stat-value ${getGainClass(currentSessionData.honorGain)}">
                ${formatSignedGain(currentSessionData.honorGain)}
              </span>
            </div>
          </div>
          <div class="current-stat">
            <span class="current-stat-icon">⭐</span>
            <div class="current-stat-info">
              <span class="current-stat-label">${typeof window.i18nT === 'function' ? window.i18nT('xp') : 'XP'}</span>
              <span class="current-stat-value ${getGainClass(currentSessionData.xpGain)}">
                ${formatSignedGain(currentSessionData.xpGain)}
              </span>
            </div>
          </div>
          <div class="current-stat">
            <span class="current-stat-icon">📊</span>
            <div class="current-stat-info">
              <span class="current-stat-label">${typeof window.i18nT === 'function' ? window.i18nT('points_grade') : 'Points grade'}</span>
              <span class="current-stat-value ${getGainClass(currentSessionData.rankPointsGain)}">
                ${formatSignedGain(currentSessionData.rankPointsGain)}
              </span>
            </div>
          </div>
        </div>
        ${currentSessionData.isFirstSession ? `
          <div class="current-session-tip">
            🎉 ${typeof window.i18nT === 'function' ? window.i18nT('progression_first_session_tip') : 'Première session enregistrée ! C\'est votre point de départ.'}
          </div>
        ` : ''}
      </div>
    `;
    advancedStats.style.display = 'none';
    comparisonSection.style.display = 'none';
    predictionsSection.style.display = 'none';
    timeComparisonSection.style.display = 'none';
    const chartContainerHide = document.getElementById('chartContainer');
    if (chartContainerHide) chartContainerHide.style.display = 'none';
    return;
  }

  const chartContainerShow = document.getElementById('chartContainer');
  if (chartContainerShow) chartContainerShow.style.display = 'block';
  advancedStats.style.display = 'block';
  comparisonSection.style.display = 'block';
  predictionsSection.style.display = 'block';
  timeComparisonSection.style.display = 'block';

  const latest = sortedSessions[sortedSessions.length - 1];
  const previous = sortedSessions[sortedSessions.length - 2];
  const oldest = sortedSessions[0];
  const beforePrevious = sortedSessions.length >= 3 ? sortedSessions[sortedSessions.length - 3] : null;

  const totalHonorGain = latest.honor - oldest.honor;
  const totalXpGain = latest.xp - oldest.xp;
  const totalRankGain = getSessionRankPoints(latest) - getSessionRankPoints(oldest);

  const refForPrevious = beforePrevious ?? oldest;
  const lastSessionHonorGain = previous && refForPrevious ? previous.honor - refForPrevious.honor : 0;
  const lastSessionXpGain = previous && refForPrevious ? previous.xp - refForPrevious.xp : 0;
  const lastSessionRankGain = previous && refForPrevious ? getSessionRankPoints(previous) - getSessionRankPoints(refForPrevious) : 0;
  const lastSessionDate = previous ? previous.timestamp : null;

  const avgHonorPerSession = totalHonorGain / (sessions.length - 1);
  const avgXpPerSession = totalXpGain / (sessions.length - 1);
  const avgRankPerSession = totalRankGain / (sessions.length - 1);
  const daysDiff = Math.max(1, Math.ceil((latest.timestamp - oldest.timestamp) / (1000 * 60 * 60 * 24)));
  const avgHonorPerDay = totalHonorGain / daysDiff;
  const avgXpPerDay = totalXpGain / daysDiff;
  const avgRankPerDay = totalRankGain / daysDiff;
  
  // Trouver la meilleure session
  let bestSession = null;
  let bestSessionPrevious = null;
  let bestGain = 0;
  
  for (let i = 1; i < sortedSessions.length; i++) {
    const gain = sortedSessions[i].xp - sortedSessions[i-1].xp;
    if (gain > bestGain) {
      bestGain = gain;
      bestSession = sortedSessions[i];
      bestSessionPrevious = sortedSessions[i-1];
    }
  }
  
  // Mettre à jour les stats avancées (valeurs négatives en rouge avec signe -)
  function formatAvgStat(val) {
    const compact = formatNumberCompact(Math.abs(val));
    const isNeg = val < 0;
    return { text: (isNeg ? '-' : '+') + compact, isNeg };
  }
  const honorAvg = formatAvgStat(avgHonorPerDay);
  const xpAvg = formatAvgStat(avgXpPerDay);
  const rankAvg = formatAvgStat(avgRankPerDay);
  const avgHonorEl = document.getElementById('avgHonorPerDay');
  const avgXpEl = document.getElementById('avgXpPerDay');
  const avgRankEl = document.getElementById('avgRankPerDay');
  if (avgHonorEl) { avgHonorEl.textContent = honorAvg.text; avgHonorEl.className = 'advanced-stat-value' + (honorAvg.isNeg ? ' stat-negative' : ''); }
  if (avgXpEl) { avgXpEl.textContent = xpAvg.text; avgXpEl.className = 'advanced-stat-value' + (xpAvg.isNeg ? ' stat-negative' : ''); }
  if (avgRankEl) { avgRankEl.textContent = rankAvg.text; avgRankEl.className = 'advanced-stat-value' + (rankAvg.isNeg ? ' stat-negative' : ''); }
  
  if (bestSession) {
    const bestDate = new Date(bestSession.timestamp).toLocaleDateString('fr-FR');
    const br = typeof bestSession.currentRank === 'string' && bestSession.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[bestSession.currentRank] || bestSession.currentRank) : bestSession.currentRank;
    const bestRankData = RANKS_DATA.find(r => r.name === br || r.rank === br);
    
    const bestSessionElement = document.getElementById('bestSession');
    if (bestRankData) {
      bestSessionElement.innerHTML = `
        <div class="grade-block grade-block--compact">
          <div class="grade-block-name">${bestSession.currentRank}</div>
          <div class="grade-block-icon">
            <img src="${bestRankData.img}" alt="${bestSession.currentRank}" class="grade-block-img">
          </div>
        </div>
      `;
    } else {
      bestSessionElement.textContent = bestSession.currentRank;
    }
    
    document.getElementById('bestSessionDate').textContent = bestDate;
    
    // Calculer les gains de la meilleure session
    const bestHonorGain = bestSession.honor - bestSessionPrevious.honor;
    const bestXpGain = bestSession.xp - bestSessionPrevious.xp;
    const bestRankGain = getSessionRankPoints(bestSession) - getSessionRankPoints(bestSessionPrevious);
    
    const bestSessionCard = document.getElementById('bestSessionCard');
    bestSessionCard.onclick = () => {
      showBestSessionDetails(bestSession, bestSessionPrevious, bestHonorGain, bestXpGain, bestRankGain);
    };
  }
  
  // Calculer les prédictions
  updatePredictions(latest, avgXpPerDay, avgRankPerDay);
  
  // Calculer la comparaison temporelle
  updateTimeComparison(sortedSessions);
  
  // Créer le graphique
  createProgressChart(sortedSessions);
  
  // Remplir les sélecteurs de comparaison
  populateComparisonSelectors(sortedSessions);
  
  // ==========================================
  // GÉNÉRATION DU HTML
  // ==========================================
  
  // Section Session Actuelle (stats en cours de saisie)
  const gainsBadge = currentSessionData ? currentSessionData.comparedTo : '';
  const currentSessionHtml = currentSessionData ? `
    <div class="progression-section-card current-session-card">
      <div class="section-header">
        <h3>⚡ ${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_title') : 'Gains du jour'}</h3>
        <p class="progression-gains-legend">${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_legend') : 'Gains par rapport à la dernière session d\'hier'}</p>
        <span class="time-badge">${gainsBadge}</span>
      </div>
      <div class="current-session-stats">
        <div class="current-stat">
          <span class="current-stat-icon">🏆</span>
          <div class="current-stat-info">
            <span class="current-stat-label">${typeof window.i18nT === 'function' ? window.i18nT('honor') : 'Honneur'}</span>
            <span class="current-stat-value ${getGainClass(currentSessionData.honorGain)}">
              ${formatSignedGain(currentSessionData.honorGain)}
            </span>
          </div>
        </div>
        <div class="current-stat">
          <span class="current-stat-icon">⭐</span>
          <div class="current-stat-info">
            <span class="current-stat-label">${typeof window.i18nT === 'function' ? window.i18nT('xp') : 'XP'}</span>
            <span class="current-stat-value ${getGainClass(currentSessionData.xpGain)}">
              ${formatSignedGain(currentSessionData.xpGain)}
            </span>
          </div>
        </div>
        <div class="current-stat">
          <span class="current-stat-icon">📊</span>
          <div class="current-stat-info">
            <span class="current-stat-label">${typeof window.i18nT === 'function' ? window.i18nT('points_grade') : 'Points grade'}</span>
            <span class="current-stat-value ${getGainClass(currentSessionData.rankPointsGain)}">
              ${formatSignedGain(currentSessionData.rankPointsGain)}
            </span>
          </div>
        </div>
      </div>
      ${currentSessionData.isFirstSession ? `
        <div class="current-session-tip">
          🎉 ${typeof window.i18nT === 'function' ? window.i18nT('progression_first_session_tip') : 'Première session enregistrée ! C\'est votre point de départ.'}
        </div>
      ` : ((currentSessionData.honorGain > 0 || currentSessionData.xpGain > 0) && !shouldHideSaveReminder() ? `
        <div class="current-session-tip">
          💡 ${typeof window.i18nT === 'function' ? window.i18nT('progression_save_reminder') : 'N\'oubliez pas de sauvegarder votre session !'}
        </div>
      ` : '')}
    </div>
  ` : `
    <div class="progression-section-card current-session-card empty">
      <div class="section-header">
        <h3>⚡ ${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_title') : 'Gains du jour'}</h3>
        <p class="progression-gains-legend">${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_legend') : 'Gains par rapport à la dernière session d\'hier'}</p>
      </div>
      <p class="empty-message">${typeof window.i18nT === 'function' ? window.i18nT(emptyGainsMessage || 'progression_enter_stats') : (emptyGainsMessage ? 'Pas de session hier' : 'Entrez vos stats actuelles pour voir vos gains')}</p>
    </div>
  `;
  
  // Données de grade pour les images
  const lr = typeof latest.currentRank === 'string' && latest.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[latest.currentRank] || latest.currentRank) : latest.currentRank;
  const pr = typeof previous.currentRank === 'string' && previous.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[previous.currentRank] || previous.currentRank) : previous.currentRank;
  const or = typeof oldest.currentRank === 'string' && oldest.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[oldest.currentRank] || oldest.currentRank) : oldest.currentRank;
  const latestRankData = RANKS_DATA.find(r => r.name === lr || r.rank === lr);
  const previousRankData = RANKS_DATA.find(r => r.name === pr || r.rank === pr);
  const oldestRankData = RANKS_DATA.find(r => r.name === or || r.rank === or);
  
  progressionContent.innerHTML = `
    ${currentSessionHtml}
    
    <div class="progression-grid">
      <div class="progression-section-card">
        <div class="section-header">
          <h3>📅 ${typeof window.i18nT === 'function' ? window.i18nT('progression_previous_session') : 'Session précédente'}</h3>
          <span class="date-badge">${lastSessionDate ? new Date(lastSessionDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '-'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">🏆 ${typeof window.i18nT === 'function' ? window.i18nT('honor') : 'Honneur'}</span>
          <span class="stat-value ${getGainClass(lastSessionHonorGain)}">
            ${formatSignedGain(lastSessionHonorGain)}
          </span>
        </div>
        <div class="stat-row">
          <span class="stat-label">⭐ ${typeof window.i18nT === 'function' ? window.i18nT('xp') : 'XP'}</span>
          <span class="stat-value ${getGainClass(lastSessionXpGain)}">
            ${formatSignedGain(lastSessionXpGain)}
          </span>
        </div>
        <div class="stat-row">
          <span class="stat-label">📊 ${typeof window.i18nT === 'function' ? window.i18nT('points_grade') : 'Points grade'}</span>
          <span class="stat-value ${getGainClass(lastSessionRankGain)}">
            ${formatSignedGain(lastSessionRankGain)}
          </span>
        </div>
      </div>
      
      <div class="progression-section-card">
        <div class="section-header">
          <h3>📊 ${typeof window.i18nT === 'function' ? window.i18nT('progression_averages_session') : 'Moyennes / session'}</h3>
          <span class="date-badge">${sessions.length} ${typeof window.i18nT === 'function' ? window.i18nT('sessions_count') : 'Sessions'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">🏆 ${typeof window.i18nT === 'function' ? window.i18nT('honor') : 'Honneur'}</span>
          <span class="stat-value gain">+${formatNumberCompact(avgHonorPerSession)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">⭐ ${typeof window.i18nT === 'function' ? window.i18nT('xp') : 'XP'}</span>
          <span class="stat-value gain">+${formatNumberCompact(avgXpPerSession)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">📊 ${typeof window.i18nT === 'function' ? window.i18nT('points_grade') : 'Points grade'}</span>
          <span class="stat-value gain">+${formatNumberCompact(avgRankPerSession)}</span>
        </div>
      </div>
    </div>
    
    <div class="progression-section-card progression-total">
      <div class="section-header">
        <h3>🎯 ${typeof window.i18nT === 'function' ? window.i18nT('progression_total') : 'Progression totale'}</h3>
        <span class="period-badge">${daysDiff} ${daysDiff > 1 ? (typeof window.i18nT === 'function' ? window.i18nT('progression_days') : 'jours') : (typeof window.i18nT === 'function' ? window.i18nT('progression_day') : 'jour')} • ${sessions.length} ${typeof window.i18nT === 'function' ? window.i18nT('sessions_count') : 'Sessions'}</span>
      </div>
      
      <div class="total-stats-grid">
        <div class="total-stat">
          <span class="total-stat-label">🏆 ${typeof window.i18nT === 'function' ? window.i18nT('honor_gained') : 'Honneur gagné'}</span>
          <span class="total-stat-value ${totalHonorGain >= 0 ? 'gain' : 'loss'}">
            ${totalHonorGain >= 0 ? '+' : ''}${formatNumberDisplay(totalHonorGain)}
          </span>
        </div>
        <div class="total-stat">
          <span class="total-stat-label">⭐ ${typeof window.i18nT === 'function' ? window.i18nT('xp_gained') : 'XP gagnée'}</span>
          <span class="total-stat-value ${totalXpGain >= 0 ? 'gain' : 'loss'}">
            ${totalXpGain >= 0 ? '+' : ''}${formatNumberDisplay(totalXpGain)}
          </span>
        </div>
        <div class="total-stat">
          <span class="total-stat-label">📊 ${typeof window.i18nT === 'function' ? window.i18nT('points_grade') : 'Points grade'}</span>
          <span class="total-stat-value ${totalRankGain >= 0 ? 'gain' : 'loss'}">
            ${totalRankGain >= 0 ? '+' : ''}${formatNumberDisplay(totalRankGain)}
          </span>
        </div>
      </div>
      
      <div class="grade-evolution">
        <div class="grade-item">
          <span class="grade-label">${typeof window.i18nT === 'function' ? window.i18nT('progression_grade_start') : 'Début'}</span>
          <div class="grade-block grade-block--compact">
            <div class="grade-block-name">${oldest.currentRank}</div>
            <div class="grade-block-icon">
              ${oldestRankData ? `<img src="${oldestRankData.img}" alt="${oldest.currentRank}" class="grade-block-img">` : ''}
            </div>
          </div>
          <span class="grade-date">${new Date(oldest.timestamp).toLocaleDateString('fr-FR')}</span>
        </div>
        <div class="grade-arrow">→</div>
        <div class="grade-item">
          <span class="grade-label">${typeof window.i18nT === 'function' ? window.i18nT('progression_grade_current') : 'Actuel'}</span>
          <div class="grade-block grade-block--compact">
            <div class="grade-block-name">${latest.currentRank}</div>
            <div class="grade-block-icon">
              ${latestRankData ? `<img src="${latestRankData.img}" alt="${latest.currentRank}" class="grade-block-img">` : ''}
            </div>
          </div>
          <span class="grade-date">${new Date(latest.timestamp).toLocaleDateString('fr-FR')}</span>
        </div>
      </div>
    </div>
  `;
}

function updatePredictions(latestSession, avgXpPerDay, avgRankPerDay) {
  // Prédiction pour le prochain niveau
  const currentLevel = getCurrentLevel(latestSession.xp);
  const nextLevelData = getNextLevel(latestSession.xp);
  
  if (nextLevelData && avgXpPerDay > 0) {
    const xpNeeded = nextLevelData.xp - latestSession.xp;
    const daysToNextLevel = Math.ceil(xpNeeded / avgXpPerDay);
    
    document.getElementById('predictionNextLevel').textContent = (typeof window.i18nT === 'function' ? window.i18nT('level') : 'Niveau') + ' ' + nextLevelData.level;
    document.getElementById('predictionNextLevelDays').textContent = 
      daysToNextLevel === 1 
        ? (typeof window.i18nT === 'function' ? window.i18nT('prediction_in_1_day') : 'Dans environ 1 jour') 
        : (typeof window.i18nT === 'function' ? window.i18nT('prediction_in_n_days') : 'Dans environ %s jours').replace('%s', daysToNextLevel);
  } else if (!nextLevelData) {
    document.getElementById('predictionNextLevel').textContent = typeof window.i18nT === 'function' ? window.i18nT('prediction_level_max') : 'Niveau max';
    document.getElementById('predictionNextLevelDays').textContent = '🎉 ' + (typeof window.i18nT === 'function' ? window.i18nT('prediction_level_max_reached') : 'Niveau maximum atteint !');
  } else {
    document.getElementById('predictionNextLevel').textContent = '-';
    document.getElementById('predictionNextLevelDays').textContent = typeof window.i18nT === 'function' ? window.i18nT('prediction_not_enough_data') : 'Pas assez de données';
  }
  
  // Prédiction pour le prochain grade - avec IMAGE PLUS GRANDE
  const lsr = typeof latestSession.currentRank === 'string' && latestSession.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[latestSession.currentRank] || latestSession.currentRank) : latestSession.currentRank;
  const currentRankData = RANKS_DATA.find(r => r.name === lsr || r.rank === lsr);
  if (currentRankData) {
    const currentRankIndex = RANKS_DATA.indexOf(currentRankData);
    const nextRankData = currentRankIndex >= 0 && currentRankIndex < RANKS_DATA.length - 1 ? RANKS_DATA[currentRankIndex + 1] : null;
    const nextRankPointsTarget = latestSession.nextRankPoints ?? latestSession.next_rank_points ?? (nextRankData?.rankPoints);

    if (nextRankData && avgRankPerDay > 0 && nextRankPointsTarget != null) {
      const rankPointsNeeded = Number(nextRankPointsTarget) - getSessionRankPoints(latestSession);
      const daysToNextRank = Math.ceil(rankPointsNeeded / avgRankPerDay);
      
      // Image plus grande (32px au lieu de la taille par défaut)
      document.getElementById('predictionNextRank').innerHTML = `
        <div class="grade-block grade-block--compact">
          <div class="grade-block-name">${nextRankData.name}</div>
          <div class="grade-block-icon">
            <img src="${nextRankData.img}" alt="${nextRankData.name}" class="grade-block-img">
          </div>
        </div>
      `;
      document.getElementById('predictionNextRankDays').textContent = 
        daysToNextRank === 1 
          ? (typeof window.i18nT === 'function' ? window.i18nT('prediction_in_1_day') : 'Dans environ 1 jour') 
          : (typeof window.i18nT === 'function' ? window.i18nT('prediction_in_n_days') : 'Dans environ %s jours').replace('%s', daysToNextRank);
    } else if (currentRankIndex === RANKS_DATA.length - 1) {
      document.getElementById('predictionNextRank').textContent = typeof window.i18nT === 'function' ? window.i18nT('prediction_grade_max') : 'Grade max';
      document.getElementById('predictionNextRankDays').textContent = '🎉 ' + (typeof window.i18nT === 'function' ? window.i18nT('prediction_grade_max_reached') : 'Grade maximum atteint !');
    } else {
      document.getElementById('predictionNextRank').textContent = '-';
      document.getElementById('predictionNextRankDays').textContent = typeof window.i18nT === 'function' ? window.i18nT('prediction_not_enough_data') : 'Pas assez de données';
    }
  }
}

function shouldHideSaveReminder() {
  var badge = typeof getCurrentBadge === 'function'
    ? getCurrentBadge()
    : (typeof BackendAPI !== 'undefined' && BackendAPI.getUserBadge ? BackendAPI.getUserBadge() : 'FREE');
  var upper = (badge || 'FREE').toString().toUpperCase();
  var isProOrHigher = upper === 'PRO' || upper === 'ADMIN' || upper === 'SUPERADMIN';
  if (!isProOrHigher) return false;
  if (typeof UserPreferencesAPI !== 'undefined' && typeof UserPreferencesAPI.getActivePlayerInfoSync === 'function') {
    var info = UserPreferencesAPI.getActivePlayerInfoSync();
    if (info && (info.player_id || info.player_server || info.player_pseudo)) {
      return true;
    }
  }
  return false;
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('darkorbitCredentialsChanged', function () {
    try {
      if (typeof updateProgressionTab === 'function') updateProgressionTab();
    } catch (e) {}
  });
}

function updateTimeComparison(sortedSessions) {
  if (!sortedSessions || !sortedSessions.length) return;

  const now = new Date();
  const thisWeekStart = getWeekStart(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  // Sessions de cette semaine (>= début de semaine en cours)
  const thisWeekSessions = sortedSessions.filter(function (s) {
    const d = new Date(s.timestamp);
    return d >= thisWeekStart;
  });

  // Sessions de la semaine dernière (entre lastWeekStart et thisWeekStart)
  const lastWeekSessions = sortedSessions.filter(function (s) {
    const d = new Date(s.timestamp);
    return d >= lastWeekStart && d < thisWeekStart;
  });
  
  // Calculer les gains de cette semaine (même logique que l'historique : dernière - première)
  let thisWeekHonor = 0;
  let thisWeekXp = 0;
  
  if (thisWeekSessions.length > 1) {
    thisWeekHonor = thisWeekSessions[thisWeekSessions.length - 1].honor - thisWeekSessions[0].honor;
    thisWeekXp = thisWeekSessions[thisWeekSessions.length - 1].xp - thisWeekSessions[0].xp;
  }
  
  // Calculer les gains de la semaine dernière (dernière - première)
  let lastWeekHonor = 0;
  let lastWeekXp = 0;
  
  if (lastWeekSessions.length > 1) {
    lastWeekHonor = lastWeekSessions[lastWeekSessions.length - 1].honor - lastWeekSessions[0].honor;
    lastWeekXp = lastWeekSessions[lastWeekSessions.length - 1].xp - lastWeekSessions[0].xp;
  }

  function formatWeekValue(val, hasSessions) {
    if (!hasSessions) return '—';
    if (!val) return '0';
    var sign = val > 0 ? '+' : '';
    if (typeof formatNumberDisplay === 'function') return sign + formatNumberDisplay(val);
    return sign + val.toLocaleString('en-US');
  }

  // Afficher cette semaine
  document.getElementById('thisWeekHonor').textContent = formatWeekValue(thisWeekHonor, thisWeekSessions.length > 0);
  document.getElementById('thisWeekXp').textContent = formatWeekValue(thisWeekXp, thisWeekSessions.length > 0);
  document.getElementById('thisWeekSessions').textContent = thisWeekSessions.length;

  // Afficher semaine dernière
  document.getElementById('lastWeekHonor').textContent = formatWeekValue(lastWeekHonor, lastWeekSessions.length > 0);
  document.getElementById('lastWeekXp').textContent = formatWeekValue(lastWeekXp, lastWeekSessions.length > 0);
  document.getElementById('lastWeekSessions').textContent = lastWeekSessions.length;
  
  // Calculer l'évolution
  const evolutionHonorEl = document.getElementById('evolutionHonor');
  const evolutionXpEl = document.getElementById('evolutionXp');
  const evolutionTrendEl = document.getElementById('evolutionTrend');
  
  if (lastWeekHonor > 0 && thisWeekHonor > 0) {
    const honorPercent = ((thisWeekHonor - lastWeekHonor) / lastWeekHonor * 100).toFixed(1);
    evolutionHonorEl.textContent = honorPercent > 0 ? `+${honorPercent}%` : `${honorPercent}%`;
    evolutionHonorEl.className = `time-stat-value evolution ${honorPercent >= 0 ? 'positive' : 'negative'}`;
  } else {
    evolutionHonorEl.textContent = '-';
    evolutionHonorEl.className = 'time-stat-value evolution neutral';
  }
  
  if (lastWeekXp > 0 && thisWeekXp > 0) {
    const xpPercent = ((thisWeekXp - lastWeekXp) / lastWeekXp * 100).toFixed(1);
    evolutionXpEl.textContent = xpPercent > 0 ? `+${xpPercent}%` : `${xpPercent}%`;
    evolutionXpEl.className = `time-stat-value evolution ${xpPercent >= 0 ? 'positive' : 'negative'}`;
  } else {
    evolutionXpEl.textContent = '-';
    evolutionXpEl.className = 'time-stat-value evolution neutral';
  }
  
  // Tendance générale
  if (thisWeekHonor > lastWeekHonor && thisWeekXp > lastWeekXp) {
    evolutionTrendEl.textContent = '📈 ' + (typeof window.i18nT === 'function' ? window.i18nT('evolution_trend_up') : 'En hausse');
    evolutionTrendEl.className = 'time-stat-value evolution positive';
  } else if (thisWeekHonor < lastWeekHonor && thisWeekXp < lastWeekXp) {
    evolutionTrendEl.textContent = '📉 ' + (typeof window.i18nT === 'function' ? window.i18nT('evolution_trend_down') : 'En baisse');
    evolutionTrendEl.className = 'time-stat-value evolution negative';
  } else {
    evolutionTrendEl.textContent = '➡️ ' + (typeof window.i18nT === 'function' ? window.i18nT('evolution_trend_stable') : 'Stable');
    evolutionTrendEl.className = 'time-stat-value evolution neutral';
  }
}

/**
 * Afficher les détails de la meilleure session dans un modal
 */
function showBestSessionDetails(session, previousSession, honorGain, xpGain, rankGain) {
  const date = new Date(session.timestamp).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const sr = typeof session.currentRank === 'string' && session.currentRank.startsWith('rank_') ? (RANK_KEY_TO_RANK_NAME[session.currentRank] || session.currentRank) : session.currentRank;
  const rankData = RANKS_DATA.find(r => r.name === sr || r.rank === sr);
  
  // Créer le modal
  const existingModal = document.getElementById('bestSessionModal');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'bestSessionModal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 450px;">
      <div class="modal-header">
        <h2>🏆 ${typeof window.i18nT === 'function' ? window.i18nT('progression_best_session_title') : 'Meilleure session'}</h2>
        <button class="modal-close" onclick="document.getElementById('bestSessionModal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="text-align: center; margin-bottom: 20px;">
          <div class="grade-block" style="margin: 0 auto 10px;">
            <div class="grade-block-name">${session.currentRank}</div>
            <div class="grade-block-icon">
              ${rankData ? `<img src="${rankData.img}" alt="${session.currentRank}" class="grade-block-img">` : ''}
            </div>
          </div>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">${date}</p>
        </div>
        
        <div class="progression-section-card" style="margin: 0;">
          <div class="section-header">
            <h3>📊 ${typeof window.i18nT === 'function' ? window.i18nT('progression_gains_this_session') : 'Gains de cette session'}</h3>
          </div>
          <div class="stat-row">
            <span class="stat-label">🏆 ${typeof window.i18nT === 'function' ? window.i18nT('honor') : 'Honneur'}</span>
            <span class="stat-value gain">+${formatNumberDisplay(honorGain)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">⭐ ${typeof window.i18nT === 'function' ? window.i18nT('xp') : 'XP'}</span>
            <span class="stat-value gain">+${formatNumberDisplay(xpGain)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">📊 ${typeof window.i18nT === 'function' ? window.i18nT('points_grade') : 'Points grade'}</span>
            <span class="stat-value gain">+${formatNumberDisplay(rankGain)}</span>
          </div>
        </div>
        
        ${session.note ? `
          <div style="margin-top: 15px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
            <strong>📝 ${typeof window.i18nT === 'function' ? window.i18nT('progression_note_label') : 'Note :'}</strong>
            <p style="margin: 5px 0 0; color: var(--text-secondary);">${session.note}</p>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="modal-btn cancel" onclick="document.getElementById('bestSessionModal').remove()">${typeof window.i18nT === 'function' ? window.i18nT('close') : 'Fermer'}</button>
        <button class="modal-btn submit" onclick="loadSession(${typeof attrSessionId === 'function' ? attrSessionId(session.id) : JSON.stringify(String(session.id))}); document.getElementById('bestSessionModal').remove();">
          📥 ${typeof window.i18nT === 'function' ? window.i18nT('progression_load_session') : 'Charger cette session'}
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Fermer en cliquant en dehors
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

