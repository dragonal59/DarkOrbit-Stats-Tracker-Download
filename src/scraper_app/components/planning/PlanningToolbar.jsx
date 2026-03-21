import { motion } from 'framer-motion';
import { Plus, List, Clock, Ban, ChevronRight, Save } from 'lucide-react';
import { NextRunCountdown } from './NextRunCountdown';

export function PlanningToolbar({
  view,
  setView,
  stats,
  onNew,
  onToggleBanned,
  showBanned,
  now,
  savePlanning,
  savingPlanning,
  savePlanningError,
}) {
  return (
    <div className="planning-toolbar">
      {/* Stats globales */}
      <div className="planning-stats">
        <div className="pstat">
          <span
            className="pstat-value"
            style={{ color: 'var(--accent-cyan)' }}
          >
            {stats.activeSchedules}
          </span>
          <span className="pstat-label">plannings actifs</span>
        </div>
        <div className="pstat-divider" />
        <div className="pstat">
          <span
            className="pstat-value"
            style={{ color: 'var(--accent-violet)' }}
          >
            {stats.totalSlots}
          </span>
          <span className="pstat-label">exécutions / jour</span>
        </div>
        <div className="pstat-divider" />
        <div className="pstat">
          <span
            className="pstat-value"
            style={{ color: 'var(--accent-rose)' }}
          >
            {stats.bannedCount}
          </span>
          <span className="pstat-label">serveurs bannis</span>
        </div>
      </div>

      {/* Prochaine exécution */}
      {stats.nextRuns[0] && (
        <div className="next-run-banner">
          <ChevronRight
            size={12}
            style={{ color: 'var(--accent-emerald)' }}
          />
          <span className="next-run-label">Prochaine exécution :</span>
          <span className="next-run-target">
            {stats.nextRuns[0].schedule.targetLabel}
          </span>
          <span className="next-run-hour">
            à{' '}
            {stats.nextRuns[0].schedule.hours.find((h) => {
              const [hh, mm] = h.split(':');
              const candidate = new Date();
              candidate.setHours(+hh, +mm, 0, 0);
              return candidate > new Date(now);
            }) ?? stats.nextRuns[0].schedule.hours[0]}
          </span>
          <NextRunCountdown
            nextRun={stats.nextRuns[0].nextRun}
            now={now}
          />
        </div>
      )}

      {/* Actions */}
      <div className="toolbar-right">
        {/* Switcher Timeline / Liste */}
        <div className="view-switcher">
          <button
            className={`view-btn ${view === 'timeline' ? 'active' : ''}`}
            onClick={() => setView('timeline')}
          >
            <Clock size={13} /> Timeline
          </button>
          <button
            className={`view-btn ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
          >
            <List size={13} /> Liste
          </button>
        </div>

        {/* Bouton serveurs bannis */}
        <button
          className={`banned-toggle-btn ${showBanned ? 'active' : ''}`}
          onClick={onToggleBanned}
        >
          <Ban size={13} />
          Bannis
          {stats.bannedCount > 0 && (
            <span className="banned-badge">{stats.bannedCount}</span>
          )}
        </button>

        {/* Sauvegarder (créneaux + bannis) */}
        {typeof savePlanning === 'function' && (
          <button
            type="button"
            className="btn-secondary"
            onClick={savePlanning}
            disabled={savingPlanning}
            title="Enregistrer les créneaux et la liste des bannis dans l’application"
          >
            <Save size={14} />
            {savingPlanning ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
        )}

        {/* Nouveau planning */}
        <button className="btn-primary" onClick={onNew}>
          <Plus size={14} /> Nouveau planning
        </button>
      </div>

      {savePlanningError && (
        <div className="planning-save-error" role="alert">
          {savePlanningError}
        </div>
      )}
    </div>
  );
}

