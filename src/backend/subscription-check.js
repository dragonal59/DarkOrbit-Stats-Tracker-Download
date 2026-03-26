/**
 * Vérification abonnement — au démarrage, à chaque connexion, et toutes les heures
 */
(function () {
  'use strict';

  var HOURLY_MS = 60 * 60 * 1000;
  var _hourlyInterval = null;

  function goToSubscription() {
    if (typeof window.electronAPI !== 'undefined' && window.electronAPI.navigateToSubscription) {
      window.electronAPI.navigateToSubscription();
    } else {
      window.location.href = 'subscription.html';
    }
  }

  async function expireTrialAndRedirect(supabase, userId) {
    const { error } = await supabase.from('profiles').update({
      subscription_status: 'free',
      badge: 'FREE',
      trial_expires_at: null,
      updated_at: new Date().toISOString()
    }).eq('id', userId);
    if (!error && typeof BackendAPI !== 'undefined') BackendAPI.invalidateProfileCache();
    goToSubscription();
  }

  /**
   * Returns { ok: boolean, redirectToSubscription: boolean }
   */
  async function checkSubscriptionAccess() {
    var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return { ok: true };
    var session = typeof AuthManager !== 'undefined' && AuthManager.getValidSession ? await AuthManager.getValidSession() : null;
    if (!session || !session.user) return { ok: true };
    var userId = session.user.id;

    if (typeof BackendAPI !== 'undefined') BackendAPI.invalidateProfileCache();
    var profile = typeof BackendAPI !== 'undefined' ? await BackendAPI.loadUserProfile() : null;
    if (!profile) return { ok: true };

    var subStatus = profile.subscription_status || 'free';
    var badge = profile.badge || 'FREE';
    var trialExpires = profile.trial_expires_at;

    if (badge === 'ADMIN' || badge === 'SUPERADMIN') return { ok: true };
    if (subStatus === 'premium' || badge === 'PRO') return { ok: true };
    if (subStatus === 'trial') {
      if (trialExpires && new Date(trialExpires).getTime() > Date.now()) return { ok: true };
      await expireTrialAndRedirect(supabase, userId);
      return { ok: false, redirectToSubscription: true };
    }
    if (subStatus === 'free' || subStatus === 'suspended') {
      return { ok: true };
    }
    return { ok: true };
  }

  function startHourlyCheck() {
    if (_hourlyInterval) return;
    _hourlyInterval = setInterval(function () {
      checkSubscriptionAccess().then(function (r) {
        if (!r.ok && r.redirectToSubscription) {
          if (_hourlyInterval) clearInterval(_hourlyInterval);
          _hourlyInterval = null;
        }
      });
    }, HOURLY_MS);
  }

  function stopHourlyCheck() {
    if (_hourlyInterval) {
      clearInterval(_hourlyInterval);
      _hourlyInterval = null;
    }
  }

  /**
   * - [data-open-upgrade-pro-modal] : ouvre le modal Passez PRO (sidebar booster).
   * - [data-paypal-pro-subscribe] : ouvre le checkout PayPal (ex. bouton du modal).
   * - [data-subscription-nav] : page d’abonnement (clé d’essai, etc.).
   * Délégation sur document : fiable même si le DOM est rempli après subscription-check.js.
   */
  document.addEventListener(
    'click',
    function (e) {
      var upgradeModalEl = e.target && e.target.closest && e.target.closest('[data-open-upgrade-pro-modal]');
      if (upgradeModalEl) {
        e.preventDefault();
        if (typeof window.openUpgradeProModal === 'function') {
          window.openUpgradeProModal();
        }
        return;
      }
      var paypalEl = e.target && e.target.closest && e.target.closest('[data-paypal-pro-subscribe]');
      if (paypalEl) {
        e.preventDefault();
        if (typeof window.closeUpgradeProModal === 'function') {
          window.closeUpgradeProModal();
        }
        setTimeout(function () {
          if (typeof window.openPayPalProSubscribeUrl === 'function') {
            window.openPayPalProSubscribeUrl();
          } else {
            window.open(
              'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-3GJ89847YV064064ANHCILLQ',
              '_blank',
              'noopener,noreferrer'
            );
          }
        }, 0);
        return;
      }
      var el = e.target && e.target.closest && e.target.closest('[data-subscription-nav]');
      if (!el) return;
      e.preventDefault();
      if (typeof window.closeUpgradeProModal === 'function') {
        window.closeUpgradeProModal();
      }
      setTimeout(function () {
        goToSubscription();
      }, 0);
    },
    true
  );

  window.SubscriptionCheck = {
    check: checkSubscriptionAccess,
    goToSubscription: goToSubscription,
    startHourlyCheck: startHourlyCheck,
    stopHourlyCheck: stopHourlyCheck
  };
})();
