import { motion } from 'framer-motion';
import { Edit2, Trash2, Power, Ban, Clock } from 'lucide-react';
import { getNextRun } from '../../data/mockPlanning';
import { NextRunCountdown } from './NextRunCountdown';

export function PlanningGroupCard({
  schedule,
  onEdit,
  onDelete,
  onToggle,
  onBanServer,
  isServerBanned,
  now,
}) {
  const nextRun = getNextRun(schedule);

  return (
    <motion.div
      className={`planning-card glass ${schedule.enabled ? '' : 'disabled'}`}
      whileHover={{
        y: -3,
        boxShadow: schedule.enabled
          ? '0 8px 32px rgba(99,179,237,0.15)'
          : '0 4px 16px rgba(0,0,0,0.3)',
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="pcard-header">
        <div className="pcard-header-left">
          {/* Badge groupe, serveur ou événements */}
          <span className={`pcard-type-badge ${schedule.targetType}`}>
            {schedule.targetType === 'events'
              ? 'Événements'
              : schedule.targetType === 'group'
                ? 'Groupe'
                : 'Serveur'}
          </span>
          <span className="pcard-target">{schedule.targetLabel}</span>
          {schedule.overridesGroup && (
            <span className="pcard-override-badge">Prioritaire</span>
          )}
        </div>
        <div className="pcard-actions">
          {/* Toggle actif/inactif */}
          <button
            className={`pcard-btn ${schedule.enabled ? 'active' : ''}`}
            onClick={onToggle}
            title={schedule.enabled ? 'Désactiver' : 'Activer'}
            type="button"
          >
            <Power size={13} />
          </button>
          <button
            className="pcard-btn"
            onClick={onEdit}
            title="Modifier"
            type="button"
          >
            <Edit2 size={13} />
          </button>
          <button
            className="pcard-btn pcard-btn--danger"
            onClick={onDelete}
            title="Supprimer"
            type="button"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="pcard-divider" />

      {/* Heures planifiées */}
      <div className="pcard-hours-section">
        <span className="pcard-section-label">
          <Clock size={11} /> Heures planifiées
        </span>
        <div className="pcard-hours">
          {schedule.hours.map((h) => (
            <span key={h} className="hour-pill">
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* Types et périodes */}
      <div className="pcard-meta">
        <div className="pcard-meta-group">
          <span className="pcard-section-label">Types</span>
          <div className="pcard-pills">
            {schedule.types.map((t) => (
              <span key={t} className="type-tag">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="pcard-meta-group">
          <span className="pcard-section-label">Périodes</span>
          <div className="pcard-pills">
            {schedule.periods.map((p) => (
              <span key={p} className="period-tag">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="pcard-divider" />

      {/* Footer : prochaine exécution + ban rapide */}
      <div className="pcard-footer">
        {schedule.enabled && nextRun ? (
          <div className="pcard-next-run">
            <span className="pcard-section-label">Prochaine exécution</span>
            <NextRunCountdown nextRun={nextRun} now={now} />
          </div>
        ) : (
          <span className="pcard-disabled-label">Planning désactivé</span>
        )}

        {/* Bouton ban rapide (seulement si c'est un serveur individuel) */}
        {schedule.targetType === 'server' && (
          <button
            className={`ban-quick-btn ${
              isServerBanned(schedule.targetId) ? 'banned' : ''
            }`}
            onClick={() =>
              onBanServer({
                id: schedule.targetId,
                code: schedule.targetLabel,
                label: schedule.targetLabel,
              })
            }
            type="button"
          >
            <Ban size={11} />
            {isServerBanned(schedule.targetId) ? 'Banni' : 'Bannir'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

