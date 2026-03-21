import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check } from 'lucide-react';
import { LOG_TYPES } from '../../data/mockConsoleLogs';

function formatTime(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function ConsoleLogRow({ log, isNew, onCopy }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const def = LOG_TYPES[log.type] ?? LOG_TYPES.info;

  const handleCopy = useCallback(
    (e) => {
      e.stopPropagation();
      onCopy(log);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [log, onCopy],
  );

  const isCommand = log.type === 'command';
  const isResult = log.type === 'result';
  const isTechnical = def.technical;

  return (
    <motion.div
      className={`log-row ${log.type} ${
        isTechnical ? 'log-row--technical' : ''
      } ${isCommand ? 'log-row--command' : ''}`}
      initial={
        isNew
          ? {
              opacity: 0,
              x: -8,
              backgroundColor: `${def.color}18`,
            }
          : false
      }
      animate={{ opacity: 1, x: 0, backgroundColor: 'transparent' }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      <span className="log-time">{formatTime(log.timestamp)}</span>
      <span className="log-type-badge" style={{ color: def.color }}>
        {def.label}
      </span>
      {log.server && <span className="log-server">[{log.server}]</span>}
      <span
        className={`log-message ${
          isCommand ? 'log-message--command' : ''
        } ${isResult ? 'log-message--result' : ''}`}
      >
        {log.message}
      </span>
      {log.duration && (
        <span className="log-duration">{log.duration}ms</span>
      )}

      <AnimatePresence>
        {hovered && (
          <motion.button
            className="log-copy-btn"
            onClick={handleCopy}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.12 }}
          >
            {copied ? (
              <Check size={11} color="var(--accent-emerald)" />
            ) : (
              <Copy size={11} />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

