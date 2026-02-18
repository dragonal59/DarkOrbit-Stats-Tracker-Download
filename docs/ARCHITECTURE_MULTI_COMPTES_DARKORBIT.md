# Architecture — Système multi-comptes DarkOrbit

**Version :** 1.0  
**Date :** 15 février 2025

---

## 1. Stockage des credentials

### 1.1 Choix : fichier local chiffré (pas Supabase)

**Raison :** `safeStorage` d'Electron utilise le keychain OS (Windows Credential Manager, macOS Keychain). Le secret est lié à la machine. Stocker le blob chiffré dans Supabase ne permettrait pas de déchiffrer sur une autre machine.

**Structure :** Fichier `darkorbit-accounts.enc` dans `app.getPath('userData')`, contenu chiffré via `safeStorage.encryptString()`.

```json
{
  "version": 1,
  "accounts": [
    {
      "id": "uuid",
      "label": "Compte Principal",
      "email": "user@example.com",
      "passwordEncrypted": "base64...",
      "isActive": true,
      "lastUsedAt": "2025-02-15T12:00:00Z",
      "createdAt": "..."
    }
  ],
  "serverAssignments": {
    "gbl5": "account-uuid",
    "fr1": "account-uuid"
  }
}
```

### 1.2 Sécurité

- **Chiffrement :** `safeStorage.encryptString()` / `safeStorage.decryptString()`
- **Processus :** Lecture/écriture uniquement dans le main process
- **Logs :** Jamais de mot de passe ou credential en clair
- **Permissions :** Accès réservé au Super Admin (vérification côté UI)

---

## 2. Isolation des sessions (multi-comptes)

### 2.1 Stratégie : partition par compte

Chaque compte DarkOrbit utilise une **partition Electron** dédiée :

```js
session.fromPartition('persist:darkorbit-' + accountId)
```

- Cookies et stockage isolés par compte
- Une fenêtre de collecte peut être recréée avec la partition du compte cible
- Quand on change de serveur → si le compte assigné change → fermer la fenêtre actuelle, en ouvrir une nouvelle avec la bonne partition

### 2.2 Limitation actuelle

Une seule fenêtre de collecte à la fois. On scrape de façon **séquentielle**. Lors d’un changement de compte, on ferme la fenêtre et on en ouvre une nouvelle avec la partition du nouveau compte.

---

## 3. Connexion automatique

### 3.1 Flux

1. Le collector charge l’URL du Hall of Fame (ou la page de login si non connecté).
2. Le content script détecte la page de login (`internalStart` ou équivalent).
3. Si une page de login est détectée, le main process envoie les credentials au renderer via un canal dédié.
4. Le content script remplit le formulaire et le soumet.

**Alternative (main process) :**  
`webContents.executeJavaScript()` pour remplir et soumettre le formulaire. Les credentials restent en mémoire dans le main process, jamais envoyés au réseau en clair.

### 3.2 Sélecteurs de login (à valider sur le site)

- Champ identifiant : `#username` ou `input[name="username"]`
- Champ mot de passe : `#password` ou `input[name="password"]`
- Bouton : `button[type="submit"]` ou `#login_btn`

### 3.3 Gestion des erreurs

- Credentials invalides : notifier, marquer le compte en erreur, passer au serveur suivant.
- Session expirée : reconnexion automatique, max 3 tentatives.
- Compte banni : désactiver le compte, alerte.

---

## 4. Répartition des serveurs

- Contrainte : un serveur = un seul compte.
- Contrôle à la sauvegarde : chaque `server_code` apparaît au plus une fois dans `serverAssignments`.
- Preset « Répartir équitablement » : répartition en round-robin sur les comptes actifs.

---

## 5. Rétrocompatibilité

- Si aucun compte configuré → comportement actuel (connexion manuelle).
- Si des comptes existent mais qu’un serveur n’est pas assigné → ignorer ce serveur ou avertir.
- Migration : un compte par défaut peut être créé et tous les serveurs lui être assignés.

---

## 6. Implémentation (ranking-collector.js)

- **Partition** : `persist:darkorbit-{accountId}` par compte.
- **Extension** : chargée sur chaque session utilisée.
- **Connexion auto** : détection login → remplissage + soumission (credentials en base64).
- **Post-login** : rechargement URL HoF.
