# Nexus Forge - Discord Bot

Bot Discord V1 pour :

- diffuser les news produit
- annoncer les sorties Android / iOS
- alerter le staff lorsqu un compte est en attente de validation

## Installation

```bash
cd discord-bot
npm install
cp .env.example .env
```

## Variables a renseigner

- `DISCORD_BOT_TOKEN`
- `DISCORD_BOT_SHARED_SECRET`
- `DISCORD_DASHBOARD_SESSION_SECRET`
- `DISCORD_OAUTH_CLIENT_ID`
- `DISCORD_OAUTH_CLIENT_SECRET`
- `DISCORD_OAUTH_REDIRECT_URI`
- `NEXUSFORGE_API_BASE_URL`
- `NEXUSFORGE_APP_BASE_URL`
- `DISCORD_OWNER_USER_IDS`
- `DISCORD_NEWS_CHANNEL_IDS`
- `DISCORD_STAFF_CHANNEL_IDS`
- `DISCORD_STAFF_USER_IDS` optionnel

## Demarrage

```bash
cd discord-bot
node --env-file=.env src/index.js
```

Ou :

```bash
cd discord-bot
npm run start
```

si l environnement est deja exporte dans le shell.

## Fonctionnement

Le bot interroge l endpoint backend securise :

- `GET /api/integrations/discord/events`

avec le header :

- `x-discord-bot-secret`

Le backend y pousse actuellement les evenements :

- `news.published`
- `release.published`
- `user.pending_validation`

## Publication manuelle d une release

Le backend expose aussi :

- `POST /api/admin/integrations/discord/releases`

pour injecter une annonce Android / iOS vers le bot.

## Etat local

Le bot memorise son dernier evenement traite dans :

- `DISCORD_BOT_STATE_FILE`

afin d eviter les doublons au redemarrage.

## Compatibilite cPanel / Passenger

Le bot ouvre aussi un petit endpoint HTTP sur le `PORT` fourni par l hebergement.

Par defaut :

- `/health` expose le statut public minimal
- `/` affiche un tableau de bord HTML protege par connexion Discord
- `/status.json` expose le meme etat en JSON, egalement protege

Le tableau de bord permet maintenant :

- une connexion Discord via OAuth2
- une configuration par serveur Discord pour choisir le salon de news
- une configuration `owner only` pour les alertes staff globales

Pour une app Node cPanel :

- startup file recommande : `app.js`
- application root : le dossier `discord-bot`
