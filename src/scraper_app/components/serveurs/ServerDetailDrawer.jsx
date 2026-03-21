import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle, XCircle } from 'lucide-react';
import { generateServerHistory } from '../../data/mockServers';

export function ServerDetailDrawer({ server, timeAgo, onClose }) {
  const history = useMemo(
    () => generateServerHistory(server.id),
    [server.id],
  );

  return (
    <motion.div
      className="server-detail-drawer glass"
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="drawer-header">
        <div>
          <span className="drawer-code">{server.code}</span>
          <span className="drawer-label">{server.label}</span>
        </div>
        <button className="drawer-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <p className="drawer-section-title">10 derniers scrapes</p>

      <div className="drawer-history">
        {history.map((entry, i) => (
          <motion.div
            key={entry.id}
            className="history-row"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
          >
            <span className="history-status-icon">
              {entry.status === 'success' ? (
                <CheckCircle size={13} color="var(--accent-emerald)" />
              ) : (
                <XCircle size={13} color="var(--accent-rose)" />
              )}
            </span>
            <span className="history-type">{entry.type}</span>
            <span className="history-entries">
              {entry.entriesScraped} entrées
            </span>
            <span className="history-duration">{entry.duration}ms</span>
            <span className="history-time">
              {timeAgo(new Date(entry.timestamp).getTime())}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

