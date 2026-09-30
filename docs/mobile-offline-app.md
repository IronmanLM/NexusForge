# Application mobile offline-first - Android et iOS

Ce document pose la cible technique de Nexus Forge pour la phase mobile et tablette.

Il sert de reference de travail pour :

- l application Android
- l application iOS
- le mode hors ligne
- la resynchronisation automatique
- la gestion des conflits

## Objectif

Permettre a un MJ et a ses joueurs d utiliser une partie sur telephone et tablette :

- sans connexion reseau
- avec stockage local fiable
- avec consultation et edition des donnees utiles
- avec reprise automatique de la synchronisation au retour en ligne

La cible n est pas une simple PWA mobile.

La cible retenue est une application mobile dediee :

- Android en premier
- iOS ensuite

## Perimetre fonctionnel mobile

L application mobile ne cherche pas a embarquer tous les outils auteur.

### Inclus

- connexion et compte
- consultation et utilisation des parties
- fiches personnage
- notes
- documents et ressources deja disponibles
- ecrans et rendus utiles en partie
- synchro online et offline

### Exclu du perimetre mobile

- Studio systeme

Le Studio systeme n est pas retenu pour l application mobile, car son usage auteur est peu adapte a un ecran reduit.

Le web reste la surface principale pour :

- creer un systeme
- structurer des vues
- faire de l edition auteur avancee

### Comportement online

Hors Studio systeme, le reste doit fonctionner normalement en ligne sur mobile :

- consultation de partie
- edition de fiche
- lecture de documents
- notes
- navigation de compte

## Choix technique recommande

### Base applicative

Conserver le frontend React/Vite existant comme base unique de l application.

### Emballage mobile

Utiliser Capacitor pour produire :

- une application Android
- une application iOS

Cela permet de :

- garder une seule base de code principale
- reutiliser le runtime React existant
- acceder aux APIs natives utiles
- rester pragmatique sur le delai et la maintenance

### Pourquoi Capacitor

Capacitor est le meilleur compromis pour Nexus Forge parce que :

- le projet est deja fortement avance en frontend web
- le besoin principal est l offline et la persistence locale, pas une UI 100% native
- Android et iOS peuvent etre vises sans reimplementation complete
- le pont natif couvre les besoins prevus :
  - etat reseau
  - stockage de fichiers
  - preferences locales
  - ouverture de documents
  - eventuelles notifications plus tard

## Cibles de plateforme

### Phase 1 - Android

Android sert de plateforme de validation du socle mobile parce que :

- les cycles de build et test sont plus souples
- le debug est plus simple
- la publication interne est plus rapide

### Flux de build Android retenu

Le projet fournit maintenant trois commandes frontend :

- `npm run mobile:android:doctor`
- `npm run mobile:android:apk`
- `npm run mobile:android:apk:release`
- `npm run mobile:android:aab:release`

Le flux vise d abord :

1. build web
2. `cap sync`
3. `assembleDebug`
4. installation manuelle de l APK de test

### Preconditions machine de build Android

La machine qui construit l APK doit fournir :

- `java`
- `JAVA_HOME`
- `ANDROID_HOME` ou `ANDROID_SDK_ROOT`
- un SDK Android compatible avec :
  - `compileSdkVersion 35`
  - `targetSdkVersion 35`

Dans l environnement de travail actuel, ces prerequis sont maintenant fournis en local dans le home utilisateur :

- JDK local :
  - `~/.local/android/jdk-21.0.10+7`
- SDK Android local :
  - `~/Android/Sdk`

### Emplacements de sortie

- debug :
  - `frontend/android/app/build/outputs/apk/debug/app-debug.apk`
- release :
  - `frontend/android/app/build/outputs/apk/release/app-release.apk`
- bundle Play Store :
  - `frontend/android/app/build/outputs/bundle/release/app-release.aab`

### Signature release Android

La publication Android doit utiliser une cle de signature release stable et conservee hors depot.

Le projet lit cette configuration depuis :

- `frontend/android/key.properties`
- ou les variables d environnement :
  - `NEXUSFORGE_ANDROID_KEYSTORE_PATH`
  - `NEXUSFORGE_ANDROID_KEYSTORE_PASSWORD`
  - `NEXUSFORGE_ANDROID_KEY_ALIAS`
  - `NEXUSFORGE_ANDROID_KEY_PASSWORD`

Un exemple versionne est fourni :

- `frontend/android/key.properties.example`

Le fichier reel `key.properties` et les fichiers `.jks` / `.keystore` ne doivent pas etre versionnes.

### Procedure de publication Android retenue

1. preparer ou restaurer la cle de signature release
2. renseigner `frontend/android/key.properties`
3. verifier l environnement :
   - `npm run mobile:android:doctor`
4. generer le bundle Play Store :
   - `npm run mobile:android:aab:release`
5. recuperer le fichier :
   - `frontend/android/app/build/outputs/bundle/release/app-release.aab`
6. publier d abord en test interne ou ferme sur le Play Console

### Publication Play Console

Avant publication, il faut prevoir :

- un `versionCode` incremente a chaque release
- un `versionName` lisible pour les testeurs
- l icone finale
- les captures Android
- la description courte et longue
- la politique de confidentialite
- la declaration securite / donnees du Play Console

### Mises a jour Play In-App Updates

L application Android embarque maintenant le flux Google Play `In-App Updates` en mode `immediate`.

Objectif :

- forcer la mise a jour quand une version critique est publiee sur le Play Store
- eviter de laisser tourner une ancienne build trop longtemps

Points importants :

- ce flux ne fonctionne que pour une application installee depuis Google Play
- un APK installe manuellement ne declenchera pas ce mecanisme
- le test reel doit donc se faire via une piste Play Console :
  - test interne
  - test ferme

Le flux retenu :

1. ouverture ou reprise de l application Android
2. verification d une mise a jour disponible via Google Play
3. si une mise a jour immediate est autorisee :
   - ouverture du flux Play natif
   - l utilisateur doit mettre a jour avant de continuer

### Etat de build actuel

Le premier build Android debug a ete valide avec succes.

APK disponible :

- `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### Phase 2 - iOS

iOS vient une fois le flux valide sur Android :

- cache local stable
- telechargement de partie
- edition offline
- resynchronisation
- gestion des conflits

## Architecture cible

## 1. Socle commun

Le coeur applicatif reste partage entre :

- web
- Android
- iOS

Le frontend porte :

- l UI
- le moteur Studio systeme runtime
- le moteur Studio Ecrans runtime
- le cache local
- la file d actions offline
- la logique de synchro

## 2. Couche mobile

La couche mobile Capacitor ajoute :

- detection reseau native
- gestion des fichiers locaux
- ouverture de medias et documents
- stockage natif si necessaire
- build et publication Android / iOS

## 3. Backend

Le backend reste la source serveur :

- auth
- systems
- sessions
- characters
- messages
- notes
- resources
- screen templates
- sync

## Donnees a rendre disponibles offline

Pour une partie telechargee localement, l application mobile doit pouvoir embarquer au minimum :

- la partie
- le systeme de jeu associe
- les vues Studio systeme necessaires
- les personnages visibles par le compte
- les notes visibles
- les templates ecran utiles
- les ressources deja telechargees

Pour un joueur, il faut explicitement conserver en local :

- une version de ses fiches de personnage
- les donnees de partie auxquelles son compte est rattache
- le contenu des fichiers lies a ces parties

Les creations et editions hors ligne doivent rester possibles pour les usages autorises :

- edition de fiche personnage
- ajout de fichiers dans Mes fichiers et dans une partie
- creation et edition de dossiers de ressources

Ces actions partent dans une file locale et sont rejouees a la reconnexion.

Selon le role :

- un MJ telecharge toute la partie utile
- un joueur telecharge uniquement les donnees autorisees pour lui

## Stockage local recommande

### Donnees structurees

Utiliser la couche locale deja presente comme base de travail :

- IndexedDB sur web
- puis evaluation d un backend SQLite mobile si Capacitor l exige pour plus de robustesse

## Synchronisation au demarrage

Au demarrage de l application mobile, si le compte possede des parties deja preparees hors ligne ou des actions locales en attente :

- l application peut proposer une synchronisation immediate
- le choix utilisateur peut etre memorise

Choix prevus :

- Oui
- Oui et memoriser
- Non
- Non et memoriser

Si l utilisateur choisit `Oui`, l application :

- rejoue la file d actions locale
- rafraichit automatiquement les parties preparees hors ligne

Si l utilisateur choisit `Non`, aucune synchronisation n est lancee au demarrage.

Recommendation pragmatique :

1. garder IndexedDB/Dexie comme socle commun de demarrage
2. valider Android
3. n introduire SQLite mobile que si des limites reelles apparaissent

### Fichiers

Les ressources binaires ne doivent pas dependre uniquement du cache navigateur.

Il faut une vraie strategie fichier :

- telechargement local dans un stockage applicatif
- index local des ressources telechargees
- lien entre metadonnees ressource et fichier physique

Chaque ressource locale doit pouvoir indiquer :

- son id serveur
- son chemin local
- son etat de telechargement
- sa date de mise a jour
- sa validite cache

## Modele local retenu pour une partie offline

Le projet ajoute maintenant un vrai modele local `OfflineSessionBundle`.

Son role :

- dire si une partie est disponible hors ligne
- suivre l etat du telechargement
- lister les fiches conservees localement
- lister les ressources de partie preparees pour le mode offline

Champs principaux :

- `sessionId`
- `systemId`
- `accountUserId`
- `role`
- `status`
- `requestedAt`
- `lastHydratedAt`
- `lastSyncAt`
- `lastError`
- `sessionUpdatedAt`
- `systemUpdatedAt`
- `cachedCharacterIds`
- `characters`
- `resources`

Statuts retenus :

- `queued`
- `downloading`
- `ready`
- `stale`
- `error`

La table locale associee est maintenant :

- `offlineSessions`

Cette table sert de pivot pour la future action :

- `Rendre disponible hors ligne`

## Etat actuel du lot 1

Le lot 1 pose maintenant deux briques deja branchées :

- le shell Android Capacitor
- la preparation locale d une partie pour le mode hors ligne

### Preparation locale disponible

Un service frontend `prepareSessionOfflineBundle` hydrate maintenant un bundle local a partir de :

- la partie
- le systeme associe
- les fiches visibles pour le compte courant
- les ressources de partie
- les templates ecran utiles mis en cache

Le resultat est stocke dans `offlineSessions`.

### Ce que couvre deja cette preparation

- statut local de disponibilite hors ligne
- role du compte sur la partie
- liste des fiches conservees localement
- liste des ressources de partie referencees localement
- mise en cache des metadonnees systeme et templates

### Telechargement des ressources

La preparation locale telecharge maintenant aussi le contenu binaire des ressources de partie quand une URL protegee est disponible.

Le stockage local conserve :

- le blob du fichier
- son type MIME
- sa taille
- la date de telechargement
- la date de mise a jour distante connue

Ce stockage sert deja de base pour les apercus offline.

L ouverture d une ressource depuis :

- la bibliotheque de fichiers
- le widget documents

essaie maintenant d abord le cache local avant de retomber sur le telechargement protege distant.

Les widgets suivants reutilisent deja le cache local pour leur rendu quand le fichier est disponible :

- documents
- media
- PDF

### Rafraichissement des fichiers

La preparation du cache hors ligne applique maintenant une premiere strategie simple :

- si `updatedAt` ne change pas
- et si l URL source de la ressource ne change pas

alors le fichier local est conserve sans retelechargement.

Si l une de ces deux informations change :

- le fichier est retelecharge
- le blob local est remplace

### Nettoyage du cache

Une premiere action `Nettoyer le cache` est disponible depuis la partie.

Elle supprime pour le compte courant :

- les fichiers offline qui ne sont plus references par aucune partie offline conservee localement
- puis, si le cache depasse encore le plafond courant de 512 Mo, les fichiers lies uniquement a des bundles `stale` ou `error`, du plus ancien au plus recent

### Ce qui reste au lot suivant

Le lot suivant doit encore ajouter :

- la lecture offline systematique dans tous les widgets et ecrans d ouverture restants
- une politique de purge plus avancee par taille, age et priorite

Elle permettra ensuite d enchainer proprement sur :

- le telechargement reel de la partie
- la mise a jour du cache local
- la verification des ressources manquantes
- la relance d une synchro au retour en ligne

Le contenu des fichiers lies aux parties rattachees au compte doit donc etre synchronise localement pour permettre une consultation hors ligne.

## Telechargement d une partie

Le mode mobile doit ajouter une action explicite du style :

- `Rendre disponible hors ligne`

Cette action doit :

1. charger la partie
2. charger les personnages
3. charger les notes
4. charger les ressources de partie
5. charger les templates ecran associes
6. charger le systeme et ses vues utiles au runtime
7. telecharger le contenu des fichiers lies a la partie
8. conserver une version locale des fiches du joueur
9. marquer localement la partie comme disponible hors ligne

## Strategie de synchronisation

## 1. Principe

L application travaille d abord localement.

Chaque modification cree :

- une mise a jour locale immediate
- une action dans la file de synchronisation

Exemples d actions :

- mise a jour de fiche personnage
- creation d une note
- changement de reglage de partie
- partage d une ressource

## 2. File d actions offline

La file locale doit stocker pour chaque action :

- `id`
- `entityType`
- `entityId`
- `actionType`
- `payload`
- `createdAt`
- `status`
- `retryCount`
- `lastError`
- `sessionId` si pertinent

Statuts minimaux :

- `pending`
- `processing`
- `synced`
- `conflict`
- `failed`

## 3. Declenchement de la sync

La sync doit etre lancee :

- au retour reseau
- a l ouverture de l application
- a l ouverture d une partie offline
- manuellement par l utilisateur

## 4. Endpoint de sync

L endpoint actuel est :

- `POST /api/sync/actions`

Il renvoie actuellement un resultat metier dans le body :

- `accepted`
- `conflict`
- `rejected`

Le frontend mobile devra se baser la-dessus.

## Gestion des conflits

La gestion des conflits doit etre simple pour le joueur et exploitable pour le MJ.

## 1. Conflits simples

Cas :

- une action est rejetee ou entre en conflit

Comportement :

- l action reste visible dans la file locale
- l utilisateur voit qu elle demande une resolution

## 2. Conflits de fiche personnage

Cas prioritaire :

- personnage modifie hors ligne
- serveur modifie aussi entre-temps

Strategie cible :

- comparaison champ par champ
- choix `garder local`
- choix `garder serveur`

## Limites volontaires en mode hors ligne

Le mode hors ligne n essaie pas de faire fonctionner les couches de communication reseau.

### Non pris en charge hors ligne

- messagerie privee hors partie
- chat de partie
- partage immediat de nouveau fichier

### Regle de partage de document hors ligne

Si le MJ partage un document alors que l application est hors ligne :

- l action est stockee localement
- elle n apparait pas encore chez les joueurs
- elle devient visible aux joueurs une fois l application revenue en ligne et la synchronisation effectuee

Cela evite de promettre un comportement temps reel impossible sans connexion.
- plus tard : merge assiste si necessaire

## 3. Priorites metier

La doc fonctionnelle actuelle reste valable :

- les conflits importants de partie doivent pouvoir etre arbitres par le MJ
- les donnees purement privees joueur doivent rester dans leur perimetre

## Comportement UX mobile attendu

L application mobile doit rendre tres clair :

- si la partie est disponible hors ligne
- quand la derniere synchro a reussi
- combien d actions sont en attente
- s il existe des conflits

Indicateurs minimum :

- badge `hors ligne disponible`
- compteur `actions en attente`
- compteur `conflits`
- date de derniere synchro

## Decoupage de realisation

### Lot 1 - Preparation mobile

- ajouter Capacitor au frontend
- generer le shell Android
- verifier le build local
- verifier auth + navigation de base dans le shell mobile

### Etat actuel du lot 1

Le socle Capacitor Android est maintenant pose dans le projet :

- dependances Capacitor ajoutees au frontend
- fichier de configuration Capacitor ajoute
- shell Android genere dans `frontend/android`
- synchronisation web -> Android validee

Fichiers principaux :

- `frontend/capacitor.config.ts`
- `frontend/android/`
- `frontend/package.json`

Commandes utiles :

```bash
cd frontend
npm run build
npm run mobile:sync
npm run mobile:android
```

Sens des commandes :

- `npm run build` : build web de reference
- `npm run mobile:sync` : copie le build web vers le shell natif et met a jour les plugins
- `npm run mobile:android` : ouvre le projet Android Studio

Point d arret actuel :

- Android est initialise
- iOS n est pas encore genere
- le travail offline metier n est pas encore branche dans la couche mobile

### Lot 2 - Partie offline lisible

- telechargement local d une partie
- chargement local de la partie hors ligne
- lecture de personnages, notes, messages et ressources deja synchronisees

### Lot 3 - Edition offline

- edition locale des fiches
- edition locale des notes
- file d actions locale complete
- reprise apres fermeture de l application

### Lot 4 - Resynchronisation

- detection online/offline
- declenchement automatique de sync
- remontes `accepted / conflict / rejected`
- UI de resolution de conflit

### Lot 5 - Ressources locales

- telechargement reel des fichiers
- lecture locale image / pdf / texte / video
- invalidation et mise a jour des fichiers

### Lot 6 - iOS

- generation du shell iOS
- validation stockage local
- validation lecture fichiers
- validation sync et reprise reseau

## Risques principaux

### 1. Cache navigateur insuffisant

Risque :

- une simple approche PWA peut etre trop fragile pour les fichiers et la persistence mobile longue duree

Reponse :

- app Capacitor
- vraie gestion locale des fichiers

### 2. Sync trop generique

Risque :

- un endpoint de sync trop simple peut vite limiter la qualite de reprise ou la resolution de conflits

Reponse :

- garder `POST /api/sync/actions` comme socle
- enrichir progressivement le contrat si besoin

### 3. Fichiers lourds

Risque :

- stockage local volumineux sur telephone

Reponse :

- telechargement explicite
- gestion par partie
- nettoyage local manuel plus tard

## Decision retenue

La cible officielle de la phase mobile est :

- une application Android puis iOS
- basee sur le frontend existant
- embarquee avec Capacitor
- offline-first avec file d actions locale
- resynchronisation automatique a la reconnexion

## Documents lies

- [Architecture globale](./architecture.md)
- [API](./api/index.md)
- [API Sync](./api/sync-actions.md)
- [Parties](./ui/parties.md)
- [Studio système](./ui/studio-system-v2.md)
