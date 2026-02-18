/**
 * Boutons PayPal — Coin supérieur gauche
 * Visibilité selon badge : FREE (les 2), PRO (Soutenir seul), ADMIN/SUPERADMIN (aucun)
 */
(function () {
  'use strict';

  function updatePayPalButtonsVisibility() {
    var container = document.getElementById('paypalButtonsContainer');
    var supportBtn = document.getElementById('supportDeveloperBtnTopLeft');
    var buyProBtn = document.getElementById('buyProBtnTopLeft');
    if (!container) return;

    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : 'FREE';

    if (badge === 'ADMIN' || badge === 'SUPERADMIN') {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    if (supportBtn) supportBtn.style.display = badge === 'FREE' || badge === 'PRO' ? '' : 'none';
    if (buyProBtn) buyProBtn.style.display = badge === 'FREE' ? '' : 'none';
  }

  function initPayPalButtons() {
    var supportBtn = document.getElementById('supportDeveloperBtnTopLeft');
    var buyProBtn = document.getElementById('buyProBtnTopLeft');
    if (supportBtn && typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternalLink) {
      supportBtn.addEventListener('click', function () {
        window.electronAPI.openExternalLink('https://paypal.me/StatsTracker');
      });
    }
    if (buyProBtn && typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternalLink) {
      buyProBtn.addEventListener('click', function () {
        window.electronAPI.openExternalLink('https://www.paypal.com/ncp/payment/C93RHQQWPPX8C');
      });
    }
    updatePayPalButtonsVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPayPalButtons);
  } else {
    initPayPalButtons();
  }

  window.addEventListener('permissionsApplied', updatePayPalButtonsVisibility);
  window.addEventListener('languageChanged', updatePayPalButtonsVisibility);
  window.updatePayPalButtonsVisibility = updatePayPalButtonsVisibility;
})();
