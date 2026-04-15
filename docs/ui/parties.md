# Partie - Nexus Forge

La page `Partie` est le centre de pilotage d une table de jeu.

Dans l interface utilisateur, on parle de `partie`.

## Objectif

Une partie relie :

- le systeme de jeu
- les MJ et joueurs
- les personnages
- les ecrans de partie
- les documents de partie
- les regles de table

Prerequis :

- le systeme choisi doit etre `published`
- il doit contenir au moins une vue marquee `Vue de fiche personnage`

## Offline first

La partie reste utilisable hors ligne sur le poste local :

- la partie et ses reglages restent caches en IndexedDB
- les personnages, notes, messages et fichiers deja disponibles localement restent consultables
- les modifications locales repartent ensuite dans la file de synchronisation a la reconnexion

La messagerie reseau hors partie n a pas vocation a fonctionner hors ligne.
La messagerie de partie, elle, continue de s appuyer sur la couche locale puis sur la resynchronisation quand le backend redevient disponible.

## Structure de la page Partie

La page `Partie` est structuree en 3 onglets :

- `General`
  - resume compact en lecture seule
  - participants actifs
  - personnages visibles selon le role
  - documents de partie
- `Parametres`
  - edition du resume de partie
  - invitations et participants
  - ecrans de la partie
  - regles de table
  - gestion complete des personnages
- `Log et securite`
  - journal de table
  - synchronisation et conflits

## Page Parties

La page `Parties` :

- affiche d abord les parties ou l utilisateur participe effectivement
- affiche ensuite le formulaire de creation pour les MJ
- conserve un bloc separe pour les invitations en attente
- ne montre plus les parties hors participation, meme pour un admin

## Resume de partie

- nom
- description
- etat
- systeme de jeu actif
- lien rapide vers le Studio système
- affichage des personnes avec pseudo ou nom lisible plutot qu identifiants techniques quand la donnee est disponible

## Participants

- liste des participants actifs
- invitations en attente
- role par participant :
  - `MJ`
  - `Joueur`
  - `Observateur`
- attribution d un personnage a un participant
- invitation guidee d un participant depuis la recherche d utilisateurs
  - invitation comme `joueur`
  - invitation comme `MJ`
  - invitation comme `observateur`
- acceptation ou refus d une invitation par l utilisateur invite
- annulation ou relance d une invitation en attente par le MJ
- retrait d un participant
- sortie volontaire `Quitter la partie` pour un participant non proprietaire

Quand un participant quitte ou est retire :

- son entree est retiree de la table
- sa fiche reste dans la partie mais devient `Non attribuee`
- le MJ peut ensuite la reattribuer ou la laisser comme `Modele MJ`

## Personnages de la partie

- liste des personnages lies a la partie
- creation depuis une vue du systeme marquee `Vue de fiche personnage`
- creation joueur guidee
- duplication d un pre-tire par le MJ avant attribution a un joueur
- attribution optionnelle a un participant
- statuts visuels :
  - `Modele MJ`
  - `Clone joueur`
  - `Fiche attribuee`
- ouverture de la fiche dans un nouvel onglet
- la fiche utilise le meme moteur de rendu que l apercu final du Studio système

Regle de suppression :

- une fiche joueur n est supprimee definitivement que par son proprietaire
- un MJ peut seulement la retirer de la partie
- un modele MJ non attribue peut etre supprime par le MJ

## Regles de table

- edition de fiche hors ligne
- chat entre joueurs
- partage de fichiers entre joueurs
- mode silence
- override du mode d initiative de la partie :
  - `system_default`
  - `combat_once`
  - `round_recalc`
  - `gm_fixed`
  - `manual_turn`

## Studio Ecrans de la partie

- template actif pour l utilisateur courant
- template MJ par defaut pour la partie
- template joueur propose aux joueurs
- clonage du template propose vers un template personnel

## Synchronisation et conflits

La page `Partie` expose un panneau de suivi offline-first :

- nombre d actions locales en attente
- echecs de synchronisation
- conflits de synchronisation
- relance manuelle d un cycle de synchronisation
- resolution par champ :
  - `Garder local`
  - `Garder serveur`
- actions rapides :
  - `Rejouer`
  - `Ignorer`

## Journal de table

La page `Partie` expose aussi un journal d activite recent :

- creation ou mise a jour de la partie
- invitations envoyees, relancees, annulees, acceptees ou refusees
- creation, duplication, retrait ou suppression de fiches
- retraits et departs de participants

## Fichiers de partie

Vue rapide des fichiers visibles dans la partie :

- fichiers `Commun`
- fichiers `MJ uniquement`
- fichiers cibles ou prives

## Actions rapides et runtime

Le rendu des ecrans de partie repose sur le Studio Ecrans.

Les actions de table directes sont placees dans le header :

- demarrer la partie
- mettre en pause
- reprendre
- marquer terminee
- ouvrir le catalogue des ecrans
- ouvrir `Mes fichiers`
- detacher rapidement les ecrans secondaires du set actif

Quand on clique sur `Demarrer la partie` ou `Ouvrir l interface`, la page `Partie` bascule vers une vue runtime dediee.

Cette vue runtime :

- masque la navigation generale de l application pour reduire l espace perdu
- affiche un header compact rattache au nom de l ecran actif
- peut passer en plein ecran
- montre uniquement :
  - le nom de la fenetre ou de l ecran
  - le nom du template et de la partie
  - le set actif
  - les actions utiles (`Retour a la partie`, changement de set, ouverture des fenetres secondaires)

Si le set actif contient plusieurs ecrans, le runtime ouvre :

- une fenetre principale pour le premier ecran principal
- une fenetre separee pour chaque ecran secondaire du set

## Nettoyage applique

- le studio de session base sur `dashboardProfiles` n est pas utilise dans le flux actuel
