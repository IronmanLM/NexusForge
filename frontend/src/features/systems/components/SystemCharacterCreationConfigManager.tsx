import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/Button';
import {
  CharacterCreationAllocationTargetDefinition,
  CharacterCreationAllocationViewTargetDefinition,
  CharacterCreationBindingTarget,
  CharacterCreationCatalogWriteMappingDefinition,
  CharacterCreationConfig,
  CharacterCreationConfigV2,
  CharacterCreationPoolDefinition,
  CharacterCreationScenarioBlockDefinition,
  CharacterCreationScenarioBlockKind,
  CharacterCreationStageDefinition,
  CharacterCreationStepOptionDefinition,
  CharacterCreationVariableDefinition,
  LegacyCharacterCreationConfig,
  SystemCatalogDefinition,
  SystemStudioViewDefinitionV2
} from '../../../types/system';

type Props = {
  config?: CharacterCreationConfig;
  onChange: (config: CharacterCreationConfigV2 | ((current: CharacterCreationConfigV2) => CharacterCreationConfigV2)) => void;
  disabled?: boolean;
  views?: SystemStudioViewDefinitionV2[];
  catalogs?: SystemCatalogDefinition[];
};

type PickerMode =
  | { type: 'target'; stageId: string; blockId: string; search: string; mappingId?: string }
  | { type: 'allocation-target'; stageId: string; blockId: string; targetId: string; search: string }
  | { type: 'token'; onPick: (token: string) => void; search: string; title: string }
  | null;

type Candidate = {
  id: string;
  kind: 'sheet' | 'creation' | 'pool';
  label: string;
  key: string;
  viewRef?: string;
  token: string;
  group: string;
};

const BLOCK_OPTIONS: Array<{ kind: CharacterCreationScenarioBlockKind; label: string }> = [
  { kind: 'group', label: 'FAIRE' },
  { kind: 'message', label: 'Message / texte explicatif' },
  { kind: 'question_text', label: 'Question texte' },
  { kind: 'question_textarea', label: 'Question texte long' },
  { kind: 'question_number', label: 'Question numérique' },
  { kind: 'question_choice', label: 'Choix manuel' },
  { kind: 'question_catalog', label: 'Choix catalogue' },
  { kind: 'allocation', label: 'Attribution de points groupée dans des vues' },
  { kind: 'set_value', label: 'Affecter une valeur' },
  { kind: 'copy_value', label: 'Copier une valeur' },
  { kind: 'adjust_value', label: 'Modifier une variable' },
  { kind: 'roll', label: 'Tirage' },
  { kind: 'if', label: 'SI / ALORS / SINON' },
  { kind: 'loop', label: 'BOUCLE' },
  { kind: 'while', label: 'TANT QUE' },
  { kind: 'next_stage', label: 'Passer à l étape suivante' },
  { kind: 'stop', label: 'Arrêter le scénario' }
];

function getBlockOptionGroupLabel(kind: CharacterCreationScenarioBlockKind): string {
  switch (kind) {
    case 'group':
    case 'message':
      return 'Structure';
    case 'question_text':
    case 'question_textarea':
    case 'question_number':
    case 'question_choice':
    case 'question_catalog':
      return 'Questions';
    case 'allocation':
      return 'Attribution';
    case 'set_value':
    case 'copy_value':
    case 'adjust_value':
    case 'roll':
      return 'Actions';
    case 'if':
    case 'loop':
    case 'while':
      return 'Logique';
    case 'next_stage':
    case 'stop':
      return 'Contrôle';
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPool(): CharacterCreationPoolDefinition {
  return {
    id: makeId('cc-pool'),
    key: `pool_${Math.random().toString(36).slice(2, 6)}`,
    label: 'Nouvelle réserve',
    initialValueFormula: '0',
    description: ''
  };
}

function createVariable(): CharacterCreationVariableDefinition {
  return {
    id: makeId('cc-var'),
    key: `variable_${Math.random().toString(36).slice(2, 6)}`,
    label: 'Nouvelle variable',
    initialValueFormula: '0',
    description: ''
  };
}

function createTarget(scope: 'sheet' | 'creation' | 'pool' = 'creation'): CharacterCreationBindingTarget {
  return {
    scope,
    viewRef: scope === 'sheet' ? '' : undefined,
    key: ''
  };
}

function createAllocationTarget(): CharacterCreationAllocationTargetDefinition {
  return {
    id: makeId('cc-allocation-target'),
    label: 'Nouvelle cible',
    target: createTarget('sheet'),
    step: 1,
    minFormula: '',
    maxFormula: '',
    costFormula: '1',
    condition: '',
    helperText: ''
  };
}

function createAllocationViewTarget(): CharacterCreationAllocationViewTargetDefinition {
  return {
    id: makeId('cc-allocation-view'),
    viewRef: '',
    label: 'Nouvelle vue cible',
    costFormula: '1',
    minFormula: '',
    maxFormula: '',
    condition: '',
    hiddenFieldKeys: [],
    lockedFieldKeys: [],
    helperText: ''
  };
}

function createCatalogWriteMapping(): CharacterCreationCatalogWriteMappingDefinition {
  return {
    id: makeId('cc-catalog-map'),
    target: createTarget('sheet'),
    valueColumnKey: ''
  };
}

function createBlock(kind: CharacterCreationScenarioBlockKind): CharacterCreationScenarioBlockDefinition {
  const base = {
    id: makeId('cc-block'),
    kind,
    label: BLOCK_OPTIONS.find((entry) => entry.kind === kind)?.label ?? 'Bloc',
    description: '',
    enabled: true
  } as const;

  switch (kind) {
    case 'group':
      return {
        ...base,
        kind,
        blocks: []
      };
    case 'message':
      return {
        ...base,
        kind,
        content: '',
        tone: 'info'
      };
    case 'question_text':
    case 'question_textarea':
    case 'question_number':
      return {
        ...base,
        kind,
        prompt: '',
        placeholder: '',
        target: createTarget('sheet'),
        defaultValueFormula: '',
        minFormula: '',
        maxFormula: '',
        required: false
      };
    case 'question_choice':
      return {
        ...base,
        kind,
        prompt: '',
        target: createTarget('sheet'),
        options: [
          { id: makeId('cc-option'), value: 'option_1', label: 'Option 1' }
        ],
        allowFreeText: false
      };
    case 'question_catalog':
      return {
        ...base,
        kind,
        prompt: '',
        target: createTarget('sheet'),
        catalogKey: '',
        valueColumnKey: '',
        labelColumnKey: '',
        costColumnKey: '',
        costTarget: createTarget('pool'),
        mappings: [createCatalogWriteMapping()],
        allowFreeText: false
      };
    case 'allocation':
      return {
        ...base,
        kind,
        prompt: '',
        poolKey: '',
        targets: [],
        viewTargets: [createAllocationViewTarget()]
      };
    case 'set_value':
      return {
        ...base,
        kind,
        target: createTarget('creation'),
        valueFormula: '0'
      };
    case 'copy_value':
      return {
        ...base,
        kind,
        target: createTarget('creation'),
        sourceFormula: ''
      };
    case 'adjust_value':
      return {
        ...base,
        kind,
        target: createTarget('creation'),
        operator: 'add',
        valueFormula: '1'
      };
    case 'roll':
      return {
        ...base,
        kind,
        prompt: '',
        target: createTarget('creation'),
        diceFormula: '1d6',
        allowReroll: true
      };
    case 'if':
      return {
        ...base,
        kind,
        condition: '',
        thenBlocks: [],
        elseIfBranches: [],
        elseBlocks: []
      };
    case 'loop':
      return {
        ...base,
        kind,
        iterationsFormula: '1',
        blocks: []
      };
    case 'while':
      return {
        ...base,
        kind,
        condition: '',
        maxIterationsFormula: '20',
        blocks: []
      };
    case 'next_stage':
      return {
        ...base,
        kind,
        reason: ''
      };
    case 'stop':
      return {
        ...base,
        kind,
        reason: ''
      };
  }
}

function createStage(): CharacterCreationStageDefinition {
  return {
    id: makeId('cc-stage'),
    key: `etape_${Math.random().toString(36).slice(2, 6)}`,
    label: 'Nouvelle étape',
    description: '',
    enabled: true,
    entryCondition: '',
    completionCondition: '',
    blocks: []
  };
}

function cloneBlock(block: CharacterCreationScenarioBlockDefinition): CharacterCreationScenarioBlockDefinition {
  return JSON.parse(JSON.stringify(block)) as CharacterCreationScenarioBlockDefinition;
}

function migrateLegacyConfig(config?: CharacterCreationConfig): CharacterCreationConfigV2 {
  if (!config) {
    return { version: 2, enabled: false, pools: [], variables: [], stages: [] };
  }
  if (config.version === 2) {
    return JSON.parse(JSON.stringify(config)) as CharacterCreationConfigV2;
  }
  const legacy = config as LegacyCharacterCreationConfig;
  return {
    version: 2,
    enabled: legacy.enabled === true,
    pools: legacy.pools.map((pool) => ({ ...pool })),
    variables: legacy.variables.map((variable) => ({ ...variable })),
    stages: legacy.steps.map((step) => {
      let blocks: CharacterCreationScenarioBlockDefinition[] = [];
      switch (step.kind) {
        case 'text':
          blocks = [Object.assign(createBlock('question_text'), {
            label: step.label,
            description: step.description,
            prompt: step.prompt,
            target: {
              scope: step.targetScope === 'creation' ? 'creation' : 'sheet',
              viewRef: step.targetScope === 'creation' ? undefined : step.targetViewRef,
              key: step.targetFieldKey ?? ''
            }
          } as Partial<Extract<CharacterCreationScenarioBlockDefinition, { kind: 'question_text' }>>)];
          break;
        case 'textarea':
          blocks = [Object.assign(createBlock('question_textarea'), {
            label: step.label,
            description: step.description,
            prompt: step.prompt,
            target: {
              scope: step.targetScope === 'creation' ? 'creation' : 'sheet',
              viewRef: step.targetScope === 'creation' ? undefined : step.targetViewRef,
              key: step.targetFieldKey ?? ''
            }
          } as Partial<Extract<CharacterCreationScenarioBlockDefinition, { kind: 'question_textarea' }>>)];
          break;
        case 'number':
          blocks = [Object.assign(createBlock('question_number'), {
            label: step.label,
            description: step.description,
            prompt: step.prompt,
            target: {
              scope: step.targetScope === 'creation' ? 'creation' : 'sheet',
              viewRef: step.targetScope === 'creation' ? undefined : step.targetViewRef,
              key: step.targetFieldKey ?? ''
            }
          } as Partial<Extract<CharacterCreationScenarioBlockDefinition, { kind: 'question_number' }>>)];
          break;
        case 'catalog_select':
        case 'catalog_or_text':
          blocks = [
            {
              ...(createBlock('question_catalog') as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'question_catalog' }>),
              label: step.label,
              description: step.description,
              prompt: step.prompt,
              target: {
                scope: step.targetScope === 'creation' ? 'creation' : 'sheet',
                viewRef: step.targetScope === 'creation' ? undefined : step.targetViewRef,
                key: step.targetFieldKey ?? ''
              },
              catalogKey: step.catalogKey ?? '',
              valueColumnKey: '',
              labelColumnKey: '',
              costColumnKey: '',
              costTarget: createTarget('pool'),
              mappings: [
                {
                  id: makeId('cc-catalog-map'),
                  target: {
                    scope: step.targetScope === 'creation' ? 'creation' : 'sheet',
                    viewRef: step.targetScope === 'creation' ? undefined : step.targetViewRef,
                    key: step.targetFieldKey ?? ''
                  },
                  valueColumnKey: ''
                }
              ],
              allowFreeText: step.kind === 'catalog_or_text'
            }
          ];
          break;
        case 'set_formula':
          blocks = [
            {
              ...(createBlock('set_value') as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'set_value' }>),
              label: step.label,
              description: step.description,
              target: {
                scope: step.targetScope === 'creation' ? 'creation' : 'sheet',
                viewRef: step.targetScope === 'creation' ? undefined : step.targetViewRef,
                key: step.targetFieldKey ?? ''
              },
              valueFormula: step.valueFormula ?? '0'
            }
          ];
          break;
        case 'roll':
          blocks = [
            {
              ...(createBlock('roll') as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'roll' }>),
              label: step.label,
              description: step.description,
              prompt: step.prompt,
              target: {
                scope: step.targetScope === 'creation' ? 'creation' : 'sheet',
                viewRef: step.targetScope === 'creation' ? undefined : step.targetViewRef,
                key: step.targetFieldKey ?? ''
              },
              diceFormula: step.valueFormula ?? '1d6',
              allowReroll: step.allowReroll !== false
            }
          ];
          break;
        case 'condition':
          blocks = [
            {
              ...(createBlock('if') as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'if' }>),
              label: step.label,
              description: step.description,
              condition: step.condition ?? '',
              thenBlocks: [],
              elseBlocks: []
            }
          ];
          break;
        default:
          blocks = [];
      }
      return {
        id: step.id,
        key: step.key,
        label: step.label,
        description: step.description,
        enabled: step.enabled,
        entryCondition: '',
        completionCondition: step.nextCondition ?? '',
        blocks
      };
    })
  };
}

function updateNestedBlocks(
  blocks: CharacterCreationScenarioBlockDefinition[],
  blockId: string,
  updater: (block: CharacterCreationScenarioBlockDefinition) => CharacterCreationScenarioBlockDefinition
): CharacterCreationScenarioBlockDefinition[] {
  return blocks.map((block) => {
    if (block.id === blockId) {
      return updater(cloneBlock(block));
    }
    if (block.kind === 'if') {
      return {
        ...block,
        thenBlocks: updateNestedBlocks(block.thenBlocks, blockId, updater),
        elseIfBranches: (block.elseIfBranches ?? []).map((branch) => ({
          ...branch,
          blocks: updateNestedBlocks(branch.blocks, blockId, updater)
        })),
        elseBlocks: updateNestedBlocks(block.elseBlocks, blockId, updater)
      };
    }
    if (block.kind === 'group' || block.kind === 'loop' || block.kind === 'while') {
      return {
        ...block,
        blocks: updateNestedBlocks(block.blocks, blockId, updater)
      };
    }
    return block;
  });
}

function pushNestedBlock(
  blocks: CharacterCreationScenarioBlockDefinition[],
  parentId: string,
  branch: 'then' | 'else' | `elseif:${string}`,
  nextBlock: CharacterCreationScenarioBlockDefinition
): CharacterCreationScenarioBlockDefinition[] {
  return blocks.map((block) => {
    if (block.id === parentId && block.kind === 'if') {
      return {
        ...block,
        thenBlocks: branch === 'then' ? [...block.thenBlocks, nextBlock] : block.thenBlocks,
        elseIfBranches: (block.elseIfBranches ?? []).map((entry) =>
          branch === `elseif:${entry.id}` ? { ...entry, blocks: [...entry.blocks, nextBlock] } : entry
        ),
        elseBlocks: branch === 'else' ? [...block.elseBlocks, nextBlock] : block.elseBlocks
      };
    }
    if (block.id === parentId && (block.kind === 'group' || block.kind === 'loop' || block.kind === 'while')) {
      return {
        ...block,
        blocks: [...block.blocks, nextBlock]
      };
    }
    if (block.kind === 'if') {
      return {
        ...block,
        thenBlocks: pushNestedBlock(block.thenBlocks, parentId, branch, nextBlock),
        elseIfBranches: (block.elseIfBranches ?? []).map((entry) => ({
          ...entry,
          blocks: pushNestedBlock(entry.blocks, parentId, branch, nextBlock)
        })),
        elseBlocks: pushNestedBlock(block.elseBlocks, parentId, branch, nextBlock)
      };
    }
    if (block.kind === 'group' || block.kind === 'loop' || block.kind === 'while') {
      return {
        ...block,
        blocks: pushNestedBlock(block.blocks, parentId, branch, nextBlock)
      };
    }
    return block;
  });
}

function removeNestedBlock(blocks: CharacterCreationScenarioBlockDefinition[], blockId: string): CharacterCreationScenarioBlockDefinition[] {
  return blocks
    .filter((block) => block.id !== blockId)
    .map((block) =>
      block.kind === 'if'
        ? {
            ...block,
            thenBlocks: removeNestedBlock(block.thenBlocks, blockId),
            elseIfBranches: (block.elseIfBranches ?? []).map((entry) => ({
              ...entry,
              blocks: removeNestedBlock(entry.blocks, blockId)
            })),
            elseBlocks: removeNestedBlock(block.elseBlocks, blockId)
          }
        : block.kind === 'group' || block.kind === 'loop' || block.kind === 'while'
        ? {
            ...block,
            blocks: removeNestedBlock(block.blocks, blockId)
          }
        : block
    );
}

function renderTargetSummary(target: CharacterCreationBindingTarget): string {
  if (!target.key) {
    return 'Aucune cible';
  }
  if (target.scope === 'sheet') {
    return `${target.viewRef || 'vue?'}.${target.key}`;
  }
  return `${target.scope}:${target.key}`;
}

const CONDITION_OPERATORS = ['==', '!=', '>', '>=', '<', '<=', '&&', '||', '(', ')'];

export default function SystemCharacterCreationConfigManager({ config, onChange, disabled = false, views = [], catalogs = [] }: Props) {
  const normalized = useMemo(() => migrateLegacyConfig(config), [config]);
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [pickerState, setPickerState] = useState<PickerMode>(null);
  const [allocationPickerSelection, setAllocationPickerSelection] = useState<string[]>([]);
  const [blockKindToInsert, setBlockKindToInsert] = useState<CharacterCreationScenarioBlockKind | ''>('');
  const [editorNotice, setEditorNotice] = useState<string>('');

  useEffect(() => {
    setAllocationPickerSelection([]);
  }, [pickerState?.type]);

  useEffect(() => {
    if (normalized.stages.length === 0) {
      if (selectedStageId) {
        setSelectedStageId('');
      }
      return;
    }
    if (!selectedStageId || !normalized.stages.some((stage) => stage.id === selectedStageId)) {
      setSelectedStageId(normalized.stages[0]?.id ?? '');
    }
  }, [normalized.stages, selectedStageId]);

  const selectedStage = normalized.stages.find((stage) => stage.id === selectedStageId) ?? normalized.stages[0] ?? null;
  const blockOptionGroups = useMemo(() => {
    const grouped = new Map<string, Array<{ kind: CharacterCreationScenarioBlockKind; label: string }>>();
    BLOCK_OPTIONS.forEach((option) => {
      const groupLabel = getBlockOptionGroupLabel(option.kind);
      const list = grouped.get(groupLabel) ?? [];
      list.push(option);
      grouped.set(groupLabel, list);
    });
    return Array.from(grouped.entries());
  }, []);

  const candidates = useMemo<Candidate[]>(() => {
    const base: Candidate[] = [];
    normalized.pools.forEach((pool) => {
      base.push({ id: pool.id, kind: 'pool', label: pool.label, key: pool.key, token: `@${pool.key}`, group: 'Réserves' });
    });
    normalized.variables.forEach((variable) => {
      base.push({ id: variable.id, kind: 'creation', label: variable.label, key: variable.key, token: `@${variable.key}`, group: 'Variables temporaires' });
    });
    views.forEach((view) => {
      view.nodes
        .filter((node) => ['text', 'textarea', 'date', 'time', 'number', 'checkbox', 'select', 'multiselect', 'progress'].includes(node.type))
        .forEach((node) => {
          base.push({ id: `${view.id}:${node.id}`, kind: 'sheet', label: node.label, key: node.key, viewRef: view.reference, token: `{{${view.reference}.${node.key}}}`, group: view.name });
        });
    });
    return base;
  }, [normalized.pools, normalized.variables, views]);

  const filteredCandidates = useMemo(() => {
    const search = pickerState?.search?.trim().toLowerCase() ?? '';
    const available = pickerState?.type === 'target' || pickerState?.type === 'allocation-target' ? candidates.filter((entry) => entry.kind !== 'pool' || true) : candidates;
    if (!search) {
      return available;
    }
    return available.filter((entry) => [entry.group, entry.label, entry.key, entry.viewRef ?? ''].some((value) => value.toLowerCase().includes(search)));
  }, [candidates, pickerState]);

  const filteredCandidatesByGroup = useMemo(() => {
    const grouped = new Map<string, Candidate[]>();
    filteredCandidates.forEach((candidate) => {
      const list = grouped.get(candidate.group) ?? [];
      list.push(candidate);
      grouped.set(candidate.group, list);
    });
    return Array.from(grouped.entries());
  }, [filteredCandidates]);

  const commit = (updater: (current: CharacterCreationConfigV2) => CharacterCreationConfigV2) => {
    onChange((current) => updater(current));
  };

  const updateStage = (stageId: string, updater: (stage: CharacterCreationStageDefinition) => CharacterCreationStageDefinition) => {
    commit((current) => ({
      ...current,
      stages: current.stages.map((stage) => (stage.id === stageId ? updater({ ...stage }) : stage))
    }));
  };

  const updateBlock = (stageId: string, blockId: string, updater: (block: CharacterCreationScenarioBlockDefinition) => CharacterCreationScenarioBlockDefinition) => {
    updateStage(stageId, (stage) => ({
      ...stage,
      blocks: updateNestedBlocks(stage.blocks, blockId, updater)
    }));
  };

  const handlePickCandidate = (candidate: Candidate) => {
    if (!pickerState) {
      return;
    }
    if (pickerState.type === 'token') {
      pickerState.onPick(candidate.token);
      setPickerState(null);
      return;
    }
    if (pickerState.type === 'allocation-target') {
      updateBlock(pickerState.stageId, pickerState.blockId, (block) => {
        if (block.kind !== 'allocation') {
          return block;
        }
        return {
          ...block,
          targets: block.targets.map((target) =>
            target.id === pickerState.targetId
              ? {
                  ...target,
                  target: {
                    scope: candidate.kind === 'sheet' ? 'sheet' : candidate.kind,
                    viewRef: candidate.kind === 'sheet' ? candidate.viewRef : undefined,
                    key: candidate.key
                  }
                }
              : target
          )
        };
      });
      setPickerState(null);
      return;
    }
    updateBlock(pickerState.stageId, pickerState.blockId, (block) => {
      if (block.kind === 'question_catalog' && pickerState.mappingId) {
        const currentMappings = (block.mappings ?? []).length ? (block.mappings ?? []) : [{ id: makeId('cc-catalog-map-fallback'), target: block.target, valueColumnKey: block.valueColumnKey ?? '' }];
        const nextTarget = {
          scope: candidate.kind === 'sheet' ? 'sheet' : candidate.kind,
          viewRef: candidate.kind === 'sheet' ? candidate.viewRef : undefined,
          key: candidate.key
        } as CharacterCreationBindingTarget;
        return {
          ...block,
          mappings: currentMappings.map((entry) =>
            entry.id === pickerState.mappingId
              ? {
                  ...entry,
                  target: nextTarget
                }
              : entry
          ),
          ...(currentMappings[0]?.id === pickerState.mappingId ? { target: nextTarget } : {})
        } as CharacterCreationScenarioBlockDefinition;
      }
      if (!('target' in block)) {
        return block;
      }
      return {
        ...block,
        target: {
          scope: candidate.kind === 'sheet' ? 'sheet' : candidate.kind,
          viewRef: candidate.kind === 'sheet' ? candidate.viewRef : undefined,
          key: candidate.key
        }
      } as CharacterCreationScenarioBlockDefinition;
    });
    setPickerState(null);
  };

  const insertBlockIntoStage = (stageId: string, kind: CharacterCreationScenarioBlockKind) => {
    updateStage(stageId, (stage) => ({ ...stage, blocks: [...stage.blocks, createBlock(kind)] }));
    const stage = normalized.stages.find((entry) => entry.id === stageId);
    const blockLabel = BLOCK_OPTIONS.find((entry) => entry.kind === kind)?.label ?? 'Bloc';
    setEditorNotice(`${blockLabel} ajouté à ${stage?.label ?? 'l étape'}.`);
  };

  const insertBlockIntoBranch = (stageId: string, parentId: string, branch: 'then' | 'else' | `elseif:${string}`, kind: CharacterCreationScenarioBlockKind) => {
    updateStage(stageId, (stage) => ({
      ...stage,
      blocks: pushNestedBlock(stage.blocks, parentId, branch, createBlock(kind))
    }));
    const blockLabel = BLOCK_OPTIONS.find((entry) => entry.kind === kind)?.label ?? 'Bloc';
    setEditorNotice(`${blockLabel} ajouté dans une branche du scénario.`);
  };

  const insertBlockIntoContainer = (stageId: string, parentId: string, kind: CharacterCreationScenarioBlockKind) => {
    updateStage(stageId, (stage) => ({
      ...stage,
      blocks: pushNestedBlock(stage.blocks, parentId, 'then', createBlock(kind))
    }));
    const blockLabel = BLOCK_OPTIONS.find((entry) => entry.kind === kind)?.label ?? 'Bloc';
    setEditorNotice(`${blockLabel} ajouté dans un conteneur.`);
  };

  const appendAllocationTargets = (stageId: string, blockId: string, pickedCandidates: Candidate[]) => {
    if (pickedCandidates.length === 0) {
      return;
    }
    updateBlock(stageId, blockId, (current) => {
      if (current.kind !== 'allocation') {
        return current;
      }
      const existing = new Set(current.targets.map((entry) => `${entry.target.viewRef || ''}:${entry.target.key}`));
      const additions = pickedCandidates
        .filter((candidate) => candidate.kind === 'sheet')
        .filter((candidate) => !existing.has(`${candidate.viewRef || ''}:${candidate.key}`))
        .map((candidate) => ({
          ...createAllocationTarget(),
          label: candidate.label,
          target: {
            scope: 'sheet' as const,
            viewRef: candidate.viewRef,
            key: candidate.key
          }
        }));
      return {
        ...current,
        targets: [...current.targets, ...additions]
      };
    });
  };

  const addElseIfBranch = (stageId: string, blockId: string) => {
    updateBlock(stageId, blockId, (current) => {
      if (current.kind !== 'if') {
        return current;
      }
      return {
        ...current,
        elseIfBranches: [
          ...(current.elseIfBranches ?? []),
          {
            id: makeId('cc-elseif'),
            label: 'SINON SI',
            condition: '',
            blocks: []
          }
        ]
      };
    });
  };

  const renderInlineTokenButton = (label: string, onPick: (token: string) => void) => (
    <Button type="button" variant="secondary" onClick={() => setPickerState({ type: 'token', title: label, onPick, search: '' })} disabled={disabled}>
      Sélectionner variable
    </Button>
  );

  const renderOperatorInsertSelect = (params: {
    onPick: (value: string) => void;
    placeholder?: string;
  }) => (
    <select
      defaultValue=""
      disabled={disabled}
      onChange={(event) => {
        const value = event.target.value;
        if (!value) {
          return;
        }
        params.onPick(value);
        event.target.value = '';
      }}
    >
      <option value="">{params.placeholder ?? 'Insérer un opérateur'}</option>
      {CONDITION_OPERATORS.map((operator) => (
        <option key={operator} value={operator}>
          {operator}
        </option>
      ))}
    </select>
  );

  const renderInlineInsertTools = (params: {
    tokenLabel: string;
    onTokenPick: (token: string) => void;
    onOperatorPick?: (operator: string) => void;
    operatorPlaceholder?: string;
  }) => (
    <details style={{ margin: 0 }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.95rem' }}>Outils d insertion</summary>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', alignItems: 'center' }}>
        {renderInlineTokenButton(params.tokenLabel, params.onTokenPick)}
        {params.onOperatorPick ? renderOperatorInsertSelect({ onPick: params.onOperatorPick, placeholder: params.operatorPlaceholder }) : null}
      </div>
    </details>
  );

  const renderConditionComposer = (params: {
    label: string;
    value: string;
    onChange: (nextValue: string) => void;
  }) => (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>{params.label}</span>
        <input value={params.value} onChange={(event) => params.onChange(event.target.value)} disabled={disabled} />
      </label>
      {renderInlineInsertTools({
        tokenLabel: 'Insérer une variable',
        onTokenPick: (token) => params.onChange(`${params.value}${token}`),
        onOperatorPick: (operator) => params.onChange(`${params.value}${params.value ? ' ' : ''}${operator} `),
        operatorPlaceholder: 'Insérer un opérateur'
      })}
    </div>
  );

  const renderBlock = (stageId: string, block: CharacterCreationScenarioBlockDefinition, depth = 0) => {
    const shellStyle = {
      margin: 0,
      padding: '0.85rem',
      display: 'grid',
      gap: '0.75rem',
      borderLeft: depth > 0 ? '3px solid rgba(93, 156, 236, 0.45)' : undefined,
      marginLeft: depth > 0 ? '0.75rem' : undefined
    } as const;

    return (
      <article key={block.id} className="card" style={shellStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <strong>{block.label}</strong>
            <small>{BLOCK_OPTIONS.find((entry) => entry.kind === block.kind)?.label}</small>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <input
                type="checkbox"
                checked={block.enabled}
                onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...current, enabled: event.target.checked }))}
                disabled={disabled}
              />
              Activé
            </label>
            <Button type="button" variant="secondary" onClick={() => updateStage(stageId, (stage) => ({ ...stage, blocks: removeNestedBlock(stage.blocks, block.id) }))} disabled={disabled}>
              Supprimer
            </Button>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Libellé</span>
            <input value={block.label} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...current, label: event.target.value }))} disabled={disabled} />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Description</span>
            <input value={block.description ?? ''} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...current, description: event.target.value }))} disabled={disabled} />
          </label>
        </div>

        {block.kind === 'question_text' || block.kind === 'question_textarea' || block.kind === 'question_number' ? (
          (() => {
            const questionBlock = block as Extract<
              CharacterCreationScenarioBlockDefinition,
              { kind: 'question_text' | 'question_textarea' | 'question_number' }
            >;
            return (
          <>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Question</span>
              <textarea value={questionBlock.prompt} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...questionBlock, prompt: event.target.value }))} disabled={disabled} rows={2} />
            </label>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Cible</span>
                <input value={renderTargetSummary(questionBlock.target)} readOnly />
              </label>
              <div style={{ display: 'grid', alignContent: 'end' }}>
                <Button type="button" variant="secondary" onClick={() => setPickerState({ type: 'target', stageId, blockId: block.id, search: '' })} disabled={disabled}>Sélectionner variable</Button>
              </div>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Valeur par défaut</span>
                <input value={questionBlock.defaultValueFormula ?? ''} onChange={(event) => updateBlock(stageId, block.id, () => ({ ...questionBlock, defaultValueFormula: event.target.value }))} disabled={disabled} />
              </label>
              <div style={{ display: 'grid', alignContent: 'end' }}>
                {renderInlineInsertTools({
                  tokenLabel: 'Insérer une variable',
                  onTokenPick: (token) => updateBlock(stageId, block.id, () => ({ ...questionBlock, defaultValueFormula: `${questionBlock.defaultValueFormula || ''}${token}` }))
                })}
              </div>
            </div>
          </>
            );
          })()
        ) : null}

        {block.kind === 'question_choice' ? (
          <>
            {(() => {
              const choiceBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'question_choice' }>;
              return (
                <>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Question</span>
              <textarea value={choiceBlock.prompt} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof choiceBlock), prompt: event.target.value }))} disabled={disabled} rows={2} />
            </label>
            <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Cible</span>
                <input value={renderTargetSummary(choiceBlock.target)} readOnly />
              </label>
              <Button type="button" variant="secondary" onClick={() => setPickerState({ type: 'target', stageId, blockId: block.id, search: '' })} disabled={disabled}>Sélectionner variable</Button>
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <strong>Options</strong>
              {choiceBlock.options.map((option, index) => (
                <div key={option.id} className="grid" style={{ gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem' }}>
                  <input value={option.value} placeholder={`Valeur ${index + 1}`} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof choiceBlock), options: choiceBlock.options.map((entry) => entry.id === option.id ? { ...entry, value: event.target.value } : entry) }))} disabled={disabled} />
                  <input value={option.label} placeholder={`Libellé ${index + 1}`} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof choiceBlock), options: choiceBlock.options.map((entry) => entry.id === option.id ? { ...entry, label: event.target.value } : entry) }))} disabled={disabled} />
                  <Button type="button" variant="secondary" onClick={() => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof choiceBlock), options: choiceBlock.options.filter((entry) => entry.id !== option.id) }))} disabled={disabled}>-</Button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Button type="button" variant="secondary" onClick={() => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof choiceBlock), options: [...choiceBlock.options, { id: makeId('cc-option'), value: `option_${choiceBlock.options.length + 1}`, label: `Option ${choiceBlock.options.length + 1}` }] }))} disabled={disabled}>Ajouter une option</Button>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="checkbox" checked={choiceBlock.allowFreeText === true} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof choiceBlock), allowFreeText: event.target.checked }))} disabled={disabled} />
                  Autoriser texte libre
                </label>
              </div>
            </div>
                </>
              );
            })()}
          </>
        ) : null}

        {block.kind === 'question_catalog' ? (
          (() => {
            const selectedCatalog = catalogs.find((catalog) => catalog.key === block.catalogKey);
            const catalogColumns = selectedCatalog?.columns ?? [];
            const mappings = block.mappings && block.mappings.length ? block.mappings : [{ id: makeId('cc-catalog-map-fallback'), target: block.target, valueColumnKey: block.valueColumnKey ?? '' }];
            return (
          <>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Question</span>
              <textarea value={block.prompt} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...current, prompt: event.target.value }))} disabled={disabled} rows={2} />
            </label>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Catalogue</span>
                <select
                  value={block.catalogKey}
                  onChange={(event) =>
                    updateBlock(stageId, block.id, (current) => ({
                      ...(current as typeof block),
                      catalogKey: event.target.value,
                      labelColumnKey: '',
                      costColumnKey: '',
                      costTarget: (current as typeof block).costTarget ?? createTarget('pool'),
                      mappings: ((current as typeof block).mappings ?? []).map((entry, index) => ({
                        ...entry,
                        valueColumnKey: index === 0 ? '' : entry.valueColumnKey ?? ''
                      }))
                    }))
                  }
                  disabled={disabled}
                >
                  <option value="">Sélectionner</option>
                  {catalogs.map((catalog) => (
                    <option key={catalog.id} value={catalog.key}>{catalog.label || catalog.key}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Colonne affichée</span>
                <select value={block.labelColumnKey ?? ''} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...current, labelColumnKey: event.target.value }))} disabled={disabled || !selectedCatalog}>
                  <option value="">Auto</option>
                  {catalogColumns.map((column) => (
                    <option key={column.id} value={column.key}>{column.label} · {column.key}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Colonne écrite dans la variable</span>
                <select value={block.valueColumnKey ?? ''} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...current, valueColumnKey: event.target.value }))} disabled={disabled || !selectedCatalog}>
                  <option value="">Sélectionner</option>
                  {catalogColumns.map((column) => (
                    <option key={column.id} value={column.key}>{column.label} · {column.key}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Colonne coût</span>
                <select value={block.costColumnKey ?? ''} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...current, costColumnKey: event.target.value }))} disabled={disabled || !selectedCatalog}>
                  <option value="">Aucun coût</option>
                  {catalogColumns.map((column) => (
                    <option key={column.id} value={column.key}>{column.label} · {column.key}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Variable / réserve débitée</span>
                <select
                  value={`${block.costTarget?.scope ?? 'pool'}:${block.costTarget?.key ?? ''}`}
                  onChange={(event) => {
                    const [scope, key] = event.target.value.split(':', 2);
                    updateBlock(stageId, block.id, (current) => ({
                      ...current,
                      costTarget: {
                        scope: scope === 'creation' ? 'creation' : 'pool',
                        key
                      }
                    }));
                  }}
                  disabled={disabled || !block.costColumnKey}
                >
                  <option value="pool:">Sélectionner</option>
                  {normalized.pools.map((pool) => (
                    <option key={pool.id} value={`pool:${pool.key}`}>{pool.label} · {pool.key}</option>
                  ))}
                  {normalized.variables.map((variable) => (
                    <option key={variable.id} value={`creation:${variable.key}`}>{variable.label} · {variable.key}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'end' }}>
                <input type="checkbox" checked={block.allowFreeText === true} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...current, allowFreeText: event.target.checked }))} disabled={disabled} />
                Autoriser texte libre
              </label>
            </div>
            <section className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>Écritures dans les variables</strong>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    updateBlock(stageId, block.id, (current) => ({
                      ...current,
                      mappings: [...(((current as typeof block).mappings ?? mappings).filter(Boolean)), createCatalogWriteMapping()]
                    }))
                  }
                  disabled={disabled}
                >
                  Ajouter une variable
                </Button>
              </div>
              {mappings.map((mapping, index) => (
                <div key={mapping.id} className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 280px) auto auto', gap: '0.75rem', alignItems: 'end' }}>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>Variable cible {index + 1}</span>
                    <input value={renderTargetSummary(mapping.target)} readOnly />
                  </label>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>Colonne écrite</span>
                    <select
                      value={mapping.valueColumnKey ?? ''}
                      onChange={(event) =>
                        updateBlock(stageId, block.id, (current) => ({
                          ...current,
                          mappings: (((current as typeof block).mappings ?? mappings)).map((entry) =>
                            entry.id === mapping.id ? { ...entry, valueColumnKey: event.target.value } : entry
                          ),
                          ...(index === 0 ? { valueColumnKey: event.target.value } : {})
                        }))
                      }
                      disabled={disabled || !selectedCatalog}
                    >
                      <option value="">Sélectionner</option>
                      {catalogColumns.map((column) => (
                        <option key={column.id} value={column.key}>{column.label} · {column.key}</option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setPickerState({
                          type: 'target',
                          stageId,
                          blockId: block.id,
                          search: '',
                          mappingId: mapping.id
                        })
                      }
                      disabled={disabled}
                    >
                      Sélectionner variable
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        updateBlock(stageId, block.id, (current) => {
                          const currentMappings = ((current as typeof block).mappings ?? mappings);
                          const nextMappings = currentMappings.filter((entry) => entry.id !== mapping.id);
                          return {
                            ...current,
                            mappings: nextMappings.length ? nextMappings : [createCatalogWriteMapping()]
                          };
                        })
                      }
                      disabled={disabled}
                    >
                      Supprimer
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          </>
            );
          })()
        ) : null}

        {block.kind === 'allocation' ? (
          (() => {
            const allocationBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'allocation' }>;
            return (
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Question / consigne</span>
                  <textarea
                    value={allocationBlock.prompt}
                    onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof allocationBlock), prompt: event.target.value }))}
                    disabled={disabled}
                    rows={2}
                  />
                </label>
                <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'end' }}>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>Variable / réserve débitée</span>
                    <select
                      value={allocationBlock.poolKey}
                      onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof allocationBlock), poolKey: event.target.value }))}
                      disabled={disabled}
                    >
                      <option value="">Sélectionner</option>
                      {normalized.pools.map((pool) => (
                        <option key={pool.id} value={pool.key}>
                          {pool.label} · {pool.key}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                    <strong>Cibles de vue</strong>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        updateBlock(stageId, block.id, (current) =>
                          current.kind !== 'allocation'
                            ? current
                            : {
                                ...current,
                                viewTargets: [...(current.viewTargets ?? []), createAllocationViewTarget()]
                              }
                        )
                      }
                      disabled={disabled}
                    >
                      Ajouter une vue
                    </Button>
                  </div>
                  {(allocationBlock.viewTargets ?? []).every((entry) => !entry.viewRef.trim()) ? (
                    <div className="home-alert home-alert--warning" style={{ margin: 0 }}>
                      Ce bloc peut être enregistré même incomplet. Il restera toutefois inactif tant qu au moins une vue cible n aura pas été sélectionnée.
                    </div>
                  ) : null}
                  {(allocationBlock.viewTargets ?? []).map((target, index) => {
                    const selectedView = views.find((view) => view.reference === target.viewRef || view.id === target.viewRef);
                    const numericNodes = (selectedView?.nodes ?? []).filter((node) => ['number', 'progress'].includes(node.type));
                    return (
                      <article key={target.id} className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <strong>Vue {index + 1}</strong>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              updateBlock(stageId, block.id, (current) =>
                                current.kind !== 'allocation'
                                  ? current
                                  : {
                                      ...current,
                                      viewTargets: (current.viewTargets ?? []).filter((entry) => entry.id !== target.id)
                                    }
                              )
                            }
                            disabled={disabled || (allocationBlock.viewTargets?.length ?? 0) <= 1}
                          >
                            Supprimer
                          </Button>
                        </div>
                        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Libellé</span>
                            <input
                              value={target.label}
                              onChange={(event) =>
                                updateBlock(stageId, block.id, (current) =>
                                  current.kind !== 'allocation'
                                    ? current
                                    : {
                                        ...current,
                                        viewTargets: (current.viewTargets ?? []).map((entry) => (entry.id === target.id ? { ...entry, label: event.target.value } : entry))
                                      }
                                )
                              }
                              disabled={disabled}
                            />
                          </label>
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Vue cible</span>
                            <select
                              value={target.viewRef}
                              onChange={(event) =>
                                updateBlock(stageId, block.id, (current) =>
                                  current.kind !== 'allocation'
                                    ? current
                                    : {
                                        ...current,
                                        viewTargets: (current.viewTargets ?? []).map((entry) =>
                                          entry.id === target.id
                                            ? { ...entry, viewRef: event.target.value, hiddenFieldKeys: [], lockedFieldKeys: [] }
                                            : entry
                                        )
                                      }
                                )
                              }
                              disabled={disabled}
                            >
                              <option value="">Sélectionner</option>
                              {views.map((view) => (
                                <option key={view.id} value={view.reference}>{view.name} · {view.reference}</option>
                              ))}
                            </select>
                          </label>
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Formule de coût par vue</span>
                            <input
                              value={target.costFormula}
                              onChange={(event) =>
                                updateBlock(stageId, block.id, (current) =>
                                  current.kind !== 'allocation'
                                    ? current
                                    : {
                                        ...current,
                                        viewTargets: (current.viewTargets ?? []).map((entry) => (entry.id === target.id ? { ...entry, costFormula: event.target.value } : entry))
                                      }
                                )
                              }
                              disabled={disabled}
                            />
                          </label>
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Valeur min par variable de la vue</span>
                            <input
                              value={target.minFormula ?? ''}
                              onChange={(event) =>
                                updateBlock(stageId, block.id, (current) =>
                                  current.kind !== 'allocation'
                                    ? current
                                    : {
                                        ...current,
                                        viewTargets: (current.viewTargets ?? []).map((entry) => (entry.id === target.id ? { ...entry, minFormula: event.target.value } : entry))
                                      }
                                )
                              }
                              disabled={disabled}
                              placeholder="Ex. 0"
                            />
                          </label>
                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                            <span>Valeur max par variable de la vue</span>
                            <input
                              value={target.maxFormula ?? ''}
                              onChange={(event) =>
                                updateBlock(stageId, block.id, (current) =>
                                  current.kind !== 'allocation'
                                    ? current
                                    : {
                                        ...current,
                                        viewTargets: (current.viewTargets ?? []).map((entry) => (entry.id === target.id ? { ...entry, maxFormula: event.target.value } : entry))
                                      }
                                )
                              }
                              disabled={disabled}
                              placeholder="Ex. 10"
                            />
                          </label>
                          <div style={{ display: 'grid', alignContent: 'end' }}>
                            {renderInlineInsertTools({
                              tokenLabel: 'Insérer une variable',
                              onTokenPick: (token) =>
                                updateBlock(stageId, block.id, (current) =>
                                  current.kind !== 'allocation'
                                    ? current
                                    : {
                                        ...current,
                                        viewTargets: (current.viewTargets ?? []).map((entry) => (entry.id === target.id ? { ...entry, costFormula: `${entry.costFormula}${token}` } : entry))
                                      }
                                )
                            })}
                          </div>
                        </div>
                        {renderConditionComposer({
                          label: 'Condition d activation de la vue',
                          value: target.condition ?? '',
                          onChange: (nextValue) =>
                            updateBlock(stageId, block.id, (current) =>
                              current.kind !== 'allocation'
                                ? current
                                : {
                                    ...current,
                                    viewTargets: (current.viewTargets ?? []).map((entry) => (entry.id === target.id ? { ...entry, condition: nextValue } : entry))
                                  }
                            )
                        })}
                        <label style={{ display: 'grid', gap: '0.35rem' }}>
                          <span>Aide</span>
                          <input
                            value={target.helperText ?? ''}
                            onChange={(event) =>
                              updateBlock(stageId, block.id, (current) =>
                                current.kind !== 'allocation'
                                  ? current
                                  : {
                                      ...current,
                                      viewTargets: (current.viewTargets ?? []).map((entry) => (entry.id === target.id ? { ...entry, helperText: event.target.value } : entry))
                                    }
                              )
                            }
                            disabled={disabled}
                          />
                        </label>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          <strong>Variables de la vue</strong>
                          {numericNodes.length === 0 ? <small>Aucune variable numérique modifiable détectée sur cette vue.</small> : null}
                          {numericNodes.map((node) => (
                            <label key={node.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: '0.75rem', alignItems: 'center' }}>
                              <span>{node.label} · {node.key}</span>
                              <span style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!(target.hiddenFieldKeys ?? []).includes(node.key)}
                                  onChange={(event) =>
                                    updateBlock(stageId, block.id, (current) =>
                                      current.kind !== 'allocation'
                                        ? current
                                        : {
                                            ...current,
                                            viewTargets: (current.viewTargets ?? []).map((entry) =>
                                              entry.id !== target.id
                                                ? entry
                                                : {
                                                    ...entry,
                                                    hiddenFieldKeys: event.target.checked
                                                      ? (entry.hiddenFieldKeys ?? []).filter((key) => key !== node.key)
                                                      : Array.from(new Set([...(entry.hiddenFieldKeys ?? []), node.key]))
                                                  }
                                            )
                                          }
                                    )
                                  }
                                  disabled={disabled}
                                />
                                Visible
                              </span>
                              <span style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!(target.lockedFieldKeys ?? []).includes(node.key)}
                                  onChange={(event) =>
                                    updateBlock(stageId, block.id, (current) =>
                                      current.kind !== 'allocation'
                                        ? current
                                        : {
                                            ...current,
                                            viewTargets: (current.viewTargets ?? []).map((entry) =>
                                              entry.id !== target.id
                                                ? entry
                                                : {
                                                    ...entry,
                                                    lockedFieldKeys: event.target.checked
                                                      ? (entry.lockedFieldKeys ?? []).filter((key) => key !== node.key)
                                                      : Array.from(new Set([...(entry.lockedFieldKeys ?? []), node.key]))
                                                  }
                                            )
                                          }
                                    )
                                  }
                                  disabled={disabled || (target.hiddenFieldKeys ?? []).includes(node.key)}
                                />
                                Modifiable
                              </span>
                            </label>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : null}

        {block.kind === 'set_value' ? (
          (() => {
            const setValueBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'set_value' }>;
            return <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Cible</span>
              <input value={renderTargetSummary(setValueBlock.target)} readOnly />
            </label>
            <div style={{ display: 'grid', alignContent: 'end' }}>
              <Button type="button" variant="secondary" onClick={() => setPickerState({ type: 'target', stageId, blockId: block.id, search: '' })} disabled={disabled}>Sélectionner variable</Button>
            </div>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Formule</span>
              <input value={setValueBlock.valueFormula} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof setValueBlock), valueFormula: event.target.value }))} disabled={disabled} />
            </label>
            <div style={{ display: 'grid', alignContent: 'end' }}>
              {renderInlineInsertTools({
                tokenLabel: 'Insérer une variable',
                onTokenPick: (token) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof setValueBlock), valueFormula: `${setValueBlock.valueFormula}${token}` }))
              })}
            </div>
          </div>;
          })()
        ) : null}

        {block.kind === 'copy_value' ? (
          (() => {
            const copyBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'copy_value' }>;
            return <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Cible</span>
                <input value={renderTargetSummary(copyBlock.target)} readOnly />
              </label>
              <div style={{ display: 'grid', alignContent: 'end' }}>
                <Button type="button" variant="secondary" onClick={() => setPickerState({ type: 'target', stageId, blockId: block.id, search: '' })} disabled={disabled}>Sélectionner variable</Button>
              </div>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Valeur source / formule</span>
                <input value={copyBlock.sourceFormula} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof copyBlock), sourceFormula: event.target.value }))} disabled={disabled} />
              </label>
              <div style={{ display: 'grid', alignContent: 'end' }}>
                {renderInlineInsertTools({
                  tokenLabel: 'Insérer une variable',
                  onTokenPick: (token) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof copyBlock), sourceFormula: `${copyBlock.sourceFormula}${token}` }))
                })}
              </div>
            </div>;
          })()
        ) : null}

        {block.kind === 'adjust_value' ? (
          (() => {
            const adjustBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'adjust_value' }>;
            return <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Cible</span>
                <input value={renderTargetSummary(adjustBlock.target)} readOnly />
              </label>
              <div style={{ display: 'grid', alignContent: 'end' }}>
                <Button type="button" variant="secondary" onClick={() => setPickerState({ type: 'target', stageId, blockId: block.id, search: '' })} disabled={disabled}>Sélectionner variable</Button>
              </div>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Opération</span>
                <select value={adjustBlock.operator} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof adjustBlock), operator: event.target.value as typeof adjustBlock.operator }))} disabled={disabled}>
                  <option value="add">Ajouter</option>
                  <option value="subtract">Retirer</option>
                  <option value="multiply">Multiplier</option>
                  <option value="divide">Diviser</option>
                  <option value="set">Remplacer</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Formule</span>
                <input value={adjustBlock.valueFormula} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof adjustBlock), valueFormula: event.target.value }))} disabled={disabled} />
              </label>
              <div style={{ display: 'grid', alignContent: 'end' }}>
                {renderInlineInsertTools({
                  tokenLabel: 'Insérer une variable',
                  onTokenPick: (token) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof adjustBlock), valueFormula: `${adjustBlock.valueFormula}${token}` }))
                })}
              </div>
            </div>;
          })()
        ) : null}

        {block.kind === 'roll' ? (
          (() => {
            const rollBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'roll' }>;
            return <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Question / message</span>
              <input value={rollBlock.prompt} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof rollBlock), prompt: event.target.value }))} disabled={disabled} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Cible</span>
              <input value={renderTargetSummary(rollBlock.target)} readOnly />
            </label>
            <div style={{ display: 'grid', alignContent: 'end' }}>
              <Button type="button" variant="secondary" onClick={() => setPickerState({ type: 'target', stageId, blockId: block.id, search: '' })} disabled={disabled}>Sélectionner variable</Button>
            </div>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Formule de dés</span>
              <input value={rollBlock.diceFormula} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof rollBlock), diceFormula: event.target.value }))} disabled={disabled} />
            </label>
            <div style={{ display: 'grid', alignContent: 'end' }}>
              {renderInlineInsertTools({
                tokenLabel: 'Insérer une variable',
                onTokenPick: (token) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof rollBlock), diceFormula: `${rollBlock.diceFormula}${token}` }))
              })}
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'end' }}>
              <input type="checkbox" checked={rollBlock.allowReroll !== false} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof rollBlock), allowReroll: event.target.checked }))} disabled={disabled} />
              Autoriser la relance
            </label>
          </div>;
          })()
        ) : null}

        {block.kind === 'if' ? (
          (() => {
            const ifBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'if' }>;
            return <div style={{ display: 'grid', gap: '0.85rem' }}>
            {renderConditionComposer({
              label: 'Condition',
              value: ifBlock.condition,
              onChange: (nextValue) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof ifBlock), condition: nextValue }))
            })}
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <section className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                  <strong>ALORS</strong>
                  <select onChange={(event) => { if (event.target.value) { insertBlockIntoBranch(stageId, block.id, 'then', event.target.value as CharacterCreationScenarioBlockKind); event.target.value = ''; } }} disabled={disabled} defaultValue="">
                    <option value="">Ajouter...</option>
                    {BLOCK_OPTIONS.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                  </select>
                </div>
                {ifBlock.thenBlocks.length === 0 ? <small>Aucun bloc dans ALORS.</small> : ifBlock.thenBlocks.map((child) => renderBlock(stageId, child, depth + 1))}
              </section>
              {(ifBlock.elseIfBranches ?? []).map((branch) => (
                <section key={branch.id} className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                    <strong>{branch.label || 'SINON SI'}</strong>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select onChange={(event) => { if (event.target.value) { insertBlockIntoBranch(stageId, block.id, `elseif:${branch.id}`, event.target.value as CharacterCreationScenarioBlockKind); event.target.value = ''; } }} disabled={disabled} defaultValue="">
                        <option value="">Ajouter...</option>
                        {BLOCK_OPTIONS.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                      </select>
                      <Button type="button" variant="secondary" onClick={() => updateBlock(stageId, block.id, (current) => current.kind !== 'if' ? current : ({ ...current, elseIfBranches: (current.elseIfBranches ?? []).filter((entry) => entry.id !== branch.id) }))} disabled={disabled}>Supprimer</Button>
                    </div>
                  </div>
                  {renderConditionComposer({
                    label: 'Condition',
                    value: branch.condition,
                    onChange: (nextValue) => updateBlock(stageId, block.id, (current) => current.kind !== 'if' ? current : ({ ...current, elseIfBranches: (current.elseIfBranches ?? []).map((entry) => entry.id === branch.id ? { ...entry, condition: nextValue } : entry) }))
                  })}
                  {branch.blocks.length === 0 ? <small>Aucun bloc dans ce SINON SI.</small> : branch.blocks.map((child) => renderBlock(stageId, child, depth + 1))}
                </section>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Button type="button" variant="secondary" onClick={() => addElseIfBranch(stageId, block.id)} disabled={disabled}>Ajouter SINON SI</Button>
              </div>
              <section className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                  <strong>SINON</strong>
                  <select onChange={(event) => { if (event.target.value) { insertBlockIntoBranch(stageId, block.id, 'else', event.target.value as CharacterCreationScenarioBlockKind); event.target.value = ''; } }} disabled={disabled} defaultValue="">
                    <option value="">Ajouter...</option>
                    {BLOCK_OPTIONS.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                  </select>
                </div>
                {ifBlock.elseBlocks.length === 0 ? <small>Aucun bloc dans SINON.</small> : ifBlock.elseBlocks.map((child) => renderBlock(stageId, child, depth + 1))}
              </section>
            </div>
          </div>;
          })()
        ) : null}

        {block.kind === 'group' ? (
          (() => {
            const groupBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'group' }>;
            return <section className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                <strong>FAIRE</strong>
                <select onChange={(event) => { if (event.target.value) { insertBlockIntoContainer(stageId, block.id, event.target.value as CharacterCreationScenarioBlockKind); event.target.value = ''; } }} disabled={disabled} defaultValue="">
                  <option value="">Ajouter...</option>
                  {BLOCK_OPTIONS.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                </select>
              </div>
              {groupBlock.blocks.length === 0 ? <small>Aucun bloc dans ce groupe.</small> : groupBlock.blocks.map((child) => renderBlock(stageId, child, depth + 1))}
            </section>;
          })()
        ) : null}

        {block.kind === 'message' ? (
          (() => {
            const messageBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'message' }>;
            return <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem', gridColumn: '1 / -1' }}>
                <span>Contenu</span>
                <textarea value={messageBlock.content} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof messageBlock), content: event.target.value }))} disabled={disabled} rows={3} />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Ton</span>
                <select value={messageBlock.tone ?? 'info'} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof messageBlock), tone: event.target.value as typeof messageBlock.tone }))} disabled={disabled}>
                  <option value="info">Info</option>
                  <option value="warning">Alerte</option>
                  <option value="success">Succès</option>
                </select>
              </label>
            </div>;
          })()
        ) : null}

        {block.kind === 'loop' ? (
          (() => {
            const loopBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'loop' }>;
            return <div style={{ display: 'grid', gap: '0.85rem' }}>
              <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Nombre d itérations</span>
                  <input value={loopBlock.iterationsFormula} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof loopBlock), iterationsFormula: event.target.value }))} disabled={disabled} />
                </label>
                {renderInlineInsertTools({
                  tokenLabel: 'Insérer une variable',
                  onTokenPick: (token) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof loopBlock), iterationsFormula: `${loopBlock.iterationsFormula}${token}` }))
                })}
              </div>
              <section className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                  <strong>FAIRE</strong>
                  <select onChange={(event) => { if (event.target.value) { insertBlockIntoContainer(stageId, block.id, event.target.value as CharacterCreationScenarioBlockKind); event.target.value = ''; } }} disabled={disabled} defaultValue="">
                    <option value="">Ajouter...</option>
                    {BLOCK_OPTIONS.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                  </select>
                </div>
                {loopBlock.blocks.length === 0 ? <small>Aucun bloc dans cette boucle.</small> : loopBlock.blocks.map((child) => renderBlock(stageId, child, depth + 1))}
              </section>
            </div>;
          })()
        ) : null}

        {block.kind === 'while' ? (
          (() => {
            const whileBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'while' }>;
            return <div style={{ display: 'grid', gap: '0.85rem' }}>
              {renderConditionComposer({
                label: 'Condition',
                value: whileBlock.condition,
                onChange: (nextValue) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof whileBlock), condition: nextValue }))
              })}
              <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.75rem', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Itérations max de sécurité</span>
                  <input value={whileBlock.maxIterationsFormula ?? ''} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof whileBlock), maxIterationsFormula: event.target.value }))} disabled={disabled} />
                </label>
                {renderInlineInsertTools({
                  tokenLabel: 'Insérer une variable',
                  onTokenPick: (token) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof whileBlock), maxIterationsFormula: `${whileBlock.maxIterationsFormula || ''}${token}` }))
                })}
              </div>
              <section className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                  <strong>FAIRE</strong>
                  <select onChange={(event) => { if (event.target.value) { insertBlockIntoContainer(stageId, block.id, event.target.value as CharacterCreationScenarioBlockKind); event.target.value = ''; } }} disabled={disabled} defaultValue="">
                    <option value="">Ajouter...</option>
                    {BLOCK_OPTIONS.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
                  </select>
                </div>
                {whileBlock.blocks.length === 0 ? <small>Aucun bloc dans ce TANT QUE.</small> : whileBlock.blocks.map((child) => renderBlock(stageId, child, depth + 1))}
              </section>
            </div>;
          })()
        ) : null}

        {block.kind === 'next_stage' ? (
          (() => {
            const nextStageBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'next_stage' }>;
            return <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Raison / note</span>
              <input value={nextStageBlock.reason ?? ''} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof nextStageBlock), reason: event.target.value }))} disabled={disabled} />
            </label>;
          })()
        ) : null}

        {block.kind === 'stop' ? (
          (() => {
            const stopBlock = block as Extract<CharacterCreationScenarioBlockDefinition, { kind: 'stop' }>;
            return <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Raison / message d arrêt</span>
              <input value={stopBlock.reason ?? ''} onChange={(event) => updateBlock(stageId, block.id, (current) => ({ ...(current as typeof stopBlock), reason: event.target.value }))} disabled={disabled} />
            </label>;
          })()
        ) : null}
      </article>
    );
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <section className="card" style={{ margin: 0, display: 'grid', gap: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong>Règle création personnage</strong>
            <div><small>Version 2 en refonte : une étape contient maintenant un scénario complet, pas une action unique.</small></div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={normalized.enabled} onChange={(event) => commit((current) => ({ ...current, enabled: event.target.checked }))} disabled={disabled} />
            Activée
          </label>
        </div>
        <div className="home-alert home-alert--warning" style={{ margin: 0 }}>
          Cette v2 est en beta admin : le runtime joueur est branché pour les tests, mais on continue à faire évoluer le langage et l exécution.
        </div>
      </section>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: '1rem', alignItems: 'start' }}>
        <aside className="card" style={{ margin: 0, display: 'grid', gap: '0.85rem' }}>
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            <strong>Fonctions de script</strong>
            <small>Ajoute des blocs directement dans l étape sélectionnée, comme dans un scénario.</small>
          </div>
          {editorNotice ? <small style={{ color: '#067647' }}>{editorNotice}</small> : null}
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Fonction à ajouter</span>
              <select
                value={blockKindToInsert}
                onChange={(event) => setBlockKindToInsert(event.target.value as CharacterCreationScenarioBlockKind | '')}
                disabled={disabled || !selectedStage}
              >
                <option value="">Sélectionner une fonction</option>
                {blockOptionGroups.map(([groupLabel, options]) => (
                  <optgroup key={groupLabel} label={groupLabel}>
                    {options.map((option) => (
                      <option key={option.kind} value={option.kind}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!selectedStage || !blockKindToInsert) {
                  return;
                }
                insertBlockIntoStage(selectedStage.id, blockKindToInsert);
                setBlockKindToInsert('');
              }}
              disabled={disabled || !selectedStage || !blockKindToInsert}
            >
              Ajouter la fonction
            </Button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
            <strong>Étapes</strong>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const stage = createStage();
                commit((current) => ({ ...current, stages: [...current.stages, stage] }));
                setSelectedStageId(stage.id);
                setEditorNotice(`Étape ${stage.label} ajoutée.`);
              }}
              disabled={disabled}
            >
              Ajouter
            </Button>
          </div>
          {normalized.stages.length === 0 ? <small>Aucune étape pour le moment.</small> : normalized.stages.map((stage, index) => (
            <button key={stage.id} type="button" className="screen-widget-palette-item screen-widget-palette-item--system-compact" style={{ textAlign: 'left', borderColor: selectedStage?.id === stage.id ? 'rgba(93, 156, 236, 0.75)' : undefined }} onClick={() => setSelectedStageId(stage.id)}>
              <strong>{index + 1}. {stage.label}</strong>
              <small>{stage.key}</small>
              <small>{(stage.blocks ?? []).length} bloc{(stage.blocks ?? []).length > 1 ? 's' : ''}{(stage.blocks ?? []).length === 0 ? ' · étape vide' : ''}</small>
            </button>
          ))}

          <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.5rem' }}>
            <strong>Réserves</strong>
            {normalized.pools.map((pool) => (
              <div key={pool.id} className="card" style={{ margin: 0, padding: '0.65rem', display: 'grid', gap: '0.35rem' }}>
                <input value={pool.label} onChange={(event) => commit((current) => ({ ...current, pools: current.pools.map((entry) => entry.id === pool.id ? { ...entry, label: event.target.value } : entry) }))} disabled={disabled} />
                <input value={pool.key} onChange={(event) => commit((current) => ({ ...current, pools: current.pools.map((entry) => entry.id === pool.id ? { ...entry, key: event.target.value } : entry) }))} disabled={disabled} />
                <input value={pool.initialValueFormula} onChange={(event) => commit((current) => ({ ...current, pools: current.pools.map((entry) => entry.id === pool.id ? { ...entry, initialValueFormula: event.target.value } : entry) }))} disabled={disabled} />
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => commit((current) => ({ ...current, pools: [...current.pools, createPool()] }))} disabled={disabled}>Ajouter une réserve</Button>
            <strong>Variables</strong>
            {normalized.variables.map((variable) => (
              <div key={variable.id} className="card" style={{ margin: 0, padding: '0.65rem', display: 'grid', gap: '0.35rem' }}>
                <input value={variable.label} onChange={(event) => commit((current) => ({ ...current, variables: current.variables.map((entry) => entry.id === variable.id ? { ...entry, label: event.target.value } : entry) }))} disabled={disabled} />
                <input value={variable.key} onChange={(event) => commit((current) => ({ ...current, variables: current.variables.map((entry) => entry.id === variable.id ? { ...entry, key: event.target.value } : entry) }))} disabled={disabled} />
                <input value={variable.initialValueFormula} onChange={(event) => commit((current) => ({ ...current, variables: current.variables.map((entry) => entry.id === variable.id ? { ...entry, initialValueFormula: event.target.value } : entry) }))} disabled={disabled} />
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => commit((current) => ({ ...current, variables: [...current.variables, createVariable()] }))} disabled={disabled}>Ajouter une variable</Button>
          </div>
        </aside>

        <section className="card" style={{ margin: 0, display: 'grid', gap: '0.85rem' }}>
          {!selectedStage ? (
            <small>Sélectionne ou crée une étape pour éditer son scénario.</small>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <strong>Scénario de l étape</strong>
                  <div><small>{selectedStage.key}</small></div>
                </div>
                <Button type="button" variant="secondary" onClick={() => commit((current) => ({ ...current, stages: current.stages.filter((entry) => entry.id !== selectedStage.id) }))} disabled={disabled}>Supprimer l étape</Button>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Libellé</span>
                  <input value={selectedStage.label} onChange={(event) => updateStage(selectedStage.id, (stage) => ({ ...stage, label: event.target.value }))} disabled={disabled} />
                </label>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>Clé</span>
                  <input value={selectedStage.key} onChange={(event) => updateStage(selectedStage.id, (stage) => ({ ...stage, key: event.target.value }))} disabled={disabled} />
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'end' }}>
                  <input type="checkbox" checked={selectedStage.enabled} onChange={(event) => updateStage(selectedStage.id, (stage) => ({ ...stage, enabled: event.target.checked }))} disabled={disabled} />
                  Étape activée
                </label>
              </div>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Description</span>
                <textarea value={selectedStage.description ?? ''} onChange={(event) => updateStage(selectedStage.id, (stage) => ({ ...stage, description: event.target.value }))} disabled={disabled} rows={2} />
              </label>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.75rem' }}>
                {renderConditionComposer({
                  label: 'Condition d entrée',
                  value: selectedStage.entryCondition ?? '',
                  onChange: (nextValue) => updateStage(selectedStage.id, (stage) => ({ ...stage, entryCondition: nextValue }))
                })}
                {renderConditionComposer({
                  label: 'Condition de passage',
                  value: selectedStage.completionCondition ?? '',
                  onChange: (nextValue) => updateStage(selectedStage.id, (stage) => ({ ...stage, completionCondition: nextValue }))
                })}
              </div>
              {selectedStage.blocks.length === 0 ? (
                <div className="home-alert home-alert--warning" style={{ margin: 0 }}>
                  Cette étape est enregistrée sans bloc. En test, elle apparaîtra vide tant qu aucun bloc n aura été ajouté.
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {selectedStage.blocks.length === 0 ? (
                  <div className="card" style={{ margin: 0, padding: '0.85rem' }}>Aucun bloc dans cette étape pour le moment.</div>
                ) : (
                  selectedStage.blocks.map((block) => renderBlock(selectedStage.id, block))
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {pickerState ? (
        <div className="resource-preview-modal" onClick={() => setPickerState(null)}>
          <section className="resource-preview-modal__dialog" onClick={(event) => event.stopPropagation()}>
            <header className="resource-preview-modal__header">
              <div>
                <strong>
                  {pickerState.type === 'token'
                    ? pickerState.title
                    : pickerState.type === 'allocation-target'
                    ? 'Sélectionner une ou plusieurs variables'
                    : 'Sélectionner une variable'}
                </strong>
              </div>
              <Button type="button" variant="secondary" onClick={() => setPickerState(null)}>Fermer</Button>
            </header>
            <div className="resource-preview-modal__body" style={{ display: 'grid', gap: '0.85rem' }}>
              <input value={pickerState.search} onChange={(event) => setPickerState({ ...pickerState, search: event.target.value } as PickerMode)} placeholder="Rechercher une variable..." />
              {pickerState.type === 'allocation-target' ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const picked = filteredCandidates.filter((candidate) => allocationPickerSelection.includes(candidate.id));
                      appendAllocationTargets(pickerState.stageId, pickerState.blockId, picked);
                      setPickerState(null);
                    }}
                    disabled={allocationPickerSelection.length === 0}
                  >
                    Ajouter la sélection
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAllocationPickerSelection(filteredCandidates.filter((candidate) => candidate.kind === 'sheet').map((candidate) => candidate.id))}
                    disabled={filteredCandidates.length === 0}
                  >
                    Tout sélectionner
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setAllocationPickerSelection([])} disabled={allocationPickerSelection.length === 0}>
                    Vider la sélection
                  </Button>
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: '0.65rem', maxHeight: '60vh', overflow: 'auto' }}>
                {filteredCandidatesByGroup.map(([group, groupCandidates]) => (
                  <section key={group} className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>{group}</strong>
                      {pickerState.type === 'allocation-target' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            appendAllocationTargets(
                              pickerState.stageId,
                              pickerState.blockId,
                              groupCandidates.filter((candidate) => candidate.kind === 'sheet')
                            );
                            setPickerState(null);
                          }}
                          disabled={groupCandidates.filter((candidate) => candidate.kind === 'sheet').length === 0}
                        >
                          Ajouter toute la vue
                        </Button>
                      ) : null}
                    </div>
                    {groupCandidates.map((candidate) => (
                      <div key={candidate.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                        {pickerState.type === 'allocation-target' ? (
                          <label style={{ display: 'inline-flex', alignItems: 'center', padding: '0 0.25rem' }}>
                            <input
                              type="checkbox"
                              checked={allocationPickerSelection.includes(candidate.id)}
                              onChange={(event) =>
                                setAllocationPickerSelection((current) =>
                                  event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id)
                                )
                              }
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          className="screen-widget-palette-item screen-widget-palette-item--system-compact"
                          style={{ textAlign: 'left', flex: 1 }}
                          onClick={() => handlePickCandidate(candidate)}
                        >
                          <strong>{candidate.label}</strong>
                          <small>{candidate.group} · {candidate.kind === 'sheet' ? `${candidate.viewRef}.${candidate.key}` : candidate.key}</small>
                          <small><code>{candidate.token}</code></small>
                        </button>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
