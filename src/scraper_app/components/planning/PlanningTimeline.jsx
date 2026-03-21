import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { getDaySlots } from '../../data/mockPlanning';

const COLORS_BY_INDEX = [
  'var(--accent-cyan)',
  'var(--accent-violet)',
  'var(--accent-emerald)',
  'var(--accent-amber)',
  'var(--accent-rose)',
];

export function PlanningTimeline({ schedules, now }) {
  const slots = useMemo(() => getDaySlots(schedules), [schedules]);

  // Position de l'heure actuelle sur la règle (0-100%)
  const nowDate = new Date(now);
  const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  const nowPct = (nowMinutes / (24 * 60)) * 100;

  // Associer une couleur à chaque schedule
  const scheduleColors = {};
  schedules.forEach((s, i) => {
    scheduleColors[s.id] = COLORS_BY_INDEX[i % COLORS_BY_INDEX.length];
  });

  return (
    <div className="planning-timeline">
      <p className="timeline-title">Planning du jour — 24h</p>

      {/* Règle temporelle */}
      <div className="timeline-ruler-wrapper">
        {/* Labels des heures */}
        <div className="timeline-labels">
          {Array.from({ length: 25 }, (_, i) => (
            <span
              key={i}
              className="timeline-label"
              style={{ left: `${(i / 24) * 100}%` }}
            >
              {String(i).padStart(2, '0')}h
            </span>
          ))}
        </div>

        {/* Piste principale */}
        <div className="timeline-track">
          {/* Graduations */}
          {Array.from({ length: 25 }, (_, i) => (
            <div
              key={i}
              className={`timeline-tick ${i % 6 === 0 ? 'major' : 'minor'}`}
              style={{ left: `${(i / 24) * 100}%` }}
            />
          ))}

          {/* Ligne de fond */}
          <div className="timeline-baseline" />

          {/* Créneaux de scraping */}
          {slots.map((slot, i) => {
            const [h, m] = slot.hour.split(':').map(Number);
            const slotMin = h * 60 + m;
            const pct = (slotMin / (24 * 60)) * 100;
            const color =
              scheduleColors[slot.scheduleId] ?? 'var(--accent-cyan)';
            const isPast = slotMin < nowMinutes;

            return (
              <motion.div
                key={`${slot.scheduleId}_${slot.hour}`}
                className={`timeline-slot ${isPast ? 'past' : 'upcoming'}`}
                style={{ left: `calc(${pct}% - 6px)`, '--slot-color': color }}
                initial={{ opacity: 0, y: -10, scale: 0.5 }}
                animate={{ opacity: isPast ? 0.4 : 1, y: 0, scale: 1 }}
                transition={{
                  delay: i * 0.04,
                  duration: 0.35,
                  ease: [0.16, 1, 0.3, 1],
                }}
                whileHover={{ scale: 1.3, opacity: 1, zIndex: 10 }}
                title={`${slot.targetLabel} — ${slot.hour} — ${slot.types.join(
                  ', ',
                )}`}
              >
                <div className="slot-diamond" />
                {/* Label au hover via CSS tooltip */}
                <div className="slot-tooltip">
                  <strong>{slot.hour}</strong>
                  <span>{slot.targetLabel}</span>
                  <span className="slot-types">
                    {slot.types.join(' · ')}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {/* Curseur "maintenant" */}
          <motion.div
            className="timeline-now"
            style={{ left: `${nowPct}%` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="now-line" />
            <div className="now-dot" />
            <span className="now-label">
              {nowDate.getHours().toString().padStart(2, '0')}:
              {nowDate.getMinutes().toString().padStart(2, '0')}
            </span>
          </motion.div>
        </div>

        {/* Légende des plannings */}
        <div className="timeline-legend">
          {schedules
            .filter((s) => s.enabled)
            .map((s) => (
              <div key={s.id} className="legend-item">
                <span
                  className="legend-dot"
                  style={{ background: scheduleColors[s.id] }}
                />
                <span className="legend-label">{s.targetLabel}</span>
                <span className="legend-hours">
                  {s.hours.join(' · ')}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Liste des prochaines exécutions du jour */}
      <div className="upcoming-list">
        <p className="upcoming-title">Prochaines exécutions aujourd&apos;hui</p>
        {slots
          .filter((slot) => {
            const [h, m] = slot.hour.split(':').map(Number);
            return h * 60 + m > nowMinutes;
          })
          .slice(0, 8)
          .map((slot, i) => {
            const color =
              scheduleColors[slot.scheduleId] ?? 'var(--accent-cyan)';
            const [h, m] = slot.hour.split(':').map(Number);
            const slotTime = new Date();
            slotTime.setHours(h, m, 0, 0);
            const diff = slotTime - new Date(now);
            const mins = Math.floor(diff / 60000);

            return (
              <motion.div
                key={`upcoming_${slot.scheduleId}_${slot.hour}`}
                className="upcoming-row"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                style={{ '--slot-color': color }}
              >
                <span
                  className="upcoming-dot"
                  style={{ background: color }}
                />
                <span className="upcoming-hour">{slot.hour}</span>
                <span className="upcoming-target">
                  {slot.targetLabel}
                </span>
                <span className="upcoming-types">
                  {slot.types.join(' · ')}
                </span>
                <span className="upcoming-countdown">
                  {mins < 60
                    ? `dans ${mins}min`
                    : `dans ${Math.floor(mins / 60)}h${String(
                        mins % 60,
                      ).padStart(2, '0')}`}
                </span>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}

