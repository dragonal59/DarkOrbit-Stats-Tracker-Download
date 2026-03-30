import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, RefreshCw, Clock, AlertCircle, Info } from 'lucide-react';

function normalizeForMatch(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.,;:'"]/g, '')
    .replace(/\s+/g, ' ');
}

const SCRAPED_ID_TO_DEF_ID = {
  GG_SpecialWeekend: 'galaxy_gates_special_rewards_day',
  stellar_pathfinder: 'stellar_pathfinder_bundles',
  blitz400_tspenderOli: 'helix_blitz_sale',
};

function matchEventToDefinition(scrapedName, definitions, opts = {}) {
  const { scrapedId = '', scrapedDescription = '' } = opts;
  const textToMatch = [scrapedName, scrapedDescription].filter(Boolean).join(' ');
  const norm = normalizeForMatch(textToMatch);
  if (!Array.isArray(definitions) || definitions.length === 0) return null;
  const rawId = String(scrapedId).replace(/-/g, '_');
  const normId = rawId ? normalizeForMatch(rawId) : '';
  const hasText = norm.length > 0;
  const hasId = normId.length > 0;
  if (!hasText && !hasId) return null;

  if (hasId) {
    const normIdNoUnd = normId.replace(/_/g, '');
    for (const def of definitions) {
      if (!def.id) continue;
      const defIdNorm = normalizeForMatch(String(def.id).replace(/-/g, '_'));
      if (SCRAPED_ID_TO_DEF_ID[scrapedId] === def.id) return def;
      if (defIdNorm === normId || defIdNorm.indexOf(normId) !== -1 || normId.indexOf(defIdNorm) !== -1) return def;
      const defIdNoUnd = defIdNorm.replace(/_/g, '');
      if (normIdNoUnd.length >= 4 && defIdNoUnd.length >= 4 && (normIdNoUnd.indexOf(defIdNoUnd) !== -1 || defIdNoUnd.indexOf(normIdNoUnd) !== -1)) return def;
    }
  }

  for (const def of definitions) {
    if (def.exclude_keywords && Array.isArray(def.exclude_keywords)) {
      const excluded = def.exclude_keywords.some((ex) => {
        const exNorm = normalizeForMatch(ex);
        return exNorm.length >= 3 && norm.indexOf(exNorm) !== -1;
      });
      if (excluded) continue;
    }

    if (!hasText) continue;

    const names = def.names || {};
    for (const lang of ['fr', 'en', 'de', 'es', 'ru', 'tr']) {
      const v = names[lang];
      if (!v) continue;
      const vNorm = normalizeForMatch(v);
      if (vNorm && (norm === vNorm || norm.indexOf(vNorm) !== -1 || vNorm.indexOf(norm) !== -1)) return def;
    }
    const keywords = def.keywords || [];
    for (const kw of keywords) {
      const kwNorm = normalizeForMatch(kw);
      if (kwNorm.length >= 3 && norm.indexOf(kwNorm) !== -1) return def;
    }
  }
  return null;
}

function parseTimerToEndMs(timerStr, scrapedAtIso) {
  if (!timerStr || typeof timerStr !== 'string') return null;
  const m = timerStr.trim().match(/(\d+):(\d+):(\d+)/);
  if (!m) return null;
  const h = parseInt(m[1], 10) || 0;
  const min = parseInt(m[2], 10) || 0;
  const s = parseInt(m[3], 10) || 0;
  const scrapedMs = scrapedAtIso ? new Date(scrapedAtIso).getTime() : Date.now();
  return scrapedMs + (h * 3600 + min * 60 + s) * 1000;
}

function formatRemaining(remainingMs) {
  if (remainingMs <= 0) return 'Terminé';
  const s = Math.floor(remainingMs / 1000) % 60;
  const m = Math.floor(remainingMs / 60000) % 60;
  const totalHours = Math.floor(remainingMs / 3600000);
  const h = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const timePart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (days > 0) return `${days}j ${timePart}`;
  return timePart;
}

function EventCard({ event, definition, baseUrlForImages, endMs, now }) {
  const baseForImages = (baseUrlForImages || '').endsWith('/')
    ? baseUrlForImages
    : `${baseUrlForImages || ''}/`;
  const localImage = definition?.image ? (definition.image || '').replace(/^[./]+/, '') : '';
  const imageSrc = localImage
    ? `${baseForImages}${localImage}`
    : event.imageUrl || null;
  const remainingMs = endMs != null ? endMs - now : null;
  const displayTimer = remainingMs != null ? formatRemaining(remainingMs) : (event.timer && event.timer.trim()) ? event.timer : '\u221E';

  return (
    <div
      className="glass"
      style={{
        display: 'flex',
        gap: 14,
        padding: 14,
        borderRadius: 12,
        border: '1px solid var(--border-glass)',
        background: 'rgba(255,255,255,0.04)',
      }}
    >
      {imageSrc && (
        <div
          style={{
            width: 100,
            minWidth: 100,
            height: 70,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'rgba(0,0,0,0.3)',
            flexShrink: 0,
          }}
        >
          <img
            src={imageSrc}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {event.name && (
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
            {event.name}
          </div>
        )}
        {event.description && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.35 }}>
            {event.description}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: remainingMs != null && remainingMs <= 0 ? 'var(--text-muted)' : 'var(--accent-amber)',
          }}
        >
          <Clock size={14} />
          {displayTimer}
        </div>
      </div>
    </div>
  );
}

/**
 * Événements DO — Connexion (identifiants en dur côté main), scraping page d'accueil DarkOrbit,
 * affichage avec images matchées (multillingues_events) et timer en temps réel.
 * État (loading, events, error) et définitions remontés dans ScraperUI pour persister au changement d'onglet.
 */
export function DoEventsPage({
  doEventsState = { loading: false, events: [], error: null },
  setDoEventsState = () => {},
  definitions = [],
  baseUrlForImages = '',
}) {
  const { loading, events, error } = doEventsState;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (events.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [events.length]);

  const handleScrape = async () => {
    const api = typeof window !== 'undefined' && window.scraperBridge;
    if (!api?.scrapeDoEvents) {
      setDoEventsState((s) => ({ ...s, error: 'API scraping non disponible' }));
      return;
    }
    setDoEventsState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await api.scrapeDoEvents();
      if (result?.ok && Array.isArray(result.events)) {
        setDoEventsState({ loading: false, events: result.events, error: null });
        setNow(Date.now());
        if (api.saveDoEventsCache) api.saveDoEventsCache(result.events);
      } else {
        setDoEventsState((s) => ({ ...s, loading: false, error: result?.error || 'Échec du scraping' }));
      }
    } catch (e) {
      setDoEventsState((s) => ({ ...s, loading: false, error: e?.message || 'Erreur' }));
    }
  };

  const eventsWithEnd = useMemo(() => {
    return events.map((ev) => {
      const endMs =
        ev.endTimestamp != null
          ? ev.endTimestamp * 1000
          : parseTimerToEndMs(ev.timer, ev.scrapedAt);
      const definition = matchEventToDefinition(ev.name, definitions, {
        scrapedId: ev.id || '',
        scrapedDescription: ev.description || '',
      });
      return { ...ev, endMs, definition };
    });
  }, [events, definitions]);

  const unmatchedEvents = useMemo(() => eventsWithEnd.filter((ev) => !ev.definition), [eventsWithEnd]);

  return (
    <motion.div
      className="do-events-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1
          style={{
            fontFamily: 'Syne, system-ui',
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Calendar size={24} color="var(--accent-primary)" />
          Événements DO
        </h1>
        <button
          type="button"
          className="glass--interactive"
          onClick={handleScrape}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--border-glass)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text-primary)',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} style={{ flexShrink: 0 }} />
          {loading ? 'Connexion & scraping…' : 'Lancer le scraping'}
        </button>
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 14,
          border: '1px solid var(--border-glass)',
          flex: 1,
          minHeight: 200,
          overflow: 'auto',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Connexion à la page d&apos;accueil DarkOrbit (fr1), récupération des événements en cours.
          Images matchées avec <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>src/multillingues_events</code>, timer en temps réel.
        </p>
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(252, 129, 129, 0.12)',
              border: '1px solid rgba(252, 129, 129, 0.35)',
              color: 'var(--accent-rose)',
              marginBottom: 12,
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        {eventsWithEnd.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              {eventsWithEnd.length} événement(s) — timer en temps réel
            </div>
            {eventsWithEnd.map((ev, i) => (
              <EventCard
                key={ev.id || i}
                event={ev}
                definition={ev.definition}
                baseUrlForImages={baseUrlForImages}
                endMs={ev.endMs}
                now={now}
              />
            ))}
            {unmatchedEvents.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 8,
                  background: 'rgba(255,193,7,0.08)',
                  border: '1px solid rgba(255,193,7,0.25)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Événements sans correspondance JSON
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {unmatchedEvents.map((ev, i) => (
                    <li key={ev.id || i}>
                      {ev.name ? `"${ev.name}"` : '(sans titre)'}
                      {ev.id ? ` (id: ${ev.id})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <details style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Info size={14} /> Infos
        </summary>
        <ul style={{ marginTop: 8, paddingLeft: 18 }}>
          <li>Serveur : fr1 DarkOrbit</li>
          <li>Données : événements en cours, timers en temps réel</li>
          <li>Images : correspondance locale (<code>multillingues_events</code>)</li>
        </ul>
      </details>
    </motion.div>
  );
}
