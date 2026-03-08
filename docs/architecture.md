# Architecture de Nexus Forge

Ce document décrit l’architecture globale de Nexus Forge : principes, composants, flux de données, gestion offline‑first et multi‑écrans.

Référence API backend MVP (implémentation actuelle): [`docs/api/backend-mvp.md`](api/backend-mvp.md).

---

## 1. Principes d’architecture

- **Offline‑first** : l’application doit être entièrement utilisable hors ligne (consultation et modification), avec synchronisation différée lorsque la connexion est disponible.
- **Multi‑plateforme** : fonctionnement sur navigateur desktop, mobile et tablette via une Progressive Web App (PWA).
- **System‑agnostic** : aucun système de JDR codé en dur ; les règles sont définies par des schémas JSON et un moteur de règles configurable.
- **Multi‑utilisateurs** : gestion des rôles (MJ, joueur, écrans dédiés) et d’une table complète (sessions live).
- **Séparation front / backend** : frontend PWA + backend API/temps réel.

---

## 2. Vue d’ensemble

### 2.1. Composants principaux

- **Frontend PWA**
  - UI (React/Vue/…) responsive.
  - Service Worker (cache statique, offline, background sync).
  - Base locale (IndexedDB via librairie).
  - Moteur de règles (JS sandbox) + éditeur visuel (blocs).

- **Backend API**
  - Exposition d’API REST/GraphQL pour :
    - authentification,
    - synchronisation des données (systèmes, fiches, sessions, notes, messages, documents métadonnées),
    - gestion des utilisateurs et des tables.

- **Backend temps réel**
  - Canal WebSocket / Realtime pour :
    - sessions live (initiative, états, battlemap),
    - chat et messages privés,
    - notifications (nouveaux documents, etc.).

- **Stockage serveur**
  - Base de données (systèmes, fiches, sessions, logs de messages).
  - Stockage de fichiers (images, PDF, handouts).

---

## 3. Frontend et PWA

### 3.1. PWA et Service Worker

- Mise en cache des assets (HTML, JS, CSS, images critiques).
- Mode offline pour :
  - l’interface principale,
  - les données récemment synchronisées (fiches, notes, documents).
- Background Sync pour envoyer les actions en attente lorsque la connexion revient.

### 3.2. Base locale

- Utilisation d’IndexedDB (via une librairie type Dexie/RxDB) pour :
  - stocker les entités : `System`, `Character`, `Session`, `Note`, `Message`, `Document`, etc.
  - conserver un **journal d’actions** (log local) :
    - création/modification/suppression,
    - évènements de session (jets, changement d’initiative, etc.).

---

## 4. Modèle de données (vue logique)

*(Les schémas détaillés sont dans `docs/data-model/`.)*

Entités principales :

- **System**
  - définition des caractéristiques, types de jets, scripts de règles, templates de fiches, blocs visuels.
- **Character**
  - fiches PJ/PNJ, basées sur un `System`.
- **Session**
  - campagne + séance en cours, initiative, états, groupes de communication.
- **Note**
  - notes privées joueur, notes publiques, notes privées MJ.
- **Message**
  - chat global, messages privés, messages de groupe.
- **Document**
  - images, PDF, handouts, fiches/objets partagés.

Chaque entité existe en deux versions :

- **Locale** : en base sur l’appareil.
- **Serveur** : référence synchrone côté backend.

---

## 5. Sync offline‑first et résolution de conflits

### 5.1. Journal d’actions

Au lieu de ne stocker que des “snapshots”, le frontend enregistre des **actions** :

- `createCharacter`, `updateCharacterField`, `addNote`, `sendMessage`, etc.
- Chaque action a :
  - un identifiant local,
  - un horodatage,
  - une référence d’entité.

Ces actions sont :

- appliquées immédiatement sur la base locale,
- envoyées au serveur dès que possible.

### 5.2. Règles de résolution de conflits

Lors de la synchronisation :

- Pour la plupart des entités, le **MJ est prioritaire** :
  - en cas de conflits entre versions MJ / autres / serveur, la version MJ l’emporte.
- Pour les **fiches PJ** :
  - si seul le joueur a modifié la fiche : les changements du joueur sont acceptés.
  - si MJ ET joueur ont modifié : un mécanisme de **diff par champ** est appliqué :
    - comparaisons champ à champ (PV, XP, inventaire, etc.),
    - écran de validation pour le MJ (choix version MJ, version joueur ou merge manuel).
- Pour les **notes privées joueur** :
  - jamais visibles ni modifiables par le MJ (sauf configuration explicite future).
- Les conflits sont gérés au niveau application, pas directement au niveau base.

---

## 6. Sessions live et multi‑écrans

### 6.1. Rôles et clients

Une session live comporte plusieurs **clients** :

- **Client MJ**
  - tableau de bord (dashboard) drag & drop.
  - accès complet aux données (sauf notes privées joueurs).
- **Client Battlemap**
  - vue centrée sur la carte, les tokens et la fog of war.
- **Client Infos joueurs**
  - dashboard pour la table : initiative, effets, journal, documents/handouts, images.
- **Clients joueurs**
  - chaque joueur a une vue orientée fiche PJ, notes, messages, documents reçus.

Chaque client se connecte à la session avec un **rôle** et n’accède qu’aux données autorisées.

### 6.2. Multi‑écrans

Sur la machine du MJ :

- plusieurs onglets/fenêtres peuvent être ouverts :
  - onglet MJ (dashboard),
  - onglet Battlemap (sur un autre écran/TV),
  - onglet Infos joueurs (sur écran dédié).
- Possibilité d’utiliser les APIs multi‑écrans du navigateur (Window Placement, Presentation API) pour pousser automatiquement certaines vues vers des écrans externes.

---

## 7. Dashboard MJ

Le dashboard MJ est basé sur un système de **widgets** :

- Chaque widget représente un module :
  - Initiative, liste PJ/PNJ, notes MJ, journal public, messages privés, contrôle battlemap, contrôle infos joueurs, macros/scripts, etc.
- Les widgets sont organisés sur une **grille** :
  - ajout/suppression,
  - déplacement (drag & drop),
  - redimensionnement (small/medium/large).
- Configuration spécifique par campagne/système et stockée :
  - localement (offline),
  - synchronisée côté serveur.

---

## 8. Communication et partage

### 8.1. Canaux de communication

- **Global** : toute la table.
- **MJ ↔ joueur** : messages privés (whispers).
- **joueur ↔ joueur** : messages privés et groupes de joueurs.
- **Groupes** :
  - groupes créés par le MJ (ex : groupe A/B lorsque les PJ se séparent).

### 8.2. Messages et documents

- Les messages peuvent contenir :
  - texte,
  - références à des documents, fiches, notes, objets.
- Partage de documents :
  - MJ → 1 joueur, plusieurs joueurs, tous,
  - joueurs → MJ,
  - joueurs → autres joueurs / groupes.
- Chaque nouvel élément reçu déclenche :
  - un **bandeau central** temporaire (notification très visible),
  - puis une notification persistante dans une zone dédiée.

### 8.3. Contrôle MJ

- Le MJ dispose d’un **switch de contrôle** :
  - activer/désactiver communications joueurs ↔ joueurs,
  - éventuellement limiter à certains canaux (ex. global off, MP autorisés).

---

## 9. Sécurité et sandbox

- Le moteur de règles exécute du code JavaScript dans une **sandbox** :
  - via Web Worker ou VM sécurisée,
  - sans accès direct au DOM, au réseau ou à l’environnement global.
- Les systèmes et scripts importés depuis l’extérieur sont :
  - validés (structure, types),
  - éventuellement marqués comme « non approuvés » tant que le MJ ne les a pas validés.

---

## 10. Prochaines étapes

- Définir les schémas JSON détaillés dans `docs/data-model/` :
  - `system.schema.json`
  - `character.schema.json`
  - `session.schema.json`
  - `note.schema.json`
  - `message.schema.json`
  - `document.schema.json`
- Définir les premiers flux d’interface (wireframes) :
  - éditeur de système,
  - dashboard MJ,
  - session live (MJ + joueur).
