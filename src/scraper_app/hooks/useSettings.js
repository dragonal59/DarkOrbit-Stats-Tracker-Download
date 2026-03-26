import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_SETTINGS } from '../data/defaultSettings';

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Debounce pour éviter les courses (saving === true qui bloquait les saves suivantes) et garantir la dernière valeur. */
const AUTOSAVE_DEBOUNCE_MS = 450;

export function useSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [activeSection, setActiveSection] = useState('proxies');
  const settingsRef = useRef(DEFAULT_SETTINGS);
  settingsRef.current = settings;

  useEffect(() => {
    (async () => {
      try {
        const loaded = await window.electronAPI?.loadSettings?.();
        if (loaded && typeof loaded === 'object') {
          const merged = {};
          for (const k of Object.keys(DEFAULT_SETTINGS)) {
            if (loaded[k] !== undefined && loaded[k] !== null) {
              if (Array.isArray(loaded[k])) {
                merged[k] = loaded[k];
              } else if (
                typeof loaded[k] === 'object' &&
                typeof DEFAULT_SETTINGS[k] === 'object' &&
                DEFAULT_SETTINGS[k] !== null &&
                !Array.isArray(DEFAULT_SETTINGS[k])
              ) {
                merged[k] = { ...DEFAULT_SETTINGS[k], ...loaded[k] };
              } else {
                merged[k] = loaded[k];
              }
            } else {
              merged[k] = DEFAULT_SETTINGS[k];
            }
          }
          setSettings(merged);
          setSaved(merged);
        }
      } catch {
        // ignore load errors, keep defaults
      }
    })();
  }, []);

  const isDirty = !deepEqual(settings, saved);

  const patch = useCallback((section, partial) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...partial },
    }));
  }, []);

  const persistToDisk = useCallback(async (payload) => {
    if (!window.electronAPI?.saveSettings) {
      setSaveError('IPC Electron indisponible — les réglages ne sont pas enregistrés sur disque.');
      return false;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await window.electronAPI.saveSettings(payload);
      if (result && result.ok) {
        setSaved(payload);
        if (payload.appearance && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('appearance-changed', { detail: payload.appearance }));
        }
        return true;
      }
      setSaveError(result?.error || 'Erreur de sauvegarde');
      return false;
    } catch (e) {
      setSaveError(e?.message || 'Erreur de sauvegarde');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const save = useCallback(async () => {
    return persistToDisk(settingsRef.current);
  }, [persistToDisk]);

  const discard = useCallback(() => {
    setSettings(saved);
  }, [saved]);

  const resetSection = useCallback((section) => {
    setSettings((prev) => ({
      ...prev,
      [section]: DEFAULT_SETTINGS[section],
    }));
  }, []);

  useEffect(() => {
    if (deepEqual(settings, saved)) return;
    const t = setTimeout(() => {
      void persistToDisk(settingsRef.current);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [settings, saved, persistToDisk]);

  const addProxy = useCallback(
    (proxy) => {
      patch('proxies', {
        list: [
          ...settings.proxies.list,
          {
            ...proxy,
            id: `px_${Date.now()}`,
            status: 'idle',
            latency: null,
          },
        ],
      });
    },
    [patch, settings.proxies.list],
  );

  const updateProxy = useCallback(
    (id, partial) => {
      patch('proxies', {
        list: settings.proxies.list.map((p) =>
          p.id === id ? { ...p, ...partial } : p,
        ),
      });
    },
    [patch, settings.proxies.list],
  );

  const deleteProxy = useCallback(
    (id) => {
      patch('proxies', {
        list: settings.proxies.list.filter((p) => p.id !== id),
      });
    },
    [patch, settings.proxies.list],
  );

  const importProxies = useCallback(
    (text) => {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const parsed = lines
        .map((line, i) => {
          const parts = line.split(':');
          return {
            id: `px_import_${Date.now()}_${i}`,
            host: parts[0] ?? '',
            port: parseInt(parts[1], 10) || 8080,
            username: parts[2] ?? '',
            password: parts[3] ?? '',
            enabled: true,
            status: 'idle',
            latency: null,
          };
        })
        .filter((p) => p.host);
      patch('proxies', {
        list: [...settings.proxies.list, ...parsed],
      });
      return parsed.length;
    },
    [patch, settings.proxies.list],
  );

  const testAllProxies = useCallback(async () => {
    // simple simulated test, sequential
    for (const proxy of settings.proxies.list) {
      if (!proxy.enabled) continue;
      updateProxy(proxy.id, { status: 'testing' });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
      const ok = Math.random() > 0.2;
      updateProxy(proxy.id, {
        status: ok ? 'ok' : 'error',
        latency: ok
          ? Math.floor(200 + Math.random() * 600)
          : null,
      });
    }
  }, [settings.proxies.list, updateProxy]);

  return {
    settings,
    isDirty,
    saving,
    saveError,
    activeSection,
    setActiveSection,
    patch,
    save,
    discard,
    resetSection,
    addProxy,
    updateProxy,
    deleteProxy,
    importProxies,
    testAllProxies,
  };
}
