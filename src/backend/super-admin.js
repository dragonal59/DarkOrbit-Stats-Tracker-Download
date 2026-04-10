// ==========================================
// MODULE: SUPER ADMIN DASHBOARD
// Gestion complète des comptes utilisateurs
// Architecture scalable, prête pour future authentification
// ==========================================

const SuperAdmin = {
  get STORAGE_KEYS() {
    var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
    return { USERS: sk.ADMIN_USERS || 'darkOrbitAdminUsers', ACTION_LOGS: sk.ADMIN_ACTION_LOGS || 'darkOrbitAdminActionLogs' };
  },
  _usersCache: [],
  _usersCacheTime: 0,
  _usersPage: 0,
  _usersTotalCount: null,
  USERS_CACHE_TTL_MS: 2 * 60 * 1000,

  /**
   * Utilitaire : vérifie la réponse RPC et affiche erreur ou succès.
   * @param {object} error - Erreur Supabase (error)
   * @param {object} data - Données retournées (data)
   * @param {string} successMessage - Message en cas de succès
   * @param {string} context - Contexte pour les logs (ex: 'banUser')
   * @returns {{ ok: boolean }} ok true seulement si !error && data?.success === true
   */
  handleRPCResponse(error, data, successMessage, context) {
    if (error) {
      Logger.error('[SuperAdmin] Erreur RPC (' + (context || '') + '):', error);
      if (typeof showToast === 'function') {
        showToast('Erreur : ' + (error.message || 'Erreur réseau'), 'error');
      }
      return { ok: false };
    }
    if (!data?.success) {
      Logger.error('[SuperAdmin] Opération échouée (' + (context || '') + '):', data);
      if (typeof showToast === 'function') {
        showToast('Opération échouée : ' + (data?.error || 'Erreur inconnue'), 'error');
      }
      return { ok: false };
    }
    if (typeof showToast === 'function' && successMessage) {
      showToast(successMessage, 'success');
    }
    return { ok: true };
  },

  /**
   * Charge les utilisateurs (Supabase ou fallback local), par pages de 100.
   * RLS : n'interroge Supabase que si l'utilisateur est ADMIN ou SUPERADMIN.
   * @param {object} [opts] - { page: number } page 0-based ; si absent, page 0. Ne recharge pas si cache < 2 min et même page.
   */
  async loadUsers(opts) {
    const page = (opts && opts.page !== undefined) ? opts.page : 0;
    const forceRefresh = opts && opts.forceRefresh === true;
    const isAdmin = typeof currentCanAccessTab === 'function' && currentCanAccessTab('superadmin');
    const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : null;
    const isAdminByBadge = badge && ['ADMIN', 'SUPERADMIN'].includes(badge);

    if (!isAdmin && !isAdminByBadge) {
      this._usersCache = [];
      return this._usersCache;
    }

    const now = Date.now();
    if (!forceRefresh && this._usersTotalCount != null && (now - this._usersCacheTime) < this.USERS_CACHE_TTL_MS && this._usersPage === page) {
      return this._usersCache;
    }

    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        const from = page * 100;
        const to = from + 99;
        const { data, error, count } = await supabase
          .from('profiles')
          .select('id, username, email, badge, role, status, is_suspect, metadata, created_at, updated_at, last_login, game_pseudo, server, company, initial_honor, initial_xp, initial_rank, initial_rank_points, next_rank_points', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) {
          Logger.error('[SuperAdmin] loadUsers error', error);
          if (typeof showToast === 'function') showToast('Impossible de charger les utilisateurs : ' + (error.message || 'Erreur Supabase'), 'error');
        } else if (data) {
          this._usersTotalCount = count != null ? count : data.length;
          this._usersPage = page;
          this._usersCacheTime = now;
          this._usersCache = data.map(p => ({
            id: p.id,
            email: p.email || '',
            pseudo: p.username || p.email?.split('@')[0] || '',
            badge: p.badge,
            role: p.role,
            status: p.status || 'active',
            isSuspect: !!p.is_suspect,
            createdAt: p.created_at,
            lastActivity: p.last_login,
            adminNotes: (p.metadata?.admin_notes || []).map(n => ({ content: n.content, adminId: n.admin_id, timestamp: n.ts })),
            metadata: p.metadata,
            game_pseudo: p.game_pseudo ?? '',
            server: p.server ?? '',
            company: p.company ?? '',
            initial_honor: p.initial_honor,
            initial_xp: p.initial_xp,
            initial_rank: p.initial_rank ?? '',
            initial_rank_points: p.initial_rank_points,
            next_rank_points: p.next_rank_points
          }));
          return this._usersCache;
        }
      } catch (e) {
        Logger.error('[SuperAdmin] loadUsers: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors du chargement des utilisateurs : ' + (e?.message || 'Exception'), 'error');
      }
    }
    this._usersCache = [];
    return this._usersCache;
  },

  getUsersTotalCount() {
    return this._usersTotalCount != null ? this._usersTotalCount : 0;
  },

  /**
   * Récupère la liste des utilisateurs (cache, page courante)
   */
  getUsers() {
    if (this._usersCache.length > 0) return this._usersCache;
    return [];
  },


  /**
   * Enregistre un log d'action administrative
   */
  logAction(userId, action, details = {}) {
    const logs = UnifiedStorage.get(this.STORAGE_KEYS.ACTION_LOGS, []);
    logs.unshift({
      id: 'log_' + Date.now(),
      userId,
      adminId: this._currentAdminId,
      adminLabel: 'Super Admin',
      action,
      details,
      timestamp: new Date().toISOString()
    });
    UnifiedStorage.set(this.STORAGE_KEYS.ACTION_LOGS, logs.slice(0, 5000));
    return logs[0];
  },

  /**
   * Met à jour un utilisateur
   */
  async updateUser(userId, updates) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    const hasAdminUpdate = updates.status != null || updates.email != null || updates.isSuspect != null ||
      updates.game_pseudo != null || updates.server != null || updates.company != null ||
      updates.initial_honor != null || updates.initial_xp != null || updates.initial_rank != null ||
      updates.initial_rank_points != null || updates.next_rank_points != null;
    if (supabase && hasAdminUpdate) {
      try {
        const payload = {
          p_target_id: userId,
          p_status: updates.status ?? null,
          p_email: updates.email ?? null,
          p_is_suspect: updates.isSuspect != null ? updates.isSuspect : null
        };
        if (updates.game_pseudo !== undefined) payload.p_game_pseudo = updates.game_pseudo || null;
        if (updates.server !== undefined) payload.p_server = updates.server || null;
        if (updates.company !== undefined) payload.p_company = updates.company || null;
        if (updates.initial_honor !== undefined) payload.p_initial_honor = updates.initial_honor;
        if (updates.initial_xp !== undefined) payload.p_initial_xp = updates.initial_xp;
        if (updates.initial_rank !== undefined) payload.p_initial_rank = updates.initial_rank || null;
        if (updates.initial_rank_points !== undefined) payload.p_initial_rank_points = updates.initial_rank_points;
        if (updates.next_rank_points !== undefined) payload.p_next_rank_points = updates.next_rank_points;
        const { data, error } = await supabase.rpc('admin_update_profile', payload);
        const result = this.handleRPCResponse(error, data, 'Utilisateur mis à jour avec succès.', 'updateUser');
        if (!result.ok) return null;
        const u = this.getUsers().find(x => x.id === userId);
        if (u) Object.assign(u, updates);
        return u;
      } catch (e) {
        Logger.error('[SuperAdmin] updateUser: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors de la mise à jour : ' + (e?.message || 'Exception'), 'error');
        return null;
      }
    }
    return this._updateUserLocal(userId, updates);
  },

  _updateUserLocal(userId, updates) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    UnifiedStorage.set(this.STORAGE_KEYS.USERS, users);
    return users[idx];
  },

  /**
   * Bannir un compte (RPC Supabase ou local)
   */
  async banUser(userId) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('admin_ban_user', { p_target_id: userId });
        const result = this.handleRPCResponse(error, data, 'Utilisateur banni avec succès.', 'banUser');
        if (!result.ok) return null;
        const u = this.getUsers().find(x => x.id === userId);
        if (u) {
          u.status = 'banned';
          this.logAction(userId, 'ban', { email: u.email });
        }
        return u;
      } catch (e) {
        Logger.error('[SuperAdmin] banUser: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors du bannissement : ' + (e?.message || 'Exception'), 'error');
        return null;
      }
    }
    const user = this._updateUserLocal(userId, { status: 'banned' });
    if (user) this.logAction(userId, 'ban', { email: user.email });
    if (typeof showToast === 'function') showToast('Utilisateur banni (mode local).', 'success');
    return user;
  },

  /**
   * Changer le badge d'un utilisateur (FREE, PRO ou ADMIN uniquement — jamais SUPERADMIN)
   */
  async changeBadge(userId, newBadge) {
    const allowed = ['FREE', 'PRO', 'ADMIN'];
    if (!allowed.includes(newBadge)) {
      if (typeof showToast === 'function') showToast('Badge non autorisé (FREE, PRO ou ADMIN uniquement).', 'error');
      return null;
    }
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('admin_change_badge', { p_target_id: userId, p_new_badge: newBadge });
        const result = this.handleRPCResponse(error, data, 'Badge mis à jour.', 'changeBadge');
        if (!result.ok) return null;
        const u = this.getUsers().find(x => x.id === userId);
        if (u) u.badge = newBadge;
        return u;
      } catch (e) {
        Logger.error('[SuperAdmin] changeBadge: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur : ' + (e?.message || 'Exception'), 'error');
        return null;
      }
    }
    const user = this.getUsers().find(x => x.id === userId);
    if (user) {
      user.badge = newBadge;
      this.logAction(userId, 'badge_change', { new: newBadge });
    }
    if (typeof showToast === 'function') showToast('Badge mis à jour (mode local).', 'success');
    return user;
  },

  /**
   * Débannir un compte
   */
  async unbanUser(userId) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('admin_unban_user', { p_target_id: userId });
        const result = this.handleRPCResponse(error, data, 'Utilisateur débanni avec succès.', 'unbanUser');
        if (!result.ok) return null;
        const u = this.getUsers().find(x => x.id === userId);
        if (u) {
          u.status = 'active';
          this.logAction(userId, 'unban', { email: u.email });
        }
        return u;
      } catch (e) {
        Logger.error('[SuperAdmin] unbanUser: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors du débannissement : ' + (e?.message || 'Exception'), 'error');
        return null;
      }
    }
    const user = this._updateUserLocal(userId, { status: 'active' });
    if (user) this.logAction(userId, 'unban', { email: user.email });
    if (typeof showToast === 'function') showToast('Utilisateur débanni (mode local).', 'success');
    return user;
  },

  /**
   * Suspendre un compte
   */
  async suspendUser(userId) {
    const user = await this.updateUser(userId, { status: 'suspended' });
    if (user) this.logAction(userId, 'suspend', { email: user.email });
    return user;
  },

  /**
   * Marquer comme suspect
   */
  async markSuspect(userId) {
    const user = await this.updateUser(userId, { isSuspect: true });
    if (user) this.logAction(userId, 'mark_suspect', { email: user.email });
    return user;
  },

  /**
   * Retirer le drapeau suspect
   */
  unmarkSuspect(userId) {
    const user = this.updateUser(userId, { isSuspect: false });
    if (user) this.logAction(userId, 'unmark_suspect', { email: user.email });
    return user;
  },

  /**
   * Ajouter une note admin (RPC ou local)
   */
  async addAdminNote(userId, content) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('admin_add_note', { p_target_id: userId, p_note: content });
        const result = this.handleRPCResponse(error, data, 'Note ajoutée avec succès.', 'addAdminNote');
        if (!result.ok) return null;
        const u = this.getUsers().find(x => x.id === userId);
        if (u) {
          u.adminNotes = u.adminNotes || [];
          u.adminNotes.push({ content, adminId: 'admin', timestamp: new Date().toISOString() });
        }
        return u;
      } catch (e) {
        Logger.error('[SuperAdmin] addAdminNote: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors de l\'ajout de la note : ' + (e?.message || 'Exception'), 'error');
        return null;
      }
    }
    return this._addAdminNoteLocal(userId, content);
  },

  _addAdminNoteLocal(userId, content) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return null;
    const note = { id: 'note_' + Date.now(), content, adminId: 'super-admin-default', timestamp: new Date().toISOString() };
    users[idx].adminNotes = users[idx].adminNotes || [];
    users[idx].adminNotes.push(note);
    UnifiedStorage.set(this.STORAGE_KEYS.USERS, users);
    this.logAction(userId, 'add_note', { preview: content.substring(0, 50) });
    return users[idx];
  },

  /**
   * Récupère les logs d'un utilisateur (Supabase ou local)
   */
  async getUserActionLogs(userId) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('get_user_admin_logs', { p_target_id: userId });
        if (error) {
          Logger.error('[SuperAdmin] getUserActionLogs RPC error', error);
          if (typeof showToast === 'function') showToast('Impossible de charger l\'historique : ' + (error.message || 'Erreur'), 'error');
          const logs = UnifiedStorage.get(this.STORAGE_KEYS.ACTION_LOGS, []);
          return logs.filter(l => l.userId === userId);
        }
        if (data) return data.map(l => ({ action: l.action, adminLabel: l.admin_id, timestamp: l.created_at, details: l.details }));
      } catch (e) {
        Logger.error('[SuperAdmin] getUserActionLogs: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors du chargement de l\'historique.', 'error');
        const logs = UnifiedStorage.get(this.STORAGE_KEYS.ACTION_LOGS, []);
        return logs.filter(l => l.userId === userId);
      }
    }
    const logs = UnifiedStorage.get(this.STORAGE_KEYS.ACTION_LOGS, []);
    return Promise.resolve(logs.filter(l => l.userId === userId));
  },

  /**
   * Récupère les événements de sécurité (SUPERADMIN uniquement)
   */
  async getSecurityEvents(limit = 100, offset = 0, eventType = null) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase && typeof currentHasFeature === 'function' && currentHasFeature('dashboardViewAdminLogs')) {
      try {
        const { data, error } = await supabase.rpc('get_security_events', {
          p_limit: limit,
          p_offset: offset,
          p_event_type: eventType || undefined
        });
        if (error) {
          Logger.error('[SuperAdmin] getSecurityEvents RPC error', error);
          if (typeof showToast === 'function') showToast('Impossible de charger les événements : ' + (error.message || 'Erreur'), 'error');
          return [];
        }
        return data || [];
      } catch (e) {
        Logger.error('[SuperAdmin] getSecurityEvents: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors du chargement des événements de sécurité.', 'error');
        return [];
      }
    }
    return [];
  },

  /**
   * Récupère les logs admin globaux (SUPERADMIN uniquement)
   */
  async getAdminLogs(limit = 100) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase && typeof currentHasFeature === 'function' && currentHasFeature('dashboardViewAdminLogs')) {
      try {
        const { data, error } = await supabase.rpc('get_admin_logs', { p_limit: limit, p_offset: 0 });
        if (error) {
          Logger.error('[SuperAdmin] getAdminLogs RPC error', error);
          if (typeof showToast === 'function') showToast('Impossible de charger les logs admin : ' + (error.message || 'Erreur'), 'error');
          return [];
        }
        return data || [];
      } catch (e) {
        Logger.error('[SuperAdmin] getAdminLogs: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors du chargement des logs admin.', 'error');
        return [];
      }
    }
    return [];
  },

  /**
   * Filtre et tri des utilisateurs
   */
  filterUsers(users, filters) {
    let result = [...users];
    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(u => u.email.toLowerCase().includes(s) || u.id.toLowerCase().includes(s));
    }
    if (filters.status && filters.status !== 'all') {
      result = result.filter(u => u.status === filters.status);
    }
    if (filters.suspectOnly) {
      result = result.filter(u => u.isSuspect);
    }
    if (filters.sortBy) {
      const dir = filters.sortDir || 'asc';
      result.sort((a, b) => {
        let va = a[filters.sortBy];
        let vb = b[filters.sortBy];
        if (filters.sortBy === 'createdAt' || filters.sortBy === 'lastActivity') {
          va = va ? new Date(va).getTime() : 0;
          vb = vb ? new Date(vb).getTime() : 0;
        } else if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  },

  /**
   * Formate une date
   */
  formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  },

  /**
   * Libellé du statut
   */
  getStatusLabel(status) {
    const map = { active: 'Actif', banned: 'Banni', suspended: 'Suspendu' };
    return map[status] || status;
  }
};

// ==========================================
// INITIALISATION UI
// ==========================================

function initSuperAdmin() {
  const container = document.getElementById('superAdminContainer');
  if (!container) return;

  let _saConfirmCallback = null;
  let _saEventsCollectedRegistered = false;

  function escapeHtml(str) {
    if (str == null || str === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
  function saSafeCssToken(s) {
    var t = String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return t || 'unknown';
  }

  // Nettoyer l'ancien cache utilisateurs démo (plus utilisé)
  try {
    var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
    var usersKey = sk.ADMIN_USERS || 'darkOrbitAdminUsers';
    if (typeof UnifiedStorage !== 'undefined' && UnifiedStorage.remove) UnifiedStorage.remove(usersKey);
  } catch (_) {}

  let filters = { search: '', status: 'all', suspectOnly: false, sortBy: 'createdAt', sortDir: 'desc' };
  let selectedUserId = null;
  let currentPage = 0;

  async function render() {
    await SuperAdmin.loadUsers({ page: currentPage });
    const users = SuperAdmin.getUsers();
    const filtered = SuperAdmin.filterUsers(users, filters);
    renderUserTable(filtered);
    renderPagination();
    bindTableEvents();
  }

  function renderPagination() {
    const total = SuperAdmin.getUsersTotalCount();
    const paginationEl = document.getElementById('superAdminPagination');
    if (!paginationEl) return;
    if (total <= 100) {
      paginationEl.style.display = 'none';
      paginationEl.innerHTML = '';
      return;
    }
    const totalPages = Math.ceil(total / 100);
    paginationEl.style.display = 'flex';
    paginationEl.innerHTML = [
      '<button type="button" class="sa-btn sa-btn--sm" id="superAdminPagePrev" ' + (currentPage <= 0 ? 'disabled' : '') + '>← Précédent</button>',
      '<span class="sa-pagination-info">Page ' + (currentPage + 1) + ' / ' + totalPages + ' (' + total + ' utilisateurs)</span>',
      '<button type="button" class="sa-btn sa-btn--sm" id="superAdminPageNext" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>Suivant →</button>'
    ].join('');
    document.getElementById('superAdminPagePrev')?.addEventListener('click', function () {
      if (currentPage > 0) { currentPage--; render(); }
    });
    document.getElementById('superAdminPageNext')?.addEventListener('click', function () {
      if (currentPage < totalPages - 1) { currentPage++; render(); }
    });
  }

  function renderUserTable(users) {
    const tbody = document.getElementById('superAdminTableBody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => {
      const badgeHtml = typeof generateUserBadge === 'function' ? generateUserBadge(u.badge) : ('<span class="user-badge user-badge--free">' + escapeHtml(u.badge || '—') + '</span>');
      var createdEsc = escapeHtml(SuperAdmin.formatDate(u.createdAt));
      var lastActEsc = escapeHtml(SuperAdmin.formatDate(u.lastActivity));
      return `
      <tr class="sa-row ${u.isSuspect ? 'sa-row--suspect' : ''}" data-user-id="${escapeHtml(u.id)}">
        <td><code class="sa-id">${escapeHtml(u.id)}</code></td>
        <td title="${escapeHtml(u.email)}">${escapeHtml(u.email)}</td>
        <td class="sa-col-badge">${badgeHtml}</td>
        <td>${createdEsc}</td>
        <td><span class="sa-status sa-status--${saSafeCssToken(u.status)}">${escapeHtml(SuperAdmin.getStatusLabel(u.status))}</span></td>
        <td>${u.isSuspect ? '<span class="sa-flag" title="Compte suspect">🚩</span>' : '—'}</td>
        <td class="sa-col-last-activity" title="${lastActEsc}">${lastActEsc}</td>
        <td class="sa-actions-cell sa-col-actions">
          <button class="sa-btn sa-btn-sm" data-action="menu" data-user-id="${u.id}" title="Actions">⋮</button>
        </td>
      </tr>
    `;
    }).join('') || '<tr><td colspan="8" class="sa-empty">Aucun utilisateur</td></tr>';
  }

  async function openActionPopup(userId) {
    selectedUserId = userId;
    const user = SuperAdmin.getUsers().find(u => u.id === userId);
    if (!user) return;
    const popup = document.getElementById('superAdminActionPopup');
    if (!popup) return;

    document.getElementById('saPopupUserId').textContent = user.id || '—';
    document.getElementById('saPopupPseudo').textContent = user.pseudo || user.email?.split('@')[0] || '—';
    document.getElementById('saPopupEmail').textContent = user.email || '—';
    const popupBadge = document.getElementById('saPopupBadge');
    if (popupBadge) {
      if (typeof generateUserBadge === 'function') popupBadge.innerHTML = generateUserBadge(user.badge);
      else popupBadge.textContent = user.badge || '—';
    }
    var gradeEl = document.getElementById('saPopupGrade');
    var levelEl = document.getElementById('saPopupLevel');
    var honorEl = document.getElementById('saPopupHonor');
    var xpEl = document.getElementById('saPopupXp');
    var rankPointsEl = document.getElementById('saPopupRankPoints');
    if (gradeEl) gradeEl.textContent = 'En attente';
    if (levelEl) levelEl.textContent = 'En attente';
    if (honorEl) honorEl.textContent = 'En attente';
    if (xpEl) xpEl.textContent = 'En attente';
    if (rankPointsEl) rankPointsEl.textContent = 'En attente';

    var formatNumber = function (v) {
      if (v == null || v === undefined) return 'En attente';
      var num = Number(v);
      if (Number.isNaN(num)) return 'En attente';
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        const { data: stats } = await supabase.rpc('get_user_latest_stats', { p_user_id: userId });
        if (stats) {
          var gradeName = stats.grade || 'En attente';
          if (gradeEl) {
            if (typeof getRankImg === 'function' && gradeName !== 'En attente') {
              var rankImg = getRankImg(gradeName);
              if (rankImg) {
                gradeEl.setAttribute('data-fallback', gradeName);
                gradeEl.innerHTML = '<img src="' + escapeHtml(rankImg) + '" alt="' + escapeHtml(gradeName) + '" class="ranking-grade-img" width="28" height="28" onerror="var p=this.parentNode;if(p)p.textContent=p.getAttribute(\'data-fallback\')||\'—\';">';
              } else {
                gradeEl.textContent = gradeName;
              }
            } else {
              gradeEl.textContent = gradeName;
            }
          }
          if (honorEl) honorEl.textContent = formatNumber(stats.honor);
          if (xpEl) xpEl.textContent = formatNumber(stats.xp);
          if (rankPointsEl) rankPointsEl.textContent = formatNumber(stats.rank_points);
        }

        try {
          const { data: profRows } = await supabase
            .from('profiles_players')
            .select('level')
            .eq('user_id', userId)
            .limit(1);
          const profile = Array.isArray(profRows) && profRows[0] ? profRows[0] : null;
          if (profile && profile.level != null && levelEl) {
            levelEl.textContent = String(profile.level);
          }
        } catch (_) {}
      } catch (_) {}
    }

    const banBtn = popup.querySelector('[data-menu-action="ban"]');
    const unbanBtn = popup.querySelector('[data-menu-action="unban"]');
    const suspectBtn = popup.querySelector('[data-menu-action="suspect"]');
    const unsuspectBtn = popup.querySelector('[data-menu-action="unsuspect"]');
    const canBanUnban = typeof currentHasFeature === 'function' && currentHasFeature('dashboardBanUnban');
    if (banBtn) banBtn.style.display = (canBanUnban && user.status !== 'banned') ? '' : 'none';
    if (unbanBtn) unbanBtn.style.display = (canBanUnban && user.status === 'banned') ? '' : 'none';
    if (suspectBtn) suspectBtn.style.display = user.isSuspect ? 'none' : '';
    if (unsuspectBtn) unsuspectBtn.style.display = !user.isSuspect ? 'none' : '';

    popup.classList.add('sa-modal--open');
  }

  function closeActionPopup() {
    const popup = document.getElementById('superAdminActionPopup');
    if (popup) popup.classList.remove('sa-modal--open');
    selectedUserId = null;
  }

  function bindTableEvents() {
    document.querySelectorAll('[data-action="menu"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openActionPopup(btn.dataset.userId);
      });
    });
  }

  document.getElementById('superAdminActionPopupClose')?.addEventListener('click', closeActionPopup);
  document.querySelector('.sa-action-popup-overlay')?.addEventListener('click', closeActionPopup);

  const searchInput = document.getElementById('superAdminSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => { filters.search = e.target.value; render(); });
  }

  const statusFilter = document.getElementById('superAdminFilterStatus');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => { filters.status = e.target.value; render(); });
  }

  const suspectFilter = document.getElementById('superAdminFilterSuspect');
  if (suspectFilter) {
    suspectFilter.addEventListener('change', (e) => { filters.suspectOnly = e.target.checked; render(); });
  }

  const sortSelect = document.getElementById('superAdminSort');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      const v = e.target.value;
      filters.sortBy = v.split('_')[0];
      filters.sortDir = v.endsWith('_desc') ? 'desc' : 'asc';
      render();
    });
  }

  // Handlers du menu d'actions
  const menu = document.getElementById('superAdminActionMenu');
  if (menu) {
    menu.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-menu-action]')?.dataset.menuAction;
      if (!action || !selectedUserId) return;
      e.stopPropagation();
      await handleMenuAction(action, selectedUserId);
      closeActionPopup();
      await render();
    });
  }

  async function handleMenuAction(action, userId) {
    const user = SuperAdmin.getUsers().find(u => u.id === userId);
    if (!user) return;
    switch (action) {
      case 'msg':
        closeActionPopup();
        openMessageModal(userId, user);
        break;
      case 'ban':
        showConfirmModal('Bannir l\'utilisateur', 'Bannir définitivement cet utilisateur ? Il ne pourra plus se connecter.', async () => {
          await SuperAdmin.banUser(userId);
          closeActionPopup();
          await render();
        });
        return;
      case 'unban':
        showConfirmModal('Débannir l\'utilisateur', 'Réactiver le compte de cet utilisateur ?', async () => {
          await SuperAdmin.unbanUser(userId);
          closeActionPopup();
          await render();
        });
        return;
      case 'suspect':
        SuperAdmin.markSuspect(userId);
        break;
      case 'unsuspect':
        SuperAdmin.unmarkSuspect(userId);
        break;
      case 'edit':
        closeActionPopup();
        openEditModal(userId);
        break;
      case 'notes':
        closeActionPopup();
        openNotesModal(userId);
        break;
      case 'history':
        closeActionPopup();
        openHistoryModal(userId);
        break;
    }
  }

  function openMessageModal(userId, user) {
    const modal = document.getElementById('superAdminMessageModal');
    const recipientEl = document.getElementById('saMessageRecipient');
    const subjectInput = document.getElementById('saMessageSubject');
    const contentInput = document.getElementById('saMessageContent');
    if (!modal || !recipientEl || !contentInput) return;
    recipientEl.textContent = user?.email || user?.pseudo || userId;
    if (subjectInput) subjectInput.value = '';
    contentInput.value = '';
    modal.classList.add('sa-modal--open');
    modal.dataset.messageUserId = userId || '';
  }

  function openGlobalMessageModal() {
    const modal = document.getElementById('superAdminMessageModal');
    const recipientEl = document.getElementById('saMessageRecipient');
    const subjectInput = document.getElementById('saMessageSubject');
    const contentInput = document.getElementById('saMessageContent');
    if (!modal || !recipientEl || !contentInput) return;
    recipientEl.textContent = 'Tous les utilisateurs';
    if (subjectInput) subjectInput.value = '';
    contentInput.value = '';
    modal.classList.add('sa-modal--open');
    modal.dataset.messageUserId = 'global';
  }

  function closeMessageModal() {
    const modal = document.getElementById('superAdminMessageModal');
    if (modal) {
      modal.classList.remove('sa-modal--open');
      delete modal.dataset.messageUserId;
    }
  }

  function openEditModal(userId) {
    const user = SuperAdmin.getUsers().find(u => u.id === userId);
    if (!user) return;
    const modal = document.getElementById('superAdminEditModal');
    const emailInput = document.getElementById('superAdminEditEmail');
    const statusSelect = document.getElementById('superAdminEditStatus');
    const badgeSelect = document.getElementById('superAdminEditBadge');
    if (!modal || !emailInput || !statusSelect) return;
    emailInput.value = user.email;
    statusSelect.value = user.status;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
    set('superAdminEditGamePseudo', user.game_pseudo);
    set('superAdminEditServer', user.server);
    set('superAdminEditCompany', user.company);
    set('superAdminEditInitialXp', user.initial_xp);
    set('superAdminEditInitialHonor', user.initial_honor);
    set('superAdminEditInitialRank', user.initial_rank);
    set('superAdminEditInitialRankPoints', user.initial_rank_points);
    set('superAdminEditNextRankPoints', user.next_rank_points);
    if (badgeSelect) {
      const allowedBadges = ['FREE', 'PRO', 'ADMIN'];
      const value = allowedBadges.includes(user.badge) ? user.badge : 'ADMIN';
      badgeSelect.value = value;
      badgeSelect.disabled = user.badge === 'SUPERADMIN';
      var canEditBadge = (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'SUPERADMIN') || (typeof getCurrentBadge === 'function' && getCurrentBadge() === 'ADMIN' && typeof currentHasFeature === 'function' && currentHasFeature('dashboardEditBadges'));
      var formGroup = badgeSelect.closest('.sa-form-group');
      if (formGroup) formGroup.style.display = canEditBadge ? '' : 'none';
    }
    modal.classList.add('sa-modal--open');
    modal.dataset.editUserId = userId;
  }

  function closeEditModal() {
    const modal = document.getElementById('superAdminEditModal');
    if (modal) {
      modal.classList.remove('sa-modal--open');
      delete modal.dataset.editUserId;
    }
  }

  function openNotesModal(userId) {
    const user = SuperAdmin.getUsers().find(u => u.id === userId);
    if (!user) return;
    const modal = document.getElementById('superAdminNotesModal');
    const userLabel = document.getElementById('superAdminNotesUser');
    const list = document.getElementById('superAdminNotesList');
    const input = document.getElementById('superAdminNotesInput');
    if (!modal || !userLabel || !list) return;
    userLabel.textContent = user.email;
    list.innerHTML = (user.adminNotes || []).map(n => `
      <div class="sa-note-item">
        <div class="sa-note-meta">${escapeHtml(SuperAdmin.formatDate(n.timestamp))} — ${escapeHtml(n.adminId != null ? String(n.adminId) : '')}</div>
        <div class="sa-note-content">${escapeHtml(n.content)}</div>
      </div>
    `).join('') || '<div class="sa-note-empty">Aucune note</div>';
    if (input) input.value = '';
    modal.classList.add('sa-modal--open');
    modal.dataset.notesUserId = userId;
  }

  function closeNotesModal() {
    const modal = document.getElementById('superAdminNotesModal');
    if (modal) {
      modal.classList.remove('sa-modal--open');
      delete modal.dataset.notesUserId;
    }
  }

  async function openHistoryModal(userId) {
    const user = SuperAdmin.getUsers().find(u => u.id === userId);
    if (!user) return;
    const modal = document.getElementById('superAdminHistoryModal');
    const userLabel = document.getElementById('superAdminHistoryUser');
    const list = document.getElementById('superAdminHistoryList');
    if (!modal || !userLabel || !list) return;
    userLabel.textContent = user.email;
    list.innerHTML = '<div class="sa-log-empty">Chargement...</div>';
    modal.classList.add('sa-modal--open');
    const logs = await SuperAdmin.getUserActionLogs(userId);
    const actionLabels = { ban: 'Bannissement', unban: 'Débannissement', suspend: 'Suspension', mark_suspect: 'Marqué suspect', unmark_suspect: 'Drapeau retiré', add_note: 'Note ajoutée', edit: 'Modification', badge_change: 'Changement badge', role_change: 'Changement rôle' };
    list.innerHTML = logs.map(l => `
      <div class="sa-log-item">
        <span class="sa-log-action">${escapeHtml(actionLabels[l.action] != null ? actionLabels[l.action] : (l.action != null ? String(l.action) : '—'))}</span>
        <span class="sa-log-meta">${escapeHtml(SuperAdmin.formatDate(l.timestamp))} — ${escapeHtml(l.adminLabel != null ? String(l.adminLabel) : (l.admin_id != null ? String(l.admin_id) : '—'))}</span>
      </div>
    `).join('') || '<div class="sa-log-empty">Aucune action</div>';
  }

  function closeHistoryModal() {
    const modal = document.getElementById('superAdminHistoryModal');
    if (modal) modal.classList.remove('sa-modal--open');
  }

  function showConfirmModal(title, message, onConfirm) {
    const m = document.getElementById('saConfirmModal');
    const titleEl = document.getElementById('saConfirmTitle');
    const msgEl = document.getElementById('saConfirmMessage');
    if (!m || !titleEl || !msgEl) {
      if (onConfirm && confirm(message)) onConfirm();
      return;
    }
    titleEl.textContent = title;
    msgEl.textContent = message;
    _saConfirmCallback = onConfirm;
    m.classList.add('sa-modal--open');
  }

  function closeConfirmModal() {
    const m = document.getElementById('saConfirmModal');
    if (m) m.classList.remove('sa-modal--open');
    _saConfirmCallback = null;
  }

  document.getElementById('saConfirmCancel')?.addEventListener('click', closeConfirmModal);
  document.getElementById('saConfirmCancelBtn')?.addEventListener('click', closeConfirmModal);
  document.getElementById('saConfirmOk')?.addEventListener('click', () => {
    if (typeof _saConfirmCallback === 'function') {
      _saConfirmCallback();
      _saConfirmCallback = null;
    }
    closeConfirmModal();
  });
  document.querySelectorAll('#saConfirmModal .sa-modal-overlay').forEach(el => {
    el.addEventListener('click', function (e) { if (e.target === el) closeConfirmModal(); });
  });

  document.getElementById('superAdminEditSave')?.addEventListener('click', async () => {
    const modal = document.getElementById('superAdminEditModal');
    const userId = modal?.dataset.editUserId;
    const email = document.getElementById('superAdminEditEmail')?.value;
    const status = document.getElementById('superAdminEditStatus')?.value;
    const badgeSelect = document.getElementById('superAdminEditBadge');
    const badgeRow = badgeSelect && badgeSelect.closest('.sa-form-group');
    const newBadge = (badgeSelect && badgeRow && badgeRow.style.display !== 'none') ? badgeSelect.value : null;
    const user = userId ? SuperAdmin.getUsers().find(u => u.id === userId) : null;
    if (!userId || !email || !status) return;
    const num = (id) => { const v = document.getElementById(id)?.value; return (v === '' || v == null) ? undefined : (parseInt(v, 10) || 0); };
    const updates = {
      email,
      status,
      game_pseudo: document.getElementById('superAdminEditGamePseudo')?.value?.trim() ?? '',
      server: document.getElementById('superAdminEditServer')?.value?.trim() ?? '',
      company: document.getElementById('superAdminEditCompany')?.value?.trim() ?? '',
      initial_rank: document.getElementById('superAdminEditInitialRank')?.value?.trim() ?? ''
    };
    if (num('superAdminEditInitialXp') !== undefined) updates.initial_xp = num('superAdminEditInitialXp');
    if (num('superAdminEditInitialHonor') !== undefined) updates.initial_honor = num('superAdminEditInitialHonor');
    if (num('superAdminEditInitialRankPoints') !== undefined) updates.initial_rank_points = num('superAdminEditInitialRankPoints');
    if (num('superAdminEditNextRankPoints') !== undefined) updates.next_rank_points = num('superAdminEditNextRankPoints');
    const badgeChanged = user && newBadge && user.badge !== newBadge && ['FREE', 'PRO', 'ADMIN'].includes(newBadge);
    if (badgeChanged) {
      showConfirmModal('Changer le badge', 'Confirmer le changement de badge vers ' + newBadge + ' pour cet utilisateur ?', async () => {
        await SuperAdmin.changeBadge(userId, newBadge);
        await SuperAdmin.updateUser(userId, updates);
        closeEditModal();
        await render();
      });
      return;
    }
    await SuperAdmin.updateUser(userId, updates);
    closeEditModal();
    await render();
  });

  document.getElementById('superAdminEditCancel')?.addEventListener('click', closeEditModal);

  document.getElementById('superAdminMessageClose')?.addEventListener('click', closeMessageModal);
  document.getElementById('superAdminGlobalMessageBtn')?.addEventListener('click', () => {
    if (typeof openGlobalMessageModal === 'function') openGlobalMessageModal();
  });
  document.getElementById('superAdminGlobalMessageBtnMessages')?.addEventListener('click', () => {
    if (typeof openGlobalMessageModal === 'function') openGlobalMessageModal();
  });
  document.getElementById('superAdminSecurityEventsBtnPanel')?.addEventListener('click', () => {
    if (typeof openSecurityModal === 'function') openSecurityModal();
  });
  document.getElementById('superAdminMessageSend')?.addEventListener('click', async () => {
    const modal = document.getElementById('superAdminMessageModal');
    const userId = modal?.dataset.messageUserId;
    const subject = document.getElementById('saMessageSubject')?.value?.trim() || '';
    const content = document.getElementById('saMessageContent')?.value?.trim() || '';
    if (!content) {
      if (typeof showToast === 'function') showToast('Le message ne peut pas être vide.', 'warning');
      return;
    }
    if (typeof MessagesAPI === 'undefined') {
      if (typeof showToast === 'function') showToast('Messagerie non disponible.', 'error');
      return;
    }
    const isGlobal = userId === 'global';
    if (!isGlobal && !userId) {
      if (typeof showToast === 'function') showToast('Destinataire manquant.', 'warning');
      return;
    }
    function doSend() {
      (async function () {
        const result = isGlobal
          ? await MessagesAPI.sendGlobalMessage(subject, content)
          : await MessagesAPI.sendMessage(userId, subject, content);
        if (result?.success) {
          if (typeof showToast === 'function') showToast(isGlobal ? ('Message envoyé à ' + (result.count || 0) + ' utilisateur(s).') : 'Message envoyé.', 'success');
          closeMessageModal();
        } else {
          if (typeof showToast === 'function') showToast(result?.error || 'Erreur d\'envoi', 'error');
        }
      })();
    }
    if (isGlobal) {
      showConfirmModal('Message global', 'Envoyer ce message à tous les utilisateurs ?', () => { doSend(); });
      return;
    }
    doSend();
  });

  document.getElementById('superAdminNotesAdd')?.addEventListener('click', async () => {
    const modal = document.getElementById('superAdminNotesModal');
    const userId = modal?.dataset.notesUserId;
    const input = document.getElementById('superAdminNotesInput');
    const content = input?.value?.trim();
    if (userId && content) {
      await SuperAdmin.addAdminNote(userId, content);
      if (input) input.value = '';
      openNotesModal(userId);
      await render();
    }
  });

  document.getElementById('superAdminNotesClose')?.addEventListener('click', closeNotesModal);
  document.getElementById('superAdminHistoryClose')?.addEventListener('click', closeHistoryModal);

  document.querySelectorAll('.sa-modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => { if (e.target === el) el.closest('.sa-modal')?.classList.remove('sa-modal--open'); });
  });

  const logsBtn = document.getElementById('superAdminLogsBtn');
  const securityBtn = document.getElementById('superAdminSecurityEventsBtn');
  const keysSection = document.getElementById('superAdminKeysSection');
  if (logsBtn && typeof currentHasFeature === 'function' && currentHasFeature('dashboardViewAdminLogs')) logsBtn.style.display = '';
  if (securityBtn && typeof currentHasFeature === 'function' && currentHasFeature('dashboardViewAdminLogs')) securityBtn.style.display = '';
  if (keysSection && typeof currentHasFeature === 'function' && currentHasFeature('dashboardViewAdminLogs')) keysSection.style.display = '';
  document.getElementById('superAdminLogsBtn')?.addEventListener('click', async () => {
    if (typeof currentHasFeature !== 'function' || !currentHasFeature('dashboardViewAdminLogs')) return;
    const modal = document.getElementById('superAdminLogsModal');
    const list = document.getElementById('superAdminLogsList');
    if (!modal || !list) return;
    list.innerHTML = '<div class="sa-log-empty">Chargement...</div>';
    modal.classList.add('sa-modal--open');
    const logs = await SuperAdmin.getAdminLogs(100);
    const actionLabels = { ban: 'Bannissement', unban: 'Débannissement', badge_change: 'Changement badge', role_change: 'Changement rôle', add_note: 'Note', edit: 'Modification' };
    list.innerHTML = logs.length ? logs.map(l => `
      <div class="sa-log-item">
        <span class="sa-log-action">${escapeHtml(actionLabels[l.action] != null ? actionLabels[l.action] : (l.action != null ? String(l.action) : '—'))}</span>
        <span class="sa-log-meta">${escapeHtml(SuperAdmin.formatDate(l.created_at))} — Admin: ${escapeHtml((l.admin_id || '').slice(0, 8))}… → User: ${escapeHtml((l.target_user_id || '').slice(0, 8))}…</span>
      </div>
    `).join('') : '<div class="sa-log-empty">Aucun log</div>';
  });

  document.getElementById('superAdminLogsClose')?.addEventListener('click', () => {
    document.getElementById('superAdminLogsModal')?.classList.remove('sa-modal--open');
  });

  async function openSecurityModal() {
    if (typeof currentHasFeature !== 'function' || !currentHasFeature('dashboardViewAdminLogs')) return;
    const modal = document.getElementById('superAdminSecurityModal');
    const list = document.getElementById('superAdminSecurityList');
    const filterSelect = document.getElementById('superAdminSecurityFilter');
    if (!modal || !list) return;
    list.innerHTML = '<div class="sa-log-empty">Chargement...</div>';
    modal.classList.add('sa-modal--open');
    const eventType = filterSelect?.value || null;
    const events = await SuperAdmin.getSecurityEvents(100, 0, eventType || undefined);
    renderSecurityEvents(list, events);
  }

  function renderSecurityEvents(listEl, events) {
    if (!listEl) return;
    const labels = {
      RATE_LIMIT_EXCEEDED: 'Dépassement rate limit',
      VALIDATION_FAILED: 'Échec validation'
    };
    const formatDetails = (d) => {
      if (!d || typeof d !== 'object') return '';
      const parts = [];
      if (d.field != null) parts.push(escapeHtml(String(d.field)) + '=' + escapeHtml(String(d.value)));
      if (d.count != null && d.max != null) parts.push(escapeHtml(String(d.count)) + '/' + escapeHtml(String(d.max)));
      return parts.length ? parts.join(', ') : escapeHtml(JSON.stringify(d));
    };
    if (events.length === 0) {
      listEl.innerHTML = '<div class="sa-log-empty">Aucun événement de sécurité enregistré</div>';
    } else {
      listEl.innerHTML = events.map(e => `
        <div class="sa-security-item sa-security-item--${saSafeCssToken(e.event_type)}">
          <span class="sa-security-type">${escapeHtml(labels[e.event_type] != null ? labels[e.event_type] : (e.event_type != null ? String(e.event_type) : '—'))}</span>
          <span class="sa-security-meta">${escapeHtml(SuperAdmin.formatDate(e.created_at))} — RPC: ${escapeHtml(e.rpc_name != null ? String(e.rpc_name) : '—')} — User: ${escapeHtml((e.user_id || '').slice(0, 8))}…</span>
          ${e.details && Object.keys(e.details).length ? '<span class="sa-security-details">' + formatDetails(e.details) + '</span>' : ''}
        </div>
      `).join('');
    }
  }

  document.getElementById('superAdminSecurityEventsBtn')?.addEventListener('click', openSecurityModal);
  document.getElementById('superAdminSecurityClose')?.addEventListener('click', () => {
    document.getElementById('superAdminSecurityModal')?.classList.remove('sa-modal--open');
  });
  document.getElementById('superAdminSecurityRefreshBtn')?.addEventListener('click', async () => {
    const modal = document.getElementById('superAdminSecurityModal');
    const list = document.getElementById('superAdminSecurityList');
    const filterSelect = document.getElementById('superAdminSecurityFilter');
    if (!modal?.classList.contains('sa-modal--open') || !list) return;
    list.innerHTML = '<div class="sa-log-empty">Chargement...</div>';
    const eventType = filterSelect?.value || null;
    const events = await SuperAdmin.getSecurityEvents(100, 0, eventType || undefined);
    renderSecurityEvents(list, events);
  });
  document.getElementById('superAdminSecurityFilter')?.addEventListener('change', async () => {
    const modal = document.getElementById('superAdminSecurityModal');
    const list = document.getElementById('superAdminSecurityList');
    const filterSelect = document.getElementById('superAdminSecurityFilter');
    if (!modal?.classList.contains('sa-modal--open') || !list) return;
    list.innerHTML = '<div class="sa-log-empty">Chargement...</div>';
    const eventType = filterSelect?.value || null;
    const events = await SuperAdmin.getSecurityEvents(100, 0, eventType || undefined);
    renderSecurityEvents(list, events);
  });

  // Générateur de clés d'activation (SUPERADMIN)
  function generateRandomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let s = '';
    for (let i = 0; i < 16; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s.match(/.{1,4}/g).join('-');
  }
  /** Valeurs INTERVAL PostgreSQL pour license_keys.expires_after_activation (NULL = permanent). */
  const EXPIRES_AFTER_ACTIVATION_MAP = {
    '1d': '1 day',
    '3d': '3 days',
    '1w': '7 days',
    '2w': '14 days',
    '1m': '30 days',
    indefinite: null
  };

  document.getElementById('superAdminKeysGenerateBtn')?.addEventListener('click', async () => {
    const badgeSelect = document.getElementById('superAdminKeysBadge');
    const qtyInput = document.getElementById('superAdminKeysQuantity');
    const expiresSelect = document.getElementById('superAdminKeysExpiresIn');
    const resultDiv = document.getElementById('superAdminKeysResult');
    const outputEl = document.getElementById('superAdminKeysOutput');
    if (!badgeSelect || !qtyInput || !resultDiv || !outputEl) return;
    const badge = badgeSelect.value || 'PRO';
    let qty = parseInt(qtyInput.value, 10) || 5;
    qty = Math.max(1, Math.min(100, qty));
    const expiresIn = expiresSelect?.value || 'indefinite';
    const expiresAfterActivation =
      Object.prototype.hasOwnProperty.call(EXPIRES_AFTER_ACTIVATION_MAP, expiresIn)
        ? EXPIRES_AFTER_ACTIVATION_MAP[expiresIn]
        : null;
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) {
      if (typeof showToast === 'function') showToast('Supabase non disponible.', 'error');
      return;
    }
    const keys = [];
    const seen = new Set();
    for (let i = 0; i < qty; i++) {
      let k;
      do {
        k = generateRandomKey();
      } while (seen.has(k));
      seen.add(k);
      keys.push({ key: k, badge, expires_after_activation: expiresAfterActivation });
    }
    try {
      let inserted = 0;
      for (let j = 0; j < keys.length; j++) {
        const row = keys[j];
        const insertPayload = {
          key: row.key,
          badge: row.badge,
          expires_after_activation: row.expires_after_activation
        };
        const { error } = await supabase.from('license_keys').insert(insertPayload);
        if (error) throw error;
        inserted += 1;
      }
      const i18nT = typeof window !== 'undefined' && typeof window.i18nT === 'function' ? window.i18nT : null;
      const expiresLabelKey =
        expiresIn === '1d'
          ? 'sa_keys_expires_1d'
          : expiresIn === '3d'
            ? 'sa_keys_expires_3d'
            : expiresIn === '1w'
              ? 'sa_keys_expires_1w'
              : expiresIn === '2w'
                ? 'sa_keys_expires_2w'
                : expiresIn === '1m'
                  ? 'sa_keys_expires_1m'
                  : 'sa_keys_expires_indefinite';

      const expiresLabel = i18nT ? i18nT(expiresLabelKey) : expiresIn;
      const periodPrefix = i18nT ? i18nT('sa_keys_pro_period_line_prefix') : 'Période PRO après activation :';
      const expiresText = expiresAfterActivation === null ? expiresLabel : `${periodPrefix} ${expiresLabel}`;

      const lines = keys.map((r) => `${r.key} — ${expiresText}`);
      outputEl.value = lines.join('\n');
      resultDiv.style.display = 'block';
      if (typeof showToast === 'function') showToast(inserted + ' clé(s) générée(s).', 'success');
    } catch (e) {
      if (typeof showToast === 'function') showToast('Erreur : ' + (e?.message || 'Exception'), 'error');
    }
  });
  document.getElementById('superAdminKeysCopyBtn')?.addEventListener('click', () => {
    const output = document.getElementById('superAdminKeysOutput');
    if (!output || !output.value) return;
    output.select();
    try {
      document.execCommand('copy');
      if (typeof showToast === 'function') showToast('Clés copiées dans le presse-papiers.', 'success');
    } catch (_) {
      navigator.clipboard?.writeText(output.value).then(() => {
        if (typeof showToast === 'function') showToast('Clés copiées.', 'success');
      }).catch(() => {});
    }
  });

  var _logsUnsubscribe = null;
  function loadLogsPanel() {
    var out = document.getElementById('saLogsOutput');
    var levelSelect = document.getElementById('saLogsLevelSelect');
    if (!out) return;
    if (typeof Logger === 'undefined' || !Logger.getRecentErrorWarnLogs || !Logger.subscribe) {
      out.textContent = 'Logger non disponible.';
      return;
    }
    if (levelSelect) {
      var current = (typeof Logger.getLevel === 'function' ? Logger.getLevel() : 'warn') || 'warn';
      levelSelect.value = current;
      if (!levelSelect._logsLevelBound) {
        levelSelect._logsLevelBound = true;
        levelSelect.addEventListener('change', function () {
          var val = levelSelect.value;
          if (typeof Logger.setLevel === 'function') Logger.setLevel(val);
        });
      }
    }
    if (_logsUnsubscribe) {
      try { _logsUnsubscribe(); } catch (e) {}
      _logsUnsubscribe = null;
    }
    function renderLogs() {
      var entries = Logger.getRecentErrorWarnLogs();
      if (!entries.length) {
        out.textContent = '(aucun message error/warn)';
        return;
      }
      out.textContent = entries.map(function (e) {
        return '[' + (e.ts || '') + '] ' + (e.level || '') + ' ' + (e.message || '');
      }).join('\n');
      out.scrollTop = out.scrollHeight;
    }
    renderLogs();
    _logsUnsubscribe = Logger.subscribe(function () {
      renderLogs();
    });
  }

  document.getElementById('superAdminForceSyncBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('superAdminForceSyncBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="sa-collect-btn-icon">⏳</span>'; }
    try {
      if (typeof DataSync === 'undefined' || !DataSync.sync || !DataSync.pull) {
        if (typeof showToast === 'function') showToast('DataSync non disponible.', 'error');
        return;
      }
      const syncResult = await DataSync.sync();
      if (syncResult && syncResult.success === false) {
        if (typeof showToast === 'function') showToast('Erreur sync : ' + (syncResult.reason || syncResult.error || 'inconnue'), 'error');
        return;
      }
      await DataSync.pull();
      if (typeof window.refreshRanking === 'function') window.refreshRanking();
      if (typeof showToast === 'function') showToast('Synchronisation serveur terminée.', 'success');
    } catch (e) {
      Logger.error('[SuperAdmin] Synchronisation serveur:', e);
      if (typeof showToast === 'function') showToast('Erreur : ' + (e?.message || 'inconnue'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="sa-collect-btn-icon" aria-hidden="true">🔄</span>'; }
    }
  });

  var _vueGeneraleStatsCache = null;
  var _vueGeneraleStatsCacheAt = 0;
  var VUE_GENERALE_CACHE_MS = 60000;
  function _applyVueGeneraleStats(stats, totalEl, connectedEl, sessionsEl, freeEl, proEl, adminEl) {
    if (!totalEl) return;
    if (stats) {
      totalEl.textContent = stats.total_users || 0;
      if (connectedEl) connectedEl.textContent = stats.connected_users != null ? stats.connected_users : '—';
      if (sessionsEl) sessionsEl.textContent = stats.sessions_today != null ? stats.sessions_today : '—';
      if (freeEl) freeEl.textContent = stats.free_count != null ? stats.free_count : '—';
      if (proEl) proEl.textContent = stats.pro_count != null ? stats.pro_count : '—';
      if (adminEl) adminEl.textContent = (stats.admin_count || 0) + (stats.superadmin_count || 0);
    } else {
      totalEl.textContent = '—';
      if (connectedEl) connectedEl.textContent = '—';
      if (sessionsEl) sessionsEl.textContent = '—';
      if (freeEl) freeEl.textContent = '—';
      if (proEl) proEl.textContent = '—';
      if (adminEl) adminEl.textContent = '—';
    }
  }
  async function loadVueGeneraleStats() {
    const totalEl = document.getElementById('saStatTotalUsers');
    const connectedEl = document.getElementById('saStatConnectedUsers');
    const sessionsEl = document.getElementById('saStatSessionsToday');
    const supabaseEl = document.getElementById('saStatSupabase');
    const freeEl = document.getElementById('saStatFree');
    const proEl = document.getElementById('saStatPro');
    const adminEl = document.getElementById('saStatAdmin');
    var now = Date.now();
    if (_vueGeneraleStatsCache && (now - _vueGeneraleStatsCacheAt) < VUE_GENERALE_CACHE_MS) {
      _applyVueGeneraleStats(_vueGeneraleStatsCache, totalEl, connectedEl, sessionsEl, freeEl, proEl, adminEl);
      return;
    }
    if (!totalEl) return;
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        const { data: stats, error: rpcErr } = await supabase.rpc('get_dashboard_stats');
        var toCache = !rpcErr && stats ? stats : null;
        _vueGeneraleStatsCache = toCache;
        _vueGeneraleStatsCacheAt = Date.now();
        _applyVueGeneraleStats(toCache, totalEl, connectedEl, sessionsEl, freeEl, proEl, adminEl);
      } catch (_) {
        _applyVueGeneraleStats(null, totalEl, connectedEl, sessionsEl, freeEl, proEl, adminEl);
      }
    } else {
      await SuperAdmin.loadUsers();
      const users = SuperAdmin.getUsers();
      totalEl.textContent = users.length;
      if (connectedEl) connectedEl.textContent = '—';
      if (sessionsEl) sessionsEl.textContent = '—';
      if (freeEl) freeEl.textContent = users.filter(u => u.badge === 'FREE').length;
      if (proEl) proEl.textContent = users.filter(u => u.badge === 'PRO').length;
      if (adminEl) adminEl.textContent = users.filter(u => ['ADMIN', 'SUPERADMIN'].includes(u.badge)).length;
    }
    if (supabaseEl) {
      if (supabase) {
        try {
          const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).limit(1);
          supabaseEl.textContent = error ? 'Erreur' : 'Connecté';
          supabaseEl.className = 'sa-stat-value sa-status-dot ' + (error ? 'sa-status--error' : 'sa-status--ok');
        } catch (_) {
          supabaseEl.textContent = 'Hors ligne';
          supabaseEl.className = 'sa-stat-value sa-status-dot sa-status--error';
        }
      } else {
        supabaseEl.textContent = 'Hors ligne';
        supabaseEl.className = 'sa-stat-value sa-status-dot sa-status--error';
      }
    }
  }

  async function loadPermissionsAdmin() {
    const grid = document.getElementById('saPermissionsAdminGrid');
    const saveBtn = document.getElementById('saPermissionsAdminSaveBtn');
    if (!grid || !saveBtn) return;
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase || (typeof getCurrentBadge === 'function' && getCurrentBadge() !== 'SUPERADMIN')) return;

    const PERMISSION_LIST = [
      { key: 'dashboardViewUsers', label: 'Voir utilisateurs' },
      { key: 'dashboardEditBadges', label: 'Éditer badges utilisateurs' },
      { key: 'dashboardBanUnban', label: 'Bannir utilisateurs' },
      { key: 'dashboardGenerateKeys', label: 'Générer clés de licence' },
      { key: 'dashboardCollectRankings', label: 'Collecte automatique' },
      { key: 'dashboardViewSecurityLogs', label: 'Logs de sécurité' },
      { key: 'dashboardVueGenerale', label: 'Vue générale' },
      { key: 'dashboardMessages', label: 'Messages' },
      { key: 'dashboardLogsSecurite', label: 'Logs de sécurité' },
      { key: 'dashboardClesLicence', label: 'Clés de licence' },
      { key: 'dashboardPermissionsAdmin', label: 'Permissions administrateurs' }
    ];

    // Enregistrer le handler de sauvegarde une seule fois, en dehors du try/catch
    if (!saveBtn._permBound) {
      saveBtn._permBound = true;
      saveBtn.addEventListener('click', async function () {
        const toggles = grid.querySelectorAll('.sa-permission-toggle');
        const pFeatures = {};
        toggles.forEach(function (t) { pFeatures[t.dataset.saFeature] = t.checked; });
        const prevText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Sauvegarde…';
        try {
          const { error: err } = await supabase.rpc('admin_update_admin_permissions', { p_features: pFeatures });
          if (err) {
            if (typeof showToast === 'function') showToast('Erreur : ' + (err.message || 'Sauvegarde'), 'error');
          } else {
            if (typeof BackendAPI !== 'undefined' && typeof BackendAPI.invalidateProfileCache === 'function') {
              BackendAPI.invalidateProfileCache();
            }
            if (typeof showToast === 'function') showToast('Permissions enregistrées. Les admins verront les changements au prochain rechargement.', 'success');
          }
        } catch (ex) {
          if (typeof showToast === 'function') showToast('Erreur : ' + (ex?.message || ''), 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = prevText;
        }
      });
    }

    try {
      const { data: features, error } = await supabase.rpc('get_admin_permissions_config');
      if (error) throw error;
      grid.innerHTML = PERMISSION_LIST.map(function (item) {
        var checked = features && features[item.key] ? ' checked' : '';
        return '<div class="sa-permission-row sa-switch-wrap"><label>' + item.label + '</label><label class="sa-switch"><input type="checkbox" class="sa-permission-toggle" data-sa-feature="' + item.key + '"' + checked + '><span class="sa-switch-slider"></span></label></div>';
      }).join('');
    } catch (e) {
      Logger.error('[SuperAdmin] loadPermissionsAdmin', e);
      grid.innerHTML = '<p class="sa-error-msg">Erreur chargement permissions : ' + escapeHtml(e?.message || '') + '</p>';
      if (typeof showToast === 'function') showToast('Erreur chargement permissions : ' + (e?.message || ''), 'error');
    }
  }

  function initDashboardSubTabs() {
    const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : '';
    const isSuper = badge === 'SUPERADMIN';
    const can = function (f) { return typeof currentHasFeature === 'function' && currentHasFeature(f); };
    const panels = [
      { id: 'vue-generale', superOnly: false, feature: 'dashboardVueGenerale' },
      { id: 'utilisateurs', superOnly: false, feature: 'dashboardViewUsers' },
      { id: 'messages', superOnly: false, feature: 'dashboardMessages' },
      { id: 'logs-securite', superOnly: false, feature: 'dashboardLogsSecurite' },
      { id: 'cles-licence', superOnly: false, feature: 'dashboardClesLicence' },
      { id: 'permissions-admin', superOnly: false, feature: 'dashboardPermissionsAdmin' },
      { id: 'logs', superOnly: false, feature: 'dashboardLogs' }
    ];
    const allowed = panels.filter(function (p) {
      return (isSuper || badge === 'ADMIN') && can(p.feature);
    });
    Logger.debug('[initDashboardSubTabs] badge=', badge, ', currentHasFeature(dashboardVueGenerale)=', typeof currentHasFeature === 'function' ? currentHasFeature('dashboardVueGenerale') : 'N/A', ', allowed=', allowed);
    document.querySelectorAll('#saSubtabs .sa-subtab-btn').forEach(function (btn) {
      const panelId = btn.dataset.saPanel;
      const inAllowed = allowed.some(function (a) { return a.id === panelId; });
      Logger.debug('[initDashboardSubTabs] tuile data-sa-panel=', panelId, ', inAllowed=', inAllowed);
      btn.style.display = inAllowed ? '' : 'none';
      btn.classList.toggle('active', panelId === (allowed[0] && allowed[0].id));
    });
    const firstId = (allowed[0] && allowed[0].id) || 'utilisateurs';
    document.querySelectorAll('.sa-panel').forEach(function (panel) {
      const panelId = panel.dataset.saPanel;
      const visible = allowed.some(function (a) { return a.id === panelId; });
      panel.hidden = !visible || panelId !== firstId;
    });
    const firstPanel = document.getElementById('sa-panel-' + firstId);
    if (firstPanel) firstPanel.hidden = false;
    var subtabsEl = document.getElementById('saSubtabs');
    if (subtabsEl && !subtabsEl._saBound) {
      subtabsEl._saBound = true;
      subtabsEl.addEventListener('click', function (e) {
        const btn = e.target.closest('.sa-subtab-btn');
        if (!btn || btn.style.display === 'none') return;
        const panelId = btn.dataset.saPanel;
        document.querySelectorAll('#saSubtabs .sa-subtab-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.sa-panel').forEach(function (p) {
          p.hidden = p.dataset.saPanel !== panelId;
        });
        if (panelId === 'vue-generale') loadVueGeneraleStats();
        if (panelId === 'permissions-admin') loadPermissionsAdmin();
        if (panelId === 'logs') loadLogsPanel();
        if (panelId === 'utilisateurs') { SuperAdmin.loadUsers({ page: currentPage }).then(function () { var u = SuperAdmin.getUsers(); renderUserTable(SuperAdmin.filterUsers(u, filters)); renderPagination(); bindTableEvents(); }); }
      });
    }
    if (firstId === 'vue-generale') loadVueGeneraleStats();
    if (firstId === 'permissions-admin') loadPermissionsAdmin();
    if (firstId === 'logs') loadLogsPanel();
    if (firstId === 'utilisateurs') { SuperAdmin.loadUsers({ page: currentPage }).then(function () { var u = SuperAdmin.getUsers(); renderUserTable(SuperAdmin.filterUsers(u, filters)); renderPagination(); bindTableEvents(); }); }
  }

  window.initDashboardSubTabs = initDashboardSubTabs;
  render();
}

document.addEventListener('DOMContentLoaded', initSuperAdmin);
