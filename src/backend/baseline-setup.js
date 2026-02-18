// ==========================================
// MODULE: BASELINE SETUP (seuil de départ)
// Modal au premier lancement pour saisir le seuil de départ
// ==========================================

let _baselineListenersAttached = false;

function initBaselineSetup(forceShow) {
  const sessions = typeof getSessions === 'function' ? getSessions() : [];
  const modal = document.getElementById('baselineSetupModal');
  if (!modal) return;

  const shouldShow = forceShow || (typeof shouldShowBaselineModal === 'function' && shouldShowBaselineModal(sessions));
  if (!shouldShow) {
    modal.style.display = 'none';
    return;
  }

  // Toujours attacher au body en premier pour éviter d'être masqué par un parent (ex. .main-content)
  if (modal.parentNode !== document.body) {
    document.body.appendChild(modal);
  }
  // Sans session (ex. après effacement historique), garantir que la zone principale est visible
  if (sessions.length === 0 && typeof setAppAccessFromSessions === 'function') {
    setAppAccessFromSessions(1);
  }
  modal.style.display = 'flex';

  // Débloquer la saisie après ouverture (effacer historique / vider cache / réinitialiser seuil + confirm) :
  // sous Electron le focus reste piégé ; blur + focus différé avec court délai pour forcer l’activation.
  var firstInput = document.getElementById('baselineHonor');
  if (firstInput) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var focusModal = function () {
      firstInput.focus();
    };
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        focusModal();
      });
    });
    setTimeout(focusModal, 120);
  }

  const gradeSelect = document.getElementById('baselineGrade');
  const gradeImg = document.getElementById('baselineGradeImg');
  if (gradeSelect && typeof RANKS_DATA !== 'undefined' && RANKS_DATA.length > 0 && gradeSelect.options.length <= 1) {
    gradeSelect.innerHTML = '<option value="">Sélectionner votre grade</option>';
    RANKS_DATA.forEach(function(r) {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.setAttribute('data-rank', String(r.rankPoints || 0));
      opt.textContent = r.name;
      gradeSelect.appendChild(opt);
    });
  }

  function updateBaselineGradeImg() {
    if (!gradeImg || !gradeSelect) return;
    const name = gradeSelect.value || '';
    const rank = typeof RANKS_DATA !== 'undefined' ? RANKS_DATA.find(function(r) { return r.name === name; }) : null;
    if (rank && rank.img) {
      gradeImg.src = rank.img;
      gradeImg.alt = name;
      gradeImg.style.display = '';
    } else {
      gradeImg.src = '';
      gradeImg.style.display = 'none';
    }
  }

  if (forceShow) {
    const h = document.getElementById('baselineHonor');
    const x = document.getElementById('baselineXp');
    const r = document.getElementById('baselineRankPoints');
    const n = document.getElementById('baselineNextRankPoints');
    if (h) h.value = '';
    if (x) x.value = '';
    if (gradeSelect) gradeSelect.value = '';
    if (r) r.value = '';
    if (n) n.value = '';
    updateBaselineGradeImg();
  }

  if (_baselineListenersAttached) {
    updateBaselineGradeImg();
    return;
  }
  _baselineListenersAttached = true;

  const honorInput = document.getElementById('baselineHonor');
  const xpInput = document.getElementById('baselineXp');
  const rankPointsInput = document.getElementById('baselineRankPoints');
  const nextRankPointsInput = document.getElementById('baselineNextRankPoints');
  const saveBtn = document.getElementById('baselineSaveBtn');

  if (!honorInput || !xpInput || !gradeSelect || !saveBtn) return;

  function attachBaselineInputFormat(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      const parsed = this.value.replace(/\D/g, '');
      this.value = parsed ? Number(parsed).toLocaleString('en-US') : '';
    });
  }
  attachBaselineInputFormat(honorInput);
  attachBaselineInputFormat(xpInput);
  attachBaselineInputFormat(rankPointsInput);
  attachBaselineInputFormat(nextRankPointsInput);

  gradeSelect.addEventListener('change', () => {
    updateBaselineGradeImg();
  });

  function parseNum(val) {
    return parseInt(String(val || '').replace(/[\s,]/g, ''), 10) || 0;
  }

  saveBtn.addEventListener('click', () => {
    const honor = parseNum(honorInput.value);
    const xp = parseNum(xpInput.value);
    const currentRank = gradeSelect.value || '';
    let rankPoints = parseNum(rankPointsInput.value);
    if (rankPoints === 0 && currentRank && typeof RANKS_DATA !== 'undefined') {
      const rd = RANKS_DATA.find(r => r.name === currentRank);
      if (rd) rankPoints = rd.rankPoints || 0;
    }
    let nextRankPoints = parseNum(nextRankPointsInput ? nextRankPointsInput.value : '');
    if (nextRankPoints === 0) nextRankPoints = rankPoints;

    // Validation non bloquante : les valeurs négatives sont ramenées à 0 (saisie toujours possible)
    if (honor < 0 || xp < 0 || rankPoints < 0 || nextRankPoints < 0) {
      if (typeof showToast === 'function') showToast('Valeurs négatives remplacées par 0', 'warning');
    }
    const safeHonor = Math.max(0, honor);
    const safeXp = Math.max(0, xp);
    const safeRankPoints = Math.max(0, rankPoints);
    const safeNextRankPoints = Math.max(0, nextRankPoints);

    if (!currentRank || currentRank.trim() === '') {
      if (typeof showToast === 'function') showToast('Veuillez sélectionner votre grade', 'warning');
      return;
    }

    if (typeof saveBaselineSession === 'function') {
      saveBaselineSession({
        honor: safeHonor,
        xp: safeXp,
        rankPoints: safeRankPoints,
        nextRankPoints: safeNextRankPoints,
        currentRank: currentRank.trim()
      });
    }

    modal.style.display = 'none';
    if (typeof showToast === 'function') showToast('Seuil de départ enregistré !', 'success');

    if (typeof renderHistory === 'function') renderHistory();
    if (typeof updateProgressionTab === 'function') updateProgressionTab();
    if (typeof loadCurrentStats === 'function') loadCurrentStats();
    if (typeof setAppAccessFromSessions === 'function') setAppAccessFromSessions(typeof getSessions === 'function' ? getSessions().length : 1);
  });
}

window.initBaselineSetup = initBaselineSetup;

// Garde : sans session, toute interaction avec l'app rouvre le modal baseline
// En phase bulle (capture: false) pour ne pas bloquer les clics/saisie dans le modal (Electron / focus)
let _baselineGuardAttached = false;
function attachBaselineGuard() {
  if (_baselineGuardAttached) return;
  _baselineGuardAttached = true;
  document.addEventListener('click', function baselineGuard(e) {
    const modal = document.getElementById('baselineSetupModal');
    if (!modal || typeof getSessions !== 'function') return;
    const sessions = getSessions() || [];
    if (sessions.length > 0) return;
    if (modal.style.display === 'flex') return;
    const appLayout = document.querySelector('.app-layout');
    if (!appLayout || !appLayout.contains(e.target)) return;
    if (modal.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    initBaselineSetup(true);
  }, false);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachBaselineGuard);
} else {
  attachBaselineGuard();
}
