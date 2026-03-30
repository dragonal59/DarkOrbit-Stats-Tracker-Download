import { useState, useCallback, useEffect, useRef } from 'react';
import { MOCK_SCHEDULES, MOCK_BANNED, getNextRun } from '../data/mockPlanning';


function schedulesToSlots(schedules) {
  // Contract main.js:
  // - slot.scrapers includes 'evenements' => ScraperBridge.startEventsOnlyScraping()
  // - slot.scrapers includes 'serveurs'   => SessionScraper.startScraping()
  // Planning UI: targetType === 'events' => events-only, sinon => scraping serveurs.
  const byTime = new Map(); // time => Set(scraperKeys)

  (schedules || []).forEach((s) => {
    if (!s?.enabled || !Array.isArray(s.hours)) return;

    const scrapers = (s.targetType === 'events') ? ['evenements'] : ['serveurs'];
    s.hours.forEach((h) => {
      if (!h) return;
      if (!byTime.has(h)) byTime.set(h, new Set());
      const set = byTime.get(h);
      scrapers.forEach((k) => set.add(k));
    });
  });

  return [...byTime.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([time, set]) => ({ time, scrapers: Array.from(set).sort() }));
}

export function usePlanning() {
  const [schedules, setSchedules] = useState(MOCK_SCHEDULES);
  const [banned, setBanned] = useState(MOCK_BANNED);
  const [view, setView] = useState('timeline'); // 'timeline' | 'list'
  const [now, setNow] = useState(Date.now());
  const [planningLoaded, setPlanningLoaded] = useState(false);
  const [savingPlanning, setSavingPlanning] = useState(false);
  const [savePlanningError, setSavePlanningError] = useState(null);

  // Chargement initial : planning (schedules + banned) depuis le fichier persistant
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = window.electronAPI;
        const extraRes = api?.loadPlanningExtra ? await api.loadPlanningExtra() : null;
        if (cancelled) return;
        if (extraRes?.ok) {
          if (Array.isArray(extraRes.schedules)) {
            setSchedules(extraRes.schedules);
          }
          if (Array.isArray(extraRes.banned)) {
            setBanned(extraRes.banned);
          }
        }
      } catch (_) {
        // garder les valeurs par défaut
      } finally {
        if (!cancelled) setPlanningLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tick chaque seconde pour les countdowns
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Vérifier et lever les bans temporaires expirés
  useEffect(() => {
    setBanned((prev) => {
      const next = prev.filter((b) => {
        if (b.banType === 'temporary' && b.expiresAt && new Date(b.expiresAt) <= new Date()) {
          return false; // lever le ban
        }
        return true;
      });
      // Éviter de recréer un nouveau tableau identique pour ne pas déclencher
      // de re-render inutile et d'auto-sauvegarde en boucle.
      if (next.length === prev.length) return prev;
      return next;
    });
  }, [now]);

  // ── CRUD Schedules ──────────────────────────────

  const addSchedule = useCallback((schedule) => {
    setSchedules((prev) => [
      ...prev,
      { ...schedule, id: `sch_${Date.now()}`, createdAt: new Date().toISOString() },
    ]);
  }, []);

  const updateSchedule = useCallback((id, patch) => {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const deleteSchedule = useCallback((id) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggleSchedule = useCallback((id) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }, []);

  // ── Bannissement ────────────────────────────────

  const banServer = useCallback((server, banType, expiresAt, reason) => {
    setBanned((prev) => {
      const existing = prev.findIndex((b) => b.serverId === server.id);
      const entry = {
        serverId: server.id,
        serverCode: server.code,
        serverLabel: server.label,
        banType,
        bannedAt: new Date().toISOString(),
        expiresAt: expiresAt ?? null,
        reason: reason ?? '',
      };
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = entry;
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  const unbanServer = useCallback((serverId) => {
    setBanned((prev) => prev.filter((b) => b.serverId !== serverId));
  }, []);

  const isServerBanned = useCallback(
    (serverId) => banned.some((b) => b.serverId === serverId),
    [banned],
  );

  // ── Persistance main (scheduler + banned) ─────────
  const savePlanning = useCallback(async () => {
    setSavingPlanning(true);
    setSavePlanningError(null);
    try {
      const slots = schedulesToSlots(schedules);
      const scheduler = window.electronScheduler;
      const api = window.electronAPI;
      if (api?.savePlanningExtra) {
        const res = await api.savePlanningExtra({ schedules, banned });
        if (res && !res.ok) {
          setSavePlanningError(res.error || 'Erreur sauvegarde planning');
          setSavingPlanning(false);
          return;
        }
      }
      if (scheduler?.saveConfig) {
        const res = await scheduler.saveConfig({ slots });
        if (res && !res.ok) {
          setSavePlanningError(res.error || 'Erreur sauvegarde créneaux');
          setSavingPlanning(false);
          return;
        }
      }
      if (scheduler?.reload) await scheduler.reload();
      setSavePlanningError(null);
    } catch (e) {
      setSavePlanningError(e?.message || 'Erreur sauvegarde planning');
    } finally {
      setSavingPlanning(false);
    }
  }, [schedules, banned]);

  // Auto-sauvegarde : debounce après chaque modification
  const savePlanningRef = useRef(null);
  savePlanningRef.current = savePlanning;
  useEffect(() => {
    if (!planningLoaded) return;
    const t = setTimeout(() => {
      savePlanningRef.current?.();
    }, 1200);
    return () => clearTimeout(t);
  }, [schedules, banned, planningLoaded]);

  // Sauvegarde unique au démontage (séparée du debounce pour éviter le double-trigger)
  useEffect(() => {
    return () => { savePlanningRef.current?.(); };
  }, []);

  // ── Stats globales ───────────────────────────────

  const stats = {
    totalSchedules: schedules.length,
    activeSchedules: schedules.filter((s) => s.enabled).length,
    totalSlots: schedules
      .filter((s) => s.enabled)
      .reduce((acc, s) => acc + s.hours.length, 0),
    bannedCount: banned.length,
    nextRuns: schedules
      .filter((s) => s.enabled)
      .map((s) => ({ schedule: s, nextRun: getNextRun(s) }))
      .filter((x) => x.nextRun)
      .sort((a, b) => a.nextRun - b.nextRun)
      .slice(0, 5),
  };

  return {
    schedules,
    banned,
    view,
    setView,
    now,
    stats,
    planningLoaded,
    savingPlanning,
    savePlanningError,
    savePlanning,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    toggleSchedule,
    banServer,
    unbanServer,
    isServerBanned,
  };
}

