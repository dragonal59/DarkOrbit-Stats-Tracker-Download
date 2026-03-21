import { motion, AnimatePresence } from 'framer-motion';
import { Ban, RotateCcw, Clock } from 'lucide-react';

export function BannedList({ banned, onUnban, now }) {
  return (
    <div className="banned-list glass">
      <div className="banned-list-header">
        <Ban size={14} color="var(--accent-rose)" />
        <span className="banned-list-title">Serveurs bannis</span>
        <span className="banned-count">{banned.length}</span>
      </div>

      {banned.length === 0 && (
        <div className="banned-empty">Aucun serveur banni.</div>
      )}

      <div className="banned-items">
        <AnimatePresence>
          {banned.map((b, i) => {
            const isExpired =
              b.expiresAt && new Date(b.expiresAt) <= new Date(now);
            const expiresIn = b.expiresAt
              ? Math.max(0, Math.floor((new Date(b.expiresAt) - now) / 60000))
              : null;

            return (
              <motion.div
                key={b.serverId}
                className="banned-item"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16, height: 0 }}
                transition={{ delay: i * 0.05, duration: 0.25 }}
              >
                {/* Infos */}
                <div className="banned-item-info">
                  <span className="banned-code">{b.serverCode}</span>
                  <span className="banned-label">{b.serverLabel}</span>
                  {b.reason && (
                    <span className="banned-reason">&quot;{b.reason}&quot;</span>
                  )}

                  {/* Badge type de ban */}
                  <span className={`ban-type-badge ${b.banType}`}>
                    {b.banType === 'temporary' ? (
                      <>
                        <Clock size={9} />
                        {isExpired
                          ? 'Expiré'
                          : expiresIn !== null
                            ? expiresIn < 60
                              ? `expire dans ${expiresIn}min`
                              : `expire dans ${Math.floor(expiresIn / 60)}h`
                            : 'Temporaire'}
                      </>
                    ) : (
                      '🔒 Manuel uniquement'
                    )}
                  </span>
                </div>

                {/* Lever le ban */}
                <button
                  className="unban-btn"
                  onClick={() => onUnban(b.serverId)}
                  title="Lever le ban"
                  type="button"
                >
                  <RotateCcw size={12} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

