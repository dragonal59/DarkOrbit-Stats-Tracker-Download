import React from 'react';

export function ScraperTable({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}
          >
            Activité du scrapeur
          </div>
        </div>
      </div>
      <div
        className="scroll-thin"
        style={{
          flex: 1,
          overflow: 'auto',
          borderRadius: 12,
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
          }}
        >
          <thead>
            <tr
              style={{
                textAlign: 'left',
                color: 'var(--text-secondary)',
                fontSize: 11,
              }}
            >
              <th style={{ padding: '8px 10px' }}>Name</th>
              <th style={{ padding: '8px 10px' }}>URL</th>
              <th style={{ padding: '8px 10px' }}>Status</th>
              <th style={{ padding: '8px 10px' }}>Speed</th>
              <th style={{ padding: '8px 10px' }}>Last run</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '16px 10px',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  Aucune activité pour le moment.
                </td>
              </tr>
            )}
            {items.map((row) => (
              <tr
                key={row.id}
                style={{
                  transition: 'background 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                className="table-row"
              >
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{row.name}</td>
                <td
                  style={{
                    padding: '8px 10px',
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {row.url}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={{ padding: '8px 10px' }}>{row.speed}</td>
                <td style={{ padding: '8px 10px' }}>{row.lastRun}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      opacity: 0.0,
                      transition: 'opacity 0.18s ease-out',
                    }}
                    className="row-actions"
                  >
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }}>
                      ▶
                    </button>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }}>
                      ⏸
                    </button>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }}>
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    running: {
      label: 'Running',
      color: '#63b3ed',
      bg: 'rgba(99,179,237,0.14)',
    },
    paused: {
      label: 'Paused',
      color: '#ed8936',
      bg: 'rgba(237,137,54,0.14)',
    },
    error: {
      label: 'Error',
      color: '#fc8181',
      bg: 'rgba(252,129,129,0.16)',
    },
  };
  const cfg = map[status] || map.running;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 999,
        backgroundColor: cfg.bg,
        color: cfg.color,
      }}
    >
      <span
        className="status-dot"
        style={{
          width: 7,
          height: 7,
          backgroundColor: cfg.color,
        }}
      />
      <span>{cfg.label}</span>
    </span>
  );
}

