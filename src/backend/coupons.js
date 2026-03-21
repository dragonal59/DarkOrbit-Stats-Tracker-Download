// ==========================================
// GESTIONNAIRE DE COUPONS MTC GAME
// Visible PRO / ADMIN / SUPERADMIN (currentHasFeature('couponsTab'))
// Stockage local uniquement (pas de sync Supabase) : données sur la machine de l'utilisateur.
// ==========================================

(function () {
  'use strict';

  var _sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
  var COUPONS_KEY = _sk.USER_COUPONS || 'darkOrbitUserCoupons';
  var HISTORY_KEY = _sk.USER_COUPON_HISTORY || 'darkOrbitUserCouponHistory';
  var _alertNotifiedIds = {};

  function getSupabase() {
    return typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
  }

  function getUserIdSync() {
    if (typeof AuthManager !== 'undefined' && AuthManager.getUserId) return null;
    var supabase = getSupabase();
    if (!supabase || !supabase.auth) return null;
    var session = supabase.auth.session || (supabase.auth.getSession && supabase.auth.getSession());
    if (session && session.user) return session.user.id;
    return null;
  }

  async function getUserId() {
    var supabase = getSupabase();
    if (!supabase) return null;
    try {
      var res = await supabase.auth.getUser();
      return (res && res.data && res.data.user) ? res.data.user.id : null;
    } catch (e) { return null; }
  }

  function getCouponsFromStorage() {
    if (typeof UnifiedStorage !== 'undefined' && UnifiedStorage.get) {
      var raw = UnifiedStorage.get(COUPONS_KEY, []);
      return Array.isArray(raw) ? raw : [];
    }
    return [];
  }

  function setCouponsToStorage(arr) {
    if (typeof UnifiedStorage !== 'undefined' && UnifiedStorage.set) {
      UnifiedStorage.set(COUPONS_KEY, arr);
    }
  }

  function getHistoryFromStorage() {
    if (typeof UnifiedStorage !== 'undefined' && UnifiedStorage.get) {
      var raw = UnifiedStorage.get(HISTORY_KEY, []);
      return Array.isArray(raw) ? raw : [];
    }
    return [];
  }

  function setHistoryToStorage(arr) {
    if (typeof UnifiedStorage !== 'undefined' && UnifiedStorage.set) {
      UnifiedStorage.set(HISTORY_KEY, arr);
    }
  }

  async function fetchCouponsFromSupabase() {
    return getCouponsFromStorage();
  }

  async function fetchHistoryFromSupabase() {
    return getHistoryFromStorage();
  }

  async function addCoupon(payload) {
    var local = getCouponsFromStorage();
    var newRow = {
      id: 'local-' + Date.now(),
      user_id: null,
      label: payload.label || '',
      code: payload.code || null,
      balance_initial: Number(payload.balance_initial) || 0,
      balance_remaining: Number(payload.balance_remaining) != null ? Number(payload.balance_remaining) : Number(payload.balance_initial) || 0,
      alert_threshold: Number(payload.alert_threshold) || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    local.unshift(newRow);
    setCouponsToStorage(local);
    return { ok: true, data: newRow };
  }

  async function updateBalance(couponId, newBalance, note) {
    var list = getCouponsFromStorage();
    var coupon = list.find(function (c) { return (c.id || c.local_id) === couponId; });
    if (!coupon) return { ok: false, error: 'Coupon introuvable' };
    var oldBalance = Number(coupon.balance_remaining);
    newBalance = Number(newBalance);
    if (!Number.isFinite(newBalance)) return { ok: false, error: 'Solde invalide' };
    var diff = newBalance - oldBalance;
    coupon.balance_remaining = newBalance;
    coupon.updated_at = new Date().toISOString();
    setCouponsToStorage(list);
    var history = getHistoryFromStorage();
    history.unshift({
      coupon_id: couponId,
      user_id: null,
      ancien_solde: oldBalance,
      nouveau_solde: newBalance,
      difference: diff,
      note: note || null,
      created_at: new Date().toISOString()
    });
    setHistoryToStorage(history);
    checkLowBalanceAlert(coupon);
    updateCouponsTabBadge();
    return { ok: true, data: coupon };
  }

  async function deleteCoupon(couponId) {
    var list = getCouponsFromStorage().filter(function (c) { return (c.id || c.local_id) !== couponId; });
    setCouponsToStorage(list);
    updateCouponsTabBadge();
    return { ok: true };
  }

  function checkLowBalanceAlert(coupon) {
    if (!coupon || !Number.isFinite(coupon.balance_remaining) || !Number.isFinite(coupon.alert_threshold)) return;
    if (coupon.balance_remaining >= coupon.alert_threshold) return;
    if (_alertNotifiedIds[coupon.id]) return;
    _alertNotifiedIds[coupon.id] = true;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Coupon MTC Game — Solde bas', {
          body: (coupon.label || 'Coupon') + ' : ' + coupon.balance_remaining + ' TL restants (seuil ' + coupon.alert_threshold + ' TL)'
        });
      } catch (e) {}
    }
  }

  function updateCouponsTabBadge() {
    var list = getCouponsFromStorage();
    var hasLow = list.some(function (c) {
      var rem = Number(c.balance_remaining);
      var th = Number(c.alert_threshold);
      return Number.isFinite(rem) && Number.isFinite(th) && th > 0 && rem < th;
    });
    var btn = document.querySelector('.tab-btn[data-tab="coupons"]');
    if (btn) {
      var badge = btn.querySelector('.coupons-tab-badge');
      if (hasLow) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'coupons-tab-badge';
          badge.setAttribute('aria-label', 'Solde bas');
          btn.appendChild(badge);
        }
        badge.style.display = '';
      } else if (badge) {
        badge.style.display = 'none';
      }
    }
  }

  function getHistoryForCoupon(couponId) {
    var history = getHistoryFromStorage();
    return history.filter(function (h) { return (h.coupon_id || h.couponId) === couponId; });
  }

  function t(key) {
    return (typeof window.i18nT === 'function' ? window.i18nT(key) : key) || key;
  }

  function renderCouponsList() {
    var container = document.getElementById('couponsList');
    if (!container) return;
    if (typeof currentHasFeature !== 'function' || !currentHasFeature('couponsTab')) {
      container.innerHTML = '';
      return;
    }
    var list = getCouponsFromStorage();
    if (list.length === 0) {
      container.innerHTML = '<p class="coupons-empty">' + (t('coupons_empty') || 'Aucun coupon. Cliquez sur "Ajouter un coupon".') + '</p>';
      return;
    }
    container.innerHTML = list.map(function (c) {
      var id = c.id || c.local_id || '';
      var initial = Number(c.balance_initial) || 0;
      var remaining = Number(c.balance_remaining) || 0;
      var threshold = Number(c.alert_threshold) || 0;
      var pct = initial > 0 ? Math.min(100, (remaining / initial) * 100) : 0;
      var isLow = threshold > 0 && remaining < threshold;
      var created = c.created_at ? new Date(c.created_at).toLocaleDateString() : '';
      var editFormId = 'coupon-edit-form-' + id.replace(/[^a-zA-Z0-9-]/g, '_');
      var labelEscaped = (c.label || '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return (
        '<div class="coupon-card" data-coupon-id="' + id + '">' +
          '<div class="coupon-card-header">' +
            '<span class="coupon-card-label-wrap">' +
              '<span class="coupon-card-label">' + labelEscaped + '</span>' +
              '<button type="button" class="coupon-btn-copy" data-coupon-id="' + id + '" title="' + (t('copy') || 'Copier').replace(/"/g, '&quot;') + '" aria-label="' + (t('copy') || 'Copier').replace(/"/g, '&quot;') + '">📋</button>' +
            '</span>' +
            (isLow ? '<span class="coupon-card-alert">' + (t('coupons_alert_low') || 'Solde bas') + '</span>' : '') +
          '</div>' +
          '<div class="coupon-card-progress-wrap">' +
            '<div class="coupon-card-progress-bar"><div class="coupon-card-progress-fill" style="width:' + pct + '%"></div></div>' +
          '</div>' +
          '<div class="coupon-card-remaining">' + remaining.toFixed(2) + ' TL</div>' +
          '<div class="coupon-card-meta">' + (t('coupons_created_at') || 'Créé le') + ' ' + created + '</div>' +
          '<div class="coupon-card-actions">' +
            '<button type="button" class="btn-secondary btn-compact coupon-btn-edit-balance" data-coupon-id="' + id + '">' + (t('coupons_edit_balance') || 'Modifier le solde') + '</button>' +
            '<button type="button" class="btn-secondary btn-compact coupon-btn-delete" data-coupon-id="' + id + '">' + (t('coupons_delete') || 'Supprimer') + '</button>' +
          '</div>' +
          '<div class="coupon-edit-balance-form" id="' + editFormId + '" data-coupon-id="' + id + '" hidden>' +
            '<form class="coupon-edit-balance-form-inner coupon-edit-balance-form-el" data-coupon-id="' + id + '">' +
              '<label class="coupons-form-label">' + (t('coupons_remaining_tl') || t('coupons_remaining') || 'Solde restant') + '</label>' +
              '<input type="number" class="coupons-form-input coupon-edit-balance-input" step="0.01" min="0" value="' + remaining + '" data-coupon-id="' + id + '" />' +
              '<label class="coupons-form-label">' + (t('coupons_note_optional') || 'Note (optionnel)') + '</label>' +
              '<input type="text" class="coupons-form-input coupon-edit-note-input" placeholder="' + (t('coupons_note_placeholder') || 'Note') + '" data-coupon-id="' + id + '" />' +
              '<div class="coupon-edit-actions">' +
                '<button type="submit" class="btn-primary btn-compact">' + (t('coupons_save') || 'Enregistrer') + '</button>' +
                '<button type="button" class="btn-secondary btn-compact coupon-edit-cancel-btn" data-coupon-id="' + id + '">' + (t('cancel') || 'Annuler') + '</button>' +
              '</div>' +
            '</form>' +
          '</div>' +
          '<div class="coupon-history-accordion">' +
            '<button type="button" class="coupon-history-toggle" aria-expanded="false" data-coupon-id="' + id + '">' + (t('coupons_history') || 'Historique') + '</button>' +
            '<div class="coupon-history-body" id="coupon-history-' + id + '" hidden></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    bindCouponEvents();
    updateCouponsTabBadge();
  }

  function bindCouponEvents() {
    document.querySelectorAll('.coupon-btn-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.coupon-card');
        if (!card) return;
        var labelEl = card.querySelector('.coupon-card-label');
        var text = labelEl ? labelEl.textContent.trim() : '';
        if (!text || text === '—') return;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).then(function () {
            if (typeof showToast === 'function') showToast(t('coupons_code_copied') || 'Code copié', 'success');
          }).catch(function () {
            if (typeof showToast === 'function') showToast('Copie impossible', 'error');
          });
        } else {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand('copy');
            if (typeof showToast === 'function') showToast(t('coupons_code_copied') || 'Code copié', 'success');
          } catch (e) {
            if (typeof showToast === 'function') showToast('Copie impossible', 'error');
          }
          document.body.removeChild(ta);
        }
      });
    });
    document.querySelectorAll('.coupon-btn-edit-balance').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-coupon-id');
        var card = btn.closest('.coupon-card');
        if (!card) return;
        document.querySelectorAll('.coupon-edit-balance-form').forEach(function (f) { f.hidden = true; });
        var formWrap = card.querySelector('.coupon-edit-balance-form');
        if (!formWrap) return;
        var balanceInput = formWrap.querySelector('.coupon-edit-balance-input');
        var list = getCouponsFromStorage();
        var c = list.find(function (x) { return (x.id || x.local_id) === id; });
        if (c && balanceInput) balanceInput.value = Number(c.balance_remaining) || 0;
        formWrap.hidden = false;
        if (balanceInput) balanceInput.focus();
      });
    });
    document.querySelectorAll('.coupon-edit-balance-form-el').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var id = form.getAttribute('data-coupon-id');
        var balanceInput = form.querySelector('.coupon-edit-balance-input');
        var noteInput = form.querySelector('.coupon-edit-note-input');
        var newVal = balanceInput ? parseFloat(balanceInput.value) : NaN;
        var note = noteInput ? (noteInput.value || '').trim() : '';
        if (!id || !Number.isFinite(newVal)) {
          if (typeof showToast === 'function') showToast(t('coupons_invalid_balance') || 'Solde invalide', 'error');
          return;
        }
        updateBalance(id, newVal, note).then(function (r) {
          if (r.ok) {
            form.closest('.coupon-edit-balance-form').hidden = true;
            renderCouponsList();
            if (typeof showToast === 'function') showToast('Solde mis à jour.', 'success');
          } else if (typeof showToast === 'function') showToast(r.error || 'Erreur', 'error');
        });
      });
    });
    document.querySelectorAll('.coupon-edit-cancel-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wrap = btn.closest('.coupon-edit-balance-form');
        if (wrap) wrap.hidden = true;
      });
    });
    document.querySelectorAll('.coupon-btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-coupon-id');
        if (!window.confirm(t('coupons_delete') + ' ?')) return;
        deleteCoupon(id).then(function (r) {
          if (r.ok) { renderCouponsList(); if (typeof showToast === 'function') showToast('Coupon supprimé.', 'success'); }
          else if (typeof showToast === 'function') showToast(r.error || 'Erreur', 'error');
        });
      });
    });
    document.querySelectorAll('.coupon-history-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-coupon-id');
        var body = document.getElementById('coupon-history-' + id);
        if (!body) return;
        var expanded = btn.getAttribute('aria-expanded') === 'true';
        if (expanded) {
          body.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
        } else {
          var entries = getHistoryForCoupon(id);
          body.innerHTML = entries.length === 0
            ? '<p class="coupon-history-empty">Aucun historique</p>'
            : '<ul class="coupon-history-list">' + entries.map(function (h) {
                return '<li>' + (h.created_at ? new Date(h.created_at).toLocaleString() : '') + ' — ' +
                  (h.ancien_solde != null ? h.ancien_solde : h.ancienSolde) + ' TL → ' +
                  (h.nouveau_solde != null ? h.nouveau_solde : h.nouveauSolde) + ' TL (' +
                  ((h.difference != null ? h.difference : h.difference) >= 0 ? '+' : '') + (h.difference != null ? h.difference : h.difference) + ' TL)' +
                  (h.note ? ' — ' + h.note : '') + '</li>';
              }).join('') + '</ul>';
          body.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  function openAddForm() {
    var wrap = document.getElementById('couponsAddFormWrap');
    if (!wrap) return;
    var labelEl = document.getElementById('couponAddLabel');
    var balanceEl = document.getElementById('couponAddBalance');
    var thresholdEl = document.getElementById('couponAddThreshold');
    if (labelEl) labelEl.value = '';
    if (balanceEl) balanceEl.value = '';
    if (thresholdEl) thresholdEl.value = '0';
    wrap.hidden = false;
    if (labelEl) labelEl.focus();
  }

  function closeAddForm() {
    var wrap = document.getElementById('couponsAddFormWrap');
    if (wrap) wrap.hidden = true;
  }

  function bindAddForm() {
    var form = document.getElementById('couponsAddForm');
    var cancelBtn = document.getElementById('couponAddCancel');
    if (form && !form._couponsAddBound) {
      form._couponsAddBound = true;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var labelEl = document.getElementById('couponAddLabel');
        var balanceEl = document.getElementById('couponAddBalance');
        var thresholdEl = document.getElementById('couponAddThreshold');
        var label = labelEl ? labelEl.value.trim() : '';
        var balance = balanceEl ? parseFloat(balanceEl.value) : 0;
        var threshold = thresholdEl ? parseFloat(thresholdEl.value) : 0;
        if (!label) {
          if (typeof showToast === 'function') showToast(t('coupons_label_required') || 'Nom du coupon requis', 'warning');
          return;
        }
        addCoupon({
          label: label,
          balance_initial: Number.isFinite(balance) ? balance : 0,
          balance_remaining: Number.isFinite(balance) ? balance : 0,
          alert_threshold: Number.isFinite(threshold) ? threshold : 0
        }).then(function (r) {
          if (r.ok) {
            closeAddForm();
            renderCouponsList();
            if (typeof showToast === 'function') showToast('Coupon ajouté.', 'success');
            if (typeof DataSync !== 'undefined' && DataSync.queueSync) DataSync.queueSync();
          } else if (typeof showToast === 'function') showToast(r.error || 'Erreur', 'error');
        });
      });
    }
    if (cancelBtn && !cancelBtn._couponsAddBound) {
      cancelBtn._couponsAddBound = true;
      cancelBtn.addEventListener('click', closeAddForm);
    }
  }

  async function initCouponsTab() {
    if (typeof currentHasFeature !== 'function' || !currentHasFeature('couponsTab')) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (e) {}
    }
    fetchCouponsFromSupabase();
    fetchHistoryFromSupabase();
    bindAddForm();
    renderCouponsList();
    var addBtn = document.getElementById('couponsAddBtn');
    if (addBtn && !addBtn._couponsBound) {
      addBtn._couponsBound = true;
      addBtn.addEventListener('click', function () {
        openAddForm();
      });
    }
  }

  window.refreshCouponsUI = function () {
    initCouponsTab();
  };

  document.addEventListener('DOMContentLoaded', function () {
    initCouponsTab();
  });

  if (document.readyState !== 'loading') {
    initCouponsTab();
  }
})();
