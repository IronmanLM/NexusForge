# Earth 2569 - Base systeme V0.1

## Fichiers

- `system-earth2569-v0.1.json`
- `README.md`

## Objectif

Cette base pose un premier `GameSystem` exploitable pour `Earth 2569` dans le Studio Systeme V2.

Elle couvre :

- la refonte de la fiche pour integrer la magie
- les caracteristiques principales et secondaires
- les domaines et competences
- une vue `combat`
- une vue `magie`
- une vue `augmentations`
- des catalogues de reference pour les augmentations et une base armes

## Vues presentes

- `earth2569_fiche`
  - vue racine a onglets
- `identite`
  - informations de base du personnage
- `attributs`
  - CarP, CarS et valeurs derivees
- `competences`
  - domaines, points de competence, bonus par palier
- `combat`
  - initiative, deplacement, reduction, esquive, preparateur de jet d100
- `magie`
  - construction de sort, difficulte, cout en volonte
- `augmentations`
  - collections runtime alimentees depuis catalogues

## Hypotheses retenues pour V0.1

- les 3 CarP sont :
  - `physique`
  - `mental`
  - `social`
- les 15 CarS sont :
  - `force`
  - `agilite`
  - `dexterite`
  - `sens`
  - `constitution`
  - `intelligence`
  - `memoire`
  - `raisonnement`
  - `volonte`
  - `creativite`
  - `communication`
  - `persuasion`
  - `intimidation`
  - `diplomatie`
  - `charme`
- les seuils de bonus d expertise suivent le document de regles actuel :
  - `0-9 => 0`
  - `10-19 => 5`
  - `20-29 => 10`
  - `30-39 => 15`
  - `40+ => 20`
- la plage critique suit aussi le document actuel :
  - novice : `01` et `96-100`
  - entraine : `01-02` et `97-100`
  - professionnel : `01-03` et `98-100`
  - expert : `01-04` et `99-100`
  - maitre : `01-05` et `100`

## Automatisations presentes

### Combat

- initiative de base :
  - `sens + raisonnement`
- initiative finale manuelle :
  - `(sens + raisonnement) - d100`
- deplacement simple :
  - `(PA + agilite + domaine dev physique + bonus motricite) / 20`
- deplacement etendu :
  - `(PA + agilite + domaine dev physique + bonus motricite) / 5`
- reduction automatique :
  - `floor((physique + constitution) / 10)`
- reduction appliquee :
  - limitee a la moitie des degats subis
- esquive :
  - `physique + dexterite + domaine dev physique + bonus motricite + malus arme + modificateurs`

### Jet d100 prepare

La vue `combat` propose un preparateur de jet avec :

- choix d une CarP
- choix d une CarS
- choix d un domaine
- choix d une competence
- calcul automatique de la capacite
- saisie manuelle du `d100`
- bouton de lancer `1d100`
- calcul de la marge
- calcul des tranches de reussite
- affichage des bornes critiques

### Magie

La vue `magie` propose :

- la base de difficulte :
  - `50 - (10 * IN magie)`
- les modificateurs de temps, puissance, cible, distance, environnement
- le surcout de flux supplementaires
- le surcout de cibles supplementaires
- le calcul de la difficulte totale
- le cout en volonte selon les UE

## Catalogues presents

- `augmentations_genomiques`
- `augmentations_cybernetiques`
- `augmentations_magiques`
- `armes`

Les catalogues ne sont pas encore exhaustifs.
Ils servent de base de reference pour :

- tester le runtime
- alimenter les collections de personnage
- preparer une bibliotheque systeme plus complete

## Modification moteur ajoutee

Le runtime supporte maintenant des helpers dans les formules numeriques :

- `ifEq`
- `ifGte`
- `ifLte`
- `min`
- `max`
- `abs`
- `floor`
- `ceil`
- `round`
- `clamp`

Cela permet d exprimer des seuils et des paliers directement dans le JSON du systeme, sans modifier le moteur pour chaque jeu.

## Limites actuelles

- la bibliotheque d armes est encore partielle
- les catalogues d augmentations sont des exemples structures, pas encore la totalite du livre
- le systeme de selection de jet repose pour l instant sur des correspondances encodees dans les formules
- les sorts connus, maitrises, receptacles et cartes de sort ne sont pas encore modelises en profondeur
- les dommages d armes detailles par tranche de reussite ne sont pas encore tous derives depuis catalogue

## Suite recommandee

1. completer les listes d armes et d augmentations depuis le livre
2. ajouter une vue `inventaire`
3. ajouter une vue `sorts connus` et `receptacles`
4. faire une passe de simplification sur les formules longues de selection
5. si besoin, enrichir encore le moteur avec un helper de type `pick(index, ...)` pour raccourcir les mappings
