// Configuration Supabase — UNIQUEMENT via variables d'environnement (Electron preload / .env)
// Aucun fallback avec clé en dur : si pas de config, Supabase n'est pas initialisé.
var hasPreloadConfig = typeof window !== 'undefined' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey;
if (typeof window !== 'undefined') {
  window.SUPABASE_CONFIG = hasPreloadConfig
    ? { url: window.SUPABASE_CONFIG.url, anonKey: window.SUPABASE_CONFIG.anonKey, authRedirectBase: window.SUPABASE_CONFIG.authRedirectBase || '' }
    : { url: '', anonKey: '', authRedirectBase: '' };
}

// Vérifier si Supabase est configuré
window.isSupabaseConfigured = function() {
  return window.SUPABASE_CONFIG.url &&
         window.SUPABASE_CONFIG.url !== '' &&
         window.SUPABASE_CONFIG.anonKey &&
         window.SUPABASE_CONFIG.anonKey !== '';
};

if (!window.isSupabaseConfigured()) {
  if (typeof Logger !== 'undefined' && Logger.warn) Logger.warn('⚠️ Supabase non configuré : définir SUPABASE_URL et SUPABASE_ANON_KEY dans un fichier .env à la racine du projet (voir .env.example).');
}
