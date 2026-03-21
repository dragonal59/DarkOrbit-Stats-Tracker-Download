import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DostatsStatusDashboard } from './DostatsStatusDashboard';
import { SupabaseStatusDashboard } from './SupabaseStatusDashboard';
import { useAppearance } from '../context/AppearanceContext';

const navItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'scrapers', label: 'Serveurs' },
  { id: 'console', label: 'Console log' },
  { id: 'schedule', label: 'Planning' },
  { id: 'analytics', label: 'Visualisation' },
  { id: 'do-events', label: 'Événements DO' },
  { id: 'settings', label: 'Paramètres' },
];

export function Sidebar({ currentPage, onChangePage }) {
  const appearance = useAppearance();
  const [collapsed, setCollapsed] = useState(!!appearance.sidebarCollapsed);

  useEffect(() => {
    setCollapsed(!!appearance.sidebarCollapsed);
  }, [appearance.sidebarCollapsed]);

  return (
    <aside
      className={`glass sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}
      style={{
        width: collapsed ? 56 : 220,
        margin: 16,
        marginRight: 0,
        padding: collapsed ? 8 : 14,
        display: 'flex',
        flexDirection: 'column',
        gap: collapsed ? 8 : 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 8px',
        }}
      >
        <img
          src="../img/icon_app/icon_app.png"
          alt=""
          width={32}
          height={32}
          style={{ borderRadius: 8, objectFit: 'contain', flexShrink: 0 }}
        />
        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontFamily: 'Syne, system-ui',
                fontSize: 16,
                letterSpacing: 0.6,
              }}
            >
              DO Scraper
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            >
              Statistiques DarkOrbit
            </span>
          </div>
        )}
      </div>

      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          marginTop: 4,
        }}
      >
        {navItems.map((item) => {
          const active = item.id === currentPage;
          return (
            <button
              key={item.id}
              className="glass--interactive"
              onClick={() => onChangePage(item.id)}
              style={{
                borderRadius: 999,
                border: '1px solid transparent',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: active
                  ? 'linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 35%, transparent), color-mix(in srgb, var(--accent-primary) 25%, transparent))'
                  : 'transparent',
                color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 999,
                    border: '1px solid color-mix(in srgb, var(--accent-primary) 50%, transparent)',
                    boxShadow: '0 0 20px color-mix(in srgb, var(--accent-primary) 80%, transparent)',
                  }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                />
              )}
              <span
                style={{
                  width: 6,
                  height: 24,
                  borderRadius: 999,
                  background: active
                    ? 'var(--accent-primary)'
                    : 'rgba(148, 163, 184, 0.25)',
                }}
              />
              {!collapsed && (
                <span
                  style={{
                    fontSize: 13,
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {!collapsed && (
        <>
          <DostatsStatusDashboard />
          <SupabaseStatusDashboard />
        </>
      )}
    </aside>
  );
}

