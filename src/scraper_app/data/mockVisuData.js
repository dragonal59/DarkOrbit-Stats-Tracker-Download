// Classement vide par défaut (pas de données fictives)
export function getEmptyRankingMeta(serverCode, serverLabel, type, period) {
  return {
    type: type || 'honor',
    period: period || 'current',
    server_code: serverCode || '',
    server_label: serverLabel || '',
    scraped_at: null,
    source_url: '',
    total_entries: 0,
    page: 0,
    pages_total: 0,
  };
}

// Liste serveurs pour les sélecteurs (alignée avec l’onglet Serveurs)
export const AVAILABLE_SERVERS = [
  { code: 'gbl1', label: 'Global PvE' },
  { code: 'gbl2', label: 'Global 2 (Ganymede)' },
  { code: 'gbl3', label: 'Global 3 (Titan)' },
  { code: 'gbl4', label: 'Global 4 (Europa)' },
  { code: 'gbl5', label: 'Global 5 (Callisto)' },
  { code: 'int1', label: 'Europe Global 1' },
  { code: 'int5', label: 'Europe Global 2' },
  { code: 'int7', label: 'Europe Global 3' },
  { code: 'int11', label: 'Europe Global 5' },
  { code: 'int14', label: 'Europe Global 7' },
  { code: 'fr1', label: 'France 1' },
  { code: 'es1', label: 'Espagne 1' },
  { code: 'de2', label: 'Allemagne 2' },
  { code: 'de4', label: 'Allemagne 4' },
  { code: 'pl3', label: 'Pologne 3' },
  { code: 'ru1', label: 'Russie 1' },
  { code: 'ru5', label: 'Russie 5' },
  { code: 'tr3', label: 'Turquie 3' },
  { code: 'tr4', label: 'Turquie 4' },
  { code: 'tr5', label: 'Turquie 5' },
  { code: 'us2', label: 'USA 2 (Côte Ouest)' },
  { code: 'mx1', label: 'Mexique 1' },
  { code: 'int2', label: 'Amérique Global 1' },
  { code: 'int6', label: 'Amérique Global 2' },
];

// Aligné avec les classements scrapés DOSTATS (dostats-scraper.js)
export const RANKING_TYPES = [
  { value: 'leaderboard', label: 'Leaderboard' },
  { value: 'top_user', label: 'Meilleur joueur' },
  { value: 'honor', label: 'Honneur' },
  { value: 'experience', label: 'Expérience' },
  { value: 'ship_kills', label: 'Vaisseaux détruits' },
  { value: 'alien_kills', label: 'Aliens vaincus' },
];

export const RANKING_PERIODS = [
  { value: 'current', label: 'Aujourd\'hui' },
  { value: 'last_24h', label: '- 24 heures' },
  { value: 'last_7d', label: '- 1 semaine' },
  { value: 'last_30d', label: '- 1 mois' },
  { value: 'last_90d', label: '- 3 mois' },
  { value: 'last_365d', label: '- 1 an' },
];

// Libellés pour le titre du classement (header)
export const PERIOD_TITLE_LABELS = {
  current: 'Aujourd\'hui',
  last_24h: 'Hier',
  last_7d: 'semaine dernière',
  last_30d: 'Mois dernier',
  last_90d: '3 mois',
  last_365d: '1 an',
};

// Couleurs par type de classement
export const RANKING_TYPE_COLORS = {
  honor: '#3b82f6',           // Bleu
  experience: '#ea580c',      // Orange feu
  top_user: '#22c55e',        // Vert
  ship_kills: '#f8fafc',      // Blanc
  alien_kills: '#ef4444',     // Rouge
  leaderboard: 'var(--accent-cyan)',
};

export const COMPANY_COLORS = {
  MMO: '#e53e3e',
  EIC: '#3182ce',
  VRU: '#38a169',
};


