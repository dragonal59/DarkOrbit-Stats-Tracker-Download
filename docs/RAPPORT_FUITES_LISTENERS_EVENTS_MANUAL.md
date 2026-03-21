# Rapport — Fuites event listeners (Prompt #13)

## Fichier : src/backend/events-manual.js

---

## Action 1 — Handlers nommés

| Listener | Élément | Ancien | Nouveau |
|----------|---------|--------|---------|
| `error` (capture) | document.body | callback anonyme | `_onManualEventImageError` |
| `click` | document.body | callback anonyme | `_onCarouselDelegationClick` |
| `click` | document.body | callback anonyme | `_onEventInfoModalBodyClick` |
| `click` | modal (overlay) | callback anonyme | `_onEventInfoModalOverlayClick` |

---

## Action 2 — removeEventListener (beforeunload + userLoggedOut)

Fonction `cleanupBodyListeners()` ajoutée, appelée par :
- `window.addEventListener('beforeunload', cleanupBodyListeners)`
- `window.addEventListener('userLoggedOut', cleanupBodyListeners)`

**Listeners retirés :**
- `document.body.removeEventListener('error', _onManualEventImageError, true)`
- `document.body.removeEventListener('click', _onCarouselDelegationClick)`
- `document.body.removeEventListener('click', _onEventInfoModalBodyClick)`
- `_eventInfoCloseBtnRef.removeEventListener('click', closeEventInfoModal)`
- `_eventInfoModalRef.removeEventListener('click', _onEventInfoModalOverlayClick)`

`stopAllCarouselIntervals` est appelé dans `cleanupBodyListeners` (remplace l’ancien handler direct).

---

## Action 3 — Guards anti-doublons

| Fonction | Guard |
|----------|-------|
| `initManualEventImageFallback` | `window._manualEventImageFallbackInit` (déjà présent) |
| `initCarouselDelegation` | `window._carouselDelegationInit` |
| `initEventInfoModal` | `window._eventInfoModalInit` |
| `initAddEventModal` | `window._addEventModalInit` |

Les guards sont réinitialisés dans `cleanupBodyListeners` pour permettre une ré-init après logout (sauf `_addEventModalInit`, car les listeners du modal add ne sont pas retirés).

---

## Listeners non modifiés (hors scope)

- `container.addEventListener('click', ...)` dans `updateEventsTabContent` — déjà protégé par `container._eventsActionsListener`
- `container.addEventListener('mouseenter'/'mouseleave', ...)` dans `attachCarouselHoverOnce` — déjà protégé par `container._carouselHoverAttached`
- Listeners sur addBtnTab, closeBtn, cancelBtn, submitBtn, modal dans `initAddEventModal` — pas sur `document.body`, guard ajouté pour éviter les doublons
