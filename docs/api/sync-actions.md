# API Sync - `/api/sync/actions`

Ce document décrit le contrat API attendu pour la synchronisation des actions offline-first.
Pour les endpoints backend déjà implémentés côté MVP, voir aussi [`backend-mvp.md`](./backend-mvp.md).

---

## Endpoint

- `POST /api/sync/actions`

---

## Requête

### Body JSON

```json
{
  "id": "8f24f722-2e5c-4b2b-b194-a2333c9a8d89",
  "entityType": "character",
  "entityId": "character-1",
  "actionType": "update",
  "payload": {
    "fieldId": "pv",
    "value": 17
  },
  "createdAt": "2026-03-09T13:45:12.234Z"
}
```

### Champs

- `id` : identifiant unique local de l'action.
- `entityType` : `system | character | session | note | message | document`.
- `entityId` : identifiant métier de l'entité concernée.
- `actionType` : `create | update | delete`.
- `payload` : contenu métier de l'action.
- `createdAt` : horodatage ISO de création locale.

---

## Réponses

### 1. Action acceptée

Code actuellement retourne par le backend MVP :

- `200` avec body

Body possible:

```json
{
  "status": "accepted"
}
```

### 2. Conflit détecté

Code actuellement retourne par le backend MVP :

- `200`

Body:

```json
{
  "status": "conflict",
  "reason": "Version serveur plus recente sur certains champs.",
  "conflictFields": ["value", "updatedAt"],
  "conflictServerValues": {
    "value": 15,
    "updatedAt": "2026-03-09T13:46:01.100Z"
  }
}
```

### 3. Action rejetée

Code actuellement retourne par le backend MVP :

- `200`

Body:

```json
{
  "status": "rejected",
  "reason": "Action non autorisee pour ce role."
}
```

---

## Semantique frontend actuelle

Le frontend traite les réponses comme suit:

- `accepted` -> action locale `synced`.
- `conflict` -> action locale `conflict` + affichage UI de résolution champ-à-champ.
- `rejected` -> action locale `failed` terminale (pas de retry automatique).

---

## Notes d'implémentation backend

- Le backend MVP actuel renvoie le resultat metier dans `status`, pas dans le code HTTP.
- Les conflits doivent renvoyer des champs exploitables côté UI (`conflictFields`).
- Les valeurs serveur peuvent être partielles (`conflictServerValues`) si toutes les valeurs ne sont pas disponibles.
- L idempotence sur `id` reste une cible souhaitable pour la suite mobile/offline, mais n est pas encore pleinement implémentee dans ce MVP.
