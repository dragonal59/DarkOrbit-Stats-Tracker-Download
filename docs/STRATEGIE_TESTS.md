# Stratégie de tests — DarkOrbit Stats Tracker Pro

**Document Phase 3 — Flux critiques à couvrir**

---

## 1. Périmètre recommandé

### 1.1 Flux critiques

| Flux | Description | Priorité |
|------|-------------|----------|
| **Auth** | Connexion, déconnexion, inscription, récupération session | Haute |
| **Sync** | DataSync.pull(), DataSync.sync(), merge sessions | Haute |
| **Permissions** | get_user_permissions, limites FREE/PRO, applyPermissionsUI | Haute |
| **Sessions** | Création, suppression, vérification limite avant ajout | Haute |
| **Scraper** | Détection cookies expirés, fallback login | Moyenne |

### 1.2 Modules à tester

- `sync-manager.js` : `pull()`, `sync()`, `_mergeSessions()`, `_mergeEvents()`
- `sessions.js` : `getSessions()`, limite avant ajout
- `api.js` : `get_user_permissions`, fallback FREE
- `auth-manager.js` : `getValidSession()`, logout
- Extension scraper : détection `cookies-expired`, fallback login

---

## 2. Outils envisagés

| Outil | Usage | Dépendance |
|-------|-------|------------|
| **Jest** | Tests unitaires JS (sync-manager, sessions, api) | `npm install jest --save-dev` |
| **Vitest** | Alternative légère à Jest | `npm install vitest --save-dev` |
| **Playwright** | Tests E2E (auth, UI) | `npm install @playwright/test --save-dev` |

> **Important :** Aucun framework de test n'est installé par défaut. Pour ajouter des tests, exécuter `npm install <framework> --save-dev` après validation.

---

## 3. Structure suggérée

```
tests/
  unit/
    sync-manager.test.js
    sessions.test.js
    api.test.js
  e2e/
    auth.spec.js
    sync.spec.js
```

### 3.1 Tests unitaires (exemple)

```javascript
// tests/unit/sync-manager.test.js (exemple conceptuel)
describe('DataSync._mergeSessions', () => {
  it('dernier écrit gagne (timestamp le plus récent)', () => {
    const local = [{ id: 's1', timestamp: 1000, honor: 100 }];
    const remote = [{ local_id: 's1', session_timestamp: 2000, honor: 200 }];
    const merged = DataSync._mergeSessions(local, remote);
    expect(merged[0].honor).toBe(200);
  });
});
```

### 3.2 Tests E2E (exemple)

- Connexion avec email/mdp → redirection vers index
- Déconnexion → redirection vers auth.html
- Ajout session FREE avec 1 session existante → toast "Limite atteinte"

---

## 4. Prochaines étapes

1. Valider le choix du framework (Jest vs Vitest vs autre).
2. Configurer le projet pour les tests (package.json scripts, config).
3. Écrire les tests unitaires pour sync-manager et sessions en priorité.
4. Envisager des tests E2E si l'app évolue (Playwright ou Puppeteer).

---

## 5. Références

- `src/backend/sync-manager.js` : logique pull/sync
- `src/backend/sessions.js` : gestion sessions locales
- `src/backend/api.js` : permissions et limites
- `docs/STRATEGIE_SYNC_ET_LIMITES.md` : stratégie merge et limites
