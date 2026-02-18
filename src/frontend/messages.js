// ==========================================
// BOÎTE DE RÉCEPTION — Messages admin → utilisateurs
// Visible uniquement pour FREE et PRO
// ==========================================

const MESSAGES_POLL_INTERVAL_MS = 30000;

let _pollIntervalId = null;

let _messagesInitialized = false;

function initMessages() {
  if (_messagesInitialized) return;
  const badge = typeof getCurrentBadge === 'function' ? getCurrentBadge() : '';
  if (['ADMIN', 'SUPERADMIN'].includes(badge)) return;

  const btn = document.getElementById('messagesInboxBtn');
  if (!btn || typeof MessagesAPI === 'undefined') return;

  _messagesInitialized = true;
  btn.addEventListener('click', openMessagesModal);
  updateMessagesBadge();
  _pollIntervalId = setInterval(updateMessagesBadge, MESSAGES_POLL_INTERVAL_MS);
}

async function updateMessagesBadge() {
  const btn = document.getElementById('messagesInboxBtn');
  const badgeEl = document.getElementById('messagesBadge');
  if (!btn || !badgeEl || typeof MessagesAPI === 'undefined') return;

  const count = await MessagesAPI.getUnreadCount();
  badgeEl.textContent = count > 99 ? '99+' : String(count);
  badgeEl.style.display = count > 0 ? '' : 'none';
}

async function openMessagesModal() {
  const modal = document.getElementById('messagesInboxModal');
  const list = document.getElementById('messagesInboxList');
  if (!modal || !list) return;

  list.innerHTML = '<div class="messages-loading">Chargement...</div>';
  modal.classList.add('messages-modal--open');

  const messages = await MessagesAPI.getMessages();
  if (messages.length === 0) {
    list.innerHTML = '<div class="messages-empty">Aucun message</div>';
    return;
  }

  list.innerHTML = messages.map(m => `
    <div class="messages-item ${m.is_read ? '' : 'messages-item--unread'}" data-id="${m.id}">
      <div class="messages-item-header">
        <span class="messages-item-from">${escapeHtml(m.admin_name || 'Admin')}</span>
        <span class="messages-item-date">${formatMessageDate(m.created_at)}</span>
      </div>
      ${m.subject ? `<div class="messages-item-subject">${escapeHtml(m.subject)}</div>` : ''}
      <div class="messages-item-content">${escapeHtml(m.message || '')}</div>
      <div class="messages-item-actions">
        ${!m.is_read ? '<button type="button" class="messages-btn-read" data-action="read" data-id="' + m.id + '">✓ Lu</button>' : ''}
        <button type="button" class="messages-btn-delete" data-action="delete" data-id="${m.id}" title="Supprimer">🗑️</button>
      </div>
    </div>
  `).join('');

  list.addEventListener('click', handleMessageAction);
  await updateMessagesBadge();
}

function handleMessageAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!id) return;
  e.preventDefault();
  if (action === 'read') {
    MessagesAPI.markAsRead(id);
    btn.closest('.messages-item')?.classList.remove('messages-item--unread');
    btn.remove();
    MessagesAPI.invalidateUnreadCache();
    updateMessagesBadge();
  } else if (action === 'delete') {
    MessagesAPI.deleteMessage(id);
    btn.closest('.messages-item')?.remove();
    MessagesAPI.invalidateUnreadCache();
    updateMessagesBadge();
  }
}

function formatMessageDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function closeMessagesModal() {
  const modal = document.getElementById('messagesInboxModal');
  const list = document.getElementById('messagesInboxList');
  if (modal) modal.classList.remove('messages-modal--open');
  if (list) list.removeEventListener('click', handleMessageAction);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('messagesInboxClose')?.addEventListener('click', closeMessagesModal);
  document.querySelector('.messages-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('messages-modal-overlay')) closeMessagesModal();
  });
});

window.addEventListener('permissionsApplied', initMessages);
