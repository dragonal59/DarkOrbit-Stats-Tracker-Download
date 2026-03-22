// ==========================================
// MODULE: TAB NAVIGATION
// Phase 4 : garde les routes selon permissions
// ==========================================

var _activeTab = null;

function getCurrentTab() {
  return _activeTab;
}

function switchTab(tabName) {
  if (typeof guardRoute === 'function' && !guardRoute(tabName, () => {
    if (typeof currentCanAccessTab === 'function') {
      const first = ['stats', 'history', 'progression', 'events', 'classement', 'coupons', 'settings', 'superadmin'].find(t => (t === 'coupons' ? (typeof currentHasFeature === 'function' && currentHasFeature('couponsTab')) : currentCanAccessTab(t)));
      if (first && first !== tabName) switchTab(first);
    }
  })) return;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  const activeContent = document.getElementById(`tab-${tabName}`);
  
  if (activeBtn) activeBtn.classList.add('active');
  if (activeContent) activeContent.classList.add('active');
  _activeTab = tabName;
  window._activeTab = tabName;

  var eventsSidebar = document.querySelector('.events-sidebar');
  var boosterSidebar = document.querySelector('.booster-sidebar');
  if (tabName === 'superadmin') {
    if (eventsSidebar) eventsSidebar.style.display = 'none';
    if (boosterSidebar) boosterSidebar.style.display = 'none';
    if (typeof window.initDashboardSubTabs === 'function') window.initDashboardSubTabs();
  } else {
    if (typeof window.applyBoosterVisibility === 'function') window.applyBoosterVisibility();
    if (typeof window.applySidebarVisibility === 'function') window.applySidebarVisibility();
  }

  if (tabName === 'classement') {
    if (typeof window.refreshRanking !== 'function' && document.getElementById('ranking-table') && typeof initRankingTab === 'function') {
      initRankingTab();
    }
    if (typeof window.refreshRanking === 'function') window.refreshRanking();
  }

  if (tabName === 'coupons') {
    if (typeof window.refreshCouponsUI === 'function') window.refreshCouponsUI();
  }

  if (tabName === 'progression') {
    if (typeof window.initProgressionTab === 'function') window.initProgressionTab();
    if (typeof window.renderProgression === 'function') window.renderProgression();
  }

  if (tabName === 'stats') {
    if (typeof window.initCollectStatsFromGameButton === 'function') window.initCollectStatsFromGameButton();
    if (typeof window.refreshEventsFromSupabase === 'function') window.refreshEventsFromSupabase();
  }
}

// Initialiser les event listeners pour les onglets
function initTabNavigation() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
}

window.getCurrentTab = getCurrentTab;
