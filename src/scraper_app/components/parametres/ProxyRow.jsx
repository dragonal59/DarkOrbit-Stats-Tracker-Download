import { Trash2, Play, Loader } from 'lucide-react';

const STATUS_CONFIG = {
  ok: { dot: 'var(--accent-emerald)', label: 'OK' },
  error: { dot: 'var(--accent-rose)', label: 'Erreur' },
  idle: { dot: 'var(--text-muted)', label: 'Inactif' },
  testing: { dot: 'var(--accent-amber)', label: 'Test...' },
};

export function ProxyRow({ proxy, onToggle, onDelete, onTest }) {
  const status = STATUS_CONFIG[proxy.status] ?? STATUS_CONFIG.idle;

  return (
    <div
      className={`proxy-row ${
        !proxy.enabled ? 'proxy-row--disabled' : ''
      }`}
    >
      <button
        type="button"
        className={`toggle-switch toggle-switch--sm ${
          proxy.enabled ? 'on' : ''
        }`}
        onClick={onToggle}
      >
        <div className="toggle-thumb" />
      </button>

      <span className="proxy-host">
        {proxy.host}
        <span className="proxy-colon">:</span>
        <span className="proxy-port">{proxy.port}</span>
      </span>

      {proxy.username && (
        <span className="proxy-auth-badge">Auth</span>
      )}

      <span style={{ flex: 1 }} />

      {proxy.latency && (
        <span
          className="proxy-latency"
          style={{
            color:
              proxy.latency < 500
                ? 'var(--accent-emerald)'
                : proxy.latency < 1500
                  ? 'var(--accent-amber)'
                  : 'var(--accent-rose)',
          }}
        >
          {proxy.latency}
          ms
        </span>
      )}

      <div className="proxy-status">
        {proxy.status === 'testing' ? (
          <Loader
            size={10}
            className="spin"
            color="var(--accent-amber)"
          />
        ) : (
          <span
            className="proxy-status-dot"
            style={{ background: status.dot }}
          />
        )}
        <span
          className="proxy-status-label"
          style={{ color: status.dot }}
        >
          {status.label}
        </span>
      </div>

      <button
        type="button"
        className="proxy-action-btn"
        onClick={onTest}
        title="Tester ce proxy"
        disabled={proxy.status === 'testing'}
      >
        <Play size={11} />
      </button>
      <button
        type="button"
        className="proxy-action-btn proxy-action-btn--danger"
        onClick={onDelete}
        title="Supprimer"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

