# ROADMAP — NexusForge `decors` → `AO`

- **M1 — CSS 4 supports** (branche `decors`) : TV 4K / laptop 1080p / tablette / téléphone. Fondations variables + `clamp()`, vues MJ/battlemap/joueurs, build vert. Inclut : migration inline → classes, `:focus-visible`, `prefers-reduced-motion`, échelle `z-index`, stratégie `overflow`. Détail : `docs/css-design-rapport.md`.
- **M2 — Thèmes SF + Fantasy** (branche `decors`) : système `data-theme` à variables, sélecteur persistant, doc d'ajout de thème. Inclut : anti-flash avant paint, contraste AA automatisé.
- **M3 — Plugins + pont AO-Dev** (branche spécifique `AO`) : socle plugins, plugin `ao-dev` lecture seule depuis `/home/fabrice/Projets/AO-Dev`, import/export JSON, opt-in désactivable.

Ordre : M1 → M2 → M3. M3 isolée sur branche `AO`, ne pas mélanger avec `decors`.
