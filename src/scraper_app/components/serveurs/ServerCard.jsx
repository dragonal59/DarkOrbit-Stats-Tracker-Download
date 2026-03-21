import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Settings } from 'lucide-react';
import { ServerStatusDot } from './ServerStatusDot';

const STATUS_COLORS = {
  running: 'var(--accent-emerald)',
  idle: 'var(--accent-amber)',
  paused: 'var(--accent-amber)',
  error: 'var(--accent-rose)',
  disabled: 'var(--text-muted)',
};

const latencyColor = (ms) => {
  if (!ms) return 'var(--text-muted)';
  if (ms < 500) return 'var(--accent-emerald)';
  if (ms < 1500) return 'var(--accent-amber)';
  return 'var(--accent-rose)';
};

export function ServerCard({
  server,
  groupAccent,
  timeAgo,
  timeUntil,
  toggleServer,
  onStartScrape,
  isSelected,
  onClick,
}) {
  const [hovered, setHovered] = useState(false);
  const [scrapeProfiles, setScrapeProfiles] = useState(false);
  const [scrapeRankings, setScrapeRankings] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (typeof api?.getServerScrapeConfig === 'function') {
      api.getServerScrapeConfig(server.code)
        .then((cfg) => {
          if (!cfg || typeof cfg !== 'object') return;
          if (typeof cfg.scrapeProfiles === 'boolean') setScrapeProfiles(cfg.scrapeProfiles);
          if (typeof cfg.scrapeRankings === 'boolean') setScrapeRankings(cfg.scrapeRankings);
        })
        .catch(() => {});
      return;
    }
    if (typeof api?.getScrapeProfilesPreference === 'function') {
      api.getScrapeProfilesPreference(server.code).then((value) => {
        setScrapeProfiles(!!value);
      }).catch(() => {});
    }
  }, [server.code]);

  const handleToggleScrapeProfiles = () => {
    const next = !scrapeProfiles;
    setScrapeProfiles(next);
    if (typeof window.electronAPI?.setServerScrapeConfig === 'function') {
      window.electronAPI.setServerScrapeConfig(server.code, { scrapeProfiles: next }).catch(() => {});
    } else if (typeof window.electronAPI?.setScrapeProfilesPreference === 'function') {
      window.electronAPI.setScrapeProfilesPreference(server.code, next).catch(() => {});
    }
  };

  const successPct =
    server.totalCount > 0
      ? (server.successCount / server.totalCount) * 100
      : 0;
  const errorPct =
    server.totalCount > 0
      ? (server.errorCount / server.totalCount) * 100
      : 0;

  const statusColor = STATUS_COLORS[server.status] || STATUS_COLORS.idle;
  const countdown = timeUntil(server.nextScrape);
  const countdownUrgent =
    server.nextScrape && server.nextScrape - Date.now() < 30000;

  return (
    <motion.div
      className={`server-card glass ${server.status} ${
        isSelected ? 'selected' : ''
      }`}
      style={{ '--status-color': statusColor, '--group-accent': groupAccent }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={onClick}
      whileHover={{ y: -4, boxShadow: `0 8px 32px ${statusColor}33` }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="card-header">
        <div className="card-header-left">
          <ServerStatusDot status={server.status} />
          <div>
            <span className="card-label">{server.label}</span>
            <span className="card-code">{server.code}</span>
          </div>
        </div>

        <AnimatePresence>
          {hovered && (
            <motion.div
              className="card-actions"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="card-action-btn"
                title="Scraper les profils joueurs"
                onClick={handleToggleScrapeProfiles}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: scrapeProfiles
                      ? 'var(--accent-emerald)'
                      : 'var(--accent-rose)',
                    boxShadow: scrapeProfiles
                      ? '0 0 6px var(--accent-emerald)'
                      : '0 0 6px var(--accent-rose)',
                  }}
                />
              </button>
              <button
                className="card-action-btn"
                title="Lancer le scrape (classements / profils)"
                onClick={() => {
                  if (!scrapeRankings && !scrapeProfiles) return;
                  toggleServer(server.id, 'start');
                  if (typeof window.electronScraper?.pause === 'function') {
                    window.electronScraper.pause(false);
                  }
                  onStartScrape?.(server.code, {
                    scrapeProfiles,
                    scrapeRankings,
                  });
                }}
              >
                <Play size={12} />
              </button>
              <button
                className="card-action-btn"
                title="Pause le scraping en cours"
                onClick={() => {
                  toggleServer(server.id, 'pause');
                  if (typeof window.electronScraper?.pause === 'function') {
                    window.electronScraper.pause(true);
                  }
                }}
              >
                <Pause size={12} />
              </button>
              <button
                className="card-action-btn"
                title="Config"
                onClick={() => setShowConfig((v) => !v)}
              >
                <Settings size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showConfig && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="server-card-config"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
            }}
            onClick={() => setShowConfig(false)}
          >
            <div
              style={{
                marginTop: 8,
                marginRight: 8,
                padding: 8,
                borderRadius: 8,
                background: 'rgba(15,23,42,0.96)',
                boxShadow: '0 12px 30px rgba(15,23,42,0.6)',
                border: '1px solid rgba(148,163,184,0.7)',
                minWidth: 220,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  Options de scraping
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfig(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 0,
                    lineHeight: 1,
                  }}
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>
              <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 11,
                marginBottom: 4,
              }}
            >
              <span>Classements (HoF)</span>
              <button
                type="button"
                onClick={() => {
                  const next = !scrapeRankings;
                  setScrapeRankings(next);
                  if (!next && scrapeProfiles) {
                    setScrapeProfiles(false);
                  }
                  if (typeof window.electronAPI?.setServerScrapeConfig === 'function') {
                    window.electronAPI
                      .setServerScrapeConfig(server.code, {
                        scrapeRankings: next,
                        scrapeProfiles: next ? scrapeProfiles : false,
                      })
                      .catch(() => {});
                  }
                }}
                style={{
                  padding: '2px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.8)',
                  background: scrapeRankings ? 'var(--accent-emerald)' : 'transparent',
                  color: scrapeRankings ? '#0f172a' : 'var(--text-secondary)',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                {scrapeRankings ? 'Activé' : 'Désactivé'}
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 11,
              }}
            >
              <span>Profils + Galaxy Gates</span>
              <button
                type="button"
                disabled={!scrapeRankings}
                onClick={() => {
                  if (!scrapeRankings) return;
                  const next = !scrapeProfiles;
                  setScrapeProfiles(next);
                  if (typeof window.electronAPI?.setServerScrapeConfig === 'function') {
                    window.electronAPI
                      .setServerScrapeConfig(server.code, { scrapeProfiles: next })
                      .catch(() => {});
                  } else if (typeof window.electronAPI?.setScrapeProfilesPreference === 'function') {
                    window.electronAPI
                      .setScrapeProfilesPreference(server.code, next)
                      .catch(() => {});
                  }
                }}
                style={{
                  padding: '2px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.8)',
                  background: scrapeProfiles ? 'var(--accent-emerald)' : 'transparent',
                  color: scrapeProfiles ? '#0f172a' : 'var(--text-secondary)',
                  fontSize: 10,
                  cursor: !scrapeRankings ? 'not-allowed' : 'pointer',
                  opacity: !scrapeRankings ? 0.4 : 1,
                }}
              >
                {scrapeProfiles ? 'Activé' : 'Désactivé'}
              </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="card-divider" />

      <div className="card-timing">
        <div className="timing-row">
          <span className="timing-label">Dernier scrape</span>
          <span className="timing-value">{timeAgo(server.lastScrape)}</span>
        </div>
        <div className="timing-row">
          <span className="timing-label">Prochain scrape</span>
          <span
            className={`timing-value ${
              countdownUrgent ? 'countdown-urgent' : ''
            }`}
            style={{
              color: countdownUrgent
                ? 'var(--accent-amber)'
                : 'var(--text-secondary)',
            }}
          >
            {countdown ?? '—'}
          </span>
        </div>
      </div>

      {server.activeTypes.length > 0 && (
        <div className="card-types">
          {server.activeTypes.map((type) => (
            <span
              key={type}
              className="type-pill"
              style={{ borderColor: groupAccent, color: groupAccent }}
            >
              {type}
            </span>
          ))}
        </div>
      )}

      <div className="card-divider" />

      <div className="card-bars">
        <div className="bar-row">
          <span className="bar-label">Succès</span>
          <div className="bar-track">
            <motion.div
              className="bar-fill bar-fill--success"
              initial={{ width: 0 }}
              animate={{ width: `${successPct}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="bar-count">
            {server.successCount.toLocaleString()}
          </span>
        </div>
        <div className="bar-row">
          <span className="bar-label">Erreurs</span>
          <div className="bar-track">
            <motion.div
              className="bar-fill bar-fill--error"
              initial={{ width: 0 }}
              animate={{ width: `${errorPct}%` }}
              transition={{
                duration: 0.8,
                delay: 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          </div>
          <span className="bar-count">
            {server.errorCount.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="card-divider" />

      <div className="card-metrics">
        <div className="metric">
          <span className="metric-label">Vitesse</span>
          <span
            className="metric-value"
            style={{ color: server.speed ? groupAccent : undefined }}
          >
            {server.speed ? `${server.speed} req/s` : '—'}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Latence</span>
          <span
            className="metric-value"
            style={{ color: latencyColor(server.latency) }}
          >
            {server.latency ? `${server.latency}ms` : '—'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

