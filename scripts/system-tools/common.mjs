import fs from 'fs';
import path from 'path';

export const SYSTEM_DRAFT_FORMAT = 'nexusforge.system-draft';
export const SYSTEM_DRAFT_VERSION = 1;

function slugify(value, fallback = 'champ') {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return normalized || fallback;
}

function ensureUnique(value, existing, fallback) {
  const base = slugify(value, fallback);
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  let index = 1;
  let candidate = `${base}${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${base}${index}`;
  }
  existing.add(candidate);
  return candidate;
}

function makeNodeId(prefix = 'system_node') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function decodeHtml(text) {
  return String(text ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function stripTags(text) {
  return decodeHtml(String(text ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parseAttributes(raw) {
  const attributes = {};
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrPattern.exec(raw)) !== null) {
    const [, key, a, b, c] = match;
    attributes[key.toLowerCase()] = a ?? b ?? c ?? true;
  }
  return attributes;
}

function nodeFromDraftElement(element, y, keySet, labelSet) {
  const label = ensureUnique(element.label || element.key || element.type || 'champ', labelSet, 'champ');
  const key = ensureUnique(element.key || label, keySet, 'champ');
  const base = {
    id: makeNodeId(),
    label,
    key,
    layout: {
      x: element.x ?? 0,
      y: element.y ?? y,
      w: element.w ?? 12,
      h: element.h ?? 2,
      minW: 1,
      minH: 1
    },
    showTitle: false,
    showBorder: false
  };

  switch (element.type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        placeholder: element.placeholder || '',
        defaultValue: element.defaultValue || ''
      };
    case 'textarea':
      return {
        ...base,
        type: 'textarea',
        placeholder: element.placeholder || '',
        defaultValue: element.defaultValue || '',
        defaultRowsVisible: 4
      };
    case 'number':
      return {
        ...base,
        type: 'number',
        defaultValue: typeof element.defaultValue === 'number' ? element.defaultValue : 0,
        min: typeof element.min === 'number' ? element.min : undefined,
        max: typeof element.max === 'number' ? element.max : undefined,
        step: typeof element.step === 'number' ? element.step : undefined,
        formatSuffix: element.formatSuffix || undefined
      };
    case 'date':
      return {
        ...base,
        type: 'date',
        defaultValue: element.defaultValue || ''
      };
    case 'time':
      return {
        ...base,
        type: 'time',
        defaultValue: element.defaultValue || ''
      };
    case 'checkbox':
      return {
        ...base,
        type: 'checkbox',
        defaultValue: Boolean(element.defaultValue),
        checkboxLabel: element.checkboxLabel || element.label || label
      };
    case 'select':
      return {
        ...base,
        type: 'select',
        options: Array.isArray(element.options) ? element.options : [],
        defaultValue: element.defaultValue || ''
      };
    default:
      return {
        ...base,
        type: 'static_text',
        defaultValue: element.content || element.label || ''
      };
  }
}

function buildNodesFromElements(elements) {
  const keySet = new Set();
  const labelSet = new Set();
  let cursorY = 0;

  return elements.map((element) => {
    const effectiveY = typeof element.y === 'number' ? element.y : cursorY;
    const node = nodeFromDraftElement(element, effectiveY, keySet, labelSet);
    cursorY = Math.max(cursorY, node.layout.y + node.layout.h);
    return node;
  });
}

export function buildSystemDraft({ sourceType, sourcePath, title, elements, views, warnings = [] }) {
  const systemName = title || path.basename(sourcePath, path.extname(sourcePath)) || 'systeme_importe';
  const resolvedViews =
    Array.isArray(views) && views.length > 0
      ? views.map((view, index) => {
          const viewName = view.name || `${systemName} ${index + 1}`;
          return {
            id: view.id || `system_view_imported_${index + 1}`,
            name: viewName,
            reference: slugify(view.reference || viewName, 'vue_importee'),
            description: view.description || '',
            gridColumns: view.gridColumns ?? 12,
            visibleInSelectors: view.visibleInSelectors ?? true,
            isDefaultForPlayer: view.isDefaultForPlayer ?? false,
            isCharacterSheet: view.isCharacterSheet ?? false,
            characterSheetKind: view.characterSheetKind ?? 'pc',
          defaultSheetNameTemplate: view.defaultSheetNameTemplate ?? '{{nompartie}} · {{nompj}}',
          initiativeMode: view.initiativeMode ?? 'combat_once',
          initiativeFormula: view.initiativeFormula ?? '',
          nodes: Array.isArray(view.nodes) ? view.nodes : buildNodesFromElements(view.elements ?? [])
        };
      })
      : [
          {
            id: 'system_view_imported',
            name: title || 'Vue importee',
            reference: slugify(title || 'Vue importee', 'vue_importee'),
            description: '',
            gridColumns: 12,
            visibleInSelectors: true,
            isDefaultForPlayer: false,
            isCharacterSheet: false,
            characterSheetKind: 'pc',
            defaultSheetNameTemplate: '{{nompartie}} · {{nompj}}',
            initiativeMode: 'combat_once',
            initiativeFormula: '',
            nodes: buildNodesFromElements(elements ?? [])
          }
        ];

  return {
    format: SYSTEM_DRAFT_FORMAT,
    version: SYSTEM_DRAFT_VERSION,
    extractedAt: new Date().toISOString(),
    source: {
      type: sourceType,
      path: sourcePath
    },
    warnings,
    suggestedSystem: {
      name: systemName,
      studioSchemaV2: {
        version: 2,
        views: resolvedViews
      }
    },
    extraction: {
      elements: elements ?? [],
      views: Array.isArray(views)
        ? views.map((view) => ({
            id: view.id,
            name: view.name,
            reference: view.reference,
            gridColumns: view.gridColumns ?? 12,
            elements: view.elements ?? []
          }))
        : []
    }
  };
}

export function writeJsonOutput(payload, outputPath) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  if (outputPath) {
    fs.writeFileSync(outputPath, text, 'utf8');
    return;
  }
  process.stdout.write(text);
}
