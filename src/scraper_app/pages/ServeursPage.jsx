import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServeursLeftPanel } from '../components/serveurs/ServeursLeftPanel';
import { ServerGroup } from '../components/serveurs/ServerGroup';
import { ServerDetailDrawer } from '../components/serveurs/ServerDetailDrawer';
import '../serveurs.css';

/**
 * Scrape tous les serveurs du groupe : une file côté main (dostatsScraperStartQueue),
 * mêmes options que chaque carte (getServerScrapeConfig par code).
 */
async function scrapeGroupServers(servers, toggleServer) {
  if (!servers || !servers.length) return;
  if (typeof window.electronDostatsScraper?.start !== 'function') return;
  const api = window.electronAPI;
  const configs = await Promise.all(
    servers.map(async (server) => {
      let scrapeProfiles = false;
      let scrapeRankings = true;
      let enabled = true;
      if (typeof api?.getServerScrapeConfig === 'function') {
        try {
          const cfg = await api.getServerScrapeConfig(server.code);
          if (cfg && typeof cfg === 'object') {
            if (typeof cfg.scrapeProfiles === 'boolean') scrapeProfiles = cfg.scrapeProfiles;
            if (typeof cfg.scrapeRankings === 'boolean') scrapeRankings = cfg.scrapeRankings;
            if (typeof cfg.enabled === 'boolean') enabled = cfg.enabled;
          }
        } catch (_) {
          /* ignore */
        }
      } else if (typeof api?.getScrapeProfilesPreference === 'function') {
        try {
          const v = await api.getScrapeProfilesPreference(server.code);
          scrapeProfiles = !!v;
        } catch (_) {
          /* ignore */
        }
      }
      return { server, scrapeProfiles, scrapeRankings, enabled };
    }),
  );
  const active = configs.filter(({ enabled, scrapeProfiles, scrapeRankings }) => enabled && (scrapeRankings || scrapeProfiles));
  if (!active.length) return;
  active.forEach(({ server }) => toggleServer(server.id, 'start'));
  if (typeof window.electronScraper?.pause === 'function') {
    window.electronScraper.pause(false);
  }
  window.electronDostatsScraper.start({
    serverCodes: active.map(({ server }) => server.code),
    serverConfigs: active.reduce((acc, { server, scrapeProfiles, scrapeRankings, enabled }) => {
      acc[server.code] = { enabled, scrapeProfiles, scrapeRankings };
      return acc;
    }, {}),
  });
}

async function scrapeAllServers(groups, toggleServer) {
  const servers = (groups || []).flatMap((g) => (g && Array.isArray(g.servers) ? g.servers : []));
  await scrapeGroupServers(servers, toggleServer);
}

function startScrapeForServer(serverCode, options) {
  if (typeof window.electronDostatsScraper?.start !== 'function') return;
  const payload = { serverCode };
  if (options && options.scrapeProfiles) {
    payload.scrapeProfiles = true;
  }
  if (options && Object.prototype.hasOwnProperty.call(options, 'scrapeRankings')) {
    payload.scrapeRankings = !!options.scrapeRankings;
  }
  if (options && Object.prototype.hasOwnProperty.call(options, 'enabled')) {
    payload.enabled = !!options.enabled;
  }
  window.electronDostatsScraper.start(payload);
}

export function ServeursPage({
  groups = [],
  globalStats = {},
  timeAgo = () => '—',
  timeUntil = () => null,
  toggleServer = () => {},
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServer, setSelectedServer] = useState(null);

  const filteredGroups = (groups || [])
    .map((group) => ({
      ...group,
      servers: group.servers.filter((s) => {
        const q = (searchQuery || '').toLowerCase();
        if (!q) return true;
        return (
          s.code.toLowerCase().includes(q) ||
          s.label.toLowerCase().includes(q)
        );
      }),
    }))
    .filter((group) => group.servers.length > 0);

  return (
    <motion.div
      className="serveurs-page"
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <ServeursLeftPanel globalStats={globalStats} groups={groups} />

      <div className="serveurs-main">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            Vue d’ensemble des serveurs DOStats (mock données locales).
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="group-action-btn group-action-btn--scrape"
              title="Lancer le scrape DOSTATS pour tous les serveurs activés (ordre des groupes conservé)"
              onClick={() => scrapeAllServers(groups, toggleServer)}
            >
              Scraper tous les serveurs
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un serveur…"
              style={{
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.5)',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 12,
                padding: '6px 12px',
                outline: 'none',
                minWidth: 180,
              }}
            />
          </div>
        </div>

        <div className="server-groups-container">
          {filteredGroups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: index * 0.08,
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <ServerGroup
                group={group}
                allGroups={groups}
                searchQuery={searchQuery}
                timeAgo={timeAgo}
                timeUntil={timeUntil}
                toggleServer={toggleServer}
                onStartScrape={startScrapeForServer}
                onScrapeGroup={(srv) => scrapeGroupServers(srv, toggleServer)}
                onSelectServer={setSelectedServer}
                selectedServerId={selectedServer?.id}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedServer && (
          <ServerDetailDrawer
            server={selectedServer}
            timeAgo={timeAgo}
            onClose={() => setSelectedServer(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

