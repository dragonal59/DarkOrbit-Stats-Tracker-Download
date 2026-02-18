/**
 * Utilitaires : délais, attente, retry
 */
function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout: ${selector} non trouvé`));
      }
    }, 100);
  });
}

async function retryOperation(operation, maxRetries = 3, baseDelayMs = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`[RETRY] Tentative ${i + 1}/${maxRetries} échouée:`, error.message);
      if (i === maxRetries - 1) throw error;
      const delay = baseDelayMs * Math.pow(2, i);
      await randomDelay(delay, delay + 2000);
    }
  }
}
