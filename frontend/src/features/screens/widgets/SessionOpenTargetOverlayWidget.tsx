import { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import { preloadResourceItem } from '../../../services/resourcePreloadService';
import {
  readRuntimeTargetState,
  RuntimeTargetState,
  subscribeRuntimeTargetState,
  writeRuntimeTargetState
} from '../runtimeTargets';
import { Session } from '../../../types/session';
import SessionScreenViewerWidget from './SessionScreenViewerWidget';

type SessionOpenTargetOverlayWidgetProps = {
  currentSession: Session;
  sessionId: string;
  templateId: string;
  widgetId: string;
};

export default function SessionOpenTargetOverlayWidget({
  currentSession,
  sessionId,
  templateId,
  widgetId
}: SessionOpenTargetOverlayWidgetProps) {
  const [targetState, setTargetState] = useState<RuntimeTargetState>(() =>
    readRuntimeTargetState({ sessionId, templateId, targetId: widgetId })
  );

  useEffect(() => {
    setTargetState(readRuntimeTargetState({ sessionId, templateId, targetId: widgetId }));
    return subscribeRuntimeTargetState({ sessionId, templateId, targetId: widgetId }, setTargetState);
  }, [sessionId, templateId, widgetId]);

  useEffect(() => {
    if (targetState.content?.kind !== 'resource') {
      return;
    }
    void preloadResourceItem(targetState.content.resource);
  }, [targetState.content]);

  if (!targetState.visible || !targetState.content) {
    return null;
  }

  return (
    <div className="screen-runtime-open-target-overlay">
      <div className="screen-runtime-open-target-overlay__toolbar">
        <strong>{targetState.content.title}</strong>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            writeRuntimeTargetState({
              sessionId,
              templateId,
              targetId: widgetId,
              state: {
                ...targetState,
                visible: false,
                updatedAt: new Date().toISOString()
              }
            })
          }
        >
          Fermer
        </Button>
      </div>
      <div className="screen-runtime-open-target-overlay__body">
        {targetState.content.kind === 'resource' ? (
          <SessionScreenViewerWidget
            currentSession={currentSession}
            templateId={templateId}
            widgetId={widgetId}
            mode="auto"
            fit="contain"
            showToolbar
          />
        ) : (
          <p style={{ margin: 0 }}>Ce type de contenu n est pas supporte par cet overlay.</p>
        )}
      </div>
    </div>
  );
}
