# TODO — NexusForge `decors`

## M1 — CSS 4 supports
- [ ] M1.1 Audit `frontend/src/styles/global.css` (layouts, breakpoints 820/900, max 1120px)
- [ ] M1.2 Fondations variables + clamp/rem + tactile 44px + safe-area
- [ ] M1.3 Déclinaisons TV 4K / laptop 1080p / tablette / téléphone
- [ ] M1.4 Vues MJ / battlemap / joueurs + studio + builder + chat + fiches
- [ ] M1.5 Tests 4 largeurs + `npm run build` vert
- [ ] M1.6 Migrer `style=` inline → classes `global.css` (28/38 `.tsx`, voir `docs/css-design-rapport.md` §D1)
- [ ] M1.7 États `:focus-visible` clavier (0 actuellement, §D2)
- [ ] M1.8 `prefers-reduced-motion` + audit contraste par vue (§D3, §D5)
- [ ] M1.9 Échelle `z-index` documentée (remplace 999/1000 magiques, §D4)
- [ ] M1.10 Stratégie `overflow` (table 6 col. + chat à hauteur réservée, §D5)

## M2 — Thèmes SF / Fantasy
- [ ] M2.1 Architecture `data-theme` + variables (étendre `theme-dark` sans casser)
- [ ] M2.2 Thème SF
- [ ] M2.3 Thème Fantasy
- [ ] M2.4 Sélecteur persistant + contraste AA
- [ ] M2.5 Doc ajout thème tiers
- [ ] M2.6 Anti-flash : poser le thème avant paint (voir `docs/css-design-rapport.md` §D6)
- [ ] M2.7 Audit contraste AA automatisé (axe/pa11y ou script, §D7)

## M3 — Plugins AO-Dev (branche `AO`, pas ici)
- [ ] M3.1 Créer branche `AO`
- [ ] M3.2 Socle plugins (manifeste, activation, sandbox, injections)
- [ ] M3.3 Plugin `ao-dev` lecture seule (canon `/home/fabrice/Projets/AO-Dev`)
- [ ] M3.4 Import/export JSON
- [ ] M3.5 Sécurité (opt-in, hors-ligne, aucun secret en clair)
