import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/Button';
import AuthenticatedImage from '../../../components/AuthenticatedImage';
import { sessionRepository } from '../../../data/repositories';
import {
  readRuntimeTargetState,
  RuntimeTargetDescriptor,
  RuntimeTargetState,
  subscribeRuntimeTargetState,
  writeRuntimeTargetState
} from '../runtimeTargets';
import { SessionRuntimeConnection } from '../../../types/session';

type SessionOpenTargetControlWidgetProps = {
  sessionId: string;
  templateId: string;
  role: 'gm' | 'player';
  targetWidgetId?: string;
  targetChannelKey?: string;
  availableTargets: RuntimeTargetDescriptor[];
};

function recipientLabel(entry: SessionRuntimeConnection): string {
  return entry.nickname || entry.displayName || entry.userId;
}

function targetLocationLabel(target: RuntimeTargetDescriptor | null): string {
  if (!target) {
    return 'Non configuré';
  }
  return [target.screenName, target.tabName].filter(Boolean).join(' · ');
}

function nextPlaybackState(
  targetState: RuntimeTargetState | null,
  nextStatus?: 'playing' | 'paused' | 'stopped',
  nextLoop?: boolean
) {
  const current = targetState?.playback;
  return {
    status: nextStatus ?? current?.status ?? 'stopped',
    loop: typeof nextLoop === 'boolean' ? nextLoop : Boolean(current?.loop),
    commandToken: new Date().toISOString()
  } as const;
}

function normalizeRuntimeTargetState(value: unknown): RuntimeTargetState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<RuntimeTargetState>;
  return {
    visible: Boolean(raw.visible),
    content: raw.content ?? null,
    playback: raw.playback ?? null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()
  };
}

function isPlayableRuntimeState(state: RuntimeTargetState | null) {
  if (!state?.content || state.content.kind !== 'resource') {
    return false;
  }
  return state.content.resource.kind === 'video' || state.content.resource.kind === 'audio';
}

export default function SessionOpenTargetControlWidget({
  sessionId,
  templateId,
  role,
  targetWidgetId = '',
  targetChannelKey = 'primary',
  availableTargets
}: SessionOpenTargetControlWidgetProps) {
  const targetDescriptor = useMemo(
    () => availableTargets.find((target) => target.id === targetWidgetId && (target.widgetType === 'open_target_overlay' || target.widgetType === 'screen_viewer')) ?? null,
    [availableTargets, targetWidgetId]
  );
  const [targetState, setTargetState] = useState<RuntimeTargetState | null>(
    targetDescriptor ? readRuntimeTargetState({ sessionId, templateId, targetId: targetDescriptor.id }) : null
  );
  const [runtimeConnections, setRuntimeConnections] = useState<SessionRuntimeConnection[]>([]);
  const [selectedRecipientUserIds, setSelectedRecipientUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!targetDescriptor) {
      setTargetState(null);
      return () => undefined;
    }
    setTargetState(readRuntimeTargetState({ sessionId, templateId, targetId: targetDescriptor.id }));
    return subscribeRuntimeTargetState({ sessionId, templateId, targetId: targetDescriptor.id }, setTargetState);
  }, [sessionId, templateId, targetDescriptor]);

  useEffect(() => {
    if (role !== 'gm') {
      setRuntimeConnections([]);
      return () => undefined;
    }
    let active = true;
    const load = async () => {
      const items = await sessionRepository.listRuntimeConnections(sessionId).catch(() => []);
      if (active) {
        setRuntimeConnections(items);
      }
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 10_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [role, sessionId]);

  const remoteTargets = useMemo(() => {
    return runtimeConnections
      .filter((entry) => entry.role === 'player' && entry.active)
      .map((entry) => ({
        ...entry,
        overlayTarget:
          entry.availableOverlayTargets?.find((target) => (target.channelKey || 'primary') === targetChannelKey) ??
          entry.availableOverlayTargets?.[0] ??
          null
      }))
      .filter((entry) => Boolean(entry.overlayTarget && entry.templateId));
  }, [runtimeConnections, targetChannelKey]);

  useEffect(() => {
    if (role !== 'gm') {
      setSelectedRecipientUserIds([]);
      return;
    }
    setSelectedRecipientUserIds((current) => {
      const allowedIds = remoteTargets.map((entry) => entry.userId);
      const preserved = current.filter((id) => allowedIds.includes(id));
      return preserved.length > 0 ? preserved : allowedIds;
    });
  }, [remoteTargets, role]);

  if (!targetDescriptor && role !== 'gm') {
    return <p style={{ margin: 0 }}>Associe ce widget a un overlay cible.</p>;
  }

  const selectedRemoteTargets = useMemo(
    () => remoteTargets.filter((entry) => selectedRecipientUserIds.includes(entry.userId)),
    [remoteTargets, selectedRecipientUserIds]
  );

  const pushStateToRemoteTargets = (nextState: RuntimeTargetState) => {
    selectedRemoteTargets.forEach((entry) => {
      if (!entry.overlayTarget || !entry.templateId) {
        return;
      }
      writeRuntimeTargetState({
        sessionId,
        templateId: entry.templateId,
        targetId: entry.overlayTarget.targetId,
        state: nextState
      });
    });
  };

  const pushPlaybackCommandToRemoteTargets = async (command: {
    nextStatus?: 'playing' | 'paused' | 'stopped';
    nextLoop?: boolean;
  }) => {
    await Promise.all(
      selectedRemoteTargets.map(async (entry) => {
        if (!entry.overlayTarget || !entry.templateId) {
          return;
        }
        const currentRemoteState = normalizeRuntimeTargetState(
          await sessionRepository.readRuntimeTargetState({
            sessionId,
            templateId: entry.templateId,
            targetId: entry.overlayTarget.targetId
          }).catch(() => null)
        );
        if (!currentRemoteState?.content || currentRemoteState.content.kind !== 'resource') {
          return;
        }
        const resource = currentRemoteState.content.resource;
        if (resource.kind !== 'video' && resource.kind !== 'audio') {
          return;
        }
        writeRuntimeTargetState({
          sessionId,
          templateId: entry.templateId,
          targetId: entry.overlayTarget.targetId,
          state: {
            visible: true,
            content: currentRemoteState.content,
            playback: nextPlaybackState(currentRemoteState, command.nextStatus, command.nextLoop),
            updatedAt: new Date().toISOString()
          }
        });
      })
    );
  };

  const pushPlaybackCommandToLocalTarget = async (command: {
    nextStatus?: 'playing' | 'paused' | 'stopped';
    nextLoop?: boolean;
  }) => {
    if (!targetDescriptor) {
      return;
    }
    const currentLocalState = normalizeRuntimeTargetState(
      await Promise.resolve(readRuntimeTargetState({ sessionId, templateId, targetId: targetDescriptor.id })).catch(() => null)
    );
    if (!isPlayableRuntimeState(currentLocalState)) {
      return;
    }
    const playableLocalState = currentLocalState as RuntimeTargetState;
    writeRuntimeTargetState({
      sessionId,
      templateId,
      targetId: targetDescriptor.id,
      state: {
        visible: true,
        content: playableLocalState.content,
        playback: nextPlaybackState(playableLocalState, command.nextStatus, command.nextLoop),
        updatedAt: new Date().toISOString()
      }
    });
  };

  const targetContent = targetState?.content ?? null;
  const resourceContent = targetContent?.kind === 'resource' ? targetContent.resource : null;
  const isImageContent = resourceContent?.kind === 'image' && Boolean(resourceContent.thumbnailUrl || resourceContent.contentUrl);
  const isPlayableContent = resourceContent?.kind === 'video' || resourceContent?.kind === 'audio';
  const loopEnabled = Boolean(targetState?.playback?.loop);
  const localTargetPosition = targetLocationLabel(targetDescriptor);

  return (
    <div className="overlay-control-widget">
      {targetDescriptor ? (
        <>
          <div className="overlay-control-widget__header">
            <strong>{targetDescriptor.title}</strong>
            <small>Cible -&gt; {localTargetPosition}</small>
          </div>
          <div className="overlay-control-card">
            <div className="overlay-control-card__preview">
              {isImageContent ? (
                <AuthenticatedImage
                  src={resourceContent?.thumbnailUrl || resourceContent?.contentUrl || ''}
                  alt={targetContent?.title || 'Aperçu'}
                  resourceId={resourceContent?.id}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
                />
              ) : (
                <div className="overlay-control-card__fallback">
                  <strong>{targetContent?.title || 'Aucun contenu'}</strong>
                  {resourceContent?.name && resourceContent.name !== targetContent?.title ? <small>{resourceContent.name}</small> : null}
                </div>
              )}
            </div>
            <div className="overlay-control-card__content">
              <strong>{targetContent?.title || 'Aucun contenu'}</strong>
              {resourceContent?.name && resourceContent.name !== targetContent?.title ? <small>{resourceContent.name}</small> : null}
            </div>
            <div className="overlay-control-card__actions">
              <Button
                type="button"
                variant="secondary"
                aria-label={targetState?.visible ? 'Masquer cible' : 'Afficher cible'}
                title={targetState?.visible ? 'Masquer cible' : 'Afficher cible'}
                disabled={!targetContent}
                onClick={() =>
                  writeRuntimeTargetState({
                    sessionId,
                    templateId,
                    targetId: targetDescriptor.id,
                    state: {
                      visible: !(targetState?.visible ?? false),
                      content: targetContent,
                      playback: targetState?.playback ?? nextPlaybackState(targetState),
                      updatedAt: new Date().toISOString()
                    }
                  })
                }
                className="overlay-control-icon-button"
              >
                {targetState?.visible ? '◪' : '◫'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!targetContent || !isPlayableContent}
                onClick={() => void pushPlaybackCommandToLocalTarget({ nextStatus: 'playing' })}
                aria-label="Lire"
                title="Lire"
                className="overlay-control-icon-button"
              >
                ▶
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!targetContent || !isPlayableContent}
                onClick={() => void pushPlaybackCommandToLocalTarget({ nextStatus: 'stopped' })}
                aria-label="Pause / stop"
                title="Pause / stop"
                className="overlay-control-icon-button"
              >
                ■
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!targetContent || !isPlayableContent}
                onClick={() => void pushPlaybackCommandToLocalTarget({ nextLoop: !loopEnabled })}
                aria-label={loopEnabled ? 'Désactiver la boucle' : 'Activer la boucle'}
                title={loopEnabled ? 'Désactiver la boucle' : 'Activer la boucle'}
                className={`overlay-control-icon-button${loopEnabled ? ' is-active' : ''}`.trim()}
              >
                ↻
              </Button>
              <Button
                type="button"
                variant="secondary"
                aria-label="Vider overlay"
                title="Vider overlay"
                disabled={!targetContent}
                onClick={() =>
                  writeRuntimeTargetState({
                    sessionId,
                    templateId,
                    targetId: targetDescriptor.id,
                    state: {
                      visible: false,
                      content: null,
                      playback: nextPlaybackState(targetState, 'stopped', false),
                      updatedAt: new Date().toISOString()
                    }
                  })
                }
                className="overlay-control-icon-button"
              >
                ✕
              </Button>
            </div>
          </div>
        </>
      ) : null}
      {role === 'gm' ? (
        <section className="overlay-control-audience">
          <div className="overlay-control-audience__header">
            <strong>Audience joueurs</strong>
            <small>{remoteTargets.length} écran(s) ciblable(s)</small>
          </div>
          <small className="overlay-control-audience__channel">Canal: {targetChannelKey || 'primary'}</small>
          {remoteTargets.length ? (
            <>
              <div className="overlay-control-audience__toolbar">
                <div className="chat-widget__recipient-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setSelectedRecipientUserIds(remoteTargets.map((entry) => entry.userId))}
                  >
                    Tout
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setSelectedRecipientUserIds([])}
                    disabled={selectedRecipientUserIds.length === 0}
                  >
                    Aucun
                  </button>
                </div>
                <div className="overlay-control-audience__toolbar-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label="Afficher chez les joueurs"
                    title="Afficher chez les joueurs"
                    disabled={!targetContent || !selectedRemoteTargets.length}
                    onClick={() =>
                      pushStateToRemoteTargets({
                        visible: true,
                        content: targetContent,
                        playback: targetState?.playback ?? nextPlaybackState(targetState),
                        updatedAt: new Date().toISOString()
                      })
                    }
                  >
                    Prévisualiser
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label="Masquer chez les joueurs"
                    title="Masquer chez les joueurs"
                    disabled={!selectedRemoteTargets.length}
                    onClick={() =>
                      pushStateToRemoteTargets({
                        visible: false,
                        content: targetContent,
                        playback: targetState?.playback ?? nextPlaybackState(targetState),
                        updatedAt: new Date().toISOString()
                      })
                    }
                  >
                    Masquer
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!selectedRemoteTargets.length}
                    onClick={() => void pushPlaybackCommandToRemoteTargets({ nextStatus: 'playing' })}
                  >
                    Play
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!selectedRemoteTargets.length}
                    onClick={() => void pushPlaybackCommandToRemoteTargets({ nextStatus: 'stopped' })}
                  >
                    Pause / stop
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!selectedRemoteTargets.length}
                    onClick={() => void pushPlaybackCommandToRemoteTargets({ nextLoop: !loopEnabled })}
                  >
                    {loopEnabled ? 'Boucle on' : 'Boucle off'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label="Vider chez les joueurs"
                    title="Vider chez les joueurs"
                    disabled={!selectedRemoteTargets.length}
                    onClick={() =>
                      pushStateToRemoteTargets({
                        visible: false,
                        content: null,
                        playback: nextPlaybackState(targetState, 'stopped', false),
                        updatedAt: new Date().toISOString()
                      })
                    }
                  >
                    Fermer
                  </Button>
                </div>
              </div>
              <div className="chat-widget__recipient-list">
                {remoteTargets.map((entry) => {
                  const isSelected = selectedRecipientUserIds.includes(entry.userId);
                  return (
                    <label key={`${entry.userId}:${entry.overlayTarget?.targetId}`} className={`chat-recipient-item ${isSelected ? 'is-selected' : ''}`.trim()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(event) =>
                          setSelectedRecipientUserIds((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, entry.userId]))
                              : current.filter((id) => id !== entry.userId)
                          )
                        }
                      />
                      <span>{recipientLabel(entry)}</span>
                      <small>{entry.screenName || entry.setName || 'Écran'}</small>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <p style={{ margin: 0 }}>Aucun écran joueur connecté ne reçoit ce canal.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
