// ==========================================
// MODULE: DROPDOWN MANAGEMENT
// ==========================================

// Référence module-scoped pour éviter l'accumulation de listeners
// si initDropdown() est appelé plusieurs fois (ex. rechargement de l'UI).
var _dropdownClickHandler = null;

function initDropdown() {
  const selected = document.getElementById("selected");
  const options = document.getElementById("options");
  if (!selected || !options) return;
  const optionItems = Array.from(document.querySelectorAll(".option"));
  const OPEN_CLASS = "is-open";
  const TRANSITION_MS = 200;

  // Attributs ARIA
  selected.setAttribute('role', 'combobox');
  selected.setAttribute('aria-haspopup', 'listbox');
  selected.setAttribute('aria-expanded', 'false');
  selected.setAttribute('tabindex', '0');
  if (options) {
    options.setAttribute('role', 'listbox');
    options.setAttribute('aria-label', (typeof window.i18nT === 'function')
      ? window.i18nT('dropdown_aria_grades_list')
      : 'Sélectionner un grade');
  }
  optionItems.forEach((item, i) => {
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '-1');
    item.id = item.id || ('dropdown-option-' + i);
  });

  function isOpen() {
    return options.style.display === "block";
  }

  function openOptions() {
    options.style.display = "block";
    requestAnimationFrame(() => options.classList.add(OPEN_CLASS));
    selected.setAttribute('aria-expanded', 'true');
  }

  function closeOptions() {
    options.classList.remove(OPEN_CLASS);
    selected.setAttribute('aria-expanded', 'false');
    setTimeout(() => {
      if (!options.classList.contains(OPEN_CLASS)) {
        options.style.display = "none";
      }
    }, TRANSITION_MS);
  }

  function getFocusedIndex() {
    return optionItems.findIndex(el => el === document.activeElement);
  }

  function focusOption(index) {
    const target = optionItems[index];
    if (target) {
      target.focus();
      selected.setAttribute('aria-activedescendant', target.id);
    }
  }

  function selectOption(option) {
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
    selected.focus();

    const nextRank = getNextRank(name);
    const nextRankData = RANKS_DATA.find(r => r.name === nextRank);
    var nextRankEl = document.getElementById("nextRankPoints");
    if (nextRankEl) {
      if (nextRankData) nextRankEl.value = (typeof window.numFormat === 'function' ? window.numFormat(nextRankData.rankPoints) : nextRankData.rankPoints.toLocaleString("en-US"));
      else nextRankEl.value = '';
    }

    saveCurrentStats();
    updateStatsDisplay();
  }

  if (!window._dropdownGradesI18nBound) {
    window._dropdownGradesI18nBound = true;
    window.addEventListener('languageChanged', function () {
      var opts = document.getElementById('options');
      if (opts && typeof window.i18nT === 'function') {
        opts.setAttribute('aria-label', window.i18nT('dropdown_aria_grades_list'));
      }
    });
  }

  selected.addEventListener("click", () => {
    if (isOpen()) {
      closeOptions();
    } else {
      openOptions();
      if (optionItems.length > 0) focusOption(0);
    }
  });

  // Navigation clavier sur le bouton selected
  selected.addEventListener("keydown", (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen()) {
        closeOptions();
      } else {
        openOptions();
        if (optionItems.length > 0) focusOption(0);
      }
    } else if (e.key === 'Escape') {
      closeOptions();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen()) openOptions();
      focusOption(0);
    }
  });

  // Navigation clavier dans la liste d'options
  options.addEventListener("keydown", (e) => {
    const idx = getFocusedIndex();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusOption(Math.min(idx + 1, optionItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx <= 0) {
        closeOptions();
        selected.focus();
      } else {
        focusOption(idx - 1);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (idx >= 0) selectOption(optionItems[idx]);
    } else if (e.key === 'Escape') {
      closeOptions();
      selected.focus();
    }
  });

  optionItems.forEach(option => {
    option.addEventListener("click", () => selectOption(option));
  });

  // Fermer dropdown au clic extérieur — retrait de l'ancienne référence avant
  // ré-enregistrement pour éviter l'accumulation si initDropdown() est rappelé.
  if (_dropdownClickHandler) {
    document.removeEventListener("click", _dropdownClickHandler);
  }
  _dropdownClickHandler = function (e) {
    if (!e.target.closest(".dropdown")) {
      closeOptions();
    }
  };
  document.addEventListener("click", _dropdownClickHandler);
}
