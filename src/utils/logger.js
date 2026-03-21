// ==========================================
// MODULE: Logger centralisé
// Niveaux : error, warn, info, debug
// Niveau de filtre configurable : par défaut 'warn' (console = error + warn uniquement).
// Buffer circulaire des 100 derniers error/warn pour le panneau SUPERADMIN.
// ==========================================

(function (global) {
  'use strict';

  var LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
  var LOG_LEVEL_KEY = 'loggerLevel';
  var BUFFER_MAX = 100;
  var _buffer = [];
  var _listeners = [];
  var _level = null;

  function getStoredLevel() {
    try {
      if (typeof global.localStorage !== 'undefined') {
        var s = global.localStorage.getItem(LOG_LEVEL_KEY);
        if (s && LOG_LEVELS[s] !== undefined) return s;
      }
    } catch (e) {}
    return 'warn';
  }

  function getLevel() {
    if (_level !== null) return _level;
    _level = getStoredLevel();
    return _level;
  }

  function setLevel(level) {
    if (!level || LOG_LEVELS[level] === undefined) return;
    _level = level;
    try {
      if (typeof global.localStorage !== 'undefined') {
        global.localStorage.setItem(LOG_LEVEL_KEY, level);
      }
    } catch (e) {}
  }

  function formatArgs(args) {
    if (!args || args.length === 0) return '';
    try {
      return Array.prototype.slice.call(args).map(function (a) {
        if (a === null) return 'null';
        if (a === undefined) return 'undefined';
        if (typeof a === 'object' && a !== null) {
          try { return JSON.stringify(a); } catch (e) { return String(a); }
        }
        return String(a);
      }).join(' ');
    } catch (e) {
      return String(args[0]);
    }
  }

  function pushToBuffer(level, message) {
    var entry = {
      ts: new Date().toISOString(),
      level: level,
      message: message
    };
    _buffer.push(entry);
    if (_buffer.length > BUFFER_MAX) _buffer.shift();
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](entry); } catch (err) {}
    }
  }

  function log(level, args) {
    var msg = formatArgs(args);
    if (level === 'error' || level === 'warn') {
      pushToBuffer(level, msg);
    }
    var minLevel = LOG_LEVELS[getLevel()];
    var msgLevel = LOG_LEVELS[level];
    if (msgLevel === undefined || msgLevel > minLevel) return;
    var c = global.console;
    if (!c) return;
    if (level === 'error' && c.error) c.error.apply(c, args);
    else if (level === 'warn' && c.warn) c.warn.apply(c, args);
    else if (level === 'info' && c.info) c.info.apply(c, args);
    else if (level === 'debug' && c.log) c.log.apply(c, args);
  }

  var Logger = {
    error: function () { log('error', arguments); },
    warn: function () { log('warn', arguments); },
    info: function () { log('info', arguments); },
    debug: function () { log('debug', arguments); },
    setLevel: setLevel,
    getLevel: getLevel,
    getRecentErrorWarnLogs: function () {
      return _buffer.slice();
    },
    subscribe: function (cb) {
      if (typeof cb === 'function') _listeners.push(cb);
      return function () {
        var i = _listeners.indexOf(cb);
        if (i !== -1) _listeners.splice(i, 1);
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Logger;
  }
  if (typeof global !== 'undefined') {
    global.Logger = Logger;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
