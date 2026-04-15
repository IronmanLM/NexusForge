# Variables reservees - Fiches personnage

Ce document liste les variables reservees utilisables dans les vues `Fiche personnage` du Studio système.

## Principe

Ces variables permettent d injecter automatiquement des informations de contexte dans une fiche :

- au moment de la creation de la fiche
- dans le nom genere de la fiche
- dans les composants texte
- dans certains composants image / URL
- au runtime, quand la fiche est ouverte depuis une partie

Exemple simple :

- `{{nompartie}} · {{nompj}}`

## Variables disponibles

### `{{nompj}}`

Nom du personnage.

Usage conseille :

- nom affiche du personnage
- titre de fiche
- rappel dans une zone d introduction

Exemple :

- `Nom du personnage : {{nompj}}`

### `{{nompartie}}`

Nom de la partie courante.

Usage conseille :

- nom de fiche genere
- entete de document
- rappel de campagne / partie

Exemple :

- `Fiche liee a la partie {{nompartie}}`

### `{{nommj}}`

Pseudo ou nom lisible du MJ principal de la partie.

Usage conseille :

- mention de reference dans une fiche
- encart de contact / supervision MJ

Exemple :

- `MJ de reference : {{nommj}}`

### `{{nomjoueur}}`

Nom lisible complet du joueur proprietaire de la fiche.

Usage conseille :

- etiquette administrative
- zone meta de fiche

Exemple :

- `Joueur : {{nomjoueur}}`

### `{{pseudojoueur}}`

Pseudo du joueur proprietaire de la fiche.

Usage conseille :

- affichage compact
- zones sociales / techniques

Exemple :

- `Compte : @{{pseudojoueur}}`

### `{{nomsysteme}}`

Nom du systeme de jeu utilise par la partie.

Usage conseille :

- entete de fiche
- rappel de systeme

Exemple :

- `Systeme : {{nomsysteme}}`

### `{{datecreation}}`

Date de creation de la fiche.

Usage conseille :

- historique
- suivi administratif

Exemple :

- `Cree le {{datecreation}}`

### `{{rolelecteur}}`

Role du lecteur courant de la fiche.

Valeurs :

- `gm`
- `player`

Usage conseille :

- texte contextuel
- labels dynamiques

Exemple :

- `Lecture courante : {{rolelecteur}}`

### `{{lecteurestmj}}`

Indique si le lecteur courant est un MJ.

Valeurs :

- `true`
- `false`

### `{{lecteurestjoueur}}`

Indique si le lecteur courant est un joueur.

Valeurs :

- `true`
- `false`

### `{{lecteurestproprietaire}}`

Indique si le lecteur courant est aussi le proprietaire du personnage.

Valeurs :

- `true`
- `false`

## Ou les utiliser

Les variables reservees sont surtout utiles dans :

- `Nom de fiche genere`
- `Texte`
- `Texte multiligne`
- valeurs texte de certains composants
- references image / URL si tu veux pointer vers une ressource contextuelle

## Exemple recommande

Pour une fiche joueur standard :

- nom genere :
  - `{{nompartie}} · {{nompj}}`

Pour un encart d identification :

- `Personnage : {{nompj}}`
- `Joueur : {{nomjoueur}}`
- `MJ : {{nommj}}`
- `Systeme : {{nomsysteme}}`

## Comportement attendu

- si la fiche est creee pour un joueur, `{{nompj}}` prend la valeur saisie a la creation
- si la fiche est ouverte depuis une partie, les variables sont resolues avec le contexte reel de cette partie
- si une information n existe pas encore, la variable se resout en chaine vide

## Conditions runtime

Pour les champs `Afficher si`, `Editable si` et `Visible si`, utilise les variables runtime suivantes :

- `@role_lecteur`
- `@lecteur_est_mj`
- `@lecteur_est_joueur`
- `@lecteur_est_proprietaire`

Exemples :

- afficher une zone seulement pour le MJ :
  - `@lecteur_est_mj == true`
- afficher un bouton seulement pour le proprietaire :
  - `@lecteur_est_proprietaire == true`
- afficher une action seulement pour le MJ qui edite la fiche d un autre joueur :
  - `@lecteur_est_mj == true && @lecteur_est_proprietaire == false`

## Bonnes pratiques

- utiliser `{{nompj}}` pour tout ce qui doit suivre le nom reel du personnage
- utiliser `{{pseudojoueur}}` plutot que l ID technique du compte
- eviter de multiplier les variables dans tous les labels si une seule zone d identification suffit
- garder le nom de fiche lisible, court et stable

## Point important

Ces variables ne remplacent pas les references runtime entre champs Studio.

Donc :

- variables reservees = contexte partie / joueur / personnage
- references runtime = valeurs venant des autres composants de la vue

Exemples de references runtime :

- `@Label`
- `@vue_reference.Label`
- `{{Label}}`
- `{{vue_reference.Label}}`
