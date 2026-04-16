import { useEffect, useMemo, useRef, useState } from 'react';
import AuthenticatedImage from '../../../components/AuthenticatedImage';
import { resourceRepository } from '../../../data/repositories';
import { useProtectedResourceUrl } from '../../../hooks/useProtectedResourceUrl';
import { ResourceItem } from '../../../types/resource';
import { Session } from '../../../types/session';
import {
  readRuntimeTargetState,
  RuntimeTargetContent,
  RuntimeTargetPlaybackState,
  RuntimeTargetState,
  subscribeRuntimeTargetState
} from '../runtimeTargets';
import { traceRuntimeTarget } from '../runtimeTargetTrace';

type SessionScreenViewerWidgetProps = {
  currentSession: Session;
  templateId?: string;
  widgetId?: string;
  resourceId?: string;
  url?: string;
  mode?: string;
  fit?: string;
  autoplay?: boolean;
  loop?: boolean;
  showToolbar?: boolean;
  page?: number;
};

function inferDisplayMode(
  mode: string,
  resource: ResourceItem | null,
  source: string
): 'image' | 'video' | 'audio' | 'pdf' {
  if (mode === 'video' || mode === 'audio' || mode === 'image' || mode === 'pdf') {
    return mode;
  }
  if (resource?.kind === 'video' || resource?.kind === 'audio' || resource?.kind === 'image' || resource?.kind === 'pdf') {
    return resource.kind;
  }
  const lowered = source.toLowerCase();
  if (/\.(pdf)(\?|#|$)/.test(lowered)) {
    return 'pdf';
  }
  if (/\.(mp4|webm|ogv)(\?|#|$)/.test(lowered)) {
    return 'video';
  }
  if (/\.(mp3|wav|ogg|oga|m4a)(\?|#|$)/.test(lowered)) {
    return 'audio';
  }
  return 'image';
}

function emptyPlaybackState(): RuntimeTargetPlaybackState {
  return {
    status: 'stopped',
    loop: false,
    commandToken: new Date(0).toISOString()
  };
}

export default function SessionScreenViewerWidget({
  currentSession,
  templateId,
  widgetId,
  resourceId = '',
  url = '',
  mode = 'auto',
  fit = 'contain',
  autoplay = false,
  loop = false,
  showToolbar = true,
  page = 1
}: SessionScreenViewerWidgetProps) {
  const [resource, setResource] = useState<ResourceItem | null>(null);
  const [targetState, setTargetState] = useState<RuntimeTargetState | null>(() =>
    templateId && widgetId ? readRuntimeTargetState({ sessionId: currentSession.id, templateId, targetId: widgetId }) : null
  );
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const lastCommandTokenRef = useRef<string>('');
  const lastMediaIdentityRef = useRef<string>('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!resourceId) {
        setResource(null);
        return;
      }
      const all = await resourceRepository.list();
      if (active) {
        setResource(
          all.find((item) => item.id === resourceId && (item.scopeRefId === currentSession.id || item.scopeType === 'account' || item.scopeType === 'system')) ?? null
        );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [currentSession.id, resourceId]);

  useEffect(() => {
    if (!templateId || !widgetId) {
      setTargetState(null);
      return () => undefined;
    }
    setTargetState(readRuntimeTargetState({ sessionId: currentSession.id, templateId, targetId: widgetId }));
    return subscribeRuntimeTargetState({ sessionId: currentSession.id, templateId, targetId: widgetId }, setTargetState);
  }, [currentSession.id, templateId, widgetId]);

  const hasControlledState = Boolean(templateId && widgetId && targetState && targetState.updatedAt !== new Date(0).toISOString());
  const controlledContent = hasControlledState ? targetState?.content ?? null : null;
  const controlledResource = controlledContent?.kind === 'resource' ? controlledContent.resource : null;
  const effectiveVisible = hasControlledState ? Boolean(targetState?.visible) : true;
  const fallbackPlayback = useMemo<RuntimeTargetPlaybackState>(
    () => ({
      status: autoplay ? 'playing' : 'stopped',
      loop,
      commandToken: 'fallback'
    }),
    [autoplay, loop]
  );
  const playbackState = hasControlledState ? targetState?.playback ?? emptyPlaybackState() : fallbackPlayback;
  const rotationQuarterTurns = ((targetState?.rotationQuarterTurns ?? 0) % 4 + 4) % 4;

  const source = controlledResource?.contentUrl || resource?.contentUrl || url;
  const sourceResource = controlledResource || resource;
  const protectedSrc = useProtectedResourceUrl(source, sourceResource?.id);
  const effectiveMode = inferDisplayMode(mode, sourceResource, source);
  const mediaIdentity = `${effectiveMode}:${sourceResource?.id || protectedSrc || source}`;
  const rotatedStyle = {
    width: '100%',
    height: '100%',
    transform: rotationQuarterTurns ? `rotate(${rotationQuarterTurns * 90}deg)` : 'none',
    transformOrigin: 'center center'
  } as const;

  useEffect(() => {
    if (!mediaIdentity) {
      return;
    }
    if (lastMediaIdentityRef.current !== mediaIdentity) {
      lastMediaIdentityRef.current = mediaIdentity;
      lastCommandTokenRef.current = '';
    }
  }, [mediaIdentity]);

  useEffect(() => {
    const mediaElement = mediaRef.current;
    if (!mediaElement) {
      return;
    }
    mediaElement.loop = Boolean(playbackState.loop);
    traceRuntimeTarget({
      source: 'screen-viewer',
      sessionId: currentSession.id,
      templateId,
      targetId: widgetId,
      event: 'apply-loop',
      detail: {
        mediaIdentity,
        loop: Boolean(playbackState.loop)
      }
    });
  }, [playbackState.loop, mediaIdentity]);

  useEffect(() => {
    const mediaElement = mediaRef.current;
    if (!mediaElement || !playbackState.commandToken || playbackState.commandToken === lastCommandTokenRef.current) {
      return;
    }
    lastCommandTokenRef.current = playbackState.commandToken;
    traceRuntimeTarget({
      source: 'screen-viewer',
      sessionId: currentSession.id,
      templateId,
      targetId: widgetId,
      event: 'apply-command',
      detail: {
        mediaIdentity,
        status: playbackState.status,
        loop: playbackState.loop,
        commandToken: playbackState.commandToken
      }
    });

    if (playbackState.status === 'playing') {
      void mediaElement.play().catch(() => undefined);
      return;
    }

    mediaElement.pause();
    if (playbackState.status === 'stopped') {
      try {
        mediaElement.currentTime = 0;
      } catch {
        // ignore seek errors
      }
    }
  }, [playbackState.commandToken, playbackState.status, mediaIdentity]);

  useEffect(() => {
    const mediaElement = mediaRef.current;
    if (!mediaElement) {
      return;
    }
    const logEvent = (eventName: string) => {
      traceRuntimeTarget({
        source: 'screen-viewer',
        sessionId: currentSession.id,
        templateId,
        targetId: widgetId,
        event: `media-${eventName}`,
        detail: {
          mediaIdentity,
          currentTime: Number.isFinite(mediaElement.currentTime) ? mediaElement.currentTime : null,
          paused: mediaElement.paused,
          ended: mediaElement.ended,
          loop: mediaElement.loop,
          readyState: mediaElement.readyState
        }
      });
    };
    const handlePlay = () => logEvent('play');
    const handlePlaying = () => logEvent('playing');
    const handlePause = () => logEvent('pause');
    const handleEnded = () => logEvent('ended');
    const handleLoadedMetadata = () => logEvent('loadedmetadata');
    mediaElement.addEventListener('play', handlePlay);
    mediaElement.addEventListener('playing', handlePlaying);
    mediaElement.addEventListener('pause', handlePause);
    mediaElement.addEventListener('ended', handleEnded);
    mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      mediaElement.removeEventListener('play', handlePlay);
      mediaElement.removeEventListener('playing', handlePlaying);
      mediaElement.removeEventListener('pause', handlePause);
      mediaElement.removeEventListener('ended', handleEnded);
      mediaElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [currentSession.id, templateId, widgetId, mediaIdentity]);

  if (!effectiveVisible) {
    return <div style={{ width: '100%', height: '100%' }} />;
  }

  if (!source) {
    return <p style={{ margin: 0 }}>Aucun contenu sélectionné.</p>;
  }

  if (effectiveMode === 'pdf') {
    if (!protectedSrc) {
      return <p style={{ margin: 0 }}>Chargement du PDF...</p>;
    }
    const hash = `#page=${Math.max(1, page)}${showToolbar ? '' : '&toolbar=0'}`;
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        <iframe
          title={controlledContent?.title || sourceResource?.name || 'Lecteur PDF'}
          src={`${protectedSrc}${hash}`}
          style={{ ...rotatedStyle, border: 0, minHeight: '100%', background: '#fff' }}
        />
      </div>
    );
  }

  if (effectiveMode === 'video') {
    if (!protectedSrc) {
      return <p style={{ margin: 0 }}>Chargement de la vidéo...</p>;
    }
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
        <video
          ref={mediaRef as React.MutableRefObject<HTMLVideoElement | null>}
          src={protectedSrc}
          controls={showToolbar}
          autoPlay={playbackState.status === 'playing'}
          loop={playbackState.loop}
          style={{ ...rotatedStyle, objectFit: fit as 'contain' | 'cover' | 'fill', background: '#020617' }}
        />
      </div>
    );
  }

  if (effectiveMode === 'audio') {
    if (!protectedSrc) {
      return <p style={{ margin: 0 }}>Chargement de l audio...</p>;
    }
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', padding: '1rem' }}>
        <audio
          ref={mediaRef as React.MutableRefObject<HTMLAudioElement | null>}
          src={protectedSrc}
          controls={showToolbar}
          autoPlay={playbackState.status === 'playing'}
          loop={playbackState.loop}
          style={{ width: '100%' }}
        />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <AuthenticatedImage
        src={source}
        resourceId={sourceResource?.id}
        alt={controlledContent?.title || sourceResource?.name || 'Écran'}
        style={{ ...rotatedStyle, objectFit: fit as 'contain' | 'cover' | 'fill' }}
      />
    </div>
  );
}
