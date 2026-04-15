# Famille `Affichage`

## Composants

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

## Proprietes communes

- `Label`
- `Cle technique`
- `Valeur`

## Regles

- pas de `Editable si` dans cette famille
- la visibilite conditionnelle passe par un `Container`
- `@Label` sert aux calculs et conditions
- `{{Label}}` sert au rendu texte

## Cas particuliers

### Texte / Texte multiligne

- acceptent texte brut, `@...`, `{{...}}`
- `Texte multiligne` conserve les retours a la ligne

### Numerique

- attend un resultat numerique
- en cas d'erreur: `N/A`

### Vue

- inclut une vue existante du meme systeme
- anti-boucle obligatoire

### Image

- affiche une image depuis une valeur ou une valeur par defaut
- dans une fiche de partie editable, le joueur peut maintenant :
  - ajouter une image locale
  - remplacer l image courante
  - retirer l image
- l image choisie est enregistree dans les valeurs runtime de la fiche

### Date / Heure

- types en lecture seule
- `N/A` si la valeur est invalide

### Liste deroulante

- une seule valeur
- affiche une cle ou son texte associe

### Menu multichoix

- lecture seule dans cette famille
- exemples de rendu : `{{label[]}}`, `{{label[0]}}`

### Jauge

- `Valeur` + `Valeur max`
- orientation `horizontale` ou `verticale`

### Bouton

- actions disponibles selon la configuration du bouton
- peut afficher texte, icone ou les deux
- `Actif si` desactive le bouton sans le masquer
