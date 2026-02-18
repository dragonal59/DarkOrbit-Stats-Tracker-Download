// ==========================================
// CONFIGURATION & CONSTANTS
// Dépend de config/keys.js (chargé avant) pour STORAGE_KEYS et SYNC_KEYS.
// ==========================================

var _storageKeys = typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS
  ? window.APP_KEYS.STORAGE_KEYS
  : { SESSIONS: 'darkOrbitSessions', CURRENT_STATS: 'darkOrbitCurrentStats', THEME: 'darkOrbitTheme', VIEW_MODE: 'darkOrbitViewMode' };
var _syncKeys = typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.SYNC_KEYS
  ? window.APP_KEYS.SYNC_KEYS
  : ['darkOrbitSessions', 'darkOrbitEvents', 'darkOrbitSettings', 'darkOrbitCustomLinks', 'darkOrbitBoosters', 'darkOrbitCurrentStats'];

const CONFIG = {
  STORAGE_KEYS: _storageKeys,
  SYNC_KEYS: _syncKeys,

  // Sessions illimitées pour tous les badges (FREE, PRO, ADMIN, SUPERADMIN)
  LIMITS: {
    MAX_NOTE_LENGTH: 500,
    STORAGE_WARNING_SIZE: 4 * 1024 * 1024, // 4MB
    MAX_STORAGE_SIZE: 5 * 1024 * 1024 // 5MB
  },

  // UI Settings
  UI: {
    DEBOUNCE_DELAY: 500,
    TOAST_DURATION: 3000,
    ANIMATION_DURATION: 300,
    TIMER_UPDATE_INTERVAL: 1000,
    PAGINATION_SIZE: 20
  },

  // Default values
  DEFAULTS: {
    THEME: 'dark',
    VIEW_MODE: 'detailed'
  },

  // Debug (mettre progression: true pour tracer les barres de progression)
  DEBUG: {
    progression: false
  }
};

const LEVELS_DATA = [
  { level: 1, xp: 0 },
  { level: 2, xp: 10000 },
  { level: 3, xp: 20000 },
  { level: 4, xp: 40000 },
  { level: 5, xp: 80000 },
  { level: 6, xp: 160000 },
  { level: 7, xp: 320000 },
  { level: 8, xp: 640000 },
  { level: 9, xp: 1280000 },
  { level: 10, xp: 2560000 },
  { level: 11, xp: 5120000 },
  { level: 12, xp: 10240000 },
  { level: 13, xp: 20480000 },
  { level: 14, xp: 40960000 },
  { level: 15, xp: 81920000 },
  { level: 16, xp: 163840000 },
  { level: 17, xp: 327680000 },
  { level: 18, xp: 655360000 },
  { level: 19, xp: 1310720000 },
  { level: 20, xp: 2621440000 },
  { level: 21, xp: 5242880000 },
  { level: 22, xp: 10485760000 },
  { level: 23, xp: 20971520000 },
  { level: 24, xp: 41943040000 }
];

const RANKS_DATA = [
  { name: "Pilote de 1ère classe", honor: 0, xp: 0, rankPoints: 0, img: "img/basic_space_pilot.png" },
  { name: "Caporal", honor: 10000, xp: 20000, rankPoints: 100, img: "img/space_pilot.png" },
  { name: "Caporal-chef", honor: 30000, xp: 60000, rankPoints: 300, img: "img/chief_space_pilot.png" },
  { name: "Sergent", honor: 70000, xp: 140000, rankPoints: 700, img: "img/basic_sergeant.png" },
  { name: "Sergent-chef", honor: 150000, xp: 300000, rankPoints: 1500, img: "img/sergeant.png" },
  { name: "Adjudant", honor: 310000, xp: 620000, rankPoints: 3100, img: "img/chief_sergeant.png" },
  { name: "Adjudant-chef", honor: 630000, xp: 1260000, rankPoints: 6300, img: "img/basic_lieutenant.png" },
  { name: "Major", honor: 1270000, xp: 2540000, rankPoints: 12700, img: "img/lieutenant.png" },
  { name: "Sous-lieutenant", honor: 2550000, xp: 5100000, rankPoints: 25500, img: "img/chief_lieutenant.png" },
  { name: "Lieutenant", honor: 5110000, xp: 10220000, rankPoints: 51100, img: "img/basic_captain.png" },
  { name: "Capitaine", honor: 10230000, xp: 20460000, rankPoints: 102300, img: "img/captain.png" },
  { name: "Capitaine d'escadron", honor: 20470000, xp: 40940000, rankPoints: 204700, img: "img/chief_captain.png" },
  { name: "Commandant", honor: 40950000, xp: 81900000, rankPoints: 409500, img: "img/basic_major.png" },
  { name: "Commandant d'escadron", honor: 81910000, xp: 163820000, rankPoints: 819100, img: "img/major.png" },
  { name: "Lieutenant-colonel", honor: 163830000, xp: 327660000, rankPoints: 1638300, img: "img/chief_major.png" },
  { name: "Colonel", honor: 327670000, xp: 655340000, rankPoints: 3276700, img: "img/basic_colonel.png" },
  { name: "Général de brigade", honor: 655350000, xp: 1310700000, rankPoints: 6553500, img: "img/colonel.png" },
  { name: "Général de division", honor: 1310710000, xp: 2621420000, rankPoints: 13107100, img: "img/chief_colonel.png" },
  { name: "Général de corps d'armée", honor: 2621430000, xp: 5242860000, rankPoints: 26214300, img: "img/basic_general.png" },
  { name: "Général d'armée", honor: 5242870000, xp: 10485740000, rankPoints: 52428700, img: "img/general.png" },
  { name: "Maréchal", honor: 10485750000, xp: 20971500000, rankPoints: 104857500, img: "img/chief_general.png" }
];

/**
 * Mapping noms de grades (toutes langues DarkOrbit) vers img.
 * Clé = nom normalisé (lowercase, sans accents). Valeur = chemin img.
 */
const RANK_NAME_TO_IMG = (function () {
  const imgs = [
    'img/basic_space_pilot.png', 'img/space_pilot.png', 'img/chief_space_pilot.png',
    'img/basic_sergeant.png', 'img/sergeant.png', 'img/chief_sergeant.png',
    'img/basic_lieutenant.png', 'img/lieutenant.png', 'img/chief_lieutenant.png',
    'img/basic_captain.png', 'img/captain.png', 'img/chief_captain.png',
    'img/basic_major.png', 'img/major.png', 'img/chief_major.png',
    'img/basic_colonel.png', 'img/colonel.png', 'img/chief_colonel.png',
    'img/basic_general.png', 'img/general.png', 'img/chief_general.png'
  ];
  const names = [
    ['pilote de 1ère classe', 'basic space pilot', 'space pilot 1. klasse', 'piloto 1era clase', 'pilot 1. triedy', 'astronot', 'pilot pierwszej klasy'],
    ['caporal', 'space pilot', 'gefreiter', 'cabo', 'svobodnik', 'cavus', 'kapral'],
    ['caporal-chef', 'chief space pilot', 'hauptgefreiter', 'cabo jefe', 'desatnik', 'bas cavus', 'kapral sztabowy'],
    ['sergent', 'basic sergeant', 'unteroffizier', 'sargento base', 'sersant', 'cavus', 'sierzant'],
    ['sergent-chef', 'sergeant', 'stabsunteroffizier', 'sargento', 'starszy sersant', 'ustas cavus', 'sierzant sztabowy'],
    ['adjudant', 'chief sergeant', 'feldwebel', 'suboficial', 'praporscik', 'basgedikli', 'chorazy'],
    ['adjudant-chef', 'basic lieutenant', 'oberfeldwebel', 'teniente base', 'mladsi porucik', 'astegmen', 'chorazy sztabowy'],
    ['major', 'lieutenant', 'leutnant', 'teniente', 'porucik', 'tegmen', 'porucznik'],
    ['sous-lieutenant', 'chief lieutenant', 'oberleutnant', 'teniente jefe', 'nadporucik', 'yuzbasi', 'kapitan'],
    ['lieutenant', 'basic captain', 'hauptmann', 'capitan base', 'kapitán', 'binbasi', 'major'],
    ['capitaine', 'captain', 'stabshauptmann', 'capitan', 'kapitan', 'yarbay', 'podpulkovnik'],
    ["capitaine d'escadron", 'chief captain', 'capitan jefe', 'kapitan nadporucik', 'albay', 'pulkovnik'],
    ['commandant', 'basic major', 'major', 'comandante base', 'major', 'tuggeneral', 'plukovnik'],
    ['commandant d\'escadron', 'chief major', 'oberstleutnant', 'comandante', 'podplukovnik', 'tuggeneral', 'nadplukovnik'],
    ['lieutenant-colonel', 'basic colonel', 'oberstleutnant', 'teniente coronel', 'plukovnik', 'general', 'plukovnik'],
    ['colonel', 'basic colonel', 'oberst', 'coronel base', 'plukovnik', 'tuggeneral', 'plukovnik'],
    ['général de brigade', 'colonel', 'brigadegeneral', 'coronel', 'general', 'korgen', 'brigadni general'],
    ['général de division', 'chief colonel', 'generalmajor', 'general de division', 'general major', 'tumgen', 'generalporucik'],
    ['général de corps d\'armée', 'basic general', 'generalleutnant', 'general de cuerpo', 'general porucik', 'korgeneral', 'generalplukovnik'],
    ['général d\'armée', 'general', 'general', 'general de ejercito', 'armádní general', 'orgeneral', 'armadni general'],
    ['maréchal', 'chief general', 'generalfeldmarschall', 'mariscal', 'generál', 'marshall', 'marszalek']
  ];
  const m = {};
  function add(key, img) {
    if (!key) return;
    const k = String(key).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
    if (k) m[k] = img;
  }
  RANKS_DATA.forEach(function (r) { add(r.name, r.img); });
  names.forEach(function (arr, i) {
    arr.forEach(function (n) { add(n, imgs[i]); });
  });
  ['marshal', 'marszalek', 'marechal', 'generalfeldmarschall'].forEach(function (n) { add(n, imgs[20]); });
  return m;
})();

/** Mapping clé grade scraper (ex: colonel, basic_colonel) vers img — pour les classements importés */
const GRADE_KEY_TO_IMG = {
  basic_space_pilot: 'img/basic_space_pilot.png', space_pilot: 'img/space_pilot.png', chief_space_pilot: 'img/chief_space_pilot.png',
  basic_sergeant: 'img/basic_sergeant.png', sergeant: 'img/sergeant.png', chief_sergeant: 'img/chief_sergeant.png',
  basic_lieutenant: 'img/basic_lieutenant.png', lieutenant: 'img/lieutenant.png', chief_lieutenant: 'img/chief_lieutenant.png',
  basic_captain: 'img/basic_captain.png', captain: 'img/captain.png', chief_captain: 'img/chief_captain.png',
  basic_major: 'img/basic_major.png', major: 'img/major.png', chief_major: 'img/chief_major.png',
  basic_colonel: 'img/basic_colonel.png', colonel: 'img/colonel.png', chief_colonel: 'img/chief_colonel.png',
  basic_general: 'img/basic_general.png', general: 'img/general.png', chief_general: 'img/chief_general.png'
};

/** Fallback si server-mappings.js n'est pas chargé — ne pas redéclarer SERVER_CODE_TO_DISPLAY */
if (typeof window !== 'undefined' && typeof window.SERVER_CODE_TO_DISPLAY === 'undefined') {
  window.SERVER_CODE_TO_DISPLAY = {
    de2: 'Allemagne 2', de4: 'Allemagne 4', es1: 'Espagne 1', fr1: 'France 1',
    gbl1: 'Global PvE', gbl3: 'Global 3 (Titan)', gbl4: 'Global 4 (Europa)', gbl5: 'Global 5 (Callisto)',
    int1: 'Global Europe 1', int5: 'Global Europe 2', int7: 'Global Europe 3', int11: 'Global Europe 5', int14: 'Global Europe 7',
    mx1: 'Mexique 1', pl3: 'Pologne 3', ru1: 'Russie 1', ru5: 'Russie 5',
    tr3: 'Turquie 3', tr4: 'Turquie 4', tr5: 'Turquie 5', us2: 'USA 2 (Côte Ouest)',
    int2: 'Amerique Global 1', int6: 'Amerique Global 2'
  };
}

/** Référence au mapping (défini par server-mappings.js ou fallback ci-dessus) */
var _serverMap = typeof window !== 'undefined' ? window.SERVER_CODE_TO_DISPLAY : {};

/** Mapping libellé affiché → code serveur (inverse de SERVER_CODE_TO_DISPLAY) */
const SERVER_DISPLAY_TO_CODE = (function() {
  var m = {};
  for (var k in _serverMap) if (Object.prototype.hasOwnProperty.call(_serverMap, k)) {
    m[_serverMap[k]] = k;
  }
  return m;
})();

/** Liste des serveurs DarkOrbit (Classement + formulaire inscription) — noms triés */
const SERVERS_LIST = Object.entries(_serverMap)
  .sort(function(a, b) { return a[1].localeCompare(b[1]); })
  .map(function(e) { return e[1]; });