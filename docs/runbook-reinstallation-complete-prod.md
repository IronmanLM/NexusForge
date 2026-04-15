# Runbook de reinstallation complete - production Nexus Forge

Date de reference : 2026-04-15

## Objet

Ce document sert de procedure de reinstallation complete de la production Nexus Forge en cas de crash majeur :

- serveur partiellement vide ;
- backend inutilisable ;
- frontend perdu ou corrompu ;
- environnement Node a reconstruire ;
- besoin de repartir du depot et de restaurer les donnees.

Ce document est fait pour pouvoir etre redonne tel quel a Codex.

## Topologie de production actuelle

### Frontend public

- domaine : `https://nexusforge.en-ligne.fr`
- chemin serveur : `~/nexusforge.en-ligne.fr`
- fichiers statiques principaux :
  - `index.html`
  - `assets/`
  - `brand/`
  - `icons/`
  - `downloads/`
  - `showcase/`
- fallback SPA preserve via `.htaccess`

### Backend API

- domaine : `https://api.nexusforge.en-ligne.fr`
- racine serveur : `~/api.nexusforge.en-ligne.fr`
- application backend : `~/api.nexusforge.en-ligne.fr/backend`
- variables runtime prod : `~/api.nexusforge.en-ligne.fr/backend/.env`
- donnees persistantes : `~/api.nexusforge.en-ligne.fr/backend/data`
- startup Passenger :
  - `PassengerAppRoot "/home/mcxk1700/api.nexusforge.en-ligne.fr/backend"`
  - `PassengerStartupFile src/server.js`
  - `PassengerNodejs "/home/mcxk1700/nodevenv/api.nexusforge.en-ligne.fr/backend/20/bin/node"`
- redemarrage Passenger :
  - `~/api.nexusforge.en-ligne.fr/tmp/restart.txt`

### Environnement Node prod

- nodevenv : `~/nodevenv/api.nexusforge.en-ligne.fr/backend/20`
- binaire node : `~/nodevenv/api.nexusforge.en-ligne.fr/backend/20/bin/node`
- binaire npm : `~/nodevenv/api.nexusforge.en-ligne.fr/backend/20/bin/npm`

### Sauvegardes connues

- backups backend : `~/nexusforge-prod-backups/backend-data`
- principe obligatoire : ne jamais ecraser `backend/data` sans backup prealable

## Ce qu il faut absolument preserver

En cas de reinstallation, ces elements sont prioritaires :

- `~/api.nexusforge.en-ligne.fr/backend/.env`
- `~/api.nexusforge.en-ligne.fr/backend/data/state.json`
- `~/api.nexusforge.en-ligne.fr/backend/data/history/`
- `~/api.nexusforge.en-ligne.fr/backend/data/resources/`
- `~/api.nexusforge.en-ligne.fr/.htaccess`
- `~/nexusforge.en-ligne.fr/.htaccess`

## Strategie generale

Ordre recommande :

1. securiser les backups existants ;
2. remettre le code depuis le depot ;
3. reconstruire le frontend ;
4. resynchroniser le frontend public ;
5. resynchroniser le backend sans toucher aux donnees ni au `.env` ;
6. reinstaller les dependances backend dans le `nodevenv` ;
7. redemarrer Passenger ;
8. verifier `health` et les ecrans critiques ;
9. si necessaire seulement, restaurer `state.json` depuis backup.

## Procedure detaillee

### 1. Sauvegarde d urgence avant toute action

Depuis la machine locale :

```bash
ts=$(date +%Y%m%d-%H%M%S)
ssh nexusforge-prod "
  mkdir -p ~/nexusforge-prod-backups/backend-data &&
  if [ -f ~/api.nexusforge.en-ligne.fr/backend/data/state.json ]; then
    cp ~/api.nexusforge.en-ligne.fr/backend/data/state.json ~/nexusforge-prod-backups/backend-data/state-$ts.json
  fi
"
```

Si le serveur est encore lisible, sauvegarder aussi le dossier ressources :

```bash
ssh nexusforge-prod "
  mkdir -p ~/nexusforge-prod-backups &&
  if [ -d ~/api.nexusforge.en-ligne.fr/backend/data/resources ]; then
    tar -czf ~/nexusforge-prod-backups/resources-$ts.tar.gz -C ~/api.nexusforge.en-ligne.fr/backend/data resources
  fi
"
```

### 2. Recuperer le depot local de reference

Sur la machine locale contenant le repo :

```bash
cd /mnt/c/Users/mikael/.codex/worktrees/e534/NexusForge
git status
git rev-parse --short HEAD
```

Le commit de reference actuel incluant l etat synchronise est :

- `ed08b29`

Si besoin, se replacer explicitement dessus :

```bash
git checkout ed08b29
```

Ou sur la branche :

```bash
git checkout codex/resources-cache-runbook
```

### 3. Rebuild frontend local

```bash
cd frontend
npm install
npm run build
```

### 4. Redeployer completement le frontend public

```bash
cd /mnt/c/Users/mikael/.codex/worktrees/e534/NexusForge
rsync -az --delete --exclude '.htaccess' \
  frontend/dist/ nexusforge-prod:~/nexusforge.en-ligne.fr/
```

Verification serveur :

```bash
ssh nexusforge-prod 'ls -la ~/nexusforge.en-ligne.fr && stat -c "%y %n" ~/nexusforge.en-ligne.fr/index.html'
```

### 5. Redeployer completement le backend applicatif

Important :

- ne pas ecraser `backend/data`
- ne pas ecraser `backend/.env`
- ne pas forcer la suppression d anciens backups locaux serveur inutiles si cela bloque la synchro

Commande recommande :

```bash
cd /mnt/c/Users/mikael/.codex/worktrees/e534/NexusForge
rsync -az --delete \
  --exclude 'data' \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude 'node_modules_local_backup_*' \
  backend/ nexusforge-prod:~/api.nexusforge.en-ligne.fr/backend/
```

### 6. Reinstaller les dependances backend dans le nodevenv

Sur o2switch, utiliser le `npm` du `nodevenv` et pas un `npm` systeme.

```bash
ssh nexusforge-prod '
  ~/nodevenv/api.nexusforge.en-ligne.fr/backend/20/bin/npm \
    --prefix ~/api.nexusforge.en-ligne.fr/backend \
    install --omit=dev
'
```

Verification :

```bash
ssh nexusforge-prod '
  test -d ~/api.nexusforge.en-ligne.fr/backend/node_modules && echo node_modules-ok || echo node_modules-missing
  test -d ~/api.nexusforge.en-ligne.fr/backend/node_modules/sharp && echo sharp-ok || echo sharp-missing
'
```

### 7. Redemarrer Passenger

```bash
ssh nexusforge-prod 'touch ~/api.nexusforge.en-ligne.fr/tmp/restart.txt'
```

Si Passenger ne reprend pas proprement et qu un process backend reste bloque, forcer un redemarrage en tuant le process NodeApp puis en retouchant `restart.txt`.

Verification process :

```bash
ssh nexusforge-prod '
  ps -u mcxk1700 -o pid,lstart,cmd | grep "Passenger NodeApp: /home/mcxk1700/api.nexusforge.en-ligne.fr/backend" | grep -v grep || true
'
```

### 8. Verifications applicatives minimales

Healthcheck :

```bash
curl -fsS https://api.nexusforge.en-ligne.fr/health
```

Le resultat attendu :

- `"ok": true`
- pas d erreur de chargement backend
- `startupIntegrity.status` en `ok` ou au minimum sans warning bloquant

Verifications fonctionnelles :

- ouverture du site `https://nexusforge.en-ligne.fr`
- login
- ouverture d une partie
- affichage d une fiche personnage
- ouverture d un overlay image
- affichage du widget documents

## Cas de restauration donnees

Si le code est redeploye mais que les donnees sont corrompues ou perdues, restaurer `state.json`.

### Restaurer le dernier backup connu

Exemple :

```bash
ssh nexusforge-prod '
  cp ~/api.nexusforge.en-ligne.fr/backend/data/state.json ~/api.nexusforge.en-ligne.fr/backend/data/state.before-restore.json &&
  cp ~/nexusforge-prod-backups/backend-data/state-20260415-165853.json ~/api.nexusforge.en-ligne.fr/backend/data/state.json &&
  touch ~/api.nexusforge.en-ligne.fr/tmp/restart.txt
'
```

Puis reverifier :

```bash
curl -fsS https://api.nexusforge.en-ligne.fr/health
```

## Cas de reconstruction quasi vide

Si `~/api.nexusforge.en-ligne.fr/backend` a ete supprime ou fortement endommage :

1. recréer le dossier backend ;
2. resynchroniser `backend/` avec `rsync` ;
3. remettre manuellement `.env` si absent ;
4. recreer `data/` si absent ;
5. restaurer `state.json` et `resources/` depuis backup si necessaire ;
6. lancer l install npm du `nodevenv` ;
7. toucher `restart.txt`.

## Fichiers critiques a verifier apres reconstruction

### Backend

- `~/api.nexusforge.en-ligne.fr/.htaccess`
- `~/api.nexusforge.en-ligne.fr/backend/src/server.js`
- `~/api.nexusforge.en-ligne.fr/backend/package.json`
- `~/api.nexusforge.en-ligne.fr/backend/package-lock.json`
- `~/api.nexusforge.en-ligne.fr/backend/.env`
- `~/api.nexusforge.en-ligne.fr/backend/data/state.json`

### Frontend

- `~/nexusforge.en-ligne.fr/.htaccess`
- `~/nexusforge.en-ligne.fr/index.html`
- `~/nexusforge.en-ligne.fr/assets/`

## Prompt pret a reutiliser

Tu peux me redonner exactement ceci :

```md
Reinstalle completement la production Nexus Forge apres crash.

Consignes :
- utilise `docs/runbook-reinstallation-complete-prod.md`
- preserve et sauvegarde d abord `.env` et `backend/data`
- redeploie le frontend public
- redeploie le backend sans ecraser `backend/data` ni `.env`
- reinstalle les dependances avec le npm du nodevenv o2switch
- redemarre Passenger via `tmp/restart.txt`
- verifie ensuite `https://api.nexusforge.en-ligne.fr/health`
- si l etat est corrompu, restaure aussi le dernier `state.json` de backup
```

## Difference avec le runbook rollback de passe

Le fichier `docs/runbook-restauration-cache-ressources-2026-04-15.md` sert a revenir sur une passe technique precise.

Le present fichier sert a reconstruire toute la production en cas de crash global.
