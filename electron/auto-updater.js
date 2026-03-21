// ==========================================
// MISE À JOUR AUTOMATIQUE — electron-updater
// Standard : téléchargement en arrière-plan, install au prochain redémarrage
// Critical : blocage immédiat, modale avec changelog, téléchargement puis restart
// ==========================================

const path = require('path');
const fs = require('fs');
const https = require('https');
const { app } = require('electron');

const CHANGELOG_URL = 'https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json';
const PENDING_UPDATE_FILE = 'update-pending.json';

function getUserDataPath() {
  return app.getPath('userData');
}

function getPendingUpdatePath() {
  return path.join(getUserDataPath(), PENDING_UPDATE_FILE);
}

function setPendingInstall() {
  try {
    fs.writeFileSync(getPendingUpdatePath(), JSON.stringify({ pending: true, at: Date.now() }), 'utf8');
  } catch (e) {
    console.warn('[AutoUpdate] setPendingInstall:', e?.message || e);
  }
}

function clearPendingInstall() {
  try {
    const p = getPendingUpdatePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.warn('[AutoUpdate] clearPendingInstall:', e?.message || e);
  }
}

function hasPendingInstall() {
  try {
    const p = getPendingUpdatePath();
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

/**
 * Compare deux versions semver X.Y.Z (sans préfixe "v").
 * Retourne -1, 0 ou 1 (comme un comparateur sort).
 */
function compareSemver(a, b) {
  const parse = (v) => String(v || '0.0.0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPat !== bPat) return aPat > bPat ? 1 : -1;
  return 0;
}

/**
 * Effectue un unique fetch de changelog.json et retourne l'entrée correspondant
 * à `versionTag`, ainsi que le type de mise à jour ('standard' | 'critical').
 * Un seul appel réseau remplace les anciens getUpdateTypeFromChangelog +
 * getChangelogEntryForVersion qui faisaient chacun une requête séparée.
 */
function fetchChangelogEntry(versionTag) {
  return new Promise((resolve) => {
    const req = https.get(CHANGELOG_URL, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const versions = json && json.versions;
          const v = String(versionTag || '').replace(/^v/, '');
          const entry = Array.isArray(versions)
            ? versions.find((e) => String(e.version || '') === v) || null
            : null;
          resolve({
            entry,
            type: entry && entry.type === 'critical' ? 'critical' : 'standard'
          });
        } catch (_) {
          resolve({ entry: null, type: 'standard' });
        }
      });
    });
    req.on('error', () => resolve({ entry: null, type: 'standard' }));
    req.on('timeout', () => { req.destroy(); resolve({ entry: null, type: 'standard' }); });
  });
}

/** Compatibilité — expose uniquement l'entrée changelog (utilisée dans les exports) */
function getChangelogEntryForVersion(versionTag) {
  return fetchChangelogEntry(versionTag).then(({ entry }) => entry);
}

/**
 * Initialise l'auto-updater et enregistre les handlers.
 * @param {Electron.BrowserWindow} mainWindow - Fenêtre principale (peut être null au moment du check)
 * @param {{ version: string }} pkg - package.json (version courante)
 * @returns {{ checkPendingInstall: () => boolean, setup: () => void } }
 */
function initAutoUpdater(mainWindowRef, pkg) {
  let mainWindow = mainWindowRef;
  const currentVersion = pkg && pkg.version ? String(pkg.version) : '0.0.0';
  const normalizedCurrentVersion = String(currentVersion || '').trim().replace(/^v/, '');

  function send(channel, payload) {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send(channel, payload);
      }
    } catch (_) {}
  }

  function setWindowRef(win) {
    mainWindow = win;
  }

  /** À appeler au tout début (avant createWindow). Retourne true si une install était en attente → l'app va quitter pour installer. */
  function checkPendingInstall() {
    if (!app.isPackaged) return false;
    if (!hasPendingInstall()) return false;
    try {
      const { autoUpdater } = require('electron-updater');
      clearPendingInstall();
      autoUpdater.quitAndInstall(false, true);
      return true;
    } catch (e) {
      console.warn('[AutoUpdate] quitAndInstall on launch:', e?.message || e);
      clearPendingInstall();
      return false;
    }
  }

  let _autoUpdater = null;
  let _isCriticalUpdate = false;

  function startCriticalDownload() {
    if (_autoUpdater) {
      _autoUpdater.downloadUpdate().catch((err) => {
        console.warn('[AutoUpdate] downloadUpdate (critical):', err?.message || err);
        send('update-error', { message: err?.message || 'Erreur téléchargement' });
      });
    }
  }

  function quitAndInstallIfPending() {
    if (!_autoUpdater || !hasPendingInstall()) return false;
    try {
      clearPendingInstall();
      _autoUpdater.quitAndInstall(false, true);
      return true;
    } catch (e) {
      console.warn('[AutoUpdate] quitAndInstall:', e?.message || e);
      return false;
    }
  }

  function setup() {
    if (!app.isPackaged) return;
    try {
      const { autoUpdater } = require('electron-updater');
      _autoUpdater = autoUpdater;
      autoUpdater.autoDownload = false;
      autoUpdater.allowDowngrade = false;

      autoUpdater.on('checking-for-update', () => {
        send('update-checking', {});
      });

      autoUpdater.on('update-available', async (info) => {
        const rawVersion = info.version || '';
        const normalizedIncoming = String(rawVersion || '').trim().replace(/^v/, '');
        // Vérifie avec comparaison semver (major.minor.patch) que l'entrante
        // est strictement supérieure à la version courante, et non juste différente
        // (écarte les downgrades accidentels et les faux-positifs dus au préfixe "v").
        if (!normalizedIncoming || compareSemver(normalizedIncoming, normalizedCurrentVersion) <= 0) {
          send('update-not-available', {});
          return;
        }
        const version = normalizedIncoming;
        // Un seul appel réseau pour récupérer type ET entrée changelog.
        const { type: updateType, entry: changelogEntry } = await fetchChangelogEntry(version);

        if (updateType === 'critical') {
          _isCriticalUpdate = true;
          send('update-critical-available', {
            version,
            changelog: changelogEntry,
            releaseNotes: info.releaseNotes
          });
        } else {
          autoUpdater.autoDownload = true;
          send('update-available', { version });
          autoUpdater.downloadUpdate().catch((err) => {
            console.warn('[AutoUpdate] downloadUpdate:', err?.message || err);
            send('update-error', { message: err?.message || 'Erreur téléchargement' });
          });
        }
      });

      autoUpdater.on('update-not-available', () => {
        send('update-not-available', {});
      });

      autoUpdater.on('download-progress', (progress) => {
        send('update-download-progress', {
          percent: progress.percent || 0,
          bytesPerSecond: progress.bytesPerSecond || 0,
          transferred: progress.transferred || 0,
          total: progress.total || 0
        });
      });

      autoUpdater.on('update-downloaded', (info) => {
        const version = info.version || '';
        send('update-downloaded', { version });
        if (_isCriticalUpdate) {
          _isCriticalUpdate = false;
          // Signal au renderer pour afficher un message "Installation en cours..."
          // avant que l'app se ferme. setImmediate laisse le temps au renderer
          // de traiter l'événement avant que quitAndInstall ferme la fenêtre.
          send('update:installing', { version });
          setImmediate(() => {
            try {
              autoUpdater.quitAndInstall(true, true);
            } catch (e) {
              console.warn('[AutoUpdate] quitAndInstall (critical):', e?.message || e);
            }
          });
        } else {
          setPendingInstall();
        }
      });

      autoUpdater.on('error', (err) => {
        console.warn('[AutoUpdate]', err?.message || err);
        send('update-error', { message: err?.message || 'Erreur' });
      });

      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.warn('[AutoUpdate] checkForUpdates:', err?.message || err);
          send('update-error', { message: err?.message || 'Erreur inconnue' });
        });
      }, 5000);
    } catch (e) {
      console.warn('[AutoUpdate] setup:', e?.message || e);
    }
  }

  function checkNow() {
    if (!_autoUpdater) return;
    try {
      _autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[AutoUpdate] manual checkForUpdates:', err?.message || err);
        send('update-error', { message: err?.message || 'Erreur inconnue' });
      });
    } catch (e) {
      console.warn('[AutoUpdate] manual checkForUpdates (sync):', e?.message || e);
    }
  }

  return {
    setWindowRef,
    checkPendingInstall,
    setup,
    startCriticalDownload,
    quitAndInstallIfPending,
    getChangelogEntryForVersion,
    hasPendingInstall,
    setPendingInstall,
    clearPendingInstall,
    CHANGELOG_URL,
    checkNow
  };
}

module.exports = {
  initAutoUpdater,
  hasPendingInstall,
  getPendingUpdatePath,
  setPendingInstall,
  clearPendingInstall,
  getChangelogEntryForVersion,
  CHANGELOG_URL
};
