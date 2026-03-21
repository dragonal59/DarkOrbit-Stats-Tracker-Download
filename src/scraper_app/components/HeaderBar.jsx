import React from 'react';
import { motion } from 'framer-motion';

export function HeaderBar({
  groupId,
  onGroupChange,
  profilesServer,
  onProfilesServerChange,
  profilesUserIds,
  onProfilesUserIdsChange,
  onStartRankings,
  onStartProfiles,
  loadingRankings,
  loadingProfiles,
}) {
  const onButtonMouseMove = (e) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    target.style.setProperty('--x', `${x}%`);
    target.style.setProperty('--y', `${y}%`);
  };

  return (
    <header
      className="glass"
      style={{
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          className="glass"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            padding: '8px 10px',
            gap: 8,
            borderRadius: 999,
            border: '1px solid rgba(148,163,184,0.4)',
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background:
                'radial-gradient(circle at 30% 20%, rgba(99,179,237,0.9), transparent 60%)',
            }}
          />
          <input
            type="text"
            placeholder="Search scrapers, servers or errors…"
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: 13,
              width: '100%',
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <select
            value={groupId}
            onChange={(e) => onGroupChange?.(e.target.value)}
            style={{
              background: 'transparent',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.5)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              padding: '5px 10px',
              outline: 'none',
            }}
          >
            <option value="g1_europe_countries">Groupe 1 — Europe pays</option>
            <option value="g2_europe_global">Groupe 2 — Europe globale</option>
            <option value="g3_global_pve">Groupe 3 — Global PvE</option>
            <option value="g4_east">Groupe 4 — Est</option>
            <option value="g5_america">Groupe 5 — Amérique</option>
          </select>
          <button
            className="btn"
            onMouseMove={onButtonMouseMove}
            type="button"
            disabled={loadingRankings}
            style={{ fontSize: 12, opacity: loadingRankings ? 0.7 : 1 }}
            onClick={() => onStartRankings?.()}
          >
            {loadingRankings ? 'Scraping HoF…' : 'Tester HoF DOSTATS'}
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <input
            type="text"
            value={profilesServer}
            onChange={(e) => onProfilesServerChange?.(e.target.value)}
            placeholder="Serveur (ex: gbl5)"
            style={{
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.5)',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '5px 10px',
              outline: 'none',
              width: 90,
            }}
          />
          <input
            type="text"
            value={profilesUserIds}
            onChange={(e) => onProfilesUserIdsChange?.(e.target.value)}
            placeholder="user_ids (séparés par , ou espace)"
            style={{
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.5)',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: 12,
              padding: '5px 10px',
              outline: 'none',
              width: 220,
            }}
          />
          <button
            className="btn"
            onMouseMove={onButtonMouseMove}
            type="button"
            disabled={loadingProfiles}
            style={{ fontSize: 12, opacity: loadingProfiles ? 0.7 : 1 }}
            onClick={() => onStartProfiles?.()}
          >
            {loadingProfiles ? 'Scraping profils…' : 'Tester profils DOSTATS'}
          </button>
        </div>
      </div>
    </header>
  );
}

