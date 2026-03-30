import { motion, AnimatePresence } from 'framer-motion';
import { TestButton } from '../TestButton';

export function SectionNotifications({ settings, patch }) {
  const n = settings.notifications;

  return (
    <div className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Notifications</h2>
          <p className="section-desc">
            Alertes bureau, webhooks HTTP et intégration Discord
          </p>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="group-title">Notifications bureau</h3>
        <div className="toggle-list">
          {[
            {
              key: 'desktopEnabled',
              label: 'Notifications bureau',
              desc: 'Notifications système Electron',
            },
            {
              key: 'soundEnabled',
              label: 'Son',
              desc: 'Bip sonore à chaque alerte',
            },
            {
              key: 'notifyOnError',
              label: 'Alerter sur erreur',
              desc: 'Notification si le scraper rencontre une erreur',
            },
            {
              key: 'notifyOnComplete',
              label: 'Alerter à la fin',
              desc: 'Notification quand un batch est terminé',
            },
            {
              key: 'notifyOnRateLimit',
              label: 'Alerter sur rate limit',
              desc: 'Notification si un rate limit est détecté',
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
                  n[item.key] ? 'on' : ''
                }`}
                onClick={() =>
                  patch('notifications', {
                    [item.key]: !n[item.key],
                  })
                }
              >
                <div className="toggle-thumb" />
              </button>
            </div>
          ))}
          <div className="setting-item">
            <label className="setting-label">
              Seuil d&apos;erreurs (10min)
            </label>
            <div className="input-with-unit">
              <input
                type="number"
                className="form-input form-input--sm"
                value={n.errorThreshold}
                min={1}
                onChange={(e) =>
                  patch('notifications', {
                    errorThreshold: Number(e.target.value),
                  })
                }
              />
              <span className="input-unit">erreurs</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="toggle-row">
          <div className="toggle-row-text">
            <span className="toggle-row-label">
              Webhook HTTP
            </span>
            <span className="toggle-row-desc">
              POST JSON vers une URL externe
            </span>
          </div>
          <button
            type="button"
            className={`toggle-switch ${
              n.webhookEnabled ? 'on' : ''
            }`}
            onClick={() =>
              patch('notifications', {
                webhookEnabled: !n.webhookEnabled,
              })
            }
          >
            <div className="toggle-thumb" />
          </button>
        </div>
        <AnimatePresence>
          {n.webhookEnabled && (
            <motion.div
              className="webhook-config"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="setting-row-full">
                <label className="setting-label">
                  URL du webhook
                </label>
                <div className="path-input-wrapper">
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://example.com/webhook"
                    value={n.webhookUrl}
                    onChange={(e) =>
                      patch('notifications', {
                        webhookUrl: e.target.value,
                      })
                    }
                  />
                  <TestButton
                    label="Tester"
                    onTest={async () => {
                      const res = await (window.electronAPI?.testWebhook?.(n.webhookUrl, 'http') ?? Promise.resolve({ ok: false }));
                      return !!res?.ok;
                    }}
                  />
                </div>
              </div>
              <div className="settings-row">
                <div className="setting-item">
                  <label className="setting-label">
                    Sur erreur
                  </label>
                  <button
                    type="button"
                    className={`toggle-switch toggle-switch--sm ${
                      n.webhookOnError ? 'on' : ''
                    }`}
                    onClick={() =>
                      patch('notifications', {
                        webhookOnError: !n.webhookOnError,
                      })
                    }
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>
                <div className="setting-item">
                  <label className="setting-label">
                    Sur complétion
                  </label>
                  <button
                    type="button"
                    className={`toggle-switch toggle-switch--sm ${
                      n.webhookOnComplete ? 'on' : ''
                    }`}
                    onClick={() =>
                      patch('notifications', {
                        webhookOnComplete:
                          !n.webhookOnComplete,
                      })
                    }
                  >
                    <div className="toggle-thumb" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="settings-group">
        <div className="toggle-row">
          <div className="toggle-row-text">
            <span
              className="toggle-row-label"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>🎮</span> Discord
              Webhook
            </span>
            <span className="toggle-row-desc">
              Envoie des alertes dans un channel Discord
            </span>
          </div>
          <button
            type="button"
            className={`toggle-switch ${
              n.discordEnabled ? 'on' : ''
            }`}
            onClick={() =>
              patch('notifications', {
                discordEnabled: !n.discordEnabled,
              })
            }
          >
            <div className="toggle-thumb" />
          </button>
        </div>
        <AnimatePresence>
          {n.discordEnabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <label className="setting-label">
                URL du webhook Discord
              </label>
              <div
                className="path-input-wrapper"
                style={{ marginTop: 6 }}
              >
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={n.discordWebhookUrl}
                  onChange={(e) =>
                    patch('notifications', {
                      discordWebhookUrl: e.target.value,
                    })
                  }
                />
                <TestButton
                  label="Tester"
                  onTest={async () => {
                    const res = await (window.electronAPI?.testWebhook?.(n.discordWebhookUrl, 'discord') ?? Promise.resolve({ ok: false }));
                    return !!res?.ok;
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

