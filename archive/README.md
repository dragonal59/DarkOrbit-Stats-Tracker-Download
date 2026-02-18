# Archive — Fichiers retirés du build (nettoyage v2.1)

Ces fichiers n'étaient pas chargés par l'application (non référencés dans `index.html` ni `auth.html`) ou ont été remplacés par d'autres modules. Ils sont conservés ici pour référence uniquement.

| Fichier | Raison |
|---------|--------|
| **cache.js** | Remplacé par `unified-storage.js` qui expose l'alias `StorageCache` et les helpers `getCachedSessions` etc. Jamais chargé. |
| **compression.js** | Compression gérée dans `unified-storage.js` (_compress/_decompress). Ce module n'était pas chargé. |
| **script_TIMER_FIX.js** | Correctif timer (visibility) déjà intégré ou couvert par `backend/timer.js`. Jamais chargé. |
| **chats.js** | Ancienne version des graphiques (un seul canvas). Remplacé par `frontend/charts.js` (chargé). Faute de frappe « chats » vs « charts ». |

Ne pas réintégrer ces fichiers dans `src/` sans vérifier qu'ils ne dupliquent pas la logique existante.
