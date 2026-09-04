# Gridline | Légal — version Vercel

Même site, même design. Cette fois hébergé sur Vercel (gratuit, lien permanent,
pas besoin de garder ton PC allumé ni d'utiliser ngrok).

## Ce qui change par rapport aux versions précédentes

Vercel ne garde pas de fichiers en mémoire entre les visites, donc les données
(entreprises, fiches, employés...) sont stockées dans une petite base intégrée
à Vercel appelée **Vercel KV** (gratuite, quelques clics à activer).

## Étape 1 — Créer un compte Vercel

Va sur https://vercel.com et crée un compte gratuit (avec GitHub, GitLab, ou email).

## Étape 2 — Installer l'outil Vercel sur ton PC

Ouvre une invite de commandes (cmd ou PowerShell) et tape :

```
npm install -g vercel
```

## Étape 3 — Déployer le projet

1. Extrais le zip que je t'ai donné, ouvre une invite de commandes dans ce dossier
   (`cd chemin\vers\gridline-vercel`).
2. Tape :
   ```
   vercel login
   ```
   (ça ouvre ton navigateur pour te connecter)
3. Tape :
   ```
   vercel
   ```
   Réponds aux questions (accepte les valeurs par défaut en appuyant sur Entrée
   à chaque fois, sauf si tu veux personnaliser le nom du projet).
4. Une fois terminé, Vercel t'affiche une adresse du style
   `https://gridline-vercel-xxxx.vercel.app` — c'est ton site, déjà en ligne !

## Étape 4 — Ajouter le stockage (Vercel KV)

1. Va sur https://vercel.com/dashboard, ouvre ton projet.
2. Onglet **Storage** → **Create Database** → choisis **KV** (Redis).
3. Donne-lui un nom, crée-la, puis **connecte-la à ton projet** (Vercel te le
   propose automatiquement après création).
4. Cette étape ajoute automatiquement les variables nécessaires à ton projet
   (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc.) — tu n'as rien à copier toi-même.

## Étape 5 — Variables d'environnement Discord

Toujours dans le dashboard Vercel, onglet **Settings** → **Environment Variables**,
ajoute ces 4 variables (valeurs depuis https://discord.com/developers/applications) :

| Nom | Valeur |
|---|---|
| `DISCORD_CLIENT_ID` | ton Client ID |
| `DISCORD_CLIENT_SECRET` | ton Client Secret |
| `DISCORD_REDIRECT_URI` | `https://TON-PROJET.vercel.app/auth/discord/callback` |
| `DISCORD_GUILD_ID` | `1418719996665921546` |
| `SESSION_SECRET` | n'importe quelle longue phrase aléatoire |

Remplace `TON-PROJET.vercel.app` par ta vraie adresse Vercel (étape 3).

Ajoute cette même adresse `https://TON-PROJET.vercel.app/auth/discord/callback`
dans Discord (OAuth2 → Redirects → Add Redirect → Save Changes).

## Étape 6 — Redéployer avec les variables

Après avoir ajouté les variables (étape 5), retourne dans ton terminal et tape :

```
vercel --prod
```

Ça republie le site avec les bonnes variables actives.

## Étape 7 — Première connexion

Ouvre `https://TON-PROJET.vercel.app`, connecte-toi avec Discord. Comme avant,
un bandeau "Initialisation" apparaît pour définir le rôle admin (sauf pour le
compte `580864657368154134` qui est admin automatiquement, quoi qu'il arrive).

## Pour mettre à jour le site plus tard

Modifie les fichiers, puis dans le dossier du projet :

```
vercel --prod
```
