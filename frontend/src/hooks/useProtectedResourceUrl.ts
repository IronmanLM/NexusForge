import { useEffect, useState } from 'react';
import { resolveProtectedResourceUrl } from '../services/resourcePreloadService';

export function useProtectedResourceUrl(src: string | null | undefined, resourceId?: string | null) {
  const [resolvedSrc, setResolvedSrc] = useState('');

  useEffect(() => {
    if (!src) {
      setResolvedSrc('');
      return;
    }
    const targetSrc = src;

    let active = true;

    async function loadProtectedResource() {
      try {
        const resolved = await resolveProtectedResourceUrl(targetSrc, resourceId);
        if (active) {
          setResolvedSrc(resolved);
        }
      } catch {
        if (active) {
          setResolvedSrc('');
        }
      }
    }

    void loadProtectedResource();
    return () => {
      active = false;
    };
  }, [resourceId, src]);

  return resolvedSrc;
}
