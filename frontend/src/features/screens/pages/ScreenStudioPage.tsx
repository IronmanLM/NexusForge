import { MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import ResourcePickerField from '../../../components/ResourcePickerField';
import { resourceRepository, screenTemplateRepository, systemRepository } from '../../../data/repositories';
import { useAuth } from '../../../hooks/useAuth';
import { ResourceItem } from '../../../types/resource';
import { Session } from '../../../types/session';
import { GameSystem } from '../../../types/system';
import { User } from '../../../types/user';
import { ScreenDefinition, ScreenGridColumns, ScreenSetDefinition, ScreenTabGroupDefinition, ScreenTemplate, ScreenWidgetDefinition, ScreenWidgetLayout, ScreenWidgetType } from '../../../types/screenTemplate';
import { buildRuntimeTargets, RuntimeWidgetContent } from '../components/ScreenTemplateRuntime';
import {
  applyScreenFormatPreset,
  applyScreenFormatPresetToScreen,
  ensureScreenFormatForScreen,
  ensureScreenSetFormat,
  getDefaultScreenFormatPreset,
  SCREEN_FORMAT_PRESETS,
  screenFormatSummary,
  screenOrientationLabel,
  type ScreenFormatPreset
} from '../screenSetPresets';

type DragState =
  | {
      widgetId: string;
      mode: 'move' | 'resize';
      startX: number;
      startY: number;
      startLayout: ScreenWidgetLayout;
    }
  | null;

type WidgetPaletteItem = {
  type: ScreenWidgetType;
  title: string;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  description: string;
};

type WidgetConfigValue = string | number | boolean | null;
type StudioCanvasMode = 'edit' | 'preview';
type DetachedPanelKey = 'left' | 'right';

const DEFAULT_CANVAS_ZOOM = 40;
const VISIBLE_CANVAS_ROWS = 12;
const SCREEN_STUDIO_DETACHED_PANELS_KEY = 'nexusforge.screenStudio.detachedPanels';

const WIDGET_PALETTE: WidgetPaletteItem[] = [
  { type: 'character_sheet', title: 'Fiche de personnage', minW: 4, minH: 6, defaultW: 8, defaultH: 10, description: 'Affiche une fiche liee au systeme de jeu.' },
  { type: 'chat', title: 'Messagerie', minW: 4, minH: 5, defaultW: 7, defaultH: 8, description: 'Canaux de discussion et messages prives.' },
  { type: 'clock', title: 'Horloge temps reel', minW: 2, minH: 2, defaultW: 3, defaultH: 2, description: 'Affiche l heure en direct.' },
  { type: 'alert_overlay', title: 'Overlay d alerte', minW: 3, minH: 2, defaultW: 6, defaultH: 2, description: 'Messages prioritaires et alertes entrantes.' },
  { type: 'participant_presence', title: 'Joueurs présents', minW: 3, minH: 3, defaultW: 4, defaultH: 5, description: 'Indique quels participants ont lancé la séance et sont encore présents.' },
  { type: 'open_target_overlay', title: 'Overlay cible d ouverture', minW: 2, minH: 2, defaultW: 3, defaultH: 2, description: 'Affiche au-dessus de l ecran un contenu ouvert depuis un autre widget.' },
  { type: 'open_target_control', title: 'Controle overlay cible', minW: 3, minH: 2, defaultW: 4, defaultH: 3, description: 'Pilote un overlay cible et indique le contenu actuellement ouvert.' },
  { type: 'screen_viewer', title: 'Écran', minW: 5, minH: 5, defaultW: 8, defaultH: 8, description: 'Zone pilotable pour images, vidéos, audio et PDF.' },
  { type: 'documents', title: 'Gestionnaire de documents', minW: 4, minH: 5, defaultW: 6, defaultH: 8, description: 'Acces aux documents partages et personnels.' },
  { type: 'notes', title: 'Prise de notes', minW: 4, minH: 4, defaultW: 6, defaultH: 7, description: 'Bloc de notes personnelles ou partagees.' },
  { type: 'character_list', title: 'Liste des personnages', minW: 3, minH: 4, defaultW: 5, defaultH: 7, description: 'Acces rapide aux personnages de la partie.' },
  { type: 'dice_history', title: 'Historique des jets', minW: 3, minH: 4, defaultW: 5, defaultH: 6, description: 'Derniers jets visibles dans la partie.' },
  { type: 'initiative', title: 'Initiative', minW: 4, minH: 4, defaultW: 6, defaultH: 7, description: 'Ordre de tour et initiative.' },
  { type: 'session_journal', title: 'Journal de partie', minW: 4, minH: 4, defaultW: 6, defaultH: 7, description: 'Evenements marquants et historique de session.' }
];

function DetachedStudioPanelPortal({
  panelKey,
  title,
  children,
  onClose,
  onBlocked
}: {
  panelKey: DetachedPanelKey;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onBlocked?: () => void;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const isUnmountingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const sizeStorageKey = `nexusforge.screenStudio.panelSize.${panelKey}`;
    let width = 460;
    let height = 980;
    try {
      const saved = localStorage.getItem(sizeStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { width?: number; height?: number };
        if (typeof parsed.width === 'number' && parsed.width >= 320) {
          width = parsed.width;
        }
        if (typeof parsed.height === 'number' && parsed.height >= 480) {
          height = parsed.height;
        }
      }
    } catch {
      // ignore malformed local value
    }

    const popup = window.open('', `nexusforge-screen-studio-${panelKey}`, `popup=yes,width=${width},height=${height}`);
    if (!popup) {
      onBlocked?.();
      return;
    }

    popup.document.title = title;
    popup.document.head.innerHTML = '';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      popup.document.head.appendChild(node.cloneNode(true));
    });
    popup.document.body.className = document.body.className;
    popup.document.body.innerHTML = '';

    const mountNode = popup.document.createElement('div');
    mountNode.className = 'studio-panel-popout-shell';
    popup.document.body.appendChild(mountNode);
    setContainer(mountNode);

    const syncTheme = () => {
      popup.document.body.className = document.body.className;
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const handleBeforeUnload = () => {
      try {
        localStorage.setItem(sizeStorageKey, JSON.stringify({ width: popup.outerWidth, height: popup.outerHeight }));
      } catch {
        // ignore localStorage failure
      }
      if (isUnmountingRef.current) {
        return;
      }
      observer.disconnect();
      onCloseRef.current();
    };
    const handleResize = () => {
      try {
        localStorage.setItem(sizeStorageKey, JSON.stringify({ width: popup.outerWidth, height: popup.outerHeight }));
      } catch {
        // ignore localStorage failure
      }
    };
    popup.addEventListener('beforeunload', handleBeforeUnload);
    popup.addEventListener('resize', handleResize);

    return () => {
      isUnmountingRef.current = true;
      observer.disconnect();
      popup.removeEventListener('beforeunload', handleBeforeUnload);
      popup.removeEventListener('resize', handleResize);
      if (!popup.closed) {
        popup.close();
      }
    };
  }, [panelKey, title]);

  return container ? createPortal(children, container) : null;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneTemplate(template: ScreenTemplate): ScreenTemplate {
  return {
    ...template,
    sets: template.sets.map((set) => ({
      ...set,
      screens: set.screens.map((screen) => ({
        ...screen,
        tabGroups: screen.tabGroups.map((group) => ({
          ...group,
          widgets: group.widgets.map((widget) => ({
            ...widget,
            layout: { ...widget.layout },
            config: widget.config ? { ...widget.config } : {},
            dataSource: widget.dataSource ? { ...widget.dataSource } : {},
            permissions: widget.permissions ? { ...widget.permissions } : {}
          }))
        }))
      }))
    }))
  };
}

function cloneWidgetWithIds(widget: ScreenWidgetDefinition): ScreenWidgetDefinition {
  return {
    ...widget,
    id: makeId('screen_widget'),
    layout: { ...widget.layout },
    config: widget.config ? { ...widget.config } : {},
    dataSource: widget.dataSource ? { ...widget.dataSource } : {},
    permissions: widget.permissions ? { ...widget.permissions } : {}
  };
}

function cloneTabGroupWithIds(group: ScreenTabGroupDefinition, duplicateName = true): ScreenTabGroupDefinition {
  return {
    ...group,
    id: makeId('screen_tab'),
    name: duplicateName ? `${group.name} (copie)` : group.name,
    widgets: group.widgets.map(cloneWidgetWithIds)
  };
}

function createDefaultScreen(order: number, forceMode?: ScreenDefinition['mode'], screenFormatPreset: ScreenFormatPreset = 'desktop_full_hd'): ScreenDefinition {
  const mode = forceMode ?? (order === 1 ? 'main' : 'detached');
  return applyScreenFormatPresetToScreen({
    id: makeId('screen'),
    name: mode === 'main' ? 'Ecran principal' : `Ecran ${order}`,
    mode,
    order,
    tabGroups: [
      {
        id: makeId('screen_tab'),
        name: 'Resume',
        isDefault: true,
        widgets: []
      }
    ]
  }, screenFormatPreset);
}

function screenCountForPreset(devicePreset: ScreenSetDefinition['devicePreset']): number {
  switch (devicePreset) {
    case 'desktop_3':
      return 3;
    case 'desktop_2':
      return 2;
    case 'tablet':
    case 'mobile':
    case 'desktop_1':
    default:
      return 1;
  }
}

function buildScreensForPreset(devicePreset: ScreenSetDefinition['devicePreset'], screenFormatPreset?: ScreenFormatPreset): ScreenDefinition[] {
  const screenCount = screenCountForPreset(devicePreset);
  const resolvedPreset = screenFormatPreset ?? getDefaultScreenFormatPreset(devicePreset);
  return Array.from({ length: screenCount }, (_, index) => createDefaultScreen(index + 1, undefined, resolvedPreset));
}

function createDefaultSetFromSource(source?: { devicePreset: ScreenSetDefinition['devicePreset']; gridColumns: ScreenGridColumns; screenFormatPreset?: ScreenFormatPreset }): ScreenSetDefinition {
  const devicePreset = source?.devicePreset ?? 'desktop_1';
  const gridColumns = source?.gridColumns ?? 24;
  const screenFormatPreset = source?.screenFormatPreset ?? getDefaultScreenFormatPreset(devicePreset);
  return applyScreenFormatPreset({
    id: makeId('screen_set'),
    name: `Nouveau set ${Date.now().toString().slice(-4)}`,
    devicePreset,
    gridColumns,
    zoom: 1,
    screens: buildScreensForPreset(devicePreset, screenFormatPreset)
  }, screenFormatPreset);
}

function clampWidgetLayout(layout: ScreenWidgetLayout, columns: ScreenGridColumns): ScreenWidgetLayout {
  const minW = Math.max(1, layout.minW ?? 1);
  const minH = Math.max(1, layout.minH ?? 1);
  const w = Math.max(minW, Math.min(columns, layout.w));
  const h = Math.max(minH, layout.h);
  const x = Math.max(0, Math.min(columns - w, layout.x));
  const y = Math.max(0, layout.y);
  return { ...layout, x, y, w, h };
}

function findNextSlot(widgets: ScreenWidgetDefinition[], columns: ScreenGridColumns, width: number, height: number): ScreenWidgetLayout {
  const maxY = widgets.reduce((acc, widget) => Math.max(acc, widget.layout.y + widget.layout.h), 0);
  for (let y = 0; y <= maxY + 20; y += 1) {
    for (let x = 0; x <= columns - width; x += 1) {
      const candidate = { x, y, w: width, h: height, minW: 2, minH: 2 };
      const collides = widgets.some((widget) => {
        const other = widget.layout;
        return !(
          candidate.x + candidate.w <= other.x ||
          other.x + other.w <= candidate.x ||
          candidate.y + candidate.h <= other.y ||
          other.y + other.h <= candidate.y
        );
      });
      if (!collides) {
        return candidate;
      }
    }
  }
  return { x: 0, y: maxY + 1, w: width, h: height, minW: 2, minH: 2 };
}

function getWidgetDefaults(type: ScreenWidgetType): Pick<ScreenWidgetDefinition, 'config' | 'dataSource' | 'permissions'> {
  switch (type) {
    case 'character_sheet':
      return {
        config: { sourceMode: 'auto_current', viewMode: 'player', viewId: '', showHeader: true },
        dataSource: { characterId: '', characterLabel: '' },
        permissions: {}
      };
    case 'chat':
      return {
        config: { channel: 'global', allowWhispers: true },
        dataSource: {},
        permissions: {}
      };
    case 'clock':
      return {
        config: { format: '24h', showSeconds: false, showHeader: false },
        dataSource: {},
        permissions: {}
      };
    case 'alert_overlay':
      return {
        config: { source: 'all', durationMs: 5000, position: 'top_right' },
        dataSource: {},
        permissions: {}
      };
    case 'participant_presence':
      return {
        config: { showOffline: true, staleAfterSeconds: 45 },
        dataSource: {},
        permissions: {}
      };
    case 'open_target_overlay':
      return {
        config: { showHeader: false },
        dataSource: {},
        permissions: {}
      };
    case 'open_target_control':
      return {
        config: { targetWidgetId: '' },
        dataSource: {},
        permissions: {}
      };
    case 'screen_viewer':
      return {
        config: { mode: 'auto', fit: 'contain', autoplay: false, loop: false, showToolbar: true, channelKey: 'primary' },
        dataSource: { resourceId: '', url: '' },
        permissions: {}
      };
    case 'documents':
      return {
        config: { scope: 'all', allowUpload: true },
        dataSource: {},
        permissions: {}
      };
    case 'notes':
      return {
        config: { scope: 'private', autosave: true, placeholder: 'Prendre des notes...' },
        dataSource: {},
        permissions: {}
      };
    case 'character_list':
      return {
        config: { showPcs: true, showNpcs: false, showMonsters: false, compact: false },
        dataSource: {},
        permissions: {}
      };
    case 'dice_history':
      return {
        config: { scope: 'party', limit: 10 },
        dataSource: {},
        permissions: {}
      };
    case 'initiative':
      return {
        config: { compact: false, showDetails: true },
        dataSource: {},
        permissions: {}
      };
    case 'session_journal':
      return {
        config: { limit: 10, showFilters: true },
        dataSource: {},
        permissions: {}
      };
    default:
      return { config: {}, dataSource: {}, permissions: {} };
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function widgetTypeLabel(type: ScreenWidgetType): string {
  return WIDGET_PALETTE.find((item) => item.type === type)?.title ?? type;
}

function widgetPreviewContent(widget: ScreenWidgetDefinition): { headline: string; details: string[] } {
  const config = widget.config ?? {};
  const dataSource = widget.dataSource ?? {};

  switch (widget.type) {
    case 'character_sheet':
      return {
        headline: asString(dataSource.characterLabel, 'Aucune fiche cible'),
        details: [
          `Source: ${asString(config.sourceMode, 'auto_current') === 'explicit' ? 'explicite' : 'joueur courant'}`,
          `Mode: ${asString(config.viewMode, 'player')}`,
          asString(config.viewId) ? `Vue: ${asString(config.viewId)}` : 'Vue auto'
        ]
      };
    case 'chat':
      return {
        headline: `Canal ${asString(config.channel, 'global')}`,
        details: [asBoolean(config.allowWhispers, true) ? 'Whispers actifs' : 'Whispers desactives']
      };
    case 'clock': {
      const options: Intl.DateTimeFormatOptions =
        asString(config.format, '24h') === '12h'
          ? { hour: 'numeric', minute: '2-digit', second: asBoolean(config.showSeconds, false) ? '2-digit' : undefined, hour12: true }
          : { hour: '2-digit', minute: '2-digit', second: asBoolean(config.showSeconds, false) ? '2-digit' : undefined, hour12: false };
      return {
        headline: new Date().toLocaleTimeString('fr-FR', options),
        details: [asString(config.format, '24h').toUpperCase()]
      };
    }
    case 'alert_overlay':
      return {
        headline: 'Alerte prioritaire',
        details: [`Source: ${asString(config.source, 'all')}`, `Position: ${asString(config.position, 'top_right')}`]
      };
    case 'participant_presence':
      return {
        headline: 'Présence de séance',
        details: [
          asBoolean(config.showOffline, true) ? 'Hors ligne visibles' : 'Hors ligne masqués',
          `Délai: ${asNumber(config.staleAfterSeconds, 45)}s`
        ]
      };
    case 'open_target_overlay':
      return {
        headline: 'Overlay cible',
        details: ['Affichage plein ecran sur l ecran courant', 'Reagit aux actions Ouvrir dans']
      };
    case 'open_target_control':
      return {
        headline: 'Controle overlay',
        details: [asString(config.targetWidgetId) ? `Cible: ${asString(config.targetWidgetId)}` : 'Aucune cible associee']
      };
    case 'screen_viewer':
      return {
        headline: asString(dataSource.url) || asString(dataSource.resourceId, 'Écran non alimenté'),
        details: [`Mode: ${asString(config.mode, 'auto')}`, `Fit: ${asString(config.fit, 'contain')}`, `Canal: ${asString(config.channelKey, 'primary')}`]
      };
    case 'documents':
      return {
        headline: 'Documents',
        details: [`Scope: ${asString(config.scope, 'all')}`, asBoolean(config.allowUpload, true) ? 'Upload autorise' : 'Upload bloque']
      };
    case 'notes':
      return {
        headline: asString(config.placeholder, 'Prendre des notes...'),
        details: [`Scope: ${asString(config.scope, 'private')}`, asBoolean(config.autosave, true) ? 'Autosave active' : 'Autosave inactive']
      };
    case 'character_list':
      return {
        headline: 'Liste personnages',
        details: [
          asBoolean(config.showPcs, true) ? 'PJ visibles' : 'PJ masques',
          asBoolean(config.showNpcs, false) ? 'PNJ visibles' : 'PNJ masques',
          asBoolean(config.showMonsters, false) ? 'Monstres visibles' : 'Monstres masques'
        ]
      };
    case 'dice_history':
      return {
        headline: 'D20 16 + 2',
        details: [`Scope: ${asString(config.scope, 'party')}`, `Limite: ${asNumber(config.limit, 10)}`]
      };
    case 'initiative':
      return {
        headline: 'Ordre du tour',
        details: [asBoolean(config.compact, false) ? 'Vue compacte' : 'Vue detaillee', asBoolean(config.showDetails, true) ? 'Details visibles' : 'Details masques']
      };
    case 'session_journal':
      return {
        headline: 'Journal de partie',
        details: [`Limite: ${asNumber(config.limit, 10)}`, asBoolean(config.showFilters, true) ? 'Filtres visibles' : 'Filtres masques']
      };
    default:
      return { headline: widgetTypeLabel(widget.type), details: [] };
  }
}

function updateNestedRecord<T extends ScreenWidgetDefinition>(
  widget: T,
  key: 'config' | 'dataSource' | 'permissions',
  field: string,
  value: WidgetConfigValue
): T {
  return {
    ...widget,
    [key]: {
      ...(widget[key] ?? {}),
      [field]: value
    }
  };
}

function FieldBlock({ title, children }: { title: string; children: JSX.Element | JSX.Element[] }) {
  return (
    <section className="screen-studio-fields-block">
      <h3>{title}</h3>
      <div className="screen-studio-fields-block__content">{children}</div>
    </section>
  );
}

export default function ScreenStudioPage() {
  const { templateId = '' } = useParams();
  const { currentUser } = useAuth();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const [canvasViewport, setCanvasViewport] = useState({ width: 0, height: 0 });
  const [template, setTemplate] = useState<ScreenTemplate | null>(null);
  const [draft, setDraft] = useState<ScreenTemplate | null>(null);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [selectedScreenId, setSelectedScreenId] = useState('');
  const [selectedTabGroupId, setSelectedTabGroupId] = useState('');
  const [selectedWidgetId, setSelectedWidgetId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSetFormatExpanded, setIsSetFormatExpanded] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [canvasMode, setCanvasMode] = useState<StudioCanvasMode>('edit');
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [availableResources, setAvailableResources] = useState<ResourceItem[]>([]);
  const [linkedSystem, setLinkedSystem] = useState<GameSystem | null>(null);
  const [detachedPanels, setDetachedPanels] = useState<Record<DetachedPanelKey, boolean>>({ left: false, right: false });
  const [detachedBlocked, setDetachedBlocked] = useState<Record<DetachedPanelKey, boolean>>({ left: false, right: false });
  const [detachedRetryKey, setDetachedRetryKey] = useState<Record<DetachedPanelKey, number>>({ left: 0, right: 0 });

  const canEdit = Boolean(currentUser && draft && (draft.createdBy === currentUser.id || currentUser.roles.includes('admin')));

  useEffect(() => {
    let isMounted = true;
    async function loadTemplate() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const loaded = await screenTemplateRepository.getById(templateId);
        if (!isMounted) {
          return;
        }
        if (!loaded) {
          setTemplate(null);
          setDraft(null);
          return;
        }
        const cloned = cloneTemplate(loaded);
        setTemplate(loaded);
        setDraft(cloned);
        const firstSet = cloned.sets[0];
        const firstScreen = firstSet?.screens[0];
        const firstTab = firstScreen?.tabGroups[0];
        setSelectedSetId(firstSet?.id ?? '');
        setSelectedScreenId(firstScreen?.id ?? '');
        setSelectedTabGroupId(firstTab?.id ?? '');
        setSelectedWidgetId(firstTab?.widgets[0]?.id ?? '');
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger le template d ecran.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    void loadTemplate();
    return () => {
      isMounted = false;
    };
  }, [templateId]);

  useEffect(() => {
    const storedDetachedPanels = localStorage.getItem(SCREEN_STUDIO_DETACHED_PANELS_KEY);
    if (!storedDetachedPanels) {
      return;
    }
    try {
      const parsed = JSON.parse(storedDetachedPanels) as Partial<Record<DetachedPanelKey, boolean>>;
      setDetachedPanels({
        left: Boolean(parsed.left),
        right: Boolean(parsed.right)
      });
    } catch {
      setDetachedPanels({ left: false, right: false });
    }
  }, []);

  useEffect(() => {
    if (!canvasViewportRef.current || typeof ResizeObserver === 'undefined') {
      return;
    }
    const node = canvasViewportRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setCanvasViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [canvasMode, selectedSetId, selectedScreenId, selectedTabGroupId]);

  useEffect(() => {
    localStorage.setItem(SCREEN_STUDIO_DETACHED_PANELS_KEY, JSON.stringify(detachedPanels));
  }, [detachedPanels]);

  useEffect(() => {
    let isMounted = true;
    async function loadEditorData() {
      if (!draft) {
        return;
      }
      try {
        const resourceParams =
          draft.scopeType === 'system' && draft.scopeRefId
            ? [
                resourceRepository.list({ scopeType: 'account' }),
                resourceRepository.list({ scopeType: 'system', scopeRefId: draft.scopeRefId })
              ]
            : [resourceRepository.list({ scopeType: 'account' })];
        const resourceGroups = await Promise.all(resourceParams);
        if (!isMounted) {
          return;
        }
        const merged = resourceGroups.flat();
        const deduped = new Map<string, ResourceItem>();
        for (const resource of merged) {
          deduped.set(resource.id, resource);
        }
        setAvailableResources(Array.from(deduped.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      } catch {
        if (isMounted) {
          setAvailableResources([]);
        }
      }

      if (draft.scopeType === 'system' && draft.scopeRefId) {
        try {
          const system = await systemRepository.getById(draft.scopeRefId);
          if (isMounted) {
            setLinkedSystem(system);
          }
        } catch {
          if (isMounted) {
            setLinkedSystem(null);
          }
        }
      } else if (isMounted) {
        setLinkedSystem(null);
      }
    }

    void loadEditorData();
    return () => {
      isMounted = false;
    };
  }, [draft]);

  const selectedSet = useMemo(() => draft?.sets.find((set) => set.id === selectedSetId) ?? draft?.sets[0] ?? null, [draft, selectedSetId]);
  const selectedScreen = useMemo(
    () => selectedSet?.screens.find((screen) => screen.id === selectedScreenId) ?? selectedSet?.screens[0] ?? null,
    [selectedScreenId, selectedSet]
  );
  const selectedTabGroup = useMemo(
    () => selectedScreen?.tabGroups.find((group) => group.id === selectedTabGroupId) ?? selectedScreen?.tabGroups[0] ?? null,
    [selectedScreen, selectedTabGroupId]
  );
  const previewRuntimeTargets = useMemo(() => buildRuntimeTargets(selectedSet), [selectedSet]);
  const selectedWidget = useMemo(
    () => selectedTabGroup?.widgets.find((widget) => widget.id === selectedWidgetId) ?? null,
    [selectedTabGroup, selectedWidgetId]
  );
  const overlayTargets = useMemo(
    () =>
      (draft?.sets ?? []).flatMap((set) =>
        set.screens.flatMap((screen) =>
          screen.tabGroups.flatMap((group) =>
            group.widgets
              .filter((widget) => widget.type === 'open_target_overlay' || widget.type === 'screen_viewer')
              .map((widget) => ({
                id: widget.id,
                name: `${widget.title} · ${screen.name} · ${group.name}`
              }))
          )
        )
      ),
    [draft?.sets]
  );
  const systemViews = linkedSystem?.studioSchemaV2?.views ?? [];
  const previewCurrentUser = useMemo<User>(
    () =>
      currentUser ?? {
        id: 'screen-studio-preview-user',
        email: 'preview@nexusforge.local',
        displayName: 'Preview User',
        nickname: 'Preview',
        roles: ['gm'],
        createdAt: new Date(0).toISOString()
      },
    [currentUser]
  );
  const previewSession = useMemo<Session>(
    () => ({
      id: `screen-studio-preview-${templateId || 'template'}`,
      systemId: draft?.scopeRefId ?? linkedSystem?.id ?? 'screen-studio-preview-system',
      name: draft?.name ?? 'Preview session',
      description: draft?.description ?? 'Session de preview du studio ecrans',
      ownerUserId: previewCurrentUser.id,
      gmUserId: previewCurrentUser.id,
      gmUserIds: [previewCurrentUser.id],
      state: 'planned',
      participants: [
        {
          userId: previewCurrentUser.id,
          role: 'gm',
          displayName: previewCurrentUser.displayName,
          nickname: previewCurrentUser.nickname ?? previewCurrentUser.displayName
        }
      ],
      invitations: [],
      activityLog: [],
      initiative: {
        round: 0,
        turnIndex: 0,
        isInCombat: false,
        entries: []
      },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date().toISOString()
    }),
    [draft?.description, draft?.name, draft?.scopeRefId, linkedSystem?.id, previewCurrentUser, templateId]
  );

  useEffect(() => {
    if (!selectedSet) {
      setSelectedSetId('');
      setSelectedScreenId('');
      setSelectedTabGroupId('');
      return;
    }
    if (!selectedSet.screens.some((screen) => screen.id === selectedScreenId)) {
      setSelectedScreenId(selectedSet.screens[0]?.id ?? '');
    }
  }, [selectedScreenId, selectedSet]);

  useEffect(() => {
    if (!selectedScreen) {
      setSelectedTabGroupId('');
      return;
    }
    if (!selectedScreen.tabGroups.some((group) => group.id === selectedTabGroupId)) {
      const defaultGroup = selectedScreen.tabGroups.find((group) => group.isDefault) ?? selectedScreen.tabGroups[0];
      setSelectedTabGroupId(defaultGroup?.id ?? '');
    }
  }, [selectedScreen, selectedTabGroupId]);

  useEffect(() => {
    if (!selectedTabGroup) {
      setSelectedWidgetId('');
      return;
    }
    if (selectedWidgetId && selectedTabGroup.widgets.some((widget) => widget.id === selectedWidgetId)) {
      return;
    }
    setSelectedWidgetId(selectedTabGroup.widgets[0]?.id ?? '');
  }, [selectedTabGroup, selectedWidgetId]);

  useEffect(() => {
    if (!dragState || !selectedSet || !selectedScreen || !selectedTabGroup || !canEdit) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      if (!canvasRef.current) {
        return;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const cellWidth = rect.width / selectedSet.gridColumns;
      const screenFormat = ensureScreenFormatForScreen(selectedScreen, selectedSet);
      const zoomScale = canvasZoom / 100;
      const visibleCanvasHeight = Math.max(180, Math.round((screenFormat.referenceHeight ?? 1080) * zoomScale));
      const studioRowHeight = visibleCanvasHeight / VISIBLE_CANVAS_ROWS;
      const dx = Math.round((event.clientX - dragState.startX) / cellWidth);
      const dy = Math.round((event.clientY - dragState.startY) / studioRowHeight);
      setDraft((current) => {
        if (!current) {
          return current;
        }
        return updateWidgetInDraft(current, selectedSet.id, selectedScreen.id, selectedTabGroup.id, dragState.widgetId, (widget) => {
          const nextLayout =
            dragState.mode === 'move'
              ? { ...dragState.startLayout, x: dragState.startLayout.x + dx, y: dragState.startLayout.y + dy }
              : { ...dragState.startLayout, w: dragState.startLayout.w + dx, h: dragState.startLayout.h + dy };
          return {
            ...widget,
            layout: clampWidgetLayout(
              {
                ...nextLayout,
                minW: widget.layout.minW,
                minH: widget.layout.minH
              },
              selectedSet.gridColumns
            )
          };
        });
      });
    };

    const handleUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [canEdit, dragState, selectedSet, selectedScreen, selectedTabGroup]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <Layout wide>
        <section className="card">Chargement du studio ecran...</section>
      </Layout>
    );
  }

  if (!draft || !template) {
    return (
      <Layout wide>
        <section className="card">
          <p>Template d ecran introuvable.</p>
          <Link to="/screen-templates">Retour au catalogue</Link>
        </section>
      </Layout>
    );
  }

  const canvasRows = Math.max(
    VISIBLE_CANVAS_ROWS,
    (selectedTabGroup?.widgets ?? []).reduce((max, widget) => Math.max(max, widget.layout.y + widget.layout.h), 0) + 2
  );

  const studioCanvasMetrics = selectedScreen && selectedSet
    ? (() => {
        const screenFormat = ensureScreenFormatForScreen(selectedScreen, selectedSet);
        const referenceWidth = Math.max(1, screenFormat.referenceWidth ?? 1920);
        const referenceHeight = Math.max(1, screenFormat.referenceHeight ?? 1080);
        const zoomScale = canvasZoom / 100;
        const framePadding = 8;
        const visibleCanvasWidth = Math.max(220, Math.round(referenceWidth * zoomScale));
        const visibleCanvasHeight = Math.max(180, Math.round(referenceHeight * zoomScale));
        const studioRowHeight = visibleCanvasHeight / VISIBLE_CANVAS_ROWS;
        const totalCanvasHeight = Math.max(visibleCanvasHeight, Math.ceil(canvasRows * studioRowHeight));
        const stageWidth = Math.max(canvasViewport.width, visibleCanvasWidth + framePadding * 2);
        const stageHeight = Math.max(canvasViewport.height, totalCanvasHeight + framePadding * 2);
        const surfaceLeft = Math.max(framePadding, Math.floor((stageWidth - visibleCanvasWidth) / 2));
        return {
          referenceWidth,
          referenceHeight,
          visibleCanvasWidth,
          visibleCanvasHeight,
          studioRowHeight,
          totalCanvasHeight,
          framePadding,
          stageWidth,
          stageHeight,
          surfaceLeft
        };
      })()
    : undefined;

  const visibleFrameStyle = studioCanvasMetrics
    ? {
        left: `${studioCanvasMetrics.surfaceLeft}px`,
        top: `${studioCanvasMetrics.framePadding}px`,
        width: `${studioCanvasMetrics.visibleCanvasWidth}px`,
        height: `${studioCanvasMetrics.visibleCanvasHeight}px`
      }
    : undefined;

  const canvasStageStyle = studioCanvasMetrics
    ? {
        width: `${studioCanvasMetrics.stageWidth}px`,
        minHeight: `${studioCanvasMetrics.stageHeight}px`
      }
    : undefined;

  const studioCanvasPlacementStyle = studioCanvasMetrics
    ? {
        width: `${studioCanvasMetrics.visibleCanvasWidth}px`,
        minHeight: `${studioCanvasMetrics.totalCanvasHeight}px`,
        marginLeft: `${studioCanvasMetrics.surfaceLeft}px`,
        marginTop: `${studioCanvasMetrics.framePadding}px`
      }
    : undefined;

  const studioOverlayPlacementStyle = studioCanvasMetrics
    ? {
        left: `${studioCanvasMetrics.surfaceLeft}px`,
        top: `${studioCanvasMetrics.framePadding}px`,
        width: `${studioCanvasMetrics.visibleCanvasWidth}px`,
        height: `${studioCanvasMetrics.visibleCanvasHeight}px`
      }
    : undefined;

  const saveDraft = async () => {
    if (!draft) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await screenTemplateRepository.upsert(draft);
      setTemplate(cloneTemplate(draft));
      setStatusMessage(`Template enregistre: ${draft.name}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const addWidget = (item: WidgetPaletteItem) => {
    if (!selectedSet || !selectedScreen || !selectedTabGroup || !canEdit) {
      return;
    }
    const defaults = getWidgetDefaults(item.type);
    const nextWidget: ScreenWidgetDefinition = {
      id: makeId('screen_widget'),
      type: item.type,
      title: item.title,
      layout: findNextSlot(selectedTabGroup.widgets, selectedSet.gridColumns, item.defaultW, item.defaultH),
      config: defaults.config,
      dataSource: defaults.dataSource,
      permissions: defaults.permissions,
      isVisible: true
    };
    setDraft((current) =>
      current
        ? updateTabGroupInDraft(current, selectedSet.id, selectedScreen.id, selectedTabGroup.id, (group) => ({
            ...group,
            widgets: [...group.widgets, nextWidget]
          }))
        : current
    );
    setSelectedWidgetId(nextWidget.id);
    setStatusMessage(null);
  };

  const removeWidget = (widgetId: string) => {
    if (!selectedSet || !selectedScreen || !selectedTabGroup || !canEdit) {
      return;
    }
    setDraft((current) =>
      current
        ? updateTabGroupInDraft(current, selectedSet.id, selectedScreen.id, selectedTabGroup.id, (group) => ({
            ...group,
            widgets: group.widgets.filter((widget) => widget.id !== widgetId)
          }))
        : current
    );
    if (selectedWidgetId === widgetId) {
      setSelectedWidgetId('');
    }
  };

  const duplicateSelectedSet = () => {
    if (!selectedSet || !draft || !canEdit) {
      return;
    }
    const duplicatedSet = {
      ...ensureScreenSetFormat(selectedSet),
      id: makeId('screen_set'),
      name: `${selectedSet.name} (copie)`,
      screens: selectedSet.screens.map((screen) => ({
        ...screen,
        id: makeId('screen'),
        tabGroups: screen.tabGroups.map((group) => cloneTabGroupWithIds(group))
      }))
    };
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: [...draft.sets, duplicatedSet]
    });
    setSelectedSetId(duplicatedSet.id);
    setSelectedScreenId(duplicatedSet.screens[0]?.id ?? '');
    setSelectedTabGroupId(duplicatedSet.screens[0]?.tabGroups[0]?.id ?? '');
    setSelectedWidgetId(duplicatedSet.screens[0]?.tabGroups[0]?.widgets[0]?.id ?? '');
    setStatusMessage('Set duplique.');
  };

  const createSet = () => {
    if (!draft || !canEdit) {
      return;
    }
    const nextSet = createDefaultSetFromSource(
      selectedSet
        ? {
            devicePreset: selectedSet.devicePreset,
            gridColumns: selectedSet.gridColumns,
            screenFormatPreset: selectedScreen?.screenFormatPreset ?? selectedSet.screenFormatPreset
          }
        : undefined
    );
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: [...draft.sets, nextSet]
    });
    setSelectedSetId(nextSet.id);
    setSelectedScreenId(nextSet.screens[0]?.id ?? '');
    setSelectedTabGroupId(nextSet.screens[0]?.tabGroups[0]?.id ?? '');
    setSelectedWidgetId('');
    setStatusMessage('Nouveau set créé.');
  };

  const deleteSelectedSet = () => {
    if (!draft || !selectedSet || !canEdit || draft.sets.length <= 1) {
      return;
    }
    if (!window.confirm(`Supprimer le set "${selectedSet.name}" ?`)) {
      return;
    }
    const remainingSets = draft.sets.filter((set) => set.id !== selectedSet.id);
    const fallbackSet = remainingSets[0] ?? null;
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: remainingSets
    });
    setSelectedSetId(fallbackSet?.id ?? '');
    setSelectedScreenId(fallbackSet?.screens[0]?.id ?? '');
    setSelectedTabGroupId(fallbackSet?.screens[0]?.tabGroups[0]?.id ?? '');
    setSelectedWidgetId(fallbackSet?.screens[0]?.tabGroups[0]?.widgets[0]?.id ?? '');
    setStatusMessage('Set supprimé.');
  };

  const duplicateSelectedScreen = () => {
    if (!selectedSet || !selectedScreen || !draft || !canEdit) {
      return;
    }
    const nextOrder = selectedSet.screens.length + 1;
    const duplicatedScreen = {
      ...selectedScreen,
      id: makeId('screen'),
      name: `${selectedScreen.name} (copie)`,
      mode: nextOrder === 1 ? 'main' as const : 'detached' as const,
      order: nextOrder,
      tabGroups: selectedScreen.tabGroups.map((group) => cloneTabGroupWithIds(group))
    };
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: draft.sets.map((set) =>
        set.id === selectedSet.id ? { ...set, screens: [...set.screens, duplicatedScreen] } : set
      )
    });
    setSelectedScreenId(duplicatedScreen.id);
    setSelectedTabGroupId(duplicatedScreen.tabGroups[0]?.id ?? '');
    setSelectedWidgetId(duplicatedScreen.tabGroups[0]?.widgets[0]?.id ?? '');
    setStatusMessage('Ecran duplique.');
  };

  const createScreen = () => {
    if (!selectedSet || !draft || !canEdit) {
      return;
    }
    const nextOrder = selectedSet.screens.length + 1;
    const hasMainScreen = selectedSet.screens.some((screen) => screen.mode === 'main');
    const nextScreen = createDefaultScreen(
      nextOrder,
      hasMainScreen ? 'detached' : 'main',
      selectedScreen?.screenFormatPreset ?? selectedSet.screenFormatPreset ?? getDefaultScreenFormatPreset(selectedSet.devicePreset)
    );
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: draft.sets.map((set) =>
        set.id === selectedSet.id ? { ...set, screens: [...set.screens, nextScreen] } : set
      )
    });
    setSelectedScreenId(nextScreen.id);
    setSelectedTabGroupId(nextScreen.tabGroups[0]?.id ?? '');
    setSelectedWidgetId('');
    setStatusMessage('Nouvel écran créé.');
  };

  const createTabGroup = () => {
    if (!selectedSet || !selectedScreen || !draft || !canEdit) {
      return;
    }
    const nextGroup: ScreenTabGroupDefinition = {
      id: makeId('screen_tab'),
      name: `Onglet ${selectedScreen.tabGroups.length + 1}`,
      isDefault: (selectedScreen.tabGroups?.length ?? 0) === 0,
      widgets: []
    };
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: draft.sets.map((set) =>
        set.id === selectedSet.id
          ? {
              ...set,
              screens: set.screens.map((screen) =>
                screen.id === selectedScreen.id ? { ...screen, tabGroups: [...screen.tabGroups, nextGroup] } : screen
              )
            }
          : set
      )
    });
    setSelectedTabGroupId(nextGroup.id);
    setSelectedWidgetId('');
    setStatusMessage('Nouvel onglet créé.');
  };

  const deleteSelectedScreen = () => {
    if (!draft || !selectedSet || !selectedScreen || !canEdit || selectedSet.screens.length <= 1) {
      return;
    }
    if (!window.confirm(`Supprimer l'écran "${selectedScreen.name}" ?`)) {
      return;
    }
    const nextScreens = selectedSet.screens
      .filter((screen) => screen.id !== selectedScreen.id)
      .map((screen, index) => ({
        ...screen,
        order: index + 1,
        mode: index === 0 ? 'main' as const : screen.mode === 'main' ? 'detached' as const : screen.mode
      }));
    const fallbackScreen = nextScreens[0] ?? null;
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: draft.sets.map((set) => (set.id === selectedSet.id ? { ...set, screens: nextScreens } : set))
    });
    setSelectedScreenId(fallbackScreen?.id ?? '');
    setSelectedTabGroupId(fallbackScreen?.tabGroups[0]?.id ?? '');
    setSelectedWidgetId(fallbackScreen?.tabGroups[0]?.widgets[0]?.id ?? '');
    setStatusMessage('Écran supprimé.');
  };

  const deleteSelectedTabGroup = () => {
    if (!draft || !selectedSet || !selectedScreen || !selectedTabGroup || !canEdit || selectedScreen.tabGroups.length <= 1) {
      return;
    }
    if (!window.confirm(`Supprimer l'onglet "${selectedTabGroup.name}" ?`)) {
      return;
    }
    const nextTabGroups = selectedScreen.tabGroups
      .filter((group) => group.id !== selectedTabGroup.id)
      .map((group, index) => ({
        ...group,
        isDefault: index === 0 ? true : Boolean(group.isDefault)
      }));
    const fallbackGroup = nextTabGroups.find((group) => group.isDefault) ?? nextTabGroups[0] ?? null;
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: draft.sets.map((set) =>
        set.id === selectedSet.id
          ? {
              ...set,
              screens: set.screens.map((screen) =>
                screen.id === selectedScreen.id ? { ...screen, tabGroups: nextTabGroups } : screen
              )
            }
          : set
      )
    });
    setSelectedTabGroupId(fallbackGroup?.id ?? '');
    setSelectedWidgetId('');
    setStatusMessage('Onglet supprimé.');
  };

  const duplicateSelectedTabGroup = () => {
    if (!selectedSet || !selectedScreen || !selectedTabGroup || !draft || !canEdit) {
      return;
    }
    const duplicatedGroup = cloneTabGroupWithIds(selectedTabGroup);
    setDraft({
      ...draft,
      updatedAt: new Date().toISOString(),
      sets: draft.sets.map((set) =>
        set.id === selectedSet.id
          ? {
              ...set,
              screens: set.screens.map((screen) =>
                screen.id === selectedScreen.id ? { ...screen, tabGroups: [...screen.tabGroups, duplicatedGroup] } : screen
              )
            }
          : set
      )
    });
    setSelectedTabGroupId(duplicatedGroup.id);
    setSelectedWidgetId(duplicatedGroup.widgets[0]?.id ?? '');
    setStatusMessage('Onglet duplique.');
  };

  const updateSelectedWidget = (updater: (widget: ScreenWidgetDefinition) => ScreenWidgetDefinition) => {
    if (!selectedSet || !selectedScreen || !selectedTabGroup || !selectedWidget || !canEdit) {
      return;
    }
    setDraft((current) =>
      current ? updateWidgetInDraft(current, selectedSet.id, selectedScreen.id, selectedTabGroup.id, selectedWidget.id, updater) : current
    );
  };

  const renderLeftPanel = (isDetached = false) => (
    <>
      <div className="studio-panel__toolbar">
        <div>
          <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>Contexte</h2>
          <p style={{ marginTop: 0, marginBottom: 0, fontSize: '0.9rem' }}>Pilote le set, l ecran, l onglet et ajoute les widgets depuis ici.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setDetachedPanels((current) => ({ ...current, left: !current.left }))}>
          {isDetached ? 'Reintegrer' : 'Detacher'}
        </Button>
      </div>
      <div className="screen-studio-context-stack">
        <section className="screen-studio-context-section">
          <div className="screen-studio-context-section__header">
            <h3>Set</h3>
            <small>Choix du set et réglages communs.</small>
          </div>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Set actif</span>
            <select value={selectedSet?.id ?? ''} onChange={(event) => setSelectedSetId(event.target.value)}>
              {draft.sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name} · {set.screens.length} écran(s)
                </option>
              ))}
            </select>
          </label>
          {selectedSet ? (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Nom du set</span>
              <input
                type="text"
                value={selectedSet.name}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          updatedAt: new Date().toISOString(),
                          sets: current.sets.map((set) => (set.id === selectedSet.id ? { ...set, name: event.target.value } : set))
                        }
                      : current
                  )
                }
                disabled={!canEdit}
              />
            </label>
          ) : null}
          <div className="screen-studio-context-actions">
            <Button type="button" variant="secondary" onClick={createSet} disabled={!canEdit}>
              Nouveau set
            </Button>
            <Button type="button" variant="secondary" onClick={duplicateSelectedSet} disabled={!canEdit || !selectedSet}>
              Dupliquer le set
            </Button>
            <Button type="button" variant="secondary" onClick={deleteSelectedSet} disabled={!canEdit || !selectedSet || (draft?.sets.length ?? 0) <= 1}>
              Supprimer le set
            </Button>
          </div>
        </section>

        <section className="screen-studio-context-section">
          <div className="screen-studio-context-section__header">
            <h3>Écran</h3>
            <small>Gestion des fenêtres du set actif.</small>
          </div>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Écran actif</span>
            <select value={selectedScreen?.id ?? ''} onChange={(event) => setSelectedScreenId(event.target.value)}>
              {(selectedSet?.screens ?? []).map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.name} ({screen.mode === 'detached' ? 'detache' : 'principal'})
                </option>
              ))}
            </select>
          </label>
          {selectedScreen ? (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Nom de l’écran</span>
              <input
                type="text"
                value={selectedScreen.name}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          updatedAt: new Date().toISOString(),
                          sets: current.sets.map((set) =>
                            set.id === selectedSet?.id
                              ? {
                                  ...set,
                                  screens: set.screens.map((screen) =>
                                    screen.id === selectedScreen.id ? { ...screen, name: event.target.value } : screen
                                  )
                                }
                              : set
                          )
                        }
                      : current
                  )
                }
                disabled={!canEdit}
              />
            </label>
          ) : null}
          {selectedScreen && selectedSet ? (
            <div className="studio-properties__section studio-properties__section--plain screen-studio-set-format-card">
              <div className="screen-studio-set-format-card__header">
                <div className="screen-studio-set-format-card__heading">
                  <strong>Format de l’écran</strong>
                  <small>{screenFormatSummary(ensureScreenFormatForScreen(selectedScreen, selectedSet))}</small>
                </div>
                <Button type="button" variant="secondary" onClick={() => setIsSetFormatExpanded((current) => !current)}>
                  {isSetFormatExpanded ? 'Masquer' : 'Afficher'}
                </Button>
              </div>
              {isSetFormatExpanded ? (
                <>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>Preset d’écran</span>
                    <select
                      value={ensureScreenFormatForScreen(selectedScreen, selectedSet).screenFormatPreset}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                updatedAt: new Date().toISOString(),
                                sets: current.sets.map((set) =>
                                  set.id === selectedSet.id
                                    ? {
                                        ...set,
                                        screens: set.screens.map((screen) =>
                                          screen.id === selectedScreen.id
                                            ? applyScreenFormatPresetToScreen(ensureScreenFormatForScreen(screen, set), event.target.value as ScreenFormatPreset)
                                            : screen
                                        )
                                      }
                                    : set
                                )
                              }
                            : current
                        )
                      }
                      disabled={!canEdit}
                    >
                      {SCREEN_FORMAT_PRESETS.map((preset) => (
                        <option key={preset.preset} value={preset.preset}>
                          {preset.label} · {preset.aspectRatio} · {screenOrientationLabel(preset.orientation)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="screen-studio-set-format-grid">
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Ratio</span>
                      <input
                        type="text"
                        value={ensureScreenFormatForScreen(selectedScreen, selectedSet).aspectRatio ?? ''}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  updatedAt: new Date().toISOString(),
                                  sets: current.sets.map((set) =>
                                    set.id === selectedSet.id
                                      ? {
                                          ...set,
                                          screens: set.screens.map((screen) =>
                                            screen.id === selectedScreen.id
                                              ? {
                                                  ...ensureScreenFormatForScreen(screen, set),
                                                  screenFormatPreset: 'custom',
                                                  aspectRatio: event.target.value
                                                }
                                              : screen
                                          )
                                        }
                                      : set
                                  )
                                }
                              : current
                          )
                        }
                        disabled={!canEdit}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Orientation</span>
                      <select
                        value={ensureScreenFormatForScreen(selectedScreen, selectedSet).orientation ?? 'landscape'}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  updatedAt: new Date().toISOString(),
                                  sets: current.sets.map((set) =>
                                    set.id === selectedSet.id
                                      ? {
                                          ...set,
                                          screens: set.screens.map((screen) =>
                                            screen.id === selectedScreen.id
                                              ? {
                                                  ...ensureScreenFormatForScreen(screen, set),
                                                  screenFormatPreset: 'custom',
                                                  orientation: event.target.value as 'landscape' | 'portrait'
                                                }
                                              : screen
                                          )
                                        }
                                      : set
                                  )
                                }
                              : current
                          )
                        }
                        disabled={!canEdit}
                      >
                        <option value="landscape">Paysage</option>
                        <option value="portrait">Portrait</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Largeur de référence</span>
                      <input
                        type="number"
                        min="320"
                        value={ensureScreenFormatForScreen(selectedScreen, selectedSet).referenceWidth ?? 1920}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  updatedAt: new Date().toISOString(),
                                  sets: current.sets.map((set) =>
                                    set.id === selectedSet.id
                                      ? {
                                          ...set,
                                          screens: set.screens.map((screen) =>
                                            screen.id === selectedScreen.id
                                              ? {
                                                  ...ensureScreenFormatForScreen(screen, set),
                                                  screenFormatPreset: 'custom',
                                                  referenceWidth: Number(event.target.value) || 1920
                                                }
                                              : screen
                                          )
                                        }
                                      : set
                                  )
                                }
                              : current
                          )
                        }
                        disabled={!canEdit}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Hauteur de référence</span>
                      <input
                        type="number"
                        min="320"
                        value={ensureScreenFormatForScreen(selectedScreen, selectedSet).referenceHeight ?? 1080}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  updatedAt: new Date().toISOString(),
                                  sets: current.sets.map((set) =>
                                    set.id === selectedSet.id
                                      ? {
                                          ...set,
                                          screens: set.screens.map((screen) =>
                                            screen.id === selectedScreen.id
                                              ? {
                                                  ...ensureScreenFormatForScreen(screen, set),
                                                  screenFormatPreset: 'custom',
                                                  referenceHeight: Number(event.target.value) || 1080
                                                }
                                              : screen
                                          )
                                        }
                                      : set
                                  )
                                }
                              : current
                          )
                        }
                        disabled={!canEdit}
                      />
                    </label>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="screen-studio-context-actions">
            <Button type="button" variant="secondary" onClick={createScreen} disabled={!canEdit || !selectedSet}>
              Nouvel écran
            </Button>
            <Button type="button" variant="secondary" onClick={duplicateSelectedScreen} disabled={!canEdit || !selectedScreen}>
              Dupliquer l’écran
            </Button>
            <Button type="button" variant="secondary" onClick={deleteSelectedScreen} disabled={!canEdit || !selectedScreen || (selectedSet?.screens.length ?? 0) <= 1}>
              Supprimer l’écran
            </Button>
          </div>
        </section>

        <section className="screen-studio-context-section">
          <div className="screen-studio-context-section__header">
            <h3>Onglet</h3>
            <small>Organisation des vues à l’intérieur de l’écran.</small>
          </div>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Onglet actif</span>
            <select value={selectedTabGroup?.id ?? ''} onChange={(event) => setSelectedTabGroupId(event.target.value)}>
              {(selectedScreen?.tabGroups ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          {selectedTabGroup ? (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Nom de l’onglet</span>
              <input
                type="text"
                value={selectedTabGroup.name}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          updatedAt: new Date().toISOString(),
                          sets: current.sets.map((set) =>
                            set.id === selectedSet?.id
                              ? {
                                  ...set,
                                  screens: set.screens.map((screen) =>
                                    screen.id === selectedScreen?.id
                                      ? {
                                          ...screen,
                                          tabGroups: screen.tabGroups.map((group) =>
                                            group.id === selectedTabGroup.id ? { ...group, name: event.target.value } : group
                                          )
                                        }
                                      : screen
                                  )
                                }
                              : set
                          )
                        }
                      : current
                  )
                }
                disabled={!canEdit}
              />
            </label>
          ) : null}
          <div className="screen-studio-context-actions">
            <Button type="button" variant="secondary" onClick={createTabGroup} disabled={!canEdit || !selectedScreen}>
              Nouvel onglet
            </Button>
            <Button type="button" variant="secondary" onClick={duplicateSelectedTabGroup} disabled={!canEdit || !selectedTabGroup}>
              Dupliquer l’onglet
            </Button>
            <Button type="button" variant="secondary" onClick={deleteSelectedTabGroup} disabled={!canEdit || !selectedTabGroup || (selectedScreen?.tabGroups.length ?? 0) <= 1}>
              Supprimer l’onglet
            </Button>
          </div>
        </section>
      </div>

      <div className="screen-studio-widget-section">
        <div className="screen-studio-widget-section__header">
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>Widgets</h2>
            <p style={{ marginTop: 0, marginBottom: 0, fontSize: '0.9rem' }}>Ajoute un widget dans l’onglet actif.</p>
          </div>
        </div>
        <div className="screen-studio-widget-palette">
          {WIDGET_PALETTE.map((item) => (
            <button key={item.type} type="button" className="screen-widget-palette-item" onClick={() => addWidget(item)} disabled={!canEdit}>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  const renderRightPanel = (isDetached = false) => (
    <>
      <div className="studio-panel__toolbar">
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Proprietes widget</h2>
        <Button type="button" variant="secondary" onClick={() => setDetachedPanels((current) => ({ ...current, right: !current.right }))}>
          {isDetached ? 'Reintegrer' : 'Detacher'}
        </Button>
      </div>
      {selectedWidget ? (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <FieldBlock title="General">
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Titre</span>
              <input type="text" value={selectedWidget.title} onChange={(event) => updateSelectedWidget((widget) => ({ ...widget, title: event.target.value }))} disabled={!canEdit} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Bandeau titre</span>
              <select
                value={String(asBoolean(selectedWidget.config?.showHeader, true))}
                onChange={(event) =>
                  updateSelectedWidget((widget) => ({
                    ...widget,
                    config: {
                      ...(widget.config ?? {}),
                      showHeader: event.target.value === 'true'
                    }
                  }))
                }
                disabled={!canEdit}
              >
                <option value="true">Afficher</option>
                <option value="false">Masquer</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Visible</span>
              <select value={String(selectedWidget.isVisible !== false)} onChange={(event) => updateSelectedWidget((widget) => ({ ...widget, isVisible: event.target.value === 'true' }))} disabled={!canEdit}>
                <option value="true">Oui</option>
                <option value="false">Non</option>
              </select>
            </label>
          </FieldBlock>

          <FieldBlock title="Placement">
            <div className="grid">
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>X</span>
                <input
                  type="number"
                  value={selectedWidget.layout.x}
                  onChange={(event) =>
                    updateSelectedWidget((widget) => ({
                      ...widget,
                      layout: clampWidgetLayout({ ...widget.layout, x: Number(event.target.value) || 0 }, selectedSet?.gridColumns ?? 24)
                    }))
                  }
                  disabled={!canEdit}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Y</span>
                <input
                  type="number"
                  value={selectedWidget.layout.y}
                  onChange={(event) =>
                    updateSelectedWidget((widget) => ({
                      ...widget,
                      layout: clampWidgetLayout({ ...widget.layout, y: Number(event.target.value) || 0 }, selectedSet?.gridColumns ?? 24)
                    }))
                  }
                  disabled={!canEdit}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Largeur</span>
                <input
                  type="number"
                  value={selectedWidget.layout.w}
                  onChange={(event) =>
                    updateSelectedWidget((widget) => ({
                      ...widget,
                      layout: clampWidgetLayout({ ...widget.layout, w: Number(event.target.value) || widget.layout.w }, selectedSet?.gridColumns ?? 24)
                    }))
                  }
                  disabled={!canEdit}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Hauteur</span>
                <input
                  type="number"
                  value={selectedWidget.layout.h}
                  onChange={(event) =>
                    updateSelectedWidget((widget) => ({
                      ...widget,
                      layout: clampWidgetLayout({ ...widget.layout, h: Number(event.target.value) || widget.layout.h }, selectedSet?.gridColumns ?? 24)
                    }))
                  }
                  disabled={!canEdit}
                />
              </label>
            </div>
          </FieldBlock>

          <WidgetConfigEditor
            widget={selectedWidget}
            canEdit={canEdit}
            onChange={updateSelectedWidget}
            resources={availableResources}
            systemViews={systemViews.map((view) => ({ id: view.id, name: view.name }))}
            overlayTargets={overlayTargets}
            characterSheetTargets={previewRuntimeTargets
              .filter((target) => target.widgetType === 'character_sheet')
              .map((target) => ({
                id: target.id,
                name: `${target.title} · ${target.screenName}`
              }))}
          />

          <small>Déplace le widget par son entête et redimensionne-le avec la poignée en bas à droite.</small>
        </div>
      ) : (
        <p>Sélectionne un widget dans le canvas pour éditer ses propriétés.</p>
      )}
    </>
  );

  return (
    <Layout wide>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Studio Ecrans</h1>
            <p style={{ margin: 0 }}>
              Template: <strong>{draft.name}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Link className="button secondary" to="/screen-templates">
              Retour catalogue
            </Link>
            <Button type="button" onClick={() => void saveDraft()} disabled={isSaving || !canEdit}>
              Enregistrer
            </Button>
          </div>
        </div>
        {statusMessage ? <p style={{ color: '#067647', marginBottom: 0 }}>{statusMessage}</p> : null}
        {errorMessage ? <p style={{ color: '#b42318', marginBottom: 0 }}>{errorMessage}</p> : null}
      </section>

      <section
        className={`screen-studio-layout${detachedPanels.left ? ' screen-studio-layout--left-detached' : ''}${detachedPanels.right ? ' screen-studio-layout--right-detached' : ''}`.trim()}
      >
        {!detachedPanels.left || detachedBlocked.left ? (
          <aside className="card screen-studio-panel">
            {detachedPanels.left && detachedBlocked.left ? (
              <div className="screen-studio-panel__blocked">
                <p style={{ marginTop: 0 }}>Fenêtre détachée bloquée par le navigateur.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDetachedBlocked((current) => ({ ...current, left: false }));
                    setDetachedRetryKey((current) => ({ ...current, left: current.left + 1 }));
                  }}
                >
                  Ouvrir la fenêtre
                </Button>
              </div>
            ) : null}
            {renderLeftPanel(false)}
          </aside>
        ) : null}

        <section className="card" style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <div>
              <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{canvasMode === 'preview' ? 'Apercu canvas' : 'Canvas grille'}</h2>
              <p style={{ margin: 0 }}>
                {selectedSet?.name} | {selectedScreen?.name} | {selectedTabGroup?.name} | {selectedScreen && selectedSet ? screenFormatSummary(ensureScreenFormatForScreen(selectedScreen, selectedSet)) : ''} | Grille {selectedSet?.gridColumns} colonnes
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div className="screen-runtime-tabs">
                <button type="button" className="screen-runtime-tab" onClick={() => setCanvasZoom((current) => Math.max(20, current - 10))}>
                  -
                </button>
                <span className="screen-studio-zoom-indicator">{canvasZoom}%</span>
                <button type="button" className="screen-runtime-tab" onClick={() => setCanvasZoom((current) => Math.min(140, current + 10))}>
                  +
                </button>
              </div>
              <div className="screen-runtime-tabs">
              <button type="button" className={`screen-runtime-tab ${canvasMode === 'edit' ? 'is-active' : ''}`.trim()} onClick={() => setCanvasMode('edit')}>
                Edition
              </button>
              <button type="button" className={`screen-runtime-tab ${canvasMode === 'preview' ? 'is-active' : ''}`.trim()} onClick={() => setCanvasMode('preview')}>
                Apercu
              </button>
              </div>
            </div>
          </div>
          <div ref={canvasViewportRef} className="screen-studio-canvas-viewport">
            <div className="screen-studio-canvas-stage" style={canvasStageStyle}>
              {selectedScreen && selectedSet ? (
                <div className="screen-studio-visible-frame" aria-hidden="true">
                  <div className="screen-studio-visible-frame__box" style={visibleFrameStyle}>
                    <div className="screen-studio-visible-frame__label">
                      Surface écran fixe · {studioCanvasMetrics?.referenceWidth}×{studioCanvasMetrics?.referenceHeight} · zoom {canvasZoom}%
                    </div>
                  </div>
                </div>
              ) : null}
              <div
                ref={canvasRef}
                className={canvasMode === 'preview' ? 'screen-runtime-canvas screen-studio-runtime-preview' : 'screen-studio-canvas'}
                style={{
                  ['--screen-grid-columns' as string]: String(selectedSet?.gridColumns ?? 24),
                  ['--screen-grid-rows' as string]: String(canvasRows),
                  ['--screen-row-height' as string]: `${studioCanvasMetrics?.studioRowHeight ?? 36}px`,
                  ...studioCanvasPlacementStyle
                }}
              >
              {(selectedTabGroup?.widgets ?? []).length === 0 ? (
                <div className={canvasMode === 'preview' ? 'screen-runtime-canvas__empty' : 'screen-studio-canvas__empty'}>
                  {canvasMode === 'preview' ? 'Aucun widget dans cet onglet.' : 'Active un widget depuis la palette de gauche pour commencer.'}
                </div>
              ) : null}
              {(selectedTabGroup?.widgets ?? [])
                .filter((widget) => canvasMode !== 'preview' || widget.type !== 'open_target_overlay')
                .map((widget) => {
              const preview = widgetPreviewContent(widget);
              const showHeader = asBoolean(widget.config?.showHeader, true);
              return (
                <div
                  key={widget.id}
                  className={
                    canvasMode === 'preview'
                      ? 'screen-runtime-widget'
                      : `screen-studio-widget ${selectedWidgetId === widget.id ? 'is-selected' : ''}`.trim()
                  }
                  style={{
                    gridTemplateRows: showHeader ? 'auto 1fr' : '1fr',
                    left: `calc((100% / ${selectedSet?.gridColumns ?? 24}) * ${widget.layout.x})`,
                    top: `calc(${studioCanvasMetrics?.studioRowHeight ?? 36}px * ${widget.layout.y})`,
                    width: `calc((100% / ${selectedSet?.gridColumns ?? 24}) * ${widget.layout.w})`,
                    height: `calc(${studioCanvasMetrics?.studioRowHeight ?? 36}px * ${widget.layout.h})`
                  }}
                  onMouseDown={canvasMode === 'edit' ? () => setSelectedWidgetId(widget.id) : undefined}
                >
                  {canvasMode === 'edit' ? (
                    <div
                      className="screen-studio-widget__toolbar"
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        if (!canEdit) {
                          return;
                        }
                        setSelectedWidgetId(widget.id);
                        setDragState({
                          widgetId: widget.id,
                          mode: 'move',
                          startX: event.clientX,
                          startY: event.clientY,
                          startLayout: { ...widget.layout }
                        });
                      }}
                    >
                      <span className="screen-studio-widget__toolbar-type">{widgetTypeLabel(widget.type)}</span>
                      <button
                        type="button"
                        className="screen-studio-widget__remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeWidget(widget.id);
                        }}
                        disabled={!canEdit}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  {showHeader ? (
                    <div
                      className={canvasMode === 'preview' ? 'screen-runtime-widget__header' : 'screen-studio-widget__header'}
                      onMouseDown={
                        canvasMode === 'edit'
                          ? (event) => {
                              event.stopPropagation();
                              if (!canEdit) {
                                return;
                              }
                              setSelectedWidgetId(widget.id);
                              setDragState({
                                widgetId: widget.id,
                                mode: 'move',
                                startX: event.clientX,
                                startY: event.clientY,
                                startLayout: { ...widget.layout }
                              });
                            }
                          : undefined
                      }
                    >
                      <strong>{widget.title}</strong>
                      {canvasMode === 'preview' ? <span>{widgetTypeLabel(widget.type)}</span> : null}
                      {canvasMode === 'edit' ? (
                        <button
                          type="button"
                          className="screen-studio-widget__remove"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeWidget(widget.id);
                          }}
                          disabled={!canEdit}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={canvasMode === 'preview' ? 'screen-runtime-widget__body' : 'screen-studio-widget__body'}>
                    {canvasMode === 'edit' ? <span className="screen-studio-widget__type">{widgetTypeLabel(widget.type)}</span> : null}
                    {canvasMode === 'preview' ? (
                      <RuntimeWidgetContent
                        widget={widget}
                        session={previewSession}
                        templateId={draft?.id ?? templateId}
                        currentUser={previewCurrentUser}
                        role="gm"
                        preview={preview}
                        runtimeTargets={previewRuntimeTargets}
                      />
                    ) : (
                      <div className="screen-studio-widget__preview">
                        <strong>{preview.headline}</strong>
                        {preview.details.map((detail) => (
                          <small key={detail}>{detail}</small>
                        ))}
                      </div>
                    )}
                  </div>
                  {canvasMode === 'edit' ? (
                    <button
                      type="button"
                      className="screen-studio-widget__resize"
                      onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => {
                        event.stopPropagation();
                        if (!canEdit) {
                          return;
                        }
                        setSelectedWidgetId(widget.id);
                        setDragState({
                          widgetId: widget.id,
                          mode: 'resize',
                          startX: event.clientX,
                          startY: event.clientY,
                          startLayout: { ...widget.layout }
                        });
                      }}
                      disabled={!canEdit}
                      aria-label={`Redimensionner ${widget.title}`}
                    />
                  ) : null}
                </div>
              );
                })}
              </div>
              {canvasMode === 'preview'
                ? (selectedTabGroup?.widgets ?? [])
                    .filter((widget) => widget.type === 'open_target_overlay')
                    .map((widget) => (
                      <div key={widget.id} className="screen-studio-preview-overlay-surface" style={studioOverlayPlacementStyle}>
                        <RuntimeWidgetContent
                          widget={widget}
                          session={previewSession}
                          templateId={draft?.id ?? templateId}
                          currentUser={previewCurrentUser}
                          role="gm"
                          preview={widgetPreviewContent(widget)}
                          runtimeTargets={previewRuntimeTargets}
                        />
                      </div>
                    ))
                : null}
            </div>
          </div>
        </section>

        {!detachedPanels.right || detachedBlocked.right ? (
          <aside className="card screen-studio-panel">
            {detachedPanels.right && detachedBlocked.right ? (
              <div className="screen-studio-panel__blocked">
                <p style={{ marginTop: 0 }}>Fenêtre détachée bloquée par le navigateur.</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setDetachedBlocked((current) => ({ ...current, right: false }));
                    setDetachedRetryKey((current) => ({ ...current, right: current.right + 1 }));
                  }}
                >
                  Ouvrir la fenêtre
                </Button>
              </div>
            ) : null}
            {renderRightPanel(false)}
          </aside>
        ) : null}
      </section>
      {detachedPanels.left ? (
        <DetachedStudioPanelPortal
          key={`left-${detachedRetryKey.left}`}
          panelKey="left"
          title="Nexus Forge - Studio Ecrans - Contexte"
          onClose={() => setDetachedPanels((current) => ({ ...current, left: false }))}
          onBlocked={() => setDetachedBlocked((current) => ({ ...current, left: true }))}
        >
          <section className="studio-panel studio-panel--detached">{renderLeftPanel(true)}</section>
        </DetachedStudioPanelPortal>
      ) : null}
      {detachedPanels.right ? (
        <DetachedStudioPanelPortal
          key={`right-${detachedRetryKey.right}`}
          panelKey="right"
          title="Nexus Forge - Studio Ecrans - Proprietes"
          onClose={() => setDetachedPanels((current) => ({ ...current, right: false }))}
          onBlocked={() => setDetachedBlocked((current) => ({ ...current, right: true }))}
        >
          <section className="studio-panel studio-panel--detached">{renderRightPanel(true)}</section>
        </DetachedStudioPanelPortal>
      ) : null}
    </Layout>
  );
}

function WidgetConfigEditor({
  widget,
  canEdit,
  onChange,
  resources,
  systemViews,
  overlayTargets,
  characterSheetTargets
}: {
  widget: ScreenWidgetDefinition;
  canEdit: boolean;
  onChange: (updater: (widget: ScreenWidgetDefinition) => ScreenWidgetDefinition) => void;
  resources: ResourceItem[];
  systemViews: Array<{ id: string; name: string }>;
  overlayTargets: Array<{ id: string; name: string }>;
  characterSheetTargets: Array<{ id: string; name: string }>;
}) {
  const config = widget.config ?? {};
  const dataSource = widget.dataSource ?? {};
  const pdfResources = resources.filter((resource) => resource.kind === 'pdf');
  const mediaResources = resources.filter((resource) => resource.kind === 'image' || resource.kind === 'video' || resource.kind === 'audio');

  switch (widget.type) {
    case 'character_sheet':
      return (
        <>
          <FieldBlock title="Source fiche">
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Resolution</span>
              <select value={asString(config.sourceMode, 'auto_current')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'sourceMode', event.target.value))} disabled={!canEdit}>
                <option value="auto_current">Personnage du joueur courant</option>
                <option value="explicit">Personnage explicite</option>
                <option value="target">Cible runtime</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Identifiant personnage</span>
              <input value={asString(dataSource.characterId)} onChange={(event) => onChange((current) => updateNestedRecord(current, 'dataSource', 'characterId', event.target.value))} disabled={!canEdit} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Libelle personnage</span>
              <input value={asString(dataSource.characterLabel)} onChange={(event) => onChange((current) => updateNestedRecord(current, 'dataSource', 'characterLabel', event.target.value))} disabled={!canEdit} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Mode de vue</span>
              <select value={asString(config.viewMode, 'player')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'viewMode', event.target.value))} disabled={!canEdit}>
                <option value="player">Joueur</option>
                <option value="gm">MJ</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Vue systeme</span>
              <select value={asString(config.viewId)} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'viewId', event.target.value))} disabled={!canEdit}>
                <option value="">Vue automatique</option>
                {systemViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
            </label>
            {asString(config.sourceMode, 'auto_current') === 'target' ? <small>Cette fiche pourra etre alimentee depuis le widget `Liste des personnages` via `Ouvrir dans`.</small> : <></>}
          </FieldBlock>
        </>
      );
    case 'chat':
      return (
        <FieldBlock title="Messagerie">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Canal</span>
            <select value={asString(config.channel, 'global')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'channel', event.target.value))} disabled={!canEdit}>
              <option value="global">Global</option>
              <option value="private">Prive</option>
              <option value="group">Groupe</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Whispers autorises</span>
            <select value={String(asBoolean(config.allowWhispers, true))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'allowWhispers', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
        </FieldBlock>
      );
    case 'clock':
      return (
        <FieldBlock title="Horloge">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Format</span>
            <select value={asString(config.format, '24h')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'format', event.target.value))} disabled={!canEdit}>
              <option value="24h">24h</option>
              <option value="12h">12h</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Afficher secondes</span>
            <select value={String(asBoolean(config.showSeconds, false))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'showSeconds', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
        </FieldBlock>
      );
    case 'alert_overlay':
      return (
        <FieldBlock title="Overlay">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Source</span>
            <select value={asString(config.source, 'all')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'source', event.target.value))} disabled={!canEdit}>
              <option value="incoming">Messages entrants</option>
              <option value="gm_priority">Prioritaire MJ</option>
              <option value="all">Tous</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Duree (ms)</span>
            <input type="number" value={asNumber(config.durationMs, 5000)} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'durationMs', Number(event.target.value) || 5000))} disabled={!canEdit} />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Position</span>
            <select value={asString(config.position, 'top_right')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'position', event.target.value))} disabled={!canEdit}>
              <option value="top_left">Haut gauche</option>
              <option value="top_right">Haut droite</option>
              <option value="bottom_left">Bas gauche</option>
              <option value="bottom_right">Bas droite</option>
            </select>
          </label>
        </FieldBlock>
      );
    case 'participant_presence':
      return (
        <FieldBlock title="Présence de séance">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Afficher les hors ligne</span>
            <select value={String(asBoolean(config.showOffline, true))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'showOffline', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Délai de présence (secondes)</span>
            <input type="number" min="5" max="300" value={asNumber(config.staleAfterSeconds, 45)} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'staleAfterSeconds', Number(event.target.value) || 45))} disabled={!canEdit} />
          </label>
        </FieldBlock>
      );
    case 'open_target_overlay':
      return (
        <FieldBlock title="Overlay cible">
          <p style={{ margin: 0 }}>Ce widget affiche un document ou media au-dessus de tout l ecran quand un autre widget utilise `Ouvrir dans`.</p>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Canal de réception</span>
            <input
              value={asString(config.channelKey, 'primary')}
              onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'channelKey', event.target.value || 'primary'))}
              disabled={!canEdit}
            />
          </label>
        </FieldBlock>
      );
    case 'open_target_control':
      return (
        <FieldBlock title="Controle overlay cible">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Overlay cible</span>
            <select value={asString(config.targetWidgetId)} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'targetWidgetId', event.target.value))} disabled={!canEdit}>
              <option value="">Choisir un overlay</option>
              {overlayTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Canal à piloter</span>
            <input
              value={asString(config.targetChannelKey, 'primary')}
              onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'targetChannelKey', event.target.value || 'primary'))}
              disabled={!canEdit}
            />
          </label>
        </FieldBlock>
      );
    case 'screen_viewer':
      return (
        <>
          <FieldBlock title="Source écran">
            <ResourcePickerField
              label="Ressource"
              value={{ resourceId: asString(dataSource.resourceId) || undefined, url: asString(dataSource.url) }}
              onChange={(next) =>
                onChange((current) => ({
                  ...current,
                  dataSource: {
                    ...(current.dataSource ?? {}),
                    resourceId: next.resourceId ?? '',
                    url: next.url ?? ''
                  }
                }))
              }
              kinds={['image', 'video', 'audio', 'pdf']}
              resources={mediaResources}
              disabled={!canEdit}
              allowManualUrl
              allowUpload={false}
              previewAlt="Écran"
              urlPlaceholder="https://.../media-ou-pdf"
              emptyOptionLabel="Aucune ressource"
            />
          </FieldBlock>
          <FieldBlock title="Affichage écran">
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Mode</span>
              <select value={asString(config.mode, 'auto')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'mode', event.target.value))} disabled={!canEdit}>
                <option value="auto">Auto</option>
                <option value="image">Image</option>
                <option value="video">Vidéo</option>
                <option value="audio">Audio</option>
                <option value="pdf">PDF</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Ajustement</span>
              <select value={asString(config.fit, 'contain')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'fit', event.target.value))} disabled={!canEdit}>
                <option value="contain">Contenir</option>
                <option value="cover">Couvrir</option>
                <option value="fill">Étirer</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Canal pilotable</span>
              <input value={asString(config.channelKey, 'primary')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'channelKey', event.target.value || 'primary'))} disabled={!canEdit} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Barre d outils</span>
              <select value={String(asBoolean(config.showToolbar, true))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'showToolbar', event.target.value === 'true'))} disabled={!canEdit}>
                <option value="true">Visible</option>
                <option value="false">Masquee</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Autoplay</span>
              <select value={String(asBoolean(config.autoplay, false))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'autoplay', event.target.value === 'true'))} disabled={!canEdit}>
                <option value="false">Non</option>
                <option value="true">Oui</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Boucle</span>
              <select value={String(asBoolean(config.loop, false))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'loop', event.target.value === 'true'))} disabled={!canEdit}>
                <option value="false">Non</option>
                <option value="true">Oui</option>
              </select>
            </label>
          </FieldBlock>
        </>
      );
    case 'documents':
      return (
        <FieldBlock title="Documents">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Scope</span>
            <select value={asString(config.scope, 'all')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'scope', event.target.value))} disabled={!canEdit}>
              <option value="session_shared">Partage session</option>
              <option value="user_private">Mes documents</option>
              <option value="all">Tous</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Upload autorise</span>
            <select value={String(asBoolean(config.allowUpload, true))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'allowUpload', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
        </FieldBlock>
      );
    case 'notes':
      return (
        <FieldBlock title="Notes">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Scope</span>
            <select value={asString(config.scope, 'private')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'scope', event.target.value))} disabled={!canEdit}>
              <option value="private">Prive</option>
              <option value="session">Partie</option>
              <option value="gm">MJ</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Autosave</span>
            <select value={String(asBoolean(config.autosave, true))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'autosave', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Placeholder</span>
            <input value={asString(config.placeholder, 'Prendre des notes...')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'placeholder', event.target.value))} disabled={!canEdit} />
          </label>
        </FieldBlock>
      );
    case 'character_list':
      return (
        <FieldBlock title="Liste personnages">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Afficher les PJ</span>
            <select value={String(asBoolean(config.showPcs, true))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'showPcs', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Afficher les PNJ</span>
            <select value={String(asBoolean(config.showNpcs, false))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'showNpcs', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Afficher les monstres</span>
            <select value={String(asBoolean(config.showMonsters, false))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'showMonsters', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Mode compact</span>
            <select value={String(asBoolean(config.compact, false))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'compact', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
          <small>
            {characterSheetTargets.length
              ? `${characterSheetTargets.length} cible(s) fiche disponible(s) dans ce set pour \`Ouvrir dans\`.`
              : 'Aucune cible fiche disponible dans ce set. Ajoute un widget `Fiche de personnage` pour activer `Ouvrir dans`.'}
          </small>
        </FieldBlock>
      );
    case 'dice_history':
      return (
        <FieldBlock title="Historique des jets">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Scope</span>
            <select value={asString(config.scope, 'party')} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'scope', event.target.value))} disabled={!canEdit}>
              <option value="self">Moi</option>
              <option value="party">Partie</option>
              <option value="all_visible">Tout visible</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Limite</span>
            <input type="number" value={asNumber(config.limit, 10)} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'limit', Number(event.target.value) || 10))} disabled={!canEdit} />
          </label>
        </FieldBlock>
      );
    case 'initiative':
      return (
        <FieldBlock title="Initiative">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Mode compact</span>
            <select value={String(asBoolean(config.compact, false))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'compact', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Afficher details</span>
            <select value={String(asBoolean(config.showDetails, true))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'showDetails', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
        </FieldBlock>
      );
    case 'session_journal':
      return (
        <FieldBlock title="Journal">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Limite</span>
            <input type="number" value={asNumber(config.limit, 10)} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'limit', Number(event.target.value) || 10))} disabled={!canEdit} />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Afficher filtres</span>
            <select value={String(asBoolean(config.showFilters, true))} onChange={(event) => onChange((current) => updateNestedRecord(current, 'config', 'showFilters', event.target.value === 'true'))} disabled={!canEdit}>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </select>
          </label>
        </FieldBlock>
      );
    default:
      return null;
  }
}

function updateTabGroupInDraft(
  draft: ScreenTemplate,
  setId: string,
  screenId: string,
  tabGroupId: string,
  updater: (group: ScreenTabGroupDefinition) => ScreenTabGroupDefinition
): ScreenTemplate {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    sets: draft.sets.map((set) =>
      set.id === setId
        ? {
            ...set,
            screens: set.screens.map((screen) =>
              screen.id === screenId
                ? {
                    ...screen,
                    tabGroups: screen.tabGroups.map((group) => (group.id === tabGroupId ? updater(group) : group))
                  }
                : screen
            )
          }
        : set
    )
  };
}

function updateWidgetInDraft(
  draft: ScreenTemplate,
  setId: string,
  screenId: string,
  tabGroupId: string,
  widgetId: string,
  updater: (widget: ScreenWidgetDefinition) => ScreenWidgetDefinition
): ScreenTemplate {
  return updateTabGroupInDraft(draft, setId, screenId, tabGroupId, (group) => ({
    ...group,
    widgets: group.widgets.map((widget) => (widget.id === widgetId ? updater(widget) : widget))
  }));
}
