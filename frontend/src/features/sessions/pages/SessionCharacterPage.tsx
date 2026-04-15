import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import SyncStatusBadge, { resolveEntitySyncBadgeState } from '../../../components/SyncStatusBadge';
import SystemStudioV2Runtime, {
  applySystemStudioV2Formulas,
  buildInitialSystemStudioV2ValuesForViews,
  SystemStudioV2TemplateContext,
  SystemStudioV2Values
} from '../../../components/SystemStudioV2Runtime';
import { useAuth } from '../../../hooks/useAuth';
import { characterRepository, localActionRepository, offlineSessionRepository, sessionRepository, systemRepository } from '../../../data/repositories';
import { Character } from '../../../types/character';
import { SheetField } from '../../../types/characterSheet';
import { LocalAction } from '../../../types/localAction';
import { OfflineSessionBundle } from '../../../types/offline';
import { Session } from '../../../types/session';
import { GameSystem, SystemStudioViewDefinitionV2 } from '../../../types/system';

function canManageSession(session: Session, userId: string, userRoles: string[]): boolean {
  if (userRoles.includes('admin')) {
    return true;
  }
  return session.ownerUserId === userId || session.gmUserId === userId || (session.gmUserIds || []).includes(userId);
}

function resolveSessionRole(session: Session, user: { id: string; roles: string[] }): 'gm' | 'player' {
  const participant = session.participants?.find((item) => item.userId === user.id);
  if (participant?.role === 'gm') {
    return user.roles.includes('gm') || user.roles.includes('admin') ? 'gm' : 'player';
  }
  if (participant?.role === 'player' || participant?.role === 'observer') {
    return 'player';
  }
  if (session.ownerUserId === user.id || session.gmUserId === user.id || (session.gmUserIds || []).includes(user.id)) {
    return 'gm';
  }
  return 'player';
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

function buildSessionCharacterTemplateContext(params: {
  session: Session | null;
  system: GameSystem | null;
  character: Character | null;
  currentUserId: string;
  currentUserNickname?: string | null;
  isGmReader: boolean;
}): SystemStudioV2TemplateContext {
  const { session, system, character, currentUserId, currentUserNickname, isGmReader } = params;
  const participants = session?.participants ?? [];
  const ownerParticipant = character?.ownerUserId ? participants.find((item) => item.userId === character.ownerUserId) : null;
  const gmParticipant = participants.find((item) => item.userId === session?.gmUserId || item.role === 'gm');
  const isOwnerReader = Boolean(character?.ownerUserId && character.ownerUserId === currentUserId);
  return {
    nompj: character?.name || '',
    nompartie: session?.name || '',
    nommj: gmParticipant?.nickname || gmParticipant?.displayName || session?.gmUserId || '',
    nomjoueur: ownerParticipant?.displayName || character?.ownerUserId || currentUserId,
    pseudojoueur: ownerParticipant?.nickname || character?.ownerUserId || currentUserNickname || currentUserId,
    nomsysteme: system?.name || '',
    datecreation: new Date().toISOString().slice(0, 10),
    rolelecteur: isGmReader ? 'gm' : 'player',
    lecteurestmj: String(isGmReader),
    lecteurestjoueur: String(!isGmReader),
    lecteurestproprietaire: String(isOwnerReader)
  };
}

function buildSessionCharacterRuntimeContextValues(params: {
  character: Character | null;
  currentUserId: string;
  isGmReader: boolean;
}): SystemStudioV2Values {
  const { character, currentUserId, isGmReader } = params;
  const isOwnerReader = Boolean(character?.ownerUserId && character.ownerUserId === currentUserId);
  return {
    role_lecteur: isGmReader ? 'gm' : 'player',
    lecteur_est_mj: isGmReader,
    lecteur_est_joueur: !isGmReader,
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
  view: SystemStudioViewDefinitionV2,
  character: Character | null,
  templateContext: SystemStudioV2TemplateContext,
  runtimeContextValues: SystemStudioV2Values,
  system: GameSystem | null
): SystemStudioV2Values {
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

export default function SessionCharacterPage() {
  const { sessionId = '', characterId = '' } = useParams();
  const { currentUser } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [viewV2, setViewV2] = useState<SystemStudioViewDefinitionV2 | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [fields, setFields] = useState<SheetField[]>([]);
  const [runtimeValuesV2, setRuntimeValuesV2] = useState<SystemStudioV2Values>({});
  const [localActions, setLocalActions] = useState<LocalAction[]>([]);
  const [offlineBundle, setOfflineBundle] = useState<OfflineSessionBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const latestSavePayloadRef = useRef<{
    session: Session | null;
    character: Character | null;
    fields: SheetField[];
    runtimeValuesV2: SystemStudioV2Values;
  }>({
    session: null,
    character: null,
    fields: [],
    runtimeValuesV2: {}
  });
  const hasInitializedAutosaveRef = useRef(false);
  const lastSavedSignatureRef = useRef('');
  const saveInFlightRef = useRef(false);
  const queuedAutosaveRef = useRef(false);
  const canReadAsGm = Boolean(session && currentUser && resolveSessionRole(session, currentUser) === 'gm');
  const templateContext = buildSessionCharacterTemplateContext({
    session,
    system,
    character,
    currentUserId: currentUser?.id || '',
    currentUserNickname: currentUser?.nickname,
    isGmReader: canReadAsGm
  });
  const runtimeContextValues = buildSessionCharacterRuntimeContextValues({
    character,
    currentUserId: currentUser?.id || '',
    isGmReader: canReadAsGm
  });

  useEffect(() => {
    latestSavePayloadRef.current = {
      session,
      character,
      fields,
      runtimeValuesV2
    };
  }, [character, fields, runtimeValuesV2, session]);

  useEffect(() => {
    let mounted = true;
    hasInitializedAutosaveRef.current = false;
    async function loadPage() {
      const activeUser = currentUser;
      if (!activeUser) {
        return;
      }
      try {
        const loadedSession = await sessionRepository.getById(sessionId);
        if (!loadedSession || !mounted) {
          setSession(loadedSession);
          setCharacter(null);
          return;
        }
        const role = resolveSessionRole(loadedSession, currentUser);
        const [items, loadedSystem, loadedActions, loadedOfflineBundle] = await Promise.all([
          characterRepository.listForSession({
            sessionId,
            role,
            currentUserId: currentUser.id,
            assignedCharacterId: loadedSession.participants?.find((item) => item.userId === currentUser.id)?.characterId ?? null
          }),
          systemRepository.getById(loadedSession.systemId),
          localActionRepository.listAll(),
          offlineSessionRepository.get(sessionId)
        ]);
        if (!mounted) {
          return;
        }
        const loadedCharacter = items.find((item) => item.id === characterId) ?? null;
        const loadedViewV2 = resolveCharacterStudioViewV2(loadedSystem, loadedCharacter);
        const currentFields = loadedCharacter?.sheet?.fields.map((field) => ({ ...field })) ?? [];
        const runtimeContext = buildSessionCharacterTemplateContext({
          session: loadedSession,
          system: loadedSystem,
          character: loadedCharacter,
          currentUserId: activeUser.id,
          currentUserNickname: activeUser.nickname,
          isGmReader: role === 'gm'
        });
        const runtimeFlags = buildSessionCharacterRuntimeContextValues({
          character: loadedCharacter,
          currentUserId: activeUser.id,
          isGmReader: role === 'gm'
        });
        setSession(loadedSession);
        setSystem(loadedSystem);
        setViewV2(loadedViewV2);
        setCharacter(loadedCharacter);
        setFields(currentFields);
        setLocalActions(loadedActions);
        setOfflineBundle(loadedOfflineBundle);
        const hydratedRuntimeValues =
          loadedViewV2 ? hydrateV2ValuesFromCharacter(loadedViewV2, loadedCharacter, runtimeContext, runtimeFlags, loadedSystem) : runtimeFlags;
        setRuntimeValuesV2(hydratedRuntimeValues);
        latestSavePayloadRef.current = {
          session: loadedSession,
          character: loadedCharacter,
          fields: currentFields,
          runtimeValuesV2: hydratedRuntimeValues
        };
        lastSavedSignatureRef.current = JSON.stringify({
          fields: currentFields,
          runtimeValuesV2: hydratedRuntimeValues
        });
        hasInitializedAutosaveRef.current = true;
      } catch (error) {
        if (mounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger la fiche.');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }
    void loadPage();
    return () => {
      mounted = false;
    };
  }, [characterId, currentUser, sessionId]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const handleRuntimeValuesChangeV2 = (nextValues: SystemStudioV2Values) => {
    const mergedValues = { ...nextValues, ...runtimeContextValues };
    setRuntimeValuesV2(mergedValues);
    if (!viewV2) {
      return;
    }
    setFields(buildSheetFieldsFromV2View(viewV2, mergedValues));
  };

  const runSave = async (mode: 'manual' | 'auto') => {
    const payload = latestSavePayloadRef.current;
    if (!payload.session || !payload.character) {
      return;
    }
    const signature = JSON.stringify({
      fields: payload.fields,
      runtimeValuesV2: payload.runtimeValuesV2
    });
    if (mode === 'auto' && signature === lastSavedSignatureRef.current) {
      return;
    }
    if (saveInFlightRef.current) {
      if (mode === 'auto') {
        queuedAutosaveRef.current = true;
      }
      return;
    }
    saveInFlightRef.current = true;
    setIsSaving(true);
    setErrorMessage(null);
    if (mode === 'manual') {
      setStatusMessage(null);
    }
    try {
      const updated = await characterRepository.updateSheetFields({
        sessionId: payload.session.id,
        characterId: payload.character.id,
        fields: payload.fields,
        runtimeValues: payload.runtimeValuesV2
      });
      if (updated) {
        setCharacter(updated);
        setFields(updated.sheet?.fields.map((field) => ({ ...field })) ?? []);
      }
      const latestActions = await localActionRepository.listAll();
      const latestOfflineBundle = await offlineSessionRepository.get(payload.session.id);
      setLocalActions(latestActions);
      setOfflineBundle(latestOfflineBundle);
      lastSavedSignatureRef.current = signature;
      setStatusMessage(
        navigator.onLine
          ? mode === 'manual'
            ? 'Fiche enregistrée.'
            : 'Fiche enregistrée automatiquement.'
          : 'Fiche enregistrée localement. Elle sera synchronisée au retour en ligne.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d’enregistrer la fiche.');
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      if (queuedAutosaveRef.current) {
        queuedAutosaveRef.current = false;
        void runSave('auto');
      }
    }
  };

  const handleSave = async () => {
    await runSave('manual');
  };

  useEffect(() => {
    if (!hasInitializedAutosaveRef.current || !session || !character) {
      return;
    }
    const signature = JSON.stringify({
      fields,
      runtimeValuesV2
    });
    if (signature === lastSavedSignatureRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runSave('auto');
    }, 900);
    return () => window.clearTimeout(timer);
  }, [character, fields, runtimeValuesV2, session]);

  const characterSyncActions = character ? localActions.filter((action) => action.entityType === 'character' && action.entityId === character.id) : [];
  const isCharacterCachedOffline = Boolean(character && offlineBundle?.characters.some((item) => item.characterId === character.id));

  return (
    <Layout wide>
      <section className="card session-section">
        <div className="session-section__header">
          <div>
            <p className="home-section__eyebrow" style={{ marginBottom: '0.4rem' }}>FICHE PERSONNAGE</p>
            <h1 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{character?.name || 'Fiche introuvable'}</h1>
            <p style={{ marginBottom: 0 }}>
              {session ? (
                <>
                  Partie <strong>{session.name}</strong>
                  {' '}·{' '}
                  <Link to={`/sessions/${session.id}`}>Retour à la partie</Link>
                </>
              ) : (
                'Chargement de la partie…'
              )}
            </p>
            {character ? (
              <p style={{ marginTop: '0.35rem', marginBottom: 0, opacity: 0.8 }}>
                Vue liée : <strong>{viewV2?.name || character.viewId}</strong>
              </p>
            ) : null}
            {character ? (
              <div className="sync-status-stack" style={{ marginTop: '0.65rem' }}>
                <SyncStatusBadge
                  state={resolveEntitySyncBadgeState(characterSyncActions)}
                  title="État de synchronisation de la fiche"
                />
                {isCharacterCachedOffline ? <span className="offline-cache-badge">Disponible hors ligne</span> : null}
              </div>
            ) : null}
          </div>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving || !character}>
            {isSaving ? 'Enregistrement…' : 'Enregistrer la fiche'}
          </Button>
        </div>
        {statusMessage ? <p className="home-alert home-alert--success">{statusMessage}</p> : null}
        {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}
        {isLoading ? <p>Chargement…</p> : null}
        {!isLoading && !character ? <p>Aucune fiche accessible pour ce personnage.</p> : null}
        {!isLoading && character && !viewV2 ? <p>La vue Studio V2 associée à cette fiche est introuvable dans le système.</p> : null}
        {viewV2 ? (
          <SystemStudioV2Runtime
            view={viewV2}
            systemTheme={system?.studioTheme}
            catalogs={system?.catalogs}
            allViews={system?.studioSchemaV2?.views}
            values={runtimeValuesV2}
            onValuesChange={handleRuntimeValuesChangeV2}
            editable
            templateContext={templateContext}
            sessionId={session?.id}
            currentUserId={currentUser?.id}
          />
        ) : null}
      </section>
    </Layout>
  );
}
