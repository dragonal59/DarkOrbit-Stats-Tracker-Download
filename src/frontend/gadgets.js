// ==========================================
// GADGETS - Confettis, Sons, Streak, Raccourcis
// ==========================================

// ==========================================
// 1. SONS DE NOTIFICATION
// ==========================================

// Chemins vers les fichiers sons (dans src/sound/)
const SOUNDS = {
  success: './sound/success.mp3',
  levelup: './sound/levelup.mp3',
  rankup: './sound/rankup.mp3',
  error: './sound/error.mp3'
};

// Sons de fallback en base64 (si fichiers externes introuvables)
const SOUNDS_FALLBACK = {
  success: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKXh8LhjHAU2j9TxzYIvBSh+zPLaizsKHHDH8uqNSAwSaLPp4qNXEwlJot/ww3QkBSR6ye7ajTkJHG/D8+OSUAwPWKvj6qdbEQZCmNryvG4fByJvvO3bkUMMFGSu4+WXVxAIQ5jZ77hkJAkneMrz3ZJBDBtzyOngnlQTCkiZ2fCxaBsGI3fJ8t+UQgwXb8Xs5qNcEgpHm93yuXAfByRzy+7dlEUNGXDC7+mlUxEJT5vY8blmIgcibLrv45NFDBljreDlpFoSCUub2vC0ZiAHJnfI8duSQwsVbLvn4aFRDAhKmtfwtmQeByFtue7fl0UNGF+95N2gTQwJTZnY8bRkHgYibrzx4ZVHDBljreTlp1YRCUib2PCzYx8HJXbI8NuURAsSb7zn5qZQDAdJmdnxtWIfByNwue/imEgMGGCy4OOiUA0IR5rX8LdjHgclb7zv3Y9GDBVks+XjpVQOCEqb2PGzYSAGIm674OCWRwwZY7Lh5KdUEAlHl9bxuGIdByZwvPDhlkYMGGSx4eSiUgwJSZrZ8bNiIAYjcLnv4ZdIDBlgs+Hjp1IOCEqZ1/C1Yx0HJG+87+GPRg0WZbPh46ZUDglJm9nxs2EfBiJvvO/hklQMGGKz4OOnVA4JSpvZ8LRhHwYjcLnv4ZZIDQ==',
  levelup: 'data:audio/wav;base64,UklGRhIFAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0Ya4EAACAgICAgICAgICAgICAgICBhImNkZWZnKGlrLCztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+//7+/v39/fz8/Pv7+/r6+fn5+Pj49/f39vb29fX19PT08/Pz8vLy8fHx8PDw7+/v7u7u7e3t7Ozs6+vr6urq6enp6Ojo5+fn5ubm5eXl5OTk4+Pj4uLi4eHh4ODg39/f3t7e3d3d3Nzc29vb2tra2dnZ2NjY19fX1tbW1dXV1NTU09PT0tLS0dHR0NDQz8/Pzs7Ozc3NzMzMy8vLysrKycnJyMjIx8fHxsbGxcXFxMTEw8PDwsLCwcHBwMDAvr67trGsp6OfmZSPioaBfHh0cGxpZWJeW1hVUlBOTEpIRkRCQD49Ozk3NTMxLy0rKSclIyEfHRsZFxUTEQ8NCwkHBQMBAP/9+/n39fPx7+3r6efm5OPi4N/e3dzc2tnY2NfW1tXV1NTT09LS0dHR0NDQz8/Pzs7Ozc3NzMzMy8vLysrKycnJyMjIx8fHxsbGxcXFxMTEw8PDwsLCwcHBwMDAvr67trGsp6OfmZSPioaBfHh0cGxpZWJeW1hVUlBOTEpIRkRCQD49Ozk3NTMxLy0rKSclIyEfHRsZFxUTEQ8NCwkHBQMBAP/9+/n39fPx7+3r6efm5OPi4N/e3dzc2tnY2NfW1tXV1NTT09LS0dHR0NDQz8/Pzs7Ozc3NzMzMy8vLysrKycnJyMjIx8fHxsbGxcXFxMTEw8PDwsLCwcHBwMDAvr67trGsp6OfmZSPioaBfHh0cGxpZWJeW1hVUlBOTEpIRkRCQD49Ozk3NTMxLy0rKSclIyEfHRsZFxUTEQ8NCwkHBQMBAA==',
  rankup: 'data:audio/wav;base64,UklGRhYEAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YfIDAACAgICAgICAgICAgICAgICAgYGBgoKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+//7+/v7+/v39/fz8+/v6+vn5+Pj39/b29fX09PPz8vLx8fDw7+/u7u3t7Ozr6+rq6enp6Ojo5+fm5uXl5OTj4+Li4eHg4N/f3t7d3dzc29va2tnZ2NjX19bW1dXU1NPT0tLR0dDQz8/Ozs3NzMzLy8rKycnIyMfHxsbFxcTEw8PCwsHBwMC/v76+vb28vLu7urq5ubm4uLe3trW1tLS0s7OysrGxsLCvr66urq2trayrq6qqqamop6enp6alpKSjo6KioaGgoJ+fn56dnZ2cm5ubmpqZmZiYl5eWlpWVlJSTk5KSkZGQkI+Pjo6NjYyMi4uKioqJiIiHh4aGhYWEhIODgoKBgYCAgICAgICAgICAgICAgICAgICBgYGCgoOEhYaHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7//v7+/v7+/f39/Pz7+/r6+fn4+Pf39vb19fT08/Py8vHx8PDv7+7u7e3s7Ovr6urp6ejo5+fm5uXl5OTj4+Li4eHg4N/f3t7d3dzc29va2tnZ2NjX19bW1dXU1NPT0tLR0dDQz8/Ozs3NzMzLy8rKycnIyMfHxsbFxcTEw8PCwsHBwMC/v76+vb28vLu7urq5ubm4uLe3trW1tLS0s7OysrGxsLCvr66urq2trayrq6qqqamop6enp6alpKSjo6KioaGgoJ+fn56dnZ2cm5ubmpqZmZiYl5eWlpWVlJSTk5KSkZGQkI+Pjo6NjYyMi4uKioqJiIiHh4aGhYWEhIODgoKBgYCAgICAgICAgICAgICAgICAgICA',
  error: 'data:audio/wav;base64,UklGRiQEAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAEAAB/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39+fn19fHx7e3p6eXl4eHd3dnZ1dXR0c3Nyc3Jxc3J0dXV3eHl6fH1/gIKEhoiKjI6RkpSWmJqdoKKlp6qss7W5u7/DxsvP0tfa3uHl6u7y9vr+//358+7p4t3Z1dHNycXBvLm1sa+sq6eloaCdmpaTj4uHg4B9eXZ0cG5samhlZGFfXFpZV1VUU1FQT05NTEtLSkpKSkpKS0tLTExNTk5PT1BQUVJSUlJTU1FQTk1LSkhGREF/fXt5d3V0cnFvbm1samhnZmVkZGRkZGVlZWZmZ2dpaWprbG1ub3BxcnR1d3h6fH6AgYOFh4mLjY+RlJaYnJ+ho6eqrrGztbi7vsDDxsjLzM7P0dHR0dHS0tPT1NXW19nb3d7g4uTm6Ovt7/Hz9fj6+/z+/v7+/v79/fz8+/v6+vn5+Pj39/b29fX09PTz8/Ly8fHw8O/v7u7t7ezs6+vq6uno6Ojn5+bm5eXk5OPj4uLh4eDg39/e3t3d3Nzb29ra2dnY2NfX1tbV1dTU09PS0tHR0NDPz87Ozc3MzMvLysrJycjIx8fGxsXFxMTDw8LCwcHAwL+/vr69vby8u7u6urm5uLi3t7a2tbW0tLOzsrKxsbCwr6+urq2trKyrq6qqp6elnZuXk46KhoJ+e3dzbmpmYl9bWFVST0xKSEZEQkA/PT07OTg2NTMxMC8tLCspKCYlIyIhIB8eHR0cGxsaGhkZGBgXFxcWFhYWFRUVFRUVFRUVFRUVFhYWFhcXFxgYGRkaGhsb'
};

function playSound(type = 'success') {
  try {
    const soundPath = SOUNDS[type] || SOUNDS.success;
    const audio = new Audio(soundPath);
    audio.volume = 0.3;
    
    audio.onerror = () => {
      console.log(`Son externe non trouvé (${soundPath}), utilisation du fallback`);
      const fallbackAudio = new Audio(SOUNDS_FALLBACK[type] || SOUNDS_FALLBACK.success);
      fallbackAudio.volume = 0.3;
      fallbackAudio.play().catch(e => console.log('Audio play prevented:', e));
    };
    
    audio.oncanplaythrough = () => {
      audio.play().catch(e => {
        console.log('Audio play prevented:', e);
        const fallbackAudio = new Audio(SOUNDS_FALLBACK[type] || SOUNDS_FALLBACK.success);
        fallbackAudio.volume = 0.3;
        fallbackAudio.play().catch(err => console.log('Fallback prevented:', err));
      });
    };
    
    audio.load();
  } catch (e) {
    console.log('Audio not supported:', e);
  }
}

// ==========================================
// 2. CONFETTIS
// ==========================================

function celebrateSuccess(type = 'normal') {
  // AMÉLIORATION BUG #4 : Fallback silencieux plus robuste
  if (typeof confetti === 'undefined') {
    console.log('Confetti library not loaded - feature disabled');
    return;
  }

  try {
    switch(type) {
      case 'levelup':
        // Confettis explosifs pour level up
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#FFD700', '#FFA500', '#FF6347'],
          ticks: 200
        });
        playSound('levelup');
        break;
        
      case 'rankup':
        // Confettis étoiles pour nouveau grade
        const duration = 3000;
        const end = Date.now() + duration;
        
        // FIX BUG #8 : Stocker l'ID de l'animation pour cleanup
        let animationId = null;
        
        (function frame() {
          confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#FFD700', '#FFFFFF', '#4169E1']
          });
          confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#FFD700', '#FFFFFF', '#4169E1']
          });
          
          if (Date.now() < end) {
            animationId = requestAnimationFrame(frame);
          } else {
            // Cleanup automatique à la fin
            if (animationId) {
              cancelAnimationFrame(animationId);
            }
          }
        }());
        
        playSound('rankup');
        break;
        
      case 'session':
        // Confettis simples pour sauvegarde de session
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#38bdf8', '#22c55e']
        });
        playSound('success');
        break;
        
      default:
        // Confettis normaux
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
        playSound('success');
    }
  } catch (e) {
    console.log('Confetti error:', e);
  }
}

// ==========================================
// 3. STREAK COUNTER
// ==========================================

function calculateStreak() {
  const sessions = getSessions();
  if (sessions.length === 0) return 0;
  
  // Extraire les dates uniques (on ne compte qu'une fois par jour)
  const uniqueDays = new Set();
  sessions.forEach(session => {
    const date = new Date(session.timestamp);
    // Format YYYY-MM-DD pour avoir des jours uniques
    const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    uniqueDays.add(dayKey);
  });
  
  // Convertir en tableau et trier par date décroissante
  const sortedDays = Array.from(uniqueDays).sort().reverse();
  
  if (sortedDays.length === 0) return 0;
  
  // Date d'aujourd'hui (format YYYY-MM-DD)
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // Date d'hier
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  
  // Le streak doit commencer aujourd'hui ou hier
  const mostRecentDay = sortedDays[0];
  if (mostRecentDay !== todayKey && mostRecentDay !== yesterdayKey) {
    // Pas de session aujourd'hui ni hier = streak cassé
    return 0;
  }
  
  // Compter les jours consécutifs
  let streak = 0;
  let expectedDate = new Date(mostRecentDay + 'T00:00:00');
  
  for (const dayKey of sortedDays) {
    const currentDate = new Date(dayKey + 'T00:00:00');
    const expectedKey = `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`;
    
    if (dayKey === expectedKey) {
      streak++;
      // Passer au jour précédent attendu
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else {
      // Jour manquant = fin du streak
      break;
    }
  }
  
  return streak;
}

function updateStreakDisplay() {
  const streakCounter = document.getElementById('streakCounter');
  if (typeof currentHasFeature === 'function' && !currentHasFeature('streakCounter')) {
    if (streakCounter) streakCounter.style.display = 'none';
    return;
  }
  if (typeof getSetting === 'function' && !getSetting('streakEnabled')) {
    if (streakCounter) streakCounter.style.display = 'none';
    return;
  }
  const streak = calculateStreak();
  const streakNumber = document.getElementById('streakNumber');
  
  if (streak > 0) {
    streakCounter.style.display = 'inline-flex';
    streakNumber.textContent = streak;
    
    // Animation spéciale pour les milestones
    if (streak === 7 || streak === 30 || streak === 100 || streak % 50 === 0) {
      celebrateSuccess('rankup');
      setTimeout(() => {
        alert(`🔥 INCROYABLE ! ${streak} jours consécutifs !\n\nContinue comme ça, tu es une légende ! 🏆`);
      }, 1000);
    }
  } else {
    streakCounter.style.display = 'none';
  }
}

// ==========================================
// 4. RACCOURCIS CLAVIER
// ==========================================

const SHORTCUTS = {
  'ctrl+s': () => {
    const saveBtn = document.getElementById('saveSession');
    if (saveBtn) {
      saveBtn.click();
      showToast('💾 Session sauvegardée (Ctrl+S)', 'success');
    }
  },
  'ctrl+e': () => {
    exportData();
    showToast('📥 Export lancé (Ctrl+E)', 'success');
  },
  'ctrl+h': () => {
    // Basculer vers l'onglet Historique
    const historyTab = document.querySelector('[data-tab="history"]');
    if (historyTab) {
      historyTab.click();
      showToast('📚 Historique (Ctrl+H)', 'success');
    }
  },
  'ctrl+p': () => {
    // Basculer vers l'onglet Progression
    const progressTab = document.querySelector('[data-tab="progression"]');
    if (progressTab) {
      progressTab.click();
      showToast('📈 Progression (Ctrl+P)', 'success');
    }
  },
  'ctrl+1': () => {
    // Basculer vers l'onglet Stats
    const statsTab = document.querySelector('[data-tab="stats"]');
    if (statsTab) {
      statsTab.click();
      showToast('📊 Statistiques (Ctrl+1)', 'success');
    }
  },
  'ctrl+shift+c': () => {
    // Basculer mode compact/détaillé
    const currentMode = document.documentElement.getAttribute('data-view-mode');
    const newMode = currentMode === 'compact' ? 'detailed' : 'compact';
    setViewMode(newMode);
    showToast(`${newMode === 'compact' ? '📊 Mode Compact' : '📋 Mode Détaillé'} (Ctrl+Shift+C)`, 'success');
  },
  'ctrl+shift+t': () => {
    // Changer de thème
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    showToast(`${newTheme === 'dark' ? '🌙 Thème Sombre' : '☀️ Thème Clair'} (Ctrl+Shift+T)`, 'success');
  },
  '?': () => {
    // Afficher l'aide des raccourcis
    showShortcutsHelp();
  }
};

function handleKeyboardShortcut(e) {
  const key = [];
  
  if (e.ctrlKey) key.push('ctrl');
  if (e.shiftKey) key.push('shift');
  if (e.altKey) key.push('alt');
  
  // Ajouter la touche principale (en minuscule)
  const mainKey = e.key.toLowerCase();
  if (mainKey !== 'control' && mainKey !== 'shift' && mainKey !== 'alt') {
    key.push(mainKey);
  }
  
  const shortcut = key.join('+');
  
  if (SHORTCUTS[shortcut]) {
    e.preventDefault();
    SHORTCUTS[shortcut]();
  }
}

function showShortcutsHelp() {
  const helpText = `
🎮 RACCOURCIS CLAVIER

💾 Ctrl + S : Sauvegarder la session
📥 Ctrl + E : Exporter les données
📚 Ctrl + H : Onglet Historique
📈 Ctrl + P : Onglet Progression
📊 Ctrl + 1 : Onglet Statistiques
🔄 Ctrl + Shift + C : Mode Compact/Détaillé
🎨 Ctrl + Shift + T : Changer le thème
❓ ? : Afficher cette aide
  `.trim();
  
  alert(helpText);
}

// ==========================================
// INITIALISATION DES GADGETS
// ==========================================

// Mettre à jour le streak au chargement et après chaque sauvegarde
window.addEventListener('DOMContentLoaded', () => {
  updateStreakDisplay();
});

console.log('✨ Gadgets chargés : Confettis, Sons, Streak Counter, Raccourcis clavier');
console.log('💡 Appuyez sur ? pour voir tous les raccourcis clavier !');