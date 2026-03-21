import { COMPANY_COLORS } from '../../data/mockVisuData';

export function CompanyBadge({ company, size = 'sm' }) {
  const raw = company == null ? '' : String(company).trim().toUpperCase();
  const color = COMPANY_COLORS[raw] ?? 'var(--text-muted)';
  const neonClass = raw === 'MMO' ? 'mmo-neon' : (raw === 'EIC' ? 'eic-neon' : (raw === 'VRU' ? 'vru-neon' : ''));

  const sizeMap = { sm: 9, md: 10, lg: 11 };
  const fontSize = sizeMap[size] ?? 11;
  return (
    <span
      className={`company-text-badge ${neonClass}`}
      style={{
        color,
        fontSize,
        fontWeight: 700,
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}
    >
      {raw || '—'}
    </span>
  );
}

