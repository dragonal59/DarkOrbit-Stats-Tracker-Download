import { motion } from 'framer-motion';
import { Shield, Cpu, Database, Bell, Palette } from 'lucide-react';

const NAV_ITEMS = [
  {
    id: 'proxies',
    icon: Shield,
    label: 'Proxies',
    desc: 'Rotation & gestion',
    getStatus: (s) => {
      const active = s.proxies.list.filter(
        (p) => p.enabled && p.status === 'ok',
      ).length;
      const total = s.proxies.list.length;
      return {
        text: `${active}/${total} actifs`,
        color:
          active > 0
            ? 'var(--accent-emerald)'
            : 'var(--accent-rose)',
      };
    },
  },
  {
    id: 'scraper',
    icon: Cpu,
    label: 'Scraper',
    desc: 'Puppeteer & moteur',
    getStatus: (s) => ({
      text: `${s.scraper.concurrency} workers`,
      color: 'var(--accent-cyan)',
    }),
  },
  {
    id: 'database',
    icon: Database,
    label: 'Données',
    desc: 'Stockage & backup',
    getStatus: (s) => ({
      text: s.database.backupEnabled ? 'Backup ON' : 'Backup OFF',
      color: s.database.backupEnabled
        ? 'var(--accent-emerald)'
        : 'var(--accent-amber)',
    }),
  },
  {
    id: 'notifications',
    icon: Bell,
    label: 'Notifications',
    desc: 'Alertes & webhooks',
    getStatus: (s) => ({
      text: s.notifications.webhookEnabled
        ? 'Webhook ON'
        : 'Desktop only',
      color: s.notifications.webhookEnabled
        ? 'var(--accent-violet)'
        : 'var(--text-muted)',
    }),
  },
  {
    id: 'appearance',
    icon: Palette,
    label: 'Apparence',
    desc: 'Thème & densité',
    getStatus: (s) => ({
      text:
        s.appearance.accentColor.charAt(0).toUpperCase() +
        s.appearance.accentColor.slice(1),
      color: 'var(--accent-cyan)',
    }),
  },
];

export function SettingsSidebar({
  active,
  onChange,
  isDirty,
  settings,
}) {
  return (
    <nav className="settings-sidebar">
      <div className="settings-sidebar-header">
        <span className="settings-sidebar-title">
          Paramètres
        </span>
        {isDirty && (
          <span
            className="dirty-dot"
            title="Modifications non sauvegardées"
          />
        )}
      </div>

      <div className="settings-nav">
        {NAV_ITEMS.map((item, i) => {
          const Icon = item.icon;
          const status = item.getStatus(settings);
          const isActive = active === item.id;

          return (
            <motion.button
              key={item.id}
              type="button"
              className={`settings-nav-item ${
                isActive ? 'active' : ''
              }`}
              onClick={() => onChange(item.id)}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              whileHover={{ x: 3 }}
            >
              {isActive && (
                <motion.div
                  className="nav-active-bar"
                  layoutId="active-bar"
                  transition={{
                    duration: 0.25,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              )}

              <div
                className="nav-icon-wrapper"
                style={{
                  background: isActive
                    ? 'rgba(99,179,237,0.12)'
                    : 'rgba(255,255,255,0.04)',
                  borderColor: isActive
                    ? 'rgba(99,179,237,0.25)'
                    : 'var(--border-glass)',
                }}
              >
                <Icon
                  size={14}
                  color={
                    isActive
                      ? 'var(--accent-cyan)'
                      : 'var(--text-muted)'
                  }
                />
              </div>

              <div className="nav-text">
                <span className="nav-label">{item.label}</span>
                <span className="nav-desc">{item.desc}</span>
              </div>

              <span
                className="nav-status"
                style={{ color: status.color }}
              >
                {status.text}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}

