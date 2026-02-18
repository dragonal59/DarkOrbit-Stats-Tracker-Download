// ==========================================
// MODULE: DROPDOWN MANAGEMENT
// ==========================================

function initDropdown() {
  const selected = document.getElementById("selected");
  const options = document.getElementById("options");
  const optionItems = document.querySelectorAll(".option");
  const OPEN_CLASS = "is-open";
  const TRANSITION_MS = 200;

  function openOptions() {
    options.style.display = "block";
    requestAnimationFrame(() => options.classList.add(OPEN_CLASS));
  }

  function closeOptions() {
    options.classList.remove(OPEN_CLASS);
    setTimeout(() => {
      if (!options.classList.contains(OPEN_CLASS)) {
        options.style.display = "none";
      }
    }, TRANSITION_MS);
  }

  selected.addEventListener("click", () => {
    const isVisible = options.style.display === "block";
    if (isVisible) {
      closeOptions();
    } else {
      openOptions();
    }
  });

  optionItems.forEach(option => {
    option.addEventListener("click", () => {
      const name = option.dataset.name;
      const img = option.dataset.img;
      
      selected.innerHTML = `<div class="selected-rank">
        <div class="grade-block">
          <div class="grade-block-name">${name}</div>
          <div class="grade-block-icon">
            <img src="${img}" alt="${name}" class="grade-block-img">
          </div>
        </div>
      </div>`;
      
      closeOptions();
      
      const nextRank = getNextRank(name);
      const nextRankData = RANKS_DATA.find(r => r.name === nextRank);
      
      if (nextRankData) {
        document.getElementById("nextRankPoints").value = (typeof window.numFormat === 'function' ? window.numFormat(nextRankData.rankPoints) : nextRankData.rankPoints.toLocaleString("en-US"));
      } else {
        document.getElementById("nextRankPoints").value = '';
      }
      
      saveCurrentStats();
      updateStatsDisplay();
    });
  });

  // Fermer dropdown au clic extérieur
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown")) {
      closeOptions();
    }
  });
}

console.log('📋 Module Dropdown chargé');