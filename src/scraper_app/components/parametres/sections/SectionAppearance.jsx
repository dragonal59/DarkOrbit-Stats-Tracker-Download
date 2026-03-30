import { motion } from 'framer-motion';
import {
  ACCENT_COLORS,
  UI_DENSITY_OPTIONS,
  APPEARANCE_BEHAVIOR_OPTIONS,
} from '../../../data/defaultSettings';

export function SectionAppearance({ settings, patch, resetSection }) {
  const a = settings.appearance;

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Apparence</h2>
          <p className="section-desc">
            Personnalise l&apos;interface selon tes préférences
          </p>
        </div>
        {typeof resetSection === 'function' && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => resetSection('appearance')}
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="settings-group">
        <h3 className="group-title">Couleur d&apos;accent</h3>
        <p className="group-desc">Couleur principale des boutons, liens et éléments actifs.</p>
        <div className="accent-color-grid">
          {ACCENT_COLORS.map((ac) => (
            <button
              key={ac.value}
              type="button"
              className={`accent-color-btn ${
                a.accentColor === ac.value ? 'selected' : ''
              }`}
              onClick={() => patch('appearance', { accentColor: ac.value })}
              style={{ '--accent': ac.color }}
              title={ac.label}
            >
              <div
                className="accent-swatch"
                style={{ background: ac.color }}
              >
                {a.accentColor === ac.value && (
                  <motion.div
                    className="accent-check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                    }}
                  >
                    ✓
                  </motion.div>
                )}
              </div>
              <span className="accent-label">
                {ac.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="group-title">Densité de l&apos;interface</h3>
        <p className="group-desc">Compact : plus d&apos;infos à l&apos;écran. Aéré : plus d&apos;espacement.</p>
        <div className="density-group">
          {UI_DENSITY_OPTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`density-btn ${
                a.uiDensity === d.value ? 'selected' : ''
              }`}
              onClick={() =>
                patch('appearance', { uiDensity: d.value })
              }
            >
              <span className="density-label">
                {d.label}
              </span>
              <span className="density-desc">
                {d.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="group-title">Comportement</h3>
        <p className="group-desc">Animations, accessibilité et affichage de la barre latérale.</p>
        <div className="toggle-list">
          {APPEARANCE_BEHAVIOR_OPTIONS.map((item) => (
            <div key={item.key} className="toggle-row">
              <div className="toggle-row-text">
                <span className="toggle-row-label">{item.label}</span>
                <span className="toggle-row-desc">{item.desc}</span>
              </div>
              <button
                type="button"
                className={`toggle-switch ${a[item.key] ? 'on' : ''}`}
                onClick={() => patch('appearance', { [item.key]: !a[item.key] })}
              >
                <div className="toggle-thumb" />
              </button>
            </div>
          ))}
          <div className="setting-item">
            <label className="setting-label">Lignes max en console</label>
            <div className="input-with-unit">
              <input
                type="number"
                className="form-input form-input--sm"
                value={a.logMaxLines}
                min={100}
                max={10000}
                step={100}
                onChange={(e) =>
                  patch('appearance', {
                    logMaxLines: Math.min(10000, Math.max(100, Number(e.target.value) || 2000)),
                  })
                }
              />
              <span className="input-unit">lignes</span>
            </div>
            <span className="setting-hint">Nombre maximum de lignes conservées dans la console log.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

