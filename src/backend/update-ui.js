// ==========================================
// Mises à jour : modale post-téléchargement, badge persistant, premier lancement
// ==========================================

(function () {
  'use strict';

  if (typeof window.electronAppUpdater === 'undefined') return;

  function t(key, fallback) {
    if (typeof window.i18nT === 'function') {
      var s = window.i18nT(key);
      if (s && s !== key) return s;
    }
    return fallback || key;
  }

  function showToast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
    } else if (typeof Logger !== 'undefined') {
      Logger.info('[Update]', message);
    }
  }

  function getAckKey() {
    try {
      return (window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.LAST_APP_VERSION_ACK) || 'doStatsTracker_appVersionLastAcked';
    } catch (_) {
      return 'doStatsTracker_appVersionLastAcked';
    }
  }

  function renderChangelogHtml(entry) {
    if (!entry || !entry.changes) return '';
    var html = '';
    if (entry.changes.nouveautés && entry.changes.nouveautés.length) {
      html += '<p class="update-changelog-section"><strong>' + t('update_cl_new', 'Nouveautés') + '</strong></p><ul>';
      entry.changes.nouveautés.forEach(function (s) {
        html += '<li>' + escapeHtml(String(s)) + '</li>';
      });
      html += '</ul>';
    }
    if (entry.changes.améliorations && entry.changes.améliorations.length) {
      html += '<p class="update-changelog-section"><strong>' + t('update_cl_improve', 'Améliorations') + '</strong></p><ul>';
      entry.changes.améliorations.forEach(function (s) {
        html += '<li>' + escapeHtml(String(s)) + '</li>';
      });
      html += '</ul>';
    }
    if (entry.changes.corrections && entry.changes.corrections.length) {
      html += '<p class="update-changelog-section"><strong>' + t('update_cl_fixes', 'Corrections') + '</strong></p><ul>';
      entry.changes.corrections.forEach(function (s) {
        html += '<li>' + escapeHtml(String(s)) + '</li>';
      });
      html += '</ul>';
    }
    return html || '<p>' + t('update_changelog_empty', 'Aucun détail.') + '</p>';
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function releaseTypeLabel(releaseType) {
    var rt = String(releaseType || 'standard').toLowerCase();
    if (rt === 'major') return t('update_release_type_major', 'Mise à jour majeure');
    if (rt === 'hotfix') return t('update_release_type_hotfix', 'Correctif (hotfix)');
    if (rt === 'critical') return t('update_release_type_critical', 'Mise à jour critique');
    return t('update_release_type_standard', 'Mise à jour standard');
  }

  var state = {
    pending: null,
    modalEl: null,
    badgeEl: null,
    dismissedVersion: null,
  };

  function sessionDismissKey(version) {
    try {
      return 'updateModalDismissed_' + String(version || '');
    } catch (_) {
      return 'updateModalDismissed';
    }
  }

  function isDismissedThisSession(version) {
    try {
      return sessionStorage.getItem(sessionDismissKey(version)) === '1';
    } catch (_) {
      return false;
    }
  }

  function markDismissedThisSession(version) {
    try {
      sessionStorage.setItem(sessionDismissKey(version), '1');
    } catch (_) {}
  }

  function clearDismissedSession(version) {
    try {
      sessionStorage.removeItem(sessionDismissKey(version));
    } catch (_) {}
  }

  function ensureBadge() {
    if (state.badgeEl && document.body.contains(state.badgeEl)) return state.badgeEl;
    var el = document.createElement('button');
    el.type = 'button';
    el.id = 'update-ready-badge';
    el.className = 'update-ready-badge';
    el.setAttribute('aria-label', t('update_badge_ready', 'Mise à jour prête'));
    el.innerHTML = '<span class="update-ready-badge-dot"></span><span class="update-ready-badge-text">' +
      escapeHtml(t('update_badge_ready', 'Mise à jour prête')) + '</span>';
    el.style.cssText = 'display:none;position:fixed;bottom:16px;left:16px;z-index:99990;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;border:1px solid var(--border,#333);background:var(--bg-primary,#1a1a2e);color:var(--text,#eee);font-size:12px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.35);';
    el.addEventListener('click', function () {
      if (state.pending) {
        clearDismissedSession(state.pending.version);
        showReadyModal(state.pending, false);
      }
    });
    document.body.appendChild(el);
    state.badgeEl = el;
    return el;
  }

  function showBadge() {
    var b = ensureBadge();
    b.style.display = 'flex';
  }

  function hideBadge() {
    if (state.badgeEl) state.badgeEl.style.display = 'none';
  }

  function closeModal() {
    if (state.modalEl && state.modalEl.parentNode) {
      state.modalEl.remove();
    }
    state.modalEl = null;
    document.removeEventListener('keydown', onModalKeydown);
  }

  function onModalKeydown(ev) {
    if (ev.key === 'Escape' && state.modalEl && state.pending && !state.pending.isCritical) {
      ev.preventDefault();
      onLater();
    }
  }

  function onLater() {
    if (!state.pending) return closeModal();
    markDismissedThisSession(state.pending.version);
    closeModal();
    showBadge();
    try {
      window.dispatchEvent(new CustomEvent('update-flow:dismissed', { detail: { version: state.pending.version } }));
    } catch (_) {}
  }

  async function onInstall() {
    var up = window.electronAppUpdater;
    if (!up || typeof up.checkBlockingOperations !== 'function' || typeof up.quitAndInstall !== 'function') return;
    var block = await up.checkBlockingOperations();
    if (block && block.blocking) {
      var ok = window.confirm(t('update_scan_blocking_confirm',
        'Un scan ou une opération longue est en cours. Elle sera interrompue si vous fermez l’application pour installer la mise à jour. Continuer ?'));
      if (!ok) return;
      var r2 = await up.quitAndInstallConfirmed();
      if (!r2 || !r2.ok) showToast(t('update_install_error', 'Installation impossible.'), 'error');
      return;
    }
    var r = await up.quitAndInstall();
    if (!r || !r.ok) showToast(t('update_install_error', 'Installation impossible.'), 'error');
  }

  function showReadyModal(data, allowBackdropClose) {
    closeModal();
    var isCrit = !!data.isCritical;
    var overlay = document.createElement('div');
    overlay.className = 'update-ready-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;padding:16px;';
    var vLabel = 'v' + String(data.version || '').replace(/^v/, '');
    var typeLine = releaseTypeLabel(data.releaseType);
    var changelogHtml = data.changelogEntry ? renderChangelogHtml(data.changelogEntry) : '<p>' + t('update_changelog_unavailable', 'Notes de version indisponibles (réseau ou fichier changelog).') + '</p>';

    var critHint = '';
    if (isCrit) {
      critHint = '<p class="update-ready-critical-hint">' +
        (String(data.releaseType || '').toLowerCase() === 'hotfix'
          ? t('update_hotfix_why', 'Ce correctif doit être installé rapidement pour corriger un problème important.')
          : t('update_critical_why', 'Cette mise à jour critique corrige un problème de sécurité ou de stabilité important.')) +
        '</p>';
    }

    var buttonsHtml = isCrit
      ? '<button type="button" class="sa-btn update-ready-btn-install" id="update-ready-install-only">' + escapeHtml(t('update_install_now', 'Installer maintenant')) + '</button>'
      : '<button type="button" class="account-about-btn-secondary" id="update-ready-later">' + escapeHtml(t('update_later', 'Plus tard')) + '</button>' +
        '<button type="button" class="sa-btn update-ready-btn-install" id="update-ready-install">' + escapeHtml(t('update_install_relaunch', 'Installer et relancer')) + '</button>';

    overlay.innerHTML =
      '<div class="update-ready-modal" style="background:var(--bg-primary,#1a1a2e);border:1px solid var(--border,#333);border-radius:12px;max-width:520px;max-height:85vh;overflow:auto;padding:20px 22px;">' +
      '<h2 style="margin:0 0 8px 0;font-size:1.15rem;">' + escapeHtml(t('update_modal_title', 'Mise à jour prête')) + '</h2>' +
      '<p style="margin:0 0 6px 0;opacity:0.95;">' + escapeHtml(t('update_modal_version', 'Nouvelle version :')) + ' <strong>' + escapeHtml(vLabel) + '</strong></p>' +
      '<p style="margin:0 0 12px 0;font-size:0.9rem;opacity:0.85;">' + escapeHtml(typeLine) + '</p>' +
      critHint +
      '<div class="update-ready-changelog" style="margin:12px 0 16px 0;font-size:0.9rem;line-height:1.45;">' + changelogHtml + '</div>' +
      '<p style="margin:0 0 12px 0;font-size:0.8rem;opacity:0.75;">' + escapeHtml(t('update_restart_hint', 'L’installation fermera et relancera l’application (pas le redémarrage du PC).')) + '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;">' + buttonsHtml + '</div>' +
      '</div>';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && allowBackdropClose && !isCrit) {
        onLater();
      }
    });

    document.body.appendChild(overlay);
    state.modalEl = overlay;

    var btnInstall = document.getElementById('update-ready-install');
    var btnInstallOnly = document.getElementById('update-ready-install-only');
    var btnLater = document.getElementById('update-ready-later');
    if (btnInstall) btnInstall.addEventListener('click', onInstall);
    if (btnInstallOnly) btnInstallOnly.addEventListener('click', onInstall);
    if (btnLater) btnLater.addEventListener('click', onLater);

    if (!isCrit) {
      document.addEventListener('keydown', onModalKeydown);
    }
  }

  function onUpdateReady(data) {
    state.pending = data;
    hideBadge();
    try {
      window.dispatchEvent(new CustomEvent('update-flow:ready', { detail: data }));
    } catch (_) {}

    if (data.isCritical) {
      showReadyModal(data, false);
      return;
    }
    if (isDismissedThisSession(data.version)) {
      showBadge();
      return;
    }
    showReadyModal(data, true);
  }

  function init() {
    window.electronAppUpdater.onUpdateReadyToInstall(onUpdateReady);

    window.electronAppUpdater.onUpdateError(function (data) {
      showToast(t('update_error_prefix', 'Erreur mise à jour :') + ' ' + (data && data.message ? data.message : ''), 'error');
    });

    window.getUpdateFlowPending = function () { return state.pending; };
    window.showUpdateReadyModalFromBadge = function () {
      if (state.pending) {
        clearDismissedSession(state.pending.version);
        showReadyModal(state.pending, !state.pending.isCritical);
      }
    };
  }

  function showWhatsNewIfNeeded() {
    try {
      var legacyKey = 'doStatsTracker_changelogSeenVersion';
      var k = getAckKey();
      if (!localStorage.getItem(k) && localStorage.getItem(legacyKey)) {
        localStorage.setItem(k, String(localStorage.getItem(legacyKey)).replace(/^v/, ''));
      }
    } catch (_) {}
    if (typeof window.electronApp === 'undefined' || typeof window.electronApp.getVersion !== 'function') return;
    window.electronApp.getVersion().then(function (v) {
      var current = String(v || '').trim().replace(/^v/, '');
      if (!current) return;
      var key = getAckKey();
      var last = '';
      try {
        last = localStorage.getItem(key) || '';
      } catch (_) {}
      if (last === current) return;

      var url = 'https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json';
      fetch(url).then(function (r) { return r.json(); }).then(function (json) {
        var versions = json && json.versions;
        if (!Array.isArray(versions)) return;
        var entry = versions.find(function (e) { return String(e.version || '') === current; });
        if (!entry) {
          try { localStorage.setItem(key, current); } catch (_) {}
          return;
        }
        var overlay = document.createElement('div');
        overlay.className = 'update-whatsnew-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99997;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:16px;';
        var title = t('update_whats_new_title', 'Nouveautés de la version') + ' v' + current;
        overlay.innerHTML =
          '<div class="update-whatsnew-modal" style="background:var(--bg-primary,#1a1a2e);border:1px solid var(--border,#333);border-radius:12px;max-width:480px;max-height:80vh;overflow:auto;padding:20px;">' +
          '<h3 style="margin-top:0;">' + escapeHtml(title) + '</h3>' +
          '<div>' + renderChangelogHtml(entry) + '</div>' +
          '<button type="button" class="sa-btn" style="margin-top:16px;" id="update-whatsnew-ok">' + escapeHtml(t('update_whats_new_cta', 'C’est parti !')) + '</button>' +
          '</div>';
        document.body.appendChild(overlay);
        document.getElementById('update-whatsnew-ok').addEventListener('click', function () {
          try { localStorage.setItem(key, current); } catch (_) {}
          overlay.remove();
        });
      }).catch(function () {
        try { localStorage.setItem(key, current); } catch (_) {}
      });
    }).catch(function () {});
  }

  function renderChangelogHtmlExport(entry) {
    return renderChangelogHtml(entry);
  }
  window.renderChangelogHtml = renderChangelogHtmlExport;

  function showChangelogPopup(title, entry, onClose) {
    var div = document.createElement('div');
    div.className = 'update-changelog-popup-overlay';
    div.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';
    div.innerHTML =
      '<div class="update-changelog-popup" style="background:var(--bg-primary,#1a1a2e);border:1px solid var(--border,#333);border-radius:12px;max-width:480px;max-height:80vh;overflow:auto;padding:20px;">' +
      '<h3 style="margin-top:0;">' + escapeHtml(title) + '</h3>' +
      '<div class="update-changelog-popup-body">' + (entry ? renderChangelogHtml(entry) : '') + '</div>' +
      '<button type="button" class="update-changelog-popup-close" style="margin-top:16px;padding:8px 16px;">' + escapeHtml(t('close', 'Fermer')) + '</button>' +
      '</div>';
    div.querySelector('.update-changelog-popup-close').addEventListener('click', function () {
      if (typeof onClose === 'function') onClose();
      div.remove();
    });
    document.body.appendChild(div);
  }
  window.showChangelogPopup = showChangelogPopup;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      setTimeout(showWhatsNewIfNeeded, 2000);
    });
  } else {
    init();
    setTimeout(showWhatsNewIfNeeded, 2000);
  }
})();
