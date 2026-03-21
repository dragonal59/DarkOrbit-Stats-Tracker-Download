// ==========================================
// MODULE: SESSION TIMER (24H) - OPTIMIZED
// ==========================================

let timerInterval = null;
let isPageVisible = true;
// Cache sessions + cadence refresh (30s)
let lastSessionsRefresh = 0;
let cachedSessions = [];
let cachedTodaySession = null;
const SESSIONS_REFRESH_INTERVAL = 30000;

// Détecter quand la page devient visible/invisible
document.addEventListener('visibilitychange', function() {
  isPageVisible = !document.hidden;
  
  if (isPageVisible) {
    // Page visible: relancer timer si pas actif
    if (!timerInterval) {
      updateSessionTimer();
      timerInterval = setInterval(updateSessionTimer, CONFIG.UI.TIMER_UPDATE_INTERVAL);
    }
  } else {
    // Page cachée: stopper timer (économie CPU)
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
});

function updateSessionTimer() {
  // Double sécurité: ne pas update si page invisible
  if (!isPageVisible) return;
  
  const timerElement = document.getElementById('sessionTimer');
  if (!timerElement) return;

  const nowTs = Date.now();
  const timerValue = document.getElementById('timerValue');
  const timerDetail = document.getElementById('timerDetail');
  
  if (nowTs - lastSessionsRefresh >= SESSIONS_REFRESH_INTERVAL || !cachedSessions.length) {
    cachedSessions = getSessions();
    lastSessionsRefresh = nowTs;
    
    // Trouver la session d'aujourd'hui
    const today = new Date().toLocaleDateString('fr-FR');
    cachedTodaySession = cachedSessions.find(s => {
      const sessionDate = new Date(s.timestamp).toLocaleDateString('fr-FR');
      return sessionDate === today;
    }) || null;
  }
  
  if (cachedSessions.length === 0 || !cachedTodaySession) {
    timerElement.style.display = 'none';
    return;
  }
  
  timerElement.style.display = 'flex';
  
  // Calculer depuis minuit
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  
  const nextMidnight = new Date(midnight);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  
  const elapsed = now - midnight;
  const remaining = nextMidnight - now;
  
  // Calculer les heures, minutes et secondes écoulées depuis minuit
  const hoursElapsed = Math.floor(elapsed / (1000 * 60 * 60));
  const minutesElapsed = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
  const secondsElapsed = Math.floor((elapsed % (1000 * 60)) / 1000);
  
  // Calculer les heures restantes jusqu'à minuit
  const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
  
  // Afficher le temps écoulé depuis minuit
  if (hoursElapsed > 0) {
    timerValue.textContent = `${hoursElapsed}h ${minutesElapsed}min ${secondsElapsed}s`;
  } else {
    timerValue.textContent = `${minutesElapsed}min ${secondsElapsed}s`;
  }
  
  // Message détaillé
  const sessionStartTime = new Date(cachedTodaySession.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  
  if (hoursRemaining < 1) {
    timerDetail.textContent = `⚠️ Moins d'une heure avant minuit ! (Session enregistrée à ${sessionStartTime})`;
    timerDetail.className = 'timer-detail warning';
  } else if (hoursRemaining < 6) {
    timerDetail.textContent = `Plus que ${hoursRemaining}h avant minuit (Session enregistrée à ${sessionStartTime})`;
    timerDetail.className = 'timer-detail warning';
  } else {
    timerDetail.textContent = `Session active depuis minuit - Temps écoulé : ${hoursElapsed}h ${minutesElapsed}min (Enregistrée à ${sessionStartTime})`;
    timerDetail.className = 'timer-detail';
  }
}

function startSessionTimer() {
  // Arrêter timer existant avant d'en créer un nouveau
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  // Mettre à jour immédiatement
  updateSessionTimer();
  
  // Créer timer seulement si page visible
  if (isPageVisible) {
    timerInterval = setInterval(updateSessionTimer, CONFIG.UI.TIMER_UPDATE_INTERVAL);
  }
}

function stopSessionTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Cleanup au déchargement de la page
window.addEventListener('beforeunload', () => {
  stopSessionTimer();
});

