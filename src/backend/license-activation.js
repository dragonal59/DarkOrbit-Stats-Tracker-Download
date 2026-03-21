/**
 * Activation de clés PRO — Entrée utilisateur dans Paramètres
 * Vérifie la clé via RPC activate_license_key et met à jour le badge
 */
(function () {
  'use strict';

  function formatLicenseKeyInput(input) {
    var v = (input.value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 16);
    var parts = [];
    for (var i = 0; i < v.length; i += 4) {
      parts.push(v.slice(i, i + 4));
    }
    input.value = parts.join('-');
  }

  function getLicenseKeyNormalized(input) {
    return (input.value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  function showLicenseMessage(type, text) {
    var el = document.getElementById('licenseActivationMessage');
    if (!el) return;
    el.textContent = text;
    el.className = 'license-activation-message license-activation-message--' + type;
    el.style.display = 'block';
    el.setAttribute('role', 'status');
    setTimeout(function () {
      el.style.display = 'none';
    }, 5000);
  }

  function updateLicenseUIBasedOnBadge() {
    var formEl = document.getElementById('licenseActivationForm');
    var alreadyEl = document.getElementById('licenseAlreadyPro');
    var manageBtn = document.getElementById('manageSubscriptionBtn');
    if (!formEl || !alreadyEl) return;

    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';
    var profile = typeof BackendAPI !== 'undefined' ? BackendAPI.getUserProfile() : null;
    var b = (profile && profile.badge) || badge;

    if (b === 'FREE') {
      formEl.style.display = 'block';
      alreadyEl.style.display = 'none';
    } else {
      formEl.style.display = 'none';
      alreadyEl.style.display = 'block';
      if (manageBtn) manageBtn.style.display = b === 'PRO' ? '' : 'none';
    }
  }

  async function activateLicense() {
    var input = document.getElementById('licenseKeyInput');
    var btn = document.getElementById('activateLicenseBtn');
    if (!input || !btn) return;

    var keyNorm = getLicenseKeyNormalized(input);
    if (keyNorm.length !== 16) {
      showLicenseMessage('error', typeof t === 'function' ? t('license_activation_error') : '❌ Clé invalide ou déjà utilisée.');
      return;
    }

    var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) {
      showLicenseMessage('error', 'Supabase non disponible.');
      return;
    }

    btn.disabled = true;
    try {
      var keyFormatted = keyNorm.match(/.{1,4}/g).join('-');
      var { data, error } = await supabase.rpc('activate_license_key', { p_key: keyFormatted });
      if (error) {
        showLicenseMessage('error', typeof t === 'function' ? t('license_activation_error') : '❌ Clé invalide ou déjà utilisée.');
        return;
      }
      if (data && data.success === true) {
        showLicenseMessage('success', typeof t === 'function' ? t('license_activation_success') : '✅ Clé activée avec succès ! Votre compte est maintenant PRO.');
        input.value = '';
        if (typeof BackendAPI !== 'undefined') BackendAPI.invalidateProfileCache();
        if (typeof BackendAPI !== 'undefined') await BackendAPI.loadUserProfile();
        if (typeof applyPermissionsUI === 'function') applyPermissionsUI();
        if (typeof updateExportButtonVisibility === 'function') await updateExportButtonVisibility();
        if (typeof window.updatePayPalButtonsVisibility === 'function') window.updatePayPalButtonsVisibility();
        setTimeout(function () {
          updateLicenseUIBasedOnBadge();
        }, 2000);
        return;
      }
      var trialRes = await supabase.rpc('activate_trial_key', { p_key: keyFormatted });
      if (trialRes.data && trialRes.data.success === true) {
        showLicenseMessage('success', '✅ Code d\'essai activé. Votre compte est en période trial PRO.');
        input.value = '';
        if (typeof BackendAPI !== 'undefined') BackendAPI.invalidateProfileCache();
        if (typeof BackendAPI !== 'undefined') await BackendAPI.loadUserProfile();
        if (typeof applyPermissionsUI === 'function') applyPermissionsUI();
        if (typeof updateExportButtonVisibility === 'function') await updateExportButtonVisibility();
        if (typeof window.updatePayPalButtonsVisibility === 'function') window.updatePayPalButtonsVisibility();
        setTimeout(function () {
          updateLicenseUIBasedOnBadge();
        }, 2000);
      } else {
        showLicenseMessage('error', typeof t === 'function' ? t('license_activation_error') : '❌ Clé invalide ou déjà utilisée.');
      }
    } catch (e) {
      showLicenseMessage('error', typeof t === 'function' ? t('license_activation_error') : '❌ Clé invalide ou déjà utilisée.');
    } finally {
      btn.disabled = false;
    }
  }

  function openManageSubscription() {
    var url = 'https://www.paypal.com/myaccount/autopay/';
    if (typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  }

  function initLicenseActivation() {
    var manageBtn = document.getElementById('manageSubscriptionBtn');
    if (manageBtn) manageBtn.addEventListener('click', openManageSubscription);
    var input = document.getElementById('licenseKeyInput');
    var btn = document.getElementById('activateLicenseBtn');
    if (input) {
      input.addEventListener('input', function () { formatLicenseKeyInput(input); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') activateLicense();
      });
    }
    if (btn) btn.addEventListener('click', activateLicense);
    updateLicenseUIBasedOnBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLicenseActivation);
  } else {
    initLicenseActivation();
  }

  window.addEventListener('permissionsApplied', updateLicenseUIBasedOnBadge);
  window.addEventListener('languageChanged', updateLicenseUIBasedOnBadge);
})();
