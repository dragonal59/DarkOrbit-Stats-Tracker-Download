// ==========================================
// GESTIONNAIRE DE SESSION DE RÉFÉRENCE
// Pour calculs "Gain du jour" et comparaisons
// Nouveaux utilisateurs : 1ère session du jour = référence
// Utilisateurs existants : dernière session de J-1 = référence
// ==========================================

var _rk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
const REFERENCE_DATE_KEY = _rk.REFERENCE_DATE || 'darkOrbitDailyReferenceDate';

/**
 * Retourne le début du jour (minuit) pour une date
 */
function getDayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ZERO_REFERENCE : unique déclaration dans reference-manager.js (chargé avant ce script)
function getZeroReference() {
  return (typeof window !== 'undefined' && window.ZERO_REFERENCE) || { honor: 0, xp: 0, rankPoints: 0 };
}

/**
 * Retourne la session de référence pour les comparaisons "Gain du jour"
 * @param {Array} sessions - Liste des sessions (getSessions())
 * @returns {{ session: object|null, label: string, isFirstOfDay: boolean, isFirstEver: boolean }}
 */
function getReferenceSessionForComparison(sessions) {
  if (!sessions || sessions.length === 0) {
    return { session: null, label: '-', isFirstOfDay: false, isFirstEver: false };
  }

  const now = new Date();
  const todayStart = getDayStart(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  const todaySessions = sessions
    .filter(s => (s.timestamp || 0) >= todayStart)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const yesterdaySessions = sessions
    .filter(s => {
      const ts = s.timestamp || 0;
      return ts >= yesterdayStart && ts < todayStart;
    })
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Cas 1 : Il y a des sessions hier → référence = dernière session de J-1
  if (yesterdaySessions.length > 0) {
    const ref = yesterdaySessions[yesterdaySessions.length - 1];
    const refDate = new Date(ref.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return {
      session: ref,
      label: refDate,
      isFirstOfDay: false,
      isFirstEver: false
    };
  }

  // Cas 2 : Pas de session hier (nouvel utilisateur ou premier jour)
  // Première session du jour → référence = zéro (gains = valeurs)
  // Sessions suivantes du jour → référence = première session du jour
  if (todaySessions.length > 0) {
    const firstOfDay = todaySessions[0];
    const isFirstSessionOnly = todaySessions.length === 1;
    if (isFirstSessionOnly) {
      return {
        session: getZeroReference(),
        label: 'Point de départ',
        isFirstOfDay: true,
        isFirstEver: true
      };
    }
    const refDate = new Date(firstOfDay.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return {
      session: firstOfDay,
      label: refDate,
      isFirstOfDay: true,
      isFirstEver: false
    };
  }

  return { session: null, label: '-', isFirstOfDay: false, isFirstEver: false };
}

/**
 * Calcule les gains du jour par rapport à la session de référence
 * @param {object} latestToday - Dernière session du jour (ou null)
 * @param {object} reference - { session, label } from getReferenceSessionForComparison
 * @returns {{ honor: number, xp: number, rankPoints: number, honorGain: number, xpGain: number, rankPointsGain: number, comparedTo: string, isFirstSession: boolean }}
 */
function calculateDailyGains(latestToday, reference) {
  const empty = {
    honor: 0,
    xp: 0,
    rankPoints: 0,
    honorGain: 0,
    xpGain: 0,
    rankPointsGain: 0,
    comparedTo: '-',
    isFirstSession: false
  };

  if (!latestToday) return { ...empty };

  const honor = Number(latestToday.honor) || 0;
  const xp = Number(latestToday.xp) || 0;
  const rankPoints = Number(latestToday.rankPoints) || 0;

  if (!reference?.session) {
    return { ...empty, honor, xp, rankPoints };
  }

  const ref = reference.session;
  const refHonor = Number(ref.honor) || 0;
  const refXp = Number(ref.xp) || 0;
  const refRank = Number(ref.rankPoints) || 0;

  return {
    honor,
    xp,
    rankPoints,
    honorGain: honor - refHonor,
    xpGain: xp - refXp,
    rankPointsGain: rankPoints - refRank,
    comparedTo: reference.label,
    isFirstSession: reference.isFirstEver
  };
}

window.getReferenceSessionForComparison = getReferenceSessionForComparison;
window.calculateDailyGains = calculateDailyGains;
window.getDayStart = getDayStart;
console.log('📌 Module Reference Session chargé');
