import { offlineResourceFileRepository } from '../data/repositories';
import { buildApiUrl, getAccessToken } from './apiClient';

function resolveUrl(src: string): string {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:') || src.startsWith('data:')) {
    return src;
  }
  if (src.startsWith('/')) {
    return buildApiUrl(src);
  }
  return src;
}

export async function resolveOfflineCapableObjectUrl(params: {
  resourceId?: string | null;
  src?: string | null;
}): Promise<string> {
  const source = (params.src ?? '').trim();

  if (params.resourceId) {
    const offlineFile = await offlineResourceFileRepository.get(params.resourceId);
    if (offlineFile) {
      return URL.createObjectURL(offlineFile.blob);
    }
  }

  if (!source) {
    throw new Error('Aucune ressource à ouvrir.');
  }

  const target = resolveUrl(source);
  const token = getAccessToken();
  const response = await fetch(target, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function openOfflineCapableResourceInNewTab(params: {
  resourceId?: string | null;
  src?: string | null;
}): Promise<void> {
  const objectUrl = await resolveOfflineCapableObjectUrl(params);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 60_000);
}
