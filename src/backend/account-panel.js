/**
 * Panel Mon Compte — accessible à tous (FREE, PRO, ADMIN, SUPERADMIN)
 * Informations compte, sécurité, stats, sessions, danger zone
 */
(function () {
  'use strict';

  var CONFIRM_DELETE_TEXT = 'SUPPRIMER';

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function formatNumber(num) {
    if (num == null || isNaN(num)) return '0';
    return Number(num).toLocaleString('en-US');
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

  function setSupabaseStatus(connected) {
    var el = document.getElementById('accountSupabaseStatus');
    if (!el) return;
    var key = connected ? 'supabase_connected' : 'supabase_disconnected';
    var fallback = connected ? '✅ Connecté' : '❌ Hors ligne';
    var text = (typeof window.i18nT === 'function') ? window.i18nT(key) : fallback;
    el.textContent = text;
    el.className = 'account-status-chip ' + (connected ? 'account-status-chip--ok' : 'account-status-chip--error');
  }

  function updateSubscriptionSection(profile, badge) {
    var statusEl = document.getElementById('accountSubscriptionStatus');
    var expiryEl = document.getElementById('accountSubscriptionExpiry');
    if (!statusEl && !expiryEl) return;
    var subStatus = profile && profile.subscription_status ? profile.subscription_status : 'free';
    var trialExpires = profile && profile.trial_expires_at ? profile.trial_expires_at : null;
    var b = String(badge || '').toUpperCase();
    var isPro = b === 'PRO' || subStatus === 'premium';

    if (statusEl) {
      var key;
      if (subStatus === 'premium') key = 'subscription_status_premium';
      else if (subStatus === 'trial') key = 'subscription_status_trial';
      else if (subStatus === 'suspended') key = 'subscription_status_suspended';
      else key = 'subscription_status_free';
      var fallbackStatus = subStatus;
      statusEl.textContent = (typeof window.i18nT === 'function') ? window.i18nT(key) : fallbackStatus;
    }

    if (expiryEl) {
      if (isPro) {
        if (trialExpires) {
          expiryEl.textContent = formatDate(trialExpires);
        } else {
          var k = 'subscription_no_expiry';
          var fb = 'Pas de date d\'expiration (renouvellement automatique)';
          expiryEl.textContent = (typeof window.i18nT === 'function') ? window.i18nT(k) : fb;
        }
      } else if (subStatus === 'trial' && trialExpires) {
        expiryEl.textContent = formatDate(trialExpires);
      } else {
        expiryEl.textContent = '—';
      }
    }
  }

  async function loadPanelData() {
    var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) {
      setSupabaseStatus(false);
      if (typeof showToast === 'function') showToast('Supabase non disponible.', 'error');
      return;
    }
    var user = (await supabase.auth.getUser()).data?.user;
    if (!user) {
      setSupabaseStatus(false);
      if (typeof showToast === 'function') showToast('Non connecté.', 'error');
      return;
    }
    setSupabaseStatus(true);

    // Avatar
    var avatarUrl = (user.user_metadata && user.user_metadata.avatar_url) ? user.user_metadata.avatar_url : '';
    var avatarEl = document.getElementById('accountAvatarImg');
    var avatarWrap = avatarEl && avatarEl.closest ? avatarEl.closest('.account-avatar-wrap') : null;
    var placeholderEl = avatarWrap ? avatarWrap.querySelector('.account-avatar-placeholder') : null;
    if (avatarEl) {
      if (avatarUrl) {
        avatarEl.src = avatarUrl;
        avatarEl.alt = '';
        avatarEl.style.display = '';
        if (placeholderEl) placeholderEl.style.display = 'none';
        avatarEl.onerror = function () {
          avatarEl.style.display = 'none';
          if (placeholderEl) { placeholderEl.style.display = 'flex'; placeholderEl.textContent = (user.user_metadata?.username || (user.email || '').split('@')[0] || '?').charAt(0).toUpperCase(); }
        };
      } else {
        avatarEl.src = '';
        avatarEl.style.display = 'none';
        if (placeholderEl) {
          placeholderEl.style.display = 'flex';
          var letter = (user.user_metadata?.username || user.user_metadata?.game_pseudo || (user.email || '').split('@')[0] || '?').charAt(0).toUpperCase();
          placeholderEl.textContent = letter;
        }
      }
    }

    // Username (profile ou email prefix)
    var username = user.user_metadata?.username || user.user_metadata?.game_pseudo || (user.email || '').split('@')[0] || '—';
    var profile = null;
    try {
      var res = await supabase.from('profiles').select('username, email, game_pseudo, created_at, last_login, badge, subscription_status, trial_expires_at').eq('id', user.id).single();
      profile = res.data;
      if (profile && (profile.username || profile.game_pseudo)) username = profile.username || profile.game_pseudo;
    } catch (e) {}
    var usernameEl = document.getElementById('accountUsername');
    if (usernameEl) usernameEl.textContent = escapeHtml(username);

    // Email
    var emailVal = user.email || (profile && profile.email) || '';
    var emailInput = document.getElementById('accountEmailInput');
    if (emailInput) emailInput.value = emailVal;

    // Badge
    var badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : (typeof BackendAPI !== 'undefined' && BackendAPI.getUserBadge ? BackendAPI.getUserBadge() : (profile && profile.badge) || 'FREE');
    var badgeEl = document.getElementById('accountBadge');
    if (badgeEl) {
      badgeEl.textContent = badge || 'FREE';
      badgeEl.className = 'account-badge ' + getBadgeClass(badge);
    }
    updateSubscriptionSection(profile, badge);
    var doTabBtn = document.querySelector('.account-panel-tab[data-tab="do"]');
    var doTabEl = document.getElementById('accountTabDo');
    if (doTabBtn || doTabEl) {
      var isFree = !badge || String(badge).toUpperCase() === 'FREE';
      if (doTabBtn) doTabBtn.style.display = isFree ? 'none' : '';
      if (doTabEl) doTabEl.style.display = isFree ? 'none' : '';
    }

    // Date d'inscription
    var joinedAt = profile && profile.created_at ? profile.created_at : (user.created_at || '');
    var joinedEl = document.getElementById('accountJoinedAt');
    if (joinedEl) joinedEl.textContent = formatDate(joinedAt);

    // Stats actuelles (lecture seule)
    var stats = null;
    if (typeof getDisplayStats === 'function') stats = getDisplayStats();
    else if (typeof getCurrentStats === 'function') stats = getCurrentStats();
    if (!stats) {
      var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
      var currentKey = sk.CURRENT_STATS || 'darkOrbitCurrentStats';
      stats = typeof UnifiedStorage !== 'undefined' ? UnifiedStorage.get(currentKey, {}) : {};
    }
    var xpEl = document.getElementById('accountStatXp');
    var honorEl = document.getElementById('accountStatHonor');
    var rankPointsEl = document.getElementById('accountStatRankPoints');
    if (xpEl) xpEl.textContent = formatNumber(stats.xp);
    if (honorEl) honorEl.textContent = formatNumber(stats.honor);
    if (rankPointsEl) rankPointsEl.textContent = formatNumber(stats.rankPoints);

    // Grade actuel avec image
    var rankName = (stats && stats.currentRank) ? stats.currentRank : '—';
    var rankImg = '';
    if (typeof getRankImg === 'function' && rankName && rankName !== '—') rankImg = getRankImg(rankName);
    var gradeImgEl = document.getElementById('accountGradeImg');
    var gradeNameEl = document.getElementById('accountGradeName');
    if (gradeImgEl) {
      if (rankImg) {
        gradeImgEl.src = rankImg;
        gradeImgEl.alt = rankName;
        gradeImgEl.style.display = '';
      } else {
        gradeImgEl.src = '';
        gradeImgEl.style.display = 'none';
      }
    }
    if (gradeNameEl) gradeNameEl.textContent = rankName || '—';

    // Sessions actives (Supabase ne expose qu'une session côté client)
    var session = (await supabase.auth.getSession()).data?.session;
    var sessionsList = document.getElementById('accountSessionsList');
    if (sessionsList) {
      if (session) {
        var createdAt = formatDate(session.created_at || session.user?.created_at);
        sessionsList.innerHTML =
          '<div class="account-session-item">' +
          '<span class="account-session-info">' + escapeHtml(typeof window.i18nT === 'function' ? window.i18nT('current_session') : 'Session actuelle') + ' — ' + escapeHtml(createdAt) + '</span>' +
          '<button type="button" class="sa-btn sa-btn--small account-session-revoke" data-current="1">' + (typeof window.i18nT === 'function' ? window.i18nT('logout') : 'Déconnexion') + '</button>' +
          '</div>';
        var revokeBtn = sessionsList.querySelector('.account-session-revoke');
        if (revokeBtn) revokeBtn.addEventListener('click', function () {
          if (typeof AuthManager !== 'undefined' && AuthManager.logout) {
            AuthManager.logout().then(function () {
              if (typeof window.electronAPI !== 'undefined' && window.electronAPI.navigateToAuth) window.electronAPI.navigateToAuth();
              else window.location.href = 'auth.html';
            });
          }
        });
      } else {
        sessionsList.innerHTML = '<p class="account-empty">' + (typeof window.i18nT === 'function' ? window.i18nT('no_active_sessions') : 'Aucune session active') + '</p>';
      }
    }

    // Historique des connexions (last_login)
    var loginList = document.getElementById('accountLoginHistoryList');
    if (loginList) {
      var lastLogin = profile && profile.last_login ? profile.last_login : null;
      if (lastLogin) {
        loginList.innerHTML = '<p class="account-login-item">' + escapeHtml(formatDate(lastLogin)) + ' — ' + (typeof window.i18nT === 'function' ? window.i18nT('last_connection') : 'Dernière connexion') + '</p>';
      } else {
        loginList.innerHTML = '<p class="account-empty">' + (typeof window.i18nT === 'function' ? window.i18nT('no_login_history') : 'Aucun historique') + '</p>';
      }
    }
  }

  function initAvatarChange() {
    var btn = document.getElementById('accountAvatarChangeBtn');
    var img = document.getElementById('accountAvatarImg');
    var errorEl = document.getElementById('accountAvatarError');
    if (!btn || !img) return;

    function setAvatarError(msg) {
      if (errorEl) {
        errorEl.textContent = msg || '';
        errorEl.style.display = msg ? 'block' : 'none';
      }
    }

    function resizeImageToBlob(file, maxSize, quality, callback) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target && e.target.result;
        if (!dataUrl || typeof dataUrl !== 'string') {
          callback(new Error('Lecture du fichier impossible'), null);
          return;
        }
        var image = new Image();
        image.onload = function () {
          var w = image.width;
          var h = image.height;
          if (w <= maxSize && h <= maxSize) {
            w = image.width;
            h = image.height;
          } else {
            var r = Math.min(maxSize / w, maxSize / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          if (!ctx) {
            callback(new Error('Canvas non disponible'), null);
            return;
          }
          ctx.drawImage(image, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            callback(null, blob);
          }, 'image/jpeg', quality);
        };
        image.onerror = function () { callback(new Error('Image invalide'), null); };
        image.src = dataUrl;
      };
      reader.onerror = function () { callback(new Error('Lecture du fichier impossible'), null); };
      reader.readAsDataURL(file);
    }

    btn.addEventListener('click', function () {
      setAvatarError('');
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        document.body.removeChild(input);
        if (!file) return;
        var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
        if (!supabase) {
          setAvatarError(typeof window.i18nT === 'function' ? window.i18nT('error_generic') || 'Erreur' : 'Erreur');
          return;
        }
        supabase.auth.getUser().then(function (r) {
          var userId = r.data && r.data.user && r.data.user.id;
          if (!userId) {
            setAvatarError(typeof window.i18nT === 'function' ? window.i18nT('not_connected') || 'Non connecté' : 'Non connecté');
            return;
          }
          btn.disabled = true;
          resizeImageToBlob(file, 128, 0.85, function (err, blob) {
            if (err) {
              btn.disabled = false;
              setAvatarError(err.message || 'Erreur redimensionnement');
              return;
            }
            if (!blob) {
              btn.disabled = false;
              setAvatarError('Erreur redimensionnement');
              return;
            }
            var path = userId + '/avatar.jpg';
            supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
              .then(function (uploadRes) {
                if (uploadRes.error) {
                  btn.disabled = false;
                  setAvatarError(uploadRes.error.message || 'Erreur envoi');
                  return;
                }
                var pub = supabase.storage.from('avatars').getPublicUrl(path);
                var url = pub && pub.data && pub.data.publicUrl ? pub.data.publicUrl : null;
                if (!url) {
                  btn.disabled = false;
                  setAvatarError('URL publique indisponible');
                  return;
                }
                return supabase.auth.updateUser({ data: { avatar_url: url } }).then(function (updateRes) {
                  return { updateRes: updateRes, url: url };
                });
              })
              .then(function (result) {
                btn.disabled = false;
                if (!result || !result.url) return;
                var updateRes = result.updateRes;
                var url = result.url;
                if (updateRes && updateRes.error) {
                  setAvatarError(updateRes.error.message || 'Erreur mise à jour');
                  return;
                }
                img.src = url;
                img.style.display = '';
                var wrap = img.closest && img.closest('.account-avatar-wrap');
                if (wrap) {
                  var ph = wrap.querySelector('.account-avatar-placeholder');
                  if (ph) ph.style.display = 'none';
                }
                setAvatarError('');
                if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('saved') : 'Sauvegardé', 'success');
              })
              .catch(function (e) {
                btn.disabled = false;
                setAvatarError(e && e.message ? e.message : 'Erreur');
                Logger.error('[account-panel] avatar upload:', e && e.message ? e.message : e);
              });
          });
        }).catch(function (e) {
          btn.disabled = false;
          setAvatarError(e && e.message ? e.message : 'Erreur');
        });
      });
      input.click();
    });
  }

  function initSaveProfile() {
    var btn = document.getElementById('accountSaveProfileBtn');
    if (!btn) return;
    btn.addEventListener('click', async function () {
      var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!supabase) return;
      var user = (await supabase.auth.getUser()).data?.user;
      if (!user) return;
      var emailInput = document.getElementById('accountEmailInput');
      var newEmail = emailInput && emailInput.value ? emailInput.value.trim() : '';
      if (!newEmail) {
        if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('email_required') : 'Email requis', 'warning');
        return;
      }
      var updates = {};
      if (newEmail !== user.email) updates.email = newEmail;
      if (Object.keys(updates).length === 0) {
        if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('no_changes') : 'Aucun changement', 'info');
        return;
      }
      var { error } = await supabase.auth.updateUser(updates);
      if (error) {
        if (typeof showToast === 'function') showToast(error.message || 'Erreur', 'error');
        return;
      }
      if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('saved') : 'Sauvegardé', 'success');
      if (typeof BackendAPI !== 'undefined' && BackendAPI.invalidateProfileCache) BackendAPI.invalidateProfileCache();
    });
  }

  function initChangePassword() {
    var btn = document.getElementById('accountChangePasswordBtn');
    var currentEl = document.getElementById('accountCurrentPassword');
    var newEl = document.getElementById('accountNewPassword');
    var confirmEl = document.getElementById('accountConfirmPassword');
    if (!btn || !newEl || !confirmEl) return;
    btn.addEventListener('click', async function () {
      var newPwd = newEl.value;
      var confirmPwd = confirmEl.value;
      if (!newPwd || newPwd.length < 6) {
        if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('password_min_length') : 'Le mot de passe doit faire au moins 6 caractères', 'warning');
        return;
      }
      if (newPwd !== confirmPwd) {
        if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('passwords_dont_match') : 'Les mots de passe ne correspondent pas', 'error');
        return;
      }
      var supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (!supabase) return;
      var { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) {
        if (typeof showToast === 'function') showToast(error.message || 'Erreur', 'error');
        return;
      }
      if (currentEl) currentEl.value = '';
      newEl.value = '';
      confirmEl.value = '';
      if (typeof showToast === 'function') showToast(typeof window.i18nT === 'function' ? window.i18nT('password_updated') : 'Mot de passe mis à jour', 'success');
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
        if (typed !== CONFIRM_DELETE_TEXT) {
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
  }

  function initAboutTab() {
    var versionEl = document.getElementById('accountAppVersion');
    if (versionEl && typeof window.electronApp !== 'undefined' && typeof window.electronApp.getVersion === 'function') {
      window.electronApp.getVersion().then(function (v) {
        versionEl.textContent = v || '—';
      }).catch(function () {
        versionEl.textContent = '—';
      });
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
      window.electronAppUpdater.onChecking(function () {
        setUpdateStatus('update_status_checking', 'Recherche de mises à jour…');
      });
      window.electronAppUpdater.onUpdateAvailable(function () {
        if (checkTimeoutId) { clearTimeout(checkTimeoutId); checkTimeoutId = null; }
        checking = false;
        if (checkBtn) checkBtn.disabled = false;
        setUpdateStatus('update_status_available', '🔄 Mise à jour disponible');
        if (downloadBtn) downloadBtn.style.display = '';
      });
      window.electronAppUpdater.onUpdateNotAvailable(function () {
        if (checkTimeoutId) { clearTimeout(checkTimeoutId); checkTimeoutId = null; }
        checking = false;
        if (checkBtn) checkBtn.disabled = false;
        setUpdateStatus('update_status_up_to_date', '✅ À jour');
        if (downloadBtn) downloadBtn.style.display = 'none';
      });
      window.electronAppUpdater.onUpdateError(function () {
        if (checkTimeoutId) { clearTimeout(checkTimeoutId); checkTimeoutId = null; }
        checking = false;
        if (checkBtn) checkBtn.disabled = false;
        setUpdateStatus('update_status_error', 'Erreur lors de la vérification des mises à jour');
        if (downloadBtn) downloadBtn.style.display = 'none';
      });
      window.electronAppUpdater.onUpdateDownloaded(function () {
        if (checkTimeoutId) { clearTimeout(checkTimeoutId); checkTimeoutId = null; }
        checking = false;
        if (checkBtn) checkBtn.disabled = false;
        setUpdateStatus('update_status_downloaded', '✅ Mise à jour téléchargée — sera installée au prochain redémarrage');
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
        }, 10000);
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

    var websiteBtn = document.getElementById('accountWebsiteLink');
    if (websiteBtn) {
      websiteBtn.addEventListener('click', function () {
        var url = 'https://do-stats-tracker.netlify.app';
        if (typeof window.electronAPI !== 'undefined' && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(url);
        } else {
          window.open(url, '_blank');
        }
      });
    }

    var supportBtn = document.getElementById('accountSupportLink');
    if (supportBtn) {
      supportBtn.addEventListener('click', function () {
        var handle = 'dragonal1601';
        var copied = false;
        try {
          if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(handle).then(function () {
              copied = true;
              if (typeof showToast === 'function') {
                var msg = (typeof window.i18nT === 'function') ? window.i18nT('support_discord_copied') : 'Pseudo Discord copié : ' + handle;
                showToast(msg, 'success');
              }
            });
          }
        } catch (e) {}
        if (!copied && typeof showToast === 'function') {
          var msg2 = (typeof window.i18nT === 'function') ? window.i18nT('support_discord_copied') : 'Pseudo Discord : ' + handle;
          showToast(msg2, 'info');
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
      cardsList.innerHTML = '<p class="account-empty">Aucun compte. Cliquez sur « Ajouter un compte ».</p>';
      if (wasOnAddView) showDoAddView();
      return;
    }
    accounts.forEach(function (acc) {
      var card = document.createElement('div');
      card.className = 'account-do-card';
      var pseudo = escapeHtml(acc.player_pseudo || acc.username || '—');
      var serverCode = (acc.player_server || '').trim() || '—';
      var server = escapeHtml(serverNames[serverCode] || serverCode);
      var isActive = acc.id === activeId;
      var autoScan = acc.auto_scan !== false;
      var rankKey = acc.current_rank || '';
      if (rankKey && typeof RANK_KEY_TO_RANK_NAME !== 'undefined' && rankKey.startsWith('rank_')) rankKey = RANK_KEY_TO_RANK_NAME[rankKey] || rankKey;
      var rankImg = typeof getRankImg === 'function' && rankKey ? getRankImg(rankKey) : '';
      var rankData = typeof RANKS_DATA !== 'undefined' && rankKey ? RANKS_DATA.find(function (r) { return r.rank === rankKey || r.name === rankKey; }) : null;
      var rankDisplay = rankData ? rankData.name : (rankKey || '—');
      var honor = acc.honor != null ? Number(acc.honor).toLocaleString('en-US') : '—';
      var xp = acc.xp != null ? Number(acc.xp).toLocaleString('en-US') : '—';
      var rp = acc.rank_points != null ? Number(acc.rank_points).toLocaleString('en-US') : '—';
      var serverBadgeClass = 'account-server-badge account-server-badge--' + (serverCode.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6) || 'def');
      card.innerHTML =
        '<div class="account-do-card-grade">' +
        (rankImg ? '<img src="' + escapeHtml(rankImg) + '" alt="' + escapeHtml(rankDisplay) + '" class="account-do-grade-img">' : '<div class="account-do-grade-placeholder">?</div>') +
        '</div>' +
        '<div class="account-do-card-info">' +
        '<div class="account-do-card-pseudo">' + pseudo + '</div>' +
        '<div class="account-do-card-stats">H ' + honor + ' · XP ' + xp + ' · RP ' + rp + '</div>' +
        '<div class="account-do-card-badges">' +
        '<span class="' + serverBadgeClass + '">' + server + '</span>' +
        (isActive ? '<span class="account-badge account-badge--active">ACTIF</span>' : '') +
        '</div>' +
        '<div class="account-do-card-scan">' +
        '<div class="auth-toggle-wrap account-do-scan-wrap">' +
        '<div class="auth-toggle account-do-scan-toggle' + (autoScan ? ' active' : '') + '" role="switch" aria-checked="' + autoScan + '" data-id="' + escapeHtml(acc.id) + '" tabindex="0">' +
        '</div><span class="auth-toggle-label">Scan auto</span></div>' +
        (!autoScan ? '<div class="account-do-manual-msg">Saisie manuelle requise au prochain scan</div>' : '') +
        '<div class="account-do-credentials-section" data-id="' + escapeHtml(acc.id) + '" style="display:' + (autoScan ? 'block' : 'none') + '">' +
        (autoScan && !acc.username ? '<div class="account-do-cred-warn">⚠️ Identifiants requis pour le scan automatique</div>' : '') +
        '<div class="account-do-cred-row"><label>Pseudo DarkOrbit</label><input type="text" class="account-do-cred-pseudo account-input" value="' + escapeHtml(acc.username || '') + '" placeholder="Pseudo"></div>' +
        '<div class="account-do-cred-row account-do-cred-pwd-row"><label>Mot de passe</label><div class="account-do-cred-pwd-wrap"><input type="password" class="account-do-cred-password account-input" placeholder="••••••"><button type="button" class="account-password-toggle account-do-cred-pwd-toggle" title="Afficher / masquer">👁</button></div></div>' +
        '<button type="button" class="sa-btn sa-btn--small account-do-cred-save">Sauvegarder</button></div>' +
        '</div>' +
        '<div class="account-do-card-actions">' +
        '<button type="button" class="session-btn account-do-load-btn" data-id="' + escapeHtml(acc.id) + '" data-pseudo="' + escapeHtml(pseudo) + '" data-player-id="' + escapeHtml(acc.player_id || '') + '" data-server-code="' + escapeHtml(serverCode) + '" title="Charger ce compte">▶</button>' +
        '<button type="button" class="session-btn error account-do-remove-btn" data-id="' + escapeHtml(acc.id) + '" data-pseudo="' + escapeHtml(pseudo) + '" data-server="' + escapeHtml(server) + '" data-player-id="' + escapeHtml(acc.player_id || '') + '" title="Supprimer">🗑</button>' +
        '</div>';
      cardsList.appendChild(card);
    });
    cardsList.querySelectorAll('.account-do-load-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
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
    cardsList.querySelectorAll('.account-do-scan-toggle').forEach(function (toggle) {
      toggle.addEventListener('click', async function () {
        var id = toggle.getAttribute('data-id');
        var next = !toggle.classList.contains('active');
        var r = await api.update(id, { auto_scan: next });
        if (r && r.ok) {
          toggle.classList.toggle('active', next);
          toggle.setAttribute('aria-checked', next);
          var scanDiv = toggle.closest('.account-do-card-scan');
          var credSection = scanDiv ? scanDiv.querySelector('.account-do-credentials-section') : null;
          if (credSection) {
            credSection.style.display = next ? 'block' : 'none';
            if (next) {
              var pseudoInput = credSection.querySelector('.account-do-cred-pseudo');
              var hasWarn = credSection.querySelector('.account-do-cred-warn');
              if (!hasWarn && pseudoInput && !pseudoInput.value.trim()) {
                var w = document.createElement('div');
                w.className = 'account-do-cred-warn';
                w.textContent = '⚠️ Identifiants requis pour le scan automatique';
                credSection.insertBefore(w, credSection.firstChild);
              }
            }
          }
          var msg = scanDiv ? scanDiv.querySelector('.account-do-manual-msg') : null;
          if (next) {
            if (msg) msg.remove();
          } else {
            if (!msg) {
              var m = document.createElement('div');
              m.className = 'account-do-manual-msg';
              m.textContent = 'Saisie manuelle requise au prochain scan';
              var wrap = scanDiv ? scanDiv.querySelector('.account-do-scan-wrap') : null;
              if (wrap && wrap.nextSibling) wrap.parentNode.insertBefore(m, wrap.nextSibling);
              else if (wrap) wrap.parentNode.appendChild(m);
            }
          }
        }
      });
    });
    cardsList.querySelectorAll('.account-do-cred-pwd-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.account-do-credentials-section');
        var pwd = card ? card.querySelector('.account-do-cred-password') : null;
        if (pwd) {
          var isPass = pwd.type === 'password';
          pwd.type = isPass ? 'text' : 'password';
          btn.textContent = isPass ? '🙈' : '👁';
        }
      });
    });
    cardsList.querySelectorAll('.account-do-cred-save').forEach(function (btn) {
      btn.addEventListener('click', async function () {
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
          var warn = section.querySelector('.account-do-cred-warn');
          if (warn && username) warn.remove();
        } else if (typeof showToast === 'function') showToast(r && r.error ? r.error : 'Erreur', 'error');
      });
    });
    cardsList.querySelectorAll('.account-do-remove-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var id = btn.getAttribute('data-id');
        var pseudo = btn.getAttribute('data-pseudo') || 'ce compte';
        var server = btn.getAttribute('data-server') || '';
        if (!confirm('Supprimer ' + pseudo + ' sur ' + server + ' ? Toutes ses sessions seront perdues.')) return;
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
    if (!api || typeof api.getAll !== 'function') return;
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

    initAvatarChange();
    initSaveProfile();
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
