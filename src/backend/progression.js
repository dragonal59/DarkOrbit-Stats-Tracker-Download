// ==========================================
// ONGLET PROGRESSION — métriques depuis les sessions (hors baseline)
// ==========================================

(function () {
  'use strict';

  var PERIOD_KEYS = ['24h', '7d', '30d'];
  var PERIOD_MS = { '24h': 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000 };
  var PERIOD_DAYS = { '24h': 1, '7d': 7, '30d': 30 };

  window._progressionPeriod = window._progressionPeriod || '30d';
  var _chartInstance = null;

  function T(key) {
    if (typeof window.i18nT === 'function') return window.i18nT(key);
    return key;
  }

  function escapeHtml(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function getRawSessions() {
    if (typeof getSessions !== 'function') return [];
    var list = getSessions() || [];
    return Array.isArray(list) ? list.slice() : [];
  }

  /** Sessions utilisées pour la progression : sans baseline, tri chronologique */
  function getProgressionSessions() {
    return getRawSessions()
      .filter(function (s) { return s && !s.is_baseline; })
      .sort(function (a, b) {
        var ta = Number(a.timestamp) || 0;
        var tb = Number(b.timestamp) || 0;
        if (ta !== tb) return ta - tb;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
  }

  function windowBounds(periodKey) {
    var now = Date.now();
    var ms = PERIOD_MS[periodKey] || PERIOD_MS['7d'];
    return { start: now - ms, end: now };
  }

  function prevWindowBounds(periodKey) {
    var now = Date.now();
    var ms = PERIOD_MS[periodKey] || PERIOD_MS['7d'];
    return { start: now - 2 * ms, end: now - ms };
  }

  function inWindow(s, start, end) {
    var t = Number(s.timestamp) || 0;
    return t >= start && t <= end;
  }

  /**
   * Delta net sur la fenêtre : dernier − premier dans la fenêtre ;
   * si une seule session : dernier − session chronologique précédente hors fenêtre si elle existe.
   */
  function computeWindowDelta(sorted, winStart, winEnd) {
    var inside = sorted.filter(function (s) { return inWindow(s, winStart, winEnd); });
    if (inside.length === 0) {
      return { honor: null, xp: null, rankPoints: null, count: 0 };
    }
    if (inside.length >= 2) {
      var first = inside[0];
      var last = inside[inside.length - 1];
      return {
        honor: Number(last.honor) - Number(first.honor),
        xp: Number(last.xp) - Number(first.xp),
        rankPoints: Number(last.rankPoints) - Number(first.rankPoints),
        count: inside.length
      };
    }
    var only = inside[0];
    var before = null;
    for (var i = sorted.length - 1; i >= 0; i--) {
      if (Number(sorted[i].timestamp) < winStart) {
        before = sorted[i];
        break;
      }
    }
    if (before) {
      return {
        honor: Number(only.honor) - Number(before.honor),
        xp: Number(only.xp) - Number(before.xp),
        rankPoints: Number(only.rankPoints) - Number(before.rankPoints),
        count: 1
      };
    }
    return {
      honor: 0,
      xp: 0,
      rankPoints: 0,
      count: 1
    };
  }

  function fmtSigned(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    var v = Number(n);
    var s = (typeof formatNumberDisplay === 'function') ? formatNumberDisplay(Math.abs(v)) : String(Math.round(Math.abs(v)));
    return (v >= 0 ? '+' : '−') + s;
  }

  function fmtNum(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return typeof formatNumberDisplay === 'function' ? formatNumberDisplay(Number(n)) : String(Math.round(Number(n)));
  }

  function destroyChart() {
    if (_chartInstance && typeof _chartInstance.destroy === 'function') {
      try { _chartInstance.destroy(); } catch (_e) {}
    }
    _chartInstance = null;
  }

  function buildChartPoints(periodKey, sorted, winStart, winEnd) {
    var inside = sorted.filter(function (s) { return inWindow(s, winStart, winEnd); });
    if (inside.length === 0) return { labels: [], honor: [], xp: [] };

    if (periodKey === '24h') {
      var labels = [];
      var h = [];
      var x = [];
      inside.forEach(function (s) {
        var d = new Date(Number(s.timestamp));
        labels.push(d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }));
        h.push(Number(s.honor));
        x.push(Number(s.xp));
      });
      return { labels: labels, honor: h, xp: x };
    }

    var byDay = {};
    inside.forEach(function (s) {
      var d = new Date(Number(s.timestamp));
      if (Number.isNaN(d.getTime())) return;
      var key =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      if (!byDay[key] || Number(s.timestamp) > Number(byDay[key].ts)) {
        byDay[key] = { honor: Number(s.honor), xp: Number(s.xp), ts: Number(s.timestamp) };
      }
    });
    var keys = Object.keys(byDay).sort();
    var labels2 = keys.map(function (k) {
      var parts = k.split('-');
      return parts[2] + '/' + parts[1];
    });
    var h2 = keys.map(function (k) { return byDay[k].honor; });
    var x2 = keys.map(function (k) { return byDay[k].xp; });
    return { labels: labels2, honor: h2, xp: x2 };
  }

  function bestSessionInWindow(sorted, winStart, winEnd) {
    var inside = sorted.filter(function (s) { return inWindow(s, winStart, winEnd); });
    if (inside.length === 0) return null;
    var best = null;
    var bestScore = -Infinity;
    for (var j = 0; j < inside.length; j++) {
      var s = inside[j];
      var pos = -1;
      for (var k = 0; k < sorted.length; k++) {
        if (sorted[k] === s) {
          pos = k;
          break;
        }
      }
      var prev = pos > 0 ? sorted[pos - 1] : null;
      var gh = prev ? Number(s.honor) - Number(prev.honor) : 0;
      var gx = prev ? Number(s.xp) - Number(prev.xp) : 0;
      var score = Math.max(gh, gx);
      if (score > bestScore) {
        bestScore = score;
        best = { session: s, gainHonor: gh, gainXp: gx, prev: prev };
      }
    }
    return best;
  }

  function renderProgression() {
    var wrap = document.getElementById('progression-main');
    var emptyEl = document.getElementById('progression-empty');
    var freeHint = document.getElementById('progression-free-hint');
    var tilesEl = document.getElementById('progressionTiles');
    var avgEl = document.getElementById('progressionAvg');
    var projEl = document.getElementById('progressionProjection');
    var bestEl = document.getElementById('progressionBest');
    var vsEl = document.getElementById('progressionVs');
    if (!tilesEl) return;

    var badge = (typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE') || 'FREE';
    var sorted = getProgressionSessions();
    var periodKey = window._progressionPeriod || '30d';
    if (PERIOD_KEYS.indexOf(periodKey) === -1) periodKey = '30d';

    document.querySelectorAll('.progression-period-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-period') === periodKey);
    });

    if (freeHint) {
      if (badge === 'FREE') {
        freeHint.style.display = '';
        freeHint.textContent = T('progression_free_hint');
      } else {
        freeHint.style.display = 'none';
      }
    }

    if (sorted.length === 0) {
      if (wrap) wrap.style.display = 'none';
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.innerHTML =
          '<div class="progression-empty-icon">📉</div>' +
          '<p>' + escapeHtml(T('progression_empty')) + '</p>';
      }
      destroyChart();
      return;
    }

    if (wrap) wrap.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';

    var wb = windowBounds(periodKey);
    var delta = computeWindowDelta(sorted, wb.start, wb.end);
    var days = PERIOD_DAYS[periodKey] || 30;

    var avgH = delta.honor != null && Number.isFinite(delta.honor) ? delta.honor / days : null;
    var avgX = delta.xp != null && Number.isFinite(delta.xp) ? delta.xp / days : null;

    tilesEl.innerHTML =
      '<div class="progression-tile"><span class="progression-tile-label">' +
      escapeHtml(T('progression_tile_honor')) +
      '</span><span class="progression-tile-value">' +
      fmtSigned(delta.honor) +
      '</span></div>' +
      '<div class="progression-tile"><span class="progression-tile-label">' +
      escapeHtml(T('progression_tile_xp')) +
      '</span><span class="progression-tile-value">' +
      fmtSigned(delta.xp) +
      '</span></div>' +
      '<div class="progression-tile"><span class="progression-tile-label">' +
      escapeHtml(T('progression_tile_rp')) +
      '</span><span class="progression-tile-value">' +
      fmtSigned(delta.rankPoints) +
      '</span></div>' +
      '<div class="progression-tile"><span class="progression-tile-label">' +
      escapeHtml(T('progression_tile_sessions')) +
      '</span><span class="progression-tile-value">' +
      String(delta.count) +
      '</span></div>';

    if (avgEl) {
      avgEl.innerHTML =
        escapeHtml(T('progression_avg_daily')) +
        ' <strong>' +
        fmtSigned(avgH) +
        '</strong> ' +
        escapeHtml(T('progression_avg_honor_suffix')) +
        ', <strong>' +
        fmtSigned(avgX) +
        '</strong> ' +
        escapeHtml(T('progression_avg_xp_suffix')) +
        '';
    }

    var lastSession = sorted[sorted.length - 1];
    var nrp = lastSession && lastSession.nextRankPoints != null ? Number(lastSession.nextRankPoints) : NaN;
    var rp = lastSession && lastSession.rankPoints != null ? Number(lastSession.rankPoints) : NaN;
    var remaining = Number.isFinite(nrp) && Number.isFinite(rp) ? Math.max(0, nrp - rp) : NaN;
    var avgRpDay = delta.rankPoints != null && Number.isFinite(delta.rankPoints) ? delta.rankPoints / days : null;
    if (projEl) {
      if (Number.isFinite(remaining) && remaining > 0 && avgRpDay != null && avgRpDay > 0) {
        var daysTo = Math.ceil(remaining / avgRpDay);
        projEl.textContent = T('progression_projection').replace('{{days}}', String(daysTo));
        projEl.classList.remove('progression-muted');
      } else {
        projEl.textContent = T('progression_projection_na');
        projEl.classList.add('progression-muted');
      }
    }

    var best = bestSessionInWindow(sorted, wb.start, wb.end);
    if (bestEl) {
      if (best && best.session) {
        var ds = best.session.date || (best.session.timestamp ? new Date(Number(best.session.timestamp)).toLocaleString() : '');
        var note = (best.session.note && String(best.session.note).trim()) ? ' — ' + String(best.session.note).trim() : '';
        var which =
          best.gainHonor >= best.gainXp
            ? T('progression_best_gain_honor') + ' ' + fmtSigned(best.gainHonor)
            : T('progression_best_gain_xp') + ' ' + fmtSigned(best.gainXp);
        bestEl.innerHTML =
          '<div class="progression-best-title">' +
          escapeHtml(T('progression_best_title')) +
          '</div><div class="progression-best-body">' +
          escapeHtml(which) +
          '<br><span class="progression-muted">' +
          escapeHtml(ds) +
          escapeHtml(note) +
          '</span></div>';
      } else {
        bestEl.innerHTML = '';
      }
    }

    var pwb = prevWindowBounds(periodKey);
    var prevDelta = computeWindowDelta(sorted, pwb.start, pwb.end);
    if (vsEl) {
      if (
        delta.honor != null &&
        prevDelta.honor != null &&
        Number.isFinite(prevDelta.honor) &&
        prevDelta.honor !== 0
      ) {
        var pct = ((delta.honor - prevDelta.honor) / Math.abs(prevDelta.honor)) * 100;
        var arrow = pct >= 0 ? '↑' : '↓';
        vsEl.textContent = T('progression_vs_prev')
          .replace('{{pct}}', Math.abs(Math.round(pct)))
          .replace('{{arrow}}', arrow);
      } else {
        vsEl.textContent = T('progression_vs_na');
      }
    }

    var chartData = buildChartPoints(periodKey, sorted, wb.start, wb.end);
    var canvas = document.getElementById('progressionChartCanvas');
    var chartBox = canvas ? canvas.closest('.progression-chart-canvas-box') : null;
    if (chartBox) {
      var oldFb = chartBox.querySelector('.progression-chart-fallback');
      if (oldFb) oldFb.remove();
    }
    destroyChart();
    if (canvas && typeof Chart !== 'undefined' && chartData.labels.length > 0) {
      var showH = document.getElementById('progToggleHonor');
      var showX = document.getElementById('progToggleXp');
      var ctx = canvas.getContext('2d');
      var dsList = [];
      if (!showH || showH.checked) {
        dsList.push({
          label: T('progression_toggle_honor'),
          data: chartData.honor,
          borderColor: 'rgba(234, 179, 8, 0.95)',
          backgroundColor: 'rgba(234, 179, 8, 0.12)',
          yAxisID: 'y',
          tension: 0.2,
          fill: false
        });
      }
      if (!showX || showX.checked) {
        dsList.push({
          label: T('progression_toggle_xp'),
          data: chartData.xp,
          borderColor: 'rgba(59, 130, 246, 0.95)',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          yAxisID: 'y1',
          tension: 0.2,
          fill: false
        });
      }
      if (dsList.length === 0) {
        dsList.push({
          label: T('progression_toggle_honor'),
          data: chartData.honor,
          borderColor: 'rgba(234, 179, 8, 0.95)',
          yAxisID: 'y',
          tension: 0.2
        });
      }
      _chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: chartData.labels, datasets: dsList },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: true, position: 'bottom', labels: { boxWidth: 12 } }
          },
          scales: {
            x: { ticks: { maxRotation: 45, minRotation: 0 } },
            y: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: T('progression_toggle_honor') },
              grid: { color: 'rgba(128,128,128,0.15)' }
            },
            y1: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: T('progression_toggle_xp') },
              grid: { drawOnChartArea: false }
            }
          }
        }
      });
    } else if (canvas && chartData.labels.length === 0 && chartBox) {
      var fb = document.createElement('p');
      fb.className = 'progression-chart-fallback progression-muted';
      fb.textContent = T('progression_chart_no_data');
      chartBox.appendChild(fb);
    } else if (canvas && chartData.labels.length > 0 && typeof Chart === 'undefined' && chartBox) {
      var fb2 = document.createElement('p');
      fb2.className = 'progression-chart-fallback progression-muted';
      fb2.textContent = T('progression_chart_no_data');
      chartBox.appendChild(fb2);
    }
  }

  window.renderProgression = function () {
    try {
      renderProgression();
    } catch (e) {
      if (typeof Logger !== 'undefined') Logger.warn('[Progression]', e && e.message);
    }
  };

  window.maybeRefreshProgression = function () {
    if (typeof getCurrentTab === 'function' && getCurrentTab() === 'progression' && typeof window.renderProgression === 'function') {
      window.renderProgression();
    }
  };

  window.initProgressionTab = function () {
    document.querySelectorAll('.progression-period-btn').forEach(function (btn) {
      if (btn._progBound) return;
      btn._progBound = true;
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-period');
        if (PERIOD_KEYS.indexOf(p) !== -1) {
          window._progressionPeriod = p;
          window.renderProgression();
        }
      });
    });
    var h = document.getElementById('progToggleHonor');
    var x = document.getElementById('progToggleXp');
    if (h && !h._progBound) {
      h._progBound = true;
      h.addEventListener('change', function () { window.renderProgression(); });
    }
    if (x && !x._progBound) {
      x._progBound = true;
      x.addEventListener('change', function () { window.renderProgression(); });
    }
  };

  window.addEventListener('languageChanged', function () {
    if (typeof getCurrentTab === 'function' && getCurrentTab() === 'progression' && typeof window.renderProgression === 'function') {
      window.renderProgression();
    }
  });
})();
