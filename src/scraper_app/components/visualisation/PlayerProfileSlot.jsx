import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown } from 'lucide-react';
import { PlayerProfileCard } from './PlayerProfileCard';

export function PlayerProfileSlot({
  slot,
  profile,
  availablePlayers,
  onSelect,
  onClear,
  slotIndex,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = availablePlayers.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.userId?.toLowerCase().includes(search.toLowerCase()),
  );

  const SLOT_ACCENTS = [
    'var(--accent-cyan)',
    'var(--accent-violet)',
    'var(--accent-amber)',
  ];
  const accent = SLOT_ACCENTS[slotIndex] ?? 'var(--accent-cyan)';

  return (
    <div className="profile-slot" style={{ '--slot-accent': accent }}>
      <div className="slot-selector">
        <button
          className="slot-select-btn"
          type="button"
          onClick={() => setDropdownOpen((v) => !v)}
        >
          <span className="slot-select-label">
            {profile
              ? profile.entries[0].name
              : `Slot ${slotIndex + 1} — Choisir un joueur`}
          </span>
          <ChevronDown
            size={13}
            style={{
              transform: dropdownOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
        </button>

        {profile && (
          <button
            className="slot-clear-btn"
            type="button"
            onClick={onClear}
            title="Vider le slot"
          >
            <X size={12} />
          </button>
        )}

        <AnimatePresence>
          {dropdownOpen && (
            <motion.div
              className="slot-dropdown glass"
              initial={{ opacity: 0, y: -8, scaleY: 0.9 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -8, scaleY: 0.9 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              style={{ transformOrigin: 'top' }}
            >
              <input
                className="slot-dropdown-search"
                placeholder="Rechercher par nom ou ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <div className="slot-dropdown-list">
                {filtered.slice(0, 20).map((p) => (
                  <button
                    key={p.userId}
                    type="button"
                    className="slot-dropdown-item"
                    onClick={() => {
                      onSelect(p.userId);
                      setDropdownOpen(false);
                      setSearch('');
                    }}
                  >
                    <span className="dropdown-rank">#{p.rank}</span>
                    <span className="dropdown-name">{p.name}</span>
                    <span className="dropdown-uid">{p.userId}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <span className="dropdown-empty">Aucun résultat</span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {profile ? (
          profile.entries[0]?.fromRanking ? (
            <motion.div
              key={`rank-${profile.entries[0].user_id}`}
              className="slot-ranking-only glass"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <span className="slot-ranking-only-label">{profile.entries[0].name}</span>
              <span className="slot-ranking-only-hint">Sélectionné depuis le classement — détail profil non disponible</span>
            </motion.div>
          ) : (
            <motion.div
              key={profile.entries[0].user_id}
              initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <PlayerProfileCard player={profile.entries[0]} accent={accent} />
            </motion.div>
          )
        ) : (
          <motion.div
            key="empty"
            className="slot-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span className="slot-empty-text">Aucun profil chargé</span>
            <span className="slot-empty-hint">
              Cliquez sur un joueur dans le classement
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

