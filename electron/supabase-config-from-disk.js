/**
 * Fichiers optionnels de config Supabase (hors .env).
 * En dev : build/src/config.supabase.prod.js (après prebuild) puis config.supabase.local.js à la racine (prioritaire).
 * Empaqueté : app.asar/src/config.supabase.prod.js uniquement.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * @param {boolean} isPackaged
 * @param {import('electron').App} appInstance
 * @returns {string[]}
 */
function listSupabaseConfigPaths(isPackaged, appInstance) {
  if (isPackaged) {
    return [path.join(appInstance.getAppPath(), 'src', 'config.supabase.prod.js')];
  }
  return [
    path.join(PROJECT_ROOT, 'build', 'src', 'config.supabase.prod.js'),
    path.join(PROJECT_ROOT, 'config.supabase.local.js')
  ];
}

/**
 * Fusionne les fichiers dans l’ordre : le dernier trouvé écrase les champs (local > build).
 * @param {boolean} isPackaged
 * @param {import('electron').App} appInstance
 * @returns {{ url: string, anonKey: string, authRedirectBase: string, paypalClientId: string, paypalPlanId: string }}
 */
function readMergedSupabaseConfigFromDisk(isPackaged, appInstance) {
  var out = {
    url: '',
    anonKey: '',
    authRedirectBase: '',
    paypalClientId: '',
    paypalPlanId: ''
  };
  var paths = listSupabaseConfigPaths(isPackaged, appInstance);
  for (var i = 0; i < paths.length; i++) {
    try {
      var fp = paths[i];
      if (!fs.existsSync(fp)) continue;
      var cfg = require(fp);
      if (!cfg) continue;
      if (cfg.url) out.url = cfg.url;
      if (cfg.anonKey) out.anonKey = cfg.anonKey;
      if (cfg.authRedirectBase) out.authRedirectBase = cfg.authRedirectBase;
      if (cfg.paypalClientId) out.paypalClientId = cfg.paypalClientId;
      if (cfg.paypalPlanId) out.paypalPlanId = cfg.paypalPlanId;
    } catch (_e) { /* ignore */ }
  }
  return out;
}

module.exports = {
  listSupabaseConfigPaths,
  readMergedSupabaseConfigFromDisk
};
