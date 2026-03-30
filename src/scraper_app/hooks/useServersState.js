import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_GROUPS } from '../data/mockServers';

/** Calcule le prochain créneau à partir des slots du scheduler (format {time:'HH:MM'}). */
function getNextRunFromSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return null;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const candidates = [];
  for (const slot of slots) {
    if (!slot?.time) continue;
    const today = new Date(`${todayStr}T${slot.time}:00`);
    if (today > now) candidates.push(today);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    candidates.push(new Date(`${tomorrow.toISOString().slice(0, 10)}T${slot.time}:00`));
  }
  candidates.sort((a, b) => a - b);
  return candidates[0] ?? null;
}

export function useServersState() {
  const [groups, setGroups] = useState(SERVER_GROUPS);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /** Charge le scheduler et recalcule nextScrape pour tous les serveurs non-désactivés. */
  const refreshNextScrape = useCallback(async () => {
    try {
      const scheduler = typeof window !== 'undefined' && window.electronScheduler;
      if (!scheduler?.getConfig) return;
      const config = await scheduler.getConfig();
      const nextRun = getNextRunFromSlots(config?.slots);
      const ts = nextRun ? nextRun.getTime() : null;
      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          servers: group.servers.map((s) =>
            s.status !== 'disabled' ? { ...s, nextScrape: ts } : s,
          ),
        })),
      );
    } catch (_) {}
  }, []);

  // Chargement initial + écoute des événements scheduler
  useEffect(() => {
    refreshNextScrape();
    const scheduler = typeof window !== 'undefined' && window.electronScheduler;
    if (!scheduler) return;
    const unsubStarted = typeof scheduler.onStarted === 'function'
      ? scheduler.onStarted(() => {
          setGroups((prev) =>
            prev.map((group) => ({
              ...group,
              servers: group.servers.map((s) =>
                s.status !== 'disabled' ? { ...s, nextScrape: null } : s,
              ),
            })),
          );
        })
      : null;
    const unsubFinished = typeof scheduler.onFinished === 'function'
      ? scheduler.onFinished(() => {
          setGroups((prev) =>
            prev.map((group) => ({
              ...group,
              servers: group.servers.map((s) =>
                s.status === 'running' ? { ...s, status: 'idle' } : s,
              ),
            })),
          );
          refreshNextScrape();
        })
      : null;
    return () => { unsubStarted?.(); unsubFinished?.(); };
  }, [refreshNextScrape]);

  // Mise à jour en temps réel des stats (succès, erreurs, vitesse, latence) depuis les logs DOSTATS
  const refreshNextScrapeRef = useRef(refreshNextScrape);
  refreshNextScrapeRef.current = refreshNextScrape;

  useEffect(() => {
    const onLog = typeof window !== 'undefined' && window.electronDostatsScraper?.onLog;
    if (!onLog) return;
    const handler = (evt) => {
      if (evt?.metric_type === 'rankings_batch_stats' && Array.isArray(evt.servers)) {
        const deltas = new Map();
        evt.servers.forEach((row) => {
          const serverCode =
            row?.server && typeof row.server === 'string' ? row.server.trim().toLowerCase() : null;
          if (!serverCode) return;
          const sd = Number(row.successDelta) || 0;
          const ed = Number(row.errorDelta) || 0;
          const avgMs = row.avgDurationMs != null ? Number(row.avgDurationMs) : null;
          deltas.set(serverCode, { sd, ed, avgMs });
        });
        if (deltas.size === 0) return;
        setGroups((prev) =>
          prev.map((group) => ({
            ...group,
            servers: group.servers.map((s) => {
              const d = deltas.get(s.code.toLowerCase());
              if (!d) return s;
              const newLatency = d.avgMs != null ? d.avgMs : s.latency;
              const newSpeed = d.avgMs != null && d.avgMs > 0 ? Math.round((1000 / d.avgMs) * 10) / 10 : s.speed;
              return {
                ...s,
                successCount: s.successCount + d.sd,
                errorCount: s.errorCount + d.ed,
                totalCount: s.totalCount + d.sd + d.ed,
                lastScrape: Date.now(),
                latency: newLatency,
                speed: newSpeed,
              };
            }),
          }))
        );
        return;
      }
      if (evt?.silent) return;

      // rankings_batch_start : marquer les serveurs comme 'running' + effacer nextScrape
      if (evt?.metric_type === 'rankings_batch_start') {
        const codes = Array.isArray(evt.servers)
          ? evt.servers.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
          : [];
        if (codes.length) {
          setGroups((prev) =>
            prev.map((group) => ({
              ...group,
              servers: group.servers.map((s) => {
                if (!codes.includes(s.code.toLowerCase())) return s;
                if (s.status === 'disabled') return s;
                return { ...s, status: 'running', nextScrape: null };
              }),
            })),
          );
        }
        return;
      }
      // rankings_summary : fin de batch → repasser tous les serveurs 'running' à 'idle'
      if (evt?.metric_type === 'rankings_summary') {
        setGroups((prev) =>
          prev.map((group) => ({
            ...group,
            servers: group.servers.map((s) =>
              s.status === 'running' ? { ...s, status: 'idle' } : s,
            ),
          })),
        );
        refreshNextScrapeRef.current();
        return;
      }

      const ignoreForKpi = new Set([
        'player_profile_batch_start',
        'player_profile_batch_end',
        'player_profile_failures_list',
      ]);
      if (evt?.metric_type && ignoreForKpi.has(evt.metric_type)) return;

      const serverCode = evt?.server && typeof evt.server === 'string' ? evt.server.trim().toLowerCase() : null;
      if (!serverCode) return;
      const isSuccess = evt.type === 'success';
      const isError = evt.type === 'error' || evt.type === 'warning';
      if (!isSuccess && !isError) return;

      setGroups((prev) =>
        prev.map((group) => ({
          ...group,
          servers: group.servers.map((s) => {
            if (s.code.toLowerCase() !== serverCode) return s;
            const durationMs = evt.durationMs != null ? Number(evt.durationMs) : null;
            const newLatency = durationMs != null ? Math.round(durationMs) : s.latency;
            const newSpeed = durationMs != null && durationMs > 0 ? Math.round((1000 / durationMs) * 10) / 10 : s.speed;
            return {
              ...s,
              successCount: s.successCount + (isSuccess ? 1 : 0),
              errorCount: s.errorCount + (isError ? 1 : 0),
              totalCount: s.totalCount + 1,
              lastScrape: Date.now(),
              latency: newLatency,
              speed: newSpeed,
            };
          }),
        }))
      );
    };
    const unsub = onLog(handler);
    return () => unsub?.();
  }, []);

  const timeAgo = useCallback((timestamp) => {
    if (!timestamp) return '—';
    const diff = now - timestamp;
    if (diff < 60000) return "À l'instant";
    if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)}min`;
    return `il y a ${Math.floor(diff / 3600000)}h`;
  }, [now]);

  const timeUntil = useCallback((timestamp) => {
    if (!timestamp) return null;
    const diff = timestamp - now;
    if (diff <= 0) return 'Maintenant';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
    return `dans ${Math.floor(diff / 60000)}min`;
  }, [now]);

  const toggleServer = useCallback((serverId, action) => {
    setGroups(prev =>
      prev.map(group => ({
        ...group,
        servers: group.servers.map(server => {
          if (server.id !== serverId) return server;
          const nextStatus = {
            start: 'running',
            pause: 'paused',
            disable: 'disabled',
          }[action] ?? server.status;
          return { ...server, status: nextStatus };
        }),
      })),
    );
  }, []);

  const flatServers = groups.flatMap(g => g.servers);
  const globalStats = {
    totalServers: flatServers.length,
    activeServers: flatServers.filter(s => s.status === 'running').length,
    totalGroups: groups.length,
    activeGroups: groups.filter(g => g.servers.some(s => s.status === 'running')).length,
    runningCount: flatServers.filter(s => s.status === 'running').length,
    errorCount: flatServers.filter(s => s.status === 'error').length,
  };

  return { groups, globalStats, timeAgo, timeUntil, toggleServer };
}

