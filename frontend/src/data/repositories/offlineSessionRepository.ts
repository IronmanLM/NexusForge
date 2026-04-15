import { db, ensureDatabaseIsInitialized } from '../db';
import { OfflineSessionBundle, OfflineSessionCharacterEntry, OfflineSessionResourceEntry } from '../../types/offline';

function nowIso() {
  return new Date().toISOString();
}

export const offlineSessionRepository = {
  async listAll(): Promise<OfflineSessionBundle[]> {
    await ensureDatabaseIsInitialized();
    return db.offlineSessions.toArray();
  },

  async listForUser(accountUserId: string): Promise<OfflineSessionBundle[]> {
    await ensureDatabaseIsInitialized();
    return db.offlineSessions.where('accountUserId').equals(accountUserId).sortBy('requestedAt');
  },

  async get(sessionId: string): Promise<OfflineSessionBundle | null> {
    await ensureDatabaseIsInitialized();
    return (await db.offlineSessions.get(sessionId)) ?? null;
  },

  async upsert(bundle: OfflineSessionBundle): Promise<void> {
    await ensureDatabaseIsInitialized();
    await db.offlineSessions.put(bundle);
  },

  async markRequested(params: {
    sessionId: string;
    systemId: string;
    accountUserId: string;
    role: OfflineSessionBundle['role'];
    sessionUpdatedAt?: string | null;
    systemUpdatedAt?: string | null;
  }): Promise<OfflineSessionBundle> {
    await ensureDatabaseIsInitialized();
    const existing = await db.offlineSessions.get(params.sessionId);
    const bundle: OfflineSessionBundle = {
      sessionId: params.sessionId,
      systemId: params.systemId,
      accountUserId: params.accountUserId,
      role: params.role,
      status: existing?.status === 'ready' ? 'stale' : 'queued',
      requestedAt: existing?.requestedAt || nowIso(),
      lastHydratedAt: existing?.lastHydratedAt ?? null,
      lastSyncAt: existing?.lastSyncAt ?? null,
      lastError: null,
      sessionUpdatedAt: params.sessionUpdatedAt ?? existing?.sessionUpdatedAt ?? null,
      systemUpdatedAt: params.systemUpdatedAt ?? existing?.systemUpdatedAt ?? null,
      includesSessionResources: true,
      includesPlayerCharacters: true,
      includesSystemRuntime: true,
      cachedCharacterIds: existing?.cachedCharacterIds ?? [],
      resources: existing?.resources ?? [],
      characters: existing?.characters ?? []
    };
    await db.offlineSessions.put(bundle);
    return bundle;
  },

  async markDownloading(sessionId: string): Promise<void> {
    await ensureDatabaseIsInitialized();
    await db.offlineSessions.update(sessionId, {
      status: 'downloading',
      lastError: null
    });
  },

  async markReady(params: {
    sessionId: string;
    characters: OfflineSessionCharacterEntry[];
    resources: OfflineSessionResourceEntry[];
    sessionUpdatedAt?: string | null;
    systemUpdatedAt?: string | null;
  }): Promise<void> {
    await ensureDatabaseIsInitialized();
    await db.offlineSessions.update(params.sessionId, {
      status: 'ready',
      lastHydratedAt: nowIso(),
      lastError: null,
      sessionUpdatedAt: params.sessionUpdatedAt ?? null,
      systemUpdatedAt: params.systemUpdatedAt ?? null,
      cachedCharacterIds: params.characters.map((item) => item.characterId),
      characters: params.characters,
      resources: params.resources
    });
  },

  async markResource(params: {
    sessionId: string;
    resource: OfflineSessionResourceEntry;
  }): Promise<void> {
    await ensureDatabaseIsInitialized();
    const existing = await db.offlineSessions.get(params.sessionId);
    if (!existing) {
      return;
    }
    const nextResources = existing.resources.filter((item) => item.resourceId !== params.resource.resourceId);
    nextResources.push(params.resource);
    await db.offlineSessions.update(params.sessionId, {
      resources: nextResources
    });
  },

  async markError(sessionId: string, reason: string): Promise<void> {
    await ensureDatabaseIsInitialized();
    await db.offlineSessions.update(sessionId, {
      status: 'error',
      lastError: reason
    });
  },

  async markSynced(sessionId: string): Promise<void> {
    await ensureDatabaseIsInitialized();
    await db.offlineSessions.update(sessionId, {
      lastSyncAt: nowIso(),
      lastError: null
    });
  },

  async remove(sessionId: string): Promise<void> {
    await ensureDatabaseIsInitialized();
    await db.offlineSessions.delete(sessionId);
  }
};
