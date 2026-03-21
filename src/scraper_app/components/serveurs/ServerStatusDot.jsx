import React from 'react';
import { motion } from 'framer-motion';

const DOT_COLORS = {
  running: '#48bb78',
  idle: '#ed8936',
  error: '#fc8181',
  disabled: 'rgba(255,255,255,0.2)',
};

export function ServerStatusDot({ status }) {
  const color = DOT_COLORS[status] || DOT_COLORS.idle;
  const isAnimated = status === 'running' || status === 'error';

  return (
    <div className="status-dot-wrapper">
      {isAnimated && (
        <motion.span
          className="status-dot-ring"
          style={{ borderColor: color }}
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <motion.span
        className="status-dot-core"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        animate={
          status === 'running'
            ? { scale: [1, 1.15, 1], opacity: [1, 0.8, 1] }
            : {}
        }
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

