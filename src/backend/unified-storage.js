// ==========================================
// SYSTÈME DE STOCKAGE UNIFIÉ
// Version 2.0 - Remplace SafeStorage, StorageCache, CompressedStorage
// ==========================================

window.UnifiedStorage = window.UnifiedStorage || {
  // Cache mémoire
  _cache: new Map(),
  
  // Config
  _config: {
    useCompression: true,
    cacheEnabled: true,
    warningSize: 4 * 1024 * 1024, // 4MB
    maxSize: 5 * 1024 * 1024 // 5MB
  },

  // FIX 9 — merge local pour suivis (clé user_id|server, pas d’écrasement par null)
  _followedEntryKey(entry) {
    if (!entry || typeof entry !== 'object') return '';
    var uid = (entry.userId != null ? String(entry.userId) : (entry.user_id != null ? String(entry.user_id) : '')) || '';
    var server = ((entry._server || entry.server || '') + '').toLowerCase().trim();
    return uid + '|' + server;
  },
  _isEmptyFollowedMergeValue(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string' && v.trim() === '') return true;
    return false;
  },
  _mergeFollowedEntryFields(a, b) {
    var out = {};
    if (a && typeof a === 'object') {
      for (var k in a) {
        if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
      }
    }
    if (!b || typeof b !== 'object') return out;
    for (var k2 in b) {
      if (!Object.prototype.hasOwnProperty.call(b, k2)) continue;
      var v = b[k2];
      if (this._isEmptyFollowedMergeValue(v)) continue;
      out[k2] = v;
    }
    return out;
  },
  _mergeFollowedPlayersArrayOnSet(nextList) {
    var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : null;
    if (!sk) return nextList;
    var key = sk.FOLLOWED_PLAYERS;
    var prev = this.get(key, []) || [];
    if (!Array.isArray(prev)) prev = [];
    if (!Array.isArray(nextList)) return prev;
    var prevByKey = {};
    for (var i = 0; i < prev.length; i++) {
      var fk = this._followedEntryKey(prev[i]);
      if (fk) prevByKey[fk] = prev[i];
    }
    var out = [];
    for (var j = 0; j < nextList.length; j++) {
      var nk = this._followedEntryKey(nextList[j]);
      if (!nk) {
        out.push(nextList[j]);
        continue;
      }
      out.push(this._mergeFollowedEntryFields(prevByKey[nk] || {}, nextList[j]));
    }
    return out;
  },
  _mergeFollowedStatsMapOnSet(nextMap) {
    var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : null;
    if (!sk) return nextMap;
    var key = sk.FOLLOWED_PLAYERS_STATS;
    var prev = this.get(key, {}) || {};
    if (!prev || typeof prev !== 'object' || Array.isArray(prev)) prev = {};
    if (!nextMap || typeof nextMap !== 'object' || Array.isArray(nextMap)) return prev;
    var out = {};
    for (var k in prev) {
      if (Object.prototype.hasOwnProperty.call(prev, k)) out[k] = Object.assign({}, prev[k]);
    }
    for (var k2 in nextMap) {
      if (!Object.prototype.hasOwnProperty.call(nextMap, k2)) continue;
      var inc = nextMap[k2];
      if (!inc || typeof inc !== 'object' || Array.isArray(inc)) {
        out[k2] = inc;
        continue;
      }
      out[k2] = this._mergeFollowedEntryFields(out[k2] || {}, inc);
    }
    return out;
  },
  
  /**
   * GET - Récupère depuis cache OU localStorage
   */
  get(key, defaultValue = null) {
    // 1. Vérifier cache mémoire
    if (this._config.cacheEnabled && this._cache.has(key)) {
      return this._cache.get(key);
    }
    
    // 2. Lire depuis localStorage
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      
      // 3. Décompresser si nécessaire
      const isCompressed = localStorage.getItem(key + '_compressed') === '1';
      let jsonData;
      
      if (isCompressed) {
        jsonData = this._decompress(raw);
      } else {
        jsonData = raw;
      }
      
      try {
        const data = JSON.parse(jsonData);
        if (this._config.cacheEnabled) this._cache.set(key, data);
        return data;
      } catch (e) {
        if (typeof jsonData === 'string' && jsonData.length < 100) return jsonData;
        Logger.error('❌ Storage read error (' + key + '):', e);
        return defaultValue;
      }
      
    } catch (e) {
      Logger.error(`❌ Storage read error (${key}):`, e);
      return defaultValue;
    }
  },
  
  /**
   * SET - Sauvegarde avec compression optionnelle
   */
  set(key, value) {
    try {
      var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : null;
      if (sk && key === sk.FOLLOWED_PLAYERS && Array.isArray(value)) {
        value = this._mergeFollowedPlayersArrayOnSet(value);
      } else if (sk && key === sk.FOLLOWED_PLAYERS_STATS && value && typeof value === 'object' && !Array.isArray(value)) {
        value = this._mergeFollowedStatsMapOnSet(value);
      }
      const jsonData = JSON.stringify(value);
      const originalSize = new Blob([jsonData]).size;
      
      // 1. Vérifier taille AVANT compression
      if (originalSize > this._config.warningSize) {
        const sizeMB = (originalSize / 1024 / 1024).toFixed(2);
        Logger.warn(`⚠️ Large data (${sizeMB}MB): ${key}`);
        
        if (typeof showToast === 'function') {
          showToast(`⚠️ Données volumineuses (${sizeMB}MB). Compression activée.`, 'warning');
        }
      }
      
      // 2. Compresser si activé ET taille > 50KB
      let finalData = jsonData;
      let compressed = false;
      
      if (this._config.useCompression && originalSize > 50 * 1024) {
        finalData = this._compress(jsonData);
        compressed = true;
      }
      
      // 3. Sauvegarder
      localStorage.setItem(key, finalData);
      localStorage.setItem(key + '_compressed', compressed ? '1' : '0');
      
      // 4. Mettre à jour cache
      if (this._config.cacheEnabled) {
        this._cache.set(key, value);
      }
      // Phase 5 : sync Supabase si clé concernée (liste centralisée dans config/keys.js).
      var syncKeys = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.SYNC_KEYS) ? window.APP_KEYS.SYNC_KEYS : ['darkOrbitSessions', 'darkOrbitEvents', 'darkOrbitSettings', 'darkOrbitCustomLinks', 'darkOrbitBoosters', 'darkOrbitCurrentStats', 'darkOrbitCurrentEvents'];
      if (syncKeys.indexOf(key) !== -1 && typeof DataSync !== 'undefined' && DataSync.queueSync) {
        DataSync.queueSync();
      }
      return { success: true, size: originalSize, compressed };
      
    } catch (e) {
      Logger.error(`❌ Storage write error (${key}):`, e);
      
      if (e.name === 'QuotaExceededError') {
        const currentSize = this._getTotalSize();
        const sizeMB = (currentSize / 1024 / 1024).toFixed(2);
        
        if (typeof showToast === 'function') {
          showToast(`❌ Stockage plein (${sizeMB}MB/5MB) ! Exportez puis supprimez l'historique.`, 'error');
        }
        
        return { success: false, error: 'QUOTA_EXCEEDED', size: currentSize };
      }
      
      return { success: false, error: 'WRITE_ERROR', details: e.message };
    }
  },
  
  /**
   * REMOVE - Supprime clé + cache
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(key + '_compressed');
      this._cache.delete(key);
      return { success: true };
    } catch (e) {
      Logger.error(`❌ Remove error (${key}):`, e);
      return { success: false, error: e.message };
    }
  },
  
  /**
   * CLEAR - Vide tout
   */
  clear() {
    try {
      localStorage.clear();
      this._cache.clear();
      return { success: true };
    } catch (e) {
      Logger.error('❌ Clear error:', e);
      return { success: false, error: e.message };
    }
  },
  
  /**
   * INVALIDATE CACHE - Force reload depuis localStorage
   */
  invalidateCache(key) {
    if (key) {
      this._cache.delete(key);
    } else {
      this._cache.clear();
    }
  },

  /**
   * Supprime toutes les données locales de l'app (sessions, stats, paramètres, etc.)
   * en conservant uniquement les clés d'authentification Supabase (préfixe "sb-").
   * À utiliser pour "Vider le cache" complet.
   */
  clearAllAppDataExceptAuth() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('sb-') !== 0) toRemove.push(key);
    }
    const self = this;
    toRemove.forEach(function(key) {
      try {
        localStorage.removeItem(key);
        self._cache.delete(key);
      } catch (e) { /* ignore */ }
    });
    return { success: true, removed: toRemove.length };
  },

  /**
   * Vide tout le cache (localStorage) sauf les clés enregistrées (données utilisateur).
   * Conserve : SESSIONS, CURRENT_STATS, EVENTS, SETTINGS, etc. (STORAGE_KEYS).
   */
  clearCacheExceptRegisteredKeys() {
    const sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
    const keep = new Set();
    Object.keys(sk).forEach(function(k) {
      const v = sk[k];
      if (v) {
        keep.add(v);
        keep.add(v + '_compressed');
      }
    });
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !keep.has(key)) toRemove.push(key);
    }
    const self = this;
    toRemove.forEach(function(key) {
      try {
        localStorage.removeItem(key);
        self._cache.delete(key);
      } catch (e) { /* ignore */ }
    });
    return { success: true, removed: toRemove.length };
  },
  
  /**
   * Compression Base64
   */
  _compress(str) {
    if (!str) return '';
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      Logger.error('Compression failed:', e);
      return str;
    }
  },
  
  /**
   * Décompression Base64
   */
  _decompress(str) {
    if (!str) return '';
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      Logger.error('Decompression failed:', e);
      return str;
    }
  },
  
  /**
   * Taille totale utilisée
   */
  _getTotalSize() {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += (localStorage[key].length + key.length) * 2; // UTF-16
      }
    }
    return total;
  },
  
  /**
   * Stats stockage
   */
  getStats() {
    const totalSize = this._getTotalSize();
    const cacheSize = this._cache.size;
    const keys = Object.keys(localStorage).filter(k => !k.endsWith('_compressed'));
    
    return {
      totalSize: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      percentUsed: ((totalSize / this._config.maxSize) * 100).toFixed(1),
      keysCount: keys.length,
      cacheEntries: cacheSize,
      compressionEnabled: this._config.useCompression
    };
  },
  
  /**
   * Configuration
   */
  configure(options) {
    Object.assign(this._config, options);
  }
};

const UnifiedStorage = window.UnifiedStorage;

// ==========================================
// ALIAS SafeStorage (compatibilité)
// ==========================================

const SafeStorage = {
  get: (key, defaultValue) => UnifiedStorage.get(key, defaultValue),
  set: (key, value) => UnifiedStorage.set(key, value),
  remove: (key) => UnifiedStorage.remove(key),
  clear: () => UnifiedStorage.clear()
};

// ==========================================
// ALIAS StorageCache (compatibilité)
// ==========================================

const StorageCache = {
  get: (key, defaultValue) => UnifiedStorage.get(key, defaultValue),
  set: (key, value) => UnifiedStorage.set(key, value),
  invalidate: (key) => UnifiedStorage.invalidateCache(key),
  invalidateAll: () => UnifiedStorage.invalidateCache(),
  clear: () => UnifiedStorage.invalidateCache(),
  isCached: (key) => UnifiedStorage._cache.has(key)
};


// ==========================================
// DEBUG CONSOLE
// ==========================================

window.SafeStorage = SafeStorage;
window.StorageCache = StorageCache;

if (window.DEBUG) {
  window.storageStats = () => {
    const stats = UnifiedStorage.getStats();
    console.table({
      'Taille totale': stats.totalSizeMB + ' MB',
      'Utilisation': stats.percentUsed + '%',
      'Nombre de clés': stats.keysCount,
      'Cache mémoire': stats.cacheEntries + ' entrées',
      'Compression': stats.compressionEnabled ? 'ON' : 'OFF'
    });
    return stats;
  };
}

