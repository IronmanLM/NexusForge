# Maquetage NexusForge

[![Version](https://img.shields.io/badge/version-v0.1.1-blue)](CHANGELOG.md)
[![Avancement](https://img.shields.io/badge/avancement-maquettes_en_cours-orange)](ROADMAP.md)

Maquettes statiques des pages d’entrée (joueur et utilisatrice, y compris non avertie).
Textes en français provisoires — l’intégration utilisera les clés i18n (`nav.home`, etc.).

## Prévisualisation

Aucun serveur requis : ouvrez `index.html` dans un navigateur et naviguez.
En Docker (depuis `maquetage/`) : `docker compose -f docker-compose.preview.yml up -d`, puis `http://192.168.0.120:8090`.
Les boutons relient les maquettes entre elles :

- **Accueil** → « Connexion », « Rejoindre une partie », « Devenir un conteur » mènent à la page Accès.
- **Accès** → « Se connecter » renvoie vers l’Accueil (en attendant la maquette « accueil connecté »).
- **Accès** → « Commencer » : déclenchera le futur wizard d’inscription (cf. `TODO.md`).

## Arborescence

```text
maquetage/
├── VERSION          # version courante (vM.m.f)
├── README.md        # ce fichier
├── CHANGELOG.md     # historique des versions
├── ROADMAP.md       # cap et jalons
├── TODO.md          # reste à faire
├── index.html       # hub de prévisualisation statique
├── html/            # pages (chemins relatifs vers ../css et ../img)
├── css/             # un fichier par page + preview.css pour l’index
└── img/             # illustrations et symboles (jamais de base64 dans le HTML)
```

## Versionnement (vM.m.f)

- **Major** : uniquement sur décision de l’utilisateur.
- **Minor** : une fonctionnalité ajoutée → minor + 1, fix remis à 0 (ex. `v0.1.3` → `v0.2.0`).
- **Fix** : tout autre commit → fix + 1 (ex. `v0.1.3` → `v0.1.4`).

`VERSION` et `CHANGELOG.md` sont mis à jour à chaque commit.
Les shields du README reflètent la version et l’avancement courants.
