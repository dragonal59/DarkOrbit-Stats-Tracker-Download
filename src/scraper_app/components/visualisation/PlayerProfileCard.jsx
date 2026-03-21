import { useState } from 'react';
import { getGradeImagePath } from '../../data/grade-image-mapping';

const STAT_PERIODS = [
  'current',
  'last_24h',
  'last_7d',
  'last_30d',
  'last_100d',
  'last_365d',
];

const STAT_PERIOD_LABELS = {
  current: 'All time',
  last_24h: '24h',
  last_7d: '7j',
  last_30d: '30j',
  last_100d: '100j',
  last_365d: '365j',
};

const STAT_FIELDS = [
  { key: 'top_user', label: 'Top User' },
  { key: 'honor', label: 'Honor' },
  { key: 'experience', label: 'Experience' },
  { key: 'alien_kills', label: 'NPC Kills' },
  { key: 'ship_kills', label: 'Ship Kills' },
  { key: 'hours', label: 'Hours' },
];

const GATE_LABELS = {
  alpha: 'Alpha',
  beta: 'Beta',
  gamma: 'Gamma',
  delta: 'Delta',
  epsilon: 'Epsilon',
  zeta: 'Zeta',
  kappa: 'Kappa',
  lambda: 'Lambda',
  kronos: 'Kronos',
  hades: 'Hades',
  other: 'Other',
};

function NullCell() {
  return <span className="null-value">null</span>;
}

function formatValue(val) {
  if (val == null) return <NullCell />;
  if (typeof val === 'number') return val.toLocaleString('fr-FR');
  return val;
}

/** Valeur HoF : stats.<period> puis repli sur champs plats (JSON / player_profiles). */
function hallOfFameCellValue(player, period, fieldKey) {
  const fromStats = player?.stats?.[period]?.[fieldKey];
  if (fromStats != null) return fromStats;
  if (period !== 'current') return null;
  const p = player || {};
  if (fieldKey === 'alien_kills' && p.npc_kills != null) return p.npc_kills;
  if (['top_user', 'honor', 'experience', 'ship_kills'].includes(fieldKey) && p[fieldKey] != null) {
    return p[fieldKey];
  }
  return null;
}

export function PlayerProfileCard({ player, accent }) {
  const [gradeImgError, setGradeImgError] = useState(false);
  const gradeImgSrc = getGradeImagePath(player.grade);
  const gradeImgValid = gradeImgSrc && !gradeImgError;
  const gradeLabel = player.grade != null ? String(player.grade) : '';

  return (
    <div className="profile-card glass" style={{ '--accent': accent }}>
      {/* 1. HEADER */}
      <div className="profile-header">
        <div className="profile-identity">
          {gradeImgValid ? (
            <img
              src={gradeImgSrc}
              alt={gradeLabel}
              className="profile-grade-img"
              width={26}
              height={26}
              onError={() => setGradeImgError(true)}
            />
          ) : (
            <div className="profile-grade-fallback" title={gradeLabel}>
              {gradeLabel || '?'}
            </div>
          )}
          <div className="profile-name-block">
            <span className="profile-name">{player.name}</span>
            <span className="profile-uid">{player.user_id}</span>
            {player.clan_tag && player.clan && (
              <span className="profile-clan">
                {player.clan_tag} {player.clan}
              </span>
            )}
          </div>
        </div>
        <div className="profile-header-right">
          <div className="hr-item">
            <span className="hr-label">Inscrit</span>
            <span className="hr-value">
              {player.registered != null ? player.registered : <NullCell />}
            </span>
          </div>
          <div className="hr-item">
            <span className="hr-label">Heures</span>
            <span className="hr-value">
              {player.total_hours != null
                ? player.total_hours.toLocaleString('fr-FR')
                : <NullCell />}
            </span>
          </div>
          <div className="hr-item">
            <span className="hr-label">Last seen</span>
            <span className="hr-value">
              {player.last_seen != null ? player.last_seen : <NullCell />}
            </span>
          </div>
        </div>
      </div>

      {/* 2. QUICK STATS BAR */}
      <div className="profile-quick-stats">
        <div className="quick-stat">
          <span className="qs-label">Serveur</span>
          <span className="qs-value">{player.server_label ?? <NullCell />}</span>
        </div>
        <div className="quick-stat">
          <span className="qs-label">Niveau</span>
          <span className="qs-value">{player.level ?? <NullCell />}</span>
        </div>
        <div className="quick-stat">
          <span className="qs-label">Points de grade</span>
          <span className="qs-value">{formatValue(player.estimated_rp)}</span>
        </div>
        <div className="quick-stat">
          <span className="qs-label">Grade</span>
          <span className="qs-value qs-value--grade">
            {gradeImgValid ? (
              <img
                src={gradeImgSrc}
                alt={gradeLabel}
                className="profile-grade-img profile-grade-img--small"
                width={26}
                height={26}
                onError={() => setGradeImgError(true)}
              />
            ) : (
              gradeLabel || <NullCell />
            )}
          </span>
        </div>
        <div className="quick-stat">
          <span className="qs-label">Compagnie</span>
          <span
            className={`qs-value ${player.company === 'MMO' ? 'mmo-neon' : (player.company === 'EIC' ? 'eic-neon' : (player.company === 'VRU' ? 'vru-neon' : ''))}`}
          >
            {player.company ?? <NullCell />}
          </span>
        </div>
      </div>

      {/* 3. HALL OF FAME TABLE */}
      <div className="stats-table-wrapper">
        <p className="stats-table-title">Hall of Fame — toutes périodes</p>
        <table className="stats-table">
          <thead>
            <tr>
              <th />
              {STAT_PERIODS.map((p) => (
                <th key={p}>{STAT_PERIOD_LABELS[p]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAT_FIELDS.map((field) => (
              <tr key={field.key}>
                <td>{field.label}</td>
                {STAT_PERIODS.map((period) => {
                  const val = hallOfFameCellValue(player, period, field.key);
                  return (
                    <td key={period}>
                      {val != null ? (
                        typeof val === 'number' ? (
                          val.toLocaleString('fr-FR')
                        ) : (
                          val
                        )
                      ) : (
                        <span className="null-cell">null</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 4. GALAXY GATES TABLE */}
      {player.galaxy_gates && typeof player.galaxy_gates === 'object' && (
        <div className="galaxy-gates">
          <p className="stats-table-title">Galaxy Gates</p>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Porte</th>
                <th>Valeur</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(GATE_LABELS).map(([key, label]) => {
                const value = player.galaxy_gates[key];
                return (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>
                      {value != null ? (
                        typeof value === 'number' ? (
                          value.toLocaleString('fr-FR')
                        ) : (
                          value
                        )
                      ) : (
                        <span className="null-cell">null</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
