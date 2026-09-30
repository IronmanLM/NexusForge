# Famille `Editable`

## Cle et libelle

- les references `@...` et `{{...}}` utilisent uniquement la `cle`
- le `libelle` sert a l affichage dans la fiche
- le `libelle` peut rester lisible pour l utilisateur final, avec accents et espaces
- la `cle` reste la version technique stable
- par defaut, la `cle` est generee depuis le `libelle`
- si la `cle` a ete modifiee manuellement, le `libelle` peut evoluer sans casser les references



## Composants

- `Texte`
- `Texte multiligne`
- `Numerique`
- `Case a cocher`
- `Image`

## Proprietes communes

- `Label`
- `Cle technique`
- `Valeur par defaut`
- `Editable si`

## Regles

- si `Editable si = 0`, le champ reste visible mais verrouille
- le style visuel passe par le bloc `Style champ`

## Cas particuliers

### Texte

- `Placeholder`
- `Longueur max`
- `Valeur vide autorisee`

### Texte multiligne

- memes regles que `Texte`
- ajoute `Nombre de lignes visibles`

### Numerique

- `Valeur min`
- `Valeur max`
- `Pas`
- `Valeur vide autorisee`
- la formule en valeur par defaut sert a l'initialisation, pas au recalcul permanent

### Case a cocher

- `0` = decoché
- `1` = coché
- `Texte associe`
- `Forme` : `carre` ou `rond`
- `Style actif` : `coche` ou `rempli`

### Image

- l utilisateur final peut :
  - choisir une image depuis sa bibliotheque
  - saisir une URL internet
  - uploader une nouvelle image dans sa bibliotheque
- la valeur stockee est l URL finale de l image choisie
- le rendu utilise les memes proprietes visuelles que `Affichage > Image`
