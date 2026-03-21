import React from 'react';
import { motion } from 'framer-motion';
import { useAnimatedCounter } from '../hooks/useAnimatedCounter';

const accentMap = {
  cyan: 'var(--accent-cyan)',
  emerald: 'var(--accent-emerald)',
  violet: 'var(--accent-violet)',
  rose: 'var(--accent-rose)',
};

export function KPICard({ data, index }) {
  const value = useAnimatedCounter(data.value);
  const accent = accentMap[data.color] || 'var(--accent-cyan)';
  const isPositive = (data.trend ?? 0) >= 0;

  return (
    <motion.div
      className="glass glass--interactive kpi-card"
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{
        delay: 0.1 * index,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        padding: 14,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -20,
          opacity: 0.06,
          background: `radial-gradient(circle at 80% 0%, ${accent}, transparent 55%)`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          {data.label}
        </span>
        <span
          style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 999,
            backgroundColor: isPositive ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.12)',
            color: isPositive ? '#4ade80' : '#fca5a5',
          }}
        >
          {isPositive ? '+' : ''}
          {data.trend ?? 0}
          {typeof data.trend === 'number' ? '%' : ''}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          fontFamily: 'Syne, system-ui',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 24 }}>
          {data.unit === '%' ? value.toFixed(1) : value.toLocaleString()}
        </span>
        {data.unit && (
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            {data.unit}
          </span>
        )}
        {data.total && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            / {data.total}
          </span>
        )}
      </div>

      <div
        style={{
          height: 28,
          position: 'relative',
          zIndex: 1,
          marginTop: 4,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 999,
            background:
              'linear-gradient(to right, rgba(148,163,184,0.15), rgba(148,163,184,0))',
          }}
        />
        <svg width="100%" height="28" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`kpiGrad-${data.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={accent} stopOpacity="0.0" />
              <stop offset="35%" stopColor={accent} stopOpacity="0.35" />
              <stop offset="100%" stopColor={accent} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d="M0,22 C30,18 50,10 80,14 C110,18 130,8 160,12 C190,16 210,6 240,10"
            fill="none"
            stroke={accent}
            strokeWidth="1.5"
          />
          <path
            d="M0,22 C30,18 50,10 80,14 C110,18 130,8 160,12 C190,16 210,6 240,10 L240,28 L0,28 Z"
            fill={`url(#kpiGrad-${data.id})`}
          />
        </svg>
      </div>
    </motion.div>
  );
}

