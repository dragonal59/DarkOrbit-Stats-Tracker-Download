// ==========================================
// MODULE: CHART MANAGEMENT — ARCHIVÉ
// Remplacé par frontend/charts.js (multi-graphiques). Ancienne version (un seul canvas progressChart).
// ==========================================

let progressChart = null;

function createProgressChart(sessions) {
  const ctx = document.getElementById('progressChart');
  if (!ctx) return;
  if (progressChart) progressChart.destroy();
  const labels = sessions.map(s => new Date(s.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
  const honorData = sessions.map(s => s.honor);
  const xpData = sessions.map(s => s.xp / 2);
  const rankData = sessions.map(s => s.rankPoints * 50);
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#cbd5e1' : '#334155';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  progressChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Points d\'honneur', data: honorData, borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', tension: 0.4, fill: true },
      { label: 'Points d\'XP (÷2)', data: xpData, borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', tension: 0.4, fill: true },
      { label: 'Points de grade (×50)', data: rankData, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', tension: 0.4, fill: true }
    ]},
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: textColor } } }, scales: { y: { ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { color: gridColor } } } }
  });
}

function refreshChartColors() {
  if (progressChart && typeof getSessions === 'function') {
    const sessions = getSessions();
    if (sessions.length >= 2) createProgressChart([...sessions].sort((a, b) => a.timestamp - b.timestamp));
  }
}
