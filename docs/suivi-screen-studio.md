# Suivi du Studio Ecran

## Objectif

Suivre specifiquement la conception et le developpement du Studio Ecran, separement du Studio Systeme.

## Phase actuelle

### Cadrage valide

- Studio distinct du Studio Systeme
- widgets sur grille
- templates lies au compte ou a un systeme
- fork automatique vers le compte lors d'une personnalisation d'un template systeme
- sets par contexte materiel
- ecrans multiples avec detachement
- onglets de widgets sur un meme ecran
- widgets V1 valides

### Presets valides

- PC 1 ecran
- PC 2 ecrans
- PC 3 ecrans
- Tablette
- Telephone mobile

### Densites de grille validees

- 12 colonnes
- 24 colonnes
- 36 colonnes
- 48 colonnes

## Prochaines etapes

1. definir les types frontend/backend du Studio Ecran
2. definir la persistance des templates
3. construire la page catalogue des templates
4. construire le Studio Ecran
5. brancher les widgets V1
6. documenter widget par widget au fur et a mesure

## Avancement technique

- types frontend du Studio Ecran poses
- repository local `screenTemplateRepository` ajoute
- table Dexie `screenTemplates` ajoutee
- backend prepare avec stockage et CRUD des templates d ecran
- aucune compatibilite prevue avec l ancien modele `dashboardProfiles` pour ce nouveau chantier

## Catalogue des templates

- page `/screen-templates` ajoutee
- creation de templates `account` ou `system`
- edition simple du nom, resume, role cible et visibilite
- suppression d un template proprietaire
- creation avec preset initial et densite de grille

## Edition structurelle

- edition des sets dans le catalogue
- ajout / suppression d un set
- ajout / suppression d un ecran
- choix du mode `principal` / `detache`
- ajout / suppression d onglets
- definition de l onglet par defaut
- widgets pas encore placables visuellement dans ce lot

## Studio ecran V1

- route ` /screen-templates/:templateId/studio ` ajoutee
- bouton `Ouvrir le studio` depuis le catalogue
- selection du set, de l ecran et de l onglet actif
- palette des widgets V1
- grille visuelle du canvas
- ajout de widget dans l onglet actif
- deplacement simple par glisser
- redimensionnement simple
- edition des proprietes de position et taille
- sauvegarde du template depuis le studio

## Configuration widget par widget

- panneau droit du studio enrichi avec les proprietes minimales de chaque widget V1
- apercu du canvas plus parlant, base sur la configuration metier du widget selectionne
- source de donnees et options minimales maintenant persistantes dans le template

## Runtime de session

- la page de partie utilise maintenant les templates d ecran V1
- un template de session peut etre assigne pour le role `MJ`
- un template de session peut etre assigne pour le role `Joueur`
- chaque utilisateur peut choisir son template actif pour son role dans la partie
- un joueur peut cloner le template propose par le MJ dans ses templates personnels
- les ecrans `detached` s ouvrent dans une fenetre separee

## Widgets reels branches au runtime

- `chat`
  - vrai chargement des messages de session
  - canaux derives des vrais participants
  - whispers vers MJ
- `notes`
  - CRUD complet
  - scopes `private`, `session`, `gm`
  - types reserves `public`, `player_private`, `gm_private`
- `initiative`
  - lecture / ecriture de `session.initiative`
  - messages systeme publies dans le chat
- `documents`
  - base sur les ressources de session et de compte
  - upload depuis le widget
- `pdf_viewer`
  - ouverture d une ressource PDF ou URL
- `media_viewer`
  - image / video depuis ressource ou URL
- `character_list`
  - base sur les participants de session
- `dice_history`
  - base sur les messages `roll`
- `session_journal`
  - base sur les messages visibles de session

## Backend session commun

- stockage persistant backend des `messages`
- stockage persistant backend des `notes`
- endpoints dedies session pour ces deux families
## 2026-03-13 - Runtime des 3 widgets restants

- `character_sheet` branche sur les vrais personnages de session
- `clock` rendu temps reel
- `alert_overlay` branche sur les vrais messages de session
- les jets lances depuis `character_sheet` alimentent maintenant `dice_history`
- la creation d une partie assigne automatiquement les templates d ecran systeme si disponibles
- les ecrans detaches conservent maintenant le bon `set` et un titre de fenetre plus explicite

## 2026-03-13 - Finition du studio ecran

- ajout d un mode `Apercu` du canvas dans le studio ecran
- duplication de `set`, `ecran` et `onglet`
- selecteurs metier pour :
  - `pdf_viewer.resourceId`
  - `media_viewer.resourceId`
  - `character_sheet.viewId`
- le studio recharge les ressources disponibles selon la portee du template :
  - compte
  - systeme si template ecran lie a un systeme

## 2026-03-14 - Verification documentaire et captures hors partie

- reverification visuelle du catalogue `Ecrans` et du `Studio ecran` sur l application locale
- reverification visuelle de `Accueil` et `Ressources` pour la doc utilisateur
- captures ajoutees dans `docs/assets/ui-screenshots/`
  - `home.png`
  - `resources.png`
  - `screen-templates.png`
  - `screen-studio.png`
- mise a jour des docs utilisateur :
  - `docs/ui/home.md`
  - `docs/ui/resources.md`
  - `docs/ui/screen-studio.md`
- perimetre volontairement limite hors zone `Partie`, en raison de la refonte en cours en parallele
