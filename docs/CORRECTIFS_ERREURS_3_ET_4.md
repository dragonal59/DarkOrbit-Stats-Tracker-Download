# Correctifs manuels — Erreur 3 (Supabase user_sessions) et Erreur 4 (CSP Electron)

À appliquer / vérifier manuellement. Aucune modification automatique du code pour la CSP.

---

## Erreur 3 : Supabase 400 sur user_sessions

### Vérifications manuelles Supabase (OBLIGATOIRES)

#### 1. Vérifier la table `user_sessions`

Colonnes requises :

- `user_id` (UUID, NOT NULL, FK vers auth.users)
- `local_id` (TEXT)
- `honor`, `xp`, `rank_points`, `next_rank_points`, `current_rank`, `note`, `session_date`, `session_timestamp`, `is_baseline`, `updated_at`

#### 2. Créer la contrainte UNIQUE (cause principale du 400)

Si la contrainte n’existe pas, exécuter dans le **SQL Editor** Supabase :

```sql
ALTER TABLE user_sessions
ADD CONSTRAINT user_sessions_user_id_local_id_key UNIQUE (user_id, local_id);
```

#### 3. Vérifier RLS

- RLS activé sur `user_sessions`.
- Policy active avec `auth.uid() = user_id` pour SELECT, INSERT, UPDATE, DELETE.

#### 4. Diagnostic si l’erreur 400 persiste

- **Consulter les logs Supabase** : Dashboard → Logs (message exact : colonne manquante, type invalide, etc.).
- **Vérifier l’onglet Network (DevTools)** : détail de la requête et du corps de la réponse 400 (souvent message PostgREST).

---

## Erreur 4 : Avertissement de sécurité Electron (Content-Security-Policy)

⚠️ **Aucune modification automatique du code.**

### Proposition de CSP (à valider manuellement)

Ajouter dans le `<head>` de **index.html** et **auth.html** :

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  font-src 'self' data:;
  frame-src 'none';
  base-uri 'self';
">
```

### Explications

- **script-src** : scripts locaux + inline + CDN (Supabase, Chart.js, Confetti).
- **connect-src** : API Supabase + WebSocket Realtime.
- **img-src** : images locales, data-URI, HTTPS externes.

### Validation

1. Lancer l’app Electron.
2. Tester : connexion Supabase, graphiques Chart.js, confetti, chargement des images boosters.
3. Vérifier la console (pas de blocage CSP).
4. Si une ressource est bloquée : ajuster uniquement la directive concernée.

### Alternative

En développement, l’avertissement peut être ignoré si l’app n’est pas exposée à du contenu non fiable.

---

*Document créé dans le cadre des correctifs d’erreurs critiques.*
