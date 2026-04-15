# Catalogues système et collections d instances

## Objectif

Cette roadmap cadre l evolution du Studio système pour gerer proprement des donnees de reference reutilisables dans les fiches :

- objets
- armes
- armures
- consommables
- sorts
- talents
- vehicules
- tout autre ensemble de donnees de systeme

Le principe retenu est de separer clairement :

1. les donnees de reference du systeme
2. les donnees possedees ou choisies par un personnage

## Modele cible

### 1. Catalogue système

Un catalogue systeme est une collection de reference definie par le systeme.

Exemples :

- `catalogue_objets`
- `catalogue_armes`
- `catalogue_armures`

Chaque entree contient :

- un identifiant technique stable
- un libelle
- un type
- un ensemble de proprietes metier

Exemple :

```json
{
  "id": "revolver_standard",
  "nom": "Revolver standard",
  "type": "arme",
  "degats": "1d10",
  "portee": "courte",
  "poids": 2,
  "rarete": "courant"
}
```

### 2. Collection d instances sur la fiche

Une fiche personnage ne stocke pas le catalogue lui-meme, mais des instances derivees du catalogue.

Exemple :

```json
{
  "templateId": "revolver_standard",
  "nom": "Revolver standard",
  "type": "arme",
  "degats": "1d10",
  "munitions": 4,
  "equipe": true,
  "notes": "grave au nom du PJ"
}
```

Ce modele permet :

- de garder le lien avec l entree source
- de copier les donnees utiles au moment de l ajout
- d autoriser des variations par personnage

## Cas d usage cibles

### Inventaire

- objets
- armes
- armures
- consommables

### Progression

- talents appris
- sorts connus
- disciplines debloquees

### Monde et campagne

- contacts
- factions
- vehicules
- compagnons
- ressources scenario

## Actions runtime cibles

Le runtime doit evoluer pour proposer des actions sur ces collections.

Actions minimales :

- `Ajouter depuis catalogue (popup)`
- `Supprimer item`
- `Dupliquer item`
- `Modifier item`
- `Deplacer item`
- `Equiper / desequiper`
- `Augmenter quantité`
- `Diminuer quantité`

Action cle :

1. le joueur ouvre son inventaire
2. clique sur `Ajouter`
3. choisit un item dans le catalogue cible
4. une instance de cet item est ajoutee a sa collection de fiche

## Permissions

### Joueur

- voir les catalogues autorises
- ajouter certains items a sa fiche
- modifier seulement certains champs d instance
- retirer certains items

### MJ

- acces complet aux catalogues
- ajout / retrait force sur une fiche
- edition de toutes les collections
- reglage des restrictions par vue ou par action

## Place dans le Studio système

Le Studio systeme devra proposer deux niveaux distincts.

### 1. Catalogues système

Un espace auteur dedie pour definir :

- le nom du catalogue
- sa cle technique
- les colonnes / proprietes
- les entrees

### 2. Vues de fiche

Les vues de fiche consomment ensuite les catalogues via :

- conteneurs repetables
- actions d ajout depuis catalogue
- filtres
- edition d instances

## Roadmap retenue

### V1 - Socle catalogue + inventaire

- catalogues systeme
- creation / suppression de catalogue
- definition des colonnes
- grille d edition des entrees
- import / export CSV
- collections d instances sur personnage
- action `Ajouter depuis catalogue (popup)`
- affichage repetable d inventaire via collection runtime
- cas de reference : objets / armes / armures

### V2 - Usage avance joueur / MJ

- recherche et filtres dans les catalogues
- quantite
- duplication d item
- equiper / desequiper
- edition partielle des champs d instance
- droits plus fins MJ / joueur

### V3 - Evolution et synchronisation

- synchronisation optionnelle avec le catalogue source
- variantes d items
- templates d instances
- transfert entre personnages
- butin / coffre / marchand / stockage commun

## Decision de cadrage

La direction retenue pour Nexus Forge est :

- partir sur des `catalogues système`
- les utiliser comme source de reference
- creer ensuite des `collections d instances` sur les fiches
- brancher les actions runtime de manipulation autour de ce modele

Ce chantier est retenu comme feuille de route officielle pour l evolution de l inventaire et des donnees similaires dans le Studio système.

## Etat actuel - V1 deja en place

Le socle auteur et runtime suivant est maintenant disponible :

- bouton `Catalogues systeme` dans le Studio systeme
- gestion d une liste de catalogues
- edition d un catalogue vide :
  - nom
  - cle technique
  - colonnes
  - entrees
- types de colonnes V1 :
  - `text`
  - `textarea`
  - `number`
  - `checkbox`
  - `select`
- import CSV
- export CSV
- nouvelle action de bouton runtime :
  - `Ajouter depuis catalogue (popup)`
  - `Dupliquer item`
  - `Equiper / desequiper`
  - `Augmenter quantité`
  - `Diminuer quantité`
  - `Supprimer item`
- cette action permet de :
  - choisir un catalogue source
  - choisir une collection cible de runtime
  - ouvrir une popup de selection
  - instancier l entree choisie dans les `runtimeValues` du personnage

Dans la popup runtime :

- l action `Ajouter` apparait au debut de chaque ligne
- un clic sur la ligne ajoute aussi l entree
- l identifiant interne `id` reste reserve au moteur et ne doit pas etre expose comme colonne metier par defaut

L action `Supprimer item` permet maintenant de retirer un element d une collection repetee, a condition que la repetition repose sur une vraie collection runtime et non sur un derive `fields`.

L action `Dupliquer item` permet de cloner l item courant dans cette meme collection.

L action `Equiper / desequiper` bascule la propriete `equipe` de l item courant dans cette meme collection.

Les actions `Augmenter quantité` et `Diminuer quantité` modifient la propriete `quantite` de l item courant dans cette meme collection. La diminution ne descend pas en dessous de `0`.

Lorsqu un item a `equipe = true`, le runtime applique aussi un etat visuel `equipe` sur son bloc repete, afin de rendre l inventaire plus lisible en partie.

Lorsqu un bouton `Ouvrir popup vue` est place dans une repetition runtime, la popup peut maintenant servir de vue detaillee pour l item courant et modifier directement ses champs.

## Structure d instance V1

Lorsqu une entree est ajoutee depuis un catalogue, l instance creee dans la collection cible contient :

- les valeurs copiees depuis l entree du catalogue
- `instanceId`
- `catalogKey`
- `templateId`
- `quantite = 1`
- `equipe = false`
- `notes = ""`

## Limites actuelles

Le socle V1 ne couvre pas encore :

- recherche / filtres avances dans les gros catalogues
- synchronisation catalogue source -> instance
- permissions fines MJ / joueur sur les catalogues
