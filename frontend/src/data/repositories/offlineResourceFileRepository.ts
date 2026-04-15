import { db, ensureDatabaseIsInitialized } from '../db';
import { OfflineResourceFile } from '../../types/offline';

function nowIso() {
  return new Date().toISOString();
}

export const offlineResourceFileRepository = {
  async listAll(): Promise<OfflineResourceFile[]> {
    await ensureDatabaseIsInitialized();
    return db.offlineResourceFiles.toArray();
  },

  async get(resourceId: string): Promise<OfflineResourceFile | null> {
    await ensureDatabaseIsInitialized();
    return (await db.offlineResourceFiles.get(resourceId)) ?? null;
  },

  async put(params: {
    resourceId: string;
    mimeType: string;
    blob: Blob;
    sourceUrl?: string | null;
    updatedAt?: string | null;
  }): Promise<OfflineResourceFile> {
    await ensureDatabaseIsInitialized();
    const record: OfflineResourceFile = {
      resourceId: params.resourceId,
      mimeType: params.mimeType,
      blob: params.blob,
      sizeBytes: params.blob.size,
      sourceUrl: params.sourceUrl ?? null,
      downloadedAt: nowIso(),
      updatedAt: params.updatedAt ?? null
    };
    await db.offlineResourceFiles.put(record);
    return record;
  },

  async remove(resourceId: string): Promise<void> {
    await ensureDatabaseIsInitialized();
    await db.offlineResourceFiles.delete(resourceId);
  },

  async removeMany(resourceIds: string[]): Promise<void> {
    await ensureDatabaseIsInitialized();
    if (resourceIds.length === 0) {
      return;
    }
    await db.offlineResourceFiles.bulkDelete(resourceIds);
  }
};
