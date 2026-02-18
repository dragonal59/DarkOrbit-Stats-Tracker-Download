// ==========================================
// CORRECTIFS TIMER — ARCHIVÉ
// Logique visibility/cleanup possiblement intégrée dans backend/timer.js. Jamais chargé.
// ==========================================

let timerInterval = null;
let isPageVisible = true;

document.addEventListener('visibilitychange', function() {
  isPageVisible = !document.hidden;
  if (isPageVisible) {
    if (!timerInterval) {
      updateSessionTimer();
      timerInterval = setInterval(updateSessionTimer, CONFIG.UI.TIMER_UPDATE_INTERVAL);
    }
  } else {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
});

function updateSessionTimer() {
  if (!isPageVisible) return;
  // ... (reste du code timer)
}

function startSessionTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  updateSessionTimer();
  if (isPageVisible) timerInterval = setInterval(updateSessionTimer, CONFIG.UI.TIMER_UPDATE_INTERVAL);
}

function stopSessionTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

window.addEventListener('beforeunload', () => stopSessionTimer());
