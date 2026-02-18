// ==========================================
// MODULE: TAB NAVIGATION
// Phase 4 : garde les routes selon permissions
// ==========================================

function switchTab(tabName) {
  if (typeof guardRoute === 'function' && !guardRoute(tabName, () => {
    if (typeof currentCanAccessTab === 'function') {
      const first = ['stats', 'progression', 'history', 'events', 'classement', 'settings', 'superadmin'].find(t => currentCanAccessTab(t));
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

  if (tabName === 'classement') {
    if (typeof window.refreshRanking !== 'function' && document.getElementById('ranking-table') && typeof initRankingTab === 'function') {
      initRankingTab();
    }
    if (typeof window.refreshRanking === 'function') window.refreshRanking();
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

console.log('📑 Module Tabs chargé');