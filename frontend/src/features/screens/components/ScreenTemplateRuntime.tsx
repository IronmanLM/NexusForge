import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/Button';
import { resourceRepository } from '../../../data/repositories';
import { ResourceItem } from '../../../types/resource';
import { Session } from '../../../types/session';
import { User } from '../../../types/user';
import { ScreenDefinition, ScreenSetDefinition, ScreenTemplate } from '../../../types/screenTemplate';
import { asBoolean, widgetPreviewContent, widgetTypeLabel } from '../screenWidgetCatalog';
import SessionChatScreenWidget from '../widgets/SessionChatScreenWidget';
import SessionCharacterSheetWidget from '../widgets/SessionCharacterSheetWidget';
import SessionCharacterListWidget from '../widgets/SessionCharacterListWidget';
import SessionClockWidget from '../widgets/SessionClockWidget';
import SessionDiceHistoryWidget from '../widgets/SessionDiceHistoryWidget';
import SessionAlertOverlayWidget from '../widgets/SessionAlertOverlayWidget';
import SessionDocumentsScreenWidget from '../widgets/SessionDocumentsScreenWidget';
import SessionInitiativeScreenWidget from '../widgets/SessionInitiativeScreenWidget';
import SessionJournalWidget from '../widgets/SessionJournalWidget';
import SessionMediaViewerWidget from '../widgets/SessionMediaViewerWidget';
import SessionNotesScreenWidget from '../widgets/SessionNotesScreenWidget';
import SessionOpenTargetControlWidget from '../widgets/SessionOpenTargetControlWidget';
import SessionOpenTargetOverlayWidget from '../widgets/SessionOpenTargetOverlayWidget';
import SessionParticipantPresenceWidget from '../widgets/SessionParticipantPresenceWidget';
import SessionPdfViewerWidget from '../widgets/SessionPdfViewerWidget';
import { RuntimeTargetDescriptor } from '../runtimeTargets';
import { ensureScreenFormatForScreen, ensureScreenSetFormat, screenFormatSummary } from '../screenSetPresets';
import { buildApiUrl, getAccessToken } from '../../../services/apiClient';
import { preloadResourceItem, preloadSessionResourceBatch } from '../../../services/resourcePreloadService';

function devicePresetLabel(devicePreset: ScreenSetDefinition['devicePreset']): string {
  switch (devicePreset) {
    case 'desktop_2':
      return 'PC 2 ecrans';
    case 'desktop_3':
      return 'PC 3 ecrans';
    case 'tablet':
      return 'Tablette';
    case 'mobile':
      return 'Telephone mobile';
    case 'desktop_1':
    default:
      return 'PC 1 ecran';
  }
}

type ScreenTemplateRuntimeProps = {
  session: Session;
  template: ScreenTemplate;
  currentUser: User;
  role: 'gm' | 'player';
  detachedScreenId?: string | null;
  initialSetId?: string | null;
  autoFullscreen?: boolean;
};

function splitRuntimeScreens(selectedSet: ScreenSetDefinition | null, detachedScreenId?: string | null): {
  mainScreens: ScreenDefinition[];
  detachedScreens: ScreenDefinition[];
} {
  if (!selectedSet) {
    return { mainScreens: [], detachedScreens: [] };
  }

  if (detachedScreenId) {
    return {
      mainScreens: selectedSet.screens.filter((screen) => screen.id === detachedScreenId),
      detachedScreens: []
    };
  }

  const explicitMain = selectedSet.screens.find((screen) => screen.mode === 'main') ?? selectedSet.screens[0] ?? null;
  if (!explicitMain) {
    return { mainScreens: [], detachedScreens: [] };
  }

  return {
    mainScreens: [explicitMain],
    detachedScreens: selectedSet.screens.filter((screen) => screen.id !== explicitMain.id)
  };
}

function collectReferencedResourceIds(selectedSet: ScreenSetDefinition | null): string[] {
  const ids = new Set<string>();
  for (const screen of selectedSet?.screens ?? []) {
    for (const group of screen.tabGroups) {
      for (const widget of group.widgets) {
        const resourceId = typeof widget.dataSource?.resourceId === 'string' ? widget.dataSource.resourceId.trim() : '';
        if (resourceId) {
          ids.add(resourceId);
        }
      }
    }
  }
  return Array.from(ids);
}

export default function ScreenTemplateRuntime({ session, template, currentUser, role, detachedScreenId, initialSetId, autoFullscreen = false }: ScreenTemplateRuntimeProps) {
  const [selectedSetId, setSelectedSetId] = useState(initialSetId && template.sets.some((set) => set.id === initialSetId) ? initialSetId : template.sets[0]?.id ?? '');
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const runtimeRef = useRef<HTMLElement | null>(null);

  const selectedSet = useMemo(() => template.sets.find((set) => set.id === selectedSetId) ?? template.sets[0] ?? null, [selectedSetId, template.sets]);
  const { mainScreens: screens, detachedScreens } = useMemo(
    () => splitRuntimeScreens(selectedSet, detachedScreenId),
    [detachedScreenId, selectedSet]
  );
  const runtimeTargets = useMemo<RuntimeTargetDescriptor[]>(() => buildRuntimeTargets(selectedSet), [selectedSet]);
  const referencedResourceIds = useMemo(() => collectReferencedResourceIds(selectedSet), [selectedSet]);

  useEffect(() => {
    if (!selectedSet) {
      setSelectedSetId('');
      return;
    }
    if (!template.sets.some((set) => set.id === selectedSetId)) {
      setSelectedSetId(selectedSet.id);
    }
  }, [selectedSet, selectedSetId, template.sets]);

  useEffect(() => {
    if (initialSetId && template.sets.some((set) => set.id === initialSetId) && initialSetId !== selectedSetId) {
      setSelectedSetId(initialSetId);
    }
  }, [initialSetId, selectedSetId, template.sets]);

  useEffect(() => {
    setActiveTabs((current) => {
      const next = { ...current };
      for (const screen of selectedSet?.screens ?? []) {
        const defaultGroup = screen.tabGroups.find((group) => group.isDefault) ?? screen.tabGroups[0];
        if (!next[screen.id] || !screen.tabGroups.some((group) => group.id === next[screen.id])) {
          next[screen.id] = defaultGroup?.id ?? '';
        }
      }
      return next;
    });
  }, [selectedSet]);

  useEffect(() => {
    if (!detachedScreenId) {
      return;
    }
    const screenName = screens[0]?.name || 'Ecran detache';
    const previousTitle = document.title;
    document.title = `${session.name} - ${screenName}`;
    return () => {
      document.title = previousTitle;
    };
  }, [detachedScreenId, screens, session.name]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === runtimeRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!autoFullscreen || detachedScreenId || isFullscreen) {
      return;
    }
    const timer = window.setTimeout(() => {
      void enterFullscreen();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [autoFullscreen, detachedScreenId, isFullscreen]);

  useEffect(() => {
    const sendPresence = (active: boolean, keepalive = false) => {
      const token = getAccessToken();
      void fetch(buildApiUrl(`/api/sessions/${session.id}/runtime/presence`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          active,
          templateId: template.id,
          setId: selectedSet?.id ?? null,
          detachedScreenId: detachedScreenId ?? null,
          role
        }),
        keepalive
      }).catch(() => undefined);
    };

    sendPresence(true);
    const interval = window.setInterval(() => sendPresence(true), 15_000);
    const handlePageHide = () => sendPresence(false, true);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      sendPresence(false, true);
    };
  }, [detachedScreenId, role, selectedSet?.id, session.id, template.id]);

  useEffect(() => {
    let active = true;

    async function warmRuntimeResources() {
      try {
        const [sessionResources, allResources] = await Promise.all([
          resourceRepository.list({ scopeType: 'session', scopeRefId: session.id }),
          referencedResourceIds.length > 0 ? resourceRepository.list() : Promise.resolve([] as ResourceItem[])
        ]);
        if (!active) {
          return;
        }
        const referencedResources = referencedResourceIds.length > 0
          ? allResources.filter((resource) => referencedResourceIds.includes(resource.id))
          : [];
        await Promise.all([
          preloadSessionResourceBatch(sessionResources),
          ...referencedResources.map((resource) => preloadResourceItem(resource))
        ]);
      } catch {
        // Préchargement opportuniste : ne pas bloquer le runtime.
      }
    }

    void warmRuntimeResources();
    return () => {
      active = false;
    };
  }, [referencedResourceIds, session.id]);

  const enterFullscreen = async () => {
    if (!runtimeRef.current || document.fullscreenElement === runtimeRef.current) {
      return;
    }
    await runtimeRef.current.requestFullscreen();
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  };

  if (!selectedSet) {
    return (
      <section className="card">
        <p>Aucun set d ecran disponible dans ce template.</p>
      </section>
    );
  }

  return (
    <section ref={runtimeRef} className={`screen-runtime${isFullscreen ? ' is-fullscreen' : ''}`.trim()}>
      {!isFullscreen ? (
        <section className="screen-runtime-toolbar">
        <div className="screen-runtime-toolbar__title">
          <div>
            <h1>{screens[0]?.name || template.name}</h1>
            <p>
              {session.name} · {template.name}
            </p>
          </div>
          <div className="screen-runtime-set-badge-group">
            <span className="screen-runtime-set-badge">{selectedSet.name}</span>
            <span className="screen-runtime-set-badge screen-runtime-set-badge--secondary">{devicePresetLabel(selectedSet.devicePreset)}</span>
            {screens[0] ? (
              <span className="screen-runtime-set-badge screen-runtime-set-badge--secondary">
                {screenFormatSummary(ensureScreenFormatForScreen(screens[0], selectedSet))}
              </span>
            ) : null}
          </div>
        </div>
        {!detachedScreenId ? (
          <div className="screen-runtime-toolbar__actions">
            <label className="screen-runtime-toolbar__select">
              <span>Affichage</span>
              <select value={selectedSet.id} onChange={(event) => setSelectedSetId(event.target.value)}>
                {template.sets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name} · {devicePresetLabel(set.devicePreset)} · {set.screens.length} écran(s)
                  </option>
                ))}
              </select>
            </label>
            {detachedScreens.map((screen) => (
              <Button
                key={screen.id}
                type="button"
                variant="secondary"
                onClick={() => {
                  const url = `/sessions/${session.id}?runtime=1&template=${template.id}&set=${selectedSet.id}&detachedScreen=${screen.id}`;
                  window.open(url, '_blank', 'popup=yes,width=1440,height=900');
                }}
              >
                Ouvrir {screen.name}
              </Button>
            ))}
            <Button type="button" variant="secondary" onClick={() => void enterFullscreen()}>
              Plein ecran
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.location.assign(`/sessions/${session.id}`)}>
              Retour à la partie
            </Button>
          </div>
        ) : (
          <div className="screen-runtime-toolbar__actions">
            <small>{devicePresetLabel(selectedSet.devicePreset)} · {screens[0] ? screenFormatSummary(ensureScreenFormatForScreen(screens[0], selectedSet)) : screenFormatSummary(ensureScreenSetFormat(selectedSet))}</small>
            <Button type="button" variant="secondary" onClick={() => void enterFullscreen()}>
              Plein ecran
            </Button>
            <Button type="button" variant="secondary" onClick={() => window.location.assign(`/sessions/${session.id}`)}>
              Retour
            </Button>
          </div>
        )}
        </section>
      ) : null}

      {isFullscreen ? (
        <button type="button" className="screen-runtime-overlay-action" onClick={() => void exitFullscreen()} aria-label="Quitter le plein ecran">
          Quitter le plein ecran
        </button>
      ) : null}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {screens.map((screen) => {
          const activeTabId = activeTabs[screen.id] || (screen.tabGroups.find((group) => group.isDefault) ?? screen.tabGroups[0])?.id || '';
          const activeGroup = screen.tabGroups.find((group) => group.id === activeTabId) ?? screen.tabGroups[0] ?? null;
          return (
            <ScreenCanvas
              key={screen.id}
              session={session}
              templateId={template.id}
              currentUser={currentUser}
              role={role}
              isFullscreen={isFullscreen}
              screen={screen}
              selectedSet={selectedSet}
              activeTabId={activeTabId}
              activeGroup={activeGroup}
              onSelectTab={(tabId) => setActiveTabs((current) => ({ ...current, [screen.id]: tabId }))}
              runtimeTargets={runtimeTargets}
            />
          );
        })}
      </div>
    </section>
  );
}

function ScreenCanvas({
  session,
  templateId,
  currentUser,
  role,
  isFullscreen,
  screen,
  selectedSet,
  activeTabId,
  activeGroup,
  onSelectTab,
  runtimeTargets
}: {
  session: Session;
  templateId: string;
  currentUser: User;
  role: 'gm' | 'player';
  isFullscreen: boolean;
  screen: ScreenDefinition;
  selectedSet: ScreenSetDefinition;
  activeTabId: string;
  activeGroup: ScreenDefinition['tabGroups'][number] | null;
  onSelectTab: (tabId: string) => void;
  runtimeTargets: RuntimeTargetDescriptor[];
}) {
  const runtimeWidgets = activeGroup?.widgets ?? [];
  const overlayWidgets = runtimeWidgets.filter((widget) => widget.type === 'open_target_overlay');
  const canvasWidgets = runtimeWidgets.filter((widget) => widget.type !== 'open_target_overlay');
  const canvasRows = Math.max(12, canvasWidgets.reduce((max, widget) => Math.max(max, widget.layout.y + widget.layout.h), 0));
  const requiresCanvasScroll = canvasRows > 12;
  const hasTabs = screen.tabGroups.length > 1;
  const screenFormat = ensureScreenFormatForScreen(screen, selectedSet);
  const referenceWidth = Math.max(1, screenFormat.referenceWidth ?? 1920);
  const referenceHeight = Math.max(1, screenFormat.referenceHeight ?? 1080);

  return (
    <section className="screen-runtime-screen">
      <div className="screen-runtime-screen__header">
          <div>
            <h2>{screen.name}</h2>
            <p>
              {screen.mode === 'detached' ? 'Fenêtre secondaire' : 'Fenêtre principale'} · Grille {selectedSet.gridColumns} colonnes
              {' · '}
              {screenFormatSummary(ensureScreenFormatForScreen(screen, selectedSet))}
            </p>
          </div>
          {!isFullscreen && hasTabs ? (
            <div className="screen-runtime-tabs">
              {screen.tabGroups.map((group) => (
                <button key={group.id} type="button" className={`screen-runtime-tab ${group.id === activeTabId ? 'is-active' : ''}`.trim()} onClick={() => onSelectTab(group.id)}>
                  {group.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      <div className={`screen-runtime-screen__body${isFullscreen && hasTabs ? ' screen-runtime-screen__body--with-side-tabs' : ''}`.trim()}>
        {isFullscreen && hasTabs ? (
          <aside className="screen-runtime-side-tabs" aria-label="Onglets de l écran">
            {screen.tabGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`screen-runtime-tab screen-runtime-tab--side ${group.id === activeTabId ? 'is-active' : ''}`.trim()}
                onClick={() => onSelectTab(group.id)}
              >
                {group.name}
              </button>
            ))}
          </aside>
        ) : null}
        <div
          className={`screen-runtime-surface${requiresCanvasScroll ? ' is-scrollable' : ''}`.trim()}
          style={{
            ['--screen-surface-aspect-ratio' as string]: `${referenceWidth} / ${referenceHeight}`,
            ['--screen-grid-columns' as string]: String(selectedSet.gridColumns),
            ['--screen-grid-rows' as string]: String(canvasRows),
            ['--screen-visible-rows' as string]: '12'
          }}
        >
          <div className="screen-runtime-canvas">
            {runtimeWidgets.length === 0 ? <div className="screen-runtime-canvas__empty">Aucun widget dans cet onglet.</div> : null}
            {canvasWidgets.map((widget) => {
              const preview = widgetPreviewContent(widget);
              const showHeader = asBoolean(widget.config?.showHeader, true);
              return (
                <article
                  key={widget.id}
                  className="screen-runtime-widget"
                  style={{
                    gridTemplateRows: showHeader ? 'auto 1fr' : '1fr',
                    left: `calc((100% / ${selectedSet.gridColumns}) * ${widget.layout.x})`,
                    top: `calc((100% / var(--screen-grid-rows, 12)) * ${widget.layout.y})`,
                    width: `calc((100% / ${selectedSet.gridColumns}) * ${widget.layout.w})`,
                    height: `calc((100% / var(--screen-grid-rows, 12)) * ${widget.layout.h})`,
                    opacity: widget.isVisible === false ? 0.45 : 1
                  }}
                >
                  {showHeader ? (
                    <header className="screen-runtime-widget__header">
                      <strong>{widget.title}</strong>
                      <span>{widgetTypeLabel(widget.type)}</span>
                    </header>
                  ) : null}
                  <div className="screen-runtime-widget__body">
                    <RuntimeWidgetContent
                      widget={widget}
                      session={session}
                      templateId={templateId}
                      currentUser={currentUser}
                      role={role}
                      preview={preview}
                      runtimeTargets={runtimeTargets}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          {overlayWidgets.map((widget) => (
            <RuntimeWidgetContent
              key={widget.id}
              widget={widget}
              session={session}
              templateId={templateId}
              currentUser={currentUser}
              role={role}
              preview={widgetPreviewContent(widget)}
              runtimeTargets={runtimeTargets}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function buildRuntimeTargets(selectedSet: ScreenSetDefinition | null): RuntimeTargetDescriptor[] {
  const descriptors: RuntimeTargetDescriptor[] = [];
  for (const screen of selectedSet?.screens ?? []) {
    for (const group of screen.tabGroups) {
      for (const widget of group.widgets) {
        if (widget.type === 'open_target_overlay') {
          descriptors.push({
            id: widget.id,
            title: widget.title,
            widgetType: 'open_target_overlay',
            screenName: screen.name,
            tabName: group.name,
            channelKey: typeof widget.config?.channelKey === 'string' ? widget.config.channelKey : 'primary'
          });
        }
        const sourceMode =
          typeof widget.config?.sourceMode === 'string' ? widget.config.sourceMode : 'auto_current';
        if (widget.type === 'character_sheet' && sourceMode !== 'explicit') {
          descriptors.push({
            id: widget.id,
            title: widget.title,
            widgetType: 'character_sheet',
            screenName: screen.name,
            tabName: group.name
          });
        }
      }
    }
  }
  return descriptors;
}

export function RuntimeWidgetContent({
  widget,
  session,
  templateId,
  currentUser,
  role,
  preview,
  runtimeTargets
}: {
  widget: ScreenDefinition['tabGroups'][number]['widgets'][number];
  session: Session;
  templateId: string;
  currentUser: User;
  role: 'gm' | 'player';
  preview: ReturnType<typeof widgetPreviewContent>;
  runtimeTargets: RuntimeTargetDescriptor[];
}) {
  if (widget.type === 'chat') {
    return (
      <SessionChatScreenWidget
        currentUser={currentUser}
        currentSession={session}
        role={role}
        allowWhispers={asBoolean(widget.config?.allowWhispers, true)}
      />
    );
  }

  if (widget.type === 'character_sheet') {
    return (
      <SessionCharacterSheetWidget
        currentSession={session}
        currentUser={currentUser}
        role={role}
        templateId={templateId}
        widgetId={widget.id}
        sourceMode={
          typeof widget.config?.sourceMode === 'string' && ['explicit', 'target'].includes(widget.config.sourceMode)
            ? (widget.config.sourceMode as 'explicit' | 'target')
            : 'auto_current'
        }
        characterId={typeof widget.dataSource?.characterId === 'string' ? widget.dataSource.characterId : ''}
        characterLabel={typeof widget.dataSource?.characterLabel === 'string' ? widget.dataSource.characterLabel : ''}
        viewMode={typeof widget.config?.viewMode === 'string' && widget.config.viewMode === 'gm' ? 'gm' : 'player'}
        viewId={typeof widget.config?.viewId === 'string' ? widget.config.viewId : ''}
        showHeader={asBoolean(widget.config?.showHeader, true)}
      />
    );
  }

  if (widget.type === 'clock') {
    return (
      <SessionClockWidget
        format={typeof widget.config?.format === 'string' && widget.config.format === '12h' ? '12h' : '24h'}
        showSeconds={asBoolean(widget.config?.showSeconds, false)}
      />
    );
  }

  if (widget.type === 'alert_overlay') {
    return (
      <SessionAlertOverlayWidget
        currentSession={session}
        currentUser={currentUser}
        role={role}
        source={
          typeof widget.config?.source === 'string' &&
          ['incoming', 'gm_priority', 'all'].includes(widget.config.source)
            ? (widget.config.source as 'incoming' | 'gm_priority' | 'all')
            : 'all'
        }
        durationMs={typeof widget.config?.durationMs === 'number' ? widget.config.durationMs : 5000}
        position={
          typeof widget.config?.position === 'string' &&
          ['top_left', 'top_right', 'bottom_left', 'bottom_right'].includes(widget.config.position)
            ? (widget.config.position as 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right')
            : 'top_right'
        }
      />
    );
  }

  if (widget.type === 'participant_presence') {
    return (
      <SessionParticipantPresenceWidget
        currentSession={session}
        showOffline={asBoolean(widget.config?.showOffline, true)}
        staleAfterSeconds={typeof widget.config?.staleAfterSeconds === 'number' ? widget.config.staleAfterSeconds : 45}
      />
    );
  }

  if (widget.type === 'open_target_overlay') {
    return <SessionOpenTargetOverlayWidget sessionId={session.id} templateId={templateId} widgetId={widget.id} />;
  }

  if (widget.type === 'open_target_control') {
    return (
      <SessionOpenTargetControlWidget
        sessionId={session.id}
        templateId={templateId}
        role={role}
        targetWidgetId={typeof widget.config?.targetWidgetId === 'string' ? widget.config.targetWidgetId : ''}
        targetChannelKey={typeof widget.config?.targetChannelKey === 'string' ? widget.config.targetChannelKey : 'primary'}
        availableTargets={runtimeTargets}
      />
    );
  }

  if (widget.type === 'initiative') {
    return (
      <SessionInitiativeScreenWidget
        currentUser={currentUser}
        currentSession={session}
        role={role}
        compact={asBoolean(widget.config?.compact, false)}
        showDetails={asBoolean(widget.config?.showDetails, true)}
      />
    );
  }

  if (widget.type === 'notes') {
    return (
      <SessionNotesScreenWidget
        currentUser={currentUser}
        currentSession={session}
        role={role}
        scope={typeof widget.config?.scope === 'string' ? widget.config.scope : 'private'}
        autosave={asBoolean(widget.config?.autosave, true)}
        placeholder={typeof widget.config?.placeholder === 'string' ? widget.config.placeholder : 'Prendre des notes...'}
      />
    );
  }

  if (widget.type === 'documents') {
    return (
      <SessionDocumentsScreenWidget
        currentUser={currentUser}
        currentSession={session}
        role={role}
        templateId={templateId}
        scope={typeof widget.config?.scope === 'string' ? widget.config.scope : 'all'}
        allowUpload={asBoolean(widget.config?.allowUpload, true)}
        runtimeTargets={runtimeTargets}
      />
    );
  }

  if (widget.type === 'pdf_viewer') {
    return (
      <SessionPdfViewerWidget
        currentSession={session}
        resourceId={typeof widget.dataSource?.resourceId === 'string' ? widget.dataSource.resourceId : ''}
        url={typeof widget.dataSource?.url === 'string' ? widget.dataSource.url : ''}
        page={typeof widget.config?.page === 'number' ? widget.config.page : 1}
        showToolbar={asBoolean(widget.config?.showToolbar, true)}
      />
    );
  }

  if (widget.type === 'media_viewer') {
    return (
      <SessionMediaViewerWidget
        currentSession={session}
        resourceId={typeof widget.dataSource?.resourceId === 'string' ? widget.dataSource.resourceId : ''}
        url={typeof widget.dataSource?.url === 'string' ? widget.dataSource.url : ''}
        mode={typeof widget.config?.mode === 'string' ? widget.config.mode : 'image'}
        fit={typeof widget.config?.fit === 'string' ? widget.config.fit : 'contain'}
        autoplay={asBoolean(widget.config?.autoplay, false)}
      />
    );
  }

  if (widget.type === 'character_list') {
    return (
      <SessionCharacterListWidget
        currentSession={session}
        currentUser={currentUser}
        role={role}
        templateId={templateId}
        showPcs={asBoolean(widget.config?.showPcs, true)}
        showNpcs={asBoolean(widget.config?.showNpcs, false)}
        showMonsters={asBoolean(widget.config?.showMonsters, false)}
        compact={asBoolean(widget.config?.compact, true)}
        runtimeTargets={runtimeTargets}
      />
    );
  }

  if (widget.type === 'dice_history') {
    return (
      <SessionDiceHistoryWidget
        currentSession={session}
        currentUser={currentUser}
        scope={typeof widget.config?.scope === 'string' ? widget.config.scope : 'party'}
        limit={typeof widget.config?.limit === 'number' ? widget.config.limit : 10}
      />
    );
  }

  if (widget.type === 'session_journal') {
    return (
      <SessionJournalWidget
        currentSession={session}
        limit={typeof widget.config?.limit === 'number' ? widget.config.limit : 10}
        showFilters={asBoolean(widget.config?.showFilters, true)}
      />
    );
  }

  return (
    <>
      <strong>{preview.headline}</strong>
      {preview.details.map((detail) => (
        <small key={detail}>{detail}</small>
      ))}
    </>
  );
}
