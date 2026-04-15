# Couche sociale

La couche sociale est decouplee des parties.

Elle couvre :

- messagerie privee hors partie
- demandes d amis
- ignorés
- signalements utilisateur

## Messagerie privee

- conversation 1 ↔ 1 uniquement
- pas de salons publics
- pas de groupes
- les messages sont independants du chat de partie
- l URL `/messages?user=<id>` ouvre directement la conversation cible
- les recherches utilisateur passent par une autocompletion a partir de 3 lettres
- le demarrage d une nouvelle conversation reste accessible meme si aucune conversation n existe encore
- la messagerie est disponible pour tous les comptes actifs approuves, MJ compris

## Relations

### Amis

- envoi de demande
- acceptation
- annulation / refus
- les demandes d amis recues sont comptees dans les notifications utilisateur

### Ignorés

Quand un utilisateur est ignore :

- les demandes d ami entre les deux comptes sont bloquees
- la messagerie directe est bloqueee
- ses annonces d accueil sont masquees automatiquement

## Signalements

Chaque utilisateur peut signaler un autre compte avec :

- un motif
- des details optionnels

Les admins voient ensuite :

- les signalements `open`
- les signalements `reviewing`
- les signalements `closed`

## Portee

Cette couche sert de base pour :

- la mise en relation MJ / joueurs
- le partage des templates ecran et des systemes via la visibilite `friends`
- les interactions sociales hors partie
- les champs de recherche utilisateur reutilises aussi dans :
  - `Partie`
  - `Mes fichiers`
  - `Messagerie`

Elle sert aussi de base future pour un bot Discord, notamment pour :

- les notifications admin
- certaines alertes sociales
- plus tard, des interactions utilisateur ciblees apres liaison de compte

## Notifications

- le menu `Messagerie` dans le profil affiche le nombre de messages non lus
- `Mes contacts` affiche le nombre de demandes d amis recues
- l avatar cumule maintenant :
  - messages non lus
  - invitations de partie en attente
  - demandes d amis recues

## Annonces

Les annonces ont maintenant une page dediee :

- creation et gestion de ses annonces via `Annonces`
- consultation publique depuis l accueil connecte
- moderation admin depuis `Admin contenu`
- filtrage par :
  - type
  - systeme
  - langue
  - format
  - periodicite
  - jours disponibles
  - creneaux horaires

Le formulaire d annonce est entierement structure :

- aucun texte libre public
- jours de la semaine en multiselection
- creneaux horaires en multiselection
- periodicite en choix unique

## Extension Discord

Un cadrage dedie existe maintenant pour la future integration Discord :

- [Bot Discord](../discord-bot.md)

La trajectoire retenue est :

- V1 : news produit et notifications admin
- V2 : liaison de compte Discord <-> Nexus Forge
- V3 : interactions utilisateur legeres
