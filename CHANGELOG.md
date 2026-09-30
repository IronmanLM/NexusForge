# CHANGELOG — NexusForge `decors`

## [Unreleased] — branche `decors`
- i18n : clés `nav.home` (« Accueil » en FR), `nav.resources`, `nav.screens`, `nav.tools` ajoutées en FR/EN/DE/ES — la navigation affichait les clés brutes ; accents FR redressés (`Atelier Système`, `Thème`). Audit : 91 clés `t()` utilisées, toutes définies.
- Favicon : jeu généré depuis le logo carré (crop resserré sur le vortex de gauche, halo bleu lisible en petit) — `favicon.ico` (16/32/48), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` — câblé dans `index.html` + manifeste, suppression du bricolage `favicon.svg`.
- E0/M1.4a : écran `/sessions` réordonné zones joueur (liste « Mes parties » d’abord, création MJ ensuite, états traduits, options « Mode silence » traduites, aucun identifiant technique côté joueur) ; nouvelles clés i18n FR/EN/DE/ES (`parties.mine`, `parties.settings`, `parties.state.*`). Build frontend vert.
- Ajout `PROJET.md` : cadrage decors (M1 CSS 4 supports, M2 thèmes SF/Fantasy, M3 plugins AO-Dev sur branche `AO`), application stricte de `/home/fabrice/.config/opencode/contexte-ai.md` (§6.2/§6.3, §7).
- Ajout `ROADMAP.md`, `TODO.md`, `VERSION` (conformité §6.2/§6.3).
