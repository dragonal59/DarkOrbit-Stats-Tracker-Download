// ==========================================
// BOÎTE DE RÉCEPTION — Messages admin → utilisateurs
// ==========================================

const MESSAGES_POLL_INTERVAL_MS = 30000;
const MESSAGES_NOTIF_SOUND = 'sound/notif_box.mp3';

let _pollIntervalId = null;
let _messagesInitialized = false;
let _lastUnreadCount = 0;
let _messagesBadgeInitialized = false;

function _t(k) { return (typeof t === 'function' ? t(k) : k); }

function initMessages() {
  if (_messagesInitialized) return;
  const btn = document.getElementById('messagesInboxBtn');
  if (!btn || typeof MessagesAPI === 'undefined') return;

  _messagesInitialized = true;
  btn.addEventListener('click', openMessagesModal);
  document.getElementById('messagesInboxModal')?.addEventListener('click', handleMessageActionDelegated);
  document.addEventListener('keydown', handleMessagesEscape);
  updateMessagesBadge();
  _pollIntervalId = setInterval(updateMessagesBadge, MESSAGES_POLL_INTERVAL_MS);
}

async function updateMessagesBadge() {
  const btn = document.getElementById('messagesInboxBtn');
  const badgeEl = document.getElementById('messagesBadge');
  if (!btn || !badgeEl || typeof MessagesAPI === 'undefined') return;

  try {
    const count = await MessagesAPI.getUnreadCount();
    if (_messagesBadgeInitialized && count > _lastUnreadCount && typeof getSetting === 'function' && getSetting('soundsEnabled')) {
      playMessageNotifSound();
    }
    _messagesBadgeInitialized = true;
    _lastUnreadCount = count;
    badgeEl.textContent = count > 99 ? '99+' : String(count);
    badgeEl.style.display = count > 0 ? '' : 'none';
  } catch (e) {
    badgeEl.style.display = 'none';
  }
}

function playMessageNotifSound() {
  try {
    const a = new Audio(MESSAGES_NOTIF_SOUND);
    a.volume = 0.5;
    a.play().catch(function () {});
  } catch (_) {}
}

async function openMessagesModal() {
  const modal = document.getElementById('messagesInboxModal');
  const list = document.getElementById('messagesInboxList');
  const refreshBtn = document.getElementById('messagesInboxRefresh');
  if (!modal || !list) return;

  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'messagesInboxTitle');
  list.innerHTML = '<div class="messages-loading">' + _t('messages_loading') + '</div>';
  modal.classList.add('messages-modal--open');
  if (refreshBtn) refreshBtn.disabled = true;

  await loadMessagesIntoList(list, refreshBtn);
  const closeBtn = document.getElementById('messagesInboxClose');
  if (closeBtn) closeBtn.focus();
}

async function loadMessagesIntoList(list, refreshBtn) {
  let messages;
  try {
    messages = await MessagesAPI.getMessages();
  } catch (e) {
    list.innerHTML = '<div class="messages-empty">' + _t('messages_error') + '</div>';
    if (window.DEBUG) Logger.warn('[Messages] Erreur getMessages:', e?.message || e);
    if (refreshBtn) refreshBtn.disabled = false;
    return;
  }

  if (messages.length === 0) {
    list.innerHTML = '<div class="messages-empty">' + _t('messages_empty') + '</div>';
    if (refreshBtn) refreshBtn.disabled = false;
    return;
  }

  const markRead = _t('messages_mark_read');
  const deleteTitle = _t('messages_delete');
  list.innerHTML = messages.map(m => `
    <div class="messages-item ${m.is_read ? '' : 'messages-item--unread'}" data-id="${escapeHtml(String(m.id))}">
      <div class="messages-item-header">
        <span class="messages-item-from">${escapeHtml(m.admin_name || 'Admin')}</span>
        <span class="messages-item-date">${formatMessageDate(m.created_at)}</span>
      </div>
      ${m.subject ? `<div class="messages-item-subject">${escapeHtml(m.subject)}</div>` : ''}
      <div class="messages-item-content">${escapeHtml(m.message || '')}</div>
      <div class="messages-item-actions">
        ${!m.is_read ? `<button type="button" class="messages-btn-read" data-action="read" data-id="${escapeHtml(String(m.id))}">✓ ${escapeHtml(markRead)}</button>` : ''}
        <button type="button" class="messages-btn-delete" data-action="delete" data-id="${escapeHtml(String(m.id))}" title="${escapeHtml(deleteTitle)}">🗑️</button>
      </div>
    </div>
  `).join('');

  if (refreshBtn) refreshBtn.disabled = false;
  await updateMessagesBadge();
}

function handleMessageActionDelegated(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!id) return;
  e.preventDefault();
  if (action === 'read') {
    handleMarkAsRead(id, btn);
  } else if (action === 'delete') {
    handleDeleteMessage(id, btn);
  }
}

async function handleMarkAsRead(id, btn) {
  const item = btn.closest('.messages-item');
  if (!item) return;
  const ok = await MessagesAPI.markAsRead(id);
  if (ok) {
    item.classList.remove('messages-item--unread');
    btn.remove();
    MessagesAPI.invalidateUnreadCache();
    updateMessagesBadge();
  } else if (typeof showToast === 'function') {
    showToast(_t('messages_error_mark'), 'error');
  }
}

async function handleDeleteMessage(id, btn) {
  if (typeof showToast === 'function' && !confirm(_t('messages_delete_confirm'))) return;
  const item = btn.closest('.messages-item');
  if (!item) return;
  const ok = await MessagesAPI.deleteMessage(id);
  if (ok) {
    item.remove();
    MessagesAPI.invalidateUnreadCache();
    updateMessagesBadge();
  } else if (typeof showToast === 'function') {
    showToast(_t('messages_error_delete'), 'error');
  }
}

function handleMessagesEscape(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('messagesInboxModal');
    if (modal && modal.classList.contains('messages-modal--open')) closeMessagesModal();
  }
}

function formatMessageDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

// escapeHtml centralisé dans utils.js

function closeMessagesModal() {
  const modal = document.getElementById('messagesInboxModal');
  if (modal) {
    modal.classList.remove('messages-modal--open');
    modal.removeAttribute('role');
    modal.removeAttribute('aria-modal');
    modal.removeAttribute('aria-labelledby');
  }
}

function stopMessagesPolling() {
  if (_pollIntervalId) {
    clearInterval(_pollIntervalId);
    _pollIntervalId = null;
  }
  _messagesInitialized = false;
  _messagesBadgeInitialized = false;
  _lastUnreadCount = 0;
  const modal = document.getElementById('messagesInboxModal');
  if (modal) modal.removeEventListener('click', handleMessageActionDelegated);
  document.removeEventListener('keydown', handleMessagesEscape);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('messagesInboxClose')?.addEventListener('click', closeMessagesModal);
  document.querySelector('.messages-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('messages-modal-overlay')) closeMessagesModal();
  });
  document.getElementById('messagesInboxRefresh')?.addEventListener('click', async () => {
    const list = document.getElementById('messagesInboxList');
    const refreshBtn = document.getElementById('messagesInboxRefresh');
    if (!list) return;
    list.innerHTML = '<div class="messages-loading">' + _t('messages_loading') + '</div>';
    await loadMessagesIntoList(list, refreshBtn);
  });
});

window.addEventListener('permissionsApplied', initMessages);
window.addEventListener('userLoggedOut', stopMessagesPolling);
window.addEventListener('beforeunload', stopMessagesPolling);
window.stopMessagesPolling = stopMessagesPolling;
