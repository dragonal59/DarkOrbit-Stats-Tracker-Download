# Rapport — Flux scraping automatique des événements

## Contexte
Le scraping automatique des événements DarkOrbit (fr1) ne se déclenche pas. Analyse du flux complet et correctifs.

---

## 1. Flux théorique

1. **Démarrage app**  
   `app.ready` → `setupScheduler()` → `loadSchedulerConfig()` lit `scheduler-config.json` → `slotsDostats` / `slotsEvents` → `setInterval(check, 60000)`.

2. **Chaque minute**  
   `check()` : heure courante `HH:MM` → si `slotsEvents.indexOf(key) !== -1` → `scrapers.push('evenements')` → `runScheduledScrapers(scrapers)`.

3. **runScheduledScrapers**  
   - Vérifie `!global.scrapingState?.running`.  
   - Vérifie `global.currentUserId` et `global.supabaseAccessToken` (sinon log « utilisateur non authentifié » et return).  
   - Charge la config scraping depuis le renderer.  
   - Pour `evenements` : `ScraperBridge.startEventsOnlyScraping()`.

4. **startEventsOnlyScraping**  
   - Vérifie pas de scraping en cours.  
   - `require('./events-scraper-standalone')` → `runEventsScraping({ mainWindowRef })`.

5. **runEventsScraping**  
   - `getConfig().eventsScraperAccount` (compte fr1 en dur : fr1ss / lolmdr123).  
   - Vérifie `global.currentUserId` et `global.supabaseAccessToken`.  
   - BrowserWindow headless → login fr1 → extraction événements → envoi Supabase.

---

## 2. Problèmes identifiés

### 2.1 Token Supabase non rafraîchi avant les événements
- Pour **statistiques_joueurs**, on appelle `ScraperBridge.refreshSupabaseToken()` avant de lancer le scraping.
- Pour **evenements**, aucun refresh : on utilise uniquement `global.supabaseAccessToken`.
- Si le token a expiré ou n’a jamais été envoyé au main (app en arrière-plan, fenêtre pas encore chargée), `runEventsScraping` renvoie « Utilisateur non authentifié » et le scraping événements ne lance pas.

### 2.2 Fichier de config avec `slotsEvents` vide
- Si l’utilisateur a sauvegardé une config sans aucun créneau « Événements » (liste vide dans Planificateur), on enregistre `slotsEvents: []`.
- Au chargement, `loadSchedulerConfig()` renvoie alors `slotsEvents: []` → aucun créneau ne matche → le scraping événements ne est jamais déclenché.
- Comportement cohérent avec la config, mais peu visible pour l’utilisateur qui s’attend à un run « par défaut ».

### 2.3 Dépendance au `setUserContext` au chargement
- `setUserContext` n’est appelé que depuis l’index (après auth) et le Super Admin (au clic Démarrer).
- Si l’app est lancée et que le créneau événements tombe avant que la fenêtre ait fini de charger la session, `global.currentUserId` / `global.supabaseAccessToken` peuvent encore être vides → run planifié ignoré.

---

## 3. Conclusion

- La chaîne (scheduler → runScheduledScrapers → startEventsOnlyScraping → runEventsScraping) est correcte.
- Les causes probables du non-déclenchement sont :
  1. **Token manquant ou expiré** quand le run planifié s’exécute (pas de refresh avant événements).
  2. **slotsEvents vide** dans `scheduler-config.json` (aucun créneau configuré pour les événements).

---

## 4. Correctifs appliqués

1. **Rafraîchir le token avant le scraping événements** (fait)  
   Dans `main.js`, dans `runScheduledScrapers`, avant d’appeler `ScraperBridge.startEventsOnlyScraping()` :
   - Appel de `await ScraperBridge.refreshSupabaseToken()` (comme pour statistiques_joueurs).
   - Si après refresh il n’y a toujours pas de `global.currentUserId` / `global.supabaseAccessToken`, envoi du log « Événements ignoré : utilisateur non authentifié » et passage au créneau suivant (sans lancer le scraping événements).

2. **Aucun changement sur `slotsEvents: []`**  
   Comportement conservé : si l’utilisateur a sauvegardé sans aucun créneau « Événements », aucun run événements n’est programmé. Pour qu’il y en ait, il faut au moins un créneau dans « Créneaux Événements DarkOrbit » (Planificateur).

---

## 5. Vérifications utilisateur

- Dashboard > Planificateur : section **« Créneaux Événements DarkOrbit »** doit contenir au moins une heure (ex. 12:00).
- Enregistrer la config (les champs déclenchent une sauvegarde ou un bouton dédié selon l’UI).
- S’assurer d’être connecté (session Supabase) au moins une fois après ouverture de l’app, pour que `setUserContext` soit appelé (ou que le refresh avant événements fournisse le token).
