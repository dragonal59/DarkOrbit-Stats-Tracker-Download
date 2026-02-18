// ==========================================
// SYSTÈME DE CACHE LOCALSTORAGE
// FIX BUG #20 : Éviter les lectures répétées
// ==========================================
// ARCHIVÉ : Remplacé par unified-storage.js (alias StorageCache). Non chargé.

const StorageCache = {
  _cache: {},
  get(key, defaultValue = null, useCache = true) {
    if (!useCache || !(key in this._cache)) {
      const value = SafeStorage.get(key, defaultValue);
      this._cache[key] = value;
      return value;
    }
    return this._cache[key];
  },
  set(key, value) {
    const result = SafeStorage.set(key, value);
    if (result.success) this._cache[key] = value;
    return result;
  },
  invalidate(key) { if (key in this._cache) delete this._cache[key]; },
  invalidateAll() { this._cache = {}; },
  refresh(key, defaultValue = null) {
    const value = SafeStorage.get(key, defaultValue);
    this._cache[key] = value;
    return value;
  },
  isCached(key) { return key in this._cache; },
  getCacheSize() { return Object.keys(this._cache).length; },
  getCacheStats() {
    const keys = Object.keys(this._cache);
    const sizes = keys.map(key => {
      const size = new Blob([JSON.stringify(this._cache[key])]).size;
      return { key, size };
    });
    return { entries: keys.length, totalSize: sizes.reduce((sum, item) => sum + item.size, 0), details: sizes };
  }
};

var _cacheKeys = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
function getCachedSessions() { return StorageCache.get(_cacheKeys.SESSIONS || 'darkOrbitSessions', []); }
function saveCachedSessions(sessions) { return StorageCache.set(_cacheKeys.SESSIONS || 'darkOrbitSessions', sessions); }
function getCachedSettings() { return StorageCache.get(_cacheKeys.SETTINGS || 'darkOrbitSettings', {}); }
function saveCachedSettings(settings) { return StorageCache.set(_cacheKeys.SETTINGS || 'darkOrbitSettings', settings); }
function getCachedLinks() { return StorageCache.get(_cacheKeys.CUSTOM_LINKS || 'darkOrbitCustomLinks', null); }
function saveCachedLinks(links) { return StorageCache.set(_cacheKeys.CUSTOM_LINKS || 'darkOrbitCustomLinks', links); }

window.addEventListener('beforeunload', () => { StorageCache.invalidateAll(); });
