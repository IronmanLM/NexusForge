import { Character } from '../types/character';
import { OfflineSessionBundle, OfflineSessionCharacterEntry, OfflineSessionResourceEntry } from '../types/offline';
import { ResourceItem } from '../types/resource';
import { Session } from '../types/session';
import { getAccessToken } from './apiClient';
import {
  characterRepository,
  offlineResourceFileRepository,
  offlineSessionRepository,
  resourceRepository,
  screenTemplateRepository,
  sessionRepository,
  systemRepository
} from '../data/repositories';

function resolveOfflineRole(session: Session, currentUserId: string): OfflineSessionBundle['role'] {
  const participant = session.participants?.find((item) => item.userId === currentUserId);
  if (participant?.role === 'gm' || participant?.role === 'player' || participant?.role === 'observer') {
    return participant.role;
  }
  if (session.ownerUserId === currentUserId || session.gmUserId === currentUserId || (session.gmUserIds ?? []).includes(currentUserId)) {
    return 'gm';
  }
  return 'player';
}

function buildOfflineCharacterEntry(character: Character, currentUserId: string): OfflineSessionCharacterEntry {
  return {
    characterId: character.id,
    ownerUserId: character.ownerUserId ?? null,
    name: character.name,
    type: character.type ?? null,
    viewId: character.viewId ?? null,
    updatedAt: null,
    isOwnedByCurrentUser: character.ownerUserId === currentUserId
  };
}

function buildOfflineResourceEntry(resource: ResourceItem): OfflineSessionResourceEntry {
  return {
    resourceId: resource.id,
    name: resource.name,
    kind: resource.kind,
    mimeType: resource.mimeType,
    contentUrl: resource.contentUrl ?? null,
    sizeBytes: resource.sizeBytes,
    updatedAt: resource.updatedAt,
    downloadStatus: 'pending',
    localUri: null,
    downloadedAt: null,
    lastError: null
  };
}

async function downloadResourceFile(resource: ResourceItem): Promise<OfflineSessionResourceEntry> {
  if (!resource.contentUrl) {
    return {
      ...buildOfflineResourceEntry(resource),
      downloadStatus: 'failed',
      lastError: 'Ressource sans URL téléchargeable.'
    };
  }

  try {
    const existing = await offlineResourceFileRepository.get(resource.id);
    if (
      existing &&
      (existing.updatedAt ?? null) === (resource.updatedAt ?? null) &&
      (existing.sourceUrl ?? null) === (resource.contentUrl ?? null)
    ) {
      return {
        ...buildOfflineResourceEntry(resource),
        downloadStatus: 'downloaded',
        localUri: `offline-resource://${resource.id}`,
        downloadedAt: existing.downloadedAt,
        lastError: null
      };
    }

    const token = getAccessToken();
    const response = await fetch(resource.contentUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    await offlineResourceFileRepository.put({
      resourceId: resource.id,
      mimeType: resource.mimeType,
      blob,
      sourceUrl: resource.contentUrl,
      updatedAt: resource.updatedAt ?? null
    });
    return {
      ...buildOfflineResourceEntry(resource),
      downloadStatus: 'downloaded',
      localUri: `offline-resource://${resource.id}`,
      downloadedAt: new Date().toISOString(),
      lastError: null
    };
  } catch (error) {
    return {
      ...buildOfflineResourceEntry(resource),
      downloadStatus: 'failed',
      lastError: error instanceof Error ? error.message : 'Téléchargement impossible.'
    };
  }
}

export interface PrepareSessionOfflineResult {
  bundle: OfflineSessionBundle;
  session: Session;
  characters: Character[];
  resources: ResourceItem[];
}

export interface OfflineResourceCachePurgeResult {
  removedFiles: number;
  removedBytes: number;
  keptFiles: number;
}

export async function prepareSessionOfflineBundle(params: {
  sessionId: string;
  currentUserId: string;
}): Promise<PrepareSessionOfflineResult> {
  const session = await sessionRepository.getById(params.sessionId);
  if (!session) {
    throw new Error('Partie introuvable pour la préparation hors ligne.');
  }

  const role = resolveOfflineRole(session, params.currentUserId);
  const system = await systemRepository.getById(session.systemId);
  if (!system) {
    throw new Error('Système introuvable pour cette partie.');
  }

  await offlineSessionRepository.markRequested({
    sessionId: session.id,
    systemId: system.id,
    accountUserId: params.currentUserId,
    role,
    sessionUpdatedAt: session.updatedAt ?? null,
    systemUpdatedAt: system.updatedAt ?? null
  });
  await offlineSessionRepository.markDownloading(session.id);

  try {
    const assignedCharacterId = session.participants?.find((item) => item.userId === params.currentUserId)?.characterId ?? null;
    const effectiveRole = role === 'gm' ? 'gm' : 'player';
    const [characters, resources] = await Promise.all([
      characterRepository.listForSession({
        sessionId: session.id,
        role: effectiveRole,
        currentUserId: params.currentUserId,
        assignedCharacterId
      }),
      resourceRepository.list({ scopeType: 'session', scopeRefId: session.id })
    ]);

    await Promise.all([
      screenTemplateRepository.listForSystem(system.id),
      screenTemplateRepository.listForUser(params.currentUserId)
    ]);

    const offlineCharacters = characters.map((character) => buildOfflineCharacterEntry(character, params.currentUserId));
    const offlineResources = await Promise.all(
      resources.map(async (resource) => {
        const entry = await downloadResourceFile(resource);
        await offlineSessionRepository.markResource({
          sessionId: session.id,
          resource: entry
        });
        return entry;
      })
    );

    await offlineSessionRepository.markReady({
      sessionId: session.id,
      characters: offlineCharacters,
      resources: offlineResources,
      sessionUpdatedAt: session.updatedAt ?? null,
      systemUpdatedAt: system.updatedAt ?? null
    });

    const bundle = await offlineSessionRepository.get(session.id);
    if (!bundle) {
      throw new Error('Le cache hors ligne n a pas pu être relu après préparation.');
    }

    return {
      bundle,
      session,
      characters,
      resources
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Échec de la préparation hors ligne.';
    await offlineSessionRepository.markError(session.id, message);
    throw error;
  }
}

export async function purgeOfflineResourceCache(params: { currentUserId: string }): Promise<OfflineResourceCachePurgeResult> {
  const [bundles, files] = await Promise.all([
    offlineSessionRepository.listForUser(params.currentUserId),
    offlineResourceFileRepository.listAll()
  ]);

  const MAX_CACHE_BYTES = 512 * 1024 * 1024;
  const referencedByBundle = new Map<string, OfflineSessionBundle[]>();
  for (const bundle of bundles) {
    for (const resource of bundle.resources) {
      const items = referencedByBundle.get(resource.resourceId) ?? [];
      items.push(bundle);
      referencedByBundle.set(resource.resourceId, items);
    }
  }

  const orphanedFiles = files.filter((file) => !referencedByBundle.has(file.resourceId));
  const removableIds = new Set(orphanedFiles.map((file) => file.resourceId));
  let removedBytes = orphanedFiles.reduce((sum, file) => sum + file.sizeBytes, 0);

  const filesAfterOrphanPurge = files.filter((file) => !removableIds.has(file.resourceId));
  let remainingBytes = filesAfterOrphanPurge.reduce((sum, file) => sum + file.sizeBytes, 0);

  if (remainingBytes > MAX_CACHE_BYTES) {
    const staleCandidates = filesAfterOrphanPurge
      .filter((file) => {
        const owners = referencedByBundle.get(file.resourceId) ?? [];
        return owners.every((bundle) => bundle.status === 'stale' || bundle.status === 'error');
      })
      .sort((left, right) => {
        const leftDate = new Date(left.downloadedAt).getTime();
        const rightDate = new Date(right.downloadedAt).getTime();
        return leftDate - rightDate;
      });

    for (const candidate of staleCandidates) {
      if (remainingBytes <= MAX_CACHE_BYTES) {
        break;
      }
      removableIds.add(candidate.resourceId);
      removedBytes += candidate.sizeBytes;
      remainingBytes -= candidate.sizeBytes;
    }
  }

  await offlineResourceFileRepository.removeMany(Array.from(removableIds));

  return {
    removedFiles: removableIds.size,
    removedBytes,
    keptFiles: files.length - removableIds.size
  };
}
