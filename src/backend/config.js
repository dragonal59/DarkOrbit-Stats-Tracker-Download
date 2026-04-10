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
  { level: 24, xp: 41943040000 },
  { level: 25, xp: 83886080000 },
  { level: 26, xp: 167772160000 },
  { level: 27, xp: 335544320000 },
  { level: 28, xp: 671088640000 },
  { level: 29, xp: 1343177280000 },
  { level: 30, xp: 2684354560000 }
];

function getLevelFromXp(xp) {
  if (xp == null || !Number.isFinite(Number(xp))) return 1;
  var val = Math.floor(Number(xp));
  for (var i = LEVELS_DATA.length - 1; i >= 0; i--) {
    if (val >= LEVELS_DATA[i].xp) return LEVELS_DATA[i].level;
  }
  return 1;
}
if (typeof window !== 'undefined') window.getLevelFromXp = getLevelFromXp;

const RANKS_DATA = [
  { rank_id: 1, rank: "basic_space_pilot", name: "Pilote de 1ère classe", honor: 0, xp: 0, rankPoints: 0, img: "img/ranks/basic_space_pilot.png" },
  { rank_id: 2, rank: "space_pilot", name: "Caporal", honor: 10000, xp: 20000, rankPoints: 100, img: "img/ranks/space_pilot.png" },
  { rank_id: 3, rank: "chief_space_pilot", name: "Caporal-chef", honor: 30000, xp: 60000, rankPoints: 300, img: "img/ranks/chief_space_pilot.png" },
  { rank_id: 4, rank: "basic_sergeant", name: "Sergent", honor: 70000, xp: 140000, rankPoints: 700, img: "img/ranks/basic_sergeant.png" },
  { rank_id: 5, rank: "sergeant", name: "Sergent-chef", honor: 150000, xp: 300000, rankPoints: 1500, img: "img/ranks/sergeant.png" },
  { rank_id: 6, rank: "chief_sergeant", name: "Adjudant", honor: 310000, xp: 620000, rankPoints: 3100, img: "img/ranks/chief_sergeant.png" },
  { rank_id: 7, rank: "basic_lieutenant", name: "Adjudant-chef", honor: 630000, xp: 1260000, rankPoints: 6300, img: "img/ranks/basic_lieutenant.png" },
  { rank_id: 8, rank: "lieutenant", name: "Major", honor: 1270000, xp: 2540000, rankPoints: 12700, img: "img/ranks/lieutenant.png" },
  { rank_id: 9, rank: "chief_lieutenant", name: "Sous-lieutenant", honor: 2550000, xp: 5100000, rankPoints: 25500, img: "img/ranks/chief_lieutenant.png" },
  { rank_id: 10, rank: "basic_captain", name: "Lieutenant", honor: 5110000, xp: 10220000, rankPoints: 51100, img: "img/ranks/basic_captain.png" },
  { rank_id: 11, rank: "captain", name: "Capitaine", honor: 10230000, xp: 20460000, rankPoints: 102300, img: "img/ranks/captain.png" },
  { rank_id: 12, rank: "chief_captain", name: "Capitaine d'escadron", honor: 20470000, xp: 40940000, rankPoints: 204700, img: "img/ranks/chief_captain.png" },
  { rank_id: 13, rank: "basic_major", name: "Commandant", honor: 40950000, xp: 81900000, rankPoints: 409500, img: "img/ranks/basic_major.png" },
  { rank_id: 14, rank: "major", name: "Commandant d'escadron", honor: 81910000, xp: 163820000, rankPoints: 819100, img: "img/ranks/major.png" },
  { rank_id: 15, rank: "chief_major", name: "Lieutenant-colonel", honor: 163830000, xp: 327660000, rankPoints: 1638300, img: "img/ranks/chief_major.png" },
  { rank_id: 16, rank: "basic_colonel", name: "Colonel", honor: 327670000, xp: 655340000, rankPoints: 3276700, img: "img/ranks/basic_colonel.png" },
  { rank_id: 17, rank: "colonel", name: "Général de brigade", honor: 655350000, xp: 1310700000, rankPoints: 6553500, img: "img/ranks/colonel.png" },
  { rank_id: 18, rank: "chief_colonel", name: "Général de division", honor: 1310710000, xp: 2621420000, rankPoints: 13107100, img: "img/ranks/chief_colonel.png" },
  { rank_id: 19, rank: "basic_general", name: "Général de corps d'armée", honor: 2621430000, xp: 5242860000, rankPoints: 26214300, img: "img/ranks/basic_general.png" },
  { rank_id: 20, rank: "general", name: "Général d'armée", honor: 5242870000, xp: 10485740000, rankPoints: 52428700, img: "img/ranks/general.png" },
  { rank_id: 21, rank: "chief_general", name: "Maréchal", honor: 10485750000, xp: 20971500000, rankPoints: 104857500, img: "img/ranks/chief_general.png" }
];

/** rank_N (scraper) → clé rank interne */
const RANK_KEY_TO_RANK_NAME = {};
RANKS_DATA.forEach(r => {
  RANK_KEY_TO_RANK_NAME['rank_' + r.rank_id] = r.rank;
});
if (typeof window !== 'undefined') window.RANK_KEY_TO_RANK_NAME = RANK_KEY_TO_RANK_NAME;

/** rank_id (1-21) → clé rank */
const RANK_ID_TO_KEY = Object.fromEntries(RANKS_DATA.map(function (r) { return [r.rank_id, r.rank]; }));
/** clé rank → rank_id */
const RANK_KEY_TO_ID = Object.fromEntries(RANKS_DATA.map(function (r) { return [r.rank, r.rank_id]; }));

/** Code serveur → langue (fr, en, es, ru, tr, pl). Pour résoudre grade par nom (ex. Colonel FR=16 vs EN=17). */
const SERVER_TO_LANG = {
  fr1: 'fr', es1: 'es', ru1: 'ru', ru5: 'ru', tr3: 'tr', tr4: 'tr', tr5: 'tr', pl3: 'pl',
  gbl1: 'en', gbl3: 'en', gbl4: 'en', gbl5: 'en', int1: 'en', int2: 'en', int5: 'en', int6: 'en', int7: 'en', int11: 'en', int14: 'en', us2: 'en', de2: 'en', de4: 'en', mx1: 'en'
};
/** Noms EN des 21 grades (ordre rank_id 1..21) pour résolution sans ambiguïté Colonel/Basic Colonel. */
const EN_RANK_NAMES = [
  'Basic Space Pilot', 'Space Pilot', 'Chief Space Pilot', 'Basic Sergeant', 'Sergeant', 'Chief Sergeant',
  'Basic Lieutenant', 'Lieutenant', 'Chief Lieutenant', 'Basic Captain', 'Captain', 'Chief Captain',
  'Basic Major', 'Major', 'Chief Major', 'Basic Colonel', 'Colonel', 'Chief Colonel',
  'Basic General', 'General', 'Chief General'
];
/** Par langue : tableau de 21 noms (index = rank_id - 1). Résolution (nom + serveur) pour éviter Colonel FR/EN. */
const RANK_NAMES_BY_LANG = (function () {
  var m = {
    fr: RANKS_DATA.map(function (r) { return r.name; }),
    en: EN_RANK_NAMES
  };
  if (typeof window !== 'undefined' && window.GRADES_MAPPING_JSON && Array.isArray(window.GRADES_MAPPING_JSON.grades)) {
    var grades = window.GRADES_MAPPING_JSON.grades;
    ['es', 'ru', 'tr', 'pl'].forEach(function (lang) {
      var arr = grades.map(function (g) { return g[lang] || g.en || null; });
      if (arr.some(Boolean)) m[lang] = arr;
    });
  }
  return m;
})();

/** Traductions grade par langue (tooltip classement). de → en si absent. */
const GRADES_TRANSLATIONS = {
  basic_space_pilot: { fr: 'Pilote de 1ère classe', en: 'Basic Space Pilot', es: 'Piloto básico', ru: 'Рядовой космический пилот', tr: 'Acemi Uzay Pilotu' },
  space_pilot: { fr: 'Caporal', en: 'Space Pilot', es: 'Piloto', ru: 'Космический пилот', tr: 'Uzay Pilotu' },
  chief_space_pilot: { fr: 'Caporal-chef', en: 'Chief Space Pilot', es: 'Jefe piloto', ru: 'Старший пилот', tr: 'Acemi Pilot' },
  basic_sergeant: { fr: 'Sergent', en: 'Basic Sergeant', es: 'Sargento básico', ru: 'Младший сержант', tr: 'Acemi Çavuş' },
  sergeant: { fr: 'Sergent-chef', en: 'Sergeant', es: 'Sargento', ru: 'Сержант', tr: 'Çavuş' },
  chief_sergeant: { fr: 'Adjudant', en: 'Chief Sergeant', es: 'Sargento mayor', ru: 'Старший сержант', tr: 'Uzman Çavuş' },
  basic_lieutenant: { fr: 'Adjudant-chef', en: 'Basic Lieutenant', es: 'Teniente básico', ru: 'Старшина', tr: 'Asteğmen' },
  lieutenant: { fr: 'Major', en: 'Lieutenant', es: 'Teniente', ru: 'Прапорщик', tr: 'Teğmen' },
  chief_lieutenant: { fr: 'Sous-lieutenant', en: 'Chief Lieutenant', es: 'Teniente mayor', ru: 'Старший прапорщик', tr: 'Üsteğmen' },
  basic_captain: { fr: 'Lieutenant', en: 'Basic Captain', es: 'Capitán básico', ru: 'Младший лейтенант', tr: 'Acemi Yüzbaşı' },
  captain: { fr: 'Capitaine', en: 'Captain', es: 'Capitán', ru: 'Лейтенант', tr: 'Yüzbaşı' },
  chief_captain: { fr: 'Capitaine d\'escadron', en: 'Chief Captain', es: 'Capitán mayor', ru: 'Старший лейтенант', tr: 'Uzman Yüzbaşı' },
  basic_major: { fr: 'Commandant', en: 'Basic Major', es: 'Mayor básico', ru: 'Капитан', tr: 'Acemi Binbaşı' },
  major: { fr: 'Commandant d\'escadron', en: 'Major', es: 'Mayor', ru: 'Майор', tr: 'Binbaşı' },
  chief_major: { fr: 'Lieutenant-colonel', en: 'Chief Major', es: 'Jefe mayor', ru: 'Подполковник', tr: 'Kurmay Binbaşı' },
  basic_colonel: { fr: 'Colonel', en: 'Basic Colonel', es: 'Coronel básico', ru: 'Полковник', tr: 'Acemi Albay' },
  colonel: { fr: 'Général de brigade', en: 'Colonel', es: 'Coronel', ru: 'Генерал-майор', tr: 'Albay' },
  chief_colonel: { fr: 'Général de division', en: 'Chief Colonel', es: 'Coronel mayor', ru: 'Генерал-лейтенант', tr: 'Kurmay Albay' },
  basic_general: { fr: 'Général de corps d\'armée', en: 'Basic General', es: 'General básico', ru: 'Генерал-полковник', tr: 'Tümgeneral' },
  general: { fr: 'Général d\'armée', en: 'General', es: 'General', ru: 'Генерал', tr: 'General' },
  chief_general: { fr: 'Maréchal', en: 'Chief General', es: 'General Mayor', ru: 'Маршал', tr: 'Genel Kurmay Başkanı' }
};

/**
 * Mapping noms de grades (toutes langues DarkOrbit) vers img.
 * Clé = nom normalisé (lowercase, sans accents). Valeur = chemin img.
 */
const RANK_NAME_TO_IMG = (function () {
  const imgs = [
    'img/ranks/basic_space_pilot.png', 'img/ranks/space_pilot.png', 'img/ranks/chief_space_pilot.png',
    'img/ranks/basic_sergeant.png', 'img/ranks/sergeant.png', 'img/ranks/chief_sergeant.png',
    'img/ranks/basic_lieutenant.png', 'img/ranks/lieutenant.png', 'img/ranks/chief_lieutenant.png',
    'img/ranks/basic_captain.png', 'img/ranks/captain.png', 'img/ranks/chief_captain.png',
    'img/ranks/basic_major.png', 'img/ranks/major.png', 'img/ranks/chief_major.png',
    'img/ranks/basic_colonel.png', 'img/ranks/colonel.png', 'img/ranks/chief_colonel.png',
    'img/ranks/basic_general.png', 'img/ranks/general.png', 'img/ranks/chief_general.png'
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
  if (typeof window !== 'undefined' && window.GRADES_MAPPING_JSON && Array.isArray(window.GRADES_MAPPING_JSON.grades)) {
    window.GRADES_MAPPING_JSON.grades.forEach(function (g, i) {
      var img = imgs[i];
      if (!img) return;
      ['en', 'fr', 'es', 'ru', 'tr', 'pl'].forEach(function (lang) {
        var n = g[lang];
        if (!n) return;
        var lows = lang === 'tr'
          ? [String(n).toLowerCase(), String(n).toLocaleLowerCase('tr-TR')]
          : [String(n).toLowerCase()];
        lows.forEach(function (low) {
          var k = low.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
          if (k) m[k] = img;
        });
      });
    });
  }
  return m;
})();

/** Mapping clé grade scraper (ex: colonel, basic_colonel) vers img — pour les classements importés */
const GRADE_KEY_TO_IMG = {
  basic_space_pilot: 'img/ranks/basic_space_pilot.png', space_pilot: 'img/ranks/space_pilot.png', chief_space_pilot: 'img/ranks/chief_space_pilot.png',
  basic_sergeant: 'img/ranks/basic_sergeant.png', sergeant: 'img/ranks/sergeant.png', chief_sergeant: 'img/ranks/chief_sergeant.png',
  basic_lieutenant: 'img/ranks/basic_lieutenant.png', lieutenant: 'img/ranks/lieutenant.png', chief_lieutenant: 'img/ranks/chief_lieutenant.png',
  basic_captain: 'img/ranks/basic_captain.png', captain: 'img/ranks/captain.png', chief_captain: 'img/ranks/chief_captain.png',
  basic_major: 'img/ranks/basic_major.png', major: 'img/ranks/major.png', chief_major: 'img/ranks/chief_major.png',
  basic_colonel: 'img/ranks/basic_colonel.png', colonel: 'img/ranks/colonel.png', chief_colonel: 'img/ranks/chief_colonel.png',
  basic_general: 'img/ranks/basic_general.png', general: 'img/ranks/general.png', chief_general: 'img/ranks/chief_general.png'
};

/** Fallback si server-mappings.js n'est pas chargé — ne pas redéclarer SERVER_CODE_TO_DISPLAY */
if (typeof window !== 'undefined' && typeof window.SERVER_CODE_TO_DISPLAY === 'undefined') {
  window.SERVER_CODE_TO_DISPLAY = {
    de2: 'Allemagne 2', de4: 'Allemagne 4', es1: 'Espagne 1', fr1: 'France 1',
    gbl1: 'Global PvE', gbl2: 'Global 2 (Ganymede)', gbl3: 'Global 3 (Titan)', gbl4: 'Global 4 (Europa)', gbl5: 'Global 5 (Callisto)',
    int1: 'Europe Global 1', int5: 'Europe Global 2', int7: 'Europe Global 3', int11: 'Europe Global 5', int14: 'Europe Global 7',
    mx1: 'Mexique 1', pl3: 'Pologne 3', ru1: 'Russie 1', ru5: 'Russie 5',
    tr3: 'Turquie 3', tr4: 'Turquie 4', tr5: 'Turquie 5', us2: 'USA 2 (Côte Ouest)',
    int2: 'Amérique Global 1', int6: 'Amérique Global 2'
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