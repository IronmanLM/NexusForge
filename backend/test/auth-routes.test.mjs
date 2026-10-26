import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';

const TEST_EMAIL = 'approved@example.test';
const TEST_PASSWORD = 'CorrectHorse123';

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

async function buildState() {
  const now = new Date().toISOString();
  const user = {
    id: 'user-auth-test',
    firstName: 'Approved',
    lastName: 'Player',
    nickname: 'approved_player',
    displayName: 'approved_player (Approved Player)',
    email: TEST_EMAIL,
    passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    roles: ['player'],
    isEmailVerified: true,
    approvalStatus: 'approved',
    isProtectedRootAdmin: false,
    isActive: true,
    totpEnabled: false,
    totpSecret: null,
    pendingTotpSecret: null,
    failedLoginCount: 0,
    lockoutLevel: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now
  };

  return {
    users: [user],
    usersByEmail: [[user.email, user.id]],
    sessions: [],
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
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nexusforge-auth-routes-'));
  const dataFile = path.join(dataDir, 'state.json');
  const dotenvFile = path.join(dataDir, '.env.test');
  await writeFile(dataFile, JSON.stringify(await buildState(), null, 2));
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
      JWT_SECRET: 'test-access-secret-for-auth-routes',
      JWT_REFRESH_SECRET: 'test-refresh-secret-for-auth-routes',
      ROOT_ADMIN_EMAIL: 'root-auth-test@example.test',
      ROOT_ADMIN_PASSWORD: 'RootPassword123',
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

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { response, body: await response.json() };
}

test('auth login rejects invalid credentials and returns tokens for an approved user', async (t) => {
  const baseUrl = await startBackend(t);

  const rejected = await postJson(baseUrl, '/api/auth/login', {
    email: TEST_EMAIL,
    password: 'WrongPassword123'
  });
  assert.equal(rejected.response.status, 401);
  assert.equal(rejected.body.error.code, 'INVALID_CREDENTIALS');

  const accepted = await postJson(baseUrl, '/api/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });
  assert.equal(accepted.response.status, 200);
  assert.equal(typeof accepted.body.token, 'string');
  assert.equal(typeof accepted.body.refreshToken, 'string');
  assert.equal(accepted.body.user.email, TEST_EMAIL);
  assert.equal('passwordHash' in accepted.body.user, false);
});

test('auth refresh rotates tokens and rejects reuse of the previous refresh token', async (t) => {
  const baseUrl = await startBackend(t);
  const login = await postJson(baseUrl, '/api/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });
  assert.equal(login.response.status, 200);

  const refreshed = await postJson(baseUrl, '/api/auth/refresh', {
    refreshToken: login.body.refreshToken
  });
  assert.equal(refreshed.response.status, 200);
  assert.equal(typeof refreshed.body.token, 'string');
  assert.equal(typeof refreshed.body.refreshToken, 'string');
  assert.notEqual(refreshed.body.refreshToken, login.body.refreshToken);

  const reused = await postJson(baseUrl, '/api/auth/refresh', {
    refreshToken: login.body.refreshToken
  });
  assert.equal(reused.response.status, 401);
  assert.equal(reused.body.error.code, 'REFRESH_TOKEN_REVOKED');
});

test('auth registration validates payloads and creates pending accounts', async (t) => {
  const baseUrl = await startBackend(t);

  const invalid = await postJson(baseUrl, '/api/auth/register', {
    firstName: 'Test',
    lastName: 'Player',
    nickname: 'test_player',
    email: 'not-an-email',
    password: 'weak'
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_EMAIL');

  const created = await postJson(baseUrl, '/api/auth/register', {
    firstName: 'Test',
    lastName: 'Player',
    nickname: 'test_player',
    email: 'new-player@example.test',
    password: 'StrongPassword123'
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.status, 'pending_email_verification');
});
