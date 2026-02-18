/**
 * Système i18n : application des traductions, persistance langue, bouton Language
 * Dépend de config/keys.js et backend/translations.js
 */
(function () {
  'use strict';

  var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
  var langKey = sk.LANGUAGE || 'darkOrbitLanguage';
  var DEFAULT_LANG = (typeof window !== 'undefined' && window.TRANSLATIONS) ? window.TRANSLATIONS.DEFAULT_LANG : 'fr';
  var LANGS = (typeof window !== 'undefined' && window.TRANSLATIONS) ? window.TRANSLATIONS.LANGS : ['fr', 'de', 'ru', 'es', 'en', 'tr'];
  var flagBase = 'img/country_flags/';
  var flagSuffix = '_country.png';

  function getStoredLang() {
    try {
      var stored = localStorage.getItem(langKey);
      if (stored && LANGS.indexOf(stored) !== -1) return stored;
    } catch (e) {}
    return DEFAULT_LANG;
  }

  function setStoredLang(lang) {
    try {
      if (LANGS.indexOf(lang) !== -1) localStorage.setItem(langKey, lang);
    } catch (e) {}
  }

  function t(key, lang) {
    return (typeof window !== 'undefined' && window.TRANSLATIONS && window.TRANSLATIONS.t) ? window.TRANSLATIONS.t(key, lang) : key;
  }

  function applyTranslations(lang) {
    if (!lang) lang = getStoredLang();
    var root = document.documentElement;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key, lang);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key, lang);
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (key) el.title = t(key, lang);
    });
    root.setAttribute('lang', lang === 'en' ? 'en' : lang === 'de' ? 'de' : lang === 'ru' ? 'ru' : lang === 'es' ? 'es' : lang === 'tr' ? 'tr' : 'fr');
  }

  function getFlagSrc(lang) {
    var code = lang === 'en' ? 'en' : lang;
    return flagBase + code + flagSuffix;
  }

  function updateLanguageButton(lang) {
    var btn = document.getElementById('languageBtn');
    var label = document.getElementById('languageBtnLabel');
    var img = document.getElementById('languageBtnFlag');
    if (btn && label) label.textContent = t('lang_' + lang, lang);
    if (img) {
      img.src = getFlagSrc(lang);
      img.alt = t('lang_' + lang, lang);
      img.onerror = function () { img.style.display = 'none'; };
      img.style.display = '';
    }
  }

  function openDropdown() {
    var dd = document.getElementById('languageDropdown');
    if (dd) dd.classList.add('language-dropdown--open');
  }

  function closeDropdown() {
    var dd = document.getElementById('languageDropdown');
    if (dd) dd.classList.remove('language-dropdown--open');
  }

  function setLanguage(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    setStoredLang(lang);
    applyTranslations(lang);
    updateLanguageButton(lang);
    closeDropdown();
    try {
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: lang } }));
      }
    } catch (e) {}
  }

  function initLanguageButton() {
    var container = document.getElementById('languageButtonContainer');
    if (!container) return;
    var current = getStoredLang();
    container.innerHTML =
      '<div class="language-switcher">' +
        '<button type="button" id="languageBtn" class="language-btn" aria-haspopup="true" aria-expanded="false" aria-label="' + (t('language', current)) + '">' +
          '<img id="languageBtnFlag" src="' + getFlagSrc(current) + '" alt="" class="language-btn-flag" width="24" height="18">' +
          '<span id="languageBtnLabel" class="language-btn-label">' + t('lang_' + current, current) + '</span>' +
          '<span class="language-btn-arrow">▼</span>' +
        '</button>' +
        '<div id="languageDropdown" class="language-dropdown" role="menu" aria-label="' + (t('language', current)) + '">' +
          LANGS.map(function (l) {
            return '<button type="button" class="language-dropdown-item" role="menuitem" data-lang="' + l + '">' +
              '<img src="' + getFlagSrc(l) + '" alt="" width="20" height="15" class="language-dropdown-flag" onerror="this.style.display=\'none\'">' +
              '<span>' + t('lang_' + l, l) + '</span></button>';
          }).join('') +
        '</div>' +
      '</div>';
    var btn = document.getElementById('languageBtn');
    var dd = document.getElementById('languageDropdown');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = dd && dd.classList.contains('language-dropdown--open');
        if (open) closeDropdown(); else openDropdown();
      });
    }
    document.addEventListener('click', function () { closeDropdown(); });
    if (dd) {
      dd.addEventListener('click', function (e) {
        e.stopPropagation();
        var item = e.target && e.target.closest && e.target.closest('[data-lang]');
        if (item) setLanguage(item.getAttribute('data-lang'));
      });
    }
  }

  function init() {
    var lang = getStoredLang();
    applyTranslations(lang);
    initLanguageButton();
    updateLanguageButton(lang);
  }

  window.getCurrentLang = getStoredLang;
  window.setLanguage = setLanguage;
  window.applyTranslations = applyTranslations;
  window.i18nT = t;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
