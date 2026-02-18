// Client Supabase global
window.supabaseClient = window.supabaseClient || null;

function initSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;

  // Vérifier que le SDK est chargé (CDN expose window.supabase avec createClient)
  if (typeof window.supabase === 'undefined' || !window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('❌ SDK Supabase non chargé. Vérifiez que le script CDN est bien inclus.');
    return null;
  }

  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    console.warn('⚠️ Supabase non configuré.');
    return null;
  }

  window.supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('[SUPABASE] Auth state change:', event);
    console.log('[SUPABASE] Session:', session ? 'Présente' : 'Null');
    if (event === 'SIGNED_OUT') {
      console.error('[SUPABASE] DÉCONNEXION DÉTECTÉE !');
      console.trace();
    }
  });

  console.log('✅ Client Supabase initialisé');
  return window.supabaseClient;
}

function getSupabaseClient() {
  if (!window.supabaseClient) return initSupabaseClient();
  return window.supabaseClient;
}

window.getSupabaseClient = getSupabaseClient;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabaseClient);
} else {
  initSupabaseClient();
}
