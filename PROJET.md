# PROJET — NexusForge / branche `decors`

## 1. Définition

> Fork local de NexusForge (gestion JDR table offline-first : MJ + joueurs, systèmes génériques, fiches PJ/PNJ, campagnes, notes, sessions live multi-écrans) pour travaux **décors / présentation** : responsivité, thèmes, plugins.

- Repo cloné : `git@github.com:IronmanLM/NexusForge.git`
- Chemin local : `/home/fabrice/Projets/NexusForge`
- Branche de travail : `decors` (basée sur `main`)
- Branche future prévue : `AO` (spécifique plugins AO-Dev, voir M3)
- Fichier de cadrage local (hors git, ne jamais committer) : `/home/fabrice/.config/opencode/contexte-ai.md`
- Secrets (hors git, jamais en clair) : `/home/fabrice/.config/opencode/secrets.env` via `/home/fabrice/.config/opencode/charge-secrets.sh`
- Stack constatée :
  - Frontend : `/home/fabrice/Projets/NexusForge/frontend` — React 18 + Vite 5 + react-router-dom 6 + Dexie (offline-first), TypeScript. CSS actuel : `/home/fabrice/Projets/NexusForge/frontend/src/styles/global.css` (~1563 lignes, `:root` clair + `body.theme-dark`, 1 breakpoint `820px`/`900px`, layout max `1120px`).
  - Backend : `/home/fabrice/Projets/NexusForge/backend` — Node Express (`src/server.js`), JWT, bcryptjs, nodemailer, otplib.
  - Docs amont : `/home/fabrice/Projets/NexusForge/README.md`, `/home/fabrice/Projets/NexusForge/docs/`.

### 1.1 Constat de départ

Le logiciel amont est **super fonctionnel**, mais ne propose :
- ni **thème** (un seul clair/sombre technique),
- ni **responsivité** complète (pas de stratégie 4 supports),
- ni **plugins** (pas d'extension vers contenus externes).

### 1.2 Objectif général

En plusieurs milestones inscrites au repo (cf. `ROADMAP.md`, `TODO.md`, `CHANGELOG.md`), rendre NexusForge utilisable à table et projetable, thémable SF/Fantasy, et extensible vers le projet local AO-Dev.

Projet local à intégrer (M3) : `/home/fabrice/Projets/AO-Dev` (canon JDR AlphaOmega, cadrage : `/home/fabrice/Projets/AO-Dev/PROJET.md`).

## 2. Milestones

### M1 — CSS efficace multi-supports (branche `decors`)

> Implémenter un CSS efficace permettant une utilisation optimale sur quatre supports : télévision 4K, ordinateur laptop 1080p, tablette et téléphone portable responsive.

Périmètre :
- `M1.1` Audit de `/home/fabrice/Projets/NexusForge/frontend/src/styles/global.css` : inventorier layouts (`.page`, `.top-nav`, `.dashboard-studio`, `.system-builder`, `.chat-widget`, `.studio-*`), breakpoints existants, points de rupture à 4K/1080p/tablette/mobile.
- `M1.2` Fondations : variables CSS (`--space`, `--font-scale`, `--max-width`), `clamp()` / `rem`, grille 12 colonnes existante conservée, container queries si besoin, safe-area mobile.
- `M1.3` Les 4 cibles :
  - TV 4K (2160p, projection / battlemap, lisible à distance, mode `page--wide`, plein écran) ;
  - Laptop 1080p (référence desktop, 3 colonnes studio conservées) ;
  - Tablette portrait/paysage (1-2 colonnes, nav repliable, tactile ≥44px) ;
  - Téléphone (1 colonne, nav bottom ou hamburger, chat/composer empilés, tableaux → scroll horizontal).
- `M1.4` Vues critiques : écran MJ / battlemap / infos joueurs, dashboard custom, system-builder 3 panneaux, chat, fiches perso.
- `M1.5` Tests manuels aux 4 largeurs + `npm run build` frontend vert. Pas de régression fonctionnelle.

Critère de sortie : utilisation optimale constatée sur les 4 supports, sans toucher aux règles métier.

### M2 — Système de thèmes + 2 thèmes d'origine (branche `decors`)

> Implémenter un système de thème avec deux propositions d'origine : un thème "SF" et un thème "Fantasy".

Périmètre :
- `M2.1` Architecture : `data-theme="sf|fantasy"` + variables (`--bg`, `--surface`, `--text`, `--accent`, `--border`, `--font-display`, `--font-body`), respect du `theme-dark` existant (étendre, ne pas casser).
- `M2.2` Thème **SF** : froid, néon/bleu, angles vifs, monospace technique pour chiffres/jets.
- `M2.3` Thème **Fantasy** : parchemin/bois/cuir, serif titrage, filets ornés, badges cire.
- `M2.4` Sélecteur persistant (localStorage + Dexie si profil), préview live, défaut raisonné, accessibilité (contrastes AA).
- `M2.5` Doc d'ajout de thème tiers (variables requises, exemple minimal).

Critère de sortie : switch SF/Fantasy instantané, persistant, sans flash, documenté.

### M3 — Plugins + pont AO-Dev (branche spécifique `AO`)

> Implémenter des plugins permettant d'ajouter le projet local AO-Dev au logiciel. Cette partie nécessitera une branche AO spécifique.

Périmètre :
- `M3.1` Création branche `AO` depuis `decors` (ou `main` selon état) — **ne pas mélanger avec `decors`**.
- `M3.2` Socle plugins frontend (`/home/fabrice/Projets/NexusForge/frontend/src/features/` ou `plugins/`) : manifeste, activation/désactivation, sandbox, points d'injection (fiche perso, dashboard MJ, handouts, jets).
- `M3.3` Plugin `ao-dev` : lecture seule du canon local `/home/fabrice/Projets/AO-Dev` (d100, Jet Infini, gauges Fatigue/Stress/Charge, graphe compétences) sans dupliquer la résolution métier ; moteur AO reste source de vérité côté serveur AO.
- `M3.4` Import/export JSON compatible (systèmes, fiches) entre NexusForge et AO-Dev.
- `M3.5` Sécurité : aucun secret en clair, plugin désactivable, hors-ligne par défaut.

Critère de sortie : AO-Dev consommable comme plugin opt-in sur branche `AO`, doc d'auteur de plugin fournie.

## 3. Cadre imposé par `/home/fabrice/.config/opencode/contexte-ai.md` (application stricte)

### 3.1 Poste et commandes
- Poste admin : **Pandora** (`192.168.0.120/24`), **CachyOS (Arch)**, shell **fish** : pas d'`apt` (utiliser `pacman`/`paru`), pip système bloqué (PEP 668 → venv obligatoire).
- Réseau : `ip route` / `ip neigh show` (pas `route`/`arp`). Commande réseau/longue : en fond avec `timeout` + surveillance, pas de blocage.
- Citer toujours les **chemins absolus** des fichiers modifiés.
- `sudo` : créer un script qui loggue dans un `.log`, l'utilisateur l'exécute, l'IA lit le log. Alternative sans sudo : `ssh <alias>` (cf. `~/.ssh/config`), même en local via IP LAN (pas `localhost`).

### 3.2 Documentation minimale (§6.2 — obligatoire)
- Tenir à jour à chaque commit : `README.md` (état courant), `CHANGELOG.md` (évolutions), `ROADMAP.md` (direction), `TODO.md` (restes). Fichiers créés à la racine : `/home/fabrice/Projets/NexusForge/{README.md,CHANGELOG.md,ROADMAP.md,TODO.md}`.
- §6.1 (`AGENTS.md` depuis `/home/fabrice/Projets/0 - Regles_IA/SOMMAIRE.md`) : **non applicable ici** — dossier non vide (frontend/backend existants). Règles adaptées déjà identifiées si besoin futur : Développement Web, Banque Design Web, Création Graphique, Générateur de Scénarios JDR / Organisation des Scénarios, Workflow Implémentation, Bonnes Pratiques Développement.

### 3.3 Versionnement (§6.3 — obligatoire)
- Fichier `/home/fabrice/Projets/NexusForge/VERSION` contenant uniquement `vM.m.f` (ex. `v0.0.1`, initialisé à `v0.0.1`).
- `M` : jamais automatique, uniquement sur ordre utilisateur. `m` : bump auto à chaque commit si ajout/modif de fonctionnalité significative. `f` : bump auto dans tous les autres cas.

### 3.4 Sécurité (§7 — strict)
1. Jamais de clé privée / mot de passe / token en clair (doc, commit, chat) — référencer par emplacement (`~/.ssh/fabrice_202608`, `~/.config/opencode/secrets.env`).
2. Ne jamais committer : `scan/`, `inventory/`, `rapport_preparation.md`, `archive/`, ni `/home/fabrice/.config/opencode/contexte-ai.md`.
3. `chmod 600` sur contexte/secrets/clés, `chmod 700` sur dossiers les contenant.

### 3.5 Infra de référence (ne pas inventer autre chose)
- LAN unique `192.168.0.0/24`, gw `192.168.0.1`. Dépôt de référence projets perso : `gitea.lamachere.fr`. Ne pas présumer Authelia/OIDC, AD, DMZ `192.168.110.0/24`, VLANs, clusters inventés.

## 4. Suivi repo

- `ROADMAP.md` : direction M1 → M2 → M3.
- `TODO.md` : détail M1.1–M1.5, M2.1–M2.5, M3.1–M3.5.
- `CHANGELOG.md` : entrées par commit (branche `decors` : M1/M2 ; branche `AO` : M3).
- `VERSION` : bump `f` pour doc, `m` pour chaque feature M1/M2/M3 significative.

## 5. Hors périmètre

- Réécriture des règles métier NexusForge, refonte backend auth/sync, multijoueur grande échelle.
- Canon AlphaOmega lui-même (traité dans `/home/fabrice/Projets/AO/` et `/home/fabrice/Projets/AO-Dev/`).
