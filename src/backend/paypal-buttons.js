/**
 * Boutons PayPal — Coin supérieur gauche + Booster promo
 * Support : lien PayPal.me | Abonnement : page d’abonnement PayPal hébergée (plan PRO)
 */
(function () {
  'use strict';

  /** Abonnement plan PRO — page hébergée PayPal (navigateur par défaut) */
  var PAYPAL_HOSTED_SUBSCRIBE_URL =
    'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-3GJ89847YV064064ANHCILLQ';

  var PAYPAL_SUBSCRIBE_CONTAINER_ID = 'paypal-button-container-P-3GJ89847YV064064ANHCILLQ';
  var PAYPAL_ME_SUPPORT_URL = 'https://paypal.me/StatsTracker';

  function isSubscriptionPage() {
    var href = typeof window !== 'undefined' && window.location ? (window.location.href || '') : '';
    return href.indexOf('subscription') !== -1;
  }

  function openPayPalProSubscribeUrl() {
    if (typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(PAYPAL_HOSTED_SUBSCRIBE_URL);
    } else {
      window.open(PAYPAL_HOSTED_SUBSCRIBE_URL, '_blank', 'noopener,noreferrer');
    }
  }
  window.openPayPalProSubscribeUrl = openPayPalProSubscribeUrl;

  function updateSubscriptionPageCheckoutButtonLabel() {
    var btn = document.querySelector('#' + PAYPAL_SUBSCRIBE_CONTAINER_ID + ' .paypal-hosted-subscribe-btn');
    if (!btn || typeof window.i18nT !== 'function') return;
    btn.textContent = window.i18nT('passer_pro_btn');
  }

  /** Page subscription.html uniquement : un seul bouton « Passer PRO » → ouverture PayPal */
  function mountHostedSubscribeButton() {
    var el = document.getElementById(PAYPAL_SUBSCRIBE_CONTAINER_ID);
    if (!el || el.querySelector('.paypal-hosted-subscribe-btn')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'paypal-hosted-subscribe-btn';
    btn.setAttribute('data-i18n', 'passer_pro_btn');
    btn.textContent =
      typeof window.i18nT === 'function' ? window.i18nT('passer_pro_btn') : '✨ Passer PRO';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      openPayPalProSubscribeUrl();
    });
    el.appendChild(btn);
  }

  function updatePayPalButtonsVisibility() {
    var container = document.getElementById('paypalButtonsContainer');
    var supportBtn = document.getElementById('supportDeveloperBtnTopLeft');
    var subscribeBlock = document.getElementById('paypalSubscribeBlock');
    var boosterCta = document.getElementById('boosterFreePromoProBtn');
    if (!container) return;

    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';

    if (badge === 'ADMIN' || badge === 'SUPERADMIN') {
      container.style.display = 'none';
      if (typeof closeUpgradeProModal === 'function') closeUpgradeProModal();
      return;
    }

    if (badge !== 'FREE') {
      if (typeof closeUpgradeProModal === 'function') closeUpgradeProModal();
    }

    container.style.display = 'flex';
    if (supportBtn) supportBtn.style.display = badge === 'FREE' || badge === 'PRO' ? '' : 'none';
    if (subscribeBlock) subscribeBlock.style.display = badge === 'FREE' ? '' : 'none';
    if (boosterCta) boosterCta.style.display = badge === 'FREE' ? '' : 'none';
    updateSubscriptionPageCheckoutButtonLabel();
  }

  function openUpgradeProModal() {
    var overlay = document.getElementById('upgradeProModalOverlay');
    var modal = document.getElementById('upgradeProModal');
    if (overlay) {
      overlay.classList.add('active');
      overlay.setAttribute('aria-hidden', 'false');
    }
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeUpgradeProModal() {
    var overlay = document.getElementById('upgradeProModalOverlay');
    var modal = document.getElementById('upgradeProModal');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function initUpgradeProModal() {
    var btn = document.getElementById('upgradeProBtn');
    var overlay = document.getElementById('upgradeProModalOverlay');
    var closeBtn = document.getElementById('upgradeProModalClose');
    if (btn) {
      btn.addEventListener(
        'click',
        function (e) {
          var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
          if (badge !== 'FREE') return;
          e.preventDefault();
          e.stopPropagation();
          openUpgradeProModal();
        },
        true
      );
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
        if (badge !== 'FREE') return;
        e.preventDefault();
        openUpgradeProModal();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeUpgradeProModal();
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeUpgradeProModal);
  }

  window.closeUpgradeProModal = closeUpgradeProModal;
  window.openUpgradeProModal = openUpgradeProModal;

  function initPayPalButtons() {
    var supportBtn = document.getElementById('supportDeveloperBtnTopLeft');
    if (supportBtn) {
      supportBtn.addEventListener('click', function () {
        if (typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(PAYPAL_ME_SUPPORT_URL);
        } else {
          window.open(PAYPAL_ME_SUPPORT_URL, '_blank', 'noopener,noreferrer');
        }
      });
    }
    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
    if (badge === 'FREE' || isSubscriptionPage()) mountHostedSubscribeButton();
    if (!isSubscriptionPage()) updatePayPalButtonsVisibility();
    initUpgradeProModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPayPalButtons);
  } else {
    initPayPalButtons();
  }

  window.addEventListener('permissionsApplied', function () {
    updatePayPalButtonsVisibility();
    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
    if (badge === 'FREE' || isSubscriptionPage()) mountHostedSubscribeButton();
  });
  window.addEventListener('languageChanged', updatePayPalButtonsVisibility);
  window.updatePayPalButtonsVisibility = updatePayPalButtonsVisibility;
})();
