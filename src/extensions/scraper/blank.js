/**
 * Script d'initialisation pour blank.html - définit window.startScraping et gère le token
 * Le token est passé via l'URL (blank.html?token=xxx) car executeJavaScript
 * ne fonctionne pas sur les pages chrome-extension:// (restriction Chromium).
 */
(function () {
  'use strict';

  console.log('[BLANK] Script chargé');

  window.startScraping = function () {
    console.log('[BLANK] startScraping appelé');
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'START_SCRAPING' });
    }
  };
  console.log('[BLANK] window.startScraping défini');

  var params = new URLSearchParams(window.location.search);
  var token = params.get('token');
  if (token) {
    console.log('[BLANK] Token reçu via URL, stockage...');
    chrome.storage.local.set({ authToken: token }, function () {
      console.log('[BLANK] Token stocké dans chrome.storage.local');
    });
  } else {
    console.warn('[BLANK] Aucun token dans l\'URL');
  }
})();
