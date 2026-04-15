# Runbook restauration - cache ressources et derives image

Date de reference : 2026-04-15

## Objet

Ce document sert de fiche de restauration rapide pour la mise en production du pipeline de cache/prechargement des ressources et de generation de derives image.

Il peut etre redonne tel quel a Codex pour demander un rollback ou une restauration guidee.

## Changement concerne

Cette passe ajoute :

- un cache frontend partage pour les ressources protegees ;
- le prechargement des ressources de session au chargement du runtime ;
- la generation cote backend de `preview.webp` et `thumbnail.webp` pour les images ;
- un backfill automatique des anciennes images au redemarrage backend ;
- des en-tetes de cache prives longue duree sur les ressources servies.

## Production actuelle

### Frontend

- serveur web : `~/nexusforge.en-ligne.fr`
- CSS actif : `assets/index-DJsqnQUF.css`
- JS actif : `assets/index-B3mujnAw.js`
- horodatage de publication : `2026-04-15 16:58:38`

### Frontend precedent connu

- CSS precedent : `assets/index-DJsqnQUF.css`
- JS precedent : `assets/index-B7eo2NCF.js`
- horodatage precedent : `2026-04-15 16:47:37`

### Backend

- serveur API : `~/api.nexusforge.en-ligne.fr/backend`
- fichier de demarrage Passenger : `src/server.js`
- restart Passenger : `~/api.nexusforge.en-ligne.fr/tmp/restart.txt`
- process backend redemarre avec succes le `2026-04-15 17:00:40`

### Backup etat backend avant deploiement

- dossier backup : `~/nexusforge-prod-backups/backend-data`
- backup cree avant deploiement : `state-20260415-165853.json`

## Symptomes typiques justifiant une restauration

- ouverture d overlay ou de document plus lente qu avant pour tous les joueurs ;
- erreurs backend liees a `sharp` ou au chargement de ressources ;
- miniatures ou apercus image qui ne s affichent plus ;
- plantage du backend juste apres redemarrage Passenger.

## Strategie de restauration

Il y a 3 niveaux possibles.

### Niveau 1 - restart simple

A utiliser si le code semble bon mais que Passenger ou le cache serveur a un comportement incoherent.

Commandes :

```bash
ssh nexusforge-prod
touch ~/api.nexusforge.en-ligne.fr/tmp/restart.txt
```

Verification :

```bash
curl -fsS https://api.nexusforge.en-ligne.fr/health
```

### Niveau 2 - rollback applicatif sans toucher aux donnees

A utiliser si la regression vient du code de cache/derives, mais que l etat `state.json` ne doit pas etre restaure.

Actions attendues :

1. remettre le depot local sur le commit precedent au changement ;
2. rebuild frontend ;
3. rededeployer `frontend/dist` ;
4. resynchroniser `backend/` vers `~/api.nexusforge.en-ligne.fr/backend/` sans ecraser `data/` ni `.env` ;
5. verifier les dependances backend ;
6. toucher `~/api.nexusforge.en-ligne.fr/tmp/restart.txt` ;
7. verifier `GET /health`.

Exemple de synchro backend :

```bash
rsync -az --delete \
  --exclude 'data' \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude 'node_modules_local_backup_*' \
  backend/ nexusforge-prod:~/api.nexusforge.en-ligne.fr/backend/
```

Exemple de synchro frontend :

```bash
rsync -az --delete --exclude '.htaccess' \
  frontend/dist/ nexusforge-prod:~/nexusforge.en-ligne.fr/
```

Installation deps backend si necessaire :

```bash
ssh nexusforge-prod '~/nodevenv/api.nexusforge.en-ligne.fr/backend/20/bin/npm --prefix ~/api.nexusforge.en-ligne.fr/backend install --omit=dev'
```

### Niveau 3 - restauration etat backend

A utiliser seulement si `state.json` a ete altere d une maniere problematique pendant la passe.

Actions attendues :

1. sauvegarder le `state.json` courant ;
2. recopier le backup `state-20260415-165853.json` vers `~/api.nexusforge.en-ligne.fr/backend/data/state.json` ;
3. toucher `~/api.nexusforge.en-ligne.fr/tmp/restart.txt` ;
4. verifier `GET /health`.

Exemple :

```bash
ssh nexusforge-prod '
cp ~/api.nexusforge.en-ligne.fr/backend/data/state.json ~/api.nexusforge.en-ligne.fr/backend/data/state.before-restore.json &&
cp ~/nexusforge-prod-backups/backend-data/state-20260415-165853.json ~/api.nexusforge.en-ligne.fr/backend/data/state.json &&
touch ~/api.nexusforge.en-ligne.fr/tmp/restart.txt
'
```

## Verification apres restauration

Verifier au minimum :

- `https://api.nexusforge.en-ligne.fr/health`
- ouverture d une partie joueur ;
- ouverture d un overlay image ;
- affichage du widget `documents` ;
- absence d erreur 500 sur une ressource image protegee.

## Prompt pret a reutiliser

Tu peux me redonner exactement ceci :

```md
Restaure la prod Nexus Forge sur la passe precedant le pipeline cache ressources du 15 avril 2026.

Contexte :
- utilise le runbook `docs/runbook-restauration-cache-ressources-2026-04-15.md`
- ne touche pas a `.env`
- preserve `backend/data`
- si possible fais d abord un rollback applicatif sans restauration de `state.json`
- si le backend reste instable, restaure aussi le backup `state-20260415-165853.json`
- verifie ensuite `https://api.nexusforge.en-ligne.fr/health`
```

## Notes

- La presence de fichiers `*-thumb.webp` et `*-preview.webp` dans `backend/data/resources` est normale apres cette passe.
- La dependance backend critique ajoutee par cette passe est `sharp`.
