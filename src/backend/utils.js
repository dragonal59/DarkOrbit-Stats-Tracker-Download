// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Sanitize HTML to prevent XSS attacks
 */
function sanitizeHTML(str) {
  if (typeof str !== 'string') return '';
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}

/**
 * Debounce function to limit rate of execution
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to ensure execution at regular intervals
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Validate session data structure
 */
function validateSession(session) {
  const required = ['id', 'timestamp', 'honor', 'xp', 'rankPoints', 'currentRank'];
  
  for (const field of required) {
    if (session[field] === undefined || session[field] === null) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }
  
  // Type validation : id accepte number (Date.now) ou string (sync Supabase local_id)
  const idType = typeof session.id;
  if (idType !== 'number' && idType !== 'string') {
    return { valid: false, error: 'Invalid id type' };
  }
  if (idType === 'string' && (!session.id || String(session.id).trim() === '')) {
    return { valid: false, error: 'Invalid id type' };
  }
  
  if (typeof session.timestamp !== 'number' || session.timestamp < 0) {
    return { valid: false, error: 'Invalid timestamp' };
  }
  
  if (typeof session.honor !== 'number' || session.honor < 0) {
    return { valid: false, error: 'Invalid honor value' };
  }
  
  if (typeof session.xp !== 'number' || session.xp < 0) {
    return { valid: false, error: 'Invalid xp value' };
  }
  
  if (typeof session.rankPoints !== 'number' || session.rankPoints < 0) {
    return { valid: false, error: 'Invalid rankPoints value' };
  }
  
  if (typeof session.currentRank !== 'string' || session.currentRank.trim() === '') {
    return { valid: false, error: 'Invalid currentRank' };
  }
  
  // Sanitize string fields
  if (session.note) {
    session.note = sanitizeHTML(session.note);
  }
  
  if (session.currentRank) {
    session.currentRank = sanitizeHTML(session.currentRank);
  }
  
  return { valid: true, session };
}

/**
 * Validate imported data
 */
function validateImportedData(data) {
  if (!data) {
    return { valid: false, error: 'No data provided' };
  }
  
  if (!Array.isArray(data)) {
    return { valid: false, error: 'Data must be an array' };
  }
  
  if (data.length === 0) {
    return { valid: false, error: 'Empty data array' };
  }
  
  if (data.length > 10000) {
    return { valid: false, error: 'Too many sessions (max 10000)' };
  }
  
  const validSessions = [];
  const errors = [];
  
  for (let i = 0; i < data.length; i++) {
    const validation = validateSession(data[i]);
    if (validation.valid) {
      validSessions.push(validation.session);
    } else {
      errors.push(`Session ${i}: ${validation.error}`);
    }
  }
  
  if (validSessions.length === 0) {
    return { valid: false, error: 'No valid sessions found', errors };
  }
  
  return { 
    valid: true, 
    sessions: validSessions, 
    skipped: errors.length,
    errors: errors.slice(0, 5) // Return first 5 errors only
  };
}

/**
 * Format large numbers with K, M, B suffixes
 */
function formatLargeNumber(num) {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Deep clone object safely
 */
function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    Logger.error('Deep clone error:', e);
    return obj;
  }
}

/**
 * Check if localStorage is available and working
 */
function isLocalStorageAvailable() {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Request Animation Frame with fallback
 */
const requestAnimFrame = (function() {
  return window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    function(callback) {
      window.setTimeout(callback, 1000 / 60);
    };
})();

/**
 * Cancel Animation Frame with fallback
 */
const cancelAnimFrame = (function() {
  return window.cancelAnimationFrame ||
    window.webkitCancelAnimationFrame ||
    window.mozCancelAnimationFrame ||
    function(id) {
      clearTimeout(id);
    };
})();

/**
 * Show toast notification
 */
function showToast(message, type = 'success', duration) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  const ms = duration != null ? duration : (CONFIG.UI.TOAST_DURATION || 3000);
  setTimeout(() => {
    toast.classList.add('closing');
    setTimeout(() => toast.remove(), 250);
  }, ms);
}

// ==========================================
// WEEK START (lundi) — partagé notamment par history.js
// ==========================================

/**
 * Retourne le début de la semaine (lundi 00:00:00) pour une date donnée.
 * @param {Date|number} date
 * @returns {Date}
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ==========================================
// NUMBER FORMATTING (centralisé — remplace les doublons dans stats/history)
// ==========================================

/**
 * Formate un nombre entier avec séparateurs (en-US).
 * Retourne '-' pour les valeurs non-finies. Accepte les négatifs.
 */
function formatNumberDisplay(num) {
  var value = Number(num);
  if (!Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Formate un nombre de façon compacte : 1.5M, 250K, etc.
 * Retourne '-' pour les valeurs non-finies. Gère les négatifs.
 */
function formatNumberCompact(num) {
  var value = Number(num);
  if (!Number.isFinite(value)) return '-';
  var abs = Math.abs(value);
  if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Formate un gain avec son signe (+/-).
 * @param {number|null} num  - La valeur à formater
 * @param {boolean} compact  - Si true, utilise le format compact (1.2M). Défaut : false (nombre complet).
 * @returns {string}
 */
function formatSignedGain(num, compact) {
  if (num === null || typeof num === 'undefined') return '-';
  var fmt = compact ? formatNumberCompact : formatNumberDisplay;
  if (num < 0) return '-' + fmt(Math.abs(num));
  return '+' + fmt(num);
}

/**
 * Retourne la classe CSS correspondant au signe d'un gain.
 * @param {number|null} num   - La valeur
 * @param {string} variant    - 'pn' → 'positive'/'negative' ; défaut → 'gain'/'loss'
 * @returns {'gain'|'loss'|'positive'|'negative'|'neutral'}
 */
function getGainClass(num, variant) {
  if (num === null || typeof num === 'undefined') return 'neutral';
  if (variant === 'pn') {
    if (num > 0) return 'positive';
    if (num < 0) return 'negative';
    return 'neutral';
  }
  if (num > 0) return 'gain';
  if (num < 0) return 'loss';
  return 'neutral';
}

/**
 * Échappe une chaîne pour une insertion HTML sûre (anti-XSS).
 * Remplace escapeHtml dans messages.js et ranking-ui.js.
 */
function escapeHtml(s) {
  if (s == null) return '';
  var div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

// ==========================================
// COMPRESSION D'IMAGES BASE64
// ==========================================

/**
 * Compresser une image base64
 * @param {string} base64 - L'image en base64
 * @param {number} maxWidth - Largeur max (défaut 800px)
 * @param {number} quality - Qualité JPEG 0-1 (défaut 0.7)
 * @returns {Promise<string>} - Image compressée en base64
 */
function compressImage(base64, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculer les nouvelles dimensions
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      // Créer un canvas pour redimensionner
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convertir en JPEG compressé
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      
      resolve(compressedBase64);
    };
    
    img.onerror = () => reject(new Error('Erreur de chargement de l\'image'));
    img.src = base64;
  });
}

/**
 * Compresser une image si elle dépasse une taille max
 * @param {string} base64 - L'image en base64
 * @param {number} maxSizeKB - Taille max en KB (défaut 500KB)
 * @returns {Promise<string>} - Image (compressée si nécessaire)
 */
async function compressImageIfNeeded(base64, maxSizeKB = 500) {
  const sizeKB = base64.length / 1024;
  
  if (sizeKB <= maxSizeKB) {
    return base64; // Pas besoin de compresser
  }
  
  // Compresser progressivement jusqu'à atteindre la taille cible
  let quality = 0.8;
  let maxWidth = 1200;
  let compressed = base64;
  
  while (compressed.length / 1024 > maxSizeKB && quality > 0.3) {
    compressed = await compressImage(base64, maxWidth, quality);
    quality -= 0.1;
    maxWidth -= 100;
  }
  
  return compressed;
}

// Exposer globalement
window.compressImage = compressImage;
window.compressImageIfNeeded = compressImageIfNeeded;
