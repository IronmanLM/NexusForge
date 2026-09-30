# Contre-proposition NexusForge

**Sujet**: tests API et documentation OpenAPI/Swagger  
**Date**: 27 avril 2026  
**Statut**: document de travail pour validation

## Objectif

Ce document reformule la proposition initiale pour l'adapter a l'etat reel de NexusForge, a ses priorites securite actuelles, et a son mode d'exploitation.

L'idee n'est pas de rejeter la proposition initiale, mais de la recentrer sur :
- les vrais endpoints et payloads actuels,
- les urgences securite deja traitees ou en cours,
- une documentation API maintenable,
- une exposition Swagger qui ne cree pas un nouveau risque en production.

## Position de principe

La proposition initiale va dans la bonne direction sur le fond, mais elle est trop generique pour etre appliquee telle quelle.

Les points que nous retenons :
- formaliser une documentation API,
- structurer une campagne de tests API,
- automatiser progressivement ces tests,
- verifier en continu les garde-fous securite.

Les points que nous ne retenons pas tels quels :
- injection immediate de Swagger directement dans `backend/src/server.js`,
- exposition publique automatique de `/api-docs` en production,
- exemples d'API non alignes avec les reponses reelles de NexusForge,
- recommandations qui dupliquent des mesures deja implementees sans partir de l'existant.

## Constats sur l'etat actuel de NexusForge

### API reelle

L'API cible de production est :
- `https://api.nexusforge.en-ligne.fr`

Le frontend principal est :
- `https://nexusforge.en-ligne.fr`

La proposition initiale melangeait parfois les deux.

### Authentification reelle

Le login NexusForge renvoie actuellement :
- `token`
- `refreshToken`
- `user`

Ce n'est donc pas strictement :
- `accessToken`
- `refreshToken`

Le document de base doit etre corrige sur ce point pour rester fidele a l'implementation.

### Durcissements deja en place

Les points suivants sont deja traites ou fortement avances :
- secrets de production refuses si absents ou faibles,
- `CORS_ORIGIN='*'` refuse en production,
- rate limiting sur `register`, `login`, `refresh`, `forgot-password`, `resend-verification`,
- validation backend renforcee sur les flux d'authentification,
- rotation stricte des refresh tokens avec revocation sur reutilisation suspecte.

La suite doit donc partir de cette base, pas d'un etat "vierge".

## Contre-proposition globale

Nous proposons de separer le chantier en trois blocs.

### Bloc 1 - Tests API de securite et de non-regression

Objectif :
- verifier regulierement que les protections actuelles restent effectives.

Priorite :
- immediate

Livrables proposes :
- une suite de tests API executable localement,
- une version scriptable en CI plus tard,
- une checklist manuelle de verification production.

### Bloc 2 - Specification OpenAPI versionnee

Objectif :
- decrire l'API reelle dans un fichier versionne et lisible.

Priorite :
- haute, mais apres le premier socle de tests

Livrables proposes :
- un fichier `openapi.yaml` versionne,
- une couverture initiale des endpoints critiques auth et session,
- extension progressive aux autres domaines.

### Bloc 3 - UI Swagger / Redoc

Objectif :
- fournir une interface de consultation pour les developpeurs.

Priorite :
- secondaire

Position :
- pas d'exposition publique par defaut en production,
- activation locale ou reservee admin/maintenance seulement.

## Pourquoi ne pas brancher Swagger tout de suite dans `server.js`

Il y a plusieurs raisons concretes.

### 1. Le backend principal est deja trop central

`backend/src/server.js` est deja tres gros et concentre trop de responsabilites.

Ajouter directement :
- les imports Swagger,
- la configuration OpenAPI,
- les annotations JSDoc inline,
- et l'exposition `/api-docs`

augmenterait encore le couplage.

### 2. Les annotations JSDoc dans `server.js` vieillissent mal

Sur une API qui bouge encore, les annotations inline ont tendance a se desynchroniser rapidement du comportement reel.

Pour NexusForge, il est preferable d'avoir :
- une spec OpenAPI dediee,
- relue comme un artefact a part entiere,
- versionnee independamment des handlers.

### 3. Exposer `/api-docs` en prod est un choix de securite

Une documentation live publiquement accessible :
- facilite l'exploration de l'API,
- augmente la surface de decouverte,
- et impose un niveau de rigueur documentaire tres eleve avant publication.

Pour l'instant, il est plus sain de viser :
- une doc versionnee dans le depot,
- une UI locale,
- ou une UI protegee.

## Proposition cible pour la documentation API

### Format retenu

Nous proposons :
- `OpenAPI 3.1`
- dans un fichier dedie, par exemple `docs/api/openapi.yaml`

### Methode de maintenance

La spec doit etre :
- ecrite a partir de l'API reelle,
- revue en meme temps que les changements backend,
- utilisee comme source de verite pour la documentation.

### Premiere couverture recommandee

Commencer par les endpoints critiques :
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/resend-verification`

Puis etendre ensuite vers :
- sessions,
- resources,
- screen templates,
- messages,
- administration.

## Proposition cible pour les tests API

### Niveau 1 - Tests manuels cibles

Objectif :
- valider rapidement les points sensibles en production ou preprod.

Campagne minimale recommandee :

#### Auth
- login avec credentials invalides
- login avec compte verrouille
- login avec compte non verifie
- login avec compte desactive
- login 2FA si active
- refresh valide
- refresh reconsomme
- logout puis refresh invalide

#### Rate limiting
- saturation `login`
- saturation `register`
- saturation `forgot-password`
- saturation `resend-verification`
- saturation `refresh`

#### CORS
- origine frontend autorisee
- origine non autorisee refusee

#### Validation
- email invalide
- mot de passe trop faible
- champs texte avec caracteres interdits
- payloads incomplets

### Niveau 2 - Scripts automatises

Objectif :
- rendre les controles repetables.

Outils possibles :
- `curl` + scripts shell pour premier niveau,
- ou collection Postman/Newman,
- ou suite Node dediee.

Recommendation pour NexusForge :
- commencer simple avec scripts shell/Node versionnes,
- ne pas introduire Postman comme dependance centrale du projet si ce n'est pas necessaire.

### Niveau 3 - Integration CI

Objectif :
- verifier automatiquement que les regressions sur auth/API critiques sont detectees.

Ce bloc vient apres :
- la stabilisation du socle de tests,
- et une meilleure separation du backend.

## Tests proposes, corriges pour NexusForge

### 1. Login invalide

```bash
curl -X POST https://api.nexusforge.en-ligne.fr/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid@example.com","password":"wrong"}'
```

Attendu :
- `401`
- code applicatif coherent
- message generique type `Invalid credentials`

### 2. Rate limiting login

```bash
for i in {1..12}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://api.nexusforge.en-ligne.fr/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
```

Attendu :
- bascule en `429` apres le seuil configure

### 3. CORS non autorise

```bash
curl -I \
  -H "Origin: https://evil.example" \
  https://api.nexusforge.en-ligne.fr/api/auth/me
```

Attendu :
- pas de `Access-Control-Allow-Origin` permissif pour cette origine

### 4. Refresh invalide

```bash
curl -X POST https://api.nexusforge.en-ligne.fr/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"invalid-token"}'
```

Attendu :
- `401`
- pas de detail sensible

### 5. Validation register

```bash
curl -X POST https://api.nexusforge.en-ligne.fr/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"<script>alert(1)</script>","lastName":"test","nickname":"test","email":"bad-email","password":"123"}'
```

Attendu :
- `400`
- message de validation
- aucune stack trace

## Recommandations specifiques a retenir

### A retenir tout de suite
- formaliser une campagne de tests API ciblee sur auth et securite,
- produire une spec OpenAPI dediee, versionnee,
- garder Swagger UI hors exposition publique par defaut,
- faire coller tous les exemples a l'API reelle.

### A repousser
- annotations JSDoc massives inline dans `server.js`,
- publication publique immediate de `/api-docs`,
- couverture exhaustive de toute l'API avant d'avoir valide les endpoints critiques.

### A corriger dans la proposition initiale
- utiliser `api.nexusforge.en-ligne.fr` pour l'API,
- documenter `token` et non `accessToken` pour l'etat actuel,
- partir de la configuration de securite deja implemente,
- distinguer clairement tests manuels, scripts automatises et doc OpenAPI.

## Plan de mise en oeuvre propose

### Etape 1
- valider cette contre-proposition
- figer la liste des endpoints prioritaires

### Etape 2
- creer une premiere spec `openapi.yaml` limitee a l'auth

### Etape 3
- creer une premiere campagne de tests API versionnee pour l'auth

### Etape 4
- ajouter une UI de consultation locale ou protegee si besoin

### Etape 5
- etendre progressivement aux autres domaines API

## Decision proposee

Nous proposons de valider la ligne suivante :

- **oui** a une documentation API et a des tests API,
- **oui** a OpenAPI comme spec versionnee,
- **non** a une exposition Swagger publique immediate,
- **non** a une integration brute et massive directement dans `backend/src/server.js`,
- **oui** a une implementation progressive, d'abord sur l'auth.

## Questions a arbitrer ensemble

- veut-on une UI Swagger en local seulement, ou aussi en prod mais protegee ?
- prefere-t-on des scripts shell/Node ou une collection Postman pour les premiers tests ?
- quel perimetre exact veut-on dans la V1 de la spec : auth seule, ou auth + session ?
- veut-on une verification manuelle de securite a chaque deploiement backend sensible ?

