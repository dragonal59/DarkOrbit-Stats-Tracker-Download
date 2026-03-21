import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlanningToolbar } from '../components/planning/PlanningToolbar';
import { PlanningTimeline } from '../components/planning/PlanningTimeline';
import { PlanningGroupCard } from '../components/planning/PlanningGroupCard';
import { BannedList } from '../components/planning/BannedList';
import { PlanningEditModal } from '../components/planning/PlanningEditModal';
import { BanModal } from '../components/planning/BanModal';
import { usePlanning } from '../hooks/usePlanning';
import '../planning.css';

export function PlanningPage() {
  const planning = usePlanning();
  const [editModal, setEditModal] = useState(null); // null | { schedule } | 'new'
  const [banModal, setBanModal] = useState(null); // null | { server }
  const [showBanned, setShowBanned] = useState(false);

  return (
    <motion.div
      className="planning-page"
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Toolbar */}
      <PlanningToolbar
        {...planning}
        onNew={() => setEditModal('new')}
        onToggleBanned={() => setShowBanned((v) => !v)}
        showBanned={showBanned}
        now={planning.now}
      />

      <div className="planning-body">
        {/* Zone principale */}
        <div className="planning-main">
          {/* Vue Timeline 24h */}
          <AnimatePresence mode="wait">
            {planning.view === 'timeline' && (
              <motion.div
                key="timeline"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.22 }}
              >
                <PlanningTimeline
                  schedules={planning.schedules}
                  now={planning.now}
                />
              </motion.div>
            )}

            {/* Vue Liste des plannings */}
            {planning.view === 'list' && (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.22 }}
                className="planning-list"
              >
                {planning.schedules.map((sch, i) => (
                  <motion.div
                    key={sch.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3 }}
                  >
                    <PlanningGroupCard
                      schedule={sch}
                      onEdit={() => setEditModal(sch)}
                      onDelete={() => planning.deleteSchedule(sch.id)}
                      onToggle={() => planning.toggleSchedule(sch.id)}
                      onBanServer={(server) => setBanModal(server)}
                      isServerBanned={planning.isServerBanned}
                      now={planning.now}
                    />
                  </motion.div>
                ))}
                {planning.schedules.length === 0 && (
                  <div className="planning-empty">
                    <span>Aucun planning configuré.</span>
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={() => setEditModal('new')}
                    >
                      + Créer un planning
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Panneau serveurs bannis */}
        <AnimatePresence>
          {showBanned && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden', flexShrink: 0 }}
            >
              <BannedList
                banned={planning.banned}
                onUnban={planning.unbanServer}
                now={planning.now}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modales */}
      <AnimatePresence>
        {editModal && (
          <PlanningEditModal
            schedule={editModal === 'new' ? null : editModal}
            onSave={(data) => {
              if (editModal === 'new') {
                planning.addSchedule(data);
              } else {
                planning.updateSchedule(editModal.id, data);
              }
              setEditModal(null);
            }}
            onClose={() => setEditModal(null)}
          />
        )}
        {banModal && (
          <BanModal
            server={banModal}
            onBan={(banType, expiresAt, reason) => {
              planning.banServer(banModal, banType, expiresAt, reason);
              setBanModal(null);
            }}
            onClose={() => setBanModal(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

