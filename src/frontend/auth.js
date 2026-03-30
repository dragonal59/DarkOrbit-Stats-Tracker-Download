// ==========================================
// Logique des écrans de connexion / inscription
// ==========================================

(function() {
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  let _registrationScannedStats = null;
  let _scanInProgress = false;
  let _progressUnlisten = null;
  const loginInlineErrorEl = document.getElementById('loginInlineError');

  // ── Messages globaux ───────────────────────────────────────────────────────
  function showError(msg) {
    if (errorEl) { errorEl.textContent = msg; errorEl.classList.add('visible'); }
    if (successEl) successEl.classList.remove('visible');
  }
  function showSuccess(msg) {
    if (successEl) { successEl.textContent = msg; successEl.classList.add('visible'); }
    if (errorEl) errorEl.classList.remove('visible');
  }
  function clearMessages() {
    if (errorEl) errorEl.classList.remove('visible');
    if (successEl) successEl.classList.remove('visible');
    if (loginInlineErrorEl) { loginInlineErrorEl.textContent = ''; loginInlineErrorEl.style.display = 'none'; }
  }
  function setLoginInlineError(msg) {
    if (!loginInlineErrorEl) return;
    if (msg) { loginInlineErrorEl.textContent = msg; loginInlineErrorEl.style.display = 'block'; }
    else { loginInlineErrorEl.textContent = ''; loginInlineErrorEl.style.display = 'none'; }
  }

  // ── Normalisation erreurs Supabase ─────────────────────────────────────────
  function normalizeSupabaseError(raw) {
    if (!raw) return 'Une erreur est survenue.';
    var r = String(raw).toLowerCase();
    if (r.includes('already registered') || r.includes('email address is already')) return 'Cet email est déjà utilisé.';
    if (r.includes('invalid email')) return 'Adresse email invalide.';
    if (r.includes('password') && r.includes('short')) return 'Le mot de passe doit contenir au moins 6 caractères.';
    if (r.includes('rate limit') || r.includes('too many')) return 'Trop de tentatives. Attendez quelques minutes.';
    if (r.includes('network') || r.includes('fetch') || r.includes('failed to fetch')) return 'Erreur réseau. Vérifiez votre connexion.';
    if (r.includes('invalid login credentials') || r.includes('invalid_credentials')) return 'Email ou mot de passe incorrect.';
    return raw;
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  function setTab(active) {
    document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === active); });
    document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.toggle('active', f.id === (active === 'login' ? 'authLoginForm' : 'authRegisterForm')); });
    clearMessages();
  }
  document.querySelectorAll('.auth-tab').forEach(function(btn) { btn.addEventListener('click', function() { setTab(btn.dataset.tab); }); });

  // ── Toggles voir/masquer mot de passe ─────────────────────────────────────
  function initPwToggle(inputId, btnId) {
    var input = document.getElementById(inputId);
    var btn = document.getElementById(btnId);
    if (!input || !btn) return;
    btn.addEventListener('click', function() {
      var isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.textContent = isText ? '👁' : '🙈';
    });
  }
  initPwToggle('loginPassword', 'loginPwToggle');
  initPwToggle('registerPassword', 'registerPwToggle');
  initPwToggle('registerDoPassword', 'registerDoPwToggle');

  // ── Force du mot de passe ─────────────────────────────────────────────────
  function getPasswordStrength(pw) {
    if (!pw || pw.length < 6) return 0;
    var score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(4, Math.max(1, Math.ceil(score * 4 / 5)));
  }
  var pwInput = document.getElementById('registerPassword');
  if (pwInput) {
    pwInput.addEventListener('input', function() {
      var val = pwInput.value;
      var level = val.length === 0 ? 0 : getPasswordStrength(val);
      var segs = [document.getElementById('pws1'), document.getElementById('pws2'), document.getElementById('pws3'), document.getElementById('pws4')];
      var cls = level <= 1 ? 'weak' : level <= 2 ? 'medium' : 'strong';
      var labels = ['', 'Faible', 'Moyen', 'Bon', 'Fort'];
      segs.forEach(function(s, i) {
        if (!s) return;
        s.className = 'pw-strength-seg';
        if (i < level) s.classList.add(cls);
      });
      var lbl = document.getElementById('pwStrengthLabel');
      if (lbl) lbl.textContent = level > 0 ? labels[level] : '';
    });
  }

  // ── Validation email inline ────────────────────────────────────────────────
  function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  var regEmailInput = document.getElementById('registerEmail');
  var regEmailErr = document.getElementById('registerEmailError');
  if (regEmailInput) {
    regEmailInput.addEventListener('blur', function() {
      var v = regEmailInput.value.trim();
      if (v && !isValidEmail(v)) {
        regEmailInput.classList.add('field-error');
        if (regEmailErr) { regEmailErr.textContent = 'Email invalide.'; regEmailErr.classList.add('visible'); }
      } else {
        regEmailInput.classList.remove('field-error');
        if (regEmailErr) { regEmailErr.textContent = ''; regEmailErr.classList.remove('visible'); }
      }
    });
    regEmailInput.addEventListener('input', function() {
      regEmailInput.classList.remove('field-error');
      if (regEmailErr) { regEmailErr.classList.remove('visible'); }
    });
  }

  // ── Confirmation email ─────────────────────────────────────────────────────
  var regEmailConfirm = document.getElementById('registerEmailConfirm');
  var regEmailConfirmErr = document.getElementById('registerEmailConfirmError');
  if (regEmailConfirm) {
    regEmailConfirm.addEventListener('blur', function() {
      var v1 = regEmailInput ? regEmailInput.value.trim() : '';
      var v2 = regEmailConfirm.value.trim();
      if (v2 && v1 !== v2) {
        regEmailConfirm.classList.add('field-error');
        if (regEmailConfirmErr) { regEmailConfirmErr.textContent = 'Les emails ne correspondent pas.'; regEmailConfirmErr.classList.add('visible'); }
      } else {
        regEmailConfirm.classList.remove('field-error');
        if (regEmailConfirmErr) { regEmailConfirmErr.classList.remove('visible'); }
      }
    });
    regEmailConfirm.addEventListener('input', function() {
      regEmailConfirm.classList.remove('field-error');
      if (regEmailConfirmErr) regEmailConfirmErr.classList.remove('visible');
    });
  }

  // ── Scan — mode manuel ─────────────────────────────────────────────────────
  function isManualLoginEnabled() {
    var t = document.getElementById('registerManualLoginToggle');
    return t && t.classList.contains('active');
  }
  function updateScanButtonState() {
    var btn = document.getElementById('registerScanStatsBtn');
    var manual = isManualLoginEnabled();
    if (manual) {
      if (btn) btn.disabled = false;
    } else {
      var pseudo = document.getElementById('registerDoPseudo') && document.getElementById('registerDoPseudo').value.trim();
      var pwd = document.getElementById('registerDoPassword') && document.getElementById('registerDoPassword').value;
      if (btn) btn.disabled = !(pseudo && pwd);
    }
  }
  function applyManualToggleState() {
    var t = document.getElementById('registerManualLoginToggle');
    var pseudo = document.getElementById('registerDoPseudo');
    var pwd = document.getElementById('registerDoPassword');
    var autoFields = document.getElementById('registerAutoFields');
    var guide = document.getElementById('registerManualGuide');
    var hint = document.getElementById('registerScanHint');
    if (!t) return;
    var manual = t.classList.contains('active');
    if (autoFields) autoFields.style.display = manual ? 'none' : '';
    if (guide) guide.classList.toggle('visible', manual);
    if (pseudo) { pseudo.disabled = manual; if (manual) pseudo.value = ''; }
    if (pwd) { pwd.disabled = manual; if (manual) pwd.value = ''; }
    if (hint) hint.textContent = manual
      ? 'Connectez-vous dans la fenêtre qui va s\'ouvrir, puis attendez la détection automatique.'
      : 'Entrez vos identifiants DarkOrbit puis lancez le scan. Ils ne sont jamais enregistrés.';
    updateScanButtonState();
  }

  // Pré-remplir pseudo DO depuis localStorage
  try {
    var savedPseudo = localStorage.getItem('do_last_pseudo');
    if (savedPseudo) {
      var pseudoField = document.getElementById('registerDoPseudo');
      if (pseudoField) pseudoField.value = savedPseudo;
    }
  } catch (e) {}

  var serverSelect = document.getElementById('registerDoServer');
  if (serverSelect && typeof window.SERVER_CODE_TO_DISPLAY !== 'undefined') {
    var codes = Object.keys(window.SERVER_CODE_TO_DISPLAY).sort();
    codes.forEach(function(code) {
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = window.SERVER_CODE_TO_DISPLAY[code];
      if (code === 'gbl5') opt.selected = true;
      serverSelect.appendChild(opt);
    });
  }
  document.getElementById('registerDoPseudo') && document.getElementById('registerDoPseudo').addEventListener('input', updateScanButtonState);
  document.getElementById('registerDoPassword') && document.getElementById('registerDoPassword').addEventListener('input', updateScanButtonState);

  var manualToggle = document.getElementById('registerManualLoginToggle');
  if (manualToggle) {
    manualToggle.addEventListener('click', function() {
      this.classList.toggle('active');
      this.setAttribute('aria-checked', this.classList.contains('active'));
      applyManualToggleState();
    });
    manualToggle.addEventListener('keydown', function(e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.click(); }
    });
  }
  updateScanButtonState();
  var scanHintEl = document.getElementById('registerScanHint');
  if (scanHintEl) scanHintEl.textContent = 'Entrez vos identifiants DarkOrbit puis lancez le scan. Ils ne sont jamais enregistrés.';

  // ── Affichage du résultat scan ─────────────────────────────────────────────
  function showScanResultCard(stats) {
    var card = document.getElementById('registerScanResultCard');
    var grid = document.getElementById('registerScanResultGrid');
    if (!card || !grid) return;
    function fmt(n) { return n != null ? Number(n).toLocaleString() : '—'; }
    grid.innerHTML = [
      '<div class="scr-item">👤 Pseudo : <strong>' + (stats.game_pseudo || '—') + '</strong></div>',
      '<div class="scr-item">🌐 Serveur : <strong>' + (stats.server || '—') + '</strong></div>',
      '<div class="scr-item">🏢 Compagnie : <strong>' + (stats.company || '—') + '</strong></div>',
      '<div class="scr-item">🎖️ Grade : <strong>' + (stats.initial_rank || '—') + '</strong></div>',
      '<div class="scr-item">⭐ XP : <strong>' + fmt(stats.initial_xp) + '</strong></div>',
      '<div class="scr-item">🏆 Honneur : <strong>' + fmt(stats.initial_honor) + '</strong></div>',
    ].join('');
    card.classList.add('visible');
  }

  // ── Erreurs scan distinctes ────────────────────────────────────────────────
  function classifyScanError(errMsg) {
    if (!errMsg) return 'Authentification échouée, vérifiez vos identifiants DarkOrbit.';
    var m = String(errMsg).toLowerCase();
    if (m.includes('timeout') || m.includes('annulée') || m.includes('canceled')) return '⏱️ Délai dépassé. DarkOrbit est peut-être lent — réessayez dans quelques instants.';
    if (m.includes('non connecté') || m.includes('not logged') || m.includes('no_form') || m.includes('no_submit')) return '❌ Authentification échouée. Vérifiez votre pseudo et mot de passe DarkOrbit.';
    if (m.includes('network') || m.includes('fetch') || m.includes('net::')) return '🌐 Erreur réseau. Vérifiez votre connexion internet.';
    if (m.includes('fenêtre') || m.includes('window') || m.includes('browser')) return '⚠️ Impossible d\'ouvrir la fenêtre DarkOrbit. Réessayez.';
    if (m.includes('incomplet') || m.includes('server ou stats')) return '⚠️ Scan incomplet. Assurez-vous d\'être connecté au bon serveur.';
    return '❌ ' + errMsg;
  }

  // ── Progression scan réelle ────────────────────────────────────────────────
  function listenScanProgress(fillEl, textEl) {
    if (typeof window.electronPlayerStatsScraper === 'undefined' || typeof window.electronPlayerStatsScraper.onProgress !== 'function') return;
    if (_progressUnlisten) { _progressUnlisten = null; }
    window.electronPlayerStatsScraper.onProgress(function(d) {
      if (!d) return;
      var pct = typeof d.percent === 'number' ? d.percent : 0;
      var label = d.label || '';
      if (fillEl) fillEl.style.width = pct + '%';
      if (textEl) textEl.textContent = label;
    });
  }

  // ── Bouton scan ────────────────────────────────────────────────────────────
  document.getElementById('registerScanStatsBtn') && document.getElementById('registerScanStatsBtn').addEventListener('click', async function() {
    clearMessages();
    var btn = this;
    var errorInlineEl = document.getElementById('registerScanError');
    var progressWrap = document.getElementById('registerScanProgress');
    var progressFill = document.getElementById('registerScanProgressFill');
    var progressText = document.getElementById('registerScanProgressText');
    var resultCard = document.getElementById('registerScanResultCard');
    var countdownEl = document.getElementById('registerScanCountdown');
    var createBtn = document.getElementById('registerSubmit');
    var submitHint = document.getElementById('registerSubmitHint');
    var doPseudo = document.getElementById('registerDoPseudo') && document.getElementById('registerDoPseudo').value.trim();
    var doPassword = document.getElementById('registerDoPassword') && document.getElementById('registerDoPassword').value;
    var doServer = document.getElementById('registerDoServer') && document.getElementById('registerDoServer').value || 'gbl5';
    var manual = isManualLoginEnabled();

    _registrationScannedStats = null;
    if (createBtn) createBtn.disabled = true;
    if (submitHint) submitHint.textContent = 'Lancez d\'abord le scan pour débloquer la création de compte';
    _scanInProgress = false;
    if (errorInlineEl) { errorInlineEl.textContent = ''; errorInlineEl.style.display = 'none'; }
    if (resultCard) resultCard.classList.remove('visible');
    if (countdownEl) { countdownEl.style.display = 'none'; countdownEl.textContent = ''; }
    if (progressWrap) { progressWrap.style.display = 'none'; if (progressFill) progressFill.style.width = '0%'; }

    function setScanError(msg) {
      if (errorInlineEl) { errorInlineEl.textContent = msg; errorInlineEl.style.display = 'block'; }
      else showError(msg);
    }

    if (typeof window.electronPlayerStatsScraper === 'undefined') {
      setScanError('Le scan est disponible uniquement dans l\'application desktop.');
      return;
    }
    if (manual) {
      if (typeof window.electronPlayerStatsScraper.collectManual !== 'function') {
        setScanError('Connexion manuelle non disponible.');
        return;
      }
    } else {
      if (typeof window.electronPlayerStatsScraper.collectWithLogin !== 'function') {
        setScanError('Le scan est disponible uniquement dans l\'application desktop.');
        return;
      }
      if (!doPseudo || !doPassword) {
        setScanError('Renseignez le pseudo et le mot de passe DarkOrbit.');
        return;
      }
    }

    btn.disabled = true;
    _scanInProgress = true;
    if (progressWrap && progressFill && progressText) {
      progressWrap.style.display = 'block';
      progressFill.style.width = '5%';
      progressText.textContent = 'Démarrage…';
      listenScanProgress(progressFill, progressText);
    }

    if (manual && countdownEl) {
      countdownEl.style.display = 'block';
      countdownEl.textContent = 'Connectez-vous dans la fenêtre ouverte. Détection automatique dans 30 secondes…';
      var remaining = 30;
      var countdownInterval = setInterval(function() {
        remaining--;
        countdownEl.textContent = 'Connectez-vous dans la fenêtre ouverte. Reprise dans ' + remaining + ' seconde' + (remaining > 1 ? 's' : '') + '…';
        if (remaining <= 0) clearInterval(countdownInterval);
      }, 1000);
    }

    try {
      var res = manual
        ? await window.electronPlayerStatsScraper.collectManual({ serverId: doServer })
        : await window.electronPlayerStatsScraper.collectWithLogin({ serverId: doServer, username: doPseudo, password: doPassword });

      if (manual && countdownEl) countdownEl.style.display = 'none';
      _scanInProgress = false;

      if (!res || !res.ok) {
        if (progressWrap) progressWrap.style.display = 'none';
        setScanError(classifyScanError((res && res.error) || ''));
        return;
      }
      var d = res.data || {};
      if (!d.server || (!d.game_pseudo && !d.initial_xp && d.initial_xp !== 0)) {
        if (progressWrap) progressWrap.style.display = 'none';
        setScanError('⚠️ Scan incomplet — serveur ou statistiques manquants.');
        return;
      }

      // Sauvegarder le pseudo pour pré-remplissage futur
      if (doPseudo) { try { localStorage.setItem('do_last_pseudo', doPseudo); } catch (e) {} }

      _registrationScannedStats = {
        game_pseudo: d.game_pseudo || null,
        server: d.server,
        company: d.company || null,
        initial_honor: d.initial_honor != null ? Number(d.initial_honor) : 0,
        initial_xp: d.initial_xp != null ? Number(d.initial_xp) : 0,
        initial_rank: d.initial_rank || null,
        initial_rank_points: d.initial_rank_points != null ? Number(d.initial_rank_points) : 0,
        next_rank_points: d.next_rank_points != null ? Number(d.next_rank_points) : null
      };
      try {
        localStorage.setItem('pending_baseline_scan', JSON.stringify({
          server: d.server, game_pseudo: d.game_pseudo, player_id: d.player_id,
          company: d.company, initial_rank: d.initial_rank, initial_xp: d.initial_xp,
          initial_honor: d.initial_honor, initial_rank_points: d.initial_rank_points,
          next_rank_points: d.next_rank_points
        }));
      } catch (e) {}

      if (progressWrap && progressFill && progressText) {
        progressFill.style.width = '100%';
        progressText.textContent = 'Scan terminé ✅';
      }
      showScanResultCard(_registrationScannedStats);
      if (createBtn) createBtn.disabled = false;
      if (submitHint) submitHint.textContent = '';

    } catch (err) {
      if (manual && countdownEl) countdownEl.style.display = 'none';
      _scanInProgress = false;
      if (progressWrap) progressWrap.style.display = 'none';
      setScanError(classifyScanError(err && err.message ? err.message : ''));
    } finally {
      btn.disabled = false;
    }
  });

  // ── Connexion ──────────────────────────────────────────────────────────────
  document.getElementById('loginEmail') && document.getElementById('loginEmail').addEventListener('input', function() { setLoginInlineError(''); });
  document.getElementById('loginPassword') && document.getElementById('loginPassword').addEventListener('input', function() { setLoginInlineError(''); });

  document.getElementById('authLoginForm') && document.getElementById('authLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    clearMessages();
    var email = document.getElementById('loginEmail') && document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword') && document.getElementById('loginPassword').value;
    if (!email || !password) { showError('Remplissez tous les champs.'); return; }
    var submit = document.getElementById('loginSubmit');
    if (submit) submit.disabled = true;
    var result = await AuthManager.login(email, password);
    if (submit) submit.disabled = false;
    if (result.error) {
      setLoginInlineError(normalizeSupabaseError(result.error));
      return;
    }
    var rememberKey = (window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME) ? window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME : 'darkOrbitRememberMe';
    var remember = document.getElementById('loginRememberMe') && document.getElementById('loginRememberMe').checked;
    try {
      if (remember) localStorage.setItem(rememberKey, JSON.stringify({ email: email }));
      else localStorage.removeItem(rememberKey);
    } catch (err) {}
    showSuccess('Connexion réussie. Redirection…');
    setTimeout(function() { window.location.href = 'index.html'; }, 500);
  });

  // ── Inscription ────────────────────────────────────────────────────────────
  document.getElementById('authRegisterForm') && document.getElementById('authRegisterForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    clearMessages();
    var email = document.getElementById('registerEmail') && document.getElementById('registerEmail').value.trim();
    var emailConfirm = document.getElementById('registerEmailConfirm') && document.getElementById('registerEmailConfirm').value.trim();
    var password = document.getElementById('registerPassword') && document.getElementById('registerPassword').value;

    if (!email || !password) { showError('Email et mot de passe requis.'); return; }
    if (!isValidEmail(email)) { showError('Adresse email invalide.'); return; }
    if (email !== emailConfirm) { showError('Les emails ne correspondent pas.'); return; }
    if (password.length < 6) { showError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (!_registrationScannedStats) {
      showError('Cliquez sur « Lancer le scan » avant de créer le compte.');
      return;
    }

    var registrationData = {
      game_pseudo: _registrationScannedStats.game_pseudo,
      server: _registrationScannedStats.server,
      company: _registrationScannedStats.company,
      initial_honor: _registrationScannedStats.initial_honor,
      initial_xp: _registrationScannedStats.initial_xp,
      initial_rank: _registrationScannedStats.initial_rank,
      initial_rank_points: _registrationScannedStats.initial_rank_points,
      next_rank_points: _registrationScannedStats.next_rank_points
    };
    var submit = document.getElementById('registerSubmit');
    var originalHtml = submit ? submit.innerHTML : '';
    if (submit) {
      submit.disabled = true;
      submit.classList.add('auth-submit--loading');
      submit.innerHTML = '<span class="auth-spinner"></span>Création en cours…';
    }
    var result;
    try {
      result = await AuthManager.register(email, password, registrationData);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.classList.remove('auth-submit--loading');
        submit.innerHTML = originalHtml || 'Créer un compte';
      }
    }
    if (result.error) {
      showError(normalizeSupabaseError(result.error));
      return;
    }

    // Cas : session créée directement (sans email de confirmation)
    if (result.redirectPending) {
      showSuccess('Compte créé ! Redirection…');
      setTimeout(function() { window.location.href = 'index.html'; }, 1500);
      return;
    }

    // Cas standard : email de confirmation envoyé
    var loginEmailEl = document.getElementById('loginEmail');
    if (loginEmailEl && email) loginEmailEl.value = email;

    var countdown = 5;
    function updateMsg() {
      showSuccess('✅ Vérifiez votre email pour activer votre compte. Redirection dans ' + countdown + 's…');
    }
    updateMsg();
    if (typeof showToast === 'function') showToast('Vérifiez votre email pour activer votre compte.', 'info', 5000);
    var redirectTimer = setInterval(function() {
      countdown--;
      if (countdown <= 0) {
        clearInterval(redirectTimer);
        setTab('login');
      } else {
        updateMsg();
      }
    }, 1000);
  });

  // ── Mot de passe oublié ────────────────────────────────────────────────────
  document.getElementById('authForgotBtn') && document.getElementById('authForgotBtn').addEventListener('click', async function() {
    var email = document.getElementById('loginEmail') && document.getElementById('loginEmail').value.trim();
    if (!email) { showError('Entrez votre email pour réinitialiser le mot de passe.'); return; }
    if (typeof getSupabaseClient !== 'function') return;
    var supabase = getSupabaseClient();
    if (!supabase) { showError('Supabase non configuré.'); return; }
    clearMessages();
    var base = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.authRedirectBase) ? window.SUPABASE_CONFIG.authRedirectBase : null;
    var resetUrl = base ? (base.replace(/\/$/, '') + '/reset-password.html') : new URL('reset-password.html', window.location.href).href;
    var res = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });
    if (res.error) { showError(normalizeSupabaseError(res.error.message)); return; }
    showSuccess('Un email de réinitialisation a été envoyé.');
  });

  // ── Remember me + redirection auto si déjà connecté ──────────────────────
  document.getElementById('loginRememberMe') && document.getElementById('loginRememberMe').addEventListener('change', function() {
    if (!this.checked) {
      var rememberKey = (window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME) ? window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME : 'darkOrbitRememberMe';
      try { localStorage.removeItem(rememberKey); } catch (e) {}
    }
  });

  document.addEventListener('DOMContentLoaded', async function() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('password_reset') === '1') {
      showSuccess('Mot de passe mis à jour. Connectez-vous avec votre nouveau mot de passe.');
    }
    var rememberKey = (window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME) ? window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME : 'darkOrbitRememberMe';
    try {
      var raw = localStorage.getItem(rememberKey);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && typeof data.email === 'string') {
          var emailInput = document.getElementById('loginEmail');
          var rememberCheck = document.getElementById('loginRememberMe');
          if (emailInput) emailInput.value = data.email;
          if (rememberCheck) rememberCheck.checked = true;
        }
      }
    } catch (err) {}
    if (typeof getSupabaseClient !== 'function') return;
    var supabase = getSupabaseClient();
    if (!supabase) { window.location.href = 'index.html'; return; }
    var session = await AuthManager.getSession();
    if (session) window.location.href = 'index.html';
  });
})();
