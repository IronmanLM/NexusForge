export interface SystemRollDefinition {
  id: string;
  label: string;
  formula: string;
  description?: string;
}

export type RulesBlockType = 'set_secondary_stat' | 'define_roll';
export type NumericOperation = 'sum' | 'subtract' | 'multiply' | 'average';
export type NumericRounding = 'none' | 'floor' | 'ceil' | 'round';

export interface SetSecondaryStatBlock {
  id: string;
  type: 'set_secondary_stat';
  label: string;
  targetFieldId: string;
  sourceFieldIds: string[];
  operation: NumericOperation;
  constantModifier?: number;
  rounding?: NumericRounding;
}

export interface DefineRollBlock {
  id: string;
  type: 'define_roll';
  actionId: string;
  label: string;
  description?: string;
  diceCount: number;
  diceSides: number;
  modifierFieldId?: string;
  flatModifier?: number;
}

export type RulesProgramBlock = SetSecondaryStatBlock | DefineRollBlock;
export type GameSystemVisibility = 'public' | 'private' | 'friends';
export type GameSystemStatus = 'draft' | 'published';
export type RulesGroupLayout = 'full' | 'half';

export interface RulesPresentationGroup {
  id: string;
  name: string;
  showTitle: boolean;
  layout: RulesGroupLayout;
  blockIds: string[];
}

export interface RulesPresentation {
  groups: RulesPresentationGroup[];
}

export type StudioAlignmentHorizontal = 'gauche' | 'centre' | 'droite' | 'etirer';
export type StudioAlignmentVertical = 'haut' | 'centre' | 'bas' | 'etirer';
export type StudioBorderType = 'solide' | 'pointille' | 'tiret' | 'double';
export type StudioTypographyFamily = 'par_defaut' | 'serif' | 'sans-serif' | 'monospace' | 'fantaisie';
export type StudioTypographySize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type StudioFieldLabelStyleMode = 'commun' | 'separe';
export type StudioTabOrientation = 'horizontal' | 'vertical_gauche' | 'vertical_droite';
export type StudioGaugeOrientation = 'horizontale' | 'verticale';
export type StudioButtonContentMode = 'texte' | 'icone' | 'texte_icone' | 'icone_texte';
export type StudioButtonActionType =
  | 'aucune'
  | 'aller_vers_vue'
  | 'ouvrir_popup_vue'
  | 'executer_script'
  | 'lancer_jet'
  | 'ajouter_depuis_catalogue'
  | 'dupliquer_item'
  | 'equiper_desequiper'
  | 'incrementer_quantite'
  | 'decrementer_quantite'
  | 'supprimer_item';
export type StudioButtonRollVisibility = 'public' | 'mj_seulement' | 'prive';
export type StudioCheckboxShape = 'carre' | 'rond';
export type StudioCheckboxActiveStyle = 'coche' | 'rempli';
export type CharacterSheetKind = 'pc' | 'npc' | 'creature';
export type CharacterInitiativeMode = 'combat_once' | 'round_recalc' | 'gm_fixed' | 'manual_turn';
export type StudioBackgroundSize = 'auto' | 'contenir' | 'couvrir' | 'etirer';
export type StudioBackgroundPosition =
  | 'centre'
  | 'haut'
  | 'bas'
  | 'gauche'
  | 'droite'
  | 'haut_gauche'
  | 'haut_droite'
  | 'bas_gauche'
  | 'bas_droite';
export type StudioBackgroundRepeat = 'aucune' | 'repeter' | 'repeter_x' | 'repeter_y';
export type SystemCatalogColumnType = 'text' | 'textarea' | 'number' | 'checkbox' | 'select';
export type SystemDiscordOutputKey =
  | 'sheet'
  | 'inventory'
  | 'notes'
  | 'view1'
  | 'view2'
  | 'view3'
  | 'view4'
  | 'view5'
  | 'view6'
  | 'view7'
  | 'view8'
  | 'view9';
export type SystemDiscordOutputFormat = 'text' | 'embed';
export type SystemDiscordVisibility = 'public' | 'private';
export type SystemDiscordOutputSourceType = 'sheet' | 'collection' | 'notes' | 'view';
export type LegacyCharacterCreationStepKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'catalog_select'
  | 'catalog_or_text'
  | 'allocation'
  | 'set_formula'
  | 'roll'
  | 'condition';
export type CharacterCreationTargetScope = 'sheet' | 'creation';
export type CharacterCreationScriptActionKind = 'set_formula' | 'roll';
export type CharacterCreationScenarioBlockKind =
  | 'group'
  | 'message'
  | 'question_text'
  | 'question_textarea'
  | 'question_number'
  | 'question_choice'
  | 'question_catalog'
  | 'allocation'
  | 'set_value'
  | 'copy_value'
  | 'adjust_value'
  | 'roll'
  | 'if'
  | 'loop'
  | 'while'
  | 'next_stage'
  | 'stop';

export interface CharacterCreationPoolDefinition {
  id: string;
  key: string;
  label: string;
  initialValueFormula: string;
  description?: string;
}

export interface CharacterCreationStepOptionDefinition {
  id: string;
  value: string;
  label: string;
}

export interface CharacterCreationVariableDefinition {
  id: string;
  key: string;
  label: string;
  initialValueFormula: string;
  description?: string;
}

export interface CharacterCreationAllocationRuleDefinition {
  id: string;
  label: string;
  poolKey: string;
  targetScope?: CharacterCreationTargetScope;
  targetViewRef?: string;
  targetFieldKey: string;
  step?: number | null;
  minFormula?: string;
  maxFormula?: string;
  costFormula: string;
  condition?: string;
  helperText?: string;
}

export interface CharacterCreationScriptActionDefinition {
  id: string;
  kind: CharacterCreationScriptActionKind;
  label: string;
  targetScope?: CharacterCreationTargetScope;
  targetViewRef?: string;
  targetFieldKey: string;
  valueFormula: string;
  allowReroll?: boolean;
  helperText?: string;
}

export interface LegacyCharacterCreationStepDefinition {
  id: string;
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
  kind: LegacyCharacterCreationStepKind;
  prompt: string;
  targetScope?: CharacterCreationTargetScope;
  targetViewRef?: string;
  targetFieldKey?: string;
  valueFormula?: string;
  allowReroll?: boolean;
  condition?: string;
  catalogKey?: string;
  allowFreeText?: boolean;
  options?: CharacterCreationStepOptionDefinition[];
  allocationRules?: CharacterCreationAllocationRuleDefinition[];
  thenActions?: CharacterCreationScriptActionDefinition[];
  elseActions?: CharacterCreationScriptActionDefinition[];
  nextCondition?: string;
  helperText?: string;
}

export interface LegacyCharacterCreationConfig {
  version: 1;
  enabled: boolean;
  pools: CharacterCreationPoolDefinition[];
  variables: CharacterCreationVariableDefinition[];
  steps: LegacyCharacterCreationStepDefinition[];
}

export interface CharacterCreationBindingTarget {
  scope: 'sheet' | 'creation' | 'pool';
  viewRef?: string;
  key: string;
}

export interface CharacterCreationScenarioBlockBase {
  id: string;
  kind: CharacterCreationScenarioBlockKind;
  label: string;
  description?: string;
  enabled: boolean;
}

export interface CharacterCreationGroupBlock extends CharacterCreationScenarioBlockBase {
  kind: 'group';
  blocks: CharacterCreationScenarioBlockDefinition[];
}

export interface CharacterCreationMessageBlock extends CharacterCreationScenarioBlockBase {
  kind: 'message';
  content: string;
  tone?: 'info' | 'warning' | 'success';
}

export interface CharacterCreationQuestionTextBlock extends CharacterCreationScenarioBlockBase {
  kind: 'question_text' | 'question_textarea' | 'question_number';
  prompt: string;
  placeholder?: string;
  target: CharacterCreationBindingTarget;
  defaultValueFormula?: string;
  minFormula?: string;
  maxFormula?: string;
  required?: boolean;
}

export interface CharacterCreationQuestionChoiceBlock extends CharacterCreationScenarioBlockBase {
  kind: 'question_choice';
  prompt: string;
  target: CharacterCreationBindingTarget;
  options: CharacterCreationStepOptionDefinition[];
  allowFreeText?: boolean;
}

export interface CharacterCreationCatalogWriteMappingDefinition {
  id: string;
  target: CharacterCreationBindingTarget;
  valueColumnKey?: string;
}

export interface CharacterCreationQuestionCatalogBlock extends CharacterCreationScenarioBlockBase {
  kind: 'question_catalog';
  prompt: string;
  target: CharacterCreationBindingTarget;
  catalogKey: string;
  valueColumnKey?: string;
  labelColumnKey?: string;
  costColumnKey?: string;
  costTarget?: CharacterCreationBindingTarget;
  mappings?: CharacterCreationCatalogWriteMappingDefinition[];
  allowFreeText?: boolean;
}

export interface CharacterCreationAllocationTargetDefinition {
  id: string;
  label: string;
  target: CharacterCreationBindingTarget;
  step?: number | null;
  minFormula?: string;
  maxFormula?: string;
  costFormula: string;
  condition?: string;
  helperText?: string;
}

export interface CharacterCreationAllocationViewTargetDefinition {
  id: string;
  viewRef: string;
  label: string;
  costFormula: string;
  minFormula?: string;
  maxFormula?: string;
  condition?: string;
  hiddenFieldKeys?: string[];
  lockedFieldKeys?: string[];
  helperText?: string;
}

export interface CharacterCreationAllocationBlock extends CharacterCreationScenarioBlockBase {
  kind: 'allocation';
  prompt: string;
  poolKey: string;
  targets: CharacterCreationAllocationTargetDefinition[];
  viewTargets?: CharacterCreationAllocationViewTargetDefinition[];
}

export interface CharacterCreationSetValueBlock extends CharacterCreationScenarioBlockBase {
  kind: 'set_value';
  target: CharacterCreationBindingTarget;
  valueFormula: string;
}

export interface CharacterCreationCopyValueBlock extends CharacterCreationScenarioBlockBase {
  kind: 'copy_value';
  target: CharacterCreationBindingTarget;
  sourceFormula: string;
}

export interface CharacterCreationAdjustValueBlock extends CharacterCreationScenarioBlockBase {
  kind: 'adjust_value';
  target: CharacterCreationBindingTarget;
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'set';
  valueFormula: string;
}

export interface CharacterCreationElseIfBranchDefinition {
  id: string;
  label: string;
  condition: string;
  blocks: CharacterCreationScenarioBlockDefinition[];
}

export interface CharacterCreationRollBlock extends CharacterCreationScenarioBlockBase {
  kind: 'roll';
  prompt: string;
  target: CharacterCreationBindingTarget;
  diceFormula: string;
  allowReroll?: boolean;
}

export interface CharacterCreationIfBlock extends CharacterCreationScenarioBlockBase {
  kind: 'if';
  condition: string;
  thenBlocks: CharacterCreationScenarioBlockDefinition[];
  elseIfBranches?: CharacterCreationElseIfBranchDefinition[];
  elseBlocks: CharacterCreationScenarioBlockDefinition[];
}

export interface CharacterCreationLoopBlock extends CharacterCreationScenarioBlockBase {
  kind: 'loop';
  iterationsFormula: string;
  blocks: CharacterCreationScenarioBlockDefinition[];
}

export interface CharacterCreationWhileBlock extends CharacterCreationScenarioBlockBase {
  kind: 'while';
  condition: string;
  maxIterationsFormula?: string;
  blocks: CharacterCreationScenarioBlockDefinition[];
}

export interface CharacterCreationNextStageBlock extends CharacterCreationScenarioBlockBase {
  kind: 'next_stage';
  reason?: string;
}

export interface CharacterCreationStopBlock extends CharacterCreationScenarioBlockBase {
  kind: 'stop';
  reason?: string;
}

export type CharacterCreationScenarioBlockDefinition =
  | CharacterCreationGroupBlock
  | CharacterCreationMessageBlock
  | CharacterCreationQuestionTextBlock
  | CharacterCreationQuestionChoiceBlock
  | CharacterCreationQuestionCatalogBlock
  | CharacterCreationAllocationBlock
  | CharacterCreationSetValueBlock
  | CharacterCreationCopyValueBlock
  | CharacterCreationAdjustValueBlock
  | CharacterCreationRollBlock
  | CharacterCreationIfBlock
  | CharacterCreationLoopBlock
  | CharacterCreationWhileBlock
  | CharacterCreationNextStageBlock
  | CharacterCreationStopBlock;

export interface CharacterCreationStageDefinition {
  id: string;
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
  entryCondition?: string;
  completionCondition?: string;
  blocks: CharacterCreationScenarioBlockDefinition[];
}

export interface CharacterCreationConfigV2 {
  version: 2;
  enabled: boolean;
  pools: CharacterCreationPoolDefinition[];
  variables: CharacterCreationVariableDefinition[];
  stages: CharacterCreationStageDefinition[];
}

export type CharacterCreationConfig = LegacyCharacterCreationConfig | CharacterCreationConfigV2;

export interface SystemDiscordOutputDefinition {
  key: SystemDiscordOutputKey;
  label: string;
  description?: string;
  enabled: boolean;
  commandName?: string;
  format: SystemDiscordOutputFormat;
  defaultVisibility: SystemDiscordVisibility;
  allowedVisibilities: SystemDiscordVisibility[];
  sourceType: SystemDiscordOutputSourceType;
  sourceRef?: string;
  template: string;
  itemTemplate?: string;
  emptyTemplate?: string;
  maxItems?: number | null;
}

export interface SystemDiscordConfig {
  version: 1;
  outputs: SystemDiscordOutputDefinition[];
}

export interface SystemCatalogColumnDefinition {
  id: string;
  key: string;
  label: string;
  type: SystemCatalogColumnType;
  options?: string[];
}

export interface SystemCatalogEntryDefinition {
  id: string;
  values: Record<string, string | number | boolean>;
}

export interface SystemCatalogDefinition {
  id: string;
  key: string;
  label: string;
  columns: SystemCatalogColumnDefinition[];
  entries: SystemCatalogEntryDefinition[];
}

export type SystemStudioNodeType =
  | 'container'
  | 'tabs'
  | 'static_text'
  | 'static_image'
  | 'text'
  | 'textarea'
  | 'date'
  | 'time'
  | 'number'
  | 'checkbox'
  | 'image'
  | 'select'
  | 'multiselect'
  | 'progress'
  | 'button'
  | 'subview';

export type SystemStudioRepeatMode = 'none' | 'manual' | 'binding' | 'fields';
export type SystemStudioFieldLayout = 'ligne' | 'colonne' | 'texte_cache';
export type SystemStudioRepeatFlow = 'horizontal' | 'vertical';

export interface SystemStudioNodeLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface SystemStudioTabDefinition {
  id: string;
  label: string;
  viewId: string;
  visibleIf?: string;
}

export interface SystemStudioRepeatConfig {
  mode: SystemStudioRepeatMode;
  source?: string;
  manualItemsText?: string;
  fieldItemsText?: string;
  filter?: string;
  flow?: SystemStudioRepeatFlow;
  itemWidth?: number | null;
  itemHeight?: number | null;
  gapX?: number | null;
  gapY?: number | null;
  showItemHeader?: boolean;
  itemLabelTemplate?: string;
}

export interface StudioThemeDefinition {
  backgroundColor?: string;
  inputBackgroundColor?: string;
  inputTextColor?: string;
  inputBorderColor?: string;
  textColor?: string;
  fieldLabelStyleMode?: StudioFieldLabelStyleMode;
  fieldLabelTextColor?: string;
  fieldLabelTypographyFamily?: StudioTypographyFamily;
  fieldLabelTypographySize?: StudioTypographySize;
  fieldLabelTypographyBold?: boolean;
  fieldLabelTypographyItalic?: boolean;
  borderColor?: string;
  backgroundImage?: string;
  backgroundOpacity?: number | null;
  backgroundSize?: StudioBackgroundSize;
  backgroundPosition?: StudioBackgroundPosition;
  backgroundRepeat?: StudioBackgroundRepeat;
}

export interface SystemStudioNodeDefinition {
  id: string;
  type: SystemStudioNodeType;
  label: string;
  key: string;
  layout: SystemStudioNodeLayout;
  zIndex?: number;
  groupId?: string;
  parentId?: string | null;
  slotKey?: string | null;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
  minFormula?: string;
  maxFormula?: string;
  step?: number;
  required?: boolean;
  showIf?: string;
  validationPattern?: string;
  validationMessage?: string;
  reference?: string;
  formula?: string;
  hideBorder?: boolean;
  backgroundColor?: string;
  inputBackgroundColor?: string;
  inputTextColor?: string;
  inputBorderColor?: string;
  borderColor?: string;
  textColor?: string;
  backgroundImage?: string;
  backgroundOpacity?: number | null;
  backgroundSize?: StudioBackgroundSize;
  backgroundPosition?: StudioBackgroundPosition;
  backgroundRepeat?: StudioBackgroundRepeat;
  borderStyle?: StudioBorderType;
  horizontalAlign?: StudioAlignmentHorizontal;
  verticalAlign?: StudioAlignmentVertical;
  editableIf?: string;
  fieldLayout?: SystemStudioFieldLayout;
  fieldLabelSpan?: number | null;
  fieldInputSpan?: number | null;
  fieldLabelStyleMode?: StudioFieldLabelStyleMode;
  fieldLabelTextColor?: string;
  fieldLabelTypographyFamily?: StudioTypographyFamily;
  fieldLabelTypographySize?: StudioTypographySize;
  fieldLabelTypographyBold?: boolean;
  fieldLabelTypographyItalic?: boolean;
  defaultRowsVisible?: number | null;
  typographyFamily?: StudioTypographyFamily;
  typographyBold?: boolean;
  typographyItalic?: boolean;
  typographySize?: StudioTypographySize;
  formatDecimals?: number | null;
  formatThousands?: boolean;
  formatPrefix?: string;
  formatSuffix?: string;
  fallbackDisplay?: string;
  targetViewId?: string;
  targetViewRef?: string;
  tabOrientation?: StudioTabOrientation;
  imageFit?: 'contenir' | 'couvrir' | 'etirer' | 'taille_reelle';
  imageWidth?: string;
  imageHeight?: string;
  imageAlt?: string;
  resourceId?: string;
  selectDisplayMode?: 'texte' | 'cle';
  gaugeMaxFormula?: string;
  gaugeShowLabel?: boolean;
  gaugeShowValues?: boolean;
  gaugeShowPercentage?: boolean;
  gaugeOrientation?: StudioGaugeOrientation;
  gaugeFillColor?: string;
  gaugeTrackColor?: string;
  gaugeWidth?: string;
  gaugeHeight?: string;
  buttonAction?: StudioButtonActionType;
  buttonActionTarget?: string;
  buttonRollFormula?: string;
  buttonRollVisibility?: StudioButtonRollVisibility;
  buttonCatalogKey?: string;
  buttonTargetCollectionKey?: string;
  buttonActiveIf?: string;
  buttonContentMode?: StudioButtonContentMode;
  buttonIcon?: string;
  valueAllowsEmpty?: boolean;
  maxLength?: number | null;
  dateFormat?: 'jour/mois/annee' | 'annee-mois-jour' | 'jour mois texte annee';
  timeFormat?: '24h' | '12h';
  showTitle?: boolean;
  showBorder?: boolean;
  tabs?: SystemStudioTabDefinition[];
  repeat?: SystemStudioRepeatConfig;
  checkboxLabel?: string;
  checkboxShape?: StudioCheckboxShape;
  checkboxActiveStyle?: StudioCheckboxActiveStyle;
}

export interface SystemStudioViewDefinitionV2 {
  id: string;
  name: string;
  reference: string;
  description?: string;
  gridColumns: 12 | 24 | 36 | 48;
  visibleInSelectors?: boolean;
  isDefaultForPlayer?: boolean;
  isCharacterSheet?: boolean;
  characterSheetKind?: CharacterSheetKind;
  defaultSheetNameTemplate?: string;
  initiativeMode?: CharacterInitiativeMode;
  initiativeFormula?: string | null;
  theme?: StudioThemeDefinition;
  nodes: SystemStudioNodeDefinition[];
}

export interface SystemStudioSchemaV2 {
  version: 2;
  views: SystemStudioViewDefinitionV2[];
}

export interface SystemAuditEntry {
  id: string;
  at: string;
  byUserId: string;
  action: string;
  summary: string;
}

export interface GameSystem {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  ownerUserId: string;
  status: GameSystemStatus;
  visibility: GameSystemVisibility;
  viewerUserIds?: string[];
  editorUserIds?: string[];
  forkedFromSystemId?: string;
  forkedFromSystemName?: string;
  tags?: string[];
  rollDefinitions?: SystemRollDefinition[];
  rulesProgram?: RulesProgramBlock[];
  rulesPresentation?: RulesPresentation;
  studioTheme?: StudioThemeDefinition;
  studioSchemaV2?: SystemStudioSchemaV2;
  catalogs?: SystemCatalogDefinition[];
  discordConfig?: SystemDiscordConfig;
  characterCreationConfig?: CharacterCreationConfig;
  auditTrail?: SystemAuditEntry[];
  deletedAt?: string;
  retainedForSessions?: boolean;
  createdAt: string;
  updatedAt: string;
}
