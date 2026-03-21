import { motion } from 'framer-motion';

const GATE_LABELS = {
  alpha: 'Alpha',
  beta: 'Beta',
  gamma: 'Gamma',
  delta: 'Delta',
  epsilon: 'Epsilon',
  zeta: 'Zeta',
  kappa: 'Kappa',
  lambda: 'Lambda',
  kronos: 'Kronos',
  hades: 'Hades',
  other: 'Other',
};

const GATE_COLORS = {
  alpha: '#63b3ed',
  beta: '#9f7aea',
  gamma: '#48bb78',
  delta: '#ed8936',
  epsilon: '#fc8181',
  zeta: '#4fd1c5',
  kappa: '#f6e05e',
  lambda: '#b794f4',
  kronos: '#fc8181',
  hades: '#553c9a',
  other: 'rgba(255,255,255,0.2)',
};

export function GalaxyGatesBar({ gates, accent }) {
  const numericValues = Object.entries(gates)
    .filter(([k, v]) => k !== 'total' && v != null)
    .map(([, v]) => v);
  const max = numericValues.length ? Math.max(...numericValues) : 0;

  return (
    <div className="galaxy-gates">
      <div className="gates-header">
        <span className="gates-title">Galaxy Gates</span>
        <span className="gates-total" style={{ color: accent }}>
          {gates.total != null ? (
            `${gates.total.toLocaleString('fr-FR')} total`
          ) : (
            <span className="null-value">total null</span>
          )}
        </span>
      </div>

      <div className="gates-bars">
        {Object.entries(GATE_LABELS).map(([key, label], i) => {
          const value = gates[key];
          const pct = value != null && max > 0 ? (value / max) * 100 : 0;
          const color = GATE_COLORS[key];

          return (
            <div key={key} className="gate-row">
              <span className="gate-label">{label}</span>
              <div className="gate-track">
                {value != null ? (
                  <motion.div
                    className="gate-fill"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{
                      delay: i * 0.04,
                      duration: 0.6,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                ) : (
                  <div className="gate-null-track" />
                )}
              </div>
              <span
                className={`gate-value ${
                  value == null ? 'null-value' : ''
                }`}
              >
                {value != null ? value.toLocaleString('fr-FR') : 'null'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

