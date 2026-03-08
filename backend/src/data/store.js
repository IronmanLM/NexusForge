import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';

const now = () => new Date().toISOString();

const users = [
  {
    id: 'user-gm-1',
    email: 'gm@nexusforge.local',
    displayName: 'MJ Mock',
    roles: ['gm'],
    createdAt: now()
  },
  {
    id: 'user-player-1',
    email: 'player1@nexusforge.local',
    displayName: 'Joueur Mock',
    roles: ['player'],
    createdAt: now()
  },
  {
    id: 'user-player-2',
    email: 'player2@nexusforge.local',
    displayName: 'Joueur 2',
    roles: ['player'],
    createdAt: now()
  }
];
const userPasswords = new Map([
  ['gm@nexusforge.local', 'demo'],
  ['player1@nexusforge.local', 'demo'],
  ['player2@nexusforge.local', 'demo']
]);

const sessions = [
  {
    id: 'session-1',
    name: 'Campagne SteamShadows du mardi',
    systemId: 'steamshadows',
    ownerUserId: 'user-gm-1',
    description: 'Session demo backend',
    gmUserId: 'user-gm-1',
    status: 'active',
    players: [
      { userId: 'user-gm-1', characterId: null, role: 'gm' },
      { userId: 'user-player-1', characterId: 'char_42', role: 'player' },
      { userId: 'user-player-2', characterId: 'char_43', role: 'player' }
    ],
    invitationCode: 'ABCD1234',
    createdAt: now(),
    updatedAt: now()
  }
];

const characters = [
  {
    id: 'char_42',
    userId: 'user-player-1',
    systemId: 'steamshadows',
    name: 'Elias Crow',
    portraitUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80',
    createdAt: now(),
    updatedAt: now(),
    data: {
      secondary: {
        pv: { current: 18, max: 24 },
        equilibre: { current: 7, max: 10 },
        fortune: { current: 2, max: 5 },
        argent: 120,
        influence: 3,
        experience: 14
      },
      steamDice: [
        { label: 'De vapeur A', isUsed: false },
        { label: 'De vapeur B', isUsed: true }
      ],
      competences: ['Infiltration', 'Persuasion', 'Pilotage'],
      talents: [
        { name: 'Nerfs d acier', level: 2 },
        { name: 'Tir reflexe', level: 1 }
      ]
    }
  },
  {
    id: 'char_43',
    userId: 'user-player-2',
    systemId: 'steamshadows',
    name: 'Mira Black',
    portraitUrl: null,
    createdAt: now(),
    updatedAt: now(),
    data: {
      secondary: {
        pv: { current: 16, max: 20 },
        equilibre: { current: 8, max: 10 },
        fortune: { current: 1, max: 5 },
        argent: 80,
        influence: 2,
        experience: 6
      },
      steamDice: [{ label: 'De vapeur C', isUsed: false }],
      competences: ['Medecine', 'Mecanique'],
      talents: [{ name: 'Precision clinique', level: 1 }]
    }
  }
];

const channels = [
  {
    id: 'session-1-channel-global',
    kind: 'global',
    title: 'Global',
    sessionId: 'session-1',
    memberUserIds: ['user-gm-1', 'user-player-1', 'user-player-2']
  },
  {
    id: 'session-1-channel-direct-gm-player-1',
    kind: 'direct',
    title: 'MP - MJ / Joueur 1',
    sessionId: 'session-1',
    memberUserIds: ['user-gm-1', 'user-player-1']
  },
  {
    id: 'session-1-channel-direct-player-1-player-2',
    kind: 'direct',
    title: 'MP - Joueur 1 / Joueur 2',
    sessionId: 'session-1',
    memberUserIds: ['user-player-1', 'user-player-2']
  },
  {
    id: 'session-1-channel-group-a',
    kind: 'group',
    title: 'Groupe A',
    sessionId: 'session-1',
    memberUserIds: ['user-gm-1', 'user-player-1']
  }
];

const messages = [
  {
    id: 'session-1-message-1',
    sessionId: 'session-1',
    channelId: 'session-1-channel-global',
    channelType: 'global',
    fromUserId: 'user-gm-1',
    content: 'Bienvenue a la table.',
    kind: 'text',
    isPrivateToGM: false,
    createdAt: now()
  }
];

const refreshTokens = new Map();
const revokedAccessTokens = new Set();

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret_change_me';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me';
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

export const MESSAGE_CHANNEL_TYPES = ['global', 'group', 'direct', 'system'];
export const MESSAGE_KINDS = ['text', 'roll', 'document', 'mixed'];
export const SYSTEM_TYPES = ['turn', 'round', 'combat_start', 'combat_end'];
export const SESSION_STATUS = ['draft', 'active', 'finished', 'archived'];
export const SHEET_FIELD_TYPES = ['number', 'text', 'resource', 'tag'];

const invitationCodeToSessionId = new Map(sessions.map((session) => [session.invitationCode, session.id]));

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    createdAt: user.createdAt
  };
}

export function findUserByEmail(email) {
  return users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null;
}

export function findUserById(userId) {
  return users.find((u) => u.id === userId) ?? null;
}

export function createUserFromEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const isGm = normalizedEmail.includes('gm');
  const user = {
    id: `user-${uuid()}`,
    email: normalizedEmail,
    displayName: isGm ? 'MJ Mock' : 'Joueur Mock',
    roles: [isGm ? 'gm' : 'player'],
    createdAt: now()
  };
  users.push(user);
  userPasswords.set(normalizedEmail, 'demo');
  return user;
}

export function createUserWithPassword(input) {
  const email = input.email.trim().toLowerCase();
  const user = {
    id: `user-${uuid()}`,
    email,
    displayName: input.displayName?.trim() || email.split('@')[0],
    roles: ['player'],
    createdAt: now()
  };
  users.push(user);
  userPasswords.set(email, input.password);
  return user;
}

export function verifyUserPassword(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  return userPasswords.get(normalizedEmail) === password;
}

export function createAuthTokensForUser(userId) {
  const user = findUserById(userId);
  if (!user) return null;

  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      type: 'access'
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );

  const refreshJti = uuid();
  const refreshToken = jwt.sign(
    {
      sub: user.id,
      jti: refreshJti,
      type: 'refresh'
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );

  refreshTokens.set(refreshJti, user.id);
  return { token, refreshToken };
}

export function getUserIdByAccessToken(token) {
  const result = verifyAccessToken(token);
  return result.valid ? result.userId : null;
}

export function verifyAccessToken(token) {
  if (revokedAccessTokens.has(token)) {
    return { valid: false, reason: 'revoked' };
  }
  try {
    const payload = jwt.verify(token, ACCESS_TOKEN_SECRET);
    if (!payload || payload.type !== 'access' || typeof payload.sub !== 'string') {
      return { valid: false, reason: 'invalid' };
    }
    return {
      valid: true,
      userId: payload.sub,
      payload
    };
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return { valid: false, reason: 'expired' };
    }
    return { valid: false, reason: 'invalid' };
  }
}

export function revokeAccessToken(token) {
  revokedAccessTokens.add(token);
}

export function rotateRefreshToken(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    if (!payload || payload.type !== 'refresh' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      return null;
    }
    const ownerUserId = refreshTokens.get(payload.jti);
    if (!ownerUserId || ownerUserId !== payload.sub) return null;

    refreshTokens.delete(payload.jti);
    return createAuthTokensForUser(payload.sub);
  } catch {
    return null;
  }
}

export function revokeRefreshToken(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    if (payload && typeof payload.jti === 'string') {
      refreshTokens.delete(payload.jti);
    }
  } catch {
    // ignore invalid token at logout
  }
}

export function listSessionsForUser(userId) {
  return sessions.filter((s) => isSessionMember(s, userId));
}

export function getSessionById(sessionId) {
  return sessions.find((s) => s.id === sessionId) ?? null;
}

export function createSession(input, creatorId) {
  const session = {
    id: input.id ?? `session-${uuid()}`,
    name: input.name,
    systemId: input.systemId,
    ownerUserId: creatorId,
    gmUserId: creatorId,
    status: 'draft',
    campaignId: input.campaignId ?? null,
    description: input.description ?? '',
    players: [{ userId: creatorId, characterId: null, role: 'gm' }],
    invitationCode: createInvitationCode(),
    createdAt: now(),
    updatedAt: now()
  };
  sessions.push(session);
  invitationCodeToSessionId.set(session.invitationCode, session.id);

  channels.push({
    id: `${session.id}-channel-global`,
    kind: 'global',
    title: 'Global',
    sessionId: session.id,
    memberUserIds: session.players.map((p) => p.userId)
  });

  return session;
}

export function updateSession(sessionId, patch) {
  const session = getSessionById(sessionId);
  if (!session) return null;
  Object.assign(session, patch, { updatedAt: now() });
  return session;
}

export function deleteSession(sessionId) {
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return false;
  sessions.splice(idx, 1);
  for (const [code, codeSessionId] of invitationCodeToSessionId.entries()) {
    if (codeSessionId === sessionId) {
      invitationCodeToSessionId.delete(code);
    }
  }

  for (let i = channels.length - 1; i >= 0; i -= 1) {
    if (channels[i].sessionId === sessionId) channels.splice(i, 1);
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sessionId === sessionId) messages.splice(i, 1);
  }
  return true;
}

export function listCharactersForUser(userId, filters = {}) {
  const { systemId } = filters;
  return characters.filter((character) => {
    if (character.userId !== userId) return false;
    if (systemId && character.systemId !== systemId) return false;
    return true;
  });
}

export function getCharacterById(characterId) {
  return characters.find((character) => character.id === characterId) ?? null;
}

export function createCharacter(input, userId) {
  const character = {
    id: input.id ?? `char_${uuid()}`,
    userId,
    systemId: input.systemId,
    name: input.name,
    portraitUrl: input.portraitUrl ?? null,
    createdAt: now(),
    updatedAt: now(),
    data: input.data ?? {}
  };
  characters.push(character);
  return character;
}

export function updateCharacter(characterId, patch) {
  const character = getCharacterById(characterId);
  if (!character) return null;

  if (typeof patch.name === 'string') character.name = patch.name;
  if (patch.portraitUrl !== undefined) character.portraitUrl = patch.portraitUrl;
  if (patch.data !== undefined) character.data = patch.data;
  character.updatedAt = now();
  return character;
}

export function patchCharacterData(characterId, dataPatch) {
  const character = getCharacterById(characterId);
  if (!character) return null;

  const target = { ...character.data };
  for (const [path, value] of Object.entries(dataPatch)) {
    setByPath(target, path, value);
  }
  character.data = target;
  character.updatedAt = now();
  return character;
}

export function deleteCharacter(characterId) {
  const idx = characters.findIndex((character) => character.id === characterId);
  if (idx === -1) return false;
  characters.splice(idx, 1);

  for (const session of sessions) {
    for (const player of session.players) {
      if (player.characterId === characterId) {
        player.characterId = null;
      }
    }
  }
  return true;
}

export function isUserGmForCharacterInAnySession(userId, characterId) {
  return sessions.some(
    (session) =>
      (session.ownerUserId === userId || session.gmUserId === userId) &&
      session.players.some((player) => player.characterId === characterId)
  );
}

export function canUserReadCharacter(userId, character) {
  if (!character) return false;
  if (character.userId === userId) return true;
  return isUserGmForCharacterInAnySession(userId, character.id);
}

export function canUserWriteCharacter(userId, character) {
  if (!character) return false;
  if (character.userId === userId) return true;
  if (character.userId == null) {
    return isUserGmForCharacterInAnySession(userId, character.id);
  }
  return false;
}

export function mapCharacterToSheetView(character) {
  if (character.systemId === 'steamshadows') {
    return mapSteamShadowsCharacterToSheetView(character);
  }

  return {
    id: character.id,
    name: character.name,
    portraitUrl: character.portraitUrl ?? undefined,
    groups: [{ id: 'default', label: 'General', layout: 'list' }],
    fields: [
      {
        id: 'system_id',
        label: 'System',
        type: 'text',
        value: character.systemId,
        groupId: 'default'
      }
    ],
    actions: []
  };
}

export function applySheetFieldUpdates(character, fields, options = {}) {
  if (character.systemId !== 'steamshadows') {
    return { error: 'unsupported_system' };
  }
  const role = options.role ?? 'player';

  const mapping = {
    pv: 'secondary.pv.current',
    pv_max: 'secondary.pv.max',
    equilibre: 'secondary.equilibre.current',
    equilibre_max: 'secondary.equilibre.max',
    fortune: 'secondary.fortune.current',
    fortune_max: 'secondary.fortune.max',
    argent: 'secondary.argent',
    influence: 'secondary.influence',
    experience: 'secondary.experience'
  };
  const playerEditableFields = new Set(['pv', 'equilibre', 'fortune']);

  const target = { ...character.data };
  const forbiddenFieldIds = [];
  for (const field of fields) {
    if (!field?.id) continue;
    if (role !== 'gm' && !playerEditableFields.has(field.id)) {
      forbiddenFieldIds.push(field.id);
      continue;
    }
    const path = mapping[field.id];
    if (!path) continue;
    setByPath(target, path, field.value);
  }

  if (forbiddenFieldIds.length > 0) {
    return { error: 'forbidden_fields', forbiddenFieldIds };
  }

  character.data = target;
  character.updatedAt = now();
  return { character };
}

export function isSessionMember(session, userId) {
  return session.ownerUserId === userId || session.players.some((p) => p.userId === userId);
}

export function getUserRoleInSession(session, userId) {
  if (session.ownerUserId === userId || session.gmUserId === userId) return 'gm';
  const participant = session.players.find((p) => p.userId === userId);
  return participant?.role ?? null;
}

export function listChannelsForSession(sessionId) {
  return channels.filter((c) => c.sessionId === sessionId);
}

export function getGlobalChannel(sessionId) {
  return channels.find((c) => c.sessionId === sessionId && c.kind === 'global') ?? null;
}

export function getChannelById(channelId) {
  return channels.find((c) => c.id === channelId) ?? null;
}

export function canUserReadChannel(session, channel, userId) {
  const role = getUserRoleInSession(session, userId);
  if (!role) return false;
  if (role === 'gm') return true;
  return channel.memberUserIds.includes(userId);
}

export function canUserWriteToChannel(session, channel, userId) {
  const role = getUserRoleInSession(session, userId);
  if (!role) return false;
  if (channel.kind === 'global') return true;
  if (role === 'gm') return true;
  return channel.memberUserIds.includes(userId);
}

export function resolveSessionByInvitationCode(code) {
  const sessionId = invitationCodeToSessionId.get(code);
  if (!sessionId) return null;
  return getSessionById(sessionId);
}

export function joinSessionByCode(code, userId) {
  const session = resolveSessionByInvitationCode(code);
  if (!session) return { error: 'invalid_code' };
  if (session.status === 'finished' || session.status === 'archived') return { error: 'session_closed' };

  const already = session.players.find((p) => p.userId === userId);
  if (!already) {
    session.players.push({ userId, characterId: null, role: 'player' });
    session.updatedAt = now();
    const sessionChannels = listChannelsForSession(session.id);
    for (const channel of sessionChannels) {
      if (channel.kind === 'global' && !channel.memberUserIds.includes(userId)) {
        channel.memberUserIds.push(userId);
      }
    }
  }

  return { session };
}

export function setMyCharacterInSession(session, userId, characterId) {
  const participant = session.players.find((p) => p.userId === userId);
  if (!participant) return null;
  participant.characterId = characterId ?? null;
  session.updatedAt = now();
  return session;
}

export function leaveSession(session, userId) {
  const participant = session.players.find((p) => p.userId === userId);
  if (!participant) return { error: 'not_member' };
  if (session.ownerUserId === userId || session.gmUserId === userId || participant.role === 'gm') {
    return { error: 'gm_cannot_leave' };
  }

  session.players = session.players.filter((p) => p.userId !== userId);
  session.updatedAt = now();

  const sessionChannels = listChannelsForSession(session.id);
  for (const channel of sessionChannels) {
    channel.memberUserIds = channel.memberUserIds.filter((memberId) => memberId !== userId);
  }

  return { session };
}

export function canUserReadMessage(session, message, userId) {
  const role = getUserRoleInSession(session, userId);
  if (!role) return false;

  if (role === 'gm') {
    if (message.isPrivateToGM) {
      return true;
    }
    return true;
  }

  if (message.isPrivateToGM) {
    return message.fromUserId === userId;
  }

  if (message.channelType === 'global' || message.channelType === 'system') {
    return true;
  }

  if (message.channelType === 'group') {
    const channel = getChannelById(message.channelId);
    if (!channel) return false;
    return channel.memberUserIds.includes(userId);
  }

  if (message.channelType === 'direct') {
    if (message.fromUserId === userId) return true;
    return (message.toUserIds ?? []).includes(userId);
  }

  return false;
}

export function listMessages(params) {
  const { sessionId, channelId, before, after, limit = 50 } = params;
  let filtered = messages.filter((m) => m.sessionId === sessionId);

  if (channelId) {
    filtered = filtered.filter((m) => m.channelId === channelId);
  }

  if (before) {
    const beforeTs = new Date(before).getTime();
    filtered = filtered.filter((m) => new Date(m.createdAt).getTime() < beforeTs);
  }

  if (after) {
    const afterTs = new Date(after).getTime();
    filtered = filtered.filter((m) => new Date(m.createdAt).getTime() > afterTs);
  }

  filtered = filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(1, Number(limit)), 200) : 50;
  const items = filtered.slice(-normalizedLimit);
  const nextCursor = items.length === normalizedLimit ? items[0]?.createdAt ?? null : null;
  return { items, nextCursor };
}

export function createMessage(input) {
  const message = {
    id: input.id ?? `msg_${uuid()}`,
    sessionId: input.sessionId,
    channelId: input.channelId,
    channelType: input.channelType,
    fromUserId: input.fromUserId,
    toUserIds: input.toUserIds,
    groupId: input.groupId,
    content: input.content,
    kind: input.kind ?? 'text',
    roll: input.roll,
    isPrivateToGM: Boolean(input.isPrivateToGM),
    systemType: input.systemType,
    createdAt: now()
  };

  messages.push(message);
  return message;
}

export function getMessageById(sessionId, messageId) {
  return messages.find((m) => m.sessionId === sessionId && m.id === messageId) ?? null;
}

export function deleteMessage(sessionId, messageId) {
  const idx = messages.findIndex((m) => m.sessionId === sessionId && m.id === messageId);
  if (idx === -1) return false;
  messages.splice(idx, 1);
  return true;
}

function createInvitationCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (invitationCodeToSessionId.has(code)) {
    return createInvitationCode();
  }
  return code;
}

function mapSteamShadowsCharacterToSheetView(character) {
  const secondary = character.data?.secondary ?? {};
  const steamDice = Array.isArray(character.data?.steamDice) ? character.data.steamDice : [];
  const competences = Array.isArray(character.data?.competences) ? character.data.competences : [];
  const talents = Array.isArray(character.data?.talents) ? character.data.talents : [];

  const groups = [
    { id: 'valeurs_secondaires', label: 'Valeurs secondaires', layout: 'grid' },
    { id: 'reserve_des', label: 'Reserve de des', layout: 'list' },
    { id: 'competences_selectionnees', label: 'Competences selectionnees', layout: 'list' },
    { id: 'talents_selectionnes', label: 'Talents selectionnes', layout: 'list' }
  ];

  const fields = [
    {
      id: 'pv',
      label: 'Points de vie',
      type: 'resource',
      value: Number(secondary?.pv?.current ?? 0),
      max: Number(secondary?.pv?.max ?? 0),
      groupId: 'valeurs_secondaires',
      isPrimary: true
    },
    {
      id: 'equilibre',
      label: 'Equilibre mental',
      type: 'resource',
      value: Number(secondary?.equilibre?.current ?? 0),
      max: Number(secondary?.equilibre?.max ?? 0),
      groupId: 'valeurs_secondaires',
      isPrimary: true
    },
    {
      id: 'fortune',
      label: 'Fortune',
      type: 'resource',
      value: Number(secondary?.fortune?.current ?? 0),
      max: Number(secondary?.fortune?.max ?? 0),
      groupId: 'valeurs_secondaires',
      isPrimary: true
    },
    {
      id: 'argent',
      label: 'Argent',
      type: 'number',
      value: Number(secondary?.argent ?? 0),
      groupId: 'valeurs_secondaires'
    },
    {
      id: 'influence',
      label: 'Influence',
      type: 'number',
      value: Number(secondary?.influence ?? 0),
      groupId: 'valeurs_secondaires'
    },
    {
      id: 'experience',
      label: 'Experience',
      type: 'number',
      value: Number(secondary?.experience ?? 0),
      groupId: 'valeurs_secondaires'
    }
  ];

  steamDice.forEach((die, index) => {
    fields.push({
      id: `steam_die_${index + 1}`,
      label: die.label ?? `De vapeur ${index + 1}`,
      type: 'tag',
      value: die.isUsed ? 'Utilise' : 'Disponible',
      groupId: 'reserve_des'
    });
  });

  competences.forEach((skill, index) => {
    fields.push({
      id: `competence_${index + 1}`,
      label: String(skill),
      type: 'tag',
      value: String(skill),
      groupId: 'competences_selectionnees'
    });
  });

  talents.forEach((talent, index) => {
    const label = talent?.name ?? `Talent ${index + 1}`;
    const value = talent?.level ? `${label} (Niv. ${talent.level})` : label;
    fields.push({
      id: `talent_${index + 1}`,
      label,
      type: 'text',
      value,
      groupId: 'talents_selectionnes'
    });
  });

  return {
    id: character.id,
    name: character.name,
    portraitUrl: character.portraitUrl ?? undefined,
    groups,
    fields,
    actions: [
      {
        id: 'attaque_corps_a_corps',
        label: 'Attaque CaC',
        description: "Jet d'attaque au corps a corps",
        rollFormula: '1d20+5'
      },
      {
        id: 'test_sang_froid',
        label: 'Test de Sang-froid',
        description: 'Resister a la panique',
        rollFormula: '1d20+4'
      }
    ]
  };
}

function setByPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (typeof cursor[key] !== 'object' || cursor[key] == null) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}
