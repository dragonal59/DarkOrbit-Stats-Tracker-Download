/**
 * Content script - injection dans les pages DarkOrbit
 * Définit window.startScraping pour le Main process (executeJavaScript)
 */
(function () {
  'use strict';

  console.log('[CONTENT] Content script chargé, URL:', window.location.href);

  /** Détection cookies expirés : si on est sur la page login (redirection depuis Hall of Fame) */
  (function checkCookiesExpired() {
    var href = window.location.href || '';
    if (href.indexOf('action=externalLogin') !== -1 || href.indexOf('/dosid') !== -1) {
      var hostname = window.location.hostname || '';
      var serverId = hostname.split('.')[0] || '';
      if (serverId) {
        console.log('[CONTENT] Cookies expirés détectés (page login), serveur:', serverId);
        chrome.runtime.sendMessage({ type: 'cookies-expired', server_id: serverId });
      }
    }
  })();

  document.addEventListener('start-scraping-requested', () => {
    console.log('[CONTENT] startScraping demandé, envoi au background');
    chrome.runtime.sendMessage({ type: 'START_SCRAPING' });
  });

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('start-scraping-bridge.js');
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  console.log('[CONTENT] Bridge startScraping installé (main world, fichier externe)');

  /** CAPTCHA checkbox "Je suis humain" - clic automatique */
  async function handleCaptchaCheckbox() {
    console.log('[CONTENT] Vérification présence CAPTCHA checkbox...');
    await new Promise(function (r) { setTimeout(r, 1500); });
    var checkboxSelectors = [
      '.recaptcha-checkbox', '#recaptcha-anchor', '[class*="recaptcha"]', '[id*="recaptcha"]',
      'input[type="checkbox"][id*="human"]', 'input[type="checkbox"][id*="captcha"]', 'input[type="checkbox"][name*="human"]',
      '.captcha-checkbox', '[data-captcha]'
    ];
    var i, el, recaptchaIframe, iframeDoc, checkbox;
    for (i = 0; i < checkboxSelectors.length; i++) {
      el = document.querySelector(checkboxSelectors[i]);
      if (el && el.tagName !== 'IFRAME') {
        console.log('[CONTENT] Checkbox CAPTCHA trouvée:', checkboxSelectors[i]);
        await new Promise(function (r) { setTimeout(r, Math.random() * 500 + 300); });
        el.click();
        await new Promise(function (r) { setTimeout(r, 1500); });
        console.log('[CONTENT] Checkbox CAPTCHA cliquée');
        return true;
      }
    }
    recaptchaIframe = document.querySelector('iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"], iframe[title*="recaptcha"]');
    if (recaptchaIframe) {
      try {
        iframeDoc = recaptchaIframe.contentDocument || recaptchaIframe.contentWindow.document;
        checkbox = iframeDoc.querySelector('.recaptcha-checkbox, #recaptcha-anchor');
        if (checkbox) {
          await new Promise(function (r) { setTimeout(r, Math.random() * 500 + 300); });
          checkbox.click();
          await new Promise(function (r) { setTimeout(r, 2000); });
          console.log('[CONTENT] Checkbox reCAPTCHA (iframe) cliquée');
          return true;
        }
      } catch (e) {
        console.warn('[CONTENT] Iframe reCAPTCHA cross-origin, clic direct impossible');
      }
    }
    console.log('[CONTENT] Aucun CAPTCHA checkbox détecté');
    return false;
  }

  document.addEventListener('login-request', function (e) {
    var username = (e.detail && e.detail.username) || '';
    var password = (e.detail && e.detail.password) || '';
    var usernameInput = document.querySelector('#username, input[name="username"], input[name="email"]');
    var passwordInput = document.querySelector('#password, input[name="password"]');
    var loginBtn = document.querySelector('#login_btn, #login_button, button[type="submit"], input[type="submit"], [name="login"]');
    function sendResult(success, error) {
      document.dispatchEvent(new CustomEvent('login-result', { detail: { success: success, error: error || null } }));
    }
    if (!usernameInput || !passwordInput || !loginBtn) {
      sendResult(false, 'Formulaire non trouvé');
      return;
    }
    usernameInput.value = username;
    passwordInput.value = password;
    (async function () {
      try {
        await handleCaptchaCheckbox();
        await new Promise(function (r) { setTimeout(r, Math.random() * 800 + 400); });
        loginBtn.click();
        await new Promise(function (r) { setTimeout(r, 3000); });
        var loginFormStillVisible = !!document.querySelector('#login_btn, #login_button, .login-form, form[action*="login"]');
        var loginSuccess = !loginFormStillVisible;
        console.log('[CONTENT] Login', loginSuccess ? 'réussi' : 'échoué');
        sendResult(loginSuccess);
      } catch (err) {
        sendResult(false, err.message);
      }
    })();
  });

  document.addEventListener('scrape-request', (e) => {
    const { rankKey, valueKey } = e.detail || {};
    try {
      const data = typeof extractRankingData === 'function'
        ? extractRankingData(rankKey, valueKey)
        : [];
      document.dispatchEvent(new CustomEvent('scrape-result', { detail: data }));
    } catch (err) {
      document.dispatchEvent(new CustomEvent('scrape-result', { detail: [], error: err.message }));
    }
  });

  /** Détection et acceptation automatique de la bannière cookie DarkOrbit */
  async function handleCookieBanner() {
    console.log('[CONTENT] Vérification bannière cookie...');
    await new Promise(function (r) { setTimeout(r, 1500); });
    var selectors = [
      '#cmp-btn-accept',
      '.sp_choice_type_ACCEPT_ALL',
      'button[id*="accept"]',
      'button[class*="accept"]',
      '[data-action="accept"]',
      '.cmp-intro_acceptAll',
      '.qc-cmp2-summary-buttons button:first-child',
      '[class*="accept"]',
      'a[href*="accept"]'
    ];
    var i, btn, iframes, iframe, iframeDoc, j;
    for (i = 0; i < selectors.length; i++) {
      btn = document.querySelector(selectors[i]);
      if (btn) {
        var text = (btn.textContent || '').trim().toLowerCase();
        if (text.indexOf('accept') !== -1 || text.indexOf('agree') !== -1 || text.indexOf('consent') !== -1 || text.indexOf('accepter') !== -1 || text.indexOf('ok') !== -1 || selectors[i].indexOf('accept') !== -1) {
          console.log('[CONTENT] Bannière cookie détectée, clic sur:', selectors[i]);
          btn.click();
          await new Promise(function (r) { setTimeout(r, 1000); });
          console.log('[CONTENT] Cookies acceptés');
          return true;
        }
      }
    }
    var allButtons = document.querySelectorAll('button, a[role="button"], [onclick]');
    for (i = 0; i < allButtons.length; i++) {
      var t = (allButtons[i].textContent || '').trim().toLowerCase();
      if ((t.indexOf('accept') !== -1 || t.indexOf('accepter') !== -1 || t.indexOf('agree') !== -1) && t.length < 50) {
        console.log('[CONTENT] Bannière cookie détectée (texte), clic sur bouton:', t.slice(0, 30));
        allButtons[i].click();
        await new Promise(function (r) { setTimeout(r, 1000); });
        console.log('[CONTENT] Cookies acceptés');
        return true;
      }
    }
    iframes = document.querySelectorAll('iframe');
    for (i = 0; i < iframes.length; i++) {
      iframe = iframes[i];
      try {
        iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        for (j = 0; j < selectors.length; j++) {
          btn = iframeDoc.querySelector(selectors[j]);
          if (btn) {
            console.log('[CONTENT] Bannière cookie dans iframe, clic sur:', selectors[j]);
            btn.click();
            await new Promise(function (r) { setTimeout(r, 1000); });
            console.log('[CONTENT] Cookies acceptés (iframe)');
            return true;
          }
        }
      } catch (e) {}
    }
    console.log('[CONTENT] Aucune bannière cookie détectée');
    return false;
  }

  document.addEventListener('cookie-banner-check', function () {
    (function () {
      var resolve = function (accepted) {
        document.dispatchEvent(new CustomEvent('cookie-banner-result', { detail: { accepted: accepted } }));
      };
      handleCookieBanner().then(resolve).catch(function () { resolve(false); });
    })();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STORE_TOKEN') {
      console.log('[CONTENT] STORE_TOKEN reçu, token longueur:', message.token?.length);
      chrome.storage.local.set({ authToken: message.token }, () => {
        console.log('[CONTENT] Token stocké dans chrome.storage.local');
        sendResponse({ success: true });
      });
      return true;
    }
    if (message.type === 'LOGIN') {
      try {
        const usernameInput = document.querySelector('#username, input[name="username"], input[name="email"]');
        const passwordInput = document.querySelector('#password, input[name="password"]');
        const loginBtn = document.querySelector('#login_btn, button[type="submit"], input[type="submit"], [name="login"]');
        if (usernameInput && passwordInput && loginBtn) {
          usernameInput.value = message.username || '';
          passwordInput.value = message.password || '';
          loginBtn.click();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Formulaire non trouvé' });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }
    if (message.type === 'SCRAPE_RANKING') {
      const { rankKey, valueKey } = message;
      const data = typeof extractRankingData === 'function'
        ? extractRankingData(rankKey, valueKey)
        : [];
      sendResponse({ success: true, data });
      return true;
    }
    return true;
  });

  (function pollToken(attempts) {
    if (attempts > 100) {
      console.warn('[CONTENT] Token non détecté après 10s');
      return;
    }
    if (window.__AUTH_TOKEN__) {
      console.log('[CONTENT] Token détecté via polling (tentative', attempts + 1, ')');
      chrome.runtime.sendMessage({ type: 'STORE_TOKEN', token: window.__AUTH_TOKEN__ });
      return;
    }
    setTimeout(() => pollToken((attempts || 0) + 1), 100);
  })(0);
})();
