# Rapport CSS + Design — NexusForge `decors`

Audit du 2026-09-22. Périmètre : `frontend/src/styles/global.css` (~1095 lignes),
38 composants `.tsx`, vues MJ / joueurs / studio / builder / chat / fiches.
Référence vues : `docs/ui/`. Objectifs M1/M2 de `TODO.md`.

## 1. Architecture actuelle

- Un seul fichier de styles : `global.css` (1563 lignes, ~27 Ko). Zéro CSS module / styled-component.
- `:root` statique (2 transitions), **0 variable** (`var(--…)` : 0 occurrence).
- Thème sombre = **59 overrides `.theme-dark …`** en dur, aucun `data-theme`.
- Responsive = **2 media queries** (`820px`, `900px`), **0 `clamp()`**.
- **28/38 fichiers `.tsx` contiennent des `style=` inline** (à confirmer en M1.6) (couleurs, bordures,
  espacements dupliqués de `global.css`).
- `z-index` : 2 valeurs (20, 2000). `overflow` : 4 occurrences (auto, hidden) sans stratégie documentée. Mesuré en M1.1.

## 2. Constats par axe

### 2.1 Fondations (→ M1.2)
- Pas de design tokens : couleurs/espacements/rayons codés en dur des deux côtés
  (`global.css` + inline). Chaque ajustement = N endroits.
- Typographie : pas d'échelle fluide (`clamp()` absent), tailles figées par breakpoint.
- Tactile 44px et `safe-area` : absents (M1.2 les prévoit, rien n'existe).

### 2.2 Responsive 4 supports (→ M1.1, M1.3, M1.5)
- 2 breakpoints seulement ; TV 4K et tablette non couverts.
- `max-width: 1120px` + table à 6 colonnes sans scroll horizontal → débordement
  probable sur téléphone (à valider en M1.5).
- Chat : scroll interne sans hauteur réservée → risque de collapse (M1.4).

### 2.3 Vues (→ M1.4)
- **Battlemap : 0 référence dans `frontend/src`** — vue à créer, pas à adapter.
- MJ / joueurs / studio / builder / chat / fiches : stylées via `global.css` +
  inline, spécificité `0-1-0` globalement, pas de scoping par vue.
- Specs existantes dans `docs/ui/` (characters, dashboard, studio-builder…) :
  les déclinaisons 4 supports n'y sont pas décrites.

### 2.4 Thèmes (→ M2.1–M2.5)
- `.theme-dark` (classe) vs `data-theme` (attribut, prévu M2.1) : migration =
  réécrire les 59 overrides en variables.
- Pas de sélecteur persistant, pas de doc tiers (M2.4/M2.5 à faire).
- **Nouveau** : aucun anti-flash au chargement (classe thème posée après paint
  = flash clair/sombre). Prévoir la pose du thème avant paint.
- **Nouveau** : contraste AA vérifié à la main uniquement ; automatiser
  (axe/pa11y ou script) pour verrouiller M2.4.

### 2.5 Accessibilité (transverse, à ajouter à M1)
- **0 style `:focus-visible`** dans `global.css` — navigation clavier invisible.
- **0 `prefers-reduced-motion`** — transitions/animations non désactivables.
- Contraste : à mesurer par vue pendant M1.5 (outillage commun avec M2.4).

## 3. Dette priorisée

| # | Chantier | Impact | Cible |
|---|----------|--------|-------|
| D1 | Migrer inline → classes (28 fichiers) | M1.4/M2.1 débloqués | M1 |
| D2 | `:focus-visible` global | A11y clavier | M1 |
| D3 | `prefers-reduced-motion` | A11y | M1 |
| D4 | Échelle `z-index` documentée | Modals/tooltips fiables | M1 |
| D5 | Stratégie `overflow` (table, chat) | Pas de casse mobile | M1 |
| D6 | Anti-flash thème avant paint | Fini perçu M2 | M2 |
| D7 | Audit contraste automatisé | Verrou M2.4 | M2 |

## 4. Propositions intégrées

- `TODO.md` : M1.6 (D1), M1.7 (D2), M1.8 (D3), M1.9 (D4), M1.10 (D5),
  M2.6 (D6), M2.7 (D7).
- `ROADMAP.md` : M1 += accessibilité clavier/motion ; M2 += anti-flash +
  contraste automatisé.
- Prochaine étape : M1.1 en s'appuyant sur §2.1–2.3 ci-dessus comme checklist.
