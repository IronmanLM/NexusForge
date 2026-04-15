import 'dotenv/config';
import crypto from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ActivityType,
  AttachmentBuilder,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  InteractionContextType,
  OverwriteType,
  PermissionsBitField,
  SlashCommandBuilder
} from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DISCORD_BOT_TOKEN = String(process.env.DISCORD_BOT_TOKEN || '').trim();
const DISCORD_BOT_SHARED_SECRET = String(process.env.DISCORD_BOT_SHARED_SECRET || '').trim();
const DASHBOARD_SESSION_SECRET = String(process.env.DISCORD_DASHBOARD_SESSION_SECRET || DISCORD_BOT_SHARED_SECRET).trim();
const DISCORD_OAUTH_CLIENT_ID = String(process.env.DISCORD_OAUTH_CLIENT_ID || '').trim();
const DISCORD_OAUTH_CLIENT_SECRET = String(process.env.DISCORD_OAUTH_CLIENT_SECRET || '').trim();
const DISCORD_OAUTH_REDIRECT_URI = String(process.env.DISCORD_OAUTH_REDIRECT_URI || 'https://bot.nexusforge.en-ligne.fr/auth/discord/callback').trim();
const NEXUSFORGE_API_BASE_URL = String(process.env.NEXUSFORGE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const NEXUSFORGE_APP_BASE_URL = String(process.env.NEXUSFORGE_APP_BASE_URL || '').trim().replace(/\/+$/, '');
const DISCORD_NEWS_CHANNEL_IDS = parseIdList(process.env.DISCORD_NEWS_CHANNEL_IDS);
const DISCORD_STAFF_CHANNEL_IDS = parseIdList(process.env.DISCORD_STAFF_CHANNEL_IDS);
const DISCORD_STAFF_USER_IDS = parseIdList(process.env.DISCORD_STAFF_USER_IDS);
const DISCORD_OWNER_USER_IDS = parseIdList(process.env.DISCORD_OWNER_USER_IDS || process.env.DISCORD_STAFF_USER_IDS || '');
const POLL_INTERVAL_MS = Math.max(5_000, Number(process.env.DISCORD_BOT_POLL_INTERVAL_MS || 15_000));
const BOOTSTRAP_MODE = String(process.env.DISCORD_BOT_BOOTSTRAP_MODE || 'latest').trim().toLowerCase() === 'replay' ? 'replay' : 'latest';
const STATE_FILE = resolveStateFile(process.env.DISCORD_BOT_STATE_FILE || './data/state.json');
const DASHBOARD_STATE_FILE = resolveStateFile(process.env.DISCORD_BOT_DASHBOARD_STATE_FILE || './data/dashboard-state.json');
const PORT = Math.max(1, Number(process.env.PORT || 3000));
const SESSION_COOKIE_NAME = 'nf_discord_bot_session';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

if (!DISCORD_BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKEN est requis');
}
if (!DISCORD_BOT_SHARED_SECRET) {
  throw new Error('DISCORD_BOT_SHARED_SECRET est requis');
}
if (!NEXUSFORGE_API_BASE_URL) {
  throw new Error('NEXUSFORGE_API_BASE_URL est requis');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let pollTimer = null;
let isPolling = false;
let botReady = false;
const botState = loadState();
const dashboardState = loadDashboardState();
let lastPollAt = null;
let lastPollError = null;
let lastDispatchAt = null;
const recentDispatches = [];

function parseIdList(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveStateFile(raw) {
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(projectRoot, raw);
}

function log(...args) {
  // eslint-disable-next-line no-console
  console.log('[discord-bot]', ...args);
}

function pushRecentDispatch(entry) {
  recentDispatches.unshift(entry);
  if (recentDispatches.length > 20) {
    recentDispatches.length = 20;
  }
}

const slashCommands = [
  new SlashCommandBuilder()
    .setName('nf-partie')
    .setDescription('Affiche le résumé Nexus Forge du salon de partie courant.')
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName('nf-fiche')
    .setDescription('Affiche ta sortie Discord "fiche" définie par le système.')
    .addStringOption((option) =>
      option
        .setName('visibilite')
        .setDescription('Choisir si la réponse est publique ou privée.')
        .setRequired(false)
        .addChoices(
          { name: 'Privé', value: 'private' },
          { name: 'Public', value: 'public' }
        )
    )
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName('nf-inv')
    .setDescription('Affiche ta sortie Discord "inventaire" définie par le système.')
    .addStringOption((option) =>
      option
        .setName('visibilite')
        .setDescription('Choisir si la réponse est publique ou privée.')
        .setRequired(false)
        .addChoices(
          { name: 'Privé', value: 'private' },
          { name: 'Public', value: 'public' }
        )
    )
    .setContexts(InteractionContextType.Guild),
  new SlashCommandBuilder()
    .setName('nf-note')
    .setDescription('Affiche ta sortie Discord "notes" définie par le système.')
    .addStringOption((option) =>
      option
        .setName('visibilite')
        .setDescription('Choisir si la réponse est publique ou privée.')
        .setRequired(false)
        .addChoices(
          { name: 'Privé', value: 'private' },
          { name: 'Public', value: 'public' }
        )
    )
    .setContexts(InteractionContextType.Guild),
  ...Array.from({ length: 9 }, (_, index) => {
    const commandIndex = index + 1;
    return new SlashCommandBuilder()
      .setName(`nf-vue${commandIndex}`)
      .setDescription(`Affiche la sortie Discord libre view${commandIndex} du système.`)
      .addStringOption((option) =>
        option
          .setName('visibilite')
          .setDescription('Choisir si la réponse est publique ou privée.')
          .setRequired(false)
          .addChoices(
            { name: 'Privé', value: 'private' },
            { name: 'Public', value: 'public' }
          )
      )
      .setContexts(InteractionContextType.Guild);
  }),
  new SlashCommandBuilder()
    .setName('nf-jet')
    .setDescription('Lance un jet simple dans le salon Discord de partie.')
    .addStringOption((option) =>
      option
        .setName('formule')
        .setDescription('Exemple : 1d20, 2d6+3, 1d100-10')
        .setRequired(true)
    )
    .setContexts(InteractionContextType.Guild)
];

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function escapeInline(value) {
  return String(value || '').replace(/[`*_~|]/g, '\\$&');
}

function toEmbedTimestamp(value) {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { lastEventId: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return {
      lastEventId: typeof parsed.lastEventId === 'string' && parsed.lastEventId ? parsed.lastEventId : null
    };
  } catch (error) {
    log('etat local illisible, reinitialisation', error);
    return { lastEventId: null };
  }
}

function saveState() {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tempFile = `${STATE_FILE}.tmp`;
  writeFileSync(tempFile, JSON.stringify(botState, null, 2), 'utf8');
  renameSync(tempFile, STATE_FILE);
}

function loadDashboardState() {
  const fallback = {
    guildConfigs: {},
    globalConfig: {
      staffChannelIds: [],
      staffUserIds: []
    },
    announcementMessages: {},
    linkedSessionChannels: {},
    sessions: {},
    oauthStates: {}
  };
  if (!existsSync(DASHBOARD_STATE_FILE)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(readFileSync(DASHBOARD_STATE_FILE, 'utf8'));
    return {
      guildConfigs: isPlainObject(parsed.guildConfigs) ? parsed.guildConfigs : {},
      globalConfig: isPlainObject(parsed.globalConfig)
        ? {
            staffChannelIds: Array.isArray(parsed.globalConfig.staffChannelIds) ? parsed.globalConfig.staffChannelIds.map(String) : [],
            staffUserIds: Array.isArray(parsed.globalConfig.staffUserIds) ? parsed.globalConfig.staffUserIds.map(String) : []
          }
        : fallback.globalConfig,
      announcementMessages: isPlainObject(parsed.announcementMessages) ? parsed.announcementMessages : {},
      linkedSessionChannels: isPlainObject(parsed.linkedSessionChannels) ? parsed.linkedSessionChannels : {},
      sessions: isPlainObject(parsed.sessions) ? parsed.sessions : {},
      oauthStates: isPlainObject(parsed.oauthStates) ? parsed.oauthStates : {}
    };
  } catch (error) {
    log('etat dashboard illisible, reinitialisation', error);
    return fallback;
  }
}

function saveDashboardState() {
  mkdirSync(path.dirname(DASHBOARD_STATE_FILE), { recursive: true });
  const tempFile = `${DASHBOARD_STATE_FILE}.tmp`;
  writeFileSync(tempFile, JSON.stringify(dashboardState, null, 2), 'utf8');
  renameSync(tempFile, DASHBOARD_STATE_FILE);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function signValue(value) {
  return crypto.createHmac('sha256', DASHBOARD_SESSION_SECRET).update(value).digest('hex');
}

function generateOpaqueId() {
  return crypto.randomBytes(18).toString('hex');
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) {
        return acc;
      }
      const key = part.slice(0, eqIndex).trim();
      const value = part.slice(eqIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function serializeCookie(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}; Secure`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

function createSession(user) {
  const sessionId = generateOpaqueId();
  dashboardState.sessions[sessionId] = {
    id: sessionId,
    userId: user.id,
    username: user.username,
    globalName: user.global_name || null,
    avatar: user.avatar || null,
    guilds: Array.isArray(user.guilds) ? user.guilds : [],
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  saveDashboardState();
  return sessionId;
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const raw = cookies[SESSION_COOKIE_NAME];
  if (!raw) {
    return null;
  }
  const [sessionId, signature] = String(raw).split('.');
  if (!sessionId || !signature) {
    return null;
  }
  const expected = signValue(sessionId);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  const session = dashboardState.sessions[sessionId];
  if (!session || !session.expiresAt || session.expiresAt < Date.now()) {
    delete dashboardState.sessions[sessionId];
    saveDashboardState();
    return null;
  }
  return session;
}

function createOauthState() {
  const state = generateOpaqueId();
  dashboardState.oauthStates[state] = {
    createdAt: Date.now(),
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS
  };
  saveDashboardState();
  return state;
}

function consumeOauthState(state) {
  const entry = dashboardState.oauthStates[state];
  delete dashboardState.oauthStates[state];
  saveDashboardState();
  if (!entry || entry.expiresAt < Date.now()) {
    return false;
  }
  return true;
}

function isOwnerSession(session) {
  return Boolean(session && DISCORD_OWNER_USER_IDS.includes(session.userId));
}

function getEffectiveStaffChannelIds() {
  return dashboardState.globalConfig.staffChannelIds.length > 0
    ? dashboardState.globalConfig.staffChannelIds
    : DISCORD_STAFF_CHANNEL_IDS;
}

function getEffectiveStaffUserIds() {
  return dashboardState.globalConfig.staffUserIds.length > 0
    ? dashboardState.globalConfig.staffUserIds
    : DISCORD_STAFF_USER_IDS;
}

function getEffectiveNewsChannelIds() {
  const configured = Object.values(dashboardState.guildConfigs)
    .filter((config) => config && config.enabled !== false && typeof config.newsChannelId === 'string' && config.newsChannelId.trim())
    .map((config) => config.newsChannelId.trim());
  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }
  return DISCORD_NEWS_CHANNEL_IDS;
}

function getEffectiveRecruitmentChannelIds() {
  return Array.from(
    new Set(
      Object.values(dashboardState.guildConfigs)
        .filter(
          (config) =>
            config &&
            config.enabled !== false &&
            typeof config.recruitmentChannelId === 'string' &&
            config.recruitmentChannelId.trim()
        )
        .map((config) => config.recruitmentChannelId.trim())
    )
  );
}

function buildDiscordOauthAuthorizeUrl() {
  const state = createOauthState();
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

async function exchangeDiscordOauthCode(code) {
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
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error('OAuth2 Discord token exchange failed');
  }

  const [userResponse, guildsResponse] = await Promise.all([
    fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    }),
    fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
    })
  ]);

  const user = await userResponse.json().catch(() => null);
  const guilds = await guildsResponse.json().catch(() => []);
  if (!userResponse.ok || !user?.id) {
    throw new Error('OAuth2 Discord user fetch failed');
  }

  return {
    ...user,
    guilds: Array.isArray(guilds) ? guilds : []
  };
}

function canManageGuild(session, guildId) {
  const guild = Array.isArray(session?.guilds) ? session.guilds.find((item) => item.id === guildId) : null;
  if (!guild) {
    return false;
  }
  if (guild.owner) {
    return true;
  }
  try {
    const permissions = BigInt(guild.permissions || '0');
    const adminFlag = BigInt(PermissionsBitField.Flags.Administrator);
    const manageGuildFlag = BigInt(PermissionsBitField.Flags.ManageGuild);
    return (permissions & adminFlag) === adminFlag || (permissions & manageGuildFlag) === manageGuildFlag;
  } catch {
    return false;
  }
}

async function buildManageableGuilds(session) {
  const manageable = [];
  for (const guild of session?.guilds || []) {
    if (!client.guilds.cache.has(guild.id) || !canManageGuild(session, guild.id)) {
      continue;
    }
    try {
      const cachedGuild = await client.guilds.fetch(guild.id);
      const channels = await cachedGuild.channels.fetch();
      manageable.push({
        id: guild.id,
        name: cachedGuild.name,
        icon: cachedGuild.iconURL(),
        newsChannelId: dashboardState.guildConfigs[guild.id]?.newsChannelId || '',
        recruitmentChannelId: dashboardState.guildConfigs[guild.id]?.recruitmentChannelId || '',
        sessionsCategoryId: dashboardState.guildConfigs[guild.id]?.sessionsCategoryId || '',
        enabled: dashboardState.guildConfigs[guild.id]?.enabled !== false,
        channels: [...channels.values()]
          .filter(
            (channel) =>
              channel &&
              'name' in channel &&
              (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
          )
          .map((channel) => ({
            id: channel.id,
            name: channel.name,
            position: Number.isFinite(channel.rawPosition) ? channel.rawPosition : 0
          }))
          .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name, 'fr'))
          .map(({ id, name }) => ({ id, name })),
        categories: [...channels.values()]
          .filter((channel) => channel && 'name' in channel && channel.type === ChannelType.GuildCategory)
          .map((channel) => ({
            id: channel.id,
            name: channel.name,
            position: Number.isFinite(channel.rawPosition) ? channel.rawPosition : 0
          }))
          .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name, 'fr'))
          .map(({ id, name }) => ({ id, name }))
      });
    } catch (error) {
      log(`lecture des salons du serveur ${guild.id} impossible`, error);
    }
  }
  return manageable.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function readRequestBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRequestBody(req);
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

async function fetchEvents(afterId) {
  const search = new URLSearchParams();
  if (afterId) {
    search.set('after', afterId);
  }
  search.set('limit', '100');
  const response = await fetch(`${NEXUSFORGE_API_BASE_URL}/api/integrations/discord/events?${search.toString()}`, {
    headers: {
      'x-discord-bot-secret': DISCORD_BOT_SHARED_SECRET
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lecture des evenements impossible (${response.status}): ${text}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

function buildNewsEmbed(event) {
  const news = event.payload?.news || {};
  return new EmbedBuilder()
    .setColor(0x2d7ff9)
    .setTitle(truncate(news.title || 'Nouvelle Nexus Forge', 240))
    .setDescription(truncate(news.content || '', 4000) || 'Une nouvelle mise a jour est disponible.')
    .setFooter({
      text: news.createdByNickname ? `Publie par ${news.createdByNickname}` : 'Nexus Forge'
    })
    .setTimestamp(toEmbedTimestamp(news.publishedAt || event.createdAt))
    .setURL(NEXUSFORGE_APP_BASE_URL || undefined);
}

function buildReleaseEmbed(event) {
  const release = event.payload?.release || {};
  const platform = release.platform ? release.platform.toUpperCase() : 'GENERAL';
  const title = release.version ? `${release.title} (${release.version})` : release.title || 'Nouvelle version Nexus Forge';
  return new EmbedBuilder()
    .setColor(0x3dbb7a)
    .setTitle(truncate(title, 240))
    .setDescription(truncate(release.summary || '', 4000) || 'Une nouvelle version est disponible.')
    .addFields(
      { name: 'Plateforme', value: escapeInline(platform), inline: true },
      { name: 'Version', value: escapeInline(release.version || 'non precisee'), inline: true }
    )
    .setFooter({
      text: release.createdByNickname ? `Publie par ${release.createdByNickname}` : 'Nexus Forge'
    })
    .setTimestamp(toEmbedTimestamp(release.publishedAt || event.createdAt))
    .setURL(release.link || NEXUSFORGE_APP_BASE_URL || undefined);
}

function buildPendingValidationEmbed(event) {
  const user = event.payload?.user || {};
  return new EmbedBuilder()
    .setColor(0xf0b429)
    .setTitle('Utilisateur en attente de validation')
    .setDescription(
      [
        `**Compte:** ${escapeInline(user.displayName || user.nickname || user.email || 'Inconnu')}`,
        user.email ? `**Email:** ${escapeInline(user.email)}` : null,
        '',
        `Valider depuis: ${NEXUSFORGE_APP_BASE_URL ? `${NEXUSFORGE_APP_BASE_URL}/admin/pending-users` : 'Nexus Forge > Admin > Utilisateurs en attente'}`
      ]
        .filter(Boolean)
        .join('\n')
    )
    .setTimestamp(toEmbedTimestamp(user.updatedAt || event.createdAt));
}

function buildPersistenceAlertEmbed(event) {
  const report = event.payload?.report || {};
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  const loaded = report.loaded || {};
  const lastPersist = report.references?.lastPersistLog || null;
  const lines = [
    '**Le backend Nexus Forge a démarré avec un état potentiellement régressif.**',
    loaded.hash ? `Hash chargé : \`${escapeInline(loaded.hash)}\`` : null,
    lastPersist?.hash ? `Dernier hash persist connu : \`${escapeInline(lastPersist.hash)}\`` : null,
    lastPersist?.at ? `Dernier persist connu : ${escapeInline(lastPersist.at)}` : null
  ].filter(Boolean);

  for (const warning of warnings.slice(0, 5)) {
    if (warning?.kind === 'regression') {
      lines.push(
        '',
        `**Régression détectée vs ${escapeInline(warning.label || 'référence')}**`,
        ...Object.entries(warning.delta || {})
          .filter(([, value]) => Number(value) < 0)
          .map(([key, value]) => `- ${escapeInline(key)} : ${escapeInline(String(value))}`)
      );
      continue;
    }
    if (warning?.kind === 'hash-mismatch') {
      lines.push('', `**Hash différent du dernier persist connu**`);
      continue;
    }
    if (warning?.message) {
      lines.push('', escapeInline(String(warning.message)));
    }
  }

  return new EmbedBuilder()
    .setColor(0xc2410c)
    .setTitle('Alerte persistance backend')
    .setDescription(truncate(lines.join('\n'), 4000))
    .setFooter({ text: 'Nexus Forge · Surveillance persistance' })
    .setTimestamp(toEmbedTimestamp(event.createdAt));
}

function buildSessionInvitationEmbed(event) {
  const sessionInfo = event.payload?.session || {};
  const invitation = event.payload?.invitation || {};
  const invitedBy = invitation.invitedByNickname || invitation.invitedByDisplayName || invitation.invitedByUserId || 'Nexus Forge';
  const roleLabel =
    invitation.role === 'gm' ? 'MJ' : invitation.role === 'observer' ? 'observateur' : 'joueur';
  return new EmbedBuilder()
    .setColor(0x4f46e5)
    .setTitle(`Invitation pour la partie ${truncate(sessionInfo.name || 'Nexus Forge', 180)}`)
    .setDescription(
      [
        `Tu as été invité à rejoindre **${escapeInline(sessionInfo.name || 'une partie Nexus Forge')}**.`,
        `Rôle proposé : **${escapeInline(roleLabel)}**`,
        `Invité par : **${escapeInline(invitedBy)}**`,
        sessionInfo.description ? '' : null,
        sessionInfo.description ? truncate(String(sessionInfo.description || ''), 600) : null,
        '',
        `[Accepter l'invitation](${invitation.acceptUrl})`,
        `[Refuser l'invitation](${invitation.declineUrl})`
      ]
        .filter(Boolean)
        .join('\n')
    )
    .setFooter({ text: 'Nexus Forge Discord' })
    .setTimestamp(toEmbedTimestamp(invitation.createdAt || event.createdAt));
}

function getLinkedSessionByChannelId(channelId) {
  return (
    Object.values(dashboardState.linkedSessionChannels || {}).find(
      (entry) => entry && entry.channelId === channelId && entry.status !== 'deleted'
    ) || null
  );
}

function evaluateDiceFormula(formula) {
  const normalized = String(formula || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  const match = normalized.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) {
    throw new Error('Formule invalide. Utilise par exemple 1d20, 2d6+3 ou 1d100-10.');
  }

  const diceCount = Math.max(1, Number(match[1] || 1));
  const diceSides = Math.max(2, Number(match[2] || 2));
  if (diceCount > 20) {
    throw new Error('Le nombre de dés est limité à 20 pour ce premier outil Discord.');
  }
  if (diceSides > 1000) {
    throw new Error('Le nombre de faces est limité à 1000.');
  }

  const modifier = match[3] ? Number(match[3]) : 0;
  const rolls = Array.from({ length: diceCount }, () => Math.floor(Math.random() * diceSides) + 1);
  const total = rolls.reduce((sum, value) => sum + value, 0) + modifier;
  return {
    normalized,
    rolls,
    modifier,
    total,
    breakdown: `${rolls.join(' + ')}${modifier ? ` ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)}` : ''}`
  };
}

function buildSessionInfoEmbed(linkedSession) {
  return new EmbedBuilder()
    .setColor(0x2d7ff9)
    .setTitle(truncate(linkedSession?.sessionName || 'Partie Nexus Forge', 240))
    .setDescription(
      [
        linkedSession?.guildName ? `**Serveur Discord :** ${escapeInline(linkedSession.guildName)}` : null,
        linkedSession?.channelName ? `**Salon lié :** #${escapeInline(linkedSession.channelName)}` : null,
        linkedSession?.status ? `**Statut :** ${escapeInline(linkedSession.status)}` : null,
        `**Participants liés :** ${escapeInline(String(linkedSession?.participantCount ?? 0))}`,
        linkedSession?.gmCount ? `**MJ liés :** ${escapeInline(String(linkedSession.gmCount))}` : null
      ]
        .filter(Boolean)
        .join('\n')
    )
    .setFooter({ text: 'Nexus Forge Discord' })
    .setTimestamp(toEmbedTimestamp(linkedSession?.lastSyncedAt || new Date().toISOString()))
    .setURL(
      linkedSession?.sessionId && NEXUSFORGE_APP_BASE_URL
        ? `${NEXUSFORGE_APP_BASE_URL}/sessions/${linkedSession.sessionId}`
        : NEXUSFORGE_APP_BASE_URL || undefined
    );
}

function buildDiceRollEmbed(params) {
  return new EmbedBuilder()
    .setColor(0x3dbb7a)
    .setTitle(`Jet Discord · ${truncate(params.formula, 64)}`)
    .setDescription(
      [
        `**Lanceur :** ${escapeInline(params.username)}`,
        params.sessionName ? `**Partie :** ${escapeInline(params.sessionName)}` : null,
        `**Résultat :** ${escapeInline(String(params.result.total))}`,
        `**Détail :** ${escapeInline(params.result.breakdown)}`
      ]
        .filter(Boolean)
        .join('\n')
    )
    .setFooter({ text: 'Nexus Forge Discord' })
    .setTimestamp(new Date());
}

async function fetchBotJson(path, options = {}) {
  const response = await fetch(`${NEXUSFORGE_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-discord-bot-secret': DISCORD_BOT_SHARED_SECRET,
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Requête Nexus Forge impossible (${response.status})`);
  }
  return payload;
}

async function fetchDiscordSessionOutput(params) {
  const search = new URLSearchParams({
    sessionId: params.sessionId,
    discordUserId: params.discordUserId,
    output: params.outputKey
  });
  if (params.visibility) {
    search.set('visibility', params.visibility);
  }
  const payload = await fetchBotJson(`/api/integrations/discord/session-output?${search.toString()}`);
  return payload?.output || null;
}

function buildConfiguredOutputEmbed(output, linkedSession) {
  return new EmbedBuilder()
    .setColor(output.key === 'inventory' ? 0xc084fc : 0x2d7ff9)
    .setTitle(truncate(output.label || linkedSession?.sessionName || 'Nexus Forge', 240))
    .setDescription(truncate(output.content || 'Aucun contenu.', 4000))
    .setFooter({
      text: linkedSession?.sessionName ? `${linkedSession.sessionName} · Nexus Forge Discord` : 'Nexus Forge Discord'
    })
    .setTimestamp(new Date())
    .setURL(
      linkedSession?.sessionId && NEXUSFORGE_APP_BASE_URL
        ? `${NEXUSFORGE_APP_BASE_URL}/sessions/${linkedSession.sessionId}`
        : NEXUSFORGE_APP_BASE_URL || undefined
    );
}

function extractDiscordOutputMedia(output) {
  const raw = String(output?.content || '');
  const lines = raw.split(/\r?\n/);
  let imageSource = null;
  const keptLines = [];

  const takeImageCandidate = (candidate) => {
    if (imageSource || !candidate) {
      return false;
    }
    const trimmed = String(candidate).trim();
    if (!trimmed) {
      return false;
    }
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(trimmed)) {
      imageSource = trimmed;
      return true;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      imageSource = trimmed;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const markdownMatch = trimmed.match(/^!\[[^\]]*\]\(([^)]+)\)(.*)$/);
    if (markdownMatch && takeImageCandidate(markdownMatch[1])) {
      const trailingText = String(markdownMatch[2] || '').trim();
      if (trailingText) {
        keptLines.push(trailingText);
      }
      continue;
    }
    const inlineImageMatch = trimmed.match(/^(data:image\/[a-zA-Z0-9.+-]+;base64,[^\s]+|https?:\/\/[^\s]+)(.*)$/i);
    if (inlineImageMatch && takeImageCandidate(inlineImageMatch[1])) {
      const trailingText = String(inlineImageMatch[2] || '').trim();
      if (trailingText) {
        keptLines.push(trailingText);
      }
      continue;
    }
    if (takeImageCandidate(trimmed)) {
      continue;
    }
    keptLines.push(line);
  }

  return {
    content: keptLines.join('\n').trim(),
    imageSource
  };
}

function buildConfiguredOutputMessage(output, linkedSession) {
  const parsed = extractDiscordOutputMedia(output);
  const embed = new EmbedBuilder()
    .setColor(output.key === 'inventory' ? 0xc084fc : 0x2d7ff9)
    .setTitle(truncate(output.label || linkedSession?.sessionName || 'Nexus Forge', 240))
    .setDescription(truncate(parsed.content || 'Aucun contenu.', 4000))
    .setFooter({
      text: linkedSession?.sessionName ? `${linkedSession.sessionName} · Nexus Forge Discord` : 'Nexus Forge Discord'
    })
    .setTimestamp(new Date())
    .setURL(
      linkedSession?.sessionId && NEXUSFORGE_APP_BASE_URL
        ? `${NEXUSFORGE_APP_BASE_URL}/sessions/${linkedSession.sessionId}`
        : NEXUSFORGE_APP_BASE_URL || undefined
    );

  const files = [];
  if (parsed.imageSource) {
    if (/^data:image\//i.test(parsed.imageSource)) {
      const dataMatch = parsed.imageSource.match(/^data:(image\/([a-zA-Z0-9.+-]+));base64,(.+)$/);
      if (dataMatch) {
        const extension = (dataMatch[2] || 'png').replace(/[^a-zA-Z0-9]/g, '') || 'png';
        const filename = `discord-output-image.${extension}`;
        files.push(new AttachmentBuilder(Buffer.from(dataMatch[3], 'base64'), { name: filename }));
        embed.setImage(`attachment://${filename}`);
      }
    } else {
      embed.setImage(parsed.imageSource);
    }
  }

  return { embeds: [embed], files };
}

async function replyWithConfiguredOutput(interaction, output, linkedSession) {
  const isPrivate = output?.visibility !== 'public';
  const baseOptions = {
    allowedMentions: { parse: [] }
  };
  if (output.format === 'embed') {
    const message = buildConfiguredOutputMessage(output, linkedSession);
    await interaction.reply({
      ...message,
      ...baseOptions,
      ...(isPrivate ? { ephemeral: true } : {})
    });
    return;
  }

  await interaction.reply({
    content: truncate(output.content || 'Aucun contenu.', 1900),
    ...baseOptions,
    ...(isPrivate ? { ephemeral: true } : {})
  });
}

function buildAnnouncementEmbed(event) {
  const announcement = event.payload?.announcement || {};
  const typeLabel =
    announcement.type === 'gm_looking_for_players' ? 'MJ cherche joueurs' : 'Joueur cherche partie';
  const dayLabels = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche'
  };
  const timeSlotLabels = {
    morning: 'Matin',
    midday: 'Midi',
    afternoon: 'Après-midi',
    late_afternoon: 'Fin d’après-midi',
    evening: 'Soir'
  };
  const periodicityLabels = {
    one_shot: 'One-shot',
    weekly: 'Hebdomadaire',
    biweekly: 'Toutes les 2 semaines',
    monthly: 'Mensuel',
    irregular: 'Irrégulier'
  };
  const playModeLabels = {
    online: 'En ligne',
    onsite: 'Présentiel',
    hybrid: 'Hybride'
  };
  const details = [
    `**Type:** ${escapeInline(typeLabel)}`,
    announcement.systemName ? `**Système:** ${escapeInline(announcement.systemName)}` : null,
    announcement.language ? `**Langue:** ${escapeInline(String(announcement.language).toUpperCase())}` : null,
    announcement.playMode ? `**Format:** ${escapeInline(playModeLabels[announcement.playMode] || announcement.playMode)}` : null,
    announcement.playerSlotsWanted ? `**Places recherchées:** ${escapeInline(announcement.playerSlotsWanted)}` : null,
    announcement.periodicity ? `**Périodicité:** ${escapeInline(periodicityLabels[announcement.periodicity] || announcement.periodicity)}` : null,
    Array.isArray(announcement.daysOfWeek) && announcement.daysOfWeek.length
      ? `**Jours:** ${announcement.daysOfWeek.map((day) => escapeInline(dayLabels[day] || day)).join(', ')}`
      : null,
    Array.isArray(announcement.timeSlots) && announcement.timeSlots.length
      ? `**Créneaux:** ${announcement.timeSlots.map((slot) => escapeInline(timeSlotLabels[slot] || slot)).join(', ')}`
      : null
  ].filter(Boolean);
  return new EmbedBuilder()
    .setColor(0xc084fc)
    .setTitle(truncate((announcement.systemName ? `${announcement.systemName} · ` : '') + (announcement.summary || 'Annonce Nexus Forge'), 240))
    .setDescription([details.join('\n'), '', truncate(announcement.summary || '', 1200)].filter(Boolean).join('\n'))
    .setFooter({
      text: announcement.authorNickname ? `Publié par ${announcement.authorNickname}` : 'Nexus Forge'
    })
    .setTimestamp(toEmbedTimestamp(announcement.updatedAt || announcement.createdAt || event.createdAt))
    .setURL(NEXUSFORGE_APP_BASE_URL ? `${NEXUSFORGE_APP_BASE_URL}/announcements` : undefined);
}

async function sendEmbedToChannels(channelIds, embed) {
  for (const channelId of channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        log(`canal ${channelId} introuvable ou non textuel`);
        continue;
      }
      await channel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      log(`envoi canal ${channelId} echoue`, error);
    }
  }
}

async function sendEmbedToUsers(userIds, embed) {
  for (const userId of userIds) {
    try {
      const user = await client.users.fetch(userId);
      if (!user) {
        log(`utilisateur staff ${userId} introuvable`);
        continue;
      }
      await user.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      log(`envoi DM ${userId} echoue`, error);
    }
  }
}

async function sendSessionInvitationDm(event) {
  const targetDiscordUserId = String(event.payload?.targetDiscordUser?.id || '').trim();
  if (!targetDiscordUserId) {
    return;
  }
  const embed = buildSessionInvitationEmbed(event);
  try {
    const user = await client.users.fetch(targetDiscordUserId);
    if (!user) {
      log(`utilisateur Discord cible ${targetDiscordUserId} introuvable pour invitation`);
      return;
    }
    await user.send({
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    log(`envoi invitation DM ${targetDiscordUserId} echoue`, error);
  }
}

async function upsertAnnouncementMessages(event) {
  const announcement = event.payload?.announcement || null;
  if (!announcement?.id) {
    return;
  }
  const targetChannelIds = getEffectiveRecruitmentChannelIds();
  const mapping = isPlainObject(dashboardState.announcementMessages[announcement.id])
    ? dashboardState.announcementMessages[announcement.id]
    : {};
  const nextMapping = {};
  const embed = buildAnnouncementEmbed(event);

  for (const channelId of targetChannelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        log(`canal recrutement ${channelId} introuvable ou non textuel`);
        continue;
      }

      const existingMessageId = typeof mapping[channelId] === 'string' ? mapping[channelId] : null;
      if (existingMessageId) {
        try {
          const existingMessage = await channel.messages.fetch(existingMessageId);
          await existingMessage.edit({
            embeds: [embed],
            allowedMentions: { parse: [] }
          });
          nextMapping[channelId] = existingMessage.id;
          continue;
        } catch {
          // recreate below if the previous message is gone
        }
      }

      const sentMessage = await channel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });
      nextMapping[channelId] = sentMessage.id;
    } catch (error) {
      log(`publication recrutement ${channelId} echouee`, error);
    }
  }

  for (const [channelId, messageId] of Object.entries(mapping)) {
    if (nextMapping[channelId]) {
      continue;
    }
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        const previousMessage = await channel.messages.fetch(messageId);
        await previousMessage.delete().catch(() => {});
      }
    } catch {
      // noop
    }
  }

  if (Object.keys(nextMapping).length > 0) {
    dashboardState.announcementMessages[announcement.id] = nextMapping;
  } else {
    delete dashboardState.announcementMessages[announcement.id];
  }
  saveDashboardState();
}

async function deleteAnnouncementMessages(event) {
  const announcement = event.payload?.announcement || null;
  if (!announcement?.id) {
    return;
  }
  const mapping = isPlainObject(dashboardState.announcementMessages[announcement.id])
    ? dashboardState.announcementMessages[announcement.id]
    : {};
  for (const [channelId, messageId] of Object.entries(mapping)) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        continue;
      }
      const message = await channel.messages.fetch(messageId);
      await message.delete().catch(() => {});
    } catch {
      // noop
    }
  }
  delete dashboardState.announcementMessages[announcement.id];
  saveDashboardState();
}

function buildSessionChannelName(name, archived = false) {
  const base = String(name || 'partie')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, archived ? 88 : 96) || 'partie';
  return archived ? `archive-${base}`.slice(0, 100) : base.slice(0, 100);
}

function buildSessionPermissionOverwrites(guild, sessionPayload, options = {}) {
  const archived = Boolean(options.archived);
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      type: OverwriteType.Role,
      deny: [PermissionsBitField.Flags.ViewChannel]
    }
  ];

  const meId = guild.members.me?.id || client.user?.id || null;
  if (meId) {
    overwrites.push({
      id: meId,
      type: OverwriteType.Member,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  }

  const seen = new Set();
  for (const participant of sessionPayload?.participants || []) {
    const discordUserId = typeof participant?.discordUserId === 'string' ? participant.discordUserId.trim() : '';
    if (!discordUserId || seen.has(discordUserId)) {
      continue;
    }
    seen.add(discordUserId);
    overwrites.push({
      id: discordUserId,
      type: OverwriteType.Member,
      allow: archived
        ? [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
        : [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.UseApplicationCommands,
            PermissionsBitField.Flags.AddReactions
          ]
    });
  }

  return overwrites;
}

async function reportSessionChannelState(payload) {
  const response = await fetch(`${NEXUSFORGE_API_BASE_URL}/api/integrations/discord/session-channel-report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-discord-bot-secret': DISCORD_BOT_SHARED_SECRET
    },
    body: JSON.stringify(payload)
  });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Session channel report failed (${response.status}): ${text}`);
  }
}

async function syncSessionDiscordChannel(event) {
  const sessionPayload = event.payload?.session || null;
  const integration = sessionPayload?.integration || null;
  const guildId = typeof integration?.guildId === 'string' ? integration.guildId.trim() : '';
  if (!sessionPayload?.id || !guildId) {
    return;
  }

  const guildConfig = dashboardState.guildConfigs[guildId] || {};
  const sessionsCategoryId = typeof guildConfig.sessionsCategoryId === 'string' ? guildConfig.sessionsCategoryId.trim() : '';
  if (!sessionsCategoryId) {
    log(`aucune categorie de salons configuree pour la guilde ${guildId}`);
    return;
  }

  const guild = await client.guilds.fetch(guildId);
  const archived = String(event.payload?.kind || '') === 'archive' || Boolean(sessionPayload.archivedAt);
  const desiredName = buildSessionChannelName(sessionPayload.name, archived);
  const topic = `Partie Nexus Forge: ${sessionPayload.name} (${sessionPayload.id})`;
  const permissionOverwrites = buildSessionPermissionOverwrites(guild, sessionPayload, { archived });

  let channel = null;
  const existingChannelId = typeof integration.channelId === 'string' ? integration.channelId.trim() : '';
  if (existingChannelId) {
    channel = await guild.channels.fetch(existingChannelId).catch(() => null);
  }

  if (channel && channel.type !== ChannelType.GuildText) {
    channel = null;
  }

  if (!channel) {
    channel = await guild.channels.create({
      name: desiredName,
      type: ChannelType.GuildText,
      parent: sessionsCategoryId || null,
      topic,
      permissionOverwrites
    });
  } else {
    await channel.edit({
      name: desiredName,
      parent: sessionsCategoryId || null,
      topic
    });
    await channel.permissionOverwrites.set(permissionOverwrites);
  }

  await reportSessionChannelState({
    sessionId: sessionPayload.id,
    guildId,
    guildName: guild.name,
    categoryId: sessionsCategoryId,
    channelId: channel.id,
    channelName: channel.name,
    status: archived ? 'archived' : 'active'
  });

  dashboardState.linkedSessionChannels[sessionPayload.id] = {
    sessionId: sessionPayload.id,
    sessionName: sessionPayload.name || 'Partie Nexus Forge',
    guildId,
    guildName: guild.name,
    categoryId: sessionsCategoryId,
    channelId: channel.id,
    channelName: channel.name,
    status: archived ? 'archived' : 'active',
    participantCount: Array.isArray(sessionPayload.participants) ? sessionPayload.participants.length : 0,
    gmCount: Array.isArray(sessionPayload.gmUserIds) ? sessionPayload.gmUserIds.length : 0,
    lastSyncedAt: new Date().toISOString()
  };
  saveDashboardState();
}

async function deleteSessionDiscordChannel(event) {
  const sessionPayload = event.payload?.session || null;
  const integration = sessionPayload?.integration || null;
  const guildId = typeof integration?.guildId === 'string' ? integration.guildId.trim() : '';
  const channelId = typeof integration?.channelId === 'string' ? integration.channelId.trim() : '';
  if (!sessionPayload?.id || !guildId) {
    return;
  }

  if (channelId) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel && 'delete' in channel) {
        await channel.delete('Session Nexus Forge supprimée').catch(() => {});
      }
    } catch (error) {
      log(`suppression salon session ${sessionPayload.id} echouee`, error);
    }
  }

  await reportSessionChannelState({
    sessionId: sessionPayload.id,
    guildId,
    guildName: null,
    categoryId: null,
    channelId: null,
    channelName: null,
    status: 'deleted'
  });

  dashboardState.linkedSessionChannels[sessionPayload.id] = {
    sessionId: sessionPayload.id,
    sessionName: sessionPayload.name || 'Partie Nexus Forge',
    guildId,
    guildName: null,
    categoryId: null,
    channelId: null,
    channelName: null,
    status: 'deleted',
    participantCount: 0,
    gmCount: 0,
    lastSyncedAt: new Date().toISOString()
  };
  saveDashboardState();
}

async function registerSlashCommandsForGuild(guildId) {
  const guild = await client.guilds.fetch(guildId);
  await guild.commands.set(slashCommands.map((command) => command.toJSON()));
}

async function dispatchEvent(event) {
  let handled = false;
  switch (event.type) {
    case 'news.published': {
      const channelIds = getEffectiveNewsChannelIds();
      if (channelIds.length === 0) {
        return;
      }
      await sendEmbedToChannels(channelIds, buildNewsEmbed(event));
      handled = true;
      break;
    }
    case 'release.published': {
      const channelIds = getEffectiveNewsChannelIds();
      if (channelIds.length === 0) {
        return;
      }
      await sendEmbedToChannels(channelIds, buildReleaseEmbed(event));
      handled = true;
      break;
    }
    case 'user.pending_validation': {
      const embed = buildPendingValidationEmbed(event);
      await sendEmbedToChannels(getEffectiveStaffChannelIds(), embed);
      await sendEmbedToUsers(getEffectiveStaffUserIds(), embed);
      handled = true;
      break;
    }
    case 'backend.persistence_alert': {
      const embed = buildPersistenceAlertEmbed(event);
      await sendEmbedToChannels(getEffectiveStaffChannelIds(), embed);
      await sendEmbedToUsers(getEffectiveStaffUserIds(), embed);
      handled = true;
      break;
    }
    case 'announcement.sync': {
      const kind = String(event.payload?.kind || 'upsert');
      if (kind === 'delete') {
        await deleteAnnouncementMessages(event);
      } else {
        await upsertAnnouncementMessages(event);
      }
      handled = true;
      break;
    }
    case 'session.discord.sync': {
      const kind = String(event.payload?.kind || 'upsert');
      if (kind === 'delete') {
        await deleteSessionDiscordChannel(event);
      } else {
        await syncSessionDiscordChannel(event);
      }
      handled = true;
      break;
    }
    case 'session.invitation.created': {
      await sendSessionInvitationDm(event);
      handled = true;
      break;
    }
    default:
      log(`type d evenement ignore: ${event.type}`);
  }
  if (!handled) {
    return;
  }
  lastDispatchAt = new Date().toISOString();
  pushRecentDispatch({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt || null,
    handledAt: lastDispatchAt
  });
}

async function pollOnce() {
  if (isPolling) {
    return;
  }
  isPolling = true;
  try {
    lastPollAt = new Date().toISOString();
    lastPollError = null;
    const items = await fetchEvents(botState.lastEventId);
    if (!botState.lastEventId && items.length > 0 && BOOTSTRAP_MODE === 'latest') {
      botState.lastEventId = items[items.length - 1].id;
      saveState();
      log(`initialisation du curseur sur ${botState.lastEventId} sans reenvoi historique`);
      return;
    }

    for (const item of items) {
      await dispatchEvent(item);
      botState.lastEventId = item.id;
      saveState();
    }

    if (items.length > 0) {
      log(`${items.length} evenement(s) traites, dernier=${botState.lastEventId}`);
    }
  } catch (error) {
    lastPollError = error instanceof Error ? error.message : String(error);
    log('poll echoue', error);
  } finally {
    isPolling = false;
  }
}

function schedulePoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
}

client.once('ready', async () => {
  log(`connecte en tant que ${client.user?.tag || 'bot inconnu'}`);
  botReady = true;
  client.user?.setPresence({
    activities: [{ name: 'Nexus Forge', type: ActivityType.Watching }],
    status: 'online'
  });
  await Promise.allSettled([...client.guilds.cache.keys()].map((guildId) => registerSlashCommandsForGuild(guildId)));
  await pollOnce();
  schedulePoll();
});

client.on('guildCreate', async (guild) => {
  try {
    await registerSlashCommandsForGuild(guild.id);
  } catch (error) {
    log(`enregistrement des commandes slash impossible pour ${guild.id}`, error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) {
    return;
  }

  if (interaction.commandName === 'nf-partie') {
    const linkedSession = getLinkedSessionByChannelId(interaction.channelId);
    if (!linkedSession) {
      await interaction.reply({
        content: 'Ce salon Discord n est pas encore lié à une partie Nexus Forge active.',
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      embeds: [buildSessionInfoEmbed(linkedSession)],
      allowedMentions: { parse: [] }
    });
    return;
  }

  if (interaction.commandName === 'nf-fiche' || interaction.commandName === 'nf-inv') {
    const linkedSession = getLinkedSessionByChannelId(interaction.channelId);
    if (!linkedSession) {
      await interaction.reply({
        content: 'Cette commande Discord n est disponible que dans un salon de partie Nexus Forge lié.',
        ephemeral: true
      });
      return;
    }

    try {
      const requestedVisibility = interaction.options.getString('visibilite') || undefined;
      const output = await fetchDiscordSessionOutput({
        sessionId: linkedSession.sessionId,
        discordUserId: interaction.user.id,
        outputKey: interaction.commandName === 'nf-fiche' ? 'sheet' : 'inventory',
        visibility: requestedVisibility
      });

      if (!output) {
        await interaction.reply({
          content: 'Aucune sortie Discord n a été renvoyée pour cette commande.',
          ephemeral: true
        });
        return;
      }

      await replyWithConfiguredOutput(interaction, output, linkedSession);
    } catch (commandError) {
      await interaction.reply({
        content: commandError instanceof Error ? commandError.message : 'Lecture Discord du système impossible.',
        ephemeral: true
      });
    }
    return;
  }

  if (interaction.commandName === 'nf-note') {
    const linkedSession = getLinkedSessionByChannelId(interaction.channelId);
    if (!linkedSession) {
      await interaction.reply({
        content: 'Cette commande Discord n est disponible que dans un salon de partie Nexus Forge lié.',
        ephemeral: true
      });
      return;
    }

    try {
      const requestedVisibility = interaction.options.getString('visibilite') || undefined;
      const output = await fetchDiscordSessionOutput({
        sessionId: linkedSession.sessionId,
        discordUserId: interaction.user.id,
        outputKey: 'notes',
        visibility: requestedVisibility
      });

      if (!output) {
        await interaction.reply({
          content: 'Aucune sortie Discord n a été renvoyée pour cette commande.',
          ephemeral: true
        });
        return;
      }

      await replyWithConfiguredOutput(interaction, output, linkedSession);
    } catch (commandError) {
      await interaction.reply({
        content: commandError instanceof Error ? commandError.message : 'Lecture Discord du système impossible.',
        ephemeral: true
      });
    }
    return;
  }

  if (/^nf-vue[1-9]$/.test(interaction.commandName)) {
    const linkedSession = getLinkedSessionByChannelId(interaction.channelId);
    if (!linkedSession) {
      await interaction.reply({
        content: 'Cette commande Discord n est disponible que dans un salon de partie Nexus Forge lié.',
        ephemeral: true
      });
      return;
    }

    try {
      const requestedVisibility = interaction.options.getString('visibilite') || undefined;
      const outputKey = interaction.commandName.replace('nf-vue', 'view');
      const output = await fetchDiscordSessionOutput({
        sessionId: linkedSession.sessionId,
        discordUserId: interaction.user.id,
        outputKey,
        visibility: requestedVisibility
      });

      if (!output) {
        await interaction.reply({
          content: 'Aucune sortie Discord n a été renvoyée pour cette commande.',
          ephemeral: true
        });
        return;
      }

      await replyWithConfiguredOutput(interaction, output, linkedSession);
    } catch (commandError) {
      await interaction.reply({
        content: commandError instanceof Error ? commandError.message : 'Lecture Discord du système impossible.',
        ephemeral: true
      });
    }
    return;
  }

  if (interaction.commandName === 'nf-jet') {
    const linkedSession = getLinkedSessionByChannelId(interaction.channelId);
    if (!linkedSession) {
      await interaction.reply({
        content: 'Le jet Discord n est disponible que dans un salon de partie Nexus Forge lié.',
        ephemeral: true
      });
      return;
    }

    const formula = interaction.options.getString('formule', true);
    try {
      const result = evaluateDiceFormula(formula);
      await interaction.reply({
        embeds: [
          buildDiceRollEmbed({
            formula: result.normalized,
            result,
            username: interaction.member?.nickname || interaction.user.globalName || interaction.user.username,
            sessionName: linkedSession.sessionName
          })
        ],
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      await interaction.reply({
        content: error instanceof Error ? error.message : 'Jet Discord impossible.',
        ephemeral: true
      });
    }
  }
});

client.on('error', (error) => {
  log('erreur client Discord', error);
});

client.on('shardError', (error) => {
  log('erreur shard Discord', error);
});

function buildDashboardState() {
  return {
    ok: true,
    service: 'nexusforge-discord-bot',
    ready: botReady,
    botUser: client.user
      ? {
          id: client.user.id,
          tag: client.user.tag,
          username: client.user.username
        }
      : null,
    lastEventId: botState.lastEventId || null,
    pollIntervalMs: POLL_INTERVAL_MS,
    bootstrapMode: BOOTSTRAP_MODE,
    lastPollAt,
    lastPollError,
    lastDispatchAt,
    appBaseUrl: NEXUSFORGE_APP_BASE_URL || null,
    apiBaseUrl: NEXUSFORGE_API_BASE_URL || null,
    newsChannelIds: getEffectiveNewsChannelIds(),
    recruitmentChannelIds: getEffectiveRecruitmentChannelIds(),
    staffChannelIds: getEffectiveStaffChannelIds(),
    staffUserIds: getEffectiveStaffUserIds(),
    guilds: [...client.guilds.cache.values()].map((guild) => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount ?? null
    })),
    recentDispatches,
    linkedSessionChannels: Object.values(dashboardState.linkedSessionChannels || {})
  };
}

function renderLoginPage() {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nexus Forge Bot</title>
  <style>
    :root { color-scheme: dark; --bg:#0a1020; --panel:#101a2f; --line:#25365f; --text:#e5e7eb; --muted:#94a3b8; --accent:#60a5fa; }
    body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; background:radial-gradient(circle at top, rgba(96,165,250,.16), transparent 28rem), linear-gradient(180deg,#08111f 0%,var(--bg) 100%); color:var(--text); }
    .wrap { width:min(760px, calc(100vw - 2rem)); margin:0 auto; padding:4rem 0; }
    .panel { background:rgba(16,26,47,.94); border:1px solid var(--line); border-radius:24px; padding:1.5rem; box-shadow:0 24px 80px rgba(0,0,0,.35); }
    h1,p { margin:0; } h1 { margin-bottom:.85rem; } p { color:var(--muted); line-height:1.6; }
    a.button { display:inline-flex; margin-top:1.2rem; padding:.9rem 1.15rem; border-radius:14px; background:linear-gradient(135deg,#2563eb,#60a5fa); color:white; text-decoration:none; font-weight:700; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="panel">
      <h1>Connexion Discord requise</h1>
      <p>Ce tableau de bord pilote la configuration du bot Discord Nexus Forge. L accès est reserve aux comptes Discord connectés.</p>
      <a class="button" href="/auth/discord/start">Se connecter avec Discord</a>
    </section>
  </div>
</body>
</html>`;
}

function renderDashboardHtml(state, sessionContext) {
  const safeJson = JSON.stringify(state).replace(/</g, '\\u003c');
  const safeContext = JSON.stringify(sessionContext).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nexus Forge Bot</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1220;
      --panel: #101a2f;
      --panel-soft: #16223d;
      --line: #2d3b62;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --accent: #60a5fa;
      --ok: #34d399;
      --warn: #f59e0b;
      --bad: #f87171;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background:
        radial-gradient(circle at top, rgba(96,165,250,0.12), transparent 28rem),
        linear-gradient(180deg, #08111f 0%, var(--bg) 100%);
      color: var(--text);
    }
    .wrap {
      width: min(1120px, calc(100vw - 2rem));
      margin: 0 auto;
      padding: 2rem 0 3rem;
    }
    .hero, .panel {
      background: rgba(16,26,47,0.92);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.35);
    }
    .hero {
      padding: 1.4rem 1.5rem;
      display: grid;
      gap: 0.85rem;
      margin-bottom: 1rem;
    }
    .title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 1.6rem; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.4rem 0.7rem;
      border-radius: 999px;
      background: var(--panel-soft);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.9rem;
    }
    .badge[data-state="ready"] { color: var(--ok); }
    .badge[data-state="error"] { color: var(--bad); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }
    .panel { padding: 1rem 1.1rem; }
    .panel h2 { font-size: 1.02rem; margin-bottom: 0.75rem; }
    .value { font-size: 1.2rem; font-weight: 700; }
    .muted { color: var(--muted); }
    .list { display: grid; gap: 0.6rem; }
    .item {
      padding: 0.75rem 0.85rem;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(22,34,61,0.7);
    }
    .code {
      font-family: "Cascadia Mono", "Fira Code", monospace;
      font-size: 0.92rem;
      word-break: break-word;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 1rem;
      margin-top: 1rem;
    }
    .actions { display:flex; gap:.75rem; flex-wrap:wrap; margin-top:1rem; }
    .button, button {
      display:inline-flex; align-items:center; justify-content:center;
      min-height:42px; padding:.75rem 1rem; border-radius:14px;
      border:1px solid var(--line); background:var(--panel-soft); color:var(--text);
      text-decoration:none; cursor:pointer; font:inherit;
    }
    .button.primary, button.primary { background:linear-gradient(135deg,#2563eb,#60a5fa); border-color:#4f83ff; color:white; }
    .button.danger, button.danger { border-color:#7f1d1d; color:#fecaca; }
    .forms { display:grid; gap:1rem; }
    .field { display:grid; gap:.35rem; }
    .field label { color:var(--muted); font-size:.92rem; }
    .field select, .field input {
      width:100%;
      min-height:42px;
      border-radius:12px;
      border:1px solid var(--line);
      background:#0c1427;
      color:var(--text);
      padding:.65rem .8rem;
    }
    .inline { display:grid; grid-template-columns:1fr auto; gap:.75rem; align-items:end; }
    .owner { outline:1px solid rgba(245,158,11,.35); }
    .hidden { display:none; }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: #cbd5e1;
      font-size: 0.85rem;
      line-height: 1.4;
    }
    @media (max-width: 900px) {
      .two-col { grid-template-columns: 1fr; }
      .title { align-items: flex-start; flex-direction: column; }
      .inline { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="title">
        <div>
          <h1>Tableau de bord du bot Discord Nexus Forge</h1>
          <p class="muted">Vue de statut du service, des salons cibles et des derniers événements traités.</p>
        </div>
        <div class="badge" data-state="${state.ready ? 'ready' : state.lastPollError ? 'error' : 'loading'}">
          ${state.ready ? 'Bot connecté' : state.lastPollError ? 'Erreur de synchronisation' : 'Démarrage en cours'}
        </div>
      </div>
      <div class="actions">
        <span class="badge">${sessionContext.user.globalName || sessionContext.user.username || sessionContext.user.id}</span>
        ${sessionContext.isOwner ? '<span class="badge" data-state="ready">Owner</span>' : ''}
        <a class="button" href="${NEXUSFORGE_APP_BASE_URL || 'https://nexusforge.en-ligne.fr'}" target="_blank" rel="noreferrer">Ouvrir Nexus Forge</a>
        <a class="button" href="/logout">Se déconnecter</a>
      </div>
      <div class="grid">
        <div class="panel">
          <h2>Identité du bot</h2>
          <p class="value">${state.botUser?.tag || 'Non connecté'}</p>
          <p class="muted code">${state.botUser?.id || 'Aucun identifiant Discord chargé'}</p>
        </div>
        <div class="panel">
          <h2>Dernier événement</h2>
          <p class="value code">${state.lastEventId || 'Aucun'}</p>
          <p class="muted">Dernier dispatch: ${state.lastDispatchAt || 'Jamais'}</p>
        </div>
        <div class="panel">
          <h2>Synchronisation</h2>
          <p class="value">${Math.round(state.pollIntervalMs / 1000)} s</p>
          <p class="muted">Mode bootstrap: ${state.bootstrapMode}</p>
        </div>
      </div>
    </section>

    <div class="two-col">
      <section class="panel">
        <h2>Serveurs rejoints</h2>
        <div class="list">
          ${state.guilds.length === 0 ? '<div class="item muted">Le bot n a encore rejoint aucun serveur Discord.</div>' : state.guilds
            .map((guild) => `<div class="item"><strong>${guild.name}</strong><div class="muted code">${guild.id}</div><div class="muted">${guild.memberCount ?? 'n/a'} membres</div></div>`)
            .join('')}
        </div>
      </section>

      <section class="panel">
        <h2>Canaux configurés</h2>
        <div class="list">
          <div class="item">
            <strong>News</strong>
            <div class="muted code">${state.newsChannelIds.length ? state.newsChannelIds.join(', ') : 'Aucun canal configuré'}</div>
          </div>
          <div class="item">
            <strong>Recrutement</strong>
            <div class="muted code">${state.recruitmentChannelIds.length ? state.recruitmentChannelIds.join(', ') : 'Aucun canal configuré'}</div>
          </div>
          <div class="item">
            <strong>Staff</strong>
            <div class="muted code">${state.staffChannelIds.length ? state.staffChannelIds.join(', ') : 'Aucun canal configuré'}</div>
          </div>
          <div class="item">
            <strong>DM staff</strong>
            <div class="muted code">${state.staffUserIds.length ? state.staffUserIds.join(', ') : 'Aucun utilisateur configuré'}</div>
          </div>
        </div>
      </section>
    </div>

    <div class="two-col">
      <section class="panel">
        <h2>Configuration par serveur</h2>
        <div class="forms" id="guild-config-root"></div>
      </section>

      <section class="panel owner ${sessionContext.isOwner ? '' : 'hidden'}" id="owner-config-panel">
        <h2>Configuration owner uniquement</h2>
        <p class="muted" style="margin-bottom:.85rem;">Les alertes user.pending_validation restent centralisées ici et ne sont pas déléguées aux autres serveurs.</p>
        <div class="forms">
          <div class="field">
            <label for="staffChannelIds">Canaux staff globaux (IDs séparés par des virgules)</label>
            <input id="staffChannelIds" value="${getEffectiveStaffChannelIds().join(', ')}" />
          </div>
          <div class="field">
            <label for="staffUserIds">Admins en DM (IDs séparés par des virgules)</label>
            <input id="staffUserIds" value="${getEffectiveStaffUserIds().join(', ')}" />
          </div>
          <div class="actions">
            <button class="primary" id="save-owner-config" type="button">Enregistrer la configuration owner</button>
          </div>
          <p class="muted" id="owner-config-status"></p>
        </div>
      </section>
    </div>

    <div class="two-col">
      <section class="panel">
        <h2>Derniers événements traités</h2>
        <div class="list">
          ${state.recentDispatches.length === 0 ? '<div class="item muted">Aucun événement traité pour le moment.</div>' : state.recentDispatches
            .map((event) => `<div class="item"><strong>${event.type}</strong><div class="muted code">${event.id}</div><div class="muted">créé: ${event.createdAt || 'n/a'} · traité: ${event.handledAt || 'n/a'}</div></div>`)
            .join('')}
        </div>
      </section>

      <section class="panel">
        <h2>État technique</h2>
        <pre>${safeJson}</pre>
      </section>
    </div>
  </div>
  <script>
    const sessionContext = ${safeContext};
    async function fetchJson(path, options = {}) {
      const response = await fetch(path, {
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message || 'Requête impossible');
      }
      return payload;
    }

    function renderGuildConfigs(guilds) {
      const root = document.getElementById('guild-config-root');
      if (!root) return;
      if (!guilds.length) {
        root.innerHTML = '<div class="item muted">Aucun serveur gérable n est disponible pour ce compte Discord. Le bot doit être invité et ton compte doit être propriétaire ou administrateur du serveur.</div>';
        return;
      }
      root.innerHTML = guilds.map((guild) => \`
        <div class="item">
          <strong>\${guild.name}</strong>
          <div class="muted code">\${guild.id}</div>
          <div class="inline" style="margin-top:.75rem;">
            <div class="field">
              <label>Salon news de ce serveur</label>
              <select data-guild-news-id="\${guild.id}">
                <option value="">Désactivé pour ce serveur</option>
                \${guild.channels.map((channel) => \`<option value="\${channel.id}" \${guild.newsChannelId === channel.id ? 'selected' : ''}>#\${channel.name}</option>\`).join('')}
              </select>
            </div>
          </div>
          <div class="inline" style="margin-top:.75rem;">
            <div class="field">
              <label>Salon recrutement de ce serveur</label>
              <select data-guild-recruitment-id="\${guild.id}">
                <option value="">Désactivé pour ce serveur</option>
                \${guild.channels.map((channel) => \`<option value="\${channel.id}" \${guild.recruitmentChannelId === channel.id ? 'selected' : ''}>#\${channel.name}</option>\`).join('')}
              </select>
            </div>
          </div>
          <div class="inline" style="margin-top:.75rem;">
            <div class="field">
              <label>Catégorie des salons de partie</label>
              <select data-guild-session-category-id="\${guild.id}">
                <option value="">Aucune catégorie configurée</option>
                \${guild.categories.map((category) => \`<option value="\${category.id}" \${guild.sessionsCategoryId === category.id ? 'selected' : ''}>\${category.name}</option>\`).join('')}
              </select>
            </div>
            <button class="primary" type="button" data-save-guild="\${guild.id}">Enregistrer</button>
          </div>
          <p class="muted" id="guild-status-\${guild.id}">\${guild.newsChannelId || guild.recruitmentChannelId || guild.sessionsCategoryId ? 'Configuration chargée.' : 'Aucun salon configuré pour les news, le recrutement ou les parties.'}</p>
        </div>
      \`).join('');

      root.querySelectorAll('[data-save-guild]').forEach((button) => {
        button.addEventListener('click', async () => {
          const guildId = button.getAttribute('data-save-guild');
          const newsSelect = root.querySelector('select[data-guild-news-id="' + guildId + '"]');
          const recruitmentSelect = root.querySelector('select[data-guild-recruitment-id="' + guildId + '"]');
          const sessionCategorySelect = root.querySelector('select[data-guild-session-category-id="' + guildId + '"]');
          const status = document.getElementById('guild-status-' + guildId);
          try {
            await fetchJson('/api/dashboard/config/guild', {
              method: 'POST',
              body: JSON.stringify({
                guildId,
                newsChannelId: newsSelect?.value || null,
                recruitmentChannelId: recruitmentSelect?.value || null,
                sessionsCategoryId: sessionCategorySelect?.value || null
              })
            });
            status.textContent = (newsSelect?.value || recruitmentSelect?.value || sessionCategorySelect?.value)
              ? 'Configuration enregistrée.'
              : 'Configuration désactivée.';
          } catch (error) {
            status.textContent = error.message || 'Enregistrement impossible.';
          }
        });
      });
    }

    async function bootstrap() {
      try {
        const context = await fetchJson('/api/dashboard/context');
        renderGuildConfigs(context.manageableGuilds || []);
      } catch (error) {
        const root = document.getElementById('guild-config-root');
        if (root) root.innerHTML = '<div class="item muted">' + (error.message || 'Chargement impossible.') + '</div>';
      }
    }

    const saveOwnerButton = document.getElementById('save-owner-config');
    if (saveOwnerButton) {
      saveOwnerButton.addEventListener('click', async () => {
        const status = document.getElementById('owner-config-status');
        try {
          await fetchJson('/api/dashboard/config/global', {
            method: 'POST',
            body: JSON.stringify({
              staffChannelIds: document.getElementById('staffChannelIds').value.split(',').map((item) => item.trim()).filter(Boolean),
              staffUserIds: document.getElementById('staffUserIds').value.split(',').map((item) => item.trim()).filter(Boolean)
            })
          });
          status.textContent = 'Configuration owner enregistrée.';
        } catch (error) {
          status.textContent = error.message || 'Enregistrement impossible.';
        }
      });
    }

    bootstrap();
  </script>
</body>
</html>`;
}
function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function sendHtml(res, status, html, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    ...extraHeaders
  });
  res.end(html);
}

function hasBotSecret(req) {
  const provided = String(req.headers['x-discord-bot-secret'] || req.headers['x-nexusforge-discord-secret'] || '').trim();
  return Boolean(provided && provided === DISCORD_BOT_SHARED_SECRET);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const session = getSessionFromRequest(req);

    if (url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'nexusforge-discord-bot',
        ready: botReady,
        lastEventId: botState.lastEventId || null
      });
      return;
    }

    if (url.pathname === '/api/internal/guilds') {
      if (!hasBotSecret(req)) {
        sendJson(res, 403, { error: { message: 'Secret Discord bot invalide' } });
        return;
      }
      sendJson(res, 200, {
        items: [...client.guilds.cache.values()].map((guild) => ({
          id: guild.id,
          name: guild.name
        }))
      });
      return;
    }

    if (url.pathname === '/auth/discord/start') {
      if (!DISCORD_OAUTH_CLIENT_ID || !DISCORD_OAUTH_CLIENT_SECRET || !DISCORD_OAUTH_REDIRECT_URI) {
        sendHtml(res, 503, '<h1>OAuth2 Discord non configuré</h1>');
        return;
      }
      redirect(res, buildDiscordOauthAuthorizeUrl());
      return;
    }

    if (url.pathname === '/auth/discord/callback') {
      const code = String(url.searchParams.get('code') || '').trim();
      const state = String(url.searchParams.get('state') || '').trim();
      const remoteError = String(url.searchParams.get('error') || '').trim();
      if (remoteError || !code || !state || !consumeOauthState(state)) {
        sendHtml(res, 400, '<h1>Retour OAuth2 Discord invalide</h1><p>Relance la connexion depuis le tableau de bord.</p>');
        return;
      }
      const user = await exchangeDiscordOauthCode(code);
      const sessionId = createSession(user);
      res.writeHead(302, {
        Location: '/',
        'Set-Cookie': serializeCookie(SESSION_COOKIE_NAME, `${sessionId}.${signValue(sessionId)}`, Math.round(SESSION_TTL_MS / 1000))
      });
      res.end();
      return;
    }

    if (url.pathname === '/logout') {
      if (session?.id) {
        delete dashboardState.sessions[session.id];
        saveDashboardState();
      }
      res.writeHead(302, {
        Location: '/',
        'Set-Cookie': clearCookie(SESSION_COOKIE_NAME)
      });
      res.end();
      return;
    }

    if (!session) {
      if (url.pathname === '/status.json' || url.pathname.startsWith('/api/')) {
        sendJson(res, 401, { error: { message: 'Authentification Discord requise' } });
        return;
      }
      sendHtml(res, 200, renderLoginPage());
      return;
    }

    if (url.pathname === '/api/dashboard/context') {
      const manageableGuilds = await buildManageableGuilds(session);
      sendJson(res, 200, {
        user: {
          id: session.userId,
          username: session.username,
          globalName: session.globalName,
          avatarUrl: session.avatar ? `https://cdn.discordapp.com/avatars/${session.userId}/${session.avatar}.png?size=128` : null
        },
        isOwner: isOwnerSession(session),
        manageableGuilds,
        globalConfig: {
          staffChannelIds: getEffectiveStaffChannelIds(),
          staffUserIds: getEffectiveStaffUserIds()
        }
      });
      return;
    }

    if (url.pathname === '/api/dashboard/config/guild' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const guildId = String(body.guildId || '').trim();
      const newsChannelId = typeof body.newsChannelId === 'string' ? body.newsChannelId.trim() : '';
      const recruitmentChannelId = typeof body.recruitmentChannelId === 'string' ? body.recruitmentChannelId.trim() : '';
      const sessionsCategoryId = typeof body.sessionsCategoryId === 'string' ? body.sessionsCategoryId.trim() : '';
      if (!guildId || !canManageGuild(session, guildId)) {
        sendJson(res, 403, { error: { message: 'Gestion de ce serveur Discord non autorisée.' } });
        return;
      }
      dashboardState.guildConfigs[guildId] = {
        newsChannelId: newsChannelId || '',
        recruitmentChannelId: recruitmentChannelId || '',
        sessionsCategoryId: sessionsCategoryId || '',
        enabled: Boolean(newsChannelId || recruitmentChannelId || sessionsCategoryId)
      };
      saveDashboardState();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/api/dashboard/config/global' && req.method === 'POST') {
      if (!isOwnerSession(session)) {
        sendJson(res, 403, { error: { message: 'Réservé au compte owner Discord.' } });
        return;
      }
      const body = await readJsonBody(req);
      dashboardState.globalConfig = {
        staffChannelIds: Array.isArray(body.staffChannelIds) ? body.staffChannelIds.map(String).map((item) => item.trim()).filter(Boolean) : [],
        staffUserIds: Array.isArray(body.staffUserIds) ? body.staffUserIds.map(String).map((item) => item.trim()).filter(Boolean) : []
      };
      saveDashboardState();
      sendJson(res, 200, { ok: true });
      return;
    }

    const state = buildDashboardState();
    const sessionContext = {
      user: {
        id: session.userId,
        username: session.username,
        globalName: session.globalName
      },
      isOwner: isOwnerSession(session)
    };

    if (url.pathname === '/status.json') {
      sendJson(res, 200, state);
      return;
    }

    sendHtml(res, 200, renderDashboardHtml(state, sessionContext));
  } catch (error) {
    log('serveur web bot erreur', error);
    sendHtml(res, 500, '<h1>Erreur interne</h1><p>Le tableau de bord du bot a rencontré une erreur.</p>');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log(`health server demarre sur le port ${PORT}`);
});

client.login(DISCORD_BOT_TOKEN).catch((error) => {
  log('connexion Discord echouee', error);
  process.exitCode = 1;
});
