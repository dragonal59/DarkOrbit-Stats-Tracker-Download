import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Upload,
  Wifi,
  RotateCcw,
} from 'lucide-react';
import { ProxyRow } from '../ProxyRow';
import {
  DEFAULT_SETTINGS,
  ROTATION_MODES,
} from '../../../data/defaultSettings';

export function SectionProxies({
  settings,
  patch,
  addProxy,
  updateProxy,
  deleteProxy,
  importProxies,
  testAllProxies,
}) {
  const p = settings.proxies;
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [newProxy, setNewProxy] = useState({
    host: '',
    port: 8080,
    username: '',
    password: '',
  });
  const [testing, setTesting] = useState(false);

  const stats = {
    total: p.list.length,
    active: p.list.filter(
      (x) => x.enabled && x.status === 'ok',
    ).length,
    errors: p.list.filter((x) => x.status === 'error')
      .length,
    disabled: p.list.filter((x) => !x.enabled).length,
    avgLatency: Math.round(
      p.list
        .filter((x) => x.latency)
        .reduce((s, x) => s + x.latency, 0) /
        (p.list.filter((x) => x.latency).length || 1),
    ),
  };

  const handleImport = () => {
    const count = importProxies(importText);
    setImportResult(count);
    setImportText('');
    setTimeout(() => {
      setImportResult(null);
      setShowImport(false);
    }, 2000);
  };

  const handleTestAll = async () => {
    setTesting(true);
    await testAllProxies();
    setTesting(false);
  };

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Proxies</h2>
          <p className="section-desc">
            Gestion du pool de proxies et stratégie de
            rotation
          </p>
        </div>
        <div className="section-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleTestAll}
            disabled={testing}
          >
            <Wifi size={13} />
            {testing ? 'Test en cours...' : 'Tester tous'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowImport((v) => !v)}
          >
            <Upload size={13} /> Importer
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus size={13} /> Ajouter
          </button>
        </div>
      </div>

      <div className="settings-group proxy-direct-toggle">
        <div className="toggle-row">
          <div className="toggle-row-text">
            <span className="toggle-row-label">
              Scraper sans proxy
            </span>
            <span className="toggle-row-desc">
              Connexion directe uniquement (ignore les proxies pour les fenêtres de
              scraping Electron). Sauvegardé automatiquement avec les autres paramètres.
            </span>
          </div>
          <button
            type="button"
            className={`toggle-switch ${
              p.scrapeWithoutProxy ? 'on' : ''
            }`}
            onClick={() =>
              patch('proxies', {
                scrapeWithoutProxy: !p.scrapeWithoutProxy,
              })
            }
            aria-pressed={!!p.scrapeWithoutProxy}
          >
            <div className="toggle-thumb" />
          </button>
        </div>
      </div>

      <div className="proxy-stats-row">
        <div className="proxy-stat">
          <span
            className="proxy-stat-value"
            style={{ color: 'var(--accent-emerald)' }}
          >
            {stats.active}
          </span>
          <span className="proxy-stat-label">Actifs</span>
        </div>
        <div className="proxy-stat">
          <span
            className="proxy-stat-value"
            style={{ color: 'var(--accent-rose)' }}
          >
            {stats.errors}
          </span>
          <span className="proxy-stat-label">En erreur</span>
        </div>
        <div className="proxy-stat">
          <span
            className="proxy-stat-value"
            style={{ color: 'var(--text-muted)' }}
          >
            {stats.disabled}
          </span>
          <span className="proxy-stat-label">
            Désactivés
          </span>
        </div>
        <div className="proxy-stat">
          <span
            className="proxy-stat-value"
            style={{ color: 'var(--accent-cyan)' }}
          >
            {stats.total}
          </span>
          <span className="proxy-stat-label">Total</span>
        </div>
        <div className="proxy-stat">
          <span
            className="proxy-stat-value"
            style={{ color: 'var(--accent-violet)' }}
          >
            {stats.avgLatency > 0
              ? `${stats.avgLatency}ms`
              : '—'}
          </span>
          <span className="proxy-stat-label">
            Latence moy.
          </span>
        </div>
      </div>

      <AnimatePresence>
        {showImport && (
          <motion.div
            className="import-panel glass"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="import-label">
              Un proxy par ligne — formats acceptés :
              <code>host:port</code> ou{' '}
              <code>host:port:user:pass</code>
            </p>
            <textarea
              className="import-textarea"
              placeholder={
                '104.28.19.83:8080\n192.168.1.47:3128:user:pass\n...'
              }
              value={importText}
              onChange={(e) =>
                setImportText(e.target.value)
              }
              rows={6}
            />
            <div className="import-actions">
              <span className="import-count">
                {
                  importText
                    .split('\n')
                    .filter((l) => l.trim()).length
                }{' '}
                ligne(s) détectée(s)
              </span>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowImport(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleImport}
                disabled={!importText.trim()}
              >
                {importResult !== null
                  ? `✓ ${importResult} proxies importés`
                  : 'Importer'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            className="add-proxy-form glass"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="add-proxy-fields">
              <div className="form-field">
                <label className="form-label">
                  Host
                </label>
                <input
                  className="form-input"
                  placeholder="104.28.19.83"
                  value={newProxy.host}
                  onChange={(e) =>
                    setNewProxy((prev) => ({
                      ...prev,
                      host: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="form-field form-field--sm">
                <label className="form-label">
                  Port
                </label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="8080"
                  value={newProxy.port}
                  onChange={(e) =>
                    setNewProxy((prev) => ({
                      ...prev,
                      port: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="form-field">
                <label className="form-label">
                  Utilisateur (optionnel)
                </label>
                <input
                  className="form-input"
                  placeholder="user"
                  value={newProxy.username}
                  onChange={(e) =>
                    setNewProxy((prev) => ({
                      ...prev,
                      username: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="form-field">
                <label className="form-label">
                  Mot de passe (optionnel)
                </label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="••••••"
                  value={newProxy.password}
                  onChange={(e) =>
                    setNewProxy((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="add-proxy-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowAddForm(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!newProxy.host}
                onClick={() => {
                  addProxy(newProxy);
                  setNewProxy({
                    host: '',
                    port: 8080,
                    username: '',
                    password: '',
                  });
                  setShowAddForm(false);
                }}
              >
                Ajouter
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="proxy-list">
        <AnimatePresence>
          {p.list.map((proxy, i) => (
            <motion.div
              // eslint-disable-next-line react/no-array-index-key
              key={proxy.id || i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
            >
              <ProxyRow
                proxy={proxy}
                onToggle={() =>
                  updateProxy(proxy.id, {
                    enabled: !proxy.enabled,
                  })
                }
                onDelete={() => deleteProxy(proxy.id)}
                onTest={async () => {
                  updateProxy(proxy.id, { status: 'testing' });
                  const testUrl = p.testUrl || 'https://dostats.info';
                  const result = await (window.electronAPI?.testProxy?.(proxy, testUrl) ?? Promise.resolve({ ok: false, error: 'IPC indisponible', latency: null }));
                  updateProxy(proxy.id, {
                    status: result.ok ? 'ok' : 'error',
                    latency: result.ok ? result.latency : null,
                  });
                }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {p.list.length === 0 && (
          <div className="proxy-empty">
            Aucun proxy configuré.
          </div>
        )}
      </div>

      <div className="section-divider" />

      <div className="settings-group">
        <div className="section-header">
          <h3 className="group-title">
            Stratégie de rotation
          </h3>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() =>
              patch('proxies', {
                rotationMode:
                  DEFAULT_SETTINGS.proxies.rotationMode,
                rotateOnError:
                  DEFAULT_SETTINGS.proxies.rotateOnError,
                rotateEvery:
                  DEFAULT_SETTINGS.proxies.rotateEvery,
                cooldownMs:
                  DEFAULT_SETTINGS.proxies.cooldownMs,
                scrapeWithoutProxy:
                  DEFAULT_SETTINGS.proxies.scrapeWithoutProxy,
              })
            }
          >
            <RotateCcw size={12} /> Réinitialiser
          </button>
        </div>
        <div className="rotation-mode-group">
          {ROTATION_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={`rotation-mode-btn ${
                p.rotationMode === mode.value
                  ? 'selected'
                  : ''
              }`}
              onClick={() =>
                patch('proxies', {
                  rotationMode: mode.value,
                })
              }
            >
              <span className="rotation-mode-label">
                {mode.label}
              </span>
              <span className="rotation-mode-desc">
                {mode.desc}
              </span>
            </button>
          ))}
        </div>

        <div className="settings-row">
          <div className="setting-item">
            <label className="setting-label">
              Rotation sur erreur
            </label>
            <button
              type="button"
              className={`toggle-switch ${
                p.rotateOnError ? 'on' : ''
              }`}
              onClick={() =>
                patch('proxies', {
                  rotateOnError: !p.rotateOnError,
                })
              }
            >
              <div className="toggle-thumb" />
            </button>
          </div>
          <div className="setting-item">
            <label className="setting-label">
              Rotation toutes les
            </label>
            <div className="input-with-unit">
              <input
                type="number"
                className="form-input form-input--sm"
                value={p.rotateEvery}
                min={1}
                max={1000}
                onChange={(e) =>
                  patch('proxies', {
                    rotateEvery: Number(e.target.value),
                  })
                }
              />
              <span className="input-unit">
                requêtes
              </span>
            </div>
          </div>
          <div className="setting-item">
            <label className="setting-label">
              Cooldown entre requêtes
            </label>
            <div className="input-with-unit">
              <input
                type="number"
                className="form-input form-input--sm"
                value={p.cooldownMs}
                min={0}
                step={100}
                onChange={(e) =>
                  patch('proxies', {
                    cooldownMs: Number(e.target.value),
                  })
                }
              />
              <span className="input-unit">ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

