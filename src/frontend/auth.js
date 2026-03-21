// ==========================================
// Logique des écrans de connexion / inscription
// ==========================================

(function() {
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  let _registrationScannedStats = null;
  let _scanInProgress = false;
  const loginInlineErrorEl = document.getElementById('loginInlineError');

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
    if (loginInlineErrorEl) {
      loginInlineErrorEl.textContent = '';
      loginInlineErrorEl.style.display = 'none';
    }
  }

  function setLoginInlineError(msg) {
    if (!loginInlineErrorEl) return;
    if (msg) {
      loginInlineErrorEl.textContent = msg;
      loginInlineErrorEl.style.display = 'block';
    } else {
      loginInlineErrorEl.textContent = '';
      loginInlineErrorEl.style.display = 'none';
    }
  }

  function isManualLoginEnabled() {
    const t = document.getElementById('registerManualLoginToggle');
    return t && t.classList.contains('active');
  }
  function updateScanButtonState() {
    const btn = document.getElementById('registerScanStatsBtn');
    const manual = isManualLoginEnabled();
    if (manual) {
      if (btn) btn.disabled = false;
    } else {
      const pseudo = document.getElementById('registerDoPseudo')?.value?.trim();
      const pwd = document.getElementById('registerDoPassword')?.value;
      if (btn) btn.disabled = !(pseudo && pwd);
    }
  }
  function applyManualToggleState() {
    const t = document.getElementById('registerManualLoginToggle');
    const pseudo = document.getElementById('registerDoPseudo');
    const pwd = document.getElementById('registerDoPassword');
    const hint = document.getElementById('registerScanHint');
    if (!t) return;
    const manual = t.classList.contains('active');
    if (pseudo) { pseudo.disabled = manual; if (manual) pseudo.value = ''; }
    if (pwd) { pwd.disabled = manual; if (manual) pwd.value = ''; }
    if (hint) hint.textContent = manual ? 'Sélectionnez le serveur et lancez le scan. Une fenêtre s\'ouvrira : connectez-vous manuellement, puis attendez 30 secondes.' : 'Entrez vos identifiants DarkOrbit puis lancez le scan. Ils ne sont jamais enregistrés.';
    updateScanButtonState();
  }

  const serverSelect = document.getElementById('registerDoServer');
  if (serverSelect && typeof window.SERVER_CODE_TO_DISPLAY !== 'undefined') {
    const codes = Object.keys(window.SERVER_CODE_TO_DISPLAY).sort();
    codes.forEach(function (code) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = window.SERVER_CODE_TO_DISPLAY[code];
      if (code === 'gbl5') opt.selected = true;
      serverSelect.appendChild(opt);
    });
  }
  document.getElementById('registerDoPseudo')?.addEventListener('input', updateScanButtonState);
  document.getElementById('registerDoPassword')?.addEventListener('input', updateScanButtonState);
  const manualToggle = document.getElementById('registerManualLoginToggle');
  if (manualToggle) {
    manualToggle.addEventListener('click', function () {
      this.classList.toggle('active');
      this.setAttribute('aria-checked', this.classList.contains('active'));
      applyManualToggleState();
    });
    manualToggle.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.click(); }
    });
  }
  updateScanButtonState();
  var scanHintEl = document.getElementById('registerScanHint');
  if (scanHintEl) scanHintEl.textContent = 'Entrez vos identifiants DarkOrbit puis lancez le scan. Ils ne sont jamais enregistrés.';

  function setTab(active) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === active));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('active', f.id === (active === 'login' ? 'authLoginForm' : 'authRegisterForm')));
    clearMessages();
  }

  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  document.getElementById('loginEmail')?.addEventListener('input', function () {
    setLoginInlineError('');
  });
  document.getElementById('loginPassword')?.addEventListener('input', function () {
    setLoginInlineError('');
  });

  async function handleLoginError(email, rawError) {
    setLoginInlineError('');
    // Si Supabase n'est pas dispo, fallback générique
    if (typeof getSupabaseClient !== 'function') {
      setLoginInlineError('Email ou mot de passe incorrect.');
      return;
    }
    const supabase = getSupabaseClient();
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();
      if (data && data.id) {
        // Email existe, mot de passe incorrect
        setLoginInlineError('Mot de passe incorrect.');
      } else if (error) {
        // Aucun profil trouvé
        setLoginInlineError('Cette adresse email n\'est associée à aucun compte.');
      } else {
        setLoginInlineError('Email ou mot de passe incorrect.');
      }
    } catch (e) {
      setLoginInlineError('Email ou mot de passe incorrect.');
    }
  }

  document.getElementById('authLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;
    const rememberEl = document.getElementById('loginRememberMe');
    const remember = rememberEl ? rememberEl.checked : false;
    if (!email || !password) { showError('Remplissez tous les champs.'); return; }
    const submit = document.getElementById('loginSubmit');
    if (submit) submit.disabled = true;
    const result = await AuthManager.login(email, password);
    if (submit) submit.disabled = false;
    if (result.error) {
      await handleLoginError(email, result.error);
      return;
    }
    var rememberKey = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME) ? window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME : 'darkOrbitRememberMe';
    try {
      if (remember) {
        localStorage.setItem(rememberKey, JSON.stringify({ email: email }));
      } else {
        localStorage.removeItem(rememberKey);
      }
    } catch (err) {
      if (window.DEBUG) Logger.warn('Remember me storage:', err);
    }
    showSuccess('Connexion réussie. Redirection...');
    setTimeout(() => { window.location.href = 'index.html'; }, 500);
  });

  const registerSubmitBtn = document.getElementById('registerSubmit');
  if (registerSubmitBtn) registerSubmitBtn.disabled = true;

  document.getElementById('registerScanStatsBtn')?.addEventListener('click', async function() {
    clearMessages();
    const btn = this;
    const resultEl = document.getElementById('registerScanResult');
    const countdownEl = document.getElementById('registerScanCountdown');
    const errorInlineEl = document.getElementById('registerScanError');
    const progressWrap = document.getElementById('registerScanProgress');
    const progressFill = progressWrap ? progressWrap.querySelector('.auth-scan-progress-fill') : null;
    const progressText = document.getElementById('registerScanProgressText');
    const createBtn = document.getElementById('registerSubmit');
    const doPseudo = document.getElementById('registerDoPseudo')?.value?.trim();
    const doPassword = document.getElementById('registerDoPassword')?.value;
    const doServer = document.getElementById('registerDoServer')?.value || 'gbl5';
    const manual = isManualLoginEnabled();
    _registrationScannedStats = null;
    if (createBtn) createBtn.disabled = true;
    _scanInProgress = false;
    if (errorInlineEl) { errorInlineEl.textContent = ''; errorInlineEl.style.display = 'none'; }
    if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; }
    if (countdownEl) { countdownEl.style.display = 'none'; countdownEl.textContent = ''; }
    if (progressWrap) {
      progressWrap.style.display = 'none';
      if (progressFill) progressFill.style.width = '0%';
    }
    function setScanError(msg) {
      if (errorInlineEl) {
        if (msg) {
          errorInlineEl.textContent = msg;
          errorInlineEl.style.display = 'block';
        } else {
          errorInlineEl.textContent = '';
          errorInlineEl.style.display = 'none';
        }
      } else {
        showError(msg);
      }
    }
    if (typeof window.electronPlayerStatsScraper === 'undefined') {
      setScanError('Lancer le scan est disponible uniquement dans l\'application desktop.');
      return;
    }
    if (manual) {
      if (typeof window.electronPlayerStatsScraper.collectManual !== 'function') {
        setScanError('Connexion manuelle non disponible.');
        return;
      }
    } else {
      if (typeof window.electronPlayerStatsScraper.collectWithLogin !== 'function') {
        setScanError('Lancer le scan est disponible uniquement dans l\'application desktop.');
        return;
      }
      if (!doPseudo || !doPassword) {
        setScanError('Renseignez le pseudo et le mot de passe DarkOrbit.');
        return;
      }
    }
    btn.disabled = true;
    _scanInProgress = true;
    let step2Timer = null;
    if (progressWrap && progressFill && progressText) {
      progressWrap.style.display = 'block';
      progressFill.style.width = '33%';
      progressText.textContent = 'Connexion à DarkOrbit...';
      step2Timer = setTimeout(function () {
        if (!_scanInProgress) return;
        progressFill.style.width = '66%';
        progressText.textContent = 'Récupération du profil...';
      }, 1200);
    }
    if (manual && countdownEl) {
      countdownEl.style.display = 'block';
      countdownEl.textContent = 'Connectez-vous sur DarkOrbit dans la fenêtre ouverte. Reprise automatique dans 30 secondes...';
      var remaining = 30;
      var countdownInterval = setInterval(function () {
        remaining--;
        countdownEl.textContent = 'Connectez-vous sur DarkOrbit dans la fenêtre ouverte. Reprise automatique dans ' + remaining + ' seconde' + (remaining > 1 ? 's' : '') + '...';
        if (remaining <= 0) clearInterval(countdownInterval);
      }, 1000);
    }
    try {
      var res = manual
        ? await window.electronPlayerStatsScraper.collectManual({ serverId: doServer })
        : await window.electronPlayerStatsScraper.collectWithLogin({ serverId: doServer, username: doPseudo, password: doPassword });
      if (manual && countdownEl) countdownEl.style.display = 'none';
      if (!res.ok) {
        _scanInProgress = false;
        if (step2Timer) { clearTimeout(step2Timer); step2Timer = null; }
        if (progressWrap) progressWrap.style.display = 'none';
        setScanError(res.error || 'Authentification échouée, vérifiez vos identifiants DarkOrbit.');
        return;
      }
      var d = res.data || {};
      if (!d.server || (!d.game_pseudo && !d.initial_xp && d.initial_xp !== 0)) {
        _scanInProgress = false;
        if (step2Timer) { clearTimeout(step2Timer); step2Timer = null; }
        if (progressWrap) progressWrap.style.display = 'none';
        setScanError('Scan incomplet (serveur ou stats manquants).');
        return;
      }
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
          server: d.server,
          game_pseudo: d.game_pseudo,
          player_id: d.player_id,
          company: d.company,
          initial_rank: d.initial_rank,
          initial_xp: d.initial_xp,
          initial_honor: d.initial_honor,
          initial_rank_points: d.initial_rank_points,
          next_rank_points: d.next_rank_points
        }));
      } catch (e) {}
      if (resultEl) {
        resultEl.textContent = 'Stats scannées : ' + (_registrationScannedStats.game_pseudo || '—') + ' · ' + _registrationScannedStats.server + ' · Base enregistrée à la création du compte.';
        resultEl.style.display = 'block';
      }
      showSuccess('Scan réussi. Vous pouvez créer votre compte.');
      _scanInProgress = false;
      if (step2Timer) { clearTimeout(step2Timer); step2Timer = null; }
      if (progressWrap && progressFill && progressText) {
        progressWrap.style.display = 'block';
        progressFill.style.width = '100%';
        progressText.textContent = 'Scan terminé ✅';
      }
      if (createBtn) createBtn.disabled = false;
    } catch (err) {
      if (manual && countdownEl) countdownEl.style.display = 'none';
      _scanInProgress = false;
      if (step2Timer) { clearTimeout(step2Timer); step2Timer = null; }
      if (progressWrap) progressWrap.style.display = 'none';
      setScanError(err && err.message ? err.message : 'Authentification échouée, vérifiez vos identifiants DarkOrbit.');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('authRegisterForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    const email = document.getElementById('registerEmail')?.value?.trim();
    const password = document.getElementById('registerPassword')?.value;
    if (!email || !password) { showError('Email et mot de passe requis.'); return; }
    if (password.length < 6) { showError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (!_registrationScannedStats) {
      showError('Cliquez sur « Lancer le scan » avant de créer le compte.');
      return;
    }
    const registrationData = {
      game_pseudo: _registrationScannedStats.game_pseudo,
      server: _registrationScannedStats.server,
      company: _registrationScannedStats.company,
      initial_honor: _registrationScannedStats.initial_honor,
      initial_xp: _registrationScannedStats.initial_xp,
      initial_rank: _registrationScannedStats.initial_rank,
      initial_rank_points: _registrationScannedStats.initial_rank_points,
      next_rank_points: _registrationScannedStats.next_rank_points
    };
    const submit = document.getElementById('registerSubmit');
    const originalHtml = submit ? submit.innerHTML : '';
    if (submit) {
      submit.disabled = true;
      submit.classList.add('auth-submit--loading');
      submit.innerHTML = '<span class="auth-spinner"></span>Création en cours...';
    }
    let result;
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
      if (result.error.includes('already registered')) showError('Cet email est déjà utilisé.');
      else showError(result.error);
      return;
    }
    var infoMsg = 'Veuillez vérifier votre email pour activer votre compte';
    showSuccess(infoMsg);
    if (typeof showToast === 'function') {
      showToast(infoMsg, 'info', 4000);
    }
    var loginEmailEl = document.getElementById('loginEmail');
    if (loginEmailEl && email) loginEmailEl.value = email;
    setTimeout(function () {
      setTab('login');
    }, 4000);
  });

  document.getElementById('loginRememberMe')?.addEventListener('change', function() {
    if (!this.checked) {
      var rememberKey = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME) ? window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME : 'darkOrbitRememberMe';
      try { localStorage.removeItem(rememberKey); } catch (e) {}
    }
  });

  document.getElementById('authForgotBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail')?.value?.trim();
    if (!email) { showError('Entrez votre email pour réinitialiser le mot de passe.'); return; }
    if (typeof getSupabaseClient !== 'function') return;
    const supabase = getSupabaseClient();
    if (!supabase) { showError('Supabase non configuré.'); return; }
    clearMessages();
    var base = (typeof window !== 'undefined' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.authRedirectBase) ? window.SUPABASE_CONFIG.authRedirectBase : null;
    var resetUrl = base ? (base.replace(/\/$/, '') + '/reset-password.html') : new URL('reset-password.html', window.location.href).href;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });
    if (error) { showError(error.message); return; }
    showSuccess('Un email de réinitialisation a été envoyé.');
  });

  document.addEventListener('DOMContentLoaded', async () => {
    var params = new URLSearchParams(window.location.search);
    if (params.get('password_reset') === '1') {
      showSuccess('Mot de passe mis à jour. Connectez-vous avec votre nouveau mot de passe.');
    }
    var rememberKey = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME) ? window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME : 'darkOrbitRememberMe';
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
    } catch (err) {
      if (window.DEBUG) Logger.warn('Remember me load:', err);
    }
    if (typeof getSupabaseClient !== 'function') return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      window.location.href = 'index.html';
      return;
    }
    const session = await AuthManager.getSession();
    if (session) {
      window.location.href = 'index.html';
    }
  });
})();
