import React, { useMemo, useState } from 'react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isCloseHover, setIsCloseHover] = useState(false);

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow?.();
  };
  const handleMaximize = () => {
    window.electronAPI?.maximizeToggle?.();
    // On n'a pas de retour direct sur l'état depuis Electron dans le renderer,
    // donc on bascule localement pour afficher le libellé.
    setIsMaximized((v) => !v);
  };
  const handleClose = () => {
    window.electronAPI?.closeWindow?.();
  };

  const maximizeLabel = useMemo(() => {
    return isMaximized ? 'Rétrécir' : 'Agrandir';
  }, [isMaximized]);

  return (
    <div
      style={{
        WebkitAppRegion: 'drag',
        height: 32,
        padding: '0 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: 'var(--text-secondary)',
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background:
              'radial-gradient(circle at 30% 30%, rgba(99,179,237,0.9), transparent 60%)',
          }}
        />
        <span>Scraper — DO Stats Tracker</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          WebkitAppRegion: 'no-drag',
        }}
      >
        <button
          type="button"
          onClick={handleMinimize}
          style={controlButtonStyle}
        >
          réduire
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          style={controlButtonStyle}
        >
          {maximizeLabel}
        </button>
        <button
          type="button"
          onClick={handleClose}
          style={controlButtonStyle}
          onMouseEnter={() => setIsCloseHover(true)}
          onMouseLeave={() => setIsCloseHover(false)}
        >
          <span
            style={{
              color: isCloseHover ? '#ff4d4d' : '#ffffff',
              textShadow: isCloseHover ? '0 0 10px rgba(255, 77, 77, 0.85)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 6,
            }}
          >
            ✕
          </span>
          Fermer
        </button>
      </div>
    </div>
  );
}

const controlButtonStyle = {
  width: 'auto',
  height: 22,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: '0 8px',
  fontSize: 11,
};

