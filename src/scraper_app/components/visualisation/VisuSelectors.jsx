import { motion } from 'framer-motion';
import { Database, Clock, RefreshCw, Ban } from 'lucide-react';
import { RANKING_TYPE_COLORS } from '../../data/mockVisuData';

export function VisuSelectors({
  servers,
  types,
  periods,
  selectedServer,
  selectedType,
  selectedPeriod,
  onServerChange,
  onTypeChange,
  onPeriodChange,
  onClearAllData,
  meta,
}) {
  return (
    <div className="visu-selectors">
      <div className="visu-selector-group">
        <label className="visu-selector-label">
          <Database size={11} /> Serveur
        </label>
        <select
          className="visu-select"
          value={selectedServer}
          onChange={(e) => onServerChange(e.target.value)}
        >
          {servers.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="visu-selector-group">
        <label className="visu-selector-label">Type</label>
        <div className="visu-type-pills">
          {types.map((t) => {
            const color = RANKING_TYPE_COLORS[t.value] || 'var(--accent-cyan)';
            return (
              <button
                key={t.value}
                type="button"
                className={`visu-type-pill ${
                  selectedType === t.value ? 'active' : ''
                }`}
                style={
                  selectedType === t.value
                    ? { borderColor: color, color, background: `${color}22` }
                    : { borderLeftColor: color }
                }
                onClick={() => onTypeChange(t.value)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="visu-selector-group">
        <label className="visu-selector-label">
          <Clock size={11} /> Période
        </label>
        <div className="visu-period-pills">
          {periods.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`visu-period-pill ${
                selectedPeriod === p.value ? 'active' : ''
              }`}
              onClick={() => onPeriodChange(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {meta && meta.scraped_at && (
        <motion.div
          className="visu-meta"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          key={`${meta.server_code}_${meta.type}_${meta.period}`}
        >
          <RefreshCw size={10} />
          <span>
            Extrait le{' '}
            {new Date(meta.scraped_at).toLocaleString('fr-FR')}
          </span>
          <span className="visu-meta-sep">·</span>
          <span>{meta.total_entries} entrées</span>
          {meta.source_url && (
            <>
              <span className="visu-meta-sep">·</span>
              <a
                className="visu-meta-url"
                href={meta.source_url}
                target="_blank"
                rel="noreferrer"
              >
                {meta.source_url}
              </a>
            </>
          )}
        </motion.div>
      )}

      {typeof onClearAllData === 'function' && (
        <button
          type="button"
          className="visu-clear-all-btn"
          onClick={onClearAllData}
          title="Supprimer toutes les données (classements + profils joueurs) et actualiser"
        >
          <Ban size={16} />
        </button>
      )}
    </div>
  );
}

