import { useEffect, useState } from 'react';

let _nextId = 1;

export function useLiveLogs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!window.electronDostatsScraper?.onLog) return;
    const handler = (evt) => {
      const log = evt || {};
      if (log.silent) return;
      const id = _nextId++;
      const type = log.type || 'info';
      let message = log.message || '';
      const metricType = log.metric_type || '';

      if (
        metricType === 'rankings_summary' ||
        metricType === 'rankings_batch_start' ||
        metricType === 'player_profile_batch_start' ||
        metricType === 'player_profile_batch_end' ||
        metricType === 'player_profile_failures_list'
      ) {
        setLogs((prev) => [
          {
            id,
            type,
            message,
            timestamp: log.at || new Date().toISOString(),
            context: '',
            symbol: log.symbol || null,
            multiline: metricType === 'player_profile_failures_list',
          },
          ...prev,
        ].slice(0, 50));
        return;
      }

      if (['top_user', 'experience', 'honor', 'alien_kills', 'ship_kills'].includes(metricType) && log.server) {
        const serverCode = String(log.server || '').toUpperCase();
        const periodKey = String(log.period || 'current');
        const count = typeof log.count === 'number' ? log.count : null;

        const typeLabels = {
          top_user: 'Meilleur Joueur',
          experience: 'Expérience',
          honor: 'Honneur',
          alien_kills: 'Aliens vaincus',
          ship_kills: 'Vaisseaux détruits',
        };
        const periodLabels = {
          current: 'All time',
          last_24h: '24h',
          last_7d: '7j',
          last_30d: '30j',
          last_90d: '90j',
          last_365d: '365j',
        };

        const label = typeLabels[metricType] || metricType;
        const periodLabel = periodLabels[periodKey] || periodKey;

        if (count != null && type === 'success') {
          message = `[${serverCode}] ${label} - ${periodLabel} → ${count} entrées ✔`;
        } else {
          message = `[${serverCode}] ${label} - ${periodLabel}`;
        }
      } else if (metricType === 'player_profile') {
        message = message.replace(/^\[[^\]]*]\s*\[[^\]]*]\s*\[[^\]]*]\s*/, '');
      } else {
        message = message.replace(/^\[[^\]]*]\s*\[[^\]]*]\s*\[[^\]]*]\s*/, '');
      }
      const ts = log.at || new Date().toISOString();
      const context = '';
      setLogs((prev) => [
        {
          id,
          type,
          message,
          timestamp: ts,
          context,
          symbol: log.symbol || null,
        },
        ...prev,
      ].slice(0, 50));
    };
    window.electronDostatsScraper.onLog(handler);
  }, []);

  const clearLogs = () => setLogs([]);

  return { logs, clearLogs };
}

