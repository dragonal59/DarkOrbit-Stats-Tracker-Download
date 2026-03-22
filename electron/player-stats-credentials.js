/**
 * Credentials pour "Récupérer mes stats" (scraping perso).
 * Multi-comptes : liste + compte actif.
 */
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const FILENAME = 'player-stats-credentials.enc';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getFilePath() {
  return path.join(app.getPath('userData'), FILENAME);
}

function loadRaw() {
  const p = getFilePath();
  if (!fs.existsSync(p)) return null;
  try {
    const buf = fs.readFileSync(p);
    if (!buf || buf.length === 0) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const dec = safeStorage.decryptString(buf);
    return JSON.parse(dec);
  } catch (e) {
    return null;
  }
}

function migrateFromLegacy(data) {
  if (!data || data.accounts) return data;
  if (data.username && data.password) {
    const acc = {
      id: uuid(),
      player_id: data.player_id || '',
      player_pseudo: (data.username || '').trim(),
      player_server: (data.serverId || 'gbl5').trim(),
      username: (data.username || '').trim(),
      passwordEncrypted: null,
      is_active: true,
      created_at: new Date().toISOString()
    };
    if (safeStorage.isEncryptionAvailable()) {
      acc.passwordEncrypted = safeStorage.encryptString(data.password).toString('base64');
    }
    return { version: 1, accounts: [acc], active_id: acc.id };
  }
  return { version: 1, accounts: [], active_id: null };
}

function load() {
  const raw = loadRaw();
  const data = migrateFromLegacy(raw);
  return data || { version: 1, accounts: [], active_id: null };
}

function save(data) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Chiffrement non disponible');
  const p = getFilePath();
  const json = JSON.stringify(data);
  const enc = safeStorage.encryptString(json);
  fs.writeFileSync(p, enc, { mode: 0o600 });
}

function sanitizeAccount(input) {
  const a = {
    id: (input.id || uuid()).trim(),
    player_id: (input.player_id || '').trim().slice(0, 100),
    player_pseudo: (input.player_pseudo || '').trim().slice(0, 100),
    player_server: (input.player_server || 'gbl5').trim().slice(0, 20),
    username: (input.username || '').trim().slice(0, 255),
    passwordEncrypted: input.passwordEncrypted || null,
    is_active: input.is_active !== false,
    auto_scan: input.auto_scan !== false,
    created_at: input.created_at || new Date().toISOString(),
    current_rank: input.current_rank || null,
    honor: input.honor != null ? Number(input.honor) : null,
    xp: input.xp != null ? Number(input.xp) : null,
    rank_points: input.rank_points != null ? Number(input.rank_points) : null
  };
  return a;
}

function withoutPassword(acc) {
  if (!acc) return null;
  const has_password = !!acc.passwordEncrypted;
  const { passwordEncrypted, ...rest } = acc;
  return { ...rest, has_password };
}

/**
 * Mot de passe d’un compte (pour affichage masqué dans Mon compte — même appareil que getActiveWithPassword).
 */
function getByIdWithPassword(id) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'id requis' };
  const data = load();
  const acc = (data.accounts || []).find(a => a.id === id);
  if (!acc || !acc.passwordEncrypted) return { ok: true, password: null };
  try {
    const buf = Buffer.from(acc.passwordEncrypted, 'base64');
    const password = safeStorage.decryptString(buf);
    return { ok: true, password };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'decrypt' };
  }
}

function getAll() {
  const data = load();
  return (data.accounts || []).map(withoutPassword);
}

function getActive() {
  const data = load();
  const active = (data.accounts || []).find(a => a.id === data.active_id);
  return withoutPassword(active) || null;
}

function getActiveWithPassword() {
  const data = load();
  const active = (data.accounts || []).find(a => a.id === data.active_id);
  if (!active) return null;
  if (!active.passwordEncrypted) return null;
  try {
    const buf = Buffer.from(active.passwordEncrypted, 'base64');
    const password = safeStorage.decryptString(buf);
    return {
      id: active.id,
      player_id: active.player_id,
      player_pseudo: active.player_pseudo,
      player_server: active.player_server,
      username: active.username,
      password,
      serverId: active.player_server, // compat scraper
      is_active: active.is_active,
      created_at: active.created_at
    };
  } catch (e) {
    return null;
  }
}

function add(account) {
  console.log('[Credentials] add() appelé avec:', JSON.stringify({ player_id: account.player_id, player_pseudo: account.player_pseudo, player_server: account.player_server || account.serverId }));
  const data = load();
  const server = (account.player_server || account.serverId || 'gbl5').trim();
  const exists = (data.accounts || []).some(a => (a.player_server || '').trim() === server);
  if (exists) return { ok: false, error: 'Un compte existe déjà pour ce serveur' };
  const acc = sanitizeAccount({
    ...account,
    player_server: server,
    username: (account.username || account.player_pseudo || '').trim(),
    passwordEncrypted: null
  });
  if (account.password && safeStorage.isEncryptionAvailable()) {
    acc.passwordEncrypted = safeStorage.encryptString(account.password).toString('base64');
  }
  if (!acc.passwordEncrypted) return { ok: false, error: 'Mot de passe requis' };
  data.accounts = data.accounts || [];
  data.accounts.push(acc);
  if (!data.active_id) data.active_id = acc.id;
  save(data);
  console.log('[Credentials] Compte ajouté, active_id:', data.active_id);
  return { ok: true, id: acc.id };
}

function setActive(id) {
  const data = load();
  const found = (data.accounts || []).some(a => a.id === id);
  if (!found) return { ok: false, error: 'Compte non trouvé' };
  data.active_id = id;
  save(data);
  return { ok: true };
}

function remove(id) {
  const data = load();
  const before = (data.accounts || []).length;
  data.accounts = (data.accounts || []).filter(a => a.id !== id);
  if (data.accounts.length === before) return { ok: false, error: 'Compte non trouvé' };
  if (data.active_id === id) data.active_id = data.accounts[0]?.id || null;
  save(data);
  return { ok: true };
}

function update(id, fields) {
  const data = load();
  const idx = (data.accounts || []).findIndex(a => a.id === id);
  if (idx < 0) return { ok: false, error: 'Compte non trouvé' };
  const acc = { ...data.accounts[idx], ...fields };
  if (fields.player_server !== undefined) {
    const server = (fields.player_server || '').trim();
    const dup = (data.accounts || []).some((a, i) => i !== idx && (a.player_server || '').trim() === server);
    if (dup) return { ok: false, error: 'Un compte existe déjà pour ce serveur' };
  }
  if (fields.password && fields.password.length > 0 && safeStorage.isEncryptionAvailable()) {
    acc.passwordEncrypted = safeStorage.encryptString(fields.password).toString('base64');
  }
  data.accounts[idx] = sanitizeAccount(acc);
  data.accounts[idx].passwordEncrypted = acc.passwordEncrypted || data.accounts[idx].passwordEncrypted;
  save(data);
  return { ok: true };
}

function getCredentials() {
  const c = getActiveWithPassword();
  if (!c || !c.password) return null;
  return { serverId: c.player_server || 'gbl5', username: c.username, password: c.password };
}

function savePayload(obj) {
  if (!obj || typeof obj !== 'object') return;
  const active = getActive();
  if (active) {
    update(active.id, {
      username: obj.username != null ? String(obj.username).trim() : active.username,
      player_server: obj.serverId != null ? String(obj.serverId).trim() : active.player_server,
      password: obj.password
    });
  } else {
    add({
      username: (obj.username || '').trim(),
      player_server: (obj.serverId || 'gbl5').trim(),
      password: obj.password || ''
    });
  }
}

function loadLegacy() {
  const c = getActiveWithPassword();
  if (!c) return null;
  return { username: c.username, serverId: c.player_server || 'gbl5', password: c.password };
}

/**
 * Variante sécurisée de loadLegacy() destinée à être exposée au renderer via IPC.
 * Ne retourne jamais le mot de passe — uniquement les métadonnées d'identification.
 * Le password reste accessible dans le main process uniquement via loadLegacy()
 * ou getActiveWithPassword(), jamais transmis au renderer par ce canal.
 */
function loadWithoutPassword() {
  const c = getActiveWithPassword();
  if (!c) return null;
  return { username: c.username, serverId: c.player_server || 'gbl5' };
}

module.exports = {
  getAll,
  getActive,
  getActiveWithPassword,
  getByIdWithPassword,
  add,
  setActive,
  remove,
  update,
  getCredentials,
  savePayload,
  load: loadWithoutPassword,
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable()
};
