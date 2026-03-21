import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { ServerCard } from './ServerCard';

const COLLAPSED_STORAGE_KEY = 'scraperServerGroupsCollapsed';

function loadCollapsedMap() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCollapsedValue(groupId, collapsed) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const map = loadCollapsedMap();
    map[groupId] = !!collapsed;
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export function ServerGroup({
  group,
  searchQuery,
  timeAgo,
  timeUntil,
  toggleServer,
  onStartScrape,
  onSelectServer,
  selectedServerId,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    const map = loadCollapsedMap();
    return !!map[group.id];
  });

  const runningCount = group.servers.filter((s) => s.status === 'running').length;

  const matchesSearch = (server) => {
    const q = (searchQuery || '').toLowerCase();
    if (!q) return true;
    return (
      server.code.toLowerCase().includes(q) ||
      server.label.toLowerCase().includes(q)
    );
  };

  return (
    <div className="server-group">
      <button
        className="server-group-header"
        onClick={() =>
          setCollapsed((c) => {
            const next = !c;
            saveCollapsedValue(group.id, next);
            return next;
          })
        }
        style={{ '--group-accent': group.accent }}
      >
        <div className="group-header-left">
          <motion.span
            className="group-chevron"
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <ChevronDown size={16} />
          </motion.span>
          <span
            className="group-header-title"
            style={{ color: group.accent }}
          >
            {group.label}
          </span>
          <span className="group-header-badge">
            {runningCount} actif{runningCount > 1 ? 's' : ''}
          </span>
        </div>
        <div
          className="group-header-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="group-action-btn"
            onClick={() => {
              group.servers.forEach((s) => toggleServer(s.id, 'start'));
              if (typeof window.electronScraper?.pause === 'function') {
                window.electronScraper.pause(false);
              }
            }}
          >
            Tout activer
          </button>
          <button
            className="group-action-btn group-action-btn--muted"
            onClick={() => {
              group.servers.forEach((s) => toggleServer(s.id, 'pause'));
              if (typeof window.electronScraper?.pause === 'function') {
                window.electronScraper.pause(true);
              }
            }}
          >
            Tout désactiver
          </button>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            className="server-cards-grid"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="server-cards-inner">
              {group.servers.map((server, index) => {
                const match = matchesSearch(server);
                return (
                  <motion.div
                    key={server.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{
                      opacity: match ? 1 : 0.15,
                      y: 0,
                      scale: match ? 1 : 0.97,
                    }}
                    transition={{
                      delay: index * 0.05,
                      duration: 0.3,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <ServerCard
                      server={server}
                      groupAccent={group.accent}
                      timeAgo={timeAgo}
                      timeUntil={timeUntil}
                      toggleServer={toggleServer}
                      onStartScrape={onStartScrape}
                      isSelected={selectedServerId === server.id}
                      onClick={() => onSelectServer(server)}
                    />
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

