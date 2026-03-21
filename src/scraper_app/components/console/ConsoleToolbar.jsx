import React, { useState } from 'react';
import { Search, Download, Copy, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LOG_TYPES } from '../../data/mockConsoleLogs';

export function ConsoleToolbar({
  showTechnical,
  setShowTechnical,
  activeFilters,
  toggleFilter,
  searchQuery,
  setSearchQuery,
  autoScroll,
  setAutoScroll,
  visibleLogs,
  allLogs,
  exportLogs,
  copyAllLogs,
  clearAll,
}) {
  const [copyToast, setCopyToast] = useState(false);

  const handleCopyAll = () => {
    copyAllLogs();
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const counts = Object.keys(LOG_TYPES).reduce((acc, type) => {
    acc[type] = visibleLogs.filter((l) => l.type === type).length;
    return acc;
  }, {});

  const technicalCount = allLogs.filter(
    (l) => LOG_TYPES[l.type]?.technical,
  ).length;

  return (
    <div className="console-toolbar">
      <div className="toolbar-row toolbar-row--top">
        <div className="console-search">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            placeholder="Filtrer les logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="console-search-input"
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        <span className="log-count">
          {visibleLogs.length.toLocaleString()} /{' '}
          {allLogs.length.toLocaleString()} logs
        </span>

        <button
          className={`toggle-technical ${showTechnical ? 'active' : ''}`}
          onClick={() => setShowTechnical((v) => !v)}
        >
          {showTechnical ? (
            <ToggleRight size={16} color="var(--accent-violet)" />
          ) : (
            <ToggleLeft size={16} />
          )}
          <span>Logs techniques</span>
          <span
            className="technical-badge"
            style={{
              background: showTechnical
                ? 'var(--accent-violet)'
                : 'rgba(255,255,255,0.1)',
              color: showTechnical ? '#fff' : 'var(--text-muted)',
            }}
          >
            {technicalCount}
          </span>
        </button>

        <button
          className={`toolbar-btn ${autoScroll ? 'active' : ''}`}
          onClick={() => setAutoScroll((v) => !v)}
        >
          Auto-scroll
        </button>

        <div className="toolbar-actions">
          {typeof clearAll === 'function' && (
            <button
              type="button"
              className="toolbar-icon-btn toolbar-icon-btn--clear"
              onClick={clearAll}
              title="Vider la console (équivalent /clear)"
            >
              <Trash2 size={14} />
              <span className="toolbar-btn-label">Clear</span>
            </button>
          )}
          <div className="copy-btn-wrapper">
            <button
              className="toolbar-icon-btn"
              onClick={handleCopyAll}
              title="Copier tous les logs visibles"
            >
              <Copy size={14} />
            </button>
            <AnimatePresence>
              {copyToast && (
                <motion.span
                  className="copy-toast"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  Copié !
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <button
            className="toolbar-icon-btn"
            onClick={exportLogs}
            title="Exporter en CSV"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="toolbar-row toolbar-row--filters">
        {Object.entries(LOG_TYPES)
          .filter(([type]) => !['command', 'result'].includes(type))
          .map(([type, def]) => (
            <button
              key={type}
              className={`filter-pill ${
                activeFilters[type] ? 'active' : ''
              } ${def.technical ? 'technical' : ''}`}
              style={{ '--pill-color': def.color }}
              onClick={() => toggleFilter(type)}
            >
              <span className="pill-dot" />
              <span className="pill-label">{def.label}</span>
              <span className="pill-count">{counts[type] ?? 0}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

