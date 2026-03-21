import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { VisuSelectors } from '../components/visualisation/VisuSelectors';
import { RankingTable } from '../components/visualisation/RankingTable';
import { PlayerProfileSlot } from '../components/visualisation/PlayerProfileSlot';
import {
  AVAILABLE_SERVERS,
  RANKING_PERIODS,
  RANKING_TYPES,
  getEmptyRankingMeta,
} from '../data/mockVisuData';
import '../visualisation.css';

const getApi = () => (typeof window !== 'undefined' && window.electronDostatsScraper) ? window.electronDostatsScraper : null;
const getElectronApi = () => (typeof window !== 'undefined' && window.electronAPI) ? window.electronAPI : null;

export function VisualisationPage() {
  const [selectedServer, setSelectedServer] = useState(
    AVAILABLE_SERVERS[0]?.code ?? '',
  );
  const [selectedType, setSelectedType] = useState('honor');
  const [selectedPeriod, setSelectedPeriod] = useState('current');

  useEffect(() => {
    const api = getElectronApi();
    if (!api || typeof api.loadSettings !== 'function') return;
    let cancelled = false;
    api.loadSettings()
      .then((settings) => {
        if (cancelled || !settings || typeof settings !== 'object') return;
        const visu = settings.visualisation || {};
        const server = typeof visu.selectedServer === 'string' && visu.selectedServer
          ? visu.selectedServer
          : null;
        if (server && AVAILABLE_SERVERS.some((s) => s.code === server)) {
          setSelectedServer(server);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const currentServerLabel =
    AVAILABLE_SERVERS.find((s) => s.code === selectedServer)?.label ?? selectedServer;

  const [ranking, setRanking] = useState(() => ({
    meta: getEmptyRankingMeta(selectedServer, currentServerLabel, selectedType, selectedPeriod),
    entries: [],
  }));

  const [profileSlots, setProfileSlots] = useState([
    { id: 'slot_1', userId: null, profile: null },
    { id: 'slot_2', userId: null, profile: null },
    { id: 'slot_3', userId: null, profile: null },
  ]);

  useEffect(() => {
    const api = getApi();
    if (!api || !api.getRanking) {
      setRanking({
        meta: getEmptyRankingMeta(selectedServer, currentServerLabel, selectedType, selectedPeriod),
        entries: [],
      });
      return undefined;
    }
    let cancelled = false;
    const serverCode = (selectedServer || '').toString().trim().toLowerCase();
    const typeKey = (selectedType || 'honor').toString().trim();
    const periodKey = (selectedPeriod || 'current').toString().trim();

    const load = async () => {
      try {
        const data = await api.getRanking(serverCode, typeKey, periodKey);
        if (cancelled) return;
        if (data && data.meta) {
          let entries = data.entries || [];
          if (entries.length && typeof api.getLatestProfile === 'function') {
            const enriched = await Promise.all(
              entries.map(async (e) => {
                if (!e.user_id || e.grade != null) return e;
                try {
                  const profile = await api.getLatestProfile(serverCode, e.user_id);
                  if (profile && profile.grade != null) {
                    return { ...e, grade: profile.grade };
                  }
                } catch (_) {}
                return e;
              }),
            );
            if (cancelled) return;
            entries = enriched;
          }
          setRanking({ meta: data.meta, entries });
        } else if (!cancelled) {
          setRanking({
            meta: getEmptyRankingMeta(selectedServer, currentServerLabel, selectedType, selectedPeriod),
            entries: [],
          });
        }
      } catch (_) {
        if (!cancelled) {
          setRanking({
            meta: getEmptyRankingMeta(selectedServer, currentServerLabel, selectedType, selectedPeriod),
            entries: [],
          });
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedServer, selectedType, selectedPeriod, currentServerLabel]);

  const availablePlayers = ranking.entries.map((e) => ({
    userId: e.user_id,
    name: e.name,
    rank: e.rank,
  }));

  const loadProfileForSlot = async (slotId, userId) => {
    if (!userId) {
      setProfileSlots((prev) =>
        prev.map((s) => (s.id === slotId ? { ...s, userId: null, profile: null } : s)),
      );
      return;
    }
    const rankingEntry = ranking.entries.find((e) => e.user_id === userId) || null;
    const base = rankingEntry
      ? {
          rank: rankingEntry.rank,
          name: rankingEntry.name,
          user_id: rankingEntry.user_id,
          company: rankingEntry.company,
          server_code: rankingEntry.server_code,
          server_label: rankingEntry.server_label,
          points: rankingEntry.points,
        }
      : { user_id: userId, name: null, company: null };

    const api = getApi();
    let profileEntry = null;
    if (api && typeof api.getLatestProfile === 'function') {
      try {
        profileEntry = await api.getLatestProfile(
          (selectedServer || '').toString().trim().toLowerCase(),
          userId,
        );
      } catch (_) {}
    }

    const merged = { ...base };
    if (profileEntry && typeof profileEntry === 'object') {
      const keys = [
        'name', 'company', 'server_code', 'server_label', 'level', 'grade',
        'estimated_rp', 'total_hours', 'last_seen', 'last_update', 'registered',
        'clan_tag', 'clan',
        // HoF « All time » (aligné player_profiles / JSON plat après scrape)
        'top_user', 'experience', 'honor', 'npc_kills', 'ship_kills',
      ];
      keys.forEach((key) => {
        const v = profileEntry[key];
        if (v !== undefined && v !== null) {
          merged[key] = v;
        }
      });
      if (profileEntry.stats && typeof profileEntry.stats === 'object') {
        merged.stats = profileEntry.stats;
      }
      if (profileEntry.galaxy_gates && typeof profileEntry.galaxy_gates === 'object') {
        merged.galaxy_gates = profileEntry.galaxy_gates;
      }
    } else {
      merged.fromRanking = true;
    }

    setProfileSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, userId, profile: { entries: [merged] } } : s,
      ),
    );
  };

  const updateSlot = (slotId, userId) => {
    // Met à jour immédiatement l'UID, puis charge le profil complet async
    setProfileSlots((prev) =>
      prev.map((s) =>
        s.id === slotId ? { ...s, userId, profile: null } : s,
      ),
    );
    loadProfileForSlot(slotId, userId);
  };

  const persistSelection = (nextServer, nextType, nextPeriod) => {
    const api = getElectronApi();
    if (!api || typeof api.loadSettings !== 'function' || typeof api.saveSettings !== 'function') return;
    Promise.resolve()
      .then(() => api.loadSettings())
      .then((settings) => {
        const base = settings && typeof settings === 'object' ? settings : {};
        const visu = base.visualisation && typeof base.visualisation === 'object'
          ? base.visualisation
          : {};
        const payload = {
          ...base,
          visualisation: {
            ...visu,
            selectedServer: nextServer,
          },
        };
        return api.saveSettings(payload);
      })
      .catch(() => {});
  };

  const handleClearAllData = async () => {
    const api = window.electronAPI;
    if (typeof api?.clearVisuData !== 'function') return;
    try {
      const result = await api.clearVisuData();
      if (result?.ok) {
        setRanking({
          meta: getEmptyRankingMeta(selectedServer, currentServerLabel, selectedType, selectedPeriod),
          entries: [],
        });
        setProfileSlots([
          { id: 'slot_1', userId: null, profile: null },
          { id: 'slot_2', userId: null, profile: null },
          { id: 'slot_3', userId: null, profile: null },
        ]);
        const getRankingApi = getApi();
        if (getRankingApi?.getRanking) {
          const serverCode = (selectedServer || '').toString().trim().toLowerCase();
          const typeKey = (selectedType || 'honor').toString().trim();
          const periodKey = (selectedPeriod || 'current').toString().trim();
          const data = await getRankingApi.getRanking(serverCode, typeKey, periodKey);
          if (data?.meta) {
            setRanking({ meta: data.meta, entries: data.entries || [] });
          }
        }
      }
    } catch (_) {}
  };

  return (
    <motion.div
      className="visu-page"
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <VisuSelectors
        servers={AVAILABLE_SERVERS}
        types={RANKING_TYPES}
        periods={RANKING_PERIODS}
        selectedServer={selectedServer}
        selectedType={selectedType}
        selectedPeriod={selectedPeriod}
        onServerChange={(code) => {
          setSelectedServer(code);
          persistSelection(code, selectedType, selectedPeriod);
        }}
        onTypeChange={(type) => {
          setSelectedType(type);
          // ne pas persister le type
        }}
        onPeriodChange={(period) => {
          setSelectedPeriod(period);
          // ne pas persister la période
        }}
        onClearAllData={handleClearAllData}
        meta={ranking.meta}
      />

      <div className="visu-body">
        <div className="visu-ranking-col">
          <RankingTable
            ranking={ranking}
            onSelectPlayer={(userId) => {
              const emptySlot = profileSlots.find((s) => !s.userId);
              if (emptySlot) updateSlot(emptySlot.id, userId);
            }}
          />
        </div>

        <div className="visu-profiles-col">
          <p className="visu-section-title">
            Profils joueurs
            <span className="visu-section-hint">
              Cliquez sur un joueur dans le classement pour le charger
            </span>
          </p>
          <div className="visu-profiles-grid">
            {profileSlots.map((slot, i) => (
              <motion.div
                key={slot.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.08,
                  duration: 0.35,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <PlayerProfileSlot
                  slot={slot}
                  profile={slot.profile}
                  availablePlayers={availablePlayers}
                  onSelect={(userId) => updateSlot(slot.id, userId)}
                  onClear={() => updateSlot(slot.id, null)}
                  slotIndex={i}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

