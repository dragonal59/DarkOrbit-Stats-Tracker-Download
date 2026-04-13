// ==========================================
// MISE À JOUR AUTOMATIQUE — electron-updater
// Vérification + téléchargement silencieux ; la modale post-téléchargement est gérée par le renderer.
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

function compareSemver(a, b) {
  const parse = (v) => String(v || '0.0.0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
  if (aMin !== bMin) return aMin > bMin ? 1 : -1;
  if (aPat !== bPat) return aPat > bPat ? 1 : -1;
  return 0;
}

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
          const rawType = entry && entry.type ? String(entry.type).toLowerCase() : 'standard';
          const isCritical = rawType === 'critical' || rawType === 'hotfix';
          resolve({
            entry,
            type: rawType,
            isCritical,
          });
        } catch (_) {
          resolve({ entry: null, type: 'standard', isCritical: false });
        }
      });
    });
    req.on('error', () => resolve({ entry: null, type: 'standard', isCritical: false }));
    req.on('timeout', () => { req.destroy(); resolve({ entry: null, type: 'standard', isCritical: false }); });
  });
}

function getChangelogEntryForVersion(versionTag) {
  return fetchChangelogEntry(versionTag).then(({ entry }) => entry);
}

function initAutoUpdater(mainWindowRef, pkg) {
  let mainWindow = mainWindowRef;
  const currentVersion = pkg && pkg.version ? String(pkg.version) : '0.0.0';
  const normalizedCurrentVersion = String(currentVersion || '').trim().replace(/^v/, '');
  const PERIODIC_CHECK_MS = 30 * 60 * 1000;
  const AUTO_INSTALL_DELAY_MS = 1500;
  let _periodicCheckTimer = null;

  /** @type {{ version: string, changelogEntry: object|null, releaseType: string, isCritical: boolean } | null} */
  let _pendingUpdateInfo = null;

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

  function quitAndInstallNow() {
    if (!_autoUpdater) return false;
    try {
      clearPendingInstall();
      _autoUpdater.quitAndInstall(false, true);
      return true;
    } catch (e) {
      console.warn('[AutoUpdate] quitAndInstallNow:', e?.message || e);
      return false;
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

  /**
   * @param {Electron.BrowserWindow | null} browserWindow — fenêtre principale (FIX 3 : vérif MAJ au ready-to-show)
   */
  function setup(browserWindow) {
    if (!app.isPackaged) return;
    try {
      const { autoUpdater } = require('electron-updater');
      _autoUpdater = autoUpdater;
      autoUpdater.autoDownload = false;
      autoUpdater.allowDowngrade = false;

      autoUpdater.on('checking-for-update', () => {
        /* silencieux : pas d’émission vers le renderer pour la vérif auto */
      });

      autoUpdater.on('update-available', async (info) => {
        const rawVersion = info.version || '';
        const normalizedIncoming = String(rawVersion || '').trim().replace(/^v/, '');
        if (!normalizedIncoming || compareSemver(normalizedIncoming, normalizedCurrentVersion) <= 0) {
          send('update-not-available', {});
          return;
        }
        const version = normalizedIncoming;
        const { entry: changelogEntry, type: releaseType, isCritical } = await fetchChangelogEntry(version);

        _pendingUpdateInfo = {
          version,
          changelogEntry,
          releaseType,
          isCritical,
        };

        try {
          await autoUpdater.downloadUpdate();
        } catch (err) {
          console.warn('[AutoUpdate] downloadUpdate:', err?.message || err);
          _pendingUpdateInfo = null;
          send('update-error', { message: err?.message || 'Erreur téléchargement' });
        }
      });

      autoUpdater.on('update-not-available', () => {
        send('update-not-available', {});
      });

      autoUpdater.on('download-progress', () => {
        /* silencieux : aucune UI pendant le téléchargement */
      });

      autoUpdater.on('update-downloaded', (info) => {
        const version = (info && info.version) ? String(info.version).replace(/^v/, '') : '';
        const p = _pendingUpdateInfo || {};
        const finalVersion = p.version || version;
        send('update-ready-to-install', {
          version: finalVersion,
          changelogEntry: p.changelogEntry != null ? p.changelogEntry : null,
          releaseType: p.releaseType || 'standard',
          isCritical: !!p.isCritical,
        });
        setPendingInstall();
        _pendingUpdateInfo = null;
        setTimeout(() => {
          try {
            if (_autoUpdater) _autoUpdater.quitAndInstall(false, true);
          } catch (e) {
            console.warn('[AutoUpdate] auto quitAndInstall:', e?.message || e);
          }
        }, AUTO_INSTALL_DELAY_MS);
      });

      autoUpdater.on('error', (err) => {
        console.warn('[AutoUpdate]', err?.message || err);
        send('update-error', { message: err?.message || 'Erreur' });
      });

      // FIX 3 — vérification réseau après que la fenêtre principale soit prête à s’afficher (plus fiable qu’un délai fixe)
      const runInitialCheck = () => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.warn('[AutoUpdate] checkForUpdates:', err?.message || err);
          send('update-error', { message: err?.message || 'Erreur inconnue' });
        });
      };
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.once('ready-to-show', runInitialCheck);
      } else {
        runInitialCheck();
      }
      if (_periodicCheckTimer) clearInterval(_periodicCheckTimer);
      _periodicCheckTimer = setInterval(() => {
        if (!_autoUpdater) return;
        _autoUpdater.checkForUpdates().catch((err) => {
          console.warn('[AutoUpdate] periodic checkForUpdates:', err?.message || err);
        });
      }, PERIODIC_CHECK_MS);
    } catch (e) {
      console.warn('[AutoUpdate] setup:', e?.message || e);
    }
  }

  function checkNow() {
    if (!_autoUpdater) {
      if (!app.isPackaged) {
        setImmediate(() => {
          send('update-not-available', { reason: 'not_packaged' });
        });
      } else {
        console.warn('[AutoUpdate] checkNow: auto-updater non initialisé (build installé)');
        send('update-error', {
          message: 'Mise à jour automatique indisponible (configuration).',
        });
      }
      return;
    }
    try {
      _autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[AutoUpdate] manual checkForUpdates:', err?.message || err);
        send('update-error', { message: err?.message || 'Erreur inconnue' });
      });
    } catch (e) {
      console.warn('[AutoUpdate] manual checkForUpdates (sync):', e?.message || e);
      send('update-error', { message: e?.message || String(e) });
    }
  }

  return {
    setWindowRef,
    checkPendingInstall,
    setup,
    quitAndInstallIfPending,
    quitAndInstallNow,
    getChangelogEntryForVersion,
    hasPendingInstall,
    setPendingInstall,
    clearPendingInstall,
    CHANGELOG_URL,
    checkNow,
  };
}

module.exports = {
  initAutoUpdater,
  hasPendingInstall,
  getPendingUpdatePath,
  setPendingInstall,
  clearPendingInstall,
  getChangelogEntryForVersion,
  CHANGELOG_URL,
};
