import React from 'react';
import { useLiveLogs } from '../hooks/useLiveLogs';

export function LiveFeed() {
  const { logs, clearLogs } = useLiveLogs();
  const active = logs.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 999,
              backgroundColor: active ? 'rgba(74,222,128,0.12)' : 'rgba(148,163,184,0.08)',
              color: active ? '#4ade80' : 'var(--text-muted)',
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: active ? '#4ade80' : 'rgba(148,163,184,0.4)',
                boxShadow: active ? '0 0 6px #4ade80' : 'none',
              }}
            />
            LIVE
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            Scraping events stream
          </span>
        </div>
        <button
          type="button"
          onClick={clearLogs}
          title="Vider le flux"
          style={{
            padding: '4px 10px',
            fontSize: 11,
            borderRadius: 8,
            border: '1px solid rgba(148,163,184,0.3)',
            background: 'rgba(0,0,0,0.3)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>

      <div
        className="scroll-thin"
        style={{
          flex: 1,
          overflow: 'auto',
          marginTop: 4,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 6,
        }}
      >
        {logs.length === 0 && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            En attente des premiers événements de scraping…
          </div>
        )}
        {logs.map((log) => (
          <LogItem key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}

function LogItem({ log }) {
  const colorMap = {
    success: '#4ade80',
    error: '#f97373',
    warning: '#facc15',
    info: '#63b3ed',
  };
  const iconMap = {
    success: '✅',
    error: '❌',
    warning: '⚡',
    info: 'ℹ️',
  };

  const color = colorMap[log.type] || colorMap.info;
  const icon = iconMap[log.type] || iconMap.info;

  return (
    <div
      className="log-item"
      style={{
        padding: '6px 8px',
        borderRadius: 10,
        background: 'rgba(15,23,42,0.9)',
        border: '1px solid rgba(148,163,184,0.25)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        fontSize: 11,
      }}
    >
      <span style={{ color }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div
        style={{
          color: 'var(--text-primary)',
          marginBottom: 2,
          whiteSpace: log.multiline ? 'pre-line' : 'normal',
        }}
      >
        {log.message}
        {log.symbol === 'check' && (
          <span style={{ color: '#4ade80', fontWeight: 600 }}> ✔</span>
        )}
        {log.symbol === 'cross' && (
          <span style={{ color: '#f87171', fontWeight: 600 }}> ✗</span>
        )}
      </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-muted)',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 10,
          }}
        >
          <span>{log.timestamp}</span>
          {log.context ? (
            <span title="Serveur ou type de métrique">
              {log.context}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

