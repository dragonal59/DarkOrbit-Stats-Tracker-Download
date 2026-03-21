import React, { useState, useEffect, useRef } from 'react';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes, silent test
const SERVER = 'gbl5';
const TYPE = 'honor';
const PERIOD = 'current';
const MIN_ENTRIES_OK = 10;

const STATUS = {
  none: { label: 'Non vérifié', color: 'var(--text-muted)', class: 'dostats-dot--none' },
  inactive: { label: 'Inactif (0 entrée)', color: 'var(--accent-rose)', class: 'dostats-dot--inactive' },
  ok: { label: 'Actif (≥10 entrées)', color: 'var(--accent-emerald)', class: 'dostats-dot--ok' },
};

async function checkDostatsHonorGbl5() {
  const api = typeof window !== 'undefined' && window.electronDostatsScraper;
  if (!api) return 'none';
  try {
    let count = 0;
    if (typeof api.checkHealth === 'function') {
      const res = await api.checkHealth(SERVER, TYPE, PERIOD);
      count = typeof res?.count === 'number' ? res.count : 0;
    } else if (typeof api.getRanking === 'function') {
      const data = await api.getRanking(SERVER, TYPE, PERIOD);
      const entries = data && Array.isArray(data.entries) ? data.entries : [];
      count = entries.length;
    } else {
      return 'none';
    }
    if (count >= MIN_ENTRIES_OK) return 'ok';
    return 'inactive';
  } catch {
    return 'inactive';
  }
}

export function DostatsStatusDashboard() {
  const [status, setStatus] = useState('none');
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const run = () => {
      checkDostatsHonorGbl5().then((s) => {
        if (!cancelledRef.current) setStatus(s);
      });
    };

    run();
    const t = setInterval(run, INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      clearInterval(t);
    };
  }, []);

  const info = STATUS[status] || STATUS.none;
  const isOk = status === 'ok';

  return (
    <div className="dostats-status-dashboard" title={info.label}>
      <div className="dostats-status-line">
        <div className="dostats-status-row1">
          <div className="dostats-status-dot-wrap">
            <span
              className={`dostats-dot dostats-dot-pulse ${info.class}`}
              style={{ backgroundColor: info.color, boxShadow: `0 0 8px ${info.color}` }}
            />
          </div>
          <div className="dostats-status-word-wrap">
            <span className="dostats-status-word">DOSTATS</span>
          </div>
        </div>
        <div className="dostats-status-row2">
          <span
            className={`dostats-status-check ${isOk ? 'dostats-status-check--ok' : 'dostats-status-check--inactive'}`}
            style={!isOk ? { color: info.color } : undefined}
          >
            {isOk ? '✓' : '✗'}
          </span>
        </div>
      </div>
    </div>
  );
}
