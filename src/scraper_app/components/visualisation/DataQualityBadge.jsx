import { CheckCircle, AlertTriangle } from 'lucide-react';

export function DataQualityBadge({ issues }) {
  if (!issues || issues.length === 0) {
    return (
      <span className="qa-badge qa-badge--ok" title="Données propres">
        <CheckCircle size={10} /> OK
      </span>
    );
  }

  return (
    <span className="qa-badge qa-badge--warn" title={issues.join(', ')}>
      <AlertTriangle size={10} /> {issues.length}
    </span>
  );
}

