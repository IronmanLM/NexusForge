import http from 'node:http';
import { URL } from 'node:url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import authRoutes from './routes/auth.js';
import characterRoutes from './routes/characters.js';
import sessionRoutes from './routes/sessions.js';
import { canUserReadMessage, findUserById, getSessionById, isSessionMember, verifyAccessToken } from './data/store.js';
import { sendError } from './utils/errors.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/sessions', sessionRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Internal server error');
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

/** @type {Set<{socket: import('ws').WebSocket, sessionId: string, userId: string}>} */
const wsClients = new Set();

function broadcastMessageCreated(session, message) {
  const payload = JSON.stringify({
    type: 'chat.message.created',
    payload: { message }
  });

  for (const client of wsClients) {
    if (client.sessionId !== session.id) {
      continue;
    }

    if (!canUserReadMessage(session, message, client.userId)) {
      continue;
    }

    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(payload);
    }
  }
}

app.locals.broadcastMessageCreated = broadcastMessageCreated;

wss.on('connection', (socket, context) => {
  const client = {
    socket,
    sessionId: context.sessionId,
    userId: context.userId
  };
  wsClients.add(client);

  socket.on('close', () => {
    wsClients.delete(client);
  });

  socket.send(
    JSON.stringify({
      type: 'ws.connected',
      payload: {
        sessionId: context.sessionId,
        userId: context.userId
      }
    })
  );
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '', `http://${request.headers.host}`);
  const match = url.pathname.match(/^\/ws\/sessions\/([^/]+)$/);
  if (!match) {
    socket.destroy();
    return;
  }

  const sessionId = match[1];
  const queryToken = url.searchParams.get('token');
  const headerToken = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice('Bearer '.length).trim()
    : null;
  const token = headerToken ?? queryToken;
  if (!token) {
    socket.destroy();
    return;
  }

  const verification = verifyAccessToken(token);
  if (!verification.valid) {
    socket.destroy();
    return;
  }

  const session = getSessionById(sessionId);
  const user = findUserById(verification.userId);
  if (!session || !user || !isSessionMember(session, user.id)) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, { sessionId, userId: user.id });
  });
});

server.listen(port, () => {
  console.log(`NexusForge backend MVP listening on http://localhost:${port}`);
});
