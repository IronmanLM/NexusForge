import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

const TEST_JWT_SECRET_BASE = 'nexusforge-vtt-movement-test-only';
const JWT_SECRET = `${TEST_JWT_SECRET_BASE}-access`;
const JWT_REFRESH_SECRET = `${TEST_JWT_SECRET_BASE}-refresh`;
const GM_ID = 'user-vtt-gm';
const PLAYER_ID = 'user-vtt-player';
const OTHER_PLAYER_ID = 'user-vtt-other-player';
const SESSION_ID = 'session-vtt-movement';

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function buildState(playersCanMoveOwnTokens = true) {
  const now = new Date().toISOString();
  const users = [
    { id: GM_ID, email: 'gm@example.invalid', nickname: 'test-gm', roles: ['gm'], isActive: true, isEmailVerified: true, approvalStatus: 'approved', createdAt: now, updatedAt: now },
    { id: PLAYER_ID, email: 'player@example.invalid', nickname: 'test-player', roles: ['player'], isActive: true, isEmailVerified: true, approvalStatus: 'approved', createdAt: now, updatedAt: now },
    { id: OTHER_PLAYER_ID, email: 'other-player@example.invalid', nickname: 'test-other-player', roles: ['player'], isActive: true, isEmailVerified: true, approvalStatus: 'approved', createdAt: now, updatedAt: now }
  ];
  const scene = {
    id: 'scene-vtt-active',
    name: 'Test map',
    mapResourceId: null,
    mapImageUrl: null,
    mapWidth: 1200,
    mapHeight: 900,
    grid: { enabled: true, type: 'square', size: 70, color: '#38bdf8', opacity: 0.35, offsetX: 0, offsetY: 0 },
    fog: { enabled: false, mode: 'hidden-by-default', shapes: [] },
    tokens: [
      { id: 'token-player', name: 'Player token', characterId: null, imageResourceId: null, imageUrl: null, color: '#38bdf8', x: 120, y: 140, width: 56, height: 56, rotation: 0, ownerUserId: PLAYER_ID, visibleToPlayers: true, locked: false },
      { id: 'token-other-player', name: 'Other token', characterId: null, imageResourceId: null, imageUrl: null, color: '#f59e0b', x: 240, y: 260, width: 56, height: 56, rotation: 0, ownerUserId: OTHER_PLAYER_ID, visibleToPlayers: true, locked: false },
      { id: 'token-locked', name: 'Locked token', characterId: null, imageResourceId: null, imageUrl: null, color: '#f59e0b', x: 360, y: 380, width: 56, height: 56, rotation: 0, ownerUserId: PLAYER_ID, visibleToPlayers: true, locked: true },
      { id: 'token-hidden', name: 'Hidden token', characterId: null, imageResourceId: null, imageUrl: null, color: '#f59e0b', x: 480, y: 500, width: 56, height: 56, rotation: 0, ownerUserId: PLAYER_ID, visibleToPlayers: false, locked: false }
    ],
    pings: [],
    permissions: { playersCanMoveOwnTokens },
    createdAt: now,
    updatedAt: now
  };
  const session = {
    id: SESSION_ID,
    name: 'VTT movement test',
    description: '',
    state: 'planned',
    systemId: 'system-vtt-test',
    ownerUserId: GM_ID,
    gmUserId: GM_ID,
    gmUserIds: [GM_ID],
    participants: [{ userId: GM_ID, role: 'gm' }, { userId: PLAYER_ID, role: 'player' }, { userId: OTHER_PLAYER_ID, role: 'player' }],
    invitations: [],
    settings: {},
    initiative: { order: [], currentTurn: 0 },
    activityLog: [],
    vtt: { scenes: [scene], activeSceneId: scene.id, updatedAt: now },
    createdAt: now,
    updatedAt: now
  };
  return {
    users,
    usersByEmail: users.map((user) => [user.email, user.id]),
    sessions: [session],
    systems: [],
    characters: [],
    notes: [],
    messages: [],
    resources: [],
    resourceFolders: [],
    screenTemplates: [],
    homeNews: [],
    announcements: [],
    socialDirectMessages: [],
    socialLinks: [],
    socialReports: [],
    adminAuditEvents: [],
    discordBotEvents: [],
    refreshTokenSessions: [],
    emailVerificationTokens: [],
    passwordResetTokens: [],
    twoFactorChallenges: [],
    savedAt: now
  };
}

async function startBackend(t) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nexusforge-vtt-movement-'));
  const dataFile = path.join(dataDir, 'state.json');
  const emptyDotenv = path.join(dataDir, 'empty.env');
  await writeFile(dataFile, JSON.stringify(buildState(), null, 2));
  await writeFile(emptyDotenv, '');

  const port = await getFreePort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      PATH: process.env.PATH || '/usr/bin',
      HOME: process.env.HOME || dataDir,
      NODE_ENV: 'test',
      PORT: String(port),
      DATA_DIR: dataDir,
      DATA_FILE: dataFile,
      DATA_HISTORY_DIR: path.join(dataDir, 'history'),
      DATA_PERSIST_LOG_FILE: path.join(dataDir, 'persist-log.jsonl'),
      RESOURCE_DIR: path.join(dataDir, 'resources'),
      DOTENV_CONFIG_PATH: emptyDotenv,
      JWT_SECRET,
      JWT_REFRESH_SECRET,
      ROOT_ADMIN_PASSWORD: 'test-vtt-root-password',
      ROOT_ADMIN_EMAIL: 'gm@example.invalid',
      CORS_ORIGIN: 'http://127.0.0.1'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  let resolveExit;
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });
  child.once('exit', (code, signal) => resolveExit({ code, signal }));
  child.once('error', (error) => resolveExit({ error }));

  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
    }
    await rm(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return baseUrl;
      }
    } catch {
      // retry until the isolated backend is ready
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`backend exited before readiness: ${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`backend did not become ready: ${stderr}`);
}

function authHeaders(userId) {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '5m' });
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function requestVtt(baseUrl, userId, method, vtt) {
  const response = await fetch(`${baseUrl}/api/sessions/${SESSION_ID}/vtt`, {
    method,
    headers: authHeaders(userId),
    ...(vtt ? { body: JSON.stringify({ vtt }) } : {})
  });
  return { response, body: await response.json() };
}

test('player can move only their own unlocked token when GM enables it, and peers see the saved position', async (t) => {
  const baseUrl = await startBackend(t);
  const initial = await requestVtt(baseUrl, PLAYER_ID, 'GET');
  assert.equal(initial.response.status, 200);
  const requested = structuredClone(initial.body.vtt);
  const ownedToken = requested.scenes[0].tokens.find((token) => token.id === 'token-player');
  ownedToken.x = 455;
  ownedToken.y = 515;

  const saved = await requestVtt(baseUrl, PLAYER_ID, 'PUT', requested);
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.vtt.scenes[0].tokens.find((token) => token.id === 'token-player').x, 455);
  assert.equal(saved.body.vtt.scenes[0].tokens.find((token) => token.id === 'token-player').y, 515);

  const visibleToGm = await requestVtt(baseUrl, GM_ID, 'GET');
  assert.equal(visibleToGm.response.status, 200);
  assert.equal(visibleToGm.body.vtt.scenes[0].tokens.find((token) => token.id === 'token-player').x, 455);
  assert.equal(visibleToGm.body.vtt.scenes[0].tokens.find((token) => token.id === 'token-other-player').x, 240);
});

test('player cannot move another player token, a locked token, or move tokens when GM permission is off', async (t) => {
  const baseUrl = await startBackend(t);
  const initial = await requestVtt(baseUrl, PLAYER_ID, 'GET');
  const requested = structuredClone(initial.body.vtt);
  requested.scenes[0].tokens.find((token) => token.id === 'token-other-player').x = 300;
  let result = await requestVtt(baseUrl, PLAYER_ID, 'PUT', requested);
  assert.equal(result.response.status, 403);
  assert.equal(result.body.error.code, 'SESSION_VTT_FORBIDDEN');

  const fresh = await requestVtt(baseUrl, PLAYER_ID, 'GET');
  const locked = structuredClone(fresh.body.vtt);
  locked.scenes[0].tokens.find((token) => token.id === 'token-locked').x = 400;
  result = await requestVtt(baseUrl, PLAYER_ID, 'PUT', locked);
  assert.equal(result.response.status, 403);

  const hiddenState = await requestVtt(baseUrl, PLAYER_ID, 'GET');
  const hidden = structuredClone(hiddenState.body.vtt);
  hidden.scenes[0].tokens.find((token) => token.id === 'token-hidden').x = 520;
  result = await requestVtt(baseUrl, PLAYER_ID, 'PUT', hidden);
  assert.equal(result.response.status, 403);

  const gmState = await requestVtt(baseUrl, GM_ID, 'GET');
  const disabled = structuredClone(gmState.body.vtt);
  disabled.scenes[0].permissions.playersCanMoveOwnTokens = false;
  const permissionUpdate = await requestVtt(baseUrl, GM_ID, 'PUT', disabled);
  assert.equal(permissionUpdate.response.status, 200);

  const pingState = await requestVtt(baseUrl, PLAYER_ID, 'GET');
  const pingUpdate = structuredClone(pingState.body.vtt);
  pingUpdate.scenes[0].pings.push({ id: 'player-ping', x: 80, y: 90, color: '#38bdf8', label: 'Ping joueur', createdByUserId: PLAYER_ID, createdAt: new Date().toISOString() });
  const pingResult = await requestVtt(baseUrl, PLAYER_ID, 'PUT', pingUpdate);
  assert.equal(pingResult.response.status, 200);
  const sharedPing = await requestVtt(baseUrl, GM_ID, 'GET');
  assert.equal(sharedPing.body.vtt.scenes[0].pings.some((ping) => ping.id === 'player-ping'), true);

  const playerState = await requestVtt(baseUrl, PLAYER_ID, 'GET');
  const attempted = structuredClone(playerState.body.vtt);
  attempted.scenes[0].tokens.find((token) => token.id === 'token-player').x = 500;
  result = await requestVtt(baseUrl, PLAYER_ID, 'PUT', attempted);
  assert.equal(result.response.status, 403);
  assert.equal(result.body.error.code, 'SESSION_VTT_FORBIDDEN');
});

test('player cannot combine own-token movement with changes to token metadata or scene settings', async (t) => {
  const baseUrl = await startBackend(t);
  const initial = await requestVtt(baseUrl, PLAYER_ID, 'GET');
  const requested = structuredClone(initial.body.vtt);
  const token = requested.scenes[0].tokens.find((item) => item.id === 'token-player');
  token.x = 470;
  token.ownerUserId = OTHER_PLAYER_ID;
  requested.scenes[0].fog.enabled = true;

  const result = await requestVtt(baseUrl, PLAYER_ID, 'PUT', requested);
  assert.equal(result.response.status, 403);
  assert.equal(result.body.error.code, 'SESSION_VTT_FORBIDDEN');
});
