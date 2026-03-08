# Nexus Forge

Nexus Forge est une application de gestion de jeux de rôle sur table (JDR) **offline‑first**, pensée pour toute la table : meneur de jeu (MJ) et joueurs.  
Elle permet de créer des systèmes de jeu génériques, gérer fiches de personnages, campagnes, notes et documents, et de jouer en session live avec multi‑écrans.

---

## Objectifs du projet

- Offrir un **outil générique** non lié à un système de JDR particulier.
- Permettre aux utilisateurs de **créer / dupliquer / modifier** leurs propres systèmes de jeu sans écrire de code.
- Fonctionner en mode **offline‑first** sur PC, tablette et téléphone, avec synchronisation vers une plateforme web.
- Faciliter la gestion de table en session (présentiel ou en ligne) avec :
  - vues dédiées MJ, battlemap et joueurs,
  - communication riche (chat, messages privés, partage de documents),
  - dashboard MJ totalement personnalisable.

---

## Fonctionnalités principales (vision)

### 1. Systèmes de jeu génériques

- Création et édition de systèmes agnostiques (stats, jets, combats, progression, etc.).
- Éditeur visuel **type Scratch** (blocs drag & drop) pour définir les règles.
- Mode avancé avec scripts JavaScript sandboxés.
- Import / export complet en **JSON** (systèmes, règles, fiches).

### 2. Fiches et données de campagne

- Fiches **PJ** et **PNJ** basées sur les systèmes configurés.
- **Notes privées joueur**, **notes publiques** de campagne, **notes privées MJ**.
- Documents liés : images, PDF, handouts, fiches, objets, etc.

### 3. Offline‑first et synchronisation

- Fonctionnement complet **hors ligne** sur chaque appareil.
- Base locale + journalisation des actions pour synchro ultérieure.
- Règles de résolution de conflits :
  - MJ prioritaire sur la majorité des données,
  - fiches PJ : validation champ par champ par le MJ en cas de conflit.

### 4. Sessions live et multi‑écrans

- Création de sessions live (présentiel ou online).
- Trois vues principales :
  - **Écran MJ** : dashboard complet, outils, notes privées.
  - **Battlemap** : carte, tokens, fog of war.
  - **Infos joueurs** : initiative, effets, docs, handouts, images, etc.
- Support multi‑écrans / multi‑onglets (un écran par vue).

### 5. Dashboard MJ drag & drop

- Dashboard MJ sous forme de **widgets** :
  - initiative, liste PJ/PNJ, notes, contrôles battlemap, contrôles écran joueurs, messages privés, macros, etc.
- Organisation libre par drag & drop, redimensionnement, presets par campagne/système.

### 6. Communication & partage

- Chat global, messages privés MJ ↔ joueur, messages entre joueurs, groupes de joueurs.
- Partage de documents ciblé :
  - à un joueur, plusieurs, ou tous.
- Bandeaux d’alerte **très visibles** au centre de l’écran lors de l’arrivée d’un message/document.
- Possibilité pour le MJ de **bloquer les communications** joueurs↔joueurs.

---

## Stack technique envisagée

*(indicatif, sujet à évolution)*

- Frontend : PWA (TypeScript, framework JS moderne).
- Stockage local : IndexedDB (via une librairie adaptée, ex. RxDB/Dexie).
- Backend : API + canal temps réel (WebSockets).
- Éditeur de règles : blocs visuels (type Blockly) + éditeur de code (type Monaco).

---

## État du projet

> Projet en phase de **prototype initial**.  
> La documentation de conception est en place et le frontend V1 est bootstrapé (routing, auth mock, dashboard stub).

Suivi détaillé de l'avancement: [`docs/suivi-travail.md`](docs/suivi-travail.md).  
Documentation API backend MVP: [`docs/api/backend-mvp.md`](docs/api/backend-mvp.md).

---

## Roadmap (première itération)

1. Définition des schémas JSON de base :
   - systèmes de jeu,
   - fiches PJ/PNJ,
   - sessions, notes, messages, documents.
2. Prototype de l’éditeur de systèmes (blocs + JSON + exécution locale).
3. Prototype minimal de session live (MJ + 1 joueur, initiative et chat).
4. Mise en place du dashboard MJ simple.
5. Ajout progressif :
   - multi‑écrans,
   - partage de documents,
   - groupes de communication.

---

## Contribuer

Les contributions seront bienvenues une fois les premiers schémas et choix techniques stabilisés.  
Les pistes de contribution incluent :

- schémas de données (JSON),
- UX/UI (dashboard MJ, fiches, écrans joueurs),
- moteur de règles,
- gestion offline / synchronisation.

---

## Licence

Nexus Forge est distribué sous licence **Apache License 2.0**.  
Voir le fichier [`LICENSE`](LICENSE) pour plus de détails.
