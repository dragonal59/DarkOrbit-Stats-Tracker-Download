/**
 * UI Super Admin — Gestion des comptes DarkOrbit (Electron uniquement)
 * Liste, formulaire ajout/édition, attribution serveurs.
 */
(function() {
  'use strict';

  const API = typeof window !== 'undefined' && window.electronDarkorbitAccounts;
  const section = document.getElementById('superAdminDarkOrbitAccountsSection');
  if (!section) return;
  if (!API) {
    section.style.display = 'none';
    return;
  }

  let accounts = [];
  let servers = [];
  let assignments = {};
  let editingAccountId = null;

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return '—'; }
  }

  async function load() {
    try {
      const enc = await API.isEncryptionAvailable();
      const encEl = document.getElementById('darkorbitAccountsEncryptStatus');
      if (encEl) encEl.textContent = enc ? '🔒 Chiffrement actif' : '⚠ Chiffrement non disponible';
      if (!enc) {
        if (typeof showToast === 'function') showToast('Le stockage sécurisé des mots de passe n\'est pas disponible.', 'error');
        return;
      }
      accounts = await API.list() || [];
      servers = await API.getServers() || [];
      assignments = await API.getAssignments() || {};
    } catch (e) {
      console.error('[DarkOrbitAccounts] load', e);
      if (typeof showToast === 'function') showToast('Erreur lors du chargement des comptes : ' + (e?.message || e), 'error');
    }
  }

  function renderTable() {
    const tbody = document.getElementById('darkorbitAccountsTableBody');
    const countEl = document.getElementById('darkorbitAccountsAccordionCount');
    if (!tbody) return;
    if (countEl) countEl.textContent = '(' + (accounts.length || 0) + ')';
    if (accounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="sa-empty">Aucun compte configuré</td></tr>';
      return;
    }
    tbody.innerHTML = accounts.map(a => `
      <tr data-account-id="${a.id}">
        <td>${escapeHtml(a.label || '—')}</td>
        <td>${escapeHtml(a.email || '—')}</td>
        <td>${a.serverCount != null ? a.serverCount : Object.values(assignments).filter(id => id === a.id).length}</td>
        <td><span class="sa-status sa-status--${a.isActive ? 'active' : 'suspended'}">${a.isActive ? 'Actif' : 'Inactif'}</span></td>
        <td class="sa-toggle-cell">
          <button type="button" class="sa-toggle-btn sa-toggle-btn--${a.isActive ? 'on' : 'off'}" data-account-toggle="${a.id}" title="${a.isActive ? 'Désactiver' : 'Activer'}" aria-pressed="${a.isActive}">
            ${a.isActive ? 'Oui' : 'Non'}
          </button>
        </td>
        <td>${fmtDate(a.lastUsedAt)}</td>
        <td class="sa-actions-cell">
          <button type="button" class="sa-btn sa-btn-sm" data-account-edit="${a.id}" title="Modifier">✏️</button>
          <button type="button" class="sa-btn sa-btn-sm" data-account-delete="${a.id}" title="Supprimer">🗑️</button>
        </td>
      </tr>
    `).join('');
    bindTableEvents();
  }

  function escapeHtml(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  async function setAccountActive(accountId, isActive) {
    const a = accounts.find(x => x.id === accountId);
    if (!a) return;
    try {
      await API.save({ id: a.id, label: a.label || '', email: a.email || '', isActive: isActive });
      a.isActive = isActive;
      if (typeof showToast === 'function') showToast(isActive ? 'Compte activé' : 'Compte désactivé', 'success');
      renderTable();
    } catch (e) {
      console.error('[DarkOrbitAccounts] setAccountActive', e);
      if (typeof showToast === 'function') showToast('Erreur : ' + (e?.message || e), 'error');
    }
  }

  function bindTableEvents() {
    document.querySelectorAll('[data-account-edit]').forEach(btn => {
      btn.addEventListener('click', () => openForm(btn.dataset.accountEdit));
    });
    document.querySelectorAll('[data-account-delete]').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.accountDelete));
    });
    document.querySelectorAll('[data-account-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const a = accounts.find(x => x.id === btn.dataset.accountToggle);
        if (a) setAccountActive(a.id, !a.isActive);
      });
    });
  }

  function openForm(accountId) {
    editingAccountId = accountId || null;
    const modal = document.getElementById('darkorbitAccountModal');
    const title = document.getElementById('darkorbitAccountModalTitle');
    const label = document.getElementById('darkorbitAccountLabel');
    const email = document.getElementById('darkorbitAccountEmail');
    const password = document.getElementById('darkorbitAccountPassword');
    const hint = document.getElementById('darkorbitAccountPasswordHint');
    const active = document.getElementById('darkorbitAccountActive');
    if (!modal || !title || !label || !email || !password) return;
    if (accountId) {
      const a = accounts.find(x => x.id === accountId);
      title.textContent = '✏️ Modifier le compte';
      label.value = a?.label || '';
      email.value = a?.email || '';
      password.value = '';
      hint.style.display = '';
      active.checked = a?.isActive !== false;
    } else {
      title.textContent = '➕ Ajouter un compte DarkOrbit';
      label.value = '';
      email.value = '';
      password.value = '';
      hint.style.display = 'none';
      active.checked = true;
    }
    modal.classList.add('sa-modal--open');
  }

  function closeForm() {
    const modal = document.getElementById('darkorbitAccountModal');
    if (modal) modal.classList.remove('sa-modal--open');
    editingAccountId = null;
  }

  async function saveAccount() {
    const label = document.getElementById('darkorbitAccountLabel')?.value?.trim();
    const email = document.getElementById('darkorbitAccountEmail')?.value?.trim();
    const password = document.getElementById('darkorbitAccountPassword')?.value;
    const active = document.getElementById('darkorbitAccountActive')?.checked;
    if (!label) {
      if (typeof showToast === 'function') showToast('Label requis', 'error');
      return;
    }
    if (!email) {
      if (typeof showToast === 'function') showToast('Email requis', 'error');
      return;
    }
    if (!editingAccountId && (!password || password.length < 1)) {
      if (typeof showToast === 'function') showToast('Mot de passe requis pour un nouveau compte', 'error');
      return;
    }
    try {
      const input = { id: editingAccountId, label, email, isActive: active };
      if (password && password.length > 0) input.password = password;
      await API.save(input);
      if (typeof showToast === 'function') showToast('Compte enregistré', 'success');
      closeForm();
      await refresh();
    } catch (e) {
      console.error('[DarkOrbitAccounts] save', e);
      if (typeof showToast === 'function') showToast('Erreur : ' + (e?.message || e), 'error');
    }
  }

  async function confirmDelete(accountId) {
    if (!confirm('Supprimer ce compte ? Les attributions de serveurs seront retirées.')) return;
    try {
      await API.delete(accountId);
      if (typeof showToast === 'function') showToast('Compte supprimé', 'success');
      await refresh();
    } catch (e) {
      console.error('[DarkOrbitAccounts] delete', e);
      if (typeof showToast === 'function') showToast('Erreur : ' + (e?.message || e), 'error');
    }
  }

  function openAssignments() {
    const modal = document.getElementById('darkorbitAssignmentsModal');
    const content = document.getElementById('darkorbitAssignmentsContent');
    const warnEl = document.getElementById('darkorbitAssignmentsWarn');
    if (!modal || !content) return;
    const activeAccounts = accounts.filter(a => a.isActive);
    if (activeAccounts.length === 0) {
      content.innerHTML = '<p class="sa-empty">Aucun compte actif. Créez au moins un compte et activez-le.</p>';
      warnEl.style.display = 'none';
    } else {
      const byAccount = {};
      activeAccounts.forEach(a => { byAccount[a.id] = []; });
      servers.forEach(s => {
        const aid = assignments[s];
        if (aid && byAccount[aid]) byAccount[aid].push(s);
      });
      const unassigned = servers.filter(s => !assignments[s]);
      let html = '<div class="sa-assignments-grid">';
      activeAccounts.forEach(a => {
        const current = byAccount[a.id] || [];
        html += `
          <div class="sa-assignments-card" data-account-id="${a.id}">
            <div class="sa-assignments-card-header">
              <span class="sa-assignments-card-title">${escapeHtml(a.label || a.email)}</span>
              <span class="sa-assignments-card-badge">${current.length} serveur${current.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="sa-assignments-card-servers">
              ${servers.map(s => {
                const isAssignedHere = current.includes(s);
                const label = (typeof SERVER_CODE_TO_DISPLAY !== 'undefined' && SERVER_CODE_TO_DISPLAY[s]) || s;
                return `<label class="sa-assignments-chip"><input type="checkbox" data-server="${s}" data-account="${a.id}" ${isAssignedHere ? 'checked' : ''}><span class="sa-assignments-chip-label">${escapeHtml(label)}</span></label>`;
              }).join('')}
            </div>
          </div>
        `;
      });
      html += '</div>';
      if (unassigned.length > 0) {
        const unassignedLabels = unassigned.map(s => (typeof SERVER_CODE_TO_DISPLAY !== 'undefined' && SERVER_CODE_TO_DISPLAY[s]) || s);
        warnEl.textContent = '⚠ Serveurs non assignés : ' + unassignedLabels.join(', ');
        warnEl.style.display = '';
      } else {
        warnEl.style.display = 'none';
      }
      content.innerHTML = html;
      bindAssignmentsEvents();
    }
    modal.classList.add('sa-modal--open');
  }

  function bindAssignmentsEvents() {
    document.querySelectorAll('#darkorbitAssignmentsContent input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const server = cb.dataset.server;
        const accountId = cb.dataset.account;
        if (cb.checked) {
          document.querySelectorAll(`#darkorbitAssignmentsContent input[data-server="${server}"]`).forEach(other => {
            if (other !== cb) other.checked = false;
          });
          assignments[server] = accountId;
        } else {
          delete assignments[server];
        }
        updateAssignmentsCounts();
        updateAssignmentsWarn();
      });
    });
  }

  function updateAssignmentsCounts() {
    document.querySelectorAll('.sa-assignments-card').forEach(block => {
      const accountId = block.dataset.accountId;
      const count = Object.entries(assignments).filter(([, aid]) => aid === accountId).length;
      const el = block.querySelector('.sa-assignments-card-badge');
      if (el) el.textContent = count + ' serveur' + (count !== 1 ? 's' : '');
    });
  }

  function updateAssignmentsWarn() {
    const warnEl = document.getElementById('darkorbitAssignmentsWarn');
    if (!warnEl) return;
    const unassigned = servers.filter(s => !assignments[s]);
    const dupes = servers.filter(s => {
      const aid = assignments[s];
      return aid && Object.entries(assignments).filter(([k, v]) => v === aid).length > 1;
    });
    const parts = [];
    if (unassigned.length > 0) {
      const labels = unassigned.map(s => (typeof SERVER_CODE_TO_DISPLAY !== 'undefined' && SERVER_CODE_TO_DISPLAY[s]) || s);
      parts.push('Non assignés : ' + labels.join(', '));
    }
    if (parts.length > 0) {
      warnEl.textContent = '⚠ ' + parts.join(' — ');
      warnEl.style.display = '';
    } else {
      warnEl.style.display = 'none';
    }
  }

  async function saveAssignments() {
    try {
      await API.saveAssignments(assignments);
      if (typeof showToast === 'function') showToast('Attribution enregistrée', 'success');
      closeAssignments();
      await refresh();
    } catch (e) {
      console.error('[DarkOrbitAccounts] saveAssignments', e);
      if (typeof showToast === 'function') showToast('Erreur : ' + (e?.message || e), 'error');
    }
  }

  function closeAssignments() {
    const modal = document.getElementById('darkorbitAssignmentsModal');
    if (modal) modal.classList.remove('sa-modal--open');
  }

  async function refresh() {
    await load();
    renderTable();
  }

  function initAccordion() {
    const btn = document.getElementById('darkorbitAccountsAccordionBtn');
    const body = document.getElementById('darkorbitAccountsAccordionBody');
    if (!btn || !body) return;
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      body.hidden = expanded;
    });
    body.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  async function selectAllAccounts(active) {
    if (accounts.length === 0) return;
    try {
      for (const a of accounts) {
        await API.save({ id: a.id, label: a.label || '', email: a.email || '', isActive: active });
        a.isActive = active;
      }
      if (typeof showToast === 'function') showToast(active ? 'Tous les comptes activés' : 'Tous les comptes désactivés', 'success');
      await refresh();
    } catch (e) {
      console.error('[DarkOrbitAccounts] selectAll', e);
      if (typeof showToast === 'function') showToast('Erreur : ' + (e?.message || e), 'error');
    }
  }

  function init() {
    section.style.display = '';
    refresh();
    initAccordion();
    document.getElementById('darkorbitAccountsAddBtn')?.addEventListener('click', () => openForm(null));
    document.getElementById('darkorbitAccountsAssignmentsBtn')?.addEventListener('click', openAssignments);
    document.getElementById('darkorbitAccountsSelectAllBtn')?.addEventListener('click', () => selectAllAccounts(true));
    document.getElementById('darkorbitAccountsDeselectAllBtn')?.addEventListener('click', () => selectAllAccounts(false));
    document.getElementById('darkorbitAccountModalClose')?.addEventListener('click', closeForm);
    document.querySelector('#darkorbitAccountModal .sa-modal-overlay')?.addEventListener('click', closeForm);
    document.getElementById('darkorbitAccountSaveBtn')?.addEventListener('click', saveAccount);
    document.getElementById('darkorbitAssignmentsModalClose')?.addEventListener('click', closeAssignments);
    document.querySelector('#darkorbitAssignmentsModal .sa-modal-overlay')?.addEventListener('click', closeAssignments);
    document.getElementById('darkorbitAssignmentsSaveBtn')?.addEventListener('click', saveAssignments);
  }

  init();
  console.log('🎮 Module DarkOrbit Accounts UI chargé');
})();
