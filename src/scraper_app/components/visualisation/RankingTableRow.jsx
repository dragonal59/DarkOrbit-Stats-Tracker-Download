import { useState } from 'react';
import { motion } from 'framer-motion';
import { CompanyBadge } from './CompanyBadge';
import { DataQualityBadge } from './DataQualityBadge';
import { getGradeImagePath } from '../../data/grade-image-mapping';

function GradeImage({ grade }) {
  const [imgError, setImgError] = useState(false);
  const src = getGradeImagePath(grade);
  const valid = src && !imgError;
  const label = grade != null ? String(grade) : '';

  if (grade == null) {
    return <span className="ranking-grade-empty">—</span>;
  }
  if (valid) {
    return (
      <img
        src={src}
        alt={label}
        className="ranking-grade-img"
        width={26}
        height={26}
        onError={() => setImgError(true)}
        title={label}
      />
    );
  }
  return (
    <span className="ranking-grade-fallback" title={label}>
      {label || '?'}
    </span>
  );
}

export function RankingTableRow({
  entry,
  index,
  isHovered,
  onHover,
  onLeave,
  onClick,
}) {
  const issues = [];
  if (!entry.name) issues.push('name null');
  if (!entry.user_id) issues.push('user_id null');
  if (entry.points == null) issues.push('points null');

  const isTop3 = entry.rank <= 3;

  return (
    <motion.div
      className={`ranking-row ${isTop3 ? 'top3' : ''} ${
        issues.length > 0 ? 'has-issues' : ''
      }`}
      style={{ '--row-index': index }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: Math.min(index * 0.008, 0.5),
        duration: 0.25,
      }}
      onHoverStart={onHover}
      onHoverEnd={onLeave}
      onClick={onClick}
    >
      <span
        className={`col-rank rank-num ${isTop3 ? `rank-${entry.rank}` : ''}`}
      >
        {entry.rank}
      </span>

      <div className="col-name player-name-cell">
        <span className="player-name">
          {entry.name ?? <span className="null-value">null</span>}
        </span>
        <span className="player-uid">
          {entry.user_id ?? <span className="null-value">—</span>}
        </span>
      </div>

      <span className="col-grade ranking-grade-cell">
        <GradeImage grade={entry.grade} />
      </span>

      <span className="col-company">
        <CompanyBadge company={entry.company} size="sm" />
      </span>

      <span className="col-server server-label">
        {entry.server_label ??
          entry.server_code ?? <span className="null-value">null</span>}
      </span>

      <span className="col-points points-value">
        {entry.points != null ? (
          entry.points.toLocaleString('fr-FR')
        ) : (
          <span className="null-value">null</span>
        )}
      </span>

      <span className="col-quality">
        <DataQualityBadge issues={issues} />
      </span>
    </motion.div>
  );
}

