export function NextRunCountdown({ nextRun, now }) {
  if (!nextRun) return <span className="countdown-na">—</span>;

  const diff = nextRun - now;
  if (diff <= 0) {
    return (
      <span
        className="countdown-now"
        style={{ color: 'var(--accent-emerald)' }}
      >
        Maintenant
      </span>
    );
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const isUrgent = diff < 5 * 60 * 1000; // < 5min
  const isSoon = diff < 30 * 60 * 1000; // < 30min

  const color = isUrgent
    ? 'var(--accent-rose)'
    : isSoon
      ? 'var(--accent-amber)'
      : 'var(--accent-emerald)';

  const formatted =
    hours > 0
      ? `${hours}h ${String(minutes).padStart(2, '0')}min`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
          2,
          '0',
        )}`;

  return (
    <span
      className={`countdown ${isUrgent ? 'countdown--urgent' : ''}`}
      style={{
        color,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      {formatted}
    </span>
  );
}

