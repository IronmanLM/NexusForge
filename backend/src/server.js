import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import sharp from 'sharp';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import path from 'path';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import {
  convertHtmlToEnrichedSystemDraft as convertHtmlToEnrichedSystemDraftShared,
  convertHtmlToSystemDraft as convertHtmlToSystemDraftShared
} from '../../scripts/system-tools/htmlDraftConverter.mjs';

const app = express();
app.set('trust proxy', 1);

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT || 4000);
const DEFAULT_CORS_ORIGIN = '*';
const DEFAULT_JWT_SECRET = 'dev-access-secret';
const DEFAULT_JWT_REFRESH_SECRET = 'dev-refresh-secret';
const DEFAULT_ROOT_ADMIN_PASSWORD = 'ZOcDJyuTEjSIA8';
const CORS_ORIGIN = process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN;
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || DEFAULT_JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://nexusforge.en-ligne.fr';
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.nexusforge.en-ligne.fr';
const DISCORD_BOT_SHARED_SECRET = String(process.env.DISCORD_BOT_SHARED_SECRET || '').trim();
const BACKUP_TRIGGER_SECRET = String(process.env.BACKUP_TRIGGER_SECRET || '').trim();
const BACKUP_REMOTE_HOST = String(process.env.BACKUP_REMOTE_HOST || 'fremaux.biz').trim();
const BACKUP_REMOTE_USER = String(process.env.BACKUP_REMOTE_USER || 'root').trim();
const BACKUP_REMOTE_DIR = String(process.env.BACKUP_REMOTE_DIR || '/mnt/kraken/Backups/nexusforge_backups').trim();
const BACKUP_SSH_KEY = String(process.env.BACKUP_SSH_KEY || path.join(process.env.HOME || '', '.ssh', 'id_rsa_codex')).trim();
const DISCORD_OAUTH_CLIENT_ID = String(process.env.DISCORD_OAUTH_CLIENT_ID || '').trim();
const DISCORD_OAUTH_CLIENT_SECRET = String(process.env.DISCORD_OAUTH_CLIENT_SECRET || '').trim();
const DISCORD_OAUTH_REDIRECT_URI = String(process.env.DISCORD_OAUTH_REDIRECT_URI || `${APP_BASE_URL.replace(/\/$/, '')}/auth/discord/callback`).trim();

const ROOT_ADMIN_FIRST_NAME = process.env.ROOT_ADMIN_FIRST_NAME || 'Mikael';
const ROOT_ADMIN_LAST_NAME = process.env.ROOT_ADMIN_LAST_NAME || 'Frémaux';
const ROOT_ADMIN_NICKNAME = process.env.ROOT_ADMIN_NICKNAME || 'IronmanLM';
const ROOT_ADMIN_EMAIL = (process.env.ROOT_ADMIN_EMAIL || 'ironmanlm@en-ligne.fr').toLowerCase();
const ROOT_ADMIN_PASSWORD = process.env.ROOT_ADMIN_PASSWORD || DEFAULT_ROOT_ADMIN_PASSWORD;
const ROOT_ADMIN_TOTP_SECRET = String(process.env.ROOT_ADMIN_TOTP_SECRET || '').trim().replace(/\s+/g, '').toUpperCase();

const EMAIL_TOKEN_TTL_MS = Number(process.env.EMAIL_TOKEN_TTL_MS || 24 * 60 * 60 * 1000);
const RESET_TOKEN_TTL_MS = Number(process.env.RESET_TOKEN_TTL_MS || 60 * 60 * 1000);
const TWO_FACTOR_CHALLENGE_TTL_MS = Number(process.env.TWO_FACTOR_CHALLENGE_TTL_MS || 5 * 60 * 1000);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, 'state.json');
const DATA_HISTORY_DIR = process.env.DATA_HISTORY_DIR || path.join(DATA_DIR, 'history');
const DATA_HISTORY_MAX_FILES = Number(process.env.DATA_HISTORY_MAX_FILES || 120);
const DATA_HISTORY_MIN_INTERVAL_MS = Number(process.env.DATA_HISTORY_MIN_INTERVAL_MS || 10 * 60 * 1000);
const DATA_PERSIST_LOG_FILE = process.env.DATA_PERSIST_LOG_FILE || path.join(DATA_DIR, 'persist-log.jsonl');
const RESOURCE_DIR = process.env.RESOURCE_DIR || path.join(DATA_DIR, 'resources');

const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_FAILED_ATTEMPTS || 5);
const LOCKOUT_STEPS_MINUTES = [15, 30, 60];
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX_LOGIN = Number(process.env.AUTH_RATE_LIMIT_MAX_LOGIN || 8);
const AUTH_RATE_LIMIT_MAX_REGISTER = Number(process.env.AUTH_RATE_LIMIT_MAX_REGISTER || 4);
const AUTH_RATE_LIMIT_MAX_RECOVERY = Number(process.env.AUTH_RATE_LIMIT_MAX_RECOVERY || 5);
const GENERIC_SESSION_SETTINGS = {
  allowPlayerToEditCharacterOffline: true,
  allowPlayerToPlayerChat: true,
  allowPlayerToPlayerDocuments: true,
  silenceMode: 'off',
  alertBannerSystemMessageTypes: ['combat_start', 'turn', 'combat_end', 'roll']
};

const authRateLimitStore = new Map();

function assertProductionSecurityConfig() {
  if (NODE_ENV !== 'production') {
    return;
  }

  const missing = [];
  if (!CORS_ORIGIN || CORS_ORIGIN === DEFAULT_CORS_ORIGIN) {
    missing.push('CORS_ORIGIN');
  }
  if (!JWT_SECRET || JWT_SECRET === DEFAULT_JWT_SECRET) {
    missing.push('JWT_SECRET');
  }
  if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET === DEFAULT_JWT_REFRESH_SECRET) {
    missing.push('JWT_REFRESH_SECRET');
  }
  if (missing.length > 0) {
    throw new Error(`[nexusforge-backend] production security configuration missing or unsafe: ${missing.join(', ')}`);
  }
}

assertProductionSecurityConfig();

function parseCorsOrigins(rawValue) {
  const configured = String(rawValue || '*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (configured.includes('*')) {
    return '*';
  }

  const mobileOrigins = ['http://localhost', 'https://localhost', 'capacitor://localhost', 'ionic://localhost'];
  return Array.from(new Set([...configured, ...mobileOrigins]));
}

const ALLOWED_CORS_ORIGINS = parseCorsOrigins(CORS_ORIGIN);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_CORS_ORIGINS === '*') {
        callback(null, true);
        return;
      }
      callback(null, ALLOWED_CORS_ORIGINS.includes(origin));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '15mb' }));

const refreshTokens = new Set();
const emailVerificationTokens = new Map();
const passwordResetTokens = new Map();
const twoFactorChallenges = new Map();
const discordOauthStates = new Map();

const users = new Map();
const usersByEmail = new Map();
const sessions = new Map();
const systems = new Map();
const characters = new Map();
const notes = new Map();
const messages = new Map();
const resources = new Map();
const resourceFolders = new Map();
const screenTemplates = new Map();
const homeNews = new Map();
const announcements = new Map();
const socialDirectMessages = new Map();
const socialLinks = new Map();
const socialReports = new Map();
const adminAuditEvents = [];
const discordBotEvents = [];

function migrateLegacyScreenWidget(widget) {
  if (!widget || typeof widget !== 'object') {
    return widget;
  }
  if (widget.type !== 'pdf_viewer' && widget.type !== 'media_viewer') {
    return widget;
  }
  const nextConfig = { ...(widget.config && typeof widget.config === 'object' ? widget.config : {}) };
  if (widget.type === 'pdf_viewer') {
    nextConfig.mode = 'pdf';
    nextConfig.fit = typeof nextConfig.fit === 'string' ? nextConfig.fit : 'contain';
    nextConfig.autoplay = false;
    nextConfig.loop = false;
    nextConfig.showToolbar = typeof nextConfig.showToolbar === 'boolean' ? nextConfig.showToolbar : true;
    nextConfig.channelKey = typeof nextConfig.channelKey === 'string' && nextConfig.channelKey.trim() ? nextConfig.channelKey.trim() : 'primary';
  } else {
    nextConfig.mode = typeof nextConfig.mode === 'string' && nextConfig.mode.trim() ? nextConfig.mode : 'auto';
    nextConfig.fit = typeof nextConfig.fit === 'string' ? nextConfig.fit : 'contain';
    nextConfig.autoplay = typeof nextConfig.autoplay === 'boolean' ? nextConfig.autoplay : false;
    nextConfig.loop = typeof nextConfig.loop === 'boolean' ? nextConfig.loop : false;
    nextConfig.showToolbar = typeof nextConfig.showToolbar === 'boolean' ? nextConfig.showToolbar : true;
    nextConfig.channelKey = typeof nextConfig.channelKey === 'string' && nextConfig.channelKey.trim() ? nextConfig.channelKey.trim() : 'primary';
  }
  return {
    ...widget,
    type: 'screen_viewer',
    config: nextConfig
  };
}

function migrateLegacyScreenTemplate(template) {
  if (!template || typeof template !== 'object' || !Array.isArray(template.sets)) {
    return template;
  }
  let changed = false;
  const nextSets = template.sets.map((set) => {
    if (!set || typeof set !== 'object' || !Array.isArray(set.screens)) {
      return set;
    }
    let setChanged = false;
    const nextScreens = set.screens.map((screen) => {
      if (!screen || typeof screen !== 'object' || !Array.isArray(screen.tabGroups)) {
        return screen;
      }
      let screenChanged = false;
      const nextTabGroups = screen.tabGroups.map((group) => {
        if (!group || typeof group !== 'object' || !Array.isArray(group.widgets)) {
          return group;
        }
        let groupChanged = false;
        const nextWidgets = group.widgets.map((widget) => {
          const nextWidget = migrateLegacyScreenWidget(widget);
          if (nextWidget !== widget) {
            groupChanged = true;
          }
          return nextWidget;
        });
        if (!groupChanged) {
          return group;
        }
        screenChanged = true;
        return {
          ...group,
          widgets: nextWidgets
        };
      });
      if (!screenChanged) {
        return screen;
      }
      setChanged = true;
      return {
        ...screen,
        tabGroups: nextTabGroups
      };
    });
    if (!setChanged) {
      return set;
    }
    changed = true;
    return {
      ...set,
      screens: nextScreens
    };
  });
  if (!changed) {
    return template;
  }
  return {
    ...template,
    sets: nextSets
  };
}

let smtpTransport = null;
let persistTimeout = null;
let hasPendingPersist = false;
let lastPersistReason = null;
let lastPersistAt = null;
let lastPersistHash = null;
let isFlushingForShutdown = false;
let lastHistorySnapshotAtMs = 0;
let startupIntegrityReport = null;

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function sanitizePersistReason(value) {
  return String(value || 'update')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'update';
}

function trimHistorySnapshots() {
  try {
    if (!existsSync(DATA_HISTORY_DIR)) {
      return;
    }
    const snapshots = readdirSync(DATA_HISTORY_DIR)
      .filter((entry) => entry.startsWith('state-') && entry.endsWith('.json'))
      .sort();
    const overflow = snapshots.length - DATA_HISTORY_MAX_FILES;
    if (overflow <= 0) {
      return;
    }
    for (const entry of snapshots.slice(0, overflow)) {
      unlinkSync(path.join(DATA_HISTORY_DIR, entry));
    }
  } catch (error) {
    console.error('[nexusforge-backend] state history trim failed', error);
  }
}

function persistStateHistory(reason = 'update') {
  try {
    if (!existsSync(DATA_FILE)) {
      return;
    }
    const now = nowMs();
    const forceSnapshot = String(reason).startsWith('shutdown-');
    if (!forceSnapshot && lastHistorySnapshotAtMs && now - lastHistorySnapshotAtMs < DATA_HISTORY_MIN_INTERVAL_MS) {
      return;
    }
    mkdirSync(DATA_HISTORY_DIR, { recursive: true });
    const stamp = nowIso().replace(/[:.]/g, '-');
    const fileName = `state-${stamp}-${sanitizePersistReason(reason)}.json`;
    copyFileSync(DATA_FILE, path.join(DATA_HISTORY_DIR, fileName));
    lastHistorySnapshotAtMs = now;
    trimHistorySnapshots();
  } catch (error) {
    console.error('[nexusforge-backend] state history snapshot failed', error);
  }
}

function buildPersistStats(snapshot) {
  return {
    users: Array.isArray(snapshot.users) ? snapshot.users.length : 0,
    sessions: Array.isArray(snapshot.sessions) ? snapshot.sessions.length : 0,
    systems: Array.isArray(snapshot.systems) ? snapshot.systems.length : 0,
    characters: Array.isArray(snapshot.characters) ? snapshot.characters.length : 0,
    notes: Array.isArray(snapshot.notes) ? snapshot.notes.length : 0,
    messages: Array.isArray(snapshot.messages) ? snapshot.messages.length : 0,
    resources: Array.isArray(snapshot.resources) ? snapshot.resources.length : 0,
    resourceFolders: Array.isArray(snapshot.resourceFolders) ? snapshot.resourceFolders.length : 0,
    announcements: Array.isArray(snapshot.announcements) ? snapshot.announcements.length : 0,
    socialLinks: Array.isArray(snapshot.socialLinks) ? snapshot.socialLinks.length : 0,
    socialDirectMessages: Array.isArray(snapshot.socialDirectMessages) ? snapshot.socialDirectMessages.length : 0,
    adminAuditEvents: Array.isArray(snapshot.adminAuditEvents) ? snapshot.adminAuditEvents.length : 0
  };
}

function buildStatsDelta(current = {}, previous = {}) {
  const keys = new Set([...Object.keys(current || {}), ...Object.keys(previous || {})]);
  const delta = {};
  for (const key of keys) {
    const currentValue = Number(current?.[key] || 0);
    const previousValue = Number(previous?.[key] || 0);
    delta[key] = currentValue - previousValue;
  }
  return delta;
}

function hashSerializedState(serializedState) {
  return crypto.createHash('sha256').update(serializedState, 'utf8').digest('hex').slice(0, 16);
}

function readLastPersistLogEntry() {
  try {
    if (!existsSync(DATA_PERSIST_LOG_FILE)) {
      return null;
    }
    const lines = readFileSync(DATA_PERSIST_LOG_FILE, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return null;
    }
    return JSON.parse(lines[lines.length - 1]);
  } catch (error) {
    console.error('[nexusforge-backend] persist log read failed', error);
    return null;
  }
}

function readLatestHistorySnapshotEntry() {
  try {
    if (!existsSync(DATA_HISTORY_DIR)) {
      return null;
    }
    const candidates = readdirSync(DATA_HISTORY_DIR)
      .filter((entry) => entry.startsWith('state-') && entry.endsWith('.json'))
      .sort();
    const latest = candidates.at(-1);
    if (!latest) {
      return null;
    }
    const fullPath = path.join(DATA_HISTORY_DIR, latest);
    const raw = readFileSync(fullPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      file: fullPath,
      fileName: latest,
      hash: hashSerializedState(raw),
      stats: buildPersistStats(parsed)
    };
  } catch (error) {
    console.error('[nexusforge-backend] latest history snapshot read failed', error);
    return null;
  }
}

function evaluateStartupIntegrity(raw, parsed) {
  const loadedStats = buildPersistStats(parsed);
  const loadedHash = hashSerializedState(raw);
  const lastPersistEntry = readLastPersistLogEntry();
  const latestHistoryEntry = readLatestHistorySnapshotEntry();
  const warnings = [];

  const collectRegression = (label, referenceStats) => {
    if (!referenceStats) {
      return;
    }
    const regressedKeys = Object.keys(referenceStats).filter(
      (key) => Number(loadedStats[key] || 0) < Number(referenceStats[key] || 0)
    );
    if (regressedKeys.length === 0) {
      return;
    }
    warnings.push({
      kind: 'regression',
      label,
      regressedKeys,
      delta: buildStatsDelta(loadedStats, referenceStats)
    });
  };

  collectRegression('last-persist-log', lastPersistEntry?.stats);
  collectRegression('latest-history-snapshot', latestHistoryEntry?.stats);

  if (lastPersistEntry?.hash && lastPersistEntry.hash !== loadedHash) {
    warnings.push({
      kind: 'hash-mismatch',
      label: 'last-persist-log',
      expectedHash: lastPersistEntry.hash,
      loadedHash
    });
  }

  return {
    status: warnings.length > 0 ? 'warning' : 'ok',
    checkedAt: nowIso(),
    loaded: {
      file: DATA_FILE,
      hash: loadedHash,
      stats: loadedStats
    },
    references: {
      lastPersistLog: lastPersistEntry
        ? {
            at: lastPersistEntry.at || null,
            reason: lastPersistEntry.reason || null,
            hash: lastPersistEntry.hash || null,
            stats: lastPersistEntry.stats || null
          }
        : null,
      latestHistorySnapshot: latestHistoryEntry
        ? {
            file: latestHistoryEntry.file,
            fileName: latestHistoryEntry.fileName,
            hash: latestHistoryEntry.hash,
            stats: latestHistoryEntry.stats
          }
        : null
    },
    warnings
  };
}

function appendPersistLog(reason, snapshot, serializedState) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const sha = crypto.createHash('sha256').update(serializedState, 'utf8').digest('hex');
    lastPersistHash = sha.slice(0, 16);
    const entry = {
      at: nowIso(),
      reason,
      file: DATA_FILE,
      bytes: Buffer.byteLength(serializedState, 'utf8'),
      hash: lastPersistHash,
      stats: buildPersistStats(snapshot)
    };
    appendFileSync(DATA_PERSIST_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    console.error('[nexusforge-backend] persist audit log failed', error);
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function makeStateToken() {
  return crypto.randomBytes(18).toString('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const MAX_SYSTEM_ROLL_DEFINITIONS = 500;
const MAX_SYSTEM_VIEWS = 100;
const MAX_SYSTEM_NODES = 5000;
const MAX_SYSTEM_CATALOGS = 100;
const MAX_SYSTEM_CATALOG_COLUMNS = 100;
const MAX_SYSTEM_CATALOG_ENTRIES = 10000;
const MAX_SYSTEM_DISCORD_OUTPUTS = 12;
const MAX_SYSTEM_CHARACTER_CREATION_POOLS = 20;
const MAX_SYSTEM_CHARACTER_CREATION_VARIABLES = 50;
const MAX_SYSTEM_CHARACTER_CREATION_STEPS = 100;
const MAX_SYSTEM_CHARACTER_CREATION_OPTIONS = 200;
const MAX_SYSTEM_CHARACTER_CREATION_ALLOCATION_RULES = 200;
const MAX_DISCORD_BOT_EVENTS = 1000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateRollDefinitions(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error('`rollDefinitions` doit être un tableau.');
  }
  if (value.length > MAX_SYSTEM_ROLL_DEFINITIONS) {
    throw new Error(`Trop de définitions de jets (${MAX_SYSTEM_ROLL_DEFINITIONS} max).`);
  }
  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`La définition de jet #${index + 1} doit être un objet.`);
    }
    if (typeof entry.id !== 'string' || typeof entry.label !== 'string' || typeof entry.formula !== 'string') {
      throw new Error(`La définition de jet #${index + 1} est incomplète.`);
    }
  });
  return value;
}

function validateStudioSchemaV2(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error('`studioSchemaV2` doit être un objet.');
  }
  if (!Array.isArray(value.views)) {
    throw new Error('`studioSchemaV2.views` doit être un tableau.');
  }
  if (value.views.length > MAX_SYSTEM_VIEWS) {
    throw new Error(`Trop de vues Studio V2 (${MAX_SYSTEM_VIEWS} max).`);
  }
  const totalNodes = value.views.reduce((count, view, index) => {
    if (!isPlainObject(view)) {
      throw new Error(`La vue Studio V2 #${index + 1} doit être un objet.`);
    }
    if (!Array.isArray(view.nodes)) {
      throw new Error(`La vue Studio V2 #${index + 1} doit contenir un tableau \`nodes\`.`);
    }
    return count + view.nodes.length;
  }, 0);
  if (totalNodes > MAX_SYSTEM_NODES) {
    throw new Error(`Trop de noeuds Studio V2 (${MAX_SYSTEM_NODES} max).`);
  }
  return value;
}

function validateCatalogs(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error('`catalogs` doit être un tableau.');
  }
  if (value.length > MAX_SYSTEM_CATALOGS) {
    throw new Error(`Trop de catalogues (${MAX_SYSTEM_CATALOGS} max).`);
  }
  value.forEach((catalog, catalogIndex) => {
    if (!isPlainObject(catalog)) {
      throw new Error(`Le catalogue #${catalogIndex + 1} doit être un objet.`);
    }
    if (!Array.isArray(catalog.columns) || !Array.isArray(catalog.entries)) {
      throw new Error(`Le catalogue #${catalogIndex + 1} doit contenir \`columns\` et \`entries\`.`);
    }
    if (catalog.columns.length > MAX_SYSTEM_CATALOG_COLUMNS) {
      throw new Error(`Le catalogue #${catalogIndex + 1} dépasse ${MAX_SYSTEM_CATALOG_COLUMNS} colonnes.`);
    }
    if (catalog.entries.length > MAX_SYSTEM_CATALOG_ENTRIES) {
      throw new Error(`Le catalogue #${catalogIndex + 1} dépasse ${MAX_SYSTEM_CATALOG_ENTRIES} entrées.`);
    }
  });
  return value;
}

function validateDiscordConfig(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error('`discordConfig` doit être un objet.');
  }
  if (value.version !== undefined && value.version !== 1) {
    throw new Error('`discordConfig.version` doit valoir 1.');
  }
  if (!Array.isArray(value.outputs)) {
    throw new Error('`discordConfig.outputs` doit être un tableau.');
  }
  if (value.outputs.length > MAX_SYSTEM_DISCORD_OUTPUTS) {
    throw new Error(`Trop de sorties Discord (${MAX_SYSTEM_DISCORD_OUTPUTS} max).`);
  }

  const allowedKeys = new Set(['sheet', 'inventory', 'notes', 'view1', 'view2', 'view3', 'view4', 'view5', 'view6', 'view7', 'view8', 'view9']);
  const allowedFormats = new Set(['text', 'embed']);
  const allowedVisibilities = new Set(['public', 'private']);
  const allowedSourceTypes = new Set(['sheet', 'collection', 'notes', 'view']);
  const seenKeys = new Set();

  value.outputs.forEach((output, index) => {
    if (!isPlainObject(output)) {
      throw new Error(`La sortie Discord #${index + 1} doit être un objet.`);
    }
    if (typeof output.key !== 'string' || !allowedKeys.has(output.key)) {
      throw new Error(`La sortie Discord #${index + 1} doit utiliser une clé normalisée valide.`);
    }
    if (seenKeys.has(output.key)) {
      throw new Error(`La clé Discord \`${output.key}\` est définie plusieurs fois.`);
    }
    seenKeys.add(output.key);
    if (typeof output.label !== 'string' || !output.label.trim()) {
      throw new Error(`La sortie Discord #${index + 1} doit avoir un libellé.`);
    }
    if (typeof output.enabled !== 'boolean') {
      throw new Error(`La sortie Discord #${index + 1} doit définir \`enabled\`.`);
    }
    if (typeof output.template !== 'string') {
      throw new Error(`La sortie Discord #${index + 1} doit définir \`template\`.`);
    }
    if (typeof output.format !== 'string' || !allowedFormats.has(output.format)) {
      throw new Error(`La sortie Discord #${index + 1} doit utiliser un format valide.`);
    }
    if (typeof output.defaultVisibility !== 'string' || !allowedVisibilities.has(output.defaultVisibility)) {
      throw new Error(`La sortie Discord #${index + 1} doit définir une visibilité par défaut valide.`);
    }
    if (
      !Array.isArray(output.allowedVisibilities) ||
      output.allowedVisibilities.length === 0 ||
      output.allowedVisibilities.some((entry) => typeof entry !== 'string' || !allowedVisibilities.has(entry))
    ) {
      throw new Error(`La sortie Discord #${index + 1} doit définir \`allowedVisibilities\`.`);
    }
    if (typeof output.sourceType !== 'string' || !allowedSourceTypes.has(output.sourceType)) {
      throw new Error(`La sortie Discord #${index + 1} doit définir un \`sourceType\` valide.`);
    }
    if (output.commandName !== undefined && typeof output.commandName !== 'string') {
      throw new Error(`La sortie Discord #${index + 1} doit utiliser une commande courte en chaîne si elle est définie.`);
    }
    if (output.sourceRef !== undefined && typeof output.sourceRef !== 'string') {
      throw new Error(`La sortie Discord #${index + 1} doit utiliser une référence source en chaîne.`);
    }
    if (output.itemTemplate !== undefined && typeof output.itemTemplate !== 'string') {
      throw new Error(`La sortie Discord #${index + 1} doit utiliser \`itemTemplate\` en chaîne.`);
    }
    if (output.emptyTemplate !== undefined && typeof output.emptyTemplate !== 'string') {
      throw new Error(`La sortie Discord #${index + 1} doit utiliser \`emptyTemplate\` en chaîne.`);
    }
    if (
      output.maxItems !== undefined &&
      output.maxItems !== null &&
      (!Number.isFinite(output.maxItems) || output.maxItems < 0 || output.maxItems > 100)
    ) {
      throw new Error(`La sortie Discord #${index + 1} dépasse la limite de \`maxItems\` autorisée.`);
    }
  });

  return value;
}

function validateCharacterCreationConfig(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error('`characterCreationConfig` doit être un objet.');
  }
  if (typeof value.enabled !== 'boolean') {
    throw new Error('`characterCreationConfig.enabled` doit être un booléen.');
  }
  if (!Array.isArray(value.pools)) {
    throw new Error('`characterCreationConfig.pools` doit être un tableau.');
  }
  if (!Array.isArray(value.variables)) {
    throw new Error('`characterCreationConfig.variables` doit être un tableau.');
  }
  if (value.pools.length > MAX_SYSTEM_CHARACTER_CREATION_POOLS) {
    throw new Error(`Trop de réserves de création (${MAX_SYSTEM_CHARACTER_CREATION_POOLS} max).`);
  }
  if (value.variables.length > MAX_SYSTEM_CHARACTER_CREATION_VARIABLES) {
    throw new Error(`Trop de variables temporaires (${MAX_SYSTEM_CHARACTER_CREATION_VARIABLES} max).`);
  }

  value.pools.forEach((pool, index) => {
    if (!isPlainObject(pool)) {
      throw new Error(`La réserve de création #${index + 1} doit être un objet.`);
    }
    if (typeof pool.id !== 'string' || !pool.id.trim()) {
      throw new Error(`La réserve de création #${index + 1} doit avoir un id.`);
    }
    if (typeof pool.key !== 'string' || !pool.key.trim()) {
      throw new Error(`La réserve de création #${index + 1} doit avoir une clé.`);
    }
    if (typeof pool.label !== 'string' || !pool.label.trim()) {
      throw new Error(`La réserve de création #${index + 1} doit avoir un libellé.`);
    }
    if (typeof pool.initialValueFormula !== 'string') {
      throw new Error(`La réserve de création #${index + 1} doit définir une formule initiale.`);
    }
  });

  value.variables.forEach((variable, index) => {
    if (!isPlainObject(variable)) {
      throw new Error(`La variable temporaire #${index + 1} doit être un objet.`);
    }
    if (typeof variable.id !== 'string' || !variable.id.trim()) {
      throw new Error(`La variable temporaire #${index + 1} doit avoir un id.`);
    }
    if (typeof variable.key !== 'string' || !variable.key.trim()) {
      throw new Error(`La variable temporaire #${index + 1} doit avoir une clé.`);
    }
    if (typeof variable.label !== 'string' || !variable.label.trim()) {
      throw new Error(`La variable temporaire #${index + 1} doit avoir un libellé.`);
    }
    if (typeof variable.initialValueFormula !== 'string') {
      throw new Error(`La variable temporaire #${index + 1} doit définir une formule initiale.`);
    }
    if (variable.description !== undefined && typeof variable.description !== 'string') {
      throw new Error(`La variable temporaire #${index + 1} doit utiliser \`description\` en chaîne.`);
    }
  });

  function validateBindingTarget(target, path, options = {}) {
    const { allowEmptyKey = false } = options;
    if (!isPlainObject(target)) {
      throw new Error(`${path} doit être un objet.`);
    }
    if (typeof target.scope !== 'string' || !['sheet', 'creation', 'pool'].includes(target.scope)) {
      throw new Error(`${path} doit définir un scope valide.`);
    }
    if (target.viewRef !== undefined && typeof target.viewRef !== 'string') {
      throw new Error(`${path}.viewRef doit être une chaîne.`);
    }
    if (typeof target.key !== 'string' || (!allowEmptyKey && !target.key.trim())) {
      throw new Error(`${path}.key doit être une chaîne non vide.`);
    }
  }

  function validateScenarioBlock(block, path) {
    if (!isPlainObject(block)) {
      throw new Error(`${path} doit être un objet.`);
    }
    if (typeof block.id !== 'string' || !block.id.trim()) {
      throw new Error(`${path}.id est requis.`);
    }
    if (typeof block.label !== 'string' || !block.label.trim()) {
      throw new Error(`${path}.label est requis.`);
    }
    if (typeof block.enabled !== 'boolean') {
      throw new Error(`${path}.enabled doit être un booléen.`);
    }
    if (
      typeof block.kind !== 'string' ||
      !['group', 'message', 'question_text', 'question_textarea', 'question_number', 'question_choice', 'question_catalog', 'allocation', 'set_value', 'copy_value', 'adjust_value', 'roll', 'if', 'loop', 'while', 'next_stage', 'stop'].includes(block.kind)
    ) {
      throw new Error(`${path}.kind est invalide.`);
    }
    if (block.description !== undefined && typeof block.description !== 'string') {
      throw new Error(`${path}.description doit être une chaîne.`);
    }
    if (block.kind === 'group') {
      if (!Array.isArray(block.blocks)) {
        throw new Error(`${path}.blocks doit être un tableau.`);
      }
      block.blocks.forEach((child, index) => validateScenarioBlock(child, `${path}.blocks[${index}]`));
      return;
    }
    if (block.kind === 'message') {
      if (typeof block.content !== 'string') {
        throw new Error(`${path}.content doit être une chaîne.`);
      }
      if (block.tone !== undefined && (typeof block.tone !== 'string' || !['info', 'warning', 'success'].includes(block.tone))) {
        throw new Error(`${path}.tone est invalide.`);
      }
      return;
    }
    if (['question_text', 'question_textarea', 'question_number'].includes(block.kind)) {
      if (typeof block.prompt !== 'string') {
        throw new Error(`${path}.prompt doit être une chaîne.`);
      }
      validateBindingTarget(block.target, `${path}.target`, { allowEmptyKey: true });
      if (block.defaultValueFormula !== undefined && typeof block.defaultValueFormula !== 'string') {
        throw new Error(`${path}.defaultValueFormula doit être une chaîne.`);
      }
      if (block.minFormula !== undefined && typeof block.minFormula !== 'string') {
        throw new Error(`${path}.minFormula doit être une chaîne.`);
      }
      if (block.maxFormula !== undefined && typeof block.maxFormula !== 'string') {
        throw new Error(`${path}.maxFormula doit être une chaîne.`);
      }
      if (block.required !== undefined && typeof block.required !== 'boolean') {
        throw new Error(`${path}.required doit être un booléen.`);
      }
      return;
    }
    if (block.kind === 'question_choice') {
      if (typeof block.prompt !== 'string') {
        throw new Error(`${path}.prompt doit être une chaîne.`);
      }
      validateBindingTarget(block.target, `${path}.target`, { allowEmptyKey: true });
      if (!Array.isArray(block.options)) {
        throw new Error(`${path}.options doit être un tableau.`);
      }
      if (block.options.length > MAX_SYSTEM_CHARACTER_CREATION_OPTIONS) {
        throw new Error(`${path}.options dépasse ${MAX_SYSTEM_CHARACTER_CREATION_OPTIONS} entrées.`);
      }
      block.options.forEach((option, index) => {
        if (!isPlainObject(option) || typeof option.id !== 'string' || typeof option.value !== 'string' || typeof option.label !== 'string') {
          throw new Error(`${path}.options[${index}] est invalide.`);
        }
      });
      if (block.allowFreeText !== undefined && typeof block.allowFreeText !== 'boolean') {
        throw new Error(`${path}.allowFreeText doit être un booléen.`);
      }
      return;
    }
    if (block.kind === 'question_catalog') {
      if (typeof block.prompt !== 'string') {
        throw new Error(`${path}.prompt doit être une chaîne.`);
      }
      validateBindingTarget(block.target, `${path}.target`, { allowEmptyKey: true });
      if (typeof block.catalogKey !== 'string') {
        throw new Error(`${path}.catalogKey doit être une chaîne.`);
      }
      if (block.valueColumnKey !== undefined && typeof block.valueColumnKey !== 'string') {
        throw new Error(`${path}.valueColumnKey doit être une chaîne.`);
      }
      if (block.labelColumnKey !== undefined && typeof block.labelColumnKey !== 'string') {
        throw new Error(`${path}.labelColumnKey doit être une chaîne.`);
      }
      if (block.costColumnKey !== undefined && typeof block.costColumnKey !== 'string') {
        throw new Error(`${path}.costColumnKey doit être une chaîne.`);
      }
      if (block.costTarget !== undefined) {
        validateBindingTarget(block.costTarget, `${path}.costTarget`, { allowEmptyKey: true });
        if (block.costTarget.scope === 'sheet') {
          throw new Error(`${path}.costTarget ne peut pas viser la fiche.`);
        }
      }
      if (block.mappings !== undefined) {
        if (!Array.isArray(block.mappings)) {
          throw new Error(`${path}.mappings doit être un tableau.`);
        }
        block.mappings.forEach((mapping, index) => {
          if (!isPlainObject(mapping)) {
            throw new Error(`${path}.mappings[${index}] doit être un objet.`);
          }
          if (typeof mapping.id !== 'string' || !mapping.id.trim()) {
            throw new Error(`${path}.mappings[${index}].id est requis.`);
          }
          validateBindingTarget(mapping.target, `${path}.mappings[${index}].target`, { allowEmptyKey: true });
          if (mapping.valueColumnKey !== undefined && typeof mapping.valueColumnKey !== 'string') {
            throw new Error(`${path}.mappings[${index}].valueColumnKey doit être une chaîne.`);
          }
        });
      }
      if (typeof block.costColumnKey === 'string' && block.costColumnKey.trim()) {
        if (!block.costTarget || typeof block.costTarget.key !== 'string' || !block.costTarget.key.trim()) {
          throw new Error(`${path}.costTarget est requis quand un coût catalogue est défini.`);
        }
      }
      if (block.allowFreeText !== undefined && typeof block.allowFreeText !== 'boolean') {
        throw new Error(`${path}.allowFreeText doit être un booléen.`);
      }
      return;
    }
    if (block.kind === 'allocation') {
      if (typeof block.prompt !== 'string') {
        throw new Error(`${path}.prompt doit être une chaîne.`);
      }
      if (typeof block.poolKey !== 'string') {
        throw new Error(`${path}.poolKey doit être une chaîne.`);
      }
      if (!Array.isArray(block.targets)) {
        throw new Error(`${path}.targets doit être un tableau.`);
      }
      if (block.targets.length > MAX_SYSTEM_CHARACTER_CREATION_ALLOCATION_RULES) {
        throw new Error(`${path}.targets dépasse ${MAX_SYSTEM_CHARACTER_CREATION_ALLOCATION_RULES} entrées.`);
      }
      block.targets.forEach((target, index) => {
        if (!isPlainObject(target)) {
          throw new Error(`${path}.targets[${index}] doit être un objet.`);
        }
        if (typeof target.id !== 'string' || !target.id.trim()) {
          throw new Error(`${path}.targets[${index}].id est requis.`);
        }
        if (typeof target.label !== 'string') {
          throw new Error(`${path}.targets[${index}].label doit être une chaîne.`);
        }
        validateBindingTarget(target.target, `${path}.targets[${index}].target`);
        if (target.step !== undefined && target.step !== null && (!Number.isFinite(target.step) || target.step <= 0)) {
          throw new Error(`${path}.targets[${index}].step doit être positif.`);
        }
        if (typeof target.costFormula !== 'string') {
          throw new Error(`${path}.targets[${index}].costFormula doit être une chaîne.`);
        }
        if (target.minFormula !== undefined && typeof target.minFormula !== 'string') {
          throw new Error(`${path}.targets[${index}].minFormula doit être une chaîne.`);
        }
        if (target.maxFormula !== undefined && typeof target.maxFormula !== 'string') {
          throw new Error(`${path}.targets[${index}].maxFormula doit être une chaîne.`);
        }
        if (target.condition !== undefined && typeof target.condition !== 'string') {
          throw new Error(`${path}.targets[${index}].condition doit être une chaîne.`);
        }
        if (target.helperText !== undefined && typeof target.helperText !== 'string') {
          throw new Error(`${path}.targets[${index}].helperText doit être une chaîne.`);
        }
      });
      if (block.viewTargets !== undefined) {
        if (!Array.isArray(block.viewTargets)) {
          throw new Error(`${path}.viewTargets doit être un tableau.`);
        }
        block.viewTargets.forEach((target, index) => {
          if (!isPlainObject(target)) {
            throw new Error(`${path}.viewTargets[${index}] doit être un objet.`);
          }
          if (typeof target.id !== 'string' || !target.id.trim()) {
            throw new Error(`${path}.viewTargets[${index}].id est requis.`);
          }
          if (typeof target.viewRef !== 'string') {
            throw new Error(`${path}.viewTargets[${index}].viewRef doit être une chaîne.`);
          }
          if (typeof target.label !== 'string') {
            throw new Error(`${path}.viewTargets[${index}].label doit être une chaîne.`);
          }
          if (typeof target.costFormula !== 'string') {
            throw new Error(`${path}.viewTargets[${index}].costFormula doit être une chaîne.`);
          }
          if (target.minFormula !== undefined && typeof target.minFormula !== 'string') {
            throw new Error(`${path}.viewTargets[${index}].minFormula doit être une chaîne.`);
          }
          if (target.maxFormula !== undefined && typeof target.maxFormula !== 'string') {
            throw new Error(`${path}.viewTargets[${index}].maxFormula doit être une chaîne.`);
          }
          if (target.condition !== undefined && typeof target.condition !== 'string') {
            throw new Error(`${path}.viewTargets[${index}].condition doit être une chaîne.`);
          }
          if (target.helperText !== undefined && typeof target.helperText !== 'string') {
            throw new Error(`${path}.viewTargets[${index}].helperText doit être une chaîne.`);
          }
          if (target.hiddenFieldKeys !== undefined) {
            if (!Array.isArray(target.hiddenFieldKeys) || target.hiddenFieldKeys.some((key) => typeof key !== 'string')) {
              throw new Error(`${path}.viewTargets[${index}].hiddenFieldKeys doit être un tableau de chaînes.`);
            }
          }
          if (target.lockedFieldKeys !== undefined) {
            if (!Array.isArray(target.lockedFieldKeys) || target.lockedFieldKeys.some((key) => typeof key !== 'string')) {
              throw new Error(`${path}.viewTargets[${index}].lockedFieldKeys doit être un tableau de chaînes.`);
            }
          }
        });
      }
      return;
    }
    if (block.kind === 'set_value') {
      validateBindingTarget(block.target, `${path}.target`, { allowEmptyKey: true });
      if (typeof block.valueFormula !== 'string') {
        throw new Error(`${path}.valueFormula doit être une chaîne.`);
      }
      return;
    }
    if (block.kind === 'copy_value') {
      validateBindingTarget(block.target, `${path}.target`, { allowEmptyKey: true });
      if (typeof block.sourceFormula !== 'string') {
        throw new Error(`${path}.sourceFormula doit être une chaîne.`);
      }
      return;
    }
    if (block.kind === 'adjust_value') {
      validateBindingTarget(block.target, `${path}.target`, { allowEmptyKey: true });
      if (typeof block.valueFormula !== 'string') {
        throw new Error(`${path}.valueFormula doit être une chaîne.`);
      }
      if (typeof block.operator !== 'string' || !['add', 'subtract', 'multiply', 'divide', 'set'].includes(block.operator)) {
        throw new Error(`${path}.operator est invalide.`);
      }
      return;
    }
    if (block.kind === 'roll') {
      if (typeof block.prompt !== 'string') {
        throw new Error(`${path}.prompt doit être une chaîne.`);
      }
      validateBindingTarget(block.target, `${path}.target`, { allowEmptyKey: true });
      if (typeof block.diceFormula !== 'string') {
        throw new Error(`${path}.diceFormula doit être une chaîne.`);
      }
      if (block.allowReroll !== undefined && typeof block.allowReroll !== 'boolean') {
        throw new Error(`${path}.allowReroll doit être un booléen.`);
      }
      return;
    }
    if (block.kind === 'loop') {
      if (typeof block.iterationsFormula !== 'string') {
        throw new Error(`${path}.iterationsFormula doit être une chaîne.`);
      }
      if (!Array.isArray(block.blocks)) {
        throw new Error(`${path}.blocks doit être un tableau.`);
      }
      block.blocks.forEach((child, index) => validateScenarioBlock(child, `${path}.blocks[${index}]`));
      return;
    }
    if (block.kind === 'while') {
      if (typeof block.condition !== 'string') {
        throw new Error(`${path}.condition doit être une chaîne.`);
      }
      if (block.maxIterationsFormula !== undefined && typeof block.maxIterationsFormula !== 'string') {
        throw new Error(`${path}.maxIterationsFormula doit être une chaîne.`);
      }
      if (!Array.isArray(block.blocks)) {
        throw new Error(`${path}.blocks doit être un tableau.`);
      }
      block.blocks.forEach((child, index) => validateScenarioBlock(child, `${path}.blocks[${index}]`));
      return;
    }
    if (block.kind === 'next_stage' || block.kind === 'stop') {
      if (block.reason !== undefined && typeof block.reason !== 'string') {
        throw new Error(`${path}.reason doit être une chaîne.`);
      }
      return;
    }
    if (typeof block.condition !== 'string') {
      throw new Error(`${path}.condition doit être une chaîne.`);
    }
    if (!Array.isArray(block.thenBlocks) || !Array.isArray(block.elseBlocks)) {
      throw new Error(`${path} doit définir thenBlocks et elseBlocks.`);
    }
    if (block.elseIfBranches !== undefined) {
      if (!Array.isArray(block.elseIfBranches)) {
        throw new Error(`${path}.elseIfBranches doit être un tableau.`);
      }
      block.elseIfBranches.forEach((branch, branchIndex) => {
        if (!isPlainObject(branch)) {
          throw new Error(`${path}.elseIfBranches[${branchIndex}] doit être un objet.`);
        }
        if (typeof branch.id !== 'string' || !branch.id.trim()) {
          throw new Error(`${path}.elseIfBranches[${branchIndex}].id est requis.`);
        }
        if (typeof branch.label !== 'string') {
          throw new Error(`${path}.elseIfBranches[${branchIndex}].label doit être une chaîne.`);
        }
        if (typeof branch.condition !== 'string') {
          throw new Error(`${path}.elseIfBranches[${branchIndex}].condition doit être une chaîne.`);
        }
        if (!Array.isArray(branch.blocks)) {
          throw new Error(`${path}.elseIfBranches[${branchIndex}].blocks doit être un tableau.`);
        }
        branch.blocks.forEach((child, index) => validateScenarioBlock(child, `${path}.elseIfBranches[${branchIndex}].blocks[${index}]`));
      });
    }
    block.thenBlocks.forEach((child, index) => validateScenarioBlock(child, `${path}.thenBlocks[${index}]`));
    block.elseBlocks.forEach((child, index) => validateScenarioBlock(child, `${path}.elseBlocks[${index}]`));
  }

  const isV2 = value.version === 2 || Array.isArray(value.stages);
  if (isV2) {
    if (!Array.isArray(value.stages)) {
      throw new Error('`characterCreationConfig.stages` doit être un tableau.');
    }
    if (value.stages.length > MAX_SYSTEM_CHARACTER_CREATION_STEPS) {
      throw new Error(`Trop d étapes de création (${MAX_SYSTEM_CHARACTER_CREATION_STEPS} max).`);
    }
    value.stages.forEach((stage, stageIndex) => {
      if (!isPlainObject(stage)) {
        throw new Error(`L étape de création #${stageIndex + 1} doit être un objet.`);
      }
      if (typeof stage.id !== 'string' || !stage.id.trim()) {
        throw new Error(`L étape de création #${stageIndex + 1} doit avoir un id.`);
      }
      if (typeof stage.key !== 'string' || !stage.key.trim()) {
        throw new Error(`L étape de création #${stageIndex + 1} doit avoir une clé.`);
      }
      if (typeof stage.label !== 'string' || !stage.label.trim()) {
        throw new Error(`L étape de création #${stageIndex + 1} doit avoir un libellé.`);
      }
      if (typeof stage.enabled !== 'boolean') {
        throw new Error(`L étape de création #${stageIndex + 1} doit définir enabled.`);
      }
      if (stage.description !== undefined && typeof stage.description !== 'string') {
        throw new Error(`L étape de création #${stageIndex + 1} doit utiliser description en chaîne.`);
      }
      if (stage.entryCondition !== undefined && typeof stage.entryCondition !== 'string') {
        throw new Error(`L étape de création #${stageIndex + 1} doit utiliser entryCondition en chaîne.`);
      }
      if (stage.completionCondition !== undefined && typeof stage.completionCondition !== 'string') {
        throw new Error(`L étape de création #${stageIndex + 1} doit utiliser completionCondition en chaîne.`);
      }
      if (!Array.isArray(stage.blocks)) {
        throw new Error(`L étape de création #${stageIndex + 1} doit définir blocks.`);
      }
      stage.blocks.forEach((block, blockIndex) => validateScenarioBlock(block, `L étape de création #${stageIndex + 1}.blocks[${blockIndex}]`));
    });
    return {
      version: 2,
      enabled: value.enabled === true,
      pools: value.pools,
      variables: value.variables,
      stages: value.stages
    };
  }

  if (value.version !== undefined && value.version !== 1) {
    throw new Error('`characterCreationConfig.version` doit valoir 1 ou 2.');
  }
  if (!Array.isArray(value.steps)) {
    throw new Error('`characterCreationConfig.steps` doit être un tableau.');
  }
  if (value.steps.length > MAX_SYSTEM_CHARACTER_CREATION_STEPS) {
    throw new Error(`Trop d étapes de création (${MAX_SYSTEM_CHARACTER_CREATION_STEPS} max).`);
  }

  value.steps.forEach((step, stepIndex) => {
    if (!isPlainObject(step)) {
      throw new Error(`L étape de création #${stepIndex + 1} doit être un objet.`);
    }
    if (typeof step.id !== 'string' || !step.id.trim()) {
      throw new Error(`L étape de création #${stepIndex + 1} doit avoir un id.`);
    }
    if (typeof step.key !== 'string' || !step.key.trim()) {
      throw new Error(`L étape de création #${stepIndex + 1} doit avoir une clé.`);
    }
    if (typeof step.label !== 'string' || !step.label.trim()) {
      throw new Error(`L étape de création #${stepIndex + 1} doit avoir un libellé.`);
    }
    if (typeof step.enabled !== 'boolean') {
      throw new Error(`L étape de création #${stepIndex + 1} doit définir \`enabled\`.`);
    }
    if (
      typeof step.kind !== 'string' ||
      !['text', 'textarea', 'number', 'catalog_select', 'catalog_or_text', 'allocation', 'set_formula', 'roll', 'condition'].includes(step.kind)
    ) {
      throw new Error(`L étape de création #${stepIndex + 1} doit avoir un type valide.`);
    }
    if (typeof step.prompt !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit définir un prompt.`);
    }
    if (step.description !== undefined && typeof step.description !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`description\` en chaîne.`);
    }
    if (step.targetViewRef !== undefined && typeof step.targetViewRef !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`targetViewRef\` en chaîne.`);
    }
    if (step.targetScope !== undefined && (typeof step.targetScope !== 'string' || !['sheet', 'creation'].includes(step.targetScope))) {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser un \`targetScope\` valide.`);
    }
    if (step.targetFieldKey !== undefined && typeof step.targetFieldKey !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`targetFieldKey\` en chaîne.`);
    }
    if (step.valueFormula !== undefined && typeof step.valueFormula !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`valueFormula\` en chaîne.`);
    }
    if (step.allowReroll !== undefined && typeof step.allowReroll !== 'boolean') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`allowReroll\` en booléen.`);
    }
    if (step.condition !== undefined && typeof step.condition !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`condition\` en chaîne.`);
    }
    if (step.catalogKey !== undefined && typeof step.catalogKey !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`catalogKey\` en chaîne.`);
    }
    if (step.allowFreeText !== undefined && typeof step.allowFreeText !== 'boolean') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`allowFreeText\` en booléen.`);
    }
    if (step.nextCondition !== undefined && typeof step.nextCondition !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`nextCondition\` en chaîne.`);
    }
    if (step.helperText !== undefined && typeof step.helperText !== 'string') {
      throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`helperText\` en chaîne.`);
    }
    if (step.options !== undefined) {
      if (!Array.isArray(step.options)) {
        throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`options\` comme tableau.`);
      }
      if (step.options.length > MAX_SYSTEM_CHARACTER_CREATION_OPTIONS) {
        throw new Error(`L étape de création #${stepIndex + 1} dépasse ${MAX_SYSTEM_CHARACTER_CREATION_OPTIONS} options.`);
      }
      step.options.forEach((option, optionIndex) => {
        if (!isPlainObject(option)) {
          throw new Error(`L option #${optionIndex + 1} de l étape #${stepIndex + 1} doit être un objet.`);
        }
        if (typeof option.id !== 'string' || typeof option.value !== 'string' || typeof option.label !== 'string') {
          throw new Error(`L option #${optionIndex + 1} de l étape #${stepIndex + 1} est invalide.`);
        }
      });
    }
    if (step.allocationRules !== undefined) {
      if (!Array.isArray(step.allocationRules)) {
        throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`allocationRules\` comme tableau.`);
      }
      if (step.allocationRules.length > MAX_SYSTEM_CHARACTER_CREATION_ALLOCATION_RULES) {
        throw new Error(`L étape de création #${stepIndex + 1} dépasse ${MAX_SYSTEM_CHARACTER_CREATION_ALLOCATION_RULES} règles d allocation.`);
      }
      step.allocationRules.forEach((rule, ruleIndex) => {
        if (!isPlainObject(rule)) {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} doit être un objet.`);
        }
        if (
          typeof rule.id !== 'string' ||
          typeof rule.label !== 'string' ||
          typeof rule.poolKey !== 'string' ||
          typeof rule.targetFieldKey !== 'string' ||
          typeof rule.costFormula !== 'string'
        ) {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} est invalide.`);
        }
        if (rule.targetScope !== undefined && (typeof rule.targetScope !== 'string' || !['sheet', 'creation'].includes(rule.targetScope))) {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} doit utiliser un \`targetScope\` valide.`);
        }
        if (rule.targetViewRef !== undefined && typeof rule.targetViewRef !== 'string') {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} doit utiliser \`targetViewRef\` en chaîne.`);
        }
        if (rule.step !== undefined && rule.step !== null && (!Number.isFinite(rule.step) || rule.step <= 0)) {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} doit utiliser un \`step\` positif.`);
        }
        if (rule.minFormula !== undefined && typeof rule.minFormula !== 'string') {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} doit utiliser \`minFormula\` en chaîne.`);
        }
        if (rule.maxFormula !== undefined && typeof rule.maxFormula !== 'string') {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} doit utiliser \`maxFormula\` en chaîne.`);
        }
        if (rule.condition !== undefined && typeof rule.condition !== 'string') {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} doit utiliser \`condition\` en chaîne.`);
        }
        if (rule.helperText !== undefined && typeof rule.helperText !== 'string') {
          throw new Error(`La règle d allocation #${ruleIndex + 1} de l étape #${stepIndex + 1} doit utiliser \`helperText\` en chaîne.`);
        }
      });
    }
    if (step.thenActions !== undefined) {
      if (!Array.isArray(step.thenActions)) {
        throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`thenActions\` comme tableau.`);
      }
      step.thenActions.forEach((action, actionIndex) => validateScriptAction(action, `L action ALORS #${actionIndex + 1} de l étape #${stepIndex + 1}`));
    }
    if (step.elseActions !== undefined) {
      if (!Array.isArray(step.elseActions)) {
        throw new Error(`L étape de création #${stepIndex + 1} doit utiliser \`elseActions\` comme tableau.`);
      }
      step.elseActions.forEach((action, actionIndex) => validateScriptAction(action, `L action SINON #${actionIndex + 1} de l étape #${stepIndex + 1}`));
    }
  });

  return {
    version: 1,
    enabled: value.enabled === true,
    pools: value.pools,
    variables: value.variables,
    steps: value.steps
  };
}

function validateRulesPresentation(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error('`rulesPresentation` doit être un objet.');
  }
  return value;
}

function validateStudioTheme(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error('`studioTheme` doit être un objet.');
  }
  return value;
}

const RESOURCE_ALLOWED_TYPES = {
  'image/png': { kind: 'image', extensions: ['.png'], defaultExtension: '.png', maxSizeBytes: 15 * 1024 * 1024 },
  'image/jpeg': { kind: 'image', extensions: ['.jpg', '.jpeg'], defaultExtension: '.jpg', maxSizeBytes: 15 * 1024 * 1024 },
  'image/webp': { kind: 'image', extensions: ['.webp'], defaultExtension: '.webp', maxSizeBytes: 15 * 1024 * 1024 },
  'image/gif': { kind: 'image', extensions: ['.gif'], defaultExtension: '.gif', maxSizeBytes: 20 * 1024 * 1024 },
  'application/pdf': { kind: 'pdf', extensions: ['.pdf'], defaultExtension: '.pdf', maxSizeBytes: 40 * 1024 * 1024 },
  'text/plain': { kind: 'text', extensions: ['.txt'], defaultExtension: '.txt', maxSizeBytes: 5 * 1024 * 1024 },
  'text/markdown': { kind: 'text', extensions: ['.md'], defaultExtension: '.md', maxSizeBytes: 5 * 1024 * 1024 },
  'application/json': { kind: 'text', extensions: ['.json'], defaultExtension: '.json', maxSizeBytes: 5 * 1024 * 1024 },
  'video/mp4': { kind: 'video', extensions: ['.mp4'], defaultExtension: '.mp4', maxSizeBytes: 250 * 1024 * 1024 },
  'video/webm': { kind: 'video', extensions: ['.webm'], defaultExtension: '.webm', maxSizeBytes: 250 * 1024 * 1024 },
  'video/ogg': { kind: 'video', extensions: ['.ogv'], defaultExtension: '.ogv', maxSizeBytes: 250 * 1024 * 1024 },
  'audio/mpeg': { kind: 'audio', extensions: ['.mp3'], defaultExtension: '.mp3', maxSizeBytes: 80 * 1024 * 1024 },
  'audio/wav': { kind: 'audio', extensions: ['.wav'], defaultExtension: '.wav', maxSizeBytes: 120 * 1024 * 1024 },
  'audio/ogg': { kind: 'audio', extensions: ['.ogg', '.oga'], defaultExtension: '.ogg', maxSizeBytes: 80 * 1024 * 1024 },
  'audio/webm': { kind: 'audio', extensions: ['.webm'], defaultExtension: '.webm', maxSizeBytes: 120 * 1024 * 1024 },
  'audio/mp4': { kind: 'audio', extensions: ['.m4a'], defaultExtension: '.m4a', maxSizeBytes: 120 * 1024 * 1024 }
};

const RESOURCE_EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4'
};

const RESOURCE_FOLDER_VISIBILITIES = ['all', 'gm', 'participant'];
const SESSION_RESOURCE_AUDIENCES = ['private', 'session_all', 'session_gm', 'session_member'];

function normalizeResourceScopeType(raw) {
  return raw === 'system' || raw === 'session' ? raw : 'account';
}

function normalizeRoles(rawRoles) {
  const roles = Array.isArray(rawRoles) ? rawRoles : ['player'];
  const allowed = roles.filter((role) => role === 'player' || role === 'gm' || role === 'admin');
  if (allowed.length === 0) {
    return ['player'];
  }
  return Array.from(new Set(allowed));
}

function ensureUserDefaults(user) {
  if (!user || typeof user !== 'object') {
    return;
  }
  user.roles = normalizeRoles(user.roles);
  user.isActive = typeof user.isActive === 'boolean' ? user.isActive : true;
  user.isEmailVerified = Boolean(user.isEmailVerified);
  user.approvalStatus = typeof user.approvalStatus === 'string' ? user.approvalStatus : 'pending';
  user.failedLoginCount = Number.isFinite(user.failedLoginCount) ? user.failedLoginCount : 0;
  user.lockoutLevel = Number.isFinite(user.lockoutLevel) ? user.lockoutLevel : 0;
}

function serializeState() {
  return {
    users: [...users.values()],
    usersByEmail: [...usersByEmail.entries()],
    sessions: [...sessions.values()],
    systems: [...systems.values()],
    characters: [...characters.values()],
    notes: [...notes.values()],
    messages: [...messages.values()],
    resources: [...resources.values()],
    resourceFolders: [...resourceFolders.values()],
    screenTemplates: [...screenTemplates.values()],
    homeNews: [...homeNews.values()],
    announcements: [...announcements.values()],
    socialDirectMessages: [...socialDirectMessages.values()],
    socialLinks: [...socialLinks.values()],
    socialReports: [...socialReports.values()],
    adminAuditEvents: [...adminAuditEvents],
    discordBotEvents: [...discordBotEvents],
    refreshTokens: [...refreshTokens.values()],
    emailVerificationTokens: [...emailVerificationTokens.entries()],
    passwordResetTokens: [...passwordResetTokens.entries()],
    twoFactorChallenges: [...twoFactorChallenges.entries()],
    savedAt: nowIso()
  };
}

function persistStateNow(reason = 'manual') {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const snapshot = serializeState();
    const tempPath = `${DATA_FILE}.tmp`;
    const serializedState = JSON.stringify(snapshot, null, 2);
    writeFileSync(tempPath, serializedState, 'utf8');
    renameSync(tempPath, DATA_FILE);
    persistStateHistory(reason);
    appendPersistLog(reason, snapshot, serializedState);
    hasPendingPersist = false;
    lastPersistReason = reason;
    lastPersistAt = nowIso();
    // eslint-disable-next-line no-console
    console.log(`[nexusforge-backend] state persisted (${reason}) -> ${DATA_FILE}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[nexusforge-backend] persist failed', error);
  }
}

function schedulePersist(reason = 'update') {
  hasPendingPersist = true;
  if (persistTimeout) {
    clearTimeout(persistTimeout);
  }
  persistTimeout = setTimeout(() => {
    persistTimeout = null;
    persistStateNow(reason);
  }, 150);
}

function flushPendingPersist(reason = 'flush') {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = null;
  }
  if (!hasPendingPersist) {
    return;
  }
  persistStateNow(reason);
}

function handleShutdownPersist(signal) {
  if (isFlushingForShutdown) {
    return;
  }
  isFlushingForShutdown = true;
  try {
    flushPendingPersist(`shutdown-${String(signal || 'signal').toLowerCase()}`);
  } finally {
    isFlushingForShutdown = false;
  }
}

function restoreMapFromArray(map, entries, keyOf) {
  if (!Array.isArray(entries)) {
    return;
  }
  for (const item of entries) {
    const key = keyOf(item);
    if (key === undefined || key === null || key === '') {
      continue;
    }
    map.set(key, item);
  }
}

function loadPersistedState() {
  if (!existsSync(DATA_FILE)) {
    return false;
  }
  try {
    const raw = readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    startupIntegrityReport = evaluateStartupIntegrity(raw, parsed);

    users.clear();
    usersByEmail.clear();
    sessions.clear();
    systems.clear();
    characters.clear();
    notes.clear();
    messages.clear();
    resources.clear();
    resourceFolders.clear();
    screenTemplates.clear();
    homeNews.clear();
    announcements.clear();
    socialDirectMessages.clear();
    socialLinks.clear();
    socialReports.clear();
    adminAuditEvents.splice(0, adminAuditEvents.length);
    discordBotEvents.splice(0, discordBotEvents.length);
    refreshTokens.clear();
    emailVerificationTokens.clear();
    passwordResetTokens.clear();
    twoFactorChallenges.clear();

    restoreMapFromArray(users, parsed.users, (item) => item?.id);
    for (const user of users.values()) {
      ensureUserDefaults(user);
    }
    if (Array.isArray(parsed.usersByEmail)) {
      for (const entry of parsed.usersByEmail) {
        if (Array.isArray(entry) && entry.length === 2) {
          usersByEmail.set(entry[0], entry[1]);
        }
      }
    } else {
      for (const user of users.values()) {
        if (user?.email) {
          usersByEmail.set(user.email, user.id);
        }
      }
    }
    restoreMapFromArray(sessions, parsed.sessions, (item) => item?.id);
    restoreMapFromArray(systems, parsed.systems, (item) => item?.id);
    restoreMapFromArray(characters, parsed.characters, (item) => item?.id);
    restoreMapFromArray(notes, parsed.notes, (item) => item?.id);
    restoreMapFromArray(messages, parsed.messages, (item) => item?.id);
    restoreMapFromArray(resources, parsed.resources, (item) => item?.id);
    restoreMapFromArray(resourceFolders, parsed.resourceFolders, (item) => item?.id);
    for (const resource of resources.values()) {
      normalizeResourceRecord(resource);
    }
    for (const folder of resourceFolders.values()) {
      normalizeResourceFolder(folder);
    }
    for (const session of sessions.values()) {
      ensureSessionDefaultResourceFolders(session);
    }
    restoreMapFromArray(screenTemplates, parsed.screenTemplates, (item) => item?.id);
    let normalizedScreenTemplates = false;
    for (const [templateId, template] of screenTemplates.entries()) {
      const migratedTemplate = migrateLegacyScreenTemplate(template);
      if (migratedTemplate !== template) {
        screenTemplates.set(templateId, migratedTemplate);
        normalizedScreenTemplates = true;
      }
    }
    restoreMapFromArray(homeNews, parsed.homeNews, (item) => item?.id);
    restoreMapFromArray(announcements, parsed.announcements, (item) => item?.id);
    let normalizedAnnouncements = false;
    for (const announcement of announcements.values()) {
      const linkedUser = users.get(announcement.authorUserId);
      const nextNickname = linkedUser?.nickname || announcement.authorNickname || null;
      const nextDisplayName = linkedUser?.displayName || announcement.authorDisplayName || announcement.authorUserId;
      const nextDays = sanitizeAnnouncementList(announcement.daysOfWeek, ANNOUNCEMENT_DAYS);
      const nextSlots = sanitizeAnnouncementList(announcement.timeSlots, ANNOUNCEMENT_TIME_SLOTS);
      const nextPeriodicity = ANNOUNCEMENT_PERIODICITIES.includes(announcement.periodicity) ? announcement.periodicity : null;
      const nextSummary = buildAnnouncementSummary({
        ...announcement,
        daysOfWeek: nextDays,
        timeSlots: nextSlots,
        periodicity: nextPeriodicity,
        authorNickname: nextNickname,
        authorDisplayName: nextDisplayName
      });
      if (announcement.authorNickname !== nextNickname) {
        announcement.authorNickname = nextNickname;
        normalizedAnnouncements = true;
      }
      if (announcement.authorDisplayName !== nextDisplayName) {
        announcement.authorDisplayName = nextDisplayName;
        normalizedAnnouncements = true;
      }
      if (JSON.stringify(announcement.daysOfWeek || []) !== JSON.stringify(nextDays)) {
        announcement.daysOfWeek = nextDays;
        normalizedAnnouncements = true;
      }
      if (JSON.stringify(announcement.timeSlots || []) !== JSON.stringify(nextSlots)) {
        announcement.timeSlots = nextSlots;
        normalizedAnnouncements = true;
      }
      if ((announcement.periodicity || null) !== nextPeriodicity) {
        announcement.periodicity = nextPeriodicity;
        normalizedAnnouncements = true;
      }
      if (announcement.summary !== nextSummary) {
        announcement.summary = nextSummary;
        normalizedAnnouncements = true;
      }
    }
    restoreMapFromArray(socialDirectMessages, parsed.socialDirectMessages, (item) => item?.id);
    restoreMapFromArray(socialLinks, parsed.socialLinks, (item) => item?.id);
    restoreMapFromArray(socialReports, parsed.socialReports, (item) => item?.id);
    if (Array.isArray(parsed.adminAuditEvents)) {
      for (const item of parsed.adminAuditEvents) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        adminAuditEvents.push(item);
      }
    }
    if (Array.isArray(parsed.discordBotEvents)) {
      for (const item of parsed.discordBotEvents) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        discordBotEvents.push(item);
      }
    }

    if (Array.isArray(parsed.refreshTokens)) {
      for (const token of parsed.refreshTokens) {
        if (typeof token === 'string') {
          refreshTokens.add(token);
        }
      }
    }

    if (Array.isArray(parsed.emailVerificationTokens)) {
      for (const entry of parsed.emailVerificationTokens) {
        if (Array.isArray(entry) && entry.length === 2) {
          emailVerificationTokens.set(entry[0], entry[1]);
        }
      }
    }
    if (Array.isArray(parsed.passwordResetTokens)) {
      for (const entry of parsed.passwordResetTokens) {
        if (Array.isArray(entry) && entry.length === 2) {
          passwordResetTokens.set(entry[0], entry[1]);
        }
      }
    }
    if (Array.isArray(parsed.twoFactorChallenges)) {
      for (const entry of parsed.twoFactorChallenges) {
        if (Array.isArray(entry) && entry.length === 2) {
          twoFactorChallenges.set(entry[0], entry[1]);
        }
      }
    }

    if (normalizedAnnouncements) {
      persistStateNow('announcement-normalize');
    }
    if (normalizedScreenTemplates) {
      persistStateNow('screen-template-widget-migrate');
    }

    // eslint-disable-next-line no-console
    console.log(`[nexusforge-backend] state loaded from ${DATA_FILE}`);
    if (startupIntegrityReport?.status === 'warning') {
      console.warn(
        `[nexusforge-backend] startup integrity warning`,
        JSON.stringify(startupIntegrityReport.warnings)
      );
    }
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[nexusforge-backend] load state failed, backend starts from persisted admin/bootstrap only', error);
    startupIntegrityReport = {
      status: 'error',
      checkedAt: nowIso(),
      loaded: {
        file: DATA_FILE,
        hash: null,
        stats: null
      },
      references: {
        lastPersistLog: null,
        latestHistorySnapshot: null
      },
      warnings: [
        {
          kind: 'load-failed',
          message: error instanceof Error ? error.message : String(error)
        }
      ]
    };
    return false;
  }
}

function deleteStoredResourceFile(resource) {
  if (!resource?.storagePath) {
    return;
  }
  const absolutePath = path.join(RESOURCE_DIR, resource.storagePath);
  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath);
  }
}

function deleteStoredDerivativeFile(relativePath) {
  if (!relativePath) {
    return;
  }
  const absolutePath = path.join(RESOURCE_DIR, relativePath);
  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath);
  }
}

function deleteResourceRecord(resourceId) {
  const resource = resources.get(resourceId);
  if (!resource) {
    return;
  }
  deleteStoredResourceFile(resource);
  deleteStoredDerivativeFile(resource.thumbnailPath);
  deleteStoredDerivativeFile(resource.previewPath);
  resources.delete(resourceId);
}

function deleteSessionArtifacts(sessionId) {
  for (const note of [...notes.values()]) {
    if (note.sessionId === sessionId || note.scopeRefId === sessionId) {
      notes.delete(note.id);
    }
  }
  for (const message of [...messages.values()]) {
    if (message.sessionId === sessionId) {
      messages.delete(message.id);
    }
  }
  for (const character of [...characters.values()]) {
    if (character.sessionId === sessionId) {
      characters.delete(character.id);
    }
  }
  for (const resource of [...resources.values()]) {
    if (resource.scopeType === 'session' && resource.scopeRefId === sessionId) {
      deleteResourceRecord(resource.id);
    }
  }
  for (const folder of [...resourceFolders.values()]) {
    if (folder.scopeType === 'session' && folder.scopeRefId === sessionId) {
      resourceFolders.delete(folder.id);
    }
  }
}

function publicUser(user) {
  const avatarResource =
    user.avatarResourceId && resources.has(user.avatarResourceId) ? resources.get(user.avatarResourceId) : null;
  const discordAvatarUrl =
    user.discordUserId && user.discordAvatar
      ? `https://cdn.discordapp.com/avatars/${user.discordUserId}/${user.discordAvatar}.png?size=256`
      : null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    nickname: user.nickname,
    displayName: user.displayName,
    email: user.email,
    roles: user.roles,
    isEmailVerified: user.isEmailVerified,
    approvalStatus: user.approvalStatus,
    isActive: user.isActive,
    hasTotpEnabled: Boolean(user.totpEnabled),
    isProtectedRootAdmin: Boolean(user.isProtectedRootAdmin),
    avatarResourceId: user.avatarResourceId || null,
    avatarUrl: avatarResource ? `${API_BASE_URL.replace(/\/$/, '')}/api/resources/${avatarResource.id}/content` : user.avatarUrl || null,
    discordAccount: user.discordUserId
      ? {
          id: user.discordUserId,
          username: user.discordUsername || null,
          globalName: user.discordGlobalName || null,
          avatarUrl: discordAvatarUrl,
          linkedAt: user.discordLinkedAt || null
        }
      : null,
    createdAt: user.createdAt
  };
}

function isDiscordOauthConfigured() {
  return Boolean(DISCORD_OAUTH_CLIENT_ID && DISCORD_OAUTH_CLIENT_SECRET && DISCORD_OAUTH_REDIRECT_URI);
}

function buildDiscordAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: DISCORD_OAUTH_CLIENT_ID,
    response_type: 'code',
    redirect_uri: DISCORD_OAUTH_REDIRECT_URI,
    scope: 'identify guilds',
    state,
    prompt: 'consent'
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeDiscordAuthorizationCode(code) {
  const body = new URLSearchParams({
    client_id: DISCORD_OAUTH_CLIENT_ID,
    client_secret: DISCORD_OAUTH_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: DISCORD_OAUTH_REDIRECT_URI
  });

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const tokenPayload = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !tokenPayload || typeof tokenPayload.access_token !== 'string') {
    throw new Error('Discord token exchange failed');
  }

  const authHeaders = {
    Authorization: `Bearer ${tokenPayload.access_token}`
  };
  const [profileResponse, guildsResponse] = await Promise.all([
    fetch('https://discord.com/api/users/@me', {
      headers: authHeaders
    }),
    fetch('https://discord.com/api/users/@me/guilds', {
      headers: authHeaders
    })
  ]);

  const profilePayload = await profileResponse.json().catch(() => null);
  const guildsPayload = await guildsResponse.json().catch(() => []);
  if (!profileResponse.ok || !profilePayload || typeof profilePayload.id !== 'string' || typeof profilePayload.username !== 'string') {
    throw new Error('Discord profile fetch failed');
  }

  return {
    ...profilePayload,
    guilds: Array.isArray(guildsPayload)
      ? guildsPayload
          .filter((guild) => guild && typeof guild.id === 'string')
          .map((guild) => ({
            id: guild.id,
            name: typeof guild.name === 'string' ? guild.name : guild.id
          }))
      : []
  };
}

function adminUser(user) {
  return {
    ...publicUser(user),
    failedLoginCount: Number.isFinite(user.failedLoginCount) ? user.failedLoginCount : 0,
    lockoutLevel: Number.isFinite(user.lockoutLevel) ? user.lockoutLevel : 0,
    lockedUntil: user.lockedUntil || null
  };
}

function normalizeNickname(nickname) {
  return String(nickname || '').trim();
}

function isNicknameTaken(nickname, excludeUserId = null) {
  const target = normalizeNickname(nickname).toLowerCase();
  if (!target) {
    return false;
  }
  return [...users.values()].some((user) => user.id !== excludeUserId && normalizeNickname(user.nickname).toLowerCase() === target);
}

function pushAdminAuditEvent(params) {
  const event = {
    id: makeId('audit-admin'),
    at: nowIso(),
    actorUserId: params.actorUserId,
    action: params.action,
    targetUserId: params.targetUserId || null,
    summary: params.summary || '',
    metadata: params.metadata && typeof params.metadata === 'object' ? clone(params.metadata) : {}
  };
  adminAuditEvents.unshift(event);
  if (adminAuditEvents.length > 500) {
    adminAuditEvents.length = 500;
  }
  schedulePersist(`admin-audit-${params.action || 'event'}`);
}

function pushDiscordBotEvent(type, payload) {
  const event = {
    id: makeId('discord-event'),
    type,
    createdAt: nowIso(),
    payload: payload && typeof payload === 'object' ? clone(payload) : {}
  };
  discordBotEvents.push(event);
  if (discordBotEvents.length > MAX_DISCORD_BOT_EVENTS) {
    discordBotEvents.splice(0, discordBotEvents.length - MAX_DISCORD_BOT_EVENTS);
  }
  schedulePersist(`discord-bot-event-${type}`);
  return event;
}

function requireDiscordBotSecret(req, res, next) {
  if (!DISCORD_BOT_SHARED_SECRET) {
    return error(res, 503, 'DISCORD_BOT_NOT_CONFIGURED', 'Discord bot integration is not configured');
  }

  const provided =
    String(req.headers['x-discord-bot-secret'] || '').trim() ||
    String(req.headers['x-nexusforge-discord-secret'] || '').trim();

  if (!provided || provided !== DISCORD_BOT_SHARED_SECRET) {
    return error(res, 403, 'DISCORD_BOT_FORBIDDEN', 'Discord bot secret is invalid');
  }

  return next();
}

function requireBackupTriggerSecret(req, res, next) {
  if (!BACKUP_TRIGGER_SECRET) {
    return error(res, 503, 'BACKUP_NOT_CONFIGURED', 'Backup trigger is not configured');
  }

  const provided =
    String(req.headers['x-backup-secret'] || '').trim() ||
    String(req.query?.secret || '').trim() ||
    String(req.query?.token || '').trim();

  if (!provided || provided !== BACKUP_TRIGGER_SECRET) {
    return error(res, 403, 'BACKUP_FORBIDDEN', 'Backup secret is invalid');
  }

  return next();
}

function publicDiscordBotEvent(event) {
  return clone(event);
}

function error(res, status, code, message, details = undefined) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  });
}

function parseBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) {
    return null;
  }
  return value;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidPersonName(value) {
  const normalized = String(value || '').trim();
  return normalized.length >= 1 && normalized.length <= 80 && !/[<>]/.test(normalized);
}

function isValidNicknameValue(value) {
  const normalized = normalizeNickname(value);
  return normalized.length >= 2 && normalized.length <= 30 && /^[A-Za-z0-9_]+$/.test(normalized);
}

function isValidPasswordStrength(password) {
  const normalized = String(password || '');
  return normalized.length >= 10 && /[A-Za-z]/.test(normalized) && /\d/.test(normalized);
}

function getClientIp(req) {
  return String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function purgeExpiredAuthRateLimitEntries() {
  const threshold = nowMs() - AUTH_RATE_LIMIT_WINDOW_MS;
  for (const [key, entry] of authRateLimitStore.entries()) {
    if (!entry || entry.resetAt <= threshold) {
      authRateLimitStore.delete(key);
    }
  }
}

function createAuthRateLimiter(options) {
  return (req, res, next) => {
    purgeExpiredAuthRateLimitEntries();
    const bucketKey = `${options.keyPrefix}:${options.resolveKey(req)}`;
    const now = nowMs();
    const current = authRateLimitStore.get(bucketKey);
    if (!current || current.resetAt <= now) {
      authRateLimitStore.set(bucketKey, {
        count: 1,
        resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS
      });
      return next();
    }

    if (current.count >= options.max) {
      return error(res, 429, 'TOO_MANY_REQUESTS', 'Too many requests, retry later', {
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      });
    }

    current.count += 1;
    authRateLimitStore.set(bucketKey, current);
    return next();
  };
}

const authLoginRateLimiter = createAuthRateLimiter({
  keyPrefix: 'auth-login',
  max: AUTH_RATE_LIMIT_MAX_LOGIN,
  resolveKey(req) {
    const email = normalizeEmail(req.body?.email);
    return `${getClientIp(req)}:${email || 'unknown'}`;
  }
});

const authRegisterRateLimiter = createAuthRateLimiter({
  keyPrefix: 'auth-register',
  max: AUTH_RATE_LIMIT_MAX_REGISTER,
  resolveKey(req) {
    return `${getClientIp(req)}:${normalizeEmail(req.body?.email) || 'unknown'}`;
  }
});

const authRecoveryRateLimiter = createAuthRateLimiter({
  keyPrefix: 'auth-recovery',
  max: AUTH_RATE_LIMIT_MAX_RECOVERY,
  resolveKey(req) {
    return `${getClientIp(req)}:${normalizeEmail(req.body?.email) || 'unknown'}`;
  }
});

function canSendEmails() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

function getTransport() {
  if (smtpTransport) {
    return smtpTransport;
  }

  if (!canSendEmails()) {
    return null;
  }

  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return smtpTransport;
}

async function sendEmail({ to, subject, text, html }) {
  const transport = getTransport();
  if (!transport) {
    // eslint-disable-next-line no-console
    console.log(`[mail:disabled] to=${to} subject="${subject}" body=${text}`);
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html
  });
}

function issueTokens(user) {
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    {
      sub: user.id,
      type: 'refresh'
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );

  refreshTokens.add(refreshToken);
  return { token, refreshToken };
}

function requireAuth(req, res, next) {
  const token = parseBearer(req);
  if (!token) {
    return error(res, 401, 'UNAUTHENTICATED', 'Missing token');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = users.get(payload.sub);
    if (!user) {
      return error(res, 401, 'UNAUTHENTICATED', 'Unknown user');
    }
    if (!user.isActive) {
      return error(res, 403, 'ACCOUNT_DISABLED', 'Account disabled by admin');
    }

    req.currentUser = user;
    return next();
  } catch {
    return error(res, 401, 'UNAUTHENTICATED', 'Invalid token');
  }
}

function requireAdmin(req, res, next) {
  if (!req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'ADMIN_REQUIRED', 'Admin role required');
  }
  return next();
}

function requireGmOrAdmin(req, res, next) {
  if (!req.currentUser.roles.includes('gm') && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'GM_REQUIRED', 'GM or admin role required');
  }
  return next();
}

const SYSTEM_DRAFT_FORMAT = 'nexusforge.system-draft';
const SYSTEM_DRAFT_VERSION = 1;

function slugifySystemDraft(value, fallback = 'champ') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return normalized || fallback;
}

function ensureUniqueSystemDraft(value, existing, fallback) {
  const base = slugifySystemDraft(value, fallback);
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  let index = 1;
  let candidate = `${base}${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${base}${index}`;
  }
  existing.add(candidate);
  return candidate;
}

function makeSystemDraftNodeId() {
  return `system_node-${Math.random().toString(36).slice(2, 10)}`;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtmlTags(value) {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseHtmlAttributes(raw) {
  const attributes = {};
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match = null;
  while ((match = attrPattern.exec(raw)) !== null) {
    const [, key, a, b, c] = match;
    attributes[key.toLowerCase()] = a ?? b ?? c ?? true;
  }
  return attributes;
}

function buildSystemDraftPayload({ sourceType, sourcePath, title, elements, warnings = [] }) {
  const keySet = new Set();
  const labelSet = new Set();
  let y = 0;
  const nodes = elements.map((element) => {
    const label = ensureUniqueSystemDraft(element.label || element.key || element.type || 'champ', labelSet, 'champ');
    const key = ensureUniqueSystemDraft(element.key || label, keySet, 'champ');
    const base = {
      id: makeSystemDraftNodeId(),
      label,
      key,
      layout: {
        x: 0,
        y,
        w: element.w ?? 12,
        h: element.h ?? 2,
        minW: 1,
        minH: 1
      },
      showTitle: false,
      showBorder: false
    };
    y += base.layout.h;

    switch (element.type) {
      case 'text':
        return {
          ...base,
          type: 'text',
          placeholder: element.placeholder || '',
          defaultValue: element.defaultValue || ''
        };
      case 'textarea':
        return {
          ...base,
          type: 'textarea',
          placeholder: element.placeholder || '',
          defaultValue: element.defaultValue || '',
          defaultRowsVisible: 4
        };
      case 'number':
        return {
          ...base,
          type: 'number',
          defaultValue: typeof element.defaultValue === 'number' ? element.defaultValue : 0
        };
      case 'date':
        return { ...base, type: 'date', defaultValue: '' };
      case 'time':
        return { ...base, type: 'time', defaultValue: '' };
      case 'checkbox':
        return {
          ...base,
          type: 'checkbox',
          defaultValue: false,
          checkboxLabel: element.label || label
        };
      case 'select':
        return {
          ...base,
          type: 'select',
          options: Array.isArray(element.options) ? element.options : [],
          defaultValue: ''
        };
      default:
        return {
          ...base,
          type: 'static_text',
          defaultValue: element.content || element.label || ''
        };
    }
  });

  const systemName = title || path.basename(sourcePath, path.extname(sourcePath)) || 'systeme_importe';
  return {
    format: SYSTEM_DRAFT_FORMAT,
    version: SYSTEM_DRAFT_VERSION,
    extractedAt: nowIso(),
    source: {
      type: sourceType,
      path: sourcePath
    },
    warnings,
    suggestedSystem: {
      name: systemName,
      studioSchemaV2: {
        version: 2,
        views: [
          {
            id: 'system_view_imported',
            name: systemName,
            reference: slugifySystemDraft(systemName, 'vue_importee'),
            description: '',
            gridColumns: 12,
            visibleInSelectors: true,
            isDefaultForPlayer: false,
            isCharacterSheet: false,
            characterSheetKind: 'pc',
            defaultSheetNameTemplate: '{{nompartie}} · {{nompj}}',
            initiativeMode: 'combat_once',
            initiativeFormula: '',
            nodes
          }
        ]
      }
    },
    extraction: {
      elements
    }
  };
}

function convertHtmlToSystemDraft({ fileName, html }) {
  return convertHtmlToSystemDraftShared({ fileName, html });
}

function convertHtmlToEnrichedSystemDraft({ fileName, html }) {
  return convertHtmlToEnrichedSystemDraftShared({ fileName, html });
}

function resolvePdfToTextBinary() {
  const envCandidate = typeof process.env.PDFTOTEXT_BIN === 'string' ? process.env.PDFTOTEXT_BIN.trim() : '';
  const candidates = [envCandidate, 'pdftotext', '/usr/bin/pdftotext', '/usr/local/bin/pdftotext'].filter(Boolean);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const probeCommand = candidate.includes(path.sep) ? candidate : 'sh';
      const probeArgs = candidate.includes(path.sep)
        ? ['-v']
        : ['-lc', `command -v ${candidate} >/dev/null 2>&1`];
      execFileSync(probeCommand, probeArgs, {
        stdio: ['ignore', 'ignore', 'ignore']
      });
      if (!candidate.includes(path.sep) || existsSync(candidate)) {
        return candidate;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const suffix =
    lastError && typeof lastError === 'object' && 'code' in lastError && lastError.code
      ? ` (${String(lastError.code)})`
      : '';
  throw new Error(
    `pdftotext est introuvable ou non executable${suffix}. Installe poppler-utils ou renseigne PDFTOTEXT_BIN avec le chemin du binaire.`
  );
}

function extractPdfTextWithPdftotext(pdfPath) {
  const binary = resolvePdfToTextBinary();
  try {
    return execFileSync(binary, ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && error.code ? String(error.code) : '';
    if (code === 'EACCES') {
      throw new Error(
        `Le binaire pdftotext n est pas executable (${binary}). Verifie ses permissions ou renseigne PDFTOTEXT_BIN avec un binaire accessible.`
      );
    }
    if (code === 'ENOENT') {
      throw new Error(
        `Le binaire pdftotext est introuvable (${binary}). Installe poppler-utils ou renseigne PDFTOTEXT_BIN.`
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Impossible d extraire le texte du PDF avec pdftotext: ${detail}`);
  }
}

function convertPdfToSystemDraft({ fileName, buffer }) {
  const tempPdfPath = path.join(DATA_DIR, `${makeId('system_draft_pdf')}.pdf`);
  try {
    writeFileSync(tempPdfPath, buffer);
    const extractedText = extractPdfTextWithPdftotext(tempPdfPath);
    const lines = extractedText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+$/g, ''))
      .filter((line) => line.trim().length > 0);
    const title = String(lines[0] || path.basename(fileName, path.extname(fileName))).replace(/\s+/g, ' ').trim();
    const elements = lines
      .map((line, index) => {
        const trimmed = String(line).replace(/\s+/g, ' ').trim();
        if (!trimmed) {
          return null;
        }
        if (/^\[[ xX]\]\s+/.test(trimmed)) {
          const label = trimmed.replace(/^\[[ xX]\]\s+/, '');
          return { type: 'checkbox', label, key: label };
        }
        if (/:$/.test(trimmed)) {
          const label = trimmed.replace(/:$/, '').trim();
          return { type: 'text', label, key: label };
        }
        if (/[_]{3,}/.test(trimmed) || /[.]{4,}/.test(trimmed)) {
          const label = trimmed.split(/[_]{3,}|[.]{4,}/)[0].replace(/:$/, '').trim() || `champ_${index + 1}`;
          return { type: 'text', label, key: label };
        }
        if (/^[A-Z0-9 \-]{4,}$/.test(trimmed)) {
          return { type: 'static_text', label: trimmed, key: trimmed, content: trimmed, h: 2 };
        }
        return { type: 'static_text', label: `texte_${index + 1}`, key: `texte_${index + 1}`, content: trimmed, h: 2 };
      })
      .filter(Boolean);
    const warnings = [];
    if (elements.length === 0) {
      warnings.push('Aucun contenu exploitable n a ete extrait du PDF.');
    }
    return buildSystemDraftPayload({
      sourceType: 'pdf',
      sourcePath: fileName,
      title,
      elements,
      warnings
    });
  } finally {
    if (existsSync(tempPdfPath)) {
      unlinkSync(tempPdfPath);
    }
  }
}

function getLockInfo(user) {
  if (!user.lockedUntil) {
    return { isLocked: false, remainingMs: 0 };
  }

  const remainingMs = user.lockedUntil - nowMs();
  if (remainingMs <= 0) {
    user.lockedUntil = null;
    return { isLocked: false, remainingMs: 0 };
  }

  return { isLocked: true, remainingMs };
}

function applyFailedLogin(user) {
  user.failedLoginCount = (user.failedLoginCount || 0) + 1;
  if (user.failedLoginCount < MAX_FAILED_ATTEMPTS) {
    return;
  }

  user.failedLoginCount = 0;
  user.lockoutLevel = Math.min((user.lockoutLevel || 0) + 1, LOCKOUT_STEPS_MINUTES.length);
  const lockMinutes = LOCKOUT_STEPS_MINUTES[user.lockoutLevel - 1] || LOCKOUT_STEPS_MINUTES[LOCKOUT_STEPS_MINUTES.length - 1];
  user.lockedUntil = nowMs() + lockMinutes * 60 * 1000;
}

function clearLoginFailures(user) {
  user.failedLoginCount = 0;
  user.lockedUntil = null;
}

function verifyTotpCode(secret, code) {
  if (!code) {
    return false;
  }
  try {
    return authenticator.check(String(code).trim(), secret);
  } catch {
    return false;
  }
}

function isValidBase32Secret(secret) {
  if (!secret) {
    return false;
  }
  return /^[A-Z2-7]+=*$/.test(secret);
}

function isUserParticipantInSessionUsingSystem(userId, systemId) {
  return [...sessions.values()].some((session) => {
    if (session.systemId !== systemId) {
      return false;
    }
    return (session.participants || []).some((participant) => participant.userId === userId);
  });
}

function canViewSystem(system, user) {
  if (system.deletedAt && !isUserParticipantInSessionUsingSystem(user.id, system.id) && !(system.ownerUserId === user.id || user.roles.includes('admin'))) {
    return false;
  }
  if (system.ownerUserId === user.id || user.roles.includes('admin') || (system.editorUserIds || []).includes(user.id) || (system.viewerUserIds || []).includes(user.id)) {
    return true;
  }
  if (isUserParticipantInSessionUsingSystem(user.id, system.id)) {
    return true;
  }
  if (system.status !== 'published') {
    return false;
  }
  return (
    system.visibility === 'public' ||
    (system.visibility === 'friends' && areFriends(system.ownerUserId, user.id))
  );
}

function canEditSystem(system, user) {
  if (system.deletedAt) {
    return false;
  }
  return system.ownerUserId === user.id || user.roles.includes('admin') || (system.editorUserIds || []).includes(user.id);
}

function systemHasCharacterSheet(system) {
  return Boolean(system?.studioSchemaV2?.views?.some((view) => view.isCharacterSheet));
}

function canPublishSystem(system) {
  return systemHasCharacterSheet(system);
}

function canUseSystemForSession(system) {
  return system?.status === 'published' && systemHasCharacterSheet(system);
}

function canViewScreenTemplate(template, user) {
  if (!template || !user) {
    return false;
  }
  if (user.roles.includes('admin')) {
    return true;
  }
  if (template.visibility === 'public') {
    return true;
  }
  if (template.visibility === 'friends' && areFriends(template.createdBy, user.id)) {
    return true;
  }
  if (template.createdBy === user.id) {
    return true;
  }
  if (template.scopeType === 'system' && template.scopeRefId) {
    const system = systems.get(template.scopeRefId);
    return Boolean(system && canViewSystem(system, user));
  }
  return false;
}

function canEditScreenTemplate(template, user) {
  if (!template || !user) {
    return false;
  }
  if (user.roles.includes('admin')) {
    return true;
  }
  return template.createdBy === user.id;
}

function screenTemplateSupportsRole(template, role) {
  return template.roleTarget === role || template.roleTarget === 'both';
}

function pickDefaultScreenTemplateForSystem({ systemId, role }) {
  return (
    [...screenTemplates.values()]
      .filter((template) => template.scopeType === 'system' && template.scopeRefId === systemId)
      .filter((template) => screenTemplateSupportsRole(template, role))
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))[0] || null
  );
}

function appendSystemAudit(system, params) {
  const entry = {
    id: makeId('audit'),
    at: nowIso(),
    byUserId: params.byUserId,
    action: params.action,
    summary: params.summary
  };
  const current = Array.isArray(system.auditTrail) ? system.auditTrail : [];
  return [...current, entry].slice(-100);
}

function getSystemUsage(systemId) {
  const linkedSessions = [...sessions.values()].filter((session) => session.systemId === systemId);
  const activeSessions = linkedSessions.filter((session) => !session.archivedAt);
  const archivedSessions = linkedSessions.filter((session) => Boolean(session.archivedAt));

  const uniqueActiveUsers = new Set();
  for (const session of activeSessions) {
    for (const participant of session.participants || []) {
      if (participant.userId) {
        uniqueActiveUsers.add(participant.userId);
      }
    }
    if (session.ownerUserId) {
      uniqueActiveUsers.add(session.ownerUserId);
    }
    if (session.gmUserId) {
      uniqueActiveUsers.add(session.gmUserId);
    }
    for (const gmUserId of session.gmUserIds || []) {
      uniqueActiveUsers.add(gmUserId);
    }
  }

  const timestamps = linkedSessions
    .flatMap((session) => [session.updatedAt, session.createdAt, session.archivedAt])
    .filter((value) => typeof value === 'string' && value);
  const lastUsedAt =
    timestamps.length > 0
      ? new Date(
          Math.max(
            ...timestamps.map((value) => {
              const parsed = new Date(value).getTime();
              return Number.isFinite(parsed) ? parsed : 0;
            })
          )
        ).toISOString()
      : null;

  return {
    usersUsingNow: uniqueActiveUsers.size,
    activeSessionsCount: activeSessions.length,
    archivedSessionsCount: archivedSessions.length,
    totalSessionsCount: linkedSessions.length,
    lastUsedAt
  };
}

function getSessionGmUserIds(session) {
  const fromArray = Array.isArray(session.gmUserIds) ? session.gmUserIds.filter((item) => typeof item === 'string') : [];
  if (fromArray.length > 0) {
    return Array.from(new Set(fromArray));
  }

  const fromParticipants = (session.participants || [])
    .filter((participant) => participant.role === 'gm' && typeof participant.userId === 'string')
    .map((participant) => participant.userId);
  if (fromParticipants.length > 0) {
    return Array.from(new Set(fromParticipants));
  }

  return session.gmUserId ? [session.gmUserId] : [];
}

function isSessionOwner(session, userId) {
  if (!userId) {
    return false;
  }
  const ownerId = session.ownerUserId || session.gmUserId;
  return ownerId === userId;
}

function canManageSession(session, user) {
  if (user.roles.includes('admin')) {
    return true;
  }

  return isSessionOwner(session, user.id) || getSessionGmUserIds(session).includes(user.id);
}

function canViewSession(session, user) {
  if (user.roles.includes('admin')) {
    return true;
  }

  return (
    getSessionGmUserIds(session).includes(user.id) ||
    (session.participants || []).some((participant) => participant.userId === user.id)
  );
}

function listPlayerCreationCharacterSheetViews(system) {
  const allCharacterSheetViews = (system?.studioSchemaV2?.views || []).filter((view) => view.isCharacterSheet);
  const explicitPlayerViews = allCharacterSheetViews.filter((view) => view.characterSheetKind === 'pc' || !view.characterSheetKind);
  return explicitPlayerViews.length > 0 ? explicitPlayerViews : allCharacterSheetViews;
}

function canViewInvitation(session, currentUser, invitation) {
  if (!currentUser) {
    return false;
  }
  if (currentUser.roles.includes('admin')) {
    return true;
  }
  if (invitation.userId === currentUser.id) {
    return true;
  }
  return canManageSession(session, currentUser);
}

function publicSession(session, currentUser = null) {
  const enrichedParticipants = (session.participants || []).map((participant) => {
    const linkedUser = users.get(participant.userId);
    return {
      ...clone(participant),
      displayName: linkedUser?.displayName || participant.userId,
      nickname: linkedUser?.nickname || null
    };
  });

  return {
    ...(() => {
      const cloned = clone(session);
      delete cloned.runtimePresence;
      delete cloned.runtimeTargetStates;
      return cloned;
    })(),
    participants: enrichedParticipants,
    invitations: (session.invitations || [])
      .filter((invitation) => canViewInvitation(session, currentUser, invitation))
      .map((invitation) => {
        const linkedUser = users.get(invitation.userId);
        const invitedBy = users.get(invitation.invitedByUserId);
        return {
          ...clone(invitation),
          displayName: linkedUser?.displayName || invitation.userId,
          nickname: linkedUser?.nickname || null,
          invitedByDisplayName: invitedBy?.displayName || invitation.invitedByUserId,
          invitedByNickname: invitedBy?.nickname || null
        };
      }),
    activityLog: (session.activityLog || []).map((entry) => clone(entry))
  };
}

function buildRuntimeTargetStorageKey(templateId, targetId) {
  return `${String(templateId || 'default')}::${String(targetId || '')}`;
}

function splitRuntimeScreensForPresence(selectedSet, detachedScreenId = null) {
  if (!selectedSet) {
    return [];
  }

  if (detachedScreenId) {
    return selectedSet.screens.filter((screen) => screen.id === detachedScreenId);
  }

  const explicitMain = selectedSet.screens.find((screen) => screen.mode === 'main') || selectedSet.screens[0] || null;
  return explicitMain ? [explicitMain] : [];
}

function buildRuntimeConnectionEntries(session) {
  const presence = session?.runtimePresence && typeof session.runtimePresence === 'object' ? session.runtimePresence : {};
  const entries = Object.entries(presence)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([userId, value]) => {
      const linkedUser = users.get(userId);
      const templateId = typeof value.templateId === 'string' ? value.templateId : null;
      const setId = typeof value.setId === 'string' ? value.setId : null;
      const detachedScreenId = typeof value.detachedScreenId === 'string' ? value.detachedScreenId : null;
      const template = templateId ? screenTemplates.get(templateId) || null : null;
      const selectedSet = template?.sets?.find((set) => set.id === setId) || template?.sets?.[0] || null;
      const activeScreens = splitRuntimeScreensForPresence(selectedSet, detachedScreenId);
      const availableOverlayTargets = activeScreens.flatMap((screen) =>
        (screen.tabGroups || []).flatMap((group) =>
          (group.widgets || [])
            .filter((widget) => widget.type === 'open_target_overlay' || widget.type === 'screen_viewer')
            .map((widget) => ({
              targetId: widget.id,
              title: widget.title,
              widgetType: widget.type,
              screenName: screen.name,
              tabName: group.name,
              channelKey: typeof widget.config?.channelKey === 'string' ? widget.config.channelKey : 'primary'
            }))
        )
      );
      return {
        userId,
        role: value.role === 'gm' ? 'gm' : 'player',
        active: value.active !== false,
        lastSeenAt: typeof value.lastSeenAt === 'string' ? value.lastSeenAt : null,
        displayName: linkedUser?.displayName || userId,
        nickname: linkedUser?.nickname || null,
        templateId,
        templateName: template?.name || null,
        setId: selectedSet?.id || setId,
        setName: selectedSet?.name || null,
        detachedScreenId,
        screenName: activeScreens[0]?.name || null,
        availableOverlayTargets
      };
    });

  return entries.sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }
    return String(left.nickname || left.displayName || left.userId).localeCompare(String(right.nickname || right.displayName || right.userId), 'fr');
  });
}

function buildSessionDiscordPayload(session) {
  const integration = session?.discordIntegration && typeof session.discordIntegration === 'object' ? session.discordIntegration : null;
  const participants = (session?.participants || [])
    .map((participant) => {
      const linkedUser = users.get(participant.userId);
      return {
        userId: participant.userId,
        role: participant.role,
        displayName: linkedUser?.displayName || participant.userId,
        nickname: linkedUser?.nickname || null,
        discordUserId: linkedUser?.discordUserId || null,
        discordUsername: linkedUser?.discordUsername || null,
        discordGlobalName: linkedUser?.discordGlobalName || null
      };
    });

  return {
    id: session.id,
    name: session.name,
    description: session.description || '',
    state: session.state,
    archivedAt: session.archivedAt || null,
    ownerUserId: session.ownerUserId || session.gmUserId,
    gmUserId: session.gmUserId,
    gmUserIds: getSessionGmUserIds(session),
    participants,
    integration: integration
      ? {
          guildId: integration.guildId || null,
          guildName: integration.guildName || null,
          categoryId: integration.categoryId || null,
          channelId: integration.channelId || null,
          channelName: integration.channelName || null,
          status: integration.status || 'link_requested',
          linkedAt: integration.linkedAt || null,
          linkedByUserId: integration.linkedByUserId || null,
          lastSyncedAt: integration.lastSyncedAt || null
        }
      : null
  };
}

function getValueAtPath(source, rawPath) {
  const path = String(rawPath || '')
    .trim()
    .replace(/^@/, '');
  if (!path) {
    return source;
  }
  return path.split('.').reduce((current, segment) => {
    if (current == null) {
      return undefined;
    }
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }
    return current[segment];
  }, source);
}

function toDiscordRenderableValue(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function normalizeDiscordTokenSegment(input) {
  return String(input || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildDiscordViewContexts(system, fieldValues) {
  const result = {};
  for (const view of system?.studioSchemaV2?.views || []) {
    const viewValues = {};
    for (const node of view.nodes || []) {
      const nodeKey = typeof node.key === 'string' ? node.key.trim() : '';
      if (nodeKey) {
        viewValues[nodeKey] = fieldValues[nodeKey];
      }
      const rawLabel = typeof node.label === 'string' ? node.label.trim() : '';
      if (rawLabel && /^[A-Za-z0-9_]+$/.test(rawLabel) && !(rawLabel in viewValues)) {
        viewValues[rawLabel] = fieldValues[nodeKey || rawLabel];
      }
      const normalizedLabel = normalizeDiscordTokenSegment(rawLabel);
      if (normalizedLabel && !(normalizedLabel in viewValues)) {
        viewValues[normalizedLabel] = fieldValues[nodeKey || rawLabel || normalizedLabel];
      }
    }

    const aliases = new Set();
    if (typeof view.reference === 'string' && view.reference.trim()) {
      aliases.add(view.reference.trim());
    }
    if (typeof view.id === 'string' && view.id.trim()) {
      aliases.add(view.id.trim());
    }
    if (typeof view.name === 'string' && /^[A-Za-z0-9_]+$/.test(view.name.trim())) {
      aliases.add(view.name.trim());
    }
    const normalizedName = normalizeDiscordTokenSegment(view.name);
    if (normalizedName) {
      aliases.add(normalizedName);
    }

    for (const alias of aliases) {
      result[alias] = {
        ...viewValues,
        id: view.id,
        name: view.name,
        reference: view.reference || ''
      };
    }
  }
  return result;
}

function renderDiscordTemplate(template, context) {
  const input = typeof template === 'string' ? template : '';
  const withBraces = input.replace(/\{\{\s*([A-Za-z0-9_.[\]]+)\s*\}\}/g, (_, token) =>
    toDiscordRenderableValue(getValueAtPath(context, token))
  );
  return withBraces.replace(/@([A-Za-z0-9_.\[\]]+)/g, (_, token) =>
    toDiscordRenderableValue(getValueAtPath(context, token))
  );
}

function buildDiscordFieldValues(character) {
  const fieldValues = {};
  for (const field of character?.sheet?.fields || []) {
    if (!field?.id) {
      continue;
    }
    fieldValues[field.id] = field.value;
  }
  const runtimeValues =
    character?.runtimeValues && typeof character.runtimeValues === 'object' && !Array.isArray(character.runtimeValues)
      ? character.runtimeValues
      : {};
  return {
    ...fieldValues,
    ...runtimeValues
  };
}

function resolveSessionCharacterForUser(session, user) {
  const participant = (session?.participants || []).find((entry) => entry.userId === user.id) || null;
  if (!participant) {
    return { participant: null, character: null };
  }

  if (participant.characterId) {
    const directCharacter = characters.get(participant.characterId);
    if (directCharacter && directCharacter.sessionId === session.id) {
      return { participant, character: directCharacter };
    }
  }

  const ownedCharacter =
    [...characters.values()].find(
      (character) => character.sessionId === session.id && character.ownerUserId === user.id
    ) || null;
  return {
    participant,
    character: ownedCharacter
  };
}

function findDiscordOutputDefinition(system, outputKey) {
  const outputs = Array.isArray(system?.discordConfig?.outputs) ? system.discordConfig.outputs : [];
  return outputs.find((output) => output && output.key === outputKey) || null;
}

function buildDiscordRenderContext(params) {
  const { session, system, user, participant, character, fieldValues, selectedView = null } = params;
  const viewContexts = buildDiscordViewContexts(system, fieldValues);
  return {
    ...fieldValues,
    ...viewContexts,
    session: {
      id: session.id,
      name: session.name,
      description: session.description || '',
      state: session.state,
      gmUserId: session.gmUserId
    },
    system: {
      id: system.id,
      name: system.name,
      version: system.version,
      author: system.author || ''
    },
    user: {
      id: user.id,
      displayName: user.displayName,
      nickname: user.nickname || '',
      discordUsername: user.discordUsername || '',
      discordGlobalName: user.discordGlobalName || ''
    },
    participant: participant
      ? {
          userId: participant.userId,
          role: participant.role,
          characterId: participant.characterId || ''
        }
      : null,
    character: character
      ? {
          id: character.id,
          name: character.name,
          type: character.type || '',
          viewId: character.viewId,
          ownerUserId: character.ownerUserId || ''
        }
      : null,
    view: selectedView
      ? {
          id: selectedView.id,
          name: selectedView.name,
          reference: selectedView.reference || ''
        }
      : null
  };
}

function renderDiscordSystemOutput(params) {
  const { session, system, user, participant, character, output, requestedVisibility } = params;
  const allowed = Array.isArray(output.allowedVisibilities) && output.allowedVisibilities.length > 0
    ? output.allowedVisibilities
    : [output.defaultVisibility || 'private'];
  const visibility = allowed.includes(requestedVisibility) ? requestedVisibility : allowed.includes(output.defaultVisibility) ? output.defaultVisibility : allowed[0];

  if (!output.enabled) {
    throw new Error('Cette sortie Discord n est pas activée dans le système.');
  }

  const fieldValues = character ? buildDiscordFieldValues(character) : {};
  let selectedView = null;
  if (output.sourceType === 'view') {
    const sourceRef = String(output.sourceRef || '').trim();
    if (sourceRef) {
      selectedView =
        (system?.studioSchemaV2?.views || []).find(
          (view) => view.id === sourceRef || view.reference === sourceRef || view.name === sourceRef
        ) || null;
    }
  }

  const context = buildDiscordRenderContext({
    session,
    system,
    user,
    participant,
    character,
    fieldValues,
    selectedView
  });

  if (output.sourceType === 'sheet') {
    if (!character) {
      throw new Error('Aucune fiche personnage liée n est disponible pour cet utilisateur dans cette partie.');
    }
    const content = renderDiscordTemplate(output.template, context).trim() || renderDiscordTemplate(output.emptyTemplate || '', context).trim();
    return {
      key: output.key,
      label: output.label,
      format: output.format,
      visibility,
      content,
      characterId: character.id,
      sessionId: session.id
    };
  }

  if (output.sourceType === 'collection') {
    if (!character) {
      throw new Error('Aucune fiche personnage liée n est disponible pour cet utilisateur dans cette partie.');
    }
    const sourceRef = String(output.sourceRef || '').trim();
    if (!sourceRef) {
      throw new Error('La sortie Discord collection doit définir une référence de source.');
    }
    const rawCollection = getValueAtPath(context, sourceRef);
    const items = Array.isArray(rawCollection) ? rawCollection : [];
    const maxItems = Number.isFinite(Number(output.maxItems)) && Number(output.maxItems) > 0 ? Number(output.maxItems) : null;
    const limitedItems = maxItems ? items.slice(0, maxItems) : items;
    const itemTemplate = typeof output.itemTemplate === 'string' && output.itemTemplate.trim() ? output.itemTemplate : '- @item';

    const renderedItems = limitedItems
      .map((item, index) =>
        renderDiscordTemplate(itemTemplate, {
          ...context,
          item,
          index,
          position: index + 1
        }).trim()
      )
      .filter(Boolean);

    const content =
      renderedItems.length > 0
        ? renderedItems.join('\n')
        : renderDiscordTemplate(output.emptyTemplate || output.template || 'Aucun élément.', context).trim();

    return {
      key: output.key,
      label: output.label,
      format: output.format,
      visibility,
      content,
      characterId: character.id,
      sessionId: session.id
    };
  }

  if (output.sourceType === 'notes') {
    const maxItems = Number.isFinite(Number(output.maxItems)) && Number(output.maxItems) > 0 ? Number(output.maxItems) : null;
    const visibleNotes = [...notes.values()]
      .filter((note) => note.sessionId === session.id || note.scopeRefId === session.id)
      .filter((note) => canViewNote(note, session, user))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    const limitedNotes = maxItems ? visibleNotes.slice(0, maxItems) : visibleNotes;
    const itemTemplate = typeof output.itemTemplate === 'string' && output.itemTemplate.trim() ? output.itemTemplate : '- @note.content';
    const renderedItems = limitedNotes
      .map((note, index) =>
        renderDiscordTemplate(itemTemplate, {
          ...context,
          note,
          item: note,
          index,
          position: index + 1
        }).trim()
      )
      .filter(Boolean);

    const header = renderDiscordTemplate(output.template || '', context).trim();
    const content =
      renderedItems.length > 0
        ? [header, renderedItems.join('\n')].filter(Boolean).join('\n')
        : renderDiscordTemplate(output.emptyTemplate || output.template || 'Aucune note.', context).trim();

    return {
      key: output.key,
      label: output.label,
      format: output.format,
      visibility,
      content,
      characterId: character?.id || null,
      sessionId: session.id
    };
  }

  if (output.sourceType === 'view') {
    const content = renderDiscordTemplate(output.template, context).trim() || renderDiscordTemplate(output.emptyTemplate || '', context).trim();
    return {
      key: output.key,
      label: output.label,
      format: output.format,
      visibility,
      content,
      characterId: character?.id || null,
      sessionId: session.id
    };
  }

  throw new Error('Ce type de sortie Discord n est pas encore pris en charge dans cette phase lecture seule.');
}

function pushDiscordSessionEvent(kind, session) {
  if (!session?.discordIntegration?.guildId) {
    return null;
  }
  return pushDiscordBotEvent('session.discord.sync', {
    kind,
    session: buildSessionDiscordPayload(session)
  });
}

function resyncDiscordSessionsForUser(userId) {
  if (!userId) {
    return 0;
  }

  let count = 0;
  for (const session of sessions.values()) {
    if (!session?.discordIntegration?.guildId) {
      continue;
    }

    const isConcerned =
      session.ownerUserId === userId ||
      session.gmUserId === userId ||
      (session.gmUserIds || []).includes(userId) ||
      (session.participants || []).some((participant) => participant.userId === userId) ||
      (session.invitations || []).some((invitation) => invitation.userId === userId && invitation.status === 'pending');

    if (!isConcerned) {
      continue;
    }

    pushDiscordSessionEvent(session.archivedAt ? 'archive' : 'upsert', session);
    count += 1;
  }

  return count;
}

function buildDiscordInvitationActionUrl(token, response) {
  const base = `${API_BASE_URL.replace(/\/$/, '')}/api/sessions/invitations/respond`;
  const params = new URLSearchParams({
    token,
    response
  });
  return `${base}?${params.toString()}`;
}

function pushDiscordSessionInvitationEvent(session, invitation) {
  if (!session || !invitation?.id || invitation.status !== 'pending' || !invitation.discordActionToken) {
    return null;
  }
  const invitedUser = users.get(invitation.userId);
  if (!invitedUser?.discordUserId) {
    return null;
  }
  const invitedBy = users.get(invitation.invitedByUserId);
  return pushDiscordBotEvent('session.invitation.created', {
    session: {
      id: session.id,
      name: session.name,
      description: session.description || ''
    },
    invitation: {
      id: invitation.id,
      userId: invitation.userId,
      role: invitation.role,
      status: invitation.status,
      createdAt: invitation.createdAt,
      invitedByUserId: invitation.invitedByUserId,
      invitedByDisplayName: invitedBy?.displayName || invitation.invitedByUserId,
      invitedByNickname: invitedBy?.nickname || null,
      acceptUrl: buildDiscordInvitationActionUrl(invitation.discordActionToken, 'accept'),
      declineUrl: buildDiscordInvitationActionUrl(invitation.discordActionToken, 'decline')
    },
    targetDiscordUser: {
      id: invitedUser.discordUserId,
      username: invitedUser.discordUsername || null,
      globalName: invitedUser.discordGlobalName || null
    }
  });
}

function appendSessionActivity(session, params) {
  const actorUser = params.actorUserId ? users.get(params.actorUserId) : null;
  const nextEntry = {
    id: makeId('session-activity'),
    type: params.type,
    actorUserId: params.actorUserId || null,
    actorNickname: actorUser?.nickname || null,
    message: params.message,
    createdAt: nowIso()
  };
  const current = Array.isArray(session.activityLog) ? session.activityLog : [];
  return [nextEntry, ...current].slice(0, 80);
}

function normalizeSessionParticipantsOnServer(participants, fallbackOwnerUserId) {
  const seen = new Set();
  const normalized = (Array.isArray(participants) ? participants : [])
    .filter((participant) => participant && typeof participant.userId === 'string' && participant.userId)
    .map((participant) => ({
      ...participant,
      role: participant.role === 'gm' || participant.role === 'observer' ? participant.role : 'player',
      characterId: participant.characterId || null
    }))
    .filter((participant) => {
      if (seen.has(participant.userId)) {
        return false;
      }
      seen.add(participant.userId);
      return true;
    });

  if (!normalized.some((participant) => participant.role === 'gm')) {
    const ownerIndex = normalized.findIndex((participant) => participant.userId === fallbackOwnerUserId);
    if (ownerIndex >= 0) {
      normalized[ownerIndex] = { ...normalized[ownerIndex], role: 'gm' };
    } else if (fallbackOwnerUserId) {
      normalized.unshift({ userId: fallbackOwnerUserId, role: 'gm', characterId: null, isConnected: false, lastSeenAt: null });
    }
  }

  return normalized;
}

function replaceReservedTokens(value, context) {
  if (typeof value !== 'string') {
    return '';
  }
  if (!context) {
    return value;
  }
  return value.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, token) => context[token] || '');
}

function buildCharacterSheetFromStudioView(view, system, characterId, preferredName, templateContext = null) {
  const groupId = `${view.id}_main`;
  const groups = [{ id: groupId, label: view.name, layout: 'grid' }];
  const fields = [];
  let portraitUrl;

  for (const node of view.nodes || []) {
    const fieldId = node.key || node.label || node.id;

    if (node.type === 'image' && !portraitUrl) {
      const imageValue = typeof node.defaultValue === 'string' ? node.defaultValue : typeof node.reference === 'string' ? node.reference : '';
      if (imageValue) {
        portraitUrl = replaceReservedTokens(imageValue, templateContext);
      }
      continue;
    }

    if (node.type === 'number') {
      fields.push({
        id: fieldId,
        label: node.label,
        type: 'number',
        value: Number.isFinite(Number(node.defaultValue)) ? Number(node.defaultValue) : 0,
        groupId
      });
      continue;
    }

    if (node.type === 'progress') {
      fields.push({
        id: fieldId,
        label: node.label,
        type: 'resource',
        value: Number.isFinite(Number(node.defaultValue)) ? Number(node.defaultValue) : 0,
        max: 100,
        groupId
      });
      continue;
    }

    if (node.type === 'checkbox') {
      fields.push({
        id: fieldId,
        label: node.label,
        type: 'tag',
        value: node.defaultValue ? 'Oui' : 'Non',
        groupId
      });
      continue;
    }

    if (node.type === 'select') {
      fields.push({
        id: fieldId,
        label: node.label,
        type: 'select',
        value: typeof node.defaultValue === 'string' ? node.defaultValue : '',
        options: (node.options || []).map((option) => {
          const [rawKey, rawLabel] = option.split('=>').map((item) => item.trim());
          return { key: rawKey || option.trim(), label: rawLabel || rawKey || option.trim() };
        }),
        groupId
      });
      continue;
    }

    if (node.type === 'multiselect') {
      fields.push({
        id: fieldId,
        label: node.label,
        type: 'multiselect',
        value: typeof node.defaultValue === 'string' ? node.defaultValue : '',
        options: (node.options || []).map((option) => {
          const [rawKey, rawLabel] = option.split('=>').map((item) => item.trim());
          return { key: rawKey || option.trim(), label: rawLabel || rawKey || option.trim() };
        }),
        groupId
      });
      continue;
    }

    if (['text', 'textarea', 'date', 'time'].includes(node.type)) {
      fields.push({
        id: fieldId,
        label: node.label,
        type: node.type === 'textarea' ? 'textarea' : 'text',
        value: replaceReservedTokens(typeof node.defaultValue === 'string' ? node.defaultValue : '', templateContext),
        ...(node.type === 'textarea' ? { rows: 4 } : {}),
        groupId
      });
    }
  }

  const generatedActions = (system.rulesProgram || [])
    .filter((block) => block.type === 'define_roll')
    .map((block) => ({
      id: block.actionId,
      label: block.label,
      description: block.description,
      rollFormula: `${block.diceCount}d${block.diceSides}`,
      rollConfig: {
        sourceBlockId: block.id,
        diceCount: block.diceCount,
        diceSides: block.diceSides,
        modifierFieldId: block.modifierFieldId,
        flatModifier: block.flatModifier
      }
    }));

  return {
    id: characterId,
    name: replaceReservedTokens(typeof preferredName === 'string' && preferredName.trim() ? preferredName.trim() : view.defaultSheetNameTemplate || view.name, templateContext),
    portraitUrl,
    groups,
    fields,
    actions: generatedActions
  };
}

function canViewMessage(message, session, user) {
  if (!message || !session || !user) {
    return false;
  }
  if (!canViewSession(session, user)) {
    return false;
  }
  if (user.roles.includes('admin') || getSessionGmUserIds(session).includes(user.id)) {
    return true;
  }
  if (message.channelType === 'system' || message.channelType === 'global') {
    return true;
  }
  if (message.fromUserId === user.id) {
    return true;
  }
  if (Array.isArray(message.toUserIds) && message.toUserIds.includes(user.id)) {
    return true;
  }
  return false;
}

function publicMessage(message) {
  return clone(message);
}

function publicNewsItem(item) {
  const authorUser = users.get(item.createdByUserId);
  return {
    ...clone(item),
    createdByNickname: item.createdByNickname || authorUser?.nickname || null
  };
}

function publicAnnouncement(item) {
  return clone(item);
}

function pushDiscordAnnouncementEvent(kind, item) {
  return pushDiscordBotEvent('announcement.sync', {
    kind,
    announcement: item ? publicAnnouncement(item) : null
  });
}

function toAnnouncementSystemLabel(systemId, fallbackName = '') {
  if (systemId && systems.has(systemId)) {
    return systems.get(systemId).name;
  }
  return String(fallbackName || '').trim() || 'Système libre';
}

const ANNOUNCEMENT_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ANNOUNCEMENT_TIME_SLOTS = ['morning', 'midday', 'afternoon', 'late_afternoon', 'evening'];
const ANNOUNCEMENT_PERIODICITIES = ['one_shot', 'weekly', 'biweekly', 'monthly', 'irregular'];

function sanitizeAnnouncementList(values, allowed) {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values.filter((item) => typeof item === 'string' && allowed.includes(item))));
}

function parseAnnouncementQueryList(raw, allowed) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => allowed.includes(item))
    )
  );
}

function buildAnnouncementSummary(item) {
  const authorLabel = item.authorNickname || item.authorUserId || 'Utilisateur';
  const systemLabel = toAnnouncementSystemLabel(item.systemId, item.systemName);
  if (item.type === 'gm_looking_for_players') {
    const slots = Math.max(1, Number(item.playerSlotsWanted || 1));
    return `Je suis le MJ ${authorLabel}, et je recherche ${slots} joueur${slots > 1 ? 's' : ''} pour le JDR : ${systemLabel}.`;
  }
  return `Je suis le joueur ${authorLabel}, et je recherche une partie de JDR : ${systemLabel}.`;
}

function sanitizeAnnouncementPayload(body, user) {
  const type = body.type === 'gm_looking_for_players' ? 'gm_looking_for_players' : 'player_looking_for_game';
  const systemId = typeof body.systemId === 'string' && body.systemId.trim() ? body.systemId.trim() : null;
  const systemName = typeof body.systemName === 'string' ? body.systemName.trim().slice(0, 120) : '';
  const language = typeof body.language === 'string' ? body.language.trim().slice(0, 40) : 'fr';
  const playMode = ['online', 'onsite', 'hybrid'].includes(body.playMode) ? body.playMode : 'online';
  const playerSlotsWanted = type === 'gm_looking_for_players' ? Math.max(1, Math.min(12, Number(body.playerSlotsWanted || 1))) : null;
  const daysOfWeek = sanitizeAnnouncementList(body.daysOfWeek, ANNOUNCEMENT_DAYS);
  const timeSlots = sanitizeAnnouncementList(body.timeSlots, ANNOUNCEMENT_TIME_SLOTS);
  const periodicity = ANNOUNCEMENT_PERIODICITIES.includes(body.periodicity) ? body.periodicity : null;
  const status = ['open', 'closed'].includes(body.status) ? body.status : 'open';
  const base = {
    type,
    systemId,
    systemName,
    language,
    playMode,
    playerSlotsWanted,
    daysOfWeek,
    timeSlots,
    periodicity,
    status,
    authorUserId: user.id,
    authorDisplayName: user.displayName,
    authorNickname: user.nickname || null
  };
  return {
    ...base,
    summary: buildAnnouncementSummary(base)
  };
}

function buildHomeStats() {
  const runningSessions = [...sessions.values()].filter((session) => !session.archivedAt && session.state === 'running').length;
  const activePlayers = [...users.values()].filter((user) => user.isActive && user.approvalStatus === 'approved' && user.roles.includes('player')).length;
  const activeGms = [...users.values()].filter((user) => user.isActive && user.approvalStatus === 'approved' && user.roles.includes('gm')).length;
  const playersLookingForGame = [...announcements.values()].filter(
    (announcement) => announcement.status === 'open' && announcement.type === 'player_looking_for_game'
  ).length;
  return {
    runningSessions,
    activePlayers,
    activeGms,
    playersLookingForGame,
    systemsCount: systems.size,
    approvedUsers: [...users.values()].filter((user) => user.isActive && user.approvalStatus === 'approved').length
  };
}

function canUseSocialFeatures(user) {
  return Boolean(user && user.isActive && user.approvalStatus === 'approved');
}

function getLinkBetweenUsers(userAId, userBId, type) {
  return [...socialLinks.values()].find((link) => {
    if (link.type !== type) {
      return false;
    }
    if (type === 'friend_request') {
      return link.ownerUserId === userAId && link.targetUserId === userBId;
    }
    return link.ownerUserId === userAId && link.targetUserId === userBId;
  }) || null;
}

function areFriends(userAId, userBId) {
  return (
    Boolean(getLinkBetweenUsers(userAId, userBId, 'friend')) ||
    Boolean(getLinkBetweenUsers(userBId, userAId, 'friend'))
  );
}

function isIgnoredBy(ignoreOwnerId, targetUserId) {
  return Boolean(getLinkBetweenUsers(ignoreOwnerId, targetUserId, 'ignored'));
}

function canDirectMessageUsers(fromUserId, toUserId) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    return false;
  }
  if (isIgnoredBy(fromUserId, toUserId) || isIgnoredBy(toUserId, fromUserId)) {
    return false;
  }
  return true;
}

function publicSocialUser(user, currentUser) {
  return {
    id: user.id,
    nickname: user.nickname || null,
    displayName: user.displayName,
    avatarUrl: publicUser(user).avatarUrl || null,
    roles: user.roles,
    isFriend: areFriends(currentUser.id, user.id),
    isIgnored: isIgnoredBy(currentUser.id, user.id),
    hasIncomingFriendRequest: Boolean(getLinkBetweenUsers(user.id, currentUser.id, 'friend_request')),
    hasOutgoingFriendRequest: Boolean(getLinkBetweenUsers(currentUser.id, user.id, 'friend_request'))
  };
}

function publicSocialMessage(message) {
  return clone(message);
}

function publicSocialReport(report) {
  return clone(report);
}

function canViewNote(note, session, user) {
  if (!note || !session || !user) {
    return false;
  }
  if (!canViewSession(session, user)) {
    return false;
  }
  if (user.roles.includes('admin')) {
    return true;
  }
  if (note.type === 'public') {
    return true;
  }
  if (note.type === 'gm_private') {
    return getSessionGmUserIds(session).includes(user.id);
  }
  return note.ownerUserId === user.id || note.createdByUserId === user.id;
}

function canEditNote(note, session, user) {
  if (!note || !session || !user) {
    return false;
  }
  if (user.roles.includes('admin')) {
    return true;
  }
  if (note.type === 'gm_private') {
    return getSessionGmUserIds(session).includes(user.id) && note.createdByUserId === user.id;
  }
  return note.ownerUserId === user.id || note.createdByUserId === user.id || (note.type === 'public' && getSessionGmUserIds(session).includes(user.id));
}

function publicNote(note) {
  return clone(note);
}

function sanitizeResourceName(value, fallback = 'resource') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}._ -]+/gu, '')
    .slice(0, 120);
  return cleaned || fallback;
}

function sanitizeFolderName(value, fallback = 'Nouveau dossier') {
  return sanitizeResourceName(value, fallback).replace(/\.[^.]+$/u, '').slice(0, 80);
}

function getNormalizedExtensionFromName(fileName) {
  if (typeof fileName !== 'string' || !fileName.includes('.')) {
    return '';
  }
  return `.${fileName.split('.').pop().toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

function inferMimeTypeFromName(fileName) {
  return RESOURCE_EXT_TO_MIME[getNormalizedExtensionFromName(fileName)] || '';
}

function isProbablyTextBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return false;
  }
  for (const byte of buffer.values()) {
    if (byte === 0) {
      return false;
    }
  }
  return true;
}

function validateBufferSignature(buffer, mimeType) {
  if (!buffer || buffer.length === 0) {
    return false;
  }
  switch (mimeType) {
    case 'image/png':
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/webp':
      return buffer.length >= 12 && buffer.subarray(0, 4).equals(Buffer.from('RIFF')) && buffer.subarray(8, 12).equals(Buffer.from('WEBP'));
    case 'image/gif':
      return buffer.length >= 6 && (buffer.subarray(0, 6).equals(Buffer.from('GIF87a')) || buffer.subarray(0, 6).equals(Buffer.from('GIF89a')));
    case 'application/pdf':
      return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('%PDF'));
    case 'text/plain':
    case 'text/markdown':
      return isProbablyTextBuffer(buffer);
    case 'application/json':
      if (!isProbablyTextBuffer(buffer)) {
        return false;
      }
      try {
        JSON.parse(buffer.toString('utf8'));
        return true;
      } catch {
        return false;
      }
    case 'video/mp4':
      return buffer.length >= 12 && buffer.subarray(4, 8).equals(Buffer.from('ftyp'));
    case 'video/webm':
    case 'audio/webm':
      return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case 'video/ogg':
    case 'audio/ogg':
      return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from('OggS'));
    case 'audio/mpeg':
      return (
        (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from('ID3'))) ||
        (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
      );
    case 'audio/wav':
      return buffer.length >= 12 && buffer.subarray(0, 4).equals(Buffer.from('RIFF')) && buffer.subarray(8, 12).equals(Buffer.from('WAVE'));
    case 'audio/mp4':
      return buffer.length >= 12 && buffer.subarray(4, 8).equals(Buffer.from('ftyp'));
    default:
      return false;
  }
}

function validateResourceUpload({ originalName, mimeType, buffer }) {
  const mimeTypeFromName = inferMimeTypeFromName(originalName);
  const declaredMimeType = typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim().toLowerCase() : '';
  const inferredMimeType =
    (declaredMimeType && RESOURCE_ALLOWED_TYPES[declaredMimeType] ? declaredMimeType : '') ||
    mimeTypeFromName ||
    declaredMimeType;
  const rule = RESOURCE_ALLOWED_TYPES[inferredMimeType];
  if (!rule) {
    return { ok: false, errorCode: 'RESOURCE_TYPE_FORBIDDEN', message: 'Type de fichier non autorisé.' };
  }

  const extension = getNormalizedExtensionFromName(originalName) || rule.defaultExtension;
  if (!rule.extensions.includes(extension)) {
    return { ok: false, errorCode: 'RESOURCE_EXTENSION_FORBIDDEN', message: 'Extension de fichier non autorisée.' };
  }

  if (!buffer || buffer.length === 0) {
    return { ok: false, errorCode: 'RESOURCE_CONTENT_EMPTY', message: 'Le fichier est vide.' };
  }

  if (buffer.length > rule.maxSizeBytes) {
    return { ok: false, errorCode: 'RESOURCE_TOO_LARGE', message: `Le fichier dépasse la limite autorisée (${Math.round(rule.maxSizeBytes / 1024 / 1024)} Mo).` };
  }

  if (!validateBufferSignature(buffer, inferredMimeType)) {
    return { ok: false, errorCode: 'RESOURCE_SIGNATURE_INVALID', message: 'Le contenu du fichier ne correspond pas au type déclaré.' };
  }

  return {
    ok: true,
    kind: rule.kind,
    mimeType: inferredMimeType,
    extension
  };
}

function normalizeResourceRecord(resource) {
  if (!resource || typeof resource !== 'object') {
    return;
  }
  resource.scopeType = normalizeResourceScopeType(resource.scopeType);
  resource.visibility = resource.visibility === 'public' || resource.visibility === 'shared' ? resource.visibility : 'private';
  resource.sharedWithUserIds = Array.isArray(resource.sharedWithUserIds)
    ? Array.from(new Set(resource.sharedWithUserIds.filter((item) => typeof item === 'string' && item)))
    : [];
  resource.kind =
    resource.kind === 'image' ||
    resource.kind === 'pdf' ||
    resource.kind === 'text' ||
    resource.kind === 'video' ||
    resource.kind === 'audio'
      ? resource.kind
      : 'text';
  resource.folderId = typeof resource.folderId === 'string' && resource.folderId.trim() ? resource.folderId.trim() : null;
  resource.thumbnailPath = typeof resource.thumbnailPath === 'string' && resource.thumbnailPath.trim() ? resource.thumbnailPath.trim() : null;
  resource.previewPath = typeof resource.previewPath === 'string' && resource.previewPath.trim() ? resource.previewPath.trim() : null;
  resource.canReshareInSession = typeof resource.canReshareInSession === 'boolean' ? resource.canReshareInSession : true;
  if (resource.scopeType === 'session') {
    resource.sessionAudience = SESSION_RESOURCE_AUDIENCES.includes(resource.sessionAudience) ? resource.sessionAudience : 'session_all';
    resource.sessionMemberUserIds = Array.isArray(resource.sessionMemberUserIds)
      ? Array.from(new Set(resource.sessionMemberUserIds.filter((item) => typeof item === 'string' && item)))
      : [];
    resource.visibility = 'private';
  } else {
    resource.sessionAudience = null;
    resource.sessionMemberUserIds = [];
  }
}

async function generateImageDerivatives(resource, absolutePath) {
  if (!resource || resource.kind !== 'image' || !absolutePath || !existsSync(absolutePath)) {
    return;
  }

  const previewRelativePath = `${resource.id}-preview.webp`;
  const thumbnailRelativePath = `${resource.id}-thumb.webp`;
  const previewAbsolutePath = path.join(RESOURCE_DIR, previewRelativePath);
  const thumbnailAbsolutePath = path.join(RESOURCE_DIR, thumbnailRelativePath);

  try {
    await sharp(absolutePath)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 84 })
      .toFile(previewAbsolutePath);

    await sharp(absolutePath)
      .rotate()
      .resize({
        width: 320,
        height: 320,
        fit: 'cover',
        position: 'attention'
      })
      .webp({ quality: 76 })
      .toFile(thumbnailAbsolutePath);

    resource.previewPath = previewRelativePath;
    resource.thumbnailPath = thumbnailRelativePath;
  } catch (error) {
    console.warn('[nexusforge-backend] derivative generation failed', resource.id, error instanceof Error ? error.message : error);
    deleteStoredDerivativeFile(previewRelativePath);
    deleteStoredDerivativeFile(thumbnailRelativePath);
    resource.previewPath = null;
    resource.thumbnailPath = null;
  }
}

async function backfillMissingResourceDerivatives() {
  let generatedCount = 0;
  for (const resource of resources.values()) {
    normalizeResourceRecord(resource);
    if (resource.kind !== 'image' || !resource.storagePath) {
      continue;
    }
    if (resource.thumbnailPath && resource.previewPath) {
      continue;
    }
    const absolutePath = path.join(RESOURCE_DIR, resource.storagePath);
    if (!existsSync(absolutePath)) {
      continue;
    }
    await generateImageDerivatives(resource, absolutePath);
    if (resource.thumbnailPath || resource.previewPath) {
      generatedCount += 1;
    }
  }
  if (generatedCount > 0) {
    schedulePersist('resource-derivative-backfill');
    // eslint-disable-next-line no-console
    console.log(`[nexusforge-backend] generated derivatives for ${generatedCount} resource(s)`);
  }
}

function normalizeResourceFolder(folder) {
  if (!folder || typeof folder !== 'object') {
    return;
  }
  folder.scopeType = normalizeResourceScopeType(folder.scopeType);
  folder.parentFolderId = typeof folder.parentFolderId === 'string' && folder.parentFolderId.trim() ? folder.parentFolderId.trim() : null;
  folder.name = sanitizeFolderName(folder.name, 'Nouveau dossier');
  folder.visibilityHint = RESOURCE_FOLDER_VISIBILITIES.includes(folder.visibilityHint) ? folder.visibilityHint : 'all';
  folder.defaultType = typeof folder.defaultType === 'string' ? folder.defaultType : null;
  folder.sessionMemberUserId = typeof folder.sessionMemberUserId === 'string' && folder.sessionMemberUserId.trim() ? folder.sessionMemberUserId.trim() : null;
}

function getResourceExtension(resource) {
  const extension = getNormalizedExtensionFromName(resource.originalName || resource.name);
  if (extension) {
    return extension;
  }
  return RESOURCE_ALLOWED_TYPES[String(resource.mimeType || '').toLowerCase()]?.defaultExtension || '';
}

function isSessionParticipant(session, userId) {
  return (session.participants || []).some((participant) => participant.userId === userId);
}

function getParticipantFolderDisplayName(session, userId) {
  const participant = (session.participants || []).find((entry) => entry.userId === userId);
  if (participant?.nickname) {
    return participant.nickname;
  }
  const linkedUser = users.get(userId);
  return linkedUser?.nickname || linkedUser?.displayName || participant?.displayName || userId;
}

function ensureSessionDefaultResourceFolders(session) {
  if (!session?.id) {
    return;
  }
  const ownerUserId = session.ownerUserId || session.gmUserId;
  const ensureFolder = (id, values) => {
    const current = resourceFolders.get(id);
    const next = {
      id,
      ownerUserId,
      scopeType: 'session',
      scopeRefId: session.id,
      parentFolderId: null,
      createdAt: current?.createdAt || nowIso(),
      updatedAt: nowIso(),
      ...current,
      ...values
    };
    normalizeResourceFolder(next);
    resourceFolders.set(id, next);
  };

  ensureFolder(`folder-session-${session.id}-common`, {
    name: 'Commun',
    visibilityHint: 'all',
    defaultType: 'session_common'
  });
  ensureFolder(`folder-session-${session.id}-gm`, {
    name: 'MJ uniquement',
    visibilityHint: 'gm',
    defaultType: 'session_gm'
  });
  const participantIds = Array.from(new Set([...(session.participants || []).map((participant) => participant.userId).filter(Boolean), ...getSessionGmUserIds(session)]));
  for (const userId of participantIds) {
    ensureFolder(`folder-session-${session.id}-member-${userId}`, {
      name: getParticipantFolderDisplayName(session, userId),
      visibilityHint: 'participant',
      defaultType: 'session_member',
      sessionMemberUserId: userId
    });
  }
}

function canViewResourceFolder(folder, user) {
  if (!folder || !user) {
    return false;
  }
  if (user.roles.includes('admin') || folder.ownerUserId === user.id) {
    return true;
  }
  if (folder.scopeType === 'system' && folder.scopeRefId) {
    const system = systems.get(folder.scopeRefId);
    return Boolean(system && canViewSystem(system, user));
  }
  if (folder.scopeType === 'session' && folder.scopeRefId) {
    const session = sessions.get(folder.scopeRefId);
    if (!session || !canViewSession(session, user)) {
      return false;
    }
    if (folder.visibilityHint === 'gm') {
      return getSessionGmUserIds(session).includes(user.id);
    }
    if (folder.visibilityHint === 'participant') {
      return getSessionGmUserIds(session).includes(user.id) || folder.sessionMemberUserId === user.id;
    }
    return true;
  }
  return false;
}

function canEditResourceFolder(folder, user) {
  if (!folder || !user) {
    return false;
  }
  if (user.roles.includes('admin') || folder.ownerUserId === user.id) {
    return true;
  }
  if (folder.scopeType === 'system' && folder.scopeRefId) {
    const system = systems.get(folder.scopeRefId);
    return Boolean(system && canEditSystem(system, user));
  }
  if (folder.scopeType === 'session' && folder.scopeRefId) {
    const session = sessions.get(folder.scopeRefId);
    if (!session) {
      return false;
    }
    if (folder.defaultType) {
      return canManageSession(session, user);
    }
    return canManageSession(session, user) || folder.sessionMemberUserId === user.id;
  }
  return false;
}

function validateResourceFolderReference({ folderId, scopeType, scopeRefId, user }) {
  if (!folderId) {
    return { ok: true, folder: null };
  }
  const folder = resourceFolders.get(folderId);
  if (!folder) {
    return { ok: false, errorCode: 'RESOURCE_FOLDER_NOT_FOUND', message: 'Dossier introuvable.' };
  }
  if (!canViewResourceFolder(folder, user)) {
    return { ok: false, errorCode: 'RESOURCE_FOLDER_FORBIDDEN', message: 'Dossier inaccessible.' };
  }
  if (folder.scopeType !== scopeType || (folder.scopeRefId || null) !== (scopeRefId || null)) {
    return { ok: false, errorCode: 'RESOURCE_FOLDER_SCOPE_MISMATCH', message: 'Le dossier ne correspond pas à la portée choisie.' };
  }
  return { ok: true, folder };
}

function canViewResource(resource, user) {
  if (!resource || !user) {
    return false;
  }
  normalizeResourceRecord(resource);
  if (user.roles.includes('admin') || resource.ownerUserId === user.id) {
    return true;
  }
  if (resource.scopeType === 'session' && resource.scopeRefId) {
    const session = sessions.get(resource.scopeRefId);
    if (!session || !canViewSession(session, user)) {
      return false;
    }
    if (resource.folderId) {
      const folder = resourceFolders.get(resource.folderId);
      if (folder && !canUserAccessSessionFolder(session, folder, user)) {
        return false;
      }
    }
    if (resource.sessionAudience === 'session_gm') {
      return getSessionGmUserIds(session).includes(user.id);
    }
    if (resource.sessionAudience === 'session_member') {
      return getSessionGmUserIds(session).includes(user.id) || (resource.sessionMemberUserIds || []).includes(user.id);
    }
    if (resource.sessionAudience === 'private') {
      return false;
    }
    return true;
  }
  if (resource.visibility === 'public') {
    return true;
  }
  if (Array.isArray(resource.sharedWithUserIds) && resource.sharedWithUserIds.includes(user.id)) {
    return true;
  }
  if (resource.scopeType === 'system' && resource.scopeRefId) {
    const system = systems.get(resource.scopeRefId);
    return Boolean(system && canViewSystem(system, user));
  }
  return false;
}

function canEditResource(resource, user) {
  if (!resource || !user) {
    return false;
  }
  if (user.roles.includes('admin') || resource.ownerUserId === user.id) {
    return true;
  }
  if (resource.scopeType === 'system' && resource.scopeRefId) {
    const system = systems.get(resource.scopeRefId);
    return Boolean(system && canEditSystem(system, user));
  }
  if (resource.scopeType === 'session' && resource.scopeRefId) {
    const session = sessions.get(resource.scopeRefId);
    return Boolean(session && canManageSession(session, user));
  }
  return false;
}

function canManageResourceShare(resource, user) {
  if (!resource || !user) {
    return false;
  }
  if (canEditResource(resource, user)) {
    return true;
  }
  if (resource.scopeType === 'session' && resource.scopeRefId) {
    const session = sessions.get(resource.scopeRefId);
    if (!session || !canViewSession(session, user)) {
      return false;
    }
    if (session.settings?.allowPlayerToPlayerDocuments === false) {
      return false;
    }
    return resource.canReshareInSession === true;
  }
  return false;
}

function canUserAccessSessionFolder(session, folder, user) {
  if (!session || !folder || !user) {
    return false;
  }
  if (!canViewSession(session, user)) {
    return false;
  }
  if (folder.visibilityHint === 'gm') {
    return getSessionGmUserIds(session).includes(user.id);
  }
  if (folder.visibilityHint === 'participant') {
    return getSessionGmUserIds(session).includes(user.id) || folder.sessionMemberUserId === user.id;
  }
  return true;
}

function publicResource(resource) {
  const ownerUser = users.get(resource.ownerUserId);
  const folder = resource.folderId ? resourceFolders.get(resource.folderId) : null;
  const scopeName =
    resource.scopeType === 'system' && resource.scopeRefId
      ? systems.get(resource.scopeRefId)?.name || null
      : resource.scopeType === 'session' && resource.scopeRefId
      ? sessions.get(resource.scopeRefId)?.name || null
      : null;
  return {
    ...clone(resource),
    ownerNickname: ownerUser?.nickname || null,
    folderName: folder?.name || null,
    scopeName,
    contentUrl: resource.storagePath ? `/api/resources/${resource.id}/content` : null,
    thumbnailUrl: resource.thumbnailPath ? `/api/resources/${resource.id}/thumbnail` : null,
    previewUrl: resource.previewPath ? `/api/resources/${resource.id}/preview` : null
  };
}

function publicResourceFolder(folder) {
  const scopeName =
    folder.scopeType === 'system' && folder.scopeRefId
      ? systems.get(folder.scopeRefId)?.name || null
      : folder.scopeType === 'session' && folder.scopeRefId
      ? sessions.get(folder.scopeRefId)?.name || null
      : null;
  return {
    ...clone(folder),
    scopeName
  };
}

async function sendVerificationEmail(user, token) {
  const verifyUrl = `${APP_BASE_URL.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  const apiVerifyUrl = `${API_BASE_URL.replace(/\/$/, '')}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: user.email,
    subject: 'NexusForge - Vérification de votre email',
    text: `Bonjour ${user.nickname},\n\nValidez votre email: ${verifyUrl}\n\nLien API direct (debug): ${apiVerifyUrl}\n\nCe lien expire dans 24h.`,
    html: `<p>Bonjour ${user.nickname},</p><p>Validez votre email: <a href="${verifyUrl}">${verifyUrl}</a></p><p>Lien API direct (debug): <a href="${apiVerifyUrl}">${apiVerifyUrl}</a></p><p>Ce lien expire dans 24h.</p>`
  });
}

async function sendResetPasswordEmail(user, token) {
  const resetUrl = `${APP_BASE_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: user.email,
    subject: 'NexusForge - Réinitialisation mot de passe',
    text: `Bonjour ${user.nickname},\n\nRéinitialisez votre mot de passe ici: ${resetUrl}\n\nCe lien expire dans 1h.`,
    html: `<p>Bonjour ${user.nickname},</p><p>Réinitialisez votre mot de passe ici: <a href="${resetUrl}">${resetUrl}</a></p><p>Ce lien expire dans 1h.</p>`
  });
}

function seedAdminAccount() {
  const adminId = 'user-admin-root';
  const passwordHash = bcrypt.hashSync(ROOT_ADMIN_PASSWORD, 12);
  const forceRootTotp = isValidBase32Secret(ROOT_ADMIN_TOTP_SECRET);

  const existing = usersByEmail.get(ROOT_ADMIN_EMAIL);
  if (existing) {
    const user = users.get(existing);
    if (!user) {
      usersByEmail.delete(ROOT_ADMIN_EMAIL);
      return seedAdminAccount();
    }
    ensureUserDefaults(user);
    user.roles = ['admin', 'gm', 'player'];
    user.approvalStatus = 'approved';
    user.isEmailVerified = true;
    user.isActive = true;
    user.isProtectedRootAdmin = true;
    user.nickname = ROOT_ADMIN_NICKNAME;
    user.firstName = ROOT_ADMIN_FIRST_NAME;
    user.lastName = ROOT_ADMIN_LAST_NAME;
    user.displayName = `${ROOT_ADMIN_NICKNAME} (${ROOT_ADMIN_FIRST_NAME} ${ROOT_ADMIN_LAST_NAME})`;
    if (forceRootTotp) {
      user.totpEnabled = true;
      user.totpSecret = ROOT_ADMIN_TOTP_SECRET;
      user.pendingTotpSecret = null;
    }
    return user;
  }

  const user = {
    id: adminId,
    firstName: ROOT_ADMIN_FIRST_NAME,
    lastName: ROOT_ADMIN_LAST_NAME,
    nickname: ROOT_ADMIN_NICKNAME,
    displayName: `${ROOT_ADMIN_NICKNAME} (${ROOT_ADMIN_FIRST_NAME} ${ROOT_ADMIN_LAST_NAME})`,
    email: ROOT_ADMIN_EMAIL,
    passwordHash,
    roles: ['admin', 'gm', 'player'],
    isEmailVerified: true,
    approvalStatus: 'approved',
    isProtectedRootAdmin: true,
    isActive: true,
    totpEnabled: forceRootTotp,
    totpSecret: forceRootTotp ? ROOT_ADMIN_TOTP_SECRET : null,
    pendingTotpSecret: null,
    failedLoginCount: 0,
    lockoutLevel: 0,
    lockedUntil: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  users.set(user.id, user);
  usersByEmail.set(user.email, user.id);
  return user;
}

loadPersistedState();
seedAdminAccount();
if (startupIntegrityReport?.status === 'warning') {
  pushDiscordBotEvent('backend.persistence_alert', {
    severity: 'warning',
    report: startupIntegrityReport
  });
}
schedulePersist('bootstrap');

process.on('SIGINT', () => {
  handleShutdownPersist('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  handleShutdownPersist('SIGTERM');
  process.exit(0);
});

process.on('SIGHUP', () => {
  handleShutdownPersist('SIGHUP');
  process.exit(0);
});

process.on('beforeExit', () => {
  handleShutdownPersist('beforeExit');
});

app.use((req, res, next) => {
  res.on('finish', () => {
    const shouldPersist =
      res.statusCode < 500 &&
      (req.method !== 'GET' || req.path === '/api/auth/verify-email' || req.path === '/api/auth/verify-email/');
    if (shouldPersist) {
      schedulePersist(`${req.method} ${req.path}`);
    }
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'nexusforge-backend',
    time: nowIso(),
    persistence: {
      pending: hasPendingPersist,
      lastPersistAt,
      lastPersistReason,
      lastPersistHash,
      persistLogFile: DATA_PERSIST_LOG_FILE
    },
    startupIntegrity: startupIntegrityReport
  });
});

app.get('/api/internal/ops/backup', requireBackupTriggerSecret, (req, res) => {
  const scriptPath = path.join(process.cwd(), 'scripts', 'run-production-backup.sh');
  if (!existsSync(scriptPath)) {
    return error(res, 500, 'BACKUP_SCRIPT_MISSING', 'Backup script is missing');
  }

  try {
    const stdout = execFileSync('/bin/bash', [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BACKUP_REMOTE_HOST,
        BACKUP_REMOTE_USER,
        BACKUP_REMOTE_DIR,
        BACKUP_SSH_KEY
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15 * 60 * 1000
    }).trim();

    let payload = { ok: true, raw: stdout };
    if (stdout) {
      try {
        payload = JSON.parse(stdout);
      } catch {
        payload = { ok: true, raw: stdout };
      }
    }
    return res.status(200).json(payload);
  } catch (cause) {
    const stderr = cause?.stderr ? String(cause.stderr).trim() : '';
    const stdout = cause?.stdout ? String(cause.stdout).trim() : '';
    return error(res, 500, 'BACKUP_FAILED', 'Backup execution failed', {
      stdout,
      stderr
    });
  }
});

app.post('/api/auth/register', authRegisterRateLimiter, async (req, res) => {
  const body = req.body || {};
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const nickname = String(body.nickname || '').trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');

  if (!firstName || !lastName || !nickname || !email || !password) {
    return error(res, 400, 'INVALID_REGISTRATION_PAYLOAD', 'firstName, lastName, nickname, email and password are required');
  }

  if (!isValidPersonName(firstName) || !isValidPersonName(lastName)) {
    return error(res, 400, 'INVALID_NAME', 'firstName and lastName are invalid');
  }

  if (!isValidNicknameValue(nickname)) {
    return error(res, 400, 'INVALID_NICKNAME', 'Nickname must use 2 to 30 letters, numbers or underscore');
  }

  if (!isValidEmail(email)) {
    return error(res, 400, 'INVALID_EMAIL', 'Email format is invalid');
  }

  if (!isValidPasswordStrength(password)) {
    return error(res, 400, 'WEAK_PASSWORD', 'Password must contain at least 10 characters, including letters and numbers');
  }

  if (usersByEmail.has(email)) {
    return error(res, 409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');
  }

  if (isNicknameTaken(nickname)) {
    return error(res, 409, 'NICKNAME_ALREADY_TAKEN', 'Nickname already used');
  }

  const user = {
    id: makeId('user'),
    firstName,
    lastName,
    nickname,
    displayName: `${nickname} (${firstName} ${lastName})`,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    roles: ['player'],
    isEmailVerified: false,
    approvalStatus: 'pending',
    isProtectedRootAdmin: false,
    isActive: true,
    totpEnabled: false,
    totpSecret: null,
    pendingTotpSecret: null,
    failedLoginCount: 0,
    lockoutLevel: 0,
    lockedUntil: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  users.set(user.id, user);
  usersByEmail.set(user.email, user.id);

  const verificationToken = makeToken();
  emailVerificationTokens.set(verificationToken, {
    userId: user.id,
    expiresAt: nowMs() + EMAIL_TOKEN_TTL_MS
  });
  schedulePersist('auth-register');

  await sendVerificationEmail(user, verificationToken);

  return res.status(201).json({
    status: 'pending_email_verification',
    message: 'Account created. Verify your email, then wait for admin approval.'
  });
});

app.post('/api/auth/resend-verification', authRecoveryRateLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !isValidEmail(email)) {
    return error(res, 400, 'INVALID_EMAIL', 'Email is required');
  }

  const userId = usersByEmail.get(email);
  const user = userId ? users.get(userId) : null;
  if (!user) {
    return res.status(200).json({ status: 'ok' });
  }

  if (user.isEmailVerified) {
    return res.status(200).json({ status: 'already_verified' });
  }

  const verificationToken = makeToken();
  emailVerificationTokens.set(verificationToken, {
    userId: user.id,
    expiresAt: nowMs() + EMAIL_TOKEN_TTL_MS
  });
  schedulePersist('auth-resend-verification');

  await sendVerificationEmail(user, verificationToken);
  return res.status(200).json({ status: 'sent' });
});

function applyVerifyToken(token) {
  const payload = emailVerificationTokens.get(token);
  if (!payload) {
    return { ok: false, code: 'INVALID_VERIFICATION_TOKEN', message: 'Token invalid' };
  }

  if (payload.expiresAt < nowMs()) {
    emailVerificationTokens.delete(token);
    return { ok: false, code: 'EXPIRED_VERIFICATION_TOKEN', message: 'Token expired' };
  }

  const user = users.get(payload.userId);
  if (!user) {
    emailVerificationTokens.delete(token);
    return { ok: false, code: 'USER_NOT_FOUND', message: 'User not found' };
  }

  user.isEmailVerified = true;
  user.updatedAt = nowIso();
  emailVerificationTokens.delete(token);
  if (user.approvalStatus === 'pending') {
    pushDiscordBotEvent('user.pending_validation', {
      user: {
        id: user.id,
        displayName: user.displayName,
        nickname: user.nickname,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  }
  return { ok: true, user };
}

app.post('/api/auth/verify-email', (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    return error(res, 400, 'INVALID_VERIFICATION_TOKEN', 'Token is required');
  }

  const result = applyVerifyToken(token);
  if (!result.ok) {
    return error(res, 400, result.code, result.message);
  }
  schedulePersist('auth-verify-email-post');

  return res.status(200).json({
    status: 'verified',
    approvalStatus: result.user.approvalStatus
  });
});

app.get('/api/auth/verify-email', (req, res) => {
  const token = String(req.query?.token || '').trim();
  if (!token) {
    return error(res, 400, 'INVALID_VERIFICATION_TOKEN', 'Token is required');
  }

  const result = applyVerifyToken(token);
  if (!result.ok) {
    return error(res, 400, result.code, result.message);
  }
  schedulePersist('auth-verify-email-get');

  return res.status(200).json({
    status: 'verified',
    approvalStatus: result.user.approvalStatus
  });
});

app.post('/api/auth/login', authLoginRateLimiter, async (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const totpCode = body.totpCode ? String(body.totpCode).trim() : '';
  const challengeToken = body.challengeToken ? String(body.challengeToken).trim() : '';

  if (!email || !password) {
    return error(res, 400, 'INVALID_CREDENTIALS', 'Email and password are required');
  }

  if (!isValidEmail(email)) {
    return error(res, 400, 'INVALID_EMAIL', 'Email format is invalid');
  }

  const userId = usersByEmail.get(email);
  const user = userId ? users.get(userId) : null;

  if (!user) {
    return error(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }

  const lock = getLockInfo(user);
  if (lock.isLocked) {
    return error(res, 423, 'ACCOUNT_LOCKED', 'Account temporarily locked after failed attempts', {
      retryAfterSeconds: Math.ceil(lock.remainingMs / 1000)
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    applyFailedLogin(user);
    user.updatedAt = nowIso();
    schedulePersist('auth-login-failed');
    return error(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }

  if (!user.isEmailVerified) {
    return error(res, 403, 'EMAIL_NOT_VERIFIED', 'Verify your email before login');
  }

  if (user.approvalStatus !== 'approved') {
    return error(res, 403, 'ACCOUNT_PENDING_APPROVAL', 'Your account is waiting for admin approval');
  }
  if (!user.isActive) {
    return error(res, 403, 'ACCOUNT_DISABLED', 'Your account has been disabled by admin');
  }

  if (user.totpEnabled) {
    if (!totpCode) {
      const token = makeToken();
      twoFactorChallenges.set(token, {
        userId: user.id,
        expiresAt: nowMs() + TWO_FACTOR_CHALLENGE_TTL_MS
      });
      schedulePersist('auth-login-2fa-challenge');
      return res.status(200).json({
        requiresTwoFactor: true,
        challengeToken: token,
        methods: ['totp']
      });
    }

    const challenge = twoFactorChallenges.get(challengeToken);
    if (!challenge || challenge.userId !== user.id || challenge.expiresAt < nowMs()) {
      return error(res, 401, 'INVALID_2FA_CHALLENGE', 'Two-factor challenge expired or invalid');
    }

    if (!verifyTotpCode(user.totpSecret, totpCode)) {
      return error(res, 401, 'INVALID_2FA_CODE', 'Invalid two-factor code');
    }

    twoFactorChallenges.delete(challengeToken);
    schedulePersist('auth-login-2fa-consumed');
  }

  clearLoginFailures(user);
  user.updatedAt = nowIso();

  const { token, refreshToken } = issueTokens(user);
  schedulePersist('auth-login-success');
  return res.status(200).json({ token, refreshToken, user: publicUser(user) });
});

app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken || !refreshTokens.has(refreshToken)) {
    return error(res, 401, 'REFRESH_TOKEN_REVOKED', 'Refresh token is invalid or revoked');
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = users.get(payload.sub);
    if (!user) {
      refreshTokens.delete(refreshToken);
      return error(res, 401, 'UNAUTHENTICATED', 'Unknown user');
    }
    if (!user.isActive) {
      refreshTokens.delete(refreshToken);
      return error(res, 403, 'ACCOUNT_DISABLED', 'Account disabled by admin');
    }

    refreshTokens.delete(refreshToken);
    const next = issueTokens(user);
    schedulePersist('auth-refresh');
    return res.status(200).json(next);
  } catch {
    refreshTokens.delete(refreshToken);
    return error(res, 401, 'UNAUTHENTICATED', 'Refresh token invalid');
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.status(200).json({ user: publicUser(req.currentUser) });
});

app.post('/api/auth/discord/link/start', requireAuth, (req, res) => {
  if (!isDiscordOauthConfigured()) {
    return error(res, 503, 'DISCORD_OAUTH_NOT_CONFIGURED', 'Discord OAuth2 is not configured');
  }

  const state = makeStateToken();
  discordOauthStates.set(state, {
    userId: req.currentUser.id,
    createdAt: nowMs(),
    expiresAt: nowMs() + 10 * 60 * 1000
  });
  schedulePersist('discord-oauth-start');

  return res.status(200).json({
    authorizationUrl: buildDiscordAuthorizeUrl(state),
    state,
    redirectUri: DISCORD_OAUTH_REDIRECT_URI
  });
});

app.post('/api/auth/discord/link/callback', requireAuth, async (req, res) => {
  if (!isDiscordOauthConfigured()) {
    return error(res, 503, 'DISCORD_OAUTH_NOT_CONFIGURED', 'Discord OAuth2 is not configured');
  }

  const code = String(req.body?.code || '').trim();
  const state = String(req.body?.state || '').trim();
  if (!code || !state) {
    return error(res, 400, 'DISCORD_OAUTH_INVALID_PAYLOAD', 'Discord OAuth2 code and state are required');
  }

  const oauthState = discordOauthStates.get(state);
  discordOauthStates.delete(state);
  if (!oauthState || oauthState.userId !== req.currentUser.id || oauthState.expiresAt < nowMs()) {
    return error(res, 400, 'DISCORD_OAUTH_INVALID_STATE', 'Discord OAuth2 state is invalid or expired');
  }

  let profile;
  try {
    profile = await exchangeDiscordAuthorizationCode(code);
  } catch {
    return error(res, 502, 'DISCORD_OAUTH_EXCHANGE_FAILED', 'Discord OAuth2 exchange failed');
  }

  const linkedElsewhere = [...users.values()].find((candidate) => candidate.id !== req.currentUser.id && candidate.discordUserId === profile.id);
  if (linkedElsewhere) {
    return error(res, 409, 'DISCORD_ALREADY_LINKED', 'Ce compte Discord est déjà lié à un autre compte Nexus Forge');
  }

  req.currentUser.discordUserId = profile.id;
  req.currentUser.discordUsername = profile.username;
  req.currentUser.discordGlobalName = typeof profile.global_name === 'string' ? profile.global_name : null;
  req.currentUser.discordAvatar = typeof profile.avatar === 'string' ? profile.avatar : null;
  req.currentUser.discordGuilds = Array.isArray(profile.guilds) ? profile.guilds : [];
  req.currentUser.discordLinkedAt = nowIso();
  req.currentUser.updatedAt = nowIso();
  resyncDiscordSessionsForUser(req.currentUser.id);
  schedulePersist('discord-oauth-link');

  return res.status(200).json({ user: publicUser(req.currentUser) });
});

app.delete('/api/auth/discord/link', requireAuth, (req, res) => {
  const currentUserId = req.currentUser.id;
  req.currentUser.discordUserId = null;
  req.currentUser.discordUsername = null;
  req.currentUser.discordGlobalName = null;
  req.currentUser.discordAvatar = null;
  req.currentUser.discordGuilds = [];
  req.currentUser.discordLinkedAt = null;
  req.currentUser.updatedAt = nowIso();
  resyncDiscordSessionsForUser(currentUserId);
  schedulePersist('discord-oauth-unlink');

  return res.status(200).json({ user: publicUser(req.currentUser) });
});

app.get('/api/auth/discord/mutual-guilds', requireAuth, async (req, res) => {
  if (!req.currentUser.discordUserId) {
    return res.status(200).json({ items: [] });
  }
  if (!DISCORD_BOT_SHARED_SECRET) {
    return res.status(200).json({ items: [] });
  }

  const knownGuilds = Array.isArray(req.currentUser.discordGuilds) ? req.currentUser.discordGuilds : [];
  try {
    const response = await fetch('https://bot.nexusforge.en-ligne.fr/api/internal/guilds', {
      headers: {
        'x-discord-bot-secret': DISCORD_BOT_SHARED_SECRET
      }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error('BOT_GUILDS_FETCH_FAILED');
    }
    const botGuilds = Array.isArray(payload?.items) ? payload.items : [];
    const botGuildMap = new Map(
      botGuilds
        .filter((guild) => guild && typeof guild.id === 'string')
        .map((guild) => [guild.id, { id: guild.id, name: typeof guild.name === 'string' ? guild.name : guild.id }])
    );
    const items = knownGuilds
      .filter((guild) => guild && typeof guild.id === 'string' && botGuildMap.has(guild.id))
      .map((guild) => botGuildMap.get(guild.id));
    return res.status(200).json({ items });
  } catch {
    return res.status(200).json({ items: [] });
  }
});

app.patch('/api/auth/me', requireAuth, (req, res) => {
  const user = req.currentUser;
  const body = req.body || {};

  const firstName = String(body.firstName ?? user.firstName ?? '').trim();
  const lastName = String(body.lastName ?? user.lastName ?? '').trim();
  const nickname = normalizeNickname(body.nickname ?? user.nickname ?? '');
  const avatarResourceId =
    typeof body.avatarResourceId === 'string' && body.avatarResourceId.trim()
      ? body.avatarResourceId.trim()
      : body.avatarResourceId === null
      ? null
      : user.avatarResourceId || null;
  const avatarUrl =
    typeof body.avatarUrl === 'string'
      ? body.avatarUrl.trim() || null
      : body.avatarUrl === null
      ? null
      : user.avatarUrl || null;

  if (!firstName || !lastName || !nickname) {
    return error(res, 400, 'INVALID_PROFILE_PAYLOAD', 'firstName, lastName and nickname are required');
  }

  if (!isValidPersonName(firstName) || !isValidPersonName(lastName)) {
    return error(res, 400, 'INVALID_NAME', 'firstName and lastName are invalid');
  }

  if (!isValidNicknameValue(nickname)) {
    return error(res, 400, 'INVALID_NICKNAME', 'Nickname must use only letters, numbers or underscore');
  }

  if (isNicknameTaken(nickname, user.id)) {
    return error(res, 409, 'NICKNAME_ALREADY_TAKEN', 'Nickname already used');
  }

  if (avatarResourceId) {
    const resource = resources.get(avatarResourceId);
    if (!resource) {
      return error(res, 404, 'RESOURCE_NOT_FOUND', 'Avatar resource not found');
    }
    if (!canViewResource(resource, user)) {
      return error(res, 403, 'RESOURCE_ACCESS_FORBIDDEN', 'Avatar resource forbidden');
    }
  }

  user.firstName = firstName;
  user.lastName = lastName;
  user.nickname = nickname;
  user.displayName = `${nickname} (${firstName} ${lastName})`;
  user.avatarResourceId = avatarResourceId;
  user.avatarUrl = avatarUrl;
  user.updatedAt = nowIso();
  schedulePersist('profile-update');

  return res.status(200).json({ user: publicUser(user) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    refreshTokens.delete(refreshToken);
    schedulePersist('auth-logout');
  }
  return res.status(204).send();
});

app.post('/api/auth/forgot-password', authRecoveryRateLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !isValidEmail(email)) {
    return error(res, 400, 'INVALID_EMAIL', 'Email is required');
  }

  const userId = usersByEmail.get(email);
  const user = userId ? users.get(userId) : null;

  if (user && user.isEmailVerified) {
    const resetToken = makeToken();
    passwordResetTokens.set(resetToken, {
      userId: user.id,
      expiresAt: nowMs() + RESET_TOKEN_TTL_MS
    });
    schedulePersist('auth-forgot-password');
    await sendResetPasswordEmail(user, resetToken);
  }

  return res.status(200).json({
    status: 'ok',
    message: 'If this email exists, a reset link has been sent.'
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const nextPassword = String(req.body?.password || '');

  if (!token || !nextPassword) {
    return error(res, 400, 'INVALID_RESET_PAYLOAD', 'token and password are required');
  }

  if (!isValidPasswordStrength(nextPassword)) {
    return error(res, 400, 'WEAK_PASSWORD', 'Password must contain at least 10 characters, including letters and numbers');
  }

  const reset = passwordResetTokens.get(token);
  if (!reset) {
    return error(res, 400, 'INVALID_RESET_TOKEN', 'Invalid reset token');
  }

  if (reset.expiresAt < nowMs()) {
    passwordResetTokens.delete(token);
    return error(res, 400, 'EXPIRED_RESET_TOKEN', 'Reset token expired');
  }

  const user = users.get(reset.userId);
  if (!user) {
    passwordResetTokens.delete(token);
    return error(res, 404, 'USER_NOT_FOUND', 'User not found');
  }

  user.passwordHash = await bcrypt.hash(nextPassword, 12);
  user.updatedAt = nowIso();
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  passwordResetTokens.delete(token);
  schedulePersist('auth-reset-password');

  return res.status(200).json({ status: 'password_updated' });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const nextPassword = String(req.body?.newPassword || '');

  if (!currentPassword || !nextPassword) {
    return error(res, 400, 'INVALID_PASSWORD_CHANGE_PAYLOAD', 'currentPassword and newPassword are required');
  }

  if (!isValidPasswordStrength(nextPassword)) {
    return error(res, 400, 'WEAK_PASSWORD', 'Password must contain at least 10 characters, including letters and numbers');
  }

  const user = req.currentUser;
  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    return error(res, 401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(nextPassword, 12);
  user.updatedAt = nowIso();
  schedulePersist('auth-change-password');
  return res.status(200).json({ status: 'password_updated' });
});

app.post('/api/auth/totp/setup', requireAuth, (req, res) => {
  const user = req.currentUser;
  const secret = authenticator.generateSecret();

  user.pendingTotpSecret = secret;
  user.updatedAt = nowIso();

  const issuer = 'NexusForge';
  const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
  schedulePersist('auth-totp-setup');

  return res.status(200).json({
    secret,
    otpauthUrl,
    recommended: true
  });
});

app.post('/api/auth/totp/enable', requireAuth, (req, res) => {
  const user = req.currentUser;
  const code = String(req.body?.code || '').trim();

  if (!user.pendingTotpSecret) {
    return error(res, 400, 'TOTP_SETUP_REQUIRED', 'Setup TOTP before enabling it');
  }

  if (!verifyTotpCode(user.pendingTotpSecret, code)) {
    return error(res, 400, 'INVALID_2FA_CODE', 'Invalid TOTP code');
  }

  user.totpSecret = user.pendingTotpSecret;
  user.pendingTotpSecret = null;
  user.totpEnabled = true;
  user.updatedAt = nowIso();
  schedulePersist('auth-totp-enable');

  return res.status(200).json({ status: 'totp_enabled' });
});

app.post('/api/auth/totp/disable', requireAuth, (req, res) => {
  const user = req.currentUser;
  const code = String(req.body?.code || '').trim();
  const rootTotpForced = Boolean(user.isProtectedRootAdmin && isValidBase32Secret(ROOT_ADMIN_TOTP_SECRET));

  if (rootTotpForced) {
    return error(res, 403, 'ROOT_ADMIN_2FA_FORCED', 'Root admin 2FA is enforced by server configuration');
  }

  if (!user.totpEnabled || !user.totpSecret) {
    return error(res, 400, 'TOTP_NOT_ENABLED', 'TOTP is not enabled');
  }

  if (!verifyTotpCode(user.totpSecret, code)) {
    return error(res, 400, 'INVALID_2FA_CODE', 'Invalid TOTP code');
  }

  user.totpEnabled = false;
  user.totpSecret = null;
  user.pendingTotpSecret = null;
  user.updatedAt = nowIso();
  schedulePersist('auth-totp-disable');

  return res.status(200).json({ status: 'totp_disabled' });
});

app.get('/api/admin/users/pending', requireAuth, requireAdmin, (req, res) => {
  const items = [...users.values()]
    .filter((user) => user.isEmailVerified && user.approvalStatus === 'pending')
    .map(adminUser);
  return res.status(200).json({ items });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const items = [...users.values()]
    .map(adminUser)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .reverse();
  return res.status(200).json({ items });
});

app.post('/api/admin/users/:userId/approve', requireAuth, requireAdmin, (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) {
    return error(res, 404, 'USER_NOT_FOUND', 'User not found');
  }

  if (!user.isEmailVerified) {
    return error(res, 400, 'EMAIL_NOT_VERIFIED', 'User email is not verified yet');
  }

  const roles = normalizeRoles(req.body?.roles);

  if (user.isProtectedRootAdmin) {
    return error(res, 403, 'ROOT_ADMIN_PROTECTED', 'Root admin cannot be modified or downgraded');
  }

  user.roles = roles;
  user.approvalStatus = 'approved';
  user.isActive = true;
  user.updatedAt = nowIso();
  pushAdminAuditEvent({
    actorUserId: req.currentUser.id,
    action: 'admin_user_approve',
    targetUserId: user.id,
    summary: `Validation du compte ${user.displayName}`,
    metadata: {
      roles: user.roles
    }
  });
  schedulePersist('admin-user-approve');

  return res.status(200).json({ user: adminUser(user) });
});

app.patch('/api/admin/users/:userId', requireAuth, requireAdmin, (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) {
    return error(res, 404, 'USER_NOT_FOUND', 'User not found');
  }

  const hasRolesUpdate = Array.isArray(req.body?.roles);
  const hasActiveUpdate = typeof req.body?.isActive === 'boolean';
  if (!hasRolesUpdate && !hasActiveUpdate) {
    return error(res, 400, 'INVALID_ADMIN_USER_PATCH', 'roles or isActive must be provided');
  }

  if (user.isProtectedRootAdmin) {
    if (hasActiveUpdate && req.body.isActive === false) {
      return error(res, 403, 'ROOT_ADMIN_PROTECTED', 'Root admin cannot be deactivated');
    }
    if (hasRolesUpdate && !normalizeRoles(req.body.roles).includes('admin')) {
      return error(res, 403, 'ROOT_ADMIN_PROTECTED', 'Root admin cannot be downgraded');
    }
  }

  if (hasRolesUpdate) {
    user.roles = normalizeRoles(req.body.roles);
  }
  if (hasActiveUpdate) {
    user.isActive = Boolean(req.body.isActive);
  }

  user.updatedAt = nowIso();
  pushAdminAuditEvent({
    actorUserId: req.currentUser.id,
    action: 'admin_user_update',
    targetUserId: user.id,
    summary: `Mise à jour du compte ${user.displayName}`,
    metadata: {
      hasRolesUpdate,
      hasActiveUpdate,
      roles: user.roles,
      isActive: user.isActive
    }
  });
  schedulePersist('admin-user-update');

  return res.status(200).json({ user: adminUser(user) });
});

app.post('/api/admin/users/:userId/unlock', requireAuth, requireAdmin, (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) {
    return error(res, 404, 'USER_NOT_FOUND', 'User not found');
  }

  user.failedLoginCount = 0;
  user.lockoutLevel = 0;
  user.lockedUntil = null;
  user.updatedAt = nowIso();
  pushAdminAuditEvent({
    actorUserId: req.currentUser.id,
    action: 'admin_user_unlock',
    targetUserId: user.id,
    summary: `Déverrouillage du compte ${user.displayName}`
  });
  schedulePersist('admin-user-unlock');

  return res.status(200).json({ user: adminUser(user) });
});

app.post('/api/admin/users/:userId/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) {
    return error(res, 404, 'USER_NOT_FOUND', 'User not found');
  }

  const nextPassword = typeof req.body?.nextPassword === 'string' ? req.body.nextPassword.trim() : '';
  if (nextPassword.length < 8) {
    return error(res, 400, 'INVALID_PASSWORD', 'Password must contain at least 8 characters');
  }

  user.passwordHash = await bcrypt.hash(nextPassword, 12);
  user.failedLoginCount = 0;
  user.lockoutLevel = 0;
  user.lockedUntil = null;
  user.updatedAt = nowIso();
  pushAdminAuditEvent({
    actorUserId: req.currentUser.id,
    action: 'admin_user_reset_password',
    targetUserId: user.id,
    summary: `Réinitialisation du mot de passe pour ${user.displayName}`
  });
  schedulePersist('admin-user-reset-password');

  return res.status(200).json({ user: adminUser(user) });
});

app.delete('/api/admin/users/:userId', requireAuth, requireAdmin, (req, res) => {
  const targetUser = users.get(req.params.userId);
  if (!targetUser) {
    return error(res, 404, 'USER_NOT_FOUND', 'User not found');
  }

  if (targetUser.isProtectedRootAdmin) {
    return error(res, 403, 'ROOT_ADMIN_PROTECTED', 'Root admin cannot be deleted');
  }

  if (targetUser.id === req.currentUser.id) {
    return error(res, 400, 'CANNOT_DELETE_SELF', 'You cannot delete your own admin account');
  }

  const replacementUserId =
    typeof req.body?.replacementUserId === 'string' && req.body.replacementUserId.trim()
      ? req.body.replacementUserId.trim()
      : req.currentUser.id;
  if (replacementUserId === targetUser.id) {
    return error(res, 400, 'INVALID_REPLACEMENT_USER', 'replacementUserId must be different from deleted user');
  }
  const replacementUser = users.get(replacementUserId);
  if (!replacementUser) {
    return error(res, 400, 'INVALID_REPLACEMENT_USER', 'replacementUserId not found');
  }

  const now = nowIso();
  let migratedSystemsCount = 0;
  let migratedSessionsCount = 0;
  let migratedCharactersCount = 0;

  for (const system of systems.values()) {
    const viewerUserIds = Array.isArray(system.viewerUserIds) ? system.viewerUserIds.filter((id) => id !== targetUser.id) : [];
    const editorUserIds = Array.isArray(system.editorUserIds) ? system.editorUserIds.filter((id) => id !== targetUser.id) : [];

    let changed = false;
    let ownerUserId = system.ownerUserId;
    if (system.ownerUserId === targetUser.id) {
      ownerUserId = replacementUserId;
      changed = true;
      migratedSystemsCount += 1;
    }
    if (viewerUserIds.length !== (system.viewerUserIds || []).length || editorUserIds.length !== (system.editorUserIds || []).length) {
      changed = true;
    }

    if (changed) {
      systems.set(system.id, {
        ...system,
        ownerUserId,
        viewerUserIds,
        editorUserIds,
        updatedAt: now
      });
    }
  }

  for (const session of sessions.values()) {
    const currentOwnerUserId = session.ownerUserId || session.gmUserId;
    const nextOwnerUserId = currentOwnerUserId === targetUser.id ? replacementUserId : currentOwnerUserId;

    let nextGmUserIds = getSessionGmUserIds(session).filter((id) => id !== targetUser.id);
    if (nextGmUserIds.length === 0) {
      nextGmUserIds = [replacementUserId];
    }

    const nextParticipants = (session.participants || [])
      .filter((participant) => participant.userId !== targetUser.id)
      .map((participant) =>
        nextGmUserIds.includes(participant.userId) ? { ...participant, role: 'gm' } : participant
      );
    const hasReplacementParticipant = nextParticipants.some((participant) => participant.userId === replacementUserId);
    if (!hasReplacementParticipant) {
      nextParticipants.unshift({ userId: replacementUserId, role: 'gm', isConnected: false });
    }

    const changed =
      currentOwnerUserId !== nextOwnerUserId ||
      session.gmUserId !== nextGmUserIds[0] ||
      JSON.stringify(getSessionGmUserIds(session)) !== JSON.stringify(nextGmUserIds) ||
      (session.participants || []).length !== nextParticipants.length;

    if (changed) {
      sessions.set(session.id, {
        ...session,
        ownerUserId: nextOwnerUserId,
        gmUserId: nextGmUserIds[0],
        gmUserIds: nextGmUserIds,
        participants: nextParticipants,
        updatedAt: now
      });
      migratedSessionsCount += 1;
    }
  }

  for (const character of characters.values()) {
    if (character.ownerUserId === targetUser.id) {
      characters.set(character.id, {
        ...character,
        ownerUserId: replacementUserId
      });
      migratedCharactersCount += 1;
    }
  }

  users.delete(targetUser.id);
  usersByEmail.delete(targetUser.email);
  pushAdminAuditEvent({
    actorUserId: req.currentUser.id,
    action: 'admin_user_delete',
    targetUserId: targetUser.id,
    summary: `Suppression du compte ${targetUser.displayName}`,
    metadata: {
      replacementUserId,
      migratedSystemsCount,
      migratedSessionsCount,
      migratedCharactersCount
    }
  });
  schedulePersist('admin-user-delete');

  return res.status(200).json({
    status: 'deleted',
    userId: targetUser.id,
    replacementUserId,
    migratedSystemsCount,
    migratedSessionsCount,
    migratedCharactersCount
  });
});

app.get('/api/admin/audit/events', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 500);
  const items = adminAuditEvents.slice(0, limit).map((item) => clone(item));
  return res.status(200).json({ items });
});

app.get('/api/admin/systems/usage', requireAuth, requireAdmin, (req, res) => {
  const items = [...systems.values()].map((system) => ({
    ...clone(system),
    usage: getSystemUsage(system.id)
  }));
  return res.status(200).json({ items });
});

app.post('/api/admin/integrations/discord/releases', requireAuth, requireAdmin, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : '';
  const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 2000) : '';
  const version = typeof body.version === 'string' ? body.version.trim().slice(0, 64) : '';
  const platform = typeof body.platform === 'string' ? body.platform.trim().toLowerCase().slice(0, 32) : 'general';
  const link = typeof body.link === 'string' ? body.link.trim().slice(0, 500) : '';

  if (!title || !summary) {
    return error(res, 400, 'INVALID_RELEASE_PAYLOAD', 'title and summary are required');
  }

  const event = pushDiscordBotEvent('release.published', {
    release: {
      id: makeId('release'),
      title,
      summary,
      version: version || null,
      platform: platform || 'general',
      link: link || null,
      publishedAt: nowIso(),
      createdByUserId: req.currentUser.id,
      createdByDisplayName: req.currentUser.displayName,
      createdByNickname: req.currentUser.nickname || null
    }
  });

  return res.status(201).json({ event: publicDiscordBotEvent(event) });
});

app.post('/api/integrations/discord/session-channel-report', requireDiscordBotSecret, (req, res) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!sessionId) {
    return error(res, 400, 'SESSION_ID_REQUIRED', 'sessionId is required');
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const currentIntegration = session.discordIntegration && typeof session.discordIntegration === 'object' ? session.discordIntegration : {};
  const nextIntegration = {
    ...currentIntegration,
    guildId: typeof req.body?.guildId === 'string' && req.body.guildId.trim() ? req.body.guildId.trim() : currentIntegration.guildId || null,
    guildName: typeof req.body?.guildName === 'string' && req.body.guildName.trim() ? req.body.guildName.trim() : currentIntegration.guildName || null,
    categoryId: typeof req.body?.categoryId === 'string' && req.body.categoryId.trim() ? req.body.categoryId.trim() : null,
    channelId: typeof req.body?.channelId === 'string' && req.body.channelId.trim() ? req.body.channelId.trim() : null,
    channelName: typeof req.body?.channelName === 'string' && req.body.channelName.trim() ? req.body.channelName.trim() : null,
    status: typeof req.body?.status === 'string' && req.body.status.trim() ? req.body.status.trim() : currentIntegration.status || 'active',
    lastSyncedAt: nowIso()
  };

  const next = {
    ...session,
    discordIntegration: nextIntegration,
    updatedAt: nowIso()
  };
  sessions.set(next.id, next);
  schedulePersist('discord-session-channel-report');
  return res.status(200).json({ session: publicSession(next, null) });
});

app.get('/api/integrations/discord/events', requireDiscordBotSecret, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)));
  const afterId = typeof req.query.after === 'string' ? req.query.after.trim() : '';
  const items = [...discordBotEvents];

  if (!afterId) {
    return res.status(200).json({ items: items.slice(-limit).map(publicDiscordBotEvent) });
  }

  const startIndex = items.findIndex((item) => item.id === afterId);
  const nextItems = startIndex >= 0 ? items.slice(startIndex + 1, startIndex + 1 + limit) : items.slice(-limit);
  return res.status(200).json({ items: nextItems.map(publicDiscordBotEvent) });
});

app.get('/api/integrations/discord/session-output', requireDiscordBotSecret, (req, res) => {
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
  const discordUserId = typeof req.query.discordUserId === 'string' ? req.query.discordUserId.trim() : '';
  const outputKey = typeof req.query.output === 'string' ? req.query.output.trim() : '';
  const requestedVisibility = String(req.query.visibility || '').trim() === 'public' ? 'public' : 'private';

  if (!sessionId || !discordUserId || !outputKey) {
    return error(res, 400, 'DISCORD_OUTPUT_INVALID_REQUEST', 'sessionId, discordUserId and output are required');
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const user = [...users.values()].find((candidate) => candidate.discordUserId === discordUserId);
  if (!user) {
    return error(res, 404, 'DISCORD_USER_NOT_LINKED', 'No Nexus Forge user is linked to this Discord account');
  }

  const system = systems.get(session.systemId);
  if (!system) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }

  const output = findDiscordOutputDefinition(system, outputKey);
  if (!output) {
    return error(
      res,
      404,
      'DISCORD_OUTPUT_NOT_FOUND',
      `La sortie Discord "${outputKey}" n est pas configuree sur le systeme "${system.name}" utilise par cette partie.`
    );
  }

  const { participant, character } = resolveSessionCharacterForUser(session, user);
  if (!participant) {
    return error(res, 403, 'DISCORD_OUTPUT_FORBIDDEN', 'This user is not a participant in the session');
  }

  try {
    const rendered = renderDiscordSystemOutput({
      session,
      system,
      user,
      participant,
      character,
      output,
      requestedVisibility
    });
    return res.status(200).json({
      output: {
        ...rendered,
        systemId: system.id,
        systemName: system.name,
        sessionName: session.name
      }
    });
  } catch (routeError) {
    return error(
      res,
      400,
      'DISCORD_OUTPUT_RENDER_FAILED',
      routeError instanceof Error
        ? routeError.message
        : `Le rendu de la sortie Discord "${outputKey}" a echoue pour le systeme "${system.name}".`
    );
  }
});

app.get('/api/home/stats', requireAuth, (req, res) => {
  return res.status(200).json({ stats: buildHomeStats() });
});

app.get('/api/home/news', requireAuth, (req, res) => {
  const items = [...homeNews.values()]
    .filter((item) => item.isPublished !== false || req.currentUser.roles.includes('admin'))
    .sort((left, right) => {
      if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
        return left.isPinned ? -1 : 1;
      }
      return String(right.publishedAt || right.updatedAt || '').localeCompare(String(left.publishedAt || left.updatedAt || ''));
    })
    .map(publicNewsItem);
  return res.status(200).json({ items });
});

app.post('/api/home/news', requireAuth, requireAdmin, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 140) : '';
  const content = typeof body.content === 'string' ? body.content.trim().slice(0, 5000) : '';
  if (!title || !content) {
    return error(res, 400, 'INVALID_NEWS', 'Title and content are required');
  }
  const item = {
    id: makeId('news'),
    title,
    content,
    isPinned: Boolean(body.isPinned),
    isPublished: body.isPublished !== false,
    createdByUserId: req.currentUser.id,
    createdByDisplayName: req.currentUser.displayName,
    createdByNickname: req.currentUser.nickname || null,
    publishedAt: body.isPublished === false ? null : nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  homeNews.set(item.id, item);
  if (item.isPublished) {
    pushDiscordBotEvent('news.published', {
      news: {
        id: item.id,
        title: item.title,
        content: item.content,
        isPinned: item.isPinned,
        publishedAt: item.publishedAt,
        updatedAt: item.updatedAt,
        createdByDisplayName: item.createdByDisplayName,
        createdByNickname: item.createdByNickname || req.currentUser.nickname || null
      }
    });
  }
  schedulePersist('home-news-create');
  return res.status(201).json({ item: publicNewsItem(item) });
});

app.patch('/api/home/news/:newsId', requireAuth, requireAdmin, (req, res) => {
  const item = homeNews.get(req.params.newsId);
  if (!item) {
    return error(res, 404, 'NEWS_NOT_FOUND', 'News not found');
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  item.title = typeof body.title === 'string' ? body.title.trim().slice(0, 140) || item.title : item.title;
  item.content = typeof body.content === 'string' ? body.content.trim().slice(0, 5000) || item.content : item.content;
  item.isPinned = typeof body.isPinned === 'boolean' ? body.isPinned : item.isPinned;
  if (typeof body.isPublished === 'boolean') {
    item.isPublished = body.isPublished;
    item.publishedAt = body.isPublished ? item.publishedAt || nowIso() : null;
  }
  item.updatedAt = nowIso();
  homeNews.set(item.id, item);
  if (item.isPublished) {
    pushDiscordBotEvent('news.published', {
      news: {
        id: item.id,
        title: item.title,
        content: item.content,
        isPinned: item.isPinned,
        publishedAt: item.publishedAt,
        updatedAt: item.updatedAt,
        createdByDisplayName: item.createdByDisplayName,
        createdByNickname: item.createdByNickname || req.currentUser.nickname || null
      }
    });
  }
  schedulePersist('home-news-update');
  return res.status(200).json({ item: publicNewsItem(item) });
});

app.delete('/api/home/news/:newsId', requireAuth, requireAdmin, (req, res) => {
  const item = homeNews.get(req.params.newsId);
  if (!item) {
    return error(res, 404, 'NEWS_NOT_FOUND', 'News not found');
  }
  homeNews.delete(item.id);
  schedulePersist('home-news-delete');
  return res.status(204).send();
});

app.get('/api/home/announcements', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit || 0), 0), 100);
  const type = typeof req.query?.type === 'string' ? req.query.type : null;
  const systemId = typeof req.query?.systemId === 'string' ? req.query.systemId : null;
  const language = typeof req.query?.language === 'string' ? req.query.language : null;
  const playMode = typeof req.query?.playMode === 'string' ? req.query.playMode : null;
  const status = typeof req.query?.status === 'string' ? req.query.status : null;
  const periodicity = typeof req.query?.periodicity === 'string' ? req.query.periodicity : null;
  const daysOfWeek = parseAnnouncementQueryList(req.query?.daysOfWeek, ANNOUNCEMENT_DAYS);
  const timeSlots = parseAnnouncementQueryList(req.query?.timeSlots, ANNOUNCEMENT_TIME_SLOTS);
  let items = [...announcements.values()]
    .filter((item) => item.status === 'open' || item.authorUserId === req.currentUser.id || req.currentUser.roles.includes('admin'))
    .filter((item) => item.authorUserId === req.currentUser.id || !isIgnoredBy(req.currentUser.id, item.authorUserId))
    .filter((item) => (type ? item.type === type : true))
    .filter((item) => (systemId ? item.systemId === systemId : true))
    .filter((item) => (language ? item.language === language : true))
    .filter((item) => (playMode ? item.playMode === playMode : true))
    .filter((item) => (status ? item.status === status : true))
    .filter((item) => (periodicity ? item.periodicity === periodicity : true))
    .filter((item) => (daysOfWeek.length ? daysOfWeek.every((day) => (item.daysOfWeek || []).includes(day)) : true))
    .filter((item) => (timeSlots.length ? timeSlots.every((slot) => (item.timeSlots || []).includes(slot)) : true))
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .map(publicAnnouncement);
  if (limit > 0) {
    items = items.slice(0, limit);
  }
  return res.status(200).json({ items });
});

app.post('/api/home/announcements', requireAuth, (req, res) => {
  const payload = sanitizeAnnouncementPayload(req.body, req.currentUser);
  const item = {
    id: makeId('announce'),
    ...payload,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  announcements.set(item.id, item);
  if (item.status === 'open') {
    pushDiscordAnnouncementEvent('upsert', item);
  }
  schedulePersist('announcement-create');
  return res.status(201).json({ item: publicAnnouncement(item) });
});

app.patch('/api/home/announcements/:announcementId', requireAuth, (req, res) => {
  const item = announcements.get(req.params.announcementId);
  if (!item) {
    return error(res, 404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
  }
  if (item.authorUserId !== req.currentUser.id && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'ANNOUNCEMENT_FORBIDDEN', 'Only the owner or an admin can update this announcement');
  }
  const payload = sanitizeAnnouncementPayload({ ...item, ...req.body }, req.currentUser);
  const next = {
    ...item,
    ...payload,
    updatedAt: nowIso()
  };
  announcements.set(item.id, next);
  if (next.status === 'open') {
    pushDiscordAnnouncementEvent('upsert', next);
  } else {
    pushDiscordAnnouncementEvent('delete', next);
  }
  schedulePersist('announcement-update');
  return res.status(200).json({ item: publicAnnouncement(next) });
});

app.delete('/api/home/announcements/:announcementId', requireAuth, (req, res) => {
  const item = announcements.get(req.params.announcementId);
  if (!item) {
    return error(res, 404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
  }
  if (item.authorUserId !== req.currentUser.id && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'ANNOUNCEMENT_FORBIDDEN', 'Only the owner or an admin can delete this announcement');
  }
  announcements.delete(item.id);
  pushDiscordAnnouncementEvent('delete', item);
  schedulePersist('announcement-delete');
  return res.status(204).send();
});

app.get('/api/social/users', requireAuth, (req, res) => {
  if (!canUseSocialFeatures(req.currentUser)) {
    return error(res, 403, 'SOCIAL_UNAVAILABLE', 'Social features unavailable for this account');
  }

  const query = String(req.query?.q || '').trim().toLowerCase();
  const items = [...users.values()]
    .filter((user) => user.id !== req.currentUser.id)
    .filter((user) => user.isActive && user.approvalStatus === 'approved')
    .filter((user) => !isIgnoredBy(req.currentUser.id, user.id) && !isIgnoredBy(user.id, req.currentUser.id))
    .filter((user) => !query || user.displayName.toLowerCase().includes(query) || String(user.nickname || '').toLowerCase().includes(query))
    .sort((left, right) => String(left.displayName || '').localeCompare(String(right.displayName || '')))
    .slice(0, 50)
    .map((user) => publicSocialUser(user, req.currentUser));

  return res.status(200).json({ items });
});

app.get('/api/social/users/:userId', requireAuth, (req, res) => {
  if (!canUseSocialFeatures(req.currentUser)) {
    return error(res, 403, 'SOCIAL_UNAVAILABLE', 'Social features unavailable for this account');
  }
  const targetUser = users.get(req.params.userId);
  if (!targetUser || targetUser.id === req.currentUser.id || !targetUser.isActive || targetUser.approvalStatus !== 'approved') {
    return error(res, 404, 'USER_NOT_FOUND', 'Target user not found');
  }
  if (isIgnoredBy(req.currentUser.id, targetUser.id) || isIgnoredBy(targetUser.id, req.currentUser.id)) {
    return error(res, 403, 'SOCIAL_FORBIDDEN', 'This user is not available for social interactions');
  }
  return res.status(200).json({ item: publicSocialUser(targetUser, req.currentUser) });
});

app.get('/api/social/relations', requireAuth, (req, res) => {
  if (!canUseSocialFeatures(req.currentUser)) {
    return error(res, 403, 'SOCIAL_UNAVAILABLE', 'Social features unavailable for this account');
  }

  const friendLinks = [...socialLinks.values()].filter(
    (link) =>
      link.type === 'friend' &&
      (link.ownerUserId === req.currentUser.id || link.targetUserId === req.currentUser.id)
  );
  const incomingRequests = [...socialLinks.values()].filter(
    (link) => link.type === 'friend_request' && link.targetUserId === req.currentUser.id
  );
  const outgoingRequests = [...socialLinks.values()].filter(
    (link) => link.type === 'friend_request' && link.ownerUserId === req.currentUser.id
  );
  const ignored = [...socialLinks.values()].filter(
    (link) => link.type === 'ignored' && link.ownerUserId === req.currentUser.id
  );

  const mapLinkUser = (link, userId) => {
    const user = users.get(userId);
    return user ? publicSocialUser(user, req.currentUser) : null;
  };

  return res.status(200).json({
    friends: friendLinks
      .map((link) => mapLinkUser(link, link.ownerUserId === req.currentUser.id ? link.targetUserId : link.ownerUserId))
      .filter(Boolean),
    incomingRequests: incomingRequests.map((link) => ({
      id: link.id,
      user: mapLinkUser(link, link.ownerUserId),
      createdAt: link.createdAt
    })),
    outgoingRequests: outgoingRequests.map((link) => ({
      id: link.id,
      user: mapLinkUser(link, link.targetUserId),
      createdAt: link.createdAt
    })),
    ignored: ignored.map((link) => ({
      id: link.id,
      user: mapLinkUser(link, link.targetUserId),
      createdAt: link.createdAt
    }))
  });
});

app.post('/api/social/friend-requests', requireAuth, (req, res) => {
  if (!canUseSocialFeatures(req.currentUser)) {
    return error(res, 403, 'SOCIAL_UNAVAILABLE', 'Social features unavailable for this account');
  }
  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
  if (!targetUserId || targetUserId === req.currentUser.id) {
    return error(res, 400, 'INVALID_TARGET_USER', 'A valid targetUserId is required');
  }
  const targetUser = users.get(targetUserId);
  if (!targetUser || !targetUser.isActive || targetUser.approvalStatus !== 'approved') {
    return error(res, 404, 'USER_NOT_FOUND', 'Target user not found');
  }
  if (isIgnoredBy(req.currentUser.id, targetUserId) || isIgnoredBy(targetUserId, req.currentUser.id)) {
    return error(res, 403, 'SOCIAL_FORBIDDEN', 'Friend request blocked by ignore settings');
  }
  if (areFriends(req.currentUser.id, targetUserId)) {
    return error(res, 409, 'ALREADY_FRIENDS', 'Users are already friends');
  }
  const reverseRequest = getLinkBetweenUsers(targetUserId, req.currentUser.id, 'friend_request');
  if (reverseRequest) {
    socialLinks.delete(reverseRequest.id);
    const friend = {
      id: makeId('social-link'),
      type: 'friend',
      ownerUserId: req.currentUser.id,
      targetUserId,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    socialLinks.set(friend.id, friend);
    schedulePersist('social-friend-auto-accept');
    return res.status(201).json({ status: 'accepted', friend: publicSocialUser(targetUser, req.currentUser) });
  }
  const existing = getLinkBetweenUsers(req.currentUser.id, targetUserId, 'friend_request');
  if (existing) {
    return error(res, 409, 'REQUEST_ALREADY_SENT', 'Friend request already sent');
  }
  const link = {
    id: makeId('social-link'),
    type: 'friend_request',
    ownerUserId: req.currentUser.id,
    targetUserId,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  socialLinks.set(link.id, link);
  schedulePersist('social-friend-request');
  return res.status(201).json({ status: 'pending', requestId: link.id });
});

app.post('/api/social/friend-requests/:requestId/accept', requireAuth, (req, res) => {
  const requestLink = socialLinks.get(req.params.requestId);
  if (!requestLink || requestLink.type !== 'friend_request') {
    return error(res, 404, 'REQUEST_NOT_FOUND', 'Friend request not found');
  }
  if (requestLink.targetUserId !== req.currentUser.id) {
    return error(res, 403, 'REQUEST_FORBIDDEN', 'Only the target user can accept this request');
  }
  socialLinks.delete(requestLink.id);
  const friend = {
    id: makeId('social-link'),
    type: 'friend',
    ownerUserId: requestLink.ownerUserId,
    targetUserId: requestLink.targetUserId,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  socialLinks.set(friend.id, friend);
  schedulePersist('social-friend-accept');
  return res.status(200).json({ status: 'accepted' });
});

app.delete('/api/social/friend-requests/:requestId', requireAuth, (req, res) => {
  const requestLink = socialLinks.get(req.params.requestId);
  if (!requestLink || requestLink.type !== 'friend_request') {
    return error(res, 404, 'REQUEST_NOT_FOUND', 'Friend request not found');
  }
  if (requestLink.ownerUserId !== req.currentUser.id && requestLink.targetUserId !== req.currentUser.id) {
    return error(res, 403, 'REQUEST_FORBIDDEN', 'Forbidden');
  }
  socialLinks.delete(requestLink.id);
  schedulePersist('social-friend-request-delete');
  return res.status(204).send();
});

app.post('/api/social/ignore', requireAuth, (req, res) => {
  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
  if (!targetUserId || targetUserId === req.currentUser.id) {
    return error(res, 400, 'INVALID_TARGET_USER', 'A valid targetUserId is required');
  }
  const targetUser = users.get(targetUserId);
  if (!targetUser) {
    return error(res, 404, 'USER_NOT_FOUND', 'Target user not found');
  }
  const existing = getLinkBetweenUsers(req.currentUser.id, targetUserId, 'ignored');
  if (existing) {
    return res.status(200).json({ status: 'already_ignored' });
  }
  for (const link of [...socialLinks.values()]) {
    const isBetweenUsers =
      (link.ownerUserId === req.currentUser.id && link.targetUserId === targetUserId) ||
      (link.ownerUserId === targetUserId && link.targetUserId === req.currentUser.id);
    if (isBetweenUsers && (link.type === 'friend' || link.type === 'friend_request')) {
      socialLinks.delete(link.id);
    }
  }
  const ignore = {
    id: makeId('social-link'),
    type: 'ignored',
    ownerUserId: req.currentUser.id,
    targetUserId,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  socialLinks.set(ignore.id, ignore);
  schedulePersist('social-ignore');
  return res.status(201).json({ status: 'ignored' });
});

app.delete('/api/social/ignore/:targetUserId', requireAuth, (req, res) => {
  const link = getLinkBetweenUsers(req.currentUser.id, req.params.targetUserId, 'ignored');
  if (!link) {
    return error(res, 404, 'IGNORE_NOT_FOUND', 'Ignore relation not found');
  }
  socialLinks.delete(link.id);
  schedulePersist('social-ignore-delete');
  return res.status(204).send();
});

app.post('/api/social/reports', requireAuth, (req, res) => {
  const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 140) : '';
  const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 2000) : '';
  if (!targetUserId || targetUserId === req.currentUser.id) {
    return error(res, 400, 'INVALID_TARGET_USER', 'A valid targetUserId is required');
  }
  if (!reason) {
    return error(res, 400, 'REPORT_REASON_REQUIRED', 'Reason is required');
  }
  const targetUser = users.get(targetUserId);
  if (!targetUser) {
    return error(res, 404, 'USER_NOT_FOUND', 'Target user not found');
  }
  const report = {
    id: makeId('social-report'),
    targetUserId,
    targetDisplayName: targetUser.displayName,
    reportedByUserId: req.currentUser.id,
    reportedByDisplayName: req.currentUser.displayName,
    reason,
    details,
    status: 'open',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  socialReports.set(report.id, report);
  schedulePersist('social-report-create');
  return res.status(201).json({ item: publicSocialReport(report) });
});

app.get('/api/admin/social/reports', requireAuth, requireAdmin, (req, res) => {
  const items = [...socialReports.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).map(publicSocialReport);
  return res.status(200).json({ items });
});

app.patch('/api/admin/social/reports/:reportId', requireAuth, requireAdmin, (req, res) => {
  const report = socialReports.get(req.params.reportId);
  if (!report) {
    return error(res, 404, 'REPORT_NOT_FOUND', 'Report not found');
  }
  report.status = ['open', 'reviewing', 'closed'].includes(req.body?.status) ? req.body.status : report.status;
  report.updatedAt = nowIso();
  socialReports.set(report.id, report);
  schedulePersist('social-report-update');
  return res.status(200).json({ item: publicSocialReport(report) });
});

app.get('/api/social/conversations', requireAuth, (req, res) => {
  if (!canUseSocialFeatures(req.currentUser)) {
    return error(res, 403, 'SOCIAL_UNAVAILABLE', 'Social features unavailable for this account');
  }
  const conversationsByUserId = new Map();
  for (const message of socialDirectMessages.values()) {
    if (message.fromUserId !== req.currentUser.id && message.toUserId !== req.currentUser.id) {
      continue;
    }
    const otherUserId = message.fromUserId === req.currentUser.id ? message.toUserId : message.fromUserId;
    const previous = conversationsByUserId.get(otherUserId);
    if (!previous || new Date(message.createdAt).getTime() > new Date(previous.lastMessageAt).getTime()) {
      conversationsByUserId.set(otherUserId, {
        otherUserId,
        lastMessageAt: message.createdAt,
        lastMessagePreview: message.content.slice(0, 160),
        unreadCount: previous?.unreadCount || 0
      });
    }
    if (message.toUserId === req.currentUser.id && !message.readAt) {
      const current = conversationsByUserId.get(otherUserId);
      current.unreadCount = (current.unreadCount || 0) + 1;
    }
  }
  const items = [...conversationsByUserId.values()]
    .map((conversation) => {
      const user = users.get(conversation.otherUserId);
      return user
        ? {
            ...conversation,
            user: publicSocialUser(user, req.currentUser)
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
  return res.status(200).json({ items });
});

app.get('/api/social/conversations/:otherUserId/messages', requireAuth, (req, res) => {
  const otherUser = users.get(req.params.otherUserId);
  if (!otherUser) {
    return error(res, 404, 'USER_NOT_FOUND', 'Target user not found');
  }
  if (!canDirectMessageUsers(req.currentUser.id, otherUser.id)) {
    return error(res, 403, 'DIRECT_MESSAGE_FORBIDDEN', 'Direct messages are blocked between these users');
  }
  const items = [...socialDirectMessages.values()]
    .filter(
      (message) =>
        (message.fromUserId === req.currentUser.id && message.toUserId === otherUser.id) ||
        (message.fromUserId === otherUser.id && message.toUserId === req.currentUser.id)
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const now = nowIso();
  for (const message of items) {
    if (message.toUserId === req.currentUser.id && !message.readAt) {
      message.readAt = now;
      socialDirectMessages.set(message.id, message);
    }
  }
  schedulePersist('social-message-read');
  return res.status(200).json({ items: items.map(publicSocialMessage) });
});

app.post('/api/tools/system-draft/convert', requireAuth, requireGmOrAdmin, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sourceType = typeof body.sourceType === 'string' ? body.sourceType.trim().toLowerCase() : '';
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
  const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64.trim() : '';

  if (sourceType !== 'html' && sourceType !== 'html_enriched' && sourceType !== 'pdf') {
    return error(res, 400, 'SYSTEM_DRAFT_SOURCE_INVALID', 'sourceType must be html, html_enriched or pdf');
  }
  if (!fileName) {
    return error(res, 400, 'SYSTEM_DRAFT_FILENAME_REQUIRED', 'fileName is required');
  }
  if (!contentBase64) {
    return error(res, 400, 'SYSTEM_DRAFT_CONTENT_REQUIRED', 'contentBase64 is required');
  }

  let buffer = null;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch {
    return error(res, 400, 'SYSTEM_DRAFT_CONTENT_INVALID', 'contentBase64 is invalid');
  }

  try {
    const payload =
      sourceType === 'html'
        ? convertHtmlToSystemDraft({ fileName, html: buffer.toString('utf8') })
        : sourceType === 'html_enriched'
        ? convertHtmlToEnrichedSystemDraft({ fileName, html: buffer.toString('utf8') })
        : convertPdfToSystemDraft({ fileName, buffer });
    return res.json({ draft: payload });
  } catch (conversionError) {
    return error(
      res,
      500,
      'SYSTEM_DRAFT_CONVERSION_FAILED',
      conversionError instanceof Error ? conversionError.message : 'Conversion failed'
    );
  }
});

app.post('/api/social/conversations/:otherUserId/messages', requireAuth, (req, res) => {
  const otherUser = users.get(req.params.otherUserId);
  if (!otherUser) {
    return error(res, 404, 'USER_NOT_FOUND', 'Target user not found');
  }
  if (!canDirectMessageUsers(req.currentUser.id, otherUser.id)) {
    return error(res, 403, 'DIRECT_MESSAGE_FORBIDDEN', 'Direct messages are blocked between these users');
  }
  const content = typeof req.body?.content === 'string' ? req.body.content.trim().slice(0, 4000) : '';
  if (!content) {
    return error(res, 400, 'MESSAGE_CONTENT_REQUIRED', 'Message content is required');
  }
  const item = {
    id: makeId('social-message'),
    fromUserId: req.currentUser.id,
    toUserId: otherUser.id,
    content,
    createdAt: nowIso(),
    readAt: null
  };
  socialDirectMessages.set(item.id, item);
  schedulePersist('social-message-create');
  return res.status(201).json({ item: publicSocialMessage(item) });
});

app.delete('/api/admin/systems/:systemId', requireAuth, requireAdmin, (req, res) => {
  const system = systems.get(req.params.systemId);
  if (!system) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }

  const replacementSystemId =
    typeof req.body?.replacementSystemId === 'string' && req.body.replacementSystemId.trim()
      ? req.body.replacementSystemId.trim()
      : 'sys-steamshadows-reference';
  if (!systems.has(replacementSystemId) || replacementSystemId === system.id) {
    return error(res, 400, 'SYSTEM_DELETE_INVALID_REPLACEMENT', 'Valid replacementSystemId is required');
  }

  const relatedSessions = [...sessions.values()].filter((session) => session.systemId === system.id);
  const now = nowIso();
  for (const session of relatedSessions) {
    sessions.set(session.id, {
      ...session,
      systemId: replacementSystemId,
      updatedAt: now
    });
  }

  systems.delete(system.id);
  schedulePersist('admin-system-delete');
  return res.status(200).json({
    status: 'deleted',
    replacementSystemId,
    migratedSessionsCount: relatedSessions.length
  });
});

app.get('/api/sessions', requireAuth, (req, res) => {
  const currentUser = req.currentUser;
  const includeArchived = String(req.query?.includeArchived || 'false') === 'true';
  const items = [...sessions.values()].filter((session) => {
    if (!includeArchived && session.archivedAt) {
      return false;
    }
    if (currentUser.roles.includes('admin')) {
      return true;
    }
    return (
      (session.participants || []).some((participant) => participant.userId === currentUser.id) ||
      (session.invitations || []).some((invitation) => invitation.userId === currentUser.id && invitation.status === 'pending')
    );
  });
  return res.status(200).json({ items: items.map((session) => publicSession(session, currentUser)) });
});

app.post('/api/sessions', requireAuth, (req, res) => {
  if (!req.currentUser.roles.includes('gm') && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'SESSION_CREATION_FORBIDDEN', 'Only GM/admin can create sessions');
  }

  const body = req.body || {};
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Nouvelle partie';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const systemId = typeof body.systemId === 'string' && body.systemId.trim() ? body.systemId.trim() : '';
  const requestedState = typeof body.state === 'string' ? body.state : 'planned';
  const state = requestedState === 'running' || requestedState === 'paused' || requestedState === 'finished' ? requestedState : 'planned';

  if (!systemId) {
    return error(res, 400, 'SYSTEM_ID_REQUIRED', 'System is required');
  }

  if (!systems.has(systemId)) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }
  const system = systems.get(systemId);
  if (!canUseSystemForSession(system)) {
    return error(res, 409, 'SYSTEM_NOT_PUBLISHED', 'System must be published with at least one character sheet view');
  }

  const now = nowIso();
  const defaultGmTemplate = pickDefaultScreenTemplateForSystem({ systemId, role: 'gm' });
  const defaultPlayerTemplate = pickDefaultScreenTemplateForSystem({ systemId, role: 'player' });
  const session = {
    id: makeId('session'),
    systemId,
    name,
    description,
    ownerUserId: req.currentUser.id,
    gmUserId: req.currentUser.id,
    gmUserIds: [req.currentUser.id],
    state,
    settings: body.settings && typeof body.settings === 'object' ? body.settings : clone(GENERIC_SESSION_SETTINGS),
    participants: [{ userId: req.currentUser.id, role: 'gm', isConnected: false }],
    invitations: [],
    activityLog: [],
    screenTemplateAssignments: {
      gmTemplateId: defaultGmTemplate?.id || null,
      playerTemplateId: defaultPlayerTemplate?.id || null
    },
    screenTemplateSelections: {},
    runtimePresence: {},
    runtimeTargetStates: {},
    initiative: {
      round: 0,
      turnIndex: 0,
      isInCombat: false,
      entries: [],
      config: {
        mode: 'system_default',
        formula: null
      }
    },
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  };
  session.activityLog = appendSessionActivity(session, {
    type: 'session_created',
    actorUserId: req.currentUser.id,
    message: `Partie creee par @${req.currentUser.nickname || req.currentUser.id}.`
  });

  sessions.set(session.id, session);
  schedulePersist('session-create');
  return res.status(201).json({ session: publicSession(session, req.currentUser) });
});

app.get('/api/sessions/:sessionId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const currentUser = req.currentUser;
  if (!canViewSession(session, currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  return res.status(200).json({ session: publicSession(session, currentUser) });
});

app.post('/api/sessions/:sessionId/runtime/presence', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const currentUser = req.currentUser;
  if (!canViewSession(session, currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const active = body.active !== false;
  const participantIndex = (session.participants || []).findIndex((participant) => participant.userId === currentUser.id);
  if (participantIndex < 0) {
    return error(res, 403, 'SESSION_PARTICIPANT_REQUIRED', 'Participant required');
  }

  const seenAt = nowIso();
  const nextParticipants = (session.participants || []).map((participant, index) =>
    index === participantIndex
      ? {
          ...participant,
          isConnected: active,
          lastSeenAt: seenAt
        }
      : participant
  );

  const next = {
    ...session,
    participants: nextParticipants,
    runtimePresence: {
      ...(session.runtimePresence && typeof session.runtimePresence === 'object' ? session.runtimePresence : {}),
      [currentUser.id]: {
        active,
        lastSeenAt: seenAt,
        templateId: typeof body.templateId === 'string' ? body.templateId : null,
        setId: typeof body.setId === 'string' ? body.setId : null,
        detachedScreenId: typeof body.detachedScreenId === 'string' ? body.detachedScreenId : null,
        role: body.role === 'gm' ? 'gm' : 'player'
      }
    },
    updatedAt: seenAt
  };

  sessions.set(next.id, next);
  schedulePersist(active ? 'session-runtime-heartbeat' : 'session-runtime-disconnect');
  return res.status(200).json({ session: publicSession(next, currentUser) });
});

app.get('/api/sessions/:sessionId/runtime-targets/:targetId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const currentUser = req.currentUser;
  if (!canViewSession(session, currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const templateId = typeof req.query.templateId === 'string' ? req.query.templateId : 'default';
  const stateKey = buildRuntimeTargetStorageKey(templateId, req.params.targetId);
  const state =
    session.runtimeTargetStates && typeof session.runtimeTargetStates === 'object'
      ? session.runtimeTargetStates[stateKey] || null
      : null;
  return res.status(200).json({ state: clone(state) });
});

app.get('/api/sessions/:sessionId/runtime/connections', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const currentUser = req.currentUser;
  if (!canViewSession(session, currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  return res.status(200).json({ items: buildRuntimeConnectionEntries(session) });
});

app.put('/api/sessions/:sessionId/runtime-targets/:targetId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const currentUser = req.currentUser;
  if (!canViewSession(session, currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const templateId = typeof body.templateId === 'string' ? body.templateId : 'default';
  const playback =
    body.state &&
    typeof body.state === 'object' &&
    body.state.playback &&
    typeof body.state.playback === 'object'
      ? {
          status:
            body.state.playback.status === 'playing' || body.state.playback.status === 'paused' || body.state.playback.status === 'stopped'
              ? body.state.playback.status
              : 'stopped',
          loop: body.state.playback.loop === true,
          commandToken:
            typeof body.state.playback.commandToken === 'string' && body.state.playback.commandToken
              ? body.state.playback.commandToken
              : nowIso()
        }
      : null;
  const rotationQuarterTurns =
    body.state && typeof body.state === 'object' && Number.isFinite(body.state.rotationQuarterTurns)
      ? ((Math.trunc(body.state.rotationQuarterTurns) % 4) + 4) % 4
      : 0;
  const nextState =
    body.state && typeof body.state === 'object'
      ? {
          visible: body.state.visible === true,
          content: body.state.content || null,
          playback,
          rotationQuarterTurns,
          updatedAt: typeof body.state.updatedAt === 'string' ? body.state.updatedAt : nowIso()
        }
      : null;
  const stateKey = buildRuntimeTargetStorageKey(templateId, req.params.targetId);
  const next = {
    ...session,
    runtimeTargetStates: {
      ...(session.runtimeTargetStates && typeof session.runtimeTargetStates === 'object' ? session.runtimeTargetStates : {}),
      [stateKey]: nextState
    },
    updatedAt: nowIso()
  };

  sessions.set(next.id, next);
  schedulePersist('session-runtime-target');
  return res.status(200).json({ ok: true });
});

app.patch('/api/sessions/:sessionId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const currentUser = req.currentUser;
  if (!canManageSession(session, currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can edit session');
  }

  const patch = req.body || {};
  let nextParticipants = Array.isArray(patch.participants) ? patch.participants : session.participants || [];
  let nextGmUserIds = Array.isArray(patch.gmUserIds) ? patch.gmUserIds.filter((item) => typeof item === 'string') : getSessionGmUserIds(session);

  if (Array.isArray(patch.gmUserIds) && nextParticipants.length > 0) {
    nextParticipants = nextParticipants.map((participant) =>
      nextGmUserIds.includes(participant.userId) ? { ...participant, role: 'gm' } : participant
    );
  }

  if (Array.isArray(patch.participants)) {
    nextGmUserIds = Array.from(
      new Set(
        nextParticipants
          .filter((participant) => participant.role === 'gm' && typeof participant.userId === 'string')
          .map((participant) => participant.userId)
      )
    );
  }
  if (nextGmUserIds.length === 0) {
    nextGmUserIds = [session.gmUserId];
  }

  const nextOwnerUserId = typeof patch.ownerUserId === 'string' ? patch.ownerUserId : session.ownerUserId || session.gmUserId;
  if (nextOwnerUserId !== (session.ownerUserId || session.gmUserId) && !isSessionOwner(session, currentUser.id) && !currentUser.roles.includes('admin')) {
    return error(res, 403, 'SESSION_TRANSFER_FORBIDDEN', 'Only owner/admin can transfer ownership');
  }

  const next = {
    ...session,
    ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
    ...(typeof patch.description === 'string' ? { description: patch.description } : {}),
    ...(typeof patch.state === 'string' ? { state: patch.state } : {}),
    ...(typeof patch.systemId === 'string' ? { systemId: patch.systemId } : {}),
    ownerUserId: nextOwnerUserId,
    gmUserId: nextGmUserIds[0],
    gmUserIds: nextGmUserIds,
    ...(patch.settings ? { settings: patch.settings } : {}),
    participants: nextParticipants,
    ...(Array.isArray(patch.invitations) ? { invitations: patch.invitations } : {}),
    ...(patch.screenTemplateAssignments && typeof patch.screenTemplateAssignments === 'object'
      ? { screenTemplateAssignments: patch.screenTemplateAssignments }
      : {}),
    ...(patch.screenTemplateSelections && typeof patch.screenTemplateSelections === 'object'
      ? { screenTemplateSelections: patch.screenTemplateSelections }
      : {}),
    ...(typeof patch.archivedAt === 'string' || patch.archivedAt === null ? { archivedAt: patch.archivedAt } : {}),
    ...(patch.initiative ? { initiative: patch.initiative } : {}),
    updatedAt: nowIso()
  };
  if (
    (typeof patch.state === 'string' && patch.state !== session.state) ||
    (typeof patch.name === 'string' && patch.name !== session.name) ||
    (typeof patch.description === 'string' && patch.description !== (session.description || ''))
  ) {
    next.activityLog = appendSessionActivity(next, {
      type: 'session_updated',
      actorUserId: currentUser.id,
      message: `Partie mise a jour par @${currentUser.nickname || currentUser.id}.`
    });
  }

  sessions.set(next.id, next);
  if (next.discordIntegration?.guildId) {
    pushDiscordSessionEvent(next.archivedAt ? 'archive' : 'upsert', next);
  }
  schedulePersist('session-update');
  return res.status(200).json({ session: publicSession(next, currentUser) });
});

app.delete('/api/sessions/:sessionId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const isOwner = isSessionOwner(session, req.currentUser.id);
  if (!isOwner && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'SESSION_DELETE_FORBIDDEN', 'Only owner/admin can delete this session');
  }

  if (session.discordIntegration?.guildId) {
    pushDiscordSessionEvent('delete', session);
  }
  deleteSessionArtifacts(session.id);
  sessions.delete(session.id);
  schedulePersist('session-delete');
  return res.status(204).send();
});

app.post('/api/sessions/:sessionId/archive', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ARCHIVE_FORBIDDEN', 'Only GM/admin can archive this session');
  }

  const next = {
    ...session,
    archivedAt: nowIso(),
    updatedAt: nowIso()
  };
  sessions.set(next.id, next);
  if (next.discordIntegration?.guildId) {
    pushDiscordSessionEvent('archive', next);
  }
  schedulePersist('session-archive');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.post('/api/sessions/:sessionId/restore', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ARCHIVE_FORBIDDEN', 'Only GM/admin can restore this session');
  }

  const next = {
    ...session,
    archivedAt: null,
    updatedAt: nowIso()
  };
  sessions.set(next.id, next);
  if (next.discordIntegration?.guildId) {
    pushDiscordSessionEvent('upsert', next);
  }
  schedulePersist('session-restore');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.post('/api/sessions/:sessionId/discord/link', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can link a Discord channel');
  }

  const guildId = typeof req.body?.guildId === 'string' ? req.body.guildId.trim() : '';
  if (!guildId) {
    return error(res, 400, 'DISCORD_GUILD_REQUIRED', 'Discord guildId is required');
  }

  const now = nowIso();
  const next = {
    ...session,
    discordIntegration: {
      ...(session.discordIntegration && typeof session.discordIntegration === 'object' ? session.discordIntegration : {}),
      guildId,
      status: session.archivedAt ? 'archived' : 'link_requested',
      linkedAt: session.discordIntegration?.linkedAt || now,
      linkedByUserId: req.currentUser.id,
      updatedAt: now
    },
    updatedAt: now
  };
  sessions.set(next.id, next);
  pushDiscordSessionEvent(next.archivedAt ? 'archive' : 'upsert', next);
  schedulePersist('session-discord-link');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.post('/api/sessions/:sessionId/discord/unlink', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can unlink a Discord channel');
  }

  if (session.discordIntegration?.guildId) {
    pushDiscordSessionEvent('delete', session);
  }
  const next = {
    ...session,
    discordIntegration: null,
    updatedAt: nowIso()
  };
  sessions.set(next.id, next);
  schedulePersist('session-discord-unlink');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.post('/api/sessions/:sessionId/invitations', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can invite participants');
  }

  const body = req.body || {};
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const role = body.role === 'gm' || body.role === 'observer' ? body.role : 'player';

  if (!userId) {
    return error(res, 400, 'INVITATION_USER_REQUIRED', 'User is required');
  }

  const targetUser = users.get(userId);
  if (!targetUser || !targetUser.isActive || targetUser.approvalStatus !== 'approved') {
    return error(res, 404, 'INVITATION_USER_NOT_FOUND', 'Target user not found');
  }

  if ((session.participants || []).some((participant) => participant.userId === userId)) {
    return error(res, 409, 'INVITATION_ALREADY_PARTICIPANT', 'User is already a participant');
  }

  const existingInvitation = (session.invitations || []).find((invitation) => invitation.userId === userId);
  if (existingInvitation && existingInvitation.status === 'pending') {
    return error(res, 409, 'INVITATION_ALREADY_PENDING', 'Invitation is already pending');
  }

  const now = nowIso();
  const nextInvitations = [...(session.invitations || [])];
  if (existingInvitation) {
    const index = nextInvitations.findIndex((invitation) => invitation.id === existingInvitation.id);
    nextInvitations[index] = {
      ...existingInvitation,
      role,
      invitedByUserId: req.currentUser.id,
      createdAt: now,
      status: 'pending',
      discordActionToken: makeToken()
    };
  } else {
    nextInvitations.push({
      id: makeId('invite'),
      userId,
      role,
      invitedByUserId: req.currentUser.id,
      createdAt: now,
      status: 'pending',
      discordActionToken: makeToken()
    });
  }

  const next = {
    ...session,
    invitations: nextInvitations,
    updatedAt: now
  };
  next.activityLog = appendSessionActivity(next, {
    type: 'invitation_sent',
    actorUserId: req.currentUser.id,
    message: `Invitation envoyee a @${targetUser.nickname || targetUser.id} comme ${role}.`
  });
  sessions.set(next.id, next);
  const sentInvitation = next.invitations.find((item) => item.userId === userId && item.status === 'pending');
  if (sentInvitation) {
    pushDiscordSessionInvitationEvent(next, sentInvitation);
  }
  schedulePersist('session-invitation-create');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.post('/api/sessions/:sessionId/invitations/:invitationId/accept', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const invitation = (session.invitations || []).find((item) => item.id === req.params.invitationId);
  if (!invitation) {
    return error(res, 404, 'INVITATION_NOT_FOUND', 'Invitation not found');
  }

  if (!req.currentUser.roles.includes('admin') && invitation.userId !== req.currentUser.id) {
    return error(res, 403, 'INVITATION_FORBIDDEN', 'Forbidden');
  }
  if (invitation.status !== 'pending') {
    return error(res, 409, 'INVITATION_NOT_PENDING', 'Invitation is no longer pending');
  }

  const now = nowIso();
  const nextParticipants = [...(session.participants || [])];
  const existingIndex = nextParticipants.findIndex((participant) => participant.userId === invitation.userId);
  if (existingIndex >= 0) {
    nextParticipants[existingIndex] = {
      ...nextParticipants[existingIndex],
      role: invitation.role
    };
  } else {
    nextParticipants.push({
      userId: invitation.userId,
      role: invitation.role,
      characterId: null,
      isConnected: false,
      lastSeenAt: null
    });
  }

  const nextGmUserIds = Array.from(
    new Set(
      nextParticipants
        .filter((participant) => participant.role === 'gm' && typeof participant.userId === 'string')
        .map((participant) => participant.userId)
    )
  );

  const next = {
    ...session,
    participants: nextParticipants,
    invitations: (session.invitations || []).map((item) =>
      item.id === invitation.id ? { ...item, status: 'accepted', discordActionToken: null } : item
    ),
    gmUserIds: nextGmUserIds.length ? nextGmUserIds : [session.gmUserId],
    gmUserId: nextGmUserIds[0] || session.gmUserId,
    updatedAt: now
  };
  next.activityLog = appendSessionActivity(next, {
    type: 'invitation_accepted',
    actorUserId: req.currentUser.id,
    message: `@${req.currentUser.nickname || req.currentUser.id} a accepte l invitation de partie.`
  });
  sessions.set(next.id, next);
  if (next.discordIntegration?.guildId) {
    pushDiscordSessionEvent(next.archivedAt ? 'archive' : 'upsert', next);
  }
  schedulePersist('session-invitation-accept');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.post('/api/sessions/:sessionId/invitations/:invitationId/decline', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const invitation = (session.invitations || []).find((item) => item.id === req.params.invitationId);
  if (!invitation) {
    return error(res, 404, 'INVITATION_NOT_FOUND', 'Invitation not found');
  }

  if (!req.currentUser.roles.includes('admin') && invitation.userId !== req.currentUser.id) {
    return error(res, 403, 'INVITATION_FORBIDDEN', 'Forbidden');
  }
  if (invitation.status !== 'pending') {
    return error(res, 409, 'INVITATION_NOT_PENDING', 'Invitation is no longer pending');
  }

  const next = {
    ...session,
    invitations: (session.invitations || []).map((item) =>
      item.id === invitation.id ? { ...item, status: 'declined', discordActionToken: null } : item
    ),
    updatedAt: nowIso()
  };
  next.activityLog = appendSessionActivity(next, {
    type: 'invitation_declined',
    actorUserId: req.currentUser.id,
    message: `@${req.currentUser.nickname || req.currentUser.id} a refuse l invitation de partie.`
  });
  sessions.set(next.id, next);
  schedulePersist('session-invitation-decline');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.post('/api/sessions/:sessionId/invitations/:invitationId/cancel', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can cancel invitations');
  }

  const invitation = (session.invitations || []).find((item) => item.id === req.params.invitationId);
  if (!invitation) {
    return error(res, 404, 'INVITATION_NOT_FOUND', 'Invitation not found');
  }
  if (invitation.status !== 'pending') {
    return error(res, 409, 'INVITATION_NOT_PENDING', 'Invitation is no longer pending');
  }

  const next = {
    ...session,
    invitations: (session.invitations || []).map((item) =>
      item.id === invitation.id ? { ...item, status: 'declined', discordActionToken: null } : item
    ),
    updatedAt: nowIso()
  };
  next.activityLog = appendSessionActivity(next, {
    type: 'invitation_cancelled',
    actorUserId: req.currentUser.id,
    message: `Invitation annulee pour @${invitation.nickname || invitation.userId}.`
  });
  sessions.set(next.id, next);
  schedulePersist('session-invitation-cancel');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.post('/api/sessions/:sessionId/invitations/:invitationId/resend', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can resend invitations');
  }

  const invitation = (session.invitations || []).find((item) => item.id === req.params.invitationId);
  if (!invitation) {
    return error(res, 404, 'INVITATION_NOT_FOUND', 'Invitation not found');
  }

  const next = {
    ...session,
    invitations: (session.invitations || []).map((item) =>
      item.id === invitation.id
        ? {
            ...item,
            status: 'pending',
            invitedByUserId: req.currentUser.id,
            createdAt: nowIso(),
            discordActionToken: makeToken()
          }
        : item
    ),
    updatedAt: nowIso()
  };
  next.activityLog = appendSessionActivity(next, {
    type: 'invitation_resent',
    actorUserId: req.currentUser.id,
    message: `Invitation relancee pour @${invitation.nickname || invitation.userId}.`
  });
  sessions.set(next.id, next);
  const resentInvitation = next.invitations.find((item) => item.id === invitation.id);
  if (resentInvitation) {
    pushDiscordSessionInvitationEvent(next, resentInvitation);
  }
  schedulePersist('session-invitation-resend');
  return res.status(200).json({ session: publicSession(next, req.currentUser) });
});

app.get('/api/sessions/invitations/respond', (req, res) => {
  const token = String(req.query?.token || '').trim();
  const response = String(req.query?.response || '').trim() === 'decline' ? 'decline' : 'accept';
  if (!token) {
    return res.redirect(`${APP_BASE_URL.replace(/\/$/, '')}/sessions?discordInvite=invalid`);
  }

  const session = [...sessions.values()].find((candidate) =>
    (candidate.invitations || []).some((invitation) => invitation.status === 'pending' && invitation.discordActionToken === token)
  );
  if (!session) {
    return res.redirect(`${APP_BASE_URL.replace(/\/$/, '')}/sessions?discordInvite=expired`);
  }

  const invitation = (session.invitations || []).find((item) => item.status === 'pending' && item.discordActionToken === token);
  if (!invitation) {
    return res.redirect(`${APP_BASE_URL.replace(/\/$/, '')}/sessions/${session.id}?discordInvite=expired`);
  }

  const invitedUser = users.get(invitation.userId);
  if (!invitedUser) {
    return res.redirect(`${APP_BASE_URL.replace(/\/$/, '')}/sessions/${session.id}?discordInvite=invalid`);
  }

  if (response === 'accept') {
    const now = nowIso();
    const nextParticipants = [...(session.participants || [])];
    const existingIndex = nextParticipants.findIndex((participant) => participant.userId === invitation.userId);
    if (existingIndex >= 0) {
      nextParticipants[existingIndex] = {
        ...nextParticipants[existingIndex],
        role: invitation.role
      };
    } else {
      nextParticipants.push({
        userId: invitation.userId,
        role: invitation.role,
        characterId: null,
        isConnected: false,
        lastSeenAt: null
      });
    }
    const nextGmUserIds = Array.from(
      new Set(
        nextParticipants
          .filter((participant) => participant.role === 'gm' && typeof participant.userId === 'string')
          .map((participant) => participant.userId)
      )
    );
    const next = {
      ...session,
      participants: nextParticipants,
      invitations: (session.invitations || []).map((item) =>
        item.id === invitation.id ? { ...item, status: 'accepted', discordActionToken: null } : item
      ),
      gmUserIds: nextGmUserIds.length ? nextGmUserIds : [session.gmUserId],
      gmUserId: nextGmUserIds[0] || session.gmUserId,
      updatedAt: now
    };
    next.activityLog = appendSessionActivity(next, {
      type: 'invitation_accepted',
      actorUserId: invitedUser.id,
      message: `@${invitedUser.nickname || invitedUser.id} a accepte l invitation de partie depuis Discord.`
    });
    sessions.set(next.id, next);
    if (next.discordIntegration?.guildId) {
      pushDiscordSessionEvent(next.archivedAt ? 'archive' : 'upsert', next);
    }
    schedulePersist('discord-invitation-accept');
    return res.redirect(`${APP_BASE_URL.replace(/\/$/, '')}/sessions/${session.id}?discordInvite=accepted`);
  }

  const next = {
    ...session,
    invitations: (session.invitations || []).map((item) =>
      item.id === invitation.id ? { ...item, status: 'declined', discordActionToken: null } : item
    ),
    updatedAt: nowIso()
  };
  next.activityLog = appendSessionActivity(next, {
    type: 'invitation_declined',
    actorUserId: invitedUser.id,
    message: `@${invitedUser.nickname || invitedUser.id} a refuse l invitation de partie depuis Discord.`
  });
  sessions.set(next.id, next);
  schedulePersist('discord-invitation-decline');
  return res.redirect(`${APP_BASE_URL.replace(/\/$/, '')}/sessions/${session.id}?discordInvite=declined`);
});

app.get('/api/sessions/:sessionId/messages', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canViewSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const items = [...messages.values()]
    .filter((message) => message.sessionId === session.id)
    .filter((message) => canViewMessage(message, session, req.currentUser))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(publicMessage);

  return res.status(200).json({ items });
});

app.post('/api/sessions/:sessionId/messages', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canViewSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const body = req.body || {};
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return error(res, 400, 'MESSAGE_CONTENT_REQUIRED', 'Message content is required');
  }

  const channelType =
    body.channelType === 'direct' || body.channelType === 'group' || body.channelType === 'system' ? body.channelType : 'global';
  const toUserIds = Array.isArray(body.toUserIds) ? body.toUserIds.filter((item) => typeof item === 'string') : [];
  const requestedFromUserId = typeof body.fromUserId === 'string' ? body.fromUserId : req.currentUser.id;
  const fromUserId =
    requestedFromUserId === 'system' && (getSessionGmUserIds(session).includes(req.currentUser.id) || req.currentUser.roles.includes('admin'))
      ? 'system'
      : req.currentUser.id;

  const message = {
    id: makeId('message'),
    sessionId: session.id,
    channelType,
    fromUserId,
    toUserIds,
    groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
    content,
    createdAt: nowIso(),
    isPrivateToGM: Boolean(body.isPrivateToGM),
    ui: body.ui && typeof body.ui === 'object' ? clone(body.ui) : undefined,
    channelId: typeof body.channelId === 'string' ? body.channelId : undefined,
    systemType: typeof body.systemType === 'string' ? body.systemType : undefined
  };

  if (message.isPrivateToGM) {
    message.channelType = 'direct';
    message.toUserIds = getSessionGmUserIds(session);
  }

  messages.set(message.id, message);
  schedulePersist('session-message-create');
  return res.status(201).json({ item: publicMessage(message) });
});

app.get('/api/sessions/:sessionId/notes', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canViewSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const items = [...notes.values()]
    .filter((note) => note.sessionId === session.id || note.scopeRefId === session.id)
    .filter((note) => canViewNote(note, session, req.currentUser))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .map(publicNote);

  return res.status(200).json({ items });
});

app.post('/api/sessions/:sessionId/notes', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canViewSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const body = req.body || {};
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return error(res, 400, 'NOTE_CONTENT_REQUIRED', 'Note content is required');
  }

  const requestedType = body.type === 'public' || body.type === 'gm_private' ? body.type : 'player_private';
  if (requestedType === 'gm_private' && !getSessionGmUserIds(session).includes(req.currentUser.id) && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'NOTE_TYPE_FORBIDDEN', 'Only GM can create GM private notes');
  }

  const note = {
    id: makeId('note'),
    scope: 'session',
    scopeRefId: session.id,
    sessionId: session.id,
    type: requestedType,
    title: typeof body.title === 'string' ? body.title.trim() : '',
    content,
    createdByUserId: req.currentUser.id,
    ownerUserId: requestedType === 'player_private' ? req.currentUser.id : null,
    visibleToUserIds: Array.isArray(body.visibleToUserIds) ? body.visibleToUserIds.filter((item) => typeof item === 'string') : [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  notes.set(note.id, note);
  schedulePersist('session-note-create');
  return res.status(201).json({ item: publicNote(note) });
});

app.patch('/api/sessions/:sessionId/notes/:noteId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  const note = notes.get(req.params.noteId);
  if (!note || (note.sessionId !== session.id && note.scopeRefId !== session.id)) {
    return error(res, 404, 'NOTE_NOT_FOUND', 'Note not found');
  }
  if (!canEditNote(note, session, req.currentUser)) {
    return error(res, 403, 'NOTE_EDIT_FORBIDDEN', 'Forbidden');
  }

  const body = req.body || {};
  const nextType =
    body.type === 'public' || body.type === 'gm_private' || body.type === 'player_private'
      ? body.type
      : note.type;
  if (nextType === 'gm_private' && !getSessionGmUserIds(session).includes(req.currentUser.id) && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'NOTE_TYPE_FORBIDDEN', 'Only GM can store GM private notes');
  }

  const next = {
    ...note,
    ...(typeof body.title === 'string' ? { title: body.title.trim() } : {}),
    ...(typeof body.content === 'string' ? { content: body.content } : {}),
    type: nextType,
    ownerUserId: nextType === 'player_private' ? req.currentUser.id : null,
    updatedAt: nowIso()
  };

  notes.set(next.id, next);
  schedulePersist('session-note-update');
  return res.status(200).json({ item: publicNote(next) });
});

app.delete('/api/sessions/:sessionId/notes/:noteId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  const note = notes.get(req.params.noteId);
  if (!note || (note.sessionId !== session.id && note.scopeRefId !== session.id)) {
    return error(res, 404, 'NOTE_NOT_FOUND', 'Note not found');
  }
  if (!canEditNote(note, session, req.currentUser)) {
    return error(res, 403, 'NOTE_EDIT_FORBIDDEN', 'Forbidden');
  }

  notes.delete(note.id);
  schedulePersist('session-note-delete');
  return res.status(204).send();
});

app.get('/api/systems', requireAuth, (req, res) => {
  const currentUser = req.currentUser;
  const items = [...systems.values()].filter((system) => canViewSystem(system, currentUser));
  return res.status(200).json({ items: items.map(clone) });
});

app.get('/api/systems/:systemId', requireAuth, (req, res) => {
  const system = systems.get(req.params.systemId);
  if (!system) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }

  if (!canViewSystem(system, req.currentUser)) {
    return error(res, 403, 'SYSTEM_ACCESS_FORBIDDEN', 'Forbidden');
  }

  return res.status(200).json({ system: clone(system) });
});

app.post('/api/systems', requireAuth, (req, res) => {
  const body = req.body || {};
  let validatedRollDefinitions;
  let validatedRulesPresentation;
  let validatedStudioTheme;
  let validatedStudioSchemaV2;
  let validatedCatalogs;
  let validatedDiscordConfig;
  let validatedCharacterCreationConfig;
  try {
    validatedRollDefinitions = validateRollDefinitions(body.rollDefinitions);
    validatedRulesPresentation = validateRulesPresentation(body.rulesPresentation);
    validatedStudioTheme = validateStudioTheme(body.studioTheme);
    validatedStudioSchemaV2 = validateStudioSchemaV2(body.studioSchemaV2);
    validatedCatalogs = validateCatalogs(body.catalogs);
    validatedDiscordConfig = validateDiscordConfig(body.discordConfig);
    validatedCharacterCreationConfig = validateCharacterCreationConfig(body.characterCreationConfig);
  } catch (validationError) {
    return error(res, 400, 'SYSTEM_PAYLOAD_INVALID', validationError instanceof Error ? validationError.message : 'Payload système invalide');
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Nouveau systeme';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  let rulesProgram = [];
  let rulesPresentation = undefined;
  let studioTheme = undefined;
  let studioSchemaV2 = undefined;
  let catalogs = undefined;
  let discordConfig = undefined;
  let characterCreationConfig = undefined;
  let forkedFromSystemId = undefined;
  let forkedFromSystemName = undefined;

  if (typeof body.templateFromSystemId === 'string') {
    const source = systems.get(body.templateFromSystemId);
    if (source && canViewSystem(source, req.currentUser)) {
      rulesProgram = clone(source.rulesProgram || []);
      rulesPresentation = source.rulesPresentation ? clone(source.rulesPresentation) : undefined;
      studioTheme = source.studioTheme ? clone(source.studioTheme) : undefined;
      studioSchemaV2 = source.studioSchemaV2 ? clone(source.studioSchemaV2) : undefined;
      catalogs = source.catalogs ? clone(source.catalogs) : undefined;
      discordConfig = source.discordConfig ? clone(source.discordConfig) : undefined;
      characterCreationConfig = source.characterCreationConfig ? clone(source.characterCreationConfig) : undefined;
      forkedFromSystemId = source.id;
      forkedFromSystemName = source.name;
    }
  }

  const system = {
    id: makeId('sys'),
    name,
    version: typeof body.version === 'string' ? body.version : '0.1.0',
    description,
    author: req.currentUser.displayName,
    ownerUserId: req.currentUser.id,
    status: 'draft',
    visibility: ['public', 'private', 'friends'].includes(body.visibility) ? body.visibility : 'public',
    viewerUserIds: Array.isArray(body.viewerUserIds) ? body.viewerUserIds.filter((id) => typeof id === 'string') : [],
    editorUserIds: Array.isArray(body.editorUserIds) ? body.editorUserIds.filter((id) => typeof id === 'string') : [],
    tags: Array.isArray(body.tags) ? body.tags : ['custom'],
    rollDefinitions: Array.isArray(validatedRollDefinitions) ? validatedRollDefinitions : [],
    rulesProgram: Array.isArray(body.rulesProgram) ? body.rulesProgram : rulesProgram,
    ...(validatedRulesPresentation
      ? { rulesPresentation: validatedRulesPresentation }
      : rulesPresentation
      ? { rulesPresentation }
      : {}),
    ...(validatedStudioTheme
      ? { studioTheme: validatedStudioTheme }
      : studioTheme
      ? { studioTheme }
      : {}),
    ...(validatedStudioSchemaV2
      ? { studioSchemaV2: validatedStudioSchemaV2 }
      : studioSchemaV2
      ? { studioSchemaV2 }
      : {}),
    ...(Array.isArray(validatedCatalogs)
      ? { catalogs: validatedCatalogs }
      : catalogs
      ? { catalogs }
      : {}),
    ...(validatedDiscordConfig
      ? { discordConfig: validatedDiscordConfig }
      : discordConfig
      ? { discordConfig }
      : {}),
    ...(validatedCharacterCreationConfig
      ? { characterCreationConfig: validatedCharacterCreationConfig }
      : characterCreationConfig
      ? { characterCreationConfig }
      : {}),
    ...(forkedFromSystemId ? { forkedFromSystemId } : {}),
    ...(forkedFromSystemName ? { forkedFromSystemName } : {}),
    auditTrail: [
      {
        id: makeId('audit'),
        at: nowIso(),
        byUserId: req.currentUser.id,
        action: 'create',
        summary: 'Creation du systeme'
      }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  systems.set(system.id, system);
  schedulePersist('system-create');
  return res.status(201).json({ system: clone(system) });
});

app.patch('/api/systems/:systemId', requireAuth, (req, res) => {
  const system = systems.get(req.params.systemId);
  if (!system) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }

  if (!canEditSystem(system, req.currentUser)) {
    return error(res, 403, 'SYSTEM_EDIT_FORBIDDEN', 'Only owner/admin can edit this system');
  }

  const body = req.body || {};
  let validatedRollDefinitions;
  let validatedRulesPresentation;
  let validatedStudioTheme;
  let validatedStudioSchemaV2;
  let validatedCatalogs;
  let validatedDiscordConfig;
  let validatedCharacterCreationConfig;
  try {
    validatedRollDefinitions = validateRollDefinitions(body.rollDefinitions);
    validatedRulesPresentation = validateRulesPresentation(body.rulesPresentation);
    validatedStudioTheme = validateStudioTheme(body.studioTheme);
    validatedStudioSchemaV2 = validateStudioSchemaV2(body.studioSchemaV2);
    validatedCatalogs = validateCatalogs(body.catalogs);
    validatedDiscordConfig = validateDiscordConfig(body.discordConfig);
    validatedCharacterCreationConfig = validateCharacterCreationConfig(body.characterCreationConfig);
  } catch (validationError) {
    return error(res, 400, 'SYSTEM_PAYLOAD_INVALID', validationError instanceof Error ? validationError.message : 'Payload système invalide');
  }
  const requestedStatus = body.status === 'published' ? 'published' : body.status === 'draft' ? 'draft' : system.status;
  const nextVisibility =
    typeof body.visibility === 'string' && ['public', 'private', 'friends'].includes(body.visibility)
      ? body.visibility
      : system.visibility;
  const candidate = {
    ...system,
    ...(typeof body.name === 'string' ? { name: body.name } : {}),
    ...(typeof body.description === 'string' ? { description: body.description } : {}),
    ...(typeof body.version === 'string' ? { version: body.version } : {}),
    visibility: nextVisibility,
    ...(Array.isArray(body.viewerUserIds)
      ? { viewerUserIds: body.viewerUserIds.filter((id) => typeof id === 'string') }
      : {}),
    ...(Array.isArray(body.editorUserIds)
      ? { editorUserIds: body.editorUserIds.filter((id) => typeof id === 'string') }
      : {}),
    ...(Array.isArray(body.tags) ? { tags: body.tags } : {}),
    ...(Array.isArray(validatedRollDefinitions) ? { rollDefinitions: validatedRollDefinitions } : {}),
    ...(Array.isArray(body.rulesProgram) ? { rulesProgram: body.rulesProgram } : {}),
    ...(validatedRulesPresentation ? { rulesPresentation: validatedRulesPresentation } : {}),
    ...(validatedStudioTheme ? { studioTheme: validatedStudioTheme } : {}),
    ...(validatedStudioSchemaV2 ? { studioSchemaV2: validatedStudioSchemaV2 } : {}),
    ...(Array.isArray(validatedCatalogs) ? { catalogs: validatedCatalogs } : {}),
    ...(validatedDiscordConfig ? { discordConfig: validatedDiscordConfig } : {}),
    ...(validatedCharacterCreationConfig ? { characterCreationConfig: validatedCharacterCreationConfig } : {})
  };

  if (requestedStatus === 'published' && !canPublishSystem(candidate)) {
    return error(res, 409, 'SYSTEM_PUBLISH_REQUIRES_CHARACTER_SHEET', 'System requires at least one character sheet view before publication');
  }

  const next = {
    ...candidate,
    status: requestedStatus,
    auditTrail: appendSystemAudit(system, {
      byUserId: req.currentUser.id,
      action: requestedStatus !== system.status ? (requestedStatus === 'published' ? 'publish' : 'unpublish') : 'update',
      summary: requestedStatus !== system.status ? (requestedStatus === 'published' ? 'Publication du systeme' : 'Retour en brouillon du systeme') : 'Mise a jour du systeme'
    }),
    updatedAt: nowIso()
  };

  systems.set(next.id, next);
  schedulePersist('system-update');
  return res.status(200).json({ system: clone(next) });
});

app.delete('/api/systems/:systemId', requireAuth, (req, res) => {
  const system = systems.get(req.params.systemId);
  if (!system) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }
  if (!(system.ownerUserId === req.currentUser.id || req.currentUser.roles.includes('admin'))) {
    return error(res, 403, 'SYSTEM_DELETE_FORBIDDEN', 'Only owner/admin can delete this system');
  }

  const relatedSessions = [...sessions.values()].filter((session) => session.systemId === system.id);
  if (relatedSessions.length > 0) {
    const next = {
      ...system,
      deletedAt: nowIso(),
      retainedForSessions: true,
      updatedAt: nowIso(),
      auditTrail: [
        ...(system.auditTrail ?? []),
        {
          id: makeId('audit'),
          at: nowIso(),
          byUserId: req.currentUser.id,
          action: 'delete_retained',
          summary: `Suppression auteur, conserve pour ${relatedSessions.length} partie(s)`
        }
      ].slice(-80)
    };
    systems.set(next.id, next);
    schedulePersist('system-delete-retained');
    return res.status(200).json({
      status: 'retained_for_sessions',
      retainedForSessions: true,
      relatedSessionsCount: relatedSessions.length
    });
  }

  systems.delete(system.id);
  schedulePersist('system-delete');
  return res.status(200).json({
    status: 'deleted',
    retainedForSessions: false,
    relatedSessionsCount: 0
  });
});

app.post('/api/systems/:systemId/duplicate', requireAuth, (req, res) => {
  const source = systems.get(req.params.systemId);
  if (!source) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }

  if (!req.currentUser.roles.includes('gm') && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'SYSTEM_DUPLICATE_FORBIDDEN', 'Only GMs and admins can fork published systems');
  }

  if (source.status !== 'published') {
    return error(res, 409, 'SYSTEM_NOT_PUBLISHED', 'Only published systems can be forked');
  }

  if (!canViewSystem(source, req.currentUser)) {
    return error(res, 403, 'SYSTEM_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const body = req.body || {};
  const duplicated = {
    ...clone(source),
    id: makeId('sys'),
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : `${source.name} (copie)`,
    description: typeof body.description === 'string' ? body.description : source.description || '',
    ownerUserId: req.currentUser.id,
    status: 'draft',
    visibility: 'private',
    viewerUserIds: [],
    editorUserIds: [],
    forkedFromSystemId: source.id,
    forkedFromSystemName: source.name,
    auditTrail: [
      {
        id: makeId('audit'),
        at: nowIso(),
        byUserId: req.currentUser.id,
        action: 'duplicate',
        summary: `Fork depuis ${source.name}`
      }
    ],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  systems.set(duplicated.id, duplicated);
  schedulePersist('system-duplicate');
  return res.status(201).json({ system: clone(duplicated) });
});

app.get('/api/sessions/:sessionId/characters', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  if (!canViewSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const items = Array.from(characters.values()).filter((character) => character.sessionId === req.params.sessionId);
  return res.status(200).json({ items: clone(items) });
});

function createSessionCharacterFromView(params) {
  const { session, system, view, actorUser, ownerUserId, name, sourceCharacterId = null, isPreGeneratedClone = false } = params;
  const ownerUser = ownerUserId ? users.get(ownerUserId) : null;
  const gmUser = users.get(session.gmUserId);
  const characterId = makeId('character');
  const rawName = typeof name === 'string' && name.trim() ? name.trim() : view.name;
  const templateContext = {
    nompj: rawName,
    nompartie: session.name || '',
    nommj: gmUser?.nickname || gmUser?.displayName || session.gmUserId,
    nomjoueur: ownerUser?.displayName || ownerUserId || actorUser.id,
    pseudojoueur: ownerUser?.nickname || ownerUserId || actorUser.id,
    nomsysteme: system.name || '',
    datecreation: nowIso().slice(0, 10)
  };
  const resolvedName = replaceReservedTokens(rawName, templateContext);

  return {
    id: characterId,
    systemId: system.id,
    viewId: view.id,
    sessionId: session.id,
    name: resolvedName,
    type: 'pc',
    ownerUserId: ownerUserId || null,
    createdFromViewId: view.id,
    sourceCharacterId,
    isPreGeneratedClone,
    initiativeMode: view.initiativeMode || null,
    initiativeFormula: view.initiativeFormula || null,
    sheet: buildCharacterSheetFromStudioView(view, system, characterId, resolvedName, templateContext)
  };
}

app.post('/api/sessions/:sessionId/characters/from-view', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can create session characters');
  }

  const body = req.body || {};
  const system = systems.get(body.systemId || session.systemId);
  if (!system) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }

  const view = (system.studioSchemaV2?.views || []).find((item) => item.id === body.viewId && item.isCharacterSheet);
  if (!view) {
    return error(res, 404, 'CHARACTER_VIEW_NOT_FOUND', 'Character sheet view not found');
  }

  const ownerUserId = typeof body.ownerUserId === 'string' ? body.ownerUserId : req.currentUser.id;
  const character = createSessionCharacterFromView({
    session,
    system,
    view,
    actorUser: req.currentUser,
    ownerUserId,
    name: typeof body.name === 'string' ? body.name : view.name
  });

  characters.set(character.id, character);
  schedulePersist('session-character-create-from-view');
  return res.status(201).json({ character: clone(character) });
});

app.post('/api/sessions/:sessionId/characters/self', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  const participant = (session.participants || []).find((item) => item.userId === req.currentUser.id);
  if (!participant) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only participants can create their character');
  }
  if (participant.role === 'observer') {
    return error(res, 403, 'SESSION_CHARACTER_FORBIDDEN', 'Observers cannot create a character');
  }

  const body = req.body || {};
  const system = systems.get(body.systemId || session.systemId);
  if (!system) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }
  const playerCreationViews = listPlayerCreationCharacterSheetViews(system);
  const view = playerCreationViews.find((item) => item.id === body.viewId);
  if (!view) {
    return error(res, 404, 'CHARACTER_VIEW_NOT_FOUND', 'Player character creation view not found');
  }

  const character = createSessionCharacterFromView({
    session,
    system,
    view,
    actorUser: req.currentUser,
    ownerUserId: req.currentUser.id,
    name: typeof body.name === 'string' ? body.name : view.name
  });
  characters.set(character.id, character);

  const nextSession = {
    ...session,
    participants: (session.participants || []).map((item) =>
      item.userId === req.currentUser.id
        ? { ...item, characterId: item.characterId || character.id }
        : item
    ),
    updatedAt: nowIso()
  };
  nextSession.activityLog = appendSessionActivity(nextSession, {
    type: 'character_created',
    actorUserId: req.currentUser.id,
    message: `@${req.currentUser.nickname || req.currentUser.id} a cree sa fiche ${character.name}.`
  });
  sessions.set(nextSession.id, nextSession);
  schedulePersist('session-character-create-self');
  return res.status(201).json({ character: clone(character), session: publicSession(nextSession, req.currentUser) });
});

app.post('/api/sessions/:sessionId/characters/:characterId/clone', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can clone a pre-generated character');
  }
  const source = characters.get(req.params.characterId);
  if (!source || source.sessionId !== session.id) {
    return error(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found');
  }

  const ownerUserId = typeof req.body?.ownerUserId === 'string' ? req.body.ownerUserId : '';
  const participant = (session.participants || []).find((item) => item.userId === ownerUserId);
  if (!participant) {
    return error(res, 404, 'PARTICIPANT_NOT_FOUND', 'Participant not found');
  }
  const system = systems.get(source.systemId || session.systemId);
  if (!system) {
    return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
  }
  const view = (system.studioSchemaV2?.views || []).find((item) => item.id === source.viewId && item.isCharacterSheet);
  if (!view) {
    return error(res, 404, 'CHARACTER_VIEW_NOT_FOUND', 'Character sheet view not found');
  }

  const cloned = createSessionCharacterFromView({
    session,
    system,
    view,
    actorUser: req.currentUser,
    ownerUserId,
    name: typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name : source.name,
    sourceCharacterId: source.id,
    isPreGeneratedClone: true
  });

  if (source.sheet) {
    cloned.sheet = clone(source.sheet);
    cloned.sheet.id = cloned.id;
    cloned.sheet.name = cloned.name;
  }
  cloned.attributes = source.attributes ? clone(source.attributes) : undefined;

  characters.set(cloned.id, cloned);
  const nextSession = {
    ...session,
    participants: (session.participants || []).map((item) =>
      item.userId === ownerUserId
        ? { ...item, characterId: item.characterId || cloned.id }
        : item
    ),
    updatedAt: nowIso()
  };
  nextSession.activityLog = appendSessionActivity(nextSession, {
    type: 'character_cloned',
    actorUserId: req.currentUser.id,
    message: `Pre-tire ${source.name} duplique pour @${participant.nickname || participant.userId}.`
  });
  sessions.set(nextSession.id, nextSession);
  schedulePersist('session-character-clone');
  return res.status(201).json({ character: clone(cloned), session: publicSession(nextSession, req.currentUser) });
});

app.patch('/api/sessions/:sessionId/characters/:characterId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can edit session characters');
  }

  const character = characters.get(req.params.characterId);
  if (!character || character.sessionId !== req.params.sessionId) {
    return error(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found');
  }

  const body = req.body || {};
  const next = {
    ...character,
    ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
    ...(typeof body.type === 'string' ? { type: body.type } : {}),
    ...(body.ownerUserId === null || typeof body.ownerUserId === 'string' ? { ownerUserId: body.ownerUserId } : {})
  };

  let nextSession = session;
  if (body.ownerUserId === null || typeof body.ownerUserId === 'string') {
    const targetOwnerUserId = typeof body.ownerUserId === 'string' && body.ownerUserId.trim() ? body.ownerUserId.trim() : null;
    if (targetOwnerUserId) {
      const participant = (session.participants || []).find((item) => item.userId === targetOwnerUserId);
      if (!participant) {
        return error(res, 404, 'PARTICIPANT_NOT_FOUND', 'Participant not found');
      }
    }
    const nextParticipants = (session.participants || []).map((participant) => {
      if (participant.characterId === character.id) {
        return { ...participant, characterId: null };
      }
      if (targetOwnerUserId && participant.userId === targetOwnerUserId) {
        return { ...participant, characterId: character.id };
      }
      return participant;
    });
    nextSession = {
      ...session,
      participants: nextParticipants,
      updatedAt: nowIso()
    };
    nextSession.activityLog = appendSessionActivity(nextSession, {
      type: 'character_updated',
      actorUserId: req.currentUser.id,
      message: `Fiche ${next.name} reattribuee ${targetOwnerUserId ? `a @${users.get(targetOwnerUserId)?.nickname || targetOwnerUserId}` : 'sans proprietaire'}.`
    });
    sessions.set(nextSession.id, nextSession);
  }

  if (next.sheet) {
    next.sheet = {
      ...next.sheet,
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {})
    };
  }

  characters.set(next.id, next);
  schedulePersist('session-character-update');
  return res.status(200).json({ character: clone(next), session: publicSession(nextSession, req.currentUser) });
});

app.patch('/api/sessions/:sessionId/characters/:characterId/sheet', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const character = characters.get(req.params.characterId);
  if (!character || character.sessionId !== req.params.sessionId || !character.sheet) {
    return error(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found');
  }

  const isOwner = character.ownerUserId === req.currentUser.id;
  if (!canManageSession(session, req.currentUser) && !isOwner) {
    return error(res, 403, 'CHARACTER_SHEET_FORBIDDEN', 'Only GM/admin or owner can edit this sheet');
  }

  const fields = Array.isArray(req.body?.fields) ? req.body.fields : null;
  if (!fields) {
    return error(res, 400, 'CHARACTER_SHEET_FIELDS_REQUIRED', 'fields is required');
  }
  const runtimeValues =
    req.body?.runtimeValues && typeof req.body.runtimeValues === 'object' && !Array.isArray(req.body.runtimeValues)
      ? clone(req.body.runtimeValues)
      : null;

  const next = {
    ...character,
    ...(runtimeValues ? { runtimeValues } : {}),
    sheet: {
      ...character.sheet,
      fields: fields.map((field) => ({ ...field }))
    }
  };

  characters.set(next.id, next);
  schedulePersist('session-character-sheet-update');
  return res.status(200).json({ character: clone(next), session: publicSession(session, req.currentUser) });
});

app.post('/api/sessions/:sessionId/participants/:userId/remove', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const targetUserId = req.params.userId;
  const targetParticipant = (session.participants || []).find((participant) => participant.userId === targetUserId);
  if (!targetParticipant) {
    return error(res, 404, 'PARTICIPANT_NOT_FOUND', 'Participant not found');
  }

  const isSelfRemoval = req.currentUser.id === targetUserId;
  const isAdmin = req.currentUser.roles.includes('admin');
  if (!isSelfRemoval && !canManageSession(session, req.currentUser) && !isAdmin) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can remove another participant');
  }
  if (targetUserId === (session.ownerUserId || session.gmUserId) && !isAdmin) {
    return error(res, 403, 'SESSION_OWNER_REMOVE_FORBIDDEN', 'The session owner cannot be removed');
  }

  const detachedCharacterIds = [];
  for (const character of [...characters.values()]) {
    if (character.sessionId === session.id && character.ownerUserId === targetUserId) {
      characters.set(character.id, {
        ...character,
        ownerUserId: null
      });
      detachedCharacterIds.push(character.id);
    }
  }

  const nextParticipants = normalizeSessionParticipantsOnServer(
    (session.participants || [])
      .filter((participant) => participant.userId !== targetUserId)
      .map((participant) =>
        detachedCharacterIds.includes(participant.characterId)
          ? { ...participant, characterId: null }
          : participant
      ),
    session.ownerUserId || session.gmUserId
  );
  const nextGmUserIds = Array.from(
    new Set(
      nextParticipants
        .filter((participant) => participant.role === 'gm' && typeof participant.userId === 'string')
        .map((participant) => participant.userId)
    )
  );
  const nextSession = {
    ...session,
    participants: nextParticipants,
    gmUserIds: nextGmUserIds.length ? nextGmUserIds : [session.gmUserId],
    gmUserId: nextGmUserIds[0] || session.gmUserId,
    updatedAt: nowIso()
  };
  nextSession.activityLog = appendSessionActivity(nextSession, {
    type: isSelfRemoval ? 'participant_left' : 'participant_removed',
    actorUserId: req.currentUser.id,
    message: isSelfRemoval
      ? `@${req.currentUser.nickname || req.currentUser.id} a quitte la partie.`
      : `@${targetParticipant.nickname || targetParticipant.userId} a ete retire de la partie.`
  });
  sessions.set(nextSession.id, nextSession);
  if (nextSession.discordIntegration?.guildId) {
    pushDiscordSessionEvent(nextSession.archivedAt ? 'archive' : 'upsert', nextSession);
  }
  schedulePersist('session-participant-remove');

  return res.status(200).json({
    session: publicSession(nextSession, req.currentUser),
    detachedCharacterIds
  });
});

app.post('/api/sessions/:sessionId/characters/:characterId/remove-from-session', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  if (!canManageSession(session, req.currentUser)) {
    return error(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM/admin can remove session characters');
  }

  const character = characters.get(req.params.characterId);
  if (!character || character.sessionId !== req.params.sessionId) {
    return error(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found');
  }

  const nextCharacter = {
    ...character,
    sessionId: null
  };
  characters.set(nextCharacter.id, nextCharacter);

  const nextParticipants = (session.participants || []).map((participant) =>
    participant.characterId === character.id ? { ...participant, characterId: null } : participant
  );
  const nextSession = { ...session, participants: nextParticipants, updatedAt: nowIso() };
  nextSession.activityLog = appendSessionActivity(nextSession, {
    type: 'character_removed_from_session',
    actorUserId: req.currentUser.id,
    message: `Fiche ${character.name} retiree de la partie sans suppression.`
  });
  sessions.set(nextSession.id, nextSession);
  schedulePersist('session-character-remove-from-session');

  return res.status(200).json({ character: clone(nextCharacter), session: publicSession(nextSession, req.currentUser) });
});

app.delete('/api/sessions/:sessionId/characters/:characterId', requireAuth, (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }

  const character = characters.get(req.params.characterId);
  if (!character || character.sessionId !== req.params.sessionId) {
    return error(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found');
  }

  const isAdmin = req.currentUser.roles.includes('admin');
  const isOwner = Boolean(character.ownerUserId && character.ownerUserId === req.currentUser.id);
  const isSessionModel = !character.ownerUserId;
  const canDeleteModel = isSessionModel && canManageSession(session, req.currentUser);
  if (!isAdmin && !isOwner && !canDeleteModel) {
    return error(
      res,
      403,
      'CHARACTER_DELETE_FORBIDDEN',
      'Only the owner can delete this character. GM can only remove player characters from the session.'
    );
  }

  characters.delete(character.id);

  const nextParticipants = (session.participants || []).map((participant) =>
    participant.characterId === character.id ? { ...participant, characterId: null } : participant
  );
  const nextSession = { ...session, participants: nextParticipants, updatedAt: nowIso() };
  nextSession.activityLog = appendSessionActivity(nextSession, {
    type: 'character_deleted',
    actorUserId: req.currentUser.id,
    message: `Fiche ${character.name} supprimee definitivement.`
  });
  sessions.set(nextSession.id, nextSession);
  schedulePersist('session-character-delete');

  return res.status(204).end();
});

app.get('/api/resources', requireAuth, (req, res) => {
  const currentUser = req.currentUser;
  const scopeType = typeof req.query?.scopeType === 'string' ? req.query.scopeType : null;
  const scopeRefId = typeof req.query?.scopeRefId === 'string' ? req.query.scopeRefId : null;
  const kind = typeof req.query?.kind === 'string' ? req.query.kind : null;
  const folderId = typeof req.query?.folderId === 'string' ? req.query.folderId : null;

  if (scopeType === 'session' && scopeRefId && sessions.has(scopeRefId)) {
    ensureSessionDefaultResourceFolders(sessions.get(scopeRefId));
  }

  const items = [...resources.values()]
    .filter((resource) => canViewResource(resource, currentUser))
    .filter((resource) => (scopeType ? resource.scopeType === scopeType : true))
    .filter((resource) => (scopeRefId ? resource.scopeRefId === scopeRefId : true))
    .filter((resource) => (kind ? resource.kind === kind : true))
    .filter((resource) => (folderId ? (resource.folderId || null) === folderId : true))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(publicResource);

  return res.status(200).json({ items });
});

app.get('/api/resource-folders', requireAuth, (req, res) => {
  const currentUser = req.currentUser;
  const scopeType = typeof req.query?.scopeType === 'string' ? req.query.scopeType : null;
  const scopeRefId = typeof req.query?.scopeRefId === 'string' ? req.query.scopeRefId : null;

  if (scopeType === 'session' && scopeRefId && sessions.has(scopeRefId)) {
    ensureSessionDefaultResourceFolders(sessions.get(scopeRefId));
  }

  const items = [...resourceFolders.values()]
    .filter((folder) => canViewResourceFolder(folder, currentUser))
    .filter((folder) => (scopeType ? folder.scopeType === scopeType : true))
    .filter((folder) => (scopeRefId ? (folder.scopeRefId || null) === scopeRefId : true))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'))
    .map(publicResourceFolder);

  return res.status(200).json({ items });
});

app.post('/api/resource-folders', requireAuth, (req, res) => {
  const body = req.body || {};
  const scopeType = normalizeResourceScopeType(body.scopeType);
  const scopeRefId = typeof body.scopeRefId === 'string' && body.scopeRefId.trim() ? body.scopeRefId.trim() : null;
  const parentFolderId = typeof body.parentFolderId === 'string' && body.parentFolderId.trim() ? body.parentFolderId.trim() : null;
  const visibilityHint = RESOURCE_FOLDER_VISIBILITIES.includes(body.visibilityHint) ? body.visibilityHint : 'all';
  const name = sanitizeFolderName(body.name, 'Nouveau dossier');

  if (scopeType === 'system') {
    const system = systems.get(scopeRefId);
    if (!system) {
      return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
    }
    if (!canEditSystem(system, req.currentUser)) {
      return error(res, 403, 'RESOURCE_FOLDER_SCOPE_FORBIDDEN', 'Only owner/editor/admin can create folders in this system');
    }
  }

  if (scopeType === 'session') {
    const session = sessions.get(scopeRefId);
    if (!session) {
      return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
    }
    ensureSessionDefaultResourceFolders(session);
    if (!canManageSession(session, req.currentUser)) {
      return error(res, 403, 'RESOURCE_FOLDER_SCOPE_FORBIDDEN', 'Only GM/admin can create custom folders in this session');
    }
  }

  if (parentFolderId) {
    const parentFolder = resourceFolders.get(parentFolderId);
    if (!parentFolder) {
      return error(res, 404, 'RESOURCE_FOLDER_PARENT_NOT_FOUND', 'Parent folder not found');
    }
    if (!canEditResourceFolder(parentFolder, req.currentUser)) {
      return error(res, 403, 'RESOURCE_FOLDER_PARENT_FORBIDDEN', 'Parent folder forbidden');
    }
    if (parentFolder.scopeType !== scopeType || (parentFolder.scopeRefId || null) !== (scopeRefId || null)) {
      return error(res, 400, 'RESOURCE_FOLDER_SCOPE_MISMATCH', 'Parent folder has a different scope');
    }
  }

  const folder = {
    id: makeId('folder'),
    ownerUserId: req.currentUser.id,
    scopeType,
    scopeRefId,
    parentFolderId,
    name,
    visibilityHint: scopeType === 'session' ? visibilityHint : 'all',
    defaultType: null,
    sessionMemberUserId: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  normalizeResourceFolder(folder);
  resourceFolders.set(folder.id, folder);
  schedulePersist('resource-folder-create');
  return res.status(201).json({ folder: publicResourceFolder(folder) });
});

app.patch('/api/resource-folders/:folderId', requireAuth, (req, res) => {
  const folder = resourceFolders.get(req.params.folderId);
  if (!folder) {
    return error(res, 404, 'RESOURCE_FOLDER_NOT_FOUND', 'Folder not found');
  }
  if (folder.defaultType) {
    return error(res, 400, 'RESOURCE_FOLDER_DEFAULT_LOCKED', 'Default folders cannot be renamed or moved');
  }
  if (!canEditResourceFolder(folder, req.currentUser)) {
    return error(res, 403, 'RESOURCE_FOLDER_UPDATE_FORBIDDEN', 'Folder update forbidden');
  }

  const body = req.body || {};
  if (typeof body.name === 'string' && body.name.trim()) {
    folder.name = sanitizeFolderName(body.name, folder.name);
  }
  if (body.parentFolderId === null || typeof body.parentFolderId === 'string') {
    const nextParentFolderId = typeof body.parentFolderId === 'string' && body.parentFolderId.trim() ? body.parentFolderId.trim() : null;
    if (nextParentFolderId === folder.id) {
      return error(res, 400, 'RESOURCE_FOLDER_PARENT_INVALID', 'A folder cannot be its own parent');
    }
    if (nextParentFolderId) {
      const parentFolder = resourceFolders.get(nextParentFolderId);
      if (!parentFolder) {
        return error(res, 404, 'RESOURCE_FOLDER_PARENT_NOT_FOUND', 'Parent folder not found');
      }
      if (!canEditResourceFolder(parentFolder, req.currentUser)) {
        return error(res, 403, 'RESOURCE_FOLDER_PARENT_FORBIDDEN', 'Parent folder forbidden');
      }
      if (parentFolder.scopeType !== folder.scopeType || (parentFolder.scopeRefId || null) !== (folder.scopeRefId || null)) {
        return error(res, 400, 'RESOURCE_FOLDER_SCOPE_MISMATCH', 'Parent folder has a different scope');
      }
    }
    folder.parentFolderId = nextParentFolderId;
  }
  folder.updatedAt = nowIso();
  normalizeResourceFolder(folder);
  resourceFolders.set(folder.id, folder);
  schedulePersist('resource-folder-update');
  return res.status(200).json({ folder: publicResourceFolder(folder) });
});

app.delete('/api/resource-folders/:folderId', requireAuth, (req, res) => {
  const folder = resourceFolders.get(req.params.folderId);
  if (!folder) {
    return error(res, 404, 'RESOURCE_FOLDER_NOT_FOUND', 'Folder not found');
  }
  if (folder.defaultType) {
    return error(res, 400, 'RESOURCE_FOLDER_DEFAULT_LOCKED', 'Default folders cannot be deleted');
  }
  if (!canEditResourceFolder(folder, req.currentUser)) {
    return error(res, 403, 'RESOURCE_FOLDER_DELETE_FORBIDDEN', 'Folder delete forbidden');
  }
  const hasChildFolder = [...resourceFolders.values()].some((item) => item.parentFolderId === folder.id);
  const hasChildResource = [...resources.values()].some((item) => item.folderId === folder.id);
  if (hasChildFolder || hasChildResource) {
    return error(res, 400, 'RESOURCE_FOLDER_NOT_EMPTY', 'Folder must be empty before deletion');
  }
  resourceFolders.delete(folder.id);
  schedulePersist('resource-folder-delete');
  return res.status(204).send();
});

app.post('/api/resources', requireAuth, async (req, res) => {
  const body = req.body || {};
  const scopeType = normalizeResourceScopeType(body.scopeType);
  const scopeRefId = typeof body.scopeRefId === 'string' && body.scopeRefId.trim() ? body.scopeRefId.trim() : null;
  const visibility = body.visibility === 'public' || body.visibility === 'shared' ? body.visibility : 'private';
  const name = sanitizeResourceName(body.name, 'resource');
  const originalName = typeof body.originalName === 'string' ? sanitizeResourceName(body.originalName, name) : name;
  const mimeType = typeof body.mimeType === 'string' && body.mimeType.trim() ? body.mimeType.trim() : '';
  const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64.trim() : '';
  const sharedWithUserIds = Array.isArray(body.sharedWithUserIds) ? body.sharedWithUserIds.filter((item) => typeof item === 'string') : [];
  const folderId = typeof body.folderId === 'string' && body.folderId.trim() ? body.folderId.trim() : null;
  const sessionAudience = SESSION_RESOURCE_AUDIENCES.includes(body.sessionAudience) ? body.sessionAudience : 'session_all';
  const sessionMemberUserIds = Array.isArray(body.sessionMemberUserIds)
    ? Array.from(new Set(body.sessionMemberUserIds.filter((item) => typeof item === 'string' && item)))
    : [];
  const canReshareInSession = typeof body.canReshareInSession === 'boolean' ? body.canReshareInSession : true;

  if (!contentBase64) {
    return error(res, 400, 'RESOURCE_CONTENT_REQUIRED', 'contentBase64 is required');
  }

  if (scopeType === 'system') {
    const system = systems.get(scopeRefId);
    if (!system) {
      return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
    }
    if (!canEditSystem(system, req.currentUser)) {
      return error(res, 403, 'RESOURCE_SCOPE_FORBIDDEN', 'Only owner/editor/admin can add files to this system');
    }
  }

  if (scopeType === 'session') {
    const session = sessions.get(scopeRefId);
    if (!session) {
      return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
    }
    ensureSessionDefaultResourceFolders(session);
    if (!canViewSession(session, req.currentUser)) {
      return error(res, 403, 'RESOURCE_SCOPE_FORBIDDEN', 'Only current participants can add files to this session');
    }
    if (!getSessionGmUserIds(session).includes(req.currentUser.id) && session.settings?.allowPlayerToPlayerDocuments === false) {
      return error(res, 403, 'RESOURCE_SCOPE_FORBIDDEN', 'Player uploads are disabled for this session');
    }
    if (sessionAudience === 'session_member' && sessionMemberUserIds.some((userId) => !isSessionParticipant(session, userId) && !getSessionGmUserIds(session).includes(userId))) {
      return error(res, 400, 'RESOURCE_SESSION_TARGET_INVALID', 'A targeted user is not part of the session');
    }
  }

  let buffer;
  try {
    buffer = Buffer.from(contentBase64, 'base64');
  } catch {
    return error(res, 400, 'RESOURCE_CONTENT_INVALID', 'contentBase64 is invalid');
  }

  const validation = validateResourceUpload({ originalName, mimeType, buffer });
  if (!validation.ok) {
    return error(res, 400, validation.errorCode, validation.message);
  }

  const folderValidation = validateResourceFolderReference({
    folderId,
    scopeType,
    scopeRefId,
    user: req.currentUser
  });
  if (!folderValidation.ok) {
    return error(res, 400, folderValidation.errorCode, folderValidation.message);
  }
  if (scopeType === 'session' && folderValidation.folder) {
    const session = sessions.get(scopeRefId);
    if (!canUserAccessSessionFolder(session, folderValidation.folder, req.currentUser)) {
      return error(res, 403, 'RESOURCE_FOLDER_FORBIDDEN', 'Session folder forbidden');
    }
  }

  mkdirSync(RESOURCE_DIR, { recursive: true });
  const id = makeId('resource');
  const extension = validation.extension;
  const relativePath = `${id}${extension}`;
  const absolutePath = path.join(RESOURCE_DIR, relativePath);
  writeFileSync(absolutePath, buffer);

  const resource = {
    id,
    name,
    originalName,
    kind: validation.kind,
    mimeType: validation.mimeType,
    sizeBytes: buffer.byteLength,
    ownerUserId: req.currentUser.id,
    scopeType,
    scopeRefId,
    visibility: scopeType === 'session' ? 'private' : visibility,
    sharedWithUserIds,
    folderId,
    sessionAudience: scopeType === 'session' ? sessionAudience : null,
    sessionMemberUserIds: scopeType === 'session' ? sessionMemberUserIds : [],
    canReshareInSession,
    storagePath: relativePath,
    thumbnailPath: null,
    previewPath: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await generateImageDerivatives(resource, absolutePath);
  normalizeResourceRecord(resource);
  resources.set(resource.id, resource);
  schedulePersist('resource-create');
  return res.status(201).json({ resource: publicResource(resource) });
});

app.patch('/api/resources/:resourceId', requireAuth, (req, res) => {
  const resource = resources.get(req.params.resourceId);
  if (!resource) {
    return error(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }
  const body = req.body || {};
  const canEdit = canEditResource(resource, req.currentUser);
  const canShare = canManageResourceShare(resource, req.currentUser);

  if (!canEdit && !canShare) {
    return error(res, 403, 'RESOURCE_UPDATE_FORBIDDEN', 'Resource update forbidden');
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    if (!canEdit) {
      return error(res, 403, 'RESOURCE_RENAME_FORBIDDEN', 'Only owner/admin can rename this resource');
    }
    resource.name = sanitizeResourceName(body.name, resource.name);
  }

  if (body.folderId === null || typeof body.folderId === 'string') {
    const nextFolderId = typeof body.folderId === 'string' && body.folderId.trim() ? body.folderId.trim() : null;
    const folderValidation = validateResourceFolderReference({
      folderId: nextFolderId,
      scopeType: resource.scopeType,
      scopeRefId: resource.scopeRefId,
      user: req.currentUser
    });
    if (!folderValidation.ok) {
      return error(res, 400, folderValidation.errorCode, folderValidation.message);
    }
    if (resource.scopeType === 'session' && folderValidation.folder) {
      const session = sessions.get(resource.scopeRefId);
      if (!canUserAccessSessionFolder(session, folderValidation.folder, req.currentUser)) {
        return error(res, 403, 'RESOURCE_FOLDER_FORBIDDEN', 'Session folder forbidden');
      }
    }
    resource.folderId = nextFolderId;
  }

  if (resource.scopeType === 'session') {
    const session = sessions.get(resource.scopeRefId);
    if (!session) {
      return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
    }
    if (body.sessionAudience !== undefined || body.sessionMemberUserIds !== undefined || body.canReshareInSession !== undefined) {
      if (!canShare) {
        return error(res, 403, 'RESOURCE_SHARE_FORBIDDEN', 'Resource sharing forbidden');
      }
      if (body.sessionAudience !== undefined) {
        resource.sessionAudience = SESSION_RESOURCE_AUDIENCES.includes(body.sessionAudience) ? body.sessionAudience : resource.sessionAudience;
      }
      if (Array.isArray(body.sessionMemberUserIds)) {
        const nextIds = Array.from(new Set(body.sessionMemberUserIds.filter((item) => typeof item === 'string' && item)));
        if (nextIds.some((userId) => !isSessionParticipant(session, userId) && !getSessionGmUserIds(session).includes(userId))) {
          return error(res, 400, 'RESOURCE_SESSION_TARGET_INVALID', 'A targeted user is not part of the session');
        }
        resource.sessionMemberUserIds = nextIds;
      }
      if (typeof body.canReshareInSession === 'boolean' && canEdit) {
        resource.canReshareInSession = body.canReshareInSession;
      }
      if (resource.sessionAudience !== 'session_member') {
        resource.sessionMemberUserIds = [];
      }
    }
  } else if (body.visibility !== undefined || body.sharedWithUserIds !== undefined) {
    if (!canShare) {
      return error(res, 403, 'RESOURCE_SHARE_FORBIDDEN', 'Resource sharing forbidden');
    }
    if (body.visibility !== undefined) {
      resource.visibility = body.visibility === 'public' || body.visibility === 'shared' ? body.visibility : 'private';
    }
    if (Array.isArray(body.sharedWithUserIds)) {
      resource.sharedWithUserIds = Array.from(new Set(body.sharedWithUserIds.filter((item) => typeof item === 'string' && item && item !== req.currentUser.id)));
    }
  }

  resource.updatedAt = nowIso();
  normalizeResourceRecord(resource);
  resources.set(resource.id, resource);
  schedulePersist('resource-update');
  return res.status(200).json({ resource: publicResource(resource) });
});

app.post('/api/resources/:resourceId/publish-to-session', requireAuth, async (req, res) => {
  const source = resources.get(req.params.resourceId);
  if (!source) {
    return error(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }
  if (!canViewResource(source, req.currentUser)) {
    return error(res, 403, 'RESOURCE_ACCESS_FORBIDDEN', 'Forbidden');
  }
  if (source.scopeType === 'session') {
    return error(res, 400, 'RESOURCE_ALREADY_SESSION_SCOPED', 'This resource is already attached to a session');
  }
  const body = req.body || {};
  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : '';
  const session = sessions.get(sessionId);
  if (!session) {
    return error(res, 404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  ensureSessionDefaultResourceFolders(session);
  if (!canViewSession(session, req.currentUser)) {
    return error(res, 403, 'RESOURCE_SCOPE_FORBIDDEN', 'Only current participants can publish files to this session');
  }
  if (source.ownerUserId !== req.currentUser.id && !req.currentUser.roles.includes('admin')) {
    return error(res, 403, 'RESOURCE_PUBLISH_FORBIDDEN', 'Only the owner can publish this file to a session');
  }
  const sessionAudience = SESSION_RESOURCE_AUDIENCES.includes(body.sessionAudience) ? body.sessionAudience : 'session_all';
  const sessionMemberUserIds = Array.isArray(body.sessionMemberUserIds)
    ? Array.from(new Set(body.sessionMemberUserIds.filter((item) => typeof item === 'string' && item)))
    : [];
  const canReshareInSession = typeof body.canReshareInSession === 'boolean' ? body.canReshareInSession : true;
  const folderId = typeof body.folderId === 'string' && body.folderId.trim() ? body.folderId.trim() : null;

  if (sessionAudience === 'session_member' && sessionMemberUserIds.some((userId) => !isSessionParticipant(session, userId) && !getSessionGmUserIds(session).includes(userId))) {
    return error(res, 400, 'RESOURCE_SESSION_TARGET_INVALID', 'A targeted user is not part of the session');
  }

  const folderValidation = validateResourceFolderReference({
    folderId,
    scopeType: 'session',
    scopeRefId: sessionId,
    user: req.currentUser
  });
  if (!folderValidation.ok) {
    return error(res, 400, folderValidation.errorCode, folderValidation.message);
  }
  if (folderValidation.folder && !canUserAccessSessionFolder(session, folderValidation.folder, req.currentUser)) {
    return error(res, 403, 'RESOURCE_FOLDER_FORBIDDEN', 'Session folder forbidden');
  }

  const sourceAbsolutePath = path.join(RESOURCE_DIR, source.storagePath || '');
  if (!source.storagePath || !existsSync(sourceAbsolutePath)) {
    return error(res, 404, 'RESOURCE_FILE_MISSING', 'Stored file not found');
  }

  mkdirSync(RESOURCE_DIR, { recursive: true });
  const cloneId = makeId('resource');
  const extension = path.extname(source.storagePath || '');
  const relativePath = `${cloneId}${extension}`;
  const cloneAbsolutePath = path.join(RESOURCE_DIR, relativePath);
  copyFileSync(sourceAbsolutePath, cloneAbsolutePath);

  const resource = {
    id: cloneId,
    name: source.name,
    originalName: source.originalName || source.name,
    kind: source.kind,
    mimeType: source.mimeType,
    sizeBytes: source.sizeBytes,
    ownerUserId: req.currentUser.id,
    scopeType: 'session',
    scopeRefId: sessionId,
    visibility: 'private',
    sharedWithUserIds: [],
    folderId,
    sessionAudience,
    sessionMemberUserIds: sessionAudience === 'session_member' ? sessionMemberUserIds : [],
    canReshareInSession,
    storagePath: relativePath,
    thumbnailPath: null,
    previewPath: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await generateImageDerivatives(resource, cloneAbsolutePath);
  normalizeResourceRecord(resource);
  resources.set(resource.id, resource);
  schedulePersist('resource-publish-session');
  return res.status(201).json({ resource: publicResource(resource) });
});

app.get('/api/resources/:resourceId/content', requireAuth, (req, res) => {
  const resource = resources.get(req.params.resourceId);
  if (!resource) {
    return error(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }
  if (!canViewResource(resource, req.currentUser)) {
    return error(res, 403, 'RESOURCE_ACCESS_FORBIDDEN', 'Forbidden');
  }

  const absolutePath = path.join(RESOURCE_DIR, resource.storagePath || '');
  if (!resource.storagePath || !existsSync(absolutePath)) {
    return error(res, 404, 'RESOURCE_FILE_MISSING', 'Stored file not found');
  }

  res.setHeader('Content-Type', resource.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${resource.originalName || resource.name}"`);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(absolutePath);
});

app.get('/api/resources/:resourceId/thumbnail', requireAuth, (req, res) => {
  const resource = resources.get(req.params.resourceId);
  if (!resource) {
    return error(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }
  if (!canViewResource(resource, req.currentUser)) {
    return error(res, 403, 'RESOURCE_ACCESS_FORBIDDEN', 'Forbidden');
  }
  const absolutePath = path.join(RESOURCE_DIR, resource.thumbnailPath || '');
  if (!resource.thumbnailPath || !existsSync(absolutePath)) {
    return error(res, 404, 'RESOURCE_THUMBNAIL_MISSING', 'Stored thumbnail not found');
  }
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Content-Disposition', `inline; filename="${resource.id}-thumb.webp"`);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(absolutePath);
});

app.get('/api/resources/:resourceId/preview', requireAuth, (req, res) => {
  const resource = resources.get(req.params.resourceId);
  if (!resource) {
    return error(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }
  if (!canViewResource(resource, req.currentUser)) {
    return error(res, 403, 'RESOURCE_ACCESS_FORBIDDEN', 'Forbidden');
  }
  const absolutePath = path.join(RESOURCE_DIR, resource.previewPath || '');
  if (!resource.previewPath || !existsSync(absolutePath)) {
    return error(res, 404, 'RESOURCE_PREVIEW_MISSING', 'Stored preview not found');
  }
  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Content-Disposition', `inline; filename="${resource.id}-preview.webp"`);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(absolutePath);
});

app.delete('/api/resources/:resourceId', requireAuth, (req, res) => {
  const resource = resources.get(req.params.resourceId);
  if (!resource) {
    return error(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found');
  }
  if (!canEditResource(resource, req.currentUser)) {
    return error(res, 403, 'RESOURCE_DELETE_FORBIDDEN', 'Only owner/admin can delete this resource');
  }

  deleteResourceRecord(resource.id);
  schedulePersist('resource-delete');
  return res.status(204).send();
});

app.get('/api/screen-templates', requireAuth, (req, res) => {
  const scopeType = typeof req.query.scopeType === 'string' ? req.query.scopeType.trim() : '';
  const scopeRefId = typeof req.query.scopeRefId === 'string' ? req.query.scopeRefId.trim() : '';
  const roleTarget = typeof req.query.roleTarget === 'string' ? req.query.roleTarget.trim() : '';

  const items = [...screenTemplates.values()].filter((template) => {
    if (!canViewScreenTemplate(template, req.currentUser)) {
      return false;
    }
    if (scopeType && template.scopeType !== scopeType) {
      return false;
    }
    if (scopeRefId && (template.scopeRefId || '') !== scopeRefId) {
      return false;
    }
    if (roleTarget && template.roleTarget !== roleTarget) {
      return false;
    }
    return true;
  });

  return res.status(200).json({ items });
});

app.get('/api/screen-templates/:templateId', requireAuth, (req, res) => {
  const template = screenTemplates.get(req.params.templateId);
  if (!template) {
    return error(res, 404, 'SCREEN_TEMPLATE_NOT_FOUND', 'Screen template not found');
  }
  if (!canViewScreenTemplate(template, req.currentUser)) {
    return error(res, 403, 'SCREEN_TEMPLATE_FORBIDDEN', 'Screen template forbidden');
  }
  return res.status(200).json({ item: clone(template) });
});

app.post('/api/screen-templates', requireAuth, (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const scopeType = body.scopeType === 'system' ? 'system' : 'account';
  const scopeRefId = typeof body.scopeRefId === 'string' && body.scopeRefId.trim() ? body.scopeRefId.trim() : null;
  const roleTarget = ['player', 'gm', 'both'].includes(body.roleTarget) ? body.roleTarget : 'player';
  const visibility = ['public', 'private', 'friends'].includes(body.visibility) ? body.visibility : 'private';
  const sets = Array.isArray(body.sets) ? body.sets : [];

  if (!name) {
    return error(res, 400, 'INVALID_TEMPLATE_NAME', 'Template name is required');
  }

  if (scopeType === 'system') {
    const system = scopeRefId ? systems.get(scopeRefId) : null;
    if (!system) {
      return error(res, 404, 'SYSTEM_NOT_FOUND', 'System not found');
    }
    if (!canEditSystem(system, req.currentUser)) {
      return error(res, 403, 'SYSTEM_ACCESS_FORBIDDEN', 'System template forbidden');
    }
  }

  const now = nowIso();
  const template = {
    id: makeId('screen_tpl'),
    name,
    description,
    scopeType,
    scopeRefId,
    roleTarget,
    visibility,
    isFavorite: Boolean(body.isFavorite),
    sourceTemplateId: typeof body.sourceTemplateId === 'string' && body.sourceTemplateId.trim() ? body.sourceTemplateId.trim() : null,
    createdBy: req.currentUser.id,
    updatedBy: req.currentUser.id,
    sets: migrateLegacyScreenTemplate({ sets }).sets,
    createdAt: now,
    updatedAt: now
  };

  screenTemplates.set(template.id, template);
  schedulePersist('screen-template-create');
  return res.status(201).json({ item: template });
});

app.patch('/api/screen-templates/:templateId', requireAuth, (req, res) => {
  const template = screenTemplates.get(req.params.templateId);
  if (!template) {
    return error(res, 404, 'SCREEN_TEMPLATE_NOT_FOUND', 'Screen template not found');
  }
  if (!canEditScreenTemplate(template, req.currentUser)) {
    return error(res, 403, 'SCREEN_TEMPLATE_FORBIDDEN', 'Screen template forbidden');
  }

  const body = req.body || {};
  const nextName = typeof body.name === 'string' ? body.name.trim() : template.name;
  const nextDescription = typeof body.description === 'string' ? body.description.trim() : template.description || '';
  const nextRoleTarget = ['player', 'gm', 'both'].includes(body.roleTarget) ? body.roleTarget : template.roleTarget;
  const nextVisibility = ['public', 'private', 'friends'].includes(body.visibility) ? body.visibility : template.visibility;
  const nextSets = Array.isArray(body.sets) ? body.sets : template.sets;
  const nextFavorite = typeof body.isFavorite === 'boolean' ? body.isFavorite : Boolean(template.isFavorite);

  if (!nextName) {
    return error(res, 400, 'INVALID_TEMPLATE_NAME', 'Template name is required');
  }

  template.name = nextName;
  template.description = nextDescription;
  template.roleTarget = nextRoleTarget;
  template.visibility = nextVisibility;
  template.isFavorite = nextFavorite;
  template.sets = migrateLegacyScreenTemplate({ sets: nextSets }).sets;
  template.updatedBy = req.currentUser.id;
  template.updatedAt = nowIso();

  schedulePersist('screen-template-update');
  return res.status(200).json({ item: template });
});

app.delete('/api/screen-templates/:templateId', requireAuth, (req, res) => {
  const template = screenTemplates.get(req.params.templateId);
  if (!template) {
    return error(res, 404, 'SCREEN_TEMPLATE_NOT_FOUND', 'Screen template not found');
  }
  if (!canEditScreenTemplate(template, req.currentUser)) {
    return error(res, 403, 'SCREEN_TEMPLATE_FORBIDDEN', 'Screen template forbidden');
  }

  screenTemplates.delete(template.id);
  schedulePersist('screen-template-delete');
  return res.status(204).send();
});

app.post('/api/sync/actions', requireAuth, async (req, res) => {
  const body = req.body || {};

  if (body && body.payload && body.payload.__syncMode === 'conflict') {
    return res.status(200).json({
      status: 'conflict',
      reason: 'Conflit detecte cote serveur.',
      conflictFields: Array.isArray(body.payload.__conflictFields) ? body.payload.__conflictFields : ['payload'],
      conflictServerValues: body.payload.__serverValues || {}
    });
  }

  if (body && body.payload && body.payload.__syncMode === 'rejected') {
    return res.status(200).json({
      status: 'rejected',
      reason: 'Action rejetee cote serveur.'
    });
  }

  const entityType = typeof body.entityType === 'string' ? body.entityType : '';
  const entityId = typeof body.entityId === 'string' ? body.entityId : '';
  const actionType = typeof body.actionType === 'string' ? body.actionType : '';
  const payload = body && body.payload && typeof body.payload === 'object' ? body.payload : {};

  if (entityType === 'character' && actionType === 'update' && Array.isArray(payload.sheetFields)) {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    const session = sessions.get(sessionId);
    const character = characters.get(entityId);
    if (!session || !character || character.sessionId !== sessionId || !character.sheet) {
      return res.status(200).json({ status: 'rejected', reason: 'Fiche ou partie introuvable pour la synchronisation.' });
    }
    const isOwner = character.ownerUserId === req.currentUser.id;
    if (!canManageSession(session, req.currentUser) && !isOwner) {
      return res.status(200).json({ status: 'rejected', reason: 'Modification de fiche non autorisée.' });
    }
    const runtimeValues =
      payload.runtimeValues && typeof payload.runtimeValues === 'object' && !Array.isArray(payload.runtimeValues)
        ? clone(payload.runtimeValues)
        : null;
    const next = {
      ...character,
      ...(runtimeValues ? { runtimeValues } : {}),
      sheet: {
        ...character.sheet,
        fields: payload.sheetFields.map((field) => ({ ...field }))
      }
    };
    characters.set(next.id, next);
    schedulePersist('sync-character-sheet-update');
    return res.status(200).json({ status: 'accepted' });
  }

  if (entityType === 'resource_folder') {
    if (actionType === 'create') {
      const scopeType = normalizeResourceScopeType(payload.scopeType);
      const scopeRefId = typeof payload.scopeRefId === 'string' && payload.scopeRefId.trim() ? payload.scopeRefId.trim() : null;
      const parentFolderId = typeof payload.parentFolderId === 'string' && payload.parentFolderId.trim() ? payload.parentFolderId.trim() : null;
      const visibilityHint = RESOURCE_FOLDER_VISIBILITIES.includes(payload.visibilityHint) ? payload.visibilityHint : 'all';
      const name = sanitizeFolderName(payload.name, 'Nouveau dossier');

      if (scopeType === 'system') {
        const system = systems.get(scopeRefId);
        if (!system || !canEditSystem(system, req.currentUser)) {
          return res.status(200).json({ status: 'rejected', reason: 'Création de dossier système interdite.' });
        }
      }
      if (scopeType === 'session') {
        const session = sessions.get(scopeRefId);
        if (!session || !canManageSession(session, req.currentUser)) {
          return res.status(200).json({ status: 'rejected', reason: 'Création de dossier de partie interdite.' });
        }
      }
      if (parentFolderId) {
        const parentFolder = resourceFolders.get(parentFolderId);
        if (!parentFolder || !canEditResourceFolder(parentFolder, req.currentUser)) {
          return res.status(200).json({ status: 'rejected', reason: 'Dossier parent invalide.' });
        }
      }

      const folder = {
        id: entityId,
        ownerUserId: req.currentUser.id,
        scopeType,
        scopeRefId,
        parentFolderId,
        name,
        visibilityHint: scopeType === 'session' ? visibilityHint : 'all',
        defaultType: null,
        sessionMemberUserId: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      normalizeResourceFolder(folder);
      resourceFolders.set(folder.id, folder);
      schedulePersist('sync-resource-folder-create');
      return res.status(200).json({ status: 'accepted' });
    }

    const folder = resourceFolders.get(entityId);
    if (!folder) {
      return res.status(200).json({ status: 'rejected', reason: 'Dossier introuvable.' });
    }
    if (!canEditResourceFolder(folder, req.currentUser)) {
      return res.status(200).json({ status: 'rejected', reason: 'Dossier interdit.' });
    }

    if (actionType === 'update') {
      if (typeof payload.name === 'string' && payload.name.trim()) {
        folder.name = sanitizeFolderName(payload.name, folder.name);
      }
      if (payload.parentFolderId === null || typeof payload.parentFolderId === 'string') {
        folder.parentFolderId = typeof payload.parentFolderId === 'string' && payload.parentFolderId.trim() ? payload.parentFolderId.trim() : null;
      }
      folder.updatedAt = nowIso();
      resourceFolders.set(folder.id, folder);
      schedulePersist('sync-resource-folder-update');
      return res.status(200).json({ status: 'accepted' });
    }

    if (actionType === 'delete') {
      resourceFolders.delete(folder.id);
      schedulePersist('sync-resource-folder-delete');
      return res.status(200).json({ status: 'accepted' });
    }
  }

  if (entityType === 'resource') {
    if (actionType === 'create') {
      const scopeType = normalizeResourceScopeType(payload.scopeType);
      const scopeRefId = typeof payload.scopeRefId === 'string' && payload.scopeRefId.trim() ? payload.scopeRefId.trim() : null;
      const visibility = payload.visibility === 'public' || payload.visibility === 'shared' ? payload.visibility : 'private';
      const name = sanitizeResourceName(payload.name, 'resource');
      const originalName = typeof payload.originalName === 'string' ? sanitizeResourceName(payload.originalName, name) : name;
      const mimeType = typeof payload.mimeType === 'string' && payload.mimeType.trim() ? payload.mimeType.trim() : '';
      const contentBase64 = typeof payload.contentBase64 === 'string' ? payload.contentBase64.trim() : '';
      const sharedWithUserIds = Array.isArray(payload.sharedWithUserIds) ? payload.sharedWithUserIds.filter((item) => typeof item === 'string') : [];
      const folderId = typeof payload.folderId === 'string' && payload.folderId.trim() ? payload.folderId.trim() : null;
      const sessionAudience = SESSION_RESOURCE_AUDIENCES.includes(payload.sessionAudience) ? payload.sessionAudience : 'session_all';
      const sessionMemberUserIds = Array.isArray(payload.sessionMemberUserIds)
        ? Array.from(new Set(payload.sessionMemberUserIds.filter((item) => typeof item === 'string' && item)))
        : [];
      const canReshareInSession = typeof payload.canReshareInSession === 'boolean' ? payload.canReshareInSession : true;

      if (!contentBase64) {
        return res.status(200).json({ status: 'rejected', reason: 'Contenu de ressource manquant.' });
      }

      let buffer;
      try {
        buffer = Buffer.from(contentBase64, 'base64');
      } catch {
        return res.status(200).json({ status: 'rejected', reason: 'Contenu de ressource invalide.' });
      }

      const validation = validateResourceUpload({ originalName, mimeType, buffer });
      if (!validation.ok) {
        return res.status(200).json({ status: 'rejected', reason: validation.message });
      }

      const folderValidation = validateResourceFolderReference({
        folderId,
        scopeType,
        scopeRefId,
        user: req.currentUser
      });
      if (!folderValidation.ok) {
        return res.status(200).json({ status: 'rejected', reason: folderValidation.message });
      }

      mkdirSync(RESOURCE_DIR, { recursive: true });
      const extension = validation.extension;
      const relativePath = `${entityId}${extension}`;
      const absolutePath = path.join(RESOURCE_DIR, relativePath);
      writeFileSync(absolutePath, buffer);

      const resource = {
        id: entityId,
        name,
        originalName,
        kind: validation.kind,
        mimeType: validation.mimeType,
        sizeBytes: buffer.byteLength,
        ownerUserId: req.currentUser.id,
        scopeType,
        scopeRefId,
        visibility: scopeType === 'session' ? 'private' : visibility,
        sharedWithUserIds,
        folderId,
        sessionAudience: scopeType === 'session' ? sessionAudience : null,
        sessionMemberUserIds: scopeType === 'session' ? sessionMemberUserIds : [],
        canReshareInSession,
        storagePath: relativePath,
        thumbnailPath: null,
        previewPath: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      await generateImageDerivatives(resource, absolutePath);
      normalizeResourceRecord(resource);
      resources.set(resource.id, resource);
      schedulePersist('sync-resource-create');
      return res.status(200).json({ status: 'accepted' });
    }

    const resource = resources.get(entityId);
    if (!resource) {
      return res.status(200).json({ status: 'rejected', reason: 'Ressource introuvable.' });
    }

    if (actionType === 'update') {
      const canEdit = canEditResource(resource, req.currentUser);
      const canShare = canManageResourceShare(resource, req.currentUser);
      if (!canEdit && !canShare) {
        return res.status(200).json({ status: 'rejected', reason: 'Mise à jour de ressource interdite.' });
      }

      if (typeof payload.name === 'string' && payload.name.trim() && canEdit) {
        resource.name = sanitizeResourceName(payload.name, resource.name);
      }
      if (payload.folderId === null || typeof payload.folderId === 'string') {
        resource.folderId = typeof payload.folderId === 'string' && payload.folderId.trim() ? payload.folderId.trim() : null;
      }
      if (resource.scopeType === 'session') {
        if (payload.sessionAudience !== undefined) {
          resource.sessionAudience = SESSION_RESOURCE_AUDIENCES.includes(payload.sessionAudience) ? payload.sessionAudience : resource.sessionAudience;
        }
        if (Array.isArray(payload.sessionMemberUserIds)) {
          resource.sessionMemberUserIds = Array.from(new Set(payload.sessionMemberUserIds.filter((item) => typeof item === 'string' && item)));
        }
        if (typeof payload.canReshareInSession === 'boolean' && canEdit) {
          resource.canReshareInSession = payload.canReshareInSession;
        }
        if (resource.sessionAudience !== 'session_member') {
          resource.sessionMemberUserIds = [];
        }
      } else {
        if (payload.visibility !== undefined && canShare) {
          resource.visibility = payload.visibility === 'public' || payload.visibility === 'shared' ? payload.visibility : 'private';
        }
        if (Array.isArray(payload.sharedWithUserIds) && canShare) {
          resource.sharedWithUserIds = Array.from(new Set(payload.sharedWithUserIds.filter((item) => typeof item === 'string' && item && item !== req.currentUser.id)));
        }
      }

      resource.updatedAt = nowIso();
      normalizeResourceRecord(resource);
      resources.set(resource.id, resource);
      schedulePersist('sync-resource-update');
      return res.status(200).json({ status: 'accepted' });
    }

    if (actionType === 'delete') {
      if (!canEditResource(resource, req.currentUser)) {
        return res.status(200).json({ status: 'rejected', reason: 'Suppression de ressource interdite.' });
      }
      deleteResourceRecord(resource.id);
      schedulePersist('sync-resource-delete');
      return res.status(200).json({ status: 'accepted' });
    }
  }

  return res.status(200).json({ status: 'accepted' });
});

app.use((req, res) => {
  return error(res, 404, 'NOT_FOUND', 'Route not found');
});

process.on('SIGINT', () => {
  handleShutdownPersist('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  handleShutdownPersist('SIGTERM');
  process.exit(0);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[nexusforge-backend] listening on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(
    `[nexusforge-backend] smtp=${canSendEmails() ? 'enabled' : 'disabled'} rootAdmin=${ROOT_ADMIN_EMAIL} dataFile=${DATA_FILE}`
  );
  if (NODE_ENV === 'production' && ROOT_ADMIN_PASSWORD === DEFAULT_ROOT_ADMIN_PASSWORD) {
    // eslint-disable-next-line no-console
    console.warn('[nexusforge-backend] warning: ROOT_ADMIN_PASSWORD still uses the embedded fallback; set it in production configuration');
  }
  void backfillMissingResourceDerivatives();
});
  const validateScriptAction = (action, contextLabel) => {
    if (!isPlainObject(action)) {
      throw new Error(`${contextLabel} doit être un objet.`);
    }
    if (typeof action.id !== 'string' || !action.id.trim()) {
      throw new Error(`${contextLabel} doit avoir un id.`);
    }
    if (typeof action.kind !== 'string' || !['set_formula', 'roll'].includes(action.kind)) {
      throw new Error(`${contextLabel} doit avoir un type valide.`);
    }
    if (typeof action.label !== 'string' || !action.label.trim()) {
      throw new Error(`${contextLabel} doit avoir un libellé.`);
    }
    if (action.targetScope !== undefined && (typeof action.targetScope !== 'string' || !['sheet', 'creation'].includes(action.targetScope))) {
      throw new Error(`${contextLabel} doit utiliser un \`targetScope\` valide.`);
    }
    if (action.targetViewRef !== undefined && typeof action.targetViewRef !== 'string') {
      throw new Error(`${contextLabel} doit utiliser \`targetViewRef\` en chaîne.`);
    }
    if (typeof action.targetFieldKey !== 'string' || !action.targetFieldKey.trim()) {
      throw new Error(`${contextLabel} doit définir une cible.`);
    }
    if (typeof action.valueFormula !== 'string') {
      throw new Error(`${contextLabel} doit utiliser \`valueFormula\` en chaîne.`);
    }
    if (action.allowReroll !== undefined && typeof action.allowReroll !== 'boolean') {
      throw new Error(`${contextLabel} doit utiliser \`allowReroll\` en booléen.`);
    }
    if (action.helperText !== undefined && typeof action.helperText !== 'string') {
      throw new Error(`${contextLabel} doit utiliser \`helperText\` en chaîne.`);
    }
  };
