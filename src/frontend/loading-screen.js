(function() {
  var TIMEOUT_MS = 10000;
  var overlay, barFill, stepEl, stepDots, errorWrap, errorMsg, retryBtn;
  var timeoutId, onRetryCb, dotsInterval;

  function init() {
    overlay = document.getElementById('app-loading-overlay');
    barFill = document.getElementById('appLoadingBarFill');
    stepEl = document.getElementById('appLoadingStep');
    stepDots = stepEl && stepEl.querySelector('.app-loading-dots');
    errorWrap = overlay && overlay.querySelector('.app-loading-error-wrap');
    errorMsg = document.getElementById('appLoadingErrorMsg');
    retryBtn = document.getElementById('appLoadingRetryBtn');
    if (!overlay || !barFill || !stepEl) return;
    if (retryBtn) retryBtn.addEventListener('click', function() {
      if (onRetryCb) onRetryCb();
    });
    initParticles();
    initVersion();
    startDotsAnimation();
  }

  function initParticles() {
    var container = document.getElementById('appLoadingParticles');
    if (!container) return;
    var count = 60 + Math.floor(Math.random() * 21);
    var largeCount = Math.max(1, Math.floor(count * 0.1));
    for (var i = 0; i < count; i++) {
      var dot = document.createElement('span');
      dot.className = 'app-loading-particle';
      var size = i < largeCount ? 3 : 1 + Math.random();
      var duration = 1.5 + Math.random() * 2.5;
      var delay = Math.random() * 3;
      var drift = 5 + Math.random() * 5;
      var opacity = 0.3 + Math.random() * 0.6;
      dot.style.cssText = 'left:' + (Math.random() * 100) + '%;top:' + (Math.random() * 100) + '%;width:' + size + 'px;height:' + size + 'px;animation-duration:' + duration + 's;animation-delay:' + delay + 's;--particle-opacity:' + opacity + ';--drift:' + drift + 'px;';
      if (size >= 2.5) dot.classList.add('app-loading-particle--large');
      container.appendChild(dot);
    }
  }

  function initVersion() {
    var el = document.getElementById('appLoadingVersion');
    if (!el) return;
    if (typeof window.electronApp === 'object' && typeof window.electronApp.getVersion === 'function') {
      window.electronApp.getVersion().then(function(v) { if (v) el.textContent = 'v' + v; }).catch(function() {});
    }
  }

  function startDotsAnimation() {
    if (!stepDots) return;
    var n = 0;
    dotsInterval = setInterval(function() {
      if (!overlay || overlay.classList.contains('app-loading-done')) {
        clearInterval(dotsInterval);
        return;
      }
      n = (n + 1) % 4;
      stepDots.textContent = '.'.repeat(n);
    }, 400);
  }

  function setProgress(percent, text) {
    if (!barFill || !stepEl) return;
    barFill.style.width = Math.min(100, Math.max(0, percent)) + '%';
    var base = (text || '').replace(/\.+$/, '');
    var first = stepEl.firstChild;
    if (first && first.nodeType === 3) first.textContent = base;
    else if (stepDots) stepEl.insertBefore(document.createTextNode(base), stepDots);
    else stepEl.textContent = base;
  }

  function showError(msg) {
    if (!overlay) return;
    clearTimeout(timeoutId);
    overlay.classList.add('app-loading-error');
    overlay.classList.remove('app-loading-done');
    if (errorMsg) errorMsg.textContent = msg || 'Le chargement a pris trop de temps.';
  }

  function hideOverlay() {
    if (!overlay) return;
    if (dotsInterval) { clearInterval(dotsInterval); dotsInterval = null; }
    overlay.classList.add('app-loading-done');
    overlay.classList.remove('app-loading-error');
  }

  function done() {
    if (!overlay) return;
    if (dotsInterval) { clearInterval(dotsInterval); dotsInterval = null; }
    stopTimeout();
    setProgress(100, 'Prêt');
    overlay.classList.add('app-loading-done');
    overlay.classList.remove('app-loading-error');
    var content = document.getElementById('app-content');
    if (content) content.style.display = '';
    setTimeout(function() {
      if (overlay) overlay.style.display = 'none';
    }, 450);
  }

  function reset() {
    if (!overlay) return;
    overlay.classList.remove('app-loading-error', 'app-loading-done');
    overlay.style.display = '';
    setProgress(0, 'Connexion à Supabase...');
    var content = document.getElementById('app-content');
    if (content) content.style.display = 'none';
  }

  function startTimeout(cb) {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(function() {
      timeoutId = null;
      showError('Le chargement a pris trop de temps.');
      if (cb) cb();
    }, TIMEOUT_MS);
  }

  function stopTimeout() {
    if (timeoutId) { window.clearTimeout(timeoutId); timeoutId = null; }
  }

  window.AppLoader = {
    init: init,
    setProgress: setProgress,
    done: done,
    showError: showError,
    hideOverlay: hideOverlay,
    reset: reset,
    startTimeout: startTimeout,
    clearTimeout: stopTimeout,
    onRetry: function(cb) { onRetryCb = cb; }
  };
})();
