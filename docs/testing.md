# Stratégie de tests

Cette page décrit les garde-fous automatisés de Nexus Forge. L'objectif est d'empêcher la CI de réussir lorsqu'aucun test métier n'est réellement exécuté.

## Commandes locales

Frontend :

```bash
cd frontend
npm ci
npm test
npm run typecheck
npm run build
```

Backend :

```bash
cd backend
npm ci
node --check src/server.js
npm test
```

Les commandes `npm test` exécutent d'abord un garde structurel, puis le moteur de tests. Le garde échoue si le nombre minimal de fichiers disparaît ou si une suite critique attendue est supprimée.

## Couverture minimale actuelle

### Frontend — Vitest

- `authService.test.ts` : authentification réussie, défi 2FA et nettoyage local au logout même en cas d'erreur réseau.
- `syncService.test.ts` : résultats acceptés/conflits/rejets, erreurs transport, backoff par action et mode hors ligne.
- `adaptivePolling.test.ts` : cadence normale, backoff global, pause et reprise.

Le garde `frontend/scripts/assert-test-suite.mjs` exige au moins trois fichiers et impose la présence des suites auth et synchronisation.

### Backend — `node:test`

- `auth-routes.test.mjs` : login valide/invalide, rotation et détection de réutilisation du refresh token, validation d'inscription.
- `input-validation.test.mjs` : schémas des parties et systèmes.
- `persistence-git-safety.test.mjs` : exclusion Git des bases locales.

Le garde `backend/scripts/assert-test-suite.mjs` exige au moins trois fichiers et impose la présence des suites auth et validation.

Les tests de routes démarrent un vrai serveur sur un port éphémère avec un dossier de données temporaire. Ils ne lisent ni ne modifient les données locales, de préproduction ou de production.

## CI GitHub

Le workflow `.github/workflows/frontend-ci.yml` possède deux jobs bloquants :

- frontend : installation, typecheck, build et tests ;
- backend : installation, syntaxe, tests et smoke test HTTP.

Aucun job n'utilise `continue-on-error`. Une suite absente, un test rouge, un build invalide ou un healthcheck en échec rend la CI rouge.

## Ajouter un test

1. Placer un test frontend dans `frontend/src/**/*.test.ts(x)` ou un test backend dans `backend/test/*.test.mjs`.
2. Isoler les données et les ports ; ne jamais utiliser un environnement O2switch dans les tests automatisés.
3. Pour une correction comportementale, commencer par un test qui reproduit l'échec, vérifier qu'il est rouge, puis appliquer le correctif minimal.
4. Lancer les commandes complètes des deux composants avant le commit.
5. Mettre à jour cette page si une nouvelle suite devient un garde obligatoire.
