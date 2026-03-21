---
name: darkorbit-tracker
description: Guides the agent when working on the DarkOrbit Stats Tracker Pro Electron/Supabase project: architecture boundaries (main vs renderer), permissions and badges, Supabase RPC usage, unified storage and sync, events rules, i18n, and scraping constraints. Use for any code changes in this project or when working with DarkOrbit Stats Tracker Pro.
---

# DarkOrbit Stats Tracker Pro

## When to Use This Skill

Use this skill whenever:

- You modify or add code in this repository (Electron main, preload, or renderer).
- You touch anything related to permissions, badges, tabs, or feature visibility.
- You read or write data via Supabase (tables, RPCs, events, sessions, settings, user preferences).
- You change event handling (timers, JSON files, scraping, deletion).
- You introduce new user-facing strings or change existing UI text.
- You work on scraping, DarkOrbit accounts, or license handling.

Always apply these rules before writing or editing code in this project.

---

## Pre-flight Checklist (Before Writing Code)

Before implementing any change in this project, explicitly answer for yourself:

1. **Which process is affected?**
   - Main process: code in `electron/`, `main.js`.
   - Renderer process: code in `src/` (HTML/JS/CSS, with backend logic in `src/backend/`).
   - Never enable `nodeIntegration` in the renderer.

2. **Is a permission check required?**
   - Tabs: ensure `currentCanAccessTab(tab)` is used before showing or enabling a tab.
   - Features/buttons/sections: ensure `currentHasFeature(feature)` gates any privileged feature.
   - Do not show tabs, buttons, or sections that the current badge cannot access.

3. **Is there a Supabase interaction?**
   - Prefer secure RPCs over direct table access when available (sessions, rankings, licenses, bug reports, etc.).
   - Respect session limits enforced by RPCs (e.g. FREE vs PRO); do not bypass them client-side.
   - For events and shared data, never perform mass deletes or unconstrained updates.

4. **Is any string visible to the user?**
   - If yes, add or update it in `translations.js` for all 6 languages:
     - `fr` (default), `de`, `ru`, `es`, `en`, `tr`.
   - Use `data-i18n` / `data-i18n-*` attributes in HTML and `TRANSLATIONS.t(...)` or `window.i18nT(...)` in JS.

5. **Is it related to an event (timer, sidebar, scraping)?**
   - Respect event deletion rules:
     - Never mass-delete events.
     - Never delete rows with `expires_at IS NULL`.
     - Delete events one-by-one, typically via dedicated RPCs, when their timer reaches 0.
   - Ensure any new JSON file for events in `src/multillingues_events/` is wired into the events configuration (e.g. `EVENTS_DB_FILES` in `events.js`).

---

## Architecture & Processes

- **Electron separation**
  - Main process lives in `electron/` and `main.js`.
  - Renderer (UI + business logic) lives in `src/` (vanilla HTML/CSS/JS; backend logic in `src/backend/`).
  - Never enable `nodeIntegration` in the renderer; all Node/Electron access must go through preload.

- **Main ↔ Renderer communication**
  - Expose only the minimal required APIs from the main process via `preload.js` using `contextBridge`.
  - Renderer code must call these through `window.electronAPI`, `window.electronScraper`, and similar namespaces, never via direct Node APIs.
  - Keep preload APIs narrow, stable, and well-named around user intent (e.g. "exportSessions", "openAccountManager") rather than low-level filesystem operations.

---

## Permissions, Badges, and Features

- **Badges hierarchy**
  - Badges: `FREE` → `PRO` → `ADMIN` → `SUPERADMIN` (in ascending order of permissions).
  - Badge configuration and mappings live in `version-badges.js` (`BADGES`, `BADGE_TABS`, `BADGE_FEATURES`).

- **Tabs and navigation**
  - Before rendering or activating a tab, always check `currentCanAccessTab(tabId)`.
  - Do not rely on front-end visibility alone; ensure disabled tabs cannot be activated via keyboard or direct URL.

- **Features and UI elements**
  - Before showing buttons, actions, or whole sections, check `currentHasFeature(featureKey)`.
  - Hidden or disabled features should not be triggerable via keyboard shortcuts when the badge doesn't allow them.

- **New features**
  - When adding new tabs or features, extend the badge configuration in `version-badges.js` and ensure checks are in place wherever the feature is used.

---

## Supabase Usage & Data Integrity

- **Prefer RPCs**
  - Use secure, dedicated RPC functions for:
    - Sessions: e.g. `insert_user_session_secure`, `upsert_user_session_secure`.
    - Rankings, events, shared data, licenses, and bug reports.
  - Avoid raw `insert`, `update`, or `delete` on sensitive tables when a secure RPC exists.

- **Session and plan limits**
  - Respect FREE vs PRO limits (e.g. sessions per user) as enforced by RPC logic.
  - Do not introduce client-side workarounds that circumvent these limits.

- **Events and shared data**
  - Do not execute unconstrained `DELETE` on `shared_events` or similar shared tables.
  - Never delete events with `expires_at IS NULL`; those represent non-expiring data.
  - When timers reach zero, delete events one-by-one using the appropriate RPC.

- **Migrations and conflicts**
  - Be aware that some Supabase migrations are mutually exclusive (e.g. different implementations of the same RPC).
  - Do not instruct the user to run conflicting migrations (such as two different `get_ranking` RPC definitions) at the same time.

---

## Unified Storage & Synchronization

- **Unified storage**
  - Use the helpers in `unified-storage.js` (`get`, `set`, `remove`) instead of direct `localStorage`/`sessionStorage` access.
  - Keys should be defined and reused from `src/config/keys.js` rather than hardcoded throughout the codebase.

- **Synchronization with Supabase**
  - Use the throttled sync mechanism (`queueSync` in `sync-manager.js`) to push local changes to Supabase.
  - Do not introduce additional unthrottled sync loops; reuse the existing sync queue and conflict resolution strategy.
  - Respect the existing merge strategy (e.g. `local_id` as primary merge key, last-write-wins).

---

## Events, JSON Files, and Scraping

- **Event sources**
  - Understand the three event sources:
    - `shared_events` (scraped/shared events in Supabase).
    - `events` (events managed via the Supabase sidebar).
    - `user_events` (manual user-defined events).

- **Timers and deletion**
  - Only delete events when their timer reaches 0 and only via `delete_event_by_id(id)` or equivalent RPC.
  - Never implement bulk deletion of events; always act on single IDs.

- **JSON event files**
  - For any new event JSON in `src/multillingues_events/`:
    - Follow the required structure: at least `id`, `names` (with `fr` or `en` in lowercase), and `keywords`.
    - Register the file in the appropriate configuration (e.g. `EVENTS_DB_FILES` in `events.js`) so it is actually used.

- **Scraping rules**
  - Scraping player profiles and similar data is restricted to `SUPERADMIN` users.
  - When updating profile data from scraping, never overwrite non-empty fields with scraped values; only fill missing data.

---

## Internationalisation (i18n)

- **Supported languages**
  - The app supports exactly 6 languages: `fr`, `de`, `ru`, `es`, `en`, `tr` with `fr` as the default.

- **HTML usage**
  - Use `data-i18n` for text content, and `data-i18n-placeholder`, `data-i18n-title`, etc. for attributes.
  - Do not hardcode user-facing strings directly into HTML without i18n keys.

- **JavaScript usage**
  - Use `window.i18nT('key')` or `TRANSLATIONS.t('key', lang)` to fetch translated strings.
  - When adding a new key, provide translations for all six languages in `translations.js`.

---

## Security, Accounts, and Licenses

- **Environment and Supabase config**
  - Never commit `.env` or real Supabase keys; configuration should be injected via `scripts/inject-supabase-config.js`.
  - Do not log Supabase URLs, keys, or sensitive tokens to the console.

- **DarkOrbit accounts**
  - DarkOrbit account credentials are encrypted using Electron's `safeStorage` in `darkorbit-accounts.js`.
  - Do not introduce alternative storage for these credentials (e.g. plain localStorage).
  - Any new features that touch these accounts must go through the existing encrypted storage and APIs.

- **Licenses and PRO access**
  - PRO licenses use a fixed format like `XXXX-XXXX-XXXX-XXXX` and are activated via the `activate_license_key` RPC.
  - Do not bypass license checks when gating PRO features; always respect `currentHasFeature` and related checks.

---

## Quick Usage Summary

When working on this project:

1. Identify the process (main vs renderer) and route new capabilities through `preload.js` if Node/Electron APIs are needed.
2. Gate all tabs, buttons, and features with `currentCanAccessTab` and `currentHasFeature` according to badge rules.
3. Use secure Supabase RPCs, unified storage, and the existing sync manager instead of ad-hoc calls.
4. Follow event deletion constraints, i18n rules, and scraping/account security constraints for any related changes.

