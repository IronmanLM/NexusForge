# Bot Discord

Ce document cadre une future integration Discord pour Nexus Forge.

L objectif est double :

- diffuser les informations produit vers des serveurs Discord relies a Nexus Forge
- ouvrir plus tard certaines interactions utilisateur legeres sans sortir de Discord

Le bot doit rester une brique separee du backend principal, meme s il consomme ses evenements et ses API.

## Objectifs

Le bot doit couvrir plusieurs usages distincts.

### Information et communication

- publier les mises a jour produit
- publier les nouvelles versions Android / iOS
- publier les corrections importantes
- publier les annonces de maintenance

### Notifications admin

- signaler un utilisateur en attente de validation
- signaler certains evenements de moderation
- envoyer ces notifications soit dans un canal staff, soit en message prive aux admins configures

### Interactions utilisateur plus tard

- consulter certaines informations de fiche personnage
- recevoir des rappels
- lancer quelques actions simples

L edition riche d une fiche complete via Discord n est pas une cible V1.

Les premiers outils Discord V2 maintenant en place restent volontairement simples :

- `/nf-partie` dans un salon de partie pour afficher un resume de la partie liee
- `/nf-jet formule:...` dans un salon de partie pour lancer un jet simple directement depuis Discord

Les commandes liees aux fiches personnage viendront apres validation du flux d invitations et des salons a plusieurs comptes.

Une premiere passe systeme-driven est maintenant en place :

- `/nf-fiche`
- `/nf-inv`
- `/nf-note`
- `/nf-vue1` a `/nf-vue9`

Ces deux commandes ne lisent plus un format fixe code en dur dans le bot.
Elles demandent au backend de rendre la sortie configuree dans `discordConfig` pour :

- `sheet`
- `inventory`
- `notes`

Le bot se contente ensuite d afficher la reponse en texte ou en embed, avec respect de la visibilite resolue.

Pour les sorties en embed, le bot sait maintenant extraire une image si le template contient une ligne qui est directement une URL d image, une image Markdown `![](...)` ou une image encodee en `data:image/...;base64,...`.

## Couche systeme retenue pour Discord

La logique Discord ne doit pas supposer une structure universelle de fiche ou d inventaire.

La direction retenue est donc :

- une configuration `discordConfig` stockee dans le systeme
- lecture seule uniquement pour cette phase
- aucune ecriture ni modification de fiche depuis Discord

### Sorties normalisees retenues

- `sheet`
- `inventory`
- `notes`
- `view1` a `view9`

### Principe

Chaque sortie Discord correspond a une lecture configurable du systeme :

- libelle affiche
- description
- source de donnees
- template texte ou embed
- visibilite autorisee

Le bot ne doit pas imposer de metier comme `PV`, `mana` ou `arme equipee`.

### Schema de base retenu

`discordConfig` contient :

- `version`
- `outputs`

Chaque `output` contient :

- `key`
- `label`
- `description`
- `enabled`
- `commandName` optionnel
- `format`
- `defaultVisibility`
- `allowedVisibilities`
- `sourceType`
- `sourceRef`
- `template`
- `itemTemplate`
- `emptyTemplate`
- `maxItems`

### Contraintes retenues

- `sourceType` est actuellement limite a :
  - `sheet`
  - `collection`
  - `notes`
  - `view`
- `format` est actuellement limite a :
  - `text`
  - `embed`
- `allowedVisibilities` est actuellement limite a :
  - `public`
  - `private`

### Intention produit

Cette couche permettra plus tard de brancher des commandes courtes du type :

- sortie standard
- sortie libre `view1..9`

Mais sans coder dans le bot une interpretation metier specifique a un systeme.

## Premiere consommation reelle par le bot

Le backend expose maintenant aussi un endpoint interne pour le bot :

- `GET /api/integrations/discord/session-output`

Ce endpoint est securise par le secret partage du bot et resolve :

- la session
- le compte Nexus Forge lie au compte Discord
- le participant dans la partie
- la fiche personnage associee
- la sortie `discordConfig` demandee

Pour cette premiere passe, les types de source effectivement rendus sont :

- `sheet`
- `collection`
- `view`
- `notes`

Les sorties `view1..9` et `notes` sont maintenant consommees par le bot en lecture seule.

### Resolution de contexte

Pour une sortie `sheet`, le rendu peut utiliser :

- les valeurs de fiche `runtimeValues`
- les champs de `character.sheet.fields`
- `@session.*`
- `@system.*`
- `@user.*`
- `@participant.*`
- `@character.*`

Il peut aussi maintenant utiliser des acces scopes par vue :

- `{{Identitee.nom_du_personnage}}`
- `{{Identitee.Description}}`
- plus generalement `{{VueRef.cle}}`

Le backend accepte ces alias de vue si la vue possede :

- une `reference`
- un `id`
- ou un nom normalise exploitable

Pour une sortie `collection`, la `sourceRef` pointe sur une collection presente dans la fiche, par exemple :

- `inventaire`
- `armes_joueurs`

Le `itemTemplate` est rendu pour chaque element avec :

- `@item.*`
- `@index`
- `@position`

Pour une sortie `view`, le rendu reste template-driven et peut utiliser le meme contexte general.
Si `sourceRef` correspond a une vue du systeme (par `id`, `reference` ou `name`), le contexte expose aussi :

- `@view.id`
- `@view.name`
- `@view.reference`

## Aide auteur dans le Studio

Le Studio systeme propose maintenant un editeur detache pour les templates Discord :

- plein format
- matrice de variables par vue
- insertion au curseur
- ouverture de la fenetre detachee directement au clic utilisateur
- fallback en modale integree si la fenetre detachee est tout de meme bloquee
- barre d aide Markdown pour inserer gras, titres, listes, citations, liens et separateurs sans connaitre la syntaxe

Pour une sortie `notes`, le backend charge uniquement les notes visibles pour l utilisateur selon les regles Nexus Forge existantes :

- `public`
- `gm_private` si l utilisateur est MJ
- `player_private` si l utilisateur est proprietaire ou auteur

Le `itemTemplate` peut utiliser :

- `@note.title`
- `@note.content`
- `@note.type`
- `@note.createdAt`
- `@note.updatedAt`
- ainsi que `@item.*`, `@index` et `@position`

### Visibilite

Le bot demande une visibilite souhaitee (`public` ou `private`) mais le backend applique la configuration du systeme :

- `defaultVisibility`
- `allowedVisibilities`

Donc :

- si `public` n est pas autorise, la reponse retombe automatiquement sur `private`
- le bot affiche ensuite la reponse en message public ou prive selon la visibilite resolue

## Positionnement

Le bot Discord n est pas un remplacement du site web.

Le site reste le point principal pour :

- gerer un compte
- administrer une partie
- construire un systeme
- modifier une fiche complexe

Discord apporte plutot :

- une diffusion d informations
- une notification plus reactive
- des interactions courtes

## Architecture cible

Le bot doit etre isole du backend principal.

### Service bot dedie

Un service dedie permet de separer :

- la connexion Discord
- les permissions Discord
- les webhooks / interactions slash
- les files d envoi
- les reprises sur erreur

Un premier socle technique existe maintenant dans :

- [discord-bot](../discord-bot)

### Backend Nexus Forge

Le backend principal reste responsable de :

- l authentification Nexus Forge
- les donnees metier
- les validations de droits
- l emission d evenements vers le bot

## Evenements backend cibles

Le bot doit reagir a des evenements explicites plutot qu a des lectures permanentes de la base.

### Evenements V1

- `release.published`
- `news.published`
- `user.pending_validation`

Le backend expose maintenant :

- `GET /api/integrations/discord/events`

avec authentification par secret partage.

Une publication manuelle de release est aussi disponible via :

- `POST /api/admin/integrations/discord/releases`

### Evenements V2

- `social.report.created`
- `session.invitation.created`
- `session.reminder.due`
- `session.discord.sync`
- `announcement.sync`

Le flux `session.invitation.created` est maintenant branche :

- le backend envoie un DM Discord si la cible a un compte Discord lie
- le DM contient un lien securise `Accepter` / `Refuser`
- le clic met a jour l invitation Nexus Forge
- une acceptation relance la synchronisation du salon de partie si besoin

### Evenements V3

- `character.sheet.updated`
- `character.roll.created`
- `resource.shared`

## Configuration par serveur Discord

Chaque serveur Discord connecte doit pouvoir definir sa configuration propre.

### Configuration minimale

- `guildId`
- `guildName`
- `enabled`
- `newsChannelId`
- `staffChannelId`
- `adminRoleId` optionnel
- `notifyPendingValidation`
- `notifyReleases`
- `notifyNews`

### Regles

- aucun envoi si le serveur n est pas explicitement connecte
- chaque type de notification doit pouvoir etre active ou coupe
- les messages staff ne doivent pas aller dans le canal news

## Liaison compte Discord <-> Nexus Forge

Cette liaison n est pas indispensable pour la V1 news, mais elle devient necessaire pour les interactions utilisateur.

### Donnees a stocker

- `discordUserId`
- `discordUsername` ou nom d affichage courant
- `nexusForgeUserId`
- `linkedAt`
- `revokedAt` optionnel

### Regles

- une liaison doit etre explicitement validee
- la suppression de la liaison doit etre possible
- les actions privees ne doivent jamais se baser uniquement sur un pseudo Discord

### Flux OAuth2 retenu

- le site Nexus Forge reste le point de depart de la liaison
- l utilisateur doit etre connecte a Nexus Forge avant de lancer la liaison
- Nexus Forge demande le scope Discord `identify`
- le backend effectue l echange du `code` OAuth2 contre un token
- le backend recupere ensuite `/users/@me` chez Discord
- l identite Discord est stockee sur le compte Nexus Forge
- une meme identite Discord ne peut pas etre liee a deux comptes Nexus Forge differents

### Variables d environnement requises

- `DISCORD_OAUTH_CLIENT_ID`
- `DISCORD_OAUTH_CLIENT_SECRET`
- `DISCORD_OAUTH_REDIRECT_URI`

### Route de callback recommandee

- `https://nexusforge.en-ligne.fr/auth/discord/callback`

## Fonctionnalites V1

La V1 doit rester simple et rentable.

### Publication de news

Le bot poste dans un canal dedie :

- nouvelles versions Android
- nouvelles versions iOS
- gros correctifs
- nouvelles fonctionnalites

Le socle actuel envoie deja :

- `news.published`
- `release.published`

### Notification staff

Le bot alerte lorsqu un utilisateur est en attente de validation.

Formats possibles :

- message dans un canal staff
- message prive a une liste d admins configures

Le socle actuel envoie deja :

- `user.pending_validation`

L emission est faite au moment de la validation email, ce qui evite les faux positifs sur des comptes jamais verifies.

### Commandes simples

- statut du service
- version de l application
- aide rapide

### Commandes de partie V2

Dans les salons de partie lies, le bot enregistre maintenant des commandes slash de base :

- `/nf-partie`
- `/nf-jet`

Regles actuelles :

- `/nf-partie` fonctionne seulement dans un salon Discord de partie lie
- `/nf-jet` fonctionne seulement dans un salon Discord de partie lie
- la formule du jet accepte pour l instant :
  - `1d20`
  - `2d6+3`
  - `1d100-10`
- le bot refuse les formules trop larges ou invalides pour garder un comportement stable

### Tableau de bord web

Le bot expose maintenant aussi une petite interface web sur son sous domaine :

- `bot.nexusforge.en-ligne.fr`

Cette interface est maintenant protegee par connexion Discord OAuth2.

Cette interface V1 permet de voir :

- si le bot est connecte
- le compte Discord charge
- les serveurs rejoints
- les canaux news et staff configures
- le dernier evenement traite
- un historique recent des evenements dispatches

Elle permet aussi maintenant :

- a chaque admin/proprietaire de serveur Discord ou le bot est installe :
  - de choisir le salon de news pour ce serveur
- au compte owner Discord Nexus Forge uniquement :
  - de regler les canaux staff globaux
  - de regler les destinataires DM staff globaux

Une version JSON est aussi exposee pour diagnostic simple :

- `/status.json`

Un endpoint public minimal reste disponible pour le monitoring :

- `/health`

## Fonctionnalites V2

La V2 introduit la liaison de compte et les premieres interactions utiles.

### Liaison de compte

- lier un compte Discord a un compte Nexus Forge
- confirmer la liaison de facon securisee

### Vision V2 retenue

La V2 ne doit pas etre pensee comme une integration reservee au serveur Discord principal de Nexus Forge.

Le bot doit etre concu des maintenant pour :

- fonctionner sur plusieurs serveurs Discord
- permettre a des communautes tierces d inviter le bot sur leur propre serveur
- gerer ensuite leurs parties et leurs annonces depuis Nexus Forge

Le serveur principal Nexus Forge reste un premier serveur reel de reference, mais pas un cas special de conception.

## V2.1 Configuration multi-serveurs Discord

Chaque serveur Discord ou le bot est installe doit disposer de sa propre configuration.

### Donnees cibles

- `guildId`
- `guildName`
- `enabled`
- `recruitmentChannelId`
- `sessionsCategoryId`
- `gmRoleId` optionnel
- `playerRoleId` optionnel
- `createdByDiscordUserId`
- `updatedAt`

### Regles

- un serveur Discord est configurable uniquement si le bot y est present
- seuls les comptes Discord proprietaires ou administrateurs du serveur peuvent modifier sa configuration
- certains reglages restent globaux et reserves au compte owner Nexus Forge

## V2.2 Recrutement synchronise Discord

Les annonces de recherche de joueurs ou de MJ doivent etre synchronisees avec Discord.

### Flux cible

- creation d annonce sur le site -> publication dans le salon recrutement du serveur choisi
- modification d annonce -> mise a jour du message Discord
- cloture ou suppression d annonce -> suppression ou archivage du message Discord

### Donnees a stocker

- `announcementId`
- `discordGuildId`
- `discordChannelId`
- `discordMessageId`
- `publishedAt`
- `updatedAt`

### Regles

- une annonce n est envoyee que si le serveur cible a un salon recrutement configure
- le bot ne doit jamais publier une meme annonce plusieurs fois sans mapping persistant
- la suppression ou cloture doit rejaillir aussi cote Discord

### Etat actuel

- le tableau de bord du bot permet maintenant de choisir un `salon news` et un `salon recrutement` par serveur
- le backend publie des evenements `announcement.sync`
- le bot publie ou met a jour le message Discord de recrutement dans les salons configures
- la cloture ou la suppression d une annonce supprime aussi le message Discord associe

## V2.3 Salons de parties geres par le bot

Les salons de parties ne doivent pas etre relies a des salons existants choisis manuellement.

La decision retenue est :

- le bot cree lui meme le salon Discord de la partie
- le bot en gere les permissions
- le bot en gere le cycle de vie

### Donnees cibles

- `sessionId`
- `discordGuildId`
- `discordCategoryId`
- `discordChannelId`
- `discordChannelName`
- `status` (`active`, `archived`, `deleted`)
- `createdByUserId`
- `createdAt`
- `updatedAt`

### Creation

Lorsqu une partie est reliee a Discord :

- selection du serveur Discord cible
- verification que ce serveur est configurable
- verification qu une categorie `parties` est definie
- creation d un salon prive dedie par le bot

### Permissions V2 retenues

Pour la V2, la gestion des acces se fait d abord par permissions utilisateurs directes.

Pourquoi :

- ne pas imposer une structure de roles Discord aux communautes
- garder un comportement previsible
- simplifier le premier jet multi serveurs

Des roles Discord optionnels pourront etre ajoutes plus tard.

### Participants autorises

Ont acces au salon de partie :

- MJ de la partie
- joueurs valides dans la partie
- compte owner ou staff Discord eventuellement definis a terme

N ont pas acces :

- membres non participants
- joueurs invites mais non acceptes
- comptes non lies si la liaison est requise pour l acces

### Cycle de vie

Le bot doit reagir a la vie de la partie :

- creation du salon
- mise a jour du nom si besoin
- ajout des nouveaux participants valides
- retrait des participants quittant la partie
- archivage ou suppression du salon si la partie est archivee ou supprimee

### Etat actuel

- le tableau de bord du bot permet maintenant de choisir une `categorie des salons de partie` par serveur Discord
- une partie Nexus Forge peut maintenant demander la creation ou la synchronisation de son salon Discord prive
- le bot cree le salon texte dans la categorie configuree
- le bot renomme et resynchronise le salon quand la partie ou ses participants changent
- l archivage de la partie archive aussi le salon Discord
- la suppression de la partie ou la suppression de la liaison ferme le salon cote bot

## V2.4 Invitations de partie via Discord

Un joueur ou MJ invite dans une partie doit pouvoir etre notifie sur Discord.

### Flux cible

- invitation creee sur le site
- DM Discord envoye a l utilisateur si son compte est lie
- l utilisateur peut accepter ou refuser

### Reponse utilisateur

Deux niveaux sont possibles :

- V2 initiale :
  - DM avec lien securise vers Nexus Forge
- V2 evoluee :
  - boutons Discord natifs `Accepter` / `Refuser`

La V2 initiale peut commencer par le lien securise si cela accelere la livraison.

### Effet de l acceptation

Quand l utilisateur accepte :

- son statut de participation est mis a jour
- s il doit avoir acces au salon Discord de partie, le bot lui ouvre cet acces

Quand il refuse :

- le statut de participation est mis a jour
- aucun acces au salon n est accorde

## V2.5 Outils de partie dans le salon Discord

Une fois le salon de partie en place, le bot peut offrir des outils utiles directement dans ce salon.

### Cibles raisonnables

- lancer un jet
- afficher le resultat du jet
- voir un resume simple de fiche
- voir certaines informations utiles d inventaire

### Ce qui n est pas vise tout de suite

- edition riche complete de fiche personnage
- administration lourde de session
- edition de masse

## Separation owner-only

Certaines fonctions restent strictement reservees au compte owner Discord Nexus Forge :

- canaux globaux de moderation / validation
- notifications `user.pending_validation`
- liste des admins recevant des DM staff

Ces reglages ne doivent pas etre delegues aux autres serveurs Discord.

## Fonctionnalites V3

La V3 ouvre des interactions metier plus directes.

### Actions legeres

- lancer un jet
- consulter un resultat recent
- voir certains etats de personnage

### Actions a cadrer finement

- petite mise a jour de valeur
- validation simple
- interaction sur inventaire

L edition libre d une fiche complete ne doit venir qu apres :

- liaison de compte fiable
- permissions robustes
- journalisation

## Permissions et securite

Le bot ne doit jamais contourner les droits Nexus Forge.

### Principes

- toutes les actions privees doivent verifier les droits cote backend
- le bot ne doit jamais faire confiance a un simple identifiant Discord sans liaison valide
- les messages prives admin doivent etre limites aux destinataires autorises
- les actions sensibles doivent etre journalisees

### Protections ciblees

- anti abus sur les commandes
- anti spam sur les canaux news
- limitation des retries
- sanitation stricte des contenus postes

## UX des messages

Le bot doit rester lisible et peu bruyant.

### Canal news

Messages courts, structures, avec :

- titre
- resume
- lien vers le site ou la page utile

### Canal staff

Messages plus operationnels avec :

- type d alerte
- utilisateur concerne
- lien d action dans Nexus Forge

## Roadmap retenue

### V1

- bot Discord dedie
- connexion a un ou plusieurs serveurs
- canal news
- canal staff
- publication des mises a jour produit
- notification `user.pending_validation`
- lecture d une file d evenements backend securisee

### Etat actuel du socle V1

- dossier `discord-bot` ajoute au repo
- polling backend sur `GET /api/integrations/discord/events`
- persistance locale du dernier evenement traite
- endpoint HTTP minimal de sante pour hebergement type cPanel / Passenger
- diffusion vers :
  - canaux news
  - canaux staff
  - messages prives staff optionnels
- bootstrap configurable :
  - `latest`
  - `replay`

### V2

- liaison compte Discord <-> Nexus Forge
- notifications ciblees
- lecture simple d informations utilisateur

### V3

- interactions metier legeres
- actions autour des fiches et jets
- extension progressive selon les droits et les usages

## Priorites produit

Ordre recommande :

1. diffusion des news et versions
2. notification admin des validations en attente
3. liaison de compte
4. consultation simple
5. actions fiche personnage legeres

## Point d attention

La promesse "agir sur sa fiche via Discord" est attractive, mais elle ne doit pas faire deriver la V1.

La bonne trajectoire est :

- informer
- notifier
- lier les comptes
- consulter
- agir legerement

Cette progression limite les risques tout en apportant rapidement de la valeur.
