import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GlassTooltip } from './tooltip/GlassTooltip';

export function SuccessErrorBarChart({ groups = [] }) {
  const data = useMemo(() => {
    return groups
      .flatMap((g) => g.servers)
      .filter((s) => s.totalCount > 0)
      .sort((a, b) => b.totalCount - a.totalCount)
      .slice(0, 8)
      .map((s) => ({
        name: s.code || s.label,
        success: s.successCount,
        errors: s.errorCount,
      }));
  }, [groups]);

  const hasData = data.length > 0;

  return (
    <div style={{ height: 260, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Success vs errors
          </div>
          <div style={{ fontFamily: 'Syne, system-ui', fontSize: 18, color: hasData ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {hasData ? `Top ${data.length} serveurs` : 'En attente de données'}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(148,163,184,0.25)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} />
          <Tooltip content={<GlassTooltip />} />
          <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
          <Bar dataKey="success" fill="#48bb78" radius={[4, 4, 0, 0]} animationDuration={900} />
          <Bar dataKey="errors" fill="#fc8181" radius={[4, 4, 0, 0]} animationDuration={900} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
