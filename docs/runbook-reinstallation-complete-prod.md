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

## Philosophie de restauration

La reference du code est le depot git.

Le backup distant ne doit donc conserver que ce qui n est pas reconstruit depuis git ou regenerable automatiquement :

- `backend/.env`
- `backend/data/state.json`
- `backend/data/persist-log.jsonl`
- les ressources source des utilisateurs dans `backend/data/resources/`
- les `.htaccess` de prod si ils ne sont pas dans git

Le backup ne doit pas embarquer :

- le frontend deploye complet ;
- le code backend complet ;
- `node_modules` ;
- les derives images regenerables (`*-thumb.webp`, `*-preview.webp`) ;
- les fichiers statiques qui viennent deja du depot git.

## Regle de maintenance backup

A chaque evolution du projet qui ajoute un nouveau fichier ou dossier persistant en production, il faut verifier immediatement si :

- ce nouveau chemin doit etre ajoute au script de backup ;
- il doit etre restaure depuis backup ou regenere automatiquement ;
- la procedure de restauration doit etre mise a jour pour refléter ce nouveau comportement.

Un chantier n est pas considere comme complet tant que cette verification backup/restauration n a pas ete faite.

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

### Backup distant automatise

- declenchement via URL interne backend : `GET /api/internal/ops/backup`
- protection par secret : `BACKUP_TRIGGER_SECRET`
- contenu voulu de l archive :
  - `backend/.env`
  - `backend/data/state.json`
  - `backend/data/persist-log.jsonl`
  - `backend/data/resources/` sans les derives regenerables
  - `~/api.nexusforge.en-ligne.fr/.htaccess`
- synchronisation `rsync` separee :
  - `backend/data/history/` vers un miroir distant
- cible distante voulue :
  - hote : `fremaux.biz`
  - utilisateur : `root`
  - dossier : `/mnt/kraken/Backups/nexusforge_backups`
  - historique rsync : `/mnt/kraken/Backups/nexusforge_backups/history`
  - cle SSH : `~/.ssh/id_rsa_codex`

### Sauvegardes connues

- backups backend : `~/nexusforge-prod-backups/backend-data`
- principe obligatoire : ne jamais ecraser `backend/data` sans backup prealable

## Ce qu il faut absolument preserver

En cas de reinstallation, ces elements sont prioritaires :

- `~/api.nexusforge.en-ligne.fr/backend/.env`
- `~/api.nexusforge.en-ligne.fr/backend/data/state.json`
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

### 4. Redeployer completement le frontend public depuis git

```bash
cd /mnt/c/Users/mikael/.codex/worktrees/e534/NexusForge
rsync -az --delete --exclude '.htaccess' \
  frontend/dist/ nexusforge-prod:~/nexusforge.en-ligne.fr/
```

Verification serveur :

```bash
ssh nexusforge-prod 'ls -la ~/nexusforge.en-ligne.fr && stat -c "%y %n" ~/nexusforge.en-ligne.fr/index.html'
```

### 5. Redeployer completement le backend applicatif depuis git

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

### 8. Restaurer les donnees sauvegardees

Une fois le code redeploye et les dossiers recrees, restaurer seulement les donnees de prod et les secrets.

Contenu attendu du backup :

- `api-root/.htaccess`
- `backend/.env`
- `backend/data/state.json`
- `backend/data/persist-log.jsonl`
- `backend/data/resources/` sans les derives `webp`

Exemple de restauration depuis une archive distante recuperee localement :

```bash
tar -xzf 202604151800-nexusforge-production-data.tar.gz -C /tmp/nexusforge-restore

rsync -az /tmp/nexusforge-restore/api-root/.htaccess \
  nexusforge-prod:~/api.nexusforge.en-ligne.fr/.htaccess

rsync -az /tmp/nexusforge-restore/backend/.env \
  nexusforge-prod:~/api.nexusforge.en-ligne.fr/backend/.env

rsync -az /tmp/nexusforge-restore/backend/data/ \
  nexusforge-prod:~/api.nexusforge.en-ligne.fr/backend/data/
```

### 9. Regeneration des fichiers backend derives

Les miniatures et apercus derives ne sont pas restaures depuis le backup.

Ils sont regeneres automatiquement par le backend au demarrage via le backfill des ressources image.

Il suffit donc de redemarrer Passenger apres restauration des donnees :

```bash
ssh nexusforge-prod 'touch ~/api.nexusforge.en-ligne.fr/tmp/restart.txt'
```

Puis verifier que le healthcheck revient et que le backend persiste ensuite une passe `resource-derivative-backfill` si des derives manquaient.

### 10. Verifications applicatives minimales

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

Si le code est redeploye mais que les donnees sont corrompues ou perdues, restaurer `state.json` puis relancer le backend pour qu il recharge cet etat et regenere les derives manquants.

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
5. restaurer `.env`, `state.json`, `persist-log.jsonl` et `resources/` depuis backup si necessaire ;
6. lancer l install npm du `nodevenv` ;
7. toucher `restart.txt` pour recharger l application et relancer la regeneration des derives.

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
