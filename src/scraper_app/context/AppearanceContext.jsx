import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { ACCENT_COLORS } from '../data/defaultSettings';

const defaultAppearance = {
  accentColor: 'cyan',
  uiDensity: 'normal',
  animationsEnabled: true,
  reducedMotion: false,
  sidebarCollapsed: false,
  logMaxLines: 2000,
};

const AppearanceContext = createContext({ appearance: defaultAppearance, setAppearance: () => {} });

function applyAppearanceToDocument(appearance) {
  const root = document.documentElement;
  const shell = document.querySelector('.scraper-shell');
  if (!appearance) return;

  const accent = ACCENT_COLORS.find((a) => a.value === appearance.accentColor);
  const accentHex = accent ? accent.color : '#63b3ed';
  root.style.setProperty('--accent-primary', accentHex);
  root.dataset.accent = appearance.accentColor || 'cyan';

  if (shell) {
    shell.classList.remove('density-compact', 'density-normal', 'density-comfortable');
    shell.classList.add(`density-${appearance.uiDensity || 'normal'}`);
    root.dataset.animationsEnabled = appearance.animationsEnabled !== false ? 'true' : 'false';
    root.dataset.reducedMotion = appearance.reducedMotion ? 'true' : 'false';
  }
}

export function AppearanceProvider({ children }) {
  const [appearance, setAppearanceState] = useState(defaultAppearance);

  const setAppearance = useCallback((next) => {
    setAppearanceState((prev) => (typeof next === 'function' ? next(prev) : { ...prev, ...next }));
  }, []);

  useEffect(() => {
    applyAppearanceToDocument(appearance);
  }, [appearance]);

  useEffect(() => {
    const onChanged = (e) => {
      if (e.detail && typeof e.detail === 'object') {
        setAppearanceState((prev) => ({ ...defaultAppearance, ...prev, ...e.detail }));
      }
    };
    window.addEventListener('appearance-changed', onChanged);
    return () => window.removeEventListener('appearance-changed', onChanged);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await window.electronAPI?.loadSettings?.();
        if (loaded?.appearance && typeof loaded.appearance === 'object') {
          setAppearanceState((prev) => ({ ...defaultAppearance, ...prev, ...loaded.appearance }));
        }
      } catch (_) {}
    };
    load();
  }, []);

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  return ctx.appearance ?? defaultAppearance;
}

export function useSetAppearance() {
  const ctx = useContext(AppearanceContext);
  return ctx.setAppearance ?? (() => {});
}
