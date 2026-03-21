import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

export function SectionScraper({ settings, patch, resetSection }) {
  const s = settings.scraper;
  const [uaExpanded, setUaExpanded] = useState(false);

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Scraper &amp; Puppeteer</h2>
          <p className="section-desc">
            Configuration du moteur de scraping et des navigateurs headless
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => resetSection('scraper')}
        >
          <RotateCcw size={12} /> Réinitialiser
        </button>
      </div>

      <div className="settings-group">
        <h3 className="group-title">Performance</h3>
        <div className="settings-grid">
          <div className="setting-card">
            <div className="setting-card-header">
              <span
                className="setting-card-label"
                title="Nombre de workers utilisés en parallèle pour le scraping (augmenter = plus rapide mais plus de charge CPU)."
              >
                Workers parallèles
              </span>
              <span
                className="setting-card-value"
                style={{ color: 'var(--accent-cyan)' }}
              >
                {s.concurrency}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={s.concurrency}
              onChange={(e) =>
                patch('scraper', {
                  concurrency: Number(e.target.value),
                })
              }
              className="range-input"
            />
            <div className="range-labels">
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-card-header">
              <span
                className="setting-card-label"
                title="Nombre de profils joueurs DOSTATS ouverts et scrapés en même temps (plus haut = plus rapide, mais plus lourd)."
              >
                Profils concurrents DoStats
              </span>
              <span
                className="setting-card-value"
                style={{ color: 'var(--accent-rose)' }}
              >
                {s.profilesConcurrency}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={s.profilesConcurrency}
              onChange={(e) => {
                const v = Number(e.target.value);
                patch('scraper', { profilesConcurrency: v });
                if (window.electronDostatsProfilesScraper?.start) {
                  // No-op call just to ensure API exists; real concurrency is read in main via global.dostatsProfilesConcurrency.
                  // We avoid triggering any scraping here.
                }
              }}
              className="range-input"
            />
            <div className="range-labels">
              <span>1</span>
              <span>10</span>
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-card-header">
              <span
                className="setting-card-label"
                title="Temps maximal (en secondes) autorisé pour charger une page DOSTATS avant de considérer que la requête a échoué."
              >
                Timeout par page
              </span>
              <span
                className="setting-card-value"
                style={{ color: 'var(--accent-violet)' }}
              >
                {s.timeoutMs / 1000}
                s
              </span>
            </div>
            <input
              type="range"
              min={5000}
              max={60000}
              step={1000}
              value={s.timeoutMs}
              onChange={(e) =>
                patch('scraper', {
                  timeoutMs: Number(e.target.value),
                })
              }
              className="range-input"
            />
            <div className="range-labels">
              <span>5s</span>
              <span>60s</span>
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-card-header">
              <span
                className="setting-card-label"
                title="Pause (en millisecondes) entre deux chargements de pages DOSTATS pour éviter de les enchaîner trop vite."
              >
                Délai rate limit
              </span>
              <span
                className="setting-card-value"
                style={{ color: 'var(--accent-amber)' }}
              >
                {s.rateLimitDelay}
                ms
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={10000}
              step={100}
              value={s.rateLimitDelay}
              onChange={(e) =>
                patch('scraper', {
                  rateLimitDelay: Number(e.target.value),
                })
              }
              className="range-input"
            />
            <div className="range-labels">
              <span>500ms</span>
              <span>10s</span>
            </div>
          </div>

          <div className="setting-card">
            <div className="setting-card-header">
              <span
                className="setting-card-label"
                title="Nombre de nouvelles tentatives automatiques quand un chargement de page échoue (erreur réseau, timeout, etc.)."
              >
                Tentatives (retries)
              </span>
              <span
                className="setting-card-value"
                style={{ color: 'var(--accent-emerald)' }}
              >
                {s.retries}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={s.retries}
              onChange={(e) =>
                patch('scraper', {
                  retries: Number(e.target.value),
                })
              }
              className="range-input"
            />
            <div className="range-labels">
              <span>0</span>
              <span>10</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="group-title">Puppeteer</h3>
        <div className="toggle-list">
          {[
            {
              key: 'headless',
              label: 'Mode headless',
              desc: 'Navigateur sans interface graphique',
            },
            {
              key: 'blockImages',
              label: 'Bloquer les images',
              desc: 'Réduit la bande passante consommée',
            },
            {
              key: 'blockFonts',
              label: 'Bloquer les polices',
              desc: 'Améliore la vitesse de chargement',
            },
            {
              key: 'blockCSS',
              label: 'Bloquer le CSS',
              desc: 'Maximum de vitesse, peut casser le parsing',
            },
            {
              key: 'screenshotOnError',
              label: 'Screenshot sur erreur',
              desc: "Capture la page en cas d'échec",
            },
          ].map((item) => (
            <div key={item.key} className="toggle-row">
              <div className="toggle-row-text">
                <span className="toggle-row-label">
                  {item.label}
                </span>
                <span className="toggle-row-desc">
                  {item.desc}
                </span>
              </div>
              <button
                type="button"
                className={`toggle-switch ${
                  s[item.key] ? 'on' : ''
                }`}
                onClick={() =>
                  patch('scraper', {
                    [item.key]: !s[item.key],
                  })
                }
              >
                <div className="toggle-thumb" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div
          className="ua-header"
          onClick={() => setUaExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setUaExpanded((v) => !v);
            }
          }}
        >
          <h3 className="group-title">User-Agent</h3>
          <span className="ua-preview">
            {s.userAgent.slice(0, 50)}
            ...
          </span>
          <span className="ua-toggle">
            {uaExpanded ? '▲' : '▼'}
          </span>
        </div>
        {uaExpanded && (
          <textarea
            className="form-textarea"
            value={s.userAgent}
            onChange={(e) =>
              patch('scraper', {
                userAgent: e.target.value,
              })
            }
            rows={3}
          />
        )}
      </div>
    </div>
  );
}

