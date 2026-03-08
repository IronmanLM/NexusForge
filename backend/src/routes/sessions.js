import { Router } from 'express';
import {
  MESSAGE_CHANNEL_TYPES,
  MESSAGE_KINDS,
  SYSTEM_TYPES,
  SESSION_STATUS,
  applySheetFieldUpdates,
  canUserReadChannel,
  canUserReadMessage,
  canUserWriteToChannel,
  createMessage,
  createSession,
  deleteMessage,
  deleteSession,
  getChannelById,
  getCharacterById,
  getGlobalChannel,
  getMessageById,
  getSessionById,
  getUserRoleInSession,
  isSessionMember,
  joinSessionByCode,
  listChannelsForSession,
  listMessages,
  listSessionsForUser,
  leaveSession,
  mapCharacterToSheetView,
  patchCharacterData,
  setMyCharacterInSession,
  resolveSessionByInvitationCode,
  updateSession
} from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';
import { sendError } from '../utils/errors.js';

const router = Router();

router.use(requireAuth);

function assertSessionMemberOrRespond(req, res) {
  const session = getSessionById(req.params.sessionId);
  if (!session) {
    sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found', { sessionId: req.params.sessionId });
    return null;
  }

  if (!isSessionMember(session, req.auth.user.id)) {
    sendError(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden: not a session member', {
      sessionId: req.params.sessionId
    });
    return null;
  }

  return session;
}

function validateChannelMessagePayload(body) {
  const { channelType, toUserIds, groupId, kind, systemType } = body;

  if (!MESSAGE_CHANNEL_TYPES.includes(channelType)) {
    return { code: 'INVALID_MESSAGE_PAYLOAD', message: 'Invalid channelType' };
  }

  if (!MESSAGE_KINDS.includes(kind ?? 'text')) {
    return { code: 'INVALID_MESSAGE_PAYLOAD', message: 'Invalid kind' };
  }

  if (channelType === 'group' && !groupId) {
    return { code: 'INVALID_MESSAGE_PAYLOAD', message: 'groupId is required for channelType=group' };
  }

  if (channelType === 'direct' && !Array.isArray(toUserIds)) {
    return { code: 'INVALID_MESSAGE_PAYLOAD', message: 'toUserIds is required for channelType=direct' };
  }

  if (channelType !== 'system' && systemType) {
    return { code: 'INVALID_MESSAGE_PAYLOAD', message: 'systemType is only allowed for channelType=system' };
  }

  if (channelType === 'system' && systemType && !SYSTEM_TYPES.includes(systemType)) {
    return { code: 'INVALID_MESSAGE_PAYLOAD', message: 'Invalid systemType' };
  }

  return null;
}

function getSessionCharacterAccess(session, characterId, userId) {
  const role = getUserRoleInSession(session, userId);
  const character = getCharacterById(characterId);
  if (!character) {
    return { error: 'character_not_found' };
  }

  const playerLink = session.players.find((p) => p.characterId === character.id);
  if (!playerLink) {
    return { error: 'character_not_in_session' };
  }

  if (role === 'gm') {
    return { role, character };
  }

  const isOwnCharacter = playerLink.userId === userId;
  if (!isOwnCharacter) {
    return { error: 'forbidden_character' };
  }

  return { role, character };
}

router.get('/', (req, res) => {
  const role = req.query.role?.toString();
  const status = req.query.status?.toString();

  let data = listSessionsForUser(req.auth.user.id);
  if (role) {
    data = data.filter((session) => {
      const resolvedRole = getUserRoleInSession(session, req.auth.user.id);
      return resolvedRole === role;
    });
  }
  if (status) {
    data = data.filter((session) => session.status === status);
  }

  return res.json({ items: data });
});

router.post('/', (req, res) => {
  const { systemId, name } = req.body ?? {};
  if (!systemId || !name) {
    return sendError(res, 400, 'INVALID_SESSION_PAYLOAD', 'systemId and name are required');
  }

  const created = createSession(req.body, req.auth.user.id);
  return res.status(201).json({ session: created });
});

router.post('/join', (req, res) => {
  const code = req.body?.code?.toString();
  if (!code) {
    return sendError(res, 400, 'SESSION_JOIN_CODE_INVALID', 'code is required');
  }

  const resolved = resolveSessionByInvitationCode(code);
  if (!resolved) {
    return sendError(res, 400, 'SESSION_JOIN_CODE_INVALID', 'Invalid or expired code');
  }

  const joinResult = joinSessionByCode(code, req.auth.user.id);
  if (joinResult.error === 'invalid_code') {
    return sendError(res, 400, 'SESSION_JOIN_CODE_INVALID', 'Invalid or expired code');
  }
  if (joinResult.error === 'session_closed') {
    return sendError(res, 403, 'SESSION_JOIN_FORBIDDEN', 'Session is closed');
  }

  return res.json({ session: joinResult.session });
});

router.get('/:sessionId', (req, res) => {
  const session = getSessionById(req.params.sessionId);
  if (!session) {
    return sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found', { sessionId: req.params.sessionId });
  }
  if (!isSessionMember(session, req.auth.user.id)) {
    return sendError(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden: not a session member', {
      sessionId: req.params.sessionId
    });
  }
  return res.json({ session });
});

router.patch('/:sessionId', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const role = getUserRoleInSession(session, req.auth.user.id);
  if (role !== 'gm' && session.ownerUserId !== req.auth.user.id && session.gmUserId !== req.auth.user.id) {
    return sendError(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM can update session');
  }

  const patch = {};
  if (typeof req.body?.name === 'string') {
    patch.name = req.body.name;
  }
  if (typeof req.body?.status === 'string') {
    if (!SESSION_STATUS.includes(req.body.status)) {
      return sendError(res, 400, 'INVALID_SESSION_PAYLOAD', 'Invalid status');
    }
    patch.status = req.body.status;
  }
  if (typeof req.body?.description === 'string') {
    patch.description = req.body.description;
  }
  const updated = updateSession(req.params.sessionId, patch);
  if (!updated) {
    return sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found', { sessionId: req.params.sessionId });
  }
  return res.json({ session: updated });
});

router.delete('/:sessionId', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const role = getUserRoleInSession(session, req.auth.user.id);
  if (role !== 'gm' && session.ownerUserId !== req.auth.user.id && session.gmUserId !== req.auth.user.id) {
    return sendError(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Only GM can delete session');
  }

  const removed = deleteSession(req.params.sessionId);
  if (!removed) {
    return sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found', { sessionId: req.params.sessionId });
  }
  return res.status(204).send();
});

router.get('/:sessionId/channels', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const channels = listChannelsForSession(session.id).filter((channel) =>
    canUserReadChannel(session, channel, req.auth.user.id)
  );
  return res.json({ items: channels });
});

router.put('/:sessionId/me', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const characterId = req.body?.characterId ?? null;
  const updated = setMyCharacterInSession(session, req.auth.user.id, characterId);
  if (!updated) {
    return sendError(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden: not a member');
  }
  return res.json({ session: updated });
});

router.post('/:sessionId/leave', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const result = leaveSession(session, req.auth.user.id);
  if (result.error === 'gm_cannot_leave') {
    return sendError(res, 403, 'SESSION_LEAVE_FORBIDDEN', 'GM/owner cannot leave this session');
  }
  if (result.error === 'not_member') {
    return sendError(res, 403, 'SESSION_ACCESS_FORBIDDEN', 'Forbidden: not a member');
  }
  return res.status(204).send();
});

router.get('/:sessionId/characters/:characterId/sheet', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const access = getSessionCharacterAccess(session, req.params.characterId, req.auth.user.id);
  if (access.error === 'character_not_found') {
    return sendError(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found', { characterId: req.params.characterId });
  }
  if (access.error === 'character_not_in_session') {
    return sendError(res, 404, 'CHARACTER_NOT_IN_SESSION', 'Character not linked to session');
  }
  if (access.error === 'forbidden_character') {
    return sendError(res, 403, 'CHARACTER_ACCESS_FORBIDDEN', 'Forbidden character');
  }

  const sheet = mapCharacterToSheetView(access.character);
  return res.json({ sheet });
});

router.patch('/:sessionId/characters/:characterId', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const access = getSessionCharacterAccess(session, req.params.characterId, req.auth.user.id);
  if (access.error === 'character_not_found') {
    return sendError(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found', { characterId: req.params.characterId });
  }
  if (access.error === 'character_not_in_session') {
    return sendError(res, 404, 'CHARACTER_NOT_IN_SESSION', 'Character not linked to session');
  }
  if (access.error === 'forbidden_character') {
    return sendError(res, 403, 'CHARACTER_ACCESS_FORBIDDEN', 'Forbidden character');
  }
  if (access.role !== 'gm') {
    return sendError(res, 403, 'CHARACTER_ACCESS_FORBIDDEN', 'Only GM can patch character data directly');
  }

  const dataPatch = req.body?.dataPatch;
  if (!dataPatch || typeof dataPatch !== 'object' || Array.isArray(dataPatch)) {
    return sendError(res, 400, 'INVALID_CHARACTER_PATCH_PAYLOAD', 'dataPatch object is required');
  }

  const updated = patchCharacterData(access.character.id, dataPatch);
  if (!updated) {
    return sendError(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found', { characterId: req.params.characterId });
  }
  const sheet = mapCharacterToSheetView(updated);
  return res.json({ sheet });
});

router.patch('/:sessionId/characters/:characterId/sheet', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const access = getSessionCharacterAccess(session, req.params.characterId, req.auth.user.id);
  if (access.error === 'character_not_found') {
    return sendError(res, 404, 'CHARACTER_NOT_FOUND', 'Character not found', { characterId: req.params.characterId });
  }
  if (access.error === 'character_not_in_session') {
    return sendError(res, 404, 'CHARACTER_NOT_IN_SESSION', 'Character not linked to session');
  }
  if (access.error === 'forbidden_character') {
    return sendError(res, 403, 'CHARACTER_ACCESS_FORBIDDEN', 'Forbidden character');
  }

  const fields = req.body?.fields;
  if (!Array.isArray(fields)) {
    return sendError(res, 400, 'INVALID_CHARACTER_PATCH_PAYLOAD', 'fields must be an array');
  }

  const result = applySheetFieldUpdates(access.character, fields, { role: access.role });
  if (result.error === 'unsupported_system') {
    return sendError(res, 400, 'INVALID_CHARACTER_PATCH_PAYLOAD', 'Sheet patch unsupported for this system');
  }
  if (result.error === 'forbidden_fields') {
    return sendError(res, 403, 'CHARACTER_ACCESS_FORBIDDEN', 'Forbidden fields for current role', {
      forbiddenFieldIds: result.forbiddenFieldIds
    });
  }

  const sheet = mapCharacterToSheetView(result.character);
  return res.json({ sheet });
});

router.get('/:sessionId/messages', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const channelIdParam = req.query.channelId?.toString();
  const before = req.query.before?.toString();
  const after = req.query.after?.toString();
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  let channelId = channelIdParam;
  if (!channelId) {
    const globalChannel = getGlobalChannel(session.id);
    if (!globalChannel) {
      return sendError(res, 404, 'CHANNEL_NOT_FOUND', 'Global channel not found');
    }
    channelId = globalChannel.id;
  }

  const channel = getChannelById(channelId);
  if (!channel || channel.sessionId !== session.id) {
    return sendError(res, 404, 'CHANNEL_NOT_FOUND', 'Channel not found', { channelId });
  }

  if (!canUserReadChannel(session, channel, req.auth.user.id)) {
    return sendError(res, 403, 'CHANNEL_ACCESS_FORBIDDEN', 'Forbidden channel', { channelId });
  }

  const result = listMessages({ sessionId: session.id, channelId, before, after, limit });
  const filteredItems = result.items.filter((message) => canUserReadMessage(session, message, req.auth.user.id));
  return res.json({ items: filteredItems, nextCursor: result.nextCursor });
});

router.post('/:sessionId/messages', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const {
    channelId: requestChannelId,
    channelType,
    toUserIds,
    groupId,
    content,
    kind,
    isPrivateToGM,
    systemType,
    roll
  } = req.body ?? {};

  if (!content && kind !== 'roll') {
    return sendError(res, 400, 'INVALID_MESSAGE_PAYLOAD', 'content is required for non-roll messages');
  }

  const coherenceError = validateChannelMessagePayload({
    channelType,
    toUserIds,
    groupId,
    kind,
    systemType
  });
  if (coherenceError) {
    return sendError(res, 400, coherenceError.code, coherenceError.message);
  }

  if (channelType === 'system') {
    const role = getUserRoleInSession(session, req.auth.user.id);
    if (role !== 'gm') {
      return sendError(res, 403, 'CHANNEL_ACCESS_FORBIDDEN', 'Only GM can post system messages');
    }

    const globalChannel = getGlobalChannel(session.id);
    if (!globalChannel) {
      return sendError(res, 404, 'CHANNEL_NOT_FOUND', 'Global channel not found');
    }

    const message = createMessage({
      sessionId: session.id,
      channelId: globalChannel.id,
      channelType: 'system',
      fromUserId: req.auth.user.id,
      content: String(content ?? ''),
      kind: kind ?? 'text',
      systemType,
      isPrivateToGM: false,
      toUserIds: undefined,
      groupId: undefined
    });

    req.app.locals.broadcastMessageCreated?.(session, message);
    return res.status(201).json({ message });
  }

  const channel = requestChannelId ? getChannelById(requestChannelId) : getGlobalChannel(session.id);
  if (!channel || channel.sessionId !== session.id) {
    return sendError(res, 404, 'CHANNEL_NOT_FOUND', 'Channel not found', { channelId: requestChannelId ?? null });
  }

  if (channel.kind !== channelType) {
    return sendError(res, 400, 'INVALID_MESSAGE_PAYLOAD', 'channelId and channelType are inconsistent');
  }

  if (!canUserWriteToChannel(session, channel, req.auth.user.id)) {
    return sendError(res, 403, 'CHANNEL_ACCESS_FORBIDDEN', 'Forbidden channel', { channelId: channel.id });
  }

  const role = getUserRoleInSession(session, req.auth.user.id);
  const gmUserId = session.gmUserId;
  const isWhisper = Boolean(isPrivateToGM);

  let resolvedToUserIds = channelType === 'direct' ? [...new Set(toUserIds ?? [])] : undefined;
  if (channelType === 'direct' && resolvedToUserIds.length === 0) {
    return sendError(res, 400, 'INVALID_MESSAGE_PAYLOAD', 'toUserIds must not be empty for direct channelType');
  }

  if (channelType === 'group' && groupId !== channel.id) {
    return sendError(res, 400, 'INVALID_MESSAGE_PAYLOAD', 'groupId must match target group channel id');
  }

  if (channelType === 'direct' && role !== 'gm') {
    const isParticipant = resolvedToUserIds.includes(req.auth.user.id) || channel.memberUserIds.includes(req.auth.user.id);
    if (!isParticipant) {
      return sendError(res, 403, 'CHANNEL_ACCESS_FORBIDDEN', 'Forbidden direct participants');
    }
  }

  if (isWhisper) {
    if (!session.gmUserId) {
      return sendError(res, 400, 'INVALID_MESSAGE_PAYLOAD', 'No GM available in session for private whisper');
    }
    resolvedToUserIds = [...new Set([...(resolvedToUserIds ?? []), gmUserId])];
  }

  const message = createMessage({
    sessionId: session.id,
    channelId: channel.id,
    channelType,
    fromUserId: req.auth.user.id,
    toUserIds: resolvedToUserIds,
    groupId: channelType === 'group' ? groupId : undefined,
    content: String(content ?? ''),
    kind: kind ?? 'text',
    roll: kind === 'roll' ? roll : undefined,
    isPrivateToGM: isWhisper,
    systemType: undefined
  });

  req.app.locals.broadcastMessageCreated?.(session, message);
  return res.status(201).json({ message });
});

router.delete('/:sessionId/messages/:messageId', (req, res) => {
  const session = assertSessionMemberOrRespond(req, res);
  if (!session) return;

  const message = getMessageById(session.id, req.params.messageId);
  if (!message) {
    return sendError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found', { messageId: req.params.messageId });
  }

  const role = getUserRoleInSession(session, req.auth.user.id);
  const canDelete = role === 'gm' || message.fromUserId === req.auth.user.id;
  if (!canDelete) {
    return sendError(res, 403, 'CHANNEL_ACCESS_FORBIDDEN', 'Forbidden: cannot delete this message');
  }

  const removed = deleteMessage(session.id, message.id);
  if (!removed) {
    return sendError(res, 404, 'MESSAGE_NOT_FOUND', 'Message not found', { messageId: req.params.messageId });
  }
  return res.status(204).send();
});

export default router;
