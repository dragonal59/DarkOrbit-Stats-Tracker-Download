# Bilan final — Chantier scraping DOStats Hall of Fame

**Date :** 2025-03-01  
**Contexte :** Scraping des Hall of Fame https://dostats.info (`hall-of-fame?server={SERVER_ID}&type={TYPE}`). Types : `topuser`, `experience`, `honor`, `aliens`, `ships`.

---

## Actions effectuées

| # | Action | Fichier(s) | Statut |
|---|---|---|---|
| 1 | `Global Europe X` → `Europe Global X` (int1/5/7/11/14) | `server-mappings.js`, `config.js` | ✅ |
| 2 | `Amerique` → `Amérique` (int2, int6) | `server-mappings.js`, `config.js` | ✅ |
| 3 | gbl2/gbl3 : suppression des types `aliens` et `ships` | `dostats-ranking-collect.js` | ✅ |
| 4 | Bug remappage `gbl2 → gbl3` supprimé (HoF) | `dostats-ranking-collect.js` | ✅ |
| 5 | Bug remappage `gbl2 → gbl3` supprimé (profils) | `dostats-profile-scraper.js` | ✅ |
| 6 | Docs mises à jour (`APP_CONTEXT.md`, rapports) | `docs/` | ✅ |
| 7 | USA 2 = `us2` (cohérent DOStats) | mapping de référence | ✅ |

---

## Mapping de référence (24 serveurs)

| name | id | aliens | ships |
|------|-----|--------|-------|
| Allemagne 2 | de2 | true | true |
| Allemagne 4 | de4 | true | true |
| Espagne 1 | es1 | true | true |
| France 1 | fr1 | true | true |
| Europe Global 1 | int1 | true | true |
| Europe Global 2 | int5 | true | true |
| Europe Global 3 | int7 | true | true |
| Europe Global 5 | int11 | true | true |
| Europe Global 7 | int14 | true | true |
| Amérique Global 1 | int2 | true | true |
| Amérique Global 2 | int6 | true | true |
| Global PvE | gbl1 | true | true |
| Global 2 (Ganymede) | gbl2 | **false** | **false** |
| Global 3 (Titan) | gbl3 | **false** | **false** |
| Global 4 (Europa) | gbl4 | true | true |
| Global 5 (Callisto) | gbl5 | true | true |
| Mexique 1 | mx1 | true | true |
| Pologne 3 | pl3 | true | true |
| Russie 1 | ru1 | true | true |
| Russie 5 | ru5 | true | true |
| Turquie 3 | tr3 | true | true |
| Turquie 4 | tr4 | true | true |
| Turquie 5 | tr5 | true | true |
| USA 2 (West Coast) | us2 | true | true |

**JSON (référence) :**

```json
[
  { "name": "Allemagne 2",        "id": "de2",   "aliens": true,  "ships": true  },
  { "name": "Allemagne 4",        "id": "de4",   "aliens": true,  "ships": true  },
  { "name": "Espagne 1",          "id": "es1",   "aliens": true,  "ships": true  },
  { "name": "France 1",           "id": "fr1",   "aliens": true,  "ships": true  },
  { "name": "Europe Global 1",    "id": "int1",  "aliens": true,  "ships": true  },
  { "name": "Europe Global 2",    "id": "int5",  "aliens": true,  "ships": true  },
  { "name": "Europe Global 3",    "id": "int7",  "aliens": true,  "ships": true  },
  { "name": "Europe Global 5",    "id": "int11", "aliens": true,  "ships": true  },
  { "name": "Europe Global 7",    "id": "int14", "aliens": true,  "ships": true  },
  { "name": "Amérique Global 1",  "id": "int2",  "aliens": true,  "ships": true  },
  { "name": "Amérique Global 2",  "id": "int6",  "aliens": true,  "ships": true  },
  { "name": "Global PvE",         "id": "gbl1",  "aliens": true,  "ships": true  },
  { "name": "Global 2 (Ganymede)","id": "gbl2",  "aliens": false, "ships": false },
  { "name": "Global 3 (Titan)",   "id": "gbl3",  "aliens": false, "ships": false },
  { "name": "Global 4 (Europa)",  "id": "gbl4",  "aliens": true,  "ships": true  },
  { "name": "Global 5 (Callisto)","id": "gbl5",  "aliens": true,  "ships": true  },
  { "name": "Mexique 1",          "id": "mx1",   "aliens": true,  "ships": true  },
  { "name": "Pologne 3",          "id": "pl3",   "aliens": true,  "ships": true  },
  { "name": "Russie 1",           "id": "ru1",   "aliens": true,  "ships": true  },
  { "name": "Russie 5",           "id": "ru5",   "aliens": true,  "ships": true  },
  { "name": "Turquie 3",          "id": "tr3",   "aliens": true,  "ships": true  },
  { "name": "Turquie 4",          "id": "tr4",   "aliens": true,  "ships": true  },
  { "name": "Turquie 5",          "id": "tr5",   "aliens": true,  "ships": true  },
  { "name": "USA 2 (West Coast)", "id": "us2",   "aliens": true,  "ships": true  }
]
```

---

## Règles pour la suite

1. **IDs DOStats = IDs internes**  
   Pas de table de remappage par défaut. Si un futur serveur a un ID d’URL DOStats différent du `server_id` interne, ajouter un mapping explicite dans le scraper concerné (HoF ou profils) **et** documenter dans `docs/APP_CONTEXT.md`.

2. **aliens / ships**  
   Toujours vérifier `SERVERS_WITHOUT_ALIENS_SHIPS` dans `electron/dostats-ranking-collect.js` avant d’ajouter un nouveau serveur gbl (ou tout serveur sans HoF aliens/ships sur DOStats).

3. **Libellés serveurs**  
   Source de vérité = `src/backend/server-mappings.js`. Le fallback dans `src/backend/config.js` doit rester synchronisé manuellement (mêmes noms pour int1/int5/int7/int11/int14, int2/int6, etc.).

---

*Document de référence du chantier scraping DOStats HoF.*
