/**
 * Module de gestion des comptes DarkOrbit (processus principal Electron).
 * Stockage local chiffré via safeStorage. CRUD comptes + attribution serveurs.
 */
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

/** Mapping centralisé (src/backend/server-mappings.js) — chargement différé (app.getSrcPath doit être défini). */
let _serverNamesCache = null;
function getServerNames() {
  if (!_serverNamesCache) {
    try {
      _serverNamesCache = require(app.getSrcPath('backend/server-mappings.js'));
    } catch (e) {
      console.warn('[darkorbit-accounts] Impossible de charger server-mappings.js:', e?.message || e);
      _serverNamesCache = {};
    }
  }
  return _serverNamesCache;
}

const SERVERS = [
  'de2', 'de4', 'es1', 'fr1',
  'gbl1', 'gbl2', 'gbl3', 'gbl4', 'gbl5',
  'int1', 'int2', 'int5', 'int6', 'int7', 'int11', 'int14',
  'mx1', 'pl3', 'ru1', 'ru5',
  'tr3', 'tr4', 'tr5', 'us2'
];

const FILENAME = 'darkorbit-accounts.enc';

function getAccountsPath() {
  return path.join(app.getPath('userData'), FILENAME);
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function loadRaw() {
  const p = getAccountsPath();
  if (!fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p);
  } catch (e) {
    return null;
  }
}

function loadDecrypted() {
  const buf = loadRaw();
  if (!buf || buf.length === 0) {
    return { version: 1, accounts: [], serverAssignments: {} };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { version: 1, accounts: [], serverAssignments: {} };
  }
  try {
    const dec = safeStorage.decryptString(buf);
    return JSON.parse(dec);
  } catch (e) {
    return { version: 1, accounts: [], serverAssignments: {} };
  }
}

function saveEncrypted(data) {
  const p = getAccountsPath();
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Chiffrement non disponible');
  }
  const json = JSON.stringify(data);
  const enc = safeStorage.encryptString(json);
  fs.writeFileSync(p, enc, { mode: 0o600 });
}

function sanitizeAccount(input) {
  const a = {
    id: (input.id || uuid()).trim(),
    label: (input.label || '').trim().slice(0, 100),
    email: (input.email || '').trim().toLowerCase().slice(0, 255),
    passwordEncrypted: input.passwordEncrypted || null,
    isActive: input.isActive !== false,
    lastUsedAt: input.lastUsedAt || null,
    createdAt: input.createdAt || new Date().toISOString()
  };
  return a;
}

module.exports = {
  SERVERS,

  /** Liste des comptes (sans mot de passe déchiffré) */
  listAccounts() {
    const data = loadDecrypted();
    return data.accounts.map(a => ({
      id: a.id,
      label: a.label,
      email: a.email,
      isActive: a.isActive,
      lastUsedAt: a.lastUsedAt,
      createdAt: a.createdAt,
      serverCount: Object.values(data.serverAssignments || {}).filter(s => s === a.id).length
    }));
  },

  /** Créer ou modifier un compte */
  saveAccount(input) {
    const data = loadDecrypted();
    const existing = data.accounts.find(a => a.id === input.id);
    let acc;

    if (existing) {
      acc = sanitizeAccount({ ...existing, ...input });
      if (input.password && input.password.length > 0) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Chiffrement non disponible');
        acc.passwordEncrypted = safeStorage.encryptString(input.password).toString('base64');
      }
      const idx = data.accounts.findIndex(a => a.id === acc.id);
      data.accounts[idx] = acc;
    } else {
      if (!input.password || input.password.length === 0) {
        throw new Error('Mot de passe requis pour un nouveau compte');
      }
      acc = sanitizeAccount(input);
      acc.passwordEncrypted = safeStorage.encryptString(input.password).toString('base64');
      data.accounts.push(acc);
    }

    saveEncrypted(data);
    return { id: acc.id, label: acc.label, email: acc.email };
  },

  /** Supprimer un compte */
  deleteAccount(id) {
    const data = loadDecrypted();
    data.accounts = data.accounts.filter(a => a.id !== id);
    data.serverAssignments = Object.fromEntries(
      Object.entries(data.serverAssignments || {}).filter(([, aid]) => aid !== id)
    );
    saveEncrypted(data);
    return true;
  },

  /** Récupérer les credentials décryptés pour un compte (usage interne collecte) */
  getCredentials(accountId) {
    const data = loadDecrypted();
    const acc = data.accounts.find(a => a.id === accountId);
    if (!acc || !acc.passwordEncrypted) return null;
    try {
      const buf = Buffer.from(acc.passwordEncrypted, 'base64');
      const password = safeStorage.decryptString(buf);
      return { email: acc.email, password };
    } catch (e) {
      return null;
    }
  },

  /** Récupérer le compte assigné à un serveur */
  getAccountForServer(serverCode) {
    const data = loadDecrypted();
    const accountId = (data.serverAssignments || {})[serverCode];
    if (!accountId) return null;
    return data.accounts.find(a => a.id === accountId) || null;
  },

  /** Attributions serveurs : { serverCode: accountId } */
  getServerAssignments() {
    const data = loadDecrypted();
    return { ...(data.serverAssignments || {}) };
  },

  /** Sauvegarder les attributions. Un serveur = un compte (structure objet) */
  saveServerAssignments(assignments) {
    const data = loadDecrypted();
    const valid = {};
    for (const [server, accountId] of Object.entries(assignments || {})) {
      if (!SERVERS.includes(server) || !accountId) continue;
      if (!data.accounts.some(a => a.id === accountId)) continue;
      valid[server] = accountId;
    }
    data.serverAssignments = valid;
    saveEncrypted(data);
    return data.serverAssignments;
  },

  /** Mettre à jour lastUsedAt */
  markAccountUsed(accountId) {
    const data = loadDecrypted();
    const acc = data.accounts.find(a => a.id === accountId);
    if (acc) {
      acc.lastUsedAt = new Date().toISOString();
      saveEncrypted(data);
    }
  },

  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable();
  },

  /**
   * Liste des comptes pour le scraper (server_id, server_name, username, password).
   * Retourne les serveurs ayant un compte assigné. Si aucun assigné mais au moins un compte actif,
   * retourne ce compte sur un serveur par défaut (scrap événements).
   */
  getScraperAccounts() {
    const data = loadDecrypted();
    const assignments = data.serverAssignments || {};
    const accounts = [];
    for (const serverId of SERVERS) {
      const accountId = assignments[serverId];
      if (!accountId) continue;
      const acc = data.accounts.find(a => a.id === accountId);
      if (!acc || !acc.passwordEncrypted || !acc.isActive) continue;
      const creds = this.getCredentials(accountId);
      if (!creds) continue;
      accounts.push({
        accountId: accountId,
        server_id: serverId,
        server_name: getServerNames()[serverId] || serverId.toUpperCase(),
        username: creds.email,
        password: creds.password
      });
    }
    if (accounts.length === 0) {
      const first = data.accounts.find(a => a.isActive && a.passwordEncrypted);
      if (first) {
        const creds = this.getCredentials(first.id);
        if (creds) {
          const defaultServer = 'gbl5';
          accounts.push({
            accountId: first.id,
            server_id: defaultServer,
            server_name: getServerNames()[defaultServer] || defaultServer.toUpperCase(),
            username: creds.email,
            password: creds.password
          });
        }
      }
    }
    return accounts;
  }
};
