# Configuration Supabase — Pages d'authentification

Ce document décrit les étapes manuelles à effectuer dans le **Dashboard Supabase** pour que les flux **mot de passe oublié** et **confirmation d'email** fonctionnent correctement.

---

## 1. URL de redirection (Redirect URLs)

### Où configurer
Dashboard Supabase → **Authentication** → **URL Configuration**

### URLs à ajouter dans **Redirect URLs** (liste autorisée)

Selon votre mode de déploiement, ajoutez les URLs complètes vers lesquelles Supabase peut rediriger les utilisateurs après :

- **Mot de passe oublié** → `reset-password.html`
- **Confirmation d'email** → `confirm-email.html`

#### Cas A : Application Electron (fichiers locaux `file://`)

Les liens des emails ouvrent généralement le **navigateur par défaut**. Les URLs `file://` ne fonctionnent **pas** avec les redirections Supabase (restrictions de sécurité des navigateurs).

**Solution recommandée** : héberger une version web minimale de l'application (ou uniquement ces 2 pages) sur un domaine HTTPS, par exemple :

```
https://votre-domaine.com/reset-password.html
https://votre-domaine.com/confirm-email.html
```

Puis configurer ces URLs dans Supabase.

#### Cas B : Application web (hébergée sur HTTPS)

Si l'application est déjà hébergée, ajoutez les URLs complètes :

```
https://votre-domaine.com/reset-password.html
https://votre-domaine.com/confirm-email.html
```

#### Cas C : Développement local (localhost)

Pour tester en local avec un serveur web :

```
http://localhost:3000/reset-password.html
http://localhost:3000/confirm-email.html
```

> Remplacez `3000` par le port utilisé.

---

## 2. Site URL (URL principale)

### Où configurer
Dashboard Supabase → **Authentication** → **URL Configuration** → **Site URL**

### Valeur
Définissez l’URL de base de votre application. Elle est utilisée par défaut pour les liens de confirmation d’email et de réinitialisation de mot de passe quand aucune `redirectTo` n’est fournie.

Exemples :
- Web : `https://votre-domaine.com/`
- Local : `http://localhost:3000/`

---

## 3. Templates d’email (optionnel)

### Où configurer
Dashboard Supabase → **Authentication** → **Email Templates**

### Modèles disponibles
- **Confirm signup** : email de confirmation d’inscription
- **Reset password** : email de réinitialisation du mot de passe

Vous pouvez personnaliser le texte, les variables disponibles et le lien (`{{ .ConfirmationURL }}` ou `{{ .TokenHash }}`) si nécessaire. Le lien généré par Supabase inclut automatiquement la redirection vers les pages configurées.

---

## 4. Résumé des vérifications

| Élément | À faire |
|---------|---------|
| Redirect URLs | Ajouter les URLs de `reset-password.html` et `confirm-email.html` |
| Site URL | Configurer l’URL de base de l’application |
| Email Templates | Vérifier ou personnaliser si besoin |

---

## 5. Comportement attendu après configuration

1. **Mot de passe oublié** : l’utilisateur saisit son email sur `auth.html`, reçoit un email, clique sur le lien et arrive sur `reset-password.html` pour définir un nouveau mot de passe.
2. **Confirmation d’email** : après inscription, l’utilisateur reçoit un email, clique sur le lien et arrive sur `confirm-email.html`, qui confirme son compte puis le redirige vers l’application.
