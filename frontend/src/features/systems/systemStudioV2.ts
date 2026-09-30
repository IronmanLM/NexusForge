import {
  SystemStudioNodeDefinition,
  SystemStudioNodeType,
  SystemStudioSchemaV2,
  SystemStudioViewDefinitionV2
} from '../../types/system';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isEditableType(type: SystemStudioNodeType): boolean {
  return ['text', 'textarea', 'date', 'time', 'number', 'checkbox', 'select', 'multiselect'].includes(type);
}

function defaultFieldSplit(totalWidth: number): { label: number; input: number } {
  const total = Math.max(1, Math.round(totalWidth || 1));
  const label = Math.max(1, Math.min(total - 1, Math.round(total * 0.6)));
  return {
    label,
    input: Math.max(1, total - label)
  };
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || 'vue';
}

function stripTrailingNumber(input: string): string {
  return input.replace(/\d+$/, '');
}

function ensureUniqueKey(input: string, existing: Set<string>, fallback: string): string {
  const normalized = slugify(input) || fallback;
  if (!existing.has(normalized)) {
    return normalized;
  }
  const base = stripTrailingNumber(normalized) || normalized;
  let index = 1;
  let candidate = `${base}${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${base}${index}`;
  }
  return candidate;
}

type PaletteDefaults = {
  w: number;
  h: number;
  defaultValue?: string | number | boolean;
  options?: string[];
};

const NODE_DEFAULTS: Record<SystemStudioNodeType, PaletteDefaults> = {
  container: { w: 12, h: 6 },
  tabs: { w: 12, h: 6 },
  static_text: { w: 6, h: 2, defaultValue: 'Texte' },
  static_image: { w: 6, h: 4, defaultValue: '' },
  text: { w: 6, h: 2, defaultValue: '' },
  textarea: { w: 12, h: 4, defaultValue: '' },
  date: { w: 4, h: 2, defaultValue: '' },
  time: { w: 4, h: 2, defaultValue: '' },
  number: { w: 4, h: 2, defaultValue: 0 },
  checkbox: { w: 4, h: 2, defaultValue: false },
  image: { w: 6, h: 4, defaultValue: '' },
  select: { w: 6, h: 2, options: ['cle_a => Option A', 'cle_b => Option B'] },
  multiselect: { w: 6, h: 3, options: ['cle_a => Option A', 'cle_b => Option B'] },
  progress: { w: 6, h: 2, defaultValue: 0 },
  button: { w: 4, h: 2, defaultValue: 'Action' },
  subview: { w: 8, h: 4 }
};

function baseLabel(type: SystemStudioNodeType): string {
  switch (type) {
    case 'container':
      return 'Conteneur';
    case 'tabs':
      return 'Onglets';
    case 'static_text':
      return 'Texte';
    case 'static_image':
      return 'Photo';
    case 'text':
      return 'Texte editable';
    case 'textarea':
      return 'Texte long';
    case 'date':
      return 'Date';
    case 'time':
      return 'Heure';
    case 'number':
      return 'Numerique';
    case 'checkbox':
      return 'Case';
    case 'image':
      return 'Image';
    case 'select':
      return 'Liste';
    case 'multiselect':
      return 'Liste multiple';
    case 'progress':
      return 'Jauge';
    case 'button':
      return 'Bouton';
    case 'subview':
      return 'Vue liee';
    default:
      return 'Element';
  }
}

function nextY(nodes: SystemStudioNodeDefinition[], parentId: string | null, slotKey: string | null): number {
  return (
    nodes
      .filter((node) => (node.parentId ?? null) === parentId && (node.slotKey ?? null) === slotKey)
      .reduce((acc, node) => Math.max(acc, node.layout.y + node.layout.h), 0) + 1
  );
}

export function createEmptyStudioSchemaV2(): SystemStudioSchemaV2 {
  return {
    version: 2,
    views: [createStudioViewV2('Vue 1')]
  };
}

export function createStudioViewV2(name: string): SystemStudioViewDefinitionV2 {
  return {
    id: makeId('system_view_v2'),
    name,
    reference: slugify(name),
    description: '',
    gridColumns: 12,
    visibleInSelectors: true,
    isDefaultForPlayer: false,
    isCharacterSheet: false,
    characterSheetKind: 'pc',
    defaultSheetNameTemplate: '{{nompartie}} · {{nompj}}',
    initiativeMode: 'combat_once',
    initiativeFormula: '',
    theme: {},
    nodes: []
  };
}

export function createStudioNodeV2(params: {
  type: SystemStudioNodeType;
  siblings: SystemStudioNodeDefinition[];
  parentId?: string | null;
  slotKey?: string | null;
}): SystemStudioNodeDefinition {
  const { type, siblings, parentId = null, slotKey = null } = params;
  const defaults = NODE_DEFAULTS[type];
  const id = makeId('system_node');
  const label = baseLabel(type);
  const existingKeys = new Set(siblings.map((node) => node.key));
  const split = defaultFieldSplit(defaults.w);
  const node: SystemStudioNodeDefinition = {
    id,
    type,
    label,
    key: ensureUniqueKey(label, existingKeys, 'champ'),
    parentId,
    slotKey,
    layout: {
      x: 0,
      y: nextY(siblings, parentId, slotKey),
      w: defaults.w,
      h: defaults.h,
      minW: Math.min(defaults.w, 2),
      minH: 1
    },
    zIndex: siblings.filter((node) => (node.parentId ?? null) === parentId && (node.slotKey ?? null) === slotKey).length,
    defaultValue: defaults.defaultValue,
    options: defaults.options,
    showTitle: type === 'container' || type === 'tabs',
    showBorder: type === 'container',
    editableIf: isEditableType(type) ? '' : undefined,
    fieldLayout: isEditableType(type) ? 'colonne' : undefined,
    fieldLabelSpan: isEditableType(type) ? split.label : undefined,
    fieldInputSpan: isEditableType(type) ? split.input : undefined,
    fieldLabelStyleMode: isEditableType(type) ? 'commun' : undefined,
    defaultRowsVisible: type === 'textarea' ? 4 : null,
    backgroundOpacity: null,
    backgroundSize: 'couvrir',
    backgroundPosition: 'centre',
    backgroundRepeat: 'aucune',
    dateFormat: type === 'date' ? 'jour/mois/annee' : undefined,
    timeFormat: type === 'time' ? '24h' : undefined,
    gaugeShowLabel: type === 'progress',
    gaugeShowValues: type === 'progress',
    gaugeShowPercentage: false,
    gaugeOrientation: 'horizontale',
    checkboxLabel: type === 'checkbox' ? label : undefined
  };

  if (type === 'tabs') {
    node.tabs = [];
  }

  if (type === 'container') {
    node.repeat = {
      mode: 'none',
      source: '',
      manualItemsText: '',
      fieldItemsText: '',
      filter: '',
      flow: 'horizontal',
      itemWidth: 3,
      itemHeight: 2,
      gapX: 0.5,
      gapY: 0.5,
      showItemHeader: false,
      itemLabelTemplate: '{{item.label}}'
    };
  }

  return node;
}

export function cloneStudioSchemaV2(schema: SystemStudioSchemaV2): SystemStudioSchemaV2 {
  return {
    version: 2,
    views: schema.views.map((view) => ({
      ...view,
      theme: view.theme ? { ...view.theme } : undefined,
      nodes: view.nodes.map((node) => ({
        ...node,
        layout: { ...node.layout },
        tabs: node.tabs?.map((tab) => ({ ...tab })),
        repeat: node.repeat ? { ...node.repeat } : undefined,
        options: node.options ? [...node.options] : undefined
      }))
    }))
  };
}

export function canPublishSystemV2(schema: SystemStudioSchemaV2 | undefined): boolean {
  return Boolean(schema?.views?.some((view) => view.isCharacterSheet));
}
