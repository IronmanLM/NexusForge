# API Backend MVP

Document de référence pour l'API backend actuellement implémentée dans `backend/src/server.js`.

## Vocabulaire

Dans cette page technique, `session` reste le terme d API et de stockage.
Cote interface utilisateur, ces memes donnees sont presentees comme une `partie`.

## Base URL et format

- Base REST: `/api`
- Healthcheck: `GET /health`
- JSON `application/json`
- Auth Bearer requise sur tous les endpoints `/api/*` sauf endpoints auth publics.

Format d'erreur standard:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable",
    "details": {}
  }
}
```

## Persistance backend

Le backend persiste son état en JSON (`DATA_FILE`, par défaut `backend/data/state.json`):

- users, sessions, systems, characters, resources, notes, messages, screenTemplates, homeNews, announcements,
- tokens de session/verification/reset/2FA.

En production:

- sauvegarder `DATA_FILE` avant chaque déploiement.

## Auth publique

### `POST /api/auth/register`

Crée un compte en état `pending`.

Body:

```json
{
  "firstName": "Mikael",
  "lastName": "Fremaux",
  "nickname": "IronmanLM",
  "email": "ironmanlm@en-ligne.fr",
  "password": "MotDePasseLong"
}
```

Réponse `201`:

```json
{
  "status": "pending_email_verification",
  "message": "Account created. Verify your email, then wait for admin approval."
}
```

### `POST /api/auth/resend-verification`

Body: `{ "email": "user@example.com" }`

### `POST /api/auth/verify-email`

Body: `{ "token": "..." }`

Réponse `200`:

```json
{
  "status": "verified",
  "approvalStatus": "pending"
}
```

### `GET /api/auth/verify-email?token=...`

Même effet que la version POST.

### `POST /api/auth/login`

Body minimal:

```json
{
  "email": "user@example.com",
  "password": "MotDePasse"
}
```

Cas standard `200`:

```json
{
  "token": "...",
  "refreshToken": "...",
  "user": {
    "id": "user-...",
    "displayName": "Nick (Prenom Nom)",
    "email": "user@example.com",
    "roles": ["player"],
    "isEmailVerified": true,
    "approvalStatus": "approved",
    "isActive": true,
    "hasTotpEnabled": false,
    "isProtectedRootAdmin": false,
    "createdAt": "2026-03-09T00:00:00.000Z"
  }
}
```

Cas 2FA requis `200`:

```json
{
  "requiresTwoFactor": true,
  "challengeToken": "...",
  "methods": ["totp"]
}
```

Finalisation 2FA: renvoyer `POST /api/auth/login` avec:

```json
{
  "email": "user@example.com",
  "password": "MotDePasse",
  "challengeToken": "...",
  "totpCode": "123456"
}
```

### `POST /api/auth/refresh`

Body: `{ "refreshToken": "..." }`

### `POST /api/auth/forgot-password`

Body: `{ "email": "user@example.com" }`

### `POST /api/auth/reset-password`

Body:

```json
{
  "token": "...",
  "password": "NouveauMotDePasseLong"
}
```

## Auth privée (Bearer)

### `GET /api/auth/me`

Retourne `user` courant.

### `PATCH /api/auth/me`

Met a jour le profil utilisateur courant.

Body:

```json
{
  "firstName": "Mikael",
  "lastName": "Fremaux",
  "nickname": "IronmanLM",
  "avatarResourceId": "resource-...",
  "avatarUrl": "https://..."
}
```

Notes:

- `firstName`, `lastName` et `nickname` sont requis.
- `nickname` doit etre unique dans toute l application.
- `nickname` accepte uniquement lettres, chiffres et underscore.
- `avatarResourceId` permet d utiliser une image deja chargee dans la bibliotheque.
- `avatarUrl` sert de fallback manuel si aucune ressource n est liee.

## Accueil connecte

### `GET /api/home/stats`

Retourne :

```json
{
  "stats": {
    "runningSessions": 2,
    "activePlayers": 12,
    "activeGms": 4,
    "systemsCount": 7,
    "approvedUsers": 16
  }
}
```

### `GET /api/home/news`

Liste les news visibles pour l utilisateur courant.

### `POST /api/home/news`

Admin uniquement.

Body :

```json
{
  "title": "Maintenance",
  "content": "Le site sera mis a jour ce soir.",
  "isPinned": true,
  "isPublished": true
}
```

### `PATCH /api/home/news/:newsId`

Admin uniquement.

Permet de modifier :

- `title`
- `content`
- `isPinned`
- `isPublished`

### `DELETE /api/home/news/:newsId`

Admin uniquement.

### `GET /api/home/announcements`

Liste les annonces visibles :

- annonces `open`
- annonces de l utilisateur courant
- annonces visibles par admin

### `POST /api/home/announcements`

Body :

```json
{
  "type": "gm_looking_for_players",
  "systemId": "sys-...",
  "systemName": "",
  "language": "fr",
  "playMode": "online",
  "playerSlotsWanted": 3,
  "daysOfWeek": ["tuesday", "friday"],
  "timeSlots": ["evening"],
  "periodicity": "weekly",
  "status": "open",
}
```

Types :

- `player_looking_for_game`
- `gm_looking_for_players`

Modes :

- `online`
- `onsite`
- `hybrid`

Jours :

- `monday`
- `tuesday`
- `wednesday`
- `thursday`
- `friday`
- `saturday`
- `sunday`

Creneaux :

- `morning`
- `midday`
- `afternoon`
- `late_afternoon`
- `evening`

Periodicites :

- `one_shot`
- `weekly`
- `biweekly`
- `monthly`
- `irregular`

Le backend genere automatiquement `summary`.

### `PATCH /api/home/announcements/:announcementId`

Auteur de l annonce ou admin uniquement.

Permet de modifier par exemple :

- `status`
- `language`
- `playMode`
- `playerSlotsWanted`
- `daysOfWeek`
- `timeSlots`
- `periodicity`

### `DELETE /api/home/announcements/:announcementId`

Auteur de l annonce ou admin uniquement.

## Couche sociale

### `GET /api/social/users?q=...`

Recherche d utilisateurs actifs et approuves pour :

- demarrer une conversation
- envoyer une demande d ami
- ignorer
- signaler

Les utilisateurs ignores (dans un sens ou dans l autre) sont exclus des resultats.

### `GET /api/social/users/:userId`

Retourne un utilisateur social unique, pratique pour ouvrir directement une conversation depuis une annonce ou un lien profond.

### `GET /api/social/relations`

Retourne :

- `friends`
- `incomingRequests`
- `outgoingRequests`
- `ignored`

### `POST /api/social/friend-requests`

Body :

```json
{
  "targetUserId": "user-..."
}
```

### `POST /api/social/friend-requests/:requestId/accept`

Accepte une demande d ami recue.

### `DELETE /api/social/friend-requests/:requestId`

Annule ou refuse une demande d ami.

### `POST /api/social/ignore`

Body :

```json
{
  "targetUserId": "user-..."
}
```

### `DELETE /api/social/ignore/:targetUserId`

Retire un utilisateur de la liste d ignores.

### `POST /api/social/reports`

Body :

```json
{
  "targetUserId": "user-...",
  "reason": "Comportement abusif",
  "details": "Details optionnels"
}
```

### `GET /api/admin/social/reports`

Admin uniquement.

Liste tous les signalements.

### `PATCH /api/admin/social/reports/:reportId`

Admin uniquement.

Body :

```json
{
  "status": "reviewing"
}
```

Statuts :

- `open`
- `reviewing`
- `closed`

### `GET /api/social/conversations`

Liste les conversations directes de l utilisateur courant avec :

- dernier message
- date du dernier message
- compteur non lu

### `GET /api/social/conversations/:otherUserId/messages`

Liste les messages d une conversation directe.

### `POST /api/social/conversations/:otherUserId/messages`

Body :

```json
{
  "content": "Bonjour"
}
```

## Parties : messages, notes et structure runtime

Les sessions transportent maintenant aussi :

- `initiative`
- `screenTemplateAssignments`
- `screenTemplateSelections`

Lors de `POST /api/sessions`, si le systeme choisi possede deja des templates d ecran de portee `system`,
la partie recupere automatiquement un template par defaut compatible pour :

- le role `gm`
- le role `player`

Les participants d une session peuvent etre enrichis cote API avec :

- `displayName`
- `nickname`
- `characterId`

Notes :

- `POST /api/sessions` exige maintenant explicitement un `systemId`
- `DELETE /api/sessions/{id}` supprime aussi les donnees runtime de la partie :
  - personnages de partie
  - messages de partie
  - notes de partie
  - ressources de partie
  - dossiers de partie

### `GET /api/sessions/:sessionId/messages`

Liste les messages visibles de la session pour l utilisateur courant.

### `POST /api/sessions/:sessionId/messages`

Cree un message de session.

Body typique :

```json
{
  "channelId": "session-...-channel-global",
  "channelType": "global",
  "content": "Bonjour",
  "toUserIds": [],
  "isPrivateToGM": false
}
```

Notes :

- si `isPrivateToGM=true`, le backend reroute vers les MJ de la session ;
- un MJ/admin peut aussi creer un message `system`.

### `GET /api/sessions/:sessionId/notes`

Liste les notes visibles de la session pour l utilisateur courant.

### `POST /api/sessions/:sessionId/notes`

Cree une note de session.

Body typique :

```json
{
  "type": "public",
  "title": "Resume",
  "content": "Le groupe entre dans la tour."
}
```

Types reserves :

- `public`
- `player_private`
- `gm_private`

### `PATCH /api/sessions/:sessionId/notes/:noteId`

Met a jour une note visible et editable par l utilisateur courant.

### `DELETE /api/sessions/:sessionId/notes/:noteId`

Supprime une note editable par l utilisateur courant.

### `POST /api/auth/logout`

Body optionnel: `{ "refreshToken": "..." }`

### `POST /api/auth/change-password`

Body:

```json
{
  "currentPassword": "...",
  "newPassword": "..."
}
```

### `POST /api/auth/totp/setup`

Réponse `200`:

```json
{
  "secret": "BASE32SECRET",
  "otpauthUrl": "otpauth://totp/...",
  "recommended": true
}
```

### `POST /api/auth/totp/enable`

Body: `{ "code": "123456" }`

### `POST /api/auth/totp/disable`

Body: `{ "code": "123456" }`

Note:

- si le serveur définit `ROOT_ADMIN_TOTP_SECRET`, le compte root admin protégé reçoit `403 ROOT_ADMIN_2FA_FORCED` et ne peut pas désactiver le 2FA.

## Admin

### `GET /api/admin/users/pending`

Liste uniquement les comptes `pending` dont email déjà validé.

### `GET /api/admin/users`

Liste complète des comptes (admin only), avec notamment:

- `roles`
- `isActive`
- `isEmailVerified`
- `approvalStatus`

### `POST /api/admin/users/:userId/approve`

Body:

```json
{
  "roles": ["player"]
}
```

Rôles permis: `player`, `gm`, `admin`.

Règles:

- email doit être validé avant approbation,
- compte root admin protégé non modifiable (`ROOT_ADMIN_PROTECTED`).

### `PATCH /api/admin/users/:userId`

Met à jour un compte (admin only).

Body (au moins un champ):

```json
{
  "roles": ["gm", "player"],
  "isActive": true
}
```

Règles:

- `roles` autorisés: `player`, `gm`, `admin`,
- `isActive=false` bloque la connexion et l'accès API auth,
- root admin protégé: pas de désactivation et pas de rétrogradation.

### `POST /api/admin/users/:userId/unlock`

Déverrouille un compte bloqué après plusieurs échecs de connexion.

Effets:

- `failedLoginCount = 0`
- `lockoutLevel = 0`
- `lockedUntil = null`

### `POST /api/admin/users/:userId/reset-password`

Réinitialise le mot de passe d un compte côté administration.

Body:

```json
{
  "nextPassword": "Hopie920175"
}
```

Règles:

- longueur minimale: 8 caractères
- la réinitialisation efface aussi le verrouillage de connexion

### `DELETE /api/admin/users/:userId`

Supprime un compte utilisateur (admin only), avec réassignation des données pour préserver l'intégrité.

Body optionnel:

```json
{
  "replacementUserId": "user-..."
}
```

### `GET /api/admin/audit/events?limit=200`

Retourne les événements d'audit admin les plus récents (admin only).

- `limit` optionnel, borné entre `1` et `500`, par défaut `100`.

Réponse:

```json
{
  "items": [
    {
      "id": "audit-admin-...",
      "at": "2026-03-11T09:10:00.000Z",
      "actorUserId": "user-admin-root",
      "action": "admin_user_update",
      "targetUserId": "user-...",
      "summary": "Mise à jour du compte ...",
      "metadata": {}
    }
  ]
}
```

Si absent, le backend utilise l'admin courant comme compte de réassignation.

Règles:

- impossible de supprimer le root admin protégé,
- impossible de supprimer son propre compte admin,
- le compte de remplacement doit exister et être différent du compte supprimé.

Réponse:

```json
{
  "status": "deleted",
  "userId": "user-...",
  "replacementUserId": "user-...",
  "migratedSystemsCount": 0,
  "migratedSessionsCount": 0,
  "migratedCharactersCount": 0
}
```

### `GET /api/admin/systems/usage`

Liste des systèmes avec métriques d'usage:

- `usersUsingNow`
- `activeSessionsCount`
- `archivedSessionsCount`
- `totalSessionsCount`
- `lastUsedAt`

### `DELETE /api/admin/systems/:systemId`

Supprime un système (admin uniquement) et migre les parties liées vers un système de remplacement.

Body:

```json
{
  "replacementSystemId": "sys-steamshadows-reference"
}
```

## Templates d ecran

### `POST /api/admin/integrations/discord/releases`

Publie un evenement `release.published` dans la file Discord backend.

Payload minimal :

```json
{
  "title": "Nexus Forge Android 1.0.1",
  "summary": "Mise a jour de stabilisation mobile.",
  "platform": "android",
  "version": "1.0.1",
  "link": "https://play.google.com/apps/testing/fr.enligne.nexusforge"
}
```

### `GET /api/integrations/discord/events`

Endpoint reserve au bot Discord.

- authentification via header `x-discord-bot-secret`
- query optionnelle `after=<eventId>`
- query optionnelle `limit`

Retour :

```json
{
  "items": [
    {
      "id": "discord-event-...",
      "type": "news.published",
      "createdAt": "2026-03-27T12:00:00.000Z",
      "payload": {}
    }
  ]
}
```

### `GET /api/screen-templates`

Liste les templates d ecran visibles par l utilisateur courant.

Filtres supportes :

- `scopeType`
- `scopeRefId`
- `roleTarget`

### `GET /api/screen-templates/:templateId`

Retourne un template d ecran visible par l utilisateur courant.

### `POST /api/screen-templates`

Cree un template d ecran.

Champs principaux :

- `name`
- `description`
- `scopeType` (`account` ou `system`)
- `scopeRefId`
- `roleTarget` (`player`, `gm`, `both`)
- `visibility` (`private`, `public`, `friends`)
- `sets`

### `PATCH /api/screen-templates/:templateId`

Met a jour un template d ecran existant.

### `DELETE /api/screen-templates/:templateId`

Supprime un template d ecran existant.

## Templates d ecran de partie

`PATCH /api/sessions/{id}` accepte aussi :

- `screenTemplateAssignments`
  - `gmTemplateId`
  - `playerTemplateId`
- `screenTemplateSelections`
  - map `userId -> { gmTemplateId?, playerTemplateId? }`

Usage :

- le MJ peut proposer un template de base pour les MJs de la partie ;
- le MJ peut proposer un template de base pour les joueurs ;
- chaque utilisateur peut definir son template actif personnel pour son role dans la partie.

## Ressources / fichiers

Gestionnaire de fichiers avec dossiers logiques, partage structure et verification du contenu a l upload.

Types autorises :

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/gif`
- `application/pdf`
- `text/plain`
- `text/markdown`
- `application/json`
- `video/mp4`

Scopes supportes:

- `account`
- `system`
- `session`

### `GET /api/resources`

Liste les ressources visibles par l utilisateur courant.

Query params optionnels:

- `scopeType`
- `scopeRefId`
- `kind`
- `folderId`

Reponse `200`:

```json
{
  "items": [
    {
      "id": "resource-...",
      "name": "portrait_fergus",
      "originalName": "fergus.png",
      "kind": "image",
      "mimeType": "image/png",
      "sizeBytes": 182345,
      "ownerUserId": "user-...",
      "ownerNickname": "IronmanLM",
      "scopeType": "system",
      "scopeRefId": "sys-...",
      "scopeName": "SteamShadows Core",
      "visibility": "private",
      "sharedWithUserIds": [],
      "folderId": "folder-...",
      "folderName": "Illustrations",
      "sessionAudience": null,
      "sessionMemberUserIds": [],
      "canReshareInSession": true,
      "contentUrl": "/api/resources/resource-.../content",
      "createdAt": "2026-03-13T10:00:00.000Z",
      "updatedAt": "2026-03-13T10:00:00.000Z"
    }
  ]
}
```

### `GET /api/resource-folders`

Liste les dossiers visibles par l utilisateur courant.

Query params optionnels:

- `scopeType`
- `scopeRefId`

### `POST /api/resource-folders`

Cree un dossier logique.

Body:

```json
{
  "name": "Handouts",
  "scopeType": "session",
  "scopeRefId": "session-...",
  "parentFolderId": null,
  "visibilityHint": "all"
}
```

Notes:

- dans une partie, les dossiers par defaut (`Commun`, `MJ uniquement`, dossiers nominatifs) sont maintenus par le backend ;
- les dossiers par defaut ne peuvent pas etre supprimes ou renommes ;
- pour `scopeType=session`, seuls MJ/admin peuvent creer des dossiers personnalises.

### `PATCH /api/resource-folders/:folderId`

Renomme ou deplace un dossier personnalisable.

### `DELETE /api/resource-folders/:folderId`

Supprime un dossier vide non systeme.

### `POST /api/resources`

Cree une ressource et l enregistre sur disque sous `RESOURCE_DIR`.

Body minimal:

```json
{
  "name": "portrait_fergus",
  "originalName": "fergus.png",
  "mimeType": "image/png",
  "scopeType": "system",
  "scopeRefId": "sys-...",
  "visibility": "private",
  "folderId": "folder-...",
  "contentBase64": "iVBORw0KGgoAAA..."
}
```

Partage de partie:

```json
{
  "name": "plan_cache",
  "originalName": "plan-cache.pdf",
  "mimeType": "application/pdf",
  "scopeType": "session",
  "scopeRefId": "session-...",
  "folderId": "folder-session-...-gm",
  "sessionAudience": "session_gm",
  "sessionMemberUserIds": [],
  "canReshareInSession": true,
  "contentBase64": "JVBERi0xLjQK..."
}
```

Notes:

- `contentBase64` est obligatoire ;
- le backend verifie le MIME, l extension et la signature du contenu ;
- pour les images, le backend genere aussi un apercu `.webp` et une miniature `.webp` derives du fichier source ;
- pour `scopeType=session`, un fichier ne peut jamais sortir de la partie ;
- si `sessionAudience=session_member`, `sessionMemberUserIds` doit cibler des membres actuels de la partie ;
- le repartage en partie est autorise par defaut (`canReshareInSession=true`).

Le payload public d une ressource image peut inclure :

- `contentUrl` : fichier source protege ;
- `previewUrl` : apercu derive optimise ;
- `thumbnailUrl` : miniature derivee pour les listes et vignettes.

### `PATCH /api/resources/:resourceId`

Met a jour le nom, le dossier et/ou le partage d une ressource.

Exemples:

```json
{
  "name": "portrait_principal",
  "folderId": "folder-..."
}
```

```json
{
  "visibility": "shared",
  "sharedWithUserIds": ["user-1", "user-2"]
}
```

```json
{
  "sessionAudience": "session_member",
  "sessionMemberUserIds": ["user-player-1"],
  "canReshareInSession": false
}
```

### `POST /api/resources/:resourceId/publish-to-session`

Publie une ressource personnelle dans une partie en creant une copie de session.

Body:

```json
{
  "sessionId": "session-...",
  "folderId": "folder-session-...-common",
  "sessionAudience": "session_all",
  "sessionMemberUserIds": [],
  "canReshareInSession": true
}
```

Notes:

- uniquement le proprietaire (ou un admin) peut publier son fichier personnel ;
- la ressource source reste personnelle ;
- la partie recoit une copie de travail avec ses propres droits de partage.

### `GET /api/resources/:resourceId/content`

Retourne le contenu du fichier si l utilisateur courant a le droit d y acceder.

Headers principaux:

- `Content-Type`
- `Content-Disposition: inline`
- `X-Content-Type-Options: nosniff`

### `DELETE /api/resources/:resourceId`

Supprime la ressource et le fichier associe sur disque.

Permissions:

- proprietaire,
- MJ/admin pour une ressource de partie,
- editor/admin pour une ressource de systeme.

Reponse `204 No Content`.

## Parties, systemes, personnages et sync

Endpoints actuellement disponibles :

- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/{id}`
- `PATCH /api/sessions/{id}`
- `DELETE /api/sessions/{id}`
- `POST /api/sessions/{id}/archive`
- `POST /api/sessions/{id}/restore`
- `POST /api/sessions/{sessionId}/invitations`
- `POST /api/sessions/{sessionId}/invitations/{invitationId}/accept`
- `POST /api/sessions/{sessionId}/invitations/{invitationId}/decline`
- `POST /api/sessions/{sessionId}/invitations/{invitationId}/cancel`
- `POST /api/sessions/{sessionId}/invitations/{invitationId}/resend`
- `GET /api/systems`
- `GET /api/systems/{id}`
- `POST /api/systems`
- `PATCH /api/systems/{id}`
- `POST /api/systems/{id}/duplicate`
- `DELETE /api/admin/systems/{systemId}`
- `GET /api/sessions/{sessionId}/characters`
- `POST /api/sessions/{sessionId}/characters/from-view`
- `POST /api/sessions/{sessionId}/characters/self`
- `POST /api/sessions/{sessionId}/characters/{characterId}/clone`
- `PATCH /api/sessions/{sessionId}/characters/{characterId}`
- `PATCH /api/sessions/{sessionId}/characters/{characterId}/sheet`
- `POST /api/sessions/{sessionId}/characters/{characterId}/remove-from-session`
- `DELETE /api/sessions/{sessionId}/characters/{characterId}`
- `POST /api/sessions/{sessionId}/participants/{userId}/remove`
- `POST /api/tools/system-draft/convert`
- `POST /api/sync/actions`

### Détail des payloads `systems`

`POST /api/systems` accepte notamment:

- `name` (string)
- `description` (string, optionnel)
- `visibility` (`public` | `private` | `friends`)
- `status` (`draft` | `published`)
- `templateFromSystemId` (string, optionnel)
- `rulesProgram` / `rulesPresentation` / `studioSchemaV2` (optionnels)
- `viewerUserIds` / `editorUserIds` (optionnels)

Notes:

- si `templateFromSystemId` est fourni et accessible, le système est créé comme fork avec:
  - `forkedFromSystemId`
  - `forkedFromSystemName`

`PATCH /api/systems/{id}` accepte notamment:

- `name`, `description`, `version`, `visibility`, `status`, `tags`
- `rulesProgram`, `rulesPresentation`, `studioSchemaV2`
- `viewerUserIds`, `editorUserIds`

Regle de publication:

- `status = published` n est accepte que si le systeme contient au moins une vue Studio marquee `isCharacterSheet`
- seuls les systemes `published` avec au moins une fiche personnage peuvent servir a creer une partie

Regles de visibilite:

- `private`: visible uniquement par le proprietaire, admins, editeurs et viewers explicites
- `friends`: visible aussi par les amis du proprietaire
- `public`: visible par tous les comptes connectes

`POST /api/systems/{id}/duplicate` accepte:

- `name` (optionnel)
- `description` (optionnel)

et retourne un système avec fork metadata (`forkedFromSystemId`, `forkedFromSystemName`).

Regles:

- seul un utilisateur `gm` ou `admin` peut faire ce fork
- le système source doit etre `published`

### Détail des payloads `characters`

`POST /api/sessions/{sessionId}/characters/from-view`

- reserve au MJ/admin
- cree une fiche de partie a partir d une vue `isCharacterSheet`
- body principal :
  - `systemId` optionnel
  - `viewId` requis
  - `ownerUserId` optionnel
  - `name` optionnel

`POST /api/sessions/{sessionId}/characters/self`

- reserve a un participant non `observer`
- cree sa propre fiche depuis une vue autorisee pour la creation joueur
- body principal :
  - `systemId` optionnel
  - `viewId` requis
  - `name` optionnel

`POST /api/sessions/{sessionId}/characters/{characterId}/clone`

- reserve au MJ/admin
- duplique un pre-tire existant vers un participant
- body principal :
  - `ownerUserId` requis
  - `name` optionnel

`PATCH /api/sessions/{sessionId}/characters/{characterId}`

- reserve au MJ/admin
- permet notamment :
  - `name`
  - `type`
  - `ownerUserId`

`PATCH /api/sessions/{sessionId}/characters/{characterId}/sheet`

- reserve au proprietaire de la fiche ou au MJ/admin
- body principal :
  - `fields` requis
  - `runtimeValues` optionnel

Ce point est important pour l offline mobile :

- `sheet.fields` conserve la structure de fiche historique
- `runtimeValues` stocke les valeurs runtime du Studio systeme

### Outil de conversion system draft

`POST /api/tools/system-draft/convert`

- reserve aux comptes `gm` ou `admin`
- body principal :
  - `sourceType` : `html` | `html_enriched` | `pdf`
  - `fileName`
  - `contentBase64`

Reponse :

```json
{
  "draft": {
    "format": "nexusforge.system-draft"
  }
}
```

### Sync offline-first

`POST /api/sync/actions`

Dans l implementation actuelle, l endpoint retourne toujours `200` avec un statut metier dans le body :

- `accepted`
- `conflict`
- `rejected`

Exemples :

```json
{ "status": "accepted" }
```

```json
{
  "status": "conflict",
  "reason": "Conflit detecte cote serveur.",
  "conflictFields": ["payload"],
  "conflictServerValues": {}
}
```

```json
{
  "status": "rejected",
  "reason": "Action rejetee cote serveur."
}
```

Le backend MVP ne persiste pas encore une vraie logique serveur de merge.
Il fournit deja en revanche le contrat HTTP que le frontend pourra utiliser pour :

- rejouer une file locale d actions
- marquer une action `accepted`
- ouvrir une resolution de conflit
- marquer une action `failed`

## Codes d'erreur notables

- `INVALID_REGISTRATION_PAYLOAD`
- `EMAIL_ALREADY_REGISTERED`
- `WEAK_PASSWORD`
- `INVALID_CREDENTIALS`
- `EMAIL_NOT_VERIFIED`
- `ACCOUNT_PENDING_APPROVAL`
- `ACCOUNT_LOCKED`
- `INVALID_2FA_CHALLENGE`
- `INVALID_2FA_CODE`
- `INVALID_VERIFICATION_TOKEN`
- `EXPIRED_VERIFICATION_TOKEN`
- `INVALID_RESET_TOKEN`
- `EXPIRED_RESET_TOKEN`
- `ROOT_ADMIN_PROTECTED`
- `INVALID_PROFILE_PAYLOAD`
- `INVALID_NICKNAME`
- `NICKNAME_ALREADY_TAKEN`
- `RESOURCE_CONTENT_REQUIRED`
- `RESOURCE_CONTENT_INVALID`
- `RESOURCE_NOT_FOUND`
- `RESOURCE_FILE_MISSING`
- `RESOURCE_SCOPE_FORBIDDEN`
- `RESOURCE_ACCESS_FORBIDDEN`
- `RESOURCE_DELETE_FORBIDDEN`
