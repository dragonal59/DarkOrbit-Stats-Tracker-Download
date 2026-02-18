// ==========================================
// Logique des écrans de connexion / inscription
// ==========================================

(function() {
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');

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
  }

  function setTab(active) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === active));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('active', f.id === (active === 'login' ? 'authLoginForm' : 'authRegisterForm')));
    clearMessages();
  }

  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

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
      if (result.error.includes('Invalid login')) showError('Email ou mot de passe incorrect.');
      else showError(result.error);
      return;
    }
    var rememberKey = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS && window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME) ? window.APP_KEYS.STORAGE_KEYS.REMEMBER_ME : 'darkOrbitRememberMe';
    try {
      if (remember) {
        localStorage.setItem(rememberKey, JSON.stringify({ email: email, password: password }));
      } else {
        localStorage.removeItem(rememberKey);
      }
    } catch (err) {
      console.warn('Remember me storage:', err);
    }
    showSuccess('Connexion réussie. Redirection...');
    setTimeout(() => { window.location.href = 'index.html'; }, 500);
  });

  document.getElementById('authRegisterForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    const email = document.getElementById('registerEmail')?.value?.trim();
    const password = document.getElementById('registerPassword')?.value;
    const gamePseudo = document.getElementById('registerGamePseudo')?.value?.trim();
    const server = document.getElementById('registerServer')?.value?.trim();
    const company = document.getElementById('registerCompany')?.value?.trim();
    const honor = document.getElementById('registerHonor')?.value;
    const xp = document.getElementById('registerXp')?.value;
    const initialRank = document.getElementById('registerInitialRank')?.value?.trim();
    const rankPoints = document.getElementById('registerRankPoints')?.value;
    const nextRankPoints = document.getElementById('registerNextRankPoints')?.value;
    if (!email || !password) { showError('Email et mot de passe requis.'); return; }
    if (password.length < 6) { showError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
    if (!gamePseudo) { showError('Le pseudo DarkOrbit est requis.'); return; }
    if (!server) { showError('Le serveur de jeu est requis.'); return; }
    if (!company) { showError('La firme est requise.'); return; }
    if (honor === '' || honor === null || Number(honor) < 0) { showError('L\'honneur actuel est requis (min. 0).'); return; }
    if (xp === '' || xp === null || Number(xp) < 0) { showError('L\'XP actuel est requis (min. 0).'); return; }
    if (!initialRank) { showError('Le grade actuel est requis.'); return; }
    if (rankPoints === '' || rankPoints === null || Number(rankPoints) < 0) { showError('Les points de grade actuels sont requis (min. 0).'); return; }
    if (nextRankPoints === '' || nextRankPoints === null || Number(nextRankPoints) < 1) { showError('Les points pour le grade suivant sont requis (min. 1).'); return; }
    const registrationData = {
      game_pseudo: gamePseudo,
      server: server,
      company: company,
      initial_honor: Number(honor),
      initial_xp: Number(xp),
      initial_rank: initialRank,
      initial_rank_points: Number(rankPoints),
      next_rank_points: Number(nextRankPoints)
    };
    const submit = document.getElementById('registerSubmit');
    if (submit) submit.disabled = true;
    const result = await AuthManager.register(email, password, registrationData);
    if (submit) submit.disabled = false;
    if (result.error) {
      if (result.error.includes('already registered')) showError('Cet email est déjà utilisé.');
      else showError(result.error);
      return;
    }
    if (result.redirectPending) {
      showSuccess('Compte créé. Redirection...');
      setTimeout(() => { window.location.href = 'pending-verification.html'; }, 500);
      return;
    }
    showSuccess('Compte créé ! Vérifiez votre email pour confirmer, puis connectez-vous.');
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
        if (data && typeof data.email === 'string' && typeof data.password === 'string') {
          var emailInput = document.getElementById('loginEmail');
          var passwordInput = document.getElementById('loginPassword');
          var rememberCheck = document.getElementById('loginRememberMe');
          if (emailInput) emailInput.value = data.email;
          if (passwordInput) passwordInput.value = data.password;
          if (rememberCheck) rememberCheck.checked = true;
        }
      }
    } catch (err) {
      console.warn('Remember me load:', err);
    }
    const rankSelect = document.getElementById('registerInitialRank');
    if (rankSelect && typeof RANKS_DATA !== 'undefined' && Array.isArray(RANKS_DATA)) {
      RANKS_DATA.forEach(function(r) {
        const opt = document.createElement('option');
        opt.value = r.name;
        opt.textContent = r.name;
        rankSelect.appendChild(opt);
      });
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      window.location.href = 'index.html';
      return;
    }
    const session = await AuthManager.getSession();
    if (session) window.location.href = 'index.html';
  });
})();
