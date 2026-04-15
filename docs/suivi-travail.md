# Suivi du travail – Nexus Forge

Ce document sert de référence unique pour suivre l'avancement du projet.
Il est mis à jour à chaque lot de travail significatif.

Dernière mise à jour: 2026-03-28

## Dernier lot - Libelles de champs stylables et conteneurs silencieux

- les conteneurs sans enfant n affichent plus `Conteneur vide` dans le runtime
- les champs editables peuvent maintenant choisir si leur libelle utilise :
  - un style `commun avec le champ`
  - ou un style `separe`
- quand le style du libelle est `separe`, on peut definir :
  - couleur du libelle
  - famille typographique du libelle
  - taille du libelle
  - gras du libelle
  - italique du libelle
- cette logique existe maintenant :
  - au niveau systeme
  - au niveau vue
  - au niveau element
- l heritage visuel fonctionne donc aussi sur les libelles de champs editables

## Dernier lot - Auto-save Studio systeme V2

- le Studio systeme V2 enregistre maintenant automatiquement les modifications apres un court delai d inactivite
- le bouton `Enregistrer` reste disponible pour forcer une sauvegarde immediate
- un etat visuel indique maintenant :
  - `Studio synchronise`
  - `Modifications en attente d enregistrement`
  - `Enregistrement en cours`
- le navigateur affiche desormais une alerte si on tente de quitter la page avec des changements non encore sauves
- le Studio tente aussi une sauvegarde immediate quand l onglet passe en arriere plan
- correction backend : les mutations de systeme (`create`, `update`, `delete`, `duplicate`) redemandent maintenant explicitement la persistance de `state.json`, pour eviter une perte de changements au redemarrage ou apres deploiement

## Dernier lot - Minimum et maximum en formule

- les champs numeriques editables peuvent maintenant definir `Minimum` et `Maximum` avec :
  - une valeur fixe
  - ou une formule
- le panneau proprietes propose maintenant ces champs en texte + compositeur de formule
- le runtime evalue ces formules pour :
  - contraindre le champ numerique
  - valider la valeur saisie
- les anciens systemes avec `min` / `max` numeriques restent compatibles

## Dernier lot - Gestion des systemes auteur

- les systemes peuvent maintenant etre supprimes par leur proprietaire
- si un systeme n est rattache a aucune partie, il est supprime
- s il reste utilise par au moins une partie, il est retire de la liste auteur mais conserve en copie interne pour ces parties
- la creation d un systeme vierge passe maintenant par defaut en `public`
- le panneau de gestion des systemes permet de nouveau d ajouter des co-auteurs via la liste d amis
- les co-auteurs alimentent `editorUserIds` et peuvent modifier un systeme meme s il reste prive
- les vues du Studio systeme peuvent maintenant etre reclassees avec `Monter` / `Descendre`

## Dernier lot - Jauge clarifiee

- pour un composant `Jauge`, la propriete generale n affiche plus `Valeur par defaut`
- elle est renommee en `Valeur courante`
- `Formule max` est renommee en `Valeur Max`
- `Valeur Max` est remontee dans les proprietes de l element, au plus pres de `Valeur courante`
- la section `Jauge` ne garde plus que les options d affichage et de style
- les champs generiques inutiles (`Placeholder`, `Reference / URL`, `Formule`) sont masques pour `Jauge`
- la jauge peut maintenant masquer son nom avec `Afficher nom`
- le panneau Proprietes a aussi ete nettoye plus largement pour n afficher les champs generiques que sur les types qui les utilisent vraiment
- deuxieme passe de nettoyage :
  - les styles de champ ne sont plus proposes sur les composants qui n ont pas de vrai champ de saisie
  - la typographie est masquee sur `Conteneur`, `Onglets`, `Image editable` et `Vue liee`
- troisieme passe de nettoyage :
  - `Vue liee` masque ses champs techniques de cible au profit du select unique
  - `Bouton` masque la cible legacy pour les actions deja configurees ailleurs
  - `Bouton` ne montre l icone que quand le mode de contenu en a besoin
- correction runtime : `Opacite du fond` s applique maintenant aussi a la couleur de fond reelle des vues / blocs / champs, et pas seulement au calque d image de fond

## Dernier lot - Libelle editable masquable

- les composants editables recuperent maintenant une troisieme disposition texte / champ :
  - `texte cache`
- cette option s ajoute a :
  - `colonne`
  - `ligne`
- le runtime masque alors le libelle visible, sans retirer le champ lui-meme
- le mode lot et le panneau proprietes du Studio systeme supportent tous les deux cette nouvelle valeur

## Dernier lot - Sorties Discord systeme-driven pour fiche et inventaire

- le backend expose maintenant un endpoint interne securise pour rendre une sortie Discord de systeme dans le contexte d une partie :
  - `GET /api/integrations/discord/session-output`
- ce rendu est maintenant branche sur `discordConfig`
- la resolution prend en compte :
  - le compte Discord lie
  - le participant de la session
  - la fiche personnage associee
  - les `runtimeValues`
  - les champs de `character.sheet.fields`
- le bot supporte maintenant deux nouvelles commandes de lecture :
  - `/nf-fiche`
  - `/nf-inv`
  - `/nf-note`
  - `/nf-vue1` a `/nf-vue9`
- ces commandes ne reposent plus sur un format code en dur :
  - `/nf-fiche` lit la sortie `sheet`
  - `/nf-inv` lit la sortie `inventory`
  - `/nf-note` lit la sortie `notes`
  - `/nf-vue1..9` lisent les sorties `view1..9`
- la visibilite demandee dans la commande peut etre :
  - `private`
  - `public`
- le backend applique ensuite les contraintes du systeme :
  - `defaultVisibility`
  - `allowedVisibilities`
- pour cette premiere passe :
  - `sheet`, `collection`, `notes` et `view` sont rendus
- les sorties embed Discord savent maintenant aussi extraire une image depuis une ligne d URL/image Markdown/data URL, et le bot n envoie plus le flag prive quand la visibilite resolue est `public`

## Dernier lot - Variables Discord par vue et editeur detache

- le moteur Discord comprend maintenant aussi les chemins scopes par vue dans les templates :
  - `{{VueRef.cle}}`
- cela permet par exemple :
  - `{{Identitee.nom_du_personnage}}`
  - `{{Identitee.Description}}`
- les alias de vue resolus sont maintenant :
  - `reference`
  - `id`
  - nom normalise de la vue
- le manager `Configuration Discord` du Studio systeme propose maintenant un editeur detache pour :
  - `Template principal`
  - `Template item`
  - `Template vide`
- l ouverture de cette fenetre se fait maintenant directement au clic utilisateur pour eviter le blocage navigateur qui faisait retomber l editeur en simple popup integree
- cet editeur apporte :
  - une matrice des variables par vue
  - l insertion au curseur
  - une recherche des variables
  - une barre d aide Markdown pour mettre en forme sans connaitre l ecriture Markdown
  - un fallback modale si la fenetre detachee est bloquee

## Dernier lot - Invitations Discord et premiers outils de salon

- les invitations de partie peuvent maintenant partir en DM Discord quand la cible a un compte Discord lie
- le DM contient :
  - la partie
  - le role propose
  - l auteur de l invitation
  - un lien securise `Accepter`
  - un lien securise `Refuser`
- le backend supporte maintenant :
  - `GET /api/sessions/invitations/respond?token=...&response=accept|decline`
- l acceptation ou le refus depuis Discord met a jour la partie cote Nexus Forge
- une acceptation relance aussi la synchronisation du salon Discord de partie
- le frontend affiche maintenant un retour clair apres redirection Discord :
  - invitation acceptee
  - invitation refusee
  - lien expire
  - lien invalide
- le bot enregistre maintenant deux premieres commandes slash dans les serveurs ou il est present :
  - `/nf-partie` pour afficher le resume de la partie liee au salon courant
  - `/nf-jet formule:...` pour lancer un jet simple depuis un salon de partie
- le bot memorise aussi les salons de parties lies dans son etat local pour permettre ces commandes

## Dernier lot - Liaison compte Discord OAuth2

- le backend supporte maintenant une vraie liaison OAuth2 Discord pour les comptes Nexus Forge
- nouveaux endpoints auth :
  - `POST /api/auth/discord/link/start`
  - `POST /api/auth/discord/link/callback`
  - `DELETE /api/auth/discord/link`
- le backend genere un `state` temporaire, realise l echange du `code` OAuth2 et recupere l identite Discord via `identify`
- le compte utilisateur publie maintenant aussi les informations de liaison Discord :
  - `id`
  - `username`
  - `globalName`
  - `avatarUrl`
  - `linkedAt`
- la page `Profil` permet maintenant :
  - de lancer la liaison Discord
  - de voir le compte Discord actuellement lie
  - de delier ce compte
- une page de callback frontend a ete ajoutee :
  - `/auth/discord/callback`
- la configuration serveur necessaire est maintenant documentee :
  - `DISCORD_OAUTH_CLIENT_ID`
  - `DISCORD_OAUTH_CLIENT_SECRET`
  - `DISCORD_OAUTH_REDIRECT_URI`

## Dernier lot - Tableau de bord web du bot Discord

- le bot expose maintenant une interface HTML sur son sous domaine
- cette interface affiche :
  - l etat de connexion du bot
  - le compte Discord charge
  - les serveurs rejoints
  - les canaux news et staff configures
  - le dernier evenement traite
  - un historique recent des dispatchs
- une version JSON du meme etat est aussi disponible :
  - `/status.json`
- le tableau de bord est maintenant protege par connexion Discord OAuth2
- les utilisateurs Discord qui gerent un serveur ou le bot est present peuvent maintenant choisir le salon de news pour ce serveur
- les utilisateurs Discord qui gerent un serveur ou le bot est present peuvent aussi choisir un salon de recrutement dedie
- les reglages globaux lies aux alertes `user.pending_validation` restent reserves au compte owner Discord
- un endpoint public minimal reste disponible pour la supervision :
  - `/health`

## Dernier lot - Cadrage Discord V2 multi-serveurs

- la V2 Discord est maintenant recadree pour etre multi-serveurs des la conception
- objectif retenu :
  - permettre a d autres communautes d inviter le bot sur leur propre serveur Discord
  - puis de gerer leurs annonces et leurs parties via Nexus Forge
- les annonces de recherche de joueurs / MJ doivent etre synchronisees avec Discord :
  - creation
  - mise a jour
  - suppression / cloture
- les parties peuvent maintenant demander la creation / synchronisation d un salon Discord prive
- le bot peut maintenant creer ce salon dans une categorie configuree par serveur
- le bot resynchronise aussi les acces du salon quand les participants acceptes changent
- les salons de parties doivent etre :
  - crees par le bot
  - places dans une categorie configuree
  - geres par le bot sur tout leur cycle de vie
- les permissions du salon de partie seront d abord gerees par utilisateurs directs en V2
- les invitations de partie doivent pouvoir etre recues en DM Discord
- acceptation / refus depuis Discord ou via lien securise Nexus Forge fait partie du flux cible
- certains reglages restent explicitement `owner only` :
  - notifications `user.pending_validation`
  - salon staff global
  - admins en DM

## Dernier lot - News compatibles Discord/Markdown

- les news admin acceptent maintenant un sous-ensemble Markdown compatible avec Discord
- le rendu web sait maintenant afficher :
  - titres `#`
  - listes `-`
  - gras `**...**`
  - italique `*...*`
  - souligne `__...__`
  - barre `~~...~~`
  - code inline
  - liens Markdown
- le bloc `Dernieres news` de l accueil connecte utilise maintenant ce rendu riche
- `Admin contenu` affiche maintenant :
  - une aide de syntaxe
  - un apercu avant publication
- l objectif est d avoir une seule source de contenu reutilisable :
  - sur le site
  - dans le bot Discord
- `Admin contenu` propose maintenant aussi un formulaire `Publier une release vers Discord`
- ce formulaire pousse un evenement `release.published` sans appel API manuel
- les resumes d annonces du site passent maintenant aussi par le meme renderer Markdown cote frontend

## Dernier lot - Socle bot Discord V1

- un service dedie `discord-bot` a ete ajoute au repo
- ce service interroge maintenant une file d evenements backend securisee
- le backend persiste des evenements `discordBotEvents` dans son `state.json`
- un endpoint securise a ete ajoute :
  - `GET /api/integrations/discord/events`
- un endpoint admin a ete ajoute pour publier une release vers Discord :
  - `POST /api/admin/integrations/discord/releases`
- les evenements V1 emis automatiquement sont :
  - `news.published`
  - `user.pending_validation`
- l evenement `release.published` peut etre injecte via endpoint admin
- le bot diffuse maintenant :
  - les news vers les canaux news configures
  - les releases Android / iOS vers les canaux news configures
  - les comptes en attente de validation vers les canaux ou DM staff configures
- le bot memorise localement son dernier evenement traite pour eviter les doublons au redemarrage
- un mode de bootstrap est prevu :
  - `latest` pour partir du plus recent sans rejouer l historique
  - `replay` pour rejouer les evenements recuperes
- le bot expose maintenant aussi un petit endpoint HTTP de sante
  - pour permettre un hebergement via cPanel / Passenger

## Dernier lot - Cadrage bot Discord

- un document de reference a ete ajoute pour cadrer une future integration Discord :
  - [docs/discord-bot.md](./discord-bot.md)
- le bot est positionne comme un service dedie, distinct du backend principal
- la cible produit est decoupee en 3 usages :
  - diffusion des news et versions
  - notifications admin
  - interactions utilisateur plus tard
- la V1 retenue couvre :
  - publication des mises a jour produit
  - publication des versions Android / iOS
  - notification d utilisateur en attente de validation
  - commandes simples de statut
- la V2 retenue couvre :
  - liaison compte Discord <-> Nexus Forge
  - notifications ciblees
  - lecture simple d informations utilisateur
- la V3 retenue couvre :
  - actions metier legeres
  - usages autour des fiches personnage et des jets
- les evenements backend cibles sont maintenant poses :
  - `release.published`
  - `news.published`
  - `user.pending_validation`
  - puis plus tard des evenements sociaux et de partie
- la configuration par serveur Discord est maintenant cadree :
  - canal news
  - canal staff
  - role admin optionnel
  - activation / desactivation par type de notification

## Dernier lot - Compositeur de formule finalise

- le compositeur de formule du Studio systeme V2 affiche maintenant une aide contextuelle selon le champ ouvert :
  - formule numerique
  - afficher si
  - editable si
  - filtre item
  - visible si d onglet
  - formule max de jauge
  - formule de jet
  - actif si de bouton
- les dernieres formules appliquees sont maintenant memorisees localement dans le navigateur
- ces dernieres formules sont reproposees dans le compositeur pour accelerer le travail auteur
- si la fenetre detachee est bloquee par le navigateur, le compositeur bascule automatiquement vers une modale integree
- le banc de test reste aligne avec le moteur runtime V2 :
  - variables detectees automatiquement
  - valeurs de test saisissables
  - resultat recalcule en direct
  - previsualisation de jet pour les formules `dice`
- le compositeur permet maintenant aussi :
  - de marquer des variables en favorites
  - de sauver des presets personnalises locaux
  - d inserer tokens et operateurs a la position du curseur dans la formule
  - de renommer un preset personnalise
  - d exporter et reimporter ses presets locaux
  - de reutiliser une petite bibliotheque d exemples metier par mode

## Dernier lot - Android Play In-App Updates

- l application Android cible maintenant :
  - `versionCode 2`
  - `versionName 1.0.1`
- le shell Android embarque maintenant le flux `Google Play In-App Updates`
- le mode retenu est `immediate`
- la verification de mise a jour est faite au retour / ouverture de l activite Android
- si une mise a jour immediate est disponible et autorisee par Play :
  - le flux natif Google Play est lance
  - l utilisateur doit mettre l application a jour avant de continuer
- rappel important :
  - ce mecanisme ne fonctionne que pour une build installee depuis Google Play
  - il ne peut pas etre valide avec un APK installe manuellement

## Dernier lot - V1 catalogues systeme implementee

- le Studio systeme dispose maintenant d un bouton `Catalogues systeme`
- un ecran auteur dedie permet desormais :
  - creation / suppression de catalogue
  - edition du nom et de la cle technique
  - definition des colonnes
  - edition des entrees en grille
  - import CSV
  - export CSV
- les types de colonnes V1 disponibles sont :
  - `text`
  - `textarea`
  - `number`
  - `checkbox`
  - `select`
- le modele systeme persiste maintenant aussi les `catalogs` cote frontend et backend
- les duplications et creations depuis un systeme source recuperent aussi les catalogues
- une nouvelle action de bouton runtime est disponible :
  - `Ajouter depuis catalogue`
  - `Supprimer item`
- cette action ouvre une popup runtime de selection et ajoute une instance dans une collection cible des `runtimeValues`
- l action `Supprimer item` retire maintenant un element d une collection repetee quand la repetition s appuie sur une vraie collection runtime
- la structure d instance V1 ajoute automatiquement :
  - `instanceId`
  - `catalogKey`
  - `templateId`
  - `quantite`
  - `equipe`
  - `notes`
- cette base couvre maintenant le premier usage vise :
  - inventaire joueur alimente depuis un catalogue de reference

## Dernier lot - Roadmap catalogues système et inventaire

- la direction produit retenue pour l inventaire est maintenant posee explicitement :
  - `catalogues système` comme donnees de reference
  - `collections d instances` sur les fiches personnage
- cette base doit couvrir :
  - objets
  - armes
  - armures
  - consommables
  - et plus largement toute donnee de reference reutilisable dans un systeme
- la separation cible est maintenant fixee :
  - modele systeme
  - instance possedee par le personnage
- les actions runtime cibles sont notees :
  - ajout depuis catalogue
  - suppression
  - duplication
  - deplacement
  - equiper / desequiper
- la roadmap est decoupee en 3 phases :
  - V1 : socle catalogue + inventaire
  - V2 : recherche / filtres / quantites / equipement
  - V3 : synchronisation source, variantes et transferts
- document de reference ajoute :
  - [docs/catalogues-systeme.md](./catalogues-systeme.md)

## Dernier lot - Sauvegarde offline utile et synchro de demarrage

- ajout du fallback local pour les ressources quand l application est hors ligne :
  - ajout de fichier dans `Mes fichiers`
  - ajout de fichier dans une partie
  - creation / edition / suppression de dossiers de ressources
- les fichiers crees hors ligne sont maintenant :
  - visibles localement tout de suite
  - stockes dans le cache binaire local
  - ouverts depuis le cache comme les autres ressources offline
- la sauvegarde de fiche personnage en hors ligne garde maintenant un message clair de sauvegarde locale
- l endpoint `/api/sync/actions` applique maintenant reellement les cas critiques deja poses pour :
  - mise a jour de fiche personnage
  - creation / edition / suppression de ressource
  - creation / edition / suppression de dossier de ressource
- l application ajoute maintenant :
  - un badge `Hors ligne`
  - une proposition de synchro au demarrage quand il y a des parties offline ou des actions en attente
  - la possibilite de memoriser ce choix
- une signaletique de synchro plus lisible est maintenant visible :
  - sur les fiches personnage
  - sur les fichiers
  - sur les dossiers
  - avec un badge `Cache local` sur les ressources deja telechargees

## Dernier lot - Cadrage application mobile offline-first

- un document de reference a ete ajoute pour cadrer la phase mobile :
  - [docs/mobile-offline-app.md](./mobile-offline-app.md)
- la cible retenue est maintenant claire :
  - application Android puis iOS
  - base frontend React/Vite existante
  - emballage mobile via Capacitor
  - file d actions locale
  - resynchronisation automatique a la reconnexion
- le perimetre mobile est maintenant clarifie :
  - pas de Studio systeme sur mobile
  - usage normal online pour le reste
  - hors ligne : fiches joueur + donnees de partie + contenu des fichiers lies
  - hors ligne : pas de messagerie privee, pas de chat de partie, pas de partage temps reel de nouveaux fichiers
- le document precise :
  - les donnees a embarquer hors ligne
  - la strategie de telechargement de partie
  - la strategie de sync
  - la gestion des conflits
  - le decoupage par lots Android puis iOS
- la doc API a aussi ete mise a jour pour refléter le backend reel sur :
  - parties
  - personnages
  - ressources
  - templates d ecran
  - outils de conversion
  - sync offline
- le lot 1 est maintenant demarre techniquement :
  - Capacitor ajoute au frontend
  - configuration `frontend/capacitor.config.ts`
  - shell Android genere dans `frontend/android`
  - synchronisation `build -> cap sync` validee
- un premier modele local mobile a ete pose :
  - type `OfflineSessionBundle`
  - table Dexie `offlineSessions`
  - repository `offlineSessionRepository`
  - base de travail pour `Rendre disponible hors ligne`
- le lot 1 branche maintenant aussi une premiere preparation de partie hors ligne :
  - service `frontend/src/services/offlineSessionService.ts`
  - hydratation depuis partie + systeme + fiches + ressources + templates
  - premier point d entree dans la page `Partie` avec `Preparer le cache hors ligne`
  - affichage local de l etat du cache hors ligne pour la partie
- le lot 1 telecharge maintenant aussi le contenu des ressources de partie :
  - table Dexie `offlineResourceFiles`
  - repository `offlineResourceFileRepository`
  - stockage du blob et de ses metadonnees
  - base de reutilisation pour les apercus offline
- l ouverture d une ressource depuis la bibliotheque et le widget documents reutilise maintenant d abord le cache local
- les widgets `documents`, `media` et `PDF` savent maintenant relire les blobs telecharges localement
- la preparation offline evite de retelecharger un fichier si son `updatedAt` et son URL source n ont pas change
- la page `Partie` propose maintenant :
  - `Rafraîchir le cache hors ligne`
  - `Nettoyer le cache`
- le nettoyage actuel supprime :
  - les blobs orphelins
  - puis, si besoin, les blobs lies uniquement a des bundles `stale/error` quand le cache depasse 512 Mo
- le flux Android de build est maintenant prepare cote repo :
  - `npm run mobile:android:doctor`
  - `npm run mobile:android:apk`
  - `npm run mobile:android:apk:release`
  - `npm run mobile:android:aab:release`
- la publication Android est maintenant cadree cote repo :
  - signature release lue via `frontend/android/key.properties` ou variables d environnement
  - exemple fourni dans `frontend/android/key.properties.example`
  - sortie Play Store ciblee :
    - `frontend/android/app/build/outputs/bundle/release/app-release.aab`
- l environnement Android local a ete prepare sur cette machine :
  - JDK 21 local
  - SDK Android local
  - variables reprises par `scripts/mobile-android-env.sh`
- premier build APK debug valide :
  - `frontend/android/app/build/outputs/apk/debug/app-debug.apk`
- limite actuelle assumee :
  - l ouverture offline n est pas encore forcee partout dans tous les widgets et actions documentaires
  - la politique de purge avancee par taille / age reste a faire

## Dernier lot - Cadrage repetition avancee Studio systeme V2

- la doc locale precise maintenant la cible fonctionnelle du `conteneur repetable`
- la repetition avancee est posee comme fonctionnalite transverse pour :
  - competences choisies
  - qualites / defauts selectionnes
  - inventaire
  - talents
- les points fonctionnels a couvrir sont documentes :
  - source tableau locale ou inter-vues
  - contexte `@item.*` et `{{item.*}}`
  - `Filtre item`
  - disposition `horizontal / vertical`
  - binding des champs enfants sur l item courant
- des exemples concrets ont ete ajoutes dans la doc pour rendre le comportement auteur compréhensible avant implementation

## Dernier lot - Studio systeme V2 source unique

- le flux actif fiche personnage utilise maintenant uniquement `studioSchemaV2`
- la creation de personnage, la page fiche de session et le widget ecran `Fiche de personnage` ne reposent plus sur le schema legacy
- les creations, duplications et imports de systemes ne recopient plus `studioSchema`
- la V2 recupere aussi les champs editables `Date` et `Heure`
- le panneau de proprietes V2 continue de reintegrer les proprietes definies en V1 pour garder le niveau de controle auteur
- le runtime V2 sait maintenant afficher un `conteneur` en mode repetable:
  - source manuelle
  - source liee
  - contexte `item.*`
- les fiches personnage persistantes conservent maintenant aussi `runtimeValues` pour le runtime V2 natif
- les proprietes V1 deja posees dans le studio sont mieux rendues dans le runtime:
  - image fit / dimensions / alt
  - checkbox forme / style
  - bouton texte / icone / activation
- les composants/types legacy morts du runtime fiche V1 ont ete retires du front

## Dernier lot - Runtime multi-ecrans et Studio Ecrans simplifie

- le runtime de partie ne garde plus la navigation generale de l application
- le header runtime devient compact et colle directement au nom de l ecran joue
- un set multi-ecrans ouvre maintenant :
  - une fenetre principale
  - puis une fenetre par ecran secondaire
- le runtime de partie peut maintenant passer en plein ecran
- en plein ecran, la barre runtime disparait et une action overlay permet de revenir a l affichage normal
- le runtime traite aussi proprement les anciens sets qui avaient plusieurs ecrans en `main`
- le Studio Ecrans ajoute des actions simples :
  - `Nouveau set`
  - `Supprimer le set`
  - `Nouvel ecran`
  - `Supprimer l ecran`
- le Studio Ecrans permet maintenant de detacher :
  - le panneau gauche `Contexte`
  - le panneau droit `Proprietes widget`
- les deux studios memorisent maintenant l etat `detache / reintegre` de leurs panneaux
- les deux studios memorisent aussi la taille des fenetres detachees
- les widgets ecran peuvent maintenant masquer leur bandeau titre tout en gardant un titre personnalise
- le widget `Liste des personnages` n affiche plus les participants bruts : il liste maintenant les fiches `PJ / PNJ / Monstre`
- le widget `Liste des personnages` permet maintenant d ouvrir directement la fiche choisie
- le runtime ecran ajoute un vrai systeme de cibles `Ouvrir dans`
- un widget `Fiche de personnage` peut maintenant etre configure en `Cible runtime`
- un nouveau couple de widgets `Overlay cible d ouverture` / `Controle overlay cible` permet d ouvrir et piloter un document ou media au-dessus d un ecran
- le catalogue `Studio Ecrans` affiche maintenant `Mes templates` avant le bloc de creation
- la duplication d un ecran cree maintenant un ecran secondaire quand le principal existe deja

## Dernier lot - Partie par onglets

- la page `Partie` passe en navigation par onglets :
  - `General`
  - `Parametres`
  - `Log et securite`
- le header de partie est clarifie :
  - nom de la partie a gauche
  - actions rapides centrees
  - etat a droite
- le bloc `Espace de travail actif` est retire
- l onglet `General` garde :
  - resume compact
  - participants actifs
  - personnages visibles selon le role
  - documents
  - runtime actif
- l onglet `Parametres` concentre :
  - options de partie
  - invitations / participants
  - ecrans
  - regles de table
  - gestion complete des personnages
- l onglet `Log et securite` regroupe :
  - journal de table
  - synchronisation et conflits
- le runtime de session n est plus affiche directement dans la page `Partie`
- `Demarrer la partie` et `Ouvrir l interface` basculent maintenant vers la vue runtime dediee
- les ecrans `detaches` du set actif s ouvrent automatiquement dans des fenetres separees

## Dernier lot - Invitations et indicateurs utilisateur

- le compteur de messages non lus apparait maintenant directement sur l avatar du profil, en plus du menu utilisateur
- le compteur des invitations de partie reste visible sur l onglet `Parties`
- une invitation de partie en attente n ouvre plus la page complete de la partie tant qu elle n est pas acceptee
- la liste `Parties` separe donc mieux :
  - les parties accessibles
  - les invitations recues en attente

## Dernier lot - Partie recentree et purge du legacy

- la page `Partie` devient le vrai hub central de session:
  - resume
  - participants
  - personnages
  - regles de table
  - ecrans
  - documents
  - runtime actif
- ajout de la gestion visible du lien joueur ↔ role ↔ personnage
- creation de personnage depuis un modele de fiche du systeme actif
- suppression de l ancien studio de session base sur `dashboardProfiles`
- suppression des seeds frontend de demo
- suppression des seeds backend de demo
- suppression d une partie rendue vraiment propre avec cascade sur:
  - personnages
  - messages
  - notes
  - ressources
  - dossiers de session

## Dernier lot - Partie offline visible et actions de table

- ajout d un panneau `Synchronisation et conflits` directement dans la page `Partie`
  - compteurs `en attente`, `echec`, `conflit`
  - relance manuelle d un cycle de sync
  - resolution champ par champ `garder local` / `garder serveur`
  - actions `Rejouer` et `Ignorer`
- ajout plus guide de l ajout de participants:
  - ajout direct en `joueur`
  - ajout direct en `MJ`
  - ajout direct en `observateur`
- ajout de vraies actions de table au-dessus du runtime:
  - demarrer
  - mettre en pause
  - reprendre
  - terminer
  - ouvrir les ressources
  - detacher les ecrans secondaires du set actif

## Dernier lot - Vue de fiche personnage Studio

- ajout de `Vue de fiche personnage` sur les vues du Studio Systeme
- la creation de personnage de partie ne passe plus par `referenceSheets`
- la page `Partie` propose maintenant les vues Studio marquees comme fiches personnage
- ajout d un adaptateur de creation `vue Studio -> fiche runtime`
- ajout d un endpoint backend pour lister les personnages de session
- edition rapide des personnages de session depuis la page `Partie`
- le widget runtime `Fiche de personnage` respecte mieux la vue cible `viewId`
- le selecteur de vues du Studio Systeme signale maintenant clairement les vues `fiche personnage`

## Dernier lot - Accueil connecte + branding

- l entree connectee redirige maintenant vers `Accueil` au lieu de `Parties`
- nouvelle page `Accueil` avec :
  - news admin
  - annonces MJ / joueurs
  - statistiques globales
- routes backend ajoutees pour :
  - `GET /api/home/stats`
  - `GET/POST/PATCH/DELETE /api/home/news`
  - `GET/POST/PATCH/DELETE /api/home/announcements`
- page d inscription enrichie visuellement avec une presentation plus produit
- branding SVG reel branche sur :
  - favicon
  - header
  - connexion
  - inscription

## Dernier lot - Couche sociale V1

- messagerie privee hors partie ajoutee
- gestion des demandes d amis
- gestion des ignores
- systeme de signalement utilisateur vers les admins
- moderation admin des signalements
- edition des news admin directement depuis l accueil

## Derniers ajustements Studio V1

- Les styles du studio et du runtime de fiche appliquent maintenant réellement :
  - couleurs de fond
  - couleurs de bordure
  - couleurs de texte
  - type de bordure
  - graisse, italique, taille et famille de typo
  - alignements principaux
- `Colonne` supporte maintenant `Largeur colonne` pour construire des lignes asymetriques (`33%`, `67%`, `240px`).
- `Editable > Image` a ete ajoute :
  - choix depuis la bibliotheque utilisateur
  - URL manuelle
  - upload direct d une image dans la bibliotheque compte

## Dernier lot - Studio Ecran runtime reel

- `chat`, `notes` et `initiative` du runtime ecran utilisent maintenant de vraies donnees de session
- le backend persiste maintenant `messages` et `notes`
- la messagerie n utilise plus de faux joueurs injectes en local :
  - les canaux sont derives des participants de la session
- les notes sont maintenant :
  - listables
  - creables
  - modifiables
  - supprimables
- l initiative reste stockee dans `session.initiative` et alimente le chat avec des messages systeme
- la documentation Studio Ecran / widgets / API a ete mise a jour en consequence

## Dernier lot - Widgets ecran supplementaires branches

- `documents` utilise maintenant la bibliotheque de ressources de session / compte
- `pdf_viewer` affiche un PDF depuis une ressource ou une URL
- `media_viewer` affiche image / video depuis ressource ou URL
- `character_list` affiche les fiches visibles de la session
- `dice_history` lit les messages `roll`
- `session_journal` lit les messages visibles de la session

## Dernier lot - Finition du studio ecran

- mode `Apercu` ajoute dans le studio ecran pour verifier le rendu du canvas sans quitter l editeur
- duplication de `set`, `ecran` et `onglet`
- selecteurs metier ajoutes dans le studio ecran :
  - selection de PDF depuis la bibliotheque
  - selection de media depuis la bibliotheque
  - selection de vue systeme pour `character_sheet`

---

## Fait

### Documentation

- Structure de conception posée dans:
  - `README.md`
  - `docs/architecture.md`
  - `docs/data-model/*.schema.json`
  - `docs/ui/*.md`
- Contrat API sync ajouté:
  - `docs/api/index.md`
  - `docs/api/sync-actions.md`

### Frontend (bootstrap V1)

- Projet frontend initialisé dans `frontend/` avec:
  - Vite + React + TypeScript
  - structure `src/` complète (features, router, services, hooks, types, utils)
  - routage de base
  - auth mock
  - pages sessions (liste + vue)
  - dashboard générique avec widgets stub
- PWA minimale en place:
  - `frontend/public/manifest.webmanifest`
  - `frontend/public/sw.js` (placeholder)
  - enregistrement du service worker dans `frontend/src/main.tsx`

### Hygiène repo et outillage (Sprint 0)

- `.gitignore` enrichi pour ignorer les artefacts locaux (`node_modules`, `dist`, logs, env, tsbuildinfo).
- Scripts npm standardisés dans `frontend/package.json`:
  - `typecheck`
  - `lint` (alias temporaire vers typecheck)
  - `build`
  - `test` (placeholder explicite)
- CI frontend en place dans `.github/workflows/frontend-ci.yml`:
  - installation dépendances
  - typecheck
  - build
  - test

### Couche data locale (Sprint 1 - base)

- IndexedDB introduite via Dexie:
  - base `nexus-forge-db` avec tables `sessions`, `systems`, `characters`, `notes`, `messages`, `documents`, `localActions`.
- Seed local des sessions ajouté pour bootstrap offline.
- Repository sessions ajouté et branché sur les pages:
  - `SessionsListPage` et `SessionViewPage` lisent désormais les données via IndexedDB.
  - ajout des états `loading` / `error` / `empty`.
- Journal d'actions local initial:
  - repository `localActionRepository` (enqueue/list/markSynced/markFailed),
  - enregistrement d'action locale sur `sessionRepository.upsert`.

### Couche data locale (Sprint 1 - extension widgets)

- Repositories ajoutés:
  - `noteRepository` (lecture session filtrée par rôle + création),
  - `documentRepository` (lecture session filtrée par rôle + marquage lu).
- Seeds locaux ajoutés pour notes et documents.
- Widgets branchés sur IndexedDB:
  - `NotesWidget` remplace le placeholder avec affichage public/privé selon rôle.
  - `DocumentsWidget` remplace le placeholder avec visibilité et action "marquer comme lu" côté joueur.

### Initiative + sync locale (Sprint 1 - extension)

- `Session` enrichi avec un état d'initiative persistant (`initiative.round`, `turnIndex`, `isInCombat`, `entries`).
- `InitiativeWidget` branché sur IndexedDB:
  - affichage ordre d'initiative,
  - actions MJ: démarrer combat, tour suivant, terminer combat,
  - persistance via `sessionRepository.updateInitiative`.
- Messages système initiative injectés dans le chat (`combat_start`, `round`, `turn`, `combat_end`).
- Boucle de sync locale minimale:
  - `runSyncCycle` traite les `localActions` en `pending` et les marque `synced`,
  - déclenchement au démarrage de l'app et à l'événement navigateur `online`.

### Chat persistant offline (Sprint 1 - extension)

- `messageRepository` ajouté pour lire/écrire les messages en IndexedDB.
- Seed local des messages de session ajouté.
- `chatStore` migré:
  - hydratation des messages depuis IndexedDB à l'ouverture de session,
  - `sendMessage` persiste désormais en base locale + journal d'actions,
  - `sendSystemMessage` persiste aussi en base locale,
  - conservation des canaux et du comportement de bannière whisper côté MJ.

### Fiches personnages connectées (Sprint 1 - extension)

- `characterRepository` ajouté:
  - lecture des personnages par session (filtrée par rôle/utilisateur),
  - mise à jour locale des ressources de fiche (`updateResource`) avec journalisation `localActions`.
- Seed local des personnages ajouté avec structure de fiche (`Character.sheet`).
- `CharacterWidget` branché sur IndexedDB:
  - fin du mock hardcodé,
  - sélection de fiche côté MJ quand plusieurs personnages sont disponibles,
  - édition rapide des ressources principales (+1/-1) avec persistance locale.

### Systèmes connectés aux jets (Sprint 1 - extension)

- `systemRepository` ajouté + seed local des systèmes (`rollDefinitions`).
- Modèle `GameSystem` enrichi avec les définitions de jets.
- `CharacterWidget` branché sur le système de la session:
  - les actions de fiche sont désormais alimentées par `rollDefinitions` du système quand disponibles,
  - exécution d'un jet local (parse simple de formule de dés),
  - publication du résultat en message système (`systemType = roll`) dans le chat persistant.

### Pipeline de sync offline-first (Sprint 2 - base)

- `localActions` enrichi avec métadonnées de sync:
  - `retryCount`,
  - `lastSyncAttemptAt`,
  - `syncedAt`.
- `runSyncCycle` renforcé:
  - traitement des actions `pending` et `failed`,
  - backoff exponentiel sur retries,
  - limite de retries (`MAX_RETRIES`),
  - rapport d'exécution (`processed/synced/failed/skipped`).
- Transport de sync introduit:
  - mode `mock` par défaut,
  - mode `http` disponible via `VITE_SYNC_TRANSPORT=http` (POST `/api/sync/actions`).
- Déclenchement sync dans l'app:
  - au démarrage,
  - au retour online,
  - polling toutes les 15 secondes.

### Sync - gestion des retours serveur (Sprint 2 - extension)

- Contrat de résultat de sync introduit:
  - `accepted`
  - `conflict`
  - `rejected`
- `localActions` enrichi pour la résolution:
  - statut `conflict`
  - `conflictFields` pour tracer les champs en divergence
- Moteur de sync mis à jour:
  - `accepted` -> `synced`
  - `conflict` -> statut `conflict` (non retraité automatiquement)
- `rejected` -> échec terminal (pas de retry supplémentaire)

### Accueil connecte - raffinement visuel

- le hero utilise maintenant un logo de fond plus grand et plus central
- ajout d un halo plus marque autour du logo
- hierarchie visuelle renforcee entre :
  - stats
  - news
  - annonces
- nouvelle statistique :
  - joueurs en recherche de partie
- stats presentees comme une bande plus marquee
- news plus editoriales
- annonces plus lisibles comme cartes de mise en relation
- affichage public des news et annonces base sur le pseudo
- pseudo cliquable dans les annonces pour ouvrir la messagerie
- clic sur son propre pseudo neutralise pour eviter l erreur de messagerie
- formulation des annonces rendue plus naturelle et normalisee
- Transport de sync:
  - mode mock capable de simuler `conflict`/`rejected` via `payload.__syncMode`
  - mode HTTP parse désormais une réponse JSON de statut sync.

### UI conflits de sync (Sprint 2 - extension)

- Panneau `SyncConflictsPanel` ajouté à la vue session:
  - liste des actions en statut `conflict`,
  - affichage des détails (`syncError`, `conflictFields`),
  - diff champ-à-champ `Local vs Serveur` pour les champs en conflit,
  - résolution par champ:
    - `Garder local`
    - `Garder serveur`,
  - résolution de masse par action:
    - `Tout garder local`
    - `Tout garder serveur`,
  - actions utilisateur:
    - `Rejouer` (repasse en pending + relance un cycle de sync),
    - `Ignorer` (marque l'action comme synced localement).
- Repository `localActionRepository` enrichi:
  - `retryConflict(actionId)`
  - `ignoreConflict(actionId)`
  - `resolveConflictField(actionId, fieldName, strategy)`
  - stockage des valeurs serveur en conflit (`conflictServerValues`)

### Observabilité sync (Sprint 2 - extension)

- Panneau `SyncStatusPanel` ajouté dans la vue session:
  - compteurs `total`, `pending`, `conflicts`, `failed`, `synced`,
  - bouton `Synchroniser maintenant`,
  - affichage du dernier rapport de cycle (`processed/synced/conflicts/failed/rejected/skipped`).

### Dashboard configurable par compte/rôle (Sprint 2 - extension)

- Profils dashboard persistés en base locale (`dashboardProfiles`) avec séparation par:
  - `userId`
  - `role` (`gm` / `player`)
- Multi-profils d'interface par compte:
  - création d'une nouvelle interface
  - duplication d'une interface existante
  - suppression
  - marquage en favori
- Personnalisation des modules:
  - affichage/masquage de chaque module
  - ordre des modules
  - taille par module (`S` / `M` / `L`)
- Positionnement des modules via drag & drop (mode édition).
- UX mode édition améliorée:
  - renommage inline des profils d'interface,
  - indicateur visuel de cible pendant le drag & drop.
- Le dashboard charge désormais le profil favori (ou le premier) pour le compte + rôle courant.

### Systèmes de jeu - catalogue & permissions (Sprint 3)

- `GameSystem` enrichi:
  - `ownerUserId`
  - `visibility` (`public` / `private`)
  - `rulesProgram`
  - `referenceSheets`
- `systemRepository` étendu:
  - `listAvailableForUser`
  - `getByIdForUser`
  - `create`
  - `duplicate`
  - contrôle d'édition propriétaire/admin.
- `SystemCatalogPanel` ajouté en session:
  - sélection du système actif de session,
  - création d'un système,
  - duplication du système courant,
  - indication explicite des droits d'édition.
- Auth mock enrichie avec rôle `admin` (email contenant `admin`).

### Éditeur visuel de système (Sprint 3)

- `SystemBuilderWidget` ajouté au dashboard MJ.
- Programmation visuelle type Scratch:
  - blocs `set_secondary_stat`
  - blocs `define_roll`
  - ordre des blocs par drag & drop.
- Moteur `systemRulesEngine`:
  - calcul automatique des statistiques secondaires,
  - génération d'actions de jet depuis les blocs,
  - exécution des jets avec modificateurs de champs.
- `CharacterWidget` connecté au moteur:
  - application auto des règles système,
  - rafraîchissement à la sauvegarde du système.
- Protection d'édition:
  - mode lecture seule si utilisateur non propriétaire et non admin.

### Templates de fiches de référence (Sprint 3 - extension)

- CRUD des templates dans l'éditeur système:
  - création
  - duplication
  - renommage
  - suppression
- Édition des champs:
  - ajout/suppression de champs (`number`, `resource`, `text`, `tag`)
  - mise à jour label/valeur/max
- Gestion des groupes:
  - création/suppression de groupe
  - renommage
  - layout `grid` / `list`
- Drag & drop:
  - réordonnancement des champs
  - déplacement inter-groupes
- Mode preview:
  - rendu de la fiche finale directement dans l'éditeur,
  - application des règles `rulesProgram` dans l'aperçu.

### Fiches de session depuis templates (Sprint 3 - extension)

- `characterRepository.createFromReferenceSheet` ajouté.
- `CharacterWidget` permet de créer une fiche en session depuis un template du système.

### Seed SteamShadows Core (Sprint 3 - extension)

- Système `SteamShadows Core` enrichi avec templates:
  - PJ
  - PNJ
  - Créature
- Template `Horreur (Arcanum)` ajouté (base MJ).
- Bestiaire instancié:
  - génération automatique d'une fiche de référence par Horreur connue (Cercles I à V),
  - préremplissage cercle, dé associé, type parasite, actions de jet.

### Connexion frontend vers backend (Sprint 3 - extension)

- Couche API commune ajoutée (`apiClient`):
  - `VITE_API_BASE_URL`
  - `VITE_BACKEND_ENABLED`
  - gestion tokens (`access` / `refresh`) en localStorage
  - helper `requestJson` avec header Bearer.
- Auth branchée backend:
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - refresh automatique via `POST /api/auth/refresh`
  - logout via `POST /api/auth/logout`
  - fallback mock conservé si backend non activé.
- Repositories branchés backend avec fallback local:
  - sessions (`GET /api/sessions`, `GET /api/sessions/{id}`, `PATCH /api/sessions/{id}`)
  - systèmes (`GET /api/systems`, `GET /api/systems/{id}`, `POST`, `PATCH`, `duplicate`)
  - création fiche depuis template (`POST /api/sessions/{sessionId}/characters/from-template`)
- Sync HTTP auth:
  - `POST /api/sync/actions` via `requestJson` authentifié.

---

## En cours

- Aucun chantier en cours à la date de cette mise à jour.

---

## À faire (priorisé)

1. Stabiliser l'UX V1 frontend:
   - design system léger (tokens, composants, layout responsive)
   - états d'erreur/chargement cohérents
   - améliorer l'ergonomie du mode édition dashboard (indicateurs DnD, renommage des profils)
2. Brancher une vraie auth:
   - flux login réel
   - persistance de session
   - protection des routes basée sur token
3. Étendre la couche de données locale:
   - branchement progressif des widgets restants sur IndexedDB
4. Implémenter la sync offline-first:
   - connecter le mode `http` à un backend réel (`/api/sync/actions`)
   - enrichir la UI de résolution (diff champ à champ)
   - stratégie de conflits (priorité MJ + cas fiche PJ)
5. Remplacer les widgets stub par logique métier:
   - chat/messages
   - documents
   - notes/journal
   - initiative/combat
6. Ajouter les tests:
   - unitaires (types, store, hooks)
   - intégration (routing + auth + pages session)
7. Mettre en place un linting applicatif réel:
   - ESLint TypeScript/React
   - règles de qualité (imports, hooks, patterns React)

---

## Règle de mise à jour

- À la fin de chaque tâche:
  - déplacer les éléments terminés vers **Fait**
  - ajouter les nouvelles tâches dans **À faire**
  - mettre à jour la date en tête de document

---

## 2026-03-11 - Admin UX

- Onglet `Gestion des systèmes` enrichi avec filtres d'usage (`utilisés`, `jamais utilisés`, `avec parties actives`).
- Pagination ajoutée sur les cartes systèmes pour alléger la lecture et la maintenance en grand volume.
- Navigation de page harmonisée avec la gestion des comptes (`première`, `précédente`, `suivante`, `dernière`).

## 2026-03-11 - Studio Formule / Des

- Assistant Formule/Dés dans le panneau Proprietes (insertion rapide `@cle` vers `reference/formula/showIf/diceFormula`).
- Validation live pour `formula`, `showIf` et `diceFormula` avec apercu.
- `dice_roll` accepte des expressions composees (ex: `@force d6 + @bonus`, `2d6+1d4+@mod`) et bouton de test.
- Documentation composant ajoutee: `docs/ui/components/dice_roll.md`.

## 2026-03-11 - Studio Logic IF/THEN/ELSE

- Runtime logique enrichi: `logic_if` choisit maintenant `logic_then` ou `logic_else` selon condition.
- Support des modulateurs `logic_or` (force vrai) et `logic_not` (force faux) avec condition propre.
- Panneau Proprietes: validation de condition en direct + presets d'exemple.
- Documentation composant logique ajoutee: `docs/ui/components/logic.md`.

## 2026-03-11 - Raffinage visuel logique

- Blocs logiques du canvas différenciés par type (`IF`, `THEN`, `ELSE`, `OR`, `NOT`) avec palettes et bordures dédiées.
- Runtime logique enrichi avec bandeaux visuels pour rendre la branche active plus lisible.

## 2026-03-11 - Studio UX layout et panneaux

- Panneaux `Arborescence` et `Proprietes` rendus sticky pendant le scroll et detachables en fenetres separees.
- Palette composants revue en arborescence visuelle plus lisible.
- Rendu canvas des `row` corrige pour afficher les `column` cote a cote.
- Proprietes `reference` et `formula` masquees pour les composants de layout afin d alleger l edition.
- Regles de contenance layout assouplies pour permettre une imbrication plus naturelle (`container/view/tabs/repeater/column`).
- Drag & drop ameliore pour sortir un bloc complet a la racine de la vue ou le replacer plus facilement dans une autre structure.

## 2026-03-11 - Studio UX canvas et fenetres detachees

- Canvas central epure: suppression des informations techniques redondantes (`key`, aide conteneur, apercus inutiles dans les layouts).
- Runtime retire du canvas principal et deplace dans un onglet `Apercu final`.
- Correctif sur les fenetres detachees pour eviter leur reattachement immediat lors de l ouverture du second panneau.
- Les deux panneaux peuvent maintenant rester detaches simultanement.

## 2026-03-11 - Studio UX drag drop et lisibilite

- Le detachement de la colonne `Arborescence` ne laisse plus de colonne fantome dans la grille centrale.
- Drag & drop revu avec zones explicites `avant / dedans / apres`.
- Canvas de construction recentre sur le contenu visible plutot que sur le type technique.
- Distinction renforcee entre `Texte fixe` et `Texte editable`.
- Ajustement du layout `row` pour mieux encaisser les ecrans plus petits et les structures imbriquees.

## 2026-03-11 - Studio UX minimal canvas

- Suppression des zones textuelles `Depose un bloc ici` dans le canvas.
- Bouton `Masquer/Afficher` remplace par un toggle compact `+ / -`.
- Les champs editables (`text`, `textarea`, `number`) s affichent comme de vrais champs dans le canvas.
- Les champs statiques affichent uniquement leur valeur visible.

## 2026-03-11 - Studio UX drag handle et espace utile

- Ajout d une poignee dediee pour declencher le drag & drop sans conflit avec les champs.
- Suppression de l indentation artificielle cumulative (`margin-left`) dans les blocs du canvas.
- Indentation residuelle allegee pour conserver plus de largeur utile sur les vues profondes.

## 2026-03-11 - Studio UX ajout de composants

- La palette accepte maintenant le clic pour ajouter directement un composant.
- Si un bloc est selectionne et compatible, le composant est insere dedans; sinon il est ajoute apres le bloc selectionne ou a la racine.
- La zone utile de depot interne est portee par le corps du conteneur, pas seulement par une sous-zone reduite.

## 2026-03-11 - Studio UX drag/drop correctif

- Le glisser depuis la palette ne doit plus provoquer de doublon via le clic de fin de drag.
- Le deplacement d un bloc existant dans le canvas est maintenant valide au relachement (`mouse up`) sur la zone active.
- La zone racine suit la meme logique de relachement direct pour remonter un bloc.

## 2026-03-12 - Studio catalogue V1 (socle)

- Nouveau catalogue palette organise en 3 familles: Structure, Affichage, Editable.
- Ajout du modele de vue V1: reference auto normalisee, description, visibilite dans les selecteurs, vue par defaut joueur, duplication.
- Nouvelles proprietes structurelles visibles dans le studio: bordure, couleurs, type bordure, alignements.
- Premiere integration runtime des nouvelles actions bouton vers une vue et vers un popup de vue.
- 2026-03-12: moteur studio/runtime aligne sur les references `@Label`, `@vue.label`, `{{Label}}`, `{{vue.label}}` avec support `{{Label[]}}` et `{{Label[index]}}` pour les menus multichoix.
- 2026-03-12: panneau Proprietes du studio nettoye pour la V1 (sections structure, image, jauge, typographie, style champ, contenu bouton, apparence case) et suppression des parties/fiches de test restantes sur le serveur.

## 2026-03-12 - Studio V1 / nettoyage docs

- Nettoyage du panneau Proprietes du Studio pour mieux coller au catalogue V1.
- Recentrage de la documentation locale sur `Structure / Affichage / Editable`.
- Suppression des anciennes pages locales `dice_roll`, `logic` et `table` devenues obsoletes dans la V1.
- Refonte du wiki GitHub pour retirer les references au vieux catalogue legacy.

- 2026-03-12: nettoyage runtime CharacterWidget pour mieux distinguer les composants `Affichage` et `Editable`, et aligner les boutons/jauges/listes sur le modele Studio V1.

- 2026-03-12: nettoyage interne V1 du convertisseur HTML et du runtime Studio pour privilegier `static_text`, `select`, `progress`, `table_block` et reduire les branches legacy (`label`, `choice`, `range`, `table`).

- 2026-03-12: second nettoyage technique V1 avec reduction des branches runtime legacy dans `SystemStudioPage`, convertisseur HTML aligne sur `static_text`, `select`, `progress`, `table_block`, puis suppression complete des types legacy du modele Studio et des dernieres branches de compatibilite runtime/canvas.

- 2026-03-12: panneau Proprietes V1 rationalise par type de composant: `Options` retire de `Onglet`, lignes visibles ajoutees pour `Texte multiligne`, `Valeur vide autorisee` pour les champs editables, `Afficher cle/texte` pour `Liste deroulante`, jauge complete (couleurs + taille), style bouton distinct et infos techniques repliees.

- 2026-03-12: famille `Structure` du panneau Proprietes rationalisee: rappel metier par composant, `Style structure` regroupe les proprietes communes, `Comportement structure` isole `Afficher si`, et les structures n affichent plus tout a plat.

- 2026-03-12: familles `Affichage` et `Editable` du panneau Proprietes rationalisees: rappels par type, bloc `Valeur et rendu`, bloc `Comportement editable`, ajout de `Longueur max`, `Valeur si invalide`, et regroupement propre des options de listes.

- 2026-03-12: action `Supprimer ce composant` remontee en tete du panneau Proprietes pour etre accessible immediatement.

- 2026-03-12: panneau `Proprietes` : les blocs de configuration optionnels se referment par defaut tant qu aucune valeur specifique n y est renseignee.
- 2026-03-12: composant `Onglet` rendu visible dans le canvas et les apercus avec la liste des vues liees et l orientation.
- 2026-03-12: `Ligne` et `Colonne` sont maintenant reservees au `Bloc Tableau`; elles ne peuvent plus etre ajoutees a la racine ou dans des structures incompatibles.
- 2026-03-12: le contenu d une `Colonne` s aligne horizontalement dans le studio et le runtime.

- 2026-03-12: insertion de `Bloc Tableau` corrigee: le studio demande maintenant le nombre de lignes et de colonnes a la creation, puis genere automatiquement la grille correspondante.
- 2026-03-12: panneau `Proprietes` renforce visuellement: bouton de suppression rouge, zones encadrees, bloc `Valeur` renomme et mis en fond bleu clair.
- 2026-03-12: apercu des `Onglet` corrige: les vues liees sont cliquables dans l apercu final et les orientations verticales affichent les libelles tournes a 90 degres / -90 degres.

- 2026-03-12: apercu des `Onglet` corrige dans le studio et le runtime de fiche: les vues liees utilisent maintenant la bonne arborescence interne, et le changement d onglet affiche bien le contenu de la vue selectionnee.
- 2026-03-12: bloc `Valeur` force ouvert pour tous les composants concernes; les autres sections restent repliees tant qu elles ne sont pas configurees.
- 2026-03-12: sauvegarde durcie avec validation prealable des formules et conditions; en cas d erreur bloquante, un bandeau rouge explicite est affiche.

- 2026-03-12: autosave du studio remplace par une sauvegarde differee 60 secondes apres la derniere modification, plus fiable que l ancien intervalle global.
- 2026-03-12: le runtime fiche et l apercu final partagent maintenant la meme logique de navigation pour les onglets et les vues incluses.

- 2026-03-12: protection de sortie ajoutee dans le studio: avertissement navigateur sur fermeture/refresh et confirmation avec enregistrement avant navigation interne.

- 2026-03-12: suppression du seed automatique backend/frontend pour les systemes, parties et fiches de demo; le studio et les listes repartent d un etat vide apres purge.
- 2026-03-12: synchro Dexie corrigee pour les systemes et parties: la liste locale est maintenant remplacee par la reponse backend, y compris quand elle est vide.
- 2026-03-12: brouillon local du studio ajoute dans le navigateur pour survivre a un F5 / rechargement de page, meme si le backend n a pas encore sauve.
- 2026-03-12: confirmation de sortie ajustee: OK = enregistrer puis quitter, Annuler = quitter sans enregistrer.

- 2026-03-12: ecran vide `Studio système` retravaille: vrai point d entree propre, duplication desactivee tant qu aucun systeme n existe, import JSON relegue en zone avancee repliable.

## 2026-03-12 - Ressources / fichiers (socle V1)

- Ajout d un modele `ResourceItem` cote frontend pour preparer une vraie bibliotheque de fichiers partagee entre compte, systeme et partie.
- Ajout d une table IndexedDB `resources` et d un `resourceRepository` pour lister, creer et supprimer des ressources.
- Ajout du socle backend `/api/resources` avec stockage disque sous `RESOURCE_DIR` et persistance dans `state.json`.
- Types de ressources V1: `image`, `pdf`, `text`, `file`.
- Scopes V1: `account`, `system`, `session`.
- Visibilites V1: `private`, `shared`, `public`.
- Cette base prepare la future bibliotheque de ressources (images, PDF, textes) qui sera ensuite reliee au studio et aux composants comme `Image` ou `Bouton`.

- 2026-03-12: premiere interface `Ressources` ajoutee dans l application avec upload, filtrage, suppression et scopes `compte / systeme / partie`.
- 2026-03-12: le composant `Image` du studio peut maintenant piocher dans la bibliotheque de ressources images du compte ou du systeme courant.

## 2026-03-12 - Studio système / edition metadonnees

- Dans `Studio système`, les systemes proprietaires peuvent maintenant etre renommes directement.
- Le resume / la description courte du systeme peut aussi etre modifie depuis la meme carte.
- L edition se fait inline avec `Enregistrer` / `Annuler`, sans devoir ouvrir le studio complet.

## 2026-03-12 - Compte utilisateur / menu avatar

- Le header remplace les controles de droite par un menu contextuel sur avatar / initiales.
- Le menu ouvre maintenant:
  - `Parametres`
  - `Profil`
  - `Admin` (admin uniquement)
  - `Deconnexion`
- Nouvelle page `Parametres`:
  - langue
  - theme
  - acces au dictionnaire
- Nouvelle page `Profil`:
  - avatar via ressources ou URL
  - prenom
  - nom
  - surnom unique application
  - section securite (mot de passe + TOTP)
- Ajout du backend `PATCH /api/auth/me` pour la mise a jour du profil courant.
- Correctif images protegees: les avatars et images issues de `/api/resources/.../content` sont maintenant chargees via un composant frontend authentifie.

- 2026-03-12: generation automatique des labels par defaut dans le studio (ex: colonne_ab12, ligne_x9k3) pour eviter les doublons lors de l ajout de composants et de la creation de tableaux.

- 2026-03-12: cadrage fonctionnel du Studio Ecran V1 (templates compte/systeme, sets multi-ecrans, onglets, widgets sur grille, presets desktop/tablette/mobile).

- 2026-03-12: socle technique du Studio Ecran V1 ajoute (types, repository local, table Dexie, CRUD backend `screen-templates`) sans compatibilite avec l ancien modele dashboard.

- 2026-03-12: catalogue initial des templates d ecran ajoute dans l application (`/screen-templates`) avec creation, edition simple et suppression.

- 2026-03-12: edition detaillee des templates d ecran ajoutee dans le catalogue (sets, ecrans, onglets, mode principal/detache).

- 2026-03-13: premiere version exploitable du `ScreenStudioPage` branchee sur les templates d ecran avec route dediee, palette de widgets V1, selection set/ecran/onglet, grille de placement, deplacement simple, redimensionnement simple et sauvegarde du template.

- 2026-03-13: integration UI du Studio Ecran finalisee dans le catalogue avec un bouton `Ouvrir le studio` sur chaque template d ecran proprietaire ou consultable.

- 2026-03-13: panneau du Studio Ecran enrichi avec la configuration metier minimale des widgets V1 (fiches, chat, horloge, alertes, PDF, documents, media, notes, liste, jets, initiative, journal).

- 2026-03-13: runtime de session branche sur les templates d ecran V1 avec assignation par defaut `MJ` / `Joueur`, selection utilisateur du template actif, clonage du template propose par le MJ et ouverture des ecrans `detached` en fenetres separees.
- Runtime Ecran V1:
  - `character_sheet`, `clock` et `alert_overlay` sont maintenant relies a de vraies donnees de session
  - `character_sheet` publie les jets dans les messages de session (`systemType = roll`)
  - une partie herite automatiquement des templates d ecran systeme si le systeme en fournit
- Couche sociale / accueil:
  - bouton `Contacter` depuis les annonces
  - ouverture directe de la conversation via `/messages?user=...`
  - annonces masquees si l auteur est ignore
  - visibilite `friends` branchee pour les systemes et les templates ecran
- Accueil / contenu:
  - accueil passe en lecture seule avec watermark logo
  - creation/gestion des annonces deplacee vers une page dediee `Annonces`
  - publication des news reservee a `Admin contenu`
- 2026-03-13 : les annonces publiques passent sur un modele 100 % structure (sans texte libre), avec disponibilites par jours, creneaux et periodicite. L accueil n affiche plus qu un apercu compact des 5 dernieres annonces actives, la recherche complete vivant sur la page `Annonces`.


## 2026-03-13 - Gestionnaire de fichiers V1 (dossiers, partage, securite)

- Backend ressources durci : verification MIME/signature, types autorises limites, `X-Content-Type-Options: nosniff`.
- Ajout des dossiers logiques (`resourceFolders`) et des audiences de partie (`Commun`, `MJ uniquement`, `Joueurs cibles`, `Prive`).
- Nouvelle page `Ressources` plus user-friendly : espaces `Mes fichiers`, `Parties`, `Partages avec moi`, glisser-deposer multi-fichiers, dossiers, panneau de partage.
- Widgets et studios recables sur les nouveaux types `image | pdf | text | video`.
- Ajout d une previsualisation riche dans `Ressources` (image, PDF, texte, video MP4).
- Ajout d un `ResourcePickerField` reutilisable pour le profil, les champs image et le studio ecran.
- Le widget `documents` de partie permet maintenant de previsualiser un document et de regler directement son partage.
- Ajout de `publish-to-session` pour publier un fichier personnel dans une partie.
- Le studio systeme utilise aussi le picker unifie pour les composants image.
- La bibliotheque propose maintenant une previsualisation grand format.

- Correction du studio ecran : le mode Apercu affiche maintenant une vraie preview de ressource pour les widgets PDF/media.
- Gestionnaire de fichiers : liste des fichiers en attente rendue plus visible pendant le drag and drop et l upload.
- Upload multi-fichiers : lecture base64 fiabilisee via ArrayBuffer pour eviter l erreur contentBase64 is required.

- Ouverture de ressource securisee : les boutons Ouvrir utilisent maintenant une ouverture authentifiee dans un nouvel onglet pour les fichiers proteges.

- Correction ouverture ressource protegee : buildApiUrl respecte maintenant les URLs absolues, ce qui evite les erreurs Route not found lors de l ouverture dans un nouvel onglet.

## 2026-03-14 - Partie: invitations et gestion de table

- La partie passe sur un vrai flux d invitations:
  - invitation `joueur`, `MJ` ou `observateur`
  - etats `pending`, `accepted`, `declined`
  - acceptation / refus depuis la liste des parties ou la page Partie
- Les sessions listees incluent maintenant aussi les invitations en attente pour l utilisateur courant.
- Le panneau `Participants` de la page Partie distingue mieux:
  - participants actifs
  - invitations en attente
- Le flux actif personnage reste base sur les vues Studio marquees `isCharacterSheet`, sans revenir sur `referenceSheets`.

## 2026-03-14 - Systeme brouillon/publie et prerequis de partie

- Un systeme est maintenant cree en `draft` par defaut.
- La publication d un systeme est refusee tant qu aucune vue n est marquee `isCharacterSheet`.
- La creation d une partie n accepte plus que les systemes `published` contenant au moins une fiche personnage.
- Le Studio Systeme expose maintenant aussi :
  - le type d une vue fiche personnage (`PJ`, `PNJ`, `Creature`)
  - un nom de fiche genere
  - le mode d initiative par defaut et sa formule
- Les fiches personnages commencent a supporter les variables reservees :
  - `{{nompj}}`, `{{nompartie}}`, `{{nommj}}`, `{{nomjoueur}}`, `{{pseudojoueur}}`, `{{nomsysteme}}`, `{{datecreation}}`

## 2026-03-14 - Partie: creation joueur, pre-tires et override initiative

- Un joueur qui rejoint une partie sans fiche voit maintenant un flux `Creer mon personnage`.
- Ce flux utilise les vues fiche personnage de type `PJ`.
- Le MJ peut dupliquer un personnage non attribue pour l affecter a un joueur, en conservant la fiche source intacte.
- Les clones de pre-tires portent :
  - `sourceCharacterId`
  - `isPreGeneratedClone = true`
- La partie expose maintenant un override d initiative :
  - `system_default`
  - `combat_once`
  - `round_recalc`
  - `gm_fixed`
  - `manual_turn`
- Le widget initiative suit d abord l override de partie, sinon le mode/fomule portes par la fiche personnage.
- 2026-03-14: Partie - separation propre du cycle de vie des fiches en session.
  - `Retirer de la partie` ajoute pour les MJ sur une fiche joueur.
  - `Supprimer definitivement` reserve au proprietaire de la fiche, avec exception pour les `Modeles MJ` non attribues.
  - badges visuels `Modele MJ`, `Clone joueur`, `Fiche attribuee` ajoutes sur les cartes personnage.
- 2026-03-14: Partie - cycle participant/fiches clarifie.
  - `Quitter la partie` disponible pour un participant non proprietaire.
  - retrait d un participant detache proprement sa fiche de session au lieu de la detruire.
  - reattribution/desattribution d une fiche via `Attribue a` synchronisee proprement entre personnage et participant.
- 2026-03-14: Partie - journal de table et pilotage des invitations.
  - `Annuler` et `Relancer` ajoutes pour les invitations en attente cote MJ.
  - journal d activite recent ajoute dans la page Partie.
  - arrivee joueur sans fiche rendue plus explicite avec rappel sur les pre-tires disponibles.

## 2026-03-14 - Admin comptes: secours connexion

- La page d administration des comptes permet maintenant :
  - de voir l etat de verrouillage d un compte
  - de debloquer un compte
  - de reinitialiser un mot de passe temporaire
- Le backend expose :
  - `POST /api/admin/users/:userId/unlock`
  - `POST /api/admin/users/:userId/reset-password`
- Ces actions remettent aussi a zero les compteurs de verrouillage de connexion.

## 2026-03-14 - Recherche utilisateur unifiee

- Ajout d un composant commun d autocompletion utilisateur.
- La recherche ne part qu a partir de 3 lettres.
- Comportement harmonise dans :
  - `Partie`
  - `Messagerie`
  - `Mes contacts`
  - `Ressources`

## 2026-03-14 - Indicateurs invitations et messagerie

- Ajout d un bandeau vert global quand un utilisateur a des invitations de partie en attente.
- Ajout d un compteur sur l onglet `Parties` pour les invitations en attente.
- Ajout d un compteur de messages non lus sur `Messagerie` dans le menu profil.
- 2026-03-14 : le popup de fiche est retire de la page Partie. Le bouton `Ouvrir la fiche` ouvre maintenant un nouvel onglet dedie.
- 2026-03-14 : l apercu final du Studio système pour les vues fiche personnage passe maintenant par le meme moteur de rendu que la fiche de session et le widget fiche personnage.
- 2026-03-14 : un participant actif peut maintenant lire le systeme utilise par sa partie, meme si ce systeme n est pas visible pour lui hors contexte de session. Cela debloque la creation et l ouverture de fiche cote joueur.
- 2026-03-14 : creation joueur dans Partie rendue plus robuste. Si un systeme a des vues fiche personnage mais aucune vue explicitement marquee `PJ`, la partie reutilise automatiquement les vues fiche disponibles au lieu de bloquer le joueur.
- 2026-03-14 : le marqueur `creation joueur / pre-tire MJ / les deux` est supprime. Une vue fiche personnage porte maintenant un type unique `PJ / PNJ / Creature`, et une fiche MJ peut toujours etre attribuee a un joueur ensuite.
- 2026-03-14 : la section Personnages de la partie affiche maintenant des cartes de creation `PJ / PNJ / Creature`, un bouton `Ouvrir la fiche` sur chaque personnage, et un panneau d edition directe des champs de fiche dans la page Partie.
- 2026-03-14 : le runtime du Studio Systeme gere mieux les listes deroulantes / multiselects, et la zone `Options` est agrandie.
- 2026-03-14 : le runtime partage des fiches resout maintenant les variables reservees (`{{nompj}}`, `{{nompartie}}`, etc.) avec le contexte reel de la partie, et la mise en page des lignes/colonnes replie maintenant correctement sur les petits ecrans.
- 2026-03-14 : les affichages de surface utilisent maintenant le pseudo plutot que l ID compte quand l information est disponible, et les listes de fiches privilegient le nom du personnage plutot que son identifiant technique.
- 2026-03-14 : le Studio système remplace les saisies d IDs pour lecteurs/co-editeurs par une recherche utilisateur a partir du pseudo avec selection assistee.
- 2026-03-14 : le fork de systeme est maintenant reserve aux MJ/admins, et uniquement pour des systemes `published`.
- 2026-03-14 : ajout d une documentation dediee aux variables reservees des fiches personnage pour les createurs de systeme.
- 2026-03-14 : renommage UX `Studio système` -> `Studio système` et `Studio Ecrans` -> `Studio Ecrans`, avec reorganisation de la page d entree des systemes.
- 2026-03-14 : la messagerie sociale garde un point d entree clair meme sans conversation existante, les MJ peuvent l utiliser comme les joueurs, et les notifications utilisateur cumulent maintenant messages, invitations de partie et demandes d amis avec un badge avatar repositionne.
- 2026-03-14 : la page `Parties` affiche maintenant d abord les parties ou l utilisateur participe reellement, puis le formulaire de creation, et ne remonte plus les parties hors participation meme pour un admin.
## 2026-03-15 - Runtime screen targets

- assouplissement de la detection des cibles `Fiche de personnage` dans le runtime :
  - `Ouvrir dans` accepte maintenant les widgets fiche non verrouilles sur `Personnage explicite`
- documentation Studio Ecrans mise a jour sur les cibles runtime

## 2026-03-15 - Studio système V2

- ajout du schéma `studioSchemaV2`
- remplacement de la page `Studio système` par une base V2 sur grille
- ajout d un runtime V2 de prévisualisation responsive
- sauvegarde transitoire d un `studioSchema` dérivé pour ne pas casser le runtime existant pendant le remplacement

- 2026-03-15 : le runtime V2 du Studio systeme gere maintenant les champs editables et les formules simples, et la page fiche personnage de partie l utilise en priorite quand une vue V2 correspond a la fiche.
- 2026-03-15 : le widget `Fiche de personnage` du Studio Ecrans peut maintenant afficher une fiche via le runtime V2 quand une vue V2 correspond au personnage.
- 2026-03-15 : purge active du flux fiche legacy, la creation de personnage, la fiche de session et le widget `Fiche de personnage` s appuient maintenant sur `studioSchemaV2` comme source unique.
- 2026-03-15 : la V2 recupere un noyau large de proprietes V1 cote auteur et runtime : conditions, validation, style, typo, formats, options, image, checkbox, jauges et subviews.
- 2026-03-15 : la palette du Studio systeme V2 est recomposee par familles `Structure / Champs editables / Affichage` pour retrouver la logique auteur du Studio V1.
- 2026-03-15 : les panneaux `Palette` et `Proprietes` du Studio systeme V2 sont maintenant detachables, avec memorisation locale de leur etat et de la taille des fenetres.
- 2026-03-15 : le runtime V2 conserve maintenant la disposition sur grille partout, y compris hors apercu studio, pour que le placement `x / y / w / h` reste la source de verite.
- 2026-03-15 : la structure `Onglets` du Studio systeme V2 a ete recablee pour lier des vues reelles, avec `Visible si` par onglet et positionnement `haut / gauche / droite`.
- 2026-03-15 : un joueur peut maintenant creer plusieurs fiches de personnage dans une partie, et la visibilite utilise aussi le personnage assigne.
- 2026-03-15 : le runtime V2 interprete a nouveau les references `@Label`, `{{Label}}` et `@vue_reference.Label`.
- 2026-03-16: ajout d un format d echange de vue systeme V2 (`.system-view.json`) avec import / export direct dans le Studio systeme.
- 2026-03-16: ajout de deux scripts externes separes du studio pour convertir `HTML -> JSON systeme` et `PDF -> JSON systeme` au format `nexusforge.system-draft`.
- 2026-03-16: ajout d une section de navigation `Outils` pour regrouper les convertisseurs et les fonctions annexes auteur hors Studio Systeme.
- 2026-03-24 : le Studio systeme V2 gere maintenant la profondeur des elements avec actions `Avancer / Reculer / Premier plan / Arriere-plan`, y compris sur une multi-selection, et le canvas comme le runtime respectent ce `zIndex`.
- 2026-03-24 : la doc auteur du Studio systeme V2 reference maintenant explicitement les helpers de formule numerique du runtime (`ifEq`, `ifGte`, `ifLte`, `min`, `max`, `abs`, `floor`, `ceil`, `round`, `clamp`) avec syntaxe et exemples.
- 2026-03-24 : le Studio systeme V2 ajoute un compositeur de formule en fenetre detachee avec recherche de variables, insertion assistee, operateurs et zone de test / resultat branchee sur le moteur runtime.
- 2026-03-24 : le compositeur de formule couvre maintenant aussi `Visible si` des onglets, les filtres de repetition et `Actif si` des boutons, avec groupes d operateurs et presets rapides.
- 2026-03-24 : l import JSON avance du `Studio systeme` accepte maintenant aussi un fichier `.json` complet choisi depuis le poste, et reinjecte les champs globaux utiles d un systeme (`author`, `rollDefinitions`, `studioTheme`, `catalogs` en plus du schema V2 et des regles).
- 2026-03-24 : l import JSON systeme applique maintenant une validation de structure et de volumetrie cote frontend et backend pour limiter les JSON malformes, trop volumineux ou potentiellement dangereux.
- 2026-03-24 : l import JSON systeme affiche maintenant un rapport avant import (resume, volumetrie, champs importes, champs ignores, warnings) pour rassurer le MJ avant creation du brouillon.
- 2026-03-24 : le rapport avant import detaille maintenant aussi la liste des vues et des catalogues detectes, ainsi que le nombre de vues fiche personnage.
- 2026-03-27 : le modele `GameSystem` accepte maintenant une couche `discordConfig` en lecture seule pour preparer des sorties Discord configurees par systeme (`sheet`, `inventory`, `notes`, `view1..9`).
- 2026-03-27 : le backend valide maintenant `discordConfig` a la creation et a la mise a jour d un systeme, avec contraintes sur les sorties, la visibilite et les formats.
- 2026-03-27 : le repository frontend clone, persiste et reimporte maintenant aussi `discordConfig`, y compris dans l import JSON complet du Studio systeme.
- 2026-03-29 : ajout du socle `characterCreationConfig` au niveau systeme pour preparer des regles de creation de personnage optionnelles, avec activation globale, reserves de creation, etapes et regles d allocation.
- 2026-03-29 : le backend valide maintenant `characterCreationConfig` a la creation et a la mise a jour d un systeme, et l import JSON complet du Studio systeme l accepte aussi.
- 2026-03-29 : le Studio systeme V2 ajoute une page detachee `Regle creation personnage`, au meme niveau que `Catalogues systeme` et `Configuration Discord`, pour commencer a construire des parcours de creation sans casser le flux simple actuel.
- 2026-03-29 : le flux joueur de creation de fiche dans la page de partie bascule maintenant vers une creation guidee quand `characterCreationConfig` est active, avec etapes, reserves, choix catalogue et application finale des valeurs dans la fiche V2.
- 2026-03-29 : la creation guidee gere maintenant aussi des variables temporaires de creation, avec ciblage `fiche` ou `creation`, popup de selection de variable directement dans les fonctions du script, et initialisation de ces variables au debut du wizard.
- 2026-03-29 : ajout de deux fonctions de script generiques dans la creation guidee : etape `valeur calculee` pour ecrire automatiquement une formule, et etape `tirage` pour lancer une formule de des et enregistrer le resultat dans une variable ou un champ.
- 2026-03-29 : ajout d une etape `condition` dans la creation guidee, avec branches `ALORS` / `SINON` et actions de script conditionnelles (`valeur calculee` ou `tirage`) pour commencer a se rapprocher d un vrai moteur de scenario de creation.

- 2026-03-28 : durcissement de la persistance backend en phase de production : flush des ecritures en attente lors des signaux de redemarrage (`SIGTERM` / `SIGINT` / `SIGHUP`), debounce de persistance raccourci, audit admin persiste automatiquement, et endpoint `/health` enrichi avec l etat de persistance (`pending`, `lastPersistAt`, `lastPersistReason`).

- 2026-03-28 : ajout d un historique local des `state.json` cote backend (`data/history`) avec rotation, pour faciliter les restaurations ciblees apres incident de persistance ou rollback d etat.

- 2026-03-28 : ajout d un journal append-only de persistance (`persist-log.jsonl`) avec horodatage, raison, hash court et volumes d objets pour diagnostiquer les ecritures de `state.json` en prod.
- Discord: liaison/de-liaison d un compte utilisateur declenche maintenant une resynchronisation automatique des parties liees, y compris pour les invitations en attente et les permissions de salons de partie.
- Backend: audit de démarrage ajouté. Le boot compare maintenant l état chargé avec le dernier persist connu et le dernier snapshot d historique, expose le rapport dans /health et remonte une alerte Discord staff en cas de régression probable.
# 2026-03-30

## Creation personnage v2

- runtime v2 branche sur la creation guidee quand `characterCreationConfig.version === 2`
- plus de prise en charge du vieux mode v1 dans l'UI de test
- blocs executes dans le wizard :
  - `message`
  - `question_text`
  - `question_textarea`
  - `question_number`
  - `question_choice`
  - `question_catalog`
  - `allocation`
  - `set_value`
  - `copy_value`
  - `adjust_value`
  - `roll`
  - `if` / `elseIf` / `else`
  - `group`
  - `loop`
  - `while`
  - `next_stage`
  - `stop`
- affichage en direct des reserves et variables temporaires
- nouveau bloc `allocation` :
  - reserve source
  - cibles multiples
  - pas d augmentation
  - min / max
  - formule de cout par increment
  - conditions d activation
- acces de test toujours reserve au compte admin proprietaire Discord

- 2026-04-15: acceleration des ressources protegees cote runtime: cache frontend partage pour les blobs, prechargement des ressources de session au chargement joueur et rechauffage des ressources ciblees par les widgets ecran.
- 2026-04-15: le backend genere maintenant une miniature `.webp` et un apercu `.webp` pour chaque image a l upload, applique le meme traitement aux creations via sync offline, et relance automatiquement un backfill des images existantes au demarrage.
