/**
 * Transitions d'abonnement (FREE ↔ PRO) : Realtime profiles + cold start.
 * Ne s'applique pas aux comptes ADMIN / SUPERADMIN.
 */
(function () {
  'use strict';

  function getStorageKey() {
    var sk = typeof window.APP_KEYS !== 'undefined' && window.APP_KEYS.STORAGE_KEYS ? window.APP_KEYS.STORAGE_KEYS : null;
    return sk ? sk.LAST_PROFILE_SUB_SNAPSHOT : 'darkOrbitLastProfileSubSnapshot';
  }

  function rowFromProfile(p) {
    if (!p) return null;
    return {
      subscription_status: p.subscription_status || 'free',
      badge: p.badge || 'FREE',
      trial_expires_at: p.trial_expires_at || null
    };
  }

  function effectiveConsumerPro(row) {
    if (!row) return false;
    var b = (row.badge || '').toUpperCase();
    if (b === 'ADMIN' || b === 'SUPERADMIN') return false;
    var s = (row.subscription_status || 'free').toLowerCase();
    if (s === 'premium') return true;
    if (s === 'trial') {
      var te = row.trial_expires_at;
      if (te && new Date(te).getTime() > Date.now()) return true;
      return false;
    }
    return false;
  }

  function readSnapshot() {
    if (typeof UnifiedStorage === 'undefined') return null;
    var raw = UnifiedStorage.get(getStorageKey(), null);
    if (!raw || typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function saveSnapshotFromProfile(p) {
    if (typeof UnifiedStorage === 'undefined') return;
    var row = rowFromProfile(p);
    if (!row) return;
    try {
      UnifiedStorage.set(getStorageKey(), JSON.stringify(row));
    } catch (_) {}
  }

  function t(key) {
    if (typeof window.i18nT === 'function') return window.i18nT(key);
    return key;
  }

  function showModal(kind) {
    var modal = document.getElementById('subscriptionStatusModal');
    var titleEl = document.getElementById('subscriptionStatusModalTitle');
    var bodyEl = document.getElementById('subscriptionStatusModalBody');
    var subscribeBtn = document.getElementById('subscriptionStatusModalSubscribe');
    if (!modal || !titleEl || !bodyEl || !subscribeBtn) return;
    if (kind === 'welcome') {
      titleEl.setAttribute('data-i18n', 'sub_transition_welcome_title');
      bodyEl.setAttribute('data-i18n', 'sub_transition_welcome_body');
      titleEl.textContent = t('sub_transition_welcome_title');
      bodyEl.textContent = t('sub_transition_welcome_body');
      subscribeBtn.style.display = 'none';
    } else {
      titleEl.setAttribute('data-i18n', 'sub_transition_expired_title');
      bodyEl.setAttribute('data-i18n', 'sub_transition_expired_body');
      titleEl.textContent = t('sub_transition_expired_title');
      bodyEl.textContent = t('sub_transition_expired_body');
      subscribeBtn.style.display = '';
    }
    if (typeof window.applyTranslations === 'function') {
      try {
        window.applyTranslations();
      } catch (_) {}
    }
    modal.classList.add('sa-modal--open');
  }

  function closeModal() {
    var modal = document.getElementById('subscriptionStatusModal');
    if (modal) modal.classList.remove('sa-modal--open');
  }

  function toastWelcome() {
    if (typeof showToast === 'function') showToast(t('sub_transition_welcome_toast'), 'success');
  }

  function toastExpired() {
    if (typeof showToast === 'function') showToast(t('sub_transition_expired_toast'), 'warning');
  }

  function emitWelcome() {
    toastWelcome();
    showModal('welcome');
  }

  function emitExpired() {
    toastExpired();
    showModal('expired');
  }

  function wireModalButtons() {
    var modal = document.getElementById('subscriptionStatusModal');
    if (!modal || modal.dataset.subscriptionModalWired === '1') return;
    modal.dataset.subscriptionModalWired = '1';
    var closeBtn = document.getElementById('subscriptionStatusModalClose');
    var closeFooterBtn = document.getElementById('subscriptionStatusModalCloseBtn');
    var overlay = modal.querySelector('.sa-modal-overlay');
    var subscribeBtn = document.getElementById('subscriptionStatusModalSubscribe');
    function onClose() {
      closeModal();
    }
    if (closeBtn) closeBtn.addEventListener('click', onClose);
    if (closeFooterBtn) closeFooterBtn.addEventListener('click', onClose);
    if (overlay) overlay.addEventListener('click', onClose);
    if (subscribeBtn) {
      subscribeBtn.addEventListener('click', function () {
        closeModal();
        if (typeof window.SubscriptionCheck !== 'undefined' && typeof window.SubscriptionCheck.goToSubscription === 'function') {
          window.SubscriptionCheck.goToSubscription();
        } else if (typeof window.electronAPI !== 'undefined' && window.electronAPI.navigateToSubscription) {
          window.electronAPI.navigateToSubscription();
        } else {
          window.location.href = 'subscription.html';
        }
      });
    }
  }

  /**
   * Au premier chargement après login : compare le snapshot local au profil DB.
   */
  function checkProfileSubscriptionColdStart() {
    if (typeof BackendAPI === 'undefined' || !BackendAPI.getUserProfile) return;
    wireModalButtons();
    var profile = BackendAPI.getUserProfile();
    if (!profile) return;
    var prev = readSnapshot();
    var nowPro = effectiveConsumerPro(profile);
    if (prev === null) {
      saveSnapshotFromProfile(profile);
      return;
    }
    var wasPro = effectiveConsumerPro(prev);
    if (wasPro && !nowPro) {
      emitExpired();
    } else if (!wasPro && nowPro) {
      emitWelcome();
    }
    saveSnapshotFromProfile(profile);
  }

  /**
   * Après refresh Realtime : le snapshot local reflète l'état avant UPDATE.
   */
  function afterProfileRealtimeRefresh() {
    if (typeof BackendAPI === 'undefined' || !BackendAPI.getUserProfile) return;
    wireModalButtons();
    var prev = readSnapshot();
    var profile = BackendAPI.getUserProfile();
    if (!profile) return;
    if (prev === null) {
      saveSnapshotFromProfile(profile);
      return;
    }
    var wasPro = effectiveConsumerPro(prev);
    var nowPro = effectiveConsumerPro(profile);
    if (wasPro && !nowPro) {
      emitExpired();
    } else if (!wasPro && nowPro) {
      emitWelcome();
    }
    saveSnapshotFromProfile(profile);
  }

  window.ProfileSubscriptionUI = {
    checkProfileSubscriptionColdStart: checkProfileSubscriptionColdStart,
    afterProfileRealtimeRefresh: afterProfileRealtimeRefresh,
    saveSnapshotFromProfile: saveSnapshotFromProfile,
    effectiveConsumerPro: effectiveConsumerPro
  };
})();
