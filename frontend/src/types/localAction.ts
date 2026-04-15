export type LocalActionEntityType =
  | 'system'
  | 'character'
  | 'session'
  | 'note'
  | 'message'
  | 'document'
  | 'resource'
  | 'resource_folder';

export type LocalActionSyncStatus = 'pending' | 'synced' | 'failed' | 'conflict';

export interface LocalAction {
  id: string;
  entityType: LocalActionEntityType;
  entityId: string;
  actionType: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
  syncStatus: LocalActionSyncStatus;
  retryCount: number;
  lastSyncAttemptAt?: string | null;
  syncedAt?: string | null;
  syncError?: string | null;
  conflictFields?: string[] | null;
  conflictServerValues?: Record<string, unknown> | null;
}
