# Sécurité — Étape 6 : Obfuscation front-end

**Date :** février 2026  
**Objectif :** Rendre le code front-end difficile à lire lors de la distribution, tout en conservant la logique sensible côté serveur (Supabase).

---

## Fichiers créés / modifiés

| Fichier | Description |
|---------|-------------|
| `scripts/obfuscate-build.js` | Script de copie et obfuscation des `.js` de `src/` vers `build/src/` |
| `package.json` | Ajout de `prebuild`, `javascript-obfuscator` (devDep), `files` avec `build/src` → `src` |
| `.gitignore` | Ajout de `build/` |

---

## Dépendance ajoutée

- **javascript-obfuscator** (devDependency) — nécessaire pour le build de production.

**Installation :** `npm install`

---

## Comportement

### En développement (`npm start`)
- Aucune obfuscation : les fichiers sources `src/` sont chargés directement.
- Permet le débogage et les modifications sans régression.

### En build (`npm run build`)
1. **prebuild** (automatique) : exécute `node scripts/obfuscate-build.js`
   - Copie `src/` → `build/src/`
   - Obfuscation des fichiers `.js` (sauf `preload.js`)
   - Paramètres : compact, stringArray, pas de renameGlobals
2. **electron-builder** : empaquette `main.js` et `build/src` (copié en tant que `src`) dans l’application.

---

## Fichiers non obfusqués

| Fichier | Raison |
|---------|--------|
| `preload.js` | Utilise `require('electron')` et `contextBridge` ; l’obfuscation risquerait de casser le contexte Node. |

---

## Procédure de build

1. `npm install`
2. `npm run build`

L’installateur Windows généré (NSIS) contiendra le code obfusqué dans les fichiers JavaScript du renderer.
