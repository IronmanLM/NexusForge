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

## 6. Plan système de thèmes — audit au 2026-09-22 + implémentation M2

### 6.1 Audit actuel (branche `decors`, vérifié par lecture)

- Fichier unique : `/home/fabrice/Projets/NexusForge/frontend/src/styles/global.css` (1563 lignes). Import seul dans `/home/fabrice/Projets/NexusForge/frontend/src/main.tsx:4`. Aucun `*.module.css`, SCSS, Tailwind, styled-components.
- `:root` (`global.css:1-5`) : 0 variable `--*`, 0 `var()`. Light = valeurs en dur non scopées.
- `body.theme-dark` : 59 sélecteurs (`global.css:206-318`, `987-990`, `1399-1514`). `body.theme-light` : 0 règle (togglé mais jamais défini). `data-theme` : 0 occurrence.
- Mécanisme seul : `/home/fabrice/Projets/NexusForge/frontend/src/components/Layout.tsx:8,18-21,55-59` — `useState<'light'|'dark'>`, défaut `dark`, `localStorage nexusforge.theme`, `document.body.classList.toggle`. Pas de `ThemeContext`, pas de `document.documentElement`, pas de `prefers-color-scheme`.
- Sélecteur UI minimal : `/home/fabrice/Projets/NexusForge/frontend/src/components/Layout.tsx:115-121` (select Dark/Light dans `.top-nav__right`). Label i18n dans `/home/fabrice/Projets/NexusForge/frontend/src/i18n/messages.ts:22,46,70,94`.
- ~255 couleurs en dur dans `global.css` (~70 valeurs : `#d0d5dd:36`, `#155eef:15`, `#0f172a:16`, familles layout/logic/action/rpg, chat/whisper) + ~64 hex en dur dans 28 fichiers `.tsx` via 296 `style={{` (erreurs `#b42318:28`, succès `#067647/#027a48`, `#f79009/#fffaeb`, modale hard-dark `/home/fabrice/Projets/NexusForge/frontend/src/features/systems/pages/SystemStudioPage.tsx:2687,2921,2937-2938`).
- Dexie : `/home/fabrice/Projets/NexusForge/frontend/src/data/db.ts`, `/home/fabrice/Projets/NexusForge/frontend/src/types/dashboard.ts` — aucun champ `theme/decor`, table `dashboardProfiles` sans décor.
- Breakpoints : 2 seulement (`global.css:320` à 820px, `global.css:1516-1563` à 900px).
- Conséquence : impossible aujourd'hui de changer complètement le visuel sans réécrire les 1563 lignes + les inlines. Tout 3e thème impose tokenisation préalable.

### 6.2 Principes cibles

1. **Tokens d'abord** : 100% du visuel via `var(--*)`. Aucun hex/rgba/font/radius/shadow en dur dans CSS ou TSX après migration.
2. **Décor = thème complet** : `data-theme="sf|fantasy"` sur `<html>` + `data-mode="light|dark"` orthogonal. Chaque thème redéfinit fond, surface, texte, accent, bordure, fonts, radius, ombres, textures/assets. Pas un simple recolor.
3. **Ne pas casser** : `body.theme-dark/light` gardé en legacy/shim vers `data-mode` pendant migration, puis supprimé. Défaut actuel `dark` conservé jusqu'au sélecteur final.
4. **Persistant, instantané, sans flash** : script inline dans `index.html` lisant `localStorage nexusforge.theme` avant paint + `ThemeContext`.
5. **Thème tiers ajoutable en 1 fichier** : contrat documenté, exemple minimal.

### 6.3 Arborescence cible (à créer)

- `/home/fabrice/Projets/NexusForge/frontend/src/styles/tokens.css` — base + `:root[data-mode]` (couleurs sémantiques, espacements, fonts système).
- `/home/fabrice/Projets/NexusForge/frontend/src/styles/base.css` — reset, `body`, `.page`, `.top-nav`, `.card`, `.button`, `.form` réécrits en `var()`.
- `/home/fabrice/Projets/NexusForge/frontend/src/styles/themes/theme-sf.css` — `:root[data-theme="sf"]` + variantes `[data-mode]`.
- `/home/fabrice/Projets/NexusForge/frontend/src/styles/themes/theme-fantasy.css` — `:root[data-theme="fantasy"]` + variantes.
- `/home/fabrice/Projets/NexusForge/frontend/src/styles/themes/_contract.css` (ou doc) — liste des variables requises.
- `/home/fabrice/Projets/NexusForge/frontend/src/theme/ThemeContext.tsx` — provider + `useTheme()`, types `ThemeName='sf'|'fantasy'`, `Mode='light'|'dark'`.
- `/home/fabrice/Projets/NexusForge/frontend/src/theme/ThemeSelector.tsx` — sélecteur avec preview live.
- `/home/fabrice/Projets/NexusForge/frontend/src/assets/themes/` — fonts, textures, fonds SF/Fantasy (actuellement seul `logo.svg` existe).
- `global.css` : gelé puis découpé et supprimé par morceaux au fil des T.

### 6.4 Contrat de variables (minimum exigible par thème)

```
--bg, --bg-elevated, --surface, --surface-2
--text, --text-muted, --text-inverse
--accent, --accent-hover, --accent-contrast
--border, --border-strong
--success, --warning, --danger, --info (+ fonds muted associés)
--font-display, --font-body, --font-mono
--radius-sm/md/lg, --shadow-sm/md/lg
--max-width, --space-*, --font-scale
--theme-texture (url optionnelle), --theme-ornament (bordure/filet)
```

Règle : tout nouveau CSS ou `style={{}}` doit consommer ces tokens. Interdit : hex/rgba/font-family en dur.

### 6.5 Runtime

- `ThemeContext` : état `{ theme, mode, setTheme, setMode }`, applique `document.documentElement.dataset.theme/mode`, écrit `localStorage` (`nexusforge.theme`, `nexusforge.mode`), migre l'ancienne clé unique.
- `main.tsx` : envelopper `App` dans `ThemeProvider`. `Layout.tsx` : remplacer `useState<'light'|'dark'>` + `body.classList` par `useTheme()` ; remplacer le select par `ThemeSelector`.
- `index.html` : script pre-paint anti-flash (lecture localStorage → `data-theme/data-mode`).
- Persistance profil (option M2.4) : champ `theme` sur `dashboardProfiles` (migration Dexie v7) ou clé `nexusforge.decor:${userId}` si pas de migration ; défaut raisonné `sf/dark` (table, projection).
- Accessibilité : contrastes AA vérifiés par thème×mode, focus visibles, `prefers-reduced-motion` respecté.

### 6.6 Étapes d'implémentation (ordre impératif)

- `T1` Socle : créer `tokens.css` + `ThemeContext.tsx` + script anti-flash `index.html` + câblage `main.tsx`/`Layout.tsx`. Mapper les 70 valeurs actuelles vers tokens (script d'extraction `rg '#[0-9a-fA-F]{3,6}'`). `body.theme-dark` conservé en shim. Test : switch light/dark identique au visuel actuel, sans flash.
- `T2` Migration `base.css` : réécrire top-nav/card/form/button/page/dashboard/chat/character/system-builder/studio en `var()`, section par section (ordre : page/top-nav → card/form/button → dashboard → chat → character → system-builder → studio). Supprimer les blocs `body.theme-dark` migrés au fur et à mesure. Critère : `rg '#[0-9a-f]{3,6}' global.css+base.css → 0` hors thèmes.
- `T3` Chasse aux inlines : remplacer les 296 `style={{` avec hex dans les 28 TSX (priorité : `#b42318` erreurs, `#067647` succès, `#f79009` whisper, modale `SystemStudioPage.tsx:2687,2937`) par classes ou `var()`. Règle eslint/stylelint `color-no-hex` à ajouter.
- `T4` Thème SF (`theme-sf.css`) : froid, néon/bleu, angles vifs (`--radius-sm:2px`), mono technique pour chiffres/jets, glow discret, texture grille optionnelle. Décliner light+dark.
- `T5` Thème Fantasy (`theme-fantasy.css`) : parchemin/bois/cuir, serif titrage, filets ornés, badges cire, radius généreux, texture papier. Décliner light+dark.
- `T6` Sélecteur : `ThemeSelector.tsx` persistant (localStorage + Dexie), preview live (hover sans appliquer ? ou applique + rollback), utilisé dans `Layout.tsx`. Supprimer l'ancien select.
- `T7` Doc + garde-fous : `docs/THEMES.md` (contrat, exemple minimal 20 lignes, ajout font/asset), stylelint `custom-property-pattern`, test build `npm run build` vert, revue contrastes AA, captures SF/Fantasy × light/dark.

### 6.7 Spéc SF vs Fantasy (pour ne pas finir en simple recolor)

- SF : `--font-display: 'Orbitron',...`, `--font-mono: 'JetBrains Mono',...`, accents cyan `#22d3ee` / bleu `#3b82f6`, surfaces `#0b1220/#0f172a`, bordures fines lumineuses, uppercase + letter-spacing sur labels, coins carrés, ombres néon faibles.
- Fantasy : `--font-display: 'Cinzel',serif`, `--font-body: 'Spectral',serif`, accents or `#b45309/#d4af37`, fonds parchemin `#faf3e3/#f5e6c8`, surfaces bois `#3f2d20`, filets double-bordure, badges cire `--danger:#9a3412` en sceau, ombres chaudes profondes.

### 6.8 Critères de sortie M2

- `data-theme="sf|fantasy"` × `data-mode` switch instantané, persistant, sans flash, sur les 4 supports M1.
- 0 hex en dur hors `themes/*.css`. `npm run build` vert. Pas de régression fonctionnelle.
- `docs/THEMES.md` permet à un tiers d'ajouter un thème en 1 fichier.
