# CHANGELOG — Maquetage NexusForge

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
