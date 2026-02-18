// ==========================================
// MODULE: SESSION COMPARISON
// ==========================================

function populateComparisonSelectors(sessions) {
  const select1 = document.getElementById('compareSession1');
  const select2 = document.getElementById('compareSession2');
  
  const options = sessions.map(s => {
    const date = new Date(s.timestamp).toLocaleDateString('fr-FR');
    return `<option value="${s.id}">${date} - ${s.currentRank}</option>`;
  }).join('');
  
  select1.innerHTML = '<option value="">Sélectionner une session...</option>' + options;
  select2.innerHTML = '<option value="">Sélectionner une session...</option>' + options;
}

function compareSessions() {
  const id1 = document.getElementById('compareSession1').value;
  const id2 = document.getElementById('compareSession2').value;
  
  if (!id1 || !id2) {
    showToast("Veuillez sélectionner 2 sessions", "warning");
    return;
  }
  
  if (id1 === id2) {
    showToast("Veuillez sélectionner 2 sessions différentes", "warning");
    return;
  }
  
  const sessions = getSessions();
  const session1 = sessions.find(s => s.id == id1);
  const session2 = sessions.find(s => s.id == id2);
  
  if (!session1 || !session2) return;
  
  const diffHonor = session2.honor - session1.honor;
  const diffXp = session2.xp - session1.xp;
  const diffRank = session2.rankPoints - session1.rankPoints;
  
  const rank1Data = RANKS_DATA.find(r => r.name === session1.currentRank);
  const rank2Data = RANKS_DATA.find(r => r.name === session2.currentRank);
  
  const result = document.getElementById('comparisonResult');
  result.style.display = 'block';
  result.innerHTML = `
    <div class="comparison-result-grid">
      <div class="comparison-session-card">
        <div class="comparison-session-header">
          📅 ${new Date(session1.timestamp).toLocaleDateString('fr-FR')}
        </div>
        <div class="comparison-session-rank">
          ${rank1Data ? `<img src="${rank1Data.img}" class="rank-img-history">` : ''}
          <span>${session1.currentRank}</span>
        </div>
        <div class="comparison-stats-list">
          <div class="comparison-stat-item">
            <span class="comparison-stat-label">Honneur</span>
            <span class="comparison-stat-value">${session1.honor.toLocaleString('en-US')}</span>
          </div>
          <div class="comparison-stat-item">
            <span class="comparison-stat-label">XP</span>
            <span class="comparison-stat-value">${session1.xp.toLocaleString('en-US')}</span>
          </div>
          <div class="comparison-stat-item">
            <span class="comparison-stat-label">Points de grade</span>
            <span class="comparison-stat-value">${session1.rankPoints.toLocaleString('en-US')}</span>
          </div>
        </div>
      </div>
      
      <div class="comparison-session-card">
        <div class="comparison-session-header">
          📅 ${new Date(session2.timestamp).toLocaleDateString('fr-FR')}
        </div>
        <div class="comparison-session-rank">
          ${rank2Data ? `<img src="${rank2Data.img}" class="rank-img-history">` : ''}
          <span>${session2.currentRank}</span>
        </div>
        <div class="comparison-stats-list">
          <div class="comparison-stat-item">
            <span class="comparison-stat-label">Honneur</span>
            <span class="comparison-stat-value">${session2.honor.toLocaleString('en-US')}</span>
          </div>
          <div class="comparison-stat-item">
            <span class="comparison-stat-label">XP</span>
            <span class="comparison-stat-value">${session2.xp.toLocaleString('en-US')}</span>
          </div>
          <div class="comparison-stat-item">
            <span class="comparison-stat-label">Points de grade</span>
            <span class="comparison-stat-value">${session2.rankPoints.toLocaleString('en-US')}</span>
          </div>
        </div>
      </div>
      
      <div class="comparison-diff-card">
        <div class="comparison-diff-title">📊 Différence</div>
        <div class="comparison-diff-grid">
          <div class="comparison-diff-item">
            <div class="comparison-diff-label">Honneur</div>
            <div class="comparison-diff-value ${diffHonor >= 0 ? 'positive' : 'negative'}">
              ${diffHonor >= 0 ? '+' : ''}${diffHonor.toLocaleString('en-US')}
            </div>
          </div>
          <div class="comparison-diff-item">
            <div class="comparison-diff-label">XP</div>
            <div class="comparison-diff-value ${diffXp >= 0 ? 'positive' : 'negative'}">
              ${diffXp >= 0 ? '+' : ''}${diffXp.toLocaleString('en-US')}
            </div>
          </div>
          <div class="comparison-diff-item">
            <div class="comparison-diff-label">Points de grade</div>
            <div class="comparison-diff-value ${diffRank >= 0 ? 'positive' : 'negative'}">
              ${diffRank >= 0 ? '+' : ''}${diffRank.toLocaleString('en-US')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

console.log('🔄 Module Comparison chargé');