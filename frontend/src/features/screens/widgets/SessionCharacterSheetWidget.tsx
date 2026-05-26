import { useEffect, useMemo, useRef, useState } from 'react';
import AuthenticatedImage from '../../../components/AuthenticatedImage';
import SystemStudioV2Runtime, {
  applySystemStudioV2Formulas,
  buildInitialSystemStudioV2ValuesForViews,
  SystemStudioV2TemplateContext,
  SystemStudioV2Values
} from '../../../components/SystemStudioV2Runtime';
import { characterRepository, systemRepository } from '../../../data/repositories';
import { Character } from '../../../types/character';
import { SheetField } from '../../../types/characterSheet';
import { Session } from '../../../types/session';
import { GameSystem, SystemStudioViewDefinitionV2 } from '../../../types/system';
import { User } from '../../../types/user';
import { readRuntimeTargetState, subscribeRuntimeTargetState } from '../runtimeTargets';

type SessionCharacterSheetWidgetProps = {
  currentSession: Session;
  currentUser: User;
  role: 'gm' | 'player';
  templateId: string;
  widgetId: string;
  sourceMode?: 'auto_current' | 'explicit' | 'target';
  characterId?: string;
  characterLabel?: string;
  viewMode?: 'player' | 'gm';
  viewId?: string;
  showHeader?: boolean;
};

function canSeeCharacter(character: Character, currentUser: User, role: 'gm' | 'player') {
  return role === 'gm' || character.ownerUserId === currentUser.id;
}

function resolveCharacterStudioViewV2(system: GameSystem | null, character: Character | null): SystemStudioViewDefinitionV2 | null {
  const views = system?.studioSchemaV2?.views ?? [];
  if (!character || views.length === 0) {
    return null;
  }

  const byViewId = views.find((view) => view.id === character.viewId);
  if (byViewId) {
    return byViewId;
  }

  const byCreatedFrom = character.createdFromViewId ? views.find((view) => view.id === character.createdFromViewId) : null;
  if (byCreatedFrom) {
    return byCreatedFrom;
  }

  const bySheetName = character.sheet?.name ? views.find((view) => view.name === character.sheet?.name) : null;
  if (bySheetName) {
    return bySheetName;
  }

  const characterSheetViews = views.filter((view) => view.isCharacterSheet);
  if (characterSheetViews.length === 1) {
    return characterSheetViews[0];
  }

  return null;
}

function buildTemplateContext(params: {
  session: Session;
  system: GameSystem | null;
  character: Character | null;
  currentUser: User;
  role: 'gm' | 'player';
}): SystemStudioV2TemplateContext {
  const { session, system, character, currentUser, role } = params;
  const participants = session.participants ?? [];
  const ownerParticipant = character?.ownerUserId ? participants.find((item) => item.userId === character.ownerUserId) : null;
  const gmParticipant = participants.find((item) => item.userId === session.gmUserId || item.role === 'gm');
  const isOwnerReader = Boolean(character?.ownerUserId && character.ownerUserId === currentUser.id);
  return {
    nompj: character?.name || '',
    nompartie: session.name || '',
    nommj: gmParticipant?.nickname || gmParticipant?.displayName || session.gmUserId || '',
    nomjoueur: ownerParticipant?.displayName || character?.ownerUserId || currentUser.id,
    pseudojoueur: ownerParticipant?.nickname || character?.ownerUserId || currentUser.nickname || currentUser.id,
    nomsysteme: system?.name || '',
    datecreation: new Date().toISOString().slice(0, 10),
    rolelecteur: role,
    lecteurestmj: String(role === 'gm'),
    lecteurestjoueur: String(role !== 'gm'),
    lecteurestproprietaire: String(isOwnerReader)
  };
}

function buildViewerRuntimeContextValues(params: {
  character: Character | null;
  currentUser: User;
  role: 'gm' | 'player';
}): SystemStudioV2Values {
  const { character, currentUser, role } = params;
  const isOwnerReader = Boolean(character?.ownerUserId && character.ownerUserId === currentUser.id);
  return {
    role_lecteur: role,
    lecteur_est_mj: role === 'gm',
    lecteur_est_joueur: role !== 'gm',
    lecteur_est_proprietaire: isOwnerReader
  };
}

function parseOptions(options?: string[]): Array<{ key: string; label: string }> {
  return (options ?? []).map((option) => {
    const [rawKey, rawLabel] = option.split('=>').map((item) => item.trim());
    return {
      key: rawKey || option.trim(),
      label: rawLabel || rawKey || option.trim()
    };
  });
}

function buildSheetFieldsFromV2View(view: SystemStudioViewDefinitionV2, values: SystemStudioV2Values): SheetField[] {
  const groupId = `${view.id}_main`;
  const editableNodes = view.nodes.filter((node) => ['text', 'textarea', 'date', 'time', 'number', 'checkbox', 'select', 'multiselect', 'progress'].includes(node.type));

  return editableNodes.map((node): SheetField => {
    const value = values[node.key];

    if (node.type === 'number') {
      return {
        id: node.key,
        label: node.label,
        type: 'number',
        value: typeof value === 'number' ? value : Number(value) || 0,
        groupId
      };
    }

    if (node.type === 'progress') {
      return {
        id: node.key,
        label: node.label,
        type: 'resource',
        value: typeof value === 'number' ? value : Number(value) || 0,
        max: 100,
        groupId
      };
    }

    if (node.type === 'checkbox') {
      return {
        id: node.key,
        label: node.label,
        type: 'tag',
        value: Boolean(value) ? 'Oui' : 'Non',
        groupId
      };
    }

    if (node.type === 'select') {
      return {
        id: node.key,
        label: node.label,
        type: 'select',
        value: String(value ?? ''),
        options: parseOptions(node.options),
        groupId
      };
    }

    if (node.type === 'multiselect') {
      return {
        id: node.key,
        label: node.label,
        type: 'multiselect',
        value: Array.isArray(value) ? value.join(', ') : '',
        options: parseOptions(node.options),
        groupId
      };
    }

    return {
      id: node.key,
      label: node.label,
      type: node.type === 'textarea' ? 'textarea' : 'text',
      value: String(value ?? ''),
      groupId,
      ...(node.type === 'textarea' ? { rows: 4 } : {})
    };
  });
}

function hydrateV2ValuesFromCharacter(
  view: SystemStudioViewDefinitionV2 | null,
  character: Character | null,
  templateContext: SystemStudioV2TemplateContext,
  runtimeContextValues: SystemStudioV2Values,
  system: GameSystem | null
): SystemStudioV2Values {
  if (!view) {
    return runtimeContextValues;
  }
  const availableViews = system?.studioSchemaV2?.views ?? [view];
  const initialValues = {
    ...buildInitialSystemStudioV2ValuesForViews(availableViews, templateContext),
    ...runtimeContextValues
  };
  if (character?.runtimeValues && typeof character.runtimeValues === 'object') {
    return applySystemStudioV2Formulas(view, {
      ...initialValues,
      ...(character.runtimeValues as SystemStudioV2Values),
      ...runtimeContextValues
    }, availableViews, templateContext);
  }
  const fields = character?.sheet?.fields ?? [];
  const hydratedValues = fields.reduce<SystemStudioV2Values>((accumulator, field) => {
    const node = view.nodes.find((item) => item.key === field.id);
    if (!node) {
      return accumulator;
    }
    if (node.type === 'multiselect') {
      accumulator[node.key] = String(field.value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return accumulator;
    }
    if (node.type === 'number' || node.type === 'progress') {
      accumulator[node.key] = Number(field.value) || 0;
      return accumulator;
    }
    if (node.type === 'checkbox') {
      accumulator[node.key] = String(field.value).toLowerCase() === 'oui';
      return accumulator;
    }
    accumulator[node.key] = String(field.value ?? '');
    return accumulator;
  }, initialValues);
  return applySystemStudioV2Formulas(view, hydratedValues, availableViews, templateContext);
}

export default function SessionCharacterSheetWidget({
  currentSession,
  currentUser,
  role,
  templateId,
  widgetId,
  sourceMode = 'auto_current',
  characterId = '',
  characterLabel = '',
  viewMode = 'player',
  viewId = '',
  showHeader = true
}: SessionCharacterSheetWidgetProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState(characterId);
  const [targetCharacterId, setTargetCharacterId] = useState('');
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [fields, setFields] = useState<SheetField[]>([]);
  const [runtimeValuesV2, setRuntimeValuesV2] = useState<SystemStudioV2Values>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [runtimeScale, setRuntimeScale] = useState(1);
  const [runtimeScaledHeight, setRuntimeScaledHeight] = useState<number | null>(null);
  const latestSavePayloadRef = useRef<{
    session: Session;
    characterId: string;
    fields: SheetField[];
    runtimeValuesV2: SystemStudioV2Values;
  } | null>(null);
  const hasInitializedAutosaveRef = useRef(false);
  const lastSavedSignatureRef = useRef('');
  const saveInFlightRef = useRef(false);
  const queuedAutosaveRef = useRef(false);
  const runtimeViewportRef = useRef<HTMLDivElement | null>(null);
  const runtimeContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (sourceMode !== 'target') {
      setTargetCharacterId('');
      return () => undefined;
    }
    const syncTarget = () => {
      const targetState = readRuntimeTargetState({
        sessionId: currentSession.id,
        templateId,
        targetId: widgetId
      });
      if (targetState.content?.kind === 'character') {
        setTargetCharacterId(targetState.content.characterId);
        return;
      }
      setTargetCharacterId('');
    };
    syncTarget();
    return subscribeRuntimeTargetState(
      {
        sessionId: currentSession.id,
        templateId,
        targetId: widgetId
      },
      (targetState) => {
        if (targetState.content?.kind === 'character') {
          setTargetCharacterId(targetState.content.characterId);
          return;
        }
        setTargetCharacterId('');
      }
    );
  }, [currentSession.id, sourceMode, templateId, widgetId]);

  useEffect(() => {
    let mounted = true;
    async function loadSystem() {
      try {
        const loaded = await systemRepository.getById(currentSession.systemId);
        if (mounted) {
          setSystem(loaded);
        }
      } catch {
        if (mounted) {
          setSystem(null);
        }
      }
    }
    void loadSystem();
    return () => {
      mounted = false;
    };
  }, [currentSession.systemId]);

  useEffect(() => {
    let mounted = true;

    async function loadCharacters() {
      try {
        const items = await characterRepository.listForSession({
          sessionId: currentSession.id,
          role,
          currentUserId: currentUser.id,
          assignedCharacterId: currentSession.participants?.find((item) => item.userId === currentUser.id)?.characterId ?? null
        });
        if (!mounted) {
          return;
        }
        const visible = items
          .filter((character) => canSeeCharacter(character, currentUser, role))
          .filter((character) => (sourceMode === 'explicit' && viewId ? character.viewId === viewId || character.id === characterId : true));
        setCharacters(visible);
        const participantCharacterId =
          currentSession.participants?.find((participant) => participant.userId === currentUser.id)?.characterId ?? null;
        const fallbackId =
          sourceMode === 'target'
            ? targetCharacterId || ''
            : sourceMode === 'explicit'
            ? characterId || visible.find((item) => item.viewId === viewId)?.id || visible[0]?.id || ''
            : participantCharacterId || characterId || visible[0]?.id || '';
        setSelectedCharacterId((current) => {
          if (sourceMode === 'target') {
            return fallbackId;
          }
          return current && visible.some((item) => item.id === current) ? current : fallbackId;
        });
        setErrorMessage(null);
      } catch (error) {
        if (mounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les personnages.');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCharacters();
    return () => {
      mounted = false;
    };
  }, [characterId, currentSession.id, currentSession.participants, currentUser, role, sourceMode, targetCharacterId, viewId]);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId]
  );
  const selectedViewV2 = useMemo(
    () => resolveCharacterStudioViewV2(system, selectedCharacter),
    [selectedCharacter, system]
  );
  const templateContext = useMemo(
    () =>
      buildTemplateContext({
        session: currentSession,
        system,
        character: selectedCharacter,
        currentUser,
        role
      }),
    [currentSession, currentUser, role, selectedCharacter, system]
  );
  const runtimeContextValues = useMemo(
    () =>
      buildViewerRuntimeContextValues({
        character: selectedCharacter,
        currentUser,
        role
      }),
    [currentUser, role, selectedCharacter]
  );
  const canEditSheet = Boolean(selectedCharacter && (role === 'gm' || selectedCharacter.ownerUserId === currentUser.id));
  const runtimeBaseWidth = useMemo(() => {
    if (!selectedViewV2) {
      return 960;
    }
    return Math.max(720, selectedViewV2.gridColumns * 72);
  }, [selectedViewV2]);

  useEffect(() => {
    if (!selectedCharacter || !selectedViewV2) {
      setFields([]);
      setRuntimeValuesV2(runtimeContextValues);
      latestSavePayloadRef.current = null;
      lastSavedSignatureRef.current = '';
      hasInitializedAutosaveRef.current = false;
      return;
    }
    const hydratedValues = hydrateV2ValuesFromCharacter(selectedViewV2, selectedCharacter, templateContext, runtimeContextValues, system);
    const nextFields = buildSheetFieldsFromV2View(selectedViewV2, hydratedValues);
    setRuntimeValuesV2(hydratedValues);
    setFields(nextFields);
    latestSavePayloadRef.current = {
      session: currentSession,
      characterId: selectedCharacter.id,
      fields: nextFields,
      runtimeValuesV2: hydratedValues
    };
    lastSavedSignatureRef.current = JSON.stringify({
      characterId: selectedCharacter.id,
      fields: nextFields,
      runtimeValuesV2: hydratedValues
    });
    hasInitializedAutosaveRef.current = true;
  }, [currentSession, runtimeContextValues, selectedCharacter, selectedViewV2, system, templateContext]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }
    const timer = window.setTimeout(() => setStatusMessage(null), 2200);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    const viewport = runtimeViewportRef.current;
    const content = runtimeContentRef.current;
    if (!viewport || !content) {
      return;
    }

    const updateScale = () => {
      const viewportWidth = viewport.clientWidth;
      if (!viewportWidth) {
        return;
      }
      const nextScale = Math.min(1, Math.max(0.18, viewportWidth / runtimeBaseWidth));
      setRuntimeScale((current) => (Math.abs(current - nextScale) < 0.01 ? current : nextScale));
      setRuntimeScaledHeight(content.scrollHeight * nextScale);
    };

    updateScale();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateScale()) : null;
    observer?.observe(viewport);
    observer?.observe(content);
    return () => observer?.disconnect();
  }, [runtimeBaseWidth, runtimeValuesV2, selectedViewV2]);

  useEffect(() => {
    latestSavePayloadRef.current = selectedCharacter
      ? {
          session: currentSession,
          characterId: selectedCharacter.id,
          fields,
          runtimeValuesV2
        }
      : null;
  }, [currentSession, fields, runtimeValuesV2, selectedCharacter]);

  const handleRuntimeValuesChangeV2 = (nextValues: SystemStudioV2Values) => {
    const mergedValues = { ...nextValues, ...runtimeContextValues };
    setRuntimeValuesV2(mergedValues);
    if (!selectedViewV2) {
      return;
    }
    setFields(buildSheetFieldsFromV2View(selectedViewV2, mergedValues));
  };

  const runSave = async () => {
    const payload = latestSavePayloadRef.current;
    if (!payload || !canEditSheet) {
      return;
    }
    const signature = JSON.stringify({
      characterId: payload.characterId,
      fields: payload.fields,
      runtimeValuesV2: payload.runtimeValuesV2
    });
    if (signature === lastSavedSignatureRef.current) {
      return;
    }
    if (saveInFlightRef.current) {
      queuedAutosaveRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    setErrorMessage(null);
    try {
      const updated = await characterRepository.updateSheetFields({
        sessionId: payload.session.id,
        characterId: payload.characterId,
        fields: payload.fields,
        runtimeValues: payload.runtimeValuesV2
      });
      if (updated) {
        setCharacters((current) => current.map((character) => (character.id === updated.id ? updated : character)));
      }
      lastSavedSignatureRef.current = signature;
      setStatusMessage('Fiche enregistrée.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d’enregistrer la fiche.');
    } finally {
      saveInFlightRef.current = false;
      if (queuedAutosaveRef.current) {
        queuedAutosaveRef.current = false;
        void runSave();
      }
    }
  };

  useEffect(() => {
    if (!hasInitializedAutosaveRef.current || !canEditSheet || !selectedCharacter) {
      return;
    }
    const signature = JSON.stringify({
      characterId: selectedCharacter.id,
      fields,
      runtimeValuesV2
    });
    if (signature === lastSavedSignatureRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runSave();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [canEditSheet, fields, runtimeValuesV2, selectedCharacter]);

  if (isLoading) {
    return <p style={{ margin: 0 }}>Chargement de la fiche...</p>;
  }

  if (!selectedCharacter || !selectedCharacter.sheet) {
    if (sourceMode === 'target') {
      return <p style={{ margin: 0 }}>Aucune fiche ciblee pour ce widget.</p>;
    }
    return <p style={{ margin: 0 }}>Aucune fiche disponible pour ce widget.</p>;
  }

  const effectiveMode = role === 'gm' ? viewMode : 'player';

  return (
    <div className="session-character-sheet-widget">
      {showHeader ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'start' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {selectedCharacter.sheet.portraitUrl ? (
              <AuthenticatedImage src={selectedCharacter.sheet.portraitUrl} alt={selectedCharacter.name} className="profile-avatar" />
            ) : (
              <div className="profile-avatar">{selectedCharacter.name.slice(0, 2).toUpperCase()}</div>
            )}
            <div>
              <strong>{characterLabel || selectedCharacter.name}</strong>
              <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                Mode {effectiveMode.toUpperCase()} | {canEditSheet ? 'Edition active' : 'Lecture seule'}
              </div>
            </div>
          </div>
          <div className="session-character-sheet-widget__header-actions">
            {characters.length > 1 ? (
              <label style={{ display: 'grid', gap: '0.35rem', minWidth: '220px' }}>
                <span>Personnage</span>
                <select value={selectedCharacter.id} onChange={(event) => setSelectedCharacterId(event.target.value)}>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      {statusMessage ? <p style={{ margin: 0, color: '#93c5fd' }}>{statusMessage}</p> : null}
      {errorMessage ? <p style={{ margin: 0, color: '#fca5a5' }}>{errorMessage}</p> : null}

      {selectedViewV2 ? (
        <div className="session-character-sheet-widget__runtime">
          <div ref={runtimeViewportRef} className="session-character-sheet-widget__viewport">
            <div
              className="session-character-sheet-widget__canvas"
              style={{
                width: `${runtimeBaseWidth * runtimeScale}px`,
                minHeight: runtimeScaledHeight ? `${runtimeScaledHeight}px` : undefined
              }}
            >
              <div
                ref={runtimeContentRef}
                className="session-character-sheet-widget__canvas-content"
                style={{
                  width: `${runtimeBaseWidth}px`,
                  transform: `scale(${runtimeScale})`
                }}
              >
                <SystemStudioV2Runtime
                  view={selectedViewV2}
                  systemTheme={system?.studioTheme}
                  catalogs={system?.catalogs}
                  allViews={system?.studioSchemaV2?.views}
                  values={runtimeValuesV2}
                  onValuesChange={handleRuntimeValuesChangeV2}
                  editable={canEditSheet}
                  templateContext={templateContext}
                  sessionId={currentSession.id}
                  currentUserId={currentUser.id}
                  previewRowHeight={24}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0 }}>La vue Studio V2 de cette fiche est introuvable.</p>
      )}
    </div>
  );
}
