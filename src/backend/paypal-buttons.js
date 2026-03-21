/**
 * Boutons PayPal — Coin supérieur gauche + Booster promo
 * Support : lien PayPal.me | Abonnement : SDK PayPal (plan PRO)
 */
(function () {
  'use strict';

  var PAYPAL_CLIENT_ID = (typeof window !== 'undefined' && window.PAYPAL_CONFIG && window.PAYPAL_CONFIG.clientId) ? window.PAYPAL_CONFIG.clientId : '';
  var PAYPAL_PLAN_ID = (typeof window !== 'undefined' && window.PAYPAL_CONFIG && window.PAYPAL_CONFIG.planId) ? window.PAYPAL_CONFIG.planId : '';
  var _buttonsRendered = false;
  var _nextCloverClickOpensPayPal = false;

  function isSubscriptionPage() {
    var href = typeof window !== 'undefined' && window.location ? (window.location.href || '') : '';
    return href.indexOf('subscription') !== -1;
  }

  function updatePayPalButtonsVisibility() {
    var container = document.getElementById('paypalButtonsContainer');
    var supportBtn = document.getElementById('supportDeveloperBtnTopLeft');
    var subscribeBlock = document.getElementById('paypalSubscribeBlock');
    var subscribeWrap = document.getElementById('paypalSubscribeContainer');
    var boosterWrap = document.getElementById('paypalSubscribeContainerBooster');
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
    if (boosterWrap) boosterWrap.style.display = badge === 'FREE' ? '' : 'none';
  }

  function renderPayPalButtons() {
    if (typeof paypal === 'undefined') return;
    if (_buttonsRendered) return;

    var style = { shape: 'rect', color: 'blue', layout: 'vertical', label: 'subscribe', height: 40 };

    function onApprove(data) {
      var subId = data.subscriptionID || (data.details && data.details.subscription_id);
      if (!subId) return Promise.resolve();

      var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!supabase) return Promise.resolve();

      return supabase.rpc('update_paypal_subscription', { p_subscription_id: subId })
        .then(function (res) {
          var out = (res && res.data) || res;
          if (out && out.success) {
            if (isSubscriptionPage()) {
              if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('paypal-subscription-saved', { detail: { subscriptionID: subId } }));
              }
            } else {
              if (typeof showToast === 'function') showToast('Abonnement PRO activé !', 'success');
              if (typeof BackendAPI !== 'undefined' && BackendAPI.invalidateProfileCache) BackendAPI.invalidateProfileCache();
              return (typeof BackendAPI !== 'undefined' && BackendAPI.getPermissions) ? BackendAPI.getPermissions() : Promise.resolve();
            }
          }
        })
        .then(function () {
          if (!isSubscriptionPage()) {
            if (typeof window.applyPermissionsUI === 'function') window.applyPermissionsUI();
            if (typeof window.updatePayPalButtonsVisibility === 'function') window.updatePayPalButtonsVisibility();
            if (typeof window.updateExportButtonVisibility === 'function') window.updateExportButtonVisibility();
          }
        })
        .catch(function (e) {
          if (typeof showToast === 'function') showToast('Erreur : ' + (e && e.message ? e.message : 'Échec enregistrement'), 'error');
        });
    }

    var container1 = document.getElementById('paypalSubscribeContainer');
    var container2 = document.getElementById('paypalSubscribeContainerBooster');

    if (container1 && container1.children.length === 0) {
      paypal.Buttons({
        style: style,
        createSubscription: function (data, actions) {
          return actions.subscription.create({ plan_id: PAYPAL_PLAN_ID });
        },
        onApprove: onApprove
      }).render('#paypalSubscribeContainer');
    }
    if (container2 && container2.children.length === 0) {
      paypal.Buttons({
        style: style,
        createSubscription: function (data, actions) {
          return actions.subscription.create({ plan_id: PAYPAL_PLAN_ID });
        },
        onApprove: onApprove
      }).render('#paypalSubscribeContainerBooster');
    }
    _buttonsRendered = true;
  }

  function loadPayPalSDK() {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_PLAN_ID) return;
    if (document.getElementById('paypal-sdk-script')) {
      renderPayPalButtons();
      return;
    }
    var s = document.createElement('script');
    s.id = 'paypal-sdk-script';
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + PAYPAL_CLIENT_ID + '&vault=true&intent=subscription&disable-funding=card';
    s.async = true;
    s.onload = renderPayPalButtons;
    document.head.appendChild(s);
  }

  function openUpgradeProModal() {
    var overlay = document.getElementById('upgradeProModalOverlay');
    var modal = document.getElementById('upgradeProModal');
    if (overlay) { overlay.classList.add('active'); overlay.setAttribute('aria-hidden', 'false'); }
    if (modal) { modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false'); }
  }

  function closeUpgradeProModal() {
    var overlay = document.getElementById('upgradeProModalOverlay');
    var modal = document.getElementById('upgradeProModal');
    if (overlay) { overlay.classList.remove('active'); overlay.setAttribute('aria-hidden', 'true'); }
    if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
  }

  function initUpgradeProModal() {
    var btn = document.getElementById('upgradeProBtn');
    var overlay = document.getElementById('upgradeProModalOverlay');
    var closeBtn = document.getElementById('upgradeProModalClose');
    var ctaBtn = document.getElementById('upgradeProCtaBtn');

    if (btn) {
      btn.addEventListener('click', function (e) {
        var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
        if (badge !== 'FREE') return;
        if (_nextCloverClickOpensPayPal) {
          _nextCloverClickOpensPayPal = false;
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        openUpgradeProModal();
      }, true);
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
        if (badge !== 'FREE') return;
        if (_nextCloverClickOpensPayPal) { _nextCloverClickOpensPayPal = false; return; }
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
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function () {
        closeUpgradeProModal();
        var container = document.getElementById('paypalButtonsContainer');
        if (container) {
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
          _nextCloverClickOpensPayPal = true;
        }
      });
    }
  }

  window.closeUpgradeProModal = closeUpgradeProModal;

  function initPayPalButtons() {
    var supportBtn = document.getElementById('supportDeveloperBtnTopLeft');
    if (supportBtn && typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
      supportBtn.addEventListener('click', function () {
        window.electronAPI.openExternal('https://paypal.me/StatsTracker');
      });
    }
    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
    if (badge === 'FREE' || isSubscriptionPage()) loadPayPalSDK();
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
    if (badge === 'FREE' && !_buttonsRendered) loadPayPalSDK();
  });
  window.addEventListener('languageChanged', updatePayPalButtonsVisibility);
  window.updatePayPalButtonsVisibility = updatePayPalButtonsVisibility;
})();
