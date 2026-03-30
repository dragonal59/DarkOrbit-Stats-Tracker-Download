/**
 * Script injecté dans la page DarkOrbit pour extraire les breaking news.
 * Partagé par session-scraper.js et events-scraper-standalone.js.
 * DOM : .news-base-container → div[id^="be_news_"] → .breaking-news-layer, endTimestamp via scripts inline.
 */
const JS_EXTRACT_EVENTS = `(function(){
  function getText(el){ return el ? (el.textContent || '').trim().replace(/\\s+/g, ' ') : ''; }
  function getBg(el){
    if (!el) return '';
    var s = (el.getAttribute('style') || el.style.cssText || '');
    var m = s.match(/background-image\\s*:\\s*url\\s*\\(\\s*['"]?([^'")\s]+)/);
    return m ? m[1].trim() : '';
  }
  function getEndTimestamp(block) {
    var scripts = block.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var txt = scripts[i].textContent || '';
      var match = txt.match(/newsTimer\\w+End\\s*=\\s*(\\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  }
  try {
    var container = document.querySelector('.news-base-container')
      || document.querySelector('[class*="news_base"]')
      || document.querySelector('[class*="news-base"]')
      || document.querySelector('[class*="breaking_news_container"]');
    if (!container) return { ok: false, events: [] };
    var blocks = container.querySelectorAll('div[id^="be_news_"]');
    if (!blocks.length) blocks = container.querySelectorAll('div[id^="news_"]');
    if (!blocks.length) blocks = container.querySelectorAll('[class*="breaking-news"],[class*="breaking_news"]');
    var scrapedAt = new Date().toISOString();
    var out = [];
    Array.from(blocks).forEach(function(block, i){
      var layer = block.querySelector('.breaking-news-layer')
        || block.querySelector('[class*="breaking-news-layer"]')
        || block.querySelector('[class*="news-layer"]')
        || block;
      if (!layer) return;
      var nameEl = layer.querySelector('.be-position-half_headline.be-style-bold_full_content, .be-position-half_headline.be-style-headline, .be-style-bold_full_content, .be-style-headline');
      if (!nameEl) nameEl = layer.querySelector('[class*="headline"],[class*="title"]');
      var descEl = layer.querySelector('.be-position-half_maintext_with_headline.be-style-default, .be-style-default');
      if (!descEl) descEl = layer.querySelector('[class*="maintext"],[class*="description"],[class*="content"]');
      var timerEl = layer.querySelector('.news-countdown');
      var name = getText(nameEl);
      var description = getText(descEl);
      var timer = timerEl ? getText(timerEl) : '';
      var imageUrl = getBg(layer);
      if (!imageUrl) { var img = layer.querySelector('img'); if (img) imageUrl = img.getAttribute('src') || ''; }
      var id = layer.getAttribute('id') || block.getAttribute('id') || ('event-' + i);
      var endTimestamp = getEndTimestamp(block);
      if (name || description || timer || imageUrl) {
        out.push({ id: id, name: name, description: description, timer: timer, imageUrl: imageUrl, scrapedAt: scrapedAt, endTimestamp: endTimestamp });
      }
    });
    return { ok: true, events: out };
  } catch(e) { return { ok: false, events: [], error: e.message }; }
})()`;

module.exports = { JS_EXTRACT_EVENTS };
