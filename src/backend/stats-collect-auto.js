// Récolte auto des stats (client Flash ou scraper login). FREE : 24 h entre deux récoltes ; PRO : 6 h.

function statsCollectEscapeHtml(s) {
  if (s == null) return '';
  if (typeof escapeHtml === 'function') return escapeHtml(s);
  var div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

var _RECAP_COMPANY_LETTERS = { mmo: 'MMO', eic: 'EIC', vru: 'VRU' };
function recapCompanyBadgeKey(company) {
  if (!company || typeof company !== 'string') return '';
  var c = String(company).trim().toLowerCase();
  return _RECAP_COMPANY_LETTERS[c] ? c : '';
}
function recapCompanySlotHtml(company) {
  var key = recapCompanyBadgeKey(company);
  var text = key ? _RECAP_COMPANY_LETTERS[key] : (company != null ? String(company).trim().toUpperCase() : '');
  if (!text) return '';
  var cls = key ? (key === 'mmo' ? 'company-mmo' : (key === 'eic' ? 'company-eic' : 'company-vru')) : 'company-other';
  return '<span class="company-badge ' + cls + '">' + statsCollectEscapeHtml(text) + '</span>';
}

const COLLECT_COOLDOWN_MS_PRO = 6 * 60 * 60 * 1000;
const COLLECT_COOLDOWN_MS_FREE = 24 * 60 * 60 * 1000;

/** Dernier profil connu pour réafficher le libellé de cooldown au changement de langue */
var _collectCooldownProfileSnapshot = null;

function getCollectCooldownMs(badge) {
  var b = (badge || '').toString().toUpperCase();
  if (b === 'ADMIN' || b === 'SUPERADMIN') return 0;
  if (b === 'FREE') return COLLECT_COOLDOWN_MS_FREE;
  return COLLECT_COOLDOWN_MS_PRO;
}

function formatCooldownRemaining(remainingMs) {
  if (remainingMs <= 0) return '0s';
  var h = Math.floor(remainingMs / 3600000);
  var m = Math.floor((remainingMs % 3600000) / 60000);
  var s = Math.floor((remainingMs % 60000) / 1000);
  var parts = [];
  if (h > 0) parts.push(h + 'h');
  if (m > 0 || h > 0) parts.push(m + 'min');
  parts.push(s + 's');
  return parts.join(' ');
}

function _localeTagForUiLang(lang) {
  var map = { fr: 'fr-FR', de: 'de-DE', ru: 'ru-RU', es: 'es-ES', en: 'en-US', tr: 'tr-TR' };
  return map[lang] || 'fr-FR';
}

function _i18nFmtStatsRecovery(template, map) {
  var s = template || '';
  if (!map) return s;
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) {
      s = s.split('{{' + k + '}}').join(String(map[k]));
    }
  }
  return s;
}

/**
 * Ligne du type « Prochaine récupération : demain à 16:52 » (FREE, cooldown 24 h depuis lastAt).
 * @param {number} lastAtMs - timestamp dernière récolte réussie
 * @returns {string} chaîne vide si pas de cooldown actif
 */
function formatNextRecoveryFullLine(lastAtMs) {
  var cd = COLLECT_COOLDOWN_MS_FREE;
  if (!lastAtMs || lastAtMs <= 0) return '';
  var nextMs = lastAtMs + cd;
  if (nextMs <= Date.now()) return '';
  var t = (typeof window !== 'undefined' && typeof window.i18nT === 'function') ? window.i18nT : function (k) { return k; };
  var lang = (typeof getCurrentLang === 'function') ? getCurrentLang() : 'fr';
  var loc = _localeTagForUiLang(lang);
  var next = new Date(nextMs);
  var now = new Date();
  var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var startTomorrow = startToday + 86400000;
  var startDayAfter = startTomorrow + 86400000;
  var timeStr = next.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  var whenKey;
  var params = { time: timeStr };
  if (nextMs >= startToday && nextMs < startTomorrow) {
    whenKey = 'stats_recovery_when_today';
  } else if (nextMs >= startTomorrow && nextMs < startDayAfter) {
    whenKey = 'stats_recovery_when_tomorrow';
  } else {
    whenKey = 'stats_recovery_when_date';
    params.date = next.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  var whenPart = _i18nFmtStatsRecovery(t(whenKey), params);
  return _i18nFmtStatsRecovery(t('stats_next_recovery_full'), { when: whenPart });
}

var RANK_ID_TO_FR_RECAP = {
  'rank_1': 'Pilote de 1ère classe', 'rank_2': 'Caporal', 'rank_3': 'Caporal-chef', 'rank_4': 'Sergent',
  'rank_5': 'Sergent-chef', 'rank_6': 'Adjudant', 'rank_7': 'Adjudant-chef', 'rank_8': 'Major',
  'rank_9': 'Sous-lieutenant', 'rank_10': 'Lieutenant', 'rank_11': 'Capitaine', 'rank_12': 'Capitaine d\'escadron',
  'rank_13': 'Commandant', 'rank_14': 'Commandant d\'escadron', 'rank_15': 'Lieutenant-colonel', 'rank_16': 'Colonel',
  'rank_17': 'Général de brigade', 'rank_18': 'Général de division', 'rank_19': 'Général de corps d\'armée',
  'rank_20': 'Général d\'armée', 'rank_21': 'Maréchal',
  'basic_space_pilot': 'Pilote de 1ère classe', 'space_pilot': 'Caporal', 'chief_space_pilot': 'Caporal-chef',
  'basic_sergeant': 'Sergent', 'sergeant': 'Sergent-chef', 'chief_sergeant': 'Adjudant',
  'basic_lieutenant': 'Adjudant-chef', 'lieutenant': 'Major', 'chief_lieutenant': 'Sous-lieutenant',
  'basic_captain': 'Lieutenant', 'captain': 'Capitaine', 'chief_captain': 'Capitaine d\'escadron',
  'basic_major': 'Commandant', 'major': 'Commandant d\'escadron', 'chief_major': 'Lieutenant-colonel',
  'basic_colonel': 'Colonel', 'colonel': 'Général de brigade', 'chief_colonel': 'Général de division',
  'basic_general': 'Général de corps d\'armée', 'general': 'Général d\'armée', 'chief_general': 'Maréchal'
};

function formatRecapNum(n) {
  if (n == null || n === '') return '—';
  var x = Number(n);
  return isNaN(x) ? '—' : String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

var _statsRecapCloseTimer = null;
var _statsRecapListenersBound = false;
var STATS_RECAP_AUTO_CLOSE_MS = 30000;

function formatRecapServerDisplay(serverCode) {
  if (serverCode == null || serverCode === '') return '—';
  var key = String(serverCode).toLowerCase().trim();
  var map = (typeof window !== 'undefined' && window.SERVER_CODE_TO_DISPLAY) || (typeof SERVER_CODE_TO_DISPLAY !== 'undefined' ? SERVER_CODE_TO_DISPLAY : {});
  var label = map[key];
  var bracket = key.toUpperCase();
  if (label) return label + ' [' + bracket + ']';
  return String(serverCode) + ' [' + bracket + ']';
}

function recapFindRankIndex(initialRank) {
  if (initialRank == null || typeof RANKS_DATA === 'undefined' || !RANKS_DATA.length) return -1;
  var ir = String(initialRank).trim();
  var m = ir.match(/^rank_(\d+)$/i);
  if (m) {
    var id = parseInt(m[1], 10);
    var i = RANKS_DATA.findIndex(function (r) { return r.rank_id === id; });
    if (i >= 0) return i;
  }
  if (typeof RANK_KEY_TO_RANK_NAME !== 'undefined' && RANK_KEY_TO_RANK_NAME[ir]) {
    var rk = RANK_KEY_TO_RANK_NAME[ir];
    var j = RANKS_DATA.findIndex(function (r) { return r.rank === rk; });
    if (j >= 0) return j;
  }
  var key = ir.toLowerCase().replace(/-/g, '_').replace(/^(rank_|hof_|hof_rank_)/, '');
  var k = RANKS_DATA.findIndex(function (r) { return r.rank === key; });
  if (k >= 0) return k;
  return -1;
}

function hideStatsRecap() {
  if (_statsRecapCloseTimer) {
    clearTimeout(_statsRecapCloseTimer);
    _statsRecapCloseTimer = null;
  }
  var overlay = document.getElementById('statsRecapOverlay');
  if (overlay) overlay.style.display = 'none';
}

function initStatsRecapOverlayListeners() {
  if (_statsRecapListenersBound) return;
  _statsRecapListenersBound = true;
  var overlay = document.getElementById('statsRecapOverlay');
  var closeBtn = document.getElementById('statsRecapCloseBtn');
  var modal = overlay ? overlay.querySelector('.stats-recap-modal') : null;
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      hideStatsRecap();
    });
  }
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideStatsRecap();
    });
  }
  if (modal) {
    modal.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }
}

function profileUpdateOnlyDisplay(data, nowIso) {
  return {
    game_pseudo: data.game_pseudo != null ? data.game_pseudo : undefined,
    server: data.server != null ? data.server : undefined,
    company: data.company != null ? data.company : undefined,
    last_stats_collected_at: nowIso
  };
}

async function persistProfileDisplayUpdate(supabase2, update) {
  if (!supabase2 || !update || Object.keys(update).length === 0) return { ok: true };
  var rpcRes = await supabase2.rpc('update_profile_display', {
    p_game_pseudo: update.game_pseudo != null ? update.game_pseudo : null,
    p_server: update.server != null ? update.server : null,
    p_company: update.company != null ? update.company : null,
    p_last_stats_collected_at: update.last_stats_collected_at != null ? update.last_stats_collected_at : null
  });
  if (rpcRes.error) return { ok: false, message: rpcRes.error.message || 'Erreur enregistrement' };
  if (!rpcRes.data || rpcRes.data.success !== true) {
    return { ok: false, message: (rpcRes.data && rpcRes.data.error) || 'Erreur enregistrement' };
  }
  return { ok: true };
}

function showRecapFromScan(data) {
  var overlay = document.getElementById('statsRecapOverlay');
  if (!overlay) return;
  initStatsRecapOverlayListeners();
  if (_statsRecapCloseTimer) {
    clearTimeout(_statsRecapCloseTimer);
    _statsRecapCloseTimer = null;
  }

  data = data || {};
  var setText = function (id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text != null && text !== '' ? text : '—';
  };

  setText('recapServer', formatRecapServerDisplay(data.server));
  setText('recapPseudo', data.game_pseudo || '—');
  setText('recapPlayerId', data.player_id != null ? String(data.player_id) : '—');
  setText('recapXp', formatRecapNum(data.initial_xp));
  setText('recapHonor', formatRecapNum(data.initial_honor));
  setText('recapRankPoints', formatRecapNum(data.initial_rank_points));
  setText('recapNextRankPoints', formatRecapNum(data.next_rank_points));

  var companySlot = document.getElementById('recapCompanySlot');
  if (companySlot) {
    var companyHtml = recapCompanySlotHtml(data.company);
    companySlot.innerHTML = companyHtml || '<span class="stats-recap-value">—</span>';
  }

  var serverForImg = data.server;
  var rankRaw = data.initial_rank;
  var gradeImg = document.getElementById('recapGradeImg');
  var fallbackName = rankRaw ? (RANK_ID_TO_FR_RECAP[rankRaw] || rankRaw) : '—';
  var tooltipFn = (typeof window !== 'undefined' && typeof window.getGradeTooltip === 'function') ? window.getGradeTooltip : null;
  var rankImgFn = (typeof window !== 'undefined' && typeof window.getRankImg === 'function') ? window.getRankImg : null;
  var tip = tooltipFn ? tooltipFn(rankRaw, fallbackName) : fallbackName;
  var imgSrc = rankImgFn ? rankImgFn(rankRaw, serverForImg) : '';
  if (gradeImg) {
    if (imgSrc) {
      gradeImg.src = imgSrc;
      gradeImg.alt = tip || '';
      gradeImg.title = tip || '';
      gradeImg.style.display = '';
    } else {
      gradeImg.removeAttribute('src');
      gradeImg.alt = '';
      gradeImg.title = tip || '';
      gradeImg.style.display = 'none';
    }
  }

  var nextImgEl = document.getElementById('recapNextGradeImg');
  var idx = recapFindRankIndex(rankRaw);
  if (nextImgEl) {
    if (idx >= 0 && idx + 1 < RANKS_DATA.length) {
      var nextR = RANKS_DATA[idx + 1];
      var nextKey = 'rank_' + nextR.rank_id;
      var nextTip = tooltipFn ? tooltipFn(nextKey, nextR.name) : nextR.name;
      nextImgEl.src = nextR.img || '';
      nextImgEl.alt = nextTip || '';
      nextImgEl.title = nextTip || '';
      nextImgEl.style.display = nextR.img ? '' : 'none';
    } else {
      nextImgEl.removeAttribute('src');
      nextImgEl.alt = '';
      nextImgEl.title = '';
      nextImgEl.style.display = 'none';
    }
  }

  if (typeof applyTranslations === 'function' && typeof getCurrentLang === 'function') {
    applyTranslations(getCurrentLang());
  }

  overlay.style.display = 'flex';
  _statsRecapCloseTimer = setTimeout(function () {
    _statsRecapCloseTimer = null;
    hideStatsRecap();
  }, STATS_RECAP_AUTO_CLOSE_MS);
}

async function onCollectSuccess(data, nowIso) {
  if (data && data.player_id && typeof UserPreferencesAPI !== 'undefined') {
    UserPreferencesAPI.setPreferences({ active_player_id: data.player_id, active_player_server: data.server }).catch(function () {});
    UserPreferencesAPI.invalidateCache();
  }
  var active = await (window.electronPlayerStatsCredentials && window.electronPlayerStatsCredentials.getActive ? window.electronPlayerStatsCredentials.getActive() : null);
  if (active && active.id && data) {
    var api = window.electronPlayerStatsCredentials;
    if (api && typeof api.update === 'function') {
      await api.update(active.id, {
        current_rank: data.initial_rank,
        honor: data.initial_honor,
        xp: data.initial_xp,
        rank_points: data.initial_rank_points,
        player_id: data.player_id,
        player_pseudo: data.game_pseudo,
        player_server: data.server
      });
    }
  }
  if (typeof addSessionFromScan === 'function') await addSessionFromScan(data);
  showRecapFromScan(data);
  if (typeof showToast === 'function') showToast('Scan réussi', 'success');
  updateCollectStatsUI({ last_stats_collected_at: nowIso });
  if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
  if (typeof window.refreshFollowedPlayersSidebar === 'function') window.refreshFollowedPlayersSidebar();
  if (typeof window.sendNotification === 'function' && typeof getSetting === 'function' && getSetting('notificationsEnabled') && typeof currentHasFeature === 'function' && currentHasFeature('notificationsWindows')) {
    window.sendNotification('Récupérer mes stats', 'Scraping de votre compte DarkOrbit terminé.');
  }
}

window.buildManualStatsDropdown = function buildManualStatsDropdown() {
  var optionsEl = document.getElementById('options');
  if (!optionsEl || !optionsEl.classList.contains('dropdown-options') || optionsEl.children.length > 0) return;
  if (typeof RANKS_DATA === 'undefined' || !RANKS_DATA.length) return;
  RANKS_DATA.forEach(function (r) {
    var opt = document.createElement('div');
    opt.className = 'option';
    opt.dataset.name = r.name;
    opt.dataset.img = r.img || '';
    var nm = statsCollectEscapeHtml(r.name || '');
    var im = statsCollectEscapeHtml(r.img || '');
    opt.innerHTML = '<div class="grade-block"><div class="grade-block-name">' + nm + '</div><div class="grade-block-icon"><img src="' + im + '" alt="' + nm + '" class="grade-block-img"></div></div>';
    optionsEl.appendChild(opt);
  });
};

function updateStatsManualUI() {
  var section = document.getElementById('statsManualSection');
  if (!section) return;
  section.style.display = 'none';
}

function showCollectProgress(show) {
  var section = document.getElementById('statsCollectAutoSection');
  if (section) section.style.display = show ? 'flex' : 'none';
  var wrap = document.getElementById('collectStatsProgressWrap');
  if (wrap) wrap.style.display = show ? 'block' : 'none';
  var fill = document.getElementById('collectStatsProgressFill');
  var labelEl = document.getElementById('collectStatsProgressLabel');
  if (fill) {
    fill.style.width = show ? '5%' : '0%';
    fill.style.animation = show ? 'collect-progress-pulse 1.5s ease-in-out infinite' : 'none';
  }
  if (labelEl) labelEl.textContent = show ? 'Démarrage…' : '';
}
function updateCollectProgress(percent, label) {
  var fill = document.getElementById('collectStatsProgressFill');
  var labelEl = document.getElementById('collectStatsProgressLabel');
  var pct = percent != null ? Math.min(100, Math.max(0, percent)) : 0;
  if (fill) {
    fill.style.width = (pct > 0 ? Math.max(2, pct) : pct) + '%';
    fill.style.animation = pct >= 100 ? 'none' : 'collect-progress-pulse 1.5s ease-in-out infinite';
  }
  if (labelEl) labelEl.textContent = label || '';
}

function updateCollectStatsUI(profile) {
  var section = document.getElementById('statsCollectAutoSection');
  var btn = document.getElementById('collectStatsFromGameBtn');
  var cooldownEl = document.getElementById('collectStatsCooldownText');
  if (!section) return;

  if (!profile) {
    _collectCooldownProfileSnapshot = null;
  } else if (Object.prototype.hasOwnProperty.call(profile, 'last_stats_collected_at')) {
    _collectCooldownProfileSnapshot = profile;
  }

  var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' ? BackendAPI.getUserBadge() : 'FREE');
  section.style.display = '';
  updateStatsManualUI();

  var cooldownMs = getCollectCooldownMs(badge);
  var lastAt = profile && profile.last_stats_collected_at ? new Date(profile.last_stats_collected_at).getTime() : 0;

  if (btn) {
    if (badge === 'ADMIN' || badge === 'SUPERADMIN') {
      btn.disabled = false;
    } else {
      var remaining = lastAt && cooldownMs > 0 ? lastAt + cooldownMs - Date.now() : 0;
      if (remaining > 0) {
        btn.disabled = true;
      } else {
        btn.disabled = false;
      }
    }
  }
  if (cooldownEl) {
    cooldownEl.textContent = '';
    if (btn && btn.disabled && badge !== 'ADMIN' && badge !== 'SUPERADMIN' && lastAt > 0 && cooldownMs > 0) {
      var rem = lastAt + cooldownMs - Date.now();
      if (rem > 0) {
        if ((badge || '').toString().toUpperCase() === 'FREE') {
          cooldownEl.textContent = formatNextRecoveryFullLine(lastAt);
        } else {
          var tRem = (typeof window !== 'undefined' && typeof window.i18nT === 'function')
            ? window.i18nT('stats_collect_cooldown_pro')
            : 'Prochaine collecte dans {{remaining}}';
          cooldownEl.textContent = _i18nFmtStatsRecovery(tRem, { remaining: formatCooldownRemaining(rem) });
        }
      }
    }
  }
}

function hasActiveDarkOrbitCredentials() {
  if (typeof UserPreferencesAPI !== 'undefined' && typeof UserPreferencesAPI.getActivePlayerInfoSync === 'function') {
    var info = UserPreferencesAPI.getActivePlayerInfoSync();
    if (info && (info.player_id || info.player_server || info.player_pseudo)) {
      return true;
    }
  }
  return false;
}

function updateStatsCollectHelpMessage() {
  var helpEl = document.getElementById('statsCollectHelpText');
  if (!helpEl) return;
  var hasCreds = hasActiveDarkOrbitCredentials();
  var t = (typeof window !== 'undefined' && typeof window.i18nT === 'function') ? window.i18nT : function (k) { return k; };
  var text = hasCreds
    ? t('stats_collect_help_available')
    : t('stats_collect_help_no_creds');
  helpEl.textContent = text;
  helpEl.style.display = text ? '' : 'none';
}

async function runStatsCollectFromGame() {
  var btn = document.getElementById('collectStatsFromGameBtn');
  var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' ? BackendAPI.getUserBadge() : 'FREE');
  var cooldownMs = getCollectCooldownMs(badge);
  if (btn && btn.disabled && badge !== 'ADMIN' && badge !== 'SUPERADMIN') {
    var profile = typeof BackendAPI !== 'undefined' && typeof BackendAPI.getUserProfile === 'function' ? BackendAPI.getUserProfile() : null;
    var lastAt = profile && profile.last_stats_collected_at ? new Date(profile.last_stats_collected_at).getTime() : 0;
    if (!lastAt && supabase) {
      try {
        var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
        if (user && user.id) {
          var pr = await supabase.from('profiles').select('last_stats_collected_at').eq('id', user.id).single();
          if (pr && pr.data) lastAt = pr.data.last_stats_collected_at ? new Date(pr.data.last_stats_collected_at).getTime() : 0;
        }
      } catch (e) {
        Logger.error('[StatsCollect] lecture last_stats_collected_at error:', e?.message || e);
      }
    }
    var remaining = lastAt && cooldownMs > 0 ? lastAt + cooldownMs - Date.now() : 0;
    if (remaining > 0 && typeof showToast === 'function') {
      if ((badge || '').toString().toUpperCase() === 'FREE') {
        var line = formatNextRecoveryFullLine(lastAt);
        showToast(line || ('Stats déjà récupérées. Prochaine collecte dans ' + formatCooldownRemaining(remaining)), 'info');
      } else {
        showToast('Stats déjà récupérées. Prochaine collecte disponible dans ' + formatCooldownRemaining(remaining), 'info');
      }
    }
    return;
  }
  var doModal = document.getElementById('doCredentialsModal');
  var doModalPseudo = document.getElementById('doModalPseudo');
  var doModalPassword = document.getElementById('doModalPassword');
  var doModalServer = document.getElementById('doModalServer');
  var useWebScraper = typeof window.electronPlayerStatsScraper !== 'undefined' && typeof window.electronPlayerStatsScraper.collectWithLogin === 'function';
  if (typeof window.electronPlayerStatsScraper === 'undefined' && (typeof window.electronClientLauncher === 'undefined' || typeof window.electronClientLauncher.collectPlayerStats !== 'function')) {
    if (typeof showToast === 'function') showToast('Récolte disponible uniquement dans l\'application desktop.', 'warning');
    return;
  }
  if (useWebScraper && doModal) {
    var creds = typeof window.electronPlayerStatsCredentials !== 'undefined' && typeof window.electronPlayerStatsCredentials.getActiveWithPassword === 'function'
      ? await window.electronPlayerStatsCredentials.getActiveWithPassword() : null;
    if (creds && creds.password) {
      var doModalEl = document.getElementById('doCredentialsModal');
      if (doModalEl) { doModalEl.style.display = 'none'; doModalEl.classList.remove('active'); }
      if (btn) btn.disabled = true;
      showCollectProgress(true);
      if (typeof showToast === 'function') showToast('Récolte en cours…', 'info');
      try {
        var res = await window.electronPlayerStatsScraper.collectWithLogin({ serverId: creds.serverId || 'gbl5', username: creds.username, password: creds.password });
        if (!res || !res.ok) {
          if (typeof showToast === 'function') showToast(res && res.error ? res.error : 'Authentification échouée, vérifiez vos identifiants DarkOrbit.', 'error');
          var u2 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
          if (u2 && supabase) { var _r2 = await supabase.from('profiles').select('last_stats_collected_at').eq('id', u2.id).single(); updateCollectStatsUI(_r2.data || null); }
          return;
        }
        var data = res.data || {};
        var user3 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
        if (!user3 || !user3.id) { if (typeof showToast === 'function') showToast('Non connecté.', 'error'); return; }
        var nowIso = new Date().toISOString();
        var update = profileUpdateOnlyDisplay(data, nowIso);
        Object.keys(update).forEach(function (k) { if (update[k] === undefined) delete update[k]; });
        var supabase2 = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (supabase2 && Object.keys(update).length > 0) {
          var upRes = await persistProfileDisplayUpdate(supabase2, update);
          if (!upRes.ok) { if (typeof showToast === 'function') showToast('Scan échoué: ' + upRes.message, 'error'); return; }
        }
        onCollectSuccess(data, nowIso);
      } catch (e) {
        if (typeof showToast === 'function') showToast(e && e.message ? e.message : 'Authentification échouée, vérifiez vos identifiants DarkOrbit.', 'error');
        var u4 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
        if (u4 && typeof getSupabaseClient === 'function') { var sb = getSupabaseClient(); if (sb) { var _r3 = await sb.from('profiles').select('last_stats_collected_at').eq('id', u4.id).single(); updateCollectStatsUI(_r3.data || null); } }
      } finally {
        showCollectProgress(false);
        if (btn) btn.disabled = false;
      }
      return;
    }
    if (typeof showToast === 'function') {
      showToast('Aucun compte DarkOrbit enregistré. Ajoutez-en un dans « Mon compte > Compte DarkOrbit » ou renseignez vos identifiants.', 'warning');
    }
    var doModalEl = document.getElementById('doCredentialsModal');
    if (doModalEl) { doModalEl.style.display = 'flex'; doModalEl.style.opacity = '1'; doModalEl.style.visibility = 'visible'; doModalEl.classList.add('active'); }
    return;
  }
  var path = typeof getSetting === 'function' ? getSetting('flashClientPath') : '';
  if (btn) btn.disabled = true;
  showCollectProgress(true);
  updateCollectProgress(50, 'Récolte en cours…');
  if (typeof showToast === 'function') showToast('Récolte en cours…', 'info');
  var result;
  try {
    var collectPromise = window.electronClientLauncher.collectPlayerStats({ clientPath: path || undefined });
    var timeoutMs = 120000;
    result = await Promise.race([collectPromise, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Timeout récolte (2 min)')); }, timeoutMs); })]);
    if (!result || !result.ok) {
      if (typeof showToast === 'function') showToast('Scan échoué' + (result && result.error ? ': ' + result.error : ''), 'error');
      var u2 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
      if (u2 && supabase) { var _r2 = await supabase.from('profiles').select('last_stats_collected_at').eq('id', u2.id).single(); updateCollectStatsUI(_r2.data || null); }
      return;
    }
    var data = result.data || {};
    var user3 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
    if (!user3 || !user3.id) { if (typeof showToast === 'function') showToast('Non connecté.', 'error'); return; }
    var nowIso = new Date().toISOString();
    var update = profileUpdateOnlyDisplay(data, nowIso);
    Object.keys(update).forEach(function (k) { if (update[k] === undefined) delete update[k]; });
    var supabase2 = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase2 && Object.keys(update).length > 0) {
      var rpcUp = await persistProfileDisplayUpdate(supabase2, update);
      if (!rpcUp.ok) { if (typeof showToast === 'function') showToast('Scan échoué: ' + (rpcUp.message || 'Erreur enregistrement'), 'error'); return; }
    }
    onCollectSuccess(data, nowIso);
  } catch (e) {
    if (typeof showToast === 'function') showToast('Scan échoué: ' + (e && e.message ? e.message : 'inconnue'), 'error');
    var u4 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
    if (u4 && typeof getSupabaseClient === 'function') { var sb = getSupabaseClient(); if (sb) { var _r3 = await sb.from('profiles').select('last_stats_collected_at').eq('id', u4.id).single(); updateCollectStatsUI(_r3.data || null); } }
  } finally {
    showCollectProgress(false);
    try { if (typeof window.electronClientLauncher !== 'undefined' && typeof window.electronClientLauncher.stop === 'function') window.electronClientLauncher.stop(); } catch (_) {}
    if (btn) btn.disabled = false;
  }
}

window.runStatsCollectFromGame = runStatsCollectFromGame;

async function initCollectStatsFromGameButton() {
  var section = document.getElementById('statsCollectAutoSection');
  var btn = document.getElementById('collectStatsFromGameBtn');
  if (!section) return;

  if (section._collectStatsBound) {
    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' ? BackendAPI.getUserBadge() : 'FREE');
    section.style.display = 'none';
    updateStatsManualUI();
    var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    var user = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
    if (supabase && user && user.id) {
      var _r = await supabase.from('profiles').select('last_stats_collected_at').eq('id', user.id).single();
      updateCollectStatsUI(_r.data || null);
    } else {
      updateCollectStatsUI(null);
    }
    updateStatsCollectHelpMessage();
    return;
  }
  section._collectStatsBound = true;
  if (btn) btn._collectStatsBound = true;

  var doModal = document.getElementById('doCredentialsModal');
  var doModalPseudo = document.getElementById('doModalPseudo');
  var doModalPassword = document.getElementById('doModalPassword');
  var doModalServer = document.getElementById('doModalServer');
  var doModalCancel = document.getElementById('doModalCancel');
  var doModalSubmit = document.getElementById('doModalSubmit');
  var useWebScraper = typeof window.electronPlayerStatsScraper !== 'undefined' && typeof window.electronPlayerStatsScraper.collectWithLogin === 'function';
  if (useWebScraper && doModalServer && typeof window.SERVER_CODE_TO_DISPLAY !== 'undefined') {
    doModalServer.innerHTML = '';
    Object.keys(window.SERVER_CODE_TO_DISPLAY).sort().forEach(function (code) {
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = window.SERVER_CODE_TO_DISPLAY[code];
      if (code === 'gbl5') opt.selected = true;
      doModalServer.appendChild(opt);
    });
  }
  function hideDoModal() {
    if (doModal) {
      doModal.style.display = 'none';
      doModal.style.opacity = '';
      doModal.style.visibility = '';
      doModal.classList.remove('active');
    }
  }
  function showDoModal() {
    if (doModal) {
      doModal.style.display = 'flex';
      doModal.style.opacity = '1';
      doModal.style.visibility = 'visible';
      doModal.classList.add('active');
    }
    if (doModalPseudo) doModalPseudo.value = '';
    if (doModalPassword) doModalPassword.value = '';
  }
  if (doModalCancel) doModalCancel.addEventListener('click', hideDoModal);
  if (doModal && doModal.addEventListener) doModal.addEventListener('click', function (e) { if (e.target === doModal) hideDoModal(); });

  if (useWebScraper && typeof window.electronPlayerStatsScraper !== 'undefined' && typeof window.electronPlayerStatsScraper.onProgress === 'function') {
    window.electronPlayerStatsScraper.onProgress(function (d) {
      if (d && (d.percent != null || d.label)) {
        updateCollectProgress(d.percent, d.label);
      }
    });
  }

  (function updateVisibilityAndUI() {
    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' ? BackendAPI.getUserBadge() : 'FREE');
    section.style.display = 'none';
    var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function') {
      AuthManager.getCurrentUser().then(function (user) {
        if (supabase && user && user.id) {
          supabase.from('profiles').select('last_stats_collected_at').eq('id', user.id).single().then(function (_r) {
            updateCollectStatsUI(_r.data || null);
            updateStatsCollectHelpMessage();
          }).catch(function () {
            updateCollectStatsUI(null);
            updateStatsCollectHelpMessage();
          });
        } else {
          updateCollectStatsUI(null);
          updateStatsCollectHelpMessage();
        }
      }).catch(function () { updateCollectStatsUI(null); });
    } else {
      updateCollectStatsUI(null);
    }
  })();

  if (btn) btn.addEventListener('click', runStatsCollectFromGame);

  if (useWebScraper && doModalSubmit) {
    doModalSubmit.addEventListener('click', async function () {
      var pseudo = (doModalPseudo && doModalPseudo.value) ? doModalPseudo.value.trim() : '';
      var password = doModalPassword ? doModalPassword.value : '';
      var serverId = (doModalServer && doModalServer.value) ? doModalServer.value : 'gbl5';
      if (!pseudo || !password) {
        if (typeof showToast === 'function') showToast('Renseignez pseudo et mot de passe DarkOrbit.', 'warning');
        return;
      }
      hideDoModal();
      var collectBtn = document.getElementById('collectStatsFromGameBtn');
      if (collectBtn) collectBtn.disabled = true;
      showCollectProgress(true);
      if (typeof showToast === 'function') showToast('Récolte en cours…', 'info');
      try {
        var res = await window.electronPlayerStatsScraper.collectWithLogin({ serverId: serverId, username: pseudo, password: password });
        if (!res || !res.ok) {
          if (typeof showToast === 'function') showToast(res && res.error ? res.error : 'Authentification échouée, vérifiez vos identifiants DarkOrbit.', 'error');
          var u2 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
          if (u2 && supabase) { var _r2 = await supabase.from('profiles').select('last_stats_collected_at').eq('id', u2.id).single(); updateCollectStatsUI(_r2.data || null); }
          return;
        }
        var data = res.data || {};
        var user3 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
        if (!user3 || !user3.id) { if (typeof showToast === 'function') showToast('Non connecté.', 'error'); return; }
        var nowIso = new Date().toISOString();
        var update = profileUpdateOnlyDisplay(data, nowIso);
        Object.keys(update).forEach(function (k) { if (update[k] === undefined) delete update[k]; });
        var supabase2 = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (supabase2 && Object.keys(update).length > 0) {
          var upRes2 = await persistProfileDisplayUpdate(supabase2, update);
          if (!upRes2.ok) { if (typeof showToast === 'function') showToast('Scan échoué: ' + upRes2.message, 'error'); return; }
        }
        onCollectSuccess(data, nowIso);
      } catch (e) {
        if (typeof showToast === 'function') showToast(e && e.message ? e.message : 'Authentification échouée, vérifiez vos identifiants DarkOrbit.', 'error');
        var u4 = typeof AuthManager !== 'undefined' && typeof AuthManager.getCurrentUser === 'function' ? await AuthManager.getCurrentUser() : null;
        if (u4 && typeof getSupabaseClient === 'function') { var sb = getSupabaseClient(); if (sb) { var _r3 = await sb.from('profiles').select('last_stats_collected_at').eq('id', u4.id).single(); updateCollectStatsUI(_r3.data || null); } }
      } finally {
        showCollectProgress(false);
        var collectBtn2 = document.getElementById('collectStatsFromGameBtn');
        if (collectBtn2) collectBtn2.disabled = false;
      }
    });
  }
}

window.initCollectStatsFromGameButton = initCollectStatsFromGameButton;

function runInitCollectStats() {
  if (typeof initCollectStatsFromGameButton === 'function') initCollectStatsFromGameButton();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runInitCollectStats);
} else {
  runInitCollectStats();
}
window.addEventListener('load', function () { runInitCollectStats(); });
window.addEventListener('darkorbitCredentialsChanged', function () {
  try {
    updateStatsCollectHelpMessage();
  } catch (e) {}
});
window.addEventListener('languageChanged', function () {
  try {
    updateCollectStatsUI(_collectCooldownProfileSnapshot || null);
    updateStatsCollectHelpMessage();
    var ov = document.getElementById('statsRecapOverlay');
    if (ov && ov.style.display !== 'none' && typeof applyTranslations === 'function' && typeof getCurrentLang === 'function') {
      applyTranslations(getCurrentLang());
    }
  } catch (e) {}
});
