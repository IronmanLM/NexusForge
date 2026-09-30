import { db, ensureDatabaseIsInitialized } from '../db';
import { CharacterCreationConfig, GameSystem, GameSystemVisibility } from '../../types/system';
import { User } from '../../types/user';
import { localActionRepository } from './localActionRepository';
import { ApiError, isBackendEnabled, requestJson } from '../../services/apiClient';

function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
}

function isAdmin(user: User): boolean {
  return user.roles.includes('admin');
}


function cloneCharacterCreationConfig(config?: CharacterCreationConfig): CharacterCreationConfig | undefined {
  return config ? (JSON.parse(JSON.stringify(config)) as CharacterCreationConfig) : undefined;
}

function canUserForkPublishedSystem(system: GameSystem, user: User): boolean {
  const isGm = user.roles.includes('gm') || user.roles.includes('admin');
  return isGm && system.status === 'published' && canUserViewSystem(system, user);
}

export function canUserEditSystem(system: GameSystem, user: User): boolean {
  if (system.deletedAt) {
    return false;
  }
  return system.ownerUserId === user.id || isAdmin(user) || (system.editorUserIds ?? []).includes(user.id);
}

function canUserViewSystem(system: GameSystem, user: User): boolean {
  if (system.ownerUserId === user.id || isAdmin(user) || (system.editorUserIds ?? []).includes(user.id) || (system.viewerUserIds ?? []).includes(user.id)) {
    return true;
  }

  if (system.status !== 'published') {
    return false;
  }

  return system.visibility === 'public' || system.visibility === 'friends';
}

export function canUseSystemForSession(system: GameSystem, user: User): boolean {
  return canUserViewSystem(system, user) && system.status === 'published' && Boolean(system.studioSchemaV2?.views?.some((view) => view.isCharacterSheet));
}

function cloneSystemForDuplicate(source: GameSystem, actor: User, name?: string): GameSystem {
  const now = new Date().toISOString();
  return {
    ...source,
    id: makeId('sys'),
    name: name?.trim() || `${source.name} (copie)`,
    ownerUserId: actor.id,
    status: 'draft',
    visibility: 'private',
    viewerUserIds: [],
    editorUserIds: [],
    forkedFromSystemId: source.id,
    forkedFromSystemName: source.name,
    auditTrail: [
      {
        id: makeId('audit'),
        at: now,
        byUserId: actor.id,
        action: 'duplicate',
        summary: `Fork depuis ${source.name}`
      }
    ],
    createdAt: now,
    updatedAt: now,
    studioSchemaV2: source.studioSchemaV2
      ? {
          version: 2,
          views: source.studioSchemaV2.views.map((view) => ({
            ...view,
            nodes: view.nodes.map((node) => ({
              ...node,
              layout: { ...node.layout },
              tabs: node.tabs?.map((tab) => ({ ...tab })),
              repeat: node.repeat ? { ...node.repeat } : undefined,
              options: node.options ? [...node.options] : undefined
            }))
          }))
        }
      : undefined,
    catalogs: source.catalogs
      ? source.catalogs.map((catalog) => ({
          ...catalog,
          columns: catalog.columns.map((column) => ({
            ...column,
            options: column.options ? [...column.options] : undefined
          })),
          entries: catalog.entries.map((entry) => ({
            ...entry,
            values: { ...entry.values }
          }))
        }))
      : undefined,
    discordConfig: source.discordConfig
      ? {
          version: 1,
          outputs: source.discordConfig.outputs.map((output) => ({
            ...output,
            allowedVisibilities: [...output.allowedVisibilities]
          }))
        }
      : undefined,
    characterCreationConfig: cloneCharacterCreationConfig(source.characterCreationConfig),
    rulesProgram: source.rulesProgram?.map((block) => ({ ...block })) ?? [],
  };
}

function mapApiSystem(raw: Record<string, unknown>): GameSystem {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? 'Systeme'),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    version: String(raw.version ?? '0.1.0'),
    author: typeof raw.author === 'string' ? raw.author : undefined,
    ownerUserId: String(raw.ownerUserId ?? ''),
    status: raw.status === 'published' ? 'published' : 'draft',
    visibility: raw.visibility === 'private' || raw.visibility === 'friends' ? raw.visibility : 'public',
    viewerUserIds: Array.isArray(raw.viewerUserIds)
      ? raw.viewerUserIds.filter((item): item is string => typeof item === 'string')
      : [],
    editorUserIds: Array.isArray(raw.editorUserIds)
      ? raw.editorUserIds.filter((item): item is string => typeof item === 'string')
      : [],
    forkedFromSystemId: typeof raw.forkedFromSystemId === 'string' ? raw.forkedFromSystemId : undefined,
    forkedFromSystemName: typeof raw.forkedFromSystemName === 'string' ? raw.forkedFromSystemName : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((item): item is string => typeof item === 'string') : [],
    rollDefinitions: Array.isArray(raw.rollDefinitions) ? (raw.rollDefinitions as GameSystem['rollDefinitions']) : [],
    rulesProgram: Array.isArray(raw.rulesProgram) ? (raw.rulesProgram as GameSystem['rulesProgram']) : [],
    rulesPresentation:
      raw.rulesPresentation && typeof raw.rulesPresentation === 'object'
        ? (raw.rulesPresentation as GameSystem['rulesPresentation'])
        : undefined,
    studioTheme:
      raw.studioTheme && typeof raw.studioTheme === 'object'
        ? (raw.studioTheme as GameSystem['studioTheme'])
        : undefined,
    studioSchemaV2: raw.studioSchemaV2 && typeof raw.studioSchemaV2 === 'object' ? (raw.studioSchemaV2 as GameSystem['studioSchemaV2']) : undefined,
    catalogs: Array.isArray(raw.catalogs) ? (raw.catalogs as GameSystem['catalogs']) : [],
    discordConfig: raw.discordConfig && typeof raw.discordConfig === 'object' ? (raw.discordConfig as GameSystem['discordConfig']) : undefined,
    characterCreationConfig:
      raw.characterCreationConfig && typeof raw.characterCreationConfig === 'object'
        ? (raw.characterCreationConfig as GameSystem['characterCreationConfig'])
        : undefined,
    auditTrail: Array.isArray(raw.auditTrail) ? (raw.auditTrail as GameSystem['auditTrail']) : [],
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
    retainedForSessions: raw.retainedForSessions === true,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString())
  };
}

export const systemRepository = {
  async list(): Promise<GameSystem[]> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ items?: Record<string, unknown>[] }>({
          path: '/api/systems',
          method: 'GET',
          withAuth: true
        });
        const systems = (payload.items ?? []).map(mapApiSystem);
        await db.transaction('rw', db.systems, async () => {
          await db.systems.clear();
          if (systems.length > 0) {
            await db.systems.bulkPut(systems);
          }
        });
      } catch {
        // fallback local cache
      }
    }
    return db.systems.orderBy('updatedAt').reverse().toArray();
  },

  async listAvailableForUser(user: User): Promise<GameSystem[]> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ items?: Record<string, unknown>[] }>({
          path: '/api/systems',
          method: 'GET',
          withAuth: true
        });
        const systems = (payload.items ?? []).map(mapApiSystem);
        await db.transaction('rw', db.systems, async () => {
          await db.systems.clear();
          if (systems.length > 0) {
            await db.systems.bulkPut(systems);
          }
        });
      } catch {
        // fallback local cache
      }
    }
    const all = await db.systems.orderBy('updatedAt').reverse().toArray();
    return all.filter((system) => canUserViewSystem(system, user));
  },

  async getById(systemId: string): Promise<GameSystem | null> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ system?: Record<string, unknown> }>({
          path: `/api/systems/${systemId}`,
          method: 'GET',
          withAuth: true
        });
        if (payload.system) {
          await db.systems.put(mapApiSystem(payload.system));
        }
      } catch {
        // fallback local cache
      }
    }
    const system = await db.systems.get(systemId);
    return system ?? null;
  },

  async getByIdForUser(systemId: string, user: User): Promise<GameSystem | null> {
    await ensureDatabaseIsInitialized();
    const system = await db.systems.get(systemId);
    if (!system || !canUserViewSystem(system, user)) {
      return null;
    }
    return system;
  },

  async create(params: {
    owner: User;
    name: string;
    description?: string;
    version?: string;
    visibility?: GameSystemVisibility;
    editorUserIds?: string[];
    templateFromSystemId?: string;
  }): Promise<GameSystem> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ system: Record<string, unknown> }>({
          path: '/api/systems',
          method: 'POST',
          withAuth: true,
          body: {
            name: params.name,
            description: params.description ?? '',
            version: params.version ?? '0.1.0',
            visibility: params.visibility ?? 'public',
            editorUserIds: params.editorUserIds ?? [],
            status: 'draft',
            templateFromSystemId: params.templateFromSystemId
          }
        });
        const mapped = mapApiSystem(payload.system);
        await db.systems.put(mapped);
        return mapped;
      } catch {
        // fallback local creation
      }
    }

    const now = new Date().toISOString();
    let rulesProgram: NonNullable<GameSystem['rulesProgram']> = [];
    let studioSchemaV2: GameSystem['studioSchemaV2'] = undefined;
    let catalogs: GameSystem['catalogs'] = [];
    let discordConfig: GameSystem['discordConfig'] = undefined;
    let characterCreationConfig: GameSystem['characterCreationConfig'] = undefined;
    let forkedFromSystemId: string | undefined;
    let forkedFromSystemName: string | undefined;

    if (params.templateFromSystemId) {
      const source = await db.systems.get(params.templateFromSystemId);
      if (source && canUserViewSystem(source, params.owner)) {
        rulesProgram = source.rulesProgram?.map((block) => ({ ...block })) ?? [];
        studioSchemaV2 = source.studioSchemaV2
          ? {
              version: 2,
              views: source.studioSchemaV2.views.map((view) => ({
                ...view,
                nodes: view.nodes.map((node) => ({
                  ...node,
                  layout: { ...node.layout },
                  tabs: node.tabs?.map((tab) => ({ ...tab })),
                  repeat: node.repeat ? { ...node.repeat } : undefined,
                  options: node.options ? [...node.options] : undefined
                }))
              }))
            }
          : undefined;
        catalogs = source.catalogs
          ? source.catalogs.map((catalog) => ({
              ...catalog,
              columns: catalog.columns.map((column) => ({
                ...column,
                options: column.options ? [...column.options] : undefined
              })),
              entries: catalog.entries.map((entry) => ({
                ...entry,
                values: { ...entry.values }
              }))
            }))
          : [];
        discordConfig = source.discordConfig
          ? {
              version: 1,
              outputs: source.discordConfig.outputs.map((output) => ({
                ...output,
                allowedVisibilities: [...output.allowedVisibilities]
              }))
            }
          : undefined;
        characterCreationConfig = cloneCharacterCreationConfig(source.characterCreationConfig);
        forkedFromSystemId = source.id;
        forkedFromSystemName = source.name;
      }
    }

    const system: GameSystem = {
      id: makeId('sys'),
      name: params.name.trim() || 'Nouveau systeme',
      description: params.description?.trim() || '',
      version: params.version ?? '0.1.0',
      author: params.owner.displayName,
      ownerUserId: params.owner.id,
      status: 'draft',
      visibility: params.visibility ?? 'public',
      viewerUserIds: [],
      editorUserIds: params.editorUserIds ?? [],
      ...(forkedFromSystemId ? { forkedFromSystemId } : {}),
      ...(forkedFromSystemName ? { forkedFromSystemName } : {}),
      tags: ['custom'],
      catalogs,
      ...(discordConfig ? { discordConfig } : {}),
      ...(characterCreationConfig ? { characterCreationConfig } : {}),
      ...(studioSchemaV2 ? { studioSchemaV2 } : {}),
      auditTrail: [
        {
          id: makeId('audit'),
          at: now,
          byUserId: params.owner.id,
          action: 'create',
          summary: 'Creation du systeme'
        }
      ],
      rulesProgram,
      createdAt: now,
      updatedAt: now
    };

    await db.systems.put(system);
    await localActionRepository.enqueue({
      entityType: 'system',
      entityId: system.id,
      actionType: 'create',
      payload: system as unknown as Record<string, unknown>
    });

    return system;
  },

  async duplicate(params: { sourceSystemId: string; actor: User; name?: string; description?: string }): Promise<GameSystem> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ system: Record<string, unknown> }>({
          path: `/api/systems/${params.sourceSystemId}/duplicate`,
          method: 'POST',
          withAuth: true,
          body: {
            ...(params.name ? { name: params.name } : {}),
            ...(typeof params.description === 'string' ? { description: params.description } : {})
          }
        });
        const mapped = mapApiSystem(payload.system);
        await db.systems.put(mapped);
        return mapped;
      } catch {
        // fallback local duplicate
      }
    }

    const source = await db.systems.get(params.sourceSystemId);
    if (!source || !canUserForkPublishedSystem(source, params.actor)) {
      throw new Error('Systeme source introuvable ou inaccessible.');
    }

    const duplicated = {
      ...cloneSystemForDuplicate(source, params.actor, params.name),
      description: typeof params.description === 'string' ? params.description : source.description
    };
    await db.systems.put(duplicated);
    await localActionRepository.enqueue({
      entityType: 'system',
      entityId: duplicated.id,
      actionType: 'create',
      payload: duplicated as unknown as Record<string, unknown>
    });

    return duplicated;
  },

  async upsert(system: GameSystem, actor?: User): Promise<void> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled()) {
      try {
        await requestJson<{ system?: Record<string, unknown> }>({
          path: `/api/systems/${system.id}`,
          method: 'PATCH',
          withAuth: true,
          body: {
            name: system.name,
            description: system.description,
            version: system.version,
            status: system.status,
            visibility: system.visibility,
            viewerUserIds: system.viewerUserIds,
            editorUserIds: system.editorUserIds,
            tags: system.tags,
            rollDefinitions: system.rollDefinitions,
            rulesProgram: system.rulesProgram,
            rulesPresentation: system.rulesPresentation,
            studioTheme: system.studioTheme,
            studioSchemaV2: system.studioSchemaV2,
            catalogs: system.catalogs,
            discordConfig: system.discordConfig,
            characterCreationConfig: system.characterCreationConfig
          }
        });
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        // fallback local queue on transport failures only
      }
    }

    const existing = await db.systems.get(system.id);
    if (existing && actor && !canUserEditSystem(existing, actor)) {
      throw new Error('Modification interdite: seul le proprietaire ou un admin peut modifier ce systeme.');
    }

    const nextSystem: GameSystem = {
      ...system,
      ownerUserId: existing?.ownerUserId ?? actor?.id ?? system.ownerUserId,
      auditTrail: [
        ...(existing?.auditTrail ?? system.auditTrail ?? []),
        {
          id: makeId('audit'),
          at: new Date().toISOString(),
          byUserId: actor?.id ?? existing?.ownerUserId ?? system.ownerUserId,
          action: 'update',
          summary: 'Mise a jour locale du systeme'
        }
      ].slice(-80),
      updatedAt: new Date().toISOString()
    };

    await db.systems.put(nextSystem);
    await localActionRepository.enqueue({
      entityType: 'system',
      entityId: system.id,
      actionType: 'update',
      payload: nextSystem as unknown as Record<string, unknown>
    });
  },

  async listUsageForAdmin(): Promise<
    Array<
      GameSystem & {
        usage: {
          usersUsingNow: number;
          activeSessionsCount: number;
          archivedSessionsCount: number;
          totalSessionsCount: number;
          lastUsedAt: string | null;
        };
      }
    >
  > {
    const payload = await requestJson<{ items: Array<Record<string, unknown> & { usage?: Record<string, unknown> }> }>({
      path: '/api/admin/systems/usage',
      method: 'GET',
      withAuth: true
    });

    return payload.items.map((raw) => {
      const mapped = mapApiSystem(raw);
      const usageRaw = raw.usage ?? {};
      return {
        ...mapped,
        usage: {
          usersUsingNow: Number(usageRaw.usersUsingNow ?? 0),
          activeSessionsCount: Number(usageRaw.activeSessionsCount ?? 0),
          archivedSessionsCount: Number(usageRaw.archivedSessionsCount ?? 0),
          totalSessionsCount: Number(usageRaw.totalSessionsCount ?? 0),
          lastUsedAt: typeof usageRaw.lastUsedAt === 'string' ? usageRaw.lastUsedAt : null
        }
      };
    });
  },

  async deleteAsAdmin(params: { systemId: string; replacementSystemId: string }): Promise<{ migratedSessionsCount: number }> {
    const payload = await requestJson<{ migratedSessionsCount?: number }>({
      path: `/api/admin/systems/${params.systemId}`,
      method: 'DELETE',
      withAuth: true,
      body: { replacementSystemId: params.replacementSystemId }
    });
    await db.systems.delete(params.systemId);
    return {
      migratedSessionsCount: Number(payload.migratedSessionsCount ?? 0)
    };
  },

  async deleteOwned(params: { systemId: string; actor: User }): Promise<{ retainedForSessions: boolean; relatedSessionsCount: number }> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled()) {
      const payload = await requestJson<{ retainedForSessions?: boolean; relatedSessionsCount?: number }>({
        path: `/api/systems/${params.systemId}`,
        method: 'DELETE',
        withAuth: true
      });
      const existing = await db.systems.get(params.systemId);
      if (payload.retainedForSessions) {
        if (existing) {
          await db.systems.put({
            ...existing,
            deletedAt: new Date().toISOString(),
            retainedForSessions: true,
            updatedAt: new Date().toISOString()
          });
        }
      } else {
        await db.systems.delete(params.systemId);
      }
      return {
        retainedForSessions: Boolean(payload.retainedForSessions),
        relatedSessionsCount: Number(payload.relatedSessionsCount ?? 0)
      };
    }

    const existing = await db.systems.get(params.systemId);
    if (!existing) {
      throw new Error('Système introuvable.');
    }
    if (existing.ownerUserId !== params.actor.id && !isAdmin(params.actor)) {
      throw new Error('Suppression interdite: seul le propriétaire ou un admin peut supprimer ce système.');
    }
    const relatedSessions = await db.sessions.where('systemId').equals(params.systemId).toArray();
    if (relatedSessions.length > 0) {
      await db.systems.put({
        ...existing,
        deletedAt: new Date().toISOString(),
        retainedForSessions: true,
        updatedAt: new Date().toISOString()
      });
      return { retainedForSessions: true, relatedSessionsCount: relatedSessions.length };
    }
    await db.systems.delete(params.systemId);
    return { retainedForSessions: false, relatedSessionsCount: 0 };
  }
};
