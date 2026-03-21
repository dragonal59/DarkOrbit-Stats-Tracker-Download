import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GlassTooltip } from './tooltip/GlassTooltip';

const data = [];

export function VolumeAreaChart() {
  return (
    <div style={{ height: 260, width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 4,
            }}
          >
            Scraping volume
          </div>
          <div
            style={{
              fontFamily: 'Syne, system-ui',
              fontSize: 18,
              color: 'var(--text-muted)',
            }}
          >
            En attente de données
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#63b3ed" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#63b3ed" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="rgba(148,163,184,0.25)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <Tooltip content={<GlassTooltip />} />
          <Area
            type="monotone"
            dataKey="volume"
            stroke="#63b3ed"
            strokeWidth={2}
            fill="url(#volumeGradient)"
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

