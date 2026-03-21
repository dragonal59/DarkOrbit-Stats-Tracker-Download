import React from 'react';
import { motion } from 'framer-motion';
import { ConsoleToolbar } from '../components/console/ConsoleToolbar';
import { ConsoleLogList } from '../components/console/ConsoleLogList';
import { ConsoleInput } from '../components/console/ConsoleInput';
import { useConsoleLogs } from '../hooks/useConsoleLogs';
import { useAppearance } from '../context/AppearanceContext';
import '../console.css';

export function ConsoleLogPage({ scraperLogs = [], onClearScraperLogs }) {
  const appearance = useAppearance();
  const state = useConsoleLogs(scraperLogs, {
    onClearScraperLogs,
    logMaxLines: appearance.logMaxLines,
  });

  return (
    <motion.div
      className="console-page"
      initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <ConsoleToolbar {...state} />
      <ConsoleLogList {...state} visibleLogs={state.displayLogs} />
      <ConsoleInput {...state} />
    </motion.div>
  );
}

