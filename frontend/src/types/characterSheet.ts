export interface SheetField {
  id: string;
  label: string;
  type: 'number' | 'text' | 'textarea' | 'select' | 'multiselect' | 'resource' | 'tag';
  value: number | string;
  max?: number;
  groupId: string;
  isPrimary?: boolean;
  options?: Array<{ key: string; label: string }>;
  rows?: number;
}

export interface SheetGroup {
  id: string;
  label: string;
  layout?: 'grid' | 'list';
}

export interface SheetRollConfig {
  sourceBlockId?: string;
  diceCount: number;
  diceSides: number;
  modifierFieldId?: string;
  flatModifier?: number;
}

export interface SheetAction {
  id: string;
  label: string;
  description?: string;
  rollFormula?: string;
  rollConfig?: SheetRollConfig;
}

export interface CharacterSheetView {
  id: string;
  name: string;
  portraitUrl?: string;
  groups: SheetGroup[];
  fields: SheetField[];
  actions?: SheetAction[];
}
