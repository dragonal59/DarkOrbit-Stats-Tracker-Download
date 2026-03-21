export const DEFAULT_SETTINGS = {
  // ── Proxies ──────────────────────────────────────
  proxies: {
    list: [
      {
        id: 'px_1',
        host: '104.28.19.83',
        port: 8080,
        username: '',
        password: '',
        enabled: true,
        status: 'ok',
        latency: 290,
      },
      {
        id: 'px_2',
        host: '192.168.1.47',
        port: 3128,
        username: '',
        password: '',
        enabled: true,
        status: 'ok',
        latency: 340,
      },
      {
        id: 'px_3',
        host: '103.21.244.0',
        port: 8080,
        username: '',
        password: '',
        enabled: false,
        status: 'idle',
        latency: null,
      },
      {
        id: 'px_4',
        host: '185.220.101.5',
        port: 9050,
        username: '',
        password: '',
        enabled: true,
        status: 'error',
        latency: null,
      },
    ],
    rotationMode: 'round_robin', // 'round_robin' | 'random' | 'least_used'
    testUrl: 'https://dostats.info',
    rotateOnError: true,
    rotateEvery: 50,
    cooldownMs: 2000,
  },

  // ── Scraper / Puppeteer ───────────────────────────
  scraper: {
    concurrency: 2,
    profilesConcurrency: 3,
    timeoutMs: 30000,
    retries: 3,
    retryDelayMs: 5000,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    headless: true,
    blockImages: true,
    blockFonts: true,
    blockCSS: false,
    rateLimitDelay: 500,
    maxQueueSize: 500,
    screenshotOnError: false,
  },

  // ── Base de données ───────────────────────────────
  database: {
    outputDir: './rankings_output',
    format: 'json', // 'json' | 'json+csv'
    prettyPrint: false,
    compressOld: true,
    retentionDays: 90,
    backupEnabled: true,
    backupDir: './backups',
    backupEveryH: 24,
    maxBackups: 7,
  },

  // ── Notifications ─────────────────────────────────
  notifications: {
    desktopEnabled: true,
    soundEnabled: false,
    notifyOnError: true,
    notifyOnComplete: true,
    notifyOnRateLimit: true,
    errorThreshold: 10,
    webhookEnabled: false,
    webhookUrl: '',
    webhookOnError: true,
    webhookOnComplete: false,
    discordEnabled: false,
    discordWebhookUrl: '',
  },

  // ── Apparence ─────────────────────────────────────
  appearance: {
    accentColor: 'cyan', // 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose'
    uiDensity: 'normal', // 'compact' | 'normal' | 'comfortable'
    animationsEnabled: true,
    reducedMotion: false,
    sidebarCollapsed: false,
    logMaxLines: 2000,
  },
};

export const ROTATION_MODES = [
  {
    value: 'round_robin',
    label: 'Round Robin',
    desc: 'Rotation séquentielle équilibrée',
  },
  {
    value: 'random',
    label: 'Aléatoire',
    desc: 'Proxy aléatoire à chaque requête',
  },
  {
    value: 'least_used',
    label: 'Moins utilisé',
    desc: 'Priorité au proxy le moins sollicité',
  },
];

export const ACCENT_COLORS = [
  { value: 'cyan', color: '#63b3ed', label: 'Cyan' },
  { value: 'violet', color: '#9f7aea', label: 'Violet' },
  { value: 'emerald', color: '#48bb78', label: 'Émeraude' },
  { value: 'amber', color: '#ed8936', label: 'Ambre' },
  { value: 'rose', color: '#fc8181', label: 'Rose' },
];

export const UI_DENSITY_OPTIONS = [
  { value: 'compact', label: 'Compact', desc: "Maximum d'infos à l'écran" },
  { value: 'normal', label: 'Normal', desc: 'Équilibre densité / lisibilité' },
  { value: 'comfortable', label: 'Aéré', desc: "Plus d'espacement, plus lisible" },
];

export const APPEARANCE_BEHAVIOR_OPTIONS = [
  { key: 'animationsEnabled', label: 'Animations', desc: 'Transitions Framer Motion dans toute l\'interface' },
  { key: 'reducedMotion', label: 'Réduire les animations', desc: 'Désactive les animations complexes (accessibilité)' },
  { key: 'sidebarCollapsed', label: 'Sidebar réduite par défaut', desc: 'Affiche seulement les icônes au démarrage' },
];

