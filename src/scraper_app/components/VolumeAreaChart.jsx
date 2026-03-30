import React, { useMemo } from 'react';
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

export function VolumeAreaChart({ logs = [] }) {
  const data = useMemo(() => {
    const now = Date.now();
    const WINDOW_MS = 30 * 60 * 1000;
    const BUCKET_MS = 60 * 1000;
    const buckets = {};
    for (let i = 29; i >= 0; i--) {
      const ts = now - i * BUCKET_MS;
      const label = new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      buckets[label] = { name: label, volume: 0 };
    }
    for (const log of logs) {
      if (log.metric_type === 'rankings_batch_stats') continue;
      const ts = log.timestamp ? new Date(log.timestamp).getTime() : null;
      if (!ts || now - ts > WINDOW_MS) continue;
      const label = new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      if (buckets[label]) buckets[label].volume++;
    }
    const all = Object.values(buckets);
    return all.filter((_, i) => i % 5 === 0 || i === all.length - 1);
  }, [logs]);

  const totalVolume = useMemo(() => data.reduce((s, d) => s + d.volume, 0), [data]);

  return (
    <div style={{ height: 260, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Scraping volume
          </div>
          <div style={{ fontFamily: 'Syne, system-ui', fontSize: 18, color: totalVolume > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {totalVolume > 0 ? `${totalVolume} logs (30 min)` : 'En attente de données'}
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
          <CartesianGrid stroke="rgba(148,163,184,0.25)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} />
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
