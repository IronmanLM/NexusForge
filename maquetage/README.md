# Maquetage NexusForge

[![Version](https://img.shields.io/badge/version-v0.3.2-blue)](CHANGELOG.md)
[![Avancement](https://img.shields.io/badge/avancement-maquettes_en_cours-orange)](ROADMAP.md)

Maquettes statiques des pages d’entrée (joueur et utilisatrice, y compris non avertie).
Textes en français provisoires — l’intégration utilisera les clés i18n (`nav.home`, etc.).

## Prévisualisation

Aucun serveur requis : ouvrez `index.html` dans un navigateur et naviguez.
En Docker (depuis `maquetage/`) : `docker compose -f docker-compose.preview.yml up -d`, puis `http://192.168.0.120:8090`.
Les boutons relient les maquettes entre elles :

- **Accueil** → « Connexion », « Rejoindre une partie », « Devenir un conteur » mènent à la page Accès (`html/acces.html`).
- **Accès** → « Se connecter » renvoie vers l’Accueil (`html/accueil.html`, en attendant la maquette « accueil connecté ») ; le logo « NexusForge » en haut à gauche y ramène aussi.
- **Accès** → « Commencer » : déclenchera le futur wizard d’inscription (cf. `TODO.md`).

## Arborescence

```text
maquetage/
├── VERSION          # version courante (vM.m.f)
├── README.md        # ce fichier
├── CHANGELOG.md     # historique des versions
├── ROADMAP.md       # cap et jalons
├── TODO.md          # reste à faire
├── index.html       # hub de prévisualisation statique
├── html/            # pages aux noms fonctionnels (accueil.html, acces.html, …)
├── css/             # commun.css (socle réutilisable) + un fichier par page
├── js/              # carrousel.js, langue.js (sans dépendance, réutilisables)
├── img/             # illustrations et symboles (jamais de base64 dans le HTML)
└── outils/          # convertisseur md-vers-html.py (voir ci-dessous)
```

## Socle réutilisable (préparation de l’intégration)

- `css/commun.css` : variables de thème (`:root`), base, couches du carrousel.
  Les thèmes par MJ / séance surchargeront ces variables sans toucher au HTML (E0 : fond/forme).
- `js/carrousel.js` : carrousel générique piloté par `data-fonds` (images séparées
  par des espaces) et `data-delai` (15000 par défaut), sans répétition, coupé si
  `prefers-reduced-motion`. Même balisage reprisable côté frontend.
- `js/langue.js` : mémorise `<select id="langue">` et applique `window.NF_TEXTES`
  aux `[data-i18n]` ; les dictionnaires restent dans la page (contenu, futurs `messages.ts`).

## Pages de documentation

`README.md`, `CHANGELOG.md`, `ROADMAP.md` et `TODO.md` sont lisibles en HTML
(`html/README.html`, etc., même habillage que le site) depuis le hub.
Elles sont générées, jamais retouchées à la main :

```text
python3 outils/md-vers-html.py
```

## Versionnement (vM.m.f)

- **Major** : uniquement sur décision de l’utilisateur.
- **Minor** : une fonctionnalité ajoutée → minor + 1, fix remis à 0 (ex. `v0.1.3` → `v0.2.0`).
- **Fix** : tout autre commit → fix + 1 (ex. `v0.1.3` → `v0.1.4`).

`VERSION` et `CHANGELOG.md` sont mis à jour à chaque commit.
Les shields du README reflètent la version et l’avancement courants.
Anti-cache : les liens CSS/JS portent `?v=` (issu de `VERSION`, auto pour les docs
générées) — le mettre à jour à chaque version dans `html/*.html` et `index.html`,
puis régénérer les docs avant de commiter.
