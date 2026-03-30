/**
 * Panel Mon Compte — accessible à tous (FREE, PRO, ADMIN, SUPERADMIN)
 * Onglets : infos, Compte DarkOrbit (identifiants pour « Récupérer mes statistiques »), sécurité, à propos.
 * FREE : même modal que PRO ; limite 1 compte DarkOrbit (cf. loadDoTab + RPC get_darkorbit_account_limit).
 */
(function () {
  'use strict';

  function getConfirmDeleteText() {
    return (typeof window.i18nT === 'function') ? window.i18nT('delete_confirm_word') || 'SUPPRIMER' : 'SUPPRIMER';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  var PWD_MASK_PLACEHOLDER = '**********';

  async function loadDarkOrbitPasswordIntoCard(card, accountId, hasPassword) {
    var pwdEl = card.querySelector('.account-do-cred-password');
    if (!pwdEl || pwdEl.getAttribute('data-pwd-loaded') === '1') return;
    if (!hasPassword) return;
    var api = window.electronPlayerStatsCredentials;
    if (!api || typeof api.getByIdWithPassword !== 'function') {
      pwdEl.placeholder = PWD_MASK_PLACEHOLDER;
      pwdEl.removeAttribute('data-i18n-placeholder');
      return;
    }
    try {
      var res = await api.getByIdWithPassword(accountId);
      if (res && res.ok && res.password) {
        pwdEl.value = res.password;
        pwdEl.setAttribute('data-pwd-loaded', '1');
        pwdEl.type = 'password';
        pwdEl.removeAttribute('placeholder');
        pwdEl.removeAttribute('data-i18n-placeholder');
      } else {
        pwdEl.placeholder = PWD_MASK_PLACEHOLDER;
        pwdEl.removeAttribute('data-i18n-placeholder');
      }
    } catch (e) {
      Logger.warn('[account-panel] getByIdWithPassword:', e);
      pwdEl.placeholder = PWD_MASK_PLACEHOLDER;
      pwdEl.removeAttribute('data-i18n-placeholder');
    }
  }

  function applyPasswordLockState(section, locked) {
    var input = section.querySelector('.account-do-cred-password');
    var lock = section.querySelector('.account-do-cred-lock');
    if (!input || !lock) return;
    input.readOnly = locked;
    lock.classList.toggle('account-do-cred-lock--unlocked', !locked);
    lock.textContent = locked ? '🔒' : '🔓';
    lock.setAttribute('aria-pressed', locked ? 'true' : 'false');
    var tLocked = typeof window.i18nT === 'function' ? window.i18nT('do_password_lock_hint_locked') : 'Verrouillé — cliquer pour modifier';
    var tUnlocked = typeof window.i18nT === 'function' ? window.i18nT('do_password_lock_hint_unlocked') : 'Déverrouillé — cliquer pour verrouiller';
    lock.title = locked ? tLocked : tUnlocked;
    lock.setAttribute('aria-label', locked ? tLocked : tUnlocked);
  }

  function bindPasswordLock(section) {
    var input = section.querySelector('.account-do-cred-password');
    var lock = section.querySelector('.account-do-cred-lock');
    if (!input || !lock) return;
    applyPasswordLockState(section, true);
    lock.addEventListener('click', function (ev) {
      ev.stopPropagation();
      applyPasswordLockState(section, !input.readOnly);
    });
  }

  function formatDate(isoOrTs) {
    if (!isoOrTs) return '—';
    var d = new Date(isoOrTs);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getModal() {
    return document.getElementById('accountPanelModal');
  }

  function openPanel() {
    var modal = getModal();
    if (modal) modal.style.display = 'flex';
    loadPanelData();
  }

  function closePanel() {
    var modal = getModal();
    if (modal) modal.style.display = 'none';
  }

  function getBadgeClass(badge) {
    if (!badge) return 'account-badge--free';
    var b = String(badge).toUpperCase();
    if (b === 'SUPERADMIN') return 'account-badge--superadmin';
    if (b === 'ADMIN') return 'account-badge--admin';
    if (b === 'PRO') return 'account-badge--pro';
    return 'account-badge--free';
  }

  function parseProfileMetadata(profile) {
    var meta = {};
    if (profile && profile.metadata) {
      if (typeof profile.metadata === 'object' && profile.metadata !== null) meta = profile.metadata;
      else if (typeof profile.metadata === 'string') {
        try { meta = JSON.parse(profile.metadata); } catch (e) { meta = {}; }
      }
    }
    return meta && typeof meta === 'object' ? meta : {};
  }

  function renderAdminPrivilegeCard(badge) {
    var card = document.getElementById('accountAdminPrivilegeCard');
    var statusSection = document.getElementById('accountAboutStatusSection');
    var expirySection = document.getElementById('accountAboutExpirySection');
    var b = String(badge || '').toUpperCase();
    var isPrivileged = b === 'ADMIN' || b === 'SUPERADMIN';

    if (statusSection) statusSection.style.display = isPrivileged ? 'none' : '';
    if (expirySection) expirySection.style.display = isPrivileged ? 'none' : '';

    if (!card) return;
    if (!isPrivileged) { card.style.display = 'none'; return; }

    var isSA = b === 'SUPERADMIN';
    var T = function (k, fb) { return (typeof window.i18nT === 'function' ? window.i18nT(k) : null) || fb; };
    var icon = isSA ? '👑' : '🛡️';
    var modifier = isSA ? 'superadmin' : 'admin';
    var title = isSA ? T('superadmin_role_name', 'Super Administrateur') : T('admin_role_name', 'Administrateur');
    var desc = isSA ? T('admin_privilege_desc_superadmin', 'Vous bénéficiez d\'un accès <strong>PRO gratuit et illimité</strong> en tant que super administrateur.') : T('admin_privilege_desc_admin', 'Vous bénéficiez d\'un accès <strong>PRO gratuit et illimité</strong> en tant qu\'administrateur.');
    var tagLabel = isSA ? T('admin_privilege_tag_superadmin', '♾ Super Admin · PRO illimité') : T('admin_privilege_tag_admin', '♾ Admin · PRO illimité');
    var youAre = T('admin_privilege_you_are', 'Vous êtes');

    card.innerHTML =
      '<div class="account-admin-privilege-inner account-admin-privilege-inner--' + modifier + '">' +
        '<div class="account-admin-privilege-icon">' + icon + '</div>' +
        '<div class="account-admin-privilege-body">' +
          '<div class="account-admin-privilege-title">' + youAre + ' ' + title + '</div>' +
          '<p class="account-admin-privilege-desc">' + desc + '</p>' +
          '<span class="account-admin-privilege-tag">✦ ' + tagLabel + '</span>' +
        '</div>' +
      '</div>';
    card.style.display = '';
  }

  function updateAboutSubscriptionSection(profile, badge) {
    renderAdminPrivilegeCard(badge);
    var b = String(badge || '').toUpperCase();
    if (b === 'ADMIN' || b === 'SUPERADMIN') return;

    var subStatus = profile && profile.subscription_status ? profile.subscription_status : 'free';
    var trialExpires = profile && profile.trial_expires_at ? profile.trial_expires_at : null;
    var isPro = b === 'PRO' || subStatus === 'premium';
    var meta = parseProfileMetadata(profile);
    var subMeta = meta.subscription || meta.paypal || {};

    var statusEl = document.getElementById('accountAboutSubStatus');
    var priceEl = document.getElementById('accountAboutSubPrice');
    var lastTxEl = document.getElementById('accountAboutSubLastTx');
    var renewalEl = document.getElementById('accountAboutSubRenewal');
    var expiryEl = document.getElementById('accountAboutExpiryCancel');
    if (!statusEl && !priceEl && !lastTxEl && !renewalEl && !expiryEl) return;

    if (statusEl) {
      var key;
      if (subStatus === 'premium') key = 'subscription_status_premium';
      else if (subStatus === 'trial') key = 'subscription_status_trial';
      else if (subStatus === 'suspended') key = 'subscription_status_suspended';
      else key = 'subscription_status_free';
      statusEl.textContent = (typeof window.i18nT === 'function') ? window.i18nT(key) : subStatus;
    }

    var pricePro = (typeof window.i18nT === 'function') ? window.i18nT('price_pro_month') : '2.99€/mois';
    if (priceEl) {
      if (subMeta.price != null && String(subMeta.price).trim() !== '') {
        priceEl.textContent = String(subMeta.price);
      } else if (subStatus === 'premium' || subStatus === 'trial') {
        priceEl.textContent = pricePro;
      } else {
        priceEl.textContent = '—';
      }
    }

    if (lastTxEl) {
      if (subMeta.last_payment_at) lastTxEl.textContent = formatDate(subMeta.last_payment_at);
      else if (subMeta.last_transaction_at) lastTxEl.textContent = formatDate(subMeta.last_transaction_at);
      else lastTxEl.textContent = '—';
    }

    if (renewalEl) {
      if (subMeta.next_billing_at) renewalEl.textContent = formatDate(subMeta.next_billing_at);
      else if (subMeta.renewal_at) renewalEl.textContent = formatDate(subMeta.renewal_at);
      else if (subStatus === 'trial' && trialExpires) renewalEl.textContent = formatDate(trialExpires);
      else if (isPro && !trialExpires) {
        renewalEl.textContent = (typeof window.i18nT === 'function') ? window.i18nT('subscription_renewal_auto') : 'Renouvellement automatique';
      } else {
        renewalEl.textContent = '—';
      }
    }

    if (expiryEl) {
      if (subStatus === 'trial' && trialExpires) {
        expiryEl.textContent = formatDate(trialExpires);
      } else if (isPro && trialExpires) {
        expiryEl.textContent = formatDate(trialExpires);
      } else if (isPro && !trialExpires) {
        expiryEl.textContent = (typeof window.i18nT === 'function') ? window.i18nT('subscription_access_until_cancel') : 'Accès actif jusqu’à résiliation dans PayPal';
      } else {
        expiryEl.textContent = '—';
      }
    }
  }

  async function loadPanelData() {
    var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) {
      if (typeof showToast === 'function') showToast('Supabase non disponible.', 'error');
      return;
    }
    var user = (await supabase.auth.getUser()).data?.user;
    if (!user) {
      if (typeof showToast === 'function') showToast('Non connecté.', 'error');
      return;
    }

    // Username (profile ou email prefix)
    var username = user.user_metadata?.username || user.user_metadata?.game_pseudo || (user.email || '').split('@')[0] || '—';
    var profile = null;
    try {
      var res = await supabase.from('profiles').select('username, email, game_pseudo, created_at, last_login, badge, subscription_status, trial_expires_at, metadata, paypal_subscription_id').eq('id', user.id).single();
      profile = res.data;
      if (profile && (profile.username || profile.game_pseudo)) username = profile.username || profile.game_pseudo;
    } catch (e) {}
    var usernameEl = document.getElementById('accountUsername');
    if (usernameEl) usernameEl.textContent = escapeHtml(username);

    // Email (lecture seule — mise à jour via onglet Sécurité)
    var emailVal = user.email || (profile && profile.email) || '';
    var emailDisplay = document.getElementById('accountEmailDisplay');
    if (emailDisplay) emailDisplay.textContent = emailVal || '—';

    // Badge
    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' && BackendAPI.getUserBadge ? BackendAPI.getUserBadge() : (profile && profile.badge) || 'FREE');
    var badgeEl = document.getElementById('accountBadge');
    if (badgeEl) {
      badgeEl.textContent = badge || 'FREE';
      badgeEl.className = 'account-badge ' + getBadgeClass(badge);
    }
    updateAboutSubscriptionSection(profile, badge);
    var doTabBtn = document.querySelector('.account-panel-tab[data-tab="do"]');
    if (doTabBtn) doTabBtn.style.display = '';

    // Date d'inscription
    var joinedAt = profile && profile.created_at ? profile.created_at : (user.created_at || '');
    var joinedEl = document.getElementById('accountJoinedAt');
    if (joinedEl) joinedEl.textContent = formatDate(joinedAt);

    // Historique des connexions (Supabase : user_login_history + repli sur profiles.last_login)
    var loginList = document.getElementById('accountLoginHistoryList');
    if (loginList) {
      var rows = [];
      try {
        var hr = await supabase.from('user_login_history').select('logged_in_at').eq('user_id', user.id).order('logged_in_at', { ascending: false }).limit(3);
        if (hr.error) {
          Logger.warn('[account-panel] user_login_history:', hr.error.message || hr.error);
        } else if (hr.data && hr.data.length) {
          rows = hr.data;
        }
      } catch (e) {
        Logger.warn('[account-panel] login history fetch:', e);
      }
      if (rows.length) {
        loginList.innerHTML = rows.map(function (row) {
          return '<p class="account-login-item">' + escapeHtml(formatDate(row.logged_in_at)) + '</p>';
        }).join('');
      } else if (profile && profile.last_login) {
        loginList.innerHTML = '<p class="account-login-item">' + escapeHtml(formatDate(profile.last_login)) + ' — ' + escapeHtml(typeof window.i18nT === 'function' ? window.i18nT('last_connection') : 'Dernière connexion') + '</p>';
      } else {
        loginList.innerHTML = '<p class="account-empty">' + (typeof window.i18nT === 'function' ? window.i18nT('no_login_history') : 'Aucun historique') + '</p>';
      }
    }
  }

  function initChangePassword() {
    var btn = document.getElementById('accountChangePasswordBtn');
    var currentEl = document.getElementById('accountCurrentPassword');
    var newEl = document.getElementById('accountNewPassword');
    var confirmEl = document.getElementById('accountConfirmPassword');
    if (!btn || !newEl || !confirmEl) return;
    var t = function (k, fb) { return (typeof window.i18nT === 'function' ? window.i18nT(k) : null) || fb; };
    btn.addEventListener('click', async function () {
      var currentPwd = currentEl ? currentEl.value : '';
      var newPwd = newEl.value;
      var confirmPwd = confirmEl.value;
      if (currentEl && !currentPwd) {
        if (typeof showToast === 'function') showToast(t('current_password_required', 'Mot de passe actuel requis'), 'warning');
        return;
      }
      if (!newPwd || newPwd.length < 6) {
        if (typeof showToast === 'function') showToast(t('password_min_length', 'Le mot de passe doit faire au moins 6 caractères'), 'warning');
        return;
      }
      if (newPwd !== confirmPwd) {
        if (typeof showToast === 'function') showToast(t('passwords_dont_match', 'Les mots de passe ne correspondent pas'), 'error');
        return;
      }
      var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!supabase) return;
      if (currentEl && currentPwd) {
        var userRes = await supabase.auth.getUser();
        var email = userRes.data && userRes.data.user ? userRes.data.user.email : null;
        if (email) {
          var { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: email, password: currentPwd });
          if (reAuthErr) {
            if (typeof showToast === 'function') showToast(t('current_password_incorrect', 'Mot de passe actuel incorrect'), 'error');
            return;
          }
        }
      }
      var { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) {
        if (typeof showToast === 'function') showToast(error.message || 'Erreur', 'error');
        return;
      }
      if (currentEl) currentEl.value = '';
      newEl.value = '';
      confirmEl.value = '';
      if (typeof showToast === 'function') showToast(t('password_updated', 'Mot de passe mis à jour'), 'success');
    });
  }

  function initChangeEmail() {
    var btn = document.getElementById('accountChangeEmailBtn');
    var newEmailEl = document.getElementById('accountNewEmail');
    if (!btn || !newEmailEl) return;
    btn.addEventListener('click', async function () {
      var newEmail = newEmailEl.value.trim();
      if (!newEmail) {
        if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('email_required') : 'Email requis', 'warning');
        return;
      }
      var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!supabase) return;
      var { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) {
        if (typeof showToast === 'function') showToast(error.message || 'Erreur', 'error');
        return;
      }
      newEmailEl.value = '';
      if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('email_confirmation_sent') : 'Un email de confirmation a été envoyé.', 'success');
      loadPanelData();
    });
  }

  function initDeleteAccount() {
    var btn = document.getElementById('accountDeleteAccountBtn');
    var confirmModal = document.getElementById('accountDeleteConfirmModal');
    var confirmInput = document.getElementById('accountDeleteConfirmInput');
    var confirmOk = document.getElementById('accountDeleteConfirmOk');
    var confirmCancel = document.getElementById('accountDeleteConfirmCancel');
    var confirmCancelBtn = document.getElementById('accountDeleteConfirmCancelBtn');
    if (!btn || !confirmModal) return;

    function closeConfirm() {
      confirmModal.style.display = 'none';
      if (confirmInput) confirmInput.value = '';
    }

    btn.addEventListener('click', function () {
      if (confirmModal) confirmModal.style.display = 'flex';
      if (confirmInput) confirmInput.value = '';
    });
    if (confirmCancel) confirmCancel.addEventListener('click', closeConfirm);
    if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', closeConfirm);
    confirmModal.querySelector('.sa-modal-overlay').addEventListener('click', closeConfirm);

    if (confirmOk) {
      confirmOk.addEventListener('click', async function () {
        var typed = confirmInput && confirmInput.value ? confirmInput.value.trim() : '';
        if (typed !== getConfirmDeleteText()) {
          if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('type_supprimer_to_confirm') : 'Tapez SUPPRIMER pour confirmer', 'error');
          return;
        }
        closeConfirm();
        closePanel();
        if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('delete_account_contact_admin') : 'Pour supprimer votre compte, contactez l\'administrateur.', 'info');
      });
    }
  }

  function switchAccountTab(tabId) {
    document.querySelectorAll('.account-panel-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });
    var infoEl = document.getElementById('accountTabInfo');
    var doEl = document.getElementById('accountTabDo');
    var securityEl = document.getElementById('accountTabSecurity');
    var aboutEl = document.getElementById('accountTabAbout');
    if (infoEl) infoEl.style.display = tabId === 'info' ? '' : 'none';
    if (doEl) doEl.style.display = tabId === 'do' ? '' : 'none';
    if (securityEl) securityEl.style.display = tabId === 'security' ? '' : 'none';
    if (aboutEl) aboutEl.style.display = tabId === 'about' ? '' : 'none';
    if (tabId === 'do') loadDoTab();
    if (tabId === 'about' && typeof loadPanelData === 'function') loadPanelData();
  }

  function initAboutTab() {
    var versionEl = document.getElementById('accountAppVersionInline');
    if (versionEl && typeof window.electronApp !== 'undefined' && typeof window.electronApp.getVersion === 'function') {
      window.electronApp.getVersion().then(function (v) {
        var s = (v || '—').trim();
        versionEl.textContent = s.indexOf('v') === 0 ? s : 'v' + s;
      }).catch(function () {
        versionEl.textContent = 'v—';
      });
    } else if (versionEl) {
      versionEl.textContent = 'v—';
    }

    var statusEl = document.getElementById('accountUpdateStatus');
    var downloadBtn = document.getElementById('accountDownloadUpdateBtn');
    var checkBtn = document.getElementById('accountCheckUpdatesBtn');

    function setUpdateStatus(key, fallback) {
      if (!statusEl) return;
      var text = (typeof window.i18nT === 'function') ? window.i18nT(key) : fallback;
      statusEl.textContent = text;
    }

    var checking = false;
    var checkTimeoutId = null;

    if (typeof window.electronAppUpdater !== 'undefined') {
      window.electronAppUpdater.onUpdateReadyToInstall(function () {
        if (checkTimeoutId) { clearTimeout(checkTimeoutId); checkTimeoutId = null; }
        checking = false;
        if (checkBtn) checkBtn.disabled = false;
        setUpdateStatus('update_status_ready_hint', '✅ Mise à jour prête — voir la fenêtre ou le badge en bas à gauche.');
        if (downloadBtn) downloadBtn.style.display = 'none';
      });
      window.addEventListener('update-flow:dismissed', function () {
        setUpdateStatus('update_status_ready_badge', '✅ Mise à jour prête — rappel dans le badge (bas à gauche).');
      });
      window.electronAppUpdater.onUpdateNotAvailable(function (payload) {
        if (checkTimeoutId) { clearTimeout(checkTimeoutId); checkTimeoutId = null; }
        checking = false;
        if (checkBtn) checkBtn.disabled = false;
        if (payload && payload.reason === 'not_packaged') {
          setUpdateStatus('update_status_dev_mode', 'Les mises à jour automatiques ne sont pas disponibles en mode développement.');
        } else {
          setUpdateStatus('update_status_up_to_date', '✅ À jour');
        }
        if (downloadBtn) downloadBtn.style.display = 'none';
      });
      window.electronAppUpdater.onUpdateError(function (data) {
        if (checkTimeoutId) { clearTimeout(checkTimeoutId); checkTimeoutId = null; }
        checking = false;
        if (checkBtn) checkBtn.disabled = false;
        var detail = data && data.message ? String(data.message) : '';
        if (detail && statusEl) {
          statusEl.textContent = (typeof window.i18nT === 'function' ? window.i18nT('update_status_error') : 'Erreur lors de la vérification des mises à jour') + ' — ' + detail;
        } else {
          setUpdateStatus('update_status_error', 'Erreur lors de la vérification des mises à jour');
        }
        if (downloadBtn) downloadBtn.style.display = 'none';
      });
    }

    if (checkBtn && typeof window.electronAppUpdater !== 'undefined' && typeof window.electronAppUpdater.checkForUpdates === 'function') {
      checkBtn.addEventListener('click', function () {
        if (checking) return;
        checking = true;
        checkBtn.disabled = true;
        setUpdateStatus('update_status_checking', 'Recherche de mises à jour…');
        try {
          window.electronAppUpdater.checkForUpdates();
        } catch (e) {}
        if (checkTimeoutId) clearTimeout(checkTimeoutId);
        checkTimeoutId = setTimeout(function () {
          if (!checking) return;
          checking = false;
          checkTimeoutId = null;
          if (checkBtn) checkBtn.disabled = false;
          setUpdateStatus('update_status_error', 'Erreur lors de la vérification des mises à jour');
        }, 90000);
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener('click', function () {
        var url = 'https://github.com/dragonal59/DarkOrbit-Stats-Tracker-Download/releases/latest';
        if (typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
      });
    }

    var changelogBtn = document.getElementById('accountChangelogLink');
    if (changelogBtn) {
      changelogBtn.addEventListener('click', function () {
        try {
          if (typeof window.electronApp !== 'undefined' && typeof window.electronApp.getVersion === 'function' && typeof window.showChangelogPopup === 'function') {
            window.electronApp.getVersion().then(function (v) {
              var currentVersion = (v || '').trim();
              if (!currentVersion) {
                throw new Error('no-version');
              }
              return fetch('https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json')
                .then(function (r) { return r.json(); })
                .then(function (json) {
                  var versions = json && json.versions;
                  if (!Array.isArray(versions)) throw new Error('no-versions');
                  var entry = versions.find(function (e) { return String(e.version || '') === currentVersion.replace(/^v/, ''); }) || null;
                  var title = 'Nouveautés de la version ' + currentVersion;
                  window.showChangelogPopup(title, entry, null);
                });
            }).catch(function () {
              var url = 'https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json';
              if (typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
                window.electronAPI.openExternal(url);
              } else {
                window.open(url, '_blank');
              }
            });
          } else {
            var url = 'https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json';
            if (typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
              window.electronAPI.openExternal(url);
            } else {
              window.open(url, '_blank');
            }
          }
        } catch (e) {
          var url = 'https://raw.githubusercontent.com/dragonal59/DarkOrbit-Stats-Tracker-Download/master/changelog.json';
          if (typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
          } else {
            window.open(url, '_blank');
          }
        }
      });
    }

  }

  function setBackBtnVisible(visible) {
    var btn = document.getElementById('accountDoBackBtn');
    if (btn) btn.style.display = visible ? '' : 'none';
  }
  function showDoListView() {
    var listSection = document.getElementById('accountDoListSection');
    var addSection = document.getElementById('accountDoAddSection');
    if (listSection) listSection.style.display = 'block';
    if (addSection) addSection.style.display = 'none';
    setBackBtnVisible(false);
  }

  function showDoAddView() {
    var listSection = document.getElementById('accountDoListSection');
    var addSection = document.getElementById('accountDoAddSection');
    if (listSection) listSection.style.display = 'none';
    if (addSection) addSection.style.display = '';
    setBackBtnVisible(true);
  }

  async function loadDoTab() {
    var wasOnAddView = document.getElementById('accountDoAddSection') && document.getElementById('accountDoAddSection').style.display !== 'none';
    var api = window.electronPlayerStatsCredentials;
    var cardsList = document.getElementById('accountDoCardsList');
    var addBtn = document.getElementById('accountDoAddBtn');
    var addLimitMsg = document.getElementById('accountDoAddLimitMsg');
    if (!cardsList) return;
    if (!api || typeof api.getAll !== 'function') {
      cardsList.innerHTML = '<p class="account-empty">Disponible dans l\'app desktop.</p>';
      if (addBtn) addBtn.style.display = 'none';
      return;
    }
    var accounts = await api.getAll();
    var active = typeof api.getActive === 'function' ? await api.getActive() : null;
    var activeId = active ? active.id : null;
    if (typeof UserPreferencesAPI !== 'undefined' && accounts.length > 0) {
      for (var i = 0; i < accounts.length; i++) {
        var a = accounts[i];
        await UserPreferencesAPI.upsertDarkOrbitAccount({
          player_id: a.player_id || null,
          player_pseudo: a.player_pseudo || a.username || '',
          player_server: a.player_server || 'gbl5',
          is_active: a.id === activeId
        });
      }
      await UserPreferencesAPI.getActivePlayerInfo();
    }
    var limit = 1;
    try {
      var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (supabase) {
        var r = await supabase.rpc('get_darkorbit_account_limit');
        if (r.data != null && r.data !== undefined) limit = Number(r.data);
      }
    } catch (e) {}
    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' && BackendAPI.getUserBadge ? BackendAPI.getUserBadge() : 'FREE');
    var isFree = !badge || String(badge).toUpperCase() === 'FREE';
    var canAdd = (limit < 0 || accounts.length < limit) && (!isFree || accounts.length < 1);
    if (addBtn) addBtn.style.display = canAdd ? '' : 'none';
    if (addLimitMsg) {
      addLimitMsg.style.display = (isFree && accounts.length >= 1) ? '' : 'none';
    }
    var serverNames = typeof window.SERVER_CODE_TO_DISPLAY === 'object' ? window.SERVER_CODE_TO_DISPLAY : {};
    cardsList.innerHTML = '';
    if (accounts.length === 0) {
      cardsList.innerHTML = '<p class="account-empty" data-i18n="do_accounts_empty">Aucun compte. Utilisez « Ajouter un compte ».</p>';
      if (typeof window.applyTranslations === 'function') window.applyTranslations();
      if (wasOnAddView) showDoAddView();
      return;
    }
    accounts.forEach(function (acc, index) {
      var accId = acc.id;
      var rawPseudo = acc.player_pseudo || acc.username || '';
      var pseudoDisplay = escapeHtml(rawPseudo || '—');
      var serverCode = (acc.player_server || '').trim() || '—';
      var server = escapeHtml(serverNames[serverCode] || serverCode);
      var isActive = acc.id === activeId;
      var hasPassword = !!acc.has_password;
      var expanded = index === 0;
      var card = document.createElement('div');
      card.className = 'account-do-accordion';
      card.setAttribute('data-account-id', accId);
      card.setAttribute('data-has-password', hasPassword ? '1' : '0');
      card.innerHTML =
        '<button type="button" class="account-do-accordion-header" aria-expanded="' + (expanded ? 'true' : 'false') + '">' +
        '<div class="account-do-accordion-head-main">' +
        '<div class="account-do-accordion-summary">' +
        '<div class="account-do-card-pseudo">' + pseudoDisplay + '</div>' +
        (isActive ? '<div class="account-do-card-badges"><span class="account-badge account-badge--active" data-i18n="do_active_badge">ACTIF</span></div>' : '') +
        '</div></div>' +
        '<span class="account-do-accordion-chevron" aria-hidden="true">▼</span>' +
        '</button>' +
        '<div class="account-do-accordion-body"' + (expanded ? '' : ' hidden') + '>' +
        '<div class="account-do-body-inner">' +
        '<div class="account-do-field account-do-field--display">' +
        '<span class="account-do-field-label" data-i18n="do_game_pseudo_label">Pseudo</span>' +
        '<span class="account-do-field-value">' + pseudoDisplay + '</span></div>' +
        '<div class="account-do-field account-do-field--display">' +
        '<span class="account-do-field-label" data-i18n="do_server_label">Serveur</span>' +
        '<span class="account-do-field-value">' + server + '</span></div>' +
        '<div class="account-do-credentials-section" data-id="' + escapeAttr(accId) + '">' +
        '<div class="account-do-field">' +
        '<label class="account-do-field-label" data-i18n="do_login_pseudo_label">Pseudo DarkOrbit (connexion)</label>' +
        '<input type="text" class="account-do-cred-pseudo account-input" value="' + escapeAttr(acc.username || '') + '" autocomplete="username" /></div>' +
        '<div class="account-do-field">' +
        '<label class="account-do-field-label" data-i18n="do_password_darkorbit_label">Mot de passe DarkOrbit</label>' +
        '<div class="account-input-password-wrap">' +
        '<input type="password" class="account-do-cred-password account-input" autocomplete="new-password" data-i18n-placeholder="do_password_placeholder" />' +
        '<button type="button" class="account-password-toggle account-do-cred-pwd-toggle" data-i18n-title="toggle_password_visibility" data-i18n-aria-label="toggle_password_visibility">👁</button>' +
        '<button type="button" class="account-password-toggle account-do-cred-lock" data-i18n-title="do_password_lock_hint_locked" title="Verrouillé" aria-pressed="true">🔒</button>' +
        '</div></div>' +
        '<div class="account-do-actions">' +
        '<button type="button" class="account-do-btn account-do-btn--primary account-do-cred-save" data-i18n="do_btn_save">Enregistrer</button>' +
        '<button type="button" class="account-do-btn account-do-btn--secondary account-do-load-btn" data-id="' + escapeAttr(accId) + '" data-pseudo="' + escapeAttr(rawPseudo || '—') + '" data-player-id="' + escapeAttr(acc.player_id || '') + '" data-server-code="' + escapeAttr(serverCode) + '"></button>' +
        '<button type="button" class="account-do-btn account-do-btn--danger account-do-remove-btn" data-id="' + escapeAttr(accId) + '" data-pseudo="' + escapeAttr(rawPseudo || 'ce compte') + '" data-server="' + escapeAttr(serverNames[serverCode] || serverCode) + '" data-player-id="' + escapeAttr(acc.player_id || '') + '"></button>' +
        '</div></div></div></div>';
      cardsList.appendChild(card);
      var header = card.querySelector('.account-do-accordion-header');
      var body = card.querySelector('.account-do-accordion-body');
      var loadBtn = card.querySelector('.account-do-load-btn');
      if (loadBtn) {
        loadBtn.setAttribute('data-i18n', 'do_btn_switch');
        loadBtn.textContent = typeof window.i18nT === 'function' ? window.i18nT('do_btn_switch') : 'Changer de compte';
      }
      var remBtn = card.querySelector('.account-do-remove-btn');
      if (remBtn) {
        remBtn.setAttribute('data-i18n', 'do_btn_delete_account');
        remBtn.textContent = typeof window.i18nT === 'function' ? window.i18nT('do_btn_delete_account') : 'Supprimer ce compte';
      }
      if (header && body) {
        header.addEventListener('click', function () {
          var isOpen = header.getAttribute('aria-expanded') === 'true';
          var next = !isOpen;
          header.setAttribute('aria-expanded', next);
          body.hidden = !next;
        });
      }
    });
    if (typeof window.applyTranslations === 'function') window.applyTranslations();
    var pwdLoads = [];
    cardsList.querySelectorAll('.account-do-accordion').forEach(function (c) {
      var id = c.getAttribute('data-account-id');
      var hp = c.getAttribute('data-has-password') === '1';
      pwdLoads.push(loadDarkOrbitPasswordIntoCard(c, id, hp));
    });
    await Promise.all(pwdLoads);
    cardsList.querySelectorAll('.account-do-credentials-section').forEach(function (sec) {
      bindPasswordLock(sec);
    });
    cardsList.querySelectorAll('.account-do-load-btn').forEach(function (btn) {
      btn.addEventListener('click', async function (ev) {
        ev.stopPropagation();
        var id = btn.getAttribute('data-id');
        var pseudo = btn.getAttribute('data-pseudo') || 'Compte';
        var playerId = btn.getAttribute('data-player-id') || '';
        var serverCode = btn.getAttribute('data-server-code') || 'gbl5';
        var r = await api.setActive(id);
        if (r && r.ok) {
          if (typeof UserPreferencesAPI !== 'undefined') {
            UserPreferencesAPI.setActivePlayerCache({ player_id: playerId, player_server: serverCode, player_pseudo: pseudo === '—' ? null : pseudo });
            await UserPreferencesAPI.setPreferences({ active_player_id: playerId, active_player_server: serverCode });
          }
          if (typeof showToast === 'function') showToast('Compte ' + pseudo + ' chargé — rechargement…', 'info');
          setTimeout(function () { location.reload(); }, 1500);
        } else if (typeof showToast === 'function') showToast(r && r.error ? r.error : 'Erreur', 'error');
      });
    });
    if (wasOnAddView) showDoAddView(); else setBackBtnVisible(false);
    cardsList.querySelectorAll('.account-do-cred-pwd-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var card = btn.closest('.account-do-credentials-section');
        var pwd = card ? card.querySelector('.account-do-cred-password') : null;
        if (!pwd) return;
        var isPass = pwd.type === 'password';
        pwd.type = isPass ? 'text' : 'password';
        btn.textContent = isPass ? '🙈' : '👁';
      });
    });
    cardsList.querySelectorAll('.account-do-cred-save').forEach(function (btn) {
      btn.addEventListener('click', async function (ev) {
        ev.stopPropagation();
        var section = btn.closest('.account-do-credentials-section');
        if (!section) return;
        var id = section.getAttribute('data-id');
        var pseudoEl = section.querySelector('.account-do-cred-pseudo');
        var pwdEl = section.querySelector('.account-do-cred-password');
        var username = pseudoEl && pseudoEl.value ? pseudoEl.value.trim() : '';
        var password = pwdEl ? pwdEl.value : '';
        var payload = { username: username || null };
        if (password) payload.password = password;
        var r = await api.update(id, payload);
        if (r && r.ok) {
          if (typeof showToast === 'function') showToast('Identifiants sauvegardés', 'success');
          var accCard = section.closest('.account-do-accordion');
          if (accCard && password) {
            accCard.setAttribute('data-has-password', '1');
            var pe = section.querySelector('.account-do-cred-password');
            if (pe) {
              pe.setAttribute('data-pwd-loaded', '1');
            }
          }
          applyPasswordLockState(section, true);
        } else if (typeof showToast === 'function') showToast(r && r.error ? r.error : 'Erreur', 'error');
      });
    });
    cardsList.querySelectorAll('.account-do-remove-btn').forEach(function (btn) {
      btn.addEventListener('click', async function (ev) {
        ev.stopPropagation();
        var id = btn.getAttribute('data-id');
        var pseudo = btn.getAttribute('data-pseudo') || 'ce compte';
        var server = btn.getAttribute('data-server') || '';
        var confirmMsg = (typeof window.i18nT === 'function')
          ? (window.i18nT('confirm_remove_tracked_player') || '').replace('%name%', pseudo).replace('%server%', server)
          : 'Supprimer ' + pseudo + ' sur ' + server + ' ? Toutes ses sessions seront perdues.';
        if (!confirm(confirmMsg || ('Supprimer ' + pseudo + ' sur ' + server + ' ?'))) return;
        var activeAcc = await api.getActive();
        var wasActive = activeAcc && activeAcc.id === id;
        var r = await api.remove(id);
        if (!r || !r.ok) {
          if (typeof showToast === 'function') showToast(r && r.error ? r.error : 'Erreur', 'error');
          return;
        }
        var playerId = btn.getAttribute('data-player-id') || '';
        if (playerId) {
          try {
            var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
            if (supabase) await supabase.rpc('delete_player_sessions', { p_player_id: playerId });
          } catch (e) {}
        }
        if (wasActive) {
          var remaining = await api.getAll();
          if (remaining.length > 0 && remaining[0].id) await api.setActive(remaining[0].id);
        }
        await loadDoTab();
        if (typeof showToast === 'function') showToast('Compte supprimé', 'success');
        var modal = getModal();
        if (modal) modal.focus();
      });
    });
  }

  function initDoTab() {
    var api = window.electronPlayerStatsCredentials;
    var addBtn = document.getElementById('accountDoAddBtn');
    var addSection = document.getElementById('accountDoAddSection');
    var addCancel = document.getElementById('accountDoAddCancel');
    var addSubmit = document.getElementById('accountDoAddSubmit');
    var addPseudo = document.getElementById('accountDoAddPseudo');
    var addPassword = document.getElementById('accountDoAddPassword');
    var addServer = document.getElementById('accountDoAddServer');
    var addManualToggle = document.getElementById('accountDoAddManualToggle');
    var addPwdToggle = document.getElementById('accountDoAddPasswordToggle');
    var addPwdLock = document.getElementById('accountDoAddPasswordLock');
    if (!api || typeof api.getAll !== 'function') return;
    function applyAddPasswordLock(locked) {
      if (!addPassword || !addPwdLock) return;
      addPassword.readOnly = locked;
      addPwdLock.classList.toggle('account-do-cred-lock--unlocked', !locked);
      addPwdLock.textContent = locked ? '🔒' : '🔓';
      addPwdLock.setAttribute('aria-pressed', locked ? 'true' : 'false');
      var tLocked = typeof window.i18nT === 'function' ? window.i18nT('do_password_lock_hint_locked') : '';
      var tUnlocked = typeof window.i18nT === 'function' ? window.i18nT('do_password_lock_hint_unlocked') : '';
      addPwdLock.title = locked ? tLocked : tUnlocked;
      addPwdLock.setAttribute('aria-label', locked ? tLocked : tUnlocked);
    }
    if (addPwdLock && addPassword) {
      applyAddPasswordLock(false);
      addPwdLock.addEventListener('click', function () {
        applyAddPasswordLock(!addPassword.readOnly);
      });
    }
    if (addPwdToggle && addPassword) {
      addPwdToggle.addEventListener('click', function () {
        var isPass = addPassword.type === 'password';
        addPassword.type = isPass ? 'text' : 'password';
        addPwdToggle.textContent = isPass ? '🙈' : '👁';
      });
    }
    if (addManualToggle) {
      function syncManualToggleFields() {
        var manual = addManualToggle.classList.contains('active');
        if (addPseudo) { addPseudo.disabled = manual; if (manual) addPseudo.value = ''; }
        if (addPassword) { addPassword.disabled = manual; if (manual) addPassword.value = ''; }
        if (addPwdLock) {
          addPwdLock.disabled = manual;
          addPwdLock.style.opacity = manual ? '0.45' : '1';
        }
      }
      addManualToggle.addEventListener('click', function () {
        var next = !addManualToggle.classList.contains('active');
        addManualToggle.classList.toggle('active', next);
        addManualToggle.setAttribute('aria-checked', next);
        syncManualToggleFields();
      });
      if (addBtn) addBtn.addEventListener('click', syncManualToggleFields);
    }
    if (addServer && typeof window.SERVER_CODE_TO_DISPLAY === 'object') {
      addServer.innerHTML = '';
      Object.keys(window.SERVER_CODE_TO_DISPLAY).sort().forEach(function (code) {
        var opt = document.createElement('option');
        opt.value = code;
        opt.textContent = window.SERVER_CODE_TO_DISPLAY[code];
        addServer.appendChild(opt);
      });
    }
    if (addBtn) addBtn.addEventListener('click', function () { showDoAddView(); });
    var addBack = document.getElementById('accountDoBackBtn');
    var doBackOrCancel = function () { showDoListView(); loadDoTab(); };
    if (addCancel) addCancel.addEventListener('click', doBackOrCancel);
    if (addBack) addBack.addEventListener('click', doBackOrCancel);
    if (addSubmit) addSubmit.addEventListener('click', async function () {
      var pseudo = addPseudo && addPseudo.value ? addPseudo.value.trim() : '';
      var password = addPassword ? addPassword.value : '';
      var serverId = addServer && addServer.value ? addServer.value : 'gbl5';
      var manual = addManualToggle && addManualToggle.classList.contains('active');
      if (!manual && !pseudo) {
        if (typeof showToast === 'function') showToast('Pseudo requis.', 'warning');
        return;
      }
      if (!manual && !password) {
        if (typeof showToast === 'function') showToast('Mot de passe requis.', 'warning');
        return;
      }
      addSubmit.disabled = true;
      if (typeof showToast === 'function') showToast('Scan en cours…', 'info');
      try {
        var res;
        if (manual) {
          res = typeof window.electronPlayerStatsScraper !== 'undefined' && window.electronPlayerStatsScraper.collectManual
            ? await window.electronPlayerStatsScraper.collectManual({ serverId: serverId })
            : { ok: false, error: 'Mode manuel non disponible' };
        } else {
          res = typeof window.electronPlayerStatsScraper !== 'undefined' && window.electronPlayerStatsScraper.collectWithLogin
            ? await window.electronPlayerStatsScraper.collectWithLogin({ serverId: serverId, username: pseudo, password: password })
            : { ok: false, error: 'Scraper non disponible' };
        }
        if (!res || !res.ok) {
          if (typeof showToast === 'function') showToast(res && res.error ? res.error : 'Échec du scan', 'error');
          return;
        }
        var data = res.data || {};
        var addResult;
        let accountData;
        if (manual) {
          var pwd = password || prompt('Mot de passe pour enregistrer ce compte :');
          if (!pwd) {
            if (typeof showToast === 'function') showToast('Annulé', 'info');
            return;
          }
          accountData = {
            username: data.game_pseudo || data.player_pseudo || pseudo,
            player_server: data.player_server || data.server || serverId,
            player_id: data.player_id || '',
            player_pseudo: data.game_pseudo || data.player_pseudo || '',
            password: pwd,
            current_rank: data.initial_rank,
            honor: data.initial_honor,
            xp: data.initial_xp,
            rank_points: data.initial_rank_points
          };
          addResult = await api.add(accountData);
        } else {
          accountData = {
            username: pseudo,
            player_server: data.player_server || data.server || serverId,
            player_id: data.player_id || '',
            player_pseudo: data.game_pseudo || data.player_pseudo || pseudo,
            password: password,
            current_rank: data.initial_rank,
            honor: data.initial_honor,
            xp: data.initial_xp,
            rank_points: data.initial_rank_points
          };
          addResult = await api.add(accountData);
        }
        if (addResult && addResult.ok) {
          if (data.player_id && typeof UserPreferencesAPI !== 'undefined') {
            UserPreferencesAPI.setPreferences({ active_player_id: data.player_id, active_player_server: data.server }).catch(e => Logger.warn('[account-panel] setPreferences error:', e));
            UserPreferencesAPI.invalidateCache();
          }
          if (typeof saveBaselineFromScan === 'function') {
            await saveBaselineFromScan({
              server: data.server,
              game_pseudo: data.game_pseudo,
              player_id: data.player_id,
              company: data.company,
              initial_rank: data.initial_rank,
              initial_xp: data.initial_xp,
              initial_honor: data.initial_honor,
              initial_rank_points: data.initial_rank_points,
              next_rank_points: data.next_rank_points
            });
          } else if (typeof saveBaselineFromScan !== 'function') {
            Logger.warn('[AccountPanel] saveBaselineFromScan non disponible');
          }
          showDoListView();
          await loadDoTab();
          if (addPseudo) addPseudo.value = '';
          if (addPassword) addPassword.value = '';
          if (addManualToggle) { addManualToggle.classList.remove('active'); addManualToggle.setAttribute('aria-checked', 'false'); }
          if (addPwdLock && addPassword) applyAddPasswordLock(false);
          if (typeof showToast === 'function') showToast('Compte ajouté avec succès !', 'success');
        } else if (typeof showToast === 'function') showToast(addResult && addResult.error ? addResult.error : 'Erreur', 'error');
      } catch (e) {
        if (typeof showToast === 'function') showToast(e && e.message ? e.message : 'Erreur', 'error');
      } finally {
        addSubmit.disabled = false;
      }
    });
  }

  function initPanel() {
    var openBtn = document.getElementById('myAccountBtn');
    var closeBtn = document.getElementById('accountPanelClose');
    var modal = getModal();
    var overlay = modal ? modal.querySelector('.account-panel-overlay') : null;

    if (openBtn) openBtn.addEventListener('click', openPanel);
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (overlay) overlay.addEventListener('click', closePanel);

    document.querySelectorAll('.account-panel-tab').forEach(function (t) {
      t.addEventListener('click', function () { switchAccountTab(t.getAttribute('data-tab')); });
    });

    initChangePassword();
    initChangeEmail();
    initDeleteAccount();
    initDoTab();
    initAboutTab();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPanel);
  } else {
    initPanel();
  }

  window.openAccountPanel = openPanel;
  window.closeAccountPanel = closePanel;
})();
