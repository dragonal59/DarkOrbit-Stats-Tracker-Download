// Client Supabase global
window.supabaseClient = window.supabaseClient || null;

// Subscription onAuthStateChange interne — stockée pour pouvoir appeler
// unsubscribe() via cleanupSupabaseClient() si besoin (hot-reload, tests).
var _authSubscription = null;
// Canal Realtime pour écouter les changements de badge sur profiles (utilisateur connecté).
var _profileRealtimeChannel = null;

function stopProfileBadgeRealtime() {
  if (_profileRealtimeChannel) {
    try {
      var supabase = window.supabaseClient;
      if (supabase && supabase.removeChannel) supabase.removeChannel(_profileRealtimeChannel);
    } catch (_) {}
    _profileRealtimeChannel = null;
  }
}

function startProfileBadgeRealtime(userId) {
  if (!userId) return;
  stopProfileBadgeRealtime();
  var supabase = window.supabaseClient;
  if (!supabase || !supabase.channel) return;
  var channelName = 'profile-badge:' + userId;
  var ch = supabase.channel(channelName).on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'profiles',
      filter: 'id=eq.' + userId
    },
    function () {
      if (typeof BackendAPI !== 'undefined' && BackendAPI.getPermissions) {
        BackendAPI.getPermissions(true).then(function () {
          if (typeof applyPermissionsUI === 'function') applyPermissionsUI();
        }).catch(function () {
          if (typeof applyPermissionsUI === 'function') applyPermissionsUI();
        });
      }
    }
  );
  ch.subscribe();
  _profileRealtimeChannel = ch;
}

function initSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;

  // Vérifier que le SDK est chargé (CDN expose window.supabase avec createClient)
  if (typeof window.supabase === 'undefined' || !window.supabase || typeof window.supabase.createClient !== 'function') {
    Logger.error('❌ SDK Supabase non chargé. Vérifiez que le script CDN est bien inclus.');
    return null;
  }

  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    Logger.warn('⚠️ Supabase non configuré.');
    return null;
  }

  window.supabaseClient = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  const { data: { subscription } } = window.supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      Logger.warn('[SUPABASE] Session terminée.');
      stopProfileBadgeRealtime();
    }
  });
  _authSubscription = subscription;

  return window.supabaseClient;
}

function getSupabaseClient() {
  if (!window.supabaseClient) return initSupabaseClient();
  return window.supabaseClient;
}

/**
 * Résilie la subscription onAuthStateChange et réinitialise le client.
 * À appeler lors d'un hot-reload ou dans les tests pour éviter les fuites.
 */
function cleanupSupabaseClient() {
  if (_authSubscription) {
    try { _authSubscription.unsubscribe(); } catch (_) {}
    _authSubscription = null;
  }
  stopProfileBadgeRealtime();
  window.supabaseClient = null;
}

window.getSupabaseClient = getSupabaseClient;
window.cleanupSupabaseClient = cleanupSupabaseClient;
window.startProfileBadgeRealtime = startProfileBadgeRealtime;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupabaseClient);
} else {
  initSupabaseClient();
}

// Réponse au main pour refresh token (collecte DOStats, scheduler)
if (typeof window.electronRequestFreshToken !== 'undefined' && window.electronRequestFreshToken.onRequest) {
  window.electronRequestFreshToken.onRequest(async function () {
    try {
      var supabase = getSupabaseClient();
      if (!supabase) {
        window.electronRequestFreshToken.sendResponse(null, null);
        return;
      }
      var _r = await supabase.auth.refreshSession();
      var data = _r.data;
      var error = _r.error;
      if (error || !data || !data.session) {
        window.electronRequestFreshToken.sendResponse(null, null);
        return;
      }
      window.electronRequestFreshToken.sendResponse(data.session.user.id, data.session.access_token);
    } catch (e) {
      Logger.warn('[Supabase] refreshSession error:', e && e.message);
      window.electronRequestFreshToken.sendResponse(null, null);
    }
  });
}
