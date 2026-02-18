/* Bridge injecté dans le monde principal pour window.startScraping (CSP-compatible) */
window.startScraping = function() {
  document.dispatchEvent(new CustomEvent('start-scraping-requested'));
};
console.log('[CONTENT] window.startScraping injecté dans le monde principal');
