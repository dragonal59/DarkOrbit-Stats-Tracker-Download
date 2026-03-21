export const LOG_TYPES = {
  info: { label: 'INFO', color: 'var(--accent-cyan)', technical: false },
  success: { label: 'OK', color: 'var(--accent-emerald)', technical: false },
  warning: { label: 'WARN', color: 'var(--accent-amber)', technical: false },
  error: { label: 'ERROR', color: 'var(--accent-rose)', technical: false },
  debug: { label: 'DEBUG', color: 'var(--accent-violet)', technical: true },
  command: {
    label: '>',
    color: 'rgba(255,255,255,0.9)',
    technical: false,
  },
  result: {
    label: '←',
    color: 'rgba(255,255,255,0.6)',
    technical: false,
  },
};

let _logId = 0;

export function makeLog(type, message, meta = {}) {
  return {
    id: ++_logId,
    type,
    message,
    timestamp: new Date().toISOString(),
    server: meta.server ?? null,
    scraper: meta.scraper ?? null,
    duration: meta.duration ?? null,
  };
}

const NORMAL_LOGS = [
  {
    type: 'success',
    msg: 'Scraped 142 entries from dostats.info/hall-of-fame?server=int5&type=honor',
    server: 'gbl5',
  },
  {
    type: 'info',
    msg: 'Proxy rotated → 104.28.19.83:8080',
    server: 'gbl5',
  },
  {
    type: 'warning',
    msg: 'Rate limit detected on int2 — backing off 30s',
    server: 'gbl2',
  },
  {
    type: 'success',
    msg: 'Player profile scraped: BYRos (jasonKILLER72)',
    server: 'gbl5',
  },
  {
    type: 'error',
    msg: 'HTTP 403 on dostats.info/player/BfUHD — skipping',
    server: 'gbl1',
  },
  {
    type: 'info',
    msg: 'Session refreshed for scraper #4',
    scraper: '#4',
  },
  {
    type: 'success',
    msg: 'DB batch insert: 1 200 records committed',
    server: 'gbl5',
  },
  {
    type: 'warning',
    msg: 'Captcha detected on int5 — switching proxy',
    server: 'int5',
  },
  {
    type: 'success',
    msg: 'Hall of Gates page scraped: 100 entries',
    server: 'gbl2',
  },
  {
    type: 'error',
    msg: 'Connection timeout after 30s on int11',
    server: 'int11',
  },
];

const TECHNICAL_LOGS = [
  {
    type: 'debug',
    msg: 'Puppeteer page.goto() resolved in 384ms',
    server: 'gbl5',
    duration: 384,
  },
  {
    type: 'debug',
    msg: 'DOM selector #ranking-table found — 100 rows',
    server: 'gbl5',
  },
  {
    type: 'debug',
    msg: 'Parsed row 47/100 — userId=BYRos points=89316237629',
  },
  {
    type: 'debug',
    msg: 'Cookie jar refreshed — 3 cookies written',
  },
  {
    type: 'debug',
    msg: 'Memory usage: heap 142MB / 512MB',
  },
  {
    type: 'debug',
    msg: 'Queue depth: 8 jobs pending',
  },
  {
    type: 'debug',
    msg: 'HTTP 200 in 291ms — dostats.info/hall-of-fame?server=int5',
    server: 'int5',
    duration: 291,
  },
  {
    type: 'debug',
    msg: 'Retry 1/3 for int11 after timeout',
  },
];

export function getRandomLog(includeTechnical = true) {
  const pool = includeTechnical
    ? [...NORMAL_LOGS, ...TECHNICAL_LOGS]
    : NORMAL_LOGS;
  const entry =
    pool[Math.floor(Math.random() * pool.length)] || NORMAL_LOGS[0];
  return makeLog(entry.type, entry.msg, {
    server: entry.server,
    duration: entry.duration,
  });
}

export const CONSOLE_COMMANDS_HELP = [
  'Commandes console (avec ou sans /) :',
  '  /clear   — effacer la console',
  '  /copy    — copier l’intégralité des logs (y compris techniques)',
  '  /freeze  — geler l’affichage de la console',
  '  /resume  — reprendre l’affichage',
  '  /stop    — arrêter tous les scrapings (données en cours enregistrées)',
  '  /help    — afficher cette liste',
];

export const AVAILABLE_COMMANDS = {
  help: () => CONSOLE_COMMANDS_HELP,
  status: () => [
    '● Moteur de scraping  : inactif',
    '● Scrapers en cours   : 0 / 0',
    '● Proxies actifs      : 0 / 0',
    '● Quota utilisé       : 0%',
    '● Uptime              : 0 min',
  ],
  'scraper list': () => [
    'ID   NOM                   STATUT    VITESSE',
    '#1   Amazon Products        running   142 req/s',
    '#2   LinkedIn Profiles      paused    0 req/s',
    '#3   DOStats HoF int5       running   89 req/s',
    '#4   DOStats Profiles       running   34 req/s',
    '#5   DOStats Gates          idle      0 req/s',
  ],
  'proxy list': () => [
    'ACTIFS : 127 / 200',
    '104.28.19.83:8080    OK    290ms',
    '192.168.1.47:3128    OK    340ms',
    '103.21.244.0:8080    OK    510ms',
    '... (+124 autres)',
  ],
  clear: () => ['__CLEAR__'],
};

