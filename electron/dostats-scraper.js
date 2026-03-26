const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

const {
  getRateLimitDelayMs,
  getTimeoutMs,
  getRetries,
  getServerConcurrency,
  getUserAgentString,
  applyScraperSessionProxyPolicy,
} = require('./scraper-app-settings');

const DOSTATS_BASE_URL = 'https://dostats.info/hall-of-fame';

const GROUPS = {
  g1_europe_countries: ['de2', 'de4', 'es1', 'fr1', 'pl3'],
  g2_europe_global: ['int1', 'int5', 'int7', 'int11', 'int14'],
  g3_global_pve: ['gbl1', 'gbl2', 'gbl3', 'gbl4', 'gbl5'],
  g4_east: ['ru1', 'ru5', 'tr3', 'tr4', 'tr5'],
  g5_america: ['int2', 'int6', 'mx1', 'us2', 'usa2'],
};

const PERIODS = [
  { duration: null, key: 'current' },
  { duration: 1, key: 'last_24h' },
  { duration: 7, key: 'last_7d' },
  { duration: 30, key: 'last_30d' },
  { duration: 90, key: 'last_90d' },
  { duration: 365, key: 'last_365d' },
];

/** Serveurs récents sans données 365 jours — on ne scrape pas last_365d pour eux */
const SERVERS_SKIP_365 = ['gbl5'];

// Libellé affiché (FR/EN, DOSTATS) → code serveur — pour filtrer les entrées par serveur
const SERVER_LABEL_TO_CODE = {
  'Allemagne 2': 'de2', 'Germany 2': 'de2',
  'Allemagne 4': 'de4', 'Germany 4': 'de4',
  'Espagne 1': 'es1', 'Spain 1': 'es1',
  'France 1': 'fr1',
  'Global PvE': 'gbl1', 'Global PvE 1': 'gbl1',
  'Global 2 (Ganymede)': 'gbl2', 'Global PvE 2': 'gbl2',
  'Global 3 (Titan)': 'gbl3', 'Global PvE 3': 'gbl3',
  'Global 4': 'gbl4',
  'Global 4 (Europa)': 'gbl4', 'Global PvE 4': 'gbl4',
  'Global 5 (Callisto)': 'gbl5', 'Global 5 (Steam)': 'gbl5', 'Global PvE 5': 'gbl5', 'GBL5': 'gbl5', 'gbl5': 'gbl5',
  'Europe Global 1': 'int1', 'Global Europe 1': 'int1',
  'Europe Global 2': 'int5', 'Global Europe 2': 'int5',
  'Europe Global 3': 'int7', 'Global Europe 3': 'int7',
  'Europe Global 5': 'int11', 'Global Europe 5': 'int11',
  'Europe Global 7': 'int14', 'Global Europe 7': 'int14',
  'Amérique Global 1': 'int2', 'Global America 1': 'int2',
  'Amérique Global 2': 'int6', 'Global America 2': 'int6',
  'Mexique 1': 'mx1', 'Mexico 1': 'mx1',
  'Pologne 3': 'pl3', 'Poland 3': 'pl3',
  'Russie 1': 'ru1', 'Russia 1': 'ru1',
  'Russie 5': 'ru5', 'Russia 5': 'ru5',
  'Turquie 3': 'tr3', 'Turkey 3': 'tr3',
  'Turquie 4': 'tr4', 'Turkey 4': 'tr4',
  'Turquie 5': 'tr5', 'Turkey 5': 'tr5',
  'USA 2 (Côte Ouest)': 'us2', 'USA 2 (West Coast)': 'us2',
  'USA West': 'us2', 'USA 2': 'us2',
};

// Param names and values: lowercase (server, type, duration) — aligné avec les URLs DOSTATS
const TYPES = [
  { param: 'topuser', key: 'top_user' },
  { param: 'experience', key: 'experience' },
  { param: 'honor', key: 'honor' },
  { param: 'ships', key: 'ship_kills' },
  { param: 'aliens', key: 'alien_kills' },
];

function getOutputBaseDir() {
  const userData = app.getPath('userData');
  const dir = path.join(userData, 'rankings_output', 'hall_of_fame');
  fs.mkdirSync(dir, { recursive: true });

  const migratedFlagPath = path.join(userData, '.rankings_migrated');
  if (!fs.existsSync(migratedFlagPath)) {
    const oldRoot = path.join(app.getPath('documents'), 'DarkOrbit Tracker - v2.5');
    const oldDir = path.join(oldRoot, 'rankings_output', 'hall_of_fame');
    const destEmpty = !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
    if (destEmpty && fs.existsSync(oldDir)) {
      try {
        copyDirRecursive(oldDir, dir);
      } catch (e) {
        console.warn('[dostats-scraper] Migration ancien classement:', e?.message || e);
      }
    }
    try {
      fs.writeFileSync(migratedFlagPath, '1', 'utf8');
    } catch (_) {}
  }

  return dir;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getNowIso() {
  return new Date().toISOString();
}

function sanitizeFilenameSegment(s) {
  return String(s || '')
    .replace(/[:]/g, '-')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

function buildOutputPath(serverCode, typeKey, periodKey, scrapedAtIso) {
  const base = getOutputBaseDir();
  const folderServer = serverCode || 'all_servers';
  const dir = path.join(base, folderServer, typeKey, periodKey);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${typeKey}_${periodKey}.json`;
  return path.join(dir, file);
}

function writeJsonFile(targetPath, payload) {
  const tmp = `${targetPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, targetPath);
}

async function createDostatsWindow() {
  // Session isolée par fenêtre : plusieurs scrapes IPC en parallèle partageaient le même
  // stockage par défaut et pouvaient se gêner (chargements / cookies / état DOSTATS).
  const partition = `temp:dostats-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      partition,
    },
  });
  win.webContents.setUserAgent(getUserAgentString());
  await applyScraperSessionProxyPolicy(win.webContents.session);
  return win;
}

async function loadUrl(win, url) {
  return new Promise((resolve) => {
    const wc = win.webContents;
    let settled = false;
    let timeout = null;
    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      wc.removeListener('did-finish-load', onFinish);
      wc.removeListener('did-fail-load', onFail);
    };
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };
    const onFinish = () => {
      settle(true);
    };
    const onFail = () => {
      settle(false);
    };
    timeout = setTimeout(() => {
      settle(false);
    }, getTimeoutMs());
    wc.once('did-finish-load', onFinish);
    wc.once('did-fail-load', onFail);
    win.loadURL(url).catch(() => {
      settle(false);
    });
  });
}

/** Attend que le tableau Hall of Fame (avec lignes de données) soit rendu. */
async function waitForHallOfFameTable(win, maxWaitMs = 25000) {
  // Petit délai initial pour laisser le temps au tableau de se rendre,
  // puis polling toutes les 500 ms (≈ 0,5 s par check).
  await new Promise((r) => setTimeout(r, 500));
  const pollInterval = 500;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const ready = await win.webContents.executeJavaScript(`
        (function(){
          var tables = document.querySelectorAll('table');
          for (var i = 0; i < tables.length; i++) {
            var rows = tables[i].querySelectorAll('tr');
            if (rows.length < 5) continue;
            var firstDataRow = rows[1];
            if (!firstDataRow) continue;
            var cells = firstDataRow.querySelectorAll('td');
            if (cells.length >= 5) return true;
          }
          return false;
        })();
      `);
      if (ready) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return false;
}

/**
 * Attend qu'au moins un lien profil DOSTATS soit présent (SPA React : tableau visible mais liens en retard).
 */
async function waitForHallOfFamePlayerLinks(win, maxWaitMs = 20000) {
  await new Promise((r) => setTimeout(r, 300));
  const pollInterval = 400;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const ready = await win.webContents.executeJavaScript(`
        (function(){
          var links = document.querySelectorAll('table a[href*="player"]');
          for (var i = 0; i < links.length; i++) {
            var h = (links[i].getAttribute('href') || '').toLowerCase();
            if (h.indexOf('/player/') !== -1) return true;
          }
          return false;
        })();
      `);
      if (ready) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return false;
}

async function extractHallOfFame(win, meta) {
  const js = `(function(){
    function text(el){ return el ? (el.textContent || '').trim() : ''; }
    function toInt(str){
      if (!str) return null;
      var cleaned = (str + '').replace(/[^0-9]/g,'');
      if (!cleaned) return null;
      try { return parseInt(cleaned, 10); } catch(e){ return null; }
    }
    /** Firme : texte dans la cellule ou logo DOStats (React : souvent <img> sans texte). */
    function companyFromCell(cell){
      if (!cell) return null;
      var raw = text(cell);
      if (raw) {
        var u = raw.toUpperCase();
        if (/^(MMO|EIC|VRU)$/.test(u)) return u;
        var m = raw.match(/\\b(MMO|EIC|VRU)\\b/i);
        if (m) return m[1].toUpperCase();
      }
      var imgs = cell.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var im = imgs[i];
        var alt = (im.getAttribute('alt') || '').trim();
        if (/^(MMO|EIC|VRU)$/i.test(alt)) return alt.toUpperCase();
        var src = (im.getAttribute('src') || '').toLowerCase();
        if (src.indexOf('avatar') !== -1 || src.indexOf('profile') !== -1) continue;
        if (src.indexOf('mmo') !== -1) return 'MMO';
        if (src.indexOf('eic') !== -1) return 'EIC';
        if (src.indexOf('vru') !== -1) return 'VRU';
      }
      return null;
    }
    /** Détecte les index de colonnes depuis la ligne d'en-tête (# / Name / Company / Server / Points). */
    function columnIndicesFromHeaderRow(tr){
      var cells = tr.querySelectorAll('th, td');
      if (cells.length < 5) return null;
      var headers = [];
      for (var i = 0; i < cells.length; i++) {
        headers.push(text(cells[i]).toLowerCase());
      }
      var idx = { rank: 0, name: 1, company: 2, server: 3, points: 4 };
      var found = 0;
      for (var h = 0; h < headers.length; h++) {
        var lab = headers[h];
        if (lab === '#' || /^#\\s*$/.test(lab)) { idx.rank = h; found++; }
        else if (lab === 'name' || lab.indexOf('player') !== -1) { idx.name = h; found++; }
        else if (lab.indexOf('company') !== -1 || lab.indexOf('faction') !== -1 || lab.indexOf('firme') !== -1) { idx.company = h; found++; }
        else if (lab.indexOf('server') !== -1 || lab.indexOf('world') !== -1) { idx.server = h; found++; }
        else if (lab.indexOf('point') !== -1 || lab === 'honor' || lab === 'experience' || lab.indexOf('top user') !== -1 || lab.indexOf('kills') !== -1 || lab.indexOf('aliens') !== -1) { idx.points = h; found++; }
      }
      if (found >= 2) return idx;
      return null;
    }
    try {
      var table = null;
      var tables = document.querySelectorAll('table');
      for (var t = 0; t < tables.length; t++) {
        var r = tables[t].querySelectorAll('tr');
        if (r.length >= 5) {
          var cells = r[1] ? r[1].querySelectorAll('td') : [];
          if (cells.length >= 5) { table = tables[t]; break; }
        }
      }
      if (!table) return { ok:false, entries:[] };
      var allRows = Array.from(table.querySelectorAll('tr'));
      var colIdx = null;
      if (allRows.length > 0) colIdx = columnIndicesFromHeaderRow(allRows[0]);
      var dataRows = allRows.slice(1);
      var out = [];
      dataRows.forEach(function(tr){
        var cells = tr.querySelectorAll('td');
        if (!cells || cells.length < 5) return;
        var rankI = colIdx ? colIdx.rank : 0;
        var nameI = colIdx ? colIdx.name : 1;
        var companyI = colIdx ? colIdx.company : 2;
        var serverI = colIdx ? colIdx.server : 3;
        var pointsI = colIdx ? colIdx.points : 4;
        if (cells.length <= Math.max(rankI, nameI, companyI, serverI, pointsI)) return;
        var rank = toInt(text(cells[rankI]));
        var nameCell = cells[nameI];
        var link = null;
        for (var ci = 0; ci < cells.length; ci++) {
          var cell = cells[ci];
          if (!cell) continue;
          var a = cell.querySelector('a[href*="player"]');
          if (a) { link = a; break; }
        }
        var name = link ? text(link) : text(nameCell);
        // DOStats affiche parfois "Pseudo's Stats" (libellé UI) au lieu du pseudo brut.
        // On retire uniquement le suffixe terminal "'s Stats" (insensible à la casse, tolère espaces).
        if (name) {
          name = String(name).replace(/\s*'s\s+stats\s*$/i, '').trim();
        }
        var href = link ? (link.getAttribute('href') || '') : '';
        var userId = null;
        if (href) {
          var m = href.match(/\\/player\\/([^/?#]+)/) || href.match(/player\\/([^/?#]+)/i);
          if (m) {
            try { userId = decodeURIComponent(m[1]); } catch(e2) { userId = m[1]; }
          }
        }
        var company = companyFromCell(cells[companyI]);
        var serverLabel = text(cells[serverI]) || null;
        var points = toInt(text(cells[pointsI]));
        if (!rank && !name && !points) return;
        var h0 = text(cells[0]).trim();
        var h1 = text(cells[1] || '').trim();
        if (h0 === '#' && /^name$/i.test(h1)) return;
        out.push({
          rank: rank || null,
          name: name || null,
          user_id: userId,
          company: company || null,
          server_code: null,
          server_label: serverLabel,
          points: points
        });
      });
      return { ok:true, entries: out };
    } catch(e){
      return { ok:false, entries:[], error: e && e.message ? e.message : String(e) };
    }
  })()`;
  const res = await win.webContents.executeJavaScript(js);
  const entries = Array.isArray(res?.entries) ? res.entries : [];
  const metaOut = {
    type: meta.typeKey,
    period: meta.periodKey,
    server_code: meta.serverCode || null,
    server_label: meta.serverLabel || null,
    scraped_at: meta.scrapedAt,
    source_url: meta.url,
    total_entries: entries.length,
    page: 1,
    pages_total: 1,
  };
  return { meta: metaOut, entries };
}

async function checkDostatsHealth(serverCode, typeKey, periodKey) {
  const requestedServer = (serverCode || '').toString().trim().toLowerCase() || 'gbl5';
  const type = (typeKey || '').toString().trim() || 'honor';
  const period = (periodKey || '').toString().trim() || 'current';
  const typeDef = TYPES.find((t) => t.key === type) || TYPES.find((t) => t.key === 'honor');
  const periodDef = PERIODS.find((p) => p.key === period) || PERIODS.find((p) => p.key === 'current');

  let win = null;
  try {
    win = await createDostatsWindow();
    const params = new URLSearchParams();
    if (requestedServer) params.set('server', requestedServer.toLowerCase());
    if (typeDef.param) params.set('type', typeDef.param);
    if (periodDef.duration != null) params.set('duration', String(periodDef.duration));
    const url = `${DOSTATS_BASE_URL}?${params.toString()}`;
    const ok = await loadUrl(win, url);
    if (!ok) {
      return { ok: false, count: 0, url };
    }
    await waitForHallOfFameTable(win);
    const scrapedAt = getNowIso();
    const meta = {
      typeKey: typeDef.key,
      periodKey: periodDef.key,
      serverCode: requestedServer,
      serverLabel: null,
      scrapedAt,
      url,
    };
    const data = await extractHallOfFame(win, meta);
    data.entries.forEach((e) => {
      if (e.server_code) return;
      const code = SERVER_LABEL_TO_CODE[e.server_label]
        || (/^[a-z]{2,4}\d+$/i.test(e.server_label) ? (e.server_label || '').toLowerCase() : null);
      if (code) e.server_code = code;
    });
    const filtered = data.entries.filter((e) => entryServerCode(e) === requestedServer);
    return { ok: true, count: filtered.length, url };
  } catch (e) {
    return { ok: false, count: 0, error: e?.message || String(e) };
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
}

async function measureDostatsLatency(serverCode, typeKey, periodKey, attempts) {
  const requestedServer = (serverCode || '').toString().trim().toLowerCase() || 'gbl5';
  const type = (typeKey || '').toString().trim() || 'honor';
  const period = (periodKey || '').toString().trim() || 'current';
  const typeDef = TYPES.find((t) => t.key === type) || TYPES.find((t) => t.key === 'honor');
  const periodDef = PERIODS.find((p) => p.key === period) || PERIODS.find((p) => p.key === 'current');
  const count = Number.isFinite(attempts) && attempts > 0 ? Math.min(Math.max(Math.round(attempts), 1), 20) : 5;

  let win = null;
  const durations = [];
  let wroteQuickTestHoF = false;

  try {
    win = await createDostatsWindow();

    for (let i = 0; i < count; i++) {
      const params = new URLSearchParams();
      if (requestedServer) params.set('server', requestedServer.toLowerCase());
      if (typeDef.param) params.set('type', typeDef.param);
      if (periodDef.duration != null) params.set('duration', String(periodDef.duration));
      const url = `${DOSTATS_BASE_URL}?${params.toString()}`;

      const start = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const ok = await loadUrl(win, url);
      const end = Date.now();
      durations.push(ok ? end - start : null);

      // Même fichier JSON HoF que le scrape complet (attendu par l’UI / getLatestRanking).
      if (i === 0 && ok && !wroteQuickTestHoF) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await waitForHallOfFameTable(win, 20000);
          const scrapedAt = getNowIso();
          const meta = {
            typeKey: typeDef.key,
            periodKey: periodDef.key,
            serverCode: requestedServer,
            serverLabel: null,
            scrapedAt,
            url,
          };
          // eslint-disable-next-line no-await-in-loop
          const data = await extractHallOfFame(win, meta);
          writeHallOfFameJsonForServer(requestedServer, typeDef, periodDef, scrapedAt, data);
          wroteQuickTestHoF = true;
        } catch (e) {
          console.warn('[dostats-scraper] Test rapide (latence): écriture HoF ignorée:', e?.message || e);
        }
      }
    }

    const valid = durations.filter((d) => typeof d === 'number' && d >= 0);
    if (!valid.length) {
      return {
        ok: false,
        error: 'Aucune mesure valide (chargements échoués).',
        server: requestedServer,
        type,
        period,
        attempts: count,
      };
    }

    const sum = valid.reduce((acc, v) => acc + v, 0);
    const avg = sum / valid.length;
    const min = Math.min(...valid);
    const max = Math.max(...valid);

    return {
      ok: true,
      server: requestedServer,
      type,
      period,
      attempts: count,
      successful: valid.length,
      avgMs: avg,
      minMs: min,
      maxMs: max,
    };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
      server: requestedServer,
      type,
      period,
      attempts: count,
    };
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
}

/**
 * Mesure latence DOSTATS (comme `measureDostatsLatency`) et, en plus,
 * récupère une liste de user_id depuis le top Hall of Fame du premier chargement
 * puis lance un scraping profils après la boucle (fenêtre HoF fermée : évite les conflits entre BrowserWindow).
 */
async function measureDostatsLatencyAndScanProfiles(serverCode, typeKey, periodKey, attempts, profilesToScan, profilesConcurrency, mainWindowRef) {
  const requestedServer = (serverCode || '').toString().trim().toLowerCase() || 'gbl5';
  const type = (typeKey || '').toString().trim() || 'honor';
  const period = (periodKey || '').toString().trim() || 'current';
  const typeDef = TYPES.find((t) => t.key === type) || TYPES.find((t) => t.key === 'honor');
  const periodDef = PERIODS.find((p) => p.key === period) || PERIODS.find((p) => p.key === 'current');

  const count = Number.isFinite(attempts) && attempts > 0 ? Math.min(Math.max(Math.round(attempts), 1), 20) : 5;
  const scanCount = Number.isFinite(profilesToScan) ? Math.max(0, Math.min(Math.round(profilesToScan), 5)) : 1;
  const scanConcurrency = Number.isFinite(profilesConcurrency) ? Math.max(1, Math.min(Math.round(profilesConcurrency), 10)) : 1;

  let win = null;
  const durations = [];
  let scannedUserIds = [];

  console.log('[dostats-scraper] Test rapide (+ profils): démarrage', {
    server: requestedServer,
    type,
    period,
    latencyAttempts: count,
    scanCount,
    scanConcurrency,
    logToWindow: !!(mainWindowRef && !mainWindowRef.isDestroyed?.()),
  });

  try {
    win = await createDostatsWindow();

    for (let i = 0; i < count; i++) {
      const params = new URLSearchParams();
      if (requestedServer) params.set('server', requestedServer.toLowerCase());
      if (typeDef.param) params.set('type', typeDef.param);
      if (periodDef.duration != null) params.set('duration', String(periodDef.duration));
      const url = `${DOSTATS_BASE_URL}?${params.toString()}`;

      const start = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const ok = await loadUrl(win, url);
      const end = Date.now();
      durations.push(ok ? end - start : null);

      // 1 seul chargement HoF pour récupérer des user_id (top du tableau)
      if (i === 0 && ok && scanCount > 0) {
        try {
          await waitForHallOfFameTable(win, 20000);
          await waitForHallOfFamePlayerLinks(win, 20000);
          const scrapedAt = getNowIso();
          const meta = {
            typeKey: typeDef.key,
            periodKey: periodDef.key,
            serverCode: requestedServer,
            serverLabel: null,
            scrapedAt,
            url,
          };
          const data = await extractHallOfFame(win, meta);
          const idsOnRequestedServer = [];
          const idsAnyServer = [];
          for (const e of data.entries || []) {
            if (!e || !e.user_id) continue;
            const uid = String(e.user_id).trim();
            if (!uid) continue;
            if (!idsAnyServer.includes(uid)) idsAnyServer.push(uid);
            // Priorité aux IDs du serveur demandé
            if (entryServerCode(e) === requestedServer && !idsOnRequestedServer.includes(uid)) {
              idsOnRequestedServer.push(uid);
            }
            if (idsOnRequestedServer.length >= scanCount) break;
          }
          // Fallback robuste : si aucun ID ne match le serveur (labels DOSTATS variables),
          // on prend quand même le top HoF global pour produire un profil test JSON.
          scannedUserIds = idsOnRequestedServer.length > 0
            ? idsOnRequestedServer.slice(0, scanCount)
            : idsAnyServer.slice(0, scanCount);
          try {
            writeHallOfFameJsonForServer(requestedServer, typeDef, periodDef, scrapedAt, data);
          } catch (e) {
            console.warn('[dostats-scraper] Test rapide (+ profils): écriture HoF ignorée:', e?.message || e);
          }
          console.log('[dostats-scraper] Test rapide: entrées HoF=', (data.entries || []).length, 'user_id à scanner=', scannedUserIds);
        } catch (e) {
          console.warn('[dostats-scraper] Test rapide: extraction user_id HoF échouée:', e?.message || e);
        }
      }
    }

    const valid = durations.filter((d) => typeof d === 'number' && d >= 0);
    if (!valid.length) {
      return {
        ok: false,
        error: 'Aucune mesure valide (chargements échoués).',
        server: requestedServer,
        type,
        period,
        attempts: count,
      };
    }

    // Fermer la fenêtre HoF avant les profils : plusieurs loadURL + fenêtres cachées en parallèle faisaient échouer le scrape profil.
    if (win && !win.isDestroyed()) {
      win.destroy();
      win = null;
    }

    let profileResult = null;
    if (scannedUserIds.length > 0) {
      try {
        console.log('[dostats-scraper] Test rapide: lancement scrape profils pour', scannedUserIds.join(', '));
        // eslint-disable-next-line global-require
        const { runDostatsProfilesScraper } = require('./dostats-profile-scraper');
        profileResult = await runDostatsProfilesScraper({
          serverCode: requestedServer,
          userIds: scannedUserIds,
          mainWindowRef: mainWindowRef || null,
          concurrency: scanConcurrency,
        });
        console.log('[dostats-scraper] Test rapide: profils terminés', profileResult);
      } catch (e) {
        console.warn('[dostats-scraper] Test rapide: scrape profils exception:', e?.message || e);
        profileResult = null;
      }
    } else {
      console.warn('[dostats-scraper] Test rapide: aucun user_id HoF — pas de scrape profil');
    }

    const sum = valid.reduce((acc, v) => acc + v, 0);
    const avg = sum / valid.length;
    const min = Math.min(...valid);
    const max = Math.max(...valid);

    // Résumé "profil test" (galaxy_gates) si on a scanné au moins un user_id.
    var profileTest = null;
    if (Array.isArray(scannedUserIds) && scannedUserIds.length > 0) {
      try {
        var profilesDir = path.join(app.getPath('userData'), 'rankings_output', 'player_profiles');
        var filePath = path.join(profilesDir, `${requestedServer}.json`);
        if (fs.existsSync(filePath)) {
          var rawProfiles = fs.readFileSync(filePath, 'utf8');
          var json = JSON.parse(rawProfiles);
          var entries = Array.isArray(json?.entries) ? json.entries : [];
          var targetUid = scannedUserIds[0];
          var entry = entries.find(function (e) { return String(e?.user_id || '') === String(targetUid); }) || null;
          if (entry) {
            var gates = entry.galaxy_gates || {};
            var gatesEntries = Object.entries(gates);
            var nonNull = gatesEntries.filter(function (kv) { return kv && kv.length === 2 && kv[1] != null; });
            var nonNullCount = nonNull.length;
            var nonNullObject = {};
            nonNull.forEach(function (kv) { nonNullObject[kv[0]] = kv[1]; });
            profileTest = {
              user_id: entry.user_id,
              name: entry.name || null,
              level: entry.level || null,
              grade: entry.grade || null,
              nonNullGalaxyGatesCount: nonNullCount,
              nonNullGalaxyGates: nonNullObject,
              galaxyGatesParseDebug: entry.galaxy_gates_parse_debug || null,
            };
          }
        }
      } catch (_) {
        profileTest = null;
      }
    }

    return {
      ok: true,
      server: requestedServer,
      type,
      period,
      attempts: count,
      successful: valid.length,
      avgMs: avg,
      minMs: min,
      maxMs: max,
      scannedUserIds,
      profileScrape: profileResult ? { ok: profileResult.ok, writtenCount: profileResult.writtenCount } : null,
      profileTest,
    };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
      server: requestedServer,
      type,
      period,
      attempts: count,
    };
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
}

/**
 * Filtre les entrées par serveur et écrit le JSON HoF (même chemin que le scrape complet).
 * Utilisé par fetchHallOfFameForServer et par le test rapide latence DOSTATS.
 */
function writeHallOfFameJsonForServer(serverCode, typeDef, periodDef, scrapedAt, data) {
  if (!data || !data.meta || !Array.isArray(data.entries)) return null;
  if (data.entries.length > 0 && !data.meta.server_label) {
    const labelGuess = serverCode ? serverCode.toUpperCase() : 'All Servers';
    data.meta.server_label = labelGuess;
  }
  const requestedServer = (serverCode || '').toString().trim().toLowerCase();
  data.entries.forEach((e) => {
    if (e.server_code) return;
    const code =
      SERVER_LABEL_TO_CODE[e.server_label] ||
      (/^[a-z]{2,4}\d+$/i.test(e.server_label) ? (e.server_label || '').toLowerCase() : null);
    if (code) e.server_code = code;
  });
  data.entries = data.entries.filter((e) => entryServerCode(e) === requestedServer);
  data.meta.total_entries = data.entries.length;
  const outPath = buildOutputPath(serverCode, typeDef.key, periodDef.key, scrapedAt);
  writeJsonFile(outPath, data);
  return outPath;
}

async function fetchHallOfFameForServer(win, serverCode, typeDef, periodDef) {
  const params = new URLSearchParams();
  if (serverCode) params.set('server', serverCode.toLowerCase());
  if (typeDef.param) params.set('type', typeDef.param);
  if (periodDef.duration != null) params.set('duration', String(periodDef.duration));
  const url = `${DOSTATS_BASE_URL}?${params.toString()}`;
  const ok = await loadUrl(win, url);
  if (!ok) {
    return null;
  }
  await waitForHallOfFameTable(win);
  const scrapedAt = getNowIso();
  const meta = {
    typeKey: typeDef.key,
    periodKey: periodDef.key,
    serverCode,
    serverLabel: null,
    scrapedAt,
    url,
  };
  const data = await extractHallOfFame(win, meta);
  const outPath = writeHallOfFameJsonForServer(serverCode, typeDef, periodDef, scrapedAt, data);
  return { path: outPath, count: data.entries.length, url };
}

async function runDostatsRankingScraper(options = {}) {
  const groupId = options.groupId || null;
  const serverCode = options.serverCode || null;
  const serverCodes = Array.isArray(options.serverCodes) ? options.serverCodes : null;
  const mainWindowRef = options.mainWindowRef || null;

  let servers = [];
  if (serverCodes && serverCodes.length) {
    servers = [...new Set(serverCodes.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean))];
  } else if (serverCode) {
    servers = [String(serverCode).toLowerCase()];
  } else if (groupId && GROUPS[groupId]) {
    servers = GROUPS[groupId];
  } else {
    return { ok: false, error: groupId ? `Groupe inconnu: ${groupId}` : 'Indiquez groupId, serverCode ou serverCodes.' };
  }
  if (!servers.length) {
    return { ok: false, error: 'Aucun serveur à scraper.' };
  }

  const sendLog = (type, message, server = null, extra = null) => {
    if (mainWindowRef?.webContents && !mainWindowRef.isDestroyed()) {
      const payload = {
        type,
        server: server != null ? server : (servers.length === 1 ? servers[0] : null),
        message,
        at: getNowIso(),
      };
      if (extra && typeof extra === 'object') {
        Object.assign(payload, extra);
      }
      mainWindowRef.webContents.send('dostats:log', payload);
    }
  };

  const TYPE_LABEL_FR = {
    top_user: 'top utilisateur',
    experience: 'expérience',
    honor: 'honneur',
    ship_kills: 'vaisseaux détruits',
    alien_kills: 'aliens vaincus',
  };
  const PERIOD_LABEL_FR = {
    current: 'actuel',
    last_24h: '24 h',
    last_7d: '7 j',
    last_30d: '30 j',
    last_90d: '90 j',
    last_365d: '365 j',
  };

  function formatFailureFragments(failures) {
    return failures.map((f) => {
      const srv = (f.serverCode || '').toString().toUpperCase();
      const t = TYPE_LABEL_FR[f.type] || f.type;
      const p = PERIOD_LABEL_FR[f.period] || f.period;
      return `[${srv}] ${t} · ${p}`;
    });
  }

  function sendRankingsBatchStats(serverStatsMap) {
    const list = [];
    serverStatsMap.forEach((v, server) => {
      list.push({
        server,
        successDelta: v.ok,
        errorDelta: v.fail,
      });
    });
    if (!list.length) return;
    sendLog('info', '', null, {
      silent: true,
      metric_type: 'rankings_batch_stats',
      servers: list,
    });
  }

  function waitIfPaused() {
    return new Promise((resolve) => {
      const check = () => {
        if (typeof global.scraperShouldStop === 'boolean' && global.scraperShouldStop) {
          resolve();
          return;
        }
        if (typeof global.scraperPaused === 'boolean' && global.scraperPaused) {
          setTimeout(check, 400);
          return;
        }
        resolve();
      };
      check();
    });
  }

  try {
    sendLog('info', 'Récupération des classements…', null, { metric_type: 'rankings_batch_start' });
    const results = [];
    const failures = [];
    const serverStats = new Map();
    const bump = (srv, ok) => {
      const k = (srv || '').toString().trim().toLowerCase();
      if (!k) return;
      if (!serverStats.has(k)) serverStats.set(k, { ok: 0, fail: 0 });
      const s = serverStats.get(k);
      if (ok) s.ok += 1;
      else s.fail += 1;
    };
    const serverConcurrency = getServerConcurrency();
    let index = 0;
    while (index < servers.length) {
      const batch = servers.slice(index, index + serverConcurrency);
      index += serverConcurrency;
      // Une fenêtre par serveur du batch : une seule WebContents ne peut charger qu’une URL à la fois ;
      // partager une fenêtre entre Promise.all provoquait des courses (0 entrées / faux négatifs).
      // eslint-disable-next-line no-await-in-loop
      const wins =
        batch.length === 1
          ? [await createDostatsWindow()]
          : await Promise.all(batch.map(() => createDostatsWindow()));
      try {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(
          batch.map(async (srvCode, i) => {
            const win = wins[i];
            if (!win || win.isDestroyed()) return;
            try {
              for (const typeDef of TYPES) {
                for (const periodDef of PERIODS) {
                  if (periodDef.key === 'last_365d' && SERVERS_SKIP_365.includes(srvCode)) continue;
                  await waitIfPaused();
                  if (typeof global.scraperShouldStop === 'boolean' && global.scraperShouldStop) {
                    return;
                  }
                  let r = null;
                  const maxRetries = getRetries();
                  let attempt = 0;
                  // eslint-disable-next-line no-constant-condition
                  while (true) {
                    // eslint-disable-next-line no-await-in-loop
                    r = await fetchHallOfFameForServer(win, srvCode, typeDef, periodDef);
                    if (r || attempt >= maxRetries) break;
                    attempt += 1;
                  }
                  /** Pause additionnelle après chaque chargement (ms) — valeur du slider, toujours appliquée si > 0. */
                  const rateLimitPauseMs = getRateLimitDelayMs();
                  if (r) results.push({ serverCode: srvCode, type: typeDef.key, period: periodDef.key, ...r });
                  const count = r ? r.count : 0;
                  if (r && count > 0) {
                    bump(srvCode, true);
                  } else {
                    bump(srvCode, false);
                    failures.push({ serverCode: srvCode, type: typeDef.key, period: periodDef.key });
                  }
                  if (rateLimitPauseMs > 0) {
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((resolve) => setTimeout(resolve, rateLimitPauseMs));
                  }
                }
              }
            } catch (err) {
              console.warn('[dostats-scraper] Erreur scrape serveur', srvCode, err?.message || err);
            }
          }),
        );
      } finally {
        wins.forEach((w) => {
          if (w && !w.isDestroyed()) w.destroy();
        });
      }
      if (typeof global.scraperShouldStop === 'boolean' && global.scraperShouldStop) {
        sendRankingsBatchStats(serverStats);
        if (failures.length > 0) {
          const parts = formatFailureFragments(failures);
          const maxShow = 12;
          const shown = parts.slice(0, maxShow);
          const more = parts.length > maxShow ? ` (… +${parts.length - maxShow})` : '';
          sendLog('warning', `Certains classements n’ont pas été extraits : ${shown.join(', ')}${more}.`, null, {
            metric_type: 'rankings_summary',
            symbol: 'cross',
          });
        }
        sendLog('info', 'Scraping DOSTATS arrêté par l’utilisateur.');
        return { ok: true, groupId, resultsCount: results.length, results, stopped: true };
      }
    }
    sendRankingsBatchStats(serverStats);
    if (failures.length === 0) {
      sendLog('success', 'Tous les classements ont été extraits', null, {
        metric_type: 'rankings_summary',
        symbol: 'check',
      });
    } else {
      const parts = formatFailureFragments(failures);
      const maxShow = 12;
      const shown = parts.slice(0, maxShow);
      const more = parts.length > maxShow ? ` (… +${parts.length - maxShow})` : '';
      sendLog('warning', `Certains classements n’ont pas été extraits : ${shown.join(', ')}${more}.`, null, {
        metric_type: 'rankings_summary',
        symbol: 'cross',
      });
    }
    return { ok: true, groupId, resultsCount: results.length, results };
  } catch (e) {
    sendLog('error', `Erreur scraping DOSTATS: ${e?.message || String(e)}`);
    return { ok: false, error: e?.message || 'Erreur scraping DOSTATS' };
  }
}

/**
 * Retourne le code serveur d'une entrée (entry.server_code ou déduit de server_label).
 */
function entryServerCode(entry) {
  const code = (entry && entry.server_code) ? String(entry.server_code).trim().toLowerCase() : null;
  if (code) return code;
  const label = (entry && entry.server_label) ? String(entry.server_label).trim() : '';
  if (!label) return null;
  const fromMap = SERVER_LABEL_TO_CODE[label];
  if (fromMap) return fromMap;
  if (/^[a-z]{2,4}\d+$/i.test(label)) return label.toLowerCase();
  return null;
}

function getRankingBaseDirs() {
  const userDataBase = path.join(app.getPath('userData'), 'rankings_output', 'hall_of_fame');
  const documentsBase = path.join(app.getPath('documents'), 'DarkOrbit Tracker - v2.5', 'rankings_output', 'hall_of_fame');
  return [userDataBase, documentsBase];
}

/**
 * Lit le dernier fichier JSON scrapé pour server/type/période et retourne { meta, entries } ou null.
 * Cherche d'abord dans userData, puis en secours dans Documents (ancien emplacement).
 * Filtre toujours les entrées pour n'afficher que les joueurs du serveur demandé (serverCode).
 */
function getLatestRanking(serverCode, typeKey, periodKey) {
  const requested = (serverCode || '').toString().trim().toLowerCase();
  const type = (typeKey || '').toString().trim() || 'honor';
  const period = (periodKey || '').toString().trim() || 'current';
  const subPath = path.join(requested || '', type, period);
  const bases = getRankingBaseDirs();

  for (const base of bases) {
    const dir = path.join(base, subPath);
    const filePath = path.join(dir, `${type}_${period}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        const meta = data?.meta ?? null;
        let entries = Array.isArray(data?.entries) ? data.entries : [];
        if (requested && entries.length > 0) {
          entries = entries.filter((e) => entryServerCode(e) === requested);
        }
        return meta ? { meta: { ...meta, total_entries: entries.length }, entries } : null;
      } catch (e) {
        continue;
      }
    }
  }
  return null;
}

module.exports = {
  DOSTATS_GROUPS: GROUPS,
  runDostatsRankingScraper,
  getLatestRanking,
  checkDostatsHealth,
  measureDostatsLatency,
  measureDostatsLatencyAndScanProfiles,
};

