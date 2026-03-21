/**
 * Événements MANUELS (ajoutés par l'utilisateur) — stockage EVENTS (darkOrbitEvents), sidebar En cours / À venir
 * Distinct des événements scrapés (CURRENT_EVENTS / current_events_json) affichés dans #sidebarScrapedEvents
 */
(function () {
  'use strict';

  var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
  var EVENTS_KEY = sk.EVENTS || 'darkOrbitEvents';

  function getEvents() {
    if (typeof UnifiedStorage === 'undefined') return [];
    var raw = UnifiedStorage.get(EVENTS_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  function saveEvents(events) {
    if (!Array.isArray(events)) return;
    if (typeof UnifiedStorage !== 'undefined') {
      UnifiedStorage.set(EVENTS_KEY, events);
      if (typeof UnifiedStorage.invalidateCache === 'function') UnifiedStorage.invalidateCache(EVENTS_KEY);
    }
    if (typeof window.updateEventsDisplay === 'function') window.updateEventsDisplay();
    if (typeof DataSync !== 'undefined' && DataSync.queueSync) DataSync.queueSync();
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function formatEventDate(d) {
    if (!d) return '';
    var date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function isEventCurrent(ev) {
    var now = Date.now();
    var startVal = ev.startDate ?? ev.start_date ?? ev.start;
    var endVal = ev.endDate ?? ev.end_date ?? ev.end;
    var start = startVal ? new Date(startVal).getTime() : 0;
    var end = endVal ? new Date(endVal).getTime() : 0;
    if (isNaN(start)) {
      if (startVal != null && startVal !== '') Logger.warn('[Events] isEventCurrent: startDate invalide (NaN)', { name: ev.name || ev.title, startVal: startVal });
      start = 0;
    }
    if (isNaN(end)) {
      if (endVal != null && endVal !== '') Logger.warn('[Events] isEventCurrent: endDate invalide (NaN)', { name: ev.name || ev.title, endVal: endVal });
      end = now + 1;
    }
    return start <= now && now <= end;
  }

  /** Diagnostic : raison pour laquelle isEventCurrent(ev) est false. */
  function getEventCurrentDebug(ev) {
    var now = Date.now();
    var startVal = ev.startDate ?? ev.start_date ?? ev.start;
    var endVal = ev.endDate ?? ev.end_date ?? ev.end;
    var start = startVal ? new Date(startVal).getTime() : NaN;
    var end = endVal ? new Date(endVal).getTime() : NaN;
    var current = !isNaN(start) && !isNaN(end) && start <= now && now <= end;
    var reason = '';
    if (current) reason = 'ok';
    else if (startVal == null && endVal == null) reason = 'startDate et endDate null/undefined';
    else if (startVal == null) reason = 'startDate null/undefined';
    else if (endVal == null) reason = 'endDate null/undefined';
    else if (isNaN(start)) reason = 'startDate invalide (parse NaN)';
    else if (isNaN(end)) reason = 'endDate invalide (parse NaN)';
    else if (start > now) reason = 'startDate dans le futur';
    else if (end < now) reason = 'endDate dans le passé';
    else reason = 'inconnu';
    return { name: ev.name || ev.title, startVal: startVal, endVal: endVal, startTs: start, endTs: end, now: now, current: current, reason: reason };
  }

  function isEventUpcoming(ev) {
    var startVal = ev.startDate ?? ev.start_date ?? ev.start;
    var start = startVal ? new Date(startVal).getTime() : 0;
    return !isNaN(start) && start > Date.now();
  }

  /** Nom → slug pour img/events/[slug].png ou .jpg. Accents remplacés (é→e), pas supprimés. */
  function eventNameToSlug(name) {
    if (!name || typeof name !== 'string') return '';
    var s = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  /** Chemins d’image pour un événement manuel (convention img/events/) */
  /** Correspondance manuelle nom d'événement → slug fichier image (sinon slug auto NFD). */
  var EVENT_IMAGE_SLUG_MAP = {
    'Union Immortal': 'immortal_union',
    'Union Immortelle': 'immortal_union',
    'Trinity Trials': 'trinity_trials',
    'Pandémonium Protegit': 'protegit_pandemonium',
    'Conflit Galactique': 'galactic_strife',
    'Rébellion des Mimesis': 'mimesis_mutiny'
  };

  function getManualEventImagePaths(ev) {
    if (ev.imageUrl && ev.imageUrl.trim()) return { useUrl: ev.imageUrl.trim() };
    if (ev.imageData) {
      var data = ev.imageData;
      var url = typeof data === 'string' ? (data.indexOf('data:') === 0 ? data : 'data:image/png;base64,' + data) : null;
      if (url) return { useUrl: url };
    }
    var name = (ev.name || ev.title || '').trim();
    var slug = EVENT_IMAGE_SLUG_MAP[name] || eventNameToSlug(name);
    if (!slug) return {};
    return { png: 'img/events/' + slug + '.png', jpg: 'img/events/' + slug + '.jpg' };
  }

  function buildEventCard(ev, badgeClass) {
    var name = (ev.name || ev.title || '').trim() || (typeof window.i18nT === 'function' ? window.i18nT('event_no_name') : 'Sans nom');
    var startStr = formatEventDate(ev.startDate || ev.start_date);
    var endStr = formatEventDate(ev.endDate || ev.end_date);
    var badge = badgeClass === 'current' ? (typeof window.i18nT === 'function' ? window.i18nT('events_current') : 'En cours') : badgeClass === 'completed' ? (typeof window.i18nT === 'function' ? window.i18nT('events_completed') : 'Terminé') : (typeof window.i18nT === 'function' ? window.i18nT('events_upcoming') : 'À venir');
    var paths = getManualEventImagePaths(ev);
    var cardClass = 'event-card event-card-compact manual-event-card' + (badgeClass === 'completed' ? ' event-card-completed' : '');
    var html = '<div class="' + cardClass + '" data-event-id="' + escapeHtml(String(ev.id || '')) + '">';
    if (paths.useUrl) {
      html += '<div class="manual-event-bg" style="background-image:url(' + escapeHtml(paths.useUrl) + ')"></div>';
    } else if (paths.png) {
      html += '<img class="manual-event-img" src="' + escapeHtml(paths.png) + '" data-fallback="' + escapeHtml(paths.jpg) + '" alt="">';
    } else {
      html += '<div class="manual-event-placeholder"></div>';
    }
    html += '<span class="event-badge ' + badgeClass + '">' + escapeHtml(badge) + '</span>';
    html += '<div class="event-card-content">';
    html += '<div class="event-name">' + escapeHtml(name) + '</div>';
    if (ev.completed) html += '<div class="event-completed-badge">' + (typeof window.i18nT === 'function' ? window.i18nT('events_user_completed') : 'Complété ✅') + '</div>';
    if (startStr || endStr) html += '<div class="event-time">' + escapeHtml(startStr) + (endStr ? ' → ' + endStr : '') + '</div>';
    html += '</div></div>';
    return html;
  }

  function buildEventCardWithActions(ev, badgeClass) {
    var id = escapeHtml(String(ev.id || ''));
    return '<div class="event-card-wrapper">' +
      buildEventCard(ev, badgeClass) +
      '<div class="event-card-actions">' +
        '<button type="button" class="event-action-btn event-action-edit" data-action="edit" data-event-id="' + id + '">✏️ Modifier</button>' +
        '<button type="button" class="event-action-btn event-action-delete" data-action="delete" data-event-id="' + id + '">🗑️ Supprimer</button>' +
      '</div>' +
    '</div>';
  }

  function getHiddenEventIds() {
    if (typeof UserPreferencesAPI !== 'undefined') {
      return UserPreferencesAPI.getHiddenEventIds();
    }
    return [];
  }

  function saveHiddenEventIds(ids) {
    if (typeof UserPreferencesAPI !== 'undefined') {
      UserPreferencesAPI.setHiddenEventIds(ids);
    }
  }

  function isEventHidden(evId) {
    return getHiddenEventIds().indexOf(String(evId)) !== -1;
  }

  function toggleEventHidden(evId) {
    var ids = getHiddenEventIds();
    var idx = ids.indexOf(String(evId));
    if (idx === -1) ids.push(String(evId));
    else ids.splice(idx, 1);
    saveHiddenEventIds(ids);
    return idx === -1; // true = now hidden
  }

  /** Carte pour le carrousel sidebar : bouton œil (masquer) + bouton ℹ️ + décompte si en cours. */
  function buildCarouselSlideCard(ev, badgeClass) {
    var cardHtml = buildEventCard(ev, badgeClass);
    var idAttr = escapeHtml(String(ev.id || ''));
    var hidden = isEventHidden(ev.id);
    var eyeTitle = hidden ? 'Afficher dans la sidebar' : 'Masquer de la sidebar';
    var eyeClass = 'event-card-eye-btn' + (hidden ? ' event-card-eye-btn--hidden' : '');
    cardHtml = cardHtml.replace(
      'data-event-id="' + idAttr + '">',
      'data-event-id="' + idAttr + '">' +
        '<button type="button" class="event-card-info-btn" aria-label="Info" data-event-id="' + idAttr + '">ℹ️</button>' +
        '<button type="button" class="' + eyeClass + '" aria-label="' + escapeHtml(eyeTitle) + '" data-action="toggle-hide" data-event-id="' + idAttr + '" title="' + escapeHtml(eyeTitle) + '">' + (hidden ? '🙈' : '👁') + '</button>'
    );
    var endVal = ev.endDate ?? ev.end_date ?? ev.end;
    var isCurrent = badgeClass === 'current' && endVal;
    if (isCurrent) {
      var endTs = new Date(endVal).getTime();
      if (!isNaN(endTs)) {
        var countdownHtml = '<div class="events-carousel-countdown" data-end="' + escapeHtml(String(endVal)) + '"></div>';
        cardHtml = cardHtml.slice(0, -'</div></div>'.length) + countdownHtml + '</div></div>';
      }
    }
    return cardHtml;
  }

  function formatCountdown(ms) {
    if (ms <= 0) return (typeof window.i18nT === 'function' ? window.i18nT('event_countdown_finished') : 'Terminé');
    var s = Math.floor(ms / 1000) % 60;
    var m = Math.floor(ms / 60000) % 60;
    var h = Math.floor(ms / 3600000) % 24;
    var d = Math.floor(ms / 86400000);
    var parts = [];
    if (d > 0) parts.push(d + 'j');
    if (h > 0 || parts.length) parts.push(h + 'h');
    parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  }

  function tickCarouselCountdowns() {
    var els = document.querySelectorAll('.events-carousel-countdown[data-end]');
    var now = Date.now();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var endTs = new Date(el.getAttribute('data-end')).getTime();
      el.textContent = formatCountdown(endTs - now);
    }
  }

  function _onManualEventImageError(e) {
    var img = e.target;
    if (!img || !img.classList || !img.classList.contains('manual-event-img')) return;
    var fallback = img.getAttribute('data-fallback');
    if (fallback) {
      img.removeAttribute('data-fallback');
      img.src = fallback;
    } else {
      img.style.display = 'none';
      var card = img.closest && img.closest('.manual-event-card');
      if (card) card.classList.add('manual-event-no-image');
    }
  }
  function initManualEventImageFallback() {
    if (window._manualEventImageFallbackInit) return;
    window._manualEventImageFallbackInit = true;
    document.body.addEventListener('error', _onManualEventImageError, true);
  }

  function getCurrentAndUpcomingEvents() {
    var events = getEvents();
    var current = [];
    var upcoming = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (isEventCurrent(ev)) current.push(ev);
      else if (isEventUpcoming(ev)) upcoming.push(ev);
    }
    return { events: events, current: current, upcoming: upcoming };
  }

  function updateEventsTabContent() {
    var container = document.getElementById('eventsTabContent') || document.getElementById('eventsTabContentDashboard');
    if (!container) return;
    var data = getCurrentAndUpcomingEvents();
    var noEventText = typeof window.i18nT === 'function' ? window.i18nT('no_event') : 'Aucun événement';
    var titleCurrent = typeof window.i18nT === 'function' ? window.i18nT('events_current') : 'En cours';
    var titleUpcoming = typeof window.i18nT === 'function' ? window.i18nT('events_upcoming') : 'À venir';
    var titleCompleted = typeof window.i18nT === 'function' ? window.i18nT('events_completed') : 'Terminés';
    var btnRemettre = typeof window.i18nT === 'function' ? window.i18nT('events_remettre_en_cours') : 'Remettre en cours';
    var now = Date.now();
    var completed = data.events.filter(function (e) {
      var endVal = e.endDate ?? e.end_date ?? e.end;
      if (!endVal) return false;
      var t = new Date(endVal).getTime();
      return !isNaN(t) && t < now;
    });
    var currentHtml = data.current.length === 0
      ? '<div class="no-event">' + noEventText + '</div>'
      : '<div class="events-grid">' + data.current.map(function (ev) { return buildEventCardWithActions(ev, 'current'); }).join('') + '</div>';
    var upcomingHtml = data.upcoming.length === 0
      ? '<div class="no-event">' + noEventText + '</div>'
      : '<div class="events-grid">' + data.upcoming.map(function (ev) { return buildEventCardWithActions(ev, 'upcoming'); }).join('') + '</div>';
    var completedHtml = completed.length === 0 ? '' : completed.map(function (ev) {
      return '<div class="completed-event-item">' + buildEventCardWithActions(ev, 'completed') + '<button type="button" class="btn-remettre-en-cours" data-event-id="' + escapeHtml(String(ev.id || '')) + '">' + escapeHtml(btnRemettre) + '</button></div>';
    }).join('');
    var completedSection = completed.length === 0 ? '' : '<section class="events-section" aria-labelledby="events-tab-completed-title">' +
      '<h3 id="events-tab-completed-title" class="events-section-title">✓ ' + escapeHtml(titleCompleted) + '</h3>' +
      '<div class="events-grid events-completed-grid">' + completedHtml + '</div></section>';
    container.innerHTML =
      '<div class="events-tab-container">' +
        '<section class="events-section" aria-labelledby="events-tab-current-title">' +
          '<h3 id="events-tab-current-title" class="events-section-title">🔴 ' + escapeHtml(titleCurrent) + '</h3>' +
          currentHtml +
        '</section>' +
        '<section class="events-section" aria-labelledby="events-tab-upcoming-title">' +
          '<h3 id="events-tab-upcoming-title" class="events-section-title">📆 ' + escapeHtml(titleUpcoming) + '</h3>' +
          upcomingHtml +
        '</section>' +
        completedSection +
      '</div>';
    if (!container._eventsActionsListener) {
      container._eventsActionsListener = true;
      container.addEventListener('click', function (e) {
        var remBtn = e.target && e.target.closest && e.target.closest('.btn-remettre-en-cours');
        if (remBtn) {
          var id = remBtn.getAttribute('data-event-id');
          if (!id) return;
          var list = getEvents();
          for (var i = 0; i < list.length; i++) {
            if (String(list[i].id || '') === id) {
              list[i].completed = false;
              list[i].updatedAt = new Date().toISOString();
              saveEvents(list);
              if (typeof updateEventsDisplay === 'function') updateEventsDisplay();
              if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('events_remettre_ok') : 'Événement remis en cours.', 'success');
              break;
            }
          }
          return;
        }

        var actionBtn = e.target && e.target.closest && e.target.closest('[data-action]');
        if (!actionBtn) return;
        var action = actionBtn.getAttribute('data-action');
        var eventId = actionBtn.getAttribute('data-event-id');
        if (!eventId) return;

        if (action === 'delete') {
          var confirmMsg = typeof window.i18nT === 'function' ? window.i18nT('event_delete_confirm') : 'Supprimer cet événement ?';
          if (!window.confirm(confirmMsg)) return;
          var list2 = getEvents();
          var filtered = list2.filter(function (ev) { return String(ev.id || '') !== eventId; });
          // Sauvegarder localement SANS déclencher queueSync (on gère manuellement)
          if (typeof UnifiedStorage !== 'undefined') {
            var sk2 = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
            UnifiedStorage.set(sk2.EVENTS || 'darkOrbitEvents', filtered);
            if (typeof UnifiedStorage.invalidateCache === 'function') UnifiedStorage.invalidateCache(sk2.EVENTS || 'darkOrbitEvents');
          }
          // Supprimer de Supabase avant le prochain pull
          if (typeof DataSync !== 'undefined' && DataSync.deleteEventRemote) DataSync.deleteEventRemote(eventId);
          if (typeof updateEventsDisplay === 'function') updateEventsDisplay();
          if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('event_deleted') : 'Événement supprimé.', 'success');
          return;
        }

        if (action === 'edit') {
          if (typeof openEditEventModal === 'function') openEditEventModal(eventId);
          return;
        }
      });
    }
  }

  var _countdownIntervalId = null;
  var TRANSITION_DURATION_MS = 400;

  function renderOneCarousel(container, items, badge, noEventText) {
    if (container._intervalId) { clearInterval(container._intervalId); container._intervalId = null; }
    if (!container) return;
    if (items.length === 0) {
      container.innerHTML = '<div class="no-event">' + noEventText + '</div>';
      container.classList.remove('events-carousel--multi');
      container._goTo = null;
      container._next = null;
      container._total = 0;
      return;
    }
    if (items.length === 1) {
      container.innerHTML = '<div class="events-carousel-viewport"><div class="events-carousel-track events-carousel-track--single"><div class="events-carousel-slide">' + buildCarouselSlideCard(items[0], badge) + '</div></div></div>';
      container.classList.remove('events-carousel--multi');
      container._goTo = null;
      container._next = null;
      container._total = 0;
      return;
    }
    var slidePct = (100 / items.length).toFixed(2);
    var slidesHtml = items.map(function (ev) {
      return '<div class="events-carousel-slide" style="flex:0 0 ' + slidePct + '%">' + buildCarouselSlideCard(ev, badge) + '</div>';
    }).join('');
    var dotsHtml = items.map(function (_, i) {
      return '<button type="button" class="events-carousel-dot' + (i === 0 ? ' active' : '') + '" data-index="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
    }).join('');
    container.innerHTML =
      '<div class="events-carousel-viewport">' +
        '<div class="events-carousel-track" style="width:' + items.length * 100 + '%; transform:translateX(0)">' + slidesHtml + '</div>' +
      '</div>' +
      '<div class="events-carousel-nav">' +
        '<button type="button" class="events-carousel-prev" aria-label="' + escapeHtml(typeof window.i18nT === 'function' ? window.i18nT('carousel_prev') : 'Précédent') + '">‹</button>' +
        '<div class="events-carousel-dots">' + dotsHtml + '</div>' +
        '<button type="button" class="events-carousel-next" aria-label="' + escapeHtml(typeof window.i18nT === 'function' ? window.i18nT('carousel_next') : 'Suivant') + '">›</button>' +
      '</div>';
    container.classList.add('events-carousel--multi');
    container.setAttribute('data-carousel-index', '0');
    container._isTransitioning = false;
    var total = items.length;

    function goTo(index) {
      if (container._isTransitioning) return;
      if (total === 0) return;
      index = (index % total + total) % total;
      container._isTransitioning = true;
      container.setAttribute('data-carousel-index', String(index));
      var track = container.querySelector('.events-carousel-track');
      if (track) track.style.transform = 'translateX(-' + (index * 100 / total) + '%)';
      var dots = container.querySelectorAll('.events-carousel-dot');
      for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('active', d === index);
      setTimeout(function () { container._isTransitioning = false; }, TRANSITION_DURATION_MS);
    }

    function next() {
      if (container._isTransitioning) return;
      var i = parseInt(container.getAttribute('data-carousel-index'), 10) || 0;
      goTo(i + 1);
    }

    container._goTo = goTo;
    container._next = next;
    container._total = total;
    container._intervalId = setInterval(next, 15000);
  }

  function _onCarouselDelegationClick(e) {
    var eyeBtn = e.target.closest && e.target.closest('[data-action="toggle-hide"]');
    if (eyeBtn) {
      e.stopPropagation();
      e.preventDefault();
      var evId = eyeBtn.getAttribute('data-event-id');
      if (evId) {
        var nowHidden = toggleEventHidden(evId);
        var msg = nowHidden ? 'Événement masqué de la sidebar.' : 'Événement affiché dans la sidebar.';
        if (typeof showToast === 'function') showToast(msg, 'info');
        if (typeof updateEventsDisplay === 'function') updateEventsDisplay();
        if (typeof window.updateScrapedEventsDisplay === 'function') window.updateScrapedEventsDisplay();
      }
      return;
    }
    var carousel = e.target.closest && e.target.closest('.events-carousel');
    if (!carousel || !carousel._goTo) return;
    var prev = e.target.closest('.events-carousel-prev');
    var nextBtn = e.target.closest('.events-carousel-next');
    var dot = e.target.closest('.events-carousel-dot');
    if (prev) { carousel._goTo((parseInt(carousel.getAttribute('data-carousel-index'), 10) || 0) - 1); return; }
    if (nextBtn) { carousel._next(); return; }
    if (dot && dot.hasAttribute('data-index')) carousel._goTo(parseInt(dot.getAttribute('data-index'), 10));
  }
  function initCarouselDelegation() {
    if (window._carouselDelegationInit) return;
    window._carouselDelegationInit = true;
    document.body.addEventListener('click', _onCarouselDelegationClick);
  }

  function attachCarouselHoverOnce(container) {
    if (container._carouselHoverAttached) return;
    container._carouselHoverAttached = true;
    container.addEventListener('mouseenter', function () {
      if (container._intervalId) { clearInterval(container._intervalId); container._intervalId = null; }
    });
    container.addEventListener('mouseleave', function () {
      if (container._total > 1 && !container._intervalId && container._next) container._intervalId = setInterval(container._next, 15000);
    });
  }

  function updateEventsDisplay() {
    if (_countdownIntervalId) { clearInterval(_countdownIntervalId); _countdownIntervalId = null; }
    // Section "Suivi joueurs" dans la sidebar (remplace En cours / À venir)
    if (typeof window.refreshFollowedPlayersSidebar === 'function') window.refreshFollowedPlayersSidebar();

    tickCarouselCountdowns();
    _countdownIntervalId = setInterval(tickCarouselCountdowns, 1000);

    updateEventsTabContent();
  }

  function openAddEventModal() {
    var modal = document.getElementById('addEventModal');
    if (!modal) return;
    modal._editId = null;
    var titleEl = document.getElementById('addEventModalTitle');
    var submitBtn = document.getElementById('submitEventBtn');
    if (titleEl) titleEl.textContent = '➕ Ajouter un événement';
    if (submitBtn) submitBtn.textContent = '✅ Ajouter l\'événement';
    resetAddEventForm();
    modal.style.display = 'flex';
  }

  function openEditEventModal(eventId) {
    var modal = document.getElementById('addEventModal');
    if (!modal) return;
    var list = getEvents();
    var ev = null;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id || '') === String(eventId)) { ev = list[i]; break; }
    }
    if (!ev) return;
    modal._editId = String(eventId);
    var titleEl = document.getElementById('addEventModalTitle');
    var submitBtn = document.getElementById('submitEventBtn');
    if (titleEl) titleEl.textContent = '✏️ Modifier l\'événement';
    if (submitBtn) submitBtn.textContent = '💾 Enregistrer';
    var nameEl = document.getElementById('eventNameInput');
    var descEl = document.getElementById('eventDescriptionInput');
    var missionEl = document.getElementById('eventMissionInput');
    var startEl = document.getElementById('eventStartDateInput');
    var endEl = document.getElementById('eventEndDateInput');
    var completedEl = document.getElementById('eventCompletedInput');
    if (nameEl) nameEl.value = ev.name || ev.title || '';
    if (descEl) descEl.value = ev.description || '';
    if (missionEl) missionEl.value = ev.mission || '';
    if (startEl) startEl.value = (ev.startDate || ev.start_date || '').replace(' ', 'T').substring(0, 16);
    if (endEl) endEl.value = (ev.endDate || ev.end_date || '').replace(' ', 'T').substring(0, 16);
    if (completedEl) completedEl.checked = !!ev.completed;
    var tagInputs = document.querySelectorAll('input[name="eventTags"]');
    for (var t = 0; t < tagInputs.length; t++) {
      tagInputs[t].checked = Array.isArray(ev.tags) && ev.tags.indexOf(tagInputs[t].value) !== -1;
    }
    modal.style.display = 'flex';
  }

  function resetAddEventForm() {
    var nameEl = document.getElementById('eventNameInput');
    var descEl = document.getElementById('eventDescriptionInput');
    var missionEl = document.getElementById('eventMissionInput');
    var startEl = document.getElementById('eventStartDateInput');
    var endEl = document.getElementById('eventEndDateInput');
    var completedEl = document.getElementById('eventCompletedInput');
    var preview = document.getElementById('imagePreview');
    if (nameEl) nameEl.value = '';
    if (descEl) descEl.value = '';
    if (missionEl) missionEl.value = '';
    if (startEl) startEl.value = '';
    if (endEl) endEl.value = '';
    if (completedEl) completedEl.checked = false;
    if (preview) preview.innerHTML = '';
    var tagInputs = document.querySelectorAll('input[name="eventTags"]');
    for (var t = 0; t < tagInputs.length; t++) tagInputs[t].checked = false;
    var fileInput = document.getElementById('eventImageInput');
    if (fileInput) fileInput.value = '';
  }

  function closeAddEventModal() {
    var modal = document.getElementById('addEventModal');
    if (!modal) return;
    modal._editId = null;
    modal.style.display = 'none';
  }

  function linkifyMission(text) {
    if (!text || typeof text !== 'string') return escapeHtml(text || '');
    var escaped = escapeHtml(text);
    return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function openEventInfoModal(ev) {
    var modal = document.getElementById('eventInfoModal');
    if (!modal) return;
    var name = (ev.name || ev.title || '').trim() || (typeof window.i18nT === 'function' ? window.i18nT('event_no_name') : 'Sans nom');
    var titleEl = document.getElementById('eventInfoTitle');
    var descEl = document.getElementById('eventInfoDescription');
    var missionEl = document.getElementById('eventInfoMission');
    var startEl = document.getElementById('eventInfoStartDate');
    var endEl = document.getElementById('eventInfoEndDate');
    var statusEl = document.getElementById('eventInfoStatus');
    var descSection = document.getElementById('eventInfoDescriptionSection');
    var missionSection = document.getElementById('eventInfoMissionSection');
    var completedContainer = document.getElementById('eventInfoCompletedContainer');
    if (titleEl) titleEl.textContent = 'ℹ️ ' + name;
    if (startEl) startEl.textContent = formatEventDate(ev.startDate ?? ev.start_date ?? ev.start) || '—';
    if (endEl) endEl.textContent = formatEventDate(ev.endDate ?? ev.end_date ?? ev.end) || '—';
    var desc = (ev.description || '').trim();
    if (descSection) { descSection.style.display = desc ? 'block' : 'none'; }
    if (descEl) descEl.innerHTML = escapeHtml(desc) || '—';
    var mission = (ev.mission || '').trim();
    if (missionSection) { missionSection.style.display = mission ? 'block' : 'none'; }
    if (missionEl) missionEl.innerHTML = linkifyMission(mission) || '—';
    if (statusEl) {
      statusEl.style.display = 'block';
      if (isEventCurrent(ev)) { statusEl.textContent = typeof window.i18nT === 'function' ? window.i18nT('events_current') : 'En cours'; statusEl.setAttribute('data-status', 'current'); }
      else if (isEventUpcoming(ev)) { statusEl.textContent = typeof window.i18nT === 'function' ? window.i18nT('events_upcoming') : 'À venir'; statusEl.setAttribute('data-status', 'upcoming'); }
      else { statusEl.textContent = typeof window.i18nT === 'function' ? window.i18nT('events_completed') : 'Terminé'; statusEl.setAttribute('data-status', 'past'); }
    }
    if (completedContainer) {
      if (ev.scraped) {
        completedContainer.style.display = 'none';
      } else {
        var showCompleted = isEventCurrent(ev) || (!isEventUpcoming(ev));
        completedContainer.style.display = showCompleted ? 'block' : 'none';
      if (showCompleted) {
        var cb = document.getElementById('eventInfoCompletedCheckbox');
        if (cb) cb.checked = !!ev.completed;
        completedContainer.onclick = function () {
          var list = getEvents();
          for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(ev.id)) {
              list[i].completed = !list[i].completed;
              if (cb) cb.checked = !!list[i].completed;
              saveEvents(list);
              break;
            }
          }
        };
      }
      }
    }
    modal.style.display = 'flex';
  }

  window.openEventInfoModal = openEventInfoModal;

  function closeEventInfoModal() {
    var modal = document.getElementById('eventInfoModal');
    if (modal) modal.style.display = 'none';
  }

  function _onEventInfoModalOverlayClick(e) {
    if (e.target === _eventInfoModalRef) closeEventInfoModal();
  }
  function _onEventInfoModalBodyClick(e) {
    var btn = e.target && e.target.closest && e.target.closest('.event-card-info-btn');
    if (!btn) return;
    var id = btn.getAttribute('data-event-id');
    if (id == null) return;
    if (btn.closest('#sidebarScrapedEvents')) {
      var ev = typeof window.getScrapedEventForModal === 'function' && window.getScrapedEventForModal(id);
      if (ev) { openEventInfoModal(ev); }
      return;
    }
    var list = getEvents();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id || '') === String(id)) {
        openEventInfoModal(list[i]);
        break;
      }
    }
  }
  var _eventInfoModalRef = null;
  var _eventInfoCloseBtnRef = null;
  function initEventInfoModal() {
    if (window._eventInfoModalInit) return;
    window._eventInfoModalInit = true;
    var closeBtn = document.getElementById('closeEventInfoBtn');
    var modal = document.getElementById('eventInfoModal');
    _eventInfoModalRef = modal;
    _eventInfoCloseBtnRef = closeBtn;
    if (closeBtn) closeBtn.addEventListener('click', closeEventInfoModal);
    if (modal && modal.querySelector('.modal-content')) {
      modal.addEventListener('click', _onEventInfoModalOverlayClick);
    }
    document.body.addEventListener('click', _onEventInfoModalBodyClick);
  }

  function initAddEventModal() {
    if (window._addEventModalInit) return;
    window._addEventModalInit = true;
    var addBtnTab = document.getElementById('addEventBtnTab') || document.getElementById('addEventBtnDashboard');
    var closeBtn = document.getElementById('closeModalBtn');
    var cancelBtn = document.getElementById('cancelEventBtn');
    var submitBtn = document.getElementById('submitEventBtn');
    var modal = document.getElementById('addEventModal');
    if (addBtnTab) addBtnTab.addEventListener('click', openAddEventModal);
    if (closeBtn) closeBtn.addEventListener('click', closeAddEventModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAddEventModal);
    if (modal && modal.querySelector('.modal-content')) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeAddEventModal();
      });
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var nameEl = document.getElementById('eventNameInput');
        var startEl = document.getElementById('eventStartDateInput');
        var endEl = document.getElementById('eventEndDateInput');
        var name = nameEl && nameEl.value ? nameEl.value.trim() : '';
        var startVal = startEl && startEl.value ? startEl.value : '';
        var endVal = endEl && endEl.value ? endEl.value : '';
        if (!name) {
          if (typeof showToast === 'function') showToast('Veuillez saisir le nom de l\'événement.', 'warning');
          return;
        }
        if (!startVal || !endVal) {
          if (typeof showToast === 'function') showToast('Veuillez saisir les dates de début et de fin.', 'warning');
          return;
        }
        var tagsEls = document.querySelectorAll('input[name="eventTags"]:checked');
        var tags = [];
        if (tagsEls && tagsEls.length) for (var t = 0; t < tagsEls.length; t++) tags.push(tagsEls[t].value);
        var description = (document.getElementById('eventDescriptionInput') && document.getElementById('eventDescriptionInput').value) ? document.getElementById('eventDescriptionInput').value.trim() : '';
        var mission = (document.getElementById('eventMissionInput') && document.getElementById('eventMissionInput').value) ? document.getElementById('eventMissionInput').value.trim() : '';
        var completed = !!(document.getElementById('eventCompletedInput') && document.getElementById('eventCompletedInput').checked);

        var editId = modal && modal._editId;
        if (editId) {
          var list = getEvents();
          for (var i = 0; i < list.length; i++) {
            if (String(list[i].id || '') === editId) {
              list[i].name = name;
              list[i].description = description;
              list[i].mission = mission;
              list[i].tags = tags;
              list[i].startDate = startVal;
              list[i].endDate = endVal;
              list[i].completed = completed;
              list[i].updatedAt = new Date().toISOString();
              break;
            }
          }
          saveEvents(list);
          closeAddEventModal();
          if (typeof updateEventsDisplay === 'function') updateEventsDisplay();
          if (typeof showToast === 'function') showToast('Événement mis à jour.', 'success');
        } else {
          var ev = {
            id: 'ev_' + Date.now(),
            name: name,
            description: description,
            mission: mission,
            tags: tags,
            startDate: startVal,
            endDate: endVal,
            completed: completed,
            updatedAt: new Date().toISOString()
          };
          var list2 = getEvents();
          list2.unshift(ev);
          saveEvents(list2);
          closeAddEventModal();
          if (typeof updateEventsDisplay === 'function') updateEventsDisplay();
          if (typeof showToast === 'function') showToast('Événement ajouté.', 'success');
        }
      });
    }
  }

  window.getEvents = getEvents;
  window.saveEvents = saveEvents;
  window.updateEventsDisplay = updateEventsDisplay;
  window.openAddEventModal = openAddEventModal;
  window.closeAddEventModal = closeAddEventModal;
  window.openEditEventModal = openEditEventModal;
  window.isEventHidden = isEventHidden;
  window.toggleEventHidden = toggleEventHidden;
  window.getHiddenEventIds = getHiddenEventIds;
  window.saveHiddenEventIds = saveHiddenEventIds;

  window.addEventListener('languageChanged', function () {
    updateEventsDisplay();
  });

  function stopAllCarouselIntervals() {
    if (_countdownIntervalId) { clearInterval(_countdownIntervalId); _countdownIntervalId = null; }
  }
  function cleanupBodyListeners() {
    if (document.body) {
      document.body.removeEventListener('error', _onManualEventImageError, true);
      document.body.removeEventListener('click', _onCarouselDelegationClick);
      document.body.removeEventListener('click', _onEventInfoModalBodyClick);
    }
    if (_eventInfoCloseBtnRef) {
      _eventInfoCloseBtnRef.removeEventListener('click', closeEventInfoModal);
      _eventInfoCloseBtnRef = null;
    }
    if (_eventInfoModalRef && _eventInfoModalRef.querySelector) {
      _eventInfoModalRef.removeEventListener('click', _onEventInfoModalOverlayClick);
      _eventInfoModalRef = null;
    }
    window._manualEventImageFallbackInit = false;
    window._carouselDelegationInit = false;
    window._eventInfoModalInit = false;
    stopAllCarouselIntervals();
  }
  window.addEventListener('beforeunload', cleanupBodyListeners);
  window.addEventListener('userLoggedOut', cleanupBodyListeners);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initManualEventImageFallback();
      initCarouselDelegation();
      initEventInfoModal();
      updateEventsDisplay();
      initAddEventModal();
    });
  } else {
    initManualEventImageFallback();
    initCarouselDelegation();
    initEventInfoModal();
    updateEventsDisplay();
    initAddEventModal();
  }
})();
