import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

const AUTOCOMPLETE_LIST = [
  '/help',
  '/clear',
  '/copy',
  '/freeze',
  '/resume',
  '/stop',
  'help',
  'status',
  'clear',
  'scraper list',
  'proxy list',
];

export function ConsoleInput({
  executeCommand,
  navigateCmdHistory,
  cmdHistory,
  cmdHistoryIndex,
}) {
  const [value, setValue] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!value.trim()) {
      setSuggestion('');
      return;
    }
    const match = AUTOCOMPLETE_LIST.find(
      (cmd) =>
        cmd.startsWith(value.toLowerCase()) &&
        cmd !== value.toLowerCase(),
    );
    setSuggestion(match ?? '');
  }, [value]);

  useEffect(() => {
    if (cmdHistoryIndex === -1) return;
    setValue(cmdHistory[cmdHistoryIndex] ?? '');
  }, [cmdHistoryIndex, cmdHistory]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        executeCommand(value);
        setValue('');
        setSuggestion('');
      }
      if (e.key === 'Tab' && suggestion) {
        e.preventDefault();
        setValue(suggestion);
        setSuggestion('');
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateCmdHistory('up');
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateCmdHistory('down');
      }
      if (e.key === 'Escape') {
        setValue('');
        setSuggestion('');
      }
    },
    [value, suggestion, executeCommand, navigateCmdHistory],
  );

  return (
    <div className="console-input-zone">
      <ChevronRight size={14} className="console-prompt-icon" />
      <div className="console-input-wrapper">
        {suggestion && (
          <span className="console-suggestion" aria-hidden="true">
            <span style={{ opacity: 0 }}>{value}</span>
            {suggestion.slice(value.length)}
            <span className="suggestion-hint">Tab</span>
          </span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Saisir une commande... (/help pour la liste)"
          className="console-input"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

