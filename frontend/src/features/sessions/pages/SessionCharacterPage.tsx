import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const PRINT_BASE_WIDTH_PX = 1920;
const PRINT_A4_CONTENT_WIDTH_PX = 771;
const PRINT_A4_CONTENT_HEIGHT_PX = 1100;
const PRINT_WIDTH_SCALE = PRINT_A4_CONTENT_WIDTH_PX / PRINT_BASE_WIDTH_PX;
type PrintPageMode = 'single' | 'multiple';

async function waitForPrintableImages(root: HTMLElement | null, timeoutMs = 1400): Promise<void> {
  if (!root) {
    return;
  }
  const images = Array.from(root.querySelectorAll('img'));
  const pendingImages = images.filter((image) => !image.complete);
  if (!pendingImages.length) {
    return;
  }
  await Promise.race([
    Promise.all(
      pendingImages.map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          })
      )
    ),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    })
  ]);
}

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
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printPageMode, setPrintPageMode] = useState<PrintPageMode>('single');
  const [runtimeActiveTabs, setRuntimeActiveTabs] = useState<Record<string, string>>({});
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
  const printMeasureRef = useRef<HTMLDivElement | null>(null);
  const printTimeoutRef = useRef<number | null>(null);
  const [printScale, setPrintScale] = useState(PRINT_WIDTH_SCALE);
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
  const printTemplateContext = useMemo(
    () =>
      buildSessionCharacterTemplateContext({
        session,
        system,
        character,
        currentUserId: currentUser?.id || '',
        currentUserNickname: currentUser?.nickname,
        isGmReader: false
      }),
    [character, currentUser?.id, currentUser?.nickname, session, system]
  );
  const printRuntimeContextValues = useMemo(
    () =>
      buildSessionCharacterRuntimeContextValues({
        character,
        currentUserId: currentUser?.id || '',
        isGmReader: false
      }),
    [character, currentUser?.id]
  );
  const printRuntimeValuesV2 = useMemo(
    () => ({ ...runtimeValuesV2, ...printRuntimeContextValues }),
    [printRuntimeContextValues, runtimeValuesV2]
  );

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

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    document.body.classList.toggle('is-printing-character-sheet', isPrinting);
    document.body.classList.toggle('is-printing-character-sheet--multiple', isPrinting && printPageMode === 'multiple');
    if (!isPrinting) {
      return () => undefined;
    }
    const stopPrinting = () => setIsPrinting(false);
    window.addEventListener('afterprint', stopPrinting);
    return () => {
      if (printTimeoutRef.current !== null) {
        window.clearTimeout(printTimeoutRef.current);
        printTimeoutRef.current = null;
      }
      window.removeEventListener('afterprint', stopPrinting);
      document.body.classList.remove('is-printing-character-sheet');
      document.body.classList.remove('is-printing-character-sheet--multiple');
    };
  }, [isPrinting, printPageMode]);

  useEffect(() => {
    if ((!isPrintPreviewOpen && !isPrinting) || typeof window === 'undefined') {
      return;
    }
    let cancelled = false;
    const calculateAndPrint = async () => {
      await waitForPrintableImages(printMeasureRef.current);
      const measuredHeight = printMeasureRef.current?.scrollHeight ?? PRINT_A4_CONTENT_HEIGHT_PX;
      const heightScale = measuredHeight > 0 ? PRINT_A4_CONTENT_HEIGHT_PX / measuredHeight : PRINT_WIDTH_SCALE;
      const nextScale = printPageMode === 'single' ? Math.max(0.18, Math.min(1, PRINT_WIDTH_SCALE, heightScale)) : PRINT_WIDTH_SCALE;
      setPrintScale(nextScale);
      if (!isPrinting) {
        return;
      }
      printTimeoutRef.current = window.setTimeout(() => {
        if (!cancelled) {
          window.print();
        }
      }, 80);
    };
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(calculateAndPrint);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (printTimeoutRef.current !== null) {
        window.clearTimeout(printTimeoutRef.current);
        printTimeoutRef.current = null;
      }
    };
  }, [isPrintPreviewOpen, isPrinting, printPageMode, printRuntimeValuesV2, viewV2]);

  const handlePrint = () => {
    if (!viewV2 || !character) {
      return;
    }
    setPrintScale(PRINT_WIDTH_SCALE);
    setIsPrintPreviewOpen(true);
  };

  const handleConfirmPrint = () => {
    if (!viewV2 || !character) {
      return;
    }
    setPrintScale(printPageMode === 'multiple' ? PRINT_WIDTH_SCALE : printScale);
    setIsPrinting(true);
  };

  const characterSyncActions = character ? localActions.filter((action) => action.entityType === 'character' && action.entityId === character.id) : [];
  const isCharacterCachedOffline = Boolean(character && offlineBundle?.characters.some((item) => item.characterId === character.id));
  const canUsePrintPortal = typeof document !== 'undefined' && Boolean(document.body);
  const printScaleStyle = {
    '--character-sheet-print-scale': String(printScale),
    '--character-sheet-print-base-width': `${PRINT_BASE_WIDTH_PX}px`
  } as CSSProperties;
  const printableContent = (measure = false) => (
    <div ref={measure ? printMeasureRef : undefined} className="session-character-sheet-print-root__content">
      <SystemStudioV2Runtime
        view={viewV2}
        systemTheme={system?.studioTheme}
        catalogs={system?.catalogs}
        allViews={system?.studioSchemaV2?.views}
        values={printRuntimeValuesV2}
        editable={false}
        templateContext={printTemplateContext}
        sessionId={session?.id}
        currentUserId={currentUser?.id}
        flatMode
        activeTabs={runtimeActiveTabs}
      />
    </div>
  );
  const printContent = (isPrintPreviewOpen || isPrinting) && viewV2 && character ? (
    <>
      <main className={`session-character-sheet-print-root mode-${printPageMode}`} style={printScaleStyle}>
        <div className="session-character-sheet-print-root__page">
          {printableContent(true)}
        </div>
      </main>
      {isPrintPreviewOpen ? (
        <div className="resource-preview-modal session-character-print-preview" onClick={() => setIsPrintPreviewOpen(false)}>
          <section className="resource-preview-modal__dialog resource-preview-modal__dialog--wide session-character-print-preview__dialog" onClick={(event) => event.stopPropagation()}>
            <header className="resource-preview-modal__header">
              <div>
                <strong>Préparer l'impression</strong>
                <small>Rendu de l'onglet actif en largeur 1024px</small>
              </div>
              <Button type="button" variant="secondary" onClick={() => setIsPrintPreviewOpen(false)}>
                Fermer
              </Button>
            </header>
            <div className="session-character-print-preview__toolbar">
              <label className={printPageMode === 'single' ? 'is-active' : ''}>
                <input type="radio" name="character-print-mode" checked={printPageMode === 'single'} onChange={() => setPrintPageMode('single')} />
                <span>1 page</span>
              </label>
              <label className={printPageMode === 'multiple' ? 'is-active' : ''}>
                <input
                  type="radio"
                  name="character-print-mode"
                  checked={printPageMode === 'multiple'}
                  onChange={() => {
                    setPrintPageMode('multiple');
                    setPrintScale(PRINT_WIDTH_SCALE);
                  }}
                />
                <span>Plusieurs pages</span>
              </label>
              <Button type="button" onClick={handleConfirmPrint}>
                Imprimer
              </Button>
            </div>
            <div className={`session-character-print-preview__viewport mode-${printPageMode}`}>
              <div className="session-character-print-preview__paper" style={printScaleStyle}>
                {printableContent(false)}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  ) : null;

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
          <div className="session-character-page__actions">
            <Button type="button" variant="secondary" onClick={handlePrint} disabled={!character || !viewV2}>
              Imprimer
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving || !character}>
              {isSaving ? 'Enregistrement…' : 'Enregistrer la fiche'}
            </Button>
          </div>
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
            activeTabs={runtimeActiveTabs}
            onTabChange={(nodeId, tabId) =>
              setRuntimeActiveTabs((current) => ({
                ...current,
                [nodeId]: tabId
              }))
            }
          />
        ) : null}
        {canUsePrintPortal && printContent ? createPortal(printContent, document.body) : printContent}
      </section>
    </Layout>
  );
}
