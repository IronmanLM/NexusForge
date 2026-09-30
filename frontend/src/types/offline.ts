export type OfflineSessionAvailabilityStatus = 'queued' | 'downloading' | 'ready' | 'stale' | 'error';

export type OfflineResourceDownloadStatus = 'pending' | 'downloaded' | 'failed';

export interface OfflineResourceFile {
  resourceId: string;
  mimeType: string;
  blob: Blob;
  sizeBytes: number;
  sourceUrl?: string | null;
  downloadedAt: string;
  updatedAt?: string | null;
}

export interface OfflineSessionResourceEntry {
  resourceId: string;
  name: string;
  kind?: 'image' | 'pdf' | 'text' | 'video' | 'audio';
  mimeType?: string;
  contentUrl?: string | null;
  sizeBytes?: number;
  updatedAt?: string;
  downloadStatus: OfflineResourceDownloadStatus;
  localUri?: string | null;
  downloadedAt?: string | null;
  lastError?: string | null;
}

export interface OfflineSessionCharacterEntry {
  characterId: string;
  ownerUserId?: string | null;
  name: string;
  type?: string | null;
  viewId?: string | null;
  updatedAt?: string | null;
  isOwnedByCurrentUser: boolean;
}

export interface OfflineSessionBundle {
  sessionId: string;
  systemId: string;
  accountUserId: string;
  role: 'gm' | 'player' | 'observer';
  status: OfflineSessionAvailabilityStatus;
  requestedAt: string;
  lastHydratedAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  sessionUpdatedAt?: string | null;
  systemUpdatedAt?: string | null;
  includesSessionResources: boolean;
  includesPlayerCharacters: boolean;
  includesSystemRuntime: boolean;
  cachedCharacterIds: string[];
  resources: OfflineSessionResourceEntry[];
  characters: OfflineSessionCharacterEntry[];
}
