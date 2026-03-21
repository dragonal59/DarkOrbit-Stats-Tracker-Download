# Compte rendu de faisabilité technique — Scraping via le client téléchargeable DarkOrbit

**Date :** 21 février 2025  
**Contexte :** Transition du scraping navigateur vers le client officiel DarkOrbit  
**Objectif :** Évaluer la faisabilité d’intercepter les flux de données (profils joueurs, firmes) depuis le client téléchargeable

---

## 1. Synthèse exécutive

| Critère | Verdict |
|---------|---------|
| **Faisabilité globale** | ⚠️ **Moyenne à faible** |
| **Complexité technique** | Élevée |
| **Risques juridiques / ToS** | Élevés (injection, reverse engineering) |
| **Recommandation** | **Conserver le scraping navigateur** et le renforcer (voir section 6) |

Le client officiel DarkOrbit est un **exécutable Unity (il2cpp)**, et non un client Electron/Chromium. L’intégration directe du moteur de scraping dans le client est **impossible sans reverse engineering avancé**. L’interception des flux est possible via **proxy** ou **injection de DLL**, mais chaque approche présente des limites et des risques importants.

---

## 2. Architecture du client DarkOrbit

### 2.1 Technologie utilisée

| Aspect | Détail |
|--------|--------|
| **Moteur** | Unity (il2cpp) |
| **Type** | Exécutable natif Windows (.exe) |
| **Téléchargement** | [darkorbit.com/download.php](https://www.darkorbit.com/download.php) |
| **Version documentée** | 1.1.89+ |

**Important :** Le client n’est **pas** basé sur Electron ou Chromium. Les clients communautaires (ex. OrbitClient) sont des wrappers Electron qui chargent le jeu dans une page web ; le client officiel est un binaire Unity compilé.

### 2.2 Communication réseau

D’après les projets open source (orbitresolver, darkorbit-netcode-parser) :

- **Flash (legacy)** : protocole binaire custom, parsable via `darkorbit-netcode-parser` (AS3 décompilé).
- **Unity (actuel)** : 
  - Session réseau avec envoi de DTO (Data Transfer Objects) : `ShipSelectRequest`, `MoveRequest`, etc.
  - Méthode `DarkOrbit.SessionSystem::Send` pour l’envoi des requêtes.
  - Transport probable : **TCP brut ou WebSocket** (non documenté officiellement).
  - Pas de REST/HTTP public pour les profils joueurs en jeu.

### 2.3 Données cibles (profils joueurs)

Les firmes (MMO, EIC, VRU) sont affichées :

- Sur les **pages web** : `https://[server].darkorbit.com/p/[userId]/?lang=en` (approche actuelle du profile-scraper).
- **En jeu** : lors de l’affichage du profil d’un joueur (clic droit, etc.), via des paquets échangés entre client et serveur.

Pour intercepter les firmes depuis le client, il faut capter les paquets contenant les infos de profil (réponse serveur → client).

---

## 3. Analyse des approches techniques

### 3.1 Intégration du moteur de scraping dans le client

**Conclusion : non réalisable sans reverse engineering.**

| Option | Faisabilité | Commentaire |
|--------|-------------|-------------|
| **Modifier le binaire Unity** | ❌ | Binaire compilé, pas de code source. |
| **Injection de code (DLL)** | ⚠️ | Possible (orbitresolver le fait), mais complexe et risqué (ToS, antivirus). |
| **Remplacer le client par un wrapper Electron** | ❌ | Le client officiel est un exe Unity, pas une page web. |

Le projet [orbitresolver](https://github.com/acard0/orbitresolver) montre qu’une **injection de DLL Rust** permet de :

- Trouver la classe `DarkOrbit.Session` via pattern matching il2cpp.
- Hooker `SessionSystem::Send` pour intercepter les DTO envoyés.
- Créer et envoyer des requêtes (ex. `ShipSelectRequest`).

Pour les **profils joueurs**, il faudrait en plus :

- Intercepter les **réponses** serveur (hook sur la réception des paquets).
- Identifier les paquets contenant les infos de firme.
- Documenter le format des paquets (reverse engineering).

### 3.2 Interception des flux (WebSocket / API)

**Conclusion : dépend du protocole réel.**

| Protocole | Interception possible | Outils |
|-----------|------------------------|--------|
| **HTTP/HTTPS** | ✅ | MitmProxy, Fiddler, proxy Node.js |
| **WebSocket** | ✅ | MitmProxy (addon websocket), proxy Node.js |
| **TCP brut (custom)** | ⚠️ | Fiddler (TLS), Wireshark, proxy custom |

**Problème :** Le protocole exact du client Unity n’est pas documenté. Si le client utilise un socket TCP custom (sans HTTP), un proxy HTTP classique ne suffit pas.

**MitmProxy :**

- Intercepte HTTP/HTTPS et WebSocket.
- Nécessite que le client utilise le proxy système (`http_proxy`, `https_proxy`).
- Le client Unity peut ignorer ces variables.
- Certificat CA à installer pour HTTPS.

**Node.js :** `httpxy`, `http-proxy` avec support WebSocket, ou `mitmproxy-node` (bridge Python) sont envisageables si le trafic passe par HTTP/WebSocket.

### 3.3 Adaptation de `main.js` pour lancer ou s’attacher au client

**Conclusion : lancement possible, attachement limité.**

#### 3.3.1 Lancer le client depuis l’app Electron

```javascript
// Exemple conceptuel dans main.js
const { spawn } = require('child_process');
const path = require('path');

// Chemin typique du client DarkOrbit (à adapter)
const clientPath = path.join(
  process.env.LOCALAPPDATA || '',
  'DarkOrbit',
  'DarkOrbit.exe'
);

const child = spawn(clientPath, [], {
  env: {
    ...process.env,
    http_proxy: 'http://127.0.0.1:8080',
    https_proxy: 'http://127.0.0.1:8080',
  },
});
```

- **Avantage :** L’app peut démarrer le client avec des variables d’environnement (proxy).
- **Limite :** Si le client n’utilise pas le proxy système, le trafic ne passera pas par le proxy.

#### 3.3.2 S’attacher au processus du client

- **Electron** ne fournit pas d’API pour s’attacher à un processus externe.
- **Node.js** : pas d’API native d’injection ou d’attachement.
- **Frida** (comme dans darkorbit_packet_dumper) : attachement à un processus pour hooker des fonctions, mais ciblé Flash ; pour Unity il faudrait des scripts Frida adaptés à il2cpp.
- **orbitresolver** : injection de DLL via un injecteur externe (ProcessHacker, etc.), pas depuis Node/Electron.

**Conclusion :** `main.js` peut **lancer** le client avec un proxy configuré, mais ne peut pas **s’injecter** dans le processus sans outils externes (Frida, DLL injector).

### 3.4 Proxy de capture (MitmProxy, Node.js)

| Outil | Avantages | Inconvénients |
|-------|-----------|---------------|
| **MitmProxy** | Mature, HTTP/HTTPS/WebSocket, addons Python | Dépendance Python, client doit utiliser le proxy |
| **mitmproxy-node** | Bridge Node.js ↔ MitmProxy | Même limite que MitmProxy |
| **httpxy** (Node.js) | Pur Node.js, HTTP + WebSocket | Moins mature que MitmProxy |
| **Fiddler** | Très utilisé, support TLS | Windows, GUI, pas d’intégration directe dans l’app |
| **Wireshark** | Capture tout le trafic | Analyse manuelle, pas d’intégration automatique |

**Chaîne proposée si le client utilise HTTP/WebSocket :**

1. Démarrer un proxy (MitmProxy ou Node.js) sur `127.0.0.1:8080`.
2. Lancer le client DarkOrbit avec `http_proxy` / `https_proxy`.
3. Filtrer les requêtes/réponses contenant les données de profil.
4. Parser le format (JSON, binaire, etc.) et extraire les firmes.

**Étape préalable indispensable :** Vérifier si le client respecte le proxy système et quel protocole il utilise (HTTP, WebSocket ou TCP custom).

---

## 4. Plan d’action recommandé (par ordre de priorité)

### Phase 0 : Reconnaissance (1–2 jours)

1. **Identifier le protocole réseau du client Unity**
   - Lancer le client avec `http_proxy=http://127.0.0.1:8080` et MitmProxy.
   - Vérifier si du trafic passe par le proxy.
   - Si non : utiliser Wireshark pour observer les connexions (IP, port, TLS).

2. **Localiser le chemin d’installation du client**
   - Enregistrement Windows, `%LOCALAPPDATA%`, `%PROGRAMFILES%`.
   - Documenter pour le lancement depuis `main.js`.

### Phase 1 : Si le client utilise HTTP/WebSocket (faisable)

1. Intégrer un proxy Node.js (ex. `httpxy`) ou un script MitmProxy dans l’app.
2. Adapter `main.js` pour :
   - Démarrer le proxy au lancement du mode « scraping client ».
   - Lancer le client avec les variables proxy.
3. Implémenter un addon/script qui :
   - Filtre les messages liés aux profils joueurs.
   - Parse les données et extrait les firmes.
   - Envoie les résultats à Supabase (comme le profile-scraper actuel).

### Phase 2 : Si le client utilise TCP custom (complexe)

1. Étudier orbitresolver et les hooks sur `SessionSystem::Send` / réception.
2. Évaluer Frida pour Unity/il2cpp (scripts existants ou à développer).
3. Décider si le coût (reverse engineering, maintenance) est acceptable par rapport au bénéfice.

### Phase 3 : Alternative — Injection de DLL (très risqué)

- S’inspirer d’orbitresolver pour une DLL qui :
  - Hook la réception des paquets (côté réception, pas seulement Send).
  - Extrait les données de profil.
  - Les expose via un socket local ou fichier pour que l’app Electron les lise.
- **Risques :** violation des ToS, détection anti-cheat, faux positifs antivirus.

---

## 5. Risques et contraintes

| Risque | Niveau | Mitigation |
|--------|--------|------------|
| **Violation des ToS DarkOrbit** | Élevé | Reverse engineering et injection sont généralement interdits. |
| **Détection anti-cheat** | Élevé | Injection de DLL et hooks peuvent déclencher des bannissements. |
| **Fragilité** | Élevé | Mises à jour du client = protocole et structures susceptibles de changer. |
| **Maintenance** | Élevé | Nécessité de suivre les mises à jour et d’adapter le parsing. |
| **Compatibilité** | Moyen | Dépendance à l’architecture du client (32/64 bits, il2cpp). |

---

## 6. Recommandation finale

### Option A : Conserver et améliorer le scraping navigateur (recommandé)

Le scraping actuel (BrowserWindow → pages `https://[server].darkorbit.com/p/[userId]/`) reste :

- **Conforme** aux usages web classiques.
- **Plus simple** à maintenir.
- **Moins risqué** juridiquement et pour le compte joueur.

Améliorations proposées (issues de l’audit `AUDIT_SCRAPING_PROFILS_JOUEURS.md`) :

1. Corriger le session-scraper pour extraire le `userId` (blocage actuel).
2. Ajouter une détection CAPTCHA et une attente manuelle.
3. Renforcer les retries avec backoff.
4. Introduire des métriques par sélecteur pour suivre la robustesse.

### Option B : Exploration limitée du client (si besoin)

Si la décision est de poursuivre l’exploration du client :

1. **Phase 0 uniquement** : tests MitmProxy + Wireshark pour confirmer le protocole.
2. Si HTTP/WebSocket : prototype de proxy + parsing (Phase 1).
3. Si TCP custom : évaluation du rapport coût/bénéfice avant d’investir dans du reverse engineering.

### Option C : Abandon de l’approche client

Si les risques (ToS, anti-cheat, complexité) sont jugés trop élevés, ne pas aller au-delà de la Phase 0.

---

## 7. Références

| Ressource | Description |
|----------|-------------|
| [orbitresolver](https://github.com/acard0/orbitresolver) | Outil Rust pour Unity DarkOrbit : hooks il2cpp, Session, DTO |
| [darkorbit-netcode-parser](https://github.com/ProjectOpenOrbit/darkorbit-netcode-parser) | Parser des paquets à partir du code AS3 décompilé (Flash) |
| [darkorbit_packet_dumper](https://github.com/Alph4rd/darkorbit_packet_dumper) | Hook Flash via Frida (legacy) |
| [MitmProxy WebSocket](https://docs.mitmproxy.org/stable/api/mitmproxy/websocket.html) | Documentation interception WebSocket |
| [DarkOrbit Unity migration](https://board-en.darkorbit.com/threads/dark-orbit-to-unity.125098/) | Annonce migration Flash → Unity |

---

## 8. Conclusion

La transition vers un scraping basé sur le client DarkOrbit est **techniquement possible** mais **coûteuse et risquée**. Le client Unity n’est pas basé sur Electron ; l’intégration directe n’est pas réalisable sans reverse engineering. L’interception par proxy est envisageable uniquement si le client utilise HTTP/WebSocket et respecte le proxy système.

**Recommandation :** privilégier l’amélioration du scraping navigateur existant. Si une exploration du client est jugée utile, limiter les efforts à une Phase 0 de reconnaissance du protocole avant tout engagement technique important.
