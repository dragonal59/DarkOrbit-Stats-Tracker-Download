// FIX ELECTRON - Bloquer TOUTES les erreurs chrome.*
(function() {
  // Mock complet de chrome
  if (typeof chrome !== 'undefined') {
    const originalChrome = window.chrome;
    
    window.chrome = new Proxy(originalChrome || {}, {
      get(target, prop) {
        if (prop === 'runtime') {
          return new Proxy({}, {
            get(t, p) {
              if (p === 'lastError') return null;
              if (p === 'sendMessage') return () => Promise.resolve();
              if (p === 'onMessage') return { addListener: () => {} };
              return () => {};
            }
          });
        }
        return target[prop];
      }
    });
  } else {
    window.chrome = {
      runtime: {
        lastError: null,
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => {} }
      }
    };
  }
  
  // Bloquer l'erreur dans la console
  const originalError = console.error;
  console.error = function(...args) {
    const msg = args[0]?.toString() || '';
    if (msg.includes('chrome.runtime') || msg.includes('message port')) {
      return; // Ignorer
    }
    originalError.apply(console, args);
  };
})();
