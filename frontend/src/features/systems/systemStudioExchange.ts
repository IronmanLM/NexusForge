import { SystemStudioNodeDefinition, SystemStudioSchemaV2, SystemStudioViewDefinitionV2 } from '../../types/system';

export const SYSTEM_STUDIO_VIEW_EXCHANGE_FORMAT = 'nexusforge.system-studio-view';
export const SYSTEM_STUDIO_VIEW_EXCHANGE_VERSION = 1;
export const SYSTEM_STUDIO_DRAFT_FORMAT = 'nexusforge.system-draft';
export const SYSTEM_STUDIO_DRAFT_VERSION = 1;

export interface SystemStudioViewExchangeFile {
  format: typeof SYSTEM_STUDIO_VIEW_EXCHANGE_FORMAT;
  version: typeof SYSTEM_STUDIO_VIEW_EXCHANGE_VERSION;
  exportedAt: string;
  source?: {
    systemId?: string;
    systemName?: string;
  };
  view: SystemStudioViewDefinitionV2;
}

interface SystemStudioDraftFile {
  format: typeof SYSTEM_STUDIO_DRAFT_FORMAT;
  version: typeof SYSTEM_STUDIO_DRAFT_VERSION;
  suggestedSystem?: {
    studioSchemaV2?: SystemStudioSchemaV2;
  };
}

export interface SystemStudioImportCandidate {
  sourceLabel: string;
  views: SystemStudioViewDefinitionV2[];
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeIdentifier(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function stripTrailingNumber(input: string): string {
  return input.replace(/\d+$/, '');
}

function ensureUniqueIdentifier(input: string, existing: Set<string>, fallback: string): string {
  const normalized = normalizeIdentifier(input) || fallback;
  if (!existing.has(normalized)) {
    existing.add(normalized);
    return normalized;
  }
  const base = stripTrailingNumber(normalized) || fallback;
  let index = 1;
  let candidate = `${base}${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${base}${index}`;
  }
  existing.add(candidate);
  return candidate;
}

function cloneView(view: SystemStudioViewDefinitionV2): SystemStudioViewDefinitionV2 {
  return {
    ...view,
    nodes: view.nodes.map((node) => ({
      ...node,
      layout: { ...node.layout },
      tabs: node.tabs?.map((tab) => ({ ...tab })),
      repeat: node.repeat ? { ...node.repeat } : undefined,
      options: node.options ? [...node.options] : undefined
    }))
  };
}

export function exportSystemStudioView(params: {
  systemId?: string;
  systemName?: string;
  view: SystemStudioViewDefinitionV2;
}): SystemStudioViewExchangeFile {
  return {
    format: SYSTEM_STUDIO_VIEW_EXCHANGE_FORMAT,
    version: SYSTEM_STUDIO_VIEW_EXCHANGE_VERSION,
    exportedAt: new Date().toISOString(),
    source: params.systemId || params.systemName ? { systemId: params.systemId, systemName: params.systemName } : undefined,
    view: cloneView(params.view)
  };
}

export function parseSystemStudioImportCandidate(raw: string): SystemStudioImportCandidate {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const format = typeof parsed.format === 'string' ? parsed.format : '';
  const version = typeof parsed.version === 'number' ? parsed.version : null;

  if (format === SYSTEM_STUDIO_VIEW_EXCHANGE_FORMAT) {
    if (version !== SYSTEM_STUDIO_VIEW_EXCHANGE_VERSION) {
      throw new Error(`Version d’import non supportée: ${String(version)}.`);
    }
    if (!parsed.view || typeof parsed.view !== 'object') {
      throw new Error('Le fichier importé ne contient pas de vue.');
    }
    const exchange = parsed as unknown as SystemStudioViewExchangeFile;
    return {
      sourceLabel: exchange.source?.systemName || 'Import system-view',
      views: [exchange.view]
    };
  }

  if (format === SYSTEM_STUDIO_DRAFT_FORMAT) {
    if (version !== SYSTEM_STUDIO_DRAFT_VERSION) {
      throw new Error(`Version de brouillon non supportée: ${String(version)}.`);
    }
    const draft = parsed as unknown as SystemStudioDraftFile;
    const draftViews = draft.suggestedSystem?.studioSchemaV2?.views;
    const validViews = Array.isArray(draftViews) ? draftViews.filter((view) => view && typeof view === 'object') : [];
    if (validViews.length === 0) {
      throw new Error('Le brouillon importé ne contient aucune vue exploitable.');
    }
    return {
      sourceLabel: 'Import system-draft',
      views: validViews as SystemStudioViewDefinitionV2[]
    };
  }

  throw new Error('Format d’import invalide. Utilise un .system-view.json ou un .system-draft.json.');
}

export function prepareImportedSystemStudioView(params: {
  exchange: SystemStudioViewExchangeFile;
  targetSchema: SystemStudioSchemaV2;
}): SystemStudioViewDefinitionV2 {
  const sourceView = cloneView(params.exchange.view);
  const existingReferences = new Set(params.targetSchema.views.map((view) => normalizeIdentifier(view.reference)));
  const existingViewNames = new Set(params.targetSchema.views.map((view) => normalizeIdentifier(view.name)));
  const nextViewId = makeId('system_view_v2');
  const nextReference = ensureUniqueIdentifier(sourceView.reference || sourceView.name || 'vue', existingReferences, 'vue');
  const nextName = ensureUniqueIdentifier(sourceView.name || sourceView.reference || 'vue_importee', existingViewNames, 'vue_importee');
  const nodeIdMap = new Map<string, string>();
  const keySet = new Set<string>();

  sourceView.nodes.forEach((node) => {
    nodeIdMap.set(node.id, makeId('system_node'));
  });

  const nodes: SystemStudioNodeDefinition[] = sourceView.nodes.map((node) => ({
    ...node,
    id: nodeIdMap.get(node.id) ?? makeId('system_node'),
    parentId: node.parentId ? (nodeIdMap.get(node.parentId) ?? null) : null,
    key: ensureUniqueIdentifier(node.key || node.label || 'champ', keySet, 'champ'),
    label: String(node.label || node.key || 'Champ').trim() || 'Champ',
    layout: { ...node.layout },
    tabs: node.tabs?.map((tab) => ({ ...tab, id: makeId('tab') })),
    repeat: node.repeat ? { ...node.repeat } : undefined,
    options: node.options ? [...node.options] : undefined
  }));

  return {
    ...sourceView,
    id: nextViewId,
    name: nextName,
    reference: nextReference,
    nodes
  };
}
