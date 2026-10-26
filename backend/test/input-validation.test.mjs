import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-access-secret-for-input-validation';
const JWT_REFRESH_SECRET = 'test-refresh-secret-for-input-validation';
const ROOT_USER_ID = 'user-admin-root';

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

function buildState() {
  const now = new Date().toISOString();
  const rootUser = {
    id: ROOT_USER_ID,
    firstName: 'Root',
    lastName: 'Admin',
    nickname: 'root',
    displayName: 'root',
    email: 'ironmanlm@en-ligne.fr',
    passwordHash: '$2a$12$EcT04mvz4qt99emIcZRTn.raDvFfiiO/pda.PfJhlcVxN0Ejg9h3G',
    roles: ['admin', 'gm', 'player'],
    isEmailVerified: true,
    approvalStatus: 'approved',
    isActive: true,
    createdAt: now,
    updatedAt: now
  };

  return {
    users: [rootUser],
    usersByEmail: [[rootUser.email, rootUser.id]],
    sessions: [
      {
        id: 'session-validation',
        name: 'Validation session',
        description: '',
        state: 'planned',
        systemId: 'system-validation',
        ownerUserId: ROOT_USER_ID,
        gmUserId: ROOT_USER_ID,
        gmUserIds: [ROOT_USER_ID],
        participants: [{ userId: ROOT_USER_ID, role: 'gm' }],
        invitations: [],
        settings: {},
        initiative: { order: [], currentTurn: 0 },
        activityLog: [],
        createdAt: now,
        updatedAt: now
      }
    ],
    systems: [
      {
        id: 'system-validation',
        name: 'Validation system',
        version: '0.1.0',
        description: '',
        author: 'root',
        ownerUserId: ROOT_USER_ID,
        status: 'draft',
        visibility: 'private',
        viewerUserIds: [],
        editorUserIds: [],
        tags: ['custom'],
        rollDefinitions: [],
        rulesProgram: [],
        auditTrail: [],
        createdAt: now,
        updatedAt: now
      }
    ],
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

async function waitForChildExit(exitPromise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });
  const outcome = await Promise.race([exitPromise, timeoutPromise]);
  clearTimeout(timeoutId);
  return outcome;
}

async function startBackend(t) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nexusforge-validation-'));
  const dataFile = path.join(dataDir, 'state.json');
  const dotenvFile = path.join(dataDir, '.env.test');
  await writeFile(dataFile, JSON.stringify(buildState(), null, 2));
  await writeFile(dotenvFile, '');

  const port = await getFreePort();
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      NODE_ENV: 'test',
      PORT: String(port),
      DOTENV_CONFIG_PATH: dotenvFile,
      DATA_DIR: dataDir,
      DATA_FILE: dataFile,
      DATA_HISTORY_DIR: path.join(dataDir, 'history'),
      DATA_PERSIST_LOG_FILE: path.join(dataDir, 'persist-log.jsonl'),
      RESOURCE_DIR: path.join(dataDir, 'resources'),
      JWT_SECRET,
      JWT_REFRESH_SECRET,
      ROOT_ADMIN_EMAIL: 'root-validation-test@example.test',
      ROOT_ADMIN_PASSWORD: 'test-root-admin-password',
      CORS_ORIGIN: 'http://127.0.0.1',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_FROM: '',
      DISCORD_BOT_SHARED_SECRET: '',
      DISCORD_OAUTH_CLIENT_ID: '',
      DISCORD_OAUTH_CLIENT_SECRET: '',
      DISCORD_OAUTH_REDIRECT_URI: '',
      BACKUP_TRIGGER_SECRET: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  let childOutcome = null;
  const exitPromise = new Promise((resolve) => {
    child.once('error', (error) => {
      childOutcome = { error };
      resolve(childOutcome);
    });
    child.once('exit', (code, signal) => {
      childOutcome = { code, signal };
      resolve(childOutcome);
    });
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  t.after(async () => {
    try {
      if (!childOutcome && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
      let outcome = childOutcome || await waitForChildExit(exitPromise, 2_000);
      if (!outcome) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
        outcome = await waitForChildExit(exitPromise, 2_000);
      }
      if (!outcome) {
        throw new Error('backend child did not exit after SIGKILL');
      }
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return baseUrl;
      }
    } catch {
      // retry until the server is ready
    }
    if (childOutcome || child.exitCode !== null || child.signalCode !== null) {
      if (childOutcome?.error) {
        throw new Error(`backend failed to spawn: ${childOutcome.error.message}`);
      }
      throw new Error(`backend exited before readiness: ${stderr}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`backend did not become ready: ${stderr}`);
}

function authHeaders() {
  const token = jwt.sign({ sub: ROOT_USER_ID }, JWT_SECRET, { expiresIn: '5m' });
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

async function requestJson(baseUrl, method, pathname, payload) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  return { response, body };
}

test('PATCH /api/sessions/:sessionId rejects malformed structured fields', async (t) => {
  const baseUrl = await startBackend(t);

  const malformedSettings = await requestJson(baseUrl, 'PATCH', '/api/sessions/session-validation', {
    settings: 'invalid-settings'
  });
  assert.equal(malformedSettings.response.status, 400);
  assert.equal(malformedSettings.body.error.code, 'SESSION_PAYLOAD_INVALID');

  const malformedParticipants = await requestJson(baseUrl, 'PATCH', '/api/sessions/session-validation', {
    participants: [{ userId: 42, role: 'gm' }]
  });
  assert.equal(malformedParticipants.response.status, 400);
  assert.equal(malformedParticipants.body.error.code, 'SESSION_PAYLOAD_INVALID');
});

test('POST and PATCH /api/systems reject malformed rules program arrays', async (t) => {
  const baseUrl = await startBackend(t);

  const malformedCreate = await requestJson(baseUrl, 'POST', '/api/systems', {
    name: 'Invalid rules program',
    rulesProgram: ['not-an-action-object']
  });
  assert.equal(malformedCreate.response.status, 400);
  assert.equal(malformedCreate.body.error.code, 'SYSTEM_PAYLOAD_INVALID');

  const malformedPatch = await requestJson(baseUrl, 'PATCH', '/api/systems/system-validation', {
    rulesProgram: [{ id: 'action-1', kind: 'unknown', label: 'Broken' }]
  });
  assert.equal(malformedPatch.response.status, 400);
  assert.equal(malformedPatch.body.error.code, 'SYSTEM_PAYLOAD_INVALID');
});
