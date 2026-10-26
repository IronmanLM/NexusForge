import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';

const backendRoot = path.resolve(import.meta.dirname, '..');
const serverFile = path.join(backendRoot, 'src', 'server.js');
const SAFE_ACCESS_SECRET = 'test-access-secret-with-at-least-32-characters';
const SAFE_REFRESH_SECRET = 'test-refresh-secret-with-at-least-32-characters';
const SAFE_ROOT_PASSWORD = 'test-root-password-with-safe-length';
const OLD_ROOT_PASSWORD = 'old-root-password-with-safe-length';
const ROOT_EMAIL = 'root-security-test@example.test';

function createFixture(overrides = {}, state = null) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'nexusforge-production-security-'));
  const dataFile = path.join(dataDir, 'state.json');
  const dotenvFile = path.join(dataDir, '.env.test');
  writeFileSync(dotenvFile, '');
  if (state) {
    writeFileSync(dataFile, JSON.stringify(state));
  }

  const env = {
    NODE_ENV: 'production',
    PORT: '0',
    DOTENV_CONFIG_PATH: dotenvFile,
    CORS_ORIGIN: 'https://example.invalid',
    JWT_SECRET: SAFE_ACCESS_SECRET,
    JWT_REFRESH_SECRET: SAFE_REFRESH_SECRET,
    ROOT_ADMIN_PASSWORD: SAFE_ROOT_PASSWORD,
    ROOT_ADMIN_EMAIL: ROOT_EMAIL,
    DATA_DIR: dataDir,
    DATA_FILE: dataFile,
    DATA_HISTORY_DIR: path.join(dataDir, 'history'),
    DATA_PERSIST_LOG_FILE: path.join(dataDir, 'persist-log.jsonl'),
    RESOURCE_DIR: path.join(dataDir, 'resources'),
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    DISCORD_BOT_SHARED_SECRET: '',
    DISCORD_OAUTH_CLIENT_ID: '',
    DISCORD_OAUTH_CLIENT_SECRET: '',
    BACKUP_TRIGGER_SECRET: '',
    ...overrides
  };

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) {
      delete env[name];
    }
  }

  return {
    dataDir,
    env,
    cleanup: () => rmSync(dataDir, { recursive: true, force: true })
  };
}

function runRejectedStartup(overrides = {}, state = null) {
  const fixture = createFixture(overrides, state);
  try {
    return spawnSync(process.execPath, ['src/server.js'], {
      cwd: backendRoot,
      env: fixture.env,
      encoding: 'utf8',
      timeout: 5_000
    });
  } finally {
    fixture.cleanup();
  }
}

function assertRejected(result, expectedNames) {
  assert.notEqual(result.status, 0, 'secured startup unexpectedly succeeded');
  assert.equal(result.error, undefined, result.error?.message);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /runtime security configuration missing or unsafe/);
  for (const name of expectedNames) {
    assert.match(output, new RegExp(name));
  }
}

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

async function stopChild(child, exitPromise) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
  }
  const stopped = await Promise.race([
    exitPromise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2_000))
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exitPromise;
  }
}

function buildPersistedRootState() {
  const now = new Date().toISOString();
  const root = {
    id: 'user-admin-root',
    firstName: 'Root',
    lastName: 'Admin',
    nickname: 'root_security_test',
    displayName: 'root_security_test (Root Admin)',
    email: ROOT_EMAIL,
    passwordHash: bcrypt.hashSync(OLD_ROOT_PASSWORD, 4),
    roles: ['admin', 'gm', 'player'],
    isEmailVerified: true,
    approvalStatus: 'approved',
    isProtectedRootAdmin: true,
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
    users: [root],
    usersByEmail: [[root.email, root.id]],
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

test('secured startup rejects missing JWT secrets outside development', () => {
  for (const nodeEnv of ['production', 'staging', 'test']) {
    const result = runRejectedStartup({
      NODE_ENV: nodeEnv,
      JWT_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined
    });
    assertRejected(result, ['JWT_SECRET', 'JWT_REFRESH_SECRET']);
  }
});

test('production startup rejects documented and legacy JWT defaults', () => {
  for (const [accessSecret, refreshSecret] of [
    ['change-me-access-secret', 'change-me-refresh-secret'],
    ['dev-access-secret', 'dev-refresh-secret']
  ]) {
    const result = runRejectedStartup({
      JWT_SECRET: accessSecret,
      JWT_REFRESH_SECRET: refreshSecret
    });
    assertRejected(result, ['JWT_SECRET', 'JWT_REFRESH_SECRET']);
  }
});

test('production startup rejects short or identical JWT secrets', () => {
  const short = runRejectedStartup({
    JWT_SECRET: 'short-access',
    JWT_REFRESH_SECRET: 'short-refresh'
  });
  assertRejected(short, ['JWT_SECRET', 'JWT_REFRESH_SECRET']);

  const identical = runRejectedStartup({
    JWT_SECRET: SAFE_ACCESS_SECRET,
    JWT_REFRESH_SECRET: SAFE_ACCESS_SECRET
  });
  assertRejected(identical, ['JWT_SECRET/JWT_REFRESH_SECRET must differ']);
});

test('production startup rejects every wildcard CORS configuration', () => {
  for (const corsOrigin of ['*', 'https://example.invalid,*', '*,https://example.invalid']) {
    const result = runRejectedStartup({ CORS_ORIGIN: corsOrigin });
    assertRejected(result, ['CORS_ORIGIN']);
  }
});

test('production startup requires a strong root password even with persisted root state', () => {
  const persistedState = buildPersistedRootState();

  const missing = runRejectedStartup({ ROOT_ADMIN_PASSWORD: undefined }, persistedState);
  assertRejected(missing, ['ROOT_ADMIN_PASSWORD']);

  const placeholder = runRejectedStartup(
    { ROOT_ADMIN_PASSWORD: 'change-me-root-admin-password' },
    persistedState
  );
  assertRejected(placeholder, ['ROOT_ADMIN_PASSWORD']);

  const short = runRejectedStartup({ ROOT_ADMIN_PASSWORD: 'too-short' }, persistedState);
  assertRejected(short, ['ROOT_ADMIN_PASSWORD']);
});

test('secured non-development startup rotates the persisted root password', async () => {
  for (const nodeEnv of ['production', 'staging', 'test']) {
    const port = await getFreePort();
    const fixture = createFixture(
      { NODE_ENV: nodeEnv, PORT: String(port) },
      buildPersistedRootState()
    );
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: backendRoot,
      env: fixture.env,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const exitPromise = new Promise((resolve) => {
      child.once('error', resolve);
      child.once('exit', resolve);
    });

    try {
      let healthy = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`);
          if (response.ok) {
            healthy = true;
            break;
          }
        } catch {
          // Retry until the bounded readiness deadline.
        }
        if (child.exitCode !== null || child.signalCode !== null) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(healthy, true, `secured ${nodeEnv} startup failed: ${stderr}`);

      const login = async (password) => fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ROOT_EMAIL, password })
      });
      assert.equal((await login(SAFE_ROOT_PASSWORD)).status, 200);
      assert.equal((await login(OLD_ROOT_PASSWORD)).status, 401);
    } finally {
      await stopChild(child, exitPromise);
      fixture.cleanup();
    }
  }
});

test('runtime source contains no named credential fallback constants', () => {
  const source = readFileSync(serverFile, 'utf8');
  assert.doesNotMatch(source, /DEFAULT_JWT_SECRET/);
  assert.doesNotMatch(source, /DEFAULT_JWT_REFRESH_SECRET/);
  assert.doesNotMatch(source, /DEFAULT_ROOT_ADMIN_PASSWORD/);
});
