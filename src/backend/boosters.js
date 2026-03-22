// ==========================================
// MODULE: BOOSTERS 50% (XP / Honneur)
// Mercredi, Samedi, Dimanche
// ==========================================

var _bk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
const BOOSTERS_STORAGE_KEY = _bk.BOOSTERS || 'darkOrbitBoosters';

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
// LOGIQUE PRINCIPALE
// ==========================================

/**
 * Retourne le booster actif ('honor', 'xp') ou null.
 * Dépend uniquement des événements du jour (getActiveBoosterType). config.enabled n’affecte pas la sidebar.
 */
function getTodayBooster() {
  if (BOOSTER_TEST_MODE) return BOOSTER_TEST_TYPE;
  return typeof window.getActiveBoosterType === 'function' ? window.getActiveBoosterType() : null;
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


// ==========================================
// AFFICHAGE PANNEAU LATÉRAL GAUCHE
// ==========================================

function updateBoosterAlert() {
  const alert = document.getElementById('boosterAlert');
  const img = document.getElementById('boosterAlertImg');
  const title = document.getElementById('boosterAlertTitle');
  const appLayout = document.querySelector('.app-layout');

  if (!alert) return;
  var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
  if (badge === 'FREE') return;
  if (badge !== 'PRO' && badge !== 'ADMIN' && badge !== 'SUPERADMIN') return;

  const booster = getTodayBooster();
  if (!booster || booster === 'none') {
    alert.style.display = 'none';
    return;
  }

  alert.style.display = 'flex';
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

  // Notification Windows : une fois par session de fenêtre (sessionStorage → pas de spam au F5 ; nouvelle fenêtre app = nouvelle notif)
  try {
    if (typeof window.sendNotification !== 'function' ||
        typeof getSetting !== 'function' ||
        !getSetting('notificationsEnabled') ||
        typeof currentHasFeature !== 'function' ||
        !currentHasFeature('notificationsWindows')) return;
    if (window._boosterWinNotifSentThisLoad) return;
    var boosterNotifSessionKey = 'doTracker_boosterWinNotifSent';
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(boosterNotifSessionKey) === '1') return;
    } catch (e) {}
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(boosterNotifSessionKey, '1');
    } catch (e2) {}
    window._boosterWinNotifSentThisLoad = true;
    var notifTitle = 'Booster 50%';
    var notifBody = booster === 'xp'
      ? 'Un booster 50% XP est actif aujourd\'hui.'
      : 'Un booster 50% Honneur est actif aujourd\'hui.';
    window.sendNotification(notifTitle, notifBody);
  } catch (e) {
    if (window.DEBUG) Logger.warn('[Booster] Notification error:', e && e.message ? e.message : e);
  }
}

// ==========================================
// INITIALISATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  updateBoosterAlert();
});

window.addEventListener('permissionsApplied', () => {
  if (typeof getCurrentBadge === 'function' && getCurrentBadge() !== 'FREE' && typeof currentHasFeature === 'function' && currentHasFeature('boosterDisplay')) {
    updateBoosterAlert();
  }
});

window.addEventListener('languageChanged', () => {
  if (typeof updateBoosterAlert === 'function') updateBoosterAlert();
});

window.getTodayBooster = getTodayBooster;
window.updateBoosterAlert = updateBoosterAlert;
