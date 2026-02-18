// ==========================================
// MODULE: BOOSTERS 50% (XP / Honneur)
// Mercredi, Samedi, Dimanche
// ==========================================

var _bk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
const BOOSTERS_STORAGE_KEY = _bk.BOOSTERS || 'darkOrbitBoosters';
const CURRENT_EVENTS_KEY = _bk.CURRENT_EVENTS || 'darkOrbitCurrentEvents';

// Mots-clés multilingues pour détecter boosters dans les événements scrapés (fr, en, de, es, ru, tr)
const BOOSTER_HONOR_KEYWORDS = ['honor', 'honneur', 'honour', 'ehre', 'honra', 'честь', 'onur', '50%', 'boost', 'bonus'];
const BOOSTER_XP_KEYWORDS = ['experience', 'xp', 'exp', 'erfahrung', 'experiencia', 'опыт', 'deneyim', '50%', 'boost', 'bonus'];

// MODE TEST - Mettre à true pour forcer l'affichage
const BOOSTER_TEST_MODE = false;
const BOOSTER_TEST_TYPE = 'honor'; // 'honor' ou 'xp'

// Configuration par défaut (modifiable par l'utilisateur)
const DEFAULT_BOOSTERS_CONFIG = {
  enabled: true,
  // 0 = Dimanche, 1 = Lundi, ..., 3 = Mercredi, 6 = Samedi
  schedule: {
    3: 'honor',  // Mercredi = Honneur (par défaut)
    6: 'honor',  // Samedi = Honneur (par défaut)
    0: 'xp'      // Dimanche = XP (par défaut)
  }
};

const BOOSTER_DAYS = [3, 6, 0]; // Mercredi, Samedi, Dimanche

// Images des boosters (dans img/events/)
const BOOSTER_IMAGES = {
  honor: 'img/events/honnor_day.png',
  xp: 'img/events/xp_day.png'
};

// Fallback en emoji si pas d'images
const BOOSTER_EMOJI = {
  honor: '🏆',
  xp: '⭐'
};

// ==========================================
// STORAGE
// ==========================================

function getBoostersConfig() {
  const raw = SafeStorage.get(BOOSTERS_STORAGE_KEY, DEFAULT_BOOSTERS_CONFIG);
  if (!raw || typeof raw !== 'object') return DEFAULT_BOOSTERS_CONFIG;
  const schedule = raw.schedule && typeof raw.schedule === 'object'
    ? { ...DEFAULT_BOOSTERS_CONFIG.schedule, ...raw.schedule }
    : DEFAULT_BOOSTERS_CONFIG.schedule;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_BOOSTERS_CONFIG.enabled,
    schedule: schedule
  };
}

function saveBoostersConfig(config) {
  return SafeStorage.set(BOOSTERS_STORAGE_KEY, config);
}

// ==========================================
// DÉTECTION BOOSTER VIA ÉVÉNEMENTS SCRAPÉS
// ==========================================

function getScrapedEvents() {
  if (typeof UnifiedStorage === 'undefined') return [];
  var raw = UnifiedStorage.get(CURRENT_EVENTS_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

/**
 * Détecte si un texte correspond à un booster Honneur ou XP (mots-clés multilingues).
 * @param {string} text - Nom + description de l'événement (lowercase)
 * @returns {string|null} 'honor', 'xp' ou null
 */
function detectBoosterTypeFromText(text) {
  if (!text || typeof text !== 'string') return null;
  var t = text.toLowerCase();
  var hasHonor = BOOSTER_HONOR_KEYWORDS.some(function (kw) { return t.indexOf(kw) !== -1; });
  var hasXp = BOOSTER_XP_KEYWORDS.some(function (kw) { return t.indexOf(kw) !== -1; });
  if (hasHonor && hasXp) return 'honor'; // les deux : priorité honneur
  if (hasHonor) return 'honor';
  if (hasXp) return 'xp';
  return null;
}

/**
 * Déduit le booster actif à partir des événements DarkOrbit scrapés.
 * Priorité : Honneur puis XP. Aucun mot-clé → null.
 * @returns {string|null} 'honor', 'xp' ou null
 */
function getBoosterFromScrapedEvents() {
  var events = getScrapedEvents();
  if (!events.length) return null;
  var foundHonor = false;
  var foundXp = false;
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var text = ((ev.name || '') + ' ' + (ev.description || '')).trim();
    var type = detectBoosterTypeFromText(text);
    if (type === 'honor') foundHonor = true;
    if (type === 'xp') foundXp = true;
  }
  if (foundHonor) return 'honor';
  if (foundXp) return 'xp';
  return null;
}

// ==========================================
// LOGIQUE PRINCIPALE
// ==========================================

/**
 * Récupérer le booster du jour
 * Priorité : 1) événements scrapés, 2) calendrier (Mercredi / Samedi / Dimanche)
 * @returns {string|null} 'honor', 'xp' ou null si pas de booster
 */
function getTodayBooster() {
  // MODE TEST
  if (BOOSTER_TEST_MODE) {
    return BOOSTER_TEST_TYPE;
  }

  const config = getBoostersConfig();
  if (!config.enabled) return null;

  var fromEvents = getBoosterFromScrapedEvents();
  if (fromEvents) return fromEvents;

  const today = new Date().getDay(); // 0 = Dimanche, 3 = Mercredi, 6 = Samedi
  return config.schedule[today] || null;
}

function getScheduledBoosterForDate(date, config) {
  const scheduleValue = config.schedule[date.getDay()];
  return scheduleValue ? scheduleValue : 'none';
}

/**
 * Vérifier si aujourd'hui un booster est actif (événements scrapés ou calendrier)
 */
function isBoosterDay() {
  if (BOOSTER_TEST_MODE) return true;
  return getTodayBooster() !== null;
}

/**
 * Obtenir le nom du booster
 */
function getBoosterName(type) {
  switch(type) {
    case 'honor': return '50% Honneur';
    case 'xp': return '50% XP';
    default: return '';
  }
}

/**
 * Obtenir le nom du jour
 */
function getDayName(dayIndex) {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[dayIndex];
}

function getDayShortName(dayIndex) {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return days[dayIndex];
}

function formatShortDate(date) {
  const dayName = getDayShortName(date.getDay());
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${dayName} ${day}/${month}`;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateCountdown(targetDate) {
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return { days, hours, mins, secs };
}

function formatCountdown(days, hours, mins, secs) {
  const d = String(days).padStart(2, '0');
  const h = String(hours).padStart(2, '0');
  const m = String(mins).padStart(2, '0');
  const s = String(secs).padStart(2, '0');
  return `${d}j ${h}h ${m}m ${s}s`;
}

function getNextBooster(fromDate = new Date()) {
  const config = getBoostersConfig();
  const base = new Date(fromDate);
  base.setHours(0, 0, 0, 0);

  for (let offset = 1; offset <= 21; offset += 1) {
    const candidate = new Date(base);
    candidate.setDate(base.getDate() + offset);
    const dayIndex = candidate.getDay();
    if (!BOOSTER_DAYS.includes(dayIndex)) continue;
    const type = getScheduledBoosterForDate(candidate, config);
    if (type === 'none') continue;
    candidate.setHours(0, 0, 0, 0);
    return { type, date: candidate, dayIndex };
  }

  return null;
}

function getUpcomingBoosterDays(count, fromDate = new Date()) {
  const config = getBoostersConfig();
  const results = [];
  const base = new Date(fromDate);
  base.setHours(0, 0, 0, 0);

  for (let offset = 0; offset <= 21 && results.length < count; offset += 1) {
    const candidate = new Date(base);
    candidate.setDate(base.getDate() + offset);
    const dayIndex = candidate.getDay();
    if (!BOOSTER_DAYS.includes(dayIndex)) continue;
    const type = getScheduledBoosterForDate(candidate, config);
    results.push({ type, date: candidate, dayIndex });
  }

  return results;
}

function isBoosterActiveToday() {
  return getTodayBooster() !== null;
}

// ==========================================
// AFFICHAGE PANNEAU LATÉRAL GAUCHE
// ==========================================

function updateBoosterAlert() {
  const alert = document.getElementById('boosterAlert');
  const img = document.getElementById('boosterAlertImg');
  const title = document.getElementById('boosterAlertTitle');
  const appLayout = document.querySelector('.app-layout');
  
  if (!alert) return;
  if (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'FREE') return;

  const config = getBoostersConfig();
  const booster = getTodayBooster();
  
  if (!config.enabled || !booster || booster === 'none') {
    alert.style.display = 'none';
    const widget = document.getElementById('boosterWidget');
    if (widget) widget.style.display = '';
    return;
  }
  
  // Afficher uniquement la carte "AUJOURD'HUI" (le widget compte à rebours est masqué dans updateBoosterWidget)
  alert.style.display = 'flex';
  const widget = document.getElementById('boosterWidget');
  if (widget) widget.style.display = 'none';
  if (appLayout) appLayout.classList.add('has-booster-sidebar');
  
  var nameKey = booster === 'xp' ? 'booster_50_xp' : 'booster_50_honor';
  title.textContent = (typeof window.i18nT === 'function' ? window.i18nT(nameKey) : getBoosterName(booster));
  
  // Image
  const imgPath = BOOSTER_IMAGES[booster];
  img.src = imgPath;
  img.alt = (typeof window.i18nT === 'function' ? window.i18nT(nameKey) : getBoosterName(booster));
  
  // Fallback si image non trouvée
  img.onerror = () => {
    // Créer un placeholder avec emoji
    img.style.display = 'none';
    const existingEmoji = alert.querySelector('.booster-sidebar-emoji');
    if (!existingEmoji) {
      const emojiDiv = document.createElement('div');
      emojiDiv.className = 'booster-sidebar-emoji';
      emojiDiv.style.fontSize = '4rem';
      emojiDiv.style.marginBottom = '12px';
      emojiDiv.textContent = BOOSTER_EMOJI[booster];
      img.parentNode.insertBefore(emojiDiv, img);
    }
  };
  
  // Ajouter la classe du type de booster pour le style
  alert.className = `booster-sidebar-content booster-${booster}`;
}

// ==========================================
// WIDGET BOOSTER + TIMER
// ==========================================

let boosterTimerId = null;
let lastTimerDay = null;
let lastWidgetBoosterType = null;
let lastWidgetBoosterDateKey = null;

function updateBoosterWidget() {
  const widget = document.getElementById('boosterWidget');
  const icon = document.getElementById('boosterWidgetIcon');
  const title = document.getElementById('boosterWidgetTitle');
  const countdown = document.getElementById('boosterWidgetCountdown');
  const dateLabel = document.getElementById('boosterWidgetDate');
  const appLayout = document.querySelector('.app-layout');

  if (!widget || !icon || !title || !countdown || !dateLabel) return;
  if (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'FREE') return;
  if (appLayout) appLayout.classList.add('has-booster-sidebar');

  const nextBooster = getNextBooster();
  const activeToday = isBoosterActiveToday();

  // Une seule carte visible : timer OU "AUJOURD'HUI". Si booster disponible aujourd'hui, masquer le widget (l'alerte s'affiche).
  widget.style.display = activeToday ? 'none' : '';
  widget.classList.toggle('active-today', activeToday);

  if (!nextBooster) {
    if (lastWidgetBoosterType !== 'none') {
      icon.textContent = '⏸️';
      title.textContent = (typeof window.i18nT === 'function' ? window.i18nT('no_booster_planned') : 'Aucun booster planifié');
      dateLabel.textContent = '-';
      widget.removeAttribute('data-type');
      lastWidgetBoosterType = 'none';
      lastWidgetBoosterDateKey = null;
      console.log('🧪 Booster détecté (widget) : aucun');
    }
    countdown.textContent = '--';
    return;
  }

  const boosterDateKey = `${nextBooster.type}-${formatDateKey(nextBooster.date)}`;
  if (boosterDateKey !== lastWidgetBoosterDateKey) {
    const imgPath = BOOSTER_IMAGES[nextBooster.type];
    const imgAlt = nextBooster.type === 'xp' ? 'XP Booster' : 'Honor Booster';
    icon.innerHTML = `<img src="${imgPath}" alt="${imgAlt}" class="booster-widget-img">`;
    const imgEl = icon.querySelector('img');
    if (imgEl) {
      imgEl.onerror = () => {
        if (nextBooster.type === 'honor' && imgEl.src.indexOf('honnor_day.png') === -1) {
          imgEl.src = 'img/events/honnor_day.png';
          return;
        }
        icon.textContent = nextBooster.type === 'xp' ? '🚀' : '🏆';
      };
    }
    var titleKey = nextBooster.type === 'xp' ? 'next_booster_xp' : 'next_booster_honor';
    title.textContent = (typeof window.i18nT === 'function' ? window.i18nT(titleKey) : (nextBooster.type === 'xp' ? 'Prochain booster XP' : 'Prochain booster Honneur'));
    dateLabel.textContent = formatShortDate(nextBooster.date);
    widget.setAttribute('data-type', nextBooster.type === 'xp' ? 'XP' : 'Honor');
    lastWidgetBoosterDateKey = boosterDateKey;
  }

  if (lastWidgetBoosterType !== nextBooster.type) {
    console.log(`🧪 Booster détecté (widget) : ${nextBooster.type}`);
    lastWidgetBoosterType = nextBooster.type;
  }

  const { days, hours, mins, secs } = calculateCountdown(nextBooster.date);
  countdown.textContent = formatCountdown(days, hours, mins, secs);
}

function updateBoosterTimer() {
  updateBoosterWidget();

  const today = new Date().getDay();
  if (lastTimerDay === null) {
    lastTimerDay = today;
  }

  if (today !== lastTimerDay) {
    lastTimerDay = today;
    updateBoosterAlert();
  }
}

function startBoosterTimer() {
  if (boosterTimerId) {
    clearInterval(boosterTimerId);
  }
  updateBoosterTimer();
  boosterTimerId = setInterval(updateBoosterTimer, 1000);
}

// ==========================================
// INITIALISATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Afficher l'alerte si applicable (ignoré si FREE)
  updateBoosterAlert();
  updateBoosterWidget();
  startBoosterTimer();

  const boosterWidget = document.getElementById('boosterWidget');
  if (boosterWidget) {
    boosterWidget.addEventListener('click', () => {
      const eventsTabBtn = document.querySelector('[data-tab="events"]');
      if (eventsTabBtn) eventsTabBtn.click();
    });
  }
});

// Rafraîchir le booster quand les permissions sont appliquées (PRO/ADMIN/SUPERADMIN après chargement async)
window.addEventListener('permissionsApplied', () => {
  if (typeof getCurrentBadge === 'function' && getCurrentBadge() !== 'FREE' && typeof currentHasFeature === 'function' && currentHasFeature('boosterDisplay')) {
    updateBoosterAlert();
    updateBoosterWidget();
  }
});

// Rafraîchir les libellés booster au changement de langue
window.addEventListener('languageChanged', () => {
  if (typeof updateBoosterAlert === 'function') updateBoosterAlert();
  if (typeof updateBoosterWidget === 'function') updateBoosterWidget();
});

// Exposer pour utilisation externe
window.getTodayBooster = getTodayBooster;
window.isBoosterDay = isBoosterDay;
window.updateBoosterAlert = updateBoosterAlert;
window.updateBoosterWidget = updateBoosterWidget;

console.log('🚀 Module Boosters chargé');
