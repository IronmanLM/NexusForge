# Nexus Forge

Nexus Forge est une application de gestion de jeux de rôle sur table (JDR) **offline-first**, pensée pour toute la table : meneur de jeu (MJ) et joueurs.  
Elle permet de créer des systèmes de jeu génériques, gerer fiches de personnages, parties, notes et fichiers, et de jouer avec multi-ecrans.

---

## Objectifs du projet

- Offrir un **outil générique** non lié à un système de JDR particulier.
- Permettre aux utilisateurs de **créer / dupliquer / modifier** leurs propres systèmes de jeu sans écrire de code.
- Fonctionner en mode **offline‑first** sur PC, tablette et téléphone, avec synchronisation vers une plateforme web.
- Faciliter la gestion de table en partie (presentiel ou en ligne) avec :
  - vues dediees MJ et joueurs,
  - communication riche (chat, messages prives, partage de fichiers),
  - Studio Ecrans pour composer les interfaces de table.

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

### 4. Parties et multi-ecrans

- Creation de parties planifiees ou actives.
- Page `Partie` structuree en onglets.
- Support multi-ecrans / multi-onglets via `Studio Ecrans`.
- Runtimes separes pour les ecrans MJ et joueurs selon le template choisi.

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

## Etat du projet

Le projet est en **prototype fonctionnel offline-first** avec :

- parties locales (chargement IndexedDB),
- chat persistant,
- initiative persistante,
- notes/documents persistants,
- sync locale avec gestion des conflits,
- Studio Ecrans multi-profils par compte ou systeme (widgets sur grille),
- catalogue des systèmes de jeu (sélection, création, duplication),
- Studio système V2 sur grille,
- fiches personnage rendues par le runtime V2,
- creation de fiches de partie depuis les vues du systeme,
- permissions d'édition des systèmes (propriétaire ou admin),
- seed `SteamShadows Core` enrichi (PJ, PNJ, Créature, Horreurs Arcanum).

Suivi détaillé de l'avancement: [`docs/suivi-travail.md`](docs/suivi-travail.md).  
Contrats API (MVP): [`docs/api/index.md`](docs/api/index.md).

---

## Roadmap (première itération)

1. Définition des schémas JSON de base :
   - systèmes de jeu,
   - fiches PJ/PNJ,
   - parties, notes, messages, documents.
2. Prototype de l’éditeur de systèmes (blocs + JSON + exécution locale).
3. Prototype minimal de partie live (MJ + 1 joueur, initiative et chat).
4. Mise en place du Studio Ecrans.
5. Ajout progressif :
   - multi‑écrans,
   - partage de documents,
   - groupes de communication.

---

## Contribuer

Les contributions seront bienvenues une fois les premiers schémas et choix techniques stabilisés.  
Les pistes de contribution incluent :

- schémas de données (JSON),
- UX/UI (parties, fiches, ecrans joueurs),
- moteur de règles,
- gestion offline / synchronisation.

---

## Licence

Nexus Forge est distribué sous licence **Apache License 2.0**.  
Voir le fichier [`LICENSE`](LICENSE) pour plus de détails.

---

## Déploiement frontend connecté backend

Le frontend de production est prévu pour un backend réel.

Variables Vite (voir `frontend/.env.example`):

- `VITE_API_BASE_URL=https://api.votre-domaine.tld`
- `VITE_BACKEND_ENABLED=true`
- `VITE_SYNC_TRANSPORT=http`

Build:

```bash
cd frontend
npm ci
npm run build
```

Puis déployer le contenu de `frontend/dist` sur l'hébergement web (ex: o2switch).

### Déploiement O2switch

Le processus de déploiement et de backup de production est maintenu en scripts privés hors dépôt.
Principes obligatoires:

- backup de `backend/data/state.json` avant chaque mise à jour,
- stockage local des backups hors git,
- préservation de `backend/data` et `backend/.env` pendant la synchro,
- fallback SPA `.htaccess` conservé côté frontend.

### Backend inclus dans ce repo

Un backend Express est disponible dans `backend/` avec:

- inscription + validation email,
- approbation admin,
- login JWT + refresh,
- verrouillage progressif,
- reset mot de passe,
- 2FA TOTP.

Lancement local:

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Healthcheck:

```bash
curl http://127.0.0.1:4000/health
```
