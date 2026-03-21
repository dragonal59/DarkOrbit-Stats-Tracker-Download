import React from 'react';

export function GlassTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: 'rgba(11,15,30,0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        fontSize: 11,
      }}
    >
      <div
        style={{
          marginBottom: 4,
          color: 'var(--text-secondary)',
        }}
      >
        {label}
      </div>
      {payload.map((entry) => (
        <div
          key={entry.dataKey}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: entry.color,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: entry.color,
            }}
          />
          <span>{entry.name || entry.dataKey}</span>
          <span style={{ color: 'var(--text-primary)' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

