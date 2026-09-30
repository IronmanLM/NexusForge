# API - Nexus Forge

- Backend MVP (endpoints existants): [`backend-mvp.md`](./backend-mvp.md)
- Sync offline-first: [`sync-actions.md`](./sync-actions.md)
- Deploiement + backup production: procedure privee hors depot

## Vocabulaire

Dans la documentation technique backend et data-model, le terme interne `session` reste utilise
pour les schemas, les champs et les routes API existantes.

Dans l interface utilisateur et la documentation fonctionnelle, ce meme concept est maintenant
presente comme une `partie`.

Exemples :

- `GET /api/sessions` -> liste des parties cote interface
- `sessionId` -> identifiant technique de la partie
- `session.schema.json` -> schema interne d une partie

## Couverture actuelle cote frontend

- Auth reelle backend (inscription, validation email, approbation admin, login JWT, reset password, 2FA TOTP)
- Routes protegees + espace admin pour valider les comptes
- Parties locales + binding du `systemId` technique de session
- Administration des parties : creation, archivage/restauration, suppression definitive (owner/admin), proprietaire + multi-MJ
- Systemes de jeu :
  - listing des systemes disponibles pour l utilisateur
  - creation (vierge ou depuis template)
  - duplication (fork)
  - mise a jour avec controle proprietaire/admin
  - schema studio visuel persiste (`studioSchemaV2`)
  - metadonnees de fork (`forkedFromSystemId`, `forkedFromSystemName`)
- Personnages de partie :
  - creation MJ depuis une vue de fiche
  - creation joueur depuis une vue autorisee
  - duplication d un pre-tire vers un joueur
  - mise a jour du rattachement joueur <-> fiche
  - sauvegarde de `sheet.fields` et `runtimeValues`
- Social :
  - recherche utilisateur
  - relations sociales
  - conversations directes
  - messages directs
- Outils :
  - conversion `html`, `html_enriched` et `pdf` vers `system draft`
- Ressources :
  - bibliotheque compte / systeme / partie
  - dossiers logiques
  - publication d un fichier vers une partie
- Studio Ecrans :
  - templates d ecran compte ou systeme
  - affectation par role au niveau d une partie
- Admin :
  - validation des comptes en attente
  - metriques d usage systemes (`GET /api/admin/systems/usage`)
  - suppression systeme avec migration des parties (`DELETE /api/admin/systems/{id}`)
  - publication d une release Discord (`POST /api/admin/integrations/discord/releases`)
- Integrations :
  - file d evenements pour bot Discord (`GET /api/integrations/discord/events`, secret requis)
- Sync des actions locales via `/api/sync/actions` (mode HTTP, statut retourne dans le body)

## Preparation offline mobile

Pour la suite tablette / telephone offline-first, les briques deja disponibles cote API sont :

- chargement initial de la partie via `GET /api/sessions/:sessionId`
- chargement des personnages via `GET /api/sessions/:sessionId/characters`
- chargement des notes, messages et ressources de partie
- chargement des templates d ecran actifs
- endpoint de resynchronisation `POST /api/sync/actions`

La prochaine etape projet est donc surtout une question de strategie frontend locale :

- cache local des donnees de partie
- file d actions offline
- rejeu HTTP vers `/api/sync/actions`
- resolution des conflits puis resynchronisation au retour en ligne
