# API Backend MVP

Ce document décrit l'API backend actuellement implémentée pour NexusForge (MVP en mémoire, sans base persistante).

## 1. Scope MVP

- Auth JWT (access + refresh)
- Sessions de jeu et participants
- Chat par session (channels + messages)
- Personnages (CRUD)
- Vue de fiche générique `CharacterSheetView`
- WebSocket pour diffusion des nouveaux messages

## 2. Base URL et format

- Base URL REST: `/api`
- Healthcheck: `GET /health`
- Content-Type attendu: `application/json`

### 2.1. Auth JWT

Tous les endpoints `/api/*` (sauf `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`) exigent:

```http
Authorization: Bearer <accessToken>
```

Le `currentUser` est résolu depuis le token (`sub`, `email`, `displayName`).

### 2.2. Format d'erreur standard

Toutes les erreurs backend suivent ce format:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable",
    "details": {}
  }
}
```

- `code`: stable, technique, `SCREAMING_SNAKE_CASE`
- `message`: texte lisible
- `details`: optionnel

Exemples de codes utilisés:

- `UNAUTHENTICATED`
- `INVALID_CREDENTIALS`
- `EMAIL_ALREADY_REGISTERED`
- `REFRESH_TOKEN_REVOKED`
- `SESSION_NOT_FOUND`
- `SESSION_ACCESS_FORBIDDEN`
- `SESSION_JOIN_CODE_INVALID`
- `CHANNEL_NOT_FOUND`
- `CHANNEL_ACCESS_FORBIDDEN`
- `INVALID_MESSAGE_PAYLOAD`
- `MESSAGE_NOT_FOUND`
- `CHARACTER_NOT_FOUND`
- `CHARACTER_ACCESS_FORBIDDEN`
- `INVALID_CHARACTER_PAYLOAD`
- `INVALID_CHARACTER_PATCH_PAYLOAD`

## 3. Auth

### 3.1. POST `/api/auth/register`

Crée un utilisateur et renvoie les tokens.

Body:

```json
{
  "email": "user@example.com",
  "password": "demo123",
  "displayName": "Elias"
}
```

Réponse `201`:

```json
{
  "token": "<accessToken>",
  "refreshToken": "<refreshToken>",
  "user": {
    "id": "user_x",
    "email": "user@example.com",
    "displayName": "Elias",
    "roles": ["player"],
    "createdAt": "2026-03-08T23:00:00.000Z"
  }
}
```

### 3.2. POST `/api/auth/login`

Body:

```json
{
  "email": "user@example.com",
  "password": "demo123"
}
```

Réponse `200`: même format que `register`.

### 3.3. POST `/api/auth/refresh`

Body:

```json
{
  "refreshToken": "<refreshToken>"
}
```

Réponse `200`:

```json
{
  "token": "<newAccessToken>",
  "refreshToken": "<newRefreshToken>"
}
```

### 3.4. GET `/api/auth/me`

Auth requise. Retourne l'utilisateur courant.

Réponse `200`:

```json
{
  "user": {
    "id": "user_x",
    "email": "user@example.com",
    "displayName": "Elias",
    "roles": ["player"],
    "createdAt": "2026-03-08T23:00:00.000Z"
  }
}
```

### 3.5. GET `/api/auth/introspect`

Auth requise. Endpoint de debug pour vérifier le token en cours.

Réponse `200`:

```json
{
  "valid": true,
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "displayName": "Elias"
  },
  "token": {
    "exp": 1719931200,
    "iat": 1719930000
  }
}
```

Si token invalide/expiré: `401` + erreur standard `UNAUTHENTICATED`.

### 3.6. POST `/api/auth/logout`

Auth requise. Révoque le token d'accès courant. Peut aussi révoquer un refresh token si fourni.

Body optionnel:

```json
{
  "refreshToken": "<refreshToken>"
}
```

Réponse `204`.

## 4. Sessions

## 4.1. Modèle Session

```json
{
  "id": "session-1",
  "name": "Campagne SteamShadows du mardi",
  "systemId": "steamshadows",
  "ownerUserId": "user-gm-1",
  "gmUserId": "user-gm-1",
  "status": "active",
  "description": "Session demo backend",
  "invitationCode": "ABCD1234",
  "createdAt": "2026-03-08T23:00:00.000Z",
  "updatedAt": "2026-03-08T23:00:00.000Z",
  "players": [
    {
      "userId": "user-player-1",
      "characterId": "char_42",
      "role": "player"
    }
  ]
}
```

### 4.2. GET `/api/sessions`

Liste les sessions accessibles.

Query optionnelle:

- `role=gm|player|observer`
- `status=draft|active|finished|archived`

Réponse `200`:

```json
{
  "items": []
}
```

### 4.3. POST `/api/sessions`

Body:

```json
{
  "name": "Nouvelle session",
  "systemId": "steamshadows",
  "description": "Optionnel"
}
```

Réponse `201`:

```json
{
  "session": {}
}
```

### 4.4. GET `/api/sessions/{sessionId}`

Réponse `200`:

```json
{
  "session": {}
}
```

Erreurs possibles:

- `404 SESSION_NOT_FOUND`
- `403 SESSION_ACCESS_FORBIDDEN`

### 4.5. POST `/api/sessions/join`

Body:

```json
{
  "code": "ABCD1234"
}
```

Réponse `200`:

```json
{
  "session": {}
}
```

Erreurs possibles:

- `400 SESSION_JOIN_CODE_INVALID`
- `403 SESSION_JOIN_FORBIDDEN`

### 4.6. PUT `/api/sessions/{sessionId}/me`

Met à jour le `characterId` du `currentUser` dans `players`.

Body:

```json
{
  "characterId": "char_42"
}
```

Réponse `200`:

```json
{
  "session": {}
}
```

### 4.7. POST `/api/sessions/{sessionId}/leave`

Réponse `204`.

Règle MVP: le owner/gm ne peut pas quitter (`SESSION_LEAVE_FORBIDDEN`).

### 4.8. PATCH `/api/sessions/{sessionId}`

Réservé GM/owner.

Body partiel possible:

```json
{
  "name": "Nouveau nom",
  "status": "active",
  "description": "Optionnel"
}
```

Réponse `200`:

```json
{
  "session": {}
}
```

### 4.9. DELETE `/api/sessions/{sessionId}`

Réservé GM/owner.

Réponse `204`.

## 5. Channels et messages

### 5.1. GET `/api/sessions/{sessionId}/channels`

Renvoie les channels visibles par l'utilisateur.

Réponse `200`:

```json
{
  "items": []
}
```

### 5.2. Modèle Message

```json
{
  "id": "msg_123",
  "sessionId": "session-1",
  "channelId": "session-1-channel-global",
  "channelType": "global",
  "fromUserId": "user-player-1",
  "toUserIds": ["user-gm-1"],
  "groupId": "session-1-channel-group-a",
  "content": "Texte du message",
  "kind": "text",
  "isPrivateToGM": false,
  "systemType": "turn",
  "createdAt": "2026-03-08T23:00:00.000Z",
  "roll": {
    "label": "Jet d'Athletisme",
    "formula": "1d20+5",
    "dice": [{ "faces": 20, "value": 12 }],
    "modifier": 5,
    "total": 17,
    "isSuccess": true,
    "target": 15
  }
}
```

Types supportés:

- `channelType`: `global | group | direct | system`
- `kind`: `text | roll | document | mixed`
- `systemType`: `turn | round | combat_start | combat_end`

### 5.3. GET `/api/sessions/{sessionId}/messages`

Query optionnelles:

- `channelId` (si absent, canal global)
- `before` (date ISO)
- `after` (date ISO)
- `limit` (défaut 50, max 200)

Réponse `200`:

```json
{
  "items": [],
  "nextCursor": "2026-03-08T23:00:00.000Z"
}
```

Filtrage de visibilité (MVP):

- `global`: tous les membres
- `system`: tous les membres
- `group`: membres du channel
- `direct`: auteur + `toUserIds` + MJ
- `isPrivateToGM = true`: MJ et auteur uniquement

### 5.4. POST `/api/sessions/{sessionId}/messages`

Body:

```json
{
  "channelId": "session-1-channel-global",
  "channelType": "global",
  "toUserIds": ["user-player-2"],
  "groupId": "session-1-channel-group-a",
  "content": "texte",
  "kind": "text",
  "isPrivateToGM": false,
  "systemType": "turn",
  "roll": {
    "label": "Jet d'Athletisme",
    "formula": "1d20+5",
    "total": 17
  }
}
```

Règles MVP:

- `fromUserId` vient du token, jamais du client
- `channelType=system` réservé au GM, forcé sur canal global
- `kind=roll` accepte `roll` côté client (stocké tel quel)
- `isPrivateToGM=true` force l'ajout du `gmUserId` dans `toUserIds`

Réponse `201`:

```json
{
  "message": {}
}
```

### 5.5. DELETE `/api/sessions/{sessionId}/messages/{messageId}`

Autorisé si:

- GM de session
- ou auteur du message

Réponse `204`.

## 6. Characters

### 6.1. Modèle Character

```json
{
  "id": "char_42",
  "userId": "user-player-1",
  "systemId": "steamshadows",
  "name": "Elias Crow",
  "portraitUrl": "https://...",
  "createdAt": "2026-03-08T23:00:00.000Z",
  "updatedAt": "2026-03-08T23:00:00.000Z",
  "data": {}
}
```

### 6.2. GET `/api/characters`

Query optionnelle: `systemId=steamshadows`

Réponse `200`:

```json
{
  "items": []
}
```

### 6.3. POST `/api/characters`

Body:

```json
{
  "systemId": "steamshadows",
  "name": "Elias Crow",
  "portraitUrl": "https://...",
  "data": {}
}
```

Réponse `201`:

```json
{
  "character": {}
}
```

### 6.4. GET `/api/characters/{characterId}`

Réponse `200`:

```json
{
  "character": {}
}
```

### 6.5. PATCH `/api/characters/{characterId}`

Body partiel:

```json
{
  "name": "Nouveau nom",
  "portraitUrl": "https://...",
  "data": {}
}
```

Réponse `200`:

```json
{
  "character": {}
}
```

### 6.6. DELETE `/api/characters/{characterId}`

Réponse `204`.

## 7. Character sheet view (session scope)

### 7.1. Modèle CharacterSheetView

```json
{
  "id": "char_42",
  "name": "Elias Crow",
  "portraitUrl": "https://...",
  "groups": [
    { "id": "valeurs_secondaires", "label": "Valeurs secondaires", "layout": "grid" }
  ],
  "fields": [
    {
      "id": "pv",
      "label": "Points de vie",
      "type": "resource",
      "value": 18,
      "max": 24,
      "groupId": "valeurs_secondaires",
      "isPrimary": true
    }
  ],
  "actions": [
    {
      "id": "attaque_corps_a_corps",
      "label": "Attaque CaC",
      "description": "Jet d'attaque au corps a corps",
      "rollFormula": "1d20+5"
    }
  ]
}
```

### 7.2. GET `/api/sessions/{sessionId}/characters/{characterId}/sheet`

Réponse `200`:

```json
{
  "sheet": {}
}
```

### 7.3. PATCH `/api/sessions/{sessionId}/characters/{characterId}`

Patch brut (`dataPatch`) réservé GM.

Body:

```json
{
  "dataPatch": {
    "secondary.pv.current": 16,
    "secondary.equilibre.current": 7
  }
}
```

Réponse `200`:

```json
{
  "sheet": {}
}
```

### 7.4. PATCH `/api/sessions/{sessionId}/characters/{characterId}/sheet`

Patch orienté fields.

Body:

```json
{
  "fields": [
    { "id": "pv", "value": 16 },
    { "id": "equilibre", "value": 7 }
  ]
}
```

Réponse `200`:

```json
{
  "sheet": {}
}
```

Règles MVP SteamShadows:

- GM: peut modifier tous les champs mappés
- Player: peut modifier `pv`, `equilibre`, `fortune` uniquement

## 8. WebSocket

- URL: `ws://localhost:4000/ws/sessions/{sessionId}`
- Auth: `?token=<accessToken>` ou header `Authorization: Bearer <accessToken>`

À la connexion valide:

```json
{
  "type": "ws.connected",
  "payload": {
    "sessionId": "session-1",
    "userId": "user-player-1"
  }
}
```

Événement diffusé à la création d'un message:

```json
{
  "type": "chat.message.created",
  "payload": {
    "message": {}
  }
}
```

Le serveur n'envoie l'event qu'aux clients qui ont le droit de voir le message.

## 9. Notes importantes pour contributeurs

- Backend 100% en mémoire (`backend/src/data/store.js`), reset à chaque restart.
- Pas de migration DB ni persistance dans ce MVP.
- Contrats API décrits ici doivent rester alignés avec:
  - `backend/src/routes/*.js`
  - `backend/src/middleware/auth.js`
  - `backend/src/utils/errors.js`
- Toute nouvelle route doit utiliser le format d'erreur standard.
