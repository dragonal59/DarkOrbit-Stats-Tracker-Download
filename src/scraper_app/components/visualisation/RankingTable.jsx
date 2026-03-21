import { useState } from 'react';
import { AlertTriangle, FolderOpen } from 'lucide-react';
import { RankingTableRow } from './RankingTableRow';
import { RANKING_TYPES, PERIOD_TITLE_LABELS, RANKING_TYPE_COLORS } from '../../data/mockVisuData';

function getRankingTitle(meta) {
  const typeLabel = RANKING_TYPES.find((t) => t.value === meta.type)?.label ?? meta.type;
  const periodLabel = PERIOD_TITLE_LABELS[meta.period] ?? meta.period;
  const serverId = (meta.server_code || meta.server_label || '').toString().toUpperCase();
  return `${serverId} Classement ${typeLabel} ${periodLabel}`;
}

export function RankingTable({ ranking, onSelectPlayer }) {
  const [hoveredRow, setHoveredRow] = useState(null);

  const nullNames = ranking.entries.filter((e) => !e.name).length;
  const nullUserIds = ranking.entries.filter((e) => !e.user_id).length;
  const hasGaps = ranking.entries.some(
    (e, i) => i > 0 && e.rank !== ranking.entries[i - 1].rank + 1,
  );

  const title = getRankingTitle(ranking.meta);
  const typeColor = RANKING_TYPE_COLORS[ranking.meta.type] || 'var(--accent-cyan)';

  return (
    <div className="ranking-table-wrapper glass">
      <div className="ranking-table-header">
        <div className="ranking-header-left">
          <span
            className="ranking-title"
            style={{ color: typeColor }}
          >
            {title}
          </span>
          <span className="ranking-count">
            {ranking.entries.length} entrées
          </span>
        </div>

        <div className="ranking-quality-alerts">
          {nullNames > 0 && (
            <span className="quality-alert quality-alert--warn">
              <AlertTriangle size={10} /> {nullNames} noms null
            </span>
          )}
          {nullUserIds > 0 && (
            <span className="quality-alert quality-alert--warn">
              <AlertTriangle size={10} /> {nullUserIds} user_id null
            </span>
          )}
          {hasGaps && (
            <span className="quality-alert quality-alert--error">
              <AlertTriangle size={10} /> Rangs non consécutifs
            </span>
          )}
        </div>
      </div>

      <div className="ranking-cols-header">
        <span className="col-rank">#</span>
        <span className="col-name">Joueur</span>
        <span className="col-grade">Grade</span>
        <span className="col-company">Firme</span>
        <span className="col-server">Serveur</span>
        <span className="col-points">Points</span>
        <span className="col-quality">QA</span>
      </div>

      <div className="ranking-rows">
        {ranking.entries.length === 0 ? (
          <div className="ranking-empty">
            <span>Aucune donnée. Lancez un scrape ou chargez un classement.</span>
            {typeof window.scraperBridge?.openOutputDir === 'function' && (
              <button
                type="button"
                className="ranking-empty-open-dir"
                onClick={() => window.scraperBridge.openOutputDir().catch(() => {})}
              >
                <FolderOpen size={14} />
                Ouvrir le dossier des classements
              </button>
            )}
          </div>
        ) : (
          ranking.entries.map((entry, i) => (
            <RankingTableRow
              key={`${entry.rank}_${entry.user_id ?? i}`}
              entry={entry}
              index={i}
              isHovered={hoveredRow === i}
              onHover={() => setHoveredRow(i)}
              onLeave={() => setHoveredRow(null)}
              onClick={() => entry.user_id && onSelectPlayer(entry.user_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

