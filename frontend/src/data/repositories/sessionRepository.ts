import { db, ensureDatabaseIsInitialized } from '../db';
import { Session, SessionInitiativeState, SessionRuntimeConnection } from '../../types/session';
import { localActionRepository } from './localActionRepository';
import { ApiError, isBackendEnabled, requestJson } from '../../services/apiClient';

function normalizeSessionState(state: string | undefined): Session['state'] {
  if (state === 'planned' || state === 'running' || state === 'paused' || state === 'finished') {
    return state;
  }
  return 'planned';
}

function mapApiSession(raw: Record<string, unknown>): Session {
  return {
    id: String(raw.id ?? ''),
    systemId: String(raw.systemId ?? ''),
    name: String(raw.name ?? ''),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    ownerUserId: typeof raw.ownerUserId === 'string' ? raw.ownerUserId : undefined,
    gmUserId: String(raw.gmUserId ?? raw.ownerUserId ?? ''),
    gmUserIds: Array.isArray(raw.gmUserIds) ? raw.gmUserIds.filter((item): item is string => typeof item === 'string') : undefined,
    archivedAt: typeof raw.archivedAt === 'string' ? raw.archivedAt : raw.archivedAt === null ? null : undefined,
    state: normalizeSessionState(typeof raw.state === 'string' ? raw.state : typeof raw.status === 'string' ? raw.status : undefined),
    settings: (raw.settings as Session['settings']) ?? undefined,
    participants: (raw.players as Session['participants']) ?? (raw.participants as Session['participants']) ?? [],
    invitations: (raw.invitations as Session['invitations']) ?? [],
    activityLog: (raw.activityLog as Session['activityLog']) ?? [],
    initiative: (raw.initiative as SessionInitiativeState) ?? undefined,
    screenTemplateAssignments: (raw.screenTemplateAssignments as Session['screenTemplateAssignments']) ?? undefined,
    screenTemplateSelections: (raw.screenTemplateSelections as Session['screenTemplateSelections']) ?? undefined,
    discordIntegration: (raw.discordIntegration as Session['discordIntegration']) ?? undefined,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString())
  };
}

export const sessionRepository = {
  async listDiscordMutualGuilds(): Promise<Array<{ id: string; name: string }>> {
    const payload = await requestJson<{ items?: Array<{ id?: unknown; name?: unknown }> }>({
      path: '/api/auth/discord/mutual-guilds',
      method: 'GET',
      withAuth: true
    });
    return (payload.items ?? [])
      .filter((item): item is { id: string; name: string } => typeof item?.id === 'string' && typeof item?.name === 'string');
  },

  async list(params?: { includeArchived?: boolean }): Promise<Session[]> {
    await ensureDatabaseIsInitialized();
    const includeArchived = Boolean(params?.includeArchived);
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ items?: Record<string, unknown>[] }>({
          path: includeArchived ? '/api/sessions?includeArchived=true' : '/api/sessions',
          method: 'GET',
          withAuth: true
        });
        const sessions = (payload.items ?? []).map(mapApiSession);
        await db.transaction('rw', db.sessions, async () => {
          await db.sessions.clear();
          if (sessions.length > 0) {
            await db.sessions.bulkPut(sessions);
          }
        });
      } catch {
        // fallback local cache
      }
    }
    const all = await db.sessions.orderBy('updatedAt').reverse().toArray();
    if (includeArchived) {
      return all;
    }
    return all.filter((session) => !session.archivedAt);
  },

  async getById(sessionId: string): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ session?: Record<string, unknown> }>({
          path: `/api/sessions/${sessionId}`,
          method: 'GET',
          withAuth: true
        });
        if (payload.session) {
          const mapped = mapApiSession(payload.session);
          await db.sessions.put(mapped);
        }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          await db.sessions.delete(sessionId);
          return null;
        }
        // fallback local cache
      }
    }
    const session = await db.sessions.get(sessionId);
    return session ?? null;
  },

  async upsert(session: Session): Promise<void> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        await requestJson<{ session?: Record<string, unknown> }>({
          path: `/api/sessions/${session.id}`,
          method: 'PATCH',
          withAuth: true,
          body: {
            name: session.name,
            description: session.description,
            state: session.state,
            systemId: session.systemId,
            ownerUserId: session.ownerUserId,
            gmUserIds: session.gmUserIds,
            settings: session.settings,
            participants: session.participants,
            invitations: session.invitations,
            activityLog: session.activityLog,
            screenTemplateAssignments: session.screenTemplateAssignments,
            screenTemplateSelections: session.screenTemplateSelections,
            discordIntegration: session.discordIntegration ?? null,
            archivedAt: session.archivedAt ?? null
          }
        });
      } catch {
        // fallback local queue
      }
    }
    await db.sessions.put(session);
    await localActionRepository.enqueue({
      entityType: 'session',
      entityId: session.id,
      actionType: 'update',
      payload: { ...session }
    });
  },

  async updateRuntimePresence(params: {
    sessionId: string;
    active: boolean;
    templateId?: string | null;
    setId?: string | null;
    detachedScreenId?: string | null;
    role?: 'gm' | 'player' | null;
  }): Promise<Session | null> {
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${params.sessionId}/runtime/presence`,
      method: 'POST',
      withAuth: true,
      body: params
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  },

  async readRuntimeTargetState(params: { sessionId: string; templateId: string; targetId: string }): Promise<unknown> {
    const payload = await requestJson<{ state?: unknown }>({
      path: `/api/sessions/${params.sessionId}/runtime-targets/${params.targetId}?templateId=${encodeURIComponent(params.templateId)}`,
      method: 'GET',
      withAuth: true
    });
    return payload.state ?? null;
  },

  async listRuntimeConnections(sessionId: string): Promise<SessionRuntimeConnection[]> {
    const payload = await requestJson<{ items?: SessionRuntimeConnection[] }>({
      path: `/api/sessions/${sessionId}/runtime/connections`,
      method: 'GET',
      withAuth: true
    });
    return Array.isArray(payload.items) ? payload.items : [];
  },

  async writeRuntimeTargetState(params: { sessionId: string; templateId: string; targetId: string; state: unknown }): Promise<void> {
    await requestJson<void>({
      path: `/api/sessions/${params.sessionId}/runtime-targets/${params.targetId}`,
      method: 'PUT',
      withAuth: true,
      body: {
        templateId: params.templateId,
        state: params.state
      }
    });
  },

  async create(params: {
    name: string;
    description?: string;
    systemId: string;
    ownerUserId: string;
    settings?: Session['settings'];
  }): Promise<Session> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ session?: Record<string, unknown> }>({
          path: '/api/sessions',
          method: 'POST',
          withAuth: true,
          body: {
            name: params.name,
            description: params.description,
            systemId: params.systemId,
            settings: params.settings
          }
        });
        if (payload.session) {
          const mapped = mapApiSession(payload.session);
          await db.sessions.put(mapped);
          return mapped;
        }
      } catch {
        // fallback local creation
      }
    }

    const now = new Date().toISOString();
    const session: Session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: params.name.trim() || 'Nouvelle partie',
      description: params.description,
      systemId: params.systemId,
      ownerUserId: params.ownerUserId,
      gmUserId: params.ownerUserId,
      state: 'planned',
      settings: params.settings,
      participants: [{ userId: params.ownerUserId, role: 'gm', isConnected: false }],
      invitations: [],
      activityLog: [],
      initiative: {
        round: 0,
        turnIndex: 0,
        isInCombat: false,
        entries: []
      },
      screenTemplateAssignments: {
        gmTemplateId: null,
        playerTemplateId: null
      },
      screenTemplateSelections: {},
      createdAt: now,
      updatedAt: now
    };

    await db.sessions.put(session);
    await localActionRepository.enqueue({
      entityType: 'session',
      entityId: session.id,
      actionType: 'create',
      payload: { ...session }
    });

    return session;
  },

  async remove(session: Session): Promise<void> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled()) {
      try {
        await requestJson<void>({
          path: `/api/sessions/${session.id}`,
          method: 'DELETE',
          withAuth: true
        });
      } catch {
        // fallback local delete
      }
    }

    await db.sessions.delete(session.id);
    await localActionRepository.enqueue({
      entityType: 'session',
      entityId: session.id,
      actionType: 'delete',
      payload: { id: session.id }
    });
  },

  async archive(sessionId: string): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${sessionId}/archive`,
      method: 'POST',
      withAuth: true,
      body: {}
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  },

  async restore(sessionId: string): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${sessionId}/restore`,
      method: 'POST',
      withAuth: true,
      body: {}
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  },

  async updateInitiative(sessionId: string, initiative: SessionInitiativeState): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const session = await db.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const nextSession: Session = {
      ...session,
      initiative,
      updatedAt: new Date().toISOString()
    };

    if (isBackendEnabled()) {
      try {
        await requestJson<{ session?: Record<string, unknown> }>({
          path: `/api/sessions/${sessionId}`,
          method: 'PATCH',
          withAuth: true,
          body: { initiative }
        });
      } catch {
        // fallback local queue
      }
    }

    await db.sessions.put(nextSession);
    await localActionRepository.enqueue({
      entityType: 'session',
      entityId: sessionId,
      actionType: 'update',
      payload: { initiative }
    });

    return nextSession;
  },

  async inviteParticipant(params: { sessionId: string; userId: string; role: 'gm' | 'player' | 'observer' }): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${params.sessionId}/invitations`,
      method: 'POST',
      withAuth: true,
      body: { userId: params.userId, role: params.role }
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  },

  async respondToInvitation(params: { sessionId: string; invitationId: string; response: 'accept' | 'decline' }): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${params.sessionId}/invitations/${params.invitationId}/${params.response}`,
      method: 'POST',
      withAuth: true,
      body: {}
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  },

  async cancelInvitation(params: { sessionId: string; invitationId: string }): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${params.sessionId}/invitations/${params.invitationId}/cancel`,
      method: 'POST',
      withAuth: true,
      body: {}
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  },

  async resendInvitation(params: { sessionId: string; invitationId: string }): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${params.sessionId}/invitations/${params.invitationId}/resend`,
      method: 'POST',
      withAuth: true,
      body: {}
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  },

  async removeParticipant(params: { sessionId: string; userId: string }): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      const payload = await requestJson<{ session?: Record<string, unknown> }>({
        path: `/api/sessions/${params.sessionId}/participants/${params.userId}/remove`,
        method: 'POST',
        withAuth: true,
        body: {}
      });
      if (payload.session) {
        const mapped = mapApiSession(payload.session);
        await db.sessions.put(mapped);
        return mapped;
      }
    }

    const session = await db.sessions.get(params.sessionId);
    if (!session) {
      return null;
    }
    const ownedCharacters = await db.characters.where('sessionId').equals(params.sessionId).filter((character) => character.ownerUserId === params.userId).toArray();
    for (const character of ownedCharacters) {
      await db.characters.put({
        ...character,
        ownerUserId: null
      });
    }
    const nextParticipants = (session.participants ?? []).filter((participant) => participant.userId !== params.userId);
    if (!nextParticipants.some((participant) => participant.role === 'gm')) {
      const ownerIndex = nextParticipants.findIndex((participant) => participant.userId === (session.ownerUserId || session.gmUserId));
      if (ownerIndex >= 0) {
        nextParticipants[ownerIndex] = { ...nextParticipants[ownerIndex], role: 'gm' };
      }
    }
    const nextSession = {
      ...session,
      participants: nextParticipants,
      gmUserIds: nextParticipants.filter((participant) => participant.role === 'gm').map((participant) => participant.userId),
      gmUserId:
        nextParticipants.find((participant) => participant.role === 'gm')?.userId || session.gmUserId,
      updatedAt: new Date().toISOString()
    };
    await db.sessions.put(nextSession);
    await localActionRepository.enqueue({
      entityType: 'session',
      entityId: params.sessionId,
      actionType: 'update',
      payload: { participants: nextSession.participants, removedParticipantUserId: params.userId }
    });
    return nextSession;
  },

  async linkDiscordChannel(params: { sessionId: string; guildId: string }): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${params.sessionId}/discord/link`,
      method: 'POST',
      withAuth: true,
      body: { guildId: params.guildId }
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  },

  async unlinkDiscordChannel(sessionId: string): Promise<Session | null> {
    await ensureDatabaseIsInitialized();
    const payload = await requestJson<{ session?: Record<string, unknown> }>({
      path: `/api/sessions/${sessionId}/discord/unlink`,
      method: 'POST',
      withAuth: true,
      body: {}
    });
    if (!payload.session) {
      return null;
    }
    const mapped = mapApiSession(payload.session);
    await db.sessions.put(mapped);
    return mapped;
  }
};
