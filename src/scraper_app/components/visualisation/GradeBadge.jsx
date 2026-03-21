import { useState } from 'react';

export function GradeBadge({ grade, imageUrl }) {
  const [imgError, setImgError] = useState(false);
  const gradeStr = grade != null ? String(grade) : '';

  return (
    <div className="grade-badge" title={gradeStr}>
      {!imgError && imageUrl ? (
        <img
          src={imageUrl}
          alt={gradeStr}
          className="grade-img"
          onError={() => setImgError(true)}
          width={40}
          height={40}
        />
      ) : (
        <div className="grade-fallback">
          {(gradeStr &&
            gradeStr
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()) ||
            '?'}
        </div>
      )}
      <span className="grade-label">
        {gradeStr || <span className="null-value">null</span>}
      </span>
    </div>
  );
}

