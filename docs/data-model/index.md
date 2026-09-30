# Modele de donnees - Nexus Forge

Ce dossier contient les principaux schemas JSON utilises par Nexus Forge.
Ils servent de base a la persistance locale, a la synchronisation et aux contrats backend.

## Vocabulaire

Le modele technique conserve encore le terme `session` dans plusieurs schemas et champs :

- `session.schema.json`
- `sessionId`
- `sessionState`

Dans l interface utilisateur, ces memes concepts sont maintenant affiches comme des `parties`.

Exemples :

- `session.schema.json` represente une partie
- `message.sessionId` est l identifiant technique de la partie
- `character.sessionState` est l etat de la fiche dans la partie courante

## Liste des schemas

### `system.schema.json`

Represente un systeme de jeu generique.

- Identite : `id`, `name`, `version`, `author`, `tags`, `visibility`
- Briques de regles :
  - `attributes` : caracteristiques de base
  - `resources` : ressources
  - `skills` : competences, dons, capacites
- Fiches :
  - `characterTemplates` : templates PJ, PNJ, creatures
- Jets et regles :
  - `rollDefinitions`
  - `scripts`
  - `hooks`
- Parametres globaux dans `settings`

### `character.schema.json`

Represente une fiche de personnage.

- Liens :
  - `systemId`
  - `templateId`
  - `ownerUserId`
- Donnees de jeu :
  - `attributes`
  - `resources`
  - `skills`
  - `inventory`
  - `customFields`
- Notes et visibilite :
  - `playerPrivateNotes`
  - `gmPrivateNotes`
  - `visibility`
- Etat de partie :
  - `sessionState` : initiative, conditions, etc.
- Sync :
  - `sync`

### `session.schema.json`

Represente une partie au niveau technique.

- Metadonnees :
  - `systemId`, `campaignId`, `name`, `description`, `gmUserId`, `state`
- Parametres :
  - `settings` : options de partie
- Participants :
  - `participants` : utilisateurs, roles, fiches liees
- Ecrans :
  - `screens` : instances runtime d ecrans
- Initiative :
  - `initiative`
- Groupes :
  - `groups`
- Communication :
  - `communication`
- Documents :
  - `documents`
- Historique :
  - `log`
- Sync :
  - `sync`

### `message.schema.json`

Represente un message de chat.

- Contexte :
  - `sessionId`, `channelType`, `channelId`
- Participants :
  - `fromUserId`, `toUserIds`, `groupId`, `isPrivateToGM`
- Contenu :
  - `kind`
  - `content`
  - `attachments`
  - `rollResult`
- UI :
  - `ui`
- Etat :
  - `readByUserIds`, `deletedForUserIds`
- Sync :
  - `sync`

### `note.schema.json`

Represente une note liee a une campagne, une partie, un personnage ou une autre ressource.

- Contexte :
  - `scope` : `campaign`, `session`, `character`, `npc`, `location`, `item`, `other`
  - `scopeRefId`
- Type :
  - `type` : `player_private`, `gm_private`, `public`
- Contenu :
  - `title`, `content`, `tags`
- Propriete / visibilite :
  - `createdByUserId`, `ownerUserId`, `visibility`
- Sync :
  - `sync`

### `document.schema.json`

Represente un document generique.

- Identite :
  - `id`, `type`, `title`, `description`
- Liens :
  - `ownerUserId`, `createdByUserId`
  - `fileUrl`, `thumbnailUrl`
  - `linkedEntity`
- Visibilite :
  - `visibility`
- Sync :
  - `sync`

### `userDevice.schema.json`

Represente un device utilisateur pour la synchronisation et les capacites runtime.

- Identite :
  - `id`, `userId`, `deviceType`, `name`
- Infos runtime :
  - `lastSeenAt`, `lastIp`
  - `capabilities`
- Sync :
  - `sync`

## Usage des schemas

- Cote frontend :
  - reference pour la structure des objets en base locale
  - validation import/export JSON
- Cote backend :
  - definition des modeles de stockage et contrats d API
- Cote utilisateur avance :
  - comprendre comment sont structures les systemes, fiches, parties et documents
  - faciliter la creation d outils autour de Nexus Forge
