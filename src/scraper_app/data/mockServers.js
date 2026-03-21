const makeServer = (code, label) => ({
  id: code,
  code,
  label,
  status: 'disabled',
  lastScrape: null,
  nextScrape: null,
  activeTypes: [],
  successCount: 0,
  errorCount: 0,
  totalCount: 0,
  speed: 0,
  latency: null,
});

export const SERVER_GROUPS = [
  {
    id: 'global_pve',
    label: 'Global PvE',
    accent: '#63b3ed',
    servers: [
      makeServer('gbl1', 'Global PvE'),
      makeServer('gbl2', 'Global 2 (Ganymede)'),
      makeServer('gbl3', 'Global 3 (Titan)'),
      makeServer('gbl4', 'Global 4 (Europa)'),
      makeServer('gbl5', 'Global 5 (Callisto)'),
    ],
  },
  {
    id: 'europe_global',
    label: 'Europe Global',
    accent: '#9f7aea',
    servers: [
      makeServer('int1', 'Europe Global 1'),
      makeServer('int5', 'Europe Global 2'),
      makeServer('int7', 'Europe Global 3'),
      makeServer('int11', 'Europe Global 5'),
      makeServer('int14', 'Europe Global 7'),
    ],
  },
  {
    id: 'france_spain_germany',
    label: 'France / Espagne / Allemagne / Pologne',
    accent: '#48bb78',
    servers: [
      makeServer('fr1', 'France 1'),
      makeServer('es1', 'Espagne 1'),
      makeServer('de2', 'Allemagne 2'),
      makeServer('de4', 'Allemagne 4'),
      makeServer('pl3', 'Pologne 3'),
    ],
  },
  {
    id: 'russia_turkey',
    label: 'Russie / Turquie',
    accent: '#ed8936',
    servers: [
      makeServer('ru1', 'Russie 1'),
      makeServer('ru5', 'Russie 5'),
      makeServer('tr3', 'Turquie 3'),
      makeServer('tr4', 'Turquie 4'),
      makeServer('tr5', 'Turquie 5'),
    ],
  },
  {
    id: 'americas',
    label: 'Amériques',
    accent: '#d53f8c',
    servers: [
      makeServer('us2', 'USA 2 (Côte Ouest)'),
      makeServer('mx1', 'Mexique 1'),
      makeServer('int2', 'Amérique Global 1'),
      makeServer('int6', 'Amérique Global 2'),
    ],
  },
];

export function generateServerHistory(serverId) {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `${serverId}_h${i}`,
    timestamp: new Date(Date.now() - i * 1000 * 60 * 18).toISOString(),
    duration: Math.floor(800 + Math.random() * 4000),
    entriesScraped: Math.floor(80 + Math.random() * 120),
    status: Math.random() > 0.15 ? 'success' : 'error',
    type: ['HoF', 'Profils', 'Gates'][Math.floor(Math.random() * 3)],
  }));
}

