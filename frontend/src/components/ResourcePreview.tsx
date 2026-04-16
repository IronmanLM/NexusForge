import { useEffect, useMemo, useState } from 'react';
import { offlineResourceFileRepository } from '../data/repositories';
import { buildApiUrl, getAccessToken } from '../services/apiClient';
import { ResourceItem, ResourceKind } from '../types/resource';
import AuthenticatedImage from './AuthenticatedImage';
import { useProtectedResourceUrl } from '../hooks/useProtectedResourceUrl';

type ResourcePreviewProps = {
  resource?: ResourceItem | null;
  src?: string | null;
  kind?: ResourceKind | null;
  mimeType?: string | null;
  alt?: string;
  className?: string;
  minHeight?: string;
  maxTextLength?: number;
};

function isProtectedUrl(src: string): boolean {
  return src.includes('/api/resources/');
}

function resolveSrc(src: string): string {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:') || src.startsWith('data:')) {
    return src;
  }
  if (src.startsWith('/')) {
    return buildApiUrl(src);
  }
  return src;
}

function inferKind(kind?: ResourceKind | null, mimeType?: string | null): ResourceKind {
  if (kind) {
    return kind;
  }
  if (!mimeType) {
    return 'text';
  }
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'text';
}

export default function ResourcePreview({
  resource,
  src,
  kind,
  mimeType,
  alt = 'Prévisualisation',
  className,
  minHeight = '220px',
  maxTextLength = 6000
}: ResourcePreviewProps) {
  const effectiveKind = inferKind(kind ?? resource?.kind ?? null, mimeType ?? resource?.mimeType ?? null);
  const effectiveSrc = useMemo(() => {
    const target =
      src ||
      (effectiveKind === 'image' ? resource?.previewUrl || resource?.contentUrl || '' : resource?.contentUrl || '');
    return target ? resolveSrc(target) : '';
  }, [resource?.contentUrl, resource?.previewUrl, src, effectiveKind]);
  const protectedMediaUrl = useProtectedResourceUrl(
    effectiveKind === 'pdf' || effectiveKind === 'video' || effectiveKind === 'audio' ? effectiveSrc : '',
    resource?.id
  );
  const [textContent, setTextContent] = useState('');
  const [textError, setTextError] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);

  useEffect(() => {
    if (!effectiveSrc || effectiveKind !== 'text') {
      setTextContent('');
      setTextError(null);
      setIsLoadingText(false);
      return;
    }

    let active = true;
    setIsLoadingText(true);
    setTextError(null);

    async function loadText() {
      try {
        let value = '';
        if (resource?.id) {
          const offlineFile = await offlineResourceFileRepository.get(resource.id);
          if (offlineFile) {
            value = await offlineFile.blob.text();
          }
        }
        if (!value) {
          const token = getAccessToken();
          const response = await fetch(effectiveSrc, {
            headers: isProtectedUrl(effectiveSrc) && token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          value = await response.text();
        }
        if (!active) {
          return;
        }
        setTextContent(value.length > maxTextLength ? `${value.slice(0, maxTextLength)}\n\n…` : value);
      } catch (error) {
        if (!active) {
          return;
        }
        setTextError(error instanceof Error ? error.message : 'Prévisualisation indisponible.');
      } finally {
        if (active) {
          setIsLoadingText(false);
        }
      }
    }

    void loadText();
    return () => {
      active = false;
    };
  }, [effectiveKind, effectiveSrc, maxTextLength, resource?.id]);

  if (!effectiveSrc) {
    return (
      <div className={className} style={{ minHeight, display: 'grid', placeItems: 'center', opacity: 0.75 }}>
        <small>Aucune ressource sélectionnée.</small>
      </div>
    );
  }

  if (effectiveKind === 'image') {
    return (
      <div className={className} style={{ minHeight, display: 'grid', placeItems: 'center' }}>
        <AuthenticatedImage
          src={effectiveSrc}
          alt={alt}
          resourceId={resource?.id}
          style={{ width: '100%', height: '100%', maxHeight: minHeight, objectFit: 'contain', borderRadius: '14px' }}
        />
      </div>
    );
  }

  if (effectiveKind === 'pdf') {
    if (!protectedMediaUrl) {
      return (
        <div className={className} style={{ minHeight, display: 'grid', placeItems: 'center' }}>
          <small>Chargement du PDF…</small>
        </div>
      );
    }
    return <iframe title={alt} src={`${protectedMediaUrl}#toolbar=0`} className={className} style={{ width: '100%', minHeight, border: 0, borderRadius: '14px', background: '#fff' }} />;
  }

  if (effectiveKind === 'video') {
    if (!protectedMediaUrl) {
      return (
        <div className={className} style={{ minHeight, display: 'grid', placeItems: 'center' }}>
          <small>Chargement de la vidéo…</small>
        </div>
      );
    }
    return <video src={protectedMediaUrl} controls className={className} style={{ width: '100%', minHeight, maxHeight: minHeight, borderRadius: '14px', background: '#020617', objectFit: 'contain' }} />;
  }

  if (effectiveKind === 'audio') {
    if (!protectedMediaUrl) {
      return (
        <div className={className} style={{ minHeight, display: 'grid', placeItems: 'center' }}>
          <small>Chargement de l audio…</small>
        </div>
      );
    }
    return (
      <div className={className} style={{ minHeight, display: 'grid', placeItems: 'center', padding: '1rem', borderRadius: '14px', background: '#020617' }}>
        <audio src={protectedMediaUrl} controls style={{ width: '100%' }} />
      </div>
    );
  }

  return (
    <div className={className} style={{ minHeight, borderRadius: '14px', background: 'rgba(15, 23, 42, 0.78)', border: '1px solid rgba(96, 165, 250, 0.18)', overflow: 'hidden' }}>
      {isLoadingText ? <div style={{ padding: '1rem' }}><small>Chargement du texte…</small></div> : null}
      {!isLoadingText && textError ? <div style={{ padding: '1rem', color: '#fca5a5' }}><small>{textError}</small></div> : null}
      {!isLoadingText && !textError ? (
        <pre style={{ margin: 0, padding: '1rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace', fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e2e8f0', minHeight }}>
          {textContent || 'Fichier texte vide.'}
        </pre>
      ) : null}
    </div>
  );
}
