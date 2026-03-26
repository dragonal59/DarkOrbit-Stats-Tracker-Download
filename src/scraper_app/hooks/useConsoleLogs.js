import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { makeLog, AVAILABLE_COMMANDS, LOG_TYPES, CONSOLE_COMMANDS_HELP } from '../data/mockConsoleLogs';

const DEFAULT_MAX_LOGS = 2000;

function formatLogLine(l) {
  const sym =
    l.symbol === 'check' ? ' ✔' : l.symbol === 'cross' ? ' ✗' : '';
  return (l.message || '') + sym;
}

export function useConsoleLogs(scraperLogs = [], options = {}) {
  const { onClearScraperLogs, logMaxLines = DEFAULT_MAX_LOGS } = options;
  const maxLogs = Math.max(100, Math.min(10000, Number(logMaxLines) || DEFAULT_MAX_LOGS));
  const [allLogs, setAllLogs] = useState([]);
  const [showTechnical, setShowTechnical] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    info: true,
    success: true,
    warning: true,
    error: true,
    debug: true,
    command: true,
    result: true,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [cmdHistory, setCmdHistory] = useState([]);
  const [cmdHistoryIndex, setCmdHistoryIndex] = useState(-1);
  const [isFrozen, setFrozen] = useState(false);
  const [frozenSnapshot, setFrozenSnapshot] = useState([]);
  const visibleLogsRef = useRef([]);
  const allLogsRef = useRef([]);

  const mergedLogs = useMemo(
    () =>
      [...(scraperLogs || []), ...allLogs].sort(
        (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
      ),
    [scraperLogs, allLogs]
  );

  const visibleLogs = useMemo(
    () =>
      mergedLogs.filter((log) => {
        if (LOG_TYPES[log.type]?.technical && !showTechnical) return false;
        if (!activeFilters[log.type]) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const msg = (log.message || '').toLowerCase();
          const server = (log.server || '').toLowerCase();
          if (!msg.includes(q) && !server.includes(q)) return false;
        }
        return true;
      }),
    [mergedLogs, showTechnical, activeFilters, searchQuery]
  );

  useEffect(() => {
    visibleLogsRef.current = visibleLogs;
    allLogsRef.current = mergedLogs;
  }, [visibleLogs, mergedLogs]);

  const executeCommand = useCallback((input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const cmdLog = makeLog('command', trimmed);
    const key = trimmed.toLowerCase().replace(/^\//, '');

    if (key === 'clear') {
      setAllLogs([]);
      setFrozenSnapshot([]);
      setFrozen(false);
      if (typeof onClearScraperLogs === 'function') {
        onClearScraperLogs();
      }
      setCmdHistory((prev) => [trimmed, ...prev].slice(0, 50));
      setCmdHistoryIndex(-1);
      return;
    }

    if (key === 'freeze') {
      setFrozenSnapshot([...visibleLogsRef.current]);
      setFrozen(true);
      setAllLogs((prev) => [...prev, cmdLog, makeLog('result', 'Console gelée. Tapez /resume pour reprendre.')].slice(-maxLogs));
      setCmdHistory((prev) => [trimmed, ...prev].slice(0, 50));
      setCmdHistoryIndex(-1);
      return;
    }

    if (key === 'resume') {
      setFrozen(false);
      setAllLogs((prev) => [...prev, cmdLog, makeLog('result', 'Console reprise.')].slice(-maxLogs));
      setCmdHistory((prev) => [trimmed, ...prev].slice(0, 50));
      setCmdHistoryIndex(-1);
      return;
    }

    if (key === 'copy') {
      const logsToCopy = allLogsRef.current;
      const text = logsToCopy.map(formatLogLine).join('\n');
      if (typeof window.navigator.clipboard?.writeText === 'function') {
        window.navigator.clipboard.writeText(text);
      }
      setAllLogs((prev) => [...prev, cmdLog, makeLog('result', `Copié ${logsToCopy.length} ligne(s) (intégral).`)].slice(-maxLogs));
      setCmdHistory((prev) => [trimmed, ...prev].slice(0, 50));
      setCmdHistoryIndex(-1);
      return;
    }

    if (key === 'stop') {
      if (typeof window.electronScraper?.stop === 'function') {
        window.electronScraper.stop();
      }
      setAllLogs((prev) => [...prev, cmdLog, makeLog('result', 'Arrêt de tous les scrapings demandé. Les données en cours sont enregistrées.')].slice(-maxLogs));
      setCmdHistory((prev) => [trimmed, ...prev].slice(0, 50));
      setCmdHistoryIndex(-1);
      return;
    }

    if (key === 'help') {
      setAllLogs((prev) => [
        ...prev,
        cmdLog,
        ...CONSOLE_COMMANDS_HELP.map((line) => makeLog('result', line)),
      ].slice(-maxLogs));
      setCmdHistory((prev) => [trimmed, ...prev].slice(0, 50));
      setCmdHistoryIndex(-1);
      return;
    }

    const handler = AVAILABLE_COMMANDS[key];
    let resultLogs = [];
    if (handler) {
      const lines = handler();
      resultLogs = lines.map((line) => makeLog('result', line));
    } else {
      resultLogs = [
        makeLog(
          'error',
          `Commande inconnue : "${trimmed}". Tapez /help pour la liste.`,
        ),
      ];
    }

    setAllLogs((prev) => [...prev, cmdLog, ...resultLogs].slice(-maxLogs));
    setCmdHistory((prev) => [trimmed, ...prev].slice(0, 50));
    setCmdHistoryIndex(-1);
  }, [onClearScraperLogs]);

  const clearAll = useCallback(() => {
    setAllLogs([]);
    setFrozenSnapshot([]);
    setFrozen(false);
    if (typeof onClearScraperLogs === 'function') {
      onClearScraperLogs();
    }
  }, [onClearScraperLogs]);

  const navigateCmdHistory = useCallback(
    (direction) => {
      setCmdHistoryIndex((prev) => {
        if (direction === 'up')
          return Math.min(prev + 1, cmdHistory.length - 1);
        if (direction === 'down') return Math.max(prev - 1, -1);
        return prev;
      });
    },
    [cmdHistory.length],
  );

  const exportLogs = useCallback(() => {
    const csv = [
      'timestamp,type,server,message',
      ...visibleLogs.map((l) =>
        `"${l.timestamp}","${l.type}","${l.server ?? ''}","${(l.message || '').replace(/"/g, '""')}"`,
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console_logs_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visibleLogs]);

  const copyLog = useCallback((log) => {
    const sym =
      log.symbol === 'check' ? ' ✔' : log.symbol === 'cross' ? ' ✗' : '';
    const text = `[${log.timestamp}] [${log.type.toUpperCase()}]${
      log.server ? ` [${log.server}]` : ''
    } ${log.message}${sym}`;
    window.navigator.clipboard?.writeText(text);
  }, []);

  const copyAllLogs = useCallback(() => {
    const text = visibleLogs
      .map((l) => {
        const sym =
          l.symbol === 'check' ? ' ✔' : l.symbol === 'cross' ? ' ✗' : '';
        return `[${l.timestamp}] [${l.type.toUpperCase()}]${
          l.server ? ` [${l.server}]` : ''
        } ${l.message}${sym}`;
      })
      .join('\n');
    window.navigator.clipboard?.writeText(text);
  }, [visibleLogs]);

  const toggleFilter = useCallback((type) => {
    setActiveFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const displayLogs = isFrozen ? frozenSnapshot : visibleLogs;

  return {
    visibleLogs,
    displayLogs,
    isFrozen,
    allLogs,
    showTechnical,
    setShowTechnical,
    activeFilters,
    toggleFilter,
    searchQuery,
    setSearchQuery,
    autoScroll,
    setAutoScroll,
    executeCommand,
    clearAll,
    navigateCmdHistory,
    cmdHistory,
    cmdHistoryIndex,
    exportLogs,
    copyLog,
    copyAllLogs,
  };
}

