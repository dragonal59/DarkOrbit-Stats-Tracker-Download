import { useCallback, useEffect, useState } from 'react';
import { SERVER_GROUPS } from '../data/mockServers';

export function useServersState() {
  const [groups, setGroups] = useState(SERVER_GROUPS);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Mise à jour en temps réel des stats (succès, erreurs, vitesse, latence) depuis les logs DOSTATS
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
          if (sd === 0 && ed === 0) return;
          deltas.set(serverCode, { sd, ed });
        });
        if (deltas.size === 0) return;
        setGroups((prev) =>
          prev.map((group) => ({
            ...group,
            servers: group.servers.map((s) => {
              const d = deltas.get(s.code.toLowerCase());
              if (!d) return s;
              return {
                ...s,
                successCount: s.successCount + d.sd,
                errorCount: s.errorCount + d.ed,
                totalCount: s.totalCount + d.sd + d.ed,
                lastScrape: Date.now(),
              };
            }),
          }))
        );
        return;
      }
      if (evt?.silent) return;

      const ignoreForKpi = new Set([
        'rankings_batch_start',
        'rankings_summary',
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
    onLog(handler);
  }, []);

  const timeAgo = useCallback((timestamp) => {
    if (!timestamp) return '—';
    const diff = now - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
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

