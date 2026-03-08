# NexusForge Backend MVP

Backend API MVP en mémoire (Node + Express + WS):

- Auth JWT (access + refresh)
- Sessions de jeu
- Channels et messages de chat
- Personnages (CRUD)
- Vue de fiche générique `CharacterSheetView`
- Realtime chat via WebSocket

## Lancer le backend

```bash
cd backend
npm install
npm run dev
```

Serveur local: `http://localhost:4000`

## Documentation API

La documentation API complète est ici:

- [`docs/api/backend-mvp.md`](../docs/api/backend-mvp.md)

Tu y trouveras:

- contrats JSON
- endpoints REST
- permissions MVP
- format d'erreur standard
- endpoint `/api/auth/introspect`
- WebSocket (`/ws/sessions/{sessionId}`)

## Raccourci des endpoints

- Auth: `/api/auth/*`
- Characters: `/api/characters/*`
- Sessions: `/api/sessions/*`
- WS: `/ws/sessions/{sessionId}`

## Notes MVP

- Les données sont stockées en mémoire dans `src/data/store.js`.
- Un restart serveur réinitialise les données.
