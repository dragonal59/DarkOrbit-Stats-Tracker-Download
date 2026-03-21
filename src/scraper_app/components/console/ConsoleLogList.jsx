import React, { useEffect, useRef } from 'react';
import { ConsoleLogRow } from './ConsoleLogRow';

export function ConsoleLogList({
  visibleLogs,
  autoScroll,
  setAutoScroll,
  copyLog,
  isFrozen,
}) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visibleLogs.length, autoScroll]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(isAtBottom);
  };

  return (
    <div
      ref={containerRef}
      className="console-log-list"
      onScroll={handleScroll}
    >
      {isFrozen && (
        <div className="console-frozen-banner">
          Console gelée — tapez /resume pour reprendre
        </div>
      )}
      {visibleLogs.length === 0 && !isFrozen && (
        <div className="console-empty">
          <span>Aucun log correspondant aux filtres actifs.</span>
        </div>
      )}
      {visibleLogs.map((log, index) => (
        <ConsoleLogRow
          key={log.id}
          log={log}
          isNew={index === visibleLogs.length - 1}
          onCopy={copyLog}
        />
      ))}
      <div ref={bottomRef} style={{ height: 1 }} />
    </div>
  );
}

