import { motion } from 'framer-motion';
import { Save, X, Loader, AlertCircle } from 'lucide-react';

export function SaveBar({ saving, error, onSave, onDiscard }) {
  return (
    <motion.div
      className="save-bar"
      initial={{ y: 64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 64, opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="save-bar-left">
        {error ? (
          <>
            <AlertCircle size={14} color="var(--accent-rose)" />
            <span className="save-error">{error}</span>
          </>
        ) : (
          <>
            <div className="save-dot" />
            <span className="save-label">
              Modifications non sauvegardées
            </span>
          </>
        )}
      </div>
      <div className="save-bar-actions">
        <button
          type="button"
          className="btn-ghost save-discard"
          onClick={onDiscard}
          disabled={saving}
        >
          <X size={13} /> Annuler
        </button>
        <button
          type="button"
          className="btn-primary save-btn"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader size={13} className="spin" /> Sauvegarde...
            </>
          ) : (
            <>
              <Save size={13} /> Sauvegarder
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

