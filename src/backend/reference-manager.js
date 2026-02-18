// ==========================================
// REFERENCE MANAGER
// Progression basée sur la dernière session enregistrée
// Référence = session précédente (chronologiquement)
// ==========================================

const ZERO_REFERENCE = { honor: 0, xp: 0, rankPoints: 0 };
window.ZERO_REFERENCE = ZERO_REFERENCE;

/**
 * Retourne la session de référence pour calculer les gains de la dernière session
 * Référence = session chronologiquement précédente (ou baseline, ou null)
 * @param {Array} sessions - Liste des sessions (getSessions())
 * @returns {{ session: object|null, label: string, isBaseline: boolean }}
 */
function getReferenceSession(sessions) {
  if (!sessions || sessions.length === 0) {
    return { session: null, label: '-', isBaseline: false };
  }

  const sorted = [...sessions].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  if (sorted.length === 0) return { session: null, label: '-', isBaseline: false };

  const latest = sorted[sorted.length - 1];
  if (sorted.length === 1) {
    if (latest.is_baseline) {
      return { session: null, label: 'Seuil enregistré', isBaseline: true };
    }
    const baseline = sessions.find(s => s.is_baseline);
    if (baseline) {
      return {
        session: baseline,
        label: 'Point de départ',
        isBaseline: true
      };
    }
    return { session: ZERO_REFERENCE, label: 'Point de départ', isBaseline: false };
  }

  const reference = sorted[sorted.length - 2];
  if (reference.is_baseline) {
    return { session: reference, label: 'Point de départ', isBaseline: true };
  }

  const now = new Date();
  const refDate = new Date(reference.timestamp);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const refDayStart = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()).getTime();

  if (refDayStart === todayStart) {
    const timeStr = refDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return { session: reference, label: `depuis ${timeStr}`, isBaseline: false };
  }

  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  if (refDayStart === yesterdayStart) {
    return { session: reference, label: 'depuis hier', isBaseline: false };
  }

  const dateStr = refDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return { session: reference, label: `depuis ${dateStr}`, isBaseline: false };
}

/**
 * Calcule les gains par rapport à la session de référence
 * @param {object} currentStats - Stats actuelles { honor, xp, rankPoints }
 * @param {object} reference - { session, label } from getReferenceSession
 * @returns {{ honor: number, xp: number, rankPoints: number, honorGain: number, xpGain: number, rankPointsGain: number, comparedTo: string }}
 */
function _num(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function _getVal(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return 0;
}

function calculateGains(currentStats, reference) {
  const empty = {
    honor: 0,
    xp: 0,
    rankPoints: 0,
    honorGain: 0,
    xpGain: 0,
    rankPointsGain: 0,
    comparedTo: '-'
  };

  if (!currentStats) return { ...empty };

  const honor = _num(_getVal(currentStats, 'honor'));
  const xp = _num(_getVal(currentStats, 'xp'));
  const rankPoints = _num(_getVal(currentStats, 'rankPoints', 'rank_points'));

  if (!reference || !reference.session) {
    return {
      honor,
      xp,
      rankPoints,
      honorGain: 0,
      xpGain: 0,
      rankPointsGain: 0,
      comparedTo: (reference && reference.label) ? reference.label : '-'
    };
  }

  const ref = reference.session;
  const refHonor = _num(_getVal(ref, 'honor'));
  const refXp = _num(_getVal(ref, 'xp'));
  const refRank = _num(_getVal(ref, 'rankPoints', 'rank_points'));

  return {
    honor,
    xp,
    rankPoints,
    honorGain: honor - refHonor,
    xpGain: xp - refXp,
    rankPointsGain: rankPoints - refRank,
    comparedTo: reference.label
  };
}

/**
 * Vérifie si un seuil de départ (baseline) existe
 */
function hasBaseline(sessions) {
  return sessions && sessions.some(s => s.is_baseline === true);
}

/**
 * Vérifie si la modal baseline doit s'afficher (premier lancement uniquement - aucune session)
 * Utilisateurs existants avec sessions : pas de modal, référence = session précédente
 */
function shouldShowBaselineModal(sessions) {
  return !sessions || sessions.length === 0;
}

window.getReferenceSession = getReferenceSession;
window.calculateGains = calculateGains;
window.hasBaseline = hasBaseline;
window.shouldShowBaselineModal = shouldShowBaselineModal;
console.log('📌 Module Reference Manager chargé');
