/**
 * Gestion des événements DarkOrbit scrapés (événements du jour)
 * Source Supabase : table do_events (dernier run_id du scraper). Sync table events via upsert_sidebar_events.
 * Enrichissement : multillingues_events.
 */
(function () {
  'use strict';

  var _cachedEvents = [];
  var countdownInterval = null;
  var MAX_DESC_LENGTH = 80;
  var MATCH_SCORE_THRESHOLD = 4;

  /**
   * Liste des JSON événements : découverte dynamique (Electron → IPC + fs.readdirSync dans le main).
   * Hors Electron : fetch('multillingues_events/manifest.json') avec { "files": ["a.json", ...] }.
   */
  function discoverEventsDbFiles() {
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.listMultillinguesEventJsonFiles === 'function') {
      return window.electronAPI.listMultillinguesEventJsonFiles().then(function (res) {
        if (res && res.ok && Array.isArray(res.files)) return res.files;
        Logger.warn('[Events] discoverEventsDbFiles — IPC invalide ou vide');
        return [];
      });
    }
    var baseUrl = getEventsDbBaseUrl();
    return fetch(baseUrl + 'manifest.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.files)) {
          return data.files
            .filter(function (f) { return typeof f === 'string' && /\.json$/i.test(f); })
            .sort(function (a, b) { return a.localeCompare(b, 'en'); });
        }
        Logger.warn('[Events] discoverEventsDbFiles — manifest.json absent ou invalide (hors Electron)');
        return [];
      })
      .catch(function (e) {
        Logger.warn('[Events] discoverEventsDbFiles — manifest:', e?.message || e);
        return [];
      });
  }

  var _eventsDatabase = null;
  var _eventsDatabasePromise = null;

  function getEventsDbBaseUrl() {
    var href = (typeof location !== 'undefined' && location.href) ? location.href : '';
    href = href.replace(/[#?].*$/, '').replace(/\/[^/]*$/, '/');
    return href + 'multillingues_events/';
  }

  function getEventsDbBaseUrlFallback() {
    if (typeof location === 'undefined' || !location.pathname) return '';
    var segs = location.pathname.split('/').filter(Boolean);
    if (segs.length === 0) return '';
    segs.pop();
    return location.origin + '/' + segs.join('/') + '/multillingues_events/';
  }

  function normalizeForLookup(str) {
    if (!str || typeof str !== 'string') return '';
    var s = str.trim().toLowerCase();
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[!¡?¿.,;:'"…]/g, '').replace(/[\-–—]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  function containsWord(textNorm, keywordNorm) {
    if (!textNorm || !keywordNorm) return false;
    var escaped = keywordNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[\\s\\W])' + escaped + '([\\s\\W]|$)').test(textNorm);
  }

  /**
   * Charge tous les JSON de src/multillingues_events/, indexe par titres exacts (names.fr/en).
   * @returns {Promise<{events: Array, byExactTitle: Object}>}
   */
  function loadEventsDatabase() {
    if (_eventsDatabase) return Promise.resolve(_eventsDatabase);
    if (_eventsDatabasePromise) return _eventsDatabasePromise;
    var baseUrl = getEventsDbBaseUrl();
    function fetchOne(base, filename) {
      var url = base + encodeURIComponent(filename);
      return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function (e) {
        Logger.warn('[Events] loadEventsDatabase — échec fetch:', url, e?.message || e);
        return null;
      });
    }
    _eventsDatabasePromise = discoverEventsDbFiles().then(function (EVENTS_DB_FILES) {
      if (!EVENTS_DB_FILES.length) {
        Logger.warn('[Events] loadEventsDatabase — aucun fichier JSON listé');
      }
      return Promise.all(EVENTS_DB_FILES.map(function (filename) {
        return fetchOne(baseUrl, filename).then(function (data) {
          if (data != null) return data;
          var fallback = getEventsDbBaseUrlFallback();
          if (fallback && fallback !== baseUrl) return fetchOne(fallback, filename);
          return null;
        });
      })).then(function (results) {
        return { results: results, fileNames: EVENTS_DB_FILES };
      });
    }).then(function (bundle) {
      var results = bundle.results;
      var EVENTS_DB_FILES = bundle.fileNames;
      var events = [];
      results.forEach(function (r, idx) {
        if (Array.isArray(r)) r.forEach(function (ev) { if (ev && typeof ev === 'object') events.push(ev); });
        else if (r && typeof r === 'object') events.push(r);
        else if (r == null && EVENTS_DB_FILES[idx]) Logger.warn('[Events] FICHIER MANQUANT ou INVALIDE :', EVENTS_DB_FILES[idx]);
      });
      var byExactTitle = {};
      events.forEach(function (ev) {
        if (ev.names && typeof ev.names === 'object') {
          ['fr', 'en', 'de', 'es', 'ru', 'tr'].forEach(function (lang) {
            var v = ev.names[lang];
            if (v && typeof v === 'string') {
              var norm = normalizeForLookup(v);
              if (norm && !byExactTitle[norm]) byExactTitle[norm] = ev;
            }
          });
        }
      });
      if (window.DEBUG) Logger.debug('[Events] loadEventsDatabase — fichiers chargés:', events.length, 'titres exacts:', Object.keys(byExactTitle).length);
      _eventsDatabase = { events: events, byExactTitle: byExactTitle };
      return _eventsDatabase;
    });
    return _eventsDatabasePromise;
  }

  function _matchEventByKeywords(titleNorm, descNorm, db) {
    var events = (db && db.events) || [];
    var best = null;
    var bestScore = 0;
    var ambiguous = false;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var exclude = ev.exclude_keywords || [];
      var excluded = false;
      for (var e = 0; e < exclude.length; e++) {
        var exNorm = normalizeForLookup(exclude[e]);
        if (exNorm && (containsWord(titleNorm, exNorm) || (descNorm && containsWord(descNorm, exNorm)))) { excluded = true; break; }
      }
      if (excluded) continue;
      var score = 0;
      var keywords = ev.keywords || [];
      for (var k = 0; k < keywords.length; k++) {
        var kw = normalizeForLookup(keywords[k]);
        if (!kw) continue;
        if (containsWord(titleNorm, kw)) score += 2;
        if (descNorm && containsWord(descNorm, kw)) score += 1;
      }
      var idStr = (ev.id || '').trim();
      if (idStr && titleNorm) {
        var idSlugNorm = idStr.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
        if (idSlugNorm.length >= 2 && titleNorm.indexOf(idSlugNorm) !== -1) score += 3;
      }
      if (score >= MATCH_SCORE_THRESHOLD) {
        if (score > bestScore) {
          bestScore = score;
          best = ev;
          ambiguous = false;
        } else if (score === bestScore) {
          ambiguous = true;
          Logger.warn('[EventMatcher] ÉGALITÉ de score entre', best?.id, 'et', ev.id, '— vérifier les keywords JSON');
        }
      }
    }
    if (ambiguous) {
      Logger.warn('[EventMatcher] Match ambigu pour "' + titleNorm + '" — retour du premier résultat (score ' + bestScore + ')');
    }
    return best;
  }

  function _matchEventByImageUrl(imageUrl, db) {
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    var events = (db && db.events) || [];
    var urlLower = imageUrl.toLowerCase();
    var m = imageUrl.match(/\/([^/?#]+?)(?:\.[a-z]{2,4})?(?:[?#].*)?$/i);
    var fileSlug = m ? m[1].toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    for (var i = 0; i < events.length; i++) {
      var evDb = events[i];
      var imgUrls = evDb.image_urls || [];
      for (var j = 0; j < imgUrls.length; j++) {
        var pattern = (imgUrls[j] || '').toLowerCase().trim();
        if (pattern && urlLower.indexOf(pattern) !== -1) return evDb;
      }
      if (fileSlug) {
        var idSlug = (evDb.id || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
        if (idSlug && fileSlug === idSlug) return evDb;
      }
    }
    if (fileSlug && fileSlug.length >= 2) {
      var bestByKw = null;
      var bestKwScore = 0;
      for (var idx = 0; idx < events.length; idx++) {
        var ev = events[idx];
        var keywords = ev.keywords || [];
        var kwScore = 0;
        for (var k = 0; k < keywords.length; k++) {
          var kwNorm = normalizeForLookup(keywords[k]);
          if (!kwNorm) continue;
          if (fileSlug.indexOf(kwNorm) !== -1 || kwNorm.indexOf(fileSlug) !== -1) kwScore += 2;
        }
        var evIdNorm = (ev.id || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
        if (evIdNorm && (fileSlug.indexOf(evIdNorm) !== -1 || evIdNorm.indexOf(fileSlug) !== -1)) kwScore += 2;
        if (kwScore > bestKwScore) {
          bestKwScore = kwScore;
          bestByKw = ev;
        }
      }
      if (bestByKw) return bestByKw;
    }
    return null;
  }

  function findEventInDatabaseForScraped(ev) {
    // dom_id (événement scrapé → ev.id) en premier : id bannière unique côté DO ; catalog_id peut être partagé ou incohérent.
    var domId = ev && ev.id != null ? String(ev.id).trim() : '';
    if (domId && domId.indexOf('free-demo-') !== 0 && _eventsDatabase && Array.isArray(_eventsDatabase.events)) {
      for (var di = 0; di < _eventsDatabase.events.length; di++) {
        var evDom = _eventsDatabase.events[di];
        var doms = evDom.dom_ids;
        if (!Array.isArray(doms)) continue;
        for (var dj = 0; dj < doms.length; dj++) {
          if (String(doms[dj]).trim() === domId) return evDom;
        }
      }
    }
    var cid = (ev && (ev.catalogId || ev.catalog_id) || '').toString().trim();
    if (cid && _eventsDatabase && Array.isArray(_eventsDatabase.events)) {
      for (var ci = 0; ci < _eventsDatabase.events.length; ci++) {
        var evDb0 = _eventsDatabase.events[ci];
        if ((evDb0.id || '').toString().trim() === cid) return evDb0;
      }
    }
    var name = (ev.name || ev.title || '').trim();
    var desc = (ev.description || '').trim();
    var imageUrl = (ev.imageUrl || '').trim();
    var descNorm = desc ? normalizeForLookup(desc) : '';
    if (!name && !descNorm && !imageUrl) return null;
    if (!_eventsDatabase) return null;
    var db = _eventsDatabase;

    if (imageUrl) {
      var foundByImage = _matchEventByImageUrl(imageUrl, db);
      if (foundByImage) return foundByImage;
    }

    if (name) {
      var norm = normalizeForLookup(name);
      if (db.byExactTitle && db.byExactTitle[norm]) return db.byExactTitle[norm];
      var found = _matchEventByKeywords(norm, descNorm, db);
      if (found) return found;
    }

    if (descNorm) {
      var foundByDesc = _matchEventByKeywords(descNorm, '', db);
      if (foundByDesc) return foundByDesc;
    }

    Logger.warn('[EventMatcher] AUCUN MATCH pour :', name);
    return null;
  }

  function getScrapedEvents() {
    return Array.isArray(_cachedEvents) ? _cachedEvents : [];
  }

  /** Enrichit chaque événement avec la base JSON. Sans match : conserve les données scrapées brutes. */
  function enrichScrapedEventsWithDb(events) {
    if (!Array.isArray(events)) return events;
    var lang = (typeof window.getCurrentLang === 'function' ? window.getCurrentLang() : 'fr') || 'fr';
    return events.map(function (ev) {
      var db = findEventInDatabaseForScraped(ev);
      var rawName = (ev.name || '').trim();
      var name = (db && db.names && (db.names[lang] || db.names.fr || db.names.en)) || rawName;
      var desc = (db && db.descriptions && (db.descriptions[lang] || db.descriptions.fr || db.descriptions.en)) || (ev.description || '');
      var img = (db && db.image && db.image.trim()) || (ev.imageUrl || '');
      return Object.assign({}, ev, { name: name || rawName, description: desc, imageUrl: img, dbId: db ? db.id : undefined });
    });
  }

  function _dedupeEvents(arr) {
    if (!Array.isArray(arr)) return arr;
    var seenId = {};
    var seenComposite = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var ev = arr[i];
      var id = String(ev.id || '').trim();
      if (id && seenId[id]) continue;
      var cid = String(ev.catalogId || ev.catalog_id || '').trim();
      var end = getEndTimestamp(ev);
      var nameNorm = normalizeForLookup(String(ev.name || ev.title || '').trim());
      var compKey = null;
      if (cid && end != null) compKey = 'cid|' + cid + '|' + String(end);
      else if (nameNorm && end != null) compKey = 'nm|' + nameNorm + '|' + String(end);
      if (compKey && seenComposite[compKey]) continue;
      if (id) seenId[id] = true;
      if (compKey) seenComposite[compKey] = true;
      out.push(ev);
    }
    return out;
  }

  function _setCachedEvents(arr) {
    if (!Array.isArray(arr)) return;
    var deduped = _dedupeEvents(arr);
    var active = deduped.filter(function (ev) { return !isEventExpired(ev); });
    _cachedEvents = active;
  }

  function _applyScrapedEvents(arr) {
    if (!Array.isArray(arr)) return;
    var nowIso = new Date().toISOString();
    var withScrapedAt = arr.map(function (ev) {
      return ev.scrapedAt ? ev : Object.assign({}, ev, { scrapedAt: nowIso });
    });
    var newIds = withScrapedAt.map(function (e) { return String(e.id || ''); }).filter(Boolean);
    getScrapedEvents().forEach(function (e) {
      var id = String(e.id || '');
      if (id && newIds.indexOf(id) === -1) {
        // Ne jamais supprimer en base un évènement sans timer / sans expires_at (règle projet).
        deleteExpiredEvent(id, e);
      }
    });
    _setCachedEvents(withScrapedAt);
    upsertEventsToSupabase(enrichScrapedEventsWithDb(withScrapedAt));
    renderScrapedEvents();
    if (getScrapedEvents().length > 0) startCountdownInterval();
    if (typeof window.updateBoosterAlert === 'function') window.updateBoosterAlert();
    if (typeof window.updateBoosterWidget === 'function') window.updateBoosterWidget();
    if (typeof window.applyBoosterVisibility === 'function') window.applyBoosterVisibility();
  }

  async function upsertEventsToSupabase(events) {
    if (!Array.isArray(events) || events.length === 0) return;
    var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return;
    var payload = events.map(function (ev) {
      var endMs = getEndTimestamp(ev);
      return {
        id: String(ev.id || '').trim(),
        visible: true,
        expires_at: endMs ? new Date(endMs).toISOString() : null,
        event_data: {
          name: ev.name || ev.title || '',
          description: ev.description || '',
          imageUrl: ev.imageUrl || ev.image || ''
        }
      };
    }).filter(function (p) { return p.id; });
    if (payload.length === 0) return;
    try {
      var _r = await supabase.rpc('upsert_sidebar_events', { p_events: payload });
      if (_r.error) throw _r.error;
    } catch (e) {
      Logger.error('[Events] upsert_sidebar_events — erreur Supabase:', e?.message || e);
    }
  }

  /**
   * Supprime une ligne dans `events` (sidebar) par id.
   * @param {string} eventId
   * @param {object} [sourceEvent] — si fourni et sans échéance calculable, on n’appelle pas le RPC (évènements permanents).
   */
  async function deleteExpiredEvent(eventId, sourceEvent) {
    if (!eventId) return;
    if (String(eventId).indexOf('free-demo-') === 0) return;
    if (sourceEvent != null && typeof sourceEvent === 'object' && getEndTimestamp(sourceEvent) == null) {
      if (typeof window !== 'undefined' && window.DEBUG && typeof Logger !== 'undefined' && Logger.debug) {
        Logger.debug('[Events] deleteExpiredEvent ignoré (pas d’échéance):', eventId);
      }
      return;
    }
    var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return;
    var { error } = await supabase.rpc('delete_event_by_id', { p_id: String(eventId) });
    if (error) Logger.error('[Events] delete_event_by_id:', error);
  }

  /**
   * Charge le dernier run d’événements depuis Supabase (table do_events, remplie par le scraper).
   * @returns {Promise<Array>}
   */
  async function loadSharedEvents() {
    try {
      var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!supabase) return [];
      var { data: headRows, error: errHead } = await supabase
        .from('do_events')
        .select('run_id')
        .order('scraped_at', { ascending: false })
        .limit(1);
      if (errHead) {
        Logger.error('[Events] do_events (head) — Supabase:', errHead.message || errHead);
        return [];
      }
      if (!headRows || !headRows.length || !headRows[0].run_id) {
        if (window.DEBUG) Logger.debug('[Events] do_events — aucun enregistrement');
        return [];
      }
      var runId = headRows[0].run_id;
      var { data: rows, error } = await supabase
        .from('do_events')
        .select('id, run_id, scraped_at, dom_id, headline, body, countdown_text, countdown_end_unix, catalog_id, matched')
        .eq('run_id', runId)
        .order('dom_id', { ascending: true });
      if (error) {
        Logger.error('[Events] do_events erreur — Supabase:', error.message || error);
        return [];
      }
      if (!rows || !rows.length) {
        Logger.warn('[Events] do_events — run sans lignes — le scraper n\'a peut-être rien trouvé');
        return [];
      }
      if (window.DEBUG) Logger.debug('[Events] do_events →', rows.length, 'évènement(s), run', runId);
      var raw = rows.map(function (row) {
        var id = (row.dom_id && String(row.dom_id).trim()) ? String(row.dom_id).trim() : String(row.id);
        var endTs = row.countdown_end_unix != null && !isNaN(Number(row.countdown_end_unix))
          ? Number(row.countdown_end_unix)
          : null;
        return {
          id: id,
          name: row.headline || '',
          description: row.body || '',
          timer: row.countdown_text || '',
          scrapedAt: row.scraped_at || new Date().toISOString(),
          endTimestamp: endTs,
          catalogId: row.catalog_id || undefined,
          matched: !!row.matched
        };
      });
      return _dedupeEvents(raw);
    } catch (e) {
      Logger.error('[Events] do_events erreur — Supabase:', e?.message || e);
      return [];
    }
  }

  /**
   * Parse le timer brut (ex: "33:31:52") ou expires_at/endMs (table events Supabase)
   * @returns {number|null} Timestamp de fin en ms, ou null si pas de timer
   */
  function getEndTimestamp(ev) {
    if (ev.endMs && !isNaN(ev.endMs)) return Number(ev.endMs);
    if (ev.expires_at) {
      var t = new Date(ev.expires_at).getTime();
      if (!isNaN(t)) return t;
    }
    if (ev.endTimestamp && !isNaN(Number(ev.endTimestamp)) && Number(ev.endTimestamp) > 0) {
      return Number(ev.endTimestamp) * 1000;
    }
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

  function isEventExpired(ev) {
    var end = getEndTimestamp(ev);
    return end != null && end <= Date.now();
  }

  function formatCountdown(endMs) {
    var now = Date.now();
    var left = Math.max(0, Math.floor((endMs - now) / 1000));
    if (left <= 0) return (typeof window.i18nT === 'function' ? window.i18nT('event_countdown_finished') : 'Terminé');
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

  var TRANSITION_DURATION_MS = 400;

  /**
   * Carte événement scrapé : si l'événement est trouvé dans la base JSON (multillingues_events/),
   * utilise image, nom et description traduits ; sinon fallback sur le nom brut et les données scrapées.
   */
  function buildScrapedEventCard(ev) {
    var endMs = getEndTimestamp(ev);
    var rawName = (ev.name || '').trim();
    var lang = (typeof window.getCurrentLang === 'function') ? window.getCurrentLang() : 'fr';
    var dbEvent = findEventInDatabaseForScraped(ev);
    var name;
    var desc;
    var imageUrl;
    if (dbEvent && dbEvent.names) {
      name = (dbEvent.names[lang] || dbEvent.names.fr || dbEvent.names.en || rawName || '').trim() || (typeof window.i18nT === 'function' ? window.i18nT('event_default_name') : 'Événement');
      desc = (dbEvent.descriptions && (dbEvent.descriptions[lang] || dbEvent.descriptions.fr || dbEvent.descriptions.en)) || '';
      if (desc.length > MAX_DESC_LENGTH) desc = desc.slice(0, MAX_DESC_LENGTH) + '...';
      imageUrl = (dbEvent.image || '').trim();
    } else {
      name = rawName || (typeof window.i18nT === 'function' ? window.i18nT('event_default_name') : 'Événement');
      desc = (ev.description || '').trim();
      if (desc.length > MAX_DESC_LENGTH) desc = desc.slice(0, MAX_DESC_LENGTH) + '...';
      imageUrl = (ev.imageUrl || '').trim();
    }
    var badgeText = typeof window.i18nT === 'function' ? window.i18nT('events_current') : 'En cours';
    var timerClass = endMs && (endMs - Date.now()) < 24 * 3600 * 1000 ? 'scraped-event-timer-urgent' : 'scraped-event-timer';
    var timerHtml = endMs ? '<span class="' + timerClass + '" data-end-ms="' + endMs + '">' + escapeHtml(formatCountdown(endMs)) + '</span>' : '';
    var cardClass = 'event-card event-card-compact scraped-event-card manual-event-card';
    var evId = escapeHtml(ev.id || '');
    var hidden = (typeof window.isEventHidden === 'function') ? window.isEventHidden(ev.id) : false;
    var i18n = typeof window.i18nT === 'function' ? window.i18nT : function(k) { return k; };
    var eyeTitle = hidden ? i18n('event_show_in_sidebar') : i18n('event_hide_from_sidebar');
    var eyeClass = 'event-card-eye-btn' + (hidden ? ' event-card-eye-btn--hidden' : '');
    var html = '<div class="' + cardClass + '" data-event-id="' + evId + '">';
    html += '<button type="button" class="event-card-info-btn" data-event-id="' + evId + '" title="Info" aria-label="Info">ℹ️</button>';
    html += '<button class="' + eyeClass + '" data-action="toggle-hide" data-event-id="' + evId + '" title="' + eyeTitle + '" aria-label="' + eyeTitle + '">' + (hidden ? '🙈' : '👁') + '</button>';
    if (imageUrl) {
      html += '<img src="' + escapeHtml(imageUrl) + '" alt="" class="manual-event-bg scraped-event-img" onerror="this.style.display=\'none\'">';
    } else {
      html += '<div class="manual-event-placeholder"></div>';
    }
    html += '<span class="event-badge current">' + escapeHtml(badgeText) + '</span>';
    html += '<div class="event-card-content">';
    html += '<div class="event-name">' + escapeHtml(name) + '</div>';
    if (desc) html += '<div class="event-description scraped-event-desc">' + escapeHtml(desc) + '</div>';
    if (timerHtml) html += '<div class="event-time">' + timerHtml + '</div>';
    html += '</div></div>';
    return html;
  }

  var FREE_SHOWCASE_EVENT_COUNT = 10;

  function shuffleEventsDbCopy(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /** Carte démo FREE : pas de boutons (sidebar vitrine). */
  function buildFreeShowcaseEventCard(ev) {
    var endMs = getEndTimestamp(ev);
    var rawName = (ev.name || '').trim();
    var lang = (typeof window.getCurrentLang === 'function') ? window.getCurrentLang() : 'fr';
    var dbEvent = findEventInDatabaseForScraped(ev);
    var name;
    var desc;
    var imageUrl;
    if (dbEvent && dbEvent.names) {
      name = (dbEvent.names[lang] || dbEvent.names.fr || dbEvent.names.en || rawName || '').trim() || (typeof window.i18nT === 'function' ? window.i18nT('event_default_name') : 'Événement');
      desc = (dbEvent.descriptions && (dbEvent.descriptions[lang] || dbEvent.descriptions.fr || dbEvent.descriptions.en)) || '';
      if (desc.length > MAX_DESC_LENGTH) desc = desc.slice(0, MAX_DESC_LENGTH) + '...';
      imageUrl = (dbEvent.image || '').trim();
    } else {
      name = rawName || (typeof window.i18nT === 'function' ? window.i18nT('event_default_name') : 'Événement');
      desc = (ev.description || '').trim();
      if (desc.length > MAX_DESC_LENGTH) desc = desc.slice(0, MAX_DESC_LENGTH) + '...';
      imageUrl = (ev.imageUrl || '').trim();
    }
    var badgeText = typeof window.i18nT === 'function' ? window.i18nT('events_current') : 'En cours';
    var timerClass = endMs && (endMs - Date.now()) < 24 * 3600 * 1000 ? 'scraped-event-timer-urgent' : 'scraped-event-timer';
    var timerHtml = endMs ? '<span class="' + timerClass + '" data-end-ms="' + endMs + '">' + escapeHtml(formatCountdown(endMs)) + '</span>' : '';
    var cardClass = 'event-card event-card-compact scraped-event-card manual-event-card';
    var evId = escapeHtml(ev.id || '');
    var html = '<div class="' + cardClass + '" data-event-id="' + evId + '" data-free-demo="1">';
    if (imageUrl) {
      html += '<img src="' + escapeHtml(imageUrl) + '" alt="" class="manual-event-bg scraped-event-img" onerror="this.style.display=\'none\'">';
    } else {
      html += '<div class="manual-event-placeholder"></div>';
    }
    html += '<span class="event-badge current">' + escapeHtml(badgeText) + '</span>';
    html += '<div class="event-card-content">';
    html += '<div class="event-name">' + escapeHtml(name) + '</div>';
    if (desc) html += '<div class="event-description scraped-event-desc">' + escapeHtml(desc) + '</div>';
    if (timerHtml) html += '<div class="event-time">' + timerHtml + '</div>';
    html += '</div></div>';
    return html;
  }

  function renderFreeShowcaseEvents() {
    var container = document.getElementById('sidebarScrapedEvents');
    if (!container) return;
    if (container._intervalId) {
      clearInterval(container._intervalId);
      container._intervalId = null;
    }
    var resetBtn = document.getElementById('sidebarScrapedEventsResetHidden');
    if (resetBtn) resetBtn.style.display = 'none';

    if (!_eventsDatabase || !_eventsDatabase.events || _eventsDatabase.events.length === 0) {
      loadEventsDatabase().then(function () { renderFreeShowcaseEvents(); }).catch(function () {
        var t = typeof window.i18nT === 'function' ? window.i18nT('no_event_in_progress') : '—';
        container.innerHTML = '<div class="no-event">' + escapeHtml(t) + '</div>';
      });
      return;
    }

    var pool = shuffleEventsDbCopy(_eventsDatabase.events.filter(function (db) {
      return db && db.id && db.names && (db.names.fr || db.names.en);
    }));
    var pick = pool.slice(0, FREE_SHOWCASE_EVENT_COUNT);
    if (pick.length === 0) {
      container.innerHTML = '<div class="no-event">' + escapeHtml(typeof window.i18nT === 'function' ? window.i18nT('no_event_in_progress') : '—') + '</div>';
      return;
    }

    var lang = (typeof window.getCurrentLang === 'function' ? window.getCurrentLang() : 'fr') || 'fr';
    var synthetic = pick.map(function (db, idx) {
      var nm = (db.names[lang] || db.names.fr || db.names.en || 'Event').trim();
      return {
        id: 'free-demo-' + db.id + '-' + idx,
        name: nm,
        description: (db.descriptions && (db.descriptions[lang] || db.descriptions.fr)) || '',
        endMs: Date.now() + ((idx + 5) % 18 + 4) * 3600000
      };
    });

    if (synthetic.length === 1) {
      container.innerHTML = '<div class="events-carousel-viewport"><div class="events-carousel-track events-carousel-track--single"><div class="events-carousel-slide">' + buildFreeShowcaseEventCard(synthetic[0]) + '</div></div></div>';
      container.classList.remove('events-carousel--multi');
      container._goTo = null;
      container._next = null;
      container._total = 0;
      if (synthetic[0].endMs) startCountdownInterval();
      return;
    }

    var total = synthetic.length;
    var slidePct = (100 / total).toFixed(2);
    var slidesHtml = synthetic.map(function (ev) {
      return '<div class="events-carousel-slide" style="flex:0 0 ' + slidePct + '%">' + buildFreeShowcaseEventCard(ev) + '</div>';
    }).join('');
    var dotsHtml = synthetic.map(function (_, i) {
      return '<button type="button" class="events-carousel-dot' + (i === 0 ? ' active' : '') + '" data-index="' + i + '" aria-label="Slide ' + (i + 1) + '" tabindex="-1">' + '</button>';
    }).join('');
    container.innerHTML =
      '<div class="events-carousel-viewport">' +
        '<div class="events-carousel-track" style="width:' + total * 100 + '%; transform:translateX(0)">' + slidesHtml + '</div>' +
      '</div>' +
      '<div class="events-carousel-nav">' +
        '<button type="button" class="events-carousel-prev" aria-hidden="true" tabindex="-1">‹</button>' +
        '<div class="events-carousel-dots">' + dotsHtml + '</div>' +
        '<button type="button" class="events-carousel-next" aria-hidden="true" tabindex="-1">›</button>' +
      '</div>';
    container.classList.add('events-carousel--multi');
    container.setAttribute('data-carousel-index', '0');
    container._isTransitioning = false;

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
    attachScrapedCarouselHoverOnce(container);
    startCountdownInterval();
  }

  function attachScrapedCarouselHoverOnce(container) {
    if (container._carouselHoverAttached) return;
    container._carouselHoverAttached = true;
    container.addEventListener('mouseenter', function () {
      if (container._intervalId) { clearInterval(container._intervalId); container._intervalId = null; }
    });
    container.addEventListener('mouseleave', function () {
      if (container._total > 1 && !container._intervalId && container._next) container._intervalId = setInterval(container._next, 15000);
    });
  }

  function _updateScrapedResetBtn(container, allEvents, visibleEvents) {
    var hiddenCount = allEvents.length - visibleEvents.length;
    var resetBtnId = 'sidebarScrapedEventsResetHidden';
    var btn = document.getElementById(resetBtnId);
    if (hiddenCount > 0) {
      if (!btn) {
        btn = document.createElement('button');
        btn.id = resetBtnId;
        btn.type = 'button';
        btn.className = 'sidebar-events-reset-hidden';
        var parent = container.parentNode;
        if (parent) parent.appendChild(btn);
      }
      var tShowAll = typeof window.i18nT === 'function' ? window.i18nT('event_show_all_hidden').replace('{{n}}', hiddenCount) : ('Show all (' + hiddenCount + ' hidden)');
      btn.textContent = '👁 ' + tShowAll;
      btn.style.display = '';
      btn.onclick = function () {
        if (typeof window.getHiddenEventIds !== 'function') return;
        var scrapedIds = allEvents.map(function (ev) { return String(ev.id || ''); });
        var remaining = window.getHiddenEventIds().filter(function (id) { return scrapedIds.indexOf(id) === -1; });
        if (typeof window.toggleEventHidden === 'function' && typeof window.saveHiddenEventIds === 'function') {
          window.saveHiddenEventIds(remaining);
        }
        renderScrapedEvents();
        if (typeof window.updateEventsDisplay === 'function') window.updateEventsDisplay();
      };
    } else if (btn) {
      btn.style.display = 'none';
    }
  }

  function renderScrapedEvents() {
    var container = document.getElementById('sidebarScrapedEvents');
    if (!container) return;
    if (container._intervalId) { clearInterval(container._intervalId); container._intervalId = null; }
    var allEvents = getScrapedEvents().filter(function (ev) {
      if (isEventExpired(ev)) return false;
      var dbEvent = findEventInDatabaseForScraped(ev);
      return !dbEvent || dbEvent.visible !== false;
    });
    var hiddenIds = (typeof window.getHiddenEventIds === 'function') ? window.getHiddenEventIds() : [];
    var events = hiddenIds.length > 0
      ? allEvents.filter(function (ev) { return hiddenIds.indexOf(String(ev.id || '')) === -1; })
      : allEvents;
    var noEventText = (typeof window.i18nT === 'function' ? window.i18nT('no_event_in_progress') : 'Aucun événement en cours');
    if (events.length === 0) {
      container.innerHTML = '<div class="no-event">' + noEventText + '</div>';
      container.classList.remove('events-carousel--multi');
      container._goTo = null;
      container._next = null;
      container._total = 0;
      _updateScrapedResetBtn(container, allEvents, events);
      return;
    }
    if (events.length === 1) {
      container.innerHTML = '<div class="events-carousel-viewport"><div class="events-carousel-track events-carousel-track--single"><div class="events-carousel-slide">' + buildScrapedEventCard(events[0]) + '</div></div></div>';
      container.classList.remove('events-carousel--multi');
      container._goTo = null;
      container._next = null;
      container._total = 0;
      _updateScrapedResetBtn(container, allEvents, events);
      return;
    }
    var slidePct = (100 / events.length).toFixed(2);
    var slidesHtml = events.map(function (ev) {
      return '<div class="events-carousel-slide" style="flex:0 0 ' + slidePct + '%">' + buildScrapedEventCard(ev) + '</div>';
    }).join('');
    var dotsHtml = events.map(function (_, i) {
      return '<button type="button" class="events-carousel-dot' + (i === 0 ? ' active' : '') + '" data-index="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
    }).join('');
    container.innerHTML =
      '<div class="events-carousel-viewport">' +
        '<div class="events-carousel-track" style="width:' + events.length * 100 + '%; transform:translateX(0)">' + slidesHtml + '</div>' +
      '</div>' +
      '<div class="events-carousel-nav">' +
        '<button type="button" class="events-carousel-prev" aria-label="' + escapeHtml(typeof window.i18nT === 'function' ? window.i18nT('carousel_prev') : 'Précédent') + '">‹</button>' +
        '<div class="events-carousel-dots">' + dotsHtml + '</div>' +
        '<button type="button" class="events-carousel-next" aria-label="' + escapeHtml(typeof window.i18nT === 'function' ? window.i18nT('carousel_next') : 'Suivant') + '">›</button>' +
      '</div>';
    container.classList.add('events-carousel--multi');
    container.setAttribute('data-carousel-index', '0');
    container._isTransitioning = false;
    var total = events.length;

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
    attachScrapedCarouselHoverOnce(container);

    _updateScrapedResetBtn(container, allEvents, events);
  }

  function updateCountdowns() {
    var now = Date.now();
    var expiredIds = [];
    document.querySelectorAll('.scraped-event-timer, .scraped-event-timer-urgent').forEach(function (el) {
      var endMs = parseInt(el.getAttribute('data-end-ms'), 10);
      if (!Number.isFinite(endMs) || endMs <= 0) return;
      if (endMs <= now) {
        var card = el.closest && el.closest('[data-event-id]');
        if (card) {
          var eid = card.getAttribute('data-event-id');
          if (eid && expiredIds.indexOf(eid) === -1) expiredIds.push(eid);
        }
      }
      el.textContent = formatCountdown(endMs);
    });
    expiredIds.forEach(function (id) {
      if (String(id).indexOf('free-demo-') === 0) return;
      var ev = getScrapedEvents().find(function (e) { return String(e.id || '') === String(id); });
      if (ev && getEndTimestamp(ev) == null) return;
      deleteExpiredEvent(id, ev);
      _setCachedEvents(getScrapedEvents().filter(function (e) { return String(e.id || '') !== id; }));
    });
    if (expiredIds.length > 0) {
      if (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'FREE') {
        renderFreeShowcaseEvents();
      } else {
        renderScrapedEvents();
      }
    }
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
    if (!Array.isArray(events)) return Promise.resolve();
    return loadEventsDatabase().then(function () {
      _applyScrapedEvents(enrichScrapedEventsWithDb(events));
    }).catch(function () {
      _applyScrapedEvents(events);
    });
  }

  var _lastRefreshEventsAt = 0;
  var REFRESH_EVENTS_THROTTLE_MS = 60000;
  function refreshEventsFromSupabase(force) {
    if (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'FREE') {
      loadEventsDatabase().then(function () { renderFreeShowcaseEvents(); }).catch(function () { renderFreeShowcaseEvents(); });
      return;
    }
    var now = Date.now();
    var cacheEmpty = getScrapedEvents().length === 0;
    if (!force && !cacheEmpty && now - _lastRefreshEventsAt < REFRESH_EVENTS_THROTTLE_MS && _lastRefreshEventsAt > 0) return;
    _lastRefreshEventsAt = now;
    loadEventsDatabase().then(function () {
      return loadSharedEvents().then(function (sharedEvents) {
        var raw = Array.isArray(sharedEvents) ? sharedEvents : [];
        var enriched = enrichScrapedEventsWithDb(raw);
        var deduped = _dedupeEvents(enriched);
        _setCachedEvents(deduped);
        if (deduped.length > 0) upsertEventsToSupabase(deduped);
      });
    }).then(function () {
      renderScrapedEvents();
      if (getScrapedEvents().some(function (e) { return getEndTimestamp(e); })) startCountdownInterval();
      if (typeof window.updateBoosterAlert === 'function') window.updateBoosterAlert();
      if (typeof window.updateBoosterWidget === 'function') window.updateBoosterWidget();
      if (typeof window.applyBoosterVisibility === 'function') window.applyBoosterVisibility();
    }).catch(function () {
      renderScrapedEvents();
    });
  }

  function bootstrapEventsSidebar() {
    if (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'FREE') {
      loadEventsDatabase().then(function () { renderFreeShowcaseEvents(); }).catch(function () { renderFreeShowcaseEvents(); });
    } else {
      loadEventsDatabase().then(function () { refreshEventsFromSupabase(); }).catch(function () { refreshEventsFromSupabase(); });
    }
  }

  function init() {
    bootstrapEventsSidebar();
    window.addEventListener('permissionsApplied', function () {
      bootstrapEventsSidebar();
    });

  }

  // ── Détection booster 50% ──────────────────────────────────────────────────
  // Source de vérité unique : les events scrapés déjà présents dans cette IIFE.
  // updateBoosterAlert() (boosters.js) délègue ici via window.getActiveBoosterType.

  var _BOOSTER_HONOR_KW = [
    'honor', 'honneur', 'honour', 'honnor', 'ehre', 'honra', 'честь', 'onur',
    'honor_day', 'honor day', 'honnor_day', 'honnor day', 'honneur_day', 'honneur day', 'honour_day', 'honour day',
    'ehre_tag', 'honra_dia', 'honra día', 'jour honneur', 'journée double honneur', 'honor tag'
  ];
  var _BOOSTER_XP_KW = [
    'experience', 'xp', 'erfahrung', 'experiencia', 'опыт', 'deneyim',
    'xp_day', 'xp day', 'experience_day', 'experience day', 'exp_day', 'exp day',
    'erfahrung_tag', 'experiencia_dia', 'experiencia día', 'jour xp', 'jour exp',
    'journée double xp', 'journée xp', 'xp tag', 'experience tag'
  ];
  var _BOOSTER_DAY_PHRASES = [
    'honor_day', 'honor day', 'honnor_day', 'honnor day', 'honneur_day', 'honneur day',
    'honour_day', 'honour day', 'journée double honneur', 'journée honneur',
    'xp_day', 'xp day', 'experience_day', 'experience day',
    'journée double xp', 'journée xp'
  ];

  var _BOOSTER_HONOR_IDS = ['honor_day', 'honnor_day', 'honour_day', 'ehren_tag', 'honor_day_2'];
  var _BOOSTER_XP_IDS    = ['xp_day', 'experience_day', 'xp_day_2', 'exp_day'];

  function _detectBoosterType(text) {
    if (!text || typeof text !== 'string') return null;
    var t = text.toLowerCase();
    var hasDayPhrase = _BOOSTER_DAY_PHRASES.some(function (p) { return t.indexOf(p) !== -1; });
    if (!/50\s*%/.test(t) && !hasDayPhrase) return null;
    var hasHonor = _BOOSTER_HONOR_KW.some(function (kw) { return t.indexOf(kw) !== -1; });
    var hasXp    = _BOOSTER_XP_KW.some(function (kw)    { return t.indexOf(kw) !== -1; });
    if (hasHonor && !hasXp) return 'honor';
    if (hasXp && !hasHonor) return 'xp';
    if (hasHonor) return 'honor';
    return null;
  }

  /**
   * Retourne le type de booster actif ('honor', 'xp') ou null.
   * Priorité : dbId matché au JSON > détection textuelle.
   */
  function getActiveBoosterType() {
    var events = getScrapedEvents();
    var now = Date.now();
    var foundHonor = false;
    var foundXp    = false;
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var endMs = getEndTimestamp(ev);
      if (endMs != null && endMs <= now) continue;
      var evDbId = (ev.dbId || '').toLowerCase();
      if (evDbId && _BOOSTER_HONOR_IDS.indexOf(evDbId) !== -1) { foundHonor = true; continue; }
      if (evDbId && _BOOSTER_XP_IDS.indexOf(evDbId) !== -1)    { foundXp    = true; continue; }
      var text = ((ev.name || '') + ' ' + (ev.description || '')).trim();
      var type = _detectBoosterType(text);
      if (type === 'honor') foundHonor = true;
      if (type === 'xp')    foundXp    = true;
    }
    if (foundHonor) return 'honor';
    if (foundXp)    return 'xp';
    return null;
  }

  function getScrapedEventForModal(eventId) {
    var list = getScrapedEvents();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id || '') !== String(eventId)) continue;
      var ev = list[i];
      var rawName = (ev.name || '').trim();
      var lang = (typeof window.getCurrentLang === 'function') ? window.getCurrentLang() : 'fr';
      var dbEvent = findEventInDatabaseForScraped(ev);
      var name = (dbEvent && dbEvent.names) ? (dbEvent.names[lang] || dbEvent.names.fr || dbEvent.names.en || rawName || '').trim() : rawName;
      var desc = (dbEvent && dbEvent.descriptions) ? (dbEvent.descriptions[lang] || dbEvent.descriptions.fr || dbEvent.descriptions.en || '') : (ev.description || '');
      return { id: ev.id, name: name || 'Événement', description: (desc || '').trim(), endDate: getEndTimestamp(ev), startDate: null, scraped: true };
    }
    return null;
  }

  window.getScrapedEvents = getScrapedEvents;
  window.getScrapedEventForModal = getScrapedEventForModal;
  window.updateScrapedEventsDisplay = renderScrapedEvents;
  window.refreshEventsFromSupabase = refreshEventsFromSupabase;
  window.setScrapedEventsFromIPC = setScrapedEventsFromIPC;
  window.loadEventsDatabase = loadEventsDatabase;
  window.loadSharedEvents = loadSharedEvents;
  window.getActiveBoosterType = getActiveBoosterType;
  window.renderFreeShowcaseEvents = renderFreeShowcaseEvents;

  window.addEventListener('languageChanged', function () {
    if (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'FREE') {
      renderFreeShowcaseEvents();
    } else {
      renderScrapedEvents();
    }
  });

  window.addEventListener('beforeunload', stopCountdownInterval);
  window.addEventListener('userLoggedOut', stopCountdownInterval);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();