# Interface des fiches personnages

Ce document decrit l'affichage runtime des fiches personnages dans NexusForge.

## Principe actuel

La fiche de personnage part maintenant des vues du Studio système V2.

Une vue de systeme peut etre marquee comme fiche personnage via :

- `Vue de fiche personnage = Oui`

La creation d un personnage de partie utilise ensuite directement cette vue Studio.

## Studio système V2

Une fiche Studio V2 est construite a partir de :

- vues du systeme
- composants sur grille
- structures `Conteneur` et `Onglets`
- composants `Affichage`
- composants `Champs editables`

Une vue peut etre :

- `Vue par defaut joueur`
- `Vue de fiche personnage`
- `Type de fiche = PJ`
- `Type de fiche = PNJ`
- `Type de fiche = Creature`

## Variables reservees

Les fiches personnages peuvent injecter automatiquement :

- `{{nompj}}`
- `{{nompartie}}`
- `{{nommj}}`
- `{{nomjoueur}}`
- `{{pseudojoueur}}`
- `{{nomsysteme}}`
- `{{datecreation}}`

Elles servent notamment a generer le nom d une fiche a sa creation.
Au runtime, elles sont aussi resolues avec le contexte reel de la partie et du personnage quand la fiche est ouverte depuis une partie.

Exemple :

- `{{nompartie}} · {{nompj}}`

Reference detaillee :

- voir [character-sheet-variables.md](/mnt/c/Users/mikael/.codex/worktrees/e534/NexusForge/docs/ui/character-sheet-variables.md)

## Flux de partie

### Creation joueur

Si un joueur rejoint une partie sans personnage attribue :

- la page `Partie` lui propose `Creer mon personnage`
- il choisit une vue de fiche `PJ`
- il renseigne le nom du personnage
- la fiche est creee pour lui et rattachee a son participant

Si aucune vue n est explicitement marquee `PJ`, la partie reutilise les vues `fiche personnage` disponibles pour ne pas bloquer la creation.

### Pre-tire MJ

Le MJ peut preparer un personnage non attribue dans une partie, puis :

- choisir un joueur cible
- dupliquer ce personnage
- attribuer la copie au joueur

La fiche source reste intacte.
La copie porte :

- `sourceCharacterId`
- `isPreGeneratedClone = true`

## Cycle de vie en partie

Les cartes personnage affichent maintenant un statut simple :

- `Modele MJ`
- `Clone joueur`
- `Fiche attribuee`

Regle metier :

- le proprietaire d une fiche joueur peut la `supprimer definitivement`
- un MJ peut `retirer de la partie` une fiche joueur sans la detruire
- un `Modele MJ` non attribue reste supprimable par le MJ car il s agit d un modele de table
- un transfert de fiche passe par une reattribution du champ `Attribue a`
- une desattribution propre laisse la fiche dans la partie avec `ownerUserId = null`

Retirer de la partie :

- detache la fiche de la partie
- libere l attribution participant -> personnage
- ne detruit pas la fiche joueur

## Initiative

Une vue fiche personnage peut definir la strategie d initiative par defaut :

- `combat_once`
- `round_recalc`
- `gm_fixed`
- `manual_turn`

Pour `combat_once` et `round_recalc`, une formule d initiative peut etre renseignee.

Le MJ garde ensuite la possibilite de forcer un autre mode au niveau de la partie.

Au runtime ecran, le widget `Fiche de personnage` tient maintenant compte de la vue cible quand `viewId` est configure.

La page `Partie` permet maintenant d ouvrir une fiche dans un nouvel onglet dedie, avec le meme moteur de rendu que l apercu final du Studio système.

## References supportees

Dans le runtime Studio :

- `@Label`
- `@vue_reference.Label`
- `{{Label}}`
- `{{vue_reference.Label}}`
- `{{Label[]}}`
- `{{Label[0]}}`

## Comportement attendu

### Affichage

Les composants `Affichage` sont en lecture seule :

- `Texte`
- `Texte multiligne`
- `Numerique`
- `Vue`
- `Date`
- `Heure`
- `Image`
- `Liste deroulante`
- `Menu multichoix`
- `Jauge`
- `Bouton`

### Editable

Les composants `Editable` sont modifiables au runtime si `Editable si` le permet :

- `Texte`
- `Texte multiligne`
- `Numerique`
- `Case a cocher`

## Boutons

Les boutons Studio peuvent :

- aller vers une vue
- ouvrir une vue en popup
- lancer un jet
- executer un script

## Objectif actuel

Le but est d avoir :

- un affichage runtime coherent avec le Studio système V2
- un moteur de rendu unique pour :
  - l apercu final du Studio système
  - la fiche ouverte depuis une Partie
  - le widget fiche personnage du Studio Ecrans
- une mise en page responsive pour que lignes et colonnes se replient proprement hors canvas
- une distinction claire entre lecture seule et champs modifiables
- un support des references entre vues
- un support des boutons de navigation/popup/jet

## Notes

Le flux personnage ne depend plus de `referenceSheets`.
La source de verite est la vue Studio marquee `Vue de fiche personnage`.
Un systeme doit etre `publie` et contenir au moins une vue fiche personnage pour pouvoir etre joue dans une partie.
