import { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import AuthenticatedImage from './AuthenticatedImage';
import { messageRepository } from '../data/repositories/messageRepository';
import { Message } from '../types/message';
import { evaluateSafeBooleanExpression, evaluateSafeNumericExpression } from '../services/safeExpressionEvaluator';
import {
  SystemCatalogDefinition,
  SystemCatalogEntryDefinition,
  StudioAlignmentHorizontal,
  StudioAlignmentVertical,
  StudioBackgroundPosition,
  StudioBackgroundRepeat,
  StudioBackgroundSize,
  StudioBorderType,
  StudioGaugeOrientation,
  StudioThemeDefinition,
  StudioTypographyFamily,
  StudioTypographySize,
  SystemStudioNodeDefinition,
  SystemStudioViewDefinitionV2
} from '../types/system';

export type SystemStudioV2RepeatItemValue = Record<string, unknown>;
export type SystemStudioV2Value = string | number | boolean | string[] | SystemStudioV2RepeatItemValue[];
export type SystemStudioV2Values = Record<string, SystemStudioV2Value>;
export type SystemStudioV2TemplateContext = Record<string, string>;
type RuntimeValidationErrors = Record<string, string | null>;
type CatalogPickerState = {
  catalogKey: string;
  targetCollectionKey: string;
  sourceNodeLabel: string;
} | null;

type PopupViewState = {
  viewId: string;
  sourceNodeLabel?: string;
  repeatBinding?: {
    sourceKey: string;
    sourceIndex: number;
    itemLabel: string;
  };
} | null;

type RepeatRuntimeItem = {
  id: string;
  label: string;
  sourceIndex: number;
  values: SystemStudioV2Values;
  templateContext: SystemStudioV2TemplateContext;
  propertyBindings?: Record<string, string>;
};

type RepeatBindingTarget = {
  sourceKey: string;
  sourceView: SystemStudioViewDefinitionV2;
};

type RuntimeStyle = CSSProperties & Record<string, string | number | undefined>;

function getContextValue(context: Record<string, unknown> | undefined, token: string): unknown {
  if (!context) {
    return undefined;
  }
  return token.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);
}

function encodeExpressionString(value: string): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
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

function defaultValueForType(type: 'text' | 'textarea' | 'number' | 'checkbox' | 'select'): string | number | boolean {
  if (type === 'number') {
    return 0;
  }
  if (type === 'checkbox') {
    return false;
  }
  return '';
}

function makeRuntimeInstanceId(): string {
  return `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function childNodes(nodes: SystemStudioNodeDefinition[], parentId: string | null, slotKey: string | null) {
  return nodes
    .filter((node) => (node.parentId ?? null) === parentId && (node.slotKey ?? null) === slotKey)
    .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
}

function baseEffectiveNodeLayout(
  node: SystemStudioNodeDefinition,
  view: SystemStudioViewDefinitionV2,
  nodes: SystemStudioNodeDefinition[],
  preserveGridLayout: boolean
): SystemStudioNodeDefinition['layout'] {
  if (!preserveGridLayout || node.parentId) {
    return node.layout;
  }
  const rootNodes = childNodes(nodes, null, null);
  if (rootNodes.length !== 1 || rootNodes[0]?.id !== node.id) {
    return node.layout;
  }
  return {
    ...node.layout,
    x: 0,
    w: view.gridColumns
  };
}

function layoutOffsetFor(
  nodes: SystemStudioNodeDefinition[],
  parentId: string | null,
  slotKey: string | null,
  view: SystemStudioViewDefinitionV2,
  preserveGridLayout: boolean
): { x: number; y: number } {
  if (!preserveGridLayout) {
    return { x: 0, y: 0 };
  }
  const siblings = childNodes(nodes, parentId, slotKey);
  if (!siblings.length) {
    return { x: 0, y: 0 };
  }
  return siblings.reduce(
    (accumulator, sibling) => {
      const layout = baseEffectiveNodeLayout(sibling, view, nodes, preserveGridLayout);
      return {
        x: Math.min(accumulator.x, layout.x),
        y: Math.min(accumulator.y, layout.y)
      };
    },
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }
  );
}

function visibleTabs(
  tabs: SystemStudioNodeDefinition['tabs'],
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext?: SystemStudioV2TemplateContext
) {
  return (tabs ?? []).filter(
    (tab) => !tab.visibleIf || evaluateCondition(tab.visibleIf, values, view, allViews, templateContext)
  );
}

function resolveLinkedView(
  node: SystemStudioNodeDefinition,
  allViews: SystemStudioViewDefinitionV2[]
): SystemStudioViewDefinitionV2 | null {
  const target = node.targetViewId || node.targetViewRef || node.reference || '';
  if (!target) {
    return null;
  }
  return (
    allViews.find(
      (view) => view.id === target || view.reference === target || view.name === target
    ) ?? null
  );
}

function resolveButtonTargetView(
  target: string | undefined,
  currentView: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[]
): SystemStudioViewDefinitionV2 | null {
  const normalized = String(target ?? '').trim();
  if (!normalized) {
    return null;
  }
  return (
    allViews.find(
      (view) => view.id === normalized || view.reference === normalized || view.name === normalized
    ) ??
    (normalized === currentView.id || normalized === currentView.reference || normalized === currentView.name ? currentView : null)
  );
}

function createCatalogInstance(
  catalog: SystemCatalogDefinition,
  entry: SystemCatalogEntryDefinition
): Record<string, unknown> {
  const copiedValues = Object.fromEntries(
    catalog.columns.map((column) => [column.key, entry.values[column.key] ?? defaultValueForType(column.type)])
  );
  return {
    ...copiedValues,
    instanceId: makeRuntimeInstanceId(),
    catalogKey: catalog.key,
    templateId: entry.id,
    quantite: 1,
    equipe: false,
    notes: ''
  };
}

function duplicateRuntimeItemInstance(item: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    instanceId: makeRuntimeInstanceId()
  };
}

function normalizeRuntimeQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return 0;
}

function resolveCatalogDefinition(
  catalogs: SystemCatalogDefinition[] | undefined,
  token: string | undefined
): SystemCatalogDefinition | null {
  const normalized = String(token ?? '').trim();
  if (!catalogs?.length) {
    return null;
  }
  if (!normalized) {
    return catalogs.length === 1 ? catalogs[0] : null;
  }
  return (
    catalogs.find(
      (catalog) =>
        catalog.key === normalized ||
        catalog.id === normalized ||
        catalog.label === normalized
    ) ?? null
  );
}

const GRID_STEP = 0.5;
const GRID_FACTOR = 1 / GRID_STEP;

function gridRowsFor(
  view: SystemStudioViewDefinitionV2,
  nodes: SystemStudioNodeDefinition[],
  preserveGridLayout: boolean
): number {
  if (!preserveGridLayout || !nodes.length) {
    return 1;
  }
  const occupiedRows = occupiedRowUnitsFor(nodes, nodes[0]?.parentId ?? null, nodes[0]?.slotKey ?? null, view, preserveGridLayout);
  return Math.max(1, occupiedRows.length);
}

function occupiedRowUnitsFor(
  nodes: SystemStudioNodeDefinition[],
  parentId: string | null,
  slotKey: string | null,
  view: SystemStudioViewDefinitionV2,
  preserveGridLayout: boolean
): number[] {
  if (!preserveGridLayout) {
    return [];
  }
  const siblings = childNodes(nodes, parentId, slotKey);
  const offset = layoutOffsetFor(nodes, parentId, slotKey, view, preserveGridLayout);
  const occupied = new Set<number>();
  for (const sibling of siblings) {
    const layout = baseEffectiveNodeLayout(sibling, view, nodes, preserveGridLayout);
    const start = Math.max(0, Math.round((layout.y - offset.y) * GRID_FACTOR));
    const span = Math.max(1, Math.round(layout.h * GRID_FACTOR));
    for (let unit = start; unit < start + span; unit += 1) {
      occupied.add(unit);
    }
  }
  return Array.from(occupied).sort((a, b) => a - b);
}

function compactedRowStartFor(
  node: SystemStudioNodeDefinition,
  nodes: SystemStudioNodeDefinition[],
  view: SystemStudioViewDefinitionV2,
  preserveGridLayout: boolean
): number {
  const layout = baseEffectiveNodeLayout(node, view, nodes, preserveGridLayout);
  const offset = layoutOffsetFor(nodes, node.parentId ?? null, node.slotKey ?? null, view, preserveGridLayout);
  const occupiedRows = occupiedRowUnitsFor(nodes, node.parentId ?? null, node.slotKey ?? null, view, preserveGridLayout);
  const originalStart = Math.max(0, Math.round((layout.y - offset.y) * GRID_FACTOR));
  let compactedStart = 0;
  for (const rowUnit of occupiedRows) {
    if (rowUnit < originalStart) {
      compactedStart += 1;
    }
  }
  return compactedStart;
}

function runtimeGridStyle(
  view: SystemStudioViewDefinitionV2,
  nodes: SystemStudioNodeDefinition[],
  preserveGridLayout: boolean,
  previewRowHeight: number
): CSSProperties {
  const scaledColumns = Math.max(1, Math.round(view.gridColumns * GRID_FACTOR));
  const scaledRowHeight = previewRowHeight * GRID_STEP;
  return preserveGridLayout
    ? {
        gridTemplateColumns: `repeat(${scaledColumns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${gridRowsFor(view, nodes, preserveGridLayout)}, minmax(${scaledRowHeight}px, auto))`
      }
    : {
        ['--system-v2-columns' as string]: String(view.gridColumns)
      };
}

function toDisplayValue(value: SystemStudioV2Value | unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(', ');
  }
  return String(value);
}

function replaceReservedTokens(value: string, context?: SystemStudioV2TemplateContext): string {
  if (!value || !context) {
    return value;
  }
  return value.replace(/\{\{([A-Za-z0-9_.]+)\}\}/g, (_, token: string) => {
    const resolved = getContextValue(context, token);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
}

function tokenParts(token: string): { base: string; index: number | null; isArray: boolean } {
  const match = token.match(/^(.*?)(\[(\d+)\]|\[\])$/);
  if (!match) {
    return { base: token, index: null, isArray: false };
  }
  if (match[2] === '[]') {
    return { base: match[1], index: null, isArray: true };
  }
  return { base: match[1], index: Number(match[3]), isArray: false };
}

function splitTokenPath(token: string): string[] {
  return token.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
}

function normalizeLookupValue(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookupIdentifier(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function findNodeByKeyOrLabel(
  nodes: SystemStudioNodeDefinition[],
  rawIdentifier: string | null | undefined
): SystemStudioNodeDefinition | null {
  const identifier = String(rawIdentifier ?? '').trim();
  if (!identifier) {
    return null;
  }
  const exactMatch =
    nodes.find((item) => item.key === identifier) ??
    nodes.find((item) => item.label === identifier) ??
    null;
  if (exactMatch) {
    return exactMatch;
  }
  const normalizedIdentifier = normalizeLookupValue(identifier);
  if (!normalizedIdentifier) {
    return null;
  }
  const normalizedSlug = normalizeLookupIdentifier(identifier);
  return (
    nodes.find((item) => normalizeLookupValue(item.key) === normalizedIdentifier) ??
    nodes.find((item) => normalizeLookupValue(item.label) === normalizedIdentifier) ??
    nodes.find((item) => normalizeLookupIdentifier(item.key) === normalizedSlug) ??
    nodes.find((item) => normalizeLookupIdentifier(item.label) === normalizedSlug) ??
    null
  );
}

function resolveValueFromNode(node: SystemStudioNodeDefinition, values: SystemStudioV2Values, templateContext?: SystemStudioV2TemplateContext): SystemStudioV2Value {
  if (node.key in values) {
    return values[node.key];
  }
  return defaultRuntimeValue(node, templateContext);
}

function resolveTokenValue(params: {
  token: string;
  values: SystemStudioV2Values;
  view: SystemStudioViewDefinitionV2;
  allViews: SystemStudioViewDefinitionV2[];
  templateContext?: SystemStudioV2TemplateContext;
}): SystemStudioV2Value | undefined {
  const { token, values, view, allViews, templateContext } = params;
  const tokenPath = splitTokenPath(token);
  if (tokenPath.length >= 2 && tokenPath[0] === 'item') {
    const scopedItemValue = getContextValue({ item: values as unknown as Record<string, unknown> }, tokenPath.join('.'));
    if (scopedItemValue !== undefined) {
      return scopedItemValue as SystemStudioV2Value | undefined;
    }
    return getContextValue(templateContext, tokenPath.join('.')) as SystemStudioV2Value | undefined;
  }
  if (tokenPath.length >= 3 && tokenPath[1] === 'item') {
    const nestedToken = tokenPath.slice(1).join('.');
    const scopedItemValue = getContextValue({ item: values as unknown as Record<string, unknown> }, nestedToken);
    if (scopedItemValue !== undefined) {
      return scopedItemValue as SystemStudioV2Value | undefined;
    }
    return getContextValue(templateContext, nestedToken) as SystemStudioV2Value | undefined;
  }
  const { base, index, isArray } = tokenParts(token);
  const [viewRef, label] = base.includes('.') ? base.split('.', 2) : [null, base];
  const scopeView =
    viewRef
      ? allViews.find((item) => item.reference === viewRef || item.id === viewRef || item.name === viewRef) ?? null
      : view;
  if (!scopeView) {
    return undefined;
  }
  const node = findNodeByKeyOrLabel(scopeView.nodes, label);
  if (!node) {
    if (label in values) {
      return values[label];
    }
    return getContextValue(templateContext, label) as SystemStudioV2Value | undefined;
  }
  const raw = resolveValueFromNode(node, values, templateContext);
  if (Array.isArray(raw)) {
    if (isArray) {
      return raw;
    }
    if (index !== null) {
      return toDisplayValue(raw[index] ?? '');
    }
  }
  return raw;
}

function resolveBindingTarget(
  token: string | undefined,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[]
): RepeatBindingTarget | null {
  const trimmed = String(token ?? '').trim().replace(/^@/, '');
  if (!trimmed) {
    return null;
  }
  const parts = splitTokenPath(trimmed);
  if (!parts.length) {
    return null;
  }
  if (parts.length === 1) {
    return { sourceKey: parts[0], sourceView: view };
  }
  const [viewRef, ...rest] = parts;
  const targetView = allViews.find((item) => item.reference === viewRef || item.id === viewRef || item.name === viewRef) ?? null;
  if (!targetView || !rest.length) {
    return { sourceKey: trimmed, sourceView: view };
  }
  const targetLabel = rest.join('.');
  const targetNode = findNodeByKeyOrLabel(targetView.nodes, targetLabel);
  if (!targetNode) {
    return { sourceKey: targetLabel, sourceView: targetView };
  }
  return { sourceKey: targetNode.key, sourceView: targetView };
}

function replaceRuntimeTokens(
  value: string,
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  context?: SystemStudioV2TemplateContext
): string {
  if (!value) {
    return value;
  }
  const withContext = replaceReservedTokens(value, context);
  const withBraces = withContext.replace(/\{\{([A-Za-z0-9_.\[\]]+)\}\}/g, (_, token: string) => {
    const resolved = resolveTokenValue({ token, values, view, allViews, templateContext: context });
    if (resolved !== undefined) {
      return toDisplayValue(resolved);
    }
    return '';
  });
  return withBraces.replace(/@([A-Za-z0-9_.\[\]]+)/g, (_, token: string) => {
    const resolved = resolveTokenValue({ token, values, view, allViews, templateContext: context });
    if (resolved !== undefined) {
      return toDisplayValue(resolved);
    }
    return '';
  });
}

function toNumber(value: SystemStudioV2Value | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatDateValue(raw: string, format: SystemStudioNodeDefinition['dateFormat']): string {
  if (!raw) {
    return '';
  }
  const [year, month, day] = raw.split('-');
  if (!year || !month || !day) {
    return raw;
  }
  switch (format) {
    case 'annee-mois-jour':
      return `${year}-${month}-${day}`;
    case 'jour mois texte annee': {
      const date = new Date(`${year}-${month}-${day}T00:00:00`);
      return Number.isNaN(date.getTime())
        ? raw
        : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    }
    case 'jour/mois/annee':
    default:
      return `${day}/${month}/${year}`;
  }
}

function formatTimeValue(raw: string, format: SystemStudioNodeDefinition['timeFormat']): string {
  if (!raw) {
    return '';
  }
  const [hour, minute] = raw.split(':');
  if (!hour || !minute) {
    return raw;
  }
  if (format === '12h') {
    const numericHour = Number(hour);
    if (!Number.isFinite(numericHour)) {
      return raw;
    }
    const suffix = numericHour >= 12 ? 'PM' : 'AM';
    const adjusted = numericHour % 12 || 12;
    return `${String(adjusted).padStart(2, '0')}:${minute} ${suffix}`;
  }
  return `${hour}:${minute}`;
}

function parseRepeatItemsFromText(raw: string): Array<Record<string, unknown>> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item, index) => {
        if (item && typeof item === 'object') {
          return item as Record<string, unknown>;
        }
        return { value: item, label: String(item), index };
      });
    }
  } catch {
    // Fallback line-based parsing.
  }
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ value: line, label: line, index }));
}

function parseFieldRepeatDefinitions(raw: string): Array<{ token: string; label?: string }> {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [token, label] = line.split('=>').map((part) => part.trim());
      return { token, label: label || undefined };
    });
}

function repeatStorageKey(node: SystemStudioNodeDefinition): string {
  return `__repeat__:${node.key}`;
}

function normalizeRepeatItem(item: unknown, index: number): RepeatRuntimeItem {
  const objectItem = item && typeof item === 'object' ? (item as Record<string, unknown>) : { value: item, label: String(item ?? '') };
  const label = String(objectItem.label ?? objectItem.name ?? objectItem.title ?? objectItem.value ?? `Element ${index + 1}`);
  const flatValues = Object.entries(objectItem).reduce<SystemStudioV2Values>((accumulator, [key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      accumulator[key] = value;
    } else if (Array.isArray(value)) {
      accumulator[key] = value.map((entry) => String(entry));
    }
    return accumulator;
  }, {});
  const templateContext = {
    item: Object.entries(objectItem).reduce<Record<string, string>>(
      (accumulator, [key, value]) => {
        if (value === undefined || value === null) {
          return accumulator;
        }
        accumulator[key] = Array.isArray(value) ? value.join(', ') : String(value);
        return accumulator;
      },
      {
        label,
        index: String(index + 1),
        value: String(objectItem.value ?? label),
        selected: String(Boolean(objectItem.selected ?? objectItem.checked ?? objectItem.value)),
        checked: String(Boolean(objectItem.checked ?? objectItem.selected ?? objectItem.value))
      }
    )
  } as unknown as SystemStudioV2TemplateContext;
  return {
    id: String(objectItem.id ?? objectItem.key ?? `repeat-item-${index + 1}`),
    label,
    sourceIndex: index,
    values: flatValues,
    templateContext
  };
}

function resolveRepeatSourceView(
  node: SystemStudioNodeDefinition,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[]
): SystemStudioViewDefinitionV2 {
  const source = (node.repeat?.source ?? '').trim().replace(/^@/, '');
  if (!source) {
    return view;
  }
  return allViews.find((item) => item.reference === source || item.id === source || item.name === source) ?? view;
}

function buildFieldRepeatItems(params: {
  node: SystemStudioNodeDefinition;
  values: SystemStudioV2Values;
  view: SystemStudioViewDefinitionV2;
  allViews: SystemStudioViewDefinitionV2[];
  templateContext?: SystemStudioV2TemplateContext;
}): RepeatRuntimeItem[] {
  const { node, values, view, allViews, templateContext } = params;
  const sourceView = resolveRepeatSourceView(node, view, allViews);
  const definitions = parseFieldRepeatDefinitions(node.repeat?.fieldItemsText ?? '');
  const targets: Array<{ targetNode: SystemStudioNodeDefinition; customLabel: string | undefined; index: number }> = [];

  if (definitions.length > 0) {
    definitions.forEach((definition, index) => {
      const targetNode = findNodeByKeyOrLabel(sourceView.nodes, definition.token);
      if (!targetNode) {
        return;
      }
      targets.push({ targetNode, customLabel: definition.label, index });
    });
  } else {
    sourceView.nodes
      .filter((candidate) => isEditableNode(candidate) && candidate.type !== 'textarea')
      .forEach((targetNode, index) => {
        targets.push({ targetNode, customLabel: undefined, index });
      });
  }

  return targets.map(({ targetNode, customLabel, index }) => {
    const rawValue = resolveValueFromNode(targetNode, values, templateContext);
    const label = customLabel || targetNode.label;
    const isChecked = targetNode.type === 'checkbox' ? Boolean(rawValue) : false;
    return {
      id: `${node.id}-field-${targetNode.id}`,
      label,
      sourceIndex: index,
      values: {
        key: targetNode.key,
        label,
        value: rawValue,
        selected: isChecked,
        checked: isChecked
      },
      templateContext: {
        item: {
          key: targetNode.key,
          label,
          value: toDisplayValue(rawValue),
          selected: String(isChecked),
          checked: String(isChecked),
          index: String(index + 1)
        },
        index: String(index + 1)
      } as unknown as SystemStudioV2TemplateContext,
      propertyBindings: {
        value: targetNode.key
      }
    };
  });
}

function resolveRepeatItems(
  node: SystemStudioNodeDefinition,
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext?: SystemStudioV2TemplateContext
): RepeatRuntimeItem[] {
  const repeat = node.repeat;
  if (!repeat || repeat.mode === 'none') {
    return [];
  }

  if (repeat.mode === 'fields') {
    return buildFieldRepeatItems({ node, values, view, allViews, templateContext });
  }

  if (repeat.mode === 'manual') {
    const storedItems = values[repeatStorageKey(node)];
    if (Array.isArray(storedItems)) {
      return storedItems.map(normalizeRepeatItem);
    }
    return parseRepeatItemsFromText(repeat.manualItemsText ?? '').map(normalizeRepeatItem);
  }

  const sourceToken = (repeat.source ?? '').trim().replace(/^@/, '');
  if (!sourceToken) {
    return [];
  }

  const bindingTarget = resolveBindingTarget(sourceToken, view, allViews);
  const rawSource =
    (bindingTarget ? (values[bindingTarget.sourceKey] as unknown) : undefined) ??
    resolveTokenValue({ token: sourceToken, values, view, allViews, templateContext }) ??
    getContextValue(templateContext, sourceToken);
  if (Array.isArray(rawSource)) {
    return rawSource.map(normalizeRepeatItem);
  }
  if (typeof rawSource === 'string') {
    return parseRepeatItemsFromText(rawSource).map(normalizeRepeatItem);
  }
  return [];
}

export function evaluateMathExpression(
  expression: string,
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext?: SystemStudioV2TemplateContext
): number | null {
  const withBraces = expression.replace(/\{\{([A-Za-z0-9_.\[\]]+)\}\}/g, (_, token: string) => {
    const resolved = resolveTokenValue({ token, values, view, allViews, templateContext });
    return String(toNumber(resolved as SystemStudioV2Value));
  });
  const withValues = withBraces.replace(/@([A-Za-z0-9_.\[\]]+)/g, (_, token: string) => {
    const resolved = resolveTokenValue({ token, values, view, allViews, templateContext });
    return String(toNumber(resolved as SystemStudioV2Value));
  });
  if (!/^[0-9A-Za-z_+\-*/%(),.<>=!\s]+$/.test(withValues)) {
    return null;
  }
  try {
    const helpers = {
      ifEq: (left: number, right: number, whenTrue: number, whenFalse: number) => (left === right ? whenTrue : whenFalse),
      ifGte: (value: number, threshold: number, whenTrue: number, whenFalse: number) =>
        (value >= threshold ? whenTrue : whenFalse),
      ifLte: (value: number, threshold: number, whenTrue: number, whenFalse: number) =>
        (value <= threshold ? whenTrue : whenFalse),
      min: Math.min,
      max: Math.max,
      abs: Math.abs,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      clamp: (value: number, lower: number, upper: number) => Math.min(Math.max(value, lower), upper)
    };
    return evaluateSafeNumericExpression(withValues, helpers);
  } catch {
    return null;
  }
}

export function evaluateCondition(
  condition: string,
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext?: SystemStudioV2TemplateContext
): boolean {
  const withBraces = condition.replace(/\{\{([A-Za-z0-9_.\[\]]+)\}\}/g, (_, key: string) => {
    const value = resolveTokenValue({ token: key, values, view, allViews, templateContext });
    if (typeof value === 'string') {
      return encodeExpressionString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return String(value.length);
    }
    return '0';
  });

  const withValues = withBraces.replace(/@([A-Za-z0-9_.\[\]]+)/g, (_, key: string) => {
    const value = resolveTokenValue({ token: key, values, view, allViews, templateContext });
    if (typeof value === 'string') {
      return encodeExpressionString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return String(value.length);
    }
    return '0';
  });

  if (!/^[A-Za-z0-9_+\-*/%<>=!&|().\s'",\\]+$/.test(withValues)) {
    return false;
  }

  return evaluateSafeBooleanExpression(withValues);
}

function filterRepeatItems(params: {
  node: SystemStudioNodeDefinition;
  items: RepeatRuntimeItem[];
  values: SystemStudioV2Values;
  view: SystemStudioViewDefinitionV2;
  allViews: SystemStudioViewDefinitionV2[];
  templateContext?: SystemStudioV2TemplateContext;
}) {
  const { node, items, values, view, allViews, templateContext } = params;
  const filter = node.repeat?.filter?.trim();
  if (!filter) {
    return items;
  }
  return items.filter((item) =>
    evaluateCondition(filter, { ...values, ...item.values }, view, allViews, { ...(templateContext ?? {}), ...item.templateContext })
  );
}

function repeatListStyle(node: SystemStudioNodeDefinition, previewRowHeight: number): CSSProperties {
  const repeat = node.repeat;
  const flow = repeat?.flow ?? 'horizontal';
  const itemWidth = Math.max(0.5, Number(repeat?.itemWidth ?? 3) || 3);
  const itemHeight = Math.max(0.5, Number(repeat?.itemHeight ?? 2) || 2);
  const gapX = Math.max(0, Number(repeat?.gapX ?? 0.5) || 0);
  const gapY = Math.max(0, Number(repeat?.gapY ?? 0.5) || 0);
  const maxPerRow = Math.max(1, Math.floor((node.layout.w || 1) / itemWidth));
  const maxPerColumn = Math.max(1, Math.floor((node.layout.h || 1) / itemHeight));
  const minItemHeight = `${Math.max(1, itemHeight * previewRowHeight)}px`;
  return flow === 'vertical'
    ? {
        gridAutoFlow: 'column',
        gridTemplateRows: `repeat(${maxPerColumn}, minmax(${minItemHeight}, auto))`,
        gridAutoColumns: `minmax(0, ${100 / Math.max(1, Math.ceil((node.layout.w || 1) / itemWidth))}%)`,
        columnGap: `${gapX * previewRowHeight}px`,
        rowGap: `${gapY * previewRowHeight}px`
      }
    : {
        gridTemplateColumns: `repeat(${maxPerRow}, minmax(0, 1fr))`,
        columnGap: `${gapX * previewRowHeight}px`,
        rowGap: `${gapY * previewRowHeight}px`
      };
}

function resolveNumericConstraint(
  rawFormula: string | undefined,
  fallbackValue: number | undefined,
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext?: SystemStudioV2TemplateContext
): number | undefined {
  if (rawFormula?.trim()) {
    const evaluated = evaluateMathExpression(rawFormula, values, view, allViews, templateContext);
    if (typeof evaluated === 'number' && Number.isFinite(evaluated)) {
      return evaluated;
    }
    const coerced = Number(evaluated);
    if (Number.isFinite(coerced)) {
      return coerced;
    }
  }
  return typeof fallbackValue === 'number' ? fallbackValue : undefined;
}

function validateRuntimeValue(
  node: SystemStudioNodeDefinition,
  value: SystemStudioV2Value,
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext?: SystemStudioV2TemplateContext
): string | null {
  if (node.required) {
    if (value === '' || value === null || value === undefined) {
      return node.validationMessage || 'Champ obligatoire.';
    }
    if (Array.isArray(value) && value.length === 0) {
      return node.validationMessage || 'Champ obligatoire.';
    }
  }

  if ((node.type === 'number' || node.type === 'progress') && typeof value === 'number') {
    const resolvedMin = resolveNumericConstraint(node.minFormula, node.min, values, view, allViews, templateContext);
    const resolvedMax = resolveNumericConstraint(node.maxFormula, node.max, values, view, allViews, templateContext);
    if (typeof resolvedMin === 'number' && value < resolvedMin) {
      return node.validationMessage || `Minimum: ${resolvedMin}`;
    }
    if (typeof resolvedMax === 'number' && value > resolvedMax) {
      return node.validationMessage || `Maximum: ${resolvedMax}`;
    }
  }

  if (node.validationPattern && typeof value === 'string') {
    try {
      const re = new RegExp(node.validationPattern);
      if (!re.test(value)) {
        return node.validationMessage || 'Format invalide.';
      }
    } catch {
      return 'Regex de validation invalide.';
    }
  }

  return null;
}

function toCssBorderStyle(style?: StudioBorderType): CSSProperties['borderStyle'] {
  switch (style) {
    case 'pointille':
      return 'dotted';
    case 'tiret':
      return 'dashed';
    case 'double':
      return 'double';
    case 'solide':
    default:
      return 'solid';
  }
}

function toCssFontFamily(family?: StudioTypographyFamily): CSSProperties['fontFamily'] {
  switch (family) {
    case 'serif':
      return 'Georgia, serif';
    case 'sans-serif':
      return '"Segoe UI", sans-serif';
    case 'monospace':
      return '"JetBrains Mono", monospace';
    case 'fantaisie':
      return '"Trebuchet MS", "Segoe UI", sans-serif';
    case 'par_defaut':
    default:
      return undefined;
  }
}

function toCssFontSize(size?: StudioTypographySize): CSSProperties['fontSize'] {
  switch (size) {
    case 'xs':
      return '0.75rem';
    case 'sm':
      return '0.875rem';
    case 'lg':
      return '1.125rem';
    case 'xl':
      return '1.35rem';
    case 'md':
    default:
      return '1rem';
  }
}

function toCssTextAlign(align?: StudioAlignmentHorizontal): CSSProperties['textAlign'] {
  switch (align) {
    case 'centre':
      return 'center';
    case 'droite':
      return 'right';
    case 'gauche':
    default:
      return 'left';
  }
}

function toCssAlignItems(align?: StudioAlignmentHorizontal): CSSProperties['alignItems'] {
  switch (align) {
    case 'centre':
      return 'center';
    case 'droite':
      return 'flex-end';
    case 'etirer':
      return 'stretch';
    case 'gauche':
    default:
      return 'flex-start';
  }
}

function toCssJustifyContent(align?: StudioAlignmentVertical): CSSProperties['justifyContent'] {
  switch (align) {
    case 'centre':
      return 'center';
    case 'bas':
      return 'flex-end';
    case 'etirer':
      return 'stretch';
    case 'haut':
    default:
      return 'flex-start';
  }
}

function toCssBackgroundSize(size?: StudioBackgroundSize): string {
  switch (size) {
    case 'auto':
      return 'auto';
    case 'contenir':
      return 'contain';
    case 'etirer':
      return '100% 100%';
    case 'couvrir':
    default:
      return 'cover';
  }
}

function toCssBackgroundPosition(position?: StudioBackgroundPosition): string {
  switch (position) {
    case 'haut':
      return 'center top';
    case 'bas':
      return 'center bottom';
    case 'gauche':
      return 'left center';
    case 'droite':
      return 'right center';
    case 'haut_gauche':
      return 'left top';
    case 'haut_droite':
      return 'right top';
    case 'bas_gauche':
      return 'left bottom';
    case 'bas_droite':
      return 'right bottom';
    case 'centre':
    default:
      return 'center center';
  }
}

function toCssBackgroundRepeat(repeat?: StudioBackgroundRepeat): string {
  switch (repeat) {
    case 'repeter':
      return 'repeat';
    case 'repeter_x':
      return 'repeat-x';
    case 'repeter_y':
      return 'repeat-y';
    case 'aucune':
    default:
      return 'no-repeat';
  }
}

function resolveThemeValue<K extends keyof StudioThemeDefinition>(
  node: SystemStudioNodeDefinition,
  view: SystemStudioViewDefinitionV2,
  systemTheme: StudioThemeDefinition | undefined,
  key: K
): StudioThemeDefinition[K] | undefined {
  const nodeValue = node[key as keyof SystemStudioNodeDefinition] as StudioThemeDefinition[K] | undefined;
  if (nodeValue !== undefined && nodeValue !== null && !(typeof nodeValue === 'string' && !nodeValue.trim())) {
    return nodeValue;
  }
  const viewValue = view.theme?.[key];
  if (viewValue !== undefined && viewValue !== null && !(typeof viewValue === 'string' && !viewValue.trim())) {
    return viewValue;
  }
  const systemValue = systemTheme?.[key];
  if (systemValue !== undefined && systemValue !== null && !(typeof systemValue === 'string' && !systemValue.trim())) {
    return systemValue;
  }
  return undefined;
}

function applyBackgroundOpacity(color: string | undefined, opacity: number | null | undefined): string | undefined {
  const trimmed = color?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (typeof opacity !== 'number') {
    return trimmed;
  }
  const alpha = Math.max(0, Math.min(1, opacity));

  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const expanded = hex.length === 3 ? hex.split('').map((char) => `${char}${char}`).join('') : hex;
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const channels = rgbMatch[1].split(',').map((part) => part.trim());
    if (channels.length >= 3) {
      return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
    }
  }

  return trimmed;
}

function runtimeTextStyle(
  node: SystemStudioNodeDefinition,
  view: SystemStudioViewDefinitionV2,
  systemTheme?: StudioThemeDefinition
): CSSProperties {
  return {
    color: resolveThemeValue(node, view, systemTheme, 'textColor')?.trim() || undefined,
    fontFamily: toCssFontFamily(node.typographyFamily),
    fontSize: toCssFontSize(node.typographySize),
    fontWeight: node.typographyBold ? 700 : 400,
    fontStyle: node.typographyItalic ? 'italic' : 'normal',
    textAlign: toCssTextAlign(node.horizontalAlign)
  };
}

function runtimeFieldLabelStyle(
  node: SystemStudioNodeDefinition,
  view: SystemStudioViewDefinitionV2,
  systemTheme?: StudioThemeDefinition
): CSSProperties {
  const styleMode = node.fieldLabelStyleMode ?? view.theme?.fieldLabelStyleMode ?? systemTheme?.fieldLabelStyleMode ?? 'commun';
  if (styleMode !== 'separe') {
    return runtimeTextStyle(node, view, systemTheme);
  }
  const labelFamily = node.fieldLabelTypographyFamily ?? view.theme?.fieldLabelTypographyFamily ?? systemTheme?.fieldLabelTypographyFamily;
  const labelSize = node.fieldLabelTypographySize ?? view.theme?.fieldLabelTypographySize ?? systemTheme?.fieldLabelTypographySize;
  const labelBold = node.fieldLabelTypographyBold ?? view.theme?.fieldLabelTypographyBold ?? systemTheme?.fieldLabelTypographyBold;
  const labelItalic = node.fieldLabelTypographyItalic ?? view.theme?.fieldLabelTypographyItalic ?? systemTheme?.fieldLabelTypographyItalic;
  return {
    color:
      node.fieldLabelTextColor?.trim() ||
      view.theme?.fieldLabelTextColor?.trim() ||
      systemTheme?.fieldLabelTextColor?.trim() ||
      resolveThemeValue(node, view, systemTheme, 'textColor')?.trim() ||
      undefined,
    fontFamily: toCssFontFamily(labelFamily),
    fontSize: toCssFontSize(labelSize),
    fontWeight: labelBold ? 700 : 400,
    fontStyle: labelItalic ? 'italic' : 'normal',
    textAlign: toCssTextAlign(node.horizontalAlign)
  };
}

function runtimeInputStyle(
  node: SystemStudioNodeDefinition,
  view: SystemStudioViewDefinitionV2,
  systemTheme?: StudioThemeDefinition
): CSSProperties {
  const backgroundOpacity = resolveThemeValue(node, view, systemTheme, 'backgroundOpacity');
  return {
    ...runtimeTextStyle(node, view, systemTheme),
    backgroundColor: applyBackgroundOpacity(
      resolveThemeValue(node, view, systemTheme, 'inputBackgroundColor')?.trim() || undefined,
      typeof backgroundOpacity === 'number' ? backgroundOpacity : null
    ),
    color: resolveThemeValue(node, view, systemTheme, 'inputTextColor')?.trim() || resolveThemeValue(node, view, systemTheme, 'textColor')?.trim() || undefined,
    borderColor: resolveThemeValue(node, view, systemTheme, 'inputBorderColor')?.trim() || undefined
  };
}

function runtimeContainerStyle(
  node: SystemStudioNodeDefinition,
  view: SystemStudioViewDefinitionV2,
  systemTheme?: StudioThemeDefinition
): CSSProperties {
  const backgroundColor = resolveThemeValue(node, view, systemTheme, 'backgroundColor')?.trim() || undefined;
  const borderColor = resolveThemeValue(node, view, systemTheme, 'borderColor')?.trim() || undefined;
  const backgroundImage = resolveThemeValue(node, view, systemTheme, 'backgroundImage')?.trim() || undefined;
  const backgroundOpacity = resolveThemeValue(node, view, systemTheme, 'backgroundOpacity');
  const backgroundSize = resolveThemeValue(node, view, systemTheme, 'backgroundSize');
  const backgroundPosition = resolveThemeValue(node, view, systemTheme, 'backgroundPosition');
  const backgroundRepeat = resolveThemeValue(node, view, systemTheme, 'backgroundRepeat');
  const style: RuntimeStyle = {
    ...runtimeTextStyle(node, view, systemTheme)
  };
  if (node.hideBorder || node.showBorder === false) {
    style.border = 'none';
    style.boxShadow = 'none';
  } else {
    style.borderWidth = node.borderStyle === 'double' ? '3px' : '1px';
    style.borderStyle = toCssBorderStyle(node.borderStyle);
    style.borderColor = borderColor || 'rgba(72, 93, 131, 0.42)';
  }
  if (backgroundColor) {
    style.backgroundColor = applyBackgroundOpacity(backgroundColor, typeof backgroundOpacity === 'number' ? backgroundOpacity : null);
  }
  if (backgroundImage) {
    style['--system-runtime-bg-image' as string] = `url("${backgroundImage.replace(/"/g, '\\"')}")`;
    style['--system-runtime-bg-opacity' as string] = String(
      Math.max(0, Math.min(1, typeof backgroundOpacity === 'number' ? backgroundOpacity : 1))
    );
    style['--system-runtime-bg-size' as string] = toCssBackgroundSize(backgroundSize);
    style['--system-runtime-bg-position' as string] = toCssBackgroundPosition(backgroundPosition);
    style['--system-runtime-bg-repeat' as string] = toCssBackgroundRepeat(backgroundRepeat);
  }
  style.alignItems = toCssAlignItems(node.horizontalAlign);
  style.justifyContent = toCssJustifyContent(node.verticalAlign);
  return style;
}

function runtimeViewStyle(view: SystemStudioViewDefinitionV2, systemTheme?: StudioThemeDefinition): CSSProperties {
  const backgroundColor = view.theme?.backgroundColor?.trim() || systemTheme?.backgroundColor?.trim() || undefined;
  const textColor = view.theme?.textColor?.trim() || systemTheme?.textColor?.trim() || undefined;
  const borderColor = view.theme?.borderColor?.trim() || systemTheme?.borderColor?.trim() || undefined;
  const backgroundImage = view.theme?.backgroundImage?.trim() || systemTheme?.backgroundImage?.trim() || undefined;
  const backgroundOpacity =
    typeof view.theme?.backgroundOpacity === 'number'
      ? view.theme.backgroundOpacity
      : typeof systemTheme?.backgroundOpacity === 'number'
        ? systemTheme.backgroundOpacity
        : null;
  const backgroundSize = view.theme?.backgroundSize ?? systemTheme?.backgroundSize;
  const backgroundPosition = view.theme?.backgroundPosition ?? systemTheme?.backgroundPosition;
  const backgroundRepeat = view.theme?.backgroundRepeat ?? systemTheme?.backgroundRepeat;
  const style: RuntimeStyle = {};
  if (backgroundColor) {
    style.backgroundColor = applyBackgroundOpacity(backgroundColor, backgroundOpacity);
  }
  if (textColor) {
    style.color = textColor;
  }
  if (borderColor) {
    style.borderColor = borderColor;
  }
  if (backgroundImage) {
    style['--system-runtime-bg-image'] = `url("${backgroundImage.replace(/"/g, '\\"')}")`;
    style['--system-runtime-bg-opacity'] = String(Math.max(0, Math.min(1, typeof backgroundOpacity === 'number' ? backgroundOpacity : 1)));
    style['--system-runtime-bg-size'] = toCssBackgroundSize(backgroundSize);
    style['--system-runtime-bg-position'] = toCssBackgroundPosition(backgroundPosition);
    style['--system-runtime-bg-repeat'] = toCssBackgroundRepeat(backgroundRepeat);
  }
  return style;
}

function formatDisplayValue(node: SystemStudioNodeDefinition, value: SystemStudioV2Value, options: Array<{ key: string; label: string }>): string {
  if (node.type === 'select') {
    const selected = options.find((option) => option.key === String(value));
    return node.selectDisplayMode === 'cle' ? String(value ?? '') : selected?.label || String(value ?? '');
  }
  if (node.type === 'multiselect') {
    const values = Array.isArray(value) ? value : [];
    return values
      .map((item) => {
        const selected = options.find((option) => option.key === String(item));
        return node.selectDisplayMode === 'cle' ? String(item) : selected?.label || String(item);
      })
      .join(', ');
  }
  if (node.type === 'number' || node.type === 'progress') {
    const numberValue = toNumber(value);
    const decimals = typeof node.formatDecimals === 'number' ? node.formatDecimals : undefined;
    const formatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? 2,
      useGrouping: node.formatThousands !== false
    }).format(numberValue);
    return `${node.formatPrefix || ''}${formatted}${node.formatSuffix || ''}`;
  }
  if (node.type === 'date' || node.type === 'time') {
    const raw = String(value ?? '');
    if (node.type === 'date') {
      return formatDateValue(raw, node.dateFormat);
    }
    return formatTimeValue(raw, node.timeFormat);
  }
  return String(value ?? node.fallbackDisplay ?? '');
}

function defaultRuntimeValue(node: SystemStudioNodeDefinition, templateContext?: SystemStudioV2TemplateContext): SystemStudioV2Value {
  if (node.type === 'checkbox') {
    return Boolean(node.defaultValue);
  }
  if (node.type === 'date' || node.type === 'time') {
    return typeof node.defaultValue === 'string' ? replaceReservedTokens(node.defaultValue, templateContext) : '';
  }
  if (node.type === 'number') {
    return typeof node.defaultValue === 'number' ? node.defaultValue : Number(node.defaultValue) || 0;
  }
  if (node.type === 'progress') {
    if (typeof node.defaultValue === 'number') {
      return node.defaultValue;
    }
    if (typeof node.defaultValue === 'string' && node.defaultValue.trim()) {
      return replaceReservedTokens(node.defaultValue, templateContext);
    }
    return 0;
  }
  if (node.type === 'select') {
    if (typeof node.defaultValue === 'string' && node.defaultValue.trim()) {
      return replaceReservedTokens(node.defaultValue, templateContext);
    }
    return parseOptions(node.options)[0]?.key ?? '';
  }
  if (node.type === 'multiselect') {
    if (typeof node.defaultValue === 'string' && node.defaultValue.trim()) {
      return replaceReservedTokens(node.defaultValue, templateContext)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }
  return typeof node.defaultValue === 'string' ? replaceReservedTokens(node.defaultValue, templateContext) : '';
}

export function buildInitialSystemStudioV2Values(
  view: SystemStudioViewDefinitionV2 | null,
  templateContext?: SystemStudioV2TemplateContext
): SystemStudioV2Values {
  if (!view) {
    return {};
  }
  return view.nodes.reduce<SystemStudioV2Values>((accumulator, node) => {
    accumulator[node.key] = defaultRuntimeValue(node, templateContext);
    if (node.type === 'container' && node.repeat?.mode === 'manual') {
      accumulator[repeatStorageKey(node)] = parseRepeatItemsFromText(node.repeat.manualItemsText ?? '');
    }
    return accumulator;
  }, {});
}

export function buildInitialSystemStudioV2ValuesForViews(
  views: SystemStudioViewDefinitionV2[] | null | undefined,
  templateContext?: SystemStudioV2TemplateContext
): SystemStudioV2Values {
  return (views ?? []).reduce<SystemStudioV2Values>((accumulator, currentView) => {
    const nextValues = buildInitialSystemStudioV2Values(currentView, templateContext);
    return {
      ...accumulator,
      ...nextValues
    };
  }, {});
}

export function applySystemStudioV2Formulas(
  view: SystemStudioViewDefinitionV2,
  values: SystemStudioV2Values,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext?: SystemStudioV2TemplateContext
): SystemStudioV2Values {
  let next = { ...values };
  for (let i = 0; i < 4; i += 1) {
    let changed = false;
    for (const node of view.nodes) {
      if (!node.formula?.trim()) {
        continue;
      }
      const result = evaluateMathExpression(node.formula.trim(), next, view, allViews, templateContext);
      if (result === null) {
        continue;
      }
      if (next[node.key] !== result) {
        next[node.key] = result;
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  return next;
}

function isEditableNode(node: SystemStudioNodeDefinition): boolean {
  return ['text', 'textarea', 'date', 'time', 'number', 'checkbox', 'select', 'multiselect', 'image'].includes(node.type);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Lecture impossible'));
    reader.readAsDataURL(file);
  });
}

function resolveFieldSplit(node: SystemStudioNodeDefinition): { layout: 'ligne' | 'colonne' | 'texte_cache'; labelSpan: number; inputSpan: number } {
  const layout = node.fieldLayout ?? 'colonne';
  const totalWidth = Math.max(1, Math.round(node.layout.w || 1));
  if (layout === 'colonne') {
    return { layout, labelSpan: totalWidth, inputSpan: totalWidth };
  }
  if (layout === 'texte_cache') {
    return { layout, labelSpan: 0, inputSpan: totalWidth };
  }
  const desiredLabel = typeof node.fieldLabelSpan === 'number' && Number.isFinite(node.fieldLabelSpan) ? Math.round(node.fieldLabelSpan) : Math.max(1, Math.round(totalWidth * 0.6));
  const desiredInput = typeof node.fieldInputSpan === 'number' && Number.isFinite(node.fieldInputSpan) ? Math.round(node.fieldInputSpan) : Math.max(1, totalWidth - desiredLabel);
  const normalizedLabel = Math.max(1, Math.min(totalWidth - 1, desiredLabel));
  const remaining = totalWidth - normalizedLabel;
  const normalizedInput = Math.max(1, Math.min(remaining, desiredInput || remaining));
  return { layout, labelSpan: normalizedLabel, inputSpan: normalizedInput };
}

function fieldClassName(node: SystemStudioNodeDefinition, extra?: string): string {
  const split = resolveFieldSplit(node);
  return [
    'system-studio-v2-runtime__field',
    `system-studio-v2-runtime__field--${split.layout}`,
    `system-studio-v2-runtime__field--type-${node.type}`,
    extra ?? ''
  ]
.filter(Boolean)
    .join(' ');
}

function fieldStyleFor(node: SystemStudioNodeDefinition): CSSProperties {
  const split = resolveFieldSplit(node);
  return split.layout === 'ligne'
    ? {
        gridTemplateColumns:
          node.type === 'checkbox'
            ? `minmax(0, ${split.inputSpan}fr) minmax(0, ${split.labelSpan}fr)`
            : `minmax(0, ${split.labelSpan}fr) minmax(0, ${split.inputSpan}fr)`
      }
    : {};
}

function renderFieldShell(params: {
  node: SystemStudioNodeDefinition;
  fieldLayoutStyle: CSSProperties;
  fieldLabelStyle: CSSProperties;
  content: ReactNode;
  error?: string | null;
}) {
  const { node, fieldLayoutStyle, fieldLabelStyle, content, error } = params;
  const split = resolveFieldSplit(node);
  return (
    <label className={fieldClassName(node)} style={fieldLayoutStyle}>
      <span className={split.layout === 'texte_cache' ? 'system-studio-v2-runtime__field-label sr-only' : 'system-studio-v2-runtime__field-label'} style={fieldLabelStyle}>
        {node.label}
      </span>
      <div className="system-studio-v2-runtime__field-value">{content}</div>
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function renderLeaf(params: {
  node: SystemStudioNodeDefinition;
  values: SystemStudioV2Values;
  view: SystemStudioViewDefinitionV2;
  systemTheme?: StudioThemeDefinition;
  allViews: SystemStudioViewDefinitionV2[];
  editable: boolean;
  templateContext?: SystemStudioV2TemplateContext;
  validationErrors: RuntimeValidationErrors;
  onValueChange?: (view: SystemStudioViewDefinitionV2, key: string, value: SystemStudioV2Value) => void;
  onRepeatValueChange?: (view: SystemStudioViewDefinitionV2, containerNode: SystemStudioNodeDefinition, itemIndex: number, key: string, value: SystemStudioV2Value) => void;
  onButtonAction?: (
    node: SystemStudioNodeDefinition,
    view: SystemStudioViewDefinitionV2,
    repeatContext?: { containerNode: SystemStudioNodeDefinition; itemIndex: number; item?: RepeatRuntimeItem }
  ) => void;
  repeatContext?: { containerNode: SystemStudioNodeDefinition; itemIndex: number; item?: RepeatRuntimeItem };
  flatMode?: boolean;
}) {
  const { node, values, view, systemTheme, allViews, editable, templateContext, validationErrors, onValueChange, onRepeatValueChange, onButtonAction, repeatContext, flatMode = false } = params;
  const options = parseOptions(node.options);
  const rawValue =
    repeatContext && node.key in values
      ? values[node.key]
      : values[node.key];
  const stringValue = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
  const displayText = formatDisplayValue(node, rawValue, options);
  const isEditable =
    editable &&
    isEditableNode(node) &&
    (!node.editableIf?.trim() || evaluateCondition(node.editableIf, values, view, allViews, templateContext));
  const fieldStyle = runtimeTextStyle(node, view, systemTheme);
  const fieldInputStyle = runtimeInputStyle(node, view, systemTheme);
  const fieldLayoutStyle = fieldStyleFor(node);
  const fieldLabelStyle = runtimeFieldLabelStyle(node, view, systemTheme);
  const resolvedMin = resolveNumericConstraint(node.minFormula, node.min, values, view, allViews, templateContext);
  const resolvedMax = resolveNumericConstraint(node.maxFormula, node.max, values, view, allViews, templateContext);
  const commitValue = (value: SystemStudioV2Value) => {
    if (repeatContext) {
      onRepeatValueChange?.(view, repeatContext.containerNode, repeatContext.itemIndex, node.key, value);
      return;
    }
    onValueChange?.(view, node.key, value);
  };

  switch (node.type) {
    case 'static_text':
      return (
        <p className="system-studio-v2-runtime__static-text" style={{ margin: 0, whiteSpace: 'pre-wrap', ...fieldStyle }}>
          {replaceRuntimeTokens(String(node.defaultValue ?? node.label), values, view, allViews, templateContext)}
        </p>
      );
    case 'text':
      return renderFieldShell({
        node,
        fieldLayoutStyle,
        fieldLabelStyle,
        content: (
          <input
            value={stringValue}
            readOnly={!isEditable}
            placeholder={node.placeholder || ''}
            maxLength={node.maxLength ?? undefined}
            style={fieldInputStyle}
            onChange={(event) => commitValue(event.target.value)}
          />
        ),
        error: validationErrors[node.key]
      });
    case 'textarea':
      return renderFieldShell({
        node,
        fieldLayoutStyle,
        fieldLabelStyle,
        content: (
          <textarea
            rows={node.defaultRowsVisible ?? 4}
            value={stringValue}
            readOnly={!isEditable}
            placeholder={node.placeholder || ''}
            maxLength={node.maxLength ?? undefined}
            style={fieldInputStyle}
            onChange={(event) => commitValue(event.target.value)}
          />
        ),
        error: validationErrors[node.key]
      });
    case 'date':
      return renderFieldShell({
        node,
        fieldLayoutStyle,
        fieldLabelStyle,
        content: isEditable ? (
            <input
              type="date"
              value={stringValue}
              style={fieldInputStyle}
              onChange={(event) => commitValue(event.target.value)}
            />
          ) : (
            <p style={{ margin: 0, ...fieldStyle }}>{displayText || node.fallbackDisplay || 'N/A'}</p>
          ),
        error: validationErrors[node.key]
      });
    case 'time':
      return renderFieldShell({
        node,
        fieldLayoutStyle,
        fieldLabelStyle,
        content: isEditable ? (
            <input
              type="time"
              value={stringValue}
              style={fieldInputStyle}
              onChange={(event) => commitValue(event.target.value)}
            />
          ) : (
            <p style={{ margin: 0, ...fieldStyle }}>{displayText || node.fallbackDisplay || 'N/A'}</p>
          ),
        error: validationErrors[node.key]
      });
    case 'number':
      return renderFieldShell({
        node,
        fieldLayoutStyle,
        fieldLabelStyle,
        content: isEditable ? (
            <input
              type="number"
              value={toNumber(rawValue)}
              min={typeof resolvedMin === 'number' ? resolvedMin : undefined}
              max={typeof resolvedMax === 'number' ? resolvedMax : undefined}
              step={typeof node.step === 'number' ? node.step : undefined}
              style={fieldInputStyle}
              onChange={(event) => commitValue(Number(event.target.value) || 0)}
            />
          ) : (
            <p style={{ margin: 0, ...fieldStyle }}>{displayText || node.fallbackDisplay || 'N/A'}</p>
          ),
        error: validationErrors[node.key]
      });
    case 'checkbox':
      {
        const split = resolveFieldSplit(node);
      return (
        <label
          className={`${fieldClassName(node, 'system-studio-v2-runtime__field--checkbox')} checkbox-shape-${node.checkboxShape ?? 'carre'} checkbox-style-${node.checkboxActiveStyle ?? 'coche'}`.trim()}
          style={fieldLayoutStyle}
        >
          <input
            type="checkbox"
            checked={Boolean(rawValue)}
            disabled={!isEditable}
            style={fieldInputStyle}
            onChange={(event) => commitValue(event.target.checked)}
          />
          <span className={split.layout === 'texte_cache' ? 'sr-only' : undefined} style={fieldLabelStyle}>{node.checkboxLabel || node.label}</span>
        </label>
      );
      }
    case 'image': {
      const src =
        typeof rawValue === 'string' && rawValue
          ? replaceRuntimeTokens(rawValue, values, view, allViews, templateContext)
          : replaceRuntimeTokens(typeof node.defaultValue === 'string' ? node.defaultValue : node.reference || '', values, view, allViews, templateContext);
      const inputId = `system-runtime-image-${node.id}${repeatContext ? `-${repeatContext.itemIndex}` : ''}`;
      const imageContent = src ? (
        <AuthenticatedImage
          src={src}
          alt={node.imageAlt || node.label}
          className="system-studio-v2-runtime__image"
          style={{
            objectFit:
              node.imageFit === 'couvrir'
                ? 'cover'
                : node.imageFit === 'etirer'
                ? 'fill'
                : node.imageFit === 'taille_reelle'
                ? 'none'
                : 'contain',
            width: node.imageWidth || undefined,
            height: node.imageHeight || undefined
          }}
        />
      ) : (
        <div className="system-studio-v2-runtime__placeholder">Aucune image</div>
      );
      return (
        <div className="system-studio-v2-runtime__image-field">
          {imageContent}
          {isEditable ? (
            <div className="system-studio-v2-runtime__image-actions">
              <input
                id={inputId}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) {
                    return;
                  }
                  void readFileAsDataUrl(file)
                    .then((dataUrl) => commitValue(dataUrl))
                    .catch(() => undefined);
                }}
              />
              <label htmlFor={inputId}>
                <span className="button secondary system-studio-v2-runtime__image-trigger">
                  {src ? 'Changer image' : 'Ajouter image'}
                </span>
              </label>
              {src ? (
                <Button type="button" variant="secondary" onClick={() => commitValue('')}>
                  Retirer
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }
    case 'select':
      return renderFieldShell({
        node,
        fieldLayoutStyle,
        fieldLabelStyle,
        content: isEditable ? (
            <select
              value={stringValue || options[0]?.key || ''}
              style={fieldInputStyle}
              onChange={(event) => commitValue(event.target.value)}
            >
              {node.valueAllowsEmpty ? <option value="">Aucune valeur</option> : null}
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <p style={{ margin: 0, ...fieldStyle }}>{displayText || node.fallbackDisplay || 'N/A'}</p>
          ),
        error: validationErrors[node.key]
      });
    case 'multiselect': {
      const selectedValues = Array.isArray(rawValue) ? rawValue.map((item) => String(item)) : [];
      return renderFieldShell({
        node,
        fieldLayoutStyle,
        fieldLabelStyle,
        content: isEditable ? (
            <select
              multiple
              value={selectedValues}
              style={fieldInputStyle}
              onChange={(event) =>
                commitValue(Array.from(event.target.selectedOptions).map((option) => option.value))
              }
            >
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="system-studio-v2-runtime__chips" style={fieldStyle}>
              {selectedValues.length ? (
                selectedValues.map((key) => {
                  const option = options.find((item) => item.key === key);
                  return (
                    <span key={key} className="character-chip">
                      {option?.label || key}
                    </span>
                  );
                })
              ) : (
                <span className="system-studio-v2-runtime__placeholder">Aucune option</span>
              )}
            </div>
          ),
        error: validationErrors[node.key]
      });
    }
    case 'progress': {
        const gaugeMax = node.gaugeMaxFormula
          ? Math.max(1, toNumber(evaluateMathExpression(node.gaugeMaxFormula, values, view, allViews, templateContext) ?? 0))
          : 100;
      const resolvedRawValue =
        typeof rawValue === 'string' && rawValue.trim()
          ? evaluateMathExpression(rawValue, values, view, allViews, templateContext)
          : rawValue;
      const value = Math.max(0, Math.min(gaugeMax, toNumber(resolvedRawValue ?? undefined)));
      const percentage = gaugeMax > 0 ? Math.max(0, Math.min(100, (value / gaugeMax) * 100)) : 0;
      const gaugeMetaText = [
        node.gaugeShowValues !== false
          ? `${formatDisplayValue(node, value, options)} / ${formatDisplayValue(node, gaugeMax, options)}`
          : '',
        node.gaugeShowPercentage ? `${Math.round(percentage)}%` : ''
      ]
        .filter(Boolean)
        .join(' · ');
      return (
        <div className="system-studio-v2-runtime__progress">
          <div className="system-studio-v2-runtime__progress-meta">
            {node.gaugeShowLabel !== false ? <span>{node.label}</span> : null}
            {gaugeMetaText ? <strong>{gaugeMetaText}</strong> : null}
          </div>
          <div
            className="character-resource__bar"
            style={{
              background: node.gaugeTrackColor || undefined,
              width: node.gaugeWidth || undefined,
              height: node.gaugeHeight || undefined,
              minHeight: node.gaugeOrientation === 'verticale' ? '8rem' : undefined,
              display: 'flex',
              alignItems: node.gaugeOrientation === 'verticale' ? 'flex-end' : 'stretch'
            }}
          >
            <span
              style={{
                width: node.gaugeOrientation === 'verticale' ? '100%' : `${percentage}%`,
                height: node.gaugeOrientation === 'verticale' ? `${percentage}%` : '100%',
                background: node.gaugeFillColor || undefined
              }}
            />
          </div>
        </div>
      );
    }
    case 'button':
      {
        if (flatMode) {
          return null;
        }
        const buttonEnabled =
          !node.buttonActiveIf || evaluateCondition(node.buttonActiveIf, values, view, allViews, templateContext);
        const buttonText = replaceRuntimeTokens(String(node.defaultValue || node.label || 'Action'), values, view, allViews, templateContext);
        const showIcon = node.buttonContentMode === 'icone' || node.buttonContentMode === 'texte_icone' || node.buttonContentMode === 'icone_texte';
        const showText = node.buttonContentMode !== 'icone';
        return (
          <Button type="button" variant="secondary" disabled={!buttonEnabled} onClick={() => onButtonAction?.(node, view, repeatContext)}>
            <span className="system-studio-v2-runtime__button-content">
              {showIcon && node.buttonIcon ? <span className="system-studio-v2-runtime__button-icon" aria-hidden="true">{node.buttonIcon}</span> : null}
              {showText ? <span>{buttonText}</span> : null}
            </span>
          </Button>
        );
      }
    default:
      return <div className="system-studio-v2-runtime__placeholder">Element non pris en charge</div>;
  }
}

function RuntimeNode(props: {
  node: SystemStudioNodeDefinition;
  nodes: SystemStudioNodeDefinition[];
  view: SystemStudioViewDefinitionV2;
  systemTheme?: StudioThemeDefinition;
  values: SystemStudioV2Values;
  editable: boolean;
  templateContext?: SystemStudioV2TemplateContext;
  validationErrors: RuntimeValidationErrors;
  onValueChange?: (view: SystemStudioViewDefinitionV2, key: string, value: SystemStudioV2Value) => void;
  onRepeatValueChange?: (view: SystemStudioViewDefinitionV2, containerNode: SystemStudioNodeDefinition, itemIndex: number, key: string, value: SystemStudioV2Value) => void;
  onButtonAction?: (
    node: SystemStudioNodeDefinition,
    view: SystemStudioViewDefinitionV2,
    repeatContext?: { containerNode: SystemStudioNodeDefinition; itemIndex: number; item?: RepeatRuntimeItem }
  ) => void;
  repeatContext?: { containerNode: SystemStudioNodeDefinition; itemIndex: number };
  allViews: SystemStudioViewDefinitionV2[];
  visitedViewIds: string[];
  preserveGridLayout?: boolean;
  previewRowHeight?: number;
  flatMode?: boolean;
}) {
  const {
    node,
    nodes,
    view,
    systemTheme,
    values,
    editable,
    templateContext,
    onValueChange,
    validationErrors,
    onRepeatValueChange,
    onButtonAction,
    repeatContext,
    allViews,
    visitedViewIds,
    preserveGridLayout = false,
    previewRowHeight = 36,
    flatMode = false
  } = props;
  const tabs = useMemo(
    () => visibleTabs(node.tabs, values, view, allViews, templateContext),
    [allViews, node.tabs, templateContext, values, view]
  );
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? '');

  useEffect(() => {
    if (!tabs.length) {
      setActiveTabId('');
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? '');
    }
  }, [activeTabId, tabs]);

  const children = useMemo(
    () => childNodes(nodes, node.id, null),
    [node.id, nodes]
  );

  if (node.showIf && !evaluateCondition(node.showIf, values, view, allViews, templateContext)) {
    return null;
  }

  const style: CSSProperties = {
    ...(function () {
      const layout = baseEffectiveNodeLayout(node, view, nodes, preserveGridLayout);
      const offset = layoutOffsetFor(nodes, node.parentId ?? null, node.slotKey ?? null, view, preserveGridLayout);
      const compactedRowStart = compactedRowStartFor(node, nodes, view, preserveGridLayout);
      return {
    gridColumn: preserveGridLayout
      ? `${Math.max(1, Math.round((layout.x - offset.x) * GRID_FACTOR) + 1)} / span ${Math.max(1, Math.round(layout.w * GRID_FACTOR))}`
      : `span ${Math.max(1, Math.min(view.gridColumns, layout.w))}`,
    gridRow: preserveGridLayout ? `${Math.max(1, compactedRowStart + 1)} / span ${Math.max(1, Math.round(layout.h * GRID_FACTOR))}` : undefined,
    minHeight: preserveGridLayout ? undefined : `${layout.h * 2.2}rem`
      };
    })(),
    zIndex: node.zIndex ?? 0,
    ...runtimeContainerStyle(node, view, systemTheme)
  };

  if (node.type === 'container') {
    const repeatItems = filterRepeatItems({
      node,
      items: resolveRepeatItems(node, values, view, allViews, templateContext),
      values,
      view,
      allViews,
      templateContext
    });
    const usesRepeatMode = Boolean(node.repeat && node.repeat.mode && node.repeat.mode !== 'none');
    const renderContainerChildren = (
      scopedValues: SystemStudioV2Values,
      scopedTemplateContext?: SystemStudioV2TemplateContext,
      scopedRepeatContext?: { containerNode: SystemStudioNodeDefinition; itemIndex: number; item?: RepeatRuntimeItem }
    ) => (
      <div
        className={`system-studio-v2-runtime__grid${preserveGridLayout ? ' system-studio-v2-runtime__grid--preserve-layout' : ''}`.trim()}
        style={runtimeGridStyle(view, children, preserveGridLayout, previewRowHeight)}
      >
        {children.map((child) => (
          <RuntimeNode
            key={`${child.id}${scopedRepeatContext ? `-${scopedRepeatContext.itemIndex}` : ''}`}
            node={child}
            nodes={nodes}
            view={view}
            systemTheme={systemTheme}
            values={scopedValues}
            editable={editable}
            templateContext={scopedTemplateContext}
            validationErrors={validationErrors}
            onValueChange={onValueChange}
            onRepeatValueChange={onRepeatValueChange}
            onButtonAction={onButtonAction}
            repeatContext={scopedRepeatContext}
            allViews={allViews}
            visitedViewIds={visitedViewIds}
            preserveGridLayout={preserveGridLayout}
            previewRowHeight={previewRowHeight}
          />
        ))}
      </div>
    );
    return (
      <article
        key={node.id}
        className={`card system-studio-v2-runtime__container${node.showBorder === false ? ' is-flat' : ''}`.trim()}
        style={{
          ...style,
          gridTemplateRows: node.showTitle !== false ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)'
        }}
      >
        {node.showTitle !== false ? <strong>{node.label}</strong> : null}
        <div className="system-studio-v2-runtime__container-body">
          {children.length ? (
            usesRepeatMode ? (
              repeatItems.length > 0 ? (
              <div className="system-studio-v2-runtime__repeat-list" style={repeatListStyle(node, previewRowHeight)}>
                {repeatItems.map((item, index) => (
                  <article
                    key={`${node.id}-${item.id}-${index}`}
                    className={`system-studio-v2-runtime__repeat-item${Boolean(item.values.equipe) ? ' is-equipped' : ''}`.trim()}
                  >
                    {node.repeat?.showItemHeader ? (
                      <header className="system-studio-v2-runtime__repeat-header">
                        <strong>{replaceRuntimeTokens(node.repeat?.itemLabelTemplate || '{{item.label}}', { ...values, ...item.values }, view, allViews, { ...(templateContext ?? {}), ...item.templateContext }) || item.label}</strong>
                        <small>#{index + 1}</small>
                      </header>
                    ) : null}
                    {renderContainerChildren(
                      { ...values, ...item.values },
                      { ...(templateContext ?? {}), ...item.templateContext },
                      { containerNode: node, itemIndex: index, item }
                    )}
                  </article>
                ))}
              </div>
              ) : (
                <div className="system-studio-v2-runtime__placeholder">Aucun élément dans cette collection.</div>
              )
            ) : (
              renderContainerChildren(values, templateContext)
            )
          ) : null
          }
        </div>
      </article>
    );
  }

  if (node.type === 'tabs') {
    const effectiveTabId = activeTabId || tabs[0]?.id || '';
    const activeTab = tabs.find((tab) => tab.id === effectiveTabId) ?? tabs[0] ?? null;
    const activeView = activeTab ? allViews.find((viewItem) => viewItem.id === activeTab.viewId) ?? null : null;
    const activeViewRootNodes = activeView ? childNodes(activeView.nodes, null, null) : [];
    const isCircular = Boolean(activeView && visitedViewIds.includes(activeView.id));
    const orientation = node.tabOrientation ?? 'horizontal';
    return (
      <article key={node.id} className="card system-studio-v2-runtime__container" style={style}>
        {node.showTitle !== false ? <strong>{node.label}</strong> : null}
        <div className={`system-studio-v2-runtime__tabs-layout orientation-${orientation}`.trim()}>
          <div className={`system-studio-v2-runtime__tabs-list orientation-${orientation}`.trim()}>
            {tabs.map((tab) => (
              <button key={tab.id} type="button" className={`screen-runtime-tab ${tab.id === effectiveTabId ? 'is-active' : ''}`.trim()} onClick={() => setActiveTabId(tab.id)}>
                {allViews.find((viewItem) => viewItem.id === tab.viewId)?.name ?? tab.label}
              </button>
            ))}
          </div>
          <div className="system-studio-v2-runtime__tabs-content">
            {!tabs.length ? (
              <div className="system-studio-v2-runtime__placeholder">Aucune vue rattachee a ces onglets</div>
            ) : isCircular ? (
              <div className="system-studio-v2-runtime__placeholder">Boucle de vues detectee sur cet onglet</div>
            ) : activeView && activeViewRootNodes.length ? (
              <div
                className={`system-studio-v2-runtime__grid${preserveGridLayout ? ' system-studio-v2-runtime__grid--preserve-layout' : ''}`.trim()}
                style={runtimeGridStyle(activeView, activeViewRootNodes, preserveGridLayout, previewRowHeight)}
              >
                {activeViewRootNodes.map((child) => (
                  <RuntimeNode
                    key={child.id}
                    node={child}
                    nodes={activeView.nodes}
                    view={activeView}
                    systemTheme={systemTheme}
                    values={values}
                    editable={editable}
                    templateContext={templateContext}
                    validationErrors={validationErrors}
                    onValueChange={onValueChange}
                    onRepeatValueChange={onRepeatValueChange}
                    onButtonAction={onButtonAction}
                    repeatContext={repeatContext}
                    allViews={allViews}
                    visitedViewIds={activeView ? [...visitedViewIds, activeView.id] : visitedViewIds}
                    preserveGridLayout={preserveGridLayout}
                    previewRowHeight={previewRowHeight}
                    flatMode={flatMode}
                  />
                ))}
              </div>
            ) : (
              <div className="system-studio-v2-runtime__placeholder">La vue de cet onglet est vide ou introuvable</div>
            )}
          </div>
        </div>
      </article>
    );
  }

  if (node.type === 'subview') {
    const linkedView = resolveLinkedView(node, allViews);
    const linkedViewRootNodes = linkedView ? childNodes(linkedView.nodes, null, null) : [];
    const isCircular = Boolean(linkedView && visitedViewIds.includes(linkedView.id));

    return (
      <article key={node.id} className="card system-studio-v2-runtime__leaf" style={style}>
        {!linkedView ? (
          <div className="system-studio-v2-runtime__placeholder">Vue liée introuvable</div>
        ) : isCircular ? (
          <div className="system-studio-v2-runtime__placeholder">Boucle de vues detectee</div>
        ) : linkedViewRootNodes.length ? (
          <div className="system-studio-v2-runtime__subview">
            <div
              className={`system-studio-v2-runtime__grid${preserveGridLayout ? ' system-studio-v2-runtime__grid--preserve-layout' : ''}`.trim()}
              style={runtimeGridStyle(linkedView, linkedViewRootNodes, preserveGridLayout, previewRowHeight)}
            >
              {linkedViewRootNodes.map((child) => (
                <RuntimeNode
                  key={child.id}
                  node={child}
                  nodes={linkedView.nodes}
                  view={linkedView}
                  systemTheme={systemTheme}
                  values={values}
                  editable={editable}
                  templateContext={templateContext}
                  validationErrors={validationErrors}
                  onValueChange={onValueChange}
                  onRepeatValueChange={onRepeatValueChange}
                  onButtonAction={onButtonAction}
                  repeatContext={repeatContext}
                  allViews={allViews}
                  visitedViewIds={[...visitedViewIds, linkedView.id]}
                  preserveGridLayout={preserveGridLayout}
                  previewRowHeight={previewRowHeight}
                  flatMode={flatMode}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="system-studio-v2-runtime__placeholder">La vue liée est vide</div>
        )}
      </article>
    );
  }

  return (
    <article key={node.id} className={`card system-studio-v2-runtime__leaf${editable && isEditableNode(node) ? ' is-editable' : ''}`.trim()} style={style}>
      {renderLeaf({
        node,
        values,
        view,
        systemTheme,
        allViews,
        editable,
        templateContext,
        validationErrors,
        onValueChange,
        onRepeatValueChange,
        onButtonAction,
        repeatContext,
        flatMode
      })}
    </article>
  );
}

type SystemStudioV2RuntimeProps = {
  view: SystemStudioViewDefinitionV2 | null;
  systemTheme?: StudioThemeDefinition;
  catalogs?: SystemCatalogDefinition[];
  values?: SystemStudioV2Values;
  onValuesChange?: (values: SystemStudioV2Values) => void;
  editable?: boolean;
  templateContext?: SystemStudioV2TemplateContext;
  allViews?: SystemStudioViewDefinitionV2[];
  preserveGridLayout?: boolean;
  previewRowHeight?: number;
  sessionId?: string;
  currentUserId?: string;
  flatMode?: boolean;
};

export default function SystemStudioV2Runtime({
  view,
  systemTheme,
  catalogs,
  values,
  onValuesChange,
  editable = false,
  templateContext,
  allViews,
  preserveGridLayout = true,
  previewRowHeight = 28,
  sessionId,
  currentUserId,
  flatMode = false
}: SystemStudioV2RuntimeProps) {
  const availableViews = allViews ?? (view ? [view] : []);
  const [activeRootViewId, setActiveRootViewId] = useState(view?.id ?? '');
  const [popupViewState, setPopupViewState] = useState<PopupViewState>(null);
  const [catalogPicker, setCatalogPicker] = useState<CatalogPickerState>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [buttonFeedback, setButtonFeedback] = useState<string | null>(null);
  const initialValues = useMemo(() => {
    if (!view) {
      return {};
    }
    const base = buildInitialSystemStudioV2ValuesForViews(availableViews.length ? availableViews : [view], templateContext);
    return applySystemStudioV2Formulas(view, base, availableViews.length ? availableViews : [view], templateContext);
  }, [availableViews, templateContext, view]);
  const effectiveValues = values ?? initialValues;
  const runtimeView =
    availableViews.find((item) => item.id === activeRootViewId || item.reference === activeRootViewId || item.name === activeRootViewId) ??
    view;
  const popupView =
    popupViewState?.viewId
      ? availableViews.find((item) => item.id === popupViewState.viewId || item.reference === popupViewState.viewId || item.name === popupViewState.viewId) ?? null
      : null;
  const activeCatalog = catalogPicker ? resolveCatalogDefinition(catalogs, catalogPicker.catalogKey) : null;
  const activeCatalogVisibleColumns = useMemo(
    () => activeCatalog?.columns.filter((column) => column.key !== 'id') ?? [],
    [activeCatalog]
  );
  const filteredCatalogEntries = useMemo(() => {
    if (!activeCatalog) {
      return [];
    }
    const search = catalogSearch.trim().toLowerCase();
    if (!search) {
      return activeCatalog.entries;
    }
    return activeCatalog.entries.filter((entry) => {
      const haystack = [
        entry.id,
        ...activeCatalog.columns.map((column) => String(entry.values[column.key] ?? ''))
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [activeCatalog, catalogSearch]);
  const validationErrors = useMemo<RuntimeValidationErrors>(() => {
    return runtimeView?.nodes.reduce<RuntimeValidationErrors>((accumulator, node) => {
      accumulator[node.key] = validateRuntimeValue(node, effectiveValues[node.key], effectiveValues, runtimeView, allViews ?? []);
      return accumulator;
    }, {}) ?? {};
  }, [allViews, effectiveValues, runtimeView]);
  const canUsePortal = typeof document !== 'undefined' && Boolean(document.body);

  useEffect(() => {
    if (!values && onValuesChange) {
      onValuesChange(initialValues);
    }
  }, [initialValues, onValuesChange, values]);

  useEffect(() => {
    setActiveRootViewId(view?.id ?? '');
    setPopupViewState(null);
    setCatalogPicker(null);
    setCatalogSearch('');
  }, [view?.id]);

  useEffect(() => {
    if (!buttonFeedback) {
      return;
    }
    const timer = window.setTimeout(() => setButtonFeedback(null), 5000);
    return () => window.clearTimeout(timer);
  }, [buttonFeedback]);

  if (!runtimeView) {
    return <p style={{ margin: 0 }}>Aucune vue disponible.</p>;
  }

  const rootNodes = childNodes(runtimeView.nodes, null, null);
  const handleValueChange = (targetView: SystemStudioViewDefinitionV2, key: string, value: SystemStudioV2Value) => {
    if (!onValuesChange) {
      return;
    }
    onValuesChange(applySystemStudioV2Formulas(targetView, { ...effectiveValues, [key]: value }, availableViews.length ? availableViews : [targetView], templateContext));
  };

  const handleRepeatValueChange = (
    targetView: SystemStudioViewDefinitionV2,
    containerNode: SystemStudioNodeDefinition,
    visibleItemIndex: number,
    key: string,
    value: SystemStudioV2Value
  ) => {
    if (!onValuesChange) {
      return;
    }
    const bindingTarget =
      containerNode.repeat?.mode === 'binding'
        ? resolveBindingTarget(containerNode.repeat?.source, targetView, availableViews.length ? availableViews : [targetView])
        : null;
    const sourceKey = bindingTarget?.sourceKey ?? repeatStorageKey(containerNode);
    const allRepeatItems = resolveRepeatItems(containerNode, effectiveValues, targetView, availableViews.length ? availableViews : [targetView], templateContext);
    const filteredRepeatItems = filterRepeatItems({
      node: containerNode,
      items: allRepeatItems,
      values: effectiveValues,
      view: targetView,
      allViews: availableViews.length ? availableViews : [targetView],
      templateContext
    });
    const targetItem = filteredRepeatItems[visibleItemIndex] ?? null;
    const boundFieldKey =
      containerNode.repeat?.mode === 'fields'
        ? targetItem?.propertyBindings?.[key] ?? null
        : null;
    if (boundFieldKey) {
      onValuesChange(
        applySystemStudioV2Formulas(targetView, { ...effectiveValues, [boundFieldKey]: value }, availableViews.length ? availableViews : [targetView], templateContext)
      );
      return;
    }
    const targetSourceIndex = targetItem?.sourceIndex ?? visibleItemIndex;
    const resolved = allRepeatItems.map((item) => ({
      ...item.values,
      label: item.label
    })) as Array<Record<string, unknown>>;
    while (resolved.length <= targetSourceIndex) {
      resolved.push({ label: `Element ${resolved.length + 1}` });
    }
    resolved[targetSourceIndex] = {
      ...resolved[targetSourceIndex],
      [key]: value
    };
    onValuesChange({
      ...applySystemStudioV2Formulas(targetView, effectiveValues, availableViews.length ? availableViews : [targetView], templateContext),
      [sourceKey]: resolved
    });
  };

  const handleCatalogEntryAdd = (entry: SystemCatalogEntryDefinition) => {
    if (!catalogPicker || !activeCatalog || !onValuesChange) {
      return;
    }
    const targetCollectionKey = catalogPicker.targetCollectionKey.trim();
    if (!targetCollectionKey) {
      setButtonFeedback('Ajout impossible : collection cible vide.');
      return;
    }
    const currentCollection = Array.isArray(effectiveValues[targetCollectionKey])
      ? ([...(effectiveValues[targetCollectionKey] as SystemStudioV2RepeatItemValue[])] as Record<string, unknown>[])
      : [];
    const nextValues = {
      ...effectiveValues,
      [targetCollectionKey]: [...currentCollection, createCatalogInstance(activeCatalog, entry)]
    };
    onValuesChange(applySystemStudioV2Formulas(runtimeView, nextValues, availableViews.length ? availableViews : [runtimeView], templateContext));
    setCatalogPicker(null);
    setCatalogSearch('');
    setButtonFeedback(`${catalogPicker.sourceNodeLabel} : ${entry.values.nom ?? entry.values.label ?? entry.id} ajouté à ${targetCollectionKey}.`);
  };

  const popupRepeatItem = useMemo(() => {
    const binding = popupViewState?.repeatBinding;
    if (!binding) {
      return null;
    }
    const sourceCollection = Array.isArray(effectiveValues[binding.sourceKey])
      ? (effectiveValues[binding.sourceKey] as SystemStudioV2RepeatItemValue[])
      : [];
    const currentItem = sourceCollection[binding.sourceIndex];
    return currentItem && typeof currentItem === 'object' ? (currentItem as Record<string, unknown>) : null;
  }, [effectiveValues, popupViewState]);

  const popupEditableKeys = useMemo(
    () => Array.from(new Set((popupView?.nodes ?? []).filter((node) => isEditableNode(node)).map((node) => node.key))),
    [popupView]
  );

  const popupValues: SystemStudioV2Values = popupRepeatItem
    ? {
        ...effectiveValues,
        ...(popupRepeatItem as Record<string, SystemStudioV2Value>)
      }
    : effectiveValues;

  const handlePopupValuesChange = (nextValues: SystemStudioV2Values) => {
    if (!onValuesChange) {
      return;
    }
    const binding = popupViewState?.repeatBinding;
    if (!binding) {
      onValuesChange(nextValues);
      return;
    }
    const sourceCollection = Array.isArray(effectiveValues[binding.sourceKey])
      ? ([...(effectiveValues[binding.sourceKey] as SystemStudioV2RepeatItemValue[])] as Record<string, unknown>[])
      : [];
    if (binding.sourceIndex < 0 || binding.sourceIndex >= sourceCollection.length) {
      return;
    }
    const originalItem = (sourceCollection[binding.sourceIndex] ?? {}) as Record<string, unknown>;
    let nextItem = { ...originalItem };
    let changed = false;
    for (const key of popupEditableKeys) {
      if (!(key in nextValues)) {
        continue;
      }
      const nextValue = nextValues[key];
      if (nextItem[key] !== nextValue) {
        nextItem = {
          ...nextItem,
          [key]: nextValue
        };
        changed = true;
      }
    }
    if (!changed) {
      return;
    }
    sourceCollection[binding.sourceIndex] = nextItem;
    onValuesChange(
      applySystemStudioV2Formulas(
        popupView ?? runtimeView,
        {
          ...effectiveValues,
          [binding.sourceKey]: sourceCollection
        },
        availableViews.length ? availableViews : popupView ? [popupView] : runtimeView ? [runtimeView] : [],
        templateContext
      )
    );
  };

  const handleButtonAction = (
    node: SystemStudioNodeDefinition,
    currentView: SystemStudioViewDefinitionV2,
    repeatContext?: { containerNode: SystemStudioNodeDefinition; itemIndex: number; item?: RepeatRuntimeItem }
  ) => {
    if (!node.buttonAction || node.buttonAction === 'aucune') {
      return;
    }
    if (node.buttonAction === 'aller_vers_vue') {
      const targetView = resolveButtonTargetView(node.buttonActionTarget, currentView, availableViews);
      if (targetView) {
        setActiveRootViewId(targetView.id);
      }
      return;
    }
    if (node.buttonAction === 'ouvrir_popup_vue') {
      const targetView = resolveButtonTargetView(node.buttonActionTarget, currentView, availableViews);
      if (targetView) {
        if (repeatContext && onValuesChange) {
          const { containerNode, itemIndex } = repeatContext;
          const bindingTarget =
            containerNode.repeat?.mode === 'binding'
              ? resolveBindingTarget(containerNode.repeat?.source, currentView, availableViews.length ? availableViews : [currentView])
              : null;
          const sourceKey = bindingTarget?.sourceKey ?? repeatStorageKey(containerNode);
          const allRepeatItems = resolveRepeatItems(
            containerNode,
            effectiveValues,
            currentView,
            availableViews.length ? availableViews : [currentView],
            templateContext
          );
          const filteredRepeatItems = filterRepeatItems({
            node: containerNode,
            items: allRepeatItems,
            values: effectiveValues,
            view: currentView,
            allViews: availableViews.length ? availableViews : [currentView],
            templateContext
          });
          const targetItem = filteredRepeatItems[itemIndex] ?? null;
          const targetSourceIndex = targetItem?.sourceIndex ?? itemIndex;
          setPopupViewState({
            viewId: targetView.id,
            sourceNodeLabel: node.label,
            repeatBinding: {
              sourceKey,
              sourceIndex: targetSourceIndex,
              itemLabel: targetItem?.label ?? `Element ${itemIndex + 1}`
            }
          });
          return;
        }
        setPopupViewState({
          viewId: targetView.id,
          sourceNodeLabel: node.label
        });
      }
      return;
    }
    if (node.buttonAction === 'lancer_jet') {
      const formula = String(node.buttonRollFormula ?? node.buttonActionTarget ?? node.formula ?? '').trim();
      if (!formula) {
        setButtonFeedback('Jet impossible : formule vide.');
        return;
      }
      const resolvedFormula = formula.replace(/@([A-Za-z0-9_.\[\]]+)/g, (_, token: string) => {
        const resolved = resolveTokenValue({
          token,
          values: effectiveValues,
          view: currentView,
          allViews: availableViews,
          templateContext
        });
        return String(toNumber(resolved as SystemStudioV2Value));
      });
      const diceMatch = resolvedFormula.match(/(\d*)d(\d+)/i);
      if (!diceMatch) {
        setButtonFeedback(`Jet impossible : formule invalide (${formula}).`);
        return;
      }
      const diceCount = Math.max(1, Number(diceMatch[1] || 1));
      const diceSides = Math.max(2, Number(diceMatch[2] || 20));
      const rolls = Array.from({ length: diceCount }, () => Math.floor(Math.random() * diceSides) + 1);
      const diceSum = rolls.reduce((sum, value) => sum + value, 0);
      const modifiers = Array.from(resolvedFormula.matchAll(/([+-]\s*\d+)/g)).map((match) => Number(match[1].replace(/\s+/g, '')));
      const modifierSum = modifiers.reduce((sum, value) => sum + value, 0);
      const total = diceSum + modifierSum;
      const breakdown = `${rolls.join(' + ')}${modifierSum !== 0 ? ` ${modifierSum > 0 ? '+' : '-'} ${Math.abs(modifierSum)}` : ''}`;
      setButtonFeedback(`${node.label} : ${formula} = ${total} (${breakdown})`);
      if (sessionId && currentUserId) {
        const rollVisibility = node.buttonRollVisibility ?? 'public';
        const message: Message = {
          id: `roll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sessionId,
          channelType: rollVisibility === 'public' ? 'system' : 'direct',
          fromUserId: currentUserId,
          content: `${node.label} · ${formula}\nRésultat : ${total}\nDétail : ${breakdown}`,
          createdAt: new Date().toISOString(),
          systemType: 'roll',
          ...(rollVisibility === 'mj_seulement' ? { isPrivateToGM: true } : {}),
          ...(rollVisibility === 'prive' ? { toUserIds: [currentUserId] } : {})
        };
        void messageRepository.create(message);
      }
      return;
    }
    if (node.buttonAction === 'ajouter_depuis_catalogue') {
      if (!onValuesChange) {
        setButtonFeedback('Ajout impossible : cette vue est en lecture seule.');
        return;
      }
      const catalogKey = String(node.buttonCatalogKey ?? node.buttonActionTarget ?? '').trim();
      const targetCollectionKey = String(node.buttonTargetCollectionKey ?? '').trim();
      if (!catalogKey) {
        setButtonFeedback('Ajout impossible : aucun catalogue configuré.');
        return;
      }
      if (!targetCollectionKey) {
        setButtonFeedback('Ajout impossible : aucune collection cible configurée.');
        return;
      }
      const targetCatalog = resolveCatalogDefinition(catalogs, catalogKey);
      if (!targetCatalog) {
        setButtonFeedback(`Ajout impossible : catalogue introuvable (${catalogKey}).`);
        return;
      }
      setCatalogSearch('');
      setCatalogPicker({
        catalogKey: targetCatalog.key,
        targetCollectionKey,
        sourceNodeLabel: node.label
      });
      return;
    }
    if (node.buttonAction === 'supprimer_item') {
      if (!repeatContext || !onValuesChange) {
        setButtonFeedback('Suppression impossible : ce bouton doit etre utilise dans une repetition editable.');
        return;
      }
      const { containerNode, itemIndex } = repeatContext;
      if (containerNode.repeat?.mode === 'fields') {
        setButtonFeedback('Suppression impossible : la repetition est derivee de champs de vue.');
        return;
      }
      const bindingTarget =
        containerNode.repeat?.mode === 'binding'
          ? resolveBindingTarget(containerNode.repeat?.source, currentView, availableViews.length ? availableViews : [currentView])
          : null;
      const sourceKey = bindingTarget?.sourceKey ?? repeatStorageKey(containerNode);
      const allRepeatItems = resolveRepeatItems(containerNode, effectiveValues, currentView, availableViews.length ? availableViews : [currentView], templateContext);
      const filteredRepeatItems = filterRepeatItems({
        node: containerNode,
        items: allRepeatItems,
        values: effectiveValues,
        view: currentView,
        allViews: availableViews.length ? availableViews : [currentView],
        templateContext
      });
      const targetItem = filteredRepeatItems[itemIndex] ?? null;
      const targetSourceIndex = targetItem?.sourceIndex ?? itemIndex;
      const sourceCollection = Array.isArray(effectiveValues[sourceKey])
        ? [...(effectiveValues[sourceKey] as SystemStudioV2RepeatItemValue[])]
        : [];
      if (targetSourceIndex < 0 || targetSourceIndex >= sourceCollection.length) {
        setButtonFeedback('Suppression impossible : item introuvable.');
        return;
      }
      sourceCollection.splice(targetSourceIndex, 1);
      onValuesChange(
        applySystemStudioV2Formulas(
          currentView,
          {
            ...effectiveValues,
            [sourceKey]: sourceCollection
          },
          availableViews.length ? availableViews : [currentView],
          templateContext
        )
      );
      setButtonFeedback(`${node.label || 'Action'} : item supprimé.`);
      return;
    }
    if (
      node.buttonAction === 'dupliquer_item' ||
      node.buttonAction === 'equiper_desequiper' ||
      node.buttonAction === 'incrementer_quantite' ||
      node.buttonAction === 'decrementer_quantite'
    ) {
      if (!repeatContext || !onValuesChange) {
        setButtonFeedback(
          `${
            node.buttonAction === 'dupliquer_item'
              ? 'Duplication'
              : node.buttonAction === 'equiper_desequiper'
              ? 'Modification'
              : 'Quantité'
          } impossible : ce bouton doit etre utilise dans une repetition editable.`
        );
        return;
      }
      const { containerNode, itemIndex } = repeatContext;
      if (containerNode.repeat?.mode === 'fields') {
        setButtonFeedback(
          `${
            node.buttonAction === 'dupliquer_item'
              ? 'Duplication'
              : node.buttonAction === 'equiper_desequiper'
              ? 'Modification'
              : 'Quantité'
          } impossible : la repetition est derivee de champs de vue.`
        );
        return;
      }
      const bindingTarget =
        containerNode.repeat?.mode === 'binding'
          ? resolveBindingTarget(containerNode.repeat?.source, currentView, availableViews.length ? availableViews : [currentView])
          : null;
      const sourceKey = bindingTarget?.sourceKey ?? repeatStorageKey(containerNode);
      const allRepeatItems = resolveRepeatItems(containerNode, effectiveValues, currentView, availableViews.length ? availableViews : [currentView], templateContext);
      const filteredRepeatItems = filterRepeatItems({
        node: containerNode,
        items: allRepeatItems,
        values: effectiveValues,
        view: currentView,
        allViews: availableViews.length ? availableViews : [currentView],
        templateContext
      });
      const targetItem = filteredRepeatItems[itemIndex] ?? null;
      const targetSourceIndex = targetItem?.sourceIndex ?? itemIndex;
      const sourceCollection = Array.isArray(effectiveValues[sourceKey])
        ? [...(effectiveValues[sourceKey] as SystemStudioV2RepeatItemValue[])]
        : [];
      if (targetSourceIndex < 0 || targetSourceIndex >= sourceCollection.length) {
        setButtonFeedback(`${node.label || 'Action'} : item introuvable.`);
        return;
      }
      if (node.buttonAction === 'dupliquer_item') {
        const originalItem = sourceCollection[targetSourceIndex] as Record<string, unknown>;
        sourceCollection.splice(targetSourceIndex + 1, 0, duplicateRuntimeItemInstance(originalItem));
        onValuesChange(
          applySystemStudioV2Formulas(
            currentView,
            {
              ...effectiveValues,
              [sourceKey]: sourceCollection
            },
            availableViews.length ? availableViews : [currentView],
            templateContext
          )
        );
        setButtonFeedback(`${node.label || 'Action'} : item dupliqué.`);
        return;
      }
      if (node.buttonAction === 'incrementer_quantite' || node.buttonAction === 'decrementer_quantite') {
        const originalItem = (sourceCollection[targetSourceIndex] ?? {}) as Record<string, unknown>;
        const currentQuantity = normalizeRuntimeQuantity(originalItem.quantite);
        const nextQuantity =
          node.buttonAction === 'incrementer_quantite'
            ? currentQuantity + 1
            : Math.max(0, currentQuantity - 1);
        sourceCollection[targetSourceIndex] = {
          ...originalItem,
          quantite: nextQuantity
        };
        onValuesChange(
          applySystemStudioV2Formulas(
            currentView,
            {
              ...effectiveValues,
              [sourceKey]: sourceCollection
            },
            availableViews.length ? availableViews : [currentView],
            templateContext
          )
        );
        setButtonFeedback(`${node.label || 'Action'} : quantité ${node.buttonAction === 'incrementer_quantite' ? 'augmentée' : 'diminuée'} (${nextQuantity}).`);
        return;
      }
      const originalItem = (sourceCollection[targetSourceIndex] ?? {}) as Record<string, unknown>;
      sourceCollection[targetSourceIndex] = {
        ...originalItem,
        equipe: !Boolean(originalItem.equipe)
      };
      onValuesChange(
        applySystemStudioV2Formulas(
          currentView,
          {
            ...effectiveValues,
            [sourceKey]: sourceCollection
          },
          availableViews.length ? availableViews : [currentView],
          templateContext
        )
      );
      setButtonFeedback(`${node.label || 'Action'} : ${Boolean(sourceCollection[targetSourceIndex].equipe) ? 'équipé' : 'déséquipé'}.`);
      return;
    }
  };

  const popupViewModal = popupView ? (
    <div className="resource-preview-modal" onClick={() => setPopupViewState(null)}>
      <section className="resource-preview-modal__dialog" onClick={(event) => event.stopPropagation()}>
        <header className="resource-preview-modal__header">
          <div>
            <strong>{popupView.name}</strong>
            <small>
              {popupViewState?.repeatBinding
                ? `Edition detaillee · ${popupViewState.repeatBinding.itemLabel}`
                : popupViewState?.sourceNodeLabel
                ? `Vue ouverte par ${popupViewState.sourceNodeLabel}`
                : 'Vue ouverte par action de bouton'}
            </small>
          </div>
          <Button type="button" variant="secondary" onClick={() => setPopupViewState(null)}>
            Fermer
          </Button>
        </header>
        <div className="resource-preview-modal__body">
          <SystemStudioV2Runtime
            view={popupView}
            systemTheme={systemTheme}
            catalogs={catalogs}
            allViews={availableViews}
            values={popupValues}
            onValuesChange={handlePopupValuesChange}
            editable={editable}
            flatMode={flatMode}
            templateContext={templateContext}
            preserveGridLayout={preserveGridLayout}
            previewRowHeight={previewRowHeight}
          />
        </div>
      </section>
    </div>
  ) : null;

  const catalogPickerModal = catalogPicker && activeCatalog ? (
    <div className="resource-preview-modal" onClick={() => setCatalogPicker(null)}>
      <section className="resource-preview-modal__dialog resource-preview-modal__dialog--wide" onClick={(event) => event.stopPropagation()}>
        <header className="resource-preview-modal__header">
          <div>
            <strong>{activeCatalog.label}</strong>
            <small>
              Ajouter à {catalogPicker.targetCollectionKey} · {activeCatalog.entries.length} entrée{activeCatalog.entries.length > 1 ? 's' : ''}
            </small>
          </div>
          <Button type="button" variant="secondary" onClick={() => setCatalogPicker(null)}>
            Fermer
          </Button>
        </header>
        <div className="resource-preview-modal__body" style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Recherche</span>
            <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Nom, valeur..." />
          </label>
          <div className="system-catalog-manager__table-wrap">
            <table className="system-catalog-manager__table">
              <thead>
                <tr>
                  <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Action</th>
                  {activeCatalogVisibleColumns.map((column) => (
                    <th key={column.id}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCatalogEntries.length === 0 ? (
                  <tr>
                    <td colSpan={activeCatalogVisibleColumns.length + 1}>Aucune entrée ne correspond.</td>
                  </tr>
                ) : (
                  filteredCatalogEntries.map((entry) => (
                    <tr key={entry.id} className="system-catalog-manager__table-row--interactive" onClick={() => handleCatalogEntryAdd(entry)}>
                      <td>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCatalogEntryAdd(entry);
                          }}
                        >
                          Ajouter
                        </Button>
                      </td>
                      {activeCatalogVisibleColumns.map((column) => (
                        <td key={`${entry.id}-${column.id}`}>{toDisplayValue(entry.values[column.key] as string | number | boolean | undefined)}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
    <section className="system-studio-v2-runtime" style={runtimeViewStyle(runtimeView, systemTheme)}>
      <div
        className={`system-studio-v2-runtime__grid${preserveGridLayout ? ' system-studio-v2-runtime__grid--preserve-layout' : ''}`.trim()}
        style={runtimeGridStyle(runtimeView, rootNodes, preserveGridLayout, previewRowHeight)}
      >
        {rootNodes.length ? (
          rootNodes.map((node) => (
            <RuntimeNode
              key={node.id}
              node={node}
              nodes={runtimeView.nodes}
              view={runtimeView}
              systemTheme={systemTheme}
              values={effectiveValues}
              editable={editable}
              templateContext={templateContext}
              validationErrors={validationErrors}
              onValueChange={handleValueChange}
              onRepeatValueChange={handleRepeatValueChange}
              onButtonAction={handleButtonAction}
              allViews={availableViews.length ? availableViews : [runtimeView]}
              visitedViewIds={[runtimeView.id]}
              preserveGridLayout={preserveGridLayout}
              previewRowHeight={previewRowHeight}
              flatMode={flatMode}
            />
          ))
        ) : (
          <div className="system-studio-v2-runtime__placeholder">Ajoute des éléments pour construire cette vue.</div>
        )}
      </div>
      {buttonFeedback ? <p className="home-alert home-alert--success">{buttonFeedback}</p> : null}
    </section>
    {canUsePortal ? createPortal(popupViewModal, document.body) : popupViewModal}
    {canUsePortal ? createPortal(catalogPickerModal, document.body) : catalogPickerModal}
    </>
  );
}
