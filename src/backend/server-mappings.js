/**
 * Mapping permanent des 23 serveurs DarkOrbit (server_id → nom affiché).
 * Source unique de vérité pour toute l'application (renderer + Electron main).
 */
var SERVER_CODE_TO_DISPLAY = {
  de2: 'Allemagne 2',
  de4: 'Allemagne 4',
  es1: 'Espagne 1',
  fr1: 'France 1',
  gbl1: 'Global PvE',
  gbl3: 'Global 3 (Titan)',
  gbl4: 'Global 4 (Europa)',
  gbl5: 'Global 5 (Callisto)',
  int1: 'Global Europe 1',
  int5: 'Global Europe 2',
  int7: 'Global Europe 3',
  int11: 'Global Europe 5',
  int14: 'Global Europe 7',
  mx1: 'Mexique 1',
  pl3: 'Pologne 3',
  ru1: 'Russie 1',
  ru5: 'Russie 5',
  tr3: 'Turquie 3',
  tr4: 'Turquie 4',
  tr5: 'Turquie 5',
  us2: 'USA 2 (Côte Ouest)',
  int2: 'Amerique Global 1',
  int6: 'Amerique Global 2'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SERVER_CODE_TO_DISPLAY;
} else if (typeof window !== 'undefined') {
  window.SERVER_CODE_TO_DISPLAY = SERVER_CODE_TO_DISPLAY;
}
