# NexusForge Backend

Backend Node.js/Express connecté au frontend NexusForge.

## Prérequis

- Node.js 20+

## Installation

```bash
cd backend
npm install
cp .env.example .env
npm start
```

## Variables d'environnement clés

- `PORT` (default `4000`)
- `CORS_ORIGIN` (ex: `https://nexusforge.en-ligne.fr`)
- `APP_BASE_URL` (URL frontend, utilisée dans les emails)
- `API_BASE_URL` (URL API publique)
- `DISCORD_BOT_SHARED_SECRET` (secret partagé pour le bot Discord)
- `BACKUP_TRIGGER_SECRET` (secret partagé pour déclencher un backup via URL)
- `BACKUP_REMOTE_HOST`
- `BACKUP_REMOTE_USER`
- `BACKUP_REMOTE_DIR`
- `BACKUP_SSH_KEY`
- `DISCORD_OAUTH_CLIENT_ID`
- `DISCORD_OAUTH_CLIENT_SECRET`
- `DISCORD_OAUTH_REDIRECT_URI`
- `ENABLE_DEMO_SEED` (`false` recommandé en prod)
- `DATA_DIR` / `DATA_FILE` (persistance JSON backend)
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `ROOT_ADMIN_*` (compte admin protégé)
- `ROOT_ADMIN_TOTP_SECRET` (optionnel, force le 2FA TOTP du root admin)
- `SMTP_*` (envoi des emails vérification/réinit)

## Auth & sécurité implémentés

- Inscription: nom, prénom, nickname, email, mot de passe
- Validation email via token
- Approbation admin obligatoire avant accès
- Login JWT access + refresh
- Verrouillage progressif après échecs: 15m, 30m, 1h
- Mot de passe oublié / reset
- Changement de mot de passe connecté
- 2FA TOTP optionnel (fortement recommandé)
- Compte `ROOT_ADMIN` protégé (non rétrogradable/supprimable)
- Si `ROOT_ADMIN_TOTP_SECRET` est défini (BASE32), le 2FA du root admin est forcé et ne peut pas être désactivé via API.
- Persistance locale JSON (`DATA_FILE`) + sauvegarde automatique après modifications.

## Sauvegarde déploiement O2switch (recommandé)

Le runbook de déploiement/backup production est maintenu en scripts privés hors dépôt.
Règles minimales:

- backup de `backend/data/state.json` avant chaque déploiement,
- récupération du backup en local hors git,
- déploiement backend sans écraser `data/` et `.env`,
- redémarrage contrôlé de l'app Node.

## Endpoints principaux

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/resend-verification`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/change-password`
- `POST /api/auth/totp/setup`
- `POST /api/auth/totp/enable`
- `POST /api/auth/totp/disable`
- `GET /api/admin/users/pending`
- `POST /api/admin/users/:userId/approve`
- `POST /api/admin/integrations/discord/releases`
- `GET /api/integrations/discord/events` (secret bot requis)
- `GET /api/internal/ops/backup` (secret backup requis)
- `POST /api/auth/discord/link/start`
- `POST /api/auth/discord/link/callback`
- `DELETE /api/auth/discord/link`

Les endpoints sessions/systems/sync du MVP restent disponibles.
