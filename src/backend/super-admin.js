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
      console.error('[SuperAdmin] Erreur RPC (' + (context || '') + '):', error);
      if (typeof showToast === 'function') {
        showToast('Erreur : ' + (error.message || 'Erreur réseau'), 'error');
      }
      return { ok: false };
    }
    if (!data?.success) {
      console.error('[SuperAdmin] Opération échouée (' + (context || '') + '):', data);
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
   * Charge les utilisateurs (Supabase ou fallback local)
   * RLS : n'interroge Supabase que si l'utilisateur est ADMIN ou SUPERADMIN
   */
  async loadUsers() {
    const isAdmin = typeof currentCanAccessTab === 'function' && currentCanAccessTab('superadmin');
    const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : null;
    const isAdminByBadge = badge && ['ADMIN', 'SUPERADMIN'].includes(badge);

    if (!isAdmin && !isAdminByBadge) {
      console.log('[SuperAdmin] loadUsers: Utilisateur non admin (badge=' + (badge || '?') + ') → liste vide');
      this._usersCache = [];
      return this._usersCache;
    }

    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (supabase) {
      try {
        console.log('[SuperAdmin] loadUsers: Requête profiles (admin)…');
        const { data, error } = await supabase.from('profiles').select('id, username, email, badge, role, status, is_suspect, metadata, created_at, updated_at, last_login');
        if (error) {
          console.error('[SuperAdmin] loadUsers RPC error', error);
          if (typeof showToast === 'function') showToast('Impossible de charger les utilisateurs : ' + (error.message || 'Erreur Supabase'), 'error');
        } else if (data) {
          console.log('[SuperAdmin] loadUsers: OK, ' + data.length + ' profil(s) chargé(s)');
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
            metadata: p.metadata
          }));
          return this._usersCache;
        }
      } catch (e) {
        console.error('[SuperAdmin] loadUsers: Exception', e?.message || e, e);
        if (typeof showToast === 'function') showToast('Erreur lors du chargement des utilisateurs : ' + (e?.message || 'Exception'), 'error');
      }
    }
    console.log('[SuperAdmin] loadUsers: Fallback localStorage (liste vide)');
    this._usersCache = [];
    return this._usersCache;
  },

  /**
   * Récupère la liste des utilisateurs (cache)
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
    if (supabase && (updates.status || updates.email)) {
      try {
        const { data, error } = await supabase.rpc('admin_update_profile', {
          p_target_id: userId,
          p_status: updates.status || null,
          p_email: updates.email || null,
          p_is_suspect: updates.isSuspect != null ? updates.isSuspect : null
        });
        const result = this.handleRPCResponse(error, data, 'Utilisateur mis à jour avec succès.', 'updateUser');
        if (!result.ok) return null;
        const u = this.getUsers().find(x => x.id === userId);
        if (u) Object.assign(u, updates);
        return u;
      } catch (e) {
        console.error('[SuperAdmin] updateUser: Exception', e?.message || e, e);
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
        console.error('[SuperAdmin] banUser: Exception', e?.message || e, e);
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
        console.error('[SuperAdmin] unbanUser: Exception', e?.message || e, e);
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
  suspendUser(userId) {
    const user = this.updateUser(userId, { status: 'suspended' });
    if (user) this.logAction(userId, 'suspend', { email: user.email });
    return user;
  },

  /**
   * Marquer comme suspect
   */
  markSuspect(userId) {
    const user = this.updateUser(userId, { isSuspect: true });
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
        console.error('[SuperAdmin] addAdminNote: Exception', e?.message || e, e);
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
          console.error('[SuperAdmin] getUserActionLogs RPC error', error);
          if (typeof showToast === 'function') showToast('Impossible de charger l\'historique : ' + (error.message || 'Erreur'), 'error');
          const logs = UnifiedStorage.get(this.STORAGE_KEYS.ACTION_LOGS, []);
          return logs.filter(l => l.userId === userId);
        }
        if (data) return data.map(l => ({ action: l.action, adminLabel: l.admin_id, timestamp: l.created_at, details: l.details }));
      } catch (e) {
        console.error('[SuperAdmin] getUserActionLogs: Exception', e?.message || e, e);
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
          console.error('[SuperAdmin] getSecurityEvents RPC error', error);
          if (typeof showToast === 'function') showToast('Impossible de charger les événements : ' + (error.message || 'Erreur'), 'error');
          return [];
        }
        return data || [];
      } catch (e) {
        console.error('[SuperAdmin] getSecurityEvents: Exception', e?.message || e, e);
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
          console.error('[SuperAdmin] getAdminLogs RPC error', error);
          if (typeof showToast === 'function') showToast('Impossible de charger les logs admin : ' + (error.message || 'Erreur'), 'error');
          return [];
        }
        return data || [];
      } catch (e) {
        console.error('[SuperAdmin] getAdminLogs: Exception', e?.message || e, e);
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

  // Nettoyer l'ancien cache utilisateurs démo (plus utilisé)
  try {
    var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
    var usersKey = sk.ADMIN_USERS || 'darkOrbitAdminUsers';
    if (typeof UnifiedStorage !== 'undefined' && UnifiedStorage.remove) UnifiedStorage.remove(usersKey);
  } catch (_) {}

  let filters = { search: '', status: 'all', suspectOnly: false, sortBy: 'createdAt', sortDir: 'desc' };
  let selectedUserId = null;

  async function render() {
    await SuperAdmin.loadUsers();
    const users = SuperAdmin.getUsers();
    const filtered = SuperAdmin.filterUsers(users, filters);
    renderUserTable(filtered);
    bindTableEvents();
  }

  function renderUserTable(users) {
    const tbody = document.getElementById('superAdminTableBody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => {
      const badgeHtml = typeof generateUserBadge === 'function' ? generateUserBadge(u.badge) : (u.badge || '—');
      return `
      <tr class="sa-row ${u.isSuspect ? 'sa-row--suspect' : ''}" data-user-id="${u.id}">
        <td><code class="sa-id">${u.id}</code></td>
        <td>${u.email}</td>
        <td>${badgeHtml}</td>
        <td>${SuperAdmin.formatDate(u.createdAt)}</td>
        <td><span class="sa-status sa-status--${u.status}">${SuperAdmin.getStatusLabel(u.status)}</span></td>
        <td>${u.isSuspect ? '<span class="sa-flag" title="Compte suspect">🚩</span>' : '—'}</td>
        <td>${SuperAdmin.formatDate(u.lastActivity)}</td>
        <td class="sa-actions-cell">
          <button class="sa-btn sa-btn-sm" data-action="menu" data-user-id="${u.id}" title="Actions">⋮</button>
        </td>
      </tr>
    `;
    }).join('') || '<tr><td colspan="8" class="sa-empty">Aucun utilisateur</td></tr>';
  }

  function openActionPopup(userId) {
    selectedUserId = userId;
    const user = SuperAdmin.getUsers().find(u => u.id === userId);
    if (!user) return;
    const popup = document.getElementById('superAdminActionPopup');
    if (!popup) return;

    document.getElementById('saPopupUserId').textContent = user.id || '—';
    document.getElementById('saPopupPseudo').textContent = user.pseudo || user.email?.split('@')[0] || '—';
    document.getElementById('saPopupEmail').textContent = user.email || '—';
    const popupBadge = document.getElementById('saPopupBadge');
    if (popupBadge) popupBadge.innerHTML = typeof generateUserBadge === 'function' ? generateUserBadge(user.badge) : (user.badge || '—');
    document.getElementById('saPopupGrade').textContent = user.grade || '—';
    document.getElementById('saPopupLevel').textContent = user.level != null ? user.level : '—';
    document.getElementById('saPopupHonor').textContent = user.honor != null ? user.honor.toLocaleString('fr-FR') : '—';
    document.getElementById('saPopupXp').textContent = user.xp != null ? user.xp.toLocaleString('fr-FR') : '—';
    document.getElementById('saPopupRankPoints').textContent = user.rankPoints != null ? user.rankPoints.toLocaleString('fr-FR') : '—';

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
        await SuperAdmin.banUser(userId);
        break;
      case 'unban':
        await SuperAdmin.unbanUser(userId);
        break;
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
    const badgeEl = document.getElementById('superAdminEditBadge');
    if (!modal || !emailInput || !statusSelect) return;
    emailInput.value = user.email;
    statusSelect.value = user.status;
    if (badgeEl) badgeEl.innerHTML = typeof generateUserBadge === 'function' ? generateUserBadge(user.badge) : (user.badge || '—');
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
        <div class="sa-note-meta">${SuperAdmin.formatDate(n.timestamp)} — ${n.adminId}</div>
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
        <span class="sa-log-action">${actionLabels[l.action] || l.action}</span>
        <span class="sa-log-meta">${SuperAdmin.formatDate(l.timestamp)} — ${l.adminLabel || l.admin_id || '—'}</span>
      </div>
    `).join('') || '<div class="sa-log-empty">Aucune action</div>';
  }

  function closeHistoryModal() {
    const modal = document.getElementById('superAdminHistoryModal');
    if (modal) modal.classList.remove('sa-modal--open');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById('superAdminEditSave')?.addEventListener('click', async () => {
    const modal = document.getElementById('superAdminEditModal');
    const userId = modal?.dataset.editUserId;
    const email = document.getElementById('superAdminEditEmail')?.value;
    const status = document.getElementById('superAdminEditStatus')?.value;
    if (userId && email && status) {
      await SuperAdmin.updateUser(userId, { email, status });
      closeEditModal();
      await render();
    }
  });

  document.getElementById('superAdminEditCancel')?.addEventListener('click', closeEditModal);

  document.getElementById('superAdminMessageClose')?.addEventListener('click', closeMessageModal);
  document.getElementById('superAdminGlobalMessageBtn')?.addEventListener('click', () => {
    if (typeof openGlobalMessageModal === 'function') openGlobalMessageModal();
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
    const result = isGlobal
      ? await MessagesAPI.sendGlobalMessage(subject, content)
      : await MessagesAPI.sendMessage(userId, subject, content);
    if (result?.success) {
      if (typeof showToast === 'function') showToast(isGlobal ? ('Message envoyé à ' + (result.count || 0) + ' utilisateur(s).') : 'Message envoyé.', 'success');
      closeMessageModal();
    } else {
      if (typeof showToast === 'function') showToast(result?.error || 'Erreur d\'envoi', 'error');
    }
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
  document.getElementById('superAdminRefreshBtn')?.addEventListener('click', async () => {
    await render();
  });
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
        <span class="sa-log-action">${actionLabels[l.action] || l.action}</span>
        <span class="sa-log-meta">${SuperAdmin.formatDate(l.created_at)} — Admin: ${(l.admin_id || '').slice(0, 8)}… → User: ${(l.target_user_id || '').slice(0, 8)}…</span>
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
      if (d.field != null) parts.push(d.field + '=' + d.value);
      if (d.count != null && d.max != null) parts.push(d.count + '/' + d.max);
      return parts.length ? parts.join(', ') : JSON.stringify(d);
    };
    if (events.length === 0) {
      listEl.innerHTML = '<div class="sa-log-empty">Aucun événement de sécurité enregistré</div>';
    } else {
      listEl.innerHTML = events.map(e => `
        <div class="sa-security-item sa-security-item--${(e.event_type || '').toLowerCase()}">
          <span class="sa-security-type">${labels[e.event_type] || e.event_type}</span>
          <span class="sa-security-meta">${SuperAdmin.formatDate(e.created_at)} — RPC: ${e.rpc_name || '—'} — User: ${(e.user_id || '').slice(0, 8)}…</span>
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
  document.getElementById('superAdminKeysGenerateBtn')?.addEventListener('click', async () => {
    const badgeSelect = document.getElementById('superAdminKeysBadge');
    const qtyInput = document.getElementById('superAdminKeysQuantity');
    const resultDiv = document.getElementById('superAdminKeysResult');
    const outputEl = document.getElementById('superAdminKeysOutput');
    if (!badgeSelect || !qtyInput || !resultDiv || !outputEl) return;
    const badge = badgeSelect.value || 'PRO';
    let qty = parseInt(qtyInput.value, 10) || 5;
    qty = Math.max(1, Math.min(100, qty));
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) {
      if (typeof showToast === 'function') showToast('Supabase non disponible.', 'error');
      return;
    }
    const keys = [];
    const seen = new Set();
    for (let i = 0; i < qty; i++) {
      let k;
      do { k = generateRandomKey(); } while (seen.has(k));
      seen.add(k);
      keys.push({ key: k, badge });
    }
    try {
      const { data, error } = await supabase.rpc('insert_license_keys', { p_rows: keys });
      if (error) throw error;
      if (data && data.success) {
        const inserted = data.inserted || 0;
        const lines = keys.map(r => r.key);
        outputEl.value = lines.join('\n');
        resultDiv.style.display = 'block';
        if (typeof showToast === 'function') showToast(inserted + ' clé(s) générée(s).', 'success');
      } else {
        if (typeof showToast === 'function') showToast(data?.error || 'Erreur génération.', 'error');
      }
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

  // Scraper classements (Electron)
  if (typeof window.electronScraper === 'object') {
    const startBtn = document.getElementById('superAdminCollectStartBtn');
    const stopBtn = document.getElementById('superAdminCollectStopBtn');
    const progressEl = document.getElementById('superAdminCollectProgress');
    const detailEl = document.getElementById('superAdminCollectDetail');
    const rateLimitEl = document.getElementById('superAdminCollectRateLimit');
    let pollInterval = null;

    function updateDisplay(s) {
      if (!s) return;
      if (progressEl) progressEl.textContent = s.running ? (s.currentServerIndex || 0) + '/' + (s.totalServers || 23) : '—';
      if (detailEl) detailEl.textContent = s.running && s.currentServer ? s.currentServer + ' · ' + (s.completed?.length || 0) + ' terminé(s)' : (s.running ? 'Démarrage...' : 'En attente');
    }

    window.electronScraper.onProgress((s) => updateDisplay(s));
    window.electronScraper.onError((d) => {
      if (rateLimitEl) { rateLimitEl.style.display = ''; rateLimitEl.textContent = '⚠ Erreur ' + (d.server_id || '') + ': ' + (d.message || ''); }
      if (typeof showToast === 'function') showToast('Erreur scraping ' + (d.server_id || '') + ': ' + (d.message || ''), 'warning');
    });
    if (window.electronScraper.onCaptchaRequired) {
      window.electronScraper.onCaptchaRequired((d) => {
        const msg = (d && d.message) ? d.message : 'Valide le CAPTCHA pour ' + (d?.server_id || '');
        if (rateLimitEl) { rateLimitEl.style.display = ''; rateLimitEl.textContent = '⚠ ' + msg; }
        if (typeof showToast === 'function') showToast(msg, 'warning');
      });
    }
    if (window.electronScraper.onCaptchaResolved) {
      window.electronScraper.onCaptchaResolved((d) => {
        if (rateLimitEl) rateLimitEl.style.display = 'none';
        if (typeof showToast === 'function') showToast('CAPTCHA validé pour ' + (d?.server_id || '') + ' – reprise automatique', 'success');
      });
    }
    if (window.electronScraper.onCaptchaTimeout) {
      window.electronScraper.onCaptchaTimeout((d) => {
        if (rateLimitEl) rateLimitEl.style.display = ''; rateLimitEl.textContent = '⏱ Timeout CAPTCHA ' + (d?.server_id || '');
        if (typeof showToast === 'function') showToast('Timeout 2 min – CAPTCHA non validé pour ' + (d?.server_id || ''), 'error');
      });
    }
    if (window.electronScraper.onScrapingFinished) {
      window.electronScraper.onScrapingFinished((d) => {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        if (startBtn) startBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';
        if (progressEl) progressEl.textContent = (d?.completedCount ?? 0) + '/23';
        if (detailEl) detailEl.textContent = 'Collecte terminée ✅';
        if (rateLimitEl) rateLimitEl.style.display = 'none';
        const count = d?.completedCount ?? 0;
        if (typeof showToast === 'function') showToast('Collecte terminée – ' + count + ' serveur(s) traité(s)', 'success');
      });
    }
    window.electronScraper.onRankingsUpdated(async (d) => {
      if (rateLimitEl) rateLimitEl.style.display = 'none';
      if (typeof DataSync !== 'undefined' && DataSync.pull) {
        try {
          await DataSync.pull();
        } catch (e) {
          console.warn('[SuperAdmin] DataSync.pull après rankings-updated:', e?.message);
        }
      }
      if (typeof UnifiedStorage !== 'undefined' && typeof UnifiedStorage.invalidateCache === 'function') {
        var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
        UnifiedStorage.invalidateCache(sk.IMPORTED_RANKINGS || 'darkOrbitImportedRankings');
      }
      if (typeof window.refreshRanking === 'function') window.refreshRanking();
      else if (document.getElementById('ranking-table') && typeof initRankingTab === 'function') {
        initRankingTab();
        if (typeof window.refreshRanking === 'function') window.refreshRanking();
      }
    });

    startBtn?.addEventListener('click', async () => {
      const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id && session?.access_token) {
          window.electronScraper.setUserContext(session.user.id, session.access_token);
        }
      }
      const res = await window.electronScraper.start();
      if (res && res.ok) {
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = '';
        if (progressEl) progressEl.textContent = '…';
        if (detailEl) detailEl.textContent = 'Démarrage...';
        if (rateLimitEl) rateLimitEl.style.display = 'none';
        pollInterval = setInterval(async () => {
          const s = await window.electronScraper.getState();
          updateDisplay(s);
          if (!s.running) {
            clearInterval(pollInterval);
            pollInterval = null;
            if (startBtn) startBtn.style.display = '';
            if (stopBtn) stopBtn.style.display = 'none';
            // Toast de fin géré par onScrapingFinished (évite doublon)
          }
        }, 2000);
      } else if (res && res.error && typeof showToast === 'function') {
        showToast('Erreur : ' + res.error, 'error');
      }
    });

    stopBtn?.addEventListener('click', async () => {
      if (typeof window.electronScraper?.stop === 'function') {
        await window.electronScraper.stop();
      }
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      if (startBtn) startBtn.style.display = '';
      if (stopBtn) stopBtn.style.display = 'none';
      if (progressEl) progressEl.textContent = '—';
      if (detailEl) detailEl.textContent = 'Arrêté';
      if (typeof showToast === 'function') showToast('Scraping arrêté.', 'info');
    });

    document.getElementById('superAdminCollectDebugBtn')?.addEventListener('click', async () => {
      if (typeof window.electronScraper?.showDebugWindow === 'function') {
        await window.electronScraper.showDebugWindow();
      }
    });
  }

  document.getElementById('superAdminCollectClearBtn')?.addEventListener('click', async () => {
    if (!confirm('Voulez-vous vraiment supprimer TOUS les classements importés ? Cette action est irréversible.')) return;
    try {
      var sk = (typeof window !== 'undefined' && window.APP_KEYS && window.APP_KEYS.STORAGE_KEYS) ? window.APP_KEYS.STORAGE_KEYS : {};
      var impKey = sk.IMPORTED_RANKINGS || 'darkOrbitImportedRankings';
      if (typeof UnifiedStorage !== 'undefined') {
        UnifiedStorage.set(impKey, {});
        if (typeof UnifiedStorage.invalidateCache === 'function') UnifiedStorage.invalidateCache(impKey);
      }
      if (typeof DataSync !== 'undefined' && DataSync.sync) {
        await DataSync.sync();
      }
      if (typeof window.refreshRanking === 'function') window.refreshRanking();
      else if (document.getElementById('ranking-table') && typeof initRankingTab === 'function') {
        initRankingTab();
        if (typeof window.refreshRanking === 'function') window.refreshRanking();
      }
      if (typeof showToast === 'function') showToast('Tous les classements ont été supprimés', 'success');
    } catch (e) {
      console.error('[SuperAdmin] Nettoyage classements:', e);
      if (typeof showToast === 'function') showToast('Erreur lors du nettoyage : ' + (e?.message || 'inconnue'), 'error');
    }
  });

  render();
}

document.addEventListener('DOMContentLoaded', initSuperAdmin);
console.log('🛡️ Module Super Admin chargé');
