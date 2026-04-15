# Composant `Onglet`

## Role

Structure qui affiche une ou plusieurs vues du systeme sous forme d'onglets.

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
- `Vues liees`
- `Vue active par defaut`
- `Orientation des onglets`

## Orientations

- `horizontal`
- `vertical_gauche`
- `vertical_droite`

## Regles

- une meme vue peut etre liee a plusieurs onglets
- retirer une vue d'un onglet ne supprime pas la vue du systeme
- l'affichage conditionnel passe par `Afficher si` du composant `Onglet` ou par un `Container` parent
- chaque vue integree garde sa propre grille
- si la vue integree n occupe qu une partie de sa grille, un espace libre peut rester visible dans la zone de contenu
- si la vue integree est plus longue que la zone de contenu disponible, un ascenseur vertical apparait dans la zone des onglets

## Exemple

Vue hote :

- grille `24 colonnes`
- contient un composant `Onglets`

Vue rattachee a un onglet :

- grille `24 colonnes`
- les blocs utiles n occupent que `16 colonnes`

Resultat :

- la vue rattachee conserve sa propre largeur logique
- `8 colonnes` restent libres a droite
- ce n est pas un bug de rendu : c est la consequence directe du placement de la vue rattachee
