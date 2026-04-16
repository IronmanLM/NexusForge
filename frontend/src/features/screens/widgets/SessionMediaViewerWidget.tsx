import { useEffect, useState } from 'react';
import AuthenticatedImage from '../../../components/AuthenticatedImage';
import { resourceRepository } from '../../../data/repositories';
import { useProtectedResourceUrl } from '../../../hooks/useProtectedResourceUrl';
import { ResourceItem } from '../../../types/resource';
import { Session } from '../../../types/session';

type SessionMediaViewerWidgetProps = {
  currentSession: Session;
  resourceId?: string;
  url?: string;
  mode?: string;
  fit?: string;
  autoplay?: boolean;
};

function inferMediaMode(
  mode: string,
  resource: ResourceItem | null,
  source: string
): 'image' | 'video' | 'audio' {
  if (mode === 'video' || mode === 'audio' || mode === 'image') {
    return mode;
  }
  if (resource?.kind === 'video' || resource?.kind === 'audio' || resource?.kind === 'image') {
    return resource.kind;
  }
  const lowered = source.toLowerCase();
  if (/\.(mp4|webm|ogv)(\?|#|$)/.test(lowered)) {
    return 'video';
  }
  if (/\.(mp3|wav|ogg|oga|m4a)(\?|#|$)/.test(lowered)) {
    return 'audio';
  }
  return 'image';
}

export default function SessionMediaViewerWidget({
  currentSession,
  resourceId = '',
  url = '',
  mode = 'image',
  fit = 'contain',
  autoplay = false
}: SessionMediaViewerWidgetProps) {
  const [resource, setResource] = useState<ResourceItem | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!resourceId) {
        setResource(null);
        return;
      }
      const all = await resourceRepository.list();
      if (active) {
        setResource(all.find((item) => item.id === resourceId && (item.scopeRefId === currentSession.id || item.scopeType === 'account' || item.scopeType === 'system')) ?? null);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [currentSession.id, resourceId]);

  const source = resource?.contentUrl || url;
  const videoSrc = useProtectedResourceUrl(source, resource?.id);
  const effectiveMode = inferMediaMode(mode, resource, source);

  if (!source) {
    return <p style={{ margin: 0 }}>Aucun media selectionne.</p>;
  }

  if (effectiveMode === 'video') {
    if (!videoSrc) {
      return <p style={{ margin: 0 }}>Chargement de la video...</p>;
    }
    return <video src={videoSrc} controls autoPlay={autoplay} style={{ width: '100%', height: '100%', objectFit: fit as 'contain' | 'cover' | 'fill' }} />;
  }

  if (effectiveMode === 'audio') {
    if (!videoSrc) {
      return <p style={{ margin: 0 }}>Chargement de l audio...</p>;
    }
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', padding: '1rem' }}>
        <audio src={videoSrc} controls autoPlay={autoplay} style={{ width: '100%' }} />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <AuthenticatedImage
        src={source}
        resourceId={resource?.id}
        alt={resource?.name || 'Media'}
        style={{ width: '100%', height: '100%', objectFit: fit as 'contain' | 'cover' | 'fill' }}
      />
    </div>
  );
}
