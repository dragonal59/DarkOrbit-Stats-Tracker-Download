import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { SCRAPE_TYPES, SCRAPE_PERIODS } from '../../data/mockPlanning';
import { SERVER_GROUPS } from '../../data/mockServers';

const ALL_HOURS = Array.from(
  { length: 24 },
  (_, i) => `${String(i).padStart(2, '0')}:00`,
);

export function PlanningEditModal({ schedule, onSave, onClose }) {
  const isNew = !schedule;
  const [form, setForm] = useState({
    targetType: schedule?.targetType ?? 'group',
    targetId: schedule?.targetId ?? '',
    targetLabel: schedule?.targetLabel ?? '',
    hours: schedule?.hours ?? [],
    types: schedule?.types ?? ['HoF'],
    periods: schedule?.periods ?? ['current'],
    enabled: schedule?.enabled ?? true,
  });

  const allTargets = [
    { type: 'events', id: 'events', label: 'Événements DO' },
    ...SERVER_GROUPS.map((g) => ({
      type: 'group',
      id: g.id,
      label: g.label,
    })),
    ...SERVER_GROUPS.flatMap((g) =>
      g.servers.map((s) => ({
        type: 'server',
        id: s.id,
        label: `${s.code} — ${s.label}`,
      })),
    ),
  ];

  const toggleHour = (h) =>
    setForm((f) => ({
      ...f,
      hours: f.hours.includes(h)
        ? f.hours.filter((x) => x !== h)
        : [...f.hours, h].sort(),
    }));

  const toggleType = (t) =>
    setForm((f) => ({
      ...f,
      types: f.types.includes(t)
        ? f.types.filter((x) => x !== t)
        : [...f.types, t],
    }));

  const togglePeriod = (p) =>
    setForm((f) => ({
      ...f,
      periods: f.periods.includes(p)
        ? f.periods.filter((x) => x !== p)
        : [...f.periods, p],
    }));

  const handleTargetChange = (e) => {
    const target = allTargets.find((t) => t.id === e.target.value);
    if (target) {
      setForm((f) => ({
        ...f,
        targetId: target.id,
        targetLabel: target.label,
        targetType: target.type,
        ...(target.type === 'events' ? { types: ['Événements'], periods: ['current'] } : {}),
      }));
    }
  };

  const isEventsOnly = form.targetType === 'events';
  const canSave =
    form.targetId &&
    form.hours.length > 0 &&
    (isEventsOnly || (form.types.length > 0 && form.periods.length > 0));

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-panel glass"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            {isNew ? 'Nouveau planning' : 'Modifier le planning'}
          </h2>
          <button className="modal-close" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Cible */}
          <div className="form-field">
            <label className="form-label">Cible (groupe ou serveur)</label>
            <select
              className="form-select"
              value={form.targetId}
              onChange={handleTargetChange}
            >
              <option value="">— Sélectionner —</option>
              <optgroup label="Collecte">
                <option value="events">Événements DO</option>
              </optgroup>
              <optgroup label="Groupes">
                {allTargets
                  .filter((t) => t.type === 'group')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Serveurs individuels">
                {allTargets
                  .filter((t) => t.type === 'server')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          {/* Heures */}
          <div className="form-field">
            <label className="form-label">
              Heures d&apos;exécution
              <span className="form-hint">
                {form.hours.length} sélectionnée(s)
              </span>
            </label>
            <div className="hours-grid">
              {ALL_HOURS.map((h) => (
                <button
                  key={h}
                  className={`hour-btn ${
                    form.hours.includes(h) ? 'selected' : ''
                  }`}
                  onClick={() => toggleHour(h)}
                  type="button"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Types (masqué si cible = Événements DO) */}
          {!isEventsOnly && (
            <>
              <div className="form-field">
                <label className="form-label">Types de scrape</label>
                <div className="toggle-group">
                  {SCRAPE_TYPES.filter((t) => t !== 'Événements').map((t) => (
                    <button
                      key={t}
                      className={`toggle-chip ${form.types.includes(t) ? 'selected' : ''}`}
                      onClick={() => toggleType(t)}
                      type="button"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-field">
                <label className="form-label">Périodes DOStats</label>
                <div className="toggle-group">
                  {SCRAPE_PERIODS.map((p) => (
                    <button
                      key={p}
                      className={`toggle-chip ${form.periods.includes(p) ? 'selected' : ''}`}
                      onClick={() => togglePeriod(p)}
                      type="button"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {isEventsOnly && (
            <p className="form-hint" style={{ marginTop: 4 }}>
              Le scraping des événements DarkOrbit (page d&apos;accueil fr1) sera déclenché aux heures choisies.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} type="button">
            Annuler
          </button>
          <button
            className="btn-primary"
            onClick={() => canSave && onSave(form)}
            disabled={!canSave}
            type="button"
          >
            {isNew ? '+ Créer' : 'Enregistrer'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

