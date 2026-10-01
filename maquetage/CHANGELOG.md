# CHANGELOG — Maquetage NexusForge

## v0.7.2 — 2026-10-01

- 2FAS en français + extension navigateur, AliasVault + extension ; « Me rappeler plus tard » décochée par défaut et masque le code TOTP.

## v0.7.1 — 2026-10-01

- Vérification : pictos TOTP déplacés à gauche (vraies icônes en `img/`, plateformes, liste non exhaustive).

## v0.7.0 — 2026-10-01

- Vérification : pictos des 4 applis TOTP, liens vers les sites officiels (nouvel onglet).

## v0.6.2 — 2026-10-01

- `hidden` blindé dans le socle (un `display` auteur ne peut plus réafficher un bloc masqué) ; rappel d’âge en tête des Accords.

## v0.6.1 — 2026-10-01

- Pseudo d’exemple neutralisé (plus de clin d’œil nominatif).

## v0.6.0 — 2026-10-01

- Inscription : explications contextuelles à gauche (une par étape), 4 applis TOTP proposées, âge détecté affiché.

## v0.5.0 — 2026-10-01

- Mentions provisoires (`mentions-legales/`, converties en HTML) : CGU, confidentialité, charte du conteur.
- Accords en modale : lecture + validation explicite obligatoires avant cochage ; courriel parental distinct contrôlé.

## v0.4.0 — 2026-10-01

- Wizard d’inscription (`html/inscription.html`, `js/wizard.js`, `css/inscription.css`) : 6 étapes, voies cumulables, cas mineur, TOTP conteur, validation admin, première connexion.

## v0.3.3 — 2026-10-01

- Bandeau de gauche : voile renforcé (0.85), logo à peine visible.

## v0.3.2 — 2026-10-01

- Page Accès : voile sombre retiré des décors de droite, réservé au bandeau de gauche.

## v0.3.1 — 2026-10-01

- Page Accès : hauteurs minimales portées par les sections elles-mêmes (navigateurs
  sans `dvh` ou grille capricieuse, page tassée et bande vide en bas).
- Anti-cache : `?v=` sur les liens CSS/JS (auto depuis `VERSION` pour les docs générées).

## v0.3.0 — 2026-10-01

- Socle réutilisable : `css/commun.css` (variables, base, carrousel) partagé par les pages, `js/carrousel.js` et `js/langue.js` externes (zéro JS embarqué).
- Titres fonctionnels (« NexusForge — Accueil / Accès », sans mention maquette).

## v0.2.0 — 2026-10-01

- Pages aux noms fonctionnels (`accueil.html`, `acces.html`) : navigation interne complète (logo « NexusForge » et « Accueil » ramènent à l’accueil).
- Documentation lisible en HTML : convertisseur `outils/md-vers-html.py`, même habillage que le site, lié depuis le hub.

## v0.1.2 — 2026-10-01

- Page Accès : repli `100vh` avant `100dvh` (navigateurs sans `dvh`, corps tassé et bande vide en bas) et fond sombre sur `html`.

## v0.1.1 — 2026-10-01

- Serveur de prévisualisation Docker : `docker-compose.preview.yml` (nginx, port 8090).

## v0.1.0 — 2026-10-01

- Structure initiale : `html/`, `css/`, `img/`, hub `index.html`, images en fichiers (zéro base64).
- Page Accueil v11 : carrousel de 5 fonds sans répétition avec fondu toutes les 15 s, liens internes vers la page Accès.
- Page Accès v10 : moitié NexusForge assombrie, moitié login sur 6 décors, blocs translucides, boutons opaques, « Se connecter » vers l’Accueil en attendant la page « accueil connecté ».
- Pilotage : `VERSION`, `README.md` (shields version et avancement), `ROADMAP.md`, `TODO.md`.
