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

  window.SubscriptionCheck = {
    check: checkSubscriptionAccess,
    goToSubscription: goToSubscription,
    startHourlyCheck: startHourlyCheck,
    stopHourlyCheck: stopHourlyCheck
  };
})();
