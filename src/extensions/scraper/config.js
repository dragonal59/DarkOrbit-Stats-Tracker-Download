/**
 * Configuration de l'extension scraper DarkOrbit
 */
const CONFIG = {
  httpBase: 'http://localhost:3000',
  delayBetweenPages: { min: 2000, max: 3000 },
  delayBetweenRankings: { min: 3000, max: 5000 },
  delayBetweenServers: { min: 10000, max: 15000 },
  loginRetryMax: 3,
  pageLoadTimeout: 30000
};
