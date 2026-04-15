# Studio système

## Cle et libelle

- la `cle` est technique et sert aux references `@...`, `{{...}}`, aux conditions et aux formules
- la `cle` doit rester unique dans le systeme et suit les restrictions techniques (`a-z`, `0-9`, `_`, `-`)
- le `libelle` est visuel et peut contenir espaces, accents et ponctuation
- la `cle` est auto-generee a partir du `libelle` tant qu elle n a pas ete personnalisee manuellement
- renommer un `libelle` ne doit jamais casser les references si la `cle` a deja ete personnalisee



## Objectif

Le Studio système permet de construire les fiches et vues d un systeme de jeu avec un studio sur grille, proche du Studio Ecrans.

Principes :

- édition sur grille
- rendu final sur grille
- structures limitées à `conteneur` et `onglets`
- répétition intégrée au `conteneur`
- plus de `tableau`, `ligne`, `colonne` ni `bloc répétable` séparé
- enregistrement automatique différé des modifications auteur

## Enregistrement

Le Studio système V2 enregistre maintenant automatiquement les changements après un court temps d inactivité.

Comportement :

- auto-save après une courte pause de frappe / édition
- sauvegarde manuelle toujours disponible via `Enregistrer`
- avertissement navigateur si on tente de quitter avec des changements non enregistrés
- tentative de sauvegarde immédiate quand l onglet passe en arriere plan

Le bandeau du Studio indique maintenant :

- `Studio synchronisé`
- `Modifications en attente d enregistrement`
- `Enregistrement en cours`

## Schéma V2

Le système porte désormais un `studioSchemaV2`.

Structure :

- `views`
- chaque vue a une `gridColumns`
- chaque vue contient des `nodes`

Chaque node a :

- `id`
- `type`
- `label`
- `key`
- `layout`
- `parentId`
- `slotKey`
- options selon le type

## Types de node V2

- `container`
- `tabs`
- `static_text`
- `text`
- `textarea`
- `date`
- `time`
- `number`
- `checkbox`
- `image`
- `select`
- `multiselect`
- `progress`
- `button`
- `subview`

## Palette

La palette V2 est organisee par familles auteur, pour rester lisible quand on construit une vraie fiche :

- `Structure`
  - `Conteneur`
  - `Onglets`
- `Champs editables`
  - `Texte editable`
  - `Texte long`
  - `Date`
  - `Heure`
  - `Numerique`
  - `Case a cocher`
  - `Image editable`
  - `Liste deroulante`
  - `Menu multichoix`
- `Affichage`
  - `Texte`
  - `Jauge`
  - `Bouton`
  - `Vue liee`

L objectif est de retrouver une logique auteur orientee fiche, et non une simple liste de types techniques.

## Ordre des vues

Les vues du systeme peuvent maintenant etre reclassees directement dans le Studio systeme V2 avec :

- `Monter`
- `Descendre`

Le reclassement change seulement l ordre des vues dans le systeme et dans les selecteurs auteur. Il ne modifie ni les `id`, ni les `reference`, ni les liaisons deja en place.

## Configuration Discord

Le Studio systeme V2 propose maintenant un espace `Configuration Discord`, au meme niveau que les `Catalogues systeme`.

Cette configuration est pour l instant :

- en lecture seule uniquement
- sans ecriture vers les fiches
- sans actions metier

Elle sert a preparer des sorties Discord configurees par systeme.

### Sorties disponibles

- `sheet`
- `inventory`
- `notes`
- `view1` a `view9`

### Champs configurables

Pour chaque sortie Discord, l auteur peut definir :

- activation
- libelle
- description
- commande courte optionnelle
- format `text` ou `embed`
- visibilite par defaut
- visibilites autorisees
- type de source
- reference de source
- template principal
- template item
- template vide
- limite optionnelle d elements

### Edition des templates Discord

Les champs de template Discord disposent maintenant d un editeur detache :

- `Template principal`
- `Template item`
- `Template vide`

Cet editeur ouvre maintenant la vraie fenetre dediee directement au clic utilisateur, pour eviter que le navigateur la traite comme une popup tardive.
Si la fenetre detachee est malgre tout bloquee, le Studio affiche automatiquement une modale integree.

L editeur apporte :

- une matrice des variables par vue
- recherche des variables
- clic pour insertion a l endroit exact du curseur
- une barre d aide Markdown pour mettre en forme sans connaitre la syntaxe
- rappels de syntaxe et snippets simples

### Appel des variables

Deux formes sont maintenant utiles dans les templates Discord :

- acces direct par cle :
  - `@nom_du_personnage`
  - `@description`
- acces scope par vue :
  - `{{Identitee.nom_du_personnage}}`

## Regle de creation de personnage

Le Studio systeme V2 propose maintenant un espace `Regle creation personnage`, au meme niveau que les `Catalogues systeme` et la `Configuration Discord`.

Cette configuration reste optionnelle :

- si elle est desactivee, la creation de fiche garde le flux simple actuel
- si elle est activee, le systeme peut preparer un vrai parcours de creation par etapes

### Structure initiale

Le socle actuellement pose permet de definir :

- une activation globale
- des `reserves de creation`
  - exemple : `points_creation = 75`
- des `variables temporaires de creation`
  - exemple : `tirage_endurance`, `budget_social`, `resultat_3d6`
- des `etapes de creation`
  - question texte
  - question texte long
  - question numerique
  - choix catalogue
  - choix catalogue ou texte libre
  - repartition / allocation
  - valeur calculee / ecriture automatique
  - tirage / lancer de des
  - bloc conditionnel `SI / SINON`

### Par etape

Chaque etape peut deja definir :

- libelle
- cle
- type
- question / consigne
- cible `champ de fiche` ou `variable temporaire`
- vue cible si la cible est un champ de fiche
- champ cible / variable cible
- catalogue source
- texte libre autorise ou non
- condition de passage a l etape suivante
- texte d aide

### Variables et popup de selection

L editeur de creation guidee utilise maintenant une popup `Selectionner variable` directement dans les fonctions de script, sans panneau de proprietes separe.

Cette popup permet de choisir :

- un champ du systeme
- une reserve de creation pour les formules
- une variable temporaire de creation

Elle est disponible notamment pour :

- la cible d une etape
- la cible d une regle d allocation
- les formules de valeur initiale
- les couts, min, max et conditions
- la condition de passage a l etape suivante

### Repartition

Les etapes de type `allocation` peuvent deja recevoir plusieurs regles, avec :

- cible `champ de fiche` ou `variable temporaire`
- vue cible si necessaire
- champ cible / variable cible
- cout
- pas
- min
- max
- condition
- aide

Cette passe pose surtout le modele de donnees, la persistance, l import JSON et l editeur detache. Le moteur d execution du parcours de creation sera branche ensuite sur cette base.

### Flux joueur actuellement branche

Quand cette configuration est activee et contient des etapes :

- la page de partie propose maintenant `Lancer la creation guidee`
- le joueur suit les etapes avant la creation finale de la fiche
- la fiche n est creee qu a la fin
- les valeurs collectees sont injectees dans les `runtimeValues` et dans les champs de fiche reconstruits

Cette premiere execution couvre deja :

- les questions texte
- les questions texte long
- les questions numeriques
- les choix catalogue
- les choix catalogue ou texte libre
- les etapes de repartition avec reserves et couts recalcules en direct
- l initialisation de variables temporaires de creation avant le debut du parcours
- les etapes automatiques par formule
- les etapes de tirage avec resultat ecrit dans une variable ou un champ
- les etapes conditionnelles `SI / SINON` avec actions `ALORS` et `SINON`

### Bloc conditionnel

Le moteur de creation guidee accepte maintenant une etape `condition` qui :

- evalue une condition
- execute la branche `ALORS` ou `SINON`
- applique dans cette branche des actions de script

Pour cette passe, les actions disponibles dans un bloc conditionnel sont :

- `valeur calculee`
- `tirage`

Chaque action peut ecrire dans :

- un champ de fiche
- une variable temporaire de creation

Le moteur restera a enrichir ensuite pour des cas plus avances, mais la base est maintenant branchee au flux reel de creation joueur.
  - `{{Identitee.Description}}`

L acces par vue fonctionne avec les alias de vue suivants quand ils existent :

- `reference`
- `id`
- nom normalise de la vue

Pour rester fiable, il est recommande d utiliser surtout la `reference` de vue.

### Objectif

Cette couche doit permettre plus tard au bot Discord d afficher :

- des resumes de fiche
- des resumes d inventaire
- des sorties libres propres au systeme

sans coder en dur une interpretation metier specifique a chaque jeu.

Une premiere consommation reelle est maintenant branchee :

- `sheet` alimente `/nf-fiche`
- `inventory` alimente `/nf-inv`
- `notes` alimente `/nf-note`
- `view1..9` alimentent `/nf-vue1..9`

Ces commandes Discord lisent la configuration du systeme via le backend, dans le cadre d une partie et pour le compte Discord lie a l utilisateur.

Pour cette premiere passe :

- `sheet` fonctionne deja
- `inventory` fonctionne deja si `sourceRef` pointe vers une vraie collection de fiche
- `notes` fonctionnent maintenant comme liste en lecture seule, avec filtrage de droits deja applique par le backend
- `view1..9` fonctionnent maintenant comme sorties libres a template, avec un contexte de vue optionnel si `sourceRef` cible une vue du systeme

## Theme et heritage visuel

Le Studio systeme permet maintenant de definir un theme visuel a trois niveaux :

- niveau systeme
- niveau vue
- niveau element

L heritage se fait champ par champ dans cet ordre :

1. valeur definie sur l element
2. sinon valeur definie sur la vue
3. sinon valeur definie sur le systeme
4. sinon theme general de l application

Les proprietes disponibles sont :

- couleur de fond
- couleur de fond des champs editables
- couleur de texte des champs editables
- couleur de bordure des champs editables
- couleur de texte
- style du libelle de champ
  - `commun avec le champ`
  - `separe`
- si le style du libelle est `separe` :
  - couleur du libelle
  - famille typographique du libelle
  - taille du libelle
  - gras du libelle
  - italique du libelle

L heritage fonctionne aussi pour le style des libelles de champs editables :

1. element
2. vue
3. systeme
4. style commun du champ si le mode est `commun`

## Libelles de champs editables

Les champs editables peuvent maintenant etre styles de deux manieres :

- style commun :
  - le libelle reutilise la couleur et la typographie du champ
- style separe :
  - le libelle peut avoir sa propre couleur
  - le libelle peut avoir sa propre typographie

Cette configuration existe a trois niveaux :

- systeme
- vue
- element

Cela permet par exemple :

- un theme global de fiches avec libelles dores
- une vue particuliere avec libelles plus petits
- un champ precis avec un libelle mis en evidence

## Conteneurs vides

Les conteneurs sans enfant n affichent plus de placeholder `Conteneur vide` dans le rendu.

Le conteneur reste present dans la grille pour l auteur, mais sans polluer la lecture finale de la fiche ou de l apercu runtime.

## Contraintes min / max

Pour les champs numeriques editables, `Minimum` et `Maximum` acceptent maintenant :

- une valeur fixe
- ou une formule

Exemples :

- `0`
- `@niveau`
- `@pm_max`
- `max(0, @bonus_endurance)`
- `clamp(@rang * 5, 0, 100)`

Le runtime utilise ces contraintes a deux endroits :

- attributs HTML du champ numerique
- validation runtime de la valeur saisie
- couleur de bordure
- image de fond
- opacite du fond
- taille de l image
- position de l image
- repetition de l image

`Opacite du fond` agit maintenant sur :

- l image de fond quand elle existe
- la couleur de fond du conteneur ou de la vue
- la couleur de fond des champs quand un `Fond champ` est defini

Exemple concret :

- le systeme definit un fond sombre, un texte clair et une image de texture legere
- une vue `Inventaire` change seulement la couleur de bordure
- un bouton particulier change seulement sa couleur de fond

Dans ce cas :

- tous les elements heritent du fond, du texte et de l image du systeme
- les elements de la vue `Inventaire` prennent la bordure specifique de la vue
- le bouton garde son fond local, mais continue d heriter du reste

Les proprietes de vue se reglent dans `Proprietes vue`.
Les proprietes globales se reglent dans `Proprietes systeme`.

## Répétition

La répétition est portée par le `container`.

Modes :

- `none`
- `manual`
- `binding`
- `fields`

Champs :

- `repeat.mode`
- `repeat.source`
- `repeat.manualItemsText`
- `repeat.fieldItemsText`
- `repeat.filter`
- `repeat.flow`
- `repeat.itemWidth`
- `repeat.itemHeight`
- `repeat.gapX`
- `repeat.gapY`
- `repeat.showItemHeader`
- `repeat.itemLabelTemplate`

En runtime, le conteneur répétable sait maintenant :

- dupliquer son contenu à partir d un tableau manuel
- dupliquer son contenu à partir d une source liée
- construire une collection repetable depuis des champs existants d une vue
- injecter un contexte `{{item.*}}` dans les textes et valeurs affichées
- persister les valeurs editees par item dans les fiches de partie via `runtimeValues`

## Roadmap retenue - catalogues systeme

Pour les besoins d inventaire et de donnees de reference, la feuille de route retenue est maintenant :

- `catalogues système` pour definir les references du systeme
- `collections d instances` sur les fiches personnage
- `ajout depuis catalogue` comme action runtime cible

Cette direction est retenue pour :

- objets
- armes
- armures
- consommables
- talents
- sorts

Le cadrage detaille est suivi dans :

- [Catalogues systeme et collections d instances](../catalogues-systeme.md)

## Etat actuel - V1 catalogues

Le Studio systeme propose maintenant un espace `Catalogues systeme` separe des vues.

Cette V1 permet deja :

- de creer un catalogue vide
- de definir ses colonnes
- de saisir ses entrees dans une grille
- d importer / exporter un CSV
- de brancher un bouton `Ajouter depuis catalogue (popup)` dans une fiche
- de brancher un bouton `Dupliquer item` dans une repetition runtime
- de brancher un bouton `Equiper / desequiper` dans une repetition runtime
- de brancher un bouton `Augmenter quantité` dans une repetition runtime
- de brancher un bouton `Diminuer quantité` dans une repetition runtime
- de brancher un bouton `Supprimer item` dans une repetition runtime

Pour utiliser cette action dans une vue :

1. creer un catalogue dans `Catalogues systeme`
2. ajouter un bouton dans la vue
3. choisir l action `Ajouter depuis catalogue (popup)`
4. selectionner le `Catalogue source`
5. indiquer la `Collection cible`

Au runtime, le bouton ouvre une popup de selection et ajoute une instance dans la collection cible du personnage.

Dans cette popup :

- l action `Ajouter` apparait au debut de chaque ligne
- un clic sur une ligne ajoute egalement l entree
- l identifiant interne `id` des entrees de catalogue reste reserve au moteur
- les raccourcis de filtre permettent de preparer rapidement :
  - `@item.equipe == true`
  - `@item.equipe == false`
  - `@item.catalogKey == "catalogue_a_filtrer"`

`Supprimer item` fonctionne dans une repetition qui repose sur une vraie collection runtime. Cette action n est pas prevue pour les repetitions derivees depuis `fields`.

`Dupliquer item`, `Equiper / desequiper`, `Augmenter quantité` et `Diminuer quantité` suivent la meme contrainte : ils doivent etre places dans une repetition basee sur une vraie collection runtime.

Quand `equipe = true`, le runtime applique aussi un etat visuel specifique sur l item repete, pour aider a reperer rapidement l equipement actif dans une fiche longue.

`Ouvrir popup vue` peut aussi etre place dans une repetition runtime pour ouvrir une vue detaillee de l item courant et modifier ses champs dans une popup.

## Cadrage cible - repetition avancee

Le Studio systeme V2 doit evoluer vers un vrai modele auteur de liste dynamique, pour couvrir les fiches de personnage reelles sans logique externe.

Cas d usage cibles :

- fiche complete MJ avec liste exhaustive
- vue resume joueur qui n affiche que les items choisis
- inventaire compact
- qualites / defauts / talents selectionnes

### Source de repetition

La source d un conteneur repetable doit pouvoir pointer vers :

- une variable tableau locale :
  - `@competences`
- une variable tableau d une autre vue :
  - `@fiche_complete.competences`
- une collection derivee depuis des champs d une vue :
  - mode `fields`
  - vue source choisie
  - liste de champs selectionnes

En mode `fields`, chaque item derive doit suivre cette logique :

- `item.key` = cle technique du champ source
- `item.label` = libelle affiche pour l item
- `item.value` = valeur actuelle du champ source

Ainsi, les references techniques restent stables, mais l affichage peut rester lisible pour le joueur.

### Contexte expose

Dans le modele repetable, le runtime doit exposer :

- `@item.key`
- `@item.label`
- `@item.value`
- `@index`

Equivalent texte :

- `{{item.key}}`
- `{{item.label}}`
- `{{item.value}}`
- `{{index}}`

Le contexte `item` est local au conteneur repetable courant, meme si la source provient d une autre vue.

### Filtre item

Le conteneur repetable doit ajouter une propriete `Filtre item`.

Exemples :

- `@item.value > 0`
- `@item.selected == true`
- `@item.label != ""`

Cette propriete est essentielle pour les vues resume.

### Disposition repetition

Le conteneur repetable doit gerer la disposition des items repetes selon deux flux :

- `horizontal`
  - placement de gauche a droite
  - retour a la ligne quand la ligne est pleine
- `vertical`
  - placement de haut en bas
  - passage a la colonne suivante quand la colonne est pleine

Cette logique s appuie sur :

- la taille du conteneur
- la taille d un item
- la grille de la vue

### Binding enfant sur item courant

Dans un conteneur repetable, un champ enfant avec une cle simple comme `value` ou `selected` doit cibler l item courant.

Exemple :

- texte : `{{item.label}}`
- champ numerique : `value`

Le champ numerique modifie alors `@item.value`.

### Exemple concret - vue resume des competences

Source :

```json
[
  { "key": "armes_etranges", "label": "Armes etranges", "value": 0 },
  { "key": "arts", "label": "Arts", "value": 0 },
  { "key": "convaincre", "label": "Convaincre", "value": 1 },
  { "key": "etiquette", "label": "Etiquette", "value": 1 }
]
```

Configuration :

- `Mode repetition` : `Variable tableau`
- `Source` : `@fiche_complete.competences`
- `Filtre item` : `@item.value > 0`
- `Disposition repetition` : `vertical`

Modele interne :

- texte : `{{item.label}}`
- champ numerique : `value`

Resultat :

- `Convaincre 1`
- `Etiquette 1`

Les competences a `0` ne sont pas affichees.

## Runtime

Le runtime V2 conserve maintenant la disposition sur grille :

- les éléments sont placés en grille pour l édition
- le rendu final conserve aussi cette grille
- les coordonnées `x / y / w / h` ont donc un impact réel partout
- les `onglets` pointent vers de vraies vues
- chaque onglet peut definir `Visible si`
- les onglets peuvent s afficher au-dessus, a gauche ou a droite
- en mode vertical, les libelles tournent a `-90` ou `+90` degres selon le cote
- la zone de contenu de l onglet suit la grille de la vue liee
- les references runtime sont interpretees:
  - `@Label`
  - `{{Label}}`
  - `@vue_reference.Label`
- `{{vue_reference.Label}}`
  - `@item.value`
  - `{{item.value}}`
  - mode `fields` : items `{ key, label, value }` derives depuis des champs existants
  - multiselect : `{{Label[]}}`, `{{Label[0]}}`

## Largeur des vues integrees

Chaque vue garde sa propre grille au runtime.

Cela signifie :

- une vue en `24 colonnes` rend sa propre grille en `24 colonnes`
- une vue en `48 colonnes` rend sa propre grille en `48 colonnes`
- une vue integree dans un `Onglet` ou une `Vue liee` ne se recalcule pas automatiquement sur le nombre maximal de colonnes du systeme
- le rendu ne se base pas non plus sur le nombre maximal de colonnes utilisees par les blocs

En pratique, si une vue est declaree en `24 colonnes` mais que ses blocs n occupent que `16 colonnes`, le reste de la largeur reste vide.

### Exemple concret

Cas 1 :

- vue `Resume`
- grille : `24 colonnes`
- les blocs utiles occupent visuellement `16 colonnes`

Resultat :

- la vue garde `8 colonnes` vides
- si cette vue est integree telle quelle dans une autre vue, ce vide reste visible a droite

Cas 2 :

- vue `Fiche personnage`
- grille : `24 colonnes`
- un `Onglet` y affiche la vue `Resume`
- la vue `Resume` appelle ensuite `Fiche complete`
- `Resume` et `Fiche complete` n utilisent que `16 colonnes`

Resultat :

- chaque vue conserve sa propre grille
- le vide a droite est normal tant que la structure de la vue n occupe pas toute la largeur disponible

Ce fonctionnement est volontaire : il permet de creer des vues compactes, des resumes plus etroits, ou des zones reservees a d autres usages.

### Conseils auteur

- pour une fiche plein ecran, utilisez toute la largeur utile de la grille de la vue
- pour une vue compacte integree dans une autre, il est normal de laisser de l espace libre
- si une vue parait "resserree", verifiez d abord combien de colonnes ses blocs occupent reellement

## Debordement vertical des vues integrees

Les composants `Onglets` et `Vue liee` ajoutent maintenant un defilement vertical interne quand la vue integree est plus longue que la zone disponible.

Concretement :

- la vue integree garde sa largeur et sa grille
- si son contenu depasse en hauteur, un ascenseur apparait dans la zone d integration
- cela evite qu une fiche longue casse toute la mise en page de la vue hote, surtout sur telephone

## Source unique

Le Studio systeme V2 est maintenant la source unique pour les fiches personnage et leur runtime.

Le flux actif Partie / fiche de personnage / widget fiche personnage s appuie sur `studioSchemaV2`.

## Profondeur des elements

Le Studio systeme V2 gere maintenant une profondeur propre par element (`zIndex`) en plus de la position sur grille.

Dans le panneau `Selection`, les actions suivantes sont disponibles pour un element seul ou une multi-selection :

- `Avancer`
- `Reculer`
- `Premier plan`
- `Arriere-plan`

Ces actions s appliquent a l interieur du meme scope (racine ou conteneur parent), sans changer la position `x / y / w / h`.

Le canvas d edition et le runtime final utilisent cette profondeur pour afficher correctement les chevauchements.

## Import / export de vue

Le Studio systeme V2 sait maintenant gerer un format d echange dedie pour une vue :

- export de la vue courante en fichier `.system-view.json`
- import d une vue depuis ce format
- l import ajoute une nouvelle vue au systeme courant
- les ids sont regeneres a l import
- le nom et la reference de vue sont rendus uniques automatiquement si besoin

Ce format d echange est volontairement distinct des scripts de conversion source.

## Import JSON d un systeme complet

Depuis la page `Studio systeme`, une zone avancee permet maintenant d importer un systeme complet depuis :

- un fichier `.json` choisi depuis le poste
- ou un JSON colle manuellement

Le flux d import complet reprend maintenant les champs utiles du systeme :

- `name`
- `description`
- `version`
- `author`
- `tags`
- `rollDefinitions`
- `rulesProgram`
- `rulesPresentation`
- `studioTheme`
- `studioSchemaV2`
- `catalogs`
- `discordConfig`

L import cree d abord un nouveau systeme prive en brouillon, puis y reinjecte ces donnees.

Ce flux est adapte aux exports JSON complets de systeme et aux fichiers prepares a part, par exemple dans `docs/...`.

Une validation minimale est appliquee avant import pour eviter les payloads aberrants ou malveillants :

- taille maximale du JSON
- verification de la presence de `name`
- verification de structure sur `studioSchemaV2`
- verification de structure sur `catalogs`
- verification de structure sur `discordConfig`
- plafonds sur le nombre de vues, noeuds, catalogues, colonnes, entrees et definitions de jets

Le backend applique lui aussi des garde-fous sur ces structures lors de la creation et de la mise a jour d un systeme.

Avant import, l interface affiche aussi un petit rapport de prelecture avec :

- nom, version et auteur detectes
- nombre de vues et de noeuds Studio V2
- nombre de vues fiche personnage detectees
- nombre de catalogues et d entrees
- nombre de definitions de jets
- liste des vues detectees
- liste des catalogues detectes
- champs qui seront importes
- champs qui seront ignores
- warnings non bloquants si certaines briques sont absentes

## Scripts de conversion externes

Deux scripts externes permettent de produire un JSON systeme de travail a partir d une source documentaire :

- `node scripts/system-tools/html-to-system-json.mjs mon_fichier.html sortie.json`
- `node scripts/system-tools/pdf-to-system-json.mjs mon_fichier.pdf sortie.json`

Pour le convertisseur PDF :

- le backend et le script externe utilisent `pdftotext`
- on peut forcer le binaire avec `PDFTOTEXT_BIN=/chemin/vers/pdftotext`
- si `pdftotext` est absent ou non executable, la conversion renvoie maintenant un message clair au lieu d un simple `spawnSync pdftotext EACCES`

Ces scripts produisent un `system draft` autonome :

- format `nexusforge.system-draft`
- `suggestedSystem.studioSchemaV2` avec une vue proposee
- `extraction.elements` pour conserver la trace brute des blocs detectes
- `warnings` pour signaler les limites de conversion

Ce format est separe de l import / export natif du studio.


## Runtime interactif

- les champs editables (`texte`, `texte long`, `numerique`, `case`, `liste`, `liste multiple`) sont interactifs dans le runtime
- la creation de personnage et la resolution des vues fiche s appuient sur `studioSchemaV2`
- les formules simples basees sur `@champ` sont recalculees dans ce runtime

## Fonctions disponibles dans les formules

Le runtime V2 accepte des formules numeriques basees sur des references `@champ`, avec des helpers integres pour garder les seuils et comportements dans le JSON du systeme plutot que dans le code.

Ces fonctions sont disponibles dans les formules numeriques du runtime, par exemple pour :

- les jauges
- les calculs derives
- les valeurs conditionnelles
- les affichages qui passent par le moteur de formule numerique

### Syntaxe generale

- une reference de champ : `@force`
- une operation simple : `@force + @agilite`
- une fonction helper : `clamp(@pv, 0, 20)`

### Helpers disponibles

- `ifEq(gauche, droite, si_vrai, si_faux)`
  - retourne `si_vrai` si `gauche == droite`, sinon `si_faux`
- `ifGte(valeur, seuil, si_vrai, si_faux)`
  - retourne `si_vrai` si `valeur >= seuil`, sinon `si_faux`
- `ifLte(valeur, seuil, si_vrai, si_faux)`
  - retourne `si_vrai` si `valeur <= seuil`, sinon `si_faux`
- `min(a, b, ...)`
  - retourne la plus petite valeur
- `max(a, b, ...)`
  - retourne la plus grande valeur
- `abs(valeur)`
  - retourne la valeur absolue
- `floor(valeur)`
  - arrondit a l entier inferieur
- `ceil(valeur)`
  - arrondit a l entier superieur
- `round(valeur)`
  - arrondit a l entier le plus proche
- `clamp(valeur, minimum, maximum)`
  - force la valeur a rester entre `minimum` et `maximum`

### Exemples utiles

- bonus si une valeur atteint un seuil :
  - `ifGte(@force, 8, 2, 0)`
- malus si une ressource tombe sous un seuil :
  - `ifLte(@fatigue, 2, -2, 0)`
- valeur limitee entre deux bornes :
  - `clamp(@pv, 0, 20)`
- moyenne arrondie :
  - `round((@force + @agilite) / 2)`
- ecart absolu :
  - `abs(@karma - @stabilite)`
- minimum garanti :
  - `max(1, @armure)`
- choix conditionnel strict :
  - `ifEq(@etat_alerte, 1, 10, 0)`

### Point important

Ces helpers sont documentes pour le moteur de formule numerique du runtime V2 dans `SystemStudioV2Runtime`.

## Compositeur de formule

Le Studio systeme V2 propose maintenant un bouton `Compositeur de formule` sur les champs de formule importants.

Le compositeur s ouvre dans une fenetre detachee et fournit :

- une zone de recherche et de selection de variables
- une liste des variables par vue avec insertion au clic
- une zone de formule en cours de creation
- une barre d operateurs avec info-bulles
- une zone de test avec valeurs de simulation
- un resultat calcule avec le meme moteur que le runtime V2

Si la fenetre detachee est bloquee par le navigateur, le compositeur bascule automatiquement dans une modale integree au Studio.

Le compositeur couvre les usages suivants :

- formules numeriques
- conditions `Afficher si`
- conditions `Editable si`
- conditions `Visible si` des onglets
- filtres de repetition
- conditions `Actif si` des boutons
- formules d initiative
- formule max des jauges
- formules de jet

L objectif est que cet outil reste la porte d entree principale pour construire les formules auteur, et qu il evolue en meme temps que le moteur de formule.

Le compositeur propose aussi :

- des groupes d operateurs par categorie
- des presets rapides selon le type de formule
- une aide contextuelle selon le champ ouvert
- les dernieres formules appliquees, memorisees localement dans le navigateur
- des variables favorites pour remonter les plus utiles en tete de liste
- des presets personnalises locaux par mode de formule
- une insertion au curseur dans la zone de formule, au lieu d un simple ajout en fin de champ
- le renommage des presets personnalises
- l export / import local de presets au format JSON
- une bibliotheque d exemples metier selon le mode de formule

Le banc de test reste contextuel :

- seules les variables detectees dans la formule courante sont proposees
- chaque variable peut recevoir une valeur de test
- le resultat est recalcule en direct
- pour un jet de des, la formule resolue et un jet de previsualisation sont affiches

Ils ne constituent pas un langage global unique pour tous les moteurs du projet :

- ils s appliquent bien aux formules numeriques du runtime V2
- ils ne remplacent pas a eux seuls toutes les logiques du `rulesProgram` ou des autres services

## Fiche de partie

La page fiche personnage de partie et le widget `Fiche de personnage` du Studio Ecrans utilisent directement ce runtime.

La fiche conserve maintenant deux couches de donnees :

- `sheet.fields` pour le socle de fiche deja en place
- `runtimeValues` comme source native V2 pour les comportements avances, notamment les conteneurs repetables

## Proprietes deja disponibles

Le panneau de proprietes couvre deja un noyau important des proprietes auteur :

- comportement : `Afficher si`, `Editable si`, `Champ requis`, regex et message de validation
- style : fond, couleur de bordure, couleur de texte, style de bordure, masquage de bordure, alignements
- typographie : famille, taille, gras, italique
- texte / nombre : longueur max, lignes visibles, min, max, pas, prefixe, suffixe, decimals, fallback
- champs editables : disposition `colonne`, `ligne` ou `texte cache` pour masquer le libelle visible tout en gardant le champ
- date / heure : champ editable dedie et format associe
- select / multiselect : options et mode d affichage
- checkbox : libelle, forme, style actif
- image : fit, largeur, hauteur, alt
- jauge : formule max, valeurs, pourcentage, orientation, couleurs
- jauge : `Valeur courante` dans les proprietes de l element, `Valeur Max` explicite dans les proprietes de l element, puis options visuelles dans `Jauge`
- jauge : `Placeholder`, `Reference / URL` et `Formule` ne sont plus affiches sur ce composant
- jauge : un toggle `Afficher nom` permet maintenant de masquer le libelle de la jauge
- le panneau Proprietes masque aussi maintenant plusieurs champs generiques quand ils ne servent pas au type courant :
  - `Placeholder` seulement pour `Texte editable` et `Texte long`
  - `Reference / URL` seulement pour `Image editable`
  - `Formule` seulement pour les types qui exploitent reellement un calcul simple (`Texte`, `Texte editable`, `Texte long`, `Numerique`)
  - `Editable si`, validation et `Champ requis` seulement pour les composants editables qui les utilisent vraiment
- les couleurs de champ (`Fond champ`, `Texte champ`, `Bordure champ`) ne sont plus proposees que pour les vrais champs de saisie
- la section `Typographie` est maintenant masquee sur les composants qui n affichent pas de texte stylable utile :
  - `Conteneur`
  - `Onglets`
  - `Image editable`
  - `Vue liee`
- `Vue liee` n affiche plus ses champs techniques internes (`View ID cible`, `Reference cible`) : le select `Vue cible` suffit
- `Bouton` n affiche plus son champ de cible legacy pour les actions qui ont deja leur configuration dediee
- `Bouton` n affiche le champ `Icone` que si le mode de contenu utilise effectivement une icone
- le masquage du nom reste pilote par le type :
  - `Conteneur` et `Onglets` via leur titre
  - champs editables via `Texte cache`
  - `Jauge` via `Afficher nom`
  - les autres composants n affichent pas de libelle runtime separe ou utilisent leur contenu comme texte principal
- bouton : etat actif, contenu texte / icone, icone
- subview : cible par id ou reference
- palette : regroupement par familles `Structure / Champs editables / Affichage`
- studio : panneaux `Palette` et `Proprietes` detachables, avec memorisation de l etat et de la taille des fenetres
- onglets : rattachement de vues, `Visible si`, position `haut / gauche / droite`
- repetition avancee : source tableau, source inter-vues, filtre item, disposition, source derivee depuis des champs de vue, assistant visuel de selection de champs

Des proprietes secondaires pourront encore etre etendues si necessaire, mais la base auteur et runtime principale est deja en place.
