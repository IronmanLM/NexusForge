# E0 — Revue d'ergonomie des points d'entrée joueur / utilisateur

> Statut : revue livrée, aucun codage. Recommandations à arbitrer avant M1.4.
> Périmètre : écrans d'entrée vus par un joueur, y compris non averti en informatique et en web.
> Méthode : lecture du routeur (`frontend/src/router/index.tsx`), des pages d'auth et de sessions,
> du `Layout` (`frontend/src/components/Layout.tsx`) et du CSS (`frontend/src/styles/global.css`).

## 1. Constats par écran

### 1.1 Connexion (`/login`) — jargon dès la première phrase
- Le sous-titre parle de « validation email, approbation admin et 2FA TOTP optionnel ».
  Pour un joueur invité par son MJ, c'est incompréhensible et anxiogène avant même le premier champ.
- Le parcours 2FA demande un « Code 2FA (TOTP) » puis renvoie vers « ton application
  d'authentification », sans jamais nommer un exemple ni expliquer où trouver ce code.
- Points positifs : labels corrects, `type="email"`, `inputMode="numeric"` sur le code, liens
  « Créer un compte » et « Mot de passe oublié » présents.
- Recommandation : sous-titre en langage courant (« Connecte-toi pour retrouver tes parties »),
  encadré d'aide 2FA en une phrase avec exemples d'applications, page d'aide « Première visite ? ».

### 1.2 Inscription (`/register`) — cinq champs d'un coup, puis le vide
- Prénom, nom, « Nickname » (en anglais au milieu du français — dire « Pseudo »), email,
  mot de passe de 10 caractères minimum sans jauge ni explication.
- Après validation : le compte doit valider l'email PUIS être approuvé par un admin, mais aucun
  écran n'explique ce délai ni ce que le joueur doit faire en attendant (aucune partie visible,
  aucun message « ton MJ a été prévenu »).
- Recommandation : écran d'attente explicite après inscription (« Vérifie tes emails, puis ton MJ
  validera ton accès »), renommer « Nickname » en « Pseudo », aide mot de passe.

### 1.3 Liste des parties (`/sessions`) — le joueur arrive sur un écran de MJ
C'est le premier écran après connexion, et c'est le point le plus problématique :
- Le formulaire de CRÉATION de partie occupe le haut de page, avec « Template générique
  (modifiable) », trois cases techniques (« édition fiche hors-ligne », « chat entre joueurs »,
  « documents entre joueurs ») et un « Mode silence » aux options en anglais
  (« Off », « No Global », « Players ↔ Players bloqué », « Full »).
- Un joueur invité n'a rien à créer : il doit d'abord comprendre ce qu'il peut ignorer.
- Les cartes de parties affichent des données techniques brutes : identifiants propriétaire et MJ
  au lieu de noms (« Propriétaire : <id> | MJ : <ids> »), état brut non traduit.
- « Suppression définitive » figure comme simple bouton secondaire au même niveau visuel
  que « Ouvrir », sans regroupement des actions dangereuses.
- Points positifs : état vide et chargement gérés, archivage filtrable.
- Recommandation : « Mes parties » en premier (carte simple : nom, MJ par nom, état en français,
  bouton Ouvrir en action primaire), création repliée dans un second bloc « Créer (MJ) »,
  jamais d'identifiant technique à l'écran, actions destructrices regroupées et confirmées.

### 1.4 Partie (`/sessions/:id`) — tout le monde voit tout
- La page empile administration de table, catalogue système, état de synchro, conflits de synchro
  et tableau de bord, sans zone joueur épurée : un débutant ne sait pas où cliquer pour jouer.
- Textes sans accents (« Personnalisation d ecran par compte et par role. »,
  « Editer cet ecran (Studio) », « Role edite ») : corriger à l'occasion.
- Recommandation : zone joueur unique et ordonnée en haut (ma fiche, mes dés et jets, chat, documents),
  panneaux d'administration et de synchro repliés par défaut pour le rôle joueur.

### 1.5 Vocabulaire mélangé
« Parties » contre « Sessions », « Nickname », « Template », « Mode silence » et options anglaises.
Recommandation : lexique unique en français dans l'interface joueur, termes techniques réservés
aux écrans MJ et admin.

## 2. CSS multisupport : acquis et manques

Acquis vérifiés (M1.1 à M1.3) :
- Jetons de fondation posés (`--nf-tap: 44px`, espacements, rayons, `clamp()` sur les tailles
  de police, `safe-area` mobile).
- Cibles 640 px (téléphone, 1 colonne), 641–1024 px (tablette), 1920 px et plus (TV 4K, page
  élargie à 1600 px).
- Empilement des grilles complexes (studio, builder 3 panneaux, chat, dashboard) sous 900 px.

Manques constatés pour une vraie adaptation :
- Navigation mobile : la barre supérieure s'enroule sur plusieurs lignes (media 820 px),
  sans hamburger ni navigation basse comme M1.3 le prévoyait pour le téléphone.
- Les liens de navigation ont un remplissage de 0,3 rem sans hauteur tactile propre : la règle
  des 44 px existe mais ne s'applique pas proprement aux liens en ligne.
- Aucun état `:focus-visible` au clavier (M1.7), aucun `prefers-reduced-motion` (M1.8),
  échelle `z-index` non documentée (M1.9).
- `body.theme-light` est basculé par le sélecteur mais ne définit aucune règle : le mode clair
  n'est que l'absence du mode sombre (M2 à traiter, sans régression).
- Styles en ligne encore présents dans les pages d'entrée (couleurs d'erreur et de succès,
  marges et dispositions en `style={{...}}`) : à migrer vers des classes (M1.6).

## 3. Recommandations priorisées (sans codage, pour arbitrage M1.4)

1. Zone joueur ordonnée : « Mes parties » d'abord, création MJ repliée, aucun identifiant
   technique, états traduits en français.
2. Langage courant sur tout le parcours d'entrée : « Pseudo », aide 2FA avec exemples,
   écran d'attente post-inscription, suppression du jargon des sous-titres.
3. Hiérarchie des actions : Ouvrir et Rejoindre en boutons primaires, actions destructrices
   regroupées et confirmées.
4. Navigation téléphone : hamburger ou barre basse, cible tactile réelle de 44 px sur chaque lien.
5. Accessibilité socle : `:focus-visible`, `prefers-reduced-motion`, audit de contraste par vue.
6. Corrections de détail : accents manquants, options « Mode silence » en français expliquées.

## 4. Plan proposé

- M1.4a : zones joueur (`/sessions`, `/sessions/:id` rôle joueur) selon les points 1 à 3.
- M1.4b : écrans d'auth en langage courant (points 2 et 6).
- M1.4c : navigation mobile + socle accessibilité (points 4 et 5), avec `npm run build` vert
  et tests manuels aux quatre largeurs (M1.5).
- Thèmes M2 ensuite, sur des écrans d'entrée déjà sains.
