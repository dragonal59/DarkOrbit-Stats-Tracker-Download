// ==========================================
// COMPRESSION DES DONNÉES LOCALSTORAGE — ARCHIVÉ
// Remplacé par unified-storage.js (_compress/_decompress). Non chargé.
// ==========================================

const SimpleCompress = {
  compress(str) {
    if (!str) return '';
    try { return btoa(unescape(encodeURIComponent(str))); } catch (e) { return str; }
  },
  decompress(str) {
    if (!str) return '';
    try { return decodeURIComponent(escape(atob(str))); } catch (e) { return str; }
  }
};

const CompressedStorage = {
  set(key, value) {
    try {
      const json = JSON.stringify(value);
      const compressed = SimpleCompress.compress(json);
      localStorage.setItem(key + '_c', '1');
      localStorage.setItem(key, compressed);
      return { success: true };
    } catch (e) {
      console.error('Compression error:', e);
      return SafeStorage.set(key, value);
    }
  },
  get(key, defaultValue = null) {
    try {
      const isCompressed = localStorage.getItem(key + '_c') === '1';
      const stored = localStorage.getItem(key);
      if (!stored) return defaultValue;
      if (isCompressed) return JSON.parse(SimpleCompress.decompress(stored));
      return JSON.parse(stored);
    } catch (e) {
      console.error('Decompression error:', e);
      return defaultValue;
    }
  },
  async migrateAll() {
    var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
    const keys = [sk.SESSIONS || 'darkOrbitSessions', sk.SETTINGS || 'darkOrbitSettings', sk.CUSTOM_LINKS || 'darkOrbitCustomLinks'];
    for (const key of keys) {
      if (localStorage.getItem(key + '_c') !== '1') {
        const data = SafeStorage.get(key);
        if (data) this.set(key, data);
      }
    }
  }
};

window.CompressedStorage = CompressedStorage;
