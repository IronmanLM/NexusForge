import { offlineResourceFileRepository } from '../data/repositories';
import { getAccessToken } from './apiClient';
import { ResourceItem } from '../types/resource';

const objectUrlCache = new Map<string, string>();
const pendingBlobLoads = new Map<string, Promise<string>>();
const pendingPreloads = new Map<string, Promise<void>>();

function makeCacheKey(src: string, resourceId?: string | null): string {
  return resourceId ? `resource:${resourceId}` : `src:${src}`;
}

function needsAuthenticatedFetch(src: string): boolean {
  return src.includes('/api/resources/');
}

function canUseDirectSource(src: string, resourceId?: string | null): boolean {
  return Boolean(src) && !needsAuthenticatedFetch(src) && !resourceId;
}

function isPreloadableResource(resource: ResourceItem): boolean {
  if (!(resource.previewUrl || resource.thumbnailUrl || resource.contentUrl)) {
    return false;
  }
  if (resource.kind === 'video') {
    return false;
  }
  if (resource.kind === 'text') {
    return resource.sizeBytes <= 4 * 1024 * 1024;
  }
  return true;
}

async function loadObjectUrl(src: string, resourceId?: string | null): Promise<string> {
  if (!src) {
    return '';
  }

  if (canUseDirectSource(src, resourceId)) {
    return src;
  }

  const cacheKey = makeCacheKey(src, resourceId);
  const cached = objectUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const existing = pendingBlobLoads.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    if (resourceId) {
      const offlineFile = await offlineResourceFileRepository.get(resourceId);
      if (offlineFile) {
        const offlineObjectUrl = URL.createObjectURL(offlineFile.blob);
        objectUrlCache.set(cacheKey, offlineObjectUrl);
        return offlineObjectUrl;
      }
    }

    const token = getAccessToken();
    const response = await fetch(src, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    objectUrlCache.set(cacheKey, objectUrl);
    return objectUrl;
  })();

  pendingBlobLoads.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingBlobLoads.delete(cacheKey);
  }
}

async function warmDecodedImage(objectUrl: string): Promise<void> {
  if (typeof Image === 'undefined' || !objectUrl) {
    return;
  }
  await new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (typeof image.decode === 'function') {
        image.decode().catch(() => undefined).finally(() => resolve());
        return;
      }
      resolve();
    };
    image.onerror = () => resolve();
    image.src = objectUrl;
  });
}

export async function resolveProtectedResourceUrl(src: string | null | undefined, resourceId?: string | null): Promise<string> {
  if (!src) {
    return '';
  }
  return loadObjectUrl(src, resourceId);
}

export async function preloadProtectedResourceUrl(src: string | null | undefined, resourceId?: string | null): Promise<void> {
  if (!src) {
    return;
  }
  await loadObjectUrl(src, resourceId);
}

export async function preloadResourceItem(resource: ResourceItem | null | undefined): Promise<void> {
  if (!resource || !isPreloadableResource(resource)) {
    return;
  }
  const cacheKey = resource.id || resource.previewUrl || resource.thumbnailUrl || resource.contentUrl;
  if (!cacheKey) {
    return;
  }
  const existing = pendingPreloads.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const preloadSrc =
      resource.kind === 'image'
        ? resource.previewUrl || resource.thumbnailUrl || resource.contentUrl || ''
        : resource.contentUrl || '';
    const objectUrl = await loadObjectUrl(preloadSrc, resource.id);
    if (resource.kind === 'image') {
      await warmDecodedImage(objectUrl);
    }
  })();

  pendingPreloads.set(cacheKey, promise);
  try {
    await promise;
  } finally {
    pendingPreloads.delete(cacheKey);
  }
}

export async function preloadSessionResourceBatch(resources: ResourceItem[]): Promise<void> {
  const resourceEntries: Array<[string, ResourceItem]> = resources
    .filter(isPreloadableResource)
    .map((resource) => {
      const cacheKey = resource.id || resource.previewUrl || resource.thumbnailUrl || resource.contentUrl || '';
      return [cacheKey, resource];
    })
    .filter((entry): entry is [string, ResourceItem] => Boolean(entry[0]));
  const uniqueResources = Array.from(
    new Map(resourceEntries).values()
  );
  const concurrency = 4;
  let index = 0;

  async function worker() {
    while (index < uniqueResources.length) {
      const currentIndex = index;
      index += 1;
      await preloadResourceItem(uniqueResources[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueResources.length) }, () => worker()));
}
