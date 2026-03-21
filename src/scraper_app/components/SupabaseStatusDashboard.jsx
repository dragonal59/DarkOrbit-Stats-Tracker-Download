import React, { useState, useEffect } from 'react';

const STATUS = {
  none: { label: 'Aucune connexion', color: 'var(--text-muted)', class: 'supabase-dot--none' },
  error: { label: 'Erreur', color: 'var(--accent-rose)', class: 'supabase-dot--error' },
  partial: { label: 'Connexion incomplète', color: 'var(--accent-amber)', class: 'supabase-dot--partial' },
  ok: { label: 'Opérationnel', color: 'var(--accent-emerald)', class: 'supabase-dot--ok' },
};

async function checkSupabase() {
  const config = typeof window !== 'undefined' && window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.anonKey) return 'none';
  try {
    const res = await fetch(`${config.url}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
    });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'partial';
    return 'error';
  } catch {
    return 'error';
  }
}

export function SupabaseStatusDashboard() {
  const [status, setStatus] = useState('none');

  useEffect(() => {
    let cancelled = false;
    checkSupabase().then((s) => {
      if (!cancelled) setStatus(s);
    });
    const t = setInterval(() => {
      checkSupabase().then((s) => {
        if (!cancelled) setStatus(s);
      });
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const info = STATUS[status] || STATUS.none;
  const isOk = status === 'ok';

  return (
    <div className="supabase-status-dashboard" title={info.label}>
      <div className="supabase-status-line">
        <div className="supabase-status-row1">
          <div className="supabase-status-dot-wrap">
            <span
              className={`supabase-dot supabase-dot-pulse ${info.class}`}
              style={{ backgroundColor: info.color, boxShadow: `0 0 8px ${info.color}` }}
            />
          </div>
          <div className="supabase-status-word-wrap">
            <span className="supabase-status-word">SUPABASE</span>
          </div>
        </div>
        <div className="supabase-status-row2">
          <span
            className={`supabase-status-check ${isOk ? 'supabase-status-check--ok' : ''}`}
            style={!isOk ? { color: info.color } : undefined}
          >
            {isOk ? '✓' : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
