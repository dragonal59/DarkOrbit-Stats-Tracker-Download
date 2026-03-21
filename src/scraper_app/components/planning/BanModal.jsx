import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Ban } from 'lucide-react';

export function BanModal({ server, onBan, onClose }) {
  const [banType, setBanType] = useState('temporary');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    onBan(
      banType,
      banType === 'temporary' && expiresAt ? expiresAt : null,
      reason,
    );
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-panel modal-panel--sm glass"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ban size={16} color="var(--accent-rose)" />
            <h2 className="modal-title">Bannir {server.code}</h2>
          </div>
          <button className="modal-close" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Type de ban */}
          <div className="form-field">
            <label className="form-label">Type de bannissement</label>
            <div className="ban-type-group">
              <button
                className={`ban-type-btn ${
                  banType === 'temporary' ? 'selected' : ''
                }`}
                onClick={() => setBanType('temporary')}
                type="button"
              >
                <span className="ban-type-title">⏱ Temporaire</span>
                <span className="ban-type-desc">
                  Exclu jusqu&apos;à une date définie, puis automatiquement
                  réactivé
                </span>
              </button>
              <button
                className={`ban-type-btn ${
                  banType === 'manual_only' ? 'selected' : ''
                }`}
                onClick={() => setBanType('manual_only')}
                type="button"
              >
                <span className="ban-type-title">🔒 Manuel uniquement</span>
                <span className="ban-type-desc">
                  Jamais dans le planning auto — scrappable à la main seulement
                </span>
              </button>
            </div>
          </div>

          {/* Date d'expiration (si temporaire) */}
          {banType === 'temporary' && (
            <motion.div
              className="form-field"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
            >
              <label className="form-label">Expiration du ban</label>
              <input
                type="datetime-local"
                className="form-input"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </motion.div>
          )}

          {/* Raison */}
          <div className="form-field">
            <label className="form-label">Raison (optionnel)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Trop de 403, données non pertinentes..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose} type="button">
            Annuler
          </button>
          <button className="btn-danger" onClick={handleSubmit} type="button">
            <Ban size={13} /> Bannir ce serveur
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

