const DEFAULT_SCRAPING_CONFIG = {
  delayBetweenServers: 60000,
  scheduledHours: ['00:00', '12:00'],
  enabledServers: [],
  enabledScrapers: { evenements: true },
  eventsScraperAccount: { username: '', password: '' }
};

let _config = { ...DEFAULT_SCRAPING_CONFIG };

function setConfig(config) {
  if (!config || typeof config !== 'object') return;
  _config = { ...DEFAULT_SCRAPING_CONFIG, ...config };
}

function getConfig() {
  return { ..._config };
}

module.exports = { DEFAULT_SCRAPING_CONFIG, setConfig, getConfig };
