import { ChangeEvent as ReactChangeEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import { useAuth } from '../../../hooks/useAuth';
import { canUserEditSystem, systemRepository } from '../../../data/repositories/systemRepository';
import {
  CharacterCreationConfigV2,
  CharacterInitiativeMode,
  CharacterSheetKind,
  GameSystem,
  SystemCatalogDefinition,
  StudioBackgroundPosition,
  StudioBackgroundRepeat,
  StudioBackgroundSize,
  StudioThemeDefinition,
  SystemStudioNodeDefinition,
  SystemStudioNodeType,
  SystemStudioRepeatMode,
  SystemStudioSchemaV2,
  SystemStudioViewDefinitionV2
} from '../../../types/system';
import SystemStudioV2Runtime, {
  evaluateCondition,
  evaluateMathExpression,
  SystemStudioV2Values
} from '../../../components/SystemStudioV2Runtime';
import {
  canPublishSystemV2,
  cloneStudioSchemaV2,
  createEmptyStudioSchemaV2,
  createStudioNodeV2,
  createStudioViewV2
} from '../systemStudioV2';
import {
  exportSystemStudioView,
  parseSystemStudioImportCandidate,
  prepareImportedSystemStudioView
} from '../systemStudioExchange';
import SystemCatalogManager from '../components/SystemCatalogManager';
import SystemDiscordConfigManager from '../components/SystemDiscordConfigManager';
import SystemCharacterCreationConfigManager from '../components/SystemCharacterCreationConfigManager';

type CanvasMode = 'edit' | 'preview';
type DragState =
  | {
      nodeIds: string[];
      primaryNodeId: string;
      mode: 'move' | 'resize';
      startX: number;
      startY: number;
      startLayouts: Record<string, SystemStudioNodeDefinition['layout']>;
    }
  | null;

type ScopeState = {
  parentId: string | null;
  slotKey: string | null;
};

type PendingImportState = {
  sourceLabel: string;
  views: SystemStudioViewDefinitionV2[];
  selectedViewIds: string[];
} | null;

type RepeatFieldAssistantItem = {
  key: string;
  label: string;
  type: SystemStudioNodeType;
  selected: boolean;
  alias: string;
  visible: boolean;
  editable: boolean;
  missing?: boolean;
  sourceToken?: string;
};

type RepeatFieldAssistantTypeFilter = 'all' | 'numeric' | 'checkbox' | 'textual' | 'select';
type RepeatFieldAssistantVisibilityFilter = 'all' | 'visible' | 'hidden';
type RepeatFieldAssistantEditabilityFilter = 'all' | 'editable' | 'readonly';

type RepeatFieldAssistantState = {
  containerNodeId: string;
  sourceViewId: string;
  search: string;
  typeFilter: RepeatFieldAssistantTypeFilter;
  visibilityFilter: RepeatFieldAssistantVisibilityFilter;
  editabilityFilter: RepeatFieldAssistantEditabilityFilter;
  items: RepeatFieldAssistantItem[];
} | null;

type FormulaComposerMode = 'math' | 'condition' | 'dice';

type FormulaComposerState = {
  title: string;
  mode: FormulaComposerMode;
  value: string;
  search: string;
  testValues: Record<string, string>;
  fieldLabel: string;
  helpText: string;
  selectionStart: number;
  selectionEnd: number;
  onApply: (value: string) => void;
} | null;

type SelectionTransferMode = 'copy' | 'move';

function commonStringValue(items: string[]): string {
  if (!items.length) {
    return '';
  }
  return items.every((value) => value === items[0]) ? items[0] : '';
}

function commonNumericValue(items: Array<number | null | undefined>): string {
  if (!items.length) {
    return '';
  }
  const first = items[0] ?? null;
  return items.every((value) => (value ?? null) === first) && first !== null ? String(first) : '';
}

function isEditableNode(node: SystemStudioNodeDefinition): boolean {
  return ['text', 'textarea', 'date', 'time', 'number', 'checkbox', 'select', 'multiselect'].includes(node.type);
}

function fieldSpanLabelsForNode(node: SystemStudioNodeDefinition | null): { label: string; input: string } {
  if (node?.type === 'checkbox') {
    return { label: 'Colonnes texte', input: 'Colonnes case' };
  }
  return { label: 'Colonnes texte', input: 'Colonnes champ' };
}

function fieldSpanLabelsForNodes(nodes: SystemStudioNodeDefinition[]): { label: string; input: string } {
  return nodes.length > 0 && nodes.every((node) => node.type === 'checkbox')
    ? { label: 'Colonnes texte', input: 'Colonnes case' }
    : { label: 'Colonnes texte', input: 'Colonnes champ' };
}

function normalizeFieldSplitForNode(node: SystemStudioNodeDefinition): Pick<SystemStudioNodeDefinition, 'fieldLayout' | 'fieldLabelSpan' | 'fieldInputSpan'> {
  const total = Math.max(1, Math.round(node.layout.w || 1));
  const layout = node.fieldLayout ?? 'colonne';
  if (layout === 'colonne' || layout === 'texte_cache') {
    return {
      fieldLayout: layout,
      fieldLabelSpan: layout === 'texte_cache' ? 0 : total,
      fieldInputSpan: total
    };
  }
  const requestedLabel = typeof node.fieldLabelSpan === 'number' && Number.isFinite(node.fieldLabelSpan) ? Math.round(node.fieldLabelSpan) : Math.max(1, Math.round(total * 0.6));
  const requestedInput = typeof node.fieldInputSpan === 'number' && Number.isFinite(node.fieldInputSpan) ? Math.round(node.fieldInputSpan) : Math.max(1, total - requestedLabel);
  let label = Math.max(1, requestedLabel);
  let input = Math.max(1, requestedInput);
  if (label + input > total) {
    if (label >= input) {
      label = Math.max(1, total - input);
    } else {
      input = Math.max(1, total - label);
    }
  }
  if (label + input > total) {
    label = Math.max(1, Math.min(label, total - 1));
    input = Math.max(1, total - label);
  }
  return {
    fieldLayout: layout,
    fieldLabelSpan: label,
    fieldInputSpan: input
  };
}

function supportsPlaceholder(node: SystemStudioNodeDefinition | null): boolean {
  return Boolean(node && (node.type === 'text' || node.type === 'textarea'));
}

function supportsReference(node: SystemStudioNodeDefinition | null): boolean {
  return Boolean(node && node.type === 'image');
}

function supportsFormulaField(node: SystemStudioNodeDefinition | null): boolean {
  return Boolean(node && ['static_text', 'text', 'textarea', 'number'].includes(node.type));
}

function supportsEditableCondition(node: SystemStudioNodeDefinition | null): boolean {
  return Boolean(node && isEditableNode(node));
}

function supportsValidation(node: SystemStudioNodeDefinition | null): boolean {
  return Boolean(node && isEditableNode(node) && node.type !== 'image');
}

function supportsFieldStyle(node: SystemStudioNodeDefinition | null): boolean {
  return Boolean(node && ['text', 'textarea', 'date', 'time', 'number', 'select', 'multiselect'].includes(node.type));
}

function supportsTypographySection(node: SystemStudioNodeDefinition | null): boolean {
  return Boolean(node && !['container', 'tabs', 'image', 'subview'].includes(node.type));
}

function buttonUsesIcon(node: SystemStudioNodeDefinition | null): boolean {
  if (!node || node.type !== 'button') {
    return false;
  }
  return ['icone', 'texte_icone', 'icone_texte'].includes(node.buttonContentMode ?? 'texte');
}

function normalizeIdentifier(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^-+|_+$/g, '');
}

function stripTrailingNumber(input: string): string {
  return input.replace(/\d+$/, '');
}

function ensureUniqueIdentifier(input: string, existing: Set<string>): string {
  const normalized = normalizeIdentifier(input);
  if (!normalized) {
    return '';
  }
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

function deriveUniqueKeyFromLabel(label: string, existing: Set<string>): string {
  return ensureUniqueIdentifier(label, existing) || 'champ';
}

function shouldSyncKeyWithLabel(currentKey: string, currentLabel: string, existing: Set<string>): boolean {
  const derived = deriveUniqueKeyFromLabel(currentLabel, existing);
  return !currentKey.trim() || currentKey === derived;
}

function syncViewRename(params: {
  schema: SystemStudioSchemaV2;
  viewId: string;
  nextName: string;
}): SystemStudioSchemaV2 {
  const { schema, viewId, nextName } = params;
  const targetView = schema.views.find((view) => view.id === viewId);
  if (!targetView) {
    return schema;
  }
  const trimmedName = nextName.trim();
  if (!trimmedName) {
    return schema;
  }
  const oldName = targetView.name;
  const oldReference = targetView.reference;
  const normalizedNextReference = normalizeIdentifier(trimmedName) || oldReference || 'vue';
  const referenceWasDerived = oldReference === normalizeIdentifier(oldName);

  return {
    ...schema,
    views: schema.views.map((view) => {
      if (view.id === viewId) {
        return {
          ...view,
          name: trimmedName,
          reference: referenceWasDerived ? normalizedNextReference : view.reference
        };
      }
      return {
        ...view,
        nodes: view.nodes.map((node) =>
          node.type === 'tabs'
            ? {
                ...node,
                tabs: (node.tabs ?? []).map((tab) =>
                  tab.viewId === viewId && tab.label === oldName
                    ? { ...tab, label: trimmedName }
                    : tab
                )
              }
            : node
        )
      };
    })
  };
}

const SYSTEM_STUDIO_AUTO_SAVE_DELAY_MS = 2000;

function buildStudioSystemDraft(system: GameSystem, schema: SystemStudioSchemaV2): GameSystem {
  return {
    ...system,
    studioSchemaV2: schema
  };
}

function normalizeCharacterCreationConfigV2(config?: GameSystem['characterCreationConfig']): CharacterCreationConfigV2 {
  if (!config) {
    return { version: 2, enabled: false, pools: [], variables: [], stages: [] };
  }
  if (config.version === 2) {
    return JSON.parse(JSON.stringify(config));
  }
  return {
    version: 2,
    enabled: config.enabled === true,
    pools: Array.isArray(config.pools) ? JSON.parse(JSON.stringify(config.pools)) : [],
    variables: Array.isArray(config.variables) ? JSON.parse(JSON.stringify(config.variables)) : [],
    stages: []
  };
}

function serializeStudioSystemDraft(system: GameSystem): string {
  const {
    auditTrail,
    updatedAt,
    createdAt,
    ...stableSystem
  } = system;
  return JSON.stringify(stableSystem);
}

function parseFieldItemsText(raw: string): Array<{ key: string; alias: string }> {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawKey, rawAlias] = line.split('=>').map((part) => part.trim());
      return {
        key: rawKey,
        alias: rawAlias || ''
      };
    });
}

function serializeFieldItemsText(items: RepeatFieldAssistantItem[]): string {
  return items
    .filter((item) => item.selected)
    .map((item) => {
      const key = (item.sourceToken || item.key).trim();
      const alias = item.alias.trim();
      return alias && alias !== item.label ? `${key} => ${alias}` : key;
    })
    .join('\n');
}

function normalizeRepeatFieldLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function resolveRepeatFieldEntry(
  sourceView: SystemStudioViewDefinitionV2,
  token: string
): { node: SystemStudioNodeDefinition | null; matchKind: 'exact' | 'normalized' | 'missing' } {
  const trimmed = token.trim();
  if (!trimmed) {
    return { node: null, matchKind: 'missing' };
  }
  const exactMatch =
    sourceView.nodes.find((node) => node.key === trimmed) ??
    sourceView.nodes.find((node) => node.label === trimmed) ??
    null;
  if (exactMatch) {
    return { node: exactMatch, matchKind: 'exact' };
  }
  const normalizedToken = normalizeRepeatFieldLookup(trimmed);
  if (!normalizedToken) {
    return { node: null, matchKind: 'missing' };
  }
  const normalizedMatch =
    sourceView.nodes.find((node) => normalizeRepeatFieldLookup(node.key) === normalizedToken) ??
    sourceView.nodes.find((node) => normalizeRepeatFieldLookup(node.label) === normalizedToken) ??
    null;
  if (normalizedMatch) {
    return { node: normalizedMatch, matchKind: 'normalized' };
  }
  return { node: null, matchKind: 'missing' };
}

type FormulaVariableCandidate = {
  token: string;
  viewId: string;
  viewName: string;
  viewReference: string;
  nodeLabel: string;
  nodeKey: string;
};

type FormulaOperatorDefinition = {
  label: string;
  token: string;
  description: string;
};

type FormulaOperatorGroup = {
  title: string;
  items: FormulaOperatorDefinition[];
};

type FormulaPresetDefinition = {
  label: string;
  token: string;
  description: string;
};

type FormulaRecentEntry = {
  mode: FormulaComposerMode;
  title: string;
  fieldLabel: string;
  value: string;
  updatedAt: string;
};

type FormulaCustomPreset = {
  mode: FormulaComposerMode;
  label: string;
  value: string;
  updatedAt: string;
};

const FORMULA_OPERATORS_BY_MODE: Record<FormulaComposerMode, FormulaOperatorGroup[]> = {
  math: [
    {
      title: 'Calcul',
      items: [
        { label: '+', token: ' + ', description: 'Addition' },
        { label: '-', token: ' - ', description: 'Soustraction' },
        { label: '*', token: ' * ', description: 'Multiplication' },
        { label: '/', token: ' / ', description: 'Division' },
        { label: '(', token: '(', description: 'Ouvrir une parenthèse' },
        { label: ')', token: ')', description: 'Fermer une parenthèse' }
      ]
    },
    {
      title: 'Helpers',
      items: [
        { label: 'ifEq', token: 'ifEq( , , , )', description: 'Retourne une valeur si deux termes sont égaux' },
        { label: 'ifGte', token: 'ifGte( , , , )', description: 'Retourne une valeur si le premier terme est supérieur ou égal au seuil' },
        { label: 'ifLte', token: 'ifLte( , , , )', description: 'Retourne une valeur si le premier terme est inférieur ou égal au seuil' },
        { label: 'min', token: 'min( , )', description: 'Prend la plus petite valeur' },
        { label: 'max', token: 'max( , )', description: 'Prend la plus grande valeur' },
        { label: 'clamp', token: 'clamp( , , )', description: 'Force une valeur dans une plage min / max' },
        { label: 'round', token: 'round( )', description: 'Arrondi à l entier le plus proche' },
        { label: 'floor', token: 'floor( )', description: 'Arrondi à l entier inférieur' },
        { label: 'ceil', token: 'ceil( )', description: 'Arrondi à l entier supérieur' }
      ]
    }
  ],
  condition: [
    {
      title: 'Comparaison',
      items: [
        { label: '==', token: ' == ', description: 'Égal à' },
        { label: '!=', token: ' != ', description: 'Différent de' },
        { label: '>=', token: ' >= ', description: 'Supérieur ou égal' },
        { label: '<=', token: ' <= ', description: 'Inférieur ou égal' },
        { label: '>', token: ' > ', description: 'Strictement supérieur' },
        { label: '<', token: ' < ', description: 'Strictement inférieur' }
      ]
    },
    {
      title: 'Logique',
      items: [
        { label: '&&', token: ' && ', description: 'Et logique' },
        { label: '||', token: ' || ', description: 'Ou logique' },
        { label: '!', token: '!', description: 'Non logique' },
        { label: '(', token: '(', description: 'Ouvrir une parenthèse' },
        { label: ')', token: ')', description: 'Fermer une parenthèse' }
      ]
    }
  ],
  dice: [
    {
      title: 'Jets',
      items: [
        { label: '1d20', token: '1d20', description: 'Ajoute un dé vingt' },
        { label: '1d100', token: '1d100', description: 'Ajoute un jet percentile' },
        { label: '2d6', token: '2d6', description: 'Ajoute deux dés à six faces' },
        { label: '1d10', token: '1d10', description: 'Ajoute un dé à dix faces' }
      ]
    },
    {
      title: 'Modificateurs',
      items: [
        { label: '+', token: ' + ', description: 'Ajoute un modificateur ou une variable' },
        { label: '-', token: ' - ', description: 'Retire un modificateur ou une variable' },
        { label: '(', token: '(', description: 'Ouvrir une parenthèse' },
        { label: ')', token: ')', description: 'Fermer une parenthèse' }
      ]
    }
  ]
};

const FORMULA_PRESETS_BY_MODE: Record<FormulaComposerMode, FormulaPresetDefinition[]> = {
  math: [
    { label: 'Moyenne arrondie', token: 'round((@a + @b) / 2)', description: 'Exemple de moyenne de deux valeurs' },
    { label: 'Seuil bonus', token: 'ifGte(@valeur, 10, 5, 0)', description: 'Ajoute un bonus si un seuil est atteint' },
    { label: 'Bornage', token: 'clamp(@valeur, 0, 100)', description: 'Force une valeur dans une plage' }
  ],
  condition: [
    { label: 'Valeur positive', token: '@valeur > 0', description: 'Teste si une valeur est positive' },
    { label: 'Case cochée', token: '@item.checked == true', description: 'Teste une case cochée dans une répétition' },
    { label: 'Équipé', token: '@item.equipe == true', description: 'Teste un item équipé' }
  ],
  dice: [
    { label: 'Jet simple', token: '1d20 + @modificateur', description: 'Jet avec un modificateur' },
    { label: 'Pourcentage', token: '1d100 + @competence', description: 'Jet percentile avec compétence' },
    { label: 'Dégâts', token: '2d6 + @force', description: 'Jet de dégâts simple' }
  ]
};

const FORMULA_BUSINESS_EXAMPLES_BY_MODE: Record<FormulaComposerMode, FormulaPresetDefinition[]> = {
  math: [
    { label: 'Points de vie max', token: '@endurance * 5 + @constitution', description: 'Exemple de calcul de ressource maximale.' },
    { label: 'Seuil blessure', token: 'round(@points_de_vie_max / 2)', description: 'Exemple de seuil intermédiaire.' },
    { label: 'Armure finale', token: 'max(0, @armure_base + @bonus_armure - @malus_armure)', description: 'Exemple de cumul avec protection minimale.' }
  ],
  condition: [
    { label: 'Visible si blessé', token: '@points_de_vie < @points_de_vie_max', description: 'Affiche le bloc quand le personnage a perdu des points de vie.' },
    { label: 'Actif si ressource', token: '@mana > 0 && @silence != true', description: 'Active une action si la ressource est disponible.' },
    { label: 'Équipement valide', token: '@item.equipe == true && @item.quantite > 0', description: 'Exemple de filtre sur inventaire équipé.' }
  ],
  dice: [
    { label: 'Test de compétence', token: '1d20 + @competence + @attribut', description: 'Jet de base avec attribut et compétence.' },
    { label: 'Dégâts arme', token: '1d10 + @force + @degats_bonus', description: 'Exemple de dégâts avec bonus.' },
    { label: 'Jet opposé', token: '1d100 + @maitrise - @fatigue', description: 'Exemple percentile avec malus.' }
  ]
};

const FORMULA_RECENTS_STORAGE_KEY = 'nexusforge.systemStudioV2.formulaRecents';
const FORMULA_RECENTS_LIMIT = 12;
const FORMULA_FAVORITES_STORAGE_KEY = 'nexusforge.systemStudioV2.formulaFavorites';
const FORMULA_CUSTOM_PRESETS_STORAGE_KEY = 'nexusforge.systemStudioV2.customFormulaPresets';
const FORMULA_CUSTOM_PRESETS_LIMIT = 16;

function loadFormulaRecents(): FormulaRecentEntry[] {
  try {
    const raw = localStorage.getItem(FORMULA_RECENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is FormulaRecentEntry => {
        return Boolean(
          entry &&
            typeof entry === 'object' &&
            typeof entry.mode === 'string' &&
            typeof entry.title === 'string' &&
            typeof entry.fieldLabel === 'string' &&
            typeof entry.value === 'string' &&
            typeof entry.updatedAt === 'string'
        );
      })
      .slice(0, FORMULA_RECENTS_LIMIT);
  } catch {
    return [];
  }
}

function saveFormulaRecents(entries: FormulaRecentEntry[]) {
  try {
    localStorage.setItem(FORMULA_RECENTS_STORAGE_KEY, JSON.stringify(entries.slice(0, FORMULA_RECENTS_LIMIT)));
  } catch {
    // ignore storage failure
  }
}

function loadFormulaFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FORMULA_FAVORITES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveFormulaFavorites(entries: string[]) {
  try {
    localStorage.setItem(FORMULA_FAVORITES_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage failure
  }
}

function loadCustomFormulaPresets(): FormulaCustomPreset[] {
  try {
    const raw = localStorage.getItem(FORMULA_CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is FormulaCustomPreset => {
        return Boolean(
          entry &&
            typeof entry === 'object' &&
            typeof entry.mode === 'string' &&
            typeof entry.label === 'string' &&
            typeof entry.value === 'string' &&
            typeof entry.updatedAt === 'string'
        );
      })
      .slice(0, FORMULA_CUSTOM_PRESETS_LIMIT);
  } catch {
    return [];
  }
}

function saveCustomFormulaPresets(entries: FormulaCustomPreset[]) {
  try {
    localStorage.setItem(FORMULA_CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(entries.slice(0, FORMULA_CUSTOM_PRESETS_LIMIT)));
  } catch {
    // ignore storage failure
  }
}

function insertFormulaTokenAtSelection(current: string, token: string, selectionStart: number, selectionEnd: number) {
  const safeStart = Math.max(0, Math.min(selectionStart, current.length));
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, current.length));
  const nextValue = `${current.slice(0, safeStart)}${token}${current.slice(safeEnd)}`;
  const nextPosition = safeStart + token.length;
  return {
    value: nextValue,
    selectionStart: nextPosition,
    selectionEnd: nextPosition
  };
}

function extractFormulaTokens(input: string): string[] {
  return Array.from(input.matchAll(/@([A-Za-z0-9_.\[\]]+)/g)).map((match) => match[1]);
}

function coerceFormulaTestValue(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return 0;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return trimmed;
}

function resolveRepeatSourceViewId(
  schema: SystemStudioSchemaV2,
  selectedView: SystemStudioViewDefinitionV2 | null,
  sourceToken: string | undefined
): string {
  const trimmed = String(sourceToken ?? '').trim().replace(/^@/, '');
  if (!trimmed) {
    return selectedView?.id ?? '';
  }
  const match = schema.views.find((view) => view.reference === trimmed || view.id === trimmed || view.name === trimmed) ?? null;
  return match?.id ?? selectedView?.id ?? '';
}

function isRepeatAssistantEligibleNode(node: SystemStudioNodeDefinition): boolean {
  return ['text', 'number', 'checkbox', 'select', 'multiselect', 'date', 'time'].includes(node.type);
}

function normalizeSchemaIdentifiers(schema: SystemStudioSchemaV2): SystemStudioSchemaV2 {
  return {
    ...schema,
    views: schema.views.map((view) => {
      const keySet = new Set<string>();
      const normalizedNodes = view.nodes.map((node) => {
        const nextLabel = String(node.label ?? '').trim() || node.key || 'Champ';
        const keyBase = node.key || nextLabel || 'champ';
        const nextKey = ensureUniqueIdentifier(keyBase, keySet) || deriveUniqueKeyFromLabel(nextLabel, keySet);
        keySet.add(nextKey);
        return {
          ...node,
          label: nextLabel,
          key: nextKey
        };
      });
      return {
        ...view,
        nodes: normalizedNodes
      };
    })
  };
}
type DetachedPanelKey = 'left' | 'right' | 'formula' | 'discord_config' | 'character_creation';

const ROW_HEIGHT = 28;
const GRID_STEP = 0.5;
const SYSTEM_STUDIO_DETACHED_PANELS_KEY = 'nexusforge.systemStudioV2.detachedPanels';
const THEME_BACKGROUND_SIZES: Array<{ value: StudioBackgroundSize; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'contenir', label: 'Contenir' },
  { value: 'couvrir', label: 'Couvrir' },
  { value: 'etirer', label: 'Etirer' }
];
const THEME_BACKGROUND_POSITIONS: Array<{ value: StudioBackgroundPosition; label: string }> = [
  { value: 'centre', label: 'Centre' },
  { value: 'haut', label: 'Haut' },
  { value: 'bas', label: 'Bas' },
  { value: 'gauche', label: 'Gauche' },
  { value: 'droite', label: 'Droite' },
  { value: 'haut_gauche', label: 'Haut gauche' },
  { value: 'haut_droite', label: 'Haut droite' },
  { value: 'bas_gauche', label: 'Bas gauche' },
  { value: 'bas_droite', label: 'Bas droite' }
];
const THEME_BACKGROUND_REPEATS: Array<{ value: StudioBackgroundRepeat; label: string }> = [
  { value: 'aucune', label: 'Aucune' },
  { value: 'repeter', label: 'Répéter' },
  { value: 'repeter_x', label: 'Répéter X' },
  { value: 'repeter_y', label: 'Répéter Y' }
];
const PALETTE_GROUPS: Array<{
  id: string;
  title: string;
  items: Array<{ type: SystemStudioNodeType; title: string; description: string }>;
}> = [
  {
    id: 'structure',
    title: 'Structure',
    items: [
      { type: 'container', title: 'Conteneur', description: 'Bloc structurel principal et répétable.' },
      { type: 'tabs', title: 'Onglets', description: 'Segmente une vue complexe en panneaux.' }
    ]
  },
  {
    id: 'editable',
    title: 'Champs éditables',
    items: [
      { type: 'text', title: 'Texte éditable', description: 'Champ texte sur une ligne.' },
      { type: 'textarea', title: 'Texte long', description: 'Champ multi-ligne.' },
      { type: 'date', title: 'Date', description: 'Champ date éditable.' },
      { type: 'time', title: 'Heure', description: 'Champ heure éditable.' },
      { type: 'number', title: 'Numérique', description: 'Valeur numérique editable.' },
      { type: 'checkbox', title: 'Case à cocher', description: 'Champ booléen.' },
      { type: 'image', title: 'Image éditable', description: 'Portrait ou illustration remplissable.' },
      { type: 'select', title: 'Liste déroulante', description: 'Choix simple.' },
      { type: 'multiselect', title: 'Menu multichoix', description: 'Choix multiples.' }
    ]
  },
  {
    id: 'display',
    title: 'Affichage',
    items: [
      { type: 'static_text', title: 'Texte', description: 'Texte statique et variables réservées.' },
      { type: 'progress', title: 'Jauge', description: 'Barre de ressource.' },
      { type: 'button', title: 'Bouton', description: 'Action visuelle.' },
      { type: 'subview', title: 'Vue liée', description: 'Référence vers une autre vue.' }
    ]
  }
];

function clampLayout(layout: SystemStudioNodeDefinition['layout'], columns: number): SystemStudioNodeDefinition['layout'] {
  const roundStep = (value: number) => Math.round(value / GRID_STEP) * GRID_STEP;
  const minW = Math.max(1, layout.minW ?? 1);
  const minH = Math.max(1, layout.minH ?? 1);
  const w = roundStep(Math.max(minW, Math.min(columns, layout.w)));
  const h = roundStep(Math.max(minH, layout.h));
  const x = roundStep(Math.max(0, Math.min(columns - w, layout.x)));
  const y = roundStep(Math.max(0, layout.y));
  return { ...layout, x, y, w, h };
}

function childNodes(view: SystemStudioViewDefinitionV2 | null, scope: ScopeState) {
  return (view?.nodes ?? [])
    .filter((node) => (node.parentId ?? null) === scope.parentId && (node.slotKey ?? null) === scope.slotKey)
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.layout.y - b.layout.y || a.layout.x - b.layout.x);
}

function scopeKeyForNode(node: SystemStudioNodeDefinition): string {
  return `${node.parentId ?? 'root'}::${node.slotKey ?? 'root'}`;
}

function normalizeDepthOrdering(nodes: SystemStudioNodeDefinition[]): SystemStudioNodeDefinition[] {
  const nextById = new Map(nodes.map((node) => [node.id, { ...node }]));
  const scopeGroups = new Map<string, SystemStudioNodeDefinition[]>();
  for (const node of nodes) {
    const key = scopeKeyForNode(node);
    const group = scopeGroups.get(key) ?? [];
    group.push(node);
    scopeGroups.set(key, group);
  }
  for (const group of scopeGroups.values()) {
    group
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.layout.y - b.layout.y || a.layout.x - b.layout.x)
      .forEach((node, index) => {
        const current = nextById.get(node.id);
        if (current) {
          current.zIndex = index;
        }
      });
  }
  return nodes.map((node) => nextById.get(node.id) ?? node);
}

type DepthReorderMode = 'bring_front' | 'send_back' | 'step_forward' | 'step_backward';

function reorderDepthForSelection(
  nodes: SystemStudioNodeDefinition[],
  selectedIds: string[],
  mode: DepthReorderMode
): SystemStudioNodeDefinition[] {
  if (!selectedIds.length) {
    return nodes;
  }
  const selectedSet = new Set(selectedIds);
  const nextById = new Map(nodes.map((node) => [node.id, { ...node }]));
  const scopeGroups = new Map<string, SystemStudioNodeDefinition[]>();
  for (const node of nodes) {
    const key = scopeKeyForNode(node);
    const group = scopeGroups.get(key) ?? [];
    group.push(node);
    scopeGroups.set(key, group);
  }

  for (const group of scopeGroups.values()) {
    const ordered = group
      .slice()
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.layout.y - b.layout.y || a.layout.x - b.layout.x);
    if (!ordered.some((node) => selectedSet.has(node.id))) {
      continue;
    }
    let reordered = [...ordered];
    if (mode === 'bring_front') {
      reordered = [...ordered.filter((node) => !selectedSet.has(node.id)), ...ordered.filter((node) => selectedSet.has(node.id))];
    } else if (mode === 'send_back') {
      reordered = [...ordered.filter((node) => selectedSet.has(node.id)), ...ordered.filter((node) => !selectedSet.has(node.id))];
    } else if (mode === 'step_forward') {
      for (let index = reordered.length - 2; index >= 0; index -= 1) {
        if (selectedSet.has(reordered[index].id) && !selectedSet.has(reordered[index + 1].id)) {
          [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
        }
      }
    } else {
      for (let index = 1; index < reordered.length; index += 1) {
        if (selectedSet.has(reordered[index].id) && !selectedSet.has(reordered[index - 1].id)) {
          [reordered[index], reordered[index - 1]] = [reordered[index - 1], reordered[index]];
        }
      }
    }
    reordered.forEach((node, index) => {
      const current = nextById.get(node.id);
      if (current) {
        current.zIndex = index;
      }
    });
  }

  return nodes.map((node) => nextById.get(node.id) ?? node);
}

function removeNodeTree(nodes: SystemStudioNodeDefinition[], nodeId: string): SystemStudioNodeDefinition[] {
  const toRemove = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && toRemove.has(node.parentId) && !toRemove.has(node.id)) {
        toRemove.add(node.id);
        changed = true;
      }
    }
  }
  return nodes.filter((node) => !toRemove.has(node.id));
}

function collectSubtreeIds(nodes: SystemStudioNodeDefinition[], rootIds: string[]): Set<string> {
  const collected = new Set<string>(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && collected.has(node.parentId) && !collected.has(node.id)) {
        collected.add(node.id);
        changed = true;
      }
    }
  }
  return collected;
}

function selectedRootIds(nodes: SystemStudioNodeDefinition[], ids: string[]): string[] {
  const selected = new Set(ids);
  return ids.filter((id) => {
    const node = nodes.find((item) => item.id === id);
    return node ? !node.parentId || !selected.has(node.parentId) : false;
  });
}

function nextYForScope(nodes: SystemStudioNodeDefinition[], parentId: string | null, slotKey: string | null): number {
  return (
    nodes
      .filter((node) => (node.parentId ?? null) === parentId && (node.slotKey ?? null) === slotKey)
      .reduce((acc, node) => Math.max(acc, node.layout.y + node.layout.h), 0) + 1
  );
}

function cloneNodeForTransfer(node: SystemStudioNodeDefinition): SystemStudioNodeDefinition {
  return {
    ...node,
    layout: { ...node.layout },
    tabs: node.tabs?.map((tab) => ({ ...tab })),
    repeat: node.repeat ? { ...node.repeat } : undefined,
    options: node.options ? [...node.options] : undefined
  };
}

function makeScopeLabel(view: SystemStudioViewDefinitionV2 | null, scope: ScopeState): string {
  if (!view || !scope.parentId) {
    return 'Racine';
  }
  const parent = view.nodes.find((node) => node.id === scope.parentId);
  if (!parent) {
    return 'Racine';
  }
  return parent.label;
}

function PropertySection({
  title,
  children,
  defaultOpen = false,
  sectionKey
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  sectionKey?: string;
}) {
  const storageKey = sectionKey ? `nexusforge.systemStudioV2.sectionOpen.${sectionKey}` : null;
  const [isOpen, setIsOpen] = useState(() => {
    if (!storageKey) {
      return defaultOpen;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'true') {
        return true;
      }
      if (saved === 'false') {
        return false;
      }
    } catch {
      // ignore localStorage failures
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (!storageKey) {
      setIsOpen(defaultOpen);
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'true') {
        setIsOpen(true);
        return;
      }
      if (saved === 'false') {
        setIsOpen(false);
        return;
      }
    } catch {
      // ignore localStorage failures
    }
    setIsOpen(defaultOpen);
  }, [defaultOpen, storageKey]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }
    try {
      localStorage.setItem(storageKey, String(isOpen));
    } catch {
      // ignore localStorage failures
    }
  }, [isOpen, storageKey]);

  return (
    <section className="screen-studio-fields-block">
      <button
        type="button"
        className="screen-studio-fields-block__toggle"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{title}</span>
        <span>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen ? <div className="screen-studio-fields-block__content">{children}</div> : null}
    </section>
  );
}

function DetachedStudioPanelPortal({
  panelKey,
  title,
  children,
  existingWindow,
  initialWidth,
  initialHeight,
  onClose,
  onBlocked
}: {
  panelKey: DetachedPanelKey;
  title: string;
  children: ReactNode;
  existingWindow?: Window | null;
  initialWidth?: number;
  initialHeight?: number;
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
    const sizeStorageKey = `nexusforge.systemStudioV2.panelSize.${panelKey}`;
    let width = initialWidth ?? 460;
    let height = initialHeight ?? 980;
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

    const popup = existingWindow ?? window.open('', `nexusforge-system-studio-v2-${panelKey}`, `popup=yes,width=${width},height=${height}`);
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
  }, [existingWindow, initialHeight, initialWidth, panelKey, title]);

  return container ? createPortal(children, container) : null;
}

function resolveDiceFormulaPreview(formula: string, values: SystemStudioV2Values): string {
  return formula.replace(/@([A-Za-z0-9_.\[\]]+)/g, (_, token: string) => {
    const value = values[token];
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'string') {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? String(numeric) : '0';
    }
    return '0';
  });
}

function evaluateDiceFormulaPreview(formula: string): { resolved: string; total: number | null; breakdown: string } {
  const diceMatch = formula.match(/(\d*)d(\d+)/i);
  if (!diceMatch) {
    return {
      resolved: formula,
      total: null,
      breakdown: 'Aucun dé détecté dans la formule.'
    };
  }
  const diceCount = Math.max(1, Number(diceMatch[1] || 1));
  const diceSides = Math.max(2, Number(diceMatch[2] || 20));
  const rolls = Array.from({ length: diceCount }, () => Math.floor(Math.random() * diceSides) + 1);
  const diceSum = rolls.reduce((sum, value) => sum + value, 0);
  const modifiers = Array.from(formula.matchAll(/([+-]\s*\d+)/g)).map((match) => Number(match[1].replace(/\s+/g, '')));
  const modifierSum = modifiers.reduce((sum, value) => sum + value, 0);
  return {
    resolved: formula,
    total: diceSum + modifierSum,
    breakdown: `${rolls.join(' + ')}${modifierSum !== 0 ? ` ${modifierSum > 0 ? '+' : '-'} ${Math.abs(modifierSum)}` : ''}`
  };
}

function FormulaComposer({
  state,
  onClose,
  onApply,
  onSearchChange,
  onFormulaChange,
  onSelectionChange,
  onInsert,
  onTestValueChange,
  onUseRecent,
  onToggleFavorite,
  onSaveCustomPreset,
  onRenameCustomPreset,
  onDeleteCustomPreset,
  onExportCustomPresets,
  onImportCustomPresets,
  variables,
  favoriteTokens,
  customPresets,
  recentEntries,
  selectedView,
  allViews
}: {
  state: NonNullable<FormulaComposerState>;
  onClose: () => void;
  onApply: () => void;
  onSearchChange: (value: string) => void;
  onFormulaChange: (value: string) => void;
  onSelectionChange: (start: number, end: number) => void;
  onInsert: (token: string) => void;
  onTestValueChange: (token: string, value: string) => void;
  onUseRecent: (value: string) => void;
  onToggleFavorite: (token: string) => void;
  onSaveCustomPreset: (label: string, value: string) => void;
  onRenameCustomPreset: (previousLabel: string, nextLabel: string, value: string) => void;
  onDeleteCustomPreset: (label: string, value: string) => void;
  onExportCustomPresets: () => void;
  onImportCustomPresets: (file: File | null) => void;
  variables: FormulaVariableCandidate[];
  favoriteTokens: string[];
  customPresets: FormulaCustomPreset[];
  recentEntries: FormulaRecentEntry[];
  selectedView: SystemStudioViewDefinitionV2 | null;
  allViews: SystemStudioViewDefinitionV2[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const importPresetInputRef = useRef<HTMLInputElement | null>(null);
  const [customPresetLabel, setCustomPresetLabel] = useState('');
  const [editingPresetKey, setEditingPresetKey] = useState<string | null>(null);
  const [editingPresetLabel, setEditingPresetLabel] = useState('');
  const variableTokens = useMemo(() => extractFormulaTokens(state.value), [state.value]);
  const visibleVariables = useMemo(() => {
    const search = state.search.trim().toLowerCase();
    return variables.filter((item) => {
      if (!search) {
        return true;
      }
      return [item.token, item.viewName, item.viewReference, item.nodeLabel, item.nodeKey]
        .join(' ')
        .toLowerCase()
        .includes(search);
    }).sort((a, b) => {
      const aFavorite = favoriteTokens.includes(a.token);
      const bFavorite = favoriteTokens.includes(b.token);
      if (aFavorite !== bFavorite) {
        return aFavorite ? -1 : 1;
      }
      return a.viewName.localeCompare(b.viewName) || a.nodeLabel.localeCompare(b.nodeLabel);
    });
  }, [favoriteTokens, state.search, variables]);

  const testRuntimeValues = useMemo<SystemStudioV2Values>(() => {
    return variableTokens.reduce<SystemStudioV2Values>((accumulator, token) => {
      accumulator[token] = coerceFormulaTestValue(state.testValues[token] ?? '');
      return accumulator;
    }, {});
  }, [state.testValues, variableTokens]);

  const evaluation = useMemo(() => {
    if (!selectedView) {
      return { label: 'Aucune vue sélectionnée', value: null as string | number | boolean | null };
    }
    if (!state.value.trim()) {
      return { label: 'Aucune formule', value: null as string | number | boolean | null };
    }
    if (state.mode === 'math') {
      return {
        label: 'Résultat',
        value: evaluateMathExpression(state.value, testRuntimeValues, selectedView, allViews)
      };
    }
    if (state.mode === 'condition') {
      return {
        label: 'Résultat',
        value: evaluateCondition(state.value, testRuntimeValues, selectedView, allViews)
      };
    }
    const resolved = resolveDiceFormulaPreview(state.value, testRuntimeValues);
    const dicePreview = evaluateDiceFormulaPreview(resolved);
    return {
      label: 'Test jet',
      value:
        dicePreview.total === null
          ? `${dicePreview.resolved} · ${dicePreview.breakdown}`
          : `${dicePreview.resolved} = ${dicePreview.total} (${dicePreview.breakdown})`
    };
  }, [allViews, selectedView, state.mode, state.value, testRuntimeValues]);

  const modeLabel =
    state.mode === 'math' ? 'Formule numérique' : state.mode === 'condition' ? 'Condition booléenne' : 'Formule de jet';

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(state.selectionStart, state.selectionEnd);
  }, [state.selectionEnd, state.selectionStart, state.value]);

  return (
    <div className="card" style={{ margin: 0, display: 'grid', gap: '0.85rem', minHeight: '100vh', boxSizing: 'border-box', alignContent: 'start' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>{state.title}</h2>
          <p style={{ margin: 0, opacity: 0.82 }}>{modeLabel} pour {state.fieldLabel.toLowerCase()}.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button type="button" onClick={onApply}>
            Appliquer
          </Button>
        </div>
      </div>

      <div className="card" style={{ margin: 0, padding: '0.85rem', display: 'grid', gap: '0.35rem' }}>
        <strong>{state.fieldLabel}</strong>
        <span style={{ opacity: 0.86 }}>{state.helpText}</span>
      </div>

      <div className="grid" style={{ alignItems: 'start' }}>
        <section className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Variables</h3>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Recherche</span>
            <input value={state.search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Vue, variable, clé..." />
          </label>
          <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.75rem', maxHeight: '18rem', overflowY: 'auto' }}>
            {visibleVariables.map((item) => (
              <div
                key={`${item.viewId}-${item.token}`}
                style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.45rem', alignItems: 'stretch' }}
              >
                <button
                  type="button"
                  className="button secondary"
                  style={{ paddingInline: '0.65rem' }}
                  onClick={() => onToggleFavorite(item.token)}
                  title={favoriteTokens.includes(item.token) ? 'Retirer des favorites' : 'Ajouter aux favorites'}
                >
                  {favoriteTokens.includes(item.token) ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => onInsert(`@${item.token}`)}
                  title={`Ajouter @${item.token}`}
                >
                  <span>
                    <strong>{item.nodeLabel}</strong> · {item.viewName}
                    {item.viewReference ? ` (${item.viewReference})` : ''}
                    <br />
                    <code>@{item.token}</code>
                  </span>
                </button>
              </div>
            ))}
            {visibleVariables.length === 0 ? <p style={{ margin: 0, opacity: 0.8 }}>Aucune variable ne correspond à la recherche.</p> : null}
          </div>
        </section>

        <section className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Formule en cours</h3>
          <textarea
            ref={textareaRef}
            rows={5}
            value={state.value}
            onChange={(event) => onFormulaChange(event.target.value)}
            onSelect={(event) => onSelectionChange(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)}
            onClick={(event) => onSelectionChange(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)}
            onKeyUp={(event) => onSelectionChange(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)}
            placeholder={state.mode === 'dice' ? 'Ex : 1d100 + @competence' : 'Compose la formule ici'}
          />
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
            {FORMULA_OPERATORS_BY_MODE[state.mode].map((group) => (
              <div key={`${state.mode}-${group.title}`} style={{ display: 'grid', gap: '0.35rem' }}>
                <strong>{group.title}</strong>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {group.items.map((operator) => (
                    <button
                      key={`${state.mode}-${group.title}-${operator.label}`}
                      type="button"
                      className="button secondary"
                      title={operator.description}
                      onClick={() => onInsert(operator.token)}
                    >
                      {operator.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <strong>Presets</strong>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {FORMULA_PRESETS_BY_MODE[state.mode].map((preset) => (
                  <button
                    key={`${state.mode}-${preset.label}`}
                    type="button"
                    className="button secondary"
                    title={preset.description}
                    onClick={() => onFormulaChange(preset.token)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            {recentEntries.length ? (
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <strong>Dernières formules</strong>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {recentEntries.map((entry, index) => (
                    <button
                      key={`${entry.mode}-${entry.updatedAt}-${index}`}
                      type="button"
                      className="button secondary"
                      title={`${entry.fieldLabel} · ${entry.value}`}
                      onClick={() => onUseRecent(entry.value)}
                    >
                      {entry.fieldLabel}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <strong>Exemples métier</strong>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {FORMULA_BUSINESS_EXAMPLES_BY_MODE[state.mode].map((preset) => (
                  <button
                    key={`${state.mode}-business-${preset.label}`}
                    type="button"
                    className="button secondary"
                    title={preset.description}
                    onClick={() => onFormulaChange(preset.token)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <strong>Presets personnalisés</strong>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <Button type="button" variant="secondary" onClick={onExportCustomPresets} disabled={!customPresets.length}>
                  Exporter
                </Button>
                <Button type="button" variant="secondary" onClick={() => importPresetInputRef.current?.click()}>
                  Importer
                </Button>
                <input
                  ref={importPresetInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    onImportCustomPresets(event.target.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.45rem' }}>
                <input value={customPresetLabel} onChange={(event) => setCustomPresetLabel(event.target.value)} placeholder="Nom du preset" />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    onSaveCustomPreset(customPresetLabel, state.value);
                    setCustomPresetLabel('');
                  }}
                  disabled={!customPresetLabel.trim() || !state.value.trim()}
                >
                  Sauver
                </Button>
              </div>
              {customPresets.length ? (
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  {customPresets.map((preset, index) => (
                    <div key={`${preset.mode}-${preset.label}-${index}`} style={{ display: 'grid', gap: '0.35rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.45rem' }}>
                        <button
                          type="button"
                          className="button secondary"
                          style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                          title={preset.value}
                          onClick={() => onFormulaChange(preset.value)}
                        >
                          {preset.label}
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            setEditingPresetKey(`${preset.mode}-${preset.label}-${index}`);
                            setEditingPresetLabel(preset.label);
                          }}
                          title="Renommer ce preset"
                        >
                          Renommer
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => onDeleteCustomPreset(preset.label, preset.value)}
                          title="Supprimer ce preset"
                        >
                          ×
                        </button>
                      </div>
                      {editingPresetKey === `${preset.mode}-${preset.label}-${index}` ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: '0.45rem' }}>
                          <input value={editingPresetLabel} onChange={(event) => setEditingPresetLabel(event.target.value)} />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              onRenameCustomPreset(preset.label, editingPresetLabel, preset.value);
                              setEditingPresetKey(null);
                              setEditingPresetLabel('');
                            }}
                            disabled={!editingPresetLabel.trim()}
                          >
                            Valider
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setEditingPresetKey(null);
                              setEditingPresetLabel('');
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ opacity: 0.75 }}>Aucun preset personnalisé pour ce mode.</span>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0 }}>Test / résultat</h3>
        {variableTokens.length ? (
          <div className="grid" style={{ marginBottom: '0.75rem' }}>
            {variableTokens.map((token) => (
              <label key={token} style={{ display: 'grid', gap: '0.35rem' }}>
                <span>@{token}</span>
                <input
                  value={state.testValues[token] ?? ''}
                  onChange={(event) => onTestValueChange(token, event.target.value)}
                  placeholder="Valeur de test"
                />
              </label>
            ))}
          </div>
        ) : (
          <p style={{ marginTop: 0, opacity: 0.8 }}>Ajoute des variables dans la formule pour pouvoir les tester ici.</p>
        )}
        <div className="card" style={{ margin: 0, background: 'rgba(7, 22, 46, 0.42)' }}>
          <strong>{evaluation.label}</strong>
          <div style={{ marginTop: '0.5rem' }}>
            {evaluation.value === null ? 'Aucun résultat exploitable pour le moment.' : String(evaluation.value)}
          </div>
        </div>
      </section>
    </div>
  );
}

export default function SystemStudioPage() {
  const { systemId = '' } = useParams();
  const { currentUser } = useAuth();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const importViewInputRef = useRef<HTMLInputElement | null>(null);
  const ignoreDetachedCloseRef = useRef(false);
  const selectedNodeIdsRef = useRef<string[]>([]);
  const autoSaveTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const systemDraftRef = useRef<GameSystem | null>(null);
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [schema, setSchema] = useState<SystemStudioSchemaV2>(createEmptyStudioSchemaV2());
  const [selectedViewId, setSelectedViewId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [scope, setScope] = useState<ScopeState>({ parentId: null, slotKey: null });
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('edit');
  const [dragState, setDragState] = useState<DragState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImportState>(null);
  const [repeatFieldAssistant, setRepeatFieldAssistant] = useState<RepeatFieldAssistantState>(null);
  const [isSystemPropertiesOpen, setIsSystemPropertiesOpen] = useState(false);
  const [isViewPropertiesOpen, setIsViewPropertiesOpen] = useState(false);
  const [isCatalogManagerOpen, setIsCatalogManagerOpen] = useState(false);
  const [isDiscordConfigManagerOpen, setIsDiscordConfigManagerOpen] = useState(false);
  const [isCharacterCreationManagerOpen, setIsCharacterCreationManagerOpen] = useState(false);
  const [isDiscordConfigManagerDetachedBlocked, setIsDiscordConfigManagerDetachedBlocked] = useState(false);
  const [isCharacterCreationManagerDetachedBlocked, setIsCharacterCreationManagerDetachedBlocked] = useState(false);
  const [discordConfigManagerRetryKey, setDiscordConfigManagerRetryKey] = useState(0);
  const [characterCreationManagerRetryKey, setCharacterCreationManagerRetryKey] = useState(0);
  const discordConfigManagerWindowRef = useRef<Window | null>(null);
  const characterCreationManagerWindowRef = useRef<Window | null>(null);
  const [transferTargetViewId, setTransferTargetViewId] = useState('');
  const [transferTargetContainerId, setTransferTargetContainerId] = useState('');
  const [previewValues, setPreviewValues] = useState<Record<string, string | number | boolean | string[] | Record<string, unknown>[]> | undefined>(undefined);
  const [batchWidth, setBatchWidth] = useState('');
  const [batchHeight, setBatchHeight] = useState('');
  const [batchFieldLayout, setBatchFieldLayout] = useState<'ligne' | 'colonne' | 'texte_cache' | ''>('');
  const [batchFieldLabelSpan, setBatchFieldLabelSpan] = useState('');
  const [batchFieldInputSpan, setBatchFieldInputSpan] = useState('');
  const [optionsEditorText, setOptionsEditorText] = useState('');
  const [detachedPanels, setDetachedPanels] = useState<Record<DetachedPanelKey, boolean>>({ left: false, right: false, formula: false, discord_config: false, character_creation: false });
  const [detachedBlocked, setDetachedBlocked] = useState<Record<DetachedPanelKey, boolean>>({ left: false, right: false, formula: false, discord_config: false, character_creation: false });
  const [detachedRetryKey, setDetachedRetryKey] = useState<Record<DetachedPanelKey, number>>({ left: 0, right: 0, formula: 0, discord_config: 0, character_creation: 0 });
  const [formulaComposer, setFormulaComposer] = useState<FormulaComposerState>(null);
  const [formulaRecents, setFormulaRecents] = useState<FormulaRecentEntry[]>(() => loadFormulaRecents());
  const [formulaFavorites, setFormulaFavorites] = useState<string[]>(() => loadFormulaFavorites());
  const [customFormulaPresets, setCustomFormulaPresets] = useState<FormulaCustomPreset[]>(() => loadCustomFormulaPresets());

  const openDiscordConfigManagerWindow = () => {
    const width = 1480;
    const height = 980;
    return window.open('', 'nexusforge-system-studio-v2-discord_config', `popup=yes,width=${width},height=${height}`);
  };

  const openCharacterCreationManagerWindow = () => {
    const width = 1540;
    const height = 980;
    return window.open('', 'nexusforge-system-studio-v2-character_creation', `popup=yes,width=${width},height=${height}`);
  };

  useEffect(() => {
    return () => {
      ignoreDetachedCloseRef.current = true;
    };
  }, []);

  useEffect(() => {
    systemDraftRef.current = system;
  }, [system]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const loaded = await systemRepository.getById(systemId);
        if (!active) {
          return;
        }
        if (!loaded) {
          setSystem(null);
          systemDraftRef.current = null;
          return;
        }
        setSystem(loaded);
        systemDraftRef.current = loaded;
        const nextSchema = loaded.studioSchemaV2 ? cloneStudioSchemaV2(loaded.studioSchemaV2) : createEmptyStudioSchemaV2();
        setSchema(nextSchema);
        lastSavedSnapshotRef.current = serializeStudioSystemDraft(buildStudioSystemDraft(loaded, nextSchema));
        setSelectedViewId(nextSchema.views[0]?.id ?? '');
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger le studio système.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [systemId]);

  const canEdit = Boolean(system && currentUser && canUserEditSystem(system, currentUser));
  const currentDraftSnapshot = useMemo(() => {
    if (!system) {
      return null;
    }
    return serializeStudioSystemDraft(buildStudioSystemDraft(system, schema));
  }, [schema, system]);
  const hasUnsavedChanges =
    Boolean(canEdit) &&
    Boolean(currentDraftSnapshot) &&
    Boolean(lastSavedSnapshotRef.current) &&
    currentDraftSnapshot !== lastSavedSnapshotRef.current;
  const selectedView = useMemo(() => schema.views.find((view) => view.id === selectedViewId) ?? schema.views[0] ?? null, [schema.views, selectedViewId]);
  const formulaVariableCandidates = useMemo<FormulaVariableCandidate[]>(() => {
    return schema.views.flatMap((view) =>
      view.nodes
        .filter((node) => node.key?.trim())
        .map((node) => ({
          token: view.id === selectedView?.id ? node.key : `${view.reference}.${node.key}`,
          viewId: view.id,
          viewName: view.name,
          viewReference: view.reference,
          nodeLabel: node.label || node.key,
          nodeKey: node.key
        }))
    );
  }, [schema.views, selectedView?.id]);
  const validation = useMemo(() => {
    if (!selectedView) {
      return {
        keyErrors: new Map<string, string>(),
        labelErrors: new Map<string, string>(),
        hasErrors: false
      };
    }
    const keyCounts = new Map<string, number>();
    selectedView.nodes.forEach((node) => {
      const key = node.key.trim();
      if (key) {
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }
    });
    const keyErrors = new Map<string, string>();
    const labelErrors = new Map<string, string>();
    const keyPattern = /^[a-z0-9_-]+$/;
    selectedView.nodes.forEach((node) => {
      const key = node.key.trim();
      const label = node.label.trim();
      if (!key) {
        keyErrors.set(node.id, 'La clé est obligatoire.');
      } else if (!keyPattern.test(key)) {
        keyErrors.set(node.id, 'Clé invalide (minuscule, chiffres, - ou _).');
      } else if ((keyCounts.get(key) ?? 0) > 1) {
        keyErrors.set(node.id, 'Clé déjà utilisée.');
      }
      if (!label) {
        labelErrors.set(node.id, 'Le libellé est obligatoire.');
      }
    });
    return {
      keyErrors,
      labelErrors,
      hasErrors: keyErrors.size > 0 || labelErrors.size > 0
    };
  }, [selectedView]);
  const scopeNodes = useMemo(() => childNodes(selectedView, scope), [selectedView, scope]);
  const selectedNode = useMemo(() => selectedView?.nodes.find((node) => node.id === selectedNodeId) ?? null, [selectedNodeId, selectedView]);
  const selectedNodes = useMemo(
    () => (selectedView?.nodes ?? []).filter((node) => selectedNodeIds.includes(node.id)),
    [selectedNodeIds, selectedView]
  );
  const selectedEditableNodes = useMemo(
    () => selectedNodes.filter((node) => isEditableNode(node)),
    [selectedNodes]
  );
  const canvasRows = useMemo(() => Math.max(12, scopeNodes.reduce((acc, node) => Math.max(acc, node.layout.y + node.layout.h), 0) + 2), [scopeNodes]);
  const transferTargetView = useMemo(() => schema.views.find((view) => view.id === transferTargetViewId) ?? selectedView ?? null, [schema.views, selectedView, transferTargetViewId]);
  const transferTargetContainers = useMemo(() => (transferTargetView?.nodes ?? []).filter((node) => node.type === 'container'), [transferTargetView]);
  const availableTabViews = useMemo(() => {
    if (!selectedView || selectedNode?.type !== 'tabs') {
      return [];
    }
    const usedViewIds = new Set((selectedNode.tabs ?? []).map((tab) => tab.viewId));
    return schema.views.filter((view) => view.id !== selectedView.id && !usedViewIds.has(view.id));
  }, [schema.views, selectedNode, selectedView]);
  const repeatFieldAssistantSourceView = useMemo(
    () => (repeatFieldAssistant ? schema.views.find((view) => view.id === repeatFieldAssistant.sourceViewId) ?? null : null),
    [repeatFieldAssistant, schema.views]
  );
  const repeatFieldDiagnostics = useMemo(() => {
    if (!selectedView || !selectedNode || selectedNode.type !== 'container' || selectedNode.repeat?.mode !== 'fields') {
      return null;
    }
    const sourceViewId = resolveRepeatSourceViewId(schema, selectedView, selectedNode.repeat?.source);
    const sourceView = schema.views.find((view) => view.id === sourceViewId) ?? selectedView;
    const entries = parseFieldItemsText(selectedNode.repeat?.fieldItemsText ?? '');
    const details = entries.map((entry) => {
      const resolution = resolveRepeatFieldEntry(sourceView, entry.key);
      return {
        ...entry,
        node: resolution.node,
        matchKind: resolution.matchKind
      };
    });
    return {
      sourceView,
      details,
      normalizedMatches: details.filter((detail) => detail.matchKind === 'normalized' && detail.node),
      missingEntries: details.filter((detail) => detail.matchKind === 'missing')
    };
  }, [schema, selectedNode, selectedView]);
  const repeatFieldAssistantFilteredItems = useMemo(() => {
    if (!repeatFieldAssistant) {
      return [];
    }
    const search = repeatFieldAssistant.search.trim().toLowerCase();
    return repeatFieldAssistant.items.filter((item) => {
      if (repeatFieldAssistant.typeFilter === 'numeric' && item.type !== 'number') {
        return false;
      }
      if (repeatFieldAssistant.typeFilter === 'checkbox' && item.type !== 'checkbox') {
        return false;
      }
      if (repeatFieldAssistant.typeFilter === 'textual' && !['text', 'date', 'time'].includes(item.type)) {
        return false;
      }
      if (repeatFieldAssistant.typeFilter === 'select' && !['select', 'multiselect'].includes(item.type)) {
        return false;
      }
      if (repeatFieldAssistant.visibilityFilter === 'visible' && !item.visible) {
        return false;
      }
      if (repeatFieldAssistant.visibilityFilter === 'hidden' && item.visible) {
        return false;
      }
      if (repeatFieldAssistant.editabilityFilter === 'editable' && !item.editable) {
        return false;
      }
      if (repeatFieldAssistant.editabilityFilter === 'readonly' && item.editable) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [item.label, item.key, item.alias].some((value) => value.toLowerCase().includes(search));
    });
  }, [repeatFieldAssistant]);
  const openFormulaComposer = (
    title: string,
    mode: FormulaComposerMode,
    value: string,
    onApply: (nextValue: string) => void,
    fieldLabel: string,
    helpText: string
  ) => {
    setFormulaComposer({
      title,
      mode,
      value,
      search: '',
      testValues: {},
      fieldLabel,
      helpText,
      selectionStart: value.length,
      selectionEnd: value.length,
      onApply
    });
    setDetachedBlocked((current) => ({ ...current, formula: false }));
    setDetachedPanels((current) => ({ ...current, formula: true }));
  };
  const updateFormulaComposer = (updater: (current: NonNullable<FormulaComposerState>) => NonNullable<FormulaComposerState>) => {
    setFormulaComposer((current) => (current ? updater(current) : current));
  };
  const [tabViewToAdd, setTabViewToAdd] = useState('');

  useEffect(() => {
    if (!selectedView) {
      setSelectedViewId('');
      return;
    }
    if (!schema.views.some((view) => view.id === selectedViewId)) {
      setSelectedViewId(selectedView.id);
    }
  }, [schema.views, selectedView, selectedViewId]);

  useEffect(() => {
    setPreviewValues(undefined);
  }, [selectedViewId, schema]);

  useEffect(() => {
    if (!selectedNode || !['select', 'multiselect'].includes(selectedNode.type)) {
      setOptionsEditorText('');
      return;
    }
    setOptionsEditorText((selectedNode.options ?? []).join('\n'));
  }, [selectedNode?.id, selectedNode?.type]);

  useEffect(() => {
    if (!selectedView) {
      setScope({ parentId: null, slotKey: null });
      return;
    }
    if (scope.parentId && !selectedView.nodes.some((node) => node.id === scope.parentId)) {
      setScope({ parentId: null, slotKey: null });
    }
  }, [scope.parentId, selectedView]);

  useEffect(() => {
    if (!selectedView) {
      setSelectedNodeId('');
      setSelectedNodeIds([]);
      return;
    }
    const validIds = new Set(scopeNodes.map((node) => node.id));
    const nextSelectedIds = selectedNodeIds.filter((id) => validIds.has(id));
    const fallbackId = scopeNodes[0]?.id ?? '';
    if (nextSelectedIds.length === 0) {
      setSelectedNodeId(fallbackId);
      setSelectedNodeIds(fallbackId ? [fallbackId] : []);
      return;
    }
    if (!nextSelectedIds.includes(selectedNodeId)) {
      setSelectedNodeId(nextSelectedIds[0]);
    }
    if (nextSelectedIds.length !== selectedNodeIds.length) {
      setSelectedNodeIds(nextSelectedIds);
    }
  }, [scopeNodes, selectedNodeId, selectedNodeIds, selectedView]);

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  useEffect(() => {
    setBatchWidth(commonNumericValue(selectedNodes.map((node) => node.layout.w)));
    setBatchHeight(commonNumericValue(selectedNodes.map((node) => node.layout.h)));
    setBatchFieldLayout(commonStringValue(selectedEditableNodes.map((node) => node.fieldLayout ?? 'colonne')) as 'ligne' | 'colonne' | 'texte_cache' | '');
    setBatchFieldLabelSpan(commonNumericValue(selectedEditableNodes.map((node) => node.fieldLabelSpan)));
    setBatchFieldInputSpan(commonNumericValue(selectedEditableNodes.map((node) => node.fieldInputSpan)));
  }, [selectedEditableNodes, selectedNodes]);

  useEffect(() => {
    if (!selectedView) {
      setTransferTargetViewId('');
      return;
    }
    if (!transferTargetViewId || !schema.views.some((view) => view.id === transferTargetViewId)) {
      setTransferTargetViewId(selectedView.id);
    }
  }, [schema.views, selectedView, transferTargetViewId]);

  useEffect(() => {
    if (transferTargetContainerId && !transferTargetContainers.some((node) => node.id === transferTargetContainerId)) {
      setTransferTargetContainerId('');
    }
  }, [transferTargetContainerId, transferTargetContainers]);

  useEffect(() => {
    if (availableTabViews.length === 0) {
      setTabViewToAdd('');
      return;
    }
    if (!availableTabViews.some((view) => view.id === tabViewToAdd)) {
      setTabViewToAdd(availableTabViews[0]?.id ?? '');
    }
  }, [availableTabViews, tabViewToAdd]);

  useEffect(() => {
    if (!dragState || !selectedView || !canEdit) {
      return;
    }
    const handleMove = (event: MouseEvent) => {
      if (!canvasRef.current) {
        return;
      }
      const rect = canvasRef.current.getBoundingClientRect();
      const cellWidth = rect.width / selectedView.gridColumns;
      const deltaX = Math.round(((event.clientX - dragState.startX) / Math.max(cellWidth, 1)) / GRID_STEP) * GRID_STEP;
      const deltaY = Math.round(((event.clientY - dragState.startY) / ROW_HEIGHT) / GRID_STEP) * GRID_STEP;
      setSchema((current) => ({
        ...current,
        views: current.views.map((view) =>
          view.id !== selectedView.id
            ? view
            : {
                ...view,
                nodes: view.nodes.map((node) => {
                  if (!dragState.nodeIds.includes(node.id)) {
                    return node;
                  }
                  if (dragState.mode === 'resize' && node.id !== dragState.primaryNodeId) {
                    return node;
                  }
                  const startLayout = dragState.startLayouts[node.id];
                  if (!startLayout) {
                    return node;
                  }
                  const nextLayout =
                    dragState.mode === 'move'
                      ? { ...startLayout, x: startLayout.x + deltaX, y: startLayout.y + deltaY }
                      : {
                          ...startLayout,
                          w: startLayout.w + deltaX,
                          h: Math.max(1, startLayout.h + deltaY)
                        };
                  return {
                    ...node,
                    layout: clampLayout(nextLayout, view.gridColumns)
                  };
                })
              }
        )
      }));
    };
    const handleUp = () => setDragState(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [canEdit, dragState, selectedView]);

  useEffect(() => {
    const storedDetachedPanels = localStorage.getItem(SYSTEM_STUDIO_DETACHED_PANELS_KEY);
    if (!storedDetachedPanels) {
      return;
    }
    try {
      const parsed = JSON.parse(storedDetachedPanels) as Partial<Record<DetachedPanelKey, boolean>>;
      setDetachedPanels({
        left: Boolean(parsed.left),
        right: Boolean(parsed.right),
        formula: false,
        discord_config: false,
        character_creation: false
      });
    } catch {
      setDetachedPanels({ left: false, right: false, formula: false, discord_config: false, character_creation: false });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SYSTEM_STUDIO_DETACHED_PANELS_KEY, JSON.stringify(detachedPanels));
  }, [detachedPanels]);

  const saveDraft = async (mode: 'manual' | 'auto') => {
    const baseSystem = systemDraftRef.current ?? system;
    if (!canEdit || !baseSystem || isSaving) {
      return false;
    }
    let schemaToSave = schema;
    if (validation.hasErrors) {
      if (mode === 'auto') {
        return false;
      }
      schemaToSave = normalizeSchemaIdentifiers(schema);
      setSchema(schemaToSave);
    }
    setIsSaving(true);
    if (mode === 'manual') {
      setErrorMessage(null);
      setStatusMessage(null);
    }
    try {
      const nextSystem = buildStudioSystemDraft(baseSystem, schemaToSave);
      await systemRepository.upsert(nextSystem, currentUser ?? undefined);
      lastSavedSnapshotRef.current = serializeStudioSystemDraft(nextSystem);
      systemDraftRef.current = nextSystem;
      setSystem(nextSystem);
      setStatusMessage(mode === 'auto' ? 'Studio système V2 enregistré automatiquement.' : 'Studio système V2 enregistré.');
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d’enregistrer le studio système.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!canEdit || !system || !currentDraftSnapshot) {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (!lastSavedSnapshotRef.current) {
      lastSavedSnapshotRef.current = currentDraftSnapshot;
      return;
    }
    if (!hasUnsavedChanges || validation.hasErrors || isSaving) {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      void saveDraft('auto');
    }, SYSTEM_STUDIO_AUTO_SAVE_DELAY_MS);
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [canEdit, currentDraftSnapshot, hasUnsavedChanges, isSaving, schema, system, validation.hasErrors, currentUser]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges && !isSaving) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isSaving]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') {
        return;
      }
      if (!hasUnsavedChanges || isSaving || validation.hasErrors) {
        return;
      }
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      void saveDraft('auto');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [hasUnsavedChanges, isSaving, schema, system, validation.hasErrors, currentUser]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <Layout>
        <section className="card">
          <p>Chargement du studio système...</p>
        </section>
      </Layout>
    );
  }

  if (!system) {
    return (
      <Layout>
        <section className="card">
          <p>Système introuvable.</p>
        </section>
      </Layout>
    );
  }

  const updateView = (viewId: string, updater: (view: SystemStudioViewDefinitionV2) => SystemStudioViewDefinitionV2) => {
    setSchema((current) => ({
      ...current,
      views: current.views.map((view) => (view.id === viewId ? updater(view) : view))
    }));
  };

  const updateSelectedView = (updater: (view: SystemStudioViewDefinitionV2) => SystemStudioViewDefinitionV2) => {
    if (!selectedView) {
      return;
    }
    updateView(selectedView.id, updater);
  };

  const updateSystemTheme = (updater: (theme: StudioThemeDefinition) => StudioThemeDefinition) => {
    setSystem((current) => {
      if (!current) {
        return current;
      }
      const nextSystem = { ...current, studioTheme: updater(current.studioTheme ?? {}) };
      systemDraftRef.current = nextSystem;
      return nextSystem;
    });
  };

  const updateSelectedViewTheme = (updater: (theme: StudioThemeDefinition) => StudioThemeDefinition) => {
    updateSelectedView((view) => ({
      ...view,
      theme: updater(view.theme ?? {})
    }));
  };

  const handleRenameSelectedView = (nextName: string) => {
    if (!selectedView) {
      return;
    }
    setSchema((current) => syncViewRename({ schema: current, viewId: selectedView.id, nextName }));
  };

  const updateSelectedNode = (updater: (node: SystemStudioNodeDefinition) => SystemStudioNodeDefinition) => {
    if (!selectedView || !selectedNode) {
      return;
    }
    updateSelectedView((view) => ({
      ...view,
      nodes: view.nodes.map((node) => (node.id === selectedNode.id ? updater(node) : node))
    }));
  };

  const updateNodesById = (nodeIds: string[], updater: (node: SystemStudioNodeDefinition) => SystemStudioNodeDefinition) => {
    if (!selectedView || nodeIds.length === 0) {
      return;
    }
    const ids = new Set(nodeIds);
    updateSelectedView((view) => ({
      ...view,
      nodes: view.nodes.map((node) => (ids.has(node.id) ? updater(node) : node))
    }));
  };

  const renderInheritanceField = (
    label: string,
    control: React.ReactNode,
    onReset: () => void,
    disabled: boolean,
    isInherited: boolean
  ) => (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span>{label}</span>
        <Button type="button" variant="secondary" onClick={onReset} disabled={disabled || isInherited}>
          Hériter
        </Button>
      </div>
      {control}
    </div>
  );

  const renderFormulaComposerButton = (
    title: string,
    mode: FormulaComposerMode,
    value: string | null | undefined,
    onApply: (nextValue: string) => void,
    fieldLabel: string,
    helpText: string
  ) => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.35rem' }}>
      <Button
        type="button"
        variant="secondary"
        onClick={() => openFormulaComposer(title, mode, value ?? '', onApply, fieldLabel, helpText)}
        disabled={!canEdit}
      >
        Compositeur de formule
      </Button>
    </div>
  );

  const applyFormulaComposer = () => {
    if (!formulaComposer) {
      return;
    }
    formulaComposer.onApply(formulaComposer.value);
    const trimmed = formulaComposer.value.trim();
    if (trimmed) {
      const nextRecents = [
        {
          mode: formulaComposer.mode,
          title: formulaComposer.title,
          fieldLabel: formulaComposer.fieldLabel,
          value: trimmed,
          updatedAt: new Date().toISOString()
        },
        ...formulaRecents.filter(
          (entry) =>
            !(entry.mode === formulaComposer.mode && entry.fieldLabel === formulaComposer.fieldLabel && entry.value.trim() === trimmed)
        )
      ].slice(0, FORMULA_RECENTS_LIMIT);
      setFormulaRecents(nextRecents);
      saveFormulaRecents(nextRecents);
    }
    setDetachedPanels((current) => ({ ...current, formula: false }));
    setFormulaComposer(null);
  };

  const toggleFormulaFavorite = (token: string) => {
    const nextFavorites = formulaFavorites.includes(token)
      ? formulaFavorites.filter((item) => item !== token)
      : [token, ...formulaFavorites.filter((item) => item !== token)];
    setFormulaFavorites(nextFavorites);
    saveFormulaFavorites(nextFavorites);
  };

  const saveCustomPreset = (label: string, value: string, mode: FormulaComposerMode) => {
    const trimmedLabel = label.trim();
    const trimmedValue = value.trim();
    if (!trimmedLabel || !trimmedValue) {
      return;
    }
    const nextPresets = [
      {
        mode,
        label: trimmedLabel,
        value: trimmedValue,
        updatedAt: new Date().toISOString()
      },
      ...customFormulaPresets.filter((preset) => !(preset.mode === mode && preset.label === trimmedLabel))
    ].slice(0, FORMULA_CUSTOM_PRESETS_LIMIT);
    setCustomFormulaPresets(nextPresets);
    saveCustomFormulaPresets(nextPresets);
  };

  const renameCustomPreset = (previousLabel: string, nextLabel: string, value: string, mode: FormulaComposerMode) => {
    const trimmedLabel = nextLabel.trim();
    if (!trimmedLabel) {
      return;
    }
    const nextPresets = customFormulaPresets.map((preset) =>
      preset.mode === mode && preset.label === previousLabel && preset.value === value
        ? { ...preset, label: trimmedLabel, updatedAt: new Date().toISOString() }
        : preset
    );
    setCustomFormulaPresets(nextPresets);
    saveCustomFormulaPresets(nextPresets);
  };

  const deleteCustomPreset = (label: string, value: string, mode: FormulaComposerMode) => {
    const nextPresets = customFormulaPresets.filter((preset) => !(preset.mode === mode && preset.label === label && preset.value === value));
    setCustomFormulaPresets(nextPresets);
    saveCustomFormulaPresets(nextPresets);
  };

  const exportCustomPresets = (mode: FormulaComposerMode) => {
    const payload = {
      version: 1,
      mode,
      exportedAt: new Date().toISOString(),
      presets: customFormulaPresets.filter((preset) => preset.mode === mode)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nexusforge-formules-${mode}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCustomPresets = async (file: File | null, mode: FormulaComposerMode) => {
    if (!file) {
      return;
    }
    const raw = await file.text();
    const parsed = JSON.parse(raw) as { presets?: Array<Partial<FormulaCustomPreset>> };
    const incoming = Array.isArray(parsed.presets) ? parsed.presets : [];
    const normalized = incoming
      .filter((preset) => typeof preset.label === 'string' && typeof preset.value === 'string')
      .map<FormulaCustomPreset>((preset) => ({
        mode,
        label: String(preset.label).trim(),
        value: String(preset.value).trim(),
        updatedAt: new Date().toISOString()
      }))
      .filter((preset) => preset.label && preset.value);
    if (!normalized.length) {
      return;
    }
    const nextPresets = [
      ...normalized,
      ...customFormulaPresets.filter(
        (preset) => !(preset.mode === mode && normalized.some((item) => item.label === preset.label))
      )
    ].slice(0, FORMULA_CUSTOM_PRESETS_LIMIT);
    setCustomFormulaPresets(nextPresets);
    saveCustomFormulaPresets(nextPresets);
  };

  const renderThemeEditor = (theme: StudioThemeDefinition | undefined, onChange: (updater: (theme: StudioThemeDefinition) => StudioThemeDefinition) => void, disabled: boolean) => (
    <div className="grid">
      {renderInheritanceField(
        'Fond',
        <input value={theme?.backgroundColor ?? ''} onChange={(event) => onChange((current) => ({ ...current, backgroundColor: event.target.value }))} disabled={disabled} />
        ,
        () => onChange((current) => ({ ...current, backgroundColor: undefined })),
        disabled,
        !theme?.backgroundColor
      )}
      {renderInheritanceField(
        'Fond champ',
        <input value={theme?.inputBackgroundColor ?? ''} onChange={(event) => onChange((current) => ({ ...current, inputBackgroundColor: event.target.value }))} disabled={disabled} />
        ,
        () => onChange((current) => ({ ...current, inputBackgroundColor: undefined })),
        disabled,
        !theme?.inputBackgroundColor
      )}
      {renderInheritanceField(
        'Texte champ',
        <input value={theme?.inputTextColor ?? ''} onChange={(event) => onChange((current) => ({ ...current, inputTextColor: event.target.value }))} disabled={disabled} />
        ,
        () => onChange((current) => ({ ...current, inputTextColor: undefined })),
        disabled,
        !theme?.inputTextColor
      )}
      {renderInheritanceField(
        'Bordure champ',
        <input value={theme?.inputBorderColor ?? ''} onChange={(event) => onChange((current) => ({ ...current, inputBorderColor: event.target.value }))} disabled={disabled} />
        ,
        () => onChange((current) => ({ ...current, inputBorderColor: undefined })),
        disabled,
        !theme?.inputBorderColor
      )}
      {renderInheritanceField(
        'Texte',
        <input value={theme?.textColor ?? ''} onChange={(event) => onChange((current) => ({ ...current, textColor: event.target.value }))} disabled={disabled} />
        ,
        () => onChange((current) => ({ ...current, textColor: undefined })),
        disabled,
        !theme?.textColor
      )}
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>Style du libellé</span>
        <select
          value={theme?.fieldLabelStyleMode ?? 'commun'}
          onChange={(event) => onChange((current) => ({ ...current, fieldLabelStyleMode: event.target.value as StudioThemeDefinition['fieldLabelStyleMode'] }))}
          disabled={disabled}
        >
          <option value="commun">Commun avec le champ</option>
          <option value="separe">Séparé</option>
        </select>
      </label>
      {theme?.fieldLabelStyleMode === 'separe' ? (
        <>
          {renderInheritanceField(
            'Texte libellé',
            <input value={theme?.fieldLabelTextColor ?? ''} onChange={(event) => onChange((current) => ({ ...current, fieldLabelTextColor: event.target.value }))} disabled={disabled} />
            ,
            () => onChange((current) => ({ ...current, fieldLabelTextColor: undefined })),
            disabled,
            !theme?.fieldLabelTextColor
          )}
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Famille libellé</span>
            <select value={theme?.fieldLabelTypographyFamily ?? 'par_defaut'} onChange={(event) => onChange((current) => ({ ...current, fieldLabelTypographyFamily: event.target.value as StudioThemeDefinition['fieldLabelTypographyFamily'] }))} disabled={disabled}>
              <option value="par_defaut">Par défaut</option>
              <option value="serif">Serif</option>
              <option value="sans-serif">Sans-serif</option>
              <option value="monospace">Monospace</option>
              <option value="fantaisie">Fantaisie</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Taille libellé</span>
            <select value={theme?.fieldLabelTypographySize ?? 'md'} onChange={(event) => onChange((current) => ({ ...current, fieldLabelTypographySize: event.target.value as StudioThemeDefinition['fieldLabelTypographySize'] }))} disabled={disabled}>
              <option value="xs">XS</option>
              <option value="sm">SM</option>
              <option value="md">MD</option>
              <option value="lg">LG</option>
              <option value="xl">XL</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Gras libellé</span>
            <select value={String(Boolean(theme?.fieldLabelTypographyBold))} onChange={(event) => onChange((current) => ({ ...current, fieldLabelTypographyBold: event.target.value === 'true' }))} disabled={disabled}>
              <option value="false">Non</option>
              <option value="true">Oui</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Italique libellé</span>
            <select value={String(Boolean(theme?.fieldLabelTypographyItalic))} onChange={(event) => onChange((current) => ({ ...current, fieldLabelTypographyItalic: event.target.value === 'true' }))} disabled={disabled}>
              <option value="false">Non</option>
              <option value="true">Oui</option>
            </select>
          </label>
        </>
      ) : null}
      {renderInheritanceField(
        'Bordure',
        <input value={theme?.borderColor ?? ''} onChange={(event) => onChange((current) => ({ ...current, borderColor: event.target.value }))} disabled={disabled} />
        ,
        () => onChange((current) => ({ ...current, borderColor: undefined })),
        disabled,
        !theme?.borderColor
      )}
      {renderInheritanceField(
        'Image de fond',
        <input value={theme?.backgroundImage ?? ''} onChange={(event) => onChange((current) => ({ ...current, backgroundImage: event.target.value }))} disabled={disabled} />
        ,
        () => onChange((current) => ({ ...current, backgroundImage: undefined })),
        disabled,
        !theme?.backgroundImage
      )}
      {renderInheritanceField(
        'Opacité fond',
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={theme?.backgroundOpacity ?? ''}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              backgroundOpacity: event.target.value === '' ? null : Math.max(0, Math.min(1, Number(event.target.value) || 0))
            }))
          }
          disabled={disabled}
        />
        ,
        () => onChange((current) => ({ ...current, backgroundOpacity: null })),
        disabled,
        typeof theme?.backgroundOpacity !== 'number'
      )}
      {renderInheritanceField(
        'Taille image',
        <select value={theme?.backgroundSize ?? 'couvrir'} onChange={(event) => onChange((current) => ({ ...current, backgroundSize: event.target.value as StudioBackgroundSize }))} disabled={disabled}>
          {THEME_BACKGROUND_SIZES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        ,
        () => onChange((current) => ({ ...current, backgroundSize: undefined })),
        disabled,
        !theme?.backgroundSize
      )}
      {renderInheritanceField(
        'Position image',
        <select value={theme?.backgroundPosition ?? 'centre'} onChange={(event) => onChange((current) => ({ ...current, backgroundPosition: event.target.value as StudioBackgroundPosition }))} disabled={disabled}>
          {THEME_BACKGROUND_POSITIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        ,
        () => onChange((current) => ({ ...current, backgroundPosition: undefined })),
        disabled,
        !theme?.backgroundPosition
      )}
      {renderInheritanceField(
        'Répétition image',
        <select value={theme?.backgroundRepeat ?? 'aucune'} onChange={(event) => onChange((current) => ({ ...current, backgroundRepeat: event.target.value as StudioBackgroundRepeat }))} disabled={disabled}>
          {THEME_BACKGROUND_REPEATS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        ,
        () => onChange((current) => ({ ...current, backgroundRepeat: undefined })),
        disabled,
        !theme?.backgroundRepeat
      )}
    </div>
  );

  const openRepeatFieldAssistant = () => {
    if (!selectedView || !selectedNode || selectedNode.type !== 'container') {
      return;
    }
    const sourceViewId = resolveRepeatSourceViewId(schema, selectedView, selectedNode.repeat?.source);
    const sourceView = schema.views.find((view) => view.id === sourceViewId) ?? selectedView;
    const existing = parseFieldItemsText(selectedNode.repeat?.fieldItemsText ?? '');
    const existingMap = new Map(
      existing.map((item, index) => {
        const resolution = resolveRepeatFieldEntry(sourceView, item.key);
        const lookupKey = resolution.node?.key ?? item.key;
        return [lookupKey, { alias: item.alias, index, originalKey: item.key, missing: resolution.matchKind === 'missing' }];
      })
    );
    const baseItems: RepeatFieldAssistantItem[] = sourceView.nodes
      .filter((node) => isRepeatAssistantEligibleNode(node))
      .map((node) => ({
        key: node.key,
        label: node.label,
        type: node.type,
        selected: existingMap.has(node.key),
        alias: existingMap.get(node.key)?.alias ?? '',
        visible: !node.showIf?.trim(),
        editable: !node.editableIf?.trim(),
        sourceToken: existingMap.get(node.key)?.originalKey ?? node.key
      }));
    existing.forEach((item, index) => {
      const resolution = resolveRepeatFieldEntry(sourceView, item.key);
      if (resolution.matchKind !== 'missing' || resolution.node) {
        return;
      }
      baseItems.push({
        key: item.key,
        label: item.alias || item.key,
        type: 'text',
        selected: true,
        alias: item.alias,
        visible: true,
        editable: true,
        missing: true,
        sourceToken: item.key
      });
    });
    baseItems.sort((a, b) => {
      const aExactIndex = existingMap.get(a.key)?.index;
      const bExactIndex = existingMap.get(b.key)?.index;
      const aFallbackIndex = existing.findIndex((entry) => entry.key === a.sourceToken);
      const bFallbackIndex = existing.findIndex((entry) => entry.key === b.sourceToken);
      const aIndex = typeof aExactIndex === 'number' ? aExactIndex : aFallbackIndex >= 0 ? aFallbackIndex : Number.MAX_SAFE_INTEGER;
      const bIndex = typeof bExactIndex === 'number' ? bExactIndex : bFallbackIndex >= 0 ? bFallbackIndex : Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex || a.label.localeCompare(b.label, 'fr');
    });
    setRepeatFieldAssistant({
      containerNodeId: selectedNode.id,
      sourceViewId: sourceView.id,
      search: '',
      typeFilter: 'all',
      visibilityFilter: 'all',
      editabilityFilter: 'all',
      items: baseItems
    });
  };

  const reconcileRepeatFieldKeys = () => {
    if (!selectedView || !selectedNode || selectedNode.type !== 'container' || selectedNode.repeat?.mode !== 'fields') {
      return;
    }
    const sourceViewId = resolveRepeatSourceViewId(schema, selectedView, selectedNode.repeat?.source);
    const sourceView = schema.views.find((view) => view.id === sourceViewId) ?? selectedView;
    const currentEntries = parseFieldItemsText(selectedNode.repeat?.fieldItemsText ?? '');
    const nextEntries = currentEntries.map((entry) => {
      const resolution = resolveRepeatFieldEntry(sourceView, entry.key);
      return {
        key: resolution.node?.key ?? entry.key,
        alias: entry.alias
      };
    });
    const nextValue = nextEntries
      .map((entry) => (entry.alias.trim() ? `${entry.key} => ${entry.alias.trim()}` : entry.key))
      .join('\n');
    updateSelectedNode((node) => ({
      ...node,
      repeat: {
        ...(node.repeat ?? { mode: 'fields', source: '', manualItemsText: '' }),
        fieldItemsText: nextValue
      }
    }));
  };

  const applyRepeatFieldAssistant = () => {
    if (!repeatFieldAssistant) {
      return;
    }
    const sourceView = schema.views.find((view) => view.id === repeatFieldAssistant.sourceViewId) ?? null;
    const sourceRef = sourceView && selectedView && sourceView.id !== selectedView.id ? sourceView.reference : '';
    updateSelectedNode((node) => ({
      ...node,
      repeat: {
        ...(node.repeat ?? { mode: 'fields', manualItemsText: '' }),
        mode: 'fields',
        source: sourceRef,
        fieldItemsText: serializeFieldItemsText(repeatFieldAssistant.items)
      }
    }));
    setRepeatFieldAssistant(null);
  };

  const rebuildRepeatAssistantItems = (sourceViewId: string, currentItems?: RepeatFieldAssistantItem[]) => {
    const sourceView = schema.views.find((view) => view.id === sourceViewId) ?? null;
    if (!sourceView) {
      return [];
    }
    const currentMap = new Map(
      (currentItems ?? []).map((item, index) => [item.sourceToken ?? item.key, { ...item, index }])
    );
    const nextItems: RepeatFieldAssistantItem[] = sourceView.nodes
      .filter((node) => isRepeatAssistantEligibleNode(node))
      .map((node) => {
        const exactExisting = currentMap.get(node.key);
        const normalizedExisting =
          exactExisting ??
          (currentItems ?? []).find((item) => {
            const sourceToken = item.sourceToken ?? item.key;
            const resolution = resolveRepeatFieldEntry(sourceView, sourceToken);
            return resolution.node?.key === node.key;
          });
        const existing = normalizedExisting ?? exactExisting;
        return {
          key: node.key,
          label: node.label,
          type: node.type,
          selected: existing?.selected ?? false,
          alias: existing?.alias ?? '',
          visible: !node.showIf?.trim(),
          editable: !node.editableIf?.trim(),
          sourceToken: existing?.missing ? existing.sourceToken : node.key
        } satisfies RepeatFieldAssistantItem;
      });
    (currentItems ?? []).forEach((item) => {
      const resolution = resolveRepeatFieldEntry(sourceView, item.sourceToken ?? item.key);
      if (resolution.matchKind !== 'missing' || resolution.node) {
        return;
      }
      nextItems.push({
        key: item.key,
        label: item.alias || item.label || item.key,
        type: item.type,
        selected: item.selected,
        alias: item.alias,
        visible: item.visible,
        editable: item.editable,
        missing: true,
        sourceToken: item.sourceToken ?? item.key
      });
    });
    nextItems.sort((a, b) => {
      const aIndex = (currentItems ?? []).findIndex((item) => (item.sourceToken ?? item.key) === (a.sourceToken ?? a.key));
      const bIndex = (currentItems ?? []).findIndex((item) => (item.sourceToken ?? item.key) === (b.sourceToken ?? b.key));
      const safeAIndex = aIndex >= 0 ? aIndex : Number.MAX_SAFE_INTEGER;
      const safeBIndex = bIndex >= 0 ? bIndex : Number.MAX_SAFE_INTEGER;
      if (safeAIndex !== safeBIndex) {
        return safeAIndex - safeBIndex;
      }
      return a.label.localeCompare(b.label, 'fr');
    });
    return nextItems;
  };

  const updateRepeatFieldAssistantItems = (updater: (items: RepeatFieldAssistantItem[]) => RepeatFieldAssistantItem[]) => {
    setRepeatFieldAssistant((current) => (current ? { ...current, items: updater(current.items) } : null));
  };

  const applyBatchDimensions = () => {
    if (!canEdit || selectedNodes.length === 0 || !selectedView) {
      return;
    }
    const nextWidth = batchWidth.trim() ? Number(batchWidth) : null;
    const nextHeight = batchHeight.trim() ? Number(batchHeight) : null;
    updateNodesById(
      selectedNodes.map((node) => node.id),
      (node) => {
        const updatedNode = {
          ...node,
          layout: clampLayout(
            {
              ...node.layout,
              w: nextWidth && Number.isFinite(nextWidth) ? nextWidth : node.layout.w,
              h: nextHeight && Number.isFinite(nextHeight) ? nextHeight : node.layout.h
            },
            selectedView.gridColumns
          )
        };
        return isEditableNode(updatedNode)
          ? {
              ...updatedNode,
              ...normalizeFieldSplitForNode(updatedNode)
            }
          : updatedNode;
      }
    );
  };

  const applyBatchFieldLayout = () => {
    if (!canEdit || selectedEditableNodes.length === 0) {
      return;
    }
    const nextLabel = batchFieldLabelSpan.trim() ? Number(batchFieldLabelSpan) : null;
    const nextInput = batchFieldInputSpan.trim() ? Number(batchFieldInputSpan) : null;
    updateNodesById(
      selectedEditableNodes.map((node) => node.id),
      (node) =>
        ({
          ...node,
          editableIf: node.editableIf ?? '',
          ...normalizeFieldSplitForNode({
            ...node,
            fieldLayout: batchFieldLayout || node.fieldLayout || 'colonne',
            fieldLabelSpan: nextLabel && Number.isFinite(nextLabel) ? Math.max(1, Math.round(nextLabel)) : node.fieldLabelSpan,
            fieldInputSpan: nextInput && Number.isFinite(nextInput) ? Math.max(1, Math.round(nextInput)) : node.fieldInputSpan
          })
        }) satisfies SystemStudioNodeDefinition
    );
  };

  const handleAddView = () => {
    if (!canEdit) {
      return;
    }
    const nextView = createStudioViewV2(`Vue ${schema.views.length + 1}`);
    setSchema((current) => ({ ...current, views: [...current.views, nextView] }));
    setSelectedViewId(nextView.id);
    setScope({ parentId: null, slotKey: null });
    setSelectedNodeId('');
  };

  const handleDeleteView = () => {
    if (!canEdit || !selectedView || schema.views.length <= 1) {
      return;
    }
    if (!window.confirm(`Supprimer la vue "${selectedView.name}" ?`)) {
      return;
    }
    const nextViews = schema.views
      .filter((view) => view.id !== selectedView.id)
      .map((view) => ({
        ...view,
        nodes: view.nodes.map((node) =>
          node.type === 'tabs'
            ? {
                ...node,
                tabs: (node.tabs ?? []).filter((tab) => tab.viewId !== selectedView.id)
              }
            : node
        )
      }));
    setSchema((current) => ({ ...current, views: nextViews }));
    setSelectedViewId(nextViews[0]?.id ?? '');
    setScope({ parentId: null, slotKey: null });
    setSelectedNodeId('');
  };

  const handleMoveView = (direction: 'up' | 'down') => {
    if (!canEdit || !selectedView) {
      return;
    }
    const currentIndex = schema.views.findIndex((view) => view.id === selectedView.id);
    if (currentIndex < 0) {
      return;
    }
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= schema.views.length) {
      return;
    }
    setSchema((current) => {
      const nextViews = [...current.views];
      const [movedView] = nextViews.splice(currentIndex, 1);
      nextViews.splice(targetIndex, 0, movedView);
      return { ...current, views: nextViews };
    });
  };

  const handleExportView = () => {
    if (!selectedView || !system) {
      return;
    }
    const payload = exportSystemStudioView({
      systemId: system.id,
      systemName: system.name,
      view: selectedView
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedView.reference || selectedView.name || 'vue'}.system-view.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatusMessage(`Vue "${selectedView.name}" exportée.`);
    setErrorMessage(null);
  };

  const handleImportViewFile = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      const raw = await file.text();
      const candidate = parseSystemStudioImportCandidate(raw);
      if (candidate.views.length === 1) {
        const importedView = prepareImportedSystemStudioView({
          exchange: {
            format: 'nexusforge.system-studio-view',
            version: 1,
            exportedAt: new Date().toISOString(),
            source: { systemName: candidate.sourceLabel },
            view: candidate.views[0]
          },
          targetSchema: schema
        });
        setSchema((current) => ({
          ...current,
          views: [...current.views, importedView]
        }));
        setSelectedViewId(importedView.id);
        setScope({ parentId: null, slotKey: null });
        setSelectedNodeId('');
        setSelectedNodeIds([]);
        setStatusMessage(`Vue "${importedView.name}" importée.`);
      } else {
        setPendingImport({
          sourceLabel: candidate.sourceLabel,
          views: candidate.views,
          selectedViewIds: candidate.views.map((view) => view.id)
        });
        setStatusMessage(`${candidate.views.length} vues détectées. Choisis celles à importer.`);
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d’importer cette vue.');
      setStatusMessage(null);
    }
  };

  const handleConfirmImportSelection = () => {
    if (!pendingImport || pendingImport.selectedViewIds.length === 0) {
      setErrorMessage('Sélectionne au moins une vue à importer.');
      setStatusMessage(null);
      return;
    }
    let latestImportedId = '';
    let importedCount = 0;
    setSchema((current) => {
      let workingSchema = current;
      const importedViews = pendingImport.views
        .filter((view) => pendingImport.selectedViewIds.includes(view.id))
        .map((view) => {
          const imported = prepareImportedSystemStudioView({
            exchange: {
              format: 'nexusforge.system-studio-view',
              version: 1,
              exportedAt: new Date().toISOString(),
              source: { systemName: pendingImport.sourceLabel },
              view
            },
            targetSchema: workingSchema
          });
          workingSchema = {
            ...workingSchema,
            views: [...workingSchema.views, imported]
          };
          latestImportedId = imported.id;
          importedCount += 1;
          return imported;
        });
      return {
        ...current,
        views: [...current.views, ...importedViews]
      };
    });
    setSelectedViewId(latestImportedId);
    setScope({ parentId: null, slotKey: null });
    setSelectedNodeId('');
    setSelectedNodeIds([]);
    setPendingImport(null);
    setErrorMessage(null);
    setStatusMessage(`${importedCount} vue${importedCount > 1 ? 's' : ''} importée${importedCount > 1 ? 's' : ''}.`);
  };

  const handleAddNode = (type: SystemStudioNodeType) => {
    if (!canEdit || !selectedView) {
      return;
    }
    const nextNode = createStudioNodeV2({
      type,
      siblings: selectedView.nodes,
      parentId: scope.parentId,
      slotKey: scope.slotKey
    });
    updateSelectedView((view) => ({ ...view, nodes: [...view.nodes, nextNode] }));
    setSelectedNodeId(nextNode.id);
    setSelectedNodeIds([nextNode.id]);
  };

  const handleDeleteNode = () => {
    if (!canEdit || !selectedView || !selectedNode) {
      return;
    }
    const idsToDelete = selectedNodeIds.length ? selectedNodeIds : [selectedNode.id];
    const confirmLabel =
      idsToDelete.length === 1
        ? `Supprimer l'élément "${selectedNode.label}" ?`
        : `Supprimer ${idsToDelete.length} éléments ?`;
    if (!window.confirm(confirmLabel)) {
      return;
    }
    updateSelectedView((view) => {
      const nextNodes = idsToDelete.reduce((acc, nodeId) => removeNodeTree(acc, nodeId), view.nodes);
      return { ...view, nodes: nextNodes };
    });
    if (idsToDelete.includes(scope.parentId ?? '')) {
      setScope({ parentId: null, slotKey: null });
    }
    setSelectedNodeId('');
    setSelectedNodeIds([]);
  };

  const resolveNextSelection = (event: ReactMouseEvent, nodeId: string, current: string[]) => {
    const isToggle = event.metaKey || event.ctrlKey;
    const isAdd = event.shiftKey;
    if (isToggle) {
      if (current.includes(nodeId)) {
        const next = current.filter((id) => id !== nodeId);
        return next.length ? next : [nodeId];
      }
      return [...current, nodeId];
    }
    if (isAdd) {
      return current.includes(nodeId) ? current : [...current, nodeId];
    }
    if (selectedView) {
      const target = selectedView.nodes.find((node) => node.id === nodeId);
      if (target?.groupId) {
        const grouped = selectedView.nodes.filter((node) => node.groupId === target.groupId).map((node) => node.id);
        if (grouped.length) {
          return grouped;
        }
      }
    }
    return [nodeId];
  };

  const handleSelectNode = (event: ReactMouseEvent, nodeId: string) => {
    if (!canEdit) {
      setSelectedNodeId(nodeId);
      setSelectedNodeIds([nodeId]);
      return;
    }
    setSelectedNodeIds((current) => resolveNextSelection(event, nodeId, current));
    setSelectedNodeId(nodeId);
  };

  const handleDuplicateSelection = () => {
    if (!canEdit || !selectedView) {
      return;
    }
    const idsToDuplicate = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (idsToDuplicate.length === 0) {
      return;
    }
    let nextSelectedIds: string[] = [];
    updateSelectedView((view) => {
      const existingKeys = new Set(view.nodes.map((node) => node.key));
      const groupIdMap = new Map<string, string>();
      const duplicateKey = (base: string) => {
        const next = ensureUniqueIdentifier(base, existingKeys);
        if (next) {
          existingKeys.add(next);
        }
        return next;
      };
      const duplicates = view.nodes
        .filter((node) => idsToDuplicate.includes(node.id))
        .map((node) => {
          const nextGroupId = node.groupId
            ? (groupIdMap.get(node.groupId) ?? (() => {
                const created = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                groupIdMap.set(node.groupId, created);
                return created;
              })())
            : undefined;
          const nextId = `system_node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const nextKey = duplicateKey(node.key);
          const nextLayout = clampLayout({ ...node.layout, x: node.layout.x + 1, y: node.layout.y + 1 }, view.gridColumns);
          return {
            ...node,
            id: nextId,
            key: nextKey,
            label: node.label,
            groupId: nextGroupId,
            zIndex: (node.zIndex ?? 0) + 1,
            layout: nextLayout
          };
        });
      nextSelectedIds = duplicates.map((node) => node.id);
      return {
        ...view,
        nodes: normalizeDepthOrdering([...view.nodes, ...duplicates])
      };
    });
    setSelectedNodeIds(nextSelectedIds);
    setSelectedNodeId(nextSelectedIds[0] ?? '');
  };

  const handleTransferSelection = (mode: SelectionTransferMode) => {
    if (!canEdit || !selectedView) {
      return;
    }
    const directIds = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (directIds.length === 0) {
      return;
    }
    const targetView = schema.views.find((view) => view.id === transferTargetViewId) ?? selectedView;
    const targetContainer = transferTargetContainerId ? targetView.nodes.find((node) => node.id === transferTargetContainerId && node.type === 'container') ?? null : null;
    const rootIds = selectedRootIds(selectedView.nodes, directIds);
    const subtreeIds = collectSubtreeIds(selectedView.nodes, rootIds);

    if (mode === 'move' && targetView.id === selectedView.id && targetContainer && subtreeIds.has(targetContainer.id)) {
      setErrorMessage('Impossible de déplacer une sélection dans son propre conteneur ou un de ses descendants.');
      return;
    }

    const sourceNodes = selectedView.nodes.filter((node) => subtreeIds.has(node.id)).map(cloneNodeForTransfer);
    const targetParentId = targetContainer?.id ?? null;
    const targetSlotKey = null;
    let nextSelectedIds: string[] = [];

    setSchema((current) => {
      const sourceView = current.views.find((view) => view.id === selectedView.id);
      const destinationView = current.views.find((view) => view.id === targetView.id);
      if (!sourceView || !destinationView) {
        return current;
      }

      const idMap = new Map<string, string>();
      const targetExistingNodes =
        mode === 'move' && sourceView.id === destinationView.id
          ? destinationView.nodes.filter((node) => !subtreeIds.has(node.id))
          : destinationView.nodes;
      const keySet = new Set(targetExistingNodes.map((node) => node.key));

      const transferredNodes = sourceNodes.map((node) => {
        const nextId = mode === 'copy' ? `system_node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : node.id;
        idMap.set(node.id, nextId);
        const nextKey = mode === 'copy' ? ensureUniqueIdentifier(node.key, keySet) || node.key : node.key;
        keySet.add(nextKey);
        return {
          ...cloneNodeForTransfer(node),
          id: nextId,
          key: nextKey,
          label: node.label
        };
      }).map((node) => ({
        ...node,
        parentId: node.parentId && subtreeIds.has(node.parentId) ? (idMap.get(node.parentId) ?? node.parentId) : node.parentId,
        tabs: node.tabs?.map((tab) => ({
          ...tab,
          id: mode === 'copy' ? `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : tab.id
        }))
      }));

      const transferredRootIds = rootIds.map((id) => idMap.get(id) ?? id);
      const roots = transferredNodes.filter((node) => transferredRootIds.includes(node.id));
      const minRootX = roots.length ? Math.min(...roots.map((node) => node.layout.x)) : 0;
      const minRootY = roots.length ? Math.min(...roots.map((node) => node.layout.y)) : 0;
      const baseY = nextYForScope(targetExistingNodes, targetParentId, targetSlotKey);

      const placedNodes = transferredNodes.map((node) => {
        if (!transferredRootIds.includes(node.id)) {
          return node;
        }
        return {
          ...node,
          parentId: targetParentId,
          slotKey: targetSlotKey,
          layout: clampLayout(
            {
              ...node.layout,
              x: Math.max(0, node.layout.x - minRootX),
              y: baseY + (node.layout.y - minRootY)
            },
            destinationView.gridColumns
          )
        };
      });

      nextSelectedIds = transferredRootIds;

      return {
        ...current,
        views: current.views.map((view) => {
          if (view.id === sourceView.id && view.id === destinationView.id) {
            const remaining = mode === 'move' ? view.nodes.filter((node) => !subtreeIds.has(node.id)) : view.nodes;
            return { ...view, nodes: [...remaining, ...placedNodes] };
          }
          if (view.id === sourceView.id) {
            return {
              ...view,
              nodes: mode === 'move' ? view.nodes.filter((node) => !subtreeIds.has(node.id)) : view.nodes
            };
          }
          if (view.id === destinationView.id) {
            return {
              ...view,
              nodes: [...view.nodes, ...placedNodes]
            };
          }
          return view;
        })
      };
    });

    setSelectedViewId(targetView.id);
    setScope({ parentId: targetParentId, slotKey: targetSlotKey });
    setSelectedNodeIds(nextSelectedIds);
    setSelectedNodeId(nextSelectedIds[0] ?? '');
    setErrorMessage(null);
    setStatusMessage(
      mode === 'copy'
        ? `${rootIds.length} élément${rootIds.length > 1 ? 's' : ''} copié${rootIds.length > 1 ? 's' : ''}.`
        : `${rootIds.length} élément${rootIds.length > 1 ? 's' : ''} déplacé${rootIds.length > 1 ? 's' : ''}.`
    );
  };

  const handleGroupSelection = () => {
    if (!canEdit || !selectedView) {
      return;
    }
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (ids.length < 2) {
      return;
    }
    const newGroupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    updateSelectedView((view) => ({
      ...view,
      nodes: view.nodes.map((node) => (ids.includes(node.id) ? { ...node, groupId: newGroupId } : node))
    }));
  };

  const handleUngroupSelection = () => {
    if (!canEdit || !selectedView) {
      return;
    }
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (ids.length === 0) {
      return;
    }
    updateSelectedView((view) => ({
      ...view,
      nodes: view.nodes.map((node) => (ids.includes(node.id) ? { ...node, groupId: undefined } : node))
    }));
  };

  const handleSelectGroup = () => {
    if (!selectedView || !selectedNode?.groupId) {
      return;
    }
    const ids = selectedView.nodes.filter((node) => node.groupId === selectedNode.groupId).map((node) => node.id);
    if (ids.length === 0) {
      return;
    }
    setSelectedNodeIds(ids);
    setSelectedNodeId(ids[0]);
  };

  const handleDepthSelection = (mode: DepthReorderMode) => {
    if (!canEdit || !selectedView) {
      return;
    }
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (ids.length === 0) {
      return;
    }
    updateSelectedView((view) => ({
      ...view,
      nodes: reorderDepthForSelection(view.nodes, ids, mode)
    }));
  };

  const handleAlignSelection = (mode: 'left' | 'right' | 'top' | 'bottom' | 'center_x' | 'center_y') => {
    if (!canEdit || !selectedView) {
      return;
    }
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (ids.length < 2) {
      return;
    }
    const nodes = selectedView.nodes.filter((node) => ids.includes(node.id));
    if (nodes.length < 2) {
      return;
    }
    const minX = Math.min(...nodes.map((node) => node.layout.x));
    const minY = Math.min(...nodes.map((node) => node.layout.y));
    const maxRight = Math.max(...nodes.map((node) => node.layout.x + node.layout.w));
    const maxBottom = Math.max(...nodes.map((node) => node.layout.y + node.layout.h));
    const centerX = (minX + maxRight) / 2;
    const centerY = (minY + maxBottom) / 2;
    updateSelectedView((view) => ({
      ...view,
      nodes: view.nodes.map((node) => {
        if (!ids.includes(node.id)) {
          return node;
        }
        let nextLayout = { ...node.layout };
        switch (mode) {
          case 'left':
            nextLayout = { ...nextLayout, x: minX };
            break;
          case 'right':
            nextLayout = { ...nextLayout, x: maxRight - node.layout.w };
            break;
          case 'top':
            nextLayout = { ...nextLayout, y: minY };
            break;
          case 'bottom':
            nextLayout = { ...nextLayout, y: maxBottom - node.layout.h };
            break;
          case 'center_x':
            nextLayout = { ...nextLayout, x: Math.round(centerX - node.layout.w / 2) };
            break;
          case 'center_y':
            nextLayout = { ...nextLayout, y: Math.round(centerY - node.layout.h / 2) };
            break;
          default:
            break;
        }
        return { ...node, layout: clampLayout(nextLayout, view.gridColumns) };
      })
    }));
  };

  const handleDistributeSelection = (mode: 'horizontal' | 'vertical') => {
    if (!canEdit || !selectedView) {
      return;
    }
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (ids.length < 3) {
      return;
    }
    const nodes = selectedView.nodes.filter((node) => ids.includes(node.id));
    if (nodes.length < 3) {
      return;
    }
    const sorted = [...nodes].sort((a, b) => (mode === 'horizontal' ? a.layout.x - b.layout.x : a.layout.y - b.layout.y));
    if (mode === 'horizontal') {
      const minX = Math.min(...sorted.map((node) => node.layout.x));
      const maxRight = Math.max(...sorted.map((node) => node.layout.x + node.layout.w));
      const totalWidth = sorted.reduce((acc, node) => acc + node.layout.w, 0);
      const gap = (maxRight - minX - totalWidth) / (sorted.length - 1);
      if (!Number.isFinite(gap)) {
        return;
      }
      let cursor = minX;
      const nextLayouts = new Map<string, SystemStudioNodeDefinition['layout']>();
      sorted.forEach((node) => {
        nextLayouts.set(node.id, { ...node.layout, x: Math.round(cursor) });
        cursor += node.layout.w + gap;
      });
      updateSelectedView((view) => ({
        ...view,
        nodes: view.nodes.map((node) => {
          const nextLayout = nextLayouts.get(node.id);
          return nextLayout ? { ...node, layout: clampLayout(nextLayout, view.gridColumns) } : node;
        })
      }));
    } else {
      const minY = Math.min(...sorted.map((node) => node.layout.y));
      const maxBottom = Math.max(...sorted.map((node) => node.layout.y + node.layout.h));
      const totalHeight = sorted.reduce((acc, node) => acc + node.layout.h, 0);
      const gap = (maxBottom - minY - totalHeight) / (sorted.length - 1);
      if (!Number.isFinite(gap)) {
        return;
      }
      let cursor = minY;
      const nextLayouts = new Map<string, SystemStudioNodeDefinition['layout']>();
      sorted.forEach((node) => {
        nextLayouts.set(node.id, { ...node.layout, y: Math.round(cursor) });
        cursor += node.layout.h + gap;
      });
      updateSelectedView((view) => ({
        ...view,
        nodes: view.nodes.map((node) => {
          const nextLayout = nextLayouts.get(node.id);
          return nextLayout ? { ...node, layout: clampLayout(nextLayout, view.gridColumns) } : node;
        })
      }));
    }
  };

  const handleEnterStructure = () => {
    if (!selectedNode) {
      return;
    }
    if (selectedNode.type === 'container') {
      setScope({ parentId: selectedNode.id, slotKey: null });
    }
  };

  const handleAddTabView = () => {
    if (!canEdit || selectedNode?.type !== 'tabs' || !tabViewToAdd) {
      return;
    }
    const targetView = schema.views.find((view) => view.id === tabViewToAdd);
    if (!targetView) {
      return;
    }
    updateSelectedNode((node) => ({
      ...node,
      tabs: [
        ...(node.tabs ?? []),
        {
          id: `${node.id}-tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label: targetView.name,
          viewId: targetView.id,
          visibleIf: ''
        }
      ]
    }));
  };

  const handleRemoveTabView = (tabId: string) => {
    if (!canEdit || selectedNode?.type !== 'tabs') {
      return;
    }
    updateSelectedNode((node) => ({
      ...node,
      tabs: (node.tabs ?? []).filter((tab) => tab.id !== tabId)
    }));
  };

  const handleSave = async () => {
    if (!canEdit || !system) {
      return false;
    }
    return saveDraft('manual');
  };

  const saveStatusLabel = isSaving ? 'Enregistrement en cours…' : hasUnsavedChanges ? 'Modifications en attente d’enregistrement.' : 'Studio synchronisé.';
  const saveStatusColor = hasUnsavedChanges ? '#b54708' : '#067647';

  const closeCharacterCreationManager = async () => {
    if (hasUnsavedChanges && canEdit && !isSaving) {
      const saved = await handleSave();
      if (!saved) {
        return;
      }
    }
    characterCreationManagerWindowRef.current = null;
    setIsCharacterCreationManagerOpen(false);
  };

  const currentScopeLabel = makeScopeLabel(selectedView, scope);
  const canPublish = canPublishSystemV2(schema);
  const renderSystemPropertiesEditor = () => (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>Nom</span>
        <input
          value={system.name}
          onChange={(event) =>
            setSystem((current) => {
              if (!current) {
                return current;
              }
              return { ...current, name: event.target.value };
            })
          }
          disabled={!canEdit}
        />
      </label>
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>Description</span>
        <textarea
          value={system.description ?? ''}
          onChange={(event) =>
            setSystem((current) => {
              if (!current) {
                return current;
              }
              return { ...current, description: event.target.value };
            })
          }
          disabled={!canEdit}
          rows={4}
        />
      </label>
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <strong>Thème système</strong>
        <small>Valeurs par défaut appliquées si la vue puis l’élément ne définissent rien.</small>
      </div>
      {renderThemeEditor(system.studioTheme, updateSystemTheme, !canEdit)}
    </div>
  );
  const handleCatalogsChange = (catalogs: SystemCatalogDefinition[]) => {
    setSystem((current) => {
      if (!current) {
        return current;
      }
      const nextSystem = { ...current, catalogs };
      systemDraftRef.current = nextSystem;
      return nextSystem;
    });
  };
  const handleDiscordConfigChange = (discordConfig: NonNullable<GameSystem['discordConfig']>) => {
    setSystem((current) => {
      if (!current) {
        return current;
      }
      const nextSystem = { ...current, discordConfig };
      systemDraftRef.current = nextSystem;
      return nextSystem;
    });
  };
  const handleCharacterCreationConfigChange = (
    characterCreationConfig: CharacterCreationConfigV2 | ((current: CharacterCreationConfigV2) => CharacterCreationConfigV2)
  ) => {
    setSystem((current) => {
      if (!current) {
        return current;
      }
      const nextCharacterCreationConfig =
        typeof characterCreationConfig === 'function'
          ? characterCreationConfig(normalizeCharacterCreationConfigV2(current.characterCreationConfig))
          : characterCreationConfig;
      const nextSystem = { ...current, characterCreationConfig: nextCharacterCreationConfig };
      systemDraftRef.current = nextSystem;
      return nextSystem;
    });
  };
  const renderViewPropertiesEditor = () =>
    selectedView ? (
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Nom</span>
          <input value={selectedView.name} onChange={(event) => handleRenameSelectedView(event.target.value)} disabled={!canEdit} />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Reference</span>
          <input value={selectedView.reference} onChange={(event) => updateSelectedView((view) => ({ ...view, reference: event.target.value }))} disabled={!canEdit} />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Grille</span>
          <select value={selectedView.gridColumns} onChange={(event) => updateSelectedView((view) => ({ ...view, gridColumns: Number(event.target.value) as 12 | 24 | 36 | 48 }))} disabled={!canEdit}>
            <option value={12}>12</option>
            <option value={24}>24</option>
            <option value={36}>36</option>
            <option value={48}>48</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Vue fiche personnage</span>
          <select value={String(Boolean(selectedView.isCharacterSheet))} onChange={(event) => updateSelectedView((view) => ({ ...view, isCharacterSheet: event.target.value === 'true' }))} disabled={!canEdit}>
            <option value="false">Non</option>
            <option value="true">Oui</option>
          </select>
        </label>
        {selectedView.isCharacterSheet ? (
          <>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Type de fiche</span>
              <select value={selectedView.characterSheetKind ?? 'pc'} onChange={(event) => updateSelectedView((view) => ({ ...view, characterSheetKind: event.target.value as CharacterSheetKind }))} disabled={!canEdit}>
                <option value="pc">PJ</option>
                <option value="npc">PNJ</option>
                <option value="creature">Créature</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Nom de fiche généré</span>
              <input value={selectedView.defaultSheetNameTemplate ?? ''} onChange={(event) => updateSelectedView((view) => ({ ...view, defaultSheetNameTemplate: event.target.value }))} disabled={!canEdit} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Initiative</span>
              <select value={selectedView.initiativeMode ?? 'combat_once'} onChange={(event) => updateSelectedView((view) => ({ ...view, initiativeMode: event.target.value as CharacterInitiativeMode }))} disabled={!canEdit}>
                <option value="combat_once">Calcul en début de combat</option>
                <option value="round_recalc">Recalcul à chaque round</option>
                <option value="gm_fixed">Valeur saisie par le MJ</option>
                <option value="manual_turn">Tour par désignation</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Formule initiative</span>
              <input value={selectedView.initiativeFormula ?? ''} onChange={(event) => updateSelectedView((view) => ({ ...view, initiativeFormula: event.target.value }))} disabled={!canEdit} />
              {renderFormulaComposerButton(
                'Compositeur - Formule initiative',
                'math',
                selectedView.initiativeFormula,
                (nextValue) => updateSelectedView((view) => ({ ...view, initiativeFormula: nextValue })),
                'Formule initiative',
                'Décris ici le calcul de l initiative. Utilise les variables de la vue et garde les seuils dans la formule, pas dans le code.'
              )}
            </label>
          </>
        ) : null}
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.25rem' }}>
          <strong>Thème vue</strong>
          <small>Ces valeurs surchargent le thème système pour tous les éléments de la vue qui n’ont pas de style local.</small>
        </div>
        {renderThemeEditor(selectedView.theme, updateSelectedViewTheme, !canEdit)}
      </div>
    ) : null;
  const renderLeftPanel = (isDetached = false) => (
    <>
      <div className="studio-panel__toolbar">
        <div>
          <h2 style={{ marginTop: 0, marginBottom: '0.2rem' }}>Palette</h2>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Choisis une vue, un scope de travail, puis place les éléments sur la grille.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setDetachedPanels((current) => ({ ...current, left: !current.left }))}>
          {isDetached ? 'Reintegrer' : 'Detacher'}
        </Button>
      </div>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
          <strong>Scope courant</strong>
          <div style={{ marginTop: '0.35rem' }}>{currentScopeLabel}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <Button type="button" variant="secondary" onClick={() => setScope({ parentId: null, slotKey: null })} disabled={!scope.parentId}>Racine</Button>
            <Button type="button" variant="secondary" onClick={handleEnterStructure} disabled={!selectedNode || selectedNode.type !== 'container'}>Entrer</Button>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.75rem' }}>
        {PALETTE_GROUPS.map((group) => (
          <div key={group.id} className="screen-studio-fields-block">
            <h3>{group.title}</h3>
            <div className="screen-studio-fields-block__content screen-studio-fields-block__content--system-palette">
              {group.items.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className="screen-widget-palette-item screen-widget-palette-item--system-compact"
                  onClick={() => handleAddNode(item.type)}
                  disabled={!canEdit}
                  title={item.description}
                  aria-label={`${item.title} - ${item.description}`}
                >
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
  const renderRightPanel = (isDetached = false) => (
    <>
          <div className="studio-panel__toolbar">
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Propriétés</h2>
        <Button type="button" variant="secondary" onClick={() => setDetachedPanels((current) => ({ ...current, right: !current.right }))}>
          {isDetached ? 'Reintegrer' : 'Detacher'}
        </Button>
      </div>
          {selectedView ? (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <PropertySection title="Sélection" sectionKey={`selection-${selectedView.id}`}>
                <p style={{ margin: 0 }}>Éléments sélectionnés : <strong>{selectedNodeIds.length || (selectedNode ? 1 : 0)}</strong></p>
                <small>Ctrl/Cmd pour multi-sélection, Shift pour ajouter.</small>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                  <Button type="button" variant="secondary" onClick={handleDuplicateSelection} disabled={!canEdit || (!selectedNode && selectedNodeIds.length === 0)}>
                    Dupliquer la sélection
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleGroupSelection} disabled={!canEdit || selectedNodeIds.length < 2}>
                    Grouper
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleUngroupSelection} disabled={!canEdit || selectedNodeIds.length === 0}>
                    Dégrouper
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleSelectGroup} disabled={!selectedNode?.groupId}>
                    Sélectionner le groupe
                  </Button>
                </div>
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.8rem' }}>
                  <strong>Profondeur</strong>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button type="button" variant="secondary" onClick={() => handleDepthSelection('step_forward')} disabled={!canEdit || (!selectedNode && selectedNodeIds.length === 0)}>
                      Avancer
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => handleDepthSelection('step_backward')} disabled={!canEdit || (!selectedNode && selectedNodeIds.length === 0)}>
                      Reculer
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => handleDepthSelection('bring_front')} disabled={!canEdit || (!selectedNode && selectedNodeIds.length === 0)}>
                      Premier plan
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => handleDepthSelection('send_back')} disabled={!canEdit || (!selectedNode && selectedNodeIds.length === 0)}>
                      Arrière-plan
                    </Button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.8rem' }}>
                  <strong>Modifier plusieurs blocs</strong>
                  <div className="grid">
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Largeur bloc</span>
                      <input type="number" min={1} step={0.5} value={batchWidth} placeholder="Valeurs mixtes" onChange={(event) => setBatchWidth(event.target.value)} disabled={!canEdit || selectedNodes.length === 0} />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Hauteur bloc</span>
                      <input type="number" min={1} step={0.5} value={batchHeight} placeholder="Valeurs mixtes" onChange={(event) => setBatchHeight(event.target.value)} disabled={!canEdit || selectedNodes.length === 0} />
                    </label>
                  </div>
                  <Button type="button" variant="secondary" onClick={applyBatchDimensions} disabled={!canEdit || selectedNodes.length === 0}>
                    Appliquer dimensions
                  </Button>
                  <div className="grid">
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Disposition texte / champ</span>
                      <select value={batchFieldLayout} onChange={(event) => setBatchFieldLayout(event.target.value as 'ligne' | 'colonne' | 'texte_cache' | '')} disabled={!canEdit || selectedEditableNodes.length === 0}>
                        <option value="">Valeurs mixtes</option>
                        <option value="colonne">Colonne</option>
                        <option value="ligne">Ligne</option>
                        <option value="texte_cache">Texte caché</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>{fieldSpanLabelsForNodes(selectedEditableNodes).label}</span>
                      <input type="number" min={1} step={1} value={batchFieldLabelSpan} placeholder="Valeurs mixtes" onChange={(event) => setBatchFieldLabelSpan(event.target.value)} disabled={!canEdit || selectedEditableNodes.length === 0} />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>{fieldSpanLabelsForNodes(selectedEditableNodes).input}</span>
                      <input type="number" min={1} step={1} value={batchFieldInputSpan} placeholder="Valeurs mixtes" onChange={(event) => setBatchFieldInputSpan(event.target.value)} disabled={!canEdit || selectedEditableNodes.length === 0} />
                    </label>
                  </div>
                  <Button type="button" variant="secondary" onClick={applyBatchFieldLayout} disabled={!canEdit || selectedEditableNodes.length === 0}>
                    Appliquer texte / champ
                  </Button>
                </div>
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.8rem' }}>
                  <strong>Copier / déplacer</strong>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>Vue cible</span>
                    <select value={transferTargetViewId} onChange={(event) => setTransferTargetViewId(event.target.value)} disabled={!canEdit}>
                      {schema.views.map((view) => (
                        <option key={view.id} value={view.id}>{view.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>Conteneur cible</span>
                    <select value={transferTargetContainerId} onChange={(event) => setTransferTargetContainerId(event.target.value)} disabled={!canEdit}>
                      <option value="">Racine</option>
                      {transferTargetContainers.map((container) => (
                        <option key={container.id} value={container.id}>{container.label}</option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button type="button" variant="secondary" onClick={() => handleTransferSelection('copy')} disabled={!canEdit || (!selectedNode && selectedNodeIds.length === 0)}>
                      Copier vers la cible
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => handleTransferSelection('move')} disabled={!canEdit || (!selectedNode && selectedNodeIds.length === 0)}>
                      Déplacer vers la cible
                    </Button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <strong>Aligner</strong>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button type="button" variant="secondary" onClick={() => handleAlignSelection('left')} disabled={!canEdit || selectedNodeIds.length < 2}>Gauche</Button>
                    <Button type="button" variant="secondary" onClick={() => handleAlignSelection('center_x')} disabled={!canEdit || selectedNodeIds.length < 2}>Centre X</Button>
                    <Button type="button" variant="secondary" onClick={() => handleAlignSelection('right')} disabled={!canEdit || selectedNodeIds.length < 2}>Droite</Button>
                    <Button type="button" variant="secondary" onClick={() => handleAlignSelection('top')} disabled={!canEdit || selectedNodeIds.length < 2}>Haut</Button>
                    <Button type="button" variant="secondary" onClick={() => handleAlignSelection('center_y')} disabled={!canEdit || selectedNodeIds.length < 2}>Centre Y</Button>
                    <Button type="button" variant="secondary" onClick={() => handleAlignSelection('bottom')} disabled={!canEdit || selectedNodeIds.length < 2}>Bas</Button>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <strong>Distribuer</strong>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button type="button" variant="secondary" onClick={() => handleDistributeSelection('horizontal')} disabled={!canEdit || selectedNodeIds.length < 3}>Horizontal</Button>
                    <Button type="button" variant="secondary" onClick={() => handleDistributeSelection('vertical')} disabled={!canEdit || selectedNodeIds.length < 3}>Vertical</Button>
                  </div>
                </div>
              </PropertySection>

              {selectedNode ? (
                <>
                  <PropertySection title="Élément" defaultOpen sectionKey={`element-${selectedNode.id}`}>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Libellé</span>
                      <input
                        value={selectedNode.label}
                        onChange={(event) => {
                          if (!selectedView) {
                            return;
                          }
                          const existingKeys = new Set(
                            selectedView.nodes
                              .filter((node) => node.id !== selectedNode.id)
                              .map((node) => node.key)
                          );
                          const nextLabel = event.target.value;
                          updateSelectedNode((node) => {
                            const nextNode: SystemStudioNodeDefinition = {
                              ...node,
                              label: nextLabel
                            };
                            if (shouldSyncKeyWithLabel(node.key, node.label, existingKeys)) {
                              nextNode.key = deriveUniqueKeyFromLabel(nextLabel, existingKeys);
                            }
                            return nextNode;
                          });
                        }}
                        disabled={!canEdit}
                      />
                      {validation.labelErrors.get(selectedNode.id) ? <small style={{ color: '#fca5a5' }}>{validation.labelErrors.get(selectedNode.id)}</small> : null}
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Clé</span>
                      <input
                        value={selectedNode.key}
                        onChange={(event) => {
                          if (!selectedView) {
                            return;
                          }
                          const existingKeys = new Set(
                            selectedView.nodes
                              .filter((node) => node.id !== selectedNode.id)
                              .map((node) => node.key)
                          );
                          const nextKey = ensureUniqueIdentifier(event.target.value, existingKeys);
                          updateSelectedNode((node) => ({ ...node, key: nextKey || '' }));
                        }}
                        disabled={!canEdit}
                      />
                      {validation.keyErrors.get(selectedNode.id) ? <small style={{ color: '#fca5a5' }}>{validation.keyErrors.get(selectedNode.id)}</small> : null}
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>{selectedNode.type === 'progress' ? 'Valeur courante' : 'Valeur par défaut'}</span>
                      <input
                        value={String(selectedNode.defaultValue ?? '')}
                        onChange={(event) =>
                          updateSelectedNode((node) => ({
                            ...node,
                            defaultValue:
                              node.type === 'number'
                                ? (event.target.value === '' ? '' : Number(event.target.value))
                                : node.type === 'checkbox'
                                ? event.target.value === 'true'
                                : event.target.value
                          }))
                        }
                        disabled={!canEdit}
                      />
                      {selectedNode.type === 'progress'
                        ? renderFormulaComposerButton(
                            'Compositeur - Valeur courante',
                            'math',
                            typeof selectedNode.defaultValue === 'string' ? selectedNode.defaultValue : String(selectedNode.defaultValue ?? ''),
                            (nextValue) =>
                              updateSelectedNode((node) => ({
                                ...node,
                                defaultValue: nextValue
                              })),
                            'Valeur courante',
                            'Indique ici la valeur actuelle de la jauge. Tu peux mettre une variable simple comme @pv_restant ou une formule.'
                          )
                        : null}
                    </label>
                    {selectedNode.type === 'progress' ? (
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Valeur Max</span>
                        <input value={selectedNode.gaugeMaxFormula ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, gaugeMaxFormula: event.target.value }))} disabled={!canEdit} />
                        {renderFormulaComposerButton(
                          'Compositeur - Valeur Max',
                          'math',
                          selectedNode.gaugeMaxFormula,
                          (nextValue) => updateSelectedNode((node) => ({ ...node, gaugeMaxFormula: nextValue })),
                          'Valeur Max',
                          'Indique ici la valeur maximale de la jauge. Tu peux mettre une variable simple comme @pm_max ou une formule.'
                        )}
                      </label>
                    ) : null}
                    {supportsPlaceholder(selectedNode) ? (
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Placeholder</span>
                        <input value={selectedNode.placeholder ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, placeholder: event.target.value }))} disabled={!canEdit} />
                      </label>
                    ) : null}
                    {supportsReference(selectedNode) ? (
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Reference / URL</span>
                        <input value={selectedNode.reference ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, reference: event.target.value }))} disabled={!canEdit} />
                      </label>
                    ) : null}
                    {supportsFormulaField(selectedNode) ? (
                      <>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Formule</span>
                          <input value={selectedNode.formula ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, formula: event.target.value }))} disabled={!canEdit} />
                          {renderFormulaComposerButton(
                            'Compositeur - Formule',
                            'math',
                            selectedNode.formula,
                            (nextValue) => updateSelectedNode((node) => ({ ...node, formula: nextValue })),
                            'Formule',
                            'Calcule ici une valeur numérique à partir des variables de la fiche. Le résultat sert au rendu ou au calcul du champ.'
                          )}
                        </label>
                      </>
                    ) : null}
                  </PropertySection>

                  <PropertySection title="Comportement" sectionKey={`behavior-${selectedNode.id}`}>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Afficher si</span>
                      <input value={selectedNode.showIf ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, showIf: event.target.value }))} disabled={!canEdit} />
                      {renderFormulaComposerButton(
                        'Compositeur - Afficher si',
                        'condition',
                        selectedNode.showIf,
                        (nextValue) => updateSelectedNode((node) => ({ ...node, showIf: nextValue })),
                        'Afficher si',
                        'La condition doit renvoyer vrai ou faux. Si elle est vraie, le bloc reste visible ; sinon il est masqué.'
                      )}
                    </label>
                    {supportsEditableCondition(selectedNode) ? (
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Editable si</span>
                        <input value={selectedNode.editableIf ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, editableIf: event.target.value }))} disabled={!canEdit} />
                        {renderFormulaComposerButton(
                          'Compositeur - Editable si',
                          'condition',
                          selectedNode.editableIf,
                          (nextValue) => updateSelectedNode((node) => ({ ...node, editableIf: nextValue })),
                          'Editable si',
                          'La condition contrôle si le champ reste modifiable. Vrai = éditable, faux = lecture seule.'
                        )}
                      </label>
                    ) : null}
                    {isEditableNode(selectedNode) ? (
                      <>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Disposition texte / champ</span>
                          <select
                            value={selectedNode.fieldLayout ?? 'colonne'}
                            onChange={(event) =>
                              updateSelectedNode((node) => ({
                                ...node,
                                ...normalizeFieldSplitForNode({
                                  ...node,
                                  fieldLayout: event.target.value as 'ligne' | 'colonne' | 'texte_cache'
                                })
                              }))
                            }
                            disabled={!canEdit}
                          >
                            <option value="colonne">Colonne</option>
                            <option value="ligne">Ligne</option>
                            <option value="texte_cache">Texte caché</option>
                          </select>
                        </label>
                        <div className="grid">
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>{fieldSpanLabelsForNode(selectedNode).label}</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={String(selectedNode.fieldLabelSpan ?? Math.max(1, Math.round(selectedNode.layout.w * 0.6)))}
                              onChange={(event) =>
                                updateSelectedNode((node) => ({
                                  ...node,
                                  ...normalizeFieldSplitForNode({
                                    ...node,
                                    fieldLabelSpan: Math.max(1, Number(event.target.value) || 1)
                                  })
                                }))
                              }
                              disabled={!canEdit}
                            />
                          </label>
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>{fieldSpanLabelsForNode(selectedNode).input}</span>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={String(selectedNode.fieldInputSpan ?? Math.max(1, selectedNode.layout.w - Math.max(1, Math.round(selectedNode.layout.w * 0.6))))}
                              onChange={(event) =>
                                updateSelectedNode((node) => ({
                                  ...node,
                                  ...normalizeFieldSplitForNode({
                                    ...node,
                                    fieldInputSpan: Math.max(1, Number(event.target.value) || 1)
                                  })
                                }))
                              }
                              disabled={!canEdit}
                            />
                          </label>
                        </div>
                      </>
                    ) : null}
                    {supportsValidation(selectedNode) ? (
                      <>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Champ requis</span>
                          <select value={String(Boolean(selectedNode.required))} onChange={(event) => updateSelectedNode((node) => ({ ...node, required: event.target.value === 'true' }))} disabled={!canEdit}>
                            <option value="false">Non</option>
                            <option value="true">Oui</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Regex validation</span>
                          <input value={selectedNode.validationPattern ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, validationPattern: event.target.value }))} disabled={!canEdit} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Message validation</span>
                          <input value={selectedNode.validationMessage ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, validationMessage: event.target.value }))} disabled={!canEdit} />
                        </label>
                      </>
                    ) : null}
                  </PropertySection>

                  <PropertySection title="Placement" sectionKey={`layout-${selectedNode.id}`}>
                    <div className="grid">
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>X</span>
                        <input type="number" value={selectedNode.layout.x} onChange={(event) => updateSelectedNode((node) => ({ ...node, layout: clampLayout({ ...node.layout, x: Number(event.target.value) || 0 }, selectedView.gridColumns) }))} disabled={!canEdit} />
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Y</span>
                        <input type="number" value={selectedNode.layout.y} onChange={(event) => updateSelectedNode((node) => ({ ...node, layout: clampLayout({ ...node.layout, y: Number(event.target.value) || 0 }, selectedView.gridColumns) }))} disabled={!canEdit} />
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Largeur</span>
                        <input
                          type="number"
                          value={selectedNode.layout.w}
                          onChange={(event) =>
                            updateSelectedNode((node) => {
                              const updatedNode = {
                                ...node,
                                layout: clampLayout({ ...node.layout, w: Number(event.target.value) || node.layout.w }, selectedView.gridColumns)
                              };
                              return isEditableNode(updatedNode)
                                ? {
                                    ...updatedNode,
                                    ...normalizeFieldSplitForNode(updatedNode)
                                  }
                                : updatedNode;
                            })
                          }
                          disabled={!canEdit}
                        />
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Hauteur</span>
                        <input type="number" value={selectedNode.layout.h} onChange={(event) => updateSelectedNode((node) => ({ ...node, layout: clampLayout({ ...node.layout, h: Number(event.target.value) || node.layout.h }, selectedView.gridColumns) }))} disabled={!canEdit} />
                      </label>
                    </div>
                  </PropertySection>

                  <PropertySection title="Style" sectionKey={`style-${selectedNode.id}`}>
                    <div className="grid">
                      {renderInheritanceField(
                        'Fond',
                        <input value={selectedNode.backgroundColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, backgroundColor: event.target.value }))} disabled={!canEdit} />
                        ,
                        () => updateSelectedNode((node) => ({ ...node, backgroundColor: undefined })),
                        !canEdit,
                        !selectedNode.backgroundColor
                      )}
                      {supportsFieldStyle(selectedNode)
                        ? renderInheritanceField(
                            'Fond champ',
                            <input value={selectedNode.inputBackgroundColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, inputBackgroundColor: event.target.value }))} disabled={!canEdit} />
                            ,
                            () => updateSelectedNode((node) => ({ ...node, inputBackgroundColor: undefined })),
                            !canEdit,
                            !selectedNode.inputBackgroundColor
                          )
                        : null}
                      {supportsFieldStyle(selectedNode)
                        ? renderInheritanceField(
                            'Texte champ',
                            <input value={selectedNode.inputTextColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, inputTextColor: event.target.value }))} disabled={!canEdit} />
                            ,
                            () => updateSelectedNode((node) => ({ ...node, inputTextColor: undefined })),
                            !canEdit,
                            !selectedNode.inputTextColor
                          )
                        : null}
                      {supportsFieldStyle(selectedNode)
                        ? renderInheritanceField(
                            'Bordure champ',
                            <input value={selectedNode.inputBorderColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, inputBorderColor: event.target.value }))} disabled={!canEdit} />
                            ,
                            () => updateSelectedNode((node) => ({ ...node, inputBorderColor: undefined })),
                            !canEdit,
                            !selectedNode.inputBorderColor
                          )
                        : null}
                      {renderInheritanceField(
                        'Bordure',
                        <input value={selectedNode.borderColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, borderColor: event.target.value }))} disabled={!canEdit} />
                        ,
                        () => updateSelectedNode((node) => ({ ...node, borderColor: undefined })),
                        !canEdit,
                        !selectedNode.borderColor
                      )}
                      {renderInheritanceField(
                        'Texte',
                        <input value={selectedNode.textColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, textColor: event.target.value }))} disabled={!canEdit} />
                        ,
                        () => updateSelectedNode((node) => ({ ...node, textColor: undefined })),
                        !canEdit,
                        !selectedNode.textColor
                      )}
                      {isEditableNode(selectedNode) ? (
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Style du libellé</span>
                          <select
                            value={selectedNode.fieldLabelStyleMode ?? 'commun'}
                            onChange={(event) => updateSelectedNode((node) => ({ ...node, fieldLabelStyleMode: event.target.value as SystemStudioNodeDefinition['fieldLabelStyleMode'] }))}
                            disabled={!canEdit}
                          >
                            <option value="commun">Commun avec le champ</option>
                            <option value="separe">Séparé</option>
                          </select>
                        </label>
                      ) : null}
                      {isEditableNode(selectedNode) && (selectedNode.fieldLabelStyleMode ?? 'commun') === 'separe'
                        ? renderInheritanceField(
                            'Texte libellé',
                            <input value={selectedNode.fieldLabelTextColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, fieldLabelTextColor: event.target.value }))} disabled={!canEdit} />
                            ,
                            () => updateSelectedNode((node) => ({ ...node, fieldLabelTextColor: undefined })),
                            !canEdit,
                            !selectedNode.fieldLabelTextColor
                          )
                        : null}
                      {renderInheritanceField(
                        'Image de fond',
                        <input value={selectedNode.backgroundImage ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, backgroundImage: event.target.value }))} disabled={!canEdit} />
                        ,
                        () => updateSelectedNode((node) => ({ ...node, backgroundImage: undefined })),
                        !canEdit,
                        !selectedNode.backgroundImage
                      )}
                      {renderInheritanceField(
                        'Opacité fond',
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={selectedNode.backgroundOpacity ?? ''}
                          onChange={(event) =>
                            updateSelectedNode((node) => ({
                              ...node,
                              backgroundOpacity: event.target.value === '' ? null : Math.max(0, Math.min(1, Number(event.target.value) || 0))
                            }))
                          }
                          disabled={!canEdit}
                        />
                        ,
                        () => updateSelectedNode((node) => ({ ...node, backgroundOpacity: null })),
                        !canEdit,
                        typeof selectedNode.backgroundOpacity !== 'number'
                      )}
                      {renderInheritanceField(
                        'Taille image',
                        <select
                          value={selectedNode.backgroundSize ?? 'couvrir'}
                          onChange={(event) => updateSelectedNode((node) => ({ ...node, backgroundSize: event.target.value as StudioBackgroundSize }))}
                          disabled={!canEdit}
                        >
                          {THEME_BACKGROUND_SIZES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        ,
                        () => updateSelectedNode((node) => ({ ...node, backgroundSize: undefined })),
                        !canEdit,
                        !selectedNode.backgroundSize
                      )}
                      {renderInheritanceField(
                        'Position image',
                        <select
                          value={selectedNode.backgroundPosition ?? 'centre'}
                          onChange={(event) => updateSelectedNode((node) => ({ ...node, backgroundPosition: event.target.value as StudioBackgroundPosition }))}
                          disabled={!canEdit}
                        >
                          {THEME_BACKGROUND_POSITIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        ,
                        () => updateSelectedNode((node) => ({ ...node, backgroundPosition: undefined })),
                        !canEdit,
                        !selectedNode.backgroundPosition
                      )}
                      {renderInheritanceField(
                        'Répétition image',
                        <select
                          value={selectedNode.backgroundRepeat ?? 'aucune'}
                          onChange={(event) => updateSelectedNode((node) => ({ ...node, backgroundRepeat: event.target.value as StudioBackgroundRepeat }))}
                          disabled={!canEdit}
                        >
                          {THEME_BACKGROUND_REPEATS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        ,
                        () => updateSelectedNode((node) => ({ ...node, backgroundRepeat: undefined })),
                        !canEdit,
                        !selectedNode.backgroundRepeat
                      )}
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Masquer bordure</span>
                        <select value={String(Boolean(selectedNode.hideBorder))} onChange={(event) => updateSelectedNode((node) => ({ ...node, hideBorder: event.target.value === 'true' }))} disabled={!canEdit}>
                          <option value="false">Non</option>
                          <option value="true">Oui</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Style bordure</span>
                        <select value={selectedNode.borderStyle ?? 'solide'} onChange={(event) => updateSelectedNode((node) => ({ ...node, borderStyle: event.target.value as SystemStudioNodeDefinition['borderStyle'] }))} disabled={!canEdit}>
                          <option value="solide">Solide</option>
                          <option value="pointille">Pointille</option>
                          <option value="tiret">Tiret</option>
                          <option value="double">Double</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Alignement horizontal</span>
                        <select value={selectedNode.horizontalAlign ?? 'gauche'} onChange={(event) => updateSelectedNode((node) => ({ ...node, horizontalAlign: event.target.value as SystemStudioNodeDefinition['horizontalAlign'] }))} disabled={!canEdit}>
                          <option value="gauche">Gauche</option>
                          <option value="centre">Centre</option>
                          <option value="droite">Droite</option>
                          <option value="etirer">Etirer</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Alignement vertical</span>
                        <select value={selectedNode.verticalAlign ?? 'haut'} onChange={(event) => updateSelectedNode((node) => ({ ...node, verticalAlign: event.target.value as SystemStudioNodeDefinition['verticalAlign'] }))} disabled={!canEdit}>
                          <option value="haut">Haut</option>
                          <option value="centre">Centre</option>
                          <option value="bas">Bas</option>
                          <option value="etirer">Etirer</option>
                        </select>
                      </label>
                    </div>
                  </PropertySection>

                  {supportsTypographySection(selectedNode) ? (
                    <PropertySection title="Typographie" sectionKey={`typography-${selectedNode.id}`}>
                      <div className="grid">
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Famille</span>
                          <select value={selectedNode.typographyFamily ?? 'par_defaut'} onChange={(event) => updateSelectedNode((node) => ({ ...node, typographyFamily: event.target.value as SystemStudioNodeDefinition['typographyFamily'] }))} disabled={!canEdit}>
                            <option value="par_defaut">Par défaut</option>
                            <option value="serif">Serif</option>
                            <option value="sans-serif">Sans-serif</option>
                            <option value="monospace">Monospace</option>
                            <option value="fantaisie">Fantaisie</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Taille</span>
                          <select value={selectedNode.typographySize ?? 'md'} onChange={(event) => updateSelectedNode((node) => ({ ...node, typographySize: event.target.value as SystemStudioNodeDefinition['typographySize'] }))} disabled={!canEdit}>
                            <option value="xs">XS</option>
                            <option value="sm">SM</option>
                            <option value="md">MD</option>
                            <option value="lg">LG</option>
                            <option value="xl">XL</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Gras</span>
                          <select value={String(Boolean(selectedNode.typographyBold))} onChange={(event) => updateSelectedNode((node) => ({ ...node, typographyBold: event.target.value === 'true' }))} disabled={!canEdit}>
                            <option value="false">Non</option>
                            <option value="true">Oui</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Italique</span>
                          <select value={String(Boolean(selectedNode.typographyItalic))} onChange={(event) => updateSelectedNode((node) => ({ ...node, typographyItalic: event.target.value === 'true' }))} disabled={!canEdit}>
                            <option value="false">Non</option>
                            <option value="true">Oui</option>
                          </select>
                        </label>
                        {isEditableNode(selectedNode) && (selectedNode.fieldLabelStyleMode ?? 'commun') === 'separe' ? (
                          <>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Famille libellé</span>
                              <select value={selectedNode.fieldLabelTypographyFamily ?? 'par_defaut'} onChange={(event) => updateSelectedNode((node) => ({ ...node, fieldLabelTypographyFamily: event.target.value as SystemStudioNodeDefinition['fieldLabelTypographyFamily'] }))} disabled={!canEdit}>
                                <option value="par_defaut">Par défaut</option>
                                <option value="serif">Serif</option>
                                <option value="sans-serif">Sans-serif</option>
                                <option value="monospace">Monospace</option>
                                <option value="fantaisie">Fantaisie</option>
                              </select>
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Taille libellé</span>
                              <select value={selectedNode.fieldLabelTypographySize ?? 'md'} onChange={(event) => updateSelectedNode((node) => ({ ...node, fieldLabelTypographySize: event.target.value as SystemStudioNodeDefinition['fieldLabelTypographySize'] }))} disabled={!canEdit}>
                                <option value="xs">XS</option>
                                <option value="sm">SM</option>
                                <option value="md">MD</option>
                                <option value="lg">LG</option>
                                <option value="xl">XL</option>
                              </select>
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Gras libellé</span>
                              <select value={String(Boolean(selectedNode.fieldLabelTypographyBold))} onChange={(event) => updateSelectedNode((node) => ({ ...node, fieldLabelTypographyBold: event.target.value === 'true' }))} disabled={!canEdit}>
                                <option value="false">Non</option>
                                <option value="true">Oui</option>
                              </select>
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Italique libellé</span>
                              <select value={String(Boolean(selectedNode.fieldLabelTypographyItalic))} onChange={(event) => updateSelectedNode((node) => ({ ...node, fieldLabelTypographyItalic: event.target.value === 'true' }))} disabled={!canEdit}>
                                <option value="false">Non</option>
                                <option value="true">Oui</option>
                              </select>
                            </label>
                          </>
                        ) : null}
                      </div>
                    </PropertySection>
                  ) : null}

                  {selectedNode.type === 'container' ? (
                    <PropertySection title="Conteneur" sectionKey={`container-${selectedNode.id}`}>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Bandeau titre</span>
                        <select value={String(selectedNode.showTitle !== false)} onChange={(event) => updateSelectedNode((node) => ({ ...node, showTitle: event.target.value === 'true' }))} disabled={!canEdit}>
                          <option value="true">Afficher</option>
                          <option value="false">Masquer</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Cadre</span>
                        <select value={String(selectedNode.showBorder !== false)} onChange={(event) => updateSelectedNode((node) => ({ ...node, showBorder: event.target.value === 'true' }))} disabled={!canEdit}>
                          <option value="true">Afficher</option>
                          <option value="false">Masquer</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Mode répétition</span>
                        <select value={selectedNode.repeat?.mode ?? 'none'} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { source: '', manualItemsText: '' }), mode: event.target.value as SystemStudioRepeatMode } }))} disabled={!canEdit}>
                          <option value="none">Aucune</option>
                          <option value="binding">Variable tableau</option>
                          <option value="fields">Champs d'une vue</option>
                          <option value="manual">Tableau manuel</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>{selectedNode.repeat?.mode === 'fields' ? 'Vue source (référence ou nom, vide = vue courante)' : 'Source répétition'}</span>
                        <input value={selectedNode.repeat?.source ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', manualItemsText: '' }), source: event.target.value } }))} disabled={!canEdit} />
                      </label>
                      {selectedNode.repeat?.mode === 'fields' ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span>{parseFieldItemsText(selectedNode.repeat?.fieldItemsText ?? '').length} champ{parseFieldItemsText(selectedNode.repeat?.fieldItemsText ?? '').length > 1 ? 's' : ''} configuré{parseFieldItemsText(selectedNode.repeat?.fieldItemsText ?? '').length > 1 ? 's' : ''}</span>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {repeatFieldDiagnostics && (repeatFieldDiagnostics.normalizedMatches.length > 0 || repeatFieldDiagnostics.missingEntries.length > 0) ? (
                                <Button type="button" variant="secondary" onClick={reconcileRepeatFieldKeys} disabled={!canEdit}>
                                  Réconcilier les clés
                                </Button>
                              ) : null}
                              <Button type="button" variant="secondary" onClick={openRepeatFieldAssistant} disabled={!canEdit}>
                                Choisir les champs
                              </Button>
                            </div>
                          </div>
                          {repeatFieldDiagnostics && repeatFieldDiagnostics.normalizedMatches.length > 0 ? (
                            <div className="home-alert home-alert--success" style={{ margin: 0 }}>
                              {repeatFieldDiagnostics.normalizedMatches.length} clé{repeatFieldDiagnostics.normalizedMatches.length > 1 ? 's' : ''} ancienne{repeatFieldDiagnostics.normalizedMatches.length > 1 ? 's' : ''} peut{repeatFieldDiagnostics.normalizedMatches.length > 1 ? 'vent' : ''} être réconciliée{repeatFieldDiagnostics.normalizedMatches.length > 1 ? 's' : ''} automatiquement avec la vue source.
                            </div>
                          ) : null}
                          {repeatFieldDiagnostics && repeatFieldDiagnostics.missingEntries.length > 0 ? (
                            <div className="home-alert home-alert--error" style={{ margin: 0, display: 'grid', gap: '0.35rem' }}>
                              <strong>Clés orphelines dans ce conteneur</strong>
                              <small>
                                {repeatFieldDiagnostics.missingEntries.map((entry) => entry.key).join(', ')}
                              </small>
                            </div>
                          ) : null}
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>{'Champs source (clé ou libellé, un par ligne, "clé => libellé" possible)'}</span>
                            <textarea rows={6} value={selectedNode.repeat?.fieldItemsText ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), fieldItemsText: event.target.value } }))} disabled={!canEdit} />
                          </label>
                        </>
                      ) : null}
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Filtre item</span>
                        <input value={selectedNode.repeat?.filter ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), filter: event.target.value } }))} disabled={!canEdit} />
                        {renderFormulaComposerButton(
                          'Compositeur - Filtre item',
                          'condition',
                          selectedNode.repeat?.filter,
                          (nextValue) =>
                            updateSelectedNode((node) => ({
                              ...node,
                              repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), filter: nextValue }
                            })),
                          'Filtre item',
                          'La condition est évaluée pour chaque item répété. Utilise par exemple @item.equipe, @item.catalogKey ou @item.quantite.'
                        )}
                        <small style={{ opacity: 0.8 }}>
                          Exemples : <code>@item.value &gt; 0</code>, <code>@item.checked == true</code>, <code>@item.equipe == true</code>, <code>@item.catalogKey == &quot;catalogue_armes&quot;</code>
                        </small>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              updateSelectedNode((node) => ({
                                ...node,
                                repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), filter: '@item.equipe == true' }
                              }))
                            }
                            disabled={!canEdit}
                          >
                            Équipés
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              updateSelectedNode((node) => ({
                                ...node,
                                repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), filter: '@item.equipe == false' }
                              }))
                            }
                            disabled={!canEdit}
                          >
                            Non équipés
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              updateSelectedNode((node) => ({
                                ...node,
                                repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), filter: '@item.catalogKey == \"catalogue_a_filtrer\"' }
                              }))
                            }
                            disabled={!canEdit}
                          >
                            Par catalogue
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              updateSelectedNode((node) => ({
                                ...node,
                                repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), filter: '' }
                              }))
                            }
                            disabled={!canEdit}
                          >
                            Effacer filtre
                          </Button>
                        </div>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Disposition répétition</span>
                        <select value={selectedNode.repeat?.flow ?? 'horizontal'} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), flow: event.target.value as NonNullable<SystemStudioNodeDefinition['repeat']>['flow'] } }))} disabled={!canEdit}>
                          <option value="horizontal">Ligne puis retour à la ligne</option>
                          <option value="vertical">Colonne puis colonne suivante</option>
                        </select>
                      </label>
                      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Largeur item</span>
                          <input type="number" min={0.5} step={0.5} value={selectedNode.repeat?.itemWidth ?? 3} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), itemWidth: Number(event.target.value) || 0.5 } }))} disabled={!canEdit} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Hauteur item</span>
                          <input type="number" min={0.5} step={0.5} value={selectedNode.repeat?.itemHeight ?? 2} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), itemHeight: Number(event.target.value) || 0.5 } }))} disabled={!canEdit} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Espacement horizontal</span>
                          <input type="number" min={0} step={0.5} value={selectedNode.repeat?.gapX ?? 0.5} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), gapX: Math.max(0, Number(event.target.value) || 0) } }))} disabled={!canEdit} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Espacement vertical</span>
                          <input type="number" min={0} step={0.5} value={selectedNode.repeat?.gapY ?? 0.5} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), gapY: Math.max(0, Number(event.target.value) || 0) } }))} disabled={!canEdit} />
                        </label>
                      </div>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Entête item</span>
                        <select value={String(Boolean(selectedNode.repeat?.showItemHeader))} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), showItemHeader: event.target.value === 'true' } }))} disabled={!canEdit}>
                          <option value="false">Masquer</option>
                          <option value="true">Afficher</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Libellé item</span>
                        <input value={selectedNode.repeat?.itemLabelTemplate ?? '{{item.label}}'} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '', manualItemsText: '' }), itemLabelTemplate: event.target.value } }))} disabled={!canEdit} />
                      </label>
                      {selectedNode.repeat?.mode === 'manual' ? (
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Tableau manuel (JSON ou texte libre)</span>
                          <textarea rows={4} value={selectedNode.repeat?.manualItemsText ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, repeat: { ...(node.repeat ?? { mode: 'none', source: '' }), manualItemsText: event.target.value } }))} disabled={!canEdit} />
                        </label>
                      ) : null}
                    </PropertySection>
                  ) : null}

                  {selectedNode.type === 'tabs' ? (
                    <PropertySection title="Onglets" sectionKey={`tabs-${selectedNode.id}`}>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Bandeau titre</span>
                        <select value={String(selectedNode.showTitle !== false)} onChange={(event) => updateSelectedNode((node) => ({ ...node, showTitle: event.target.value === 'true' }))} disabled={!canEdit}>
                          <option value="true">Afficher</option>
                          <option value="false">Masquer</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Position des onglets</span>
                        <select
                          value={selectedNode.tabOrientation ?? 'horizontal'}
                          onChange={(event) =>
                            updateSelectedNode((node) => ({
                              ...node,
                              tabOrientation: event.target.value as SystemStudioNodeDefinition['tabOrientation']
                            }))
                          }
                          disabled={!canEdit}
                        >
                          <option value="horizontal">Au-dessus</option>
                          <option value="vertical_gauche">À gauche (-90°)</option>
                          <option value="vertical_droite">À droite (+90°)</option>
                        </select>
                      </label>
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        <span>Ajouter un onglet vers une vue</span>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <select value={tabViewToAdd} onChange={(event) => setTabViewToAdd(event.target.value)} disabled={!canEdit || availableTabViews.length === 0}>
                            {availableTabViews.length === 0 ? <option value="">Aucune vue disponible</option> : null}
                            {availableTabViews.map((view) => (
                              <option key={view.id} value={view.id}>
                                {view.name}
                              </option>
                            ))}
                          </select>
                          <Button type="button" variant="secondary" onClick={handleAddTabView} disabled={!canEdit || !tabViewToAdd}>
                            Ajouter un onglet
                          </Button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: '0.65rem' }}>
                        {(selectedNode.tabs ?? []).length === 0 ? <p style={{ margin: 0 }}>Aucune vue rattachée pour le moment.</p> : null}
                        {(selectedNode.tabs ?? []).map((tab) => {
                          const linkedView = schema.views.find((view) => view.id === tab.viewId);
                          return (
                            <div key={tab.id} className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                                <div>
                                  <strong>{linkedView?.name ?? tab.label}</strong>
                                  <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>Vue liée</div>
                                </div>
                                <Button type="button" variant="secondary" onClick={() => handleRemoveTabView(tab.id)} disabled={!canEdit}>
                                  Retirer
                                </Button>
                              </div>
                              <label style={{ display: 'grid', gap: '0.35rem' }}>
                                <span>Visible si</span>
                                <input
                                  value={tab.visibleIf ?? ''}
                                  onChange={(event) =>
                                    updateSelectedNode((node) => ({
                                      ...node,
                                      tabs: (node.tabs ?? []).map((item) => (item.id === tab.id ? { ...item, visibleIf: event.target.value } : item))
                                    }))
                                  }
                                  disabled={!canEdit}
                                />
                                {renderFormulaComposerButton(
                                  'Compositeur - Visible si onglet',
                                  'condition',
                                  tab.visibleIf,
                                  (nextValue) =>
                                    updateSelectedNode((node) => ({
                                      ...node,
                                      tabs: (node.tabs ?? []).map((item) => (item.id === tab.id ? { ...item, visibleIf: nextValue } : item))
                                    })),
                                  'Visible si onglet',
                                  'La condition décide si cet onglet apparaît dans le runtime. Vrai = onglet affiché, faux = onglet caché.'
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </PropertySection>
                  ) : null}

                  {(selectedNode.type === 'select' || selectedNode.type === 'multiselect') ? (
                    <PropertySection title="Options" sectionKey={`options-${selectedNode.id}`}>
                      {selectedNode.type === 'select' ? (
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Valeur vide autorisée</span>
                          <select value={String(Boolean(selectedNode.valueAllowsEmpty))} onChange={(event) => updateSelectedNode((node) => ({ ...node, valueAllowsEmpty: event.target.value === 'true' }))} disabled={!canEdit}>
                            <option value="false">Non</option>
                            <option value="true">Oui</option>
                          </select>
                        </label>
                      ) : null}
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Affichage</span>
                        <select value={selectedNode.selectDisplayMode ?? 'texte'} onChange={(event) => updateSelectedNode((node) => ({ ...node, selectDisplayMode: event.target.value as SystemStudioNodeDefinition['selectDisplayMode'] }))} disabled={!canEdit}>
                          <option value="texte">Texte</option>
                          <option value="cle">Cle</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Options (format `cle =&gt; Libellé`)</span>
                        <textarea
                          className="studio-options-textarea"
                          rows={10}
                          value={optionsEditorText}
                          onChange={(event) => {
                            const nextText = event.target.value;
                            setOptionsEditorText(nextText);
                            updateSelectedNode((node) => ({
                              ...node,
                              options: nextText
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean)
                            }));
                          }}
                          disabled={!canEdit}
                        />
                      </label>
                    </PropertySection>
                  ) : null}

                  {(selectedNode.type === 'text' || selectedNode.type === 'textarea' || selectedNode.type === 'date' || selectedNode.type === 'time' || selectedNode.type === 'number') ? (
                    <PropertySection title="Format de valeur" sectionKey={`format-${selectedNode.id}`}>
                      <div className="grid">
                        {(selectedNode.type === 'text' || selectedNode.type === 'textarea') ? (
                          <>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Longueur max</span>
                              <input type="number" value={selectedNode.maxLength ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, maxLength: event.target.value ? Number(event.target.value) : null }))} disabled={!canEdit} />
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Valeur vide autorisée</span>
                              <select value={String(Boolean(selectedNode.valueAllowsEmpty))} onChange={(event) => updateSelectedNode((node) => ({ ...node, valueAllowsEmpty: event.target.value === 'true' }))} disabled={!canEdit}>
                                <option value="false">Non</option>
                                <option value="true">Oui</option>
                              </select>
                            </label>
                          </>
                        ) : null}
                        {selectedNode.type === 'textarea' ? (
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Lignes visibles</span>
                            <input type="number" value={selectedNode.defaultRowsVisible ?? 4} onChange={(event) => updateSelectedNode((node) => ({ ...node, defaultRowsVisible: Number(event.target.value) || 4 }))} disabled={!canEdit} />
                          </label>
                        ) : null}
                        {selectedNode.type === 'date' ? (
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Format date</span>
                            <select value={selectedNode.dateFormat ?? 'jour/mois/annee'} onChange={(event) => updateSelectedNode((node) => ({ ...node, dateFormat: event.target.value as SystemStudioNodeDefinition['dateFormat'] }))} disabled={!canEdit}>
                              <option value="jour/mois/annee">Jour / Mois / Annee</option>
                              <option value="annee-mois-jour">Annee-Mois-Jour</option>
                              <option value="jour mois texte annee">Jour mois texte annee</option>
                            </select>
                          </label>
                        ) : null}
                        {selectedNode.type === 'time' ? (
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Format heure</span>
                            <select value={selectedNode.timeFormat ?? '24h'} onChange={(event) => updateSelectedNode((node) => ({ ...node, timeFormat: event.target.value as SystemStudioNodeDefinition['timeFormat'] }))} disabled={!canEdit}>
                              <option value="24h">24h</option>
                              <option value="12h">12h</option>
                            </select>
                          </label>
                        ) : null}
                        {selectedNode.type === 'number' ? (
                          <>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Valeur vide autorisée</span>
                              <select value={String(Boolean(selectedNode.valueAllowsEmpty))} onChange={(event) => updateSelectedNode((node) => ({ ...node, valueAllowsEmpty: event.target.value === 'true' }))} disabled={!canEdit}>
                                <option value="false">Non</option>
                                <option value="true">Oui</option>
                              </select>
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Minimum</span>
                              <input
                                value={selectedNode.minFormula ?? (typeof selectedNode.min === 'number' ? String(selectedNode.min) : '')}
                                onChange={(event) =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    minFormula: event.target.value,
                                    min: undefined
                                  }))
                                }
                                disabled={!canEdit}
                              />
                              {renderFormulaComposerButton(
                                'Compositeur - Minimum',
                                'math',
                                selectedNode.minFormula ?? (typeof selectedNode.min === 'number' ? String(selectedNode.min) : ''),
                                (nextValue) =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    minFormula: nextValue,
                                    min: undefined
                                  })),
                                'Minimum',
                                'Accepte une valeur fixe ou une formule, par exemple 0, @niveau, max(0, @fatigue).'
                              )}
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Maximum</span>
                              <input
                                value={selectedNode.maxFormula ?? (typeof selectedNode.max === 'number' ? String(selectedNode.max) : '')}
                                onChange={(event) =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    maxFormula: event.target.value,
                                    max: undefined
                                  }))
                                }
                                disabled={!canEdit}
                              />
                              {renderFormulaComposerButton(
                                'Compositeur - Maximum',
                                'math',
                                selectedNode.maxFormula ?? (typeof selectedNode.max === 'number' ? String(selectedNode.max) : ''),
                                (nextValue) =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    maxFormula: nextValue,
                                    max: undefined
                                  })),
                                'Maximum',
                                'Accepte une valeur fixe ou une formule, par exemple 10, @pm_max, clamp(@bonus + 5, 0, 20).'
                              )}
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Pas</span>
                              <input type="number" value={selectedNode.step ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, step: event.target.value ? Number(event.target.value) : undefined }))} disabled={!canEdit} />
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Décimales</span>
                              <input type="number" value={selectedNode.formatDecimals ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, formatDecimals: event.target.value ? Number(event.target.value) : null }))} disabled={!canEdit} />
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Séparateur milliers</span>
                              <select value={String(selectedNode.formatThousands !== false)} onChange={(event) => updateSelectedNode((node) => ({ ...node, formatThousands: event.target.value === 'true' }))} disabled={!canEdit}>
                                <option value="true">Oui</option>
                                <option value="false">Non</option>
                              </select>
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Préfixe</span>
                              <input value={selectedNode.formatPrefix ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, formatPrefix: event.target.value }))} disabled={!canEdit} />
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Suffixe</span>
                              <input value={selectedNode.formatSuffix ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, formatSuffix: event.target.value }))} disabled={!canEdit} />
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Fallback affichage</span>
                              <input value={selectedNode.fallbackDisplay ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, fallbackDisplay: event.target.value }))} disabled={!canEdit} />
                            </label>
                          </>
                        ) : null}
                      </div>
                    </PropertySection>
                  ) : null}

                  {selectedNode.type === 'checkbox' ? (
                    <PropertySection title="Case à cocher" sectionKey={`checkbox-${selectedNode.id}`}>
                      <div className="grid">
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Libellé checkbox</span>
                          <input value={selectedNode.checkboxLabel ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, checkboxLabel: event.target.value }))} disabled={!canEdit} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Forme</span>
                          <select value={selectedNode.checkboxShape ?? 'carre'} onChange={(event) => updateSelectedNode((node) => ({ ...node, checkboxShape: event.target.value as SystemStudioNodeDefinition['checkboxShape'] }))} disabled={!canEdit}>
                            <option value="carre">Carre</option>
                            <option value="rond">Rond</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Style actif</span>
                          <select value={selectedNode.checkboxActiveStyle ?? 'coche'} onChange={(event) => updateSelectedNode((node) => ({ ...node, checkboxActiveStyle: event.target.value as SystemStudioNodeDefinition['checkboxActiveStyle'] }))} disabled={!canEdit}>
                            <option value="coche">Coche</option>
                            <option value="rempli">Rempli</option>
                          </select>
                        </label>
                      </div>
                    </PropertySection>
                  ) : null}

                  {selectedNode.type === 'image' ? (
                    <PropertySection title="Image" sectionKey={`image-${selectedNode.id}`}>
                      <div className="grid">
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Valeur vide autorisée</span>
                          <select value={String(Boolean(selectedNode.valueAllowsEmpty))} onChange={(event) => updateSelectedNode((node) => ({ ...node, valueAllowsEmpty: event.target.value === 'true' }))} disabled={!canEdit}>
                            <option value="false">Non</option>
                            <option value="true">Oui</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Mode d'ajustement</span>
                          <select value={selectedNode.imageFit ?? 'contenir'} onChange={(event) => updateSelectedNode((node) => ({ ...node, imageFit: event.target.value as SystemStudioNodeDefinition['imageFit'] }))} disabled={!canEdit}>
                            <option value="contenir">Contenir</option>
                            <option value="couvrir">Couvrir</option>
                            <option value="etirer">Etirer</option>
                            <option value="taille_reelle">Taille reelle</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Largeur image</span>
                          <input value={selectedNode.imageWidth ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, imageWidth: event.target.value }))} disabled={!canEdit} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Hauteur image</span>
                          <input value={selectedNode.imageHeight ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, imageHeight: event.target.value }))} disabled={!canEdit} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Alt</span>
                          <input value={selectedNode.imageAlt ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, imageAlt: event.target.value }))} disabled={!canEdit} />
                        </label>
                      </div>
                    </PropertySection>
                  ) : null}

                  {selectedNode.type === 'progress' ? (
                    <PropertySection title="Jauge" sectionKey={`gauge-${selectedNode.id}`}>
                      <div className="grid">
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Afficher nom</span>
                          <select value={String(selectedNode.gaugeShowLabel !== false)} onChange={(event) => updateSelectedNode((node) => ({ ...node, gaugeShowLabel: event.target.value === 'true' }))} disabled={!canEdit}>
                            <option value="true">Oui</option>
                            <option value="false">Non</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Afficher valeurs</span>
                          <select value={String(selectedNode.gaugeShowValues !== false)} onChange={(event) => updateSelectedNode((node) => ({ ...node, gaugeShowValues: event.target.value === 'true' }))} disabled={!canEdit}>
                            <option value="true">Oui</option>
                            <option value="false">Non</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Afficher pourcentage</span>
                          <select value={String(Boolean(selectedNode.gaugeShowPercentage))} onChange={(event) => updateSelectedNode((node) => ({ ...node, gaugeShowPercentage: event.target.value === 'true' }))} disabled={!canEdit}>
                            <option value="false">Non</option>
                            <option value="true">Oui</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Orientation</span>
                          <select value={selectedNode.gaugeOrientation ?? 'horizontale'} onChange={(event) => updateSelectedNode((node) => ({ ...node, gaugeOrientation: event.target.value as SystemStudioNodeDefinition['gaugeOrientation'] }))} disabled={!canEdit}>
                            <option value="horizontale">Horizontale</option>
                            <option value="verticale">Verticale</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Couleur remplissage</span>
                          <input value={selectedNode.gaugeFillColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, gaugeFillColor: event.target.value }))} disabled={!canEdit} />
                        </label>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Couleur piste</span>
                          <input value={selectedNode.gaugeTrackColor ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, gaugeTrackColor: event.target.value }))} disabled={!canEdit} />
                        </label>
                      </div>
                    </PropertySection>
                  ) : null}

                  {selectedNode.type === 'subview' ? (
                    <PropertySection title="Vue liée" sectionKey={`subview-${selectedNode.id}`}>
                      <div className="grid">
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Vue cible</span>
                          <select
                            value={selectedNode.targetViewId ?? ''}
                            onChange={(event) =>
                              updateSelectedNode((node) => {
                                const targetView = schema.views.find((view) => view.id === event.target.value);
                                return {
                                  ...node,
                                  targetViewId: event.target.value,
                                  targetViewRef: targetView?.reference ?? ''
                                };
                              })
                            }
                            disabled={!canEdit}
                          >
                            <option value="">Aucune</option>
                            {schema.views
                              .filter((view) => view.id !== selectedView.id)
                              .map((view) => (
                                <option key={view.id} value={view.id}>
                                  {view.name} [{view.reference}]
                                </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </PropertySection>
                  ) : null}

                  {selectedNode.type === 'button' ? (
                    <PropertySection title="Bouton" sectionKey={`button-${selectedNode.id}`}>
                      <div className="grid">
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Mode contenu</span>
                          <select value={selectedNode.buttonContentMode ?? 'texte'} onChange={(event) => updateSelectedNode((node) => ({ ...node, buttonContentMode: event.target.value as SystemStudioNodeDefinition['buttonContentMode'] }))} disabled={!canEdit}>
                            <option value="texte">Texte</option>
                            <option value="icone">Icône</option>
                            <option value="texte_icone">Texte + icône</option>
                            <option value="icone_texte">Icône + texte</option>
                          </select>
                        </label>
                        {buttonUsesIcon(selectedNode) ? (
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Icône</span>
                            <input value={selectedNode.buttonIcon ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, buttonIcon: event.target.value }))} disabled={!canEdit} />
                          </label>
                        ) : null}
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Action</span>
                          <select value={selectedNode.buttonAction ?? 'aucune'} onChange={(event) => updateSelectedNode((node) => ({ ...node, buttonAction: event.target.value as SystemStudioNodeDefinition['buttonAction'] }))} disabled={!canEdit}>
                            <option value="aucune">Aucune</option>
                            <option value="aller_vers_vue">Aller vers vue</option>
                            <option value="ouvrir_popup_vue">Ouvrir popup vue</option>
                            <option value="executer_script">Exécuter script</option>
                            <option value="lancer_jet">Lancer jet</option>
                            <option value="ajouter_depuis_catalogue">Ajouter depuis catalogue (popup)</option>
                            <option value="dupliquer_item">Dupliquer item</option>
                            <option value="equiper_desequiper">Équiper / déséquiper</option>
                            <option value="incrementer_quantite">Augmenter quantité</option>
                            <option value="decrementer_quantite">Diminuer quantité</option>
                            <option value="supprimer_item">Supprimer item</option>
                          </select>
                        </label>
                        {selectedNode.buttonAction === 'dupliquer_item' ? (
                          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
                            Cette action duplique l item courant dans une repetition basee sur une vraie collection runtime.
                          </div>
                        ) : null}
                        {selectedNode.buttonAction === 'equiper_desequiper' ? (
                          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
                            Cette action bascule la propriete <code>equipe</code> de l item courant dans une repetition basee sur une vraie collection runtime.
                          </div>
                        ) : null}
                        {selectedNode.buttonAction === 'ouvrir_popup_vue' ? (
                          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
                            Place ce bouton dans une repetition runtime pour ouvrir une vue popup de detail qui edite l item courant.
                          </div>
                        ) : null}
                        {selectedNode.buttonAction === 'incrementer_quantite' ? (
                          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
                            Cette action augmente la propriete <code>quantite</code> de l item courant dans une repetition basee sur une vraie collection runtime.
                          </div>
                        ) : null}
                        {selectedNode.buttonAction === 'decrementer_quantite' ? (
                          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
                            Cette action diminue la propriete <code>quantite</code> de l item courant sans descendre en dessous de <code>0</code>.
                          </div>
                        ) : null}
                        {selectedNode.buttonAction === 'supprimer_item' ? (
                          <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
                            Pour un bouton <code>Retirer si quantité = 0</code>, utilise aussi <code>Afficher si</code> avec <code>@item.quantite == 0</code>.
                          </div>
                        ) : null}
                        {selectedNode.buttonAction === 'aller_vers_vue' || selectedNode.buttonAction === 'ouvrir_popup_vue' ? (
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Vue cible</span>
                            <select
                              value={selectedNode.buttonActionTarget ?? ''}
                              onChange={(event) =>
                                updateSelectedNode((node) => {
                                  const targetView = schema.views.find((view) => view.id === event.target.value);
                                  return {
                                    ...node,
                                    buttonActionTarget: targetView?.reference || event.target.value
                                  };
                                })
                              }
                              disabled={!canEdit}
                            >
                              <option value="">Aucune</option>
                              {schema.views
                                .filter((view) => view.id !== selectedView.id)
                                .map((view) => (
                                  <option key={view.id} value={view.id}>
                                    {view.name} [{view.reference}]
                                  </option>
                                ))}
                            </select>
                          </label>
                        ) : null}
                        {selectedNode.buttonAction === 'lancer_jet' ? (
                          <>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Formule de jet</span>
                              <input
                                value={selectedNode.buttonRollFormula ?? selectedNode.buttonActionTarget ?? ''}
                                onChange={(event) =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    buttonRollFormula: event.target.value
                                  }))
                                }
                                disabled={!canEdit}
                                placeholder="Ex : 1d20 + @force"
                              />
                              {renderFormulaComposerButton(
                                'Compositeur - Formule de jet',
                                'dice',
                                selectedNode.buttonRollFormula ?? selectedNode.buttonActionTarget ?? '',
                                (nextValue) => updateSelectedNode((node) => ({ ...node, buttonRollFormula: nextValue })),
                                'Formule de jet',
                                'Compose ici le jet lancé par le bouton. Tu peux mélanger dés et variables, par exemple 1d20 + @force.'
                              )}
                              <small style={{ opacity: 0.8 }}>
                                Exemples : <code>1d20</code>, <code>2d6+3</code>, <code>1d10 + @vigueur</code>
                              </small>
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Visibilité du résultat</span>
                              <select
                                value={selectedNode.buttonRollVisibility ?? 'public'}
                                onChange={(event) =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    buttonRollVisibility: event.target.value as SystemStudioNodeDefinition['buttonRollVisibility']
                                  }))
                                }
                                disabled={!canEdit}
                              >
                                <option value="public">Public</option>
                                <option value="mj_seulement">MJ seulement</option>
                                <option value="prive">Privé</option>
                              </select>
                            </label>
                          </>
                        ) : null}
                        {selectedNode.buttonAction === 'ajouter_depuis_catalogue' ? (
                          <>
                            <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
                              Cette action ouvre une popup de selection, puis ajoute l entree choisie dans la collection cible.
                            </div>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Catalogue source</span>
                              <select
                                value={selectedNode.buttonCatalogKey ?? ''}
                                onChange={(event) =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    buttonCatalogKey: event.target.value
                                  }))
                                }
                                disabled={!canEdit}
                              >
                                <option value="">Aucun</option>
                                {(system.catalogs ?? []).map((catalog) => (
                                  <option key={catalog.id} value={catalog.key}>
                                    {catalog.label} [{catalog.key}]
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label style={{ display: 'grid', gap: '0.35rem' }}>
                              <span>Collection cible</span>
                              <input
                                value={selectedNode.buttonTargetCollectionKey ?? ''}
                                onChange={(event) =>
                                  updateSelectedNode((node) => ({
                                    ...node,
                                    buttonTargetCollectionKey: event.target.value
                                  }))
                                }
                                disabled={!canEdit}
                                placeholder="Ex : inventaire"
                              />
                              <small style={{ opacity: 0.8 }}>
                                Nom du tableau runtime où instancier l&apos;entrée choisie.
                              </small>
                            </label>
                          </>
                        ) : null}
                        {selectedNode.buttonAction === 'executer_script' ? (
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Référence script</span>
                            <input value={selectedNode.buttonActionTarget ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, buttonActionTarget: event.target.value }))} disabled={!canEdit} />
                          </label>
                        ) : null}
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Actif si</span>
                          <input value={selectedNode.buttonActiveIf ?? ''} onChange={(event) => updateSelectedNode((node) => ({ ...node, buttonActiveIf: event.target.value }))} disabled={!canEdit} />
                          {renderFormulaComposerButton(
                            'Compositeur - Actif si',
                            'condition',
                            selectedNode.buttonActiveIf,
                            (nextValue) => updateSelectedNode((node) => ({ ...node, buttonActiveIf: nextValue })),
                            'Actif si',
                            'La condition décide si le bouton reste cliquable. Vrai = actif, faux = désactivé.'
                          )}
                        </label>
                      </div>
                    </PropertySection>
                  ) : null}
                </>
              ) : (
                <p>Sélectionne un élément sur la grille pour l’éditer.</p>
              )}
            </div>
          ) : null}
    </>
  );

  return (
    <Layout wide>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Studio système V2</h1>
            <p style={{ margin: 0 }}>
              Système : <strong>{system.name}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Link className="button secondary" to="/systems">
              Retour catalogue
            </Link>
            <Button type="button" variant="secondary" onClick={() => setIsSystemPropertiesOpen(true)}>
              Propriétés système
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsCatalogManagerOpen(true)}>
              Catalogues système
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const popup = openDiscordConfigManagerWindow();
                discordConfigManagerWindowRef.current = popup;
                setIsDiscordConfigManagerDetachedBlocked(!popup);
                setIsDiscordConfigManagerOpen(true);
              }}
            >
              Configuration Discord
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const popup = openCharacterCreationManagerWindow();
                characterCreationManagerWindowRef.current = popup;
                setIsCharacterCreationManagerDetachedBlocked(!popup);
                setIsCharacterCreationManagerOpen(true);
              }}
            >
              Règle création personnage
            </Button>
            <Button type="button" variant="secondary" disabled>
              {canPublish ? 'Prêt à publier' : 'Ajouter une fiche personnage'}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={!canEdit || isSaving}>
              Enregistrer
            </Button>
          </div>
        </div>
        {canEdit ? <p style={{ marginBottom: 0, color: saveStatusColor }}>{saveStatusLabel}</p> : null}
        {statusMessage ? <p style={{ color: '#067647', marginBottom: 0 }}>{statusMessage}</p> : null}
        {errorMessage ? <p style={{ color: '#b42318', marginBottom: 0 }}>{errorMessage}</p> : null}
      </section>

      {pendingImport ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Vues détectées</h2>
              <p style={{ margin: 0 }}>
                Source : {pendingImport.sourceLabel} | {pendingImport.views.length} vue{pendingImport.views.length > 1 ? 's' : ''} disponible{pendingImport.views.length > 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setPendingImport((current) =>
                    current
                      ? {
                          ...current,
                          selectedViewIds:
                            current.selectedViewIds.length === current.views.length ? [] : current.views.map((view) => view.id)
                        }
                      : null
                  )
                }
              >
                {pendingImport.selectedViewIds.length === pendingImport.views.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPendingImport(null)}>
                Annuler
              </Button>
              <Button type="button" onClick={handleConfirmImportSelection}>
                Importer la sélection
              </Button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
            {pendingImport.views.map((view) => (
              <label key={view.id} className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.35rem' }}>
                <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="checkbox"
                    checked={pendingImport.selectedViewIds.includes(view.id)}
                    onChange={() =>
                      setPendingImport((current) =>
                        current
                          ? {
                              ...current,
                              selectedViewIds: current.selectedViewIds.includes(view.id)
                                ? current.selectedViewIds.filter((item) => item !== view.id)
                                : [...current.selectedViewIds, view.id]
                            }
                          : null
                      )
                    }
                  />
                  <strong>{view.name}</strong>
                </span>
                <small>Reference : {view.reference}</small>
                <small>{view.nodes.length} élément{view.nodes.length > 1 ? 's' : ''}</small>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {repeatFieldAssistant ? (
        <div className="resource-preview-modal" onClick={() => setRepeatFieldAssistant(null)}>
          <section className="resource-preview-modal__dialog" onClick={(event) => event.stopPropagation()}>
            <header className="resource-preview-modal__header">
              <div>
                <strong>Assistant champs d&apos;une vue</strong>
                <small>
                  Source : {repeatFieldAssistantSourceView?.name ?? 'Vue introuvable'} | {repeatFieldAssistant.items.filter((item) => item.selected).length} champ{repeatFieldAssistant.items.filter((item) => item.selected).length > 1 ? 's' : ''} sélectionné{repeatFieldAssistant.items.filter((item) => item.selected).length > 1 ? 's' : ''}
                </small>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {repeatFieldAssistant.items.some((item) => item.missing || item.sourceToken !== item.key) ? (
                  <Button type="button" variant="secondary" onClick={() => setRepeatFieldAssistant((current) => (current ? { ...current, items: rebuildRepeatAssistantItems(current.sourceViewId, current.items) } : null))}>
                    Réconcilier les clés
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={() => setRepeatFieldAssistant(null)}>
                  Fermer
                </Button>
                <Button type="button" onClick={applyRepeatFieldAssistant}>
                  Appliquer
                </Button>
              </div>
            </header>
            <div className="resource-preview-modal__body" style={{ display: 'grid', gap: '1rem' }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Vue source</span>
                  <select
                    value={repeatFieldAssistant.sourceViewId}
                    onChange={(event) =>
                      setRepeatFieldAssistant((current) =>
                        current
                          ? {
                              ...current,
                              sourceViewId: event.target.value,
                              items: rebuildRepeatAssistantItems(event.target.value, current.items)
                            }
                          : null
                      )
                    }
                  >
                    {schema.views.map((view) => (
                      <option key={view.id} value={view.id}>
                        {view.name} [{view.reference}]
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Recherche</span>
                  <input value={repeatFieldAssistant.search} onChange={(event) => setRepeatFieldAssistant((current) => (current ? { ...current, search: event.target.value } : null))} placeholder="clé, libellé, alias" />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Type</span>
                  <select value={repeatFieldAssistant.typeFilter} onChange={(event) => setRepeatFieldAssistant((current) => (current ? { ...current, typeFilter: event.target.value as RepeatFieldAssistantTypeFilter } : null))}>
                    <option value="all">Tous</option>
                    <option value="numeric">Numériques</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="textual">Texte / date / heure</option>
                    <option value="select">Listes</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Visibilité</span>
                  <select value={repeatFieldAssistant.visibilityFilter} onChange={(event) => setRepeatFieldAssistant((current) => (current ? { ...current, visibilityFilter: event.target.value as RepeatFieldAssistantVisibilityFilter } : null))}>
                    <option value="all">Toutes</option>
                    <option value="visible">Sans condition</option>
                    <option value="hidden">Avec condition</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Édition</span>
                  <select value={repeatFieldAssistant.editabilityFilter} onChange={(event) => setRepeatFieldAssistant((current) => (current ? { ...current, editabilityFilter: event.target.value as RepeatFieldAssistantEditabilityFilter } : null))}>
                    <option value="all">Toutes</option>
                    <option value="editable">Éditables sans condition</option>
                    <option value="readonly">Conditionnelles / lecture seule</option>
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button type="button" variant="secondary" onClick={() => updateRepeatFieldAssistantItems((items) => items.map((item) => ({ ...item, selected: true })))}>
                  Tout sélectionner
                </Button>
                <Button type="button" variant="secondary" onClick={() => updateRepeatFieldAssistantItems((items) => items.map((item) => ({ ...item, selected: false })))}>
                  Tout désélectionner
                </Button>
                <Button type="button" variant="secondary" onClick={() => updateRepeatFieldAssistantItems((items) => items.map((item) => (item.type === 'number' ? { ...item, selected: true } : item)))}>
                  Numériques seulement
                </Button>
                <Button type="button" variant="secondary" onClick={() => updateRepeatFieldAssistantItems((items) => items.map((item) => (item.visible ? { ...item, selected: true } : item)))}>
                  Sélectionner visibles
                </Button>
                <Button type="button" variant="secondary" onClick={() => updateRepeatFieldAssistantItems((items) => [...items].sort((a, b) => a.label.localeCompare(b.label, 'fr')))}>
                  Trier par libellé
                </Button>
              </div>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {repeatFieldAssistantFilteredItems.length === 0 ? (
                  <div className="card" style={{ margin: 0 }}>
                    Aucun champ ne correspond aux filtres.
                  </div>
                ) : (
                  repeatFieldAssistantFilteredItems.map((item) => {
                    const absoluteIndex = repeatFieldAssistant.items.findIndex((entry) => entry.key === item.key);
                    return (
                      <article key={item.key} className="card" style={{ margin: 0, padding: '0.85rem', display: 'grid', gap: '0.65rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(event) =>
                              updateRepeatFieldAssistantItems((items) =>
                                items.map((entry) => (entry.key === item.key ? { ...entry, selected: event.target.checked } : entry))
                              )
                            }
                          />
                          <div style={{ minWidth: 0 }}>
                            <strong>{item.label}</strong>
                            <small style={{ display: 'block' }}>
                              clé `{item.key}` | type `{item.type}` | {item.visible ? 'sans condition d’affichage' : 'avec condition d’affichage'} | {item.editable ? 'éditable sans condition' : 'édition conditionnelle'}
                            </small>
                            {item.missing ? (
                              <small style={{ display: 'block', color: '#fca5a5' }}>
                                Clé introuvable dans la vue source.
                              </small>
                            ) : item.sourceToken && item.sourceToken !== item.key ? (
                              <small style={{ display: 'block', color: '#86efac' }}>
                                Ancienne clé détectée : `{item.sourceToken}` {'->'} `{item.key}`
                              </small>
                            ) : null}
                          </div>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                updateRepeatFieldAssistantItems((items) => {
                                  if (absoluteIndex <= 0) {
                                    return items;
                                  }
                                  const next = [...items];
                                  const [moved] = next.splice(absoluteIndex, 1);
                                  next.splice(absoluteIndex - 1, 0, moved);
                                  return next;
                                })
                              }
                              disabled={absoluteIndex <= 0}
                            >
                              Monter
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() =>
                                updateRepeatFieldAssistantItems((items) => {
                                  if (absoluteIndex < 0 || absoluteIndex >= items.length - 1) {
                                    return items;
                                  }
                                  const next = [...items];
                                  const [moved] = next.splice(absoluteIndex, 1);
                                  next.splice(absoluteIndex + 1, 0, moved);
                                  return next;
                                })
                              }
                              disabled={absoluteIndex < 0 || absoluteIndex >= repeatFieldAssistant.items.length - 1}
                            >
                              Descendre
                            </Button>
                          </div>
                        </div>
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Libellé affiché dans la répétition</span>
                          <input
                            value={item.alias}
                            placeholder={item.label}
                            onChange={(event) =>
                              updateRepeatFieldAssistantItems((items) =>
                                items.map((entry) => (entry.key === item.key ? { ...entry, alias: event.target.value } : entry))
                              )
                            }
                          />
                        </label>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isViewPropertiesOpen && selectedView ? (
        <div className="resource-preview-modal" onClick={() => setIsViewPropertiesOpen(false)}>
          <section className="resource-preview-modal__dialog" onClick={(event) => event.stopPropagation()}>
            <header className="resource-preview-modal__header">
              <div>
                <strong>Propriétés de la vue</strong>
                <small>{selectedView.name}</small>
              </div>
              <Button type="button" variant="secondary" onClick={() => setIsViewPropertiesOpen(false)}>
                Fermer
              </Button>
            </header>
            <div className="resource-preview-modal__body">{renderViewPropertiesEditor()}</div>
          </section>
        </div>
      ) : null}

      {isSystemPropertiesOpen ? (
        <div className="resource-preview-modal" onClick={() => setIsSystemPropertiesOpen(false)}>
          <section className="resource-preview-modal__dialog" onClick={(event) => event.stopPropagation()}>
            <header className="resource-preview-modal__header">
              <div>
                <strong>Propriétés du système</strong>
                <small>{system.name}</small>
              </div>
              <Button type="button" variant="secondary" onClick={() => setIsSystemPropertiesOpen(false)}>
                Fermer
              </Button>
            </header>
            <div className="resource-preview-modal__body">{renderSystemPropertiesEditor()}</div>
          </section>
        </div>
      ) : null}

      {isCatalogManagerOpen ? (
        <div className="resource-preview-modal" onClick={() => setIsCatalogManagerOpen(false)}>
          <section className="resource-preview-modal__dialog resource-preview-modal__dialog--wide" onClick={(event) => event.stopPropagation()}>
            <header className="resource-preview-modal__header">
              <div>
                <strong>Catalogues système</strong>
                <small>{system.name}</small>
              </div>
              <Button type="button" variant="secondary" onClick={() => setIsCatalogManagerOpen(false)}>
                Fermer
              </Button>
            </header>
            <div className="resource-preview-modal__body">
              <SystemCatalogManager catalogs={system.catalogs ?? []} onChange={handleCatalogsChange} disabled={!canEdit} />
            </div>
          </section>
        </div>
      ) : null}

      {isDiscordConfigManagerOpen && !isDiscordConfigManagerDetachedBlocked ? (
        <DetachedStudioPanelPortal
          key={`discord-config-${discordConfigManagerRetryKey}`}
          panelKey="discord_config"
          title={`Nexus Forge - Configuration Discord - ${system.name}`}
          existingWindow={discordConfigManagerWindowRef.current}
          initialWidth={1480}
          initialHeight={980}
          onClose={() => {
            discordConfigManagerWindowRef.current = null;
            setIsDiscordConfigManagerOpen(false);
          }}
          onBlocked={() => setIsDiscordConfigManagerDetachedBlocked(true)}
        >
          <section className="studio-panel studio-panel--detached">
            <div className="card" style={{ margin: 0, display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong>Configuration Discord</strong>
                  <div>
                    <small>{system.name}</small>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    discordConfigManagerWindowRef.current = null;
                    setIsDiscordConfigManagerOpen(false);
                  }}
                >
                  Fermer
                </Button>
              </div>
              <SystemDiscordConfigManager config={system.discordConfig} onChange={handleDiscordConfigChange} disabled={!canEdit} views={schema.views} />
            </div>
          </section>
        </DetachedStudioPanelPortal>
      ) : null}

      {isDiscordConfigManagerOpen && isDiscordConfigManagerDetachedBlocked ? (
        <div
          className="resource-preview-modal"
          onClick={() => {
            discordConfigManagerWindowRef.current = null;
            setIsDiscordConfigManagerOpen(false);
          }}
        >
          <section className="resource-preview-modal__dialog resource-preview-modal__dialog--wide" onClick={(event) => event.stopPropagation()}>
            <header className="resource-preview-modal__header">
              <div>
                <strong>Configuration Discord</strong>
                <small>Fenêtre détachée bloquée : affichage temporaire en modale intégrée.</small>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const popup = openDiscordConfigManagerWindow();
                    discordConfigManagerWindowRef.current = popup;
                    setIsDiscordConfigManagerDetachedBlocked(!popup);
                    setDiscordConfigManagerRetryKey((value) => value + 1);
                  }}
                >
                  Réessayer en fenêtre
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    discordConfigManagerWindowRef.current = null;
                    setIsDiscordConfigManagerOpen(false);
                  }}
                >
                  Fermer
                </Button>
              </div>
            </header>
            <div className="resource-preview-modal__body">
              <SystemDiscordConfigManager config={system.discordConfig} onChange={handleDiscordConfigChange} disabled={!canEdit} views={schema.views} />
            </div>
          </section>
        </div>
      ) : null}

      {isCharacterCreationManagerOpen && !isCharacterCreationManagerDetachedBlocked ? (
        <DetachedStudioPanelPortal
          key={`character-creation-${characterCreationManagerRetryKey}`}
          panelKey="character_creation"
          title={`Nexus Forge - Règle création personnage - ${system.name}`}
          existingWindow={characterCreationManagerWindowRef.current}
          initialWidth={1540}
          initialHeight={980}
          onClose={() => {
            void closeCharacterCreationManager();
          }}
          onBlocked={() => setIsCharacterCreationManagerDetachedBlocked(true)}
        >
          <section className="studio-panel studio-panel--detached">
            <div className="card" style={{ margin: 0, display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <strong>Règle de création de personnage</strong>
                  <div>
                    <small>{system.name}</small>
                  </div>
                  {canEdit ? <small style={{ color: saveStatusColor }}>{saveStatusLabel}</small> : null}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button type="button" onClick={() => void handleSave()} disabled={!canEdit || isSaving}>
                    Enregistrer
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void closeCharacterCreationManager()}>
                    Fermer
                  </Button>
                </div>
              </div>
              {statusMessage ? <p style={{ color: '#067647', margin: 0 }}>{statusMessage}</p> : null}
              {errorMessage ? <p style={{ color: '#b42318', margin: 0 }}>{errorMessage}</p> : null}
              <SystemCharacterCreationConfigManager
                config={system.characterCreationConfig}
                onChange={handleCharacterCreationConfigChange}
                disabled={!canEdit}
                views={schema.views}
                catalogs={system.catalogs ?? []}
              />
            </div>
          </section>
        </DetachedStudioPanelPortal>
      ) : null}

      {isCharacterCreationManagerOpen && isCharacterCreationManagerDetachedBlocked ? (
        <div
          className="resource-preview-modal"
          onClick={() => {
            characterCreationManagerWindowRef.current = null;
            setIsCharacterCreationManagerOpen(false);
          }}
        >
          <section className="resource-preview-modal__dialog resource-preview-modal__dialog--wide" onClick={(event) => event.stopPropagation()}>
            <header className="resource-preview-modal__header">
              <div>
                <strong>Règle de création de personnage</strong>
                <small>Fenêtre détachée bloquée : affichage temporaire en modale intégrée.</small>
                {canEdit ? <div><small style={{ color: saveStatusColor }}>{saveStatusLabel}</small></div> : null}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button type="button" onClick={() => void handleSave()} disabled={!canEdit || isSaving}>
                  Enregistrer
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const popup = openCharacterCreationManagerWindow();
                    characterCreationManagerWindowRef.current = popup;
                    setIsCharacterCreationManagerDetachedBlocked(!popup);
                    setCharacterCreationManagerRetryKey((value) => value + 1);
                  }}
                >
                  Réessayer en fenêtre
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void closeCharacterCreationManager()}
                >
                  Fermer
                </Button>
              </div>
            </header>
            <div className="resource-preview-modal__body">
              {statusMessage ? <p style={{ color: '#067647', marginTop: 0 }}>{statusMessage}</p> : null}
              {errorMessage ? <p style={{ color: '#b42318', marginTop: 0 }}>{errorMessage}</p> : null}
              <SystemCharacterCreationConfigManager
                config={system.characterCreationConfig}
                onChange={handleCharacterCreationConfigChange}
                disabled={!canEdit}
                views={schema.views}
                catalogs={system.catalogs ?? []}
              />
            </div>
          </section>
        </div>
      ) : null}

      <section
        className={`screen-studio-layout screen-studio-layout--system${detachedPanels.left ? ' screen-studio-layout--left-detached' : ''}${detachedPanels.right ? ' screen-studio-layout--right-detached' : ''}`.trim()}
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
              <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{canvasMode === 'preview' ? 'Aperçu final (V2)' : 'Canvas grille'}</h2>
              <p style={{ margin: 0 }}>
                {selectedView?.name} | Scope : {currentScopeLabel} | Grille {selectedView?.gridColumns ?? 12} colonnes
              </p>
            </div>
            <div className="screen-runtime-tabs">
              <button type="button" className={`screen-runtime-tab ${canvasMode === 'edit' ? 'is-active' : ''}`.trim()} onClick={() => setCanvasMode('edit')}>Edition</button>
              <button type="button" className={`screen-runtime-tab ${canvasMode === 'preview' ? 'is-active' : ''}`.trim()} onClick={() => setCanvasMode('preview')}>Aperçu</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem', minWidth: '220px' }}>
              <span>Vue</span>
              <select value={selectedView?.id ?? ''} onChange={(event) => { setSelectedViewId(event.target.value); setScope({ parentId: null, slotKey: null }); }}>
                {schema.views.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Button type="button" variant="secondary" onClick={() => setIsViewPropertiesOpen(true)} disabled={!selectedView}>
                Propriétés vue
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleMoveView('up')}
                disabled={!canEdit || !selectedView || schema.views.findIndex((view) => view.id === selectedView.id) <= 0}
              >
                Monter
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleMoveView('down')}
                disabled={!canEdit || !selectedView || schema.views.findIndex((view) => view.id === selectedView.id) >= schema.views.length - 1}
              >
                Descendre
              </Button>
              <Button type="button" variant="secondary" onClick={handleAddView} disabled={!canEdit}>Nouvelle vue</Button>
              <Button type="button" variant="secondary" onClick={handleDeleteView} disabled={!canEdit || schema.views.length <= 1}>Supprimer la vue</Button>
              <Button type="button" variant="secondary" onClick={handleExportView} disabled={!selectedView}>Exporter la vue</Button>
              <Button type="button" variant="secondary" onClick={() => importViewInputRef.current?.click()} disabled={!canEdit}>Importer une vue</Button>
              <input
                ref={importViewInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(event) => void handleImportViewFile(event)}
              />
            </div>
          </div>

          {canvasMode === 'preview' ? (
            <SystemStudioV2Runtime
              view={selectedView}
              systemTheme={system?.studioTheme}
              catalogs={system?.catalogs}
              allViews={schema.views}
              values={previewValues}
              onValuesChange={setPreviewValues}
              editable
              preserveGridLayout
              previewRowHeight={ROW_HEIGHT}
            />
          ) : (
            <div
              ref={canvasRef}
              className="screen-studio-canvas"
              style={{
                ['--screen-grid-columns' as string]: String(selectedView?.gridColumns ?? 12),
                ['--screen-grid-rows' as string]: String(canvasRows),
                ['--screen-row-height' as string]: `${ROW_HEIGHT}px`
              }}
            >
              {scopeNodes.length === 0 ? <div className="screen-studio-canvas__empty">Ajoute des éléments dans ce scope pour commencer.</div> : null}
              {scopeNodes.map((node) => (
                <div
                  key={node.id}
                  className={`screen-studio-widget ${selectedNodeIds.includes(node.id) ? 'is-selected' : ''}`.trim()}
                  style={{
                    gridTemplateRows: 'auto 1fr',
                    zIndex: (node.zIndex ?? 0) + 1,
                    left: `calc((100% / ${selectedView?.gridColumns ?? 12}) * ${node.layout.x})`,
                    top: `calc(${ROW_HEIGHT}px * ${node.layout.y})`,
                    width: `calc((100% / ${selectedView?.gridColumns ?? 12}) * ${node.layout.w})`,
                    height: `calc(${ROW_HEIGHT}px * ${node.layout.h})`
                  }}
                  onMouseDown={(event) => handleSelectNode(event, node.id)}
                >
                  <div
                    className="screen-studio-widget__toolbar"
                    onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
                      event.stopPropagation();
                      if (!canEdit) {
                        return;
                      }
                      const currentSelection = selectedNodeIdsRef.current;
                      const nextSelection = resolveNextSelection(event, node.id, currentSelection);
                      setSelectedNodeIds(nextSelection);
                      setSelectedNodeId(node.id);
                      const targetIds = nextSelection.length ? nextSelection : [node.id];
                      const startLayouts = targetIds.reduce<Record<string, SystemStudioNodeDefinition['layout']>>((acc, id) => {
                        const target = selectedView?.nodes.find((item) => item.id === id);
                        if (target) {
                          acc[id] = { ...target.layout };
                        }
                        return acc;
                      }, {});
                      setDragState({
                        nodeIds: targetIds,
                        primaryNodeId: node.id,
                        mode: 'move',
                        startX: event.clientX,
                        startY: event.clientY,
                        startLayouts
                      });
                    }}
                  >
                    <span className="screen-studio-widget__toolbar-type">{node.type}</span>
                    <button type="button" className="screen-studio-widget__remove" onClick={(event) => { event.stopPropagation(); handleDeleteNode(); }} disabled={!canEdit || selectedNodeId !== node.id}>×</button>
                  </div>
                  <div className="screen-studio-widget__body">
                    <div className="screen-studio-widget__preview">
                      <strong>{node.label}</strong>
                      <small>{node.type === 'container' ? 'Structure conteneur' : node.type === 'tabs' ? 'Structure onglets' : node.key}</small>
                      {node.type === 'tabs' ? <small>{(node.tabs ?? []).map((tab) => tab.label).join(' · ') || 'Aucun onglet'}</small> : null}
                      {node.parentId ? <small>Parent : {node.parentId}</small> : <small>Racine</small>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="screen-studio-widget__resize"
                    onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      if (!canEdit) {
                        return;
                      }
                      handleSelectNode(event, node.id);
                      setDragState({
                        nodeIds: [node.id],
                        primaryNodeId: node.id,
                        mode: 'resize',
                        startX: event.clientX,
                        startY: event.clientY,
                        startLayouts: { [node.id]: { ...node.layout } }
                      });
                    }}
                    disabled={!canEdit}
                    aria-label={`Redimensionner ${node.label}`}
                  />
                </div>
              ))}
            </div>
          )}
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
          title="Nexus Forge - Studio système - Palette"
          onClose={() => {
            if (ignoreDetachedCloseRef.current) {
              return;
            }
            setDetachedPanels((current) => ({ ...current, left: false }));
          }}
          onBlocked={() => setDetachedBlocked((current) => ({ ...current, left: true }))}
        >
          <section className="studio-panel studio-panel--detached">{renderLeftPanel(true)}</section>
        </DetachedStudioPanelPortal>
      ) : null}
      {detachedPanels.right ? (
        <DetachedStudioPanelPortal
          key={`right-${detachedRetryKey.right}`}
          panelKey="right"
          title="Nexus Forge - Studio système - Propriétés"
          onClose={() => {
            if (ignoreDetachedCloseRef.current) {
              return;
            }
            setDetachedPanels((current) => ({ ...current, right: false }));
          }}
          onBlocked={() => setDetachedBlocked((current) => ({ ...current, right: true }))}
        >
          <section className="studio-panel studio-panel--detached">{renderRightPanel(true)}</section>
        </DetachedStudioPanelPortal>
      ) : null}
      {detachedPanels.formula && formulaComposer && !detachedBlocked.formula ? (
        <DetachedStudioPanelPortal
          key={`formula-${detachedRetryKey.formula}`}
          panelKey="formula"
          title={`Nexus Forge - ${formulaComposer.title}`}
          onClose={() => {
            if (ignoreDetachedCloseRef.current) {
              return;
            }
            setDetachedPanels((current) => ({ ...current, formula: false }));
            setFormulaComposer(null);
          }}
          onBlocked={() => setDetachedBlocked((current) => ({ ...current, formula: true }))}
        >
          <section className="studio-panel studio-panel--detached">
            <FormulaComposer
              state={formulaComposer}
              onClose={() => {
                setDetachedPanels((current) => ({ ...current, formula: false }));
                setFormulaComposer(null);
              }}
              onApply={applyFormulaComposer}
              onSearchChange={(value) => updateFormulaComposer((current) => ({ ...current, search: value }))}
              onFormulaChange={(value) => updateFormulaComposer((current) => ({ ...current, value }))}
              onSelectionChange={(start, end) => updateFormulaComposer((current) => ({ ...current, selectionStart: start, selectionEnd: end }))}
              onInsert={(token) =>
                updateFormulaComposer((current) => ({
                  ...current,
                  ...insertFormulaTokenAtSelection(current.value, token, current.selectionStart, current.selectionEnd)
                }))
              }
              onTestValueChange={(token, value) =>
                updateFormulaComposer((current) => ({
                  ...current,
                  testValues: {
                    ...current.testValues,
                    [token]: value
                  }
                }))
              }
              onUseRecent={(value) => updateFormulaComposer((current) => ({ ...current, value, selectionStart: value.length, selectionEnd: value.length }))}
              onToggleFavorite={toggleFormulaFavorite}
              onSaveCustomPreset={(label, value) => saveCustomPreset(label, value, formulaComposer.mode)}
              onRenameCustomPreset={(previousLabel, nextLabel, value) => renameCustomPreset(previousLabel, nextLabel, value, formulaComposer.mode)}
              onDeleteCustomPreset={(label, value) => deleteCustomPreset(label, value, formulaComposer.mode)}
              onExportCustomPresets={() => exportCustomPresets(formulaComposer.mode)}
              onImportCustomPresets={(file) => void importCustomPresets(file, formulaComposer.mode)}
              variables={formulaVariableCandidates}
              favoriteTokens={formulaFavorites}
              customPresets={customFormulaPresets.filter((entry) => entry.mode === formulaComposer.mode)}
              recentEntries={formulaRecents.filter((entry) => entry.mode === formulaComposer.mode)}
              selectedView={selectedView}
              allViews={schema.views}
            />
          </section>
        </DetachedStudioPanelPortal>
      ) : null}
      {detachedPanels.formula && formulaComposer && detachedBlocked.formula
        ? createPortal(
            <div className="resource-preview-modal" onClick={() => {
              setDetachedPanels((current) => ({ ...current, formula: false }));
              setFormulaComposer(null);
            }}>
              <section
                className="resource-preview-modal__dialog"
                style={{ width: 'min(1280px, 98vw)' }}
                onClick={(event) => event.stopPropagation()}
              >
                <header className="resource-preview-modal__header">
                  <div>
                    <strong>{formulaComposer.title}</strong>
                    <small>Fenêtre détachée bloquée : le compositeur est affiché dans une modale intégrée.</small>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setDetachedPanels((current) => ({ ...current, formula: false }));
                      setFormulaComposer(null);
                    }}
                  >
                    Fermer
                  </Button>
                </header>
                <div className="resource-preview-modal__body">
                  <FormulaComposer
                    state={formulaComposer}
                    onClose={() => {
                      setDetachedPanels((current) => ({ ...current, formula: false }));
                      setFormulaComposer(null);
                    }}
                    onApply={applyFormulaComposer}
                    onSearchChange={(value) => updateFormulaComposer((current) => ({ ...current, search: value }))}
                    onFormulaChange={(value) => updateFormulaComposer((current) => ({ ...current, value }))}
                    onSelectionChange={(start, end) => updateFormulaComposer((current) => ({ ...current, selectionStart: start, selectionEnd: end }))}
                    onInsert={(token) =>
                      updateFormulaComposer((current) => ({
                        ...current,
                        ...insertFormulaTokenAtSelection(current.value, token, current.selectionStart, current.selectionEnd)
                      }))
                    }
                    onTestValueChange={(token, value) =>
                      updateFormulaComposer((current) => ({
                        ...current,
                        testValues: {
                          ...current.testValues,
                          [token]: value
                        }
                      }))
                    }
                    onUseRecent={(value) => updateFormulaComposer((current) => ({ ...current, value, selectionStart: value.length, selectionEnd: value.length }))}
                    onToggleFavorite={toggleFormulaFavorite}
                    onSaveCustomPreset={(label, value) => saveCustomPreset(label, value, formulaComposer.mode)}
                    onRenameCustomPreset={(previousLabel, nextLabel, value) => renameCustomPreset(previousLabel, nextLabel, value, formulaComposer.mode)}
                    onDeleteCustomPreset={(label, value) => deleteCustomPreset(label, value, formulaComposer.mode)}
                    onExportCustomPresets={() => exportCustomPresets(formulaComposer.mode)}
                    onImportCustomPresets={(file) => void importCustomPresets(file, formulaComposer.mode)}
                    variables={formulaVariableCandidates}
                    favoriteTokens={formulaFavorites}
                    customPresets={customFormulaPresets.filter((entry) => entry.mode === formulaComposer.mode)}
                    recentEntries={formulaRecents.filter((entry) => entry.mode === formulaComposer.mode)}
                    selectedView={selectedView}
                    allViews={schema.views}
                  />
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </Layout>
  );
}
