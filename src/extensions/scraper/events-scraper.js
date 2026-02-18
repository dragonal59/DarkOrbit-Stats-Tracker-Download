/**
 * Extraction des événements DarkOrbit depuis .news-base-container
 * Utilisé par le content-script via CustomEvent scrape-events-request / scrape-events-result
 */
(function () {
  'use strict';

  function getText(el) {
    if (!el) return '';
    return (el.textContent || '').trim();
  }

  function getBackgroundImageUrl(el) {
    if (!el) return '';
    var style = el.getAttribute('style') || el.style.cssText || '';
    var match = style.match(/background-image:\s*url\s*\(\s*['"]?([^'")\s]+)/);
    return match ? match[1].trim() : '';
  }

  /**
   * Extrait la liste des événements depuis la page (div .news-base-container)
   * @returns {Array<{id: string, name: string, description: string, timer: string, imageUrl: string}>}
   */
  function extractEventsFromPage() {
    var out = [];
    try {
      var container = document.querySelector('.news-base-container');
      if (!container) return out;
      var layers = container.querySelectorAll('.breaking-news-layer');
      if (!layers.length) {
        var anyNews = container.querySelectorAll('[class*="breaking"], [class*="news-layer"], .news-item');
        layers = anyNews.length ? anyNews : [container];
      }
      for (var i = 0; i < layers.length; i++) {
        var el = layers[i];
        var nameEl = el.querySelector('.be-style-bold_full_content') || el.querySelector('.be-style-headline') || el.querySelector('[class*="headline"]') || el.querySelector('h2, h3, .title');
        var descEl = el.querySelector('.be-style-default') || el.querySelector('[class*="default"]') || el.querySelector('.description, .desc');
        var timerEl = el.querySelector('.news-countdown') || el.querySelector('[class*="countdown"]');
        var name = getText(nameEl);
        var description = getText(descEl);
        var timer = timerEl ? getText(timerEl) : '';
        var imageUrl = getBackgroundImageUrl(el);
        if (!imageUrl && el.querySelector('img')) {
          var img = el.querySelector('img');
          imageUrl = img.getAttribute('src') || '';
        }
        var id = el.getAttribute('id') || 'event-' + i;
        if (name || description || timer || imageUrl) {
          out.push({ id: id, name: name, description: description, timer: timer, imageUrl: imageUrl });
        }
      }
    } catch (e) {
      console.warn('[CONTENT] extractEventsFromPage:', e.message);
    }
    return out;
  }

  document.addEventListener('scrape-events-request', function () {
    var data = extractEventsFromPage();
    document.dispatchEvent(new CustomEvent('scrape-events-result', { detail: data }));
  });
})();
