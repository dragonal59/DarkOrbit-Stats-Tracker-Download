import { motion, AnimatePresence } from 'framer-motion';
import { SettingsSidebar } from '../components/parametres/SettingsSidebar';
import { SaveBar } from '../components/parametres/SaveBar';
import { SectionProxies } from '../components/parametres/sections/SectionProxies';
import { SectionScraper } from '../components/parametres/sections/SectionScraper';
import { SectionDatabase } from '../components/parametres/sections/SectionDatabase';
import { SectionNotifications } from '../components/parametres/sections/SectionNotifications';
import { SectionAppearance } from '../components/parametres/sections/SectionAppearance';
import { useSettings } from '../hooks/useSettings';
import '../parametres.css';

const SECTIONS = {
  proxies: SectionProxies,
  scraper: SectionScraper,
  database: SectionDatabase,
  notifications: SectionNotifications,
  appearance: SectionAppearance,
};

export function ParametresPage() {
  const settings = useSettings();
  const ActiveSection = SECTIONS[settings.activeSection];

  return (
    <motion.div
      className="parametres-page"
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="parametres-layout">
        <SettingsSidebar
          active={settings.activeSection}
          onChange={settings.setActiveSection}
          isDirty={settings.isDirty}
          settings={settings.settings}
        />

        <div className="parametres-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={settings.activeSection}
              className="section-wrapper"
              initial={{
                opacity: 0,
                x: 16,
                filter: 'blur(4px)',
              }}
              animate={{
                opacity: 1,
                x: 0,
                filter: 'blur(0px)',
              }}
              exit={{
                opacity: 0,
                x: -16,
                filter: 'blur(4px)',
              }}
              transition={{
                duration: 0.22,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <ActiveSection {...settings} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {settings.isDirty && (
          <SaveBar
            saving={settings.saving}
            error={settings.saveError}
            onSave={settings.save}
            onDiscard={settings.discard}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

