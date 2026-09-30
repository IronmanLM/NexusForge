# Widgets du Studio Ecrans

Ce document decrit les widgets valides pour le Studio Ecrans.

## Regles generales

Chaque widget possede :

- un `type`
- un `title`
- un `layout`
- une `config`
- une `dataSource`
- des `permissions`

Les widgets sont places sur une grille et peuvent etre redimensionnes.

Dans le runtime actuel, chaque widget expose :

- une configuration persistante par template ;
- un rendu en partie ;
- des conventions d usage identiques quel que soit le systeme de jeu.

## Variables et conventions reservees

Ces widgets sont system-agnostiques : ils ne dependent pas d un systeme de fiche particulier.

Les conventions reservees de la partie sont :

- `initiative.round`
- `initiative.turnIndex`
- `initiative.isInCombat`
- `initiative.entries[]`
- types de notes reserves :
  - `public`
  - `player_private`
  - `gm_private`

Important :

- ces valeurs appartiennent au runtime de partie ;
- elles ne remplacent pas les labels du Studio système ;
- elles servent aux widgets communs reutilisables dans tous les systemes.

## Widgets actifs

### character_sheet

Affiche une fiche de personnage liee au systeme de jeu.

Config minimale :

- `characterId`
- `viewMode`: `player` ou `gm`
- `viewId` optionnel

Comportement actuel :

- charge les vrais personnages de la partie ;
- selectionne automatiquement le personnage du joueur si possible ;
- peut aussi cibler un personnage explicite via la configuration du widget ;
- dans le studio ecran, la vue systeme peut etre choisie depuis la liste des vues du systeme lie ;
- affiche les groupes et champs de la fiche ;
- permet de lancer les actions de fiche ;
- publie les jets dans les messages de partie avec `systemType = roll`.

### chat

Messagerie de partie.

Config minimale :

- `channel`: `global`, `private`, `group`
- `allowWhispers`

Comportement actuel :

- canaux reconstruits a partir des vrais participants de la partie ;
- canal global toujours present ;
- canaux directs generes entre membres de la partie ;
- respect de `allowPlayerToPlayerChat` dans les reglages de partie ;
- messages prives au MJ supportes ;
- messages systeme d initiative visibles dans le chat.

Ce widget ne depend d aucune variable de systeme.

### clock

Affiche l'heure reelle.

Config minimale :

- `format`: `24h` ou `12h`
- `showSeconds`

Comportement actuel :

- horloge temps reel ;
- supporte `12h` et `24h` ;
- supporte l affichage ou non des secondes.

### alert_overlay

Overlay flottant pour messages entrants et messages prioritaires du MJ.

Config minimale :

- `source`: `incoming`, `gm_priority`, `all`
- `durationMs`
- `position`

Comportement actuel :

- lit les vrais messages de partie ;
- peut afficher :
  - les messages entrants ;
  - les messages prioritaires MJ ;
  - ou tous les messages recents visibles ;
- supporte :
  - `top_left`
  - `top_right`
  - `bottom_left`
  - `bottom_right`.

### pdf_viewer

Lecteur PDF integre.

Comportement actuel :

- affiche un PDF via :
  - `resourceId`
  - ou `url`
- supporte les ressources protegees de la bibliotheque ;
- dans le studio ecran, `resourceId` peut etre choisi via le selecteur de ressources unifie ;
- la page de depart est prise depuis `config.page`.

Config minimale :

- `resourceId` ou `url`
- `page`
- `showToolbar`

### documents

Acces a la bibliotheque documentaire de la partie et aux fichiers personnels autorises.

Comportement actuel :

- s appuie sur la bibliotheque de ressources ;
- scopes supportes :
  - `session_shared`
  - `user_private`
  - `all`
- upload possible depuis le widget si `allowUpload=true` ;
- panneau de previsualisation du document selectionne ;
- ajustement direct de l audience du document de partie ;
- gestion du repartage et du ciblage de joueurs sans quitter la partie.

Config minimale :

- `scope`: `session_shared`, `user_private`, `all`
- `allowUpload`

### media_viewer

Lecteur image / video, surtout utile au MJ.

Comportement actuel :

- affiche une image ou une video ;
- supporte :
  - `resourceId`
  - `url`
- supporte les ressources protegees ;
- dans le studio ecran, `resourceId` peut etre choisi via le selecteur de ressources unifie ;
- `fit` applique le cadrage.

Config minimale :

- `resourceId` ou `url`
- `mode`: `image`, `video`, `battlemap`
- `fit`

### notes

Prise de note personnelle ou partagee.

Config minimale :

- `scope`: `private`, `session`, `gm`
- `autosave`

Comportement actuel :

- `private`
  - joueur : notes `player_private`
  - MJ : notes `gm_private`
- `session`
  - notes `public`
- `gm`
  - notes `gm_private`

Operations disponibles :

- lister
- creer
- modifier
- supprimer

Les types reserves sont :

- `public`
- `player_private`
- `gm_private`

### character_list

Liste des personnages accessibles dans la partie.

Comportement actuel :

- basee sur les participants de partie ;
- peut filtrer :
  - PJ
  - PNJ / observateurs
- mode compact supporte.

Config minimale :

- `showPlayers`
- `showNpcs`
- `compact`

### dice_history

Historique recent des jets.

Comportement actuel :

- lit les messages de partie de type `roll` ;
- scopes supportes :
  - `self`
  - `party`
  - `all_visible` (meme comportement que `party` pour le moment)

Config minimale :

- `scope`: `self`, `party`, `all_visible`
- `limit`

### initiative

Ordre d'initiative de la partie.

Config minimale :

- `compact`
- `showDetails`

Comportement actuel :

- lecture et ecriture sur l etat technique `session.initiative` de la partie
- actions MJ :
  - demarrer combat
  - tour suivant
  - terminer combat
- publication automatique de messages systeme dans le chat

Etat reserve :

- `initiative.round`
- `initiative.turnIndex`
- `initiative.isInCombat`
- `initiative.entries`
- `initiative.config.mode`
- `initiative.config.formula`

Modes supportes :

- `system_default`
- `combat_once`
- `round_recalc`
- `gm_fixed`
- `manual_turn`

Le widget suit d abord l override de partie.
Si la partie reste en `system_default`, il reprend le mode et la formule portes par la fiche personnage.

### session_journal

Journal des evenements marquants de la partie.

Comportement actuel :

- repose sur les messages de partie ;
- filtres :
  - `all`
  - `system`
  - `chat`
- utile comme timeline simple commune a tous les systemes.

Config minimale :

- `limit`
- `showFilters`

## Widget overlay

`alert_overlay` est special :

- il peut etre epingle au-dessus des autres widgets ;
- il ne suit pas forcement la meme logique de grille que les widgets de travail.

## Etat d implementation

Widgets reellement operationnels dans le runtime ecran :

- `chat`
- `notes`
- `initiative`
- `documents`
- `pdf_viewer`
- `media_viewer`
- `character_list`
- `dice_history`
- `session_journal`

Widgets encore en rendu simple ou en preview guidee :

- `character_sheet`
- `clock`
- `alert_overlay`
