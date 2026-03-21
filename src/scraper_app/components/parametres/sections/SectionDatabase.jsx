import { FolderOpen, RotateCcw } from 'lucide-react';

export function SectionDatabase({ settings, patch, resetSection }) {
  const d = settings.database;

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Données &amp; Stockage</h2>
          <p className="section-desc">
            Chemins d&apos;export, format des fichiers, backup automatique et
            rétention
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => resetSection('database')}
        >
          <RotateCcw size={12} /> Réinitialiser
        </button>
      </div>

      <div className="settings-group">
        <h3 className="group-title">Export</h3>
        <div className="settings-rows">
          <div className="setting-row-full">
            <label className="setting-label">Dossier de sortie</label>
            <div className="path-input-wrapper">
              <input
                type="text"
                className="form-input"
                value={d.outputDir}
                onChange={(e) =>
                  patch('database', { outputDir: e.target.value })
                }
                placeholder="./rankings_output"
              />
              <button
                type="button"
                className="path-browse-btn"
                title="Ouvrir le dossier des classements (emplacement réel de l’app)"
                onClick={() => {
                  if (typeof window.scraperBridge?.openOutputDir === 'function') {
                    window.scraperBridge.openOutputDir().catch(() => {});
                  }
                }}
              >
                <FolderOpen size={13} />
              </button>
            </div>
          </div>
          <div className="settings-row">
            <div className="setting-item">
              <label className="setting-label">Format</label>
              <div className="toggle-group">
                {['json', 'json+csv'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`toggle-chip ${
                      d.format === f ? 'selected' : ''
                    }`}
                    onClick={() => patch('database', { format: f })}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-item">
              <label className="setting-label">JSON indenté</label>
              <button
                type="button"
                className={`toggle-switch ${
                  d.prettyPrint ? 'on' : ''
                }`}
                onClick={() =>
                  patch('database', {
                    prettyPrint: !d.prettyPrint,
                  })
                }
              >
                <div className="toggle-thumb" />
              </button>
            </div>
            <div className="setting-item">
              <label className="setting-label">
                Compresser fichiers &gt; 7j
              </label>
              <button
                type="button"
                className={`toggle-switch ${
                  d.compressOld ? 'on' : ''
                }`}
                onClick={() =>
                  patch('database', {
                    compressOld: !d.compressOld,
                  })
                }
              >
                <div className="toggle-thumb" />
              </button>
            </div>
          </div>
          <div className="setting-item">
            <label className="setting-label">
              Rétention (jours, 0 = infini)
            </label>
            <div className="input-with-unit">
              <input
                type="number"
                className="form-input form-input--sm"
                value={d.retentionDays}
                min={0}
                onChange={(e) =>
                  patch('database', {
                    retentionDays: Number(e.target.value),
                  })
                }
              />
              <span className="input-unit">jours</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="group-title">Backup automatique</h3>
        <div className="toggle-row">
          <div className="toggle-row-text">
            <span className="toggle-row-label">
              Backup activé
            </span>
            <span className="toggle-row-desc">
              Copie automatique vers le dossier de backup
            </span>
          </div>
          <button
            type="button"
            className={`toggle-switch ${
              d.backupEnabled ? 'on' : ''
            }`}
            onClick={() =>
              patch('database', {
                backupEnabled: !d.backupEnabled,
              })
            }
          >
            <div className="toggle-thumb" />
          </button>
        </div>
        {d.backupEnabled && (
          <div className="settings-rows">
            <div className="setting-row-full">
              <label className="setting-label">
                Dossier de backup
              </label>
              <div className="path-input-wrapper">
                <input
                  type="text"
                  className="form-input"
                  value={d.backupDir}
                  onChange={(e) =>
                    patch('database', {
                      backupDir: e.target.value,
                    })
                  }
                />
                <button
                  type="button"
                  className="path-browse-btn"
                >
                  <FolderOpen size={13} />
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div className="setting-item">
                <label className="setting-label">
                  Fréquence
                </label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="form-input form-input--sm"
                    value={d.backupEveryH}
                    min={1}
                    onChange={(e) =>
                      patch('database', {
                        backupEveryH: Number(e.target.value),
                      })
                    }
                  />
                  <span className="input-unit">
                    heures
                  </span>
                </div>
              </div>
              <div className="setting-item">
                <label className="setting-label">
                  Backups max conservés
                </label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="form-input form-input--sm"
                    value={d.maxBackups}
                    min={1}
                    onChange={(e) =>
                      patch('database', {
                        maxBackups: Number(e.target.value),
                      })
                    }
                  />
                  <span className="input-unit">
                    fichiers
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

