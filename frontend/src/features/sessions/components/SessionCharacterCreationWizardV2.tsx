import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/Button';
import {
  applySystemStudioV2Formulas,
  buildInitialSystemStudioV2Values,
  evaluateCondition,
  evaluateMathExpression,
  SystemStudioV2TemplateContext,
  SystemStudioV2Value,
  SystemStudioV2Values
} from '../../../components/SystemStudioV2Runtime';
import { Session } from '../../../types/session';
import {
  CharacterCreationAllocationBlock,
  CharacterCreationBindingTarget,
  CharacterCreationConfigV2,
  CharacterCreationQuestionCatalogBlock,
  CharacterCreationQuestionChoiceBlock,
  CharacterCreationQuestionTextBlock,
  CharacterCreationRollBlock,
  CharacterCreationScenarioBlockDefinition,
  GameSystem,
  SystemCatalogDefinition,
  SystemStudioViewDefinitionV2
} from '../../../types/system';
import { User } from '../../../types/user';

type Props = {
  open: boolean;
  system: GameSystem;
  session: Session;
  view: SystemStudioViewDefinitionV2;
  currentUser: User;
  subjectUser?: Pick<User, 'id' | 'displayName' | 'nickname'> | null;
  initialCharacterName: string;
  onClose: () => void;
  onComplete: (payload: { name: string; runtimeValues: SystemStudioV2Values }) => Promise<void>;
};

type CatalogChoice = {
  id: string;
  value: string;
  label: string;
  cost: number;
};

type PendingBlock =
  | CharacterCreationQuestionTextBlock
  | CharacterCreationQuestionChoiceBlock
  | CharacterCreationQuestionCatalogBlock
  | CharacterCreationRollBlock
  | CharacterCreationAllocationBlock;

type StageExecutionResult = {
  values: SystemStudioV2Values;
  messages: { id: string; label: string; content: string; tone?: 'info' | 'warning' | 'success' }[];
  pendingBlocks: PendingBlock[];
  stopReason: string | null;
  stageAdvance: boolean;
  completionSatisfied: boolean;
};

const ANSWERED_PREFIX = '__creation_v2_answered_';
const POOL_INITIAL_PREFIX = '__creation_v2_pool_initial_';
const VAR_INITIAL_PREFIX = '__creation_v2_var_initial_';

function answeredKey(blockId: string) {
  return `${ANSWERED_PREFIX}${blockId}`;
}

function poolInitialKey(poolKey: string) {
  return `${POOL_INITIAL_PREFIX}${poolKey}`;
}

function variableInitialKey(variableKey: string) {
  return `${VAR_INITIAL_PREFIX}${variableKey}`;
}

function parseCatalogChoices(
  catalog: SystemCatalogDefinition | undefined,
  options?: {
    labelColumnKey?: string;
    valueColumnKey?: string;
    costColumnKey?: string;
  }
): CatalogChoice[] {
  if (!catalog) {
    return [];
  }
  return catalog.entries.map((entry) => {
    const values = entry.values ?? {};
    const explicitLabel =
      options?.labelColumnKey && values[options.labelColumnKey] !== undefined && values[options.labelColumnKey] !== null
        ? String(values[options.labelColumnKey]).trim()
        : '';
    const preferredKeys = ['nom', 'name', 'label', 'titre', 'title', 'profession'];
    let label = explicitLabel;
    if (!label) {
      for (const key of preferredKeys) {
        const candidate = values[key];
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          label = String(candidate).trim();
          break;
        }
      }
    }
    if (!label) {
      const firstUsable = Object.values(values).find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim());
      label = firstUsable !== undefined ? String(firstUsable).trim() : entry.id;
    }
    const explicitValue =
      options?.valueColumnKey && values[options.valueColumnKey] !== undefined && values[options.valueColumnKey] !== null
        ? String(values[options.valueColumnKey])
        : label;
    const rawCost = options?.costColumnKey ? values[options.costColumnKey] : undefined;
    const cost = rawCost === undefined || rawCost === null || String(rawCost).trim() === '' ? 0 : Number(rawCost) || 0;
    return { id: entry.id, value: explicitValue, label, cost };
  });
}

function effectiveCatalogMappings(block: CharacterCreationQuestionCatalogBlock) {
  if (Array.isArray(block.mappings) && block.mappings.length > 0) {
    return block.mappings;
  }
  return [
    {
      id: `${block.id}-legacy-target`,
      target: block.target,
      valueColumnKey: block.valueColumnKey ?? ''
    }
  ];
}

function buildTemplateContext(
  system: GameSystem,
  session: Session,
  currentUser: User,
  subjectUser: Pick<User, 'id' | 'displayName' | 'nickname'>,
  initialName: string
): SystemStudioV2TemplateContext {
  const currentParticipant = session.participants?.find((participant) => participant.userId === subjectUser.id) ?? null;
  const gmParticipant = session.participants?.find((participant) => participant.userId === session.gmUserId || participant.role === 'gm') ?? null;
  return {
    nompj: initialName || '',
    nompartie: session.name || '',
    nommj: gmParticipant?.nickname || gmParticipant?.displayName || session.gmUserId || '',
    nomjoueur: subjectUser.displayName || subjectUser.id,
    pseudojoueur: currentParticipant?.nickname || subjectUser.nickname || subjectUser.id,
    nomsysteme: system.name || '',
    datecreation: new Date().toISOString().slice(0, 10),
    rolelecteur: 'player',
    lecteurestmj: subjectUser.id === currentUser.id && currentUser.roles.includes('admin') ? 'true' : 'false',
    lecteurestjoueur: 'true',
    lecteurestproprietaire: subjectUser.id === currentUser.id ? 'true' : 'false'
  };
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

function areValuesEqual(left: SystemStudioV2Values, right: SystemStudioV2Values): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => Object.is(left[key], right[key]));
}

function collectInteractiveBlockIds(blocks: CharacterCreationScenarioBlockDefinition[]): string[] {
  const ids: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case 'question_text':
      case 'question_textarea':
      case 'question_number':
      case 'question_choice':
      case 'question_catalog':
      case 'allocation':
      case 'roll':
        ids.push(block.id);
        break;
      case 'group':
      case 'loop':
      case 'while':
        ids.push(...collectInteractiveBlockIds(block.blocks));
        break;
      case 'if':
        ids.push(...collectInteractiveBlockIds(block.thenBlocks));
        ids.push(...collectInteractiveBlockIds(block.elseBlocks));
        for (const branch of block.elseIfBranches ?? []) {
          ids.push(...collectInteractiveBlockIds(branch.blocks));
        }
        break;
      default:
        break;
    }
  }
  return ids;
}

function extractConditionTokens(condition: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const patterns = [/\{\{([A-Za-z0-9_.\[\]]+)\}\}/g, /@([A-Za-z0-9_.\[\]]+)/g];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(condition)) !== null) {
      const token = match[1];
      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }
  }
  return tokens;
}

function splitConditionClauses(condition: string): string[] {
  return condition
    .split(/\s*&&\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isQuestionBlockSatisfied(
  block: CharacterCreationQuestionTextBlock | CharacterCreationQuestionChoiceBlock | CharacterCreationQuestionCatalogBlock,
  values: SystemStudioV2Values,
  currentView: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext: SystemStudioV2TemplateContext
): boolean {
  if (block.kind === 'question_text' || block.kind === 'question_textarea') {
    const targetKey = resolveBindingTargetKey(block.target, currentView, allViews);
    return !block.required || !isEmptyValue(values[targetKey]);
  }
  if (block.kind === 'question_number') {
    const targetKey = resolveBindingTargetKey(block.target, currentView, allViews);
    const rawValue = values[targetKey];
    if (isEmptyValue(rawValue)) {
      return !block.required;
    }
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return false;
    }
    const min = block.minFormula?.trim() ? evaluateMathExpression(block.minFormula, values, currentView, allViews, templateContext) : null;
    const max = block.maxFormula?.trim() ? evaluateMathExpression(block.maxFormula, values, currentView, allViews, templateContext) : null;
    if (min !== null && numericValue < min) {
      return false;
    }
    if (max !== null && numericValue > max) {
      return false;
    }
    return true;
  }
  if (block.kind === 'question_choice' || block.kind === 'question_catalog') {
    if (block.kind === 'question_catalog') {
      return effectiveCatalogMappings(block).some((mapping) => {
        if (!mapping.target.key?.trim()) {
          return false;
        }
        const targetKey = resolveBindingTargetKey(mapping.target, currentView, allViews);
        return String(values[targetKey] ?? '').trim().length > 0;
      });
    }
    const targetKey = resolveBindingTargetKey(block.target, currentView, allViews);
    return String(values[targetKey] ?? '').trim().length > 0;
  }
  return true;
}

function isInteractiveBlockSatisfied(
  block: PendingBlock,
  values: SystemStudioV2Values,
  currentView: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext: SystemStudioV2TemplateContext
): boolean {
  if (
    block.kind === 'question_text' ||
    block.kind === 'question_textarea' ||
    block.kind === 'question_number' ||
    block.kind === 'question_choice' ||
    block.kind === 'question_catalog'
  ) {
    return isQuestionBlockSatisfied(block, values, currentView, allViews, templateContext);
  }
  if (block.kind === 'allocation') {
    return Boolean(block.poolKey.trim());
  }
  if (block.kind === 'roll') {
    return values[answeredKey(block.id)] === true;
  }
  return true;
}

function findViewByRef(allViews: SystemStudioViewDefinitionV2[], currentView: SystemStudioViewDefinitionV2, viewRef?: string) {
  if (!viewRef?.trim()) {
    return currentView;
  }
  return allViews.find((item) => item.reference === viewRef || item.id === viewRef || item.name === viewRef) ?? currentView;
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
  view: SystemStudioViewDefinitionV2,
  rawIdentifier: string | null | undefined
) {
  const identifier = String(rawIdentifier ?? '').trim();
  if (!identifier) {
    return null;
  }
  const exactMatch =
    view.nodes.find((item) => item.key === identifier) ??
    view.nodes.find((item) => item.label === identifier) ??
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
    view.nodes.find((item) => normalizeLookupValue(item.key) === normalizedIdentifier) ??
    view.nodes.find((item) => normalizeLookupValue(item.label) === normalizedIdentifier) ??
    view.nodes.find((item) => normalizeLookupIdentifier(item.key) === normalizedSlug) ??
    view.nodes.find((item) => normalizeLookupIdentifier(item.label) === normalizedSlug) ??
    null
  );
}

function resolveBindingTargetKey(target: CharacterCreationBindingTarget, currentView: SystemStudioViewDefinitionV2, allViews: SystemStudioViewDefinitionV2[]) {
  if (!target.key?.trim()) {
    return '';
  }
  if (target.scope !== 'sheet') {
    return target.key;
  }
  const scopeView = findViewByRef(allViews, currentView, target.viewRef);
  const node = findNodeByKeyOrLabel(scopeView, target.key);
  return node?.key ?? target.key;
}

function resolveTokenRawValue(
  token: string,
  values: SystemStudioV2Values,
  currentView: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext: SystemStudioV2TemplateContext
): SystemStudioV2Value | undefined {
  const trimmed = token.trim().replace(/^@/, '');
  if (!trimmed) {
    return undefined;
  }
  const [maybeViewRef, ...rest] = trimmed.split('.');
  if (!rest.length) {
    if (trimmed in values) {
      return values[trimmed];
    }
    return templateContext[trimmed as keyof SystemStudioV2TemplateContext] as unknown as SystemStudioV2Value | undefined;
  }
  const scopeView = allViews.find((item) => item.reference === maybeViewRef || item.id === maybeViewRef || item.name === maybeViewRef) ?? null;
  if (!scopeView) {
    if (trimmed in values) {
      return values[trimmed];
    }
    return undefined;
  }
  const label = rest.join('.');
  const node = findNodeByKeyOrLabel(scopeView, label);
  if (!node) {
    return values[label] as SystemStudioV2Value | undefined;
  }
  return values[node.key] as SystemStudioV2Value | undefined;
}

function rollDiceExpression(
  expression: string,
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext: SystemStudioV2TemplateContext
): number | null {
  const diceResolved = expression.replace(/(\d*)d(\d+)/gi, (_match, rawCount: string, rawSides: string) => {
    const count = Math.max(1, Number(rawCount || 1));
    const sides = Math.max(2, Number(rawSides || 6));
    const total = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1).reduce((sum, value) => sum + value, 0);
    return String(total);
  });
  return evaluateMathExpression(diceResolved, values, view, allViews, templateContext);
}

function resolveScriptValue(
  formula: string,
  values: SystemStudioV2Values,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[],
  templateContext: SystemStudioV2TemplateContext
): SystemStudioV2Value {
  const trimmed = formula.trim();
  if (!trimmed) {
    return '';
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^@([A-Za-z0-9_.\[\]]+)$/.test(trimmed)) {
    return resolveTokenRawValue(trimmed, values, view, allViews, templateContext) ?? '';
  }
  if (/^(?:\d+)?d\d+/i.test(trimmed)) {
    return rollDiceExpression(trimmed, values, view, allViews, templateContext) ?? 0;
  }
  const numeric = evaluateMathExpression(trimmed, values, view, allViews, templateContext);
  if (numeric !== null) {
    return numeric;
  }
  return trimmed;
}

function buildDerivedValues(
  view: SystemStudioViewDefinitionV2,
  system: GameSystem,
  baseValues: SystemStudioV2Values,
  templateContext: SystemStudioV2TemplateContext
): SystemStudioV2Values {
  return applySystemStudioV2Formulas(view, baseValues, system.studioSchemaV2?.views ?? [view], templateContext);
}

function buildCharacterCreationInitialValues(params: {
  view: SystemStudioViewDefinitionV2;
  system: GameSystem;
  config: CharacterCreationConfigV2;
  templateContext: SystemStudioV2TemplateContext;
}): SystemStudioV2Values {
  const { view, system, config, templateContext } = params;
  const allViews = system.studioSchemaV2?.views ?? [view];
  let values = buildDerivedValues(view, system, buildInitialSystemStudioV2Values(view, templateContext), templateContext);

  config.pools.forEach((pool) => {
    const result = resolveScriptValue(pool.initialValueFormula, values, view, allViews, templateContext);
    const nextValue = typeof result === 'boolean' ? Number(result) : result;
    values = buildDerivedValues(
      view,
      system,
      {
        ...values,
        [pool.key]: nextValue,
        [poolInitialKey(pool.key)]: nextValue
      },
      templateContext
    );
  });

  config.variables.forEach((variable) => {
    const result = resolveScriptValue(variable.initialValueFormula, values, view, allViews, templateContext);
    const nextValue = typeof result === 'boolean' ? Number(result) : result;
    values = buildDerivedValues(
      view,
      system,
      {
        ...values,
        [variable.key]: nextValue,
        [variableInitialKey(variable.key)]: nextValue
      },
      templateContext
    );
  });

  return values;
}

function writeBindingTarget(
  values: SystemStudioV2Values,
  target: CharacterCreationBindingTarget,
  nextValue: SystemStudioV2Value,
  view: SystemStudioViewDefinitionV2,
  allViews: SystemStudioViewDefinitionV2[]
): SystemStudioV2Values {
  const key = resolveBindingTargetKey(target, view, allViews);
  if (!key) {
    return values;
  }
  return {
    ...values,
    [key]: nextValue
  };
}

function computeAllocationStepCost(params: {
  formula: string;
  direction: 'up' | 'down';
  currentValue: number;
  nextValue: number;
  baseValue: number;
  stepValue: number;
  values: SystemStudioV2Values;
  view: SystemStudioViewDefinitionV2;
  allViews: SystemStudioViewDefinitionV2[];
  templateContext: SystemStudioV2TemplateContext;
}): number {
  const { formula, direction, currentValue, nextValue, baseValue, stepValue, values, view, allViews, templateContext } = params;
  const evaluationValues: SystemStudioV2Values =
    direction === 'up'
      ? {
          ...values,
          current_value: currentValue,
          next_value: nextValue,
          applied_value: nextValue,
          previous_value: currentValue,
          base_value: baseValue,
          step_value: stepValue,
          delta_value: stepValue
        }
      : {
          ...values,
          current_value: nextValue,
          next_value: currentValue,
          applied_value: currentValue,
          previous_value: nextValue,
          base_value: baseValue,
          step_value: stepValue,
          delta_value: -stepValue
        };
  return Math.max(0, toNumber(resolveScriptValue(formula, evaluationValues, view, allViews, templateContext)));
}

function computeAllocationViewBound(params: {
  formula?: string;
  currentValue: number;
  baseValue: number;
  values: SystemStudioV2Values;
  view: SystemStudioViewDefinitionV2;
  allViews: SystemStudioViewDefinitionV2[];
  templateContext: SystemStudioV2TemplateContext;
}): number | null {
  const { formula, currentValue, baseValue, values, view, allViews, templateContext } = params;
  if (!formula?.trim()) {
    return null;
  }
  const evaluationValues: SystemStudioV2Values = {
    ...values,
    current_value: currentValue,
    base_value: baseValue
  };
  const result = evaluateMathExpression(formula, evaluationValues, view, allViews, templateContext);
  return Number.isFinite(result) ? result : null;
}

function executeBlocks(params: {
  blocks: CharacterCreationScenarioBlockDefinition[];
  values: SystemStudioV2Values;
  view: SystemStudioViewDefinitionV2;
  system: GameSystem;
  templateContext: SystemStudioV2TemplateContext;
  allViews: SystemStudioViewDefinitionV2[];
  catalogs: SystemCatalogDefinition[];
}): Omit<StageExecutionResult, 'completionSatisfied'> {
  const { blocks, view, system, templateContext, allViews } = params;
  let values = params.values;
  const messages: StageExecutionResult['messages'] = [];
  const pendingBlocks: PendingBlock[] = [];

  for (const block of blocks) {
    if (!block.enabled) {
      continue;
    }

    if (block.kind === 'message') {
      messages.push({ id: block.id, label: block.label, content: block.content, tone: block.tone });
      continue;
    }

    if (
      block.kind === 'question_text' ||
      block.kind === 'question_textarea' ||
      block.kind === 'question_number' ||
      block.kind === 'question_choice' ||
      block.kind === 'question_catalog' ||
      block.kind === 'roll' ||
      block.kind === 'allocation'
    ) {
      const needsAnswerFlag = block.kind === 'roll';
      if (needsAnswerFlag && values[answeredKey(block.id)] === true) {
        continue;
      }
      if (!needsAnswerFlag && 'defaultValueFormula' in block && block.defaultValueFormula?.trim()) {
        const targetKey = resolveBindingTargetKey(block.target, view, allViews);
        if (isEmptyValue(values[targetKey])) {
          const defaultValue = resolveScriptValue(block.defaultValueFormula, values, view, allViews, templateContext);
          values = buildDerivedValues(view, system, writeBindingTarget(values, block.target, defaultValue, view, allViews), templateContext);
        }
      }
      pendingBlocks.push(block);
      continue;
    }

    if (block.kind === 'set_value') {
      if (!block.target.key?.trim()) {
        continue;
      }
      const result = resolveScriptValue(block.valueFormula, values, view, allViews, templateContext);
      values = buildDerivedValues(view, system, writeBindingTarget(values, block.target, result, view, allViews), templateContext);
      continue;
    }

    if (block.kind === 'copy_value') {
      if (!block.target.key?.trim()) {
        continue;
      }
      const result = resolveScriptValue(block.sourceFormula, values, view, allViews, templateContext);
      values = buildDerivedValues(view, system, writeBindingTarget(values, block.target, result, view, allViews), templateContext);
      continue;
    }

    if (block.kind === 'adjust_value') {
      if (!block.target.key?.trim()) {
        continue;
      }
      const targetKey = resolveBindingTargetKey(block.target, view, allViews);
      const currentValue = toNumber(values[targetKey]);
      const delta = toNumber(resolveScriptValue(block.valueFormula, values, view, allViews, templateContext));
      let nextValue = currentValue;
      switch (block.operator) {
        case 'add':
          nextValue = currentValue + delta;
          break;
        case 'subtract':
          nextValue = currentValue - delta;
          break;
        case 'multiply':
          nextValue = currentValue * delta;
          break;
        case 'divide':
          nextValue = delta === 0 ? currentValue : currentValue / delta;
          break;
        case 'set':
          nextValue = delta;
          break;
        default:
          nextValue = currentValue;
          break;
      }
      values = buildDerivedValues(view, system, writeBindingTarget(values, block.target, nextValue, view, allViews), templateContext);
      continue;
    }

    if (block.kind === 'if') {
      const matchedThen = !block.condition.trim() || evaluateCondition(block.condition, values, view, allViews, templateContext);
      if (matchedThen) {
        const branchResult = executeBlocks({ blocks: block.thenBlocks, values, view, system, templateContext, allViews, catalogs: params.catalogs });
        values = branchResult.values;
        messages.push(...branchResult.messages);
        pendingBlocks.push(...branchResult.pendingBlocks);
        if (branchResult.stopReason || branchResult.stageAdvance) {
          return { ...branchResult, values, messages, pendingBlocks };
        }
        continue;
      }
      const elseIfMatch = (block.elseIfBranches ?? []).find((branch) => evaluateCondition(branch.condition, values, view, allViews, templateContext));
      if (elseIfMatch) {
        const branchResult = executeBlocks({ blocks: elseIfMatch.blocks, values, view, system, templateContext, allViews, catalogs: params.catalogs });
        values = branchResult.values;
        messages.push(...branchResult.messages);
        pendingBlocks.push(...branchResult.pendingBlocks);
        if (branchResult.stopReason || branchResult.stageAdvance) {
          return { ...branchResult, values, messages, pendingBlocks };
        }
        continue;
      }
      const branchResult = executeBlocks({ blocks: block.elseBlocks, values, view, system, templateContext, allViews, catalogs: params.catalogs });
      values = branchResult.values;
      messages.push(...branchResult.messages);
      pendingBlocks.push(...branchResult.pendingBlocks);
      if (branchResult.stopReason || branchResult.stageAdvance) {
        return { ...branchResult, values, messages, pendingBlocks };
      }
      continue;
    }

    if (block.kind === 'group') {
      const branchResult = executeBlocks({ blocks: block.blocks, values, view, system, templateContext, allViews, catalogs: params.catalogs });
      values = branchResult.values;
      messages.push(...branchResult.messages);
      pendingBlocks.push(...branchResult.pendingBlocks);
      if (branchResult.stopReason || branchResult.stageAdvance) {
        return { ...branchResult, values, messages, pendingBlocks };
      }
      continue;
    }

    if (block.kind === 'loop') {
      const iterations = Math.max(0, Math.min(100, Math.floor(toNumber(resolveScriptValue(block.iterationsFormula, values, view, allViews, templateContext)))));
      for (let index = 0; index < iterations; index += 1) {
        values = { ...values, loop_index: index + 1 };
        const branchResult = executeBlocks({ blocks: block.blocks, values, view, system, templateContext, allViews, catalogs: params.catalogs });
        values = branchResult.values;
        messages.push(...branchResult.messages);
        pendingBlocks.push(...branchResult.pendingBlocks);
        if (branchResult.stopReason || branchResult.stageAdvance) {
          return { ...branchResult, values, messages, pendingBlocks };
        }
      }
      continue;
    }

    if (block.kind === 'while') {
      const maxIterationsRaw = block.maxIterationsFormula?.trim() ? resolveScriptValue(block.maxIterationsFormula, values, view, allViews, templateContext) : 25;
      const maxIterations = Math.max(1, Math.min(100, Math.floor(toNumber(maxIterationsRaw))));
      let guard = 0;
      while ((!block.condition.trim() || evaluateCondition(block.condition, values, view, allViews, templateContext)) && guard < maxIterations) {
        guard += 1;
        values = { ...values, while_index: guard };
        const branchResult = executeBlocks({ blocks: block.blocks, values, view, system, templateContext, allViews, catalogs: params.catalogs });
        values = branchResult.values;
        messages.push(...branchResult.messages);
        pendingBlocks.push(...branchResult.pendingBlocks);
        if (branchResult.stopReason || branchResult.stageAdvance) {
          return { ...branchResult, values, messages, pendingBlocks };
        }
      }
      continue;
    }

    if (block.kind === 'next_stage') {
      return { values, messages, pendingBlocks, stopReason: null, stageAdvance: true };
    }

    if (block.kind === 'stop') {
      return {
        values,
        messages,
        pendingBlocks,
        stopReason: block.reason?.trim() || block.description?.trim() || block.label || 'Le scénario a demandé un arrêt.',
        stageAdvance: false
      };
    }
  }

  return { values, messages, pendingBlocks, stopReason: null, stageAdvance: false };
}

export default function SessionCharacterCreationWizardV2({
  open,
  system,
  session,
  view,
  currentUser,
  subjectUser,
  initialCharacterName,
  onClose,
  onComplete
}: Props) {
  const config = system.characterCreationConfig?.version === 2 ? (system.characterCreationConfig as CharacterCreationConfigV2) : null;
  const stages = useMemo(() => (config?.stages ?? []).filter((stage) => stage.enabled), [config]);
  const effectiveSubjectUser = subjectUser ?? currentUser;
  const templateContext = useMemo(
    () => buildTemplateContext(system, session, currentUser, effectiveSubjectUser, initialCharacterName),
    [
      currentUser.id,
      Array.isArray(currentUser.roles) ? currentUser.roles.join('|') : '',
      effectiveSubjectUser.id,
      effectiveSubjectUser.displayName,
      effectiveSubjectUser.nickname,
      initialCharacterName,
      session.id,
      session.name,
      session.gmUserId,
      session.participants,
      system.id,
      system.name
    ]
  );
  const initialValues = useMemo(
    () => (config ? buildCharacterCreationInitialValues({ view, system, config, templateContext }) : {}),
    [config, system, templateContext, view]
  );
  const [runtimeValues, setRuntimeValues] = useState<SystemStudioV2Values>(initialValues);
  const [stageIndex, setStageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [catalogFreeText, setCatalogFreeText] = useState<Record<string, string>>({});
  const [catalogSelections, setCatalogSelections] = useState<Record<string, string>>({});
  const [appliedCatalogSelections, setAppliedCatalogSelections] = useState<Record<string, string>>({});
  const lastOpenedRef = useRef(false);
  const lastResetKeyRef = useRef<string>('');
  const suppressAutoAdvanceRef = useRef(false);

  const allViews = system.studioSchemaV2?.views ?? [view];
  const catalogs = system.catalogs ?? [];

  useEffect(() => {
    if (!open) {
      lastOpenedRef.current = false;
      return;
    }
    const resetKey = `${session.id}:${system.id}:${view.id}:${effectiveSubjectUser.id}`;
    const shouldReset = !lastOpenedRef.current || lastResetKeyRef.current !== resetKey;
    if (!shouldReset) {
      return;
    }
    lastOpenedRef.current = true;
    lastResetKeyRef.current = resetKey;
    suppressAutoAdvanceRef.current = false;
    setRuntimeValues(initialValues);
    setStageIndex(0);
    setErrorMessage(null);
    setCatalogFreeText({});
    setCatalogSelections({});
    setAppliedCatalogSelections({});
  }, [effectiveSubjectUser.id, initialValues, open, session.id, system.id, view.id]);

  const currentStage = stages[stageIndex] ?? null;
  const isAdminDebug = Array.isArray(currentUser.roles) && currentUser.roles.includes('admin');

  const stageRuntime = useMemo<StageExecutionResult>(() => {
    if (!currentStage) {
      return {
        values: runtimeValues,
        messages: [],
        pendingBlocks: [],
        stopReason: null,
        stageAdvance: false,
        completionSatisfied: true
      };
    }
    if (currentStage.entryCondition?.trim() && !evaluateCondition(currentStage.entryCondition, runtimeValues, view, allViews, templateContext)) {
      return {
        values: runtimeValues,
        messages: [],
        pendingBlocks: [],
        stopReason: null,
        stageAdvance: true,
        completionSatisfied: true
      };
    }
    const executed = executeBlocks({
      blocks: currentStage.blocks,
      values: runtimeValues,
      view,
      system,
      templateContext,
      allViews,
      catalogs
    });
    const completionSatisfied = !currentStage.completionCondition?.trim() || evaluateCondition(currentStage.completionCondition, executed.values, view, allViews, templateContext);
    return {
      ...executed,
      completionSatisfied
    };
  }, [allViews, catalogs, currentStage, runtimeValues, system, templateContext, view]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!areValuesEqual(stageRuntime.values, runtimeValues)) {
      setRuntimeValues(stageRuntime.values);
      return;
    }
    if (
      !suppressAutoAdvanceRef.current &&
      stageRuntime.stageAdvance &&
      stageRuntime.pendingBlocks.length === 0 &&
      !stageRuntime.stopReason &&
      stageIndex < stages.length - 1
    ) {
      setStageIndex((current) => Math.min(stages.length - 1, current + 1));
    }
  }, [open, runtimeValues, stageRuntime, stageIndex, stages.length]);

  const poolStates = useMemo(
    () =>
      (config?.pools ?? []).map((pool) => ({
        key: pool.key,
        label: pool.label,
        current: toNumber(runtimeValues[pool.key]),
        initial: toNumber(runtimeValues[poolInitialKey(pool.key)])
      })),
    [config?.pools, runtimeValues]
  );

  const creationVariables = useMemo(
    () =>
      (config?.variables ?? []).map((variable) => ({
        key: variable.key,
        label: variable.label,
        current: runtimeValues[variable.key],
        initial: runtimeValues[variableInitialKey(variable.key)]
      })),
    [config?.variables, runtimeValues]
  );

  const completionDebug = useMemo(() => {
    const condition = currentStage?.completionCondition?.trim() ?? '';
    if (!condition) {
      return null;
    }
    const tokens = extractConditionTokens(condition).map((token) => ({
      token,
      value: resolveTokenRawValue(token, runtimeValues, view, allViews, templateContext)
    }));
    return {
      condition,
      satisfied: stageRuntime.completionSatisfied,
      tokens,
      clauses: splitConditionClauses(condition).map((clause) => ({
        clause,
        valid: evaluateCondition(clause, runtimeValues, view, allViews, templateContext)
      }))
    };
  }, [allViews, currentStage?.completionCondition, runtimeValues, stageRuntime.completionSatisfied, templateContext, view]);

  const resolveCharacterName = () => {
    const explicit = String(runtimeValues.nom_du_personnage ?? runtimeValues.name ?? runtimeValues.nom ?? '').trim();
    return explicit || initialCharacterName.trim() || view.name;
  };

  const updateValue = (key: string, value: SystemStudioV2Value) => {
    setRuntimeValues((current) => buildDerivedValues(view, system, { ...current, [key]: value }, templateContext));
  };

  const handleAdjustAllocation = (
    block: CharacterCreationAllocationBlock,
    targetId: string,
    direction: 'up' | 'down'
  ) => {
    const target = block.targets.find((entry) => entry.id === targetId);
    if (!target) {
      return;
    }
    const allViewsForEval = allViews;
    const targetKey = resolveBindingTargetKey(target.target, view, allViewsForEval);
    const currentValue = toNumber(runtimeValues[targetKey]);
    const stepValue = Math.max(1, Math.abs(toNumber(target.step ?? 1)));
    const nextValue = direction === 'up' ? currentValue + stepValue : currentValue - stepValue;
    const min = target.minFormula?.trim() ? evaluateMathExpression(target.minFormula, runtimeValues, view, allViewsForEval, templateContext) : null;
    const max = target.maxFormula?.trim() ? evaluateMathExpression(target.maxFormula, runtimeValues, view, allViewsForEval, templateContext) : null;

    if (min !== null && nextValue < min) {
      setErrorMessage(`La valeur minimale pour ${target.label} est ${min}.`);
      return;
    }
    if (max !== null && nextValue > max) {
      setErrorMessage(`La valeur maximale pour ${target.label} est ${max}.`);
      return;
    }
    if (target.condition?.trim() && !evaluateCondition(target.condition, runtimeValues, view, allViewsForEval, templateContext)) {
      setErrorMessage(`La cible ${target.label} n'est pas disponible dans l'état actuel du scénario.`);
      return;
    }

    const poolKey = block.poolKey.trim();
    const poolCurrent = poolKey ? toNumber(runtimeValues[poolKey]) : 0;
    const baseValue = toNumber(initialValues[targetKey] ?? 0);
    const stepCost = computeAllocationStepCost({
      formula: target.costFormula,
      direction,
      currentValue,
      nextValue,
      baseValue,
      stepValue,
      values: runtimeValues,
      view,
      allViews: allViewsForEval,
      templateContext
    });

    if (direction === 'up' && poolKey && poolCurrent < stepCost) {
      setErrorMessage(`La réserve ${poolKey} ne contient pas assez de points pour ${target.label}.`);
      return;
    }

    const nextValues = buildDerivedValues(
      view,
      system,
      {
        ...runtimeValues,
        [targetKey]: nextValue,
        ...(poolKey
          ? {
              [poolKey]: direction === 'up' ? poolCurrent - stepCost : poolCurrent + stepCost
            }
          : {})
      },
      templateContext
    );
    setErrorMessage(null);
    setRuntimeValues(nextValues);
  };

  const handleAdjustAllocationViewField = (
    block: CharacterCreationAllocationBlock,
    viewTargetId: string,
    fieldKey: string,
    direction: 'up' | 'down'
  ) => {
    const viewTarget = (block.viewTargets ?? []).find((entry) => entry.id === viewTargetId);
    if (!viewTarget || !viewTarget.viewRef) {
      return;
    }
    if ((viewTarget.hiddenFieldKeys ?? []).includes(fieldKey) || (viewTarget.lockedFieldKeys ?? []).includes(fieldKey)) {
      return;
    }
    if (viewTarget.condition?.trim() && !evaluateCondition(viewTarget.condition, runtimeValues, view, allViews, templateContext)) {
      setErrorMessage(`La vue ${viewTarget.label || viewTarget.viewRef} n'est pas disponible dans l'état actuel du scénario.`);
      return;
    }
    const bindingTarget: CharacterCreationBindingTarget = {
      scope: 'sheet',
      viewRef: viewTarget.viewRef,
      key: fieldKey
    };
    const targetKey = resolveBindingTargetKey(bindingTarget, view, allViews);
    const currentValue = toNumber(runtimeValues[targetKey]);
    const baseValue = toNumber(initialValues[targetKey] ?? 0);
    const minValue = computeAllocationViewBound({
      formula: viewTarget.minFormula,
      currentValue,
      baseValue,
      values: runtimeValues,
      view,
      allViews,
      templateContext
    });
    const maxValue = computeAllocationViewBound({
      formula: viewTarget.maxFormula,
      currentValue,
      baseValue,
      values: runtimeValues,
      view,
      allViews,
      templateContext
    });
    const stepValue = 1;
    const nextValue = direction === 'up' ? currentValue + stepValue : currentValue - stepValue;
    const effectiveMin = minValue ?? 0;
    if (nextValue < effectiveMin) {
      setErrorMessage(`La valeur ne peut pas descendre sous ${effectiveMin}.`);
      return;
    }
    if (maxValue !== null && nextValue > maxValue) {
      setErrorMessage(`La valeur ne peut pas dépasser ${maxValue}.`);
      return;
    }
    const poolKey = block.poolKey.trim();
    const poolCurrent = poolKey ? toNumber(runtimeValues[poolKey]) : 0;
    const stepCost = computeAllocationStepCost({
      formula: viewTarget.costFormula,
      direction,
      currentValue,
      nextValue,
      baseValue,
      stepValue,
      values: runtimeValues,
      view,
      allViews,
      templateContext
    });
    if (direction === 'up' && poolKey && poolCurrent < stepCost) {
      setErrorMessage(`La réserve ${poolKey} ne contient pas assez de points.`);
      return;
    }
    const nextValues = buildDerivedValues(
      view,
      system,
      {
        ...runtimeValues,
        [targetKey]: nextValue,
        ...(poolKey
          ? {
              [poolKey]: direction === 'up' ? poolCurrent - stepCost : poolCurrent + stepCost
            }
          : {})
      },
      templateContext
    );
    setErrorMessage(null);
    setRuntimeValues(nextValues);
  };

  const applyCatalogChoiceSelection = (
    block: CharacterCreationQuestionCatalogBlock,
    choiceId: string,
    freeTextValue?: string
  ): boolean => {
    const mappings = effectiveCatalogMappings(block);
    const primaryMapping = mappings[0] ?? null;
    const primaryTargetKey = primaryMapping?.target?.key?.trim() ? resolveBindingTargetKey(primaryMapping.target, view, allViews) : '';
    const catalog = catalogs.find((entry) => entry.key === block.catalogKey);
    const choices = parseCatalogChoices(catalog, {
      labelColumnKey: block.labelColumnKey,
      valueColumnKey: block.valueColumnKey,
      costColumnKey: block.costColumnKey
    });
    const previousChoiceId = appliedCatalogSelections[block.id] ?? (primaryTargetKey ? choices.find((choice) => String(runtimeValues[primaryTargetKey] ?? '') === choice.value)?.id ?? '' : '');
    const previousChoice = choices.find((choice) => choice.id === previousChoiceId) ?? null;
    const nextChoice = choices.find((choice) => choice.id === choiceId) ?? null;
    let nextValues = { ...runtimeValues };

    if (block.costColumnKey?.trim() && block.costTarget?.key?.trim()) {
      const costKey = resolveBindingTargetKey(block.costTarget, view, allViews);
      const currentCostValue = toNumber(nextValues[costKey]);
      let adjustedCostValue = currentCostValue;
      if (previousChoice) {
        adjustedCostValue += previousChoice.cost;
      }
      if (nextChoice) {
        if (adjustedCostValue < nextChoice.cost) {
          setErrorMessage(`La réserve ${costKey} ne contient pas assez de points pour ${nextChoice.label}.`);
          return false;
        }
        adjustedCostValue -= nextChoice.cost;
      }
      nextValues[costKey] = adjustedCostValue;
    }

    mappings.forEach((mapping, index) => {
      if (!mapping.target.key?.trim()) {
        return;
      }
      const mappedValue =
        nextChoice && mapping.valueColumnKey?.trim()
          ? String((catalog?.entries.find((entry) => entry.id === nextChoice.id)?.values ?? {})[mapping.valueColumnKey] ?? '')
          : index === 0
            ? nextChoice?.value ?? freeTextValue ?? ''
            : '';
      nextValues = writeBindingTarget(nextValues, mapping.target, mappedValue, view, allViews);
    });
    setErrorMessage(null);
    setRuntimeValues(buildDerivedValues(view, system, nextValues, templateContext));
    setAppliedCatalogSelections((current) => ({ ...current, [block.id]: nextChoice?.id ?? '' }));
    return true;
  };

  const confirmQuestionAnswer = (block: PendingBlock) => {
    if (block.kind === 'question_catalog') {
      const mappings = effectiveCatalogMappings(block);
      const primaryMapping = mappings[0] ?? null;
      const targetKey = primaryMapping?.target?.key?.trim() ? resolveBindingTargetKey(primaryMapping.target, view, allViews) : '';
      const catalog = catalogs.find((entry) => entry.key === block.catalogKey);
      const freeText = (catalogFreeText[block.id] ?? '').trim();
      const choices = parseCatalogChoices(catalog, {
        labelColumnKey: block.labelColumnKey,
        valueColumnKey: block.valueColumnKey,
        costColumnKey: block.costColumnKey
      });
      const selectedChoiceId = catalogSelections[block.id] ?? choices.find((choice) => String(runtimeValues[targetKey] ?? '') === choice.value)?.id ?? '';

      if (!freeText) {
        const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId);
        if (!selectedChoice) {
          setErrorMessage('Choisis une valeur avant de continuer.');
          return;
        }
        let nextValues = writeBindingTarget(runtimeValues, block.target, selectedChoice.value, view, allViews);
        if (block.costColumnKey?.trim()) {
          if (!block.costTarget?.key?.trim()) {
            setErrorMessage('Sélectionne la variable ou réserve à débiter pour ce coût.');
            return;
          }
          const costKey = resolveBindingTargetKey(block.costTarget, view, allViews);
          const currentCostValue = toNumber(nextValues[costKey]);
          nextValues = buildDerivedValues(view, system, { ...nextValues, [costKey]: currentCostValue - selectedChoice.cost }, templateContext);
        }
        setErrorMessage(null);
        setRuntimeValues({ ...nextValues, [answeredKey(block.id)]: true });
        return;
      }
    }

    if (block.kind === 'question_number') {
      const targetKey = resolveBindingTargetKey(block.target, view, allViews);
      const rawValue = runtimeValues[targetKey];
      const numericValue = Number(rawValue);
      if (block.required && !Number.isFinite(numericValue)) {
        setErrorMessage('Cette réponse numérique est obligatoire.');
        return;
      }
      const min = block.minFormula?.trim() ? evaluateMathExpression(block.minFormula, runtimeValues, view, allViews, templateContext) : null;
      const max = block.maxFormula?.trim() ? evaluateMathExpression(block.maxFormula, runtimeValues, view, allViews, templateContext) : null;
      if (min !== null && numericValue < min) {
        setErrorMessage(`La valeur doit être supérieure ou égale à ${min}.`);
        return;
      }
      if (max !== null && numericValue > max) {
        setErrorMessage(`La valeur doit être inférieure ou égale à ${max}.`);
        return;
      }
    }

    if ((block.kind === 'question_text' || block.kind === 'question_textarea') && block.required) {
      const targetKey = resolveBindingTargetKey(block.target, view, allViews);
      if (isEmptyValue(runtimeValues[targetKey])) {
        setErrorMessage('Cette réponse est obligatoire.');
        return;
      }
    }

    if ((block.kind === 'question_choice' || block.kind === 'question_catalog') && block.target) {
      if (block.kind === 'question_catalog' || block.kind === 'question_choice') {
        const targetKey =
          block.kind === 'question_catalog'
            ? (() => {
                const firstMapping = effectiveCatalogMappings(block)[0];
                return firstMapping?.target?.key?.trim() ? resolveBindingTargetKey(firstMapping.target, view, allViews) : '';
              })()
            : resolveBindingTargetKey(block.target, view, allViews);
        const rawValue = String(targetKey ? runtimeValues[targetKey] ?? '' : '').trim();
        if (!rawValue) {
          setErrorMessage('Choisis une valeur avant de continuer.');
          return;
        }
      }
    }

    setErrorMessage(null);
    setRuntimeValues((current) => ({ ...current, [answeredKey(block.id)]: true }));
  };

  const confirmAllocation = (block: CharacterCreationAllocationBlock) => {
    if (!block.poolKey.trim()) {
      setErrorMessage('Sélectionne une réserve source pour ce bloc de répartition.');
      return;
    }
    setErrorMessage(null);
    setRuntimeValues((current) => ({ ...current, [answeredKey(block.id)]: true }));
  };

  const handleRoll = (block: CharacterCreationRollBlock) => {
    const result = rollDiceExpression(block.diceFormula, runtimeValues, view, allViews, templateContext);
    if (result === null) {
      setErrorMessage('Impossible de calculer ce tirage.');
      return;
    }
    setErrorMessage(null);
    const nextValues = writeBindingTarget(runtimeValues, block.target, result, view, allViews);
    setRuntimeValues(buildDerivedValues(view, system, { ...nextValues, [answeredKey(block.id)]: true }, templateContext));
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onComplete({
        name: resolveCharacterName(),
        runtimeValues
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de terminer la création.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rewindToStage = (targetStageIndex: number) => {
    const clampedTarget = Math.max(0, Math.min(stages.length - 1, targetStageIndex));
    const interactiveIdsToReset = stages.slice(clampedTarget).flatMap((stage) => collectInteractiveBlockIds(stage.blocks));
    suppressAutoAdvanceRef.current = true;
    setErrorMessage(null);
    setRuntimeValues((current) => {
      if (!interactiveIdsToReset.length) {
        return current;
      }
      const nextValues = { ...current };
      for (const blockId of interactiveIdsToReset) {
        delete nextValues[answeredKey(blockId)];
      }
      return nextValues;
    });
    setStageIndex(clampedTarget);
  };

  const renderInteractiveBlock = (block: PendingBlock) => {
    if (block.kind === 'question_text' || block.kind === 'question_textarea' || block.kind === 'question_number') {
      const targetKey = resolveBindingTargetKey(block.target, view, allViews);
      const currentValue = runtimeValues[targetKey] ?? '';
      const isValid = isQuestionBlockSatisfied(block, runtimeValues, view, allViews, templateContext);
      return (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>{block.prompt}</span>
            {block.kind === 'question_textarea' ? (
              <textarea
                value={String(currentValue ?? '')}
                onChange={(event) => updateValue(targetKey, event.target.value)}
                rows={6}
                placeholder={block.placeholder || block.prompt}
              />
            ) : block.kind === 'question_number' ? (
              <input
                type="number"
                value={String(currentValue ?? '')}
                onChange={(event) => updateValue(targetKey, event.target.value === '' ? '' : Number(event.target.value))}
                placeholder={block.placeholder || block.prompt}
              />
            ) : (
              <input
                value={String(currentValue ?? '')}
                onChange={(event) => updateValue(targetKey, event.target.value)}
                placeholder={block.placeholder || block.prompt}
              />
            )}
          </label>
          <small>{isValid ? 'Réponse valide' : 'Réponse incomplète ou invalide'}</small>
        </div>
      );
    }

    if (block.kind === 'question_choice') {
      const targetKey = resolveBindingTargetKey(block.target, view, allViews);
      const currentValue = String(runtimeValues[targetKey] ?? '');
      const freeText = catalogFreeText[block.id] ?? '';
      const isValid = isQuestionBlockSatisfied(block, runtimeValues, view, allViews, templateContext);
      return (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>{block.prompt}</span>
            <select
              value={freeText ? '__free__' : currentValue}
              onChange={(event) => {
                if (event.target.value === '__free__') {
                  setCatalogFreeText((current) => ({ ...current, [block.id]: current[block.id] ?? '' }));
                  updateValue(targetKey, '');
                  return;
                }
                setCatalogFreeText((current) => ({ ...current, [block.id]: '' }));
                updateValue(targetKey, event.target.value);
              }}
            >
              <option value="">Sélectionner</option>
              {block.options.map((option) => (
                <option key={option.id} value={option.value}>
                  {option.label}
                </option>
              ))}
              {block.allowFreeText ? <option value="__free__">Texte libre</option> : null}
            </select>
          </label>
          {block.allowFreeText ? (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Texte libre</span>
              <input
                value={freeText}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCatalogFreeText((current) => ({ ...current, [block.id]: nextValue }));
                  updateValue(targetKey, nextValue);
                }}
                placeholder="Saisir une valeur libre"
              />
            </label>
          ) : null}
          <small>{isValid ? 'Choix valide' : 'Choix requis pour continuer'}</small>
        </div>
      );
    }

    if (block.kind === 'question_catalog') {
      const mappings = effectiveCatalogMappings(block);
      const primaryMapping = mappings[0] ?? null;
      const targetKey = primaryMapping?.target?.key?.trim() ? resolveBindingTargetKey(primaryMapping.target, view, allViews) : '';
      const currentValue = String(targetKey ? runtimeValues[targetKey] ?? '' : '');
      const freeText = catalogFreeText[block.id] ?? '';
      const choices = parseCatalogChoices(catalogs.find((catalog) => catalog.key === block.catalogKey), {
        labelColumnKey: block.labelColumnKey,
        valueColumnKey: block.valueColumnKey,
        costColumnKey: block.costColumnKey
      });
      const selectedChoiceId = catalogSelections[block.id] ?? choices.find((choice) => choice.value === currentValue)?.id ?? '';
      const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId) ?? null;
      const costTargetLabel = block.costTarget?.key ? `${block.costTarget.scope}:${block.costTarget.key}` : '';
      const isValid = isQuestionBlockSatisfied(block, runtimeValues, view, allViews, templateContext);
      return (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>{block.prompt}</span>
            <select
              value={freeText ? '__free__' : selectedChoiceId}
              onChange={(event) => {
                if (event.target.value === '__free__') {
                  setCatalogFreeText((current) => ({ ...current, [block.id]: current[block.id] ?? '' }));
                  applyCatalogChoiceSelection(block, '');
                  setCatalogSelections((current) => ({ ...current, [block.id]: '' }));
                  return;
                }
                setCatalogFreeText((current) => ({ ...current, [block.id]: '' }));
                if (applyCatalogChoiceSelection(block, event.target.value)) {
                  setCatalogSelections((current) => ({ ...current, [block.id]: event.target.value }));
                }
              }}
            >
              <option value="">Sélectionner</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}{choice.cost ? ` · coût ${choice.cost}` : ''}
                </option>
              ))}
              {block.allowFreeText ? <option value="__free__">Texte libre</option> : null}
            </select>
          </label>
          {selectedChoice ? (
            <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
              <strong>Écritures</strong>
              <div style={{ marginTop: '0.35rem', display: 'grid', gap: '0.25rem' }}>
                {mappings.filter((mapping) => mapping.target.key?.trim()).map((mapping, index) => {
                  const rawValue =
                    mapping.valueColumnKey?.trim()
                      ? String((catalogs.find((catalog) => catalog.key === block.catalogKey)?.entries.find((entry) => entry.id === selectedChoice.id)?.values ?? {})[mapping.valueColumnKey] ?? '')
                      : index === 0
                        ? selectedChoice.value
                        : '';
                  return (
                    <div key={mapping.id}>
                      <code>{mapping.target.scope === 'sheet' && mapping.target.viewRef ? `${mapping.target.viewRef}.` : ''}{mapping.target.key}</code> ← <code>{rawValue}</code>
                    </div>
                  );
                })}
              </div>
              {block.costColumnKey?.trim() ? (
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>Coût</strong> : {selectedChoice.cost} sur <code>{costTargetLabel || 'non défini'}</code>
                </div>
              ) : null}
            </div>
          ) : null}
          {block.allowFreeText ? (
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>Texte libre</span>
                    <input
                      value={freeText}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setCatalogFreeText((current) => ({ ...current, [block.id]: nextValue }));
                        applyCatalogChoiceSelection(block, '', nextValue);
                      }}
                      placeholder="Saisir une valeur libre"
                    />
                  </label>
                ) : null}
                <small>{isValid ? 'Choix valide' : 'Choix requis pour continuer'}</small>
              </div>
            );
    }

    if (block.kind === 'allocation') {
      const poolRemaining = block.poolKey ? toNumber(runtimeValues[block.poolKey]) : 0;
      const isValid = isInteractiveBlockSatisfied(block, runtimeValues, view, allViews, templateContext);
      const allocationViewTargets = block.viewTargets ?? [];
      if (allocationViewTargets.length > 0) {
        return (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div className="card" style={{ margin: 0, padding: '0.85rem' }}>
              <strong>{block.prompt || block.label}</strong>
              <div style={{ marginTop: '0.35rem' }}>
                Variable / réserve débitée : <code>{block.poolKey || 'non définie'}</code> · restant : <strong>{poolRemaining}</strong>
              </div>
            </div>
            {allocationViewTargets.map((viewTarget) => {
              const targetView = allViews.find((entry) => entry.reference === viewTarget.viewRef || entry.id === viewTarget.viewRef);
              if (!targetView) {
                return (
                  <article key={viewTarget.id} className="card" style={{ margin: 0, padding: '0.85rem' }}>
                    <strong>{viewTarget.label || viewTarget.viewRef || 'Vue cible'}</strong>
                    <div style={{ marginTop: '0.35rem' }}>Vue introuvable.</div>
                  </article>
                );
              }
              const enabled = !viewTarget.condition?.trim() || evaluateCondition(viewTarget.condition, runtimeValues, view, allViews, templateContext);
              const visibleNodes = targetView.nodes
                .filter((node) => ['number', 'progress'].includes(node.type) && !(viewTarget.hiddenFieldKeys ?? []).includes(node.key))
                .sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);
              const previewColumns = Math.min(4, Math.max(2, Math.round(targetView.gridColumns / 6)));
              const viewBackground = targetView.theme?.backgroundColor?.trim() || system.studioTheme?.backgroundColor?.trim() || 'rgba(255,255,255,0.03)';
              const viewTextColor = targetView.theme?.textColor?.trim() || system.studioTheme?.textColor?.trim() || undefined;
              const viewBorderColor = targetView.theme?.borderColor?.trim() || system.studioTheme?.borderColor?.trim() || 'rgba(255,255,255,0.12)';
              const gridStyle: CSSProperties = {
                display: 'grid',
                gap: '0.75rem',
                gridTemplateColumns: `repeat(${previewColumns}, minmax(0, 1fr))`,
                gridAutoRows: 'minmax(0, auto)',
                alignItems: 'start'
              };
              return (
                <article
                  key={viewTarget.id}
                  className="card"
                  style={{
                    margin: 0,
                    padding: '0.85rem',
                    display: 'grid',
                    gap: '0.65rem',
                    background: viewBackground,
                    color: viewTextColor,
                    borderColor: viewBorderColor
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{viewTarget.label || targetView.name}</strong>
                    <small>
                      Coût : <code>{viewTarget.costFormula || '1'}</code>
                      {viewTarget.minFormula?.trim() ? <> · min : <code>{viewTarget.minFormula}</code></> : null}
                      {viewTarget.maxFormula?.trim() ? <> · max : <code>{viewTarget.maxFormula}</code></> : null}
                    </small>
                  </div>
                  {viewTarget.helperText ? <small>{viewTarget.helperText}</small> : null}
                  {visibleNodes.length === 0 ? <small>Aucune variable visible et modifiable dans cette vue.</small> : null}
                  <div style={{ overflowX: 'auto', paddingBottom: '0.25rem' }}>
                    <div style={gridStyle}>
                    {visibleNodes.map((node) => {
                      const bindingTarget: CharacterCreationBindingTarget = { scope: 'sheet', viewRef: viewTarget.viewRef, key: node.key };
                      const targetKey = resolveBindingTargetKey(bindingTarget, view, allViews);
                      const currentValue = toNumber(runtimeValues[targetKey]);
                      const baseValue = toNumber(initialValues[targetKey] ?? 0);
                      const stepValue = 1;
                      const minValue = computeAllocationViewBound({
                        formula: viewTarget.minFormula,
                        currentValue,
                        baseValue,
                        values: runtimeValues,
                        view,
                        allViews,
                        templateContext
                      });
                      const maxValue = computeAllocationViewBound({
                        formula: viewTarget.maxFormula,
                        currentValue,
                        baseValue,
                        values: runtimeValues,
                        view,
                        allViews,
                        templateContext
                      });
                      const increaseCost = computeAllocationStepCost({
                        formula: viewTarget.costFormula,
                        direction: 'up',
                        currentValue,
                        nextValue: currentValue + stepValue,
                        baseValue,
                        stepValue,
                        values: runtimeValues,
                        view,
                        allViews,
                        templateContext
                      });
                      const refundCost = computeAllocationStepCost({
                        formula: viewTarget.costFormula,
                        direction: 'down',
                        currentValue,
                        nextValue: currentValue - stepValue,
                        baseValue,
                        stepValue,
                        values: runtimeValues,
                        view,
                        allViews,
                        templateContext
                      });
                      const effectiveMin = minValue ?? 0;
                      const locked = (viewTarget.lockedFieldKeys ?? []).includes(node.key);
                      const canIncrease = enabled && !locked && (maxValue === null || currentValue + stepValue <= maxValue) && poolRemaining >= increaseCost;
                      const canDecrease = enabled && !locked && currentValue - stepValue >= effectiveMin;
                      const rawSpan = Math.max(1, Math.round(((node.layout.w || 1) / Math.max(1, targetView.gridColumns)) * previewColumns));
                      const gridColumnSpan = Math.max(1, Math.min(previewColumns, rawSpan));
                      return (
                        <div
                          key={node.id}
                          style={{
                            margin: 0,
                            padding: '0.85rem',
                            display: 'grid',
                            gap: '0.6rem',
                            gridColumn: `span ${gridColumnSpan}`,
                            alignContent: 'start',
                            background: 'rgba(15, 23, 42, 0.38)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '14px',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                            minHeight: 'unset'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <div style={{ display: 'grid', gap: '0.15rem' }}>
                              <strong>{node.label}</strong>
                              <small style={{ opacity: 0.72 }}>{node.key}</small>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.3rem', fontWeight: 700, lineHeight: 1 }}>{currentValue}</div>
                              <small style={{ opacity: 0.82 }}>
                                min {effectiveMin}
                                {maxValue !== null ? ` · max ${maxValue}` : ''}
                              </small>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <Button type="button" variant="secondary" onClick={() => handleAdjustAllocationViewField(block, viewTarget.id, node.key, 'down')} disabled={!canDecrease}>
                              -1
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => handleAdjustAllocationViewField(block, viewTarget.id, node.key, 'up')} disabled={!canIncrease}>
                              +1
                            </Button>
                          </div>
                          <small>
                            coût +1 : {increaseCost} · remboursement : {refundCost}
                            {locked ? ' · verrouillé' : ''}
                            {!enabled ? ' · vue inactive' : ''}
                          </small>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </article>
              );
            })}
            <small>{isValid ? 'Répartition prête' : 'Réserve source requise'}</small>
          </div>
        );
      }
      return (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div className="card" style={{ margin: 0, padding: '0.85rem' }}>
            <strong>{block.prompt || block.label}</strong>
            <div style={{ marginTop: '0.35rem' }}>
              Réserve utilisée : <code>{block.poolKey || 'non définie'}</code> · restant : <strong>{poolRemaining}</strong>
            </div>
          </div>
          {block.targets.map((target) => {
            const targetKey = resolveBindingTargetKey(target.target, view, allViews);
            const currentValue = toNumber(runtimeValues[targetKey]);
            const stepValue = Math.max(1, Math.abs(toNumber(target.step ?? 1)));
            const nextIncreaseValue = currentValue + stepValue;
            const nextDecreaseValue = currentValue - stepValue;
            const min = target.minFormula?.trim() ? evaluateMathExpression(target.minFormula, runtimeValues, view, allViews, templateContext) : null;
            const max = target.maxFormula?.trim() ? evaluateMathExpression(target.maxFormula, runtimeValues, view, allViews, templateContext) : null;
            const enabled = !target.condition?.trim() || evaluateCondition(target.condition, runtimeValues, view, allViews, templateContext);
            const baseValue = toNumber(initialValues[targetKey] ?? 0);
            const increaseCost = computeAllocationStepCost({
              formula: target.costFormula,
              direction: 'up',
              currentValue,
              nextValue: nextIncreaseValue,
              baseValue,
              stepValue,
              values: runtimeValues,
              view,
              allViews,
              templateContext
            });
            const refundCost = computeAllocationStepCost({
              formula: target.costFormula,
              direction: 'down',
              currentValue,
              nextValue: nextDecreaseValue,
              baseValue,
              stepValue,
              values: runtimeValues,
              view,
              allViews,
              templateContext
            });
            const canDecrease = min === null ? true : nextDecreaseValue >= min;
            const canIncrease = (max === null ? true : nextIncreaseValue <= max) && poolRemaining >= increaseCost;
            return (
              <article key={target.id} className="card" style={{ margin: 0, padding: '0.85rem', display: 'grid', gap: '0.55rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{target.label}</strong>
                  <small>
                    {currentValue}
                    {min !== null || max !== null ? ` · ${min !== null ? `min ${min}` : ''}${min !== null && max !== null ? ' · ' : ''}${max !== null ? `max ${max}` : ''}` : ''}
                  </small>
                </div>
                {target.helperText ? <small>{target.helperText}</small> : null}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button type="button" variant="secondary" onClick={() => handleAdjustAllocation(block, target.id, 'down')} disabled={!enabled || !canDecrease}>
                    -{stepValue}
                  </Button>
                  <div style={{ minWidth: '3rem', textAlign: 'center', fontWeight: 700 }}>{currentValue}</div>
                  <Button type="button" variant="secondary" onClick={() => handleAdjustAllocation(block, target.id, 'up')} disabled={!enabled || !canIncrease}>
                    +{stepValue}
                  </Button>
                  <small>
                    coût +{stepValue} : {increaseCost} · remboursement : {refundCost}
                  </small>
                </div>
              </article>
            );
          })}
          <small>{isValid ? 'Répartition prête' : 'Réserve source requise'}</small>
        </div>
      );
    }

    if (block.kind === 'roll') {
      const targetKey = resolveBindingTargetKey(block.target, view, allViews);
      const hasRolled = runtimeValues[answeredKey(block.id)] === true;
      return (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div className="card" style={{ margin: 0, padding: '0.85rem' }}>
            <strong>{block.prompt}</strong>
            <div style={{ marginTop: '0.35rem' }}>
              <code>{block.diceFormula || 'Aucune formule'}</code>
            </div>
          </div>
          <div className="card" style={{ margin: 0, padding: '0.85rem', display: 'grid', gap: '0.6rem' }}>
            <strong>Résultat</strong>
            <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{hasRolled ? String(runtimeValues[targetKey] ?? '—') : 'Aucun tirage'}</div>
            <div>
              <Button type="button" onClick={() => handleRoll(block)} disabled={hasRolled && block.allowReroll === false}>
                {hasRolled ? 'Relancer' : 'Lancer'}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderPendingBlocks = () => {
    if (stageRuntime.pendingBlocks.length === 0) {
      return <p style={{ margin: 0 }}>Aucune action interactive en attente dans cette étape.</p>;
    }
    return <div style={{ display: 'grid', gap: '0.85rem' }}>{stageRuntime.pendingBlocks.map((block) => <div key={block.id}>{renderInteractiveBlock(block)}</div>)}</div>;
  };

  if (!open || !config?.enabled) {
    return null;
  }

  const allInteractiveBlocksSatisfied = stageRuntime.pendingBlocks.every((block) =>
    isInteractiveBlockSatisfied(block, runtimeValues, view, allViews, templateContext)
  );
  const canMoveNext = !stageRuntime.stopReason && stageRuntime.completionSatisfied && allInteractiveBlocksSatisfied;
  const isLastStage = stageIndex >= stages.length - 1;

  return (
    <div className="resource-preview-modal" onClick={onClose}>
      <section className="resource-preview-modal__dialog resource-preview-modal__dialog--wide" onClick={(event) => event.stopPropagation()}>
        <header className="resource-preview-modal__header">
          <div>
            <strong>Création guidée du personnage · v2 scénario</strong>
            <small>
              {system.name} · étape {Math.min(stageIndex + 1, stages.length || 1)} / {stages.length || 1}
            </small>
          </div>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Fermer
          </Button>
        </header>
        <div className="resource-preview-modal__body" style={{ display: 'grid', gap: '1rem' }}>
          {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}
          {stageRuntime.stopReason ? <p className="home-alert home-alert--warning">{stageRuntime.stopReason}</p> : null}
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)', gap: '1rem' }}>
            <section className="card" style={{ margin: 0, padding: '1rem', display: 'grid', gap: '0.85rem' }}>
              <div>
                <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{currentStage?.label || 'Étape'}</h3>
                {currentStage?.description ? <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>{currentStage.description}</p> : null}
                {isAdminDebug && completionDebug ? (
                  <div className="card" style={{ marginTop: '0.75rem', padding: '0.75rem', display: 'grid', gap: '0.45rem' }}>
                    <strong>Debug admin · condition de passage</strong>
                    <small>
                      <code>{completionDebug.condition}</code>
                    </small>
                    <small>
                      Résultat : {completionDebug.satisfied ? 'TRUE' : 'FALSE'}
                    </small>
                    {completionDebug.clauses.map((entry) => (
                      <div key={entry.clause}>
                        <code>{entry.clause}</code> -&gt; {entry.valid ? 'Validé' : 'Non validé'}
                      </div>
                    ))}
                    {completionDebug.tokens.map((entry) => (
                      <div key={entry.token}>
                        <code>{entry.token}</code> = <code>{JSON.stringify(entry.value ?? null)}</code>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!allInteractiveBlocksSatisfied ? (
                  <div style={{ marginTop: '0.35rem' }}>
                    <small>Complète les champs requis de cette étape pour continuer.</small>
                  </div>
                ) : null}
              </div>

              {currentStage && currentStage.blocks.length === 0 ? (
                <div className="home-alert home-alert--warning" style={{ margin: 0 }}>
                  Cette étape ne contient aucun bloc enregistré. Le scénario ne peut rien afficher ici tant qu aucun bloc n est ajouté dans l éditeur.
                </div>
              ) : null}

              {stageRuntime.messages.map((message) => (
                <article key={message.id} className="card" style={{ margin: 0, padding: '0.85rem' }}>
                  <strong>{message.label}</strong>
                  <div style={{ marginTop: '0.35rem', whiteSpace: 'pre-wrap' }}>{message.content}</div>
                </article>
              ))}

              {renderPendingBlocks()}
            </section>

            <section className="card" style={{ margin: 0, padding: '1rem', display: 'grid', gap: '0.85rem' }}>
              <div>
                <strong>Réserves et variables</strong>
                <div>
                  <small>Suivi en direct de l état du scénario.</small>
                </div>
              </div>
              {poolStates.map((pool) => (
                <div key={pool.key} className="card" style={{ margin: 0, padding: '0.75rem' }}>
                  <strong>{pool.label}</strong>
                  <div style={{ marginTop: '0.35rem' }}>{pool.current} / {pool.initial}</div>
                </div>
              ))}
              {creationVariables.map((variable) => (
                <div key={variable.key} className="card" style={{ margin: 0, padding: '0.75rem' }}>
                  <strong>{variable.label}</strong>
                  <div style={{ marginTop: '0.35rem' }}>{String(variable.current ?? '—')}</div>
                </div>
              ))}
              <div className="card" style={{ margin: 0, padding: '0.75rem' }}>
                <strong>Nom final estimé</strong>
                <div style={{ marginTop: '0.35rem' }}>{resolveCharacterName()}</div>
              </div>
            </section>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => rewindToStage(stageIndex - 1)}
              disabled={isSubmitting || stageIndex <= 0}
            >
              Étape précédente
            </Button>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {!isLastStage ? (
                <Button
                  type="button"
                  onClick={() => {
                    suppressAutoAdvanceRef.current = false;
                    setStageIndex((current) => Math.min(stages.length - 1, current + 1));
                  }}
                  disabled={isSubmitting || !canMoveNext}
                >
                  Étape suivante
                </Button>
              ) : (
                <Button type="button" onClick={() => void handleComplete()} disabled={isSubmitting || !canMoveNext}>
                  {isSubmitting ? 'Création…' : 'Créer la fiche'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
