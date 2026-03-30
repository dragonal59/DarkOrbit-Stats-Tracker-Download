import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  const [proxyCount, setProxyCount] = useState({ active: 0, total: 0 });
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
    window.electronAPI?.loadSettings?.()
      .then((s) => {
        const list = Array.isArray(s?.proxies?.list) ? s.proxies.list : [];
        setProxyCount({ active: list.filter((p) => p.enabled).length, total: list.length });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onLog = typeof window.electronDostatsScraper?.onLog === 'function'
      ? window.electronDostatsScraper.onLog
      : null;
    if (!onLog) return;
    const handler = (evt) => {
      if (evt?.silent) return;
      setScraperLogs((prev) =>
        [
          ...prev,
          {
            id: `scraper-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: evt.type || 'info',
            message: evt.message || '',
            timestamp: evt.at || new Date().toISOString(),
            server: evt.server ?? null,
            symbol: evt.symbol || null,
            metric_type: evt.metric_type || null,
            multiline: evt.metric_type === 'player_profile_failures_list',
          },
        ].slice(-MAX_SCRAPER_LOGS)
      );
    };
    const unsub = onLog(handler);
    return () => unsub?.();
  }, []);

  const allServers = useMemo(() => serverState.groups.flatMap((g) => g.servers), [serverState.groups]);

  const kpiData = useMemo(() => {
    const total = allServers.reduce((s, sv) => s + sv.totalCount, 0);
    const success = allServers.reduce((s, sv) => s + sv.successCount, 0);
    const errors = allServers.reduce((s, sv) => s + sv.errorCount, 0);
    const rate = total > 0 ? (success / total) * 100 : 0;
    return [
      { id: 'total', label: 'Total scrappé', value: total, trend: 0, unit: '', color: 'cyan' },
      { id: 'success', label: 'Taux de succès', value: rate, trend: 0, unit: '%', color: 'emerald' },
      { id: 'proxies', label: 'Proxies actifs', value: proxyCount.active, total: proxyCount.total || undefined, trend: 0, unit: '', color: 'violet' },
      { id: 'errors', label: 'Erreurs session', value: errors, trend: 0, unit: '', color: 'rose' },
    ];
  }, [allServers, proxyCount]);

  const scrapers = useMemo(() => {
    return allServers
      .filter((s) => s.totalCount > 0 || s.status === 'running')
      .sort((a, b) => (b.lastScrape || 0) - (a.lastScrape || 0))
      .slice(0, 15)
      .map((s) => ({
        id: s.id,
        name: s.label,
        url: `dostats.info · ${s.code}`,
        status: s.status === 'idle' ? 'paused' : s.status,
        speed: s.speed ? `${s.speed}/s` : '—',
        lastRun: s.lastScrape ? serverState.timeAgo(s.lastScrape) : '—',
      }));
  }, [allServers, serverState.timeAgo]);

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
                      <VolumeAreaChart logs={scraperLogs} />
                    </div>
                    <div className="glass" style={{ padding: 16 }}>
                      <SuccessErrorBarChart groups={serverState.groups} />
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


