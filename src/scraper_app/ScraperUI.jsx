import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { kpiData, scrapers } from './mockData';
import { AppearanceProvider } from './context/AppearanceContext';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { KPICard } from './components/KPICard';
import { ScraperTable } from './components/ScraperTable';
import { LiveFeed } from './components/LiveFeed';
import { VolumeAreaChart } from './components/VolumeAreaChart';
import { SuccessErrorBarChart } from './components/SuccessErrorBarChart';
import { ServeursPage } from './pages/ServeursPage';
import { ConsoleLogPage } from './pages/ConsoleLogPage';
import { VisualisationPage } from './pages/VisualisationPage';
import { PlanningPage } from './pages/PlanningPage';
import { DoEventsPage } from './pages/DoEventsPage';
import { ParametresPage } from './pages/ParametresPage';
import { useServersState } from './hooks/useServersState';

const MAX_SCRAPER_LOGS = 2000;

const initialDoEventsState = { loading: false, events: [], error: null };
const initialDoEventsDefinitions = { definitions: [], baseUrlForImages: '' };

export default function ScraperUI() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [scraperLogs, setScraperLogs] = useState([]);
  const [doEventsState, setDoEventsState] = useState(initialDoEventsState);
  const [doEventsDefinitions, setDoEventsDefinitions] = useState(initialDoEventsDefinitions);
  const serverState = useServersState();

  useEffect(() => {
    const api = typeof window !== 'undefined' && window.scraperBridge;
    if (api?.loadDoEventsCache) {
      api.loadDoEventsCache().then((res) => {
        if (res?.ok && Array.isArray(res.events) && res.events.length > 0) {
          setDoEventsState((s) => (s.events.length === 0 ? { ...s, events: res.events } : s));
        }
      });
    }
  }, []);

  useEffect(() => {
    const api = typeof window !== 'undefined' && window.scraperBridge;
    if (!api?.getDoEventsDefinitions) return;
    api.getDoEventsDefinitions().then((res) => {
      if (res?.ok && Array.isArray(res.definitions)) {
        setDoEventsDefinitions({ definitions: res.definitions, baseUrlForImages: res.baseUrlForImages || '' });
      }
    });
  }, []);

  useEffect(() => {
    const onLog = typeof window.electronDostatsScraper?.onLog === 'function'
      ? window.electronDostatsScraper.onLog
      : null;
    if (!onLog) return;
    const handler = (evt) => {
      setScraperLogs((prev) =>
        [
          ...prev,
          {
            id: `scraper-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: evt.type || 'info',
            message: evt.message || '',
            timestamp: evt.at || new Date().toISOString(),
            server: evt.server ?? null,
          },
        ].slice(-MAX_SCRAPER_LOGS)
      );
    };
    onLog(handler);
  }, []);

  return (
    <AppearanceProvider>
      <div className="app-background" />
      <div className="app-noise" />
      <div className="scraper-shell">
        <TitleBar />
        <div
          style={{
            display: 'flex',
            flex: '1 1 auto',
            minHeight: 0,
          }}
        >
          <Sidebar currentPage={currentPage} onChangePage={setCurrentPage} />
          <main
            style={{
              flex: '1 1 auto',
              padding: '16px 18px',
              display: 'flex',
              gap: '16px',
              minWidth: 0,
            }}
          >
            <div
              style={{
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                minWidth: 0,
              }}
            >
              {currentPage === 'dashboard' && (
                <>
                  <section className="glass kpi-section" style={{ padding: 16 }}>
                    <div className="kpi-grid">
                      {kpiData.map((kpi, idx) => (
                        <KPICard key={kpi.id} data={kpi} index={idx} />
                      ))}
                    </div>
                  </section>

                  <section
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
                      gap: 16,
                      minHeight: 260,
                    }}
                  >
                    <div className="glass" style={{ padding: 16 }}>
                      <VolumeAreaChart />
                    </div>
                    <div className="glass" style={{ padding: 16 }}>
                      <SuccessErrorBarChart />
                    </div>
                  </section>
                </>
              )}

              <AnimatePresence mode="wait">
                <motion.section
                  key={currentPage}
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="glass"
                  style={{
                    padding: 16,
                    flex: '1 1 auto',
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {currentPage === 'dashboard' && <ScraperTable items={scrapers} />}
                  {currentPage === 'scrapers' && <ServeursPage {...serverState} />}
                  {currentPage === 'console' && (
                    <ConsoleLogPage
                      scraperLogs={scraperLogs}
                      onClearScraperLogs={() => setScraperLogs([])}
                    />
                  )}
                  {currentPage === 'schedule' && <PlanningPage />}
                  {currentPage === 'analytics' && <VisualisationPage />}
                  {currentPage === 'do-events' && (
                    <DoEventsPage
                      doEventsState={doEventsState}
                      setDoEventsState={setDoEventsState}
                      definitions={doEventsDefinitions.definitions}
                      baseUrlForImages={doEventsDefinitions.baseUrlForImages}
                    />
                  )}
                  {currentPage === 'settings' && <ParametresPage />}
                </motion.section>
              </AnimatePresence>
            </div>

            <aside
              className="glass live-panel"
              style={{
                width: 340,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <LiveFeed />
            </aside>
          </main>
        </div>
      </div>
    </AppearanceProvider>
  );
}

function EmptyPanel({ title, description }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: 'Syne, system-ui',
          fontSize: 18,
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </div>
      <div
        style={{
          maxWidth: 420,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}
      >
        {description}
      </div>
    </div>
  );
}

