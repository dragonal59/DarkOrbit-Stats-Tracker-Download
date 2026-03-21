// ==========================================
// UI des mises à jour (barre de progression, notification, modale critique)
// ==========================================

(function () {
  'use strict';

  if (typeof window.electronAppUpdater === 'undefined') return;

  const CHANGELOG_SEEN_KEY = 'doStatsTracker_changelogSeenVersion';

  function showToast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
    } else {
      Logger.info('[Update]', message);
    }
  }

  function renderChangelogHtml(entry) {
    if (!entry || !entry.changes) return '';
    var html = '';
    if (entry.changes.nouveautés && entry.changes.nouveautés.length) {
      html += '<p class="update-changelog-section"><strong>Nouveautés</strong></p><ul>';
      entry.changes.nouveautés.forEach(function (s) {
        html += '<li>' + escapeHtml(String(s)) + '</li>';
      });
      html += '</ul>';
    }
    if (entry.changes.améliorations && entry.changes.améliorations.length) {
      html += '<p class="update-changelog-section"><strong>Améliorations</strong></p><ul>';
      entry.changes.améliorations.forEach(function (s) {
        html += '<li>' + escapeHtml(String(s)) + '</li>';
      });
      html += '</ul>';
    }
    if (entry.changes.corrections && entry.changes.corrections.length) {
      html += '<p class="update-changelog-section"><strong>Corrections</strong></p><ul>';
      entry.changes.corrections.forEach(function (s) {
        html += '<li>' + escapeHtml(String(s)) + '</li>';
      });
      html += '</ul>';
    }
    return html || '<p>Aucun détail.</p>';
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function ensureUpdateUIElements() {
    var overlay = document.getElementById('update-critical-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'update-critical-overlay';
      overlay.className = 'update-critical-overlay';
      overlay.innerHTML =
        '<div class="update-critical-modal">' +
        '  <h2 class="update-critical-title">Mise à jour critique requise</h2>' +
        '  <p class="update-critical-version"></p>' +
        '  <div class="update-critical-changelog"></div>' +
        '  <div class="update-critical-progress-wrap" style="display:none;">' +
        '    <div class="update-critical-progress-bar"><div class="update-critical-progress-fill"></div></div>' +
        '    <p class="update-critical-progress-text">Téléchargement… 0 %</p>' +
        '  </div>' +
        '  <button type="button" class="update-critical-btn" id="update-critical-download-btn">Télécharger et installer</button>' +
        '</div>';
      overlay.style.cssText = 'display:none; position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.85); align-items:center; justify-content:center;';
      document.body.appendChild(overlay);
    }
    var progressBar = document.getElementById('update-standard-progress');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.id = 'update-standard-progress';
      progressBar.className = 'update-standard-progress';
      progressBar.innerHTML = '<div class="update-standard-progress-bar"><div class="update-standard-progress-fill"></div></div><span class="update-standard-progress-label">Mise à jour…</span>';
      progressBar.style.cssText = 'display:none; position:fixed; bottom:16px; right:16px; z-index:9999; background:var(--bg-primary, #1a1a2e); border:1px solid var(--border, #333); border-radius:8px; padding:10px 14px; font-size:12px; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      document.body.appendChild(progressBar);
    }
    return { overlay, progressBar };
  }

  function showCriticalModal(data) {
    var el = ensureUpdateUIElements();
    var overlay = el.overlay;
    var versionEl = overlay.querySelector('.update-critical-version');
    var changelogEl = overlay.querySelector('.update-critical-changelog');
    var progressWrap = overlay.querySelector('.update-critical-progress-wrap');
    var progressFill = overlay.querySelector('.update-critical-progress-fill');
    var progressText = overlay.querySelector('.update-critical-progress-text');
    var btn = document.getElementById('update-critical-download-btn');
    if (versionEl) versionEl.textContent = 'Version ' + (data.version || '');
    if (changelogEl) changelogEl.innerHTML = data.changelog ? renderChangelogHtml(data.changelog) : '<p>Chargement des détails…</p>';
    progressWrap.style.display = 'none';
    btn.style.display = '';
    btn.disabled = false;
    btn.textContent = 'Télécharger et installer';
    overlay.style.display = 'flex';

    btn.onclick = function () {
      btn.disabled = true;
      btn.textContent = 'Téléchargement en cours…';
      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      progressText.textContent = 'Téléchargement… 0 %';
      if (window.electronAppUpdater && window.electronAppUpdater.startCriticalDownload) {
        window.electronAppUpdater.startCriticalDownload();
      }
    };
  }

  function updateCriticalProgress(percent, text) {
    var overlay = document.getElementById('update-critical-overlay');
    if (!overlay) return;
    var fill = overlay.querySelector('.update-critical-progress-fill');
    var textEl = overlay.querySelector('.update-critical-progress-text');
    if (fill) fill.style.width = (percent || 0) + '%';
    if (textEl) textEl.textContent = text || 'Téléchargement… ' + (percent || 0) + ' %';
  }

  function showStandardProgress(percent, label) {
    var wrap = document.getElementById('update-standard-progress');
    if (!wrap) return;
    var fill = wrap.querySelector('.update-standard-progress-fill');
    var labelEl = wrap.querySelector('.update-standard-progress-label');
    if (fill) fill.style.width = (percent || 0) + '%';
    if (labelEl) labelEl.textContent = label || 'Mise à jour… ' + (percent || 0) + ' %';
    wrap.style.display = '';
  }

  function hideStandardProgress() {
    var wrap = document.getElementById('update-standard-progress');
    if (wrap) wrap.style.display = 'none';
  }

  function init() {
    ensureUpdateUIElements();

    window.electronAppUpdater.onUpdateAvailable(function (data) {
      showStandardProgress(0, 'Téléchargement de la mise à jour…');
    });

    window.electronAppUpdater.onDownloadProgress(function (p) {
      var percent = Math.round(p.percent || 0);
      showStandardProgress(percent, 'Téléchargement… ' + percent + ' %');
    });

    window.electronAppUpdater.onUpdateDownloaded(function (data) {
      hideStandardProgress();
      showToast('Mise à jour prête — elle sera installée au prochain redémarrage.', 'success');
    });

    window.electronAppUpdater.onUpdateError(function (data) {
      hideStandardProgress();
      showToast('Erreur mise à jour : ' + (data && data.message ? data.message : 'inconnue'), 'error');
    });

    window.electronAppUpdater.onCriticalAvailable(function (data) {
      showCriticalModal(data);
      window.electronAppUpdater.onDownloadProgress(function (p) {
        var percent = Math.round(p.percent || 0);
        updateCriticalProgress(percent, 'Téléchargement… ' + percent + ' %');
      });
    });

    window.electronAppUpdater.onInstalling(function (data) {
      var version = data && data.version ? ' ' + data.version : '';

      // Met à jour la modale critique si elle est ouverte
      var overlay = document.getElementById('update-critical-overlay');
      if (overlay && overlay.style.display !== 'none') {
        var btn = document.getElementById('update-critical-download-btn');
        var progressText = overlay.querySelector('.update-critical-progress-text');
        var progressFill = overlay.querySelector('.update-critical-progress-fill');
        var progressWrap = overlay.querySelector('.update-critical-progress-wrap');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Installation en cours…';
        }
        if (progressWrap) progressWrap.style.display = 'block';
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = 'Installation en cours — l\'application va redémarrer…';
      }

      // Toast visible partout (même si la modale est fermée ou absente)
      showToast(
        'Mise à jour' + version + ' en cours d\'installation — l\'application va redémarrer…',
        'info'
      );
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---- Popup changelog post-update (première ouverture de cette version)
  function checkPostUpdateChangelog() {
    try {
      var current = typeof window.electronApp !== 'undefined' ? null : null;
      if (typeof window.electronApp !== 'undefined') {
        window.electronApp.getVersion().then(function (v) {
          var currentVersion = (v || '').trim();
          var seen = localStorage.getItem(CHANGELOG_SEEN_KEY) || '';
          if (currentVersion && currentVersion !== seen) {
            fetch('https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json')
              .then(function (r) { return r.json(); })
              .then(function (json) {
                var versions = json && json.versions;
                if (!Array.isArray(versions)) return;
                var entry = versions.find(function (e) { return String(e.version || '') === currentVersion.replace(/^v/, ''); });
                if (!entry) return;
                showChangelogPopup('Nouveautés de la version ' + currentVersion, entry, function onClose() {
                  try { localStorage.setItem(CHANGELOG_SEEN_KEY, currentVersion); } catch (_) {}
                });
              })
              .catch(function () {});
          }
        });
      }
    } catch (e) {}
  }

  function showChangelogPopup(title, entry, onClose) {
    var div = document.createElement('div');
    div.className = 'update-changelog-popup-overlay';
    div.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    div.innerHTML =
      '<div class="update-changelog-popup" style="background:var(--bg-primary,#1a1a2e);border:1px solid var(--border,#333);border-radius:12px;max-width:480px;max-height:80vh;overflow:auto;padding:20px;">' +
      '<h3 style="margin-top:0;">' + escapeHtml(title) + '</h3>' +
      '<div class="update-changelog-popup-body">' + (entry ? renderChangelogHtml(entry) : '') + '</div>' +
      '<button type="button" class="update-changelog-popup-close" style="margin-top:16px;padding:8px 16px;">Fermer</button>' +
      '</div>';
    div.querySelector('.update-changelog-popup-close').onclick = function () {
      if (typeof onClose === 'function') onClose();
      div.remove();
    };
    document.body.appendChild(div);
  }

  window.showChangelogPopup = showChangelogPopup;
  window.renderChangelogHtml = renderChangelogHtml;

  setTimeout(checkPostUpdateChangelog, 2000);
})();
