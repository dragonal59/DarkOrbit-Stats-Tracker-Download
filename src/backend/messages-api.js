// ==========================================
// API MESSAGERIE ADMIN → UTILISATEURS
// Requiert : supabase-schema-messages.sql exécuté
// ==========================================

const MessagesAPI = {
  _unreadCache: null,
  _unreadCacheTime: 0,
  CACHE_TTL_MS: 30000,

  async getMessages() {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.rpc('get_my_messages');
      if (error) {
        console.warn('[MessagesAPI] getMessages:', error.message);
        return [];
      }
      return data || [];
    } catch (e) {
      console.error('[MessagesAPI] getMessages:', e);
      return [];
    }
  },

  async getUnreadCount() {
    const now = Date.now();
    if (this._unreadCache !== null && now - this._unreadCacheTime < this.CACHE_TTL_MS) {
      return this._unreadCache;
    }
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return 0;
    try {
      const { data, error } = await supabase.rpc('get_unread_messages_count');
      if (error) return 0;
      this._unreadCache = data ?? 0;
      this._unreadCacheTime = now;
      return this._unreadCache;
    } catch (e) {
      return 0;
    }
  },

  invalidateUnreadCache() {
    this._unreadCache = null;
    this._unreadCacheTime = 0;
  },

  async markAsRead(messageId) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return false;
      const { error } = await supabase
        .from('admin_messages')
        .update({ is_read: true })
        .eq('id', messageId)
        .eq('user_id', user.id);
      if (error) return false;
      this.invalidateUnreadCache();
      return true;
    } catch (e) {
      return false;
    }
  },

  async deleteMessage(messageId) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return false;
      const { error } = await supabase
        .from('admin_messages')
        .update({ deleted_by_user: true })
        .eq('id', messageId)
        .eq('user_id', user.id);
      if (error) return false;
      this.invalidateUnreadCache();
      return true;
    } catch (e) {
      return false;
    }
  },

  async sendMessage(userId, subject, message) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return { success: false, error: 'Supabase non disponible' };
    try {
      const { data, error } = await supabase.rpc('admin_send_message', {
        p_user_id: userId,
        p_subject: subject || '',
        p_message: message || ''
      });
      if (error) return { success: false, error: error.message };
      return data || { success: false };
    } catch (e) {
      return { success: false, error: e?.message || 'Erreur' };
    }
  },

  async sendGlobalMessage(subject, message) {
    const supabase = typeof getSupabaseClient === 'function' ? getSupabaseClient() : null;
    if (!supabase) return { success: false, error: 'Supabase non disponible' };
    try {
      const { data, error } = await supabase.rpc('admin_send_global_message', {
        p_subject: subject || '',
        p_message: message || ''
      });
      if (error) return { success: false, error: error.message };
      return data || { success: false };
    } catch (e) {
      return { success: false, error: e?.message || 'Erreur' };
    }
  }
};

window.MessagesAPI = MessagesAPI;
console.log('✉️ Messages API chargée');
