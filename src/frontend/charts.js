// ==========================================
// MODULE: CHART MANAGEMENT
// ==========================================

let progressCharts = [];

function createProgressChart(sessions) {
  const honorCanvas = document.getElementById('honorChart');
  const xpCanvas = document.getElementById('xpChart');
  const rankCanvas = document.getElementById('rankChart');
  if (!honorCanvas || !xpCanvas || !rankCanvas) return;
  
  // Détruire les graphiques existants
  if (progressCharts.length) {
    progressCharts.forEach(chart => chart.destroy());
  }
  progressCharts = [];
  
  const labels = sessions.map(s => new Date(s.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
  const honorData = sessions.map(s => s.honor);
  const xpData = sessions.map(s => s.xp);
  const rankData = sessions.map(s => s.rankPoints);
  
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#cbd5e1' : '#334155';
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  
  progressCharts.push(
    createLineChart(honorCanvas, labels, honorData, 'Points d\'honneur', '#38bdf8', textColor, gridColor)
  );
  progressCharts.push(
    createLineChart(xpCanvas, labels, xpData, 'Points d\'XP', '#22c55e', textColor, gridColor)
  );
  progressCharts.push(
    createLineChart(rankCanvas, labels, rankData, 'Points de grade', '#f59e0b', textColor, gridColor)
  );
}

// Fonction pour mettre à jour le graphique lors du changement de thème
function refreshChartColors() {
  if (progressCharts.length) {
    const sessions = getSessions();
    if (sessions.length >= 2) {
      const sortedSessions = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
      createProgressChart(sortedSessions);
    }
  }
}

function createLineChart(canvas, labels, data, label, color, textColor, gridColor) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: label,
          data: data,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.1),
          tension: 0.35,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.parsed.y || 0;
              return `${label}: ${formatChartNumber(value)}`;
            }
          }
        }
      },
      scales: {
        y: {
          ticks: {
            color: textColor,
            callback: function(value) {
              return formatChartNumber(value);
            }
          },
          grid: {
            color: gridColor
          }
        },
        x: {
          ticks: {
            color: textColor
          },
          grid: {
            color: gridColor
          }
        }
      }
    }
  });
}

function formatChartNumber(value) {
  const abs = Math.abs(Math.round(value || 0));
  if (abs >= 10000000) {
    return abs.toLocaleString('en-US');
  }
  const padded = String(abs).padStart(8, '0');
  return padded.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function hexToRgba(hex, alpha) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

console.log('📊 Module Chart chargé');