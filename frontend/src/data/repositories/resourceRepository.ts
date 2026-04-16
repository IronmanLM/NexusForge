import { db, ensureDatabaseIsInitialized } from '../db';
import { ResourceFolder, ResourceItem } from '../../types/resource';
import { localActionRepository } from './localActionRepository';
import { buildApiUrl, isBackendEnabled, requestJson } from '../../services/apiClient';
import { offlineResourceFileRepository } from './offlineResourceFileRepository';
import { getCachedCurrentUser } from '../../services/authService';

function makeLocalId(prefix: 'resource' | 'folder'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferKindFromMimeType(mimeType: string): ResourceItem['kind'] {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith('image/')) {
    return 'image';
  }
  if (normalized === 'application/pdf') {
    return 'pdf';
  }
  if (normalized.startsWith('video/')) {
    return 'video';
  }
  if (normalized.startsWith('audio/')) {
    return 'audio';
  }
  return 'text';
}

function base64ToBlob(contentBase64: string, mimeType: string): Blob {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

function getCachedUserIdentity(): { id: string; nickname: string | null } {
  const currentUser = getCachedCurrentUser();
  return {
    id: currentUser?.id ?? 'offline-user',
    nickname: currentUser?.nickname ?? null
  };
}

function mapApiResource(raw: Record<string, unknown>): ResourceItem {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    originalName: typeof raw.originalName === 'string' ? raw.originalName : undefined,
    kind: (raw.kind as ResourceItem['kind']) ?? 'text',
    mimeType: String(raw.mimeType ?? 'application/octet-stream'),
    sizeBytes: Number(raw.sizeBytes ?? 0),
    ownerUserId: String(raw.ownerUserId ?? ''),
    ownerNickname: typeof raw.ownerNickname === 'string' ? raw.ownerNickname : raw.ownerNickname === null ? null : undefined,
    scopeType: (raw.scopeType as ResourceItem['scopeType']) ?? 'account',
    scopeRefId: typeof raw.scopeRefId === 'string' ? raw.scopeRefId : raw.scopeRefId === null ? null : undefined,
    scopeName: typeof raw.scopeName === 'string' ? raw.scopeName : raw.scopeName === null ? null : undefined,
    visibility: (raw.visibility as ResourceItem['visibility']) ?? 'private',
    sharedWithUserIds: Array.isArray(raw.sharedWithUserIds) ? raw.sharedWithUserIds.filter((item): item is string => typeof item === 'string') : [],
    folderId: typeof raw.folderId === 'string' ? raw.folderId : raw.folderId === null ? null : undefined,
    folderName: typeof raw.folderName === 'string' ? raw.folderName : raw.folderName === null ? null : undefined,
    sessionAudience:
      raw.sessionAudience === 'private' || raw.sessionAudience === 'session_all' || raw.sessionAudience === 'session_gm' || raw.sessionAudience === 'session_member'
        ? raw.sessionAudience
        : null,
    sessionMemberUserIds: Array.isArray(raw.sessionMemberUserIds) ? raw.sessionMemberUserIds.filter((item): item is string => typeof item === 'string') : [],
    canReshareInSession: typeof raw.canReshareInSession === 'boolean' ? raw.canReshareInSession : true,
    storagePath: typeof raw.storagePath === 'string' ? raw.storagePath : raw.storagePath === null ? null : undefined,
    contentUrl: typeof raw.contentUrl === 'string' ? buildApiUrl(raw.contentUrl) : raw.contentUrl === null ? null : undefined,
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' ? buildApiUrl(raw.thumbnailUrl) : raw.thumbnailUrl === null ? null : undefined,
    previewUrl: typeof raw.previewUrl === 'string' ? buildApiUrl(raw.previewUrl) : raw.previewUrl === null ? null : undefined,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString())
  };
}

function mapApiFolder(raw: Record<string, unknown>): ResourceFolder {
  return {
    id: String(raw.id ?? ''),
    ownerUserId: String(raw.ownerUserId ?? ''),
    scopeType: (raw.scopeType as ResourceFolder['scopeType']) ?? 'account',
    scopeRefId: typeof raw.scopeRefId === 'string' ? raw.scopeRefId : raw.scopeRefId === null ? null : undefined,
    parentFolderId: typeof raw.parentFolderId === 'string' ? raw.parentFolderId : raw.parentFolderId === null ? null : undefined,
    name: String(raw.name ?? 'Nouveau dossier'),
    visibilityHint: raw.visibilityHint === 'gm' || raw.visibilityHint === 'participant' ? raw.visibilityHint : 'all',
    defaultType: typeof raw.defaultType === 'string' ? raw.defaultType : raw.defaultType === null ? null : undefined,
    sessionMemberUserId:
      typeof raw.sessionMemberUserId === 'string' ? raw.sessionMemberUserId : raw.sessionMemberUserId === null ? null : undefined,
    scopeName: typeof raw.scopeName === 'string' ? raw.scopeName : raw.scopeName === null ? null : undefined,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString())
  };
}

export const resourceRepository = {
  async list(params?: {
    scopeType?: ResourceItem['scopeType'];
    scopeRefId?: string | null;
    kind?: ResourceItem['kind'];
    folderId?: string | null;
  }): Promise<ResourceItem[]> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled()) {
      try {
        const search = new URLSearchParams();
        if (params?.scopeType) {
          search.set('scopeType', params.scopeType);
        }
        if (params?.scopeRefId) {
          search.set('scopeRefId', params.scopeRefId);
        }
        if (params?.kind) {
          search.set('kind', params.kind);
        }
        if (params?.folderId) {
          search.set('folderId', params.folderId);
        }
        const payload = await requestJson<{ items?: Record<string, unknown>[] }>({
          path: `/api/resources${search.toString() ? `?${search.toString()}` : ''}`,
          method: 'GET',
          withAuth: true
        });
        const items = (payload.items ?? []).map(mapApiResource);
        await db.transaction('rw', db.resources, async () => {
          if (!params?.scopeType && !params?.scopeRefId && !params?.kind && !params?.folderId) {
            await db.resources.clear();
          }
          if (items.length > 0) {
            await db.resources.bulkPut(items);
          }
        });
        return items;
      } catch {
        // fallback local cache
      }
    }

    let items = await db.resources.toArray();
    if (params?.scopeType) {
      items = items.filter((item) => item.scopeType === params.scopeType);
    }
    if (params?.scopeRefId !== undefined) {
      items = items.filter((item) => (item.scopeRefId ?? null) === params.scopeRefId);
    }
    if (params?.kind) {
      items = items.filter((item) => item.kind === params.kind);
    }
    if (params?.folderId !== undefined) {
      items = items.filter((item) => (item.folderId ?? null) === params.folderId);
    }
    return items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },

  async listFolders(params?: {
    scopeType?: ResourceFolder['scopeType'];
    scopeRefId?: string | null;
  }): Promise<ResourceFolder[]> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled()) {
      try {
        const search = new URLSearchParams();
        if (params?.scopeType) {
          search.set('scopeType', params.scopeType);
        }
        if (params?.scopeRefId) {
          search.set('scopeRefId', params.scopeRefId);
        }
        const payload = await requestJson<{ items?: Record<string, unknown>[] }>({
          path: `/api/resource-folders${search.toString() ? `?${search.toString()}` : ''}`,
          method: 'GET',
          withAuth: true
        });
        const items = (payload.items ?? []).map(mapApiFolder);
        await db.transaction('rw', db.resourceFolders, async () => {
          if (!params?.scopeType && !params?.scopeRefId) {
            await db.resourceFolders.clear();
          }
          if (items.length > 0) {
            await db.resourceFolders.bulkPut(items);
          }
        });
        return items;
      } catch {
        // fallback local cache
      }
    }

    let items = await db.resourceFolders.toArray();
    if (params?.scopeType) {
      items = items.filter((item) => item.scopeType === params.scopeType);
    }
    if (params?.scopeRefId !== undefined) {
      items = items.filter((item) => (item.scopeRefId ?? null) === params.scopeRefId);
    }
    return items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
  },

  async create(params: {
    name: string;
    originalName?: string;
    mimeType: string;
    scopeType?: ResourceItem['scopeType'];
    scopeRefId?: string | null;
    visibility?: ResourceItem['visibility'];
    sharedWithUserIds?: string[];
    folderId?: string | null;
    sessionAudience?: ResourceItem['sessionAudience'];
    sessionMemberUserIds?: string[];
    canReshareInSession?: boolean;
    contentBase64: string;
  }): Promise<ResourceItem> {
    await ensureDatabaseIsInitialized();

    const normalizedPayload = {
      ...params,
      scopeType: params.scopeType ?? 'account',
      scopeRefId: params.scopeRefId ?? null,
      visibility: params.visibility ?? 'private',
      sharedWithUserIds: params.sharedWithUserIds ?? [],
      folderId: params.folderId ?? null,
      sessionAudience: params.sessionAudience ?? 'session_all',
      sessionMemberUserIds: params.sessionMemberUserIds ?? [],
      canReshareInSession: params.canReshareInSession ?? true
    };

    if (isBackendEnabled() && navigator.onLine) {
      try {
        const payload = await requestJson<{ resource: Record<string, unknown> }>({
          path: '/api/resources',
          method: 'POST',
          withAuth: true,
          body: normalizedPayload
        });

        const resource = mapApiResource(payload.resource);
        await db.resources.put(resource);
        return resource;
      } catch {
        // fallback local
      }
    }

    const owner = getCachedUserIdentity();
    const blob = base64ToBlob(params.contentBase64, params.mimeType);
    const now = new Date().toISOString();
    const resource: ResourceItem = {
      id: makeLocalId('resource'),
      name: params.name,
      originalName: params.originalName,
      kind: inferKindFromMimeType(params.mimeType),
      mimeType: params.mimeType,
      sizeBytes: blob.size,
      ownerUserId: owner.id,
      ownerNickname: owner.nickname,
      scopeType: normalizedPayload.scopeType,
      scopeRefId: normalizedPayload.scopeRefId,
      visibility: normalizedPayload.scopeType === 'session' ? 'private' : normalizedPayload.visibility,
      sharedWithUserIds: normalizedPayload.sharedWithUserIds,
      folderId: normalizedPayload.folderId,
      sessionAudience: normalizedPayload.scopeType === 'session' ? normalizedPayload.sessionAudience : null,
      sessionMemberUserIds: normalizedPayload.scopeType === 'session' ? normalizedPayload.sessionMemberUserIds : [],
      canReshareInSession: normalizedPayload.canReshareInSession,
      storagePath: null,
      contentUrl: null,
      thumbnailUrl: null,
      previewUrl: null,
      createdAt: now,
      updatedAt: now
    };

    await db.resources.put(resource);
    await offlineResourceFileRepository.put({
      resourceId: resource.id,
      mimeType: resource.mimeType,
      blob,
      sourceUrl: null,
      updatedAt: resource.updatedAt
    });
    await localActionRepository.enqueue({
      entityType: 'resource',
      entityId: resource.id,
      actionType: 'create',
      payload: {
        id: resource.id,
        ...normalizedPayload
      }
    });
    return resource;
  },

  async update(resourceId: string, patch: Partial<Pick<ResourceItem, 'name' | 'visibility' | 'sharedWithUserIds' | 'folderId' | 'sessionAudience' | 'sessionMemberUserIds' | 'canReshareInSession'>>): Promise<ResourceItem> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled() && navigator.onLine) {
      try {
        const payload = await requestJson<{ resource: Record<string, unknown> }>({
          path: `/api/resources/${resourceId}`,
          method: 'PATCH',
          withAuth: true,
          body: patch
        });
        const resource = mapApiResource(payload.resource);
        await db.resources.put(resource);
        return resource;
      } catch {
        // fallback local
      }
    }

    const existing = await db.resources.get(resourceId);
    if (!existing) {
      throw new Error('Ressource introuvable.');
    }
    const resource: ResourceItem = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await db.resources.put(resource);
    await localActionRepository.enqueue({
      entityType: 'resource',
      entityId: resource.id,
      actionType: 'update',
      payload: {
        id: resource.id,
        ...patch
      }
    });
    return resource;
  },

  async publishToSession(params: {
    resourceId: string;
    sessionId: string;
    folderId?: string | null;
    sessionAudience?: ResourceItem['sessionAudience'];
    sessionMemberUserIds?: string[];
    canReshareInSession?: boolean;
  }): Promise<ResourceItem> {
    await ensureDatabaseIsInitialized();

    const payload = await requestJson<{ resource: Record<string, unknown> }>({
      path: `/api/resources/${params.resourceId}/publish-to-session`,
      method: 'POST',
      withAuth: true,
      body: {
        sessionId: params.sessionId,
        folderId: params.folderId ?? null,
        sessionAudience: params.sessionAudience ?? 'session_all',
        sessionMemberUserIds: params.sessionMemberUserIds ?? [],
        canReshareInSession: params.canReshareInSession ?? true
      }
    });
    const resource = mapApiResource(payload.resource);
    await db.resources.put(resource);
    return resource;
  },

  async remove(resourceId: string): Promise<void> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled() && navigator.onLine) {
      try {
        await requestJson<void>({
          path: `/api/resources/${resourceId}`,
          method: 'DELETE',
          withAuth: true
        });
        await db.resources.delete(resourceId);
        await offlineResourceFileRepository.remove(resourceId);
        return;
      } catch {
        // fallback local
      }
    }

    await db.resources.delete(resourceId);
    await offlineResourceFileRepository.remove(resourceId);
    await localActionRepository.enqueue({
      entityType: 'resource',
      entityId: resourceId,
      actionType: 'delete',
      payload: { id: resourceId }
    });
  },

  async createFolder(params: {
    name: string;
    scopeType?: ResourceFolder['scopeType'];
    scopeRefId?: string | null;
    parentFolderId?: string | null;
    visibilityHint?: ResourceFolder['visibilityHint'];
  }): Promise<ResourceFolder> {
    await ensureDatabaseIsInitialized();
    const normalizedPayload = {
      ...params,
      scopeType: params.scopeType ?? 'account',
      scopeRefId: params.scopeRefId ?? null,
      parentFolderId: params.parentFolderId ?? null,
      visibilityHint: params.visibilityHint ?? 'all'
    };

    if (isBackendEnabled() && navigator.onLine) {
      try {
        const payload = await requestJson<{ folder: Record<string, unknown> }>({
          path: '/api/resource-folders',
          method: 'POST',
          withAuth: true,
          body: normalizedPayload
        });
        const folder = mapApiFolder(payload.folder);
        await db.resourceFolders.put(folder);
        return folder;
      } catch {
        // fallback local
      }
    }

    const owner = getCachedUserIdentity();
    const now = new Date().toISOString();
    const folder: ResourceFolder = {
      id: makeLocalId('folder'),
      ownerUserId: owner.id,
      scopeType: normalizedPayload.scopeType,
      scopeRefId: normalizedPayload.scopeRefId,
      parentFolderId: normalizedPayload.parentFolderId,
      name: normalizedPayload.name,
      visibilityHint: normalizedPayload.visibilityHint,
      createdAt: now,
      updatedAt: now
    };
    await db.resourceFolders.put(folder);
    await localActionRepository.enqueue({
      entityType: 'resource_folder',
      entityId: folder.id,
      actionType: 'create',
      payload: {
        id: folder.id,
        ...normalizedPayload
      }
    });
    return folder;
  },

  async updateFolder(folderId: string, patch: Partial<Pick<ResourceFolder, 'name' | 'parentFolderId'>>): Promise<ResourceFolder> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled() && navigator.onLine) {
      try {
        const payload = await requestJson<{ folder: Record<string, unknown> }>({
          path: `/api/resource-folders/${folderId}`,
          method: 'PATCH',
          withAuth: true,
          body: patch
        });
        const folder = mapApiFolder(payload.folder);
        await db.resourceFolders.put(folder);
        return folder;
      } catch {
        // fallback local
      }
    }
    const existing = await db.resourceFolders.get(folderId);
    if (!existing) {
      throw new Error('Dossier introuvable.');
    }
    const folder: ResourceFolder = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    await db.resourceFolders.put(folder);
    await localActionRepository.enqueue({
      entityType: 'resource_folder',
      entityId: folder.id,
      actionType: 'update',
      payload: {
        id: folder.id,
        ...patch
      }
    });
    return folder;
  },

  async removeFolder(folderId: string): Promise<void> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled() && navigator.onLine) {
      try {
        await requestJson<void>({
          path: `/api/resource-folders/${folderId}`,
          method: 'DELETE',
          withAuth: true
        });
        await db.resourceFolders.delete(folderId);
        return;
      } catch {
        // fallback local
      }
    }
    await db.resourceFolders.delete(folderId);
    await localActionRepository.enqueue({
      entityType: 'resource_folder',
      entityId: folderId,
      actionType: 'delete',
      payload: { id: folderId }
    });
  }
};
