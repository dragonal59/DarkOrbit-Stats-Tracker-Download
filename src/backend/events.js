/**
 * Gestion des événements DarkOrbit scrapés (current_events_json)
 * Affichage sidebar, timers en temps réel, mise à jour à la réception de events-updated
 */
(function () {
  'use strict';

  var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
  var CURRENT_EVENTS_KEY = sk.CURRENT_EVENTS || 'darkOrbitCurrentEvents';
  var countdownInterval = null;
  var MAX_DESC_LENGTH = 80;

  function getScrapedEvents() {
    if (typeof UnifiedStorage === 'undefined') return [];
    var raw = UnifiedStorage.get(CURRENT_EVENTS_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Parse le timer brut (ex: "33:31:52" ou "Duración restante: 33:31:52") et scrapedAt ISO
   * @returns {number|null} Timestamp de fin en ms, ou null si pas de timer
   */
  function getEndTimestamp(ev) {
    var timer = (ev.timer || '').trim();
    if (!timer) return null;
    var match = timer.match(/(\d+):(\d+):(\d+)/);
    if (!match) return null;
    var hours = parseInt(match[1], 10);
    var minutes = parseInt(match[2], 10);
    var seconds = parseInt(match[3], 10);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;
    var scrapedAt = ev.scrapedAt ? new Date(ev.scrapedAt).getTime() : Date.now();
    if (isNaN(scrapedAt)) scrapedAt = Date.now();
    return scrapedAt + (hours * 3600 + minutes * 60 + seconds) * 1000;
  }

  function formatCountdown(endMs) {
    var now = Date.now();
    var left = Math.max(0, Math.floor((endMs - now) / 1000));
    if (left <= 0) return 'Terminé';
    var d = Math.floor(left / 86400);
    var h = Math.floor((left % 86400) / 3600);
    var m = Math.floor((left % 3600) / 60);
    var s = left % 60;
    if (d > 0) return d + 'j ' + String(h).padStart(2, '0') + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
    return String(h).padStart(2, '0') + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function renderScrapedEvents() {
    var container = document.getElementById('sidebarScrapedEvents');
    if (!container) return;
    var events = getScrapedEvents();
    var noEventText = (typeof window.i18nT === 'function' ? window.i18nT('no_event_in_progress') : 'Aucun événement en cours');
    if (events.length === 0) {
      container.innerHTML = '<div class="no-event">' + noEventText + '</div>';
      return;
    }
    var html = '';
    events.forEach(function (ev) {
      var endMs = getEndTimestamp(ev);
      var name = (ev.name || '').trim() || 'Événement';
      var desc = (ev.description || '').trim();
      if (desc.length > MAX_DESC_LENGTH) desc = desc.slice(0, MAX_DESC_LENGTH) + '...';
      var imageUrl = (ev.imageUrl || '').trim();
      var bgStyle = imageUrl ? 'background-image:url(' + escapeHtml(imageUrl) + ')' : '';
      var timerClass = endMs && (endMs - Date.now()) < 24 * 3600 * 1000 ? 'scraped-event-timer-urgent' : 'scraped-event-timer';
      var timerHtml = endMs ? '<span class="' + timerClass + '" data-end-ms="' + endMs + '">' + escapeHtml(formatCountdown(endMs)) + '</span>' : '';
      html += '<div class="event-card event-card-compact scraped-event-card" data-event-id="' + escapeHtml(ev.id || '') + '" style="' + bgStyle + '">';
      html += '<div class="event-card-content">';
      html += '<div class="event-name">' + escapeHtml(name) + '</div>';
      if (desc) html += '<div class="event-description scraped-event-desc">' + escapeHtml(desc) + '</div>';
      if (timerHtml) html += '<div class="event-time">' + timerHtml + '</div>';
      html += '</div></div>';
    });
    container.innerHTML = html;
  }

  function updateCountdowns() {
    document.querySelectorAll('.scraped-event-timer, .scraped-event-timer-urgent').forEach(function (el) {
      var endMs = parseInt(el.getAttribute('data-end-ms'), 10);
      if (!endMs) return;
      el.textContent = formatCountdown(endMs);
    });
  }

  function startCountdownInterval() {
    if (countdownInterval) return;
    countdownInterval = setInterval(updateCountdowns, 1000);
  }

  function stopCountdownInterval() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function setScrapedEventsFromIPC(events) {
    if (!Array.isArray(events)) return;
    if (typeof UnifiedStorage !== 'undefined') {
      UnifiedStorage.set(CURRENT_EVENTS_KEY, events);
      if (typeof UnifiedStorage.invalidateCache === 'function') UnifiedStorage.invalidateCache(CURRENT_EVENTS_KEY);
    }
    renderScrapedEvents();
    if (events.length > 0) startCountdownInterval();
    if (typeof window.updateBoosterAlert === 'function') window.updateBoosterAlert();
    if (typeof window.updateBoosterWidget === 'function') window.updateBoosterWidget();
  }

  function init() {
    renderScrapedEvents();
    var events = getScrapedEvents();
    if (events.some(function (e) { return getEndTimestamp(e); })) startCountdownInterval();
    if (window.electronScraper && window.electronScraper.onEventsUpdated) {
      window.electronScraper.onEventsUpdated(function (payload) {
        var list = payload && Array.isArray(payload.events) ? payload.events : [];
        setScrapedEventsFromIPC(list);
      });
    }
  }

  window.getScrapedEvents = getScrapedEvents;
  window.updateScrapedEventsDisplay = renderScrapedEvents;
  window.setScrapedEventsFromIPC = setScrapedEventsFromIPC;

  window.addEventListener('languageChanged', function () {
    renderScrapedEvents();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
