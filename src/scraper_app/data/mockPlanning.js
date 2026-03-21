// Types de scrape disponibles (Événements = scraping page d'accueil DO pour les events)
export const SCRAPE_TYPES = ['HoF', 'Profils', 'Gates', 'Événements'];

// Périodes DOStats disponibles
export const SCRAPE_PERIODS = ['current', 'last_24h', 'last_7d', 'last_30d'];

// Planning vide par défaut (pas de données fictives)
export const MOCK_SCHEDULES = [];

// Serveurs bannis (vide par défaut)
export const MOCK_BANNED = [];

// Calcule la prochaine exécution d'un planning à partir de maintenant
export function getNextRun(schedule) {
  if (!schedule.enabled || !schedule.hours.length) return null;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Chercher la prochaine heure aujourd'hui ou demain
  const candidates = [];
  for (const hhmm of schedule.hours) {
    const candidate = new Date(`${todayStr}T${hhmm}:00`);
    if (candidate > now) candidates.push(candidate);
    // Aussi demain
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    candidates.push(new Date(`${tomorrowStr}T${hhmm}:00`));
  }
  candidates.sort((a, b) => a - b);
  return candidates[0] ?? null;
}

// Calcule toutes les exécutions d'une journée pour la timeline
export function getDaySlots(schedules) {
  const slots = [];
  for (const sch of schedules) {
    if (!sch.enabled) continue;
    for (const hhmm of sch.hours) {
      slots.push({
        scheduleId: sch.id,
        targetLabel: sch.targetLabel,
        targetType: sch.targetType,
        hour: hhmm,
        types: sch.types,
      });
    }
  }
  return slots.sort((a, b) => a.hour.localeCompare(b.hour));
}

