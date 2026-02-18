/**
 * Background service worker - orchestration du scraping
 */
console.log('[BACKGROUND] Service worker chargé');
const CONFIG = {
  httpBase: 'http://localhost:3000',
  delayBetweenPages: { min: 2000, max: 3000 },
  delayBetweenRankings: { min: 3000, max: 5000 },
  delayBetweenServers: { min: 10000, max: 15000 },
  loginRetryMax: 3,
  pageLoadTimeout: 30000
};

/** Servers pour lesquels le content-script a signalé cookies expirés (évite boucle reload) */
let cookiesExpiredReported = {};

async function getToken() {
  const r = await chrome.storage.local.get(['authToken']);
  return r.authToken;
}

async function waitForToken(maxMs = 10000, pollMs = 100) {
  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < maxMs) {
    const token = await getToken();
    if (token) {
      if (attempts > 0) {
        console.log('[BACKGROUND] Token trouvé après', attempts * pollMs, 'ms');
      } else {
        console.log('[BACKGROUND] Token déjà disponible');
      }
      return token;
    }
    if (attempts === 0) console.log('[BACKGROUND] Token non disponible, attente...');
    attempts++;
    await new Promise(r => setTimeout(r, pollMs));
  }
  throw new Error('Token non disponible après ' + maxMs + 'ms');
}

async function httpRequest(endpoint, method = 'GET', body = null) {
  const token = await getToken();
  if (!token) {
    console.error('[BACKGROUND] httpRequest: Token non disponible dans chrome.storage.local');
    throw new Error('Token non disponible');
  }

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${CONFIG.httpBase}${endpoint}`, opts);
  if (res.status === 403) {
    console.error('[BACKGROUND] httpRequest: 403 Token invalide pour', endpoint);
    throw new Error('Token invalide');
  }
  if (!res.ok) {
    console.error('[BACKGROUND] httpRequest:', endpoint, '→', res.status);
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}

function randomDelay(min, max) {
  const d = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, d));
}

async function sendProgress(currentServer, currentServerIndex, action, completed) {
  try {
    await httpRequest('/progress', 'POST', {
      currentServer,
      currentServerIndex,
      action,
      completed,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[BACKGROUND] sendProgress erreur:', e.message);
  }
}

async function sendError(serverId, errorType, message) {
  try {
    await httpRequest('/error', 'POST', {
      server_id: serverId,
      error_type: errorType,
      message,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[BACKGROUND] sendError erreur:', e.message);
  }
}

function mergeRankings(honorP1, honorP2, xpP1, xpP2, topUserP1, topUserP2) {
  const map = new Map();
  const add = (list, rk, vk, useGrade) => {
    (list || []).forEach(p => {
      const name = (p.name || '').trim();
      if (!name) return;
      let entry = map.get(name);
      if (!entry) {
        entry = { name, grade: null, top_user_rank: null, top_user_value: null, honor_rank: null, honor_value: null, experience_rank: null, experience_value: null };
        map.set(name, entry);
      }
      if (rk && p[rk] != null) entry[rk] = p[rk];
      if (vk && p[vk] != null) entry[vk] = p[vk];
      if (useGrade && (p.grade || '').trim() && !/^(splitter_|spacer_|line_|unknown)/i.test(String(p.grade))) {
        entry.grade = p.grade;
      }
    });
  };
  add(honorP1, 'honor_rank', 'honor_value', false);
  add(honorP2, 'honor_rank', 'honor_value', false);
  add(xpP1, 'experience_rank', 'experience_value', false);
  add(xpP2, 'experience_rank', 'experience_value', false);
  add(topUserP1, 'top_user_rank', 'top_user_value', true);
  add(topUserP2, 'top_user_rank', 'top_user_value', true);

  const arr = Array.from(map.values()).map(p => ({
    name: p.name,
    grade: p.grade || 'unknown',
    top_user_rank: p.top_user_rank,
    top_user_value: p.top_user_value,
    honor_rank: p.honor_rank,
    honor_value: p.honor_value,
    experience_rank: p.experience_rank,
    experience_value: p.experience_value
  }));

  arr.sort((a, b) => {
    const av = (a.top_user_rank != null ? a.top_user_rank : 999) || 999;
    const bv = (b.top_user_rank != null ? b.top_user_rank : 999) || 999;
    return av - bv;
  });
  const out = arr.slice(0, 200);
  if (out.length > 0) {
    console.log('[FUSION DEBUG] Joueurs fusionnés:', out.length);
    out.slice(0, 5).forEach(p => console.log('[FUSION DEBUG] Joueur:', p.name, 'Grade:', p.grade));
  }
  return out;
}

/** Navigation via Main (Electron - chrome.tabs non dispo) */
async function navigateTo(url, waitForLoad = true) {
  const body = { url };
  if (waitForLoad) body.wait = true;
  const r = await httpRequest('/navigate', 'POST', body);
  if (!r.success) throw new Error(r.error || 'Navigation échouée');
}

/** Exécution de code dans la page via Main (executeJavaScript). Timeout côté serveur (15s) évite blocage infini. */
async function executeInPage(code) {
  const r = await httpRequest('/execute', 'POST', { code });
  if (r.timeout) console.warn('[BACKGROUND] Timeout /execute - continuation forcée');
  if (!r.success) throw new Error(r.error || 'Execute échoué');
  return r.result;
}

/** Détecte et accepte la bannière cookie si présente (via content-script) */
async function acceptCookieBannerIfPresent() {
  const code = `(function(){return new Promise(function(resolve){
    var t=setTimeout(function(){resolve({accepted:false});},6000);
    document.addEventListener('cookie-banner-result',function h(e){
      clearTimeout(t);document.removeEventListener('cookie-banner-result',h);
      resolve(e.detail||{accepted:false});
    },{once:true});
    document.dispatchEvent(new CustomEvent('cookie-banner-check'));
  });})()`;
  try {
    const result = await executeInPage(code);
    if (result && result.accepted) {
      console.log('[BACKGROUND] Bannière cookie acceptée');
      await randomDelay(1000, 2000);
    }
    return result && result.accepted;
  } catch (e) {
    console.warn('[BACKGROUND] acceptCookieBannerIfPresent:', e.message);
    return false;
  }
}

/** Login via custom event (content-script écoute login-request). Retourne { success, error } sans lever. */
async function performLogin(username, password) {
  const u = JSON.stringify(username || '');
  const p = JSON.stringify(password || '');
  const code = `(function(){return new Promise(function(resolve){
    var t=setTimeout(function(){resolve({success:false,error:'timeout'});},20000);
    document.addEventListener('login-result',function h(e){
      clearTimeout(t);document.removeEventListener('login-result',h);
      resolve(e.detail||{});
    },{once:true});
    document.dispatchEvent(new CustomEvent('login-request',{detail:{username:${u},password:${p}}}));
  });})()`;
  try {
    const result = await executeInPage(code);
    return result || { success: false, error: 'timeout' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** Extraction via custom event (content-script écoute scrape-request) */
async function scrapeTabRanking(rankKey, valueKey) {
  const rk = JSON.stringify(rankKey);
  const vk = JSON.stringify(valueKey);
  const code = `(function(){return new Promise(function(resolve){
    var t=setTimeout(function(){resolve([]);},10000);
    document.addEventListener('scrape-result',function h(e){
      clearTimeout(t);document.removeEventListener('scrape-result',h);
      var d=e.detail;resolve(Array.isArray(d)?d:[]);
    },{once:true});
    document.dispatchEvent(new CustomEvent('scrape-request',{detail:{rankKey:${rk},valueKey:${vk}}}));
  });})()`;
  const data = await executeInPage(code);
  return Array.isArray(data) ? data : [];
}

/** Scraping des événements en cours (depuis .news-base-container). Une fois par cycle, sur le premier serveur. */
async function scrapeCurrentEvents(serverId) {
  const code = `(function(){return new Promise(function(resolve){
    var t=setTimeout(function(){resolve([]);},8000);
    document.addEventListener('scrape-events-result',function h(e){
      clearTimeout(t);document.removeEventListener('scrape-events-result',h);
      resolve(Array.isArray(e.detail)?e.detail:[]);
    },{once:true});
    document.dispatchEvent(new CustomEvent('scrape-events-request'));
  });})()`;
  try {
    const raw = await executeInPage(code);
    const list = Array.isArray(raw) ? raw : [];
    const scrapedAt = new Date().toISOString();
    const events = list.map(ev => ({
      id: ev.id || '',
      name: (ev.name || '').trim(),
      description: (ev.description || '').trim(),
      timer: (ev.timer || '').trim(),
      imageUrl: (ev.imageUrl || '').trim(),
      scrapedAt
    }));
    if (events.length > 0) {
      await httpRequest('/scrape-events', 'POST', { events });
      console.log('[BACKGROUND] Événements scrapés:', events.length);
    }
  } catch (e) {
    console.warn('[BACKGROUND] scrapeCurrentEvents:', e?.message);
  }
}

let scrapingCycleRunning = false;

async function runScrapingCycle() {
  if (scrapingCycleRunning) {
    console.warn('[BACKGROUND] runScrapingCycle déjà en cours, ignorer le second appel');
    return;
  }
  scrapingCycleRunning = true;
  console.log('[BACKGROUND] Démarrage cycle scraping');

  try {
    let accounts = [];
    try {
      console.log('[BACKGROUND] GET /accounts...');
      const r = await httpRequest('/accounts', 'GET');
      accounts = r.accounts || [];
      console.log('[BACKGROUND] Comptes reçus:', accounts.length);
    } catch (e) {
      console.error('[BACKGROUND] Impossible de récupérer les comptes:', e.message);
      return;
    }

    if (accounts.length === 0) {
      console.warn('[BACKGROUND] Aucun compte configuré');
      return;
    }

    const completed = [];
    let stoppedByUser = false;

    for (let i = 0; i < accounts.length; i++) {
    try {
      const statusRes = await httpRequest('/status', 'GET');
      if (statusRes?.state?.stopRequested) {
        console.log('[BACKGROUND] Scraping interrompu par l\'utilisateur');
        stoppedByUser = true;
        break;
      }
    } catch (_) {}

    const acc = accounts[i];
    const { server_id, server_name, username, password } = acc;

    try {
      await sendProgress(server_id, i + 1, 'connecting', completed);

      let loginOk = false;
      let usedCookies = false;

      const restoreRes = await httpRequest('/restore-cookies', 'POST', { server_id }).catch(() => ({}));
      if (restoreRes && restoreRes.success && restoreRes.count > 0) {
        console.log(`[BACKGROUND] Cookies restaurés pour ${server_id} (${restoreRes.count} cookies), navigation directe vers Hall of Fame`);
        await navigateTo(`https://${server_id}.darkorbit.com/indexInternal.es?action=internalHallofFame`, true);
        await randomDelay(2000, 4000);

        const checkUrlCode = `(function(){try{return window.location.href||'';}catch(e){return'';}})()`;
        let currentUrl = '';
        try {
          currentUrl = await executeInPage(checkUrlCode) || '';
        } catch (e) {
          console.warn('[BACKGROUND] Vérification URL après cookies:', e?.message);
        }
        const urlIndicatesLogin = currentUrl.includes('action=externalLogin') || currentUrl.includes('/dosid');
        const contentScriptReported = cookiesExpiredReported[server_id];
        if (urlIndicatesLogin || contentScriptReported) {
          console.log(`[BACKGROUND] Cookies expirés pour ${server_id}${contentScriptReported ? ' (content-script)' : ''}, fallback sur login auto`);
          delete cookiesExpiredReported[server_id];
          try {
            await httpRequest('/remove-cookies', 'POST', { server_id });
          } catch (e) {
            console.warn('[BACKGROUND] /remove-cookies:', e?.message);
          }
          usedCookies = false;
          loginOk = false;
        } else {
          usedCookies = true;
          loginOk = true;
        }
      }

      if (!loginOk) {
        console.log(`[BACKGROUND] Navigation vers page login https://${server_id}.darkorbit.com/`);
        await navigateTo(`https://${server_id}.darkorbit.com/`, true);
        await acceptCookieBannerIfPresent();
        await randomDelay(2000, 4000);

        const loginResult = await performLogin(username, password);
        if (loginResult && loginResult.success) {
          console.log(`[BACKGROUND] Login ${server_id} réussi (auto)`);
          loginOk = true;
          try {
            await httpRequest('/save-cookies', 'POST', { server_id });
          } catch (e) {
            console.warn('[BACKGROUND] save-cookies:', e.message);
          }
        }
      }

      if (!loginOk) {
        console.log(`[BACKGROUND] CAPTCHA détecté, passage en attente manuelle (2 min max)...`);
        let captchaRes = { success: false, timeout: true };
        try {
          captchaRes = await httpRequest('/captcha-wait', 'POST', { server_id });
        } catch (e) {
          console.warn('[BACKGROUND] /captcha-wait:', e.message);
        }
        if (captchaRes && captchaRes.success) {
          console.log(`[BACKGROUND] Login manuel réussi pour ${server_id}`);
          loginOk = true;
          try {
            await httpRequest('/save-cookies', 'POST', { server_id });
          } catch (e) {
            console.warn('[BACKGROUND] save-cookies après CAPTCHA:', e.message);
          }
          await navigateTo(`https://${server_id}.darkorbit.com/indexInternal.es?action=internalHallofFame`, true);
          await acceptCookieBannerIfPresent();
          await randomDelay(2000, 3000);
        } else {
          await sendError(server_id, 'captcha_timeout', `Timeout 2 min - Valide le CAPTCHA pour ${server_id}`);
          continue;
        }
      }

      await acceptCookieBannerIfPresent();
      await randomDelay(5000, 8000);

      const baseUrl = `https://${server_id}.darkorbit.com/indexInternal.es?action=internalHallofFame`;
      // Honneur et XP : P1 uniquement (100 joueurs = top 100). Top User : P1 + P2 pour les grades.
      const views = [
        { view: 'UserHonor', rankKey: 'honor_rank', valueKey: 'honor_value', label: 'honor', pages: [1] },
        { view: 'UserEP', rankKey: 'experience_rank', valueKey: 'experience_value', label: 'xp', pages: [1] },
        { view: 'User', rankKey: 'top_user_rank', valueKey: 'top_user_value', label: 'topuser', pages: [1, 2] }
      ];

      let honorP1 = [], honorP2 = [], xpP1 = [], xpP2 = [], topUserP1 = [], topUserP2 = [];

      for (const v of views) {
        const pages = v.pages || [1];
        for (const page of pages) {
          await sendProgress(server_id, i + 1, `scraping_${v.label}_p${page}`, completed);

          const url = `${baseUrl}&view=${v.view}&dps=${page}`;
          await navigateTo(url, true);
          await acceptCookieBannerIfPresent();
          await randomDelay(3000, 5000);

          let data = [];
          try {
            data = await scrapeTabRanking(v.rankKey, v.valueKey);
          } catch (e) {
            console.warn(`[BACKGROUND] Extraction ${v.label} p${page} échouée:`, e.message);
          }

          if (v.label === 'honor') page === 1 ? (honorP1 = data) : (honorP2 = data);
          else if (v.label === 'xp') page === 1 ? (xpP1 = data) : (xpP2 = data);
          else page === 1 ? (topUserP1 = data) : (topUserP2 = data);

          await randomDelay(2000, 3000);
        }
        await randomDelay(3000, 5000);
      }

      const players = mergeRankings(honorP1, honorP2, xpP1, xpP2, topUserP1, topUserP2);

      await httpRequest('/collect', 'POST', {
        server_id,
        server_name,
        timestamp: new Date().toISOString(),
        players
      });

      completed.push(server_id);
      await sendProgress(server_id, i + 1, 'completed', completed);

      if (i === 0) {
        try {
          await navigateTo(`https://${server_id}.darkorbit.com/indexInternal.es`, true);
          await randomDelay(2000, 3000);
          await scrapeCurrentEvents(server_id);
        } catch (e) {
          console.warn('[BACKGROUND] Scraping événements (premier serveur):', e?.message);
        }
      }

      await randomDelay(10000, 15000);

    } catch (error) {
      console.error(`[BACKGROUND] Erreur ${server_id}:`, error.message);
      await sendError(server_id, 'scraping_error', error.message);
    }
    }

    const finalAction = stoppedByUser ? 'stopped' : 'all_completed';
    await sendProgress(null, accounts.length, finalAction, completed);
    console.log(stoppedByUser ? '[BACKGROUND] Scraping interrompu - fin du cycle' : '[BACKGROUND] Tous les serveurs traités - fin du cycle');
    try {
      await httpRequest('/scraping-done', 'POST', { action: finalAction, completedCount: completed.length });
    } catch (e) {
      console.warn('[BACKGROUND] POST /scraping-done:', e?.message);
    }
  } finally {
    scrapingCycleRunning = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'cookies-expired') {
    const server_id = message.server_id;
    if (server_id) {
      cookiesExpiredReported[server_id] = true;
      console.log('[BACKGROUND] Cookies expirés signalés par content-script pour', server_id);
    }
    return true;
  }
  if (message.type === 'STORE_TOKEN') {
    console.log('[BACKGROUND] STORE_TOKEN reçu');
    chrome.storage.local.set({ authToken: message.token }, () => {
      console.log('[BACKGROUND] Token stocké');
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === 'START_SCRAPING') {
    console.log('[BACKGROUND] START_SCRAPING reçu');
    (async () => {
      try {
        await waitForToken();
        console.log('[BACKGROUND] Démarrage du cycle');
        await runScrapingCycle();
        sendResponse({ success: true });
      } catch (e) {
        console.error('[BACKGROUND] Cycle erreur:', e);
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
  return true;
});
