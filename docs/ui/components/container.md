# Composant `Container`

## Rappel cle / libelle

Dans les conteneurs repetables et leurs items :

- `item.key` designe la cle technique
- `item.label` designe le texte affiche
- les bindings et references restent bases sur la cle
- en mode `fields`, `item.key` reprend la cle du champ source et `item.label` son libelle affiche



## Role

Bloc structurel libre pour regrouper visuellement une section.

En V2, le `Container` est aussi le support unique de la repetition. Il remplace donc a lui seul :

- le conteneur visuel
- l ancien `Bloc repetable`
- les usages simples de liste dynamique

## Contenu autorise

- `Container`
- `Onglet`
- tous les composants `Affichage`
- tous les composants `Editable`

## Proprietes

- `Label`
- `Cle technique`
- `Bordure`
- `Afficher si`
- `Couleur fond`
- `Couleur bordure`
- `Couleur texte`
- `Type bordure`
- `Alignement horizontal`
- `Alignement vertical`

## Debordement

Quand le contenu d un conteneur depasse la hauteur disponible de sa zone, le runtime ajoute un ascenseur vertical a l interieur du conteneur.

Le titre du conteneur reste visible, et seul le corps du conteneur defile.

## Proprietes de repetition

Le `Container` peut activer un mode repetable.

Champs deja presents en V2 :

- `Mode repetition`
  - `none`
  - `manual`
  - `binding`
- `Source`
- `Elements manuels`

Champs cibles a ajouter pour la repetition avancee :

- `Filtre item`
- `Disposition repetition`
  - `horizontal`
  - `vertical`
- `Largeur item`
- `Hauteur item`
- `Espacement horizontal`
- `Espacement vertical`
- `Afficher entete item`
- `Libelle item`

## Cible fonctionnelle repetition avancee

Le but est de permettre des usages de fiche tres frequents sans logique PHP externe :

- n afficher que les competences choisies
- n afficher que les qualites actives
- n afficher que les defauts selectionnes
- afficher un inventaire compact
- afficher une liste de talents appris

Le fonctionnement cible est le suivant :

1. le `Container` pointe vers une source tableau
2. le runtime parcourt chaque item de la source
3. le `Filtre item` decide si cet item doit etre rendu
4. les enfants du `Container` servent de modele d affichage de la ligne ou de la carte repetee
5. les champs editables internes modifient l item courant

Si la collection source est vide, le modele interne ne doit pas etre affiche comme un bloc normal. Le runtime affiche alors un placeholder et attend qu une entree soit ajoutee a la collection.

## Source des donnees

La source d un conteneur repetable doit pouvoir etre :

- locale a la vue :
  - `@competences`
  - `@qualites`
- issue d une autre vue :
  - `@fiche_complete.competences`
  - `@resume.defauts`

Le conteneur ne doit pas supposer que les donnees viennent de la vue courante.

## Contexte expose dans la repetition

Quand un item est en cours de rendu, le conteneur injecte un contexte local :

- `@item.key`
- `@item.label`
- `@item.value`
- `@index`

Equivalent en syntaxe texte :

- `{{item.key}}`
- `{{item.label}}`
- `{{item.value}}`
- `{{index}}`

Le contexte `item` reste local au conteneur repetable courant.

## Regles de references

Pour garder une syntaxe simple et previsible :

- `@item.xxx` = valeur de l item courant
- `{{item.xxx}}` = interpolation texte de l item courant
- `@vue_ref.champ` = champ classique d une autre vue
- `{{vue_ref.champ}}` = interpolation texte d un champ classique d une autre vue
- `@vue_ref.competences` = source tableau d une autre vue

Quand un conteneur repetable consomme une source inter-vues, la source peut venir d une autre vue, mais les enfants du conteneur continuent a lire l item courant via `@item.*`.

Exemple conseille :

- `Source` : `@fiche_complete.competences`
- `Filtre item` : `@item.value > 0`
- texte interne : `{{item.label}}`
- champ numerique interne : `value`

## Filtrage

Le `Filtre item` est la cle de l usage "resume allege".

Exemples attendus :

- `@item.value > 0`
- `@item.selected == true`
- `@item.label != ""`

Sans ce filtre, l auteur est oblige de dupliquer la logique metier en dehors du studio.

## Disposition repetition

Le conteneur repetable ne doit pas se limiter a une pile verticale.

Deux dispositions doivent etre supportees :

- `horizontal`
  - les items se placent de gauche a droite
  - quand la ligne est pleine, retour a la ligne suivante
- `vertical`
  - les items se placent de haut en bas
  - quand la colonne est pleine, passage a la colonne suivante

La place disponible se calcule a partir :

- de la taille du conteneur
- de la taille d un item
- de la grille de la vue

## Edition des items

Les enfants du conteneur repetable doivent pouvoir binder une propriete simple de l item courant.

Exemples :

- champ texte avec cle `label`
- champ numerique avec cle `value`
- checkbox avec cle `selected`

Ainsi, si l auteur place un champ numerique `value` dans le modele, il modifie bien `@item.value` et non une variable globale hors contexte.

## Exemples concrets

### Exemple 1 - Competences choisies dans une vue resume

Source de donnees :

```json
[
  { "key": "armes_etranges", "label": "Armes etranges", "value": 0 },
  { "key": "arts", "label": "Arts", "value": 0 },
  { "key": "convaincre", "label": "Convaincre", "value": 1 },
  { "key": "etiquette", "label": "Etiquette", "value": 1 }
]
```

Configuration du conteneur :

- `Mode repetition` : `Variable tableau`
- `Source` : `@fiche_complete.competences`
- `Filtre item` : `@item.value > 0`
- `Disposition repetition` : `vertical`

Contenu interne :

- texte : `{{item.label}}`
- champ numerique : `value`

Resultat attendu :

- `Convaincre : 1`
- `Etiquette : 1`

Les competences a `0` ne sont pas affichees.

### Exemple 2 - Inventaire compact horizontal

Source :

```json
[
  { "key": "potion", "label": "Potion", "qty": 2 },
  { "key": "torche", "label": "Torche", "qty": 5 },
  { "key": "corde", "label": "Corde", "qty": 1 }
]
```

Configuration :

- `Mode repetition` : `Variable tableau`
- `Source` : `@inventaire`
- `Disposition repetition` : `horizontal`
- `Largeur item` : `3`
- `Hauteur item` : `2`

Contenu :

- texte : `{{item.label}}`
- texte : `x{{item.qty}}`

Resultat attendu :

- affichage en petites cartes
- retour a la ligne automatique quand la largeur est pleine

### Exemple 3 - Qualites visibles uniquement pour le MJ

Configuration :

- vue `complete`
  - liste exhaustive et editable
- vue `resume`
  - source : `@complete.qualites`
  - filtre : `@item.selected == true`
  - `Afficher si` du conteneur complet : `@lecteur_est_mj == true`

Ainsi, la meme source peut alimenter :

- une vue exhaustive pour le MJ
- une vue compacte pour les joueurs

## Notes

- `Container` ne gere pas lui-meme un layout libre complexe entre ses enfants hors grille de vue
- pour afficher ou masquer une zone, c est toujours le bon composant enveloppe
- pour les listes metier, la cible V2 est de privilegier une vraie source tableau plutot qu une multitude de champs isoles
- ce cadrage de repetition avancee est une cible fonctionnelle documentee ; tout n est pas encore implemente
