// ==========================================
// MODULE: PROGRESSION TAB
// ==========================================

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
            <h3>⚡ Gains du jour</h3>
          </div>
          <p class="empty-message">Sauvegardez une session pour voir vos gains</p>
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

  // Gains du jour : référence = session précédente (baseline ou dernière enregistrée)
  const getRef = (typeof window !== 'undefined' && window.getReferenceSession) || (typeof getReferenceSession === 'function' ? getReferenceSession : null);
  const calcGains = (typeof window !== 'undefined' && window.calculateGains) || (typeof calculateGains === 'function' ? calculateGains : null);
  const reference = getRef ? getRef(sessions) : { session: null, label: '-', isBaseline: false };
  const latestSession = sortedSessions[sortedSessions.length - 1];
  const gainsData = calcGains ? calcGains(latestSession, reference) : { honor: 0, xp: 0, rankPoints: 0, honorGain: 0, xpGain: 0, rankPointsGain: 0, comparedTo: '-' };
  const isFirst = (reference && reference.isBaseline) || gainsData.comparedTo === 'Point de départ' || gainsData.comparedTo === 'Seuil enregistré';
  const currentSessionData = { ...gainsData, isFirstSession: isFirst };

  // Cas 1 seule session : afficher uniquement la carte Gains du jour
  if (sessions.length === 1) {
    const badgeLabel = currentSessionData.comparedTo;
    progressionContent.innerHTML = `
      <div class="progression-section-card current-session-card">
        <div class="section-header">
          <h3>⚡ Gains du jour</h3>
          <span class="time-badge">${badgeLabel}</span>
        </div>
        <div class="current-session-stats">
          <div class="current-stat">
            <span class="current-stat-icon">🏆</span>
            <div class="current-stat-info">
              <span class="current-stat-label">Honneur</span>
              <span class="current-stat-value ${getGainClass(currentSessionData.honorGain)}">
                ${formatSignedGain(currentSessionData.honorGain)}
              </span>
            </div>
          </div>
          <div class="current-stat">
            <span class="current-stat-icon">⭐</span>
            <div class="current-stat-info">
              <span class="current-stat-label">XP</span>
              <span class="current-stat-value ${getGainClass(currentSessionData.xpGain)}">
                ${formatSignedGain(currentSessionData.xpGain)}
              </span>
            </div>
          </div>
          <div class="current-stat">
            <span class="current-stat-icon">📊</span>
            <div class="current-stat-info">
              <span class="current-stat-label">Points grade</span>
              <span class="current-stat-value ${getGainClass(currentSessionData.rankPointsGain)}">
                ${formatSignedGain(currentSessionData.rankPointsGain)}
              </span>
            </div>
          </div>
        </div>
        ${currentSessionData.isFirstSession ? `
          <div class="current-session-tip">
            🎉 Première session enregistrée ! C'est votre point de départ.
          </div>
        ` : ''}
      </div>
    `;
    advancedStats.style.display = 'none';
    comparisonSection.style.display = 'none';
    predictionsSection.style.display = 'none';
    timeComparisonSection.style.display = 'none';
    document.getElementById('chartContainer').style.display = 'none';
    return;
  }

  document.getElementById('chartContainer').style.display = 'block';
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
  const totalRankGain = latest.rankPoints - oldest.rankPoints;

  const refForPrevious = beforePrevious || (oldest.is_baseline ? oldest : null);
  const lastSessionHonorGain = previous && refForPrevious ? previous.honor - refForPrevious.honor : 0;
  const lastSessionXpGain = previous && refForPrevious ? previous.xp - refForPrevious.xp : 0;
  const lastSessionRankGain = previous && refForPrevious ? previous.rankPoints - refForPrevious.rankPoints : 0;
  const lastSessionDate = previous ? previous.timestamp : null;

  const avgHonorPerSession = totalHonorGain / (sessions.length - 1);
  const avgXpPerSession = totalXpGain / (sessions.length - 1);
  const avgRankPerSession = totalRankGain / (sessions.length - 1);
  const daysDiff = Math.max(1, Math.ceil((latest.timestamp - oldest.timestamp) / (1000 * 60 * 60 * 24)));
  const avgXpPerDay = totalXpGain / daysDiff;
  const avgRankPerDay = totalRankGain / daysDiff;
  
  // Trouver la meilleure session
  let bestSession = null;
  let bestSessionPrevious = null;
  let bestGain = 0;
  
  for (let i = 1; i < sortedSessions.length; i++) {
    const gain = (sortedSessions[i].honor - sortedSessions[i-1].honor) + 
                 (sortedSessions[i].xp - sortedSessions[i-1].xp) +
                 (sortedSessions[i].rankPoints - sortedSessions[i-1].rankPoints);
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
  const honorAvg = formatAvgStat(avgHonorPerSession);
  const xpAvg = formatAvgStat(avgXpPerSession);
  const rankAvg = formatAvgStat(avgRankPerSession);
  const avgHonorEl = document.getElementById('avgHonorPerDay');
  const avgXpEl = document.getElementById('avgXpPerDay');
  const avgRankEl = document.getElementById('avgRankPerDay');
  if (avgHonorEl) { avgHonorEl.textContent = honorAvg.text; avgHonorEl.className = 'advanced-stat-value' + (honorAvg.isNeg ? ' stat-negative' : ''); }
  if (avgXpEl) { avgXpEl.textContent = xpAvg.text; avgXpEl.className = 'advanced-stat-value' + (xpAvg.isNeg ? ' stat-negative' : ''); }
  if (avgRankEl) { avgRankEl.textContent = rankAvg.text; avgRankEl.className = 'advanced-stat-value' + (rankAvg.isNeg ? ' stat-negative' : ''); }
  
  if (bestSession) {
    const bestDate = new Date(bestSession.timestamp).toLocaleDateString('fr-FR');
    const bestRankData = RANKS_DATA.find(r => r.name === bestSession.currentRank);
    
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
    const bestRankGain = bestSession.rankPoints - bestSessionPrevious.rankPoints;
    
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
  const gainsBadge = currentSessionData.comparedTo;
  const currentSessionHtml = currentSessionData ? `
    <div class="progression-section-card current-session-card">
      <div class="section-header">
        <h3>⚡ Gains du jour</h3>
        <span class="time-badge">${gainsBadge}</span>
      </div>
      <div class="current-session-stats">
        <div class="current-stat">
          <span class="current-stat-icon">🏆</span>
          <div class="current-stat-info">
            <span class="current-stat-label">Honneur</span>
            <span class="current-stat-value ${getGainClass(currentSessionData.honorGain)}">
              ${formatSignedGain(currentSessionData.honorGain)}
            </span>
          </div>
        </div>
        <div class="current-stat">
          <span class="current-stat-icon">⭐</span>
          <div class="current-stat-info">
            <span class="current-stat-label">XP</span>
            <span class="current-stat-value ${getGainClass(currentSessionData.xpGain)}">
              ${formatSignedGain(currentSessionData.xpGain)}
            </span>
          </div>
        </div>
        <div class="current-stat">
          <span class="current-stat-icon">📊</span>
          <div class="current-stat-info">
            <span class="current-stat-label">Points grade</span>
            <span class="current-stat-value ${getGainClass(currentSessionData.rankPointsGain)}">
              ${formatSignedGain(currentSessionData.rankPointsGain)}
            </span>
          </div>
        </div>
      </div>
      ${currentSessionData.isFirstSession ? `
        <div class="current-session-tip">
          🎉 Première session enregistrée ! C'est votre point de départ.
        </div>
      ` : (currentSessionData.honorGain > 0 || currentSessionData.xpGain > 0 ? `
        <div class="current-session-tip">
          💡 N'oubliez pas de sauvegarder votre session !
        </div>
      ` : '')}
    </div>
  ` : `
    <div class="progression-section-card current-session-card empty">
      <div class="section-header">
        <h3>⚡ Gains du jour</h3>
      </div>
      <p class="empty-message">Entrez vos stats actuelles pour voir vos gains</p>
    </div>
  `;
  
  // Données de grade pour les images
  const latestRankData = RANKS_DATA.find(r => r.name === latest.currentRank);
  const previousRankData = RANKS_DATA.find(r => r.name === previous.currentRank);
  const oldestRankData = RANKS_DATA.find(r => r.name === oldest.currentRank);
  
  progressionContent.innerHTML = `
    ${currentSessionHtml}
    
    <div class="progression-grid">
      <div class="progression-section-card">
        <div class="section-header">
          <h3>📅 Session précédente</h3>
          <span class="date-badge">${lastSessionDate ? new Date(lastSessionDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '-'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">🏆 Honneur</span>
          <span class="stat-value ${getGainClass(lastSessionHonorGain)}">
            ${formatSignedGain(lastSessionHonorGain)}
          </span>
        </div>
        <div class="stat-row">
          <span class="stat-label">⭐ XP</span>
          <span class="stat-value ${getGainClass(lastSessionXpGain)}">
            ${formatSignedGain(lastSessionXpGain)}
          </span>
        </div>
        <div class="stat-row">
          <span class="stat-label">📊 Points grade</span>
          <span class="stat-value ${getGainClass(lastSessionRankGain)}">
            ${formatSignedGain(lastSessionRankGain)}
          </span>
        </div>
      </div>
      
      <div class="progression-section-card">
        <div class="section-header">
          <h3>📊 Moyennes / session</h3>
          <span class="date-badge">${sessions.length} sessions</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">🏆 Honneur</span>
          <span class="stat-value gain">+${formatNumberCompact(avgHonorPerSession)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">⭐ XP</span>
          <span class="stat-value gain">+${formatNumberCompact(avgXpPerSession)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">📊 Points grade</span>
          <span class="stat-value gain">+${formatNumberCompact(avgRankPerSession)}</span>
        </div>
      </div>
    </div>
    
    <div class="progression-section-card progression-total">
      <div class="section-header">
        <h3>🎯 Progression totale</h3>
        <span class="period-badge">${daysDiff} jour${daysDiff > 1 ? 's' : ''} • ${sessions.length} sessions</span>
      </div>
      
      <div class="total-stats-grid">
        <div class="total-stat">
          <span class="total-stat-label">🏆 Honneur gagné</span>
          <span class="total-stat-value ${totalHonorGain >= 0 ? 'gain' : 'loss'}">
            ${totalHonorGain >= 0 ? '+' : ''}${formatNumberDisplay(totalHonorGain)}
          </span>
        </div>
        <div class="total-stat">
          <span class="total-stat-label">⭐ XP gagnée</span>
          <span class="total-stat-value ${totalXpGain >= 0 ? 'gain' : 'loss'}">
            ${totalXpGain >= 0 ? '+' : ''}${formatNumberDisplay(totalXpGain)}
          </span>
        </div>
        <div class="total-stat">
          <span class="total-stat-label">📊 Points grade</span>
          <span class="total-stat-value ${totalRankGain >= 0 ? 'gain' : 'loss'}">
            ${totalRankGain >= 0 ? '+' : ''}${formatNumberDisplay(totalRankGain)}
          </span>
        </div>
      </div>
      
      <div class="grade-evolution">
        <div class="grade-item">
          <span class="grade-label">Début</span>
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
          <span class="grade-label">Actuel</span>
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

/**
 * Formater un nombre de façon compacte (1.5M, 250K, etc.)
 */
function formatNumberCompact(num) {
  const absNum = Math.abs(num);
  if (absNum >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (absNum >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (absNum >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return Math.round(num).toLocaleString("en-US");
}

/**
 * Formater un nombre avec séparateurs en virgules
 */
function formatNumberDisplay(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Formater un gain avec signe (sans +0)
 */
function formatSignedGain(num) {
  if (num < 0) return `-${formatNumberDisplay(Math.abs(num))}`;
  return `+${formatNumberDisplay(num)}`;
}

function getGainClass(num) {
  if (num > 0) return 'gain';
  if (num < 0) return 'loss';
  return 'neutral';
}

/**
 * Formater le temps écoulé depuis une durée en ms
 */
function formatTimeSince(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `il y a ${days}j ${hours % 24}h`;
  }
  if (hours > 0) {
    return `il y a ${hours}h ${minutes % 60}min`;
  }
  if (minutes > 0) {
    return `il y a ${minutes} min`;
  }
  return `à l'instant`;
}

function updatePredictions(latestSession, avgXpPerDay, avgRankPerDay) {
  // Prédiction pour le prochain niveau
  const currentLevel = getCurrentLevel(latestSession.xp);
  const nextLevelData = getNextLevel(latestSession.xp);
  
  if (nextLevelData && avgXpPerDay > 0) {
    const xpNeeded = nextLevelData.xp - latestSession.xp;
    const daysToNextLevel = Math.ceil(xpNeeded / avgXpPerDay);
    
    document.getElementById('predictionNextLevel').textContent = `Niveau ${nextLevelData.level}`;
    document.getElementById('predictionNextLevelDays').textContent = 
      daysToNextLevel === 1 
        ? `Dans environ 1 jour` 
        : `Dans environ ${daysToNextLevel} jours`;
  } else if (!nextLevelData) {
    document.getElementById('predictionNextLevel').textContent = 'Niveau max';
    document.getElementById('predictionNextLevelDays').textContent = '🎉 Niveau maximum atteint !';
  } else {
    document.getElementById('predictionNextLevel').textContent = '-';
    document.getElementById('predictionNextLevelDays').textContent = 'Pas assez de données';
  }
  
  // Prédiction pour le prochain grade - avec IMAGE PLUS GRANDE
  const currentRankData = RANKS_DATA.find(r => r.name === latestSession.currentRank);
  if (currentRankData) {
    const currentRankIndex = RANKS_DATA.indexOf(currentRankData);
    
    if (currentRankIndex < RANKS_DATA.length - 1 && avgRankPerDay > 0) {
      const nextRankData = RANKS_DATA[currentRankIndex + 1];
      const rankPointsNeeded = (latestSession.nextRankPoints || nextRankData.rankPoints) - latestSession.rankPoints;
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
          ? `Dans environ 1 jour` 
          : `Dans environ ${daysToNextRank} jours`;
    } else if (currentRankIndex === RANKS_DATA.length - 1) {
      document.getElementById('predictionNextRank').textContent = 'Grade max';
      document.getElementById('predictionNextRankDays').textContent = '🎉 Grade maximum atteint !';
    } else {
      document.getElementById('predictionNextRank').textContent = '-';
      document.getElementById('predictionNextRankDays').textContent = 'Pas assez de données';
    }
  }
}

function updateTimeComparison(sortedSessions) {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  
  // Sessions de cette semaine
  const thisWeekSessions = sortedSessions.filter(s => new Date(s.timestamp) >= oneWeekAgo);
  
  // Sessions de la semaine dernière
  const lastWeekSessions = sortedSessions.filter(s => {
    const sessionDate = new Date(s.timestamp);
    return sessionDate >= twoWeeksAgo && sessionDate < oneWeekAgo;
  });
  
  // Calculer les gains de cette semaine
  let thisWeekHonor = 0;
  let thisWeekXp = 0;
  
  if (thisWeekSessions.length > 1) {
    thisWeekHonor = thisWeekSessions[thisWeekSessions.length - 1].honor - thisWeekSessions[0].honor;
    thisWeekXp = thisWeekSessions[thisWeekSessions.length - 1].xp - thisWeekSessions[0].xp;
  }
  
  // Calculer les gains de la semaine dernière
  let lastWeekHonor = 0;
  let lastWeekXp = 0;
  
  if (lastWeekSessions.length > 1) {
    lastWeekHonor = lastWeekSessions[lastWeekSessions.length - 1].honor - lastWeekSessions[0].honor;
    lastWeekXp = lastWeekSessions[lastWeekSessions.length - 1].xp - lastWeekSessions[0].xp;
  }
  
  // Afficher cette semaine
  document.getElementById('thisWeekHonor').textContent = thisWeekHonor > 0 ? `+${thisWeekHonor.toLocaleString("en-US")}` : '-';
  document.getElementById('thisWeekXp').textContent = thisWeekXp > 0 ? `+${thisWeekXp.toLocaleString("en-US")}` : '-';
  document.getElementById('thisWeekSessions').textContent = thisWeekSessions.length;
  
  // Afficher semaine dernière
  document.getElementById('lastWeekHonor').textContent = lastWeekHonor > 0 ? `+${lastWeekHonor.toLocaleString("en-US")}` : '-';
  document.getElementById('lastWeekXp').textContent = lastWeekXp > 0 ? `+${lastWeekXp.toLocaleString("en-US")}` : '-';
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
    evolutionTrendEl.textContent = '📈 En hausse';
    evolutionTrendEl.className = 'time-stat-value evolution positive';
  } else if (thisWeekHonor < lastWeekHonor && thisWeekXp < lastWeekXp) {
    evolutionTrendEl.textContent = '📉 En baisse';
    evolutionTrendEl.className = 'time-stat-value evolution negative';
  } else {
    evolutionTrendEl.textContent = '➡️ Stable';
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
  
  const rankData = RANKS_DATA.find(r => r.name === session.currentRank);
  
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
        <h2>🏆 Meilleure session</h2>
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
            <h3>📊 Gains de cette session</h3>
          </div>
          <div class="stat-row">
            <span class="stat-label">🏆 Honneur</span>
            <span class="stat-value gain">+${formatNumberDisplay(honorGain)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">⭐ XP</span>
            <span class="stat-value gain">+${formatNumberDisplay(xpGain)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">📊 Points grade</span>
            <span class="stat-value gain">+${formatNumberDisplay(rankGain)}</span>
          </div>
        </div>
        
        ${session.note ? `
          <div style="margin-top: 15px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px;">
            <strong>📝 Note :</strong>
            <p style="margin: 5px 0 0; color: var(--text-secondary);">${session.note}</p>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="modal-btn cancel" onclick="document.getElementById('bestSessionModal').remove()">Fermer</button>
        <button class="modal-btn submit" onclick="loadSession(${session.id}); document.getElementById('bestSessionModal').remove();">
          📥 Charger cette session
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

console.log('📈 Module Progression chargé');