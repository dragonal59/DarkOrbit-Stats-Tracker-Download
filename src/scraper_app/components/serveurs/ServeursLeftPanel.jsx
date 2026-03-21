import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Server, AlertCircle, Zap } from 'lucide-react';

const DOSTATS_TEST_SERVER = 'gbl5';
const DOSTATS_TEST_TYPE = 'honor';
const DOSTATS_TEST_PERIOD = 'current';
const DOSTATS_TEST_COUNT = 5;
const DOSTATS_TEST_SCAN_PROFILES_COUNT = 1;
const DOSTATS_TEST_SCAN_PROFILES_CONCURRENCY = 1;

async function runDostatsSpeedTest() {
  const api = typeof window !== 'undefined' && window.electronDostatsScraper;
  if (!api || typeof api.measureLatency !== 'function') {
    throw new Error("API DOSTATS indisponible pour le test de latence.");
  }

  const canScan = typeof api.measureLatencyAndScanProfiles === 'function';
  const res = canScan
    ? await api.measureLatencyAndScanProfiles(
        DOSTATS_TEST_SERVER,
        DOSTATS_TEST_TYPE,
        DOSTATS_TEST_PERIOD,
        DOSTATS_TEST_COUNT,
        DOSTATS_TEST_SCAN_PROFILES_COUNT,
        DOSTATS_TEST_SCAN_PROFILES_CONCURRENCY
      )
    : await api.measureLatency(DOSTATS_TEST_SERVER, DOSTATS_TEST_TYPE, DOSTATS_TEST_PERIOD, DOSTATS_TEST_COUNT);
  if (!res || !res.ok) {
    throw new Error(res && res.error ? res.error : "Test de latence DOSTATS échoué.");
  }

  return {
    count: res.successful || res.attempts || DOSTATS_TEST_COUNT,
    avgMs: res.avgMs,
    minMs: res.minMs,
    maxMs: res.maxMs,
    profilesScanned: Array.isArray(res.scannedUserIds) ? res.scannedUserIds.length : (res.profileScrape?.writtenCount || 0),
    profileTest: res.profileTest || null,
  };
}

export function ServeursLeftPanel({ globalStats, groups }) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const handleClickTest = async () => {
    if (isTesting) return;

    setIsTesting(true);
    setTestError(null);
    setTestResult(null);
    setShowModal(true);

    try {
      const res = await runDostatsSpeedTest();
      setTestResult(res);
    } catch (e) {
      setTestError(e && e.message ? e.message : 'Erreur inconnue pendant le test.');
    } finally {
      setIsTesting(false);
    }
  };

  const miniStats = [
    {
      icon: Server,
      label: 'Serveurs actifs',
      value: `${globalStats.activeServers} / ${globalStats.totalServers}`,
      color: 'var(--accent-cyan)',
    },
    {
      icon: Activity,
      label: 'Groupes couverts',
      value: `${globalStats.activeGroups} / ${globalStats.totalGroups}`,
      color: 'var(--accent-violet)',
    },
    {
      icon: Zap,
      label: 'Scrapes en cours',
      value: globalStats.runningCount,
      color: 'var(--accent-emerald)',
    },
    {
      icon: AlertCircle,
      label: 'Erreurs actives',
      value: globalStats.errorCount,
      color: 'var(--accent-rose)',
    },
  ];

  return (
    <motion.aside
      className="serveurs-left-panel glass"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="left-panel-stats">
        {miniStats.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="mini-stat"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.3 }}
          >
            <stat.icon size={14} style={{ color: stat.color }} />
            <div className="mini-stat-content">
              <span
                className="mini-stat-value"
                style={{ color: stat.color }}
              >
                {stat.value}
              </span>
              <span className="mini-stat-label">{stat.label}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="left-panel-divider" />

      <div className="group-bars">
        <p className="left-panel-section-title">Répartition par groupe</p>
        {groups.map((group, i) => {
          const active = group.servers.filter((s) => s.status === 'running')
            .length;
          const total = group.servers.length;
          const pct = total > 0 ? (active / total) * 100 : 0;
          return (
            <div key={group.id} className="group-bar-row">
              <span className="group-bar-label">{group.label}</span>
              <div className="group-bar-track">
                <motion.div
                  className="group-bar-fill"
                  style={{ background: group.accent }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{
                    delay: 0.3 + i * 0.1,
                    duration: 0.8,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              </div>
              <span
                className="group-bar-count"
                style={{ color: group.accent }}
              >
                {active}/{total}
              </span>
            </div>
          );
        })}
      </div>

      <div className="left-panel-divider" />

      <div className="status-legend">
        <p className="left-panel-section-title">Légende</p>
        {[
          { status: 'running', label: 'En cours' },
          { status: 'idle', label: 'En attente' },
          { status: 'error', label: 'Erreur' },
          { status: 'disabled', label: 'Désactivé' },
        ].map(({ status, label }) => (
          <div key={status} className="legend-row">
            <span className={`status-dot ${status}`} />
            <span className="legend-label">{label}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="glass--interactive"
          onClick={handleClickTest}
          style={{
            width: '100%',
            borderRadius: 999,
            padding: '8px 12px',
            fontSize: 12,
            border: '1px solid var(--border-glass)',
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 28%, transparent), color-mix(in srgb, var(--accent-primary) 8%, transparent))',
            color: 'var(--accent-primary)',
            cursor: isTesting ? 'default' : 'pointer',
            opacity: isTesting ? 0.7 : 1,
          }}
          disabled={isTesting}
        >
          {isTesting ? 'Test DOSTATS en cours…' : 'TEST rapidité DOSTATS'}
        </button>
      </div>

      {showModal && (
        <div
          className="glass"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="glass"
            style={{
              maxWidth: 360,
              width: '90%',
              padding: 16,
              borderRadius: 14,
              boxShadow: '0 18px 40px rgba(15, 23, 42, 0.7)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                }}
              >
                Test rapidité DOSTATS
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <p
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 12,
              }}
            >
              Mesure du temps de réponse moyen de DOSTATS sur {DOSTATS_TEST_COUNT} chargements
              de page Hall of Fame ({DOSTATS_TEST_SERVER}, {DOSTATS_TEST_TYPE}, {DOSTATS_TEST_PERIOD}).
            </p>

            {isTesting && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--accent-primary)',
                  marginBottom: 8,
                }}
              >
                Test en cours… merci de patienter.
              </p>
            )}

            {testError && !isTesting && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--accent-rose)',
                  marginBottom: 8,
                }}
              >
                {testError}
              </div>
            )}

            {testResult && !isTesting && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 12,
                }}
              >
                <div>
                  <strong>Requêtes réussies</strong> : {testResult.count}
                </div>
                <div>
                  <strong>Moyenne</strong> : {testResult.avgMs.toFixed(0)} ms
                </div>
                <div>
                  <strong>Minimum</strong> : {testResult.minMs.toFixed(0)} ms
                </div>
                <div>
                  <strong>Maximum</strong> : {testResult.maxMs.toFixed(0)} ms
                </div>
                <div>
                  <strong>Profils scrapés</strong> : {testResult.profilesScanned || 0}
                </div>
                {testResult.profileTest && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(148,163,184,0.22)' }}>
                    <div>
                      <strong>Profil test</strong> : {testResult.profileTest.name || '—'} (
                      {testResult.profileTest.user_id || '—'})
                    </div>
                    <div>
                      <strong>Galaxy Gates non-null</strong> : {testResult.profileTest.nonNullGalaxyGatesCount || 0}
                    </div>
                    {testResult.profileTest.galaxyGatesParseDebug && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                        <strong>Parse debug</strong> : {JSON.stringify(testResult.profileTest.galaxyGatesParseDebug)}
                      </div>
                    )}
                    {testResult.profileTest.nonNullGalaxyGates && Object.keys(testResult.profileTest.nonNullGalaxyGates).length > 0 && (
                      <div>
                        <strong>Valeurs</strong> : {Object.entries(testResult.profileTest.nonNullGalaxyGates)
                          .slice(0, 6)
                          .map(([k, v]) => `${k}:${v}`)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 12,
                gap: 8,
              }}
            >
              {!isTesting && (
                <button
                  type="button"
                  onClick={handleClickTest}
                  className="glass--interactive"
                  style={{
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: 12,
                    border: '1px solid var(--border-glass)',
                    background:
                      'linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 35%, transparent), color-mix(in srgb, var(--accent-primary) 15%, transparent))',
                    color: 'var(--accent-primary)',
                    cursor: 'pointer',
                  }}
                >
                  Relancer le test
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="glass--interactive"
                style={{
                  borderRadius: 999,
                  padding: '6px 12px',
                  fontSize: 12,
                  border: '1px solid var(--border-glass)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.aside>
  );
}

