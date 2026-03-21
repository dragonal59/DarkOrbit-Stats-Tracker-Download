(function () {
  'use strict';

  function initLegal() {
    var btn = document.getElementById('btnLegal');
    var modal = document.getElementById('modalLegal');
    var closeBtn = document.getElementById('closeLegal');
    var overlay = modal ? modal.querySelector('.modal-legal-overlay') : null;
    var tabs = modal ? modal.querySelectorAll('.legal-tab') : [];
    var panels = modal ? modal.querySelectorAll('.legal-panel') : [];

    if (!btn || !modal) return;

    // Listener Escape lié au cycle de vie de la modal :
    // ajouté à l'ouverture, retiré à chaque fermeture pour éviter
    // l'accumulation d'un listener global permanent.
    function handleLegalEsc(e) {
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        closeModal();
      }
    }

    function openModal() {
      modal.classList.remove('hidden');
      document.addEventListener('keydown', handleLegalEsc);
    }

    function closeModal() {
      modal.classList.add('hidden');
      document.removeEventListener('keydown', handleLegalEsc);
    }

    btn.addEventListener('click', openModal);

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }

    if (overlay) {
      overlay.addEventListener('click', closeModal);
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-tab');
        tabs.forEach(function (t) { t.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.add('hidden'); });
        tab.classList.add('active');
        var panel = document.getElementById('tab-' + target);
        if (panel) panel.classList.remove('hidden');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLegal);
  } else {
    initLegal();
  }
})();
