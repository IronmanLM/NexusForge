import { applyRulesProgramToSheet } from '../../services/systemRulesEngine';
import { CharacterSheetView, SheetField, SheetGroup } from '../../types/characterSheet';
import { GameSystem, SystemStudioNodeDefinition, SystemStudioViewDefinitionV2 } from '../../types/system';

type ReservedTemplateContext = Record<string, string>;

function replaceReservedTokens(value: string, context: ReservedTemplateContext | undefined): string {
  if (!context) {
    return value;
  }
  return value.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, token: string) => context[token] ?? '');
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

function editableNodes(view: SystemStudioViewDefinitionV2): SystemStudioNodeDefinition[] {
  return view.nodes.filter((node) => ['text', 'textarea', 'date', 'time', 'number', 'checkbox', 'select', 'multiselect', 'progress'].includes(node.type));
}

function toSheetField(node: SystemStudioNodeDefinition, groupId: string, templateContext?: ReservedTemplateContext): SheetField | null {
  const fieldId = node.key || node.label || node.id;

  switch (node.type) {
    case 'number':
      return {
        id: fieldId,
        label: node.label,
        type: 'number',
        value: Number.isFinite(Number(node.defaultValue)) ? Number(node.defaultValue) : 0,
        groupId
      };
    case 'progress':
      return {
        id: fieldId,
        label: node.label,
        type: 'resource',
        value: Number.isFinite(Number(node.defaultValue)) ? Number(node.defaultValue) : 0,
        max: 100,
        groupId
      };
    case 'checkbox':
      return {
        id: fieldId,
        label: node.label,
        type: 'tag',
        value: node.defaultValue ? 'Oui' : 'Non',
        groupId
      };
    case 'select':
      return {
        id: fieldId,
        label: node.label,
        type: 'select',
        value: typeof node.defaultValue === 'string' ? node.defaultValue : parseOptions(node.options)[0]?.key || '',
        options: parseOptions(node.options),
        groupId
      };
    case 'multiselect':
      return {
        id: fieldId,
        label: node.label,
        type: 'multiselect',
        value: typeof node.defaultValue === 'string' ? node.defaultValue : '',
        options: parseOptions(node.options),
        groupId
      };
    case 'text':
    case 'date':
    case 'time':
      return {
        id: fieldId,
        label: node.label,
        type: 'text',
        value: replaceReservedTokens(typeof node.defaultValue === 'string' ? node.defaultValue : '', templateContext),
        groupId
      };
    case 'textarea':
      return {
        id: fieldId,
        label: node.label,
        type: 'textarea',
        value: replaceReservedTokens(typeof node.defaultValue === 'string' ? node.defaultValue : '', templateContext),
        rows: 4,
        groupId
      };
    default:
      return null;
  }
}

export function listCharacterSheetViews(system: GameSystem | null | undefined): SystemStudioViewDefinitionV2[] {
  return (system?.studioSchemaV2?.views ?? []).filter((view) => Boolean(view.isCharacterSheet));
}

export function listPlayerCreationCharacterSheetViews(system: GameSystem | null | undefined): SystemStudioViewDefinitionV2[] {
  const allCharacterSheetViews = listCharacterSheetViews(system);
  const explicitPlayerViews = allCharacterSheetViews.filter((view) => !view.characterSheetKind || view.characterSheetKind === 'pc');
  return explicitPlayerViews.length > 0 ? explicitPlayerViews : allCharacterSheetViews;
}

export function buildCharacterSheetFromStudioView(params: {
  view: SystemStudioViewDefinitionV2;
  system: GameSystem | null;
  characterId: string;
  name?: string;
  templateContext?: ReservedTemplateContext;
}): CharacterSheetView {
  const { view, system, characterId, name, templateContext } = params;
  const groupId = `${view.id}_main`;
  const groups: SheetGroup[] = [
    {
      id: groupId,
      label: view.name,
      layout: 'grid'
    }
  ];

  let portraitUrl: string | undefined;
  const fields: SheetField[] = [];

  for (const node of view.nodes) {
    if (node.type === 'image' && !portraitUrl) {
      const imageValue =
        typeof node.defaultValue === 'string' && node.defaultValue
          ? node.defaultValue
          : typeof node.reference === 'string'
          ? node.reference
          : '';
      if (imageValue) {
        portraitUrl = replaceReservedTokens(imageValue, templateContext);
      }
      continue;
    }
    const field = toSheetField(node, groupId, templateContext);
    if (field) {
      fields.push(field);
    }
  }

  const baseSheet: CharacterSheetView = {
    id: characterId,
    name: replaceReservedTokens(name?.trim() || view.defaultSheetNameTemplate || view.name, templateContext),
    portraitUrl: portraitUrl || undefined,
    groups,
    fields
  };

  return applyRulesProgramToSheet(baseSheet, system);
}

export function listEditableCharacterNodes(view: SystemStudioViewDefinitionV2): SystemStudioNodeDefinition[] {
  return editableNodes(view);
}
