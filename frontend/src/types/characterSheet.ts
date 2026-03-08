export interface SheetField {
  id: string;
  label: string;
  type: 'number' | 'text' | 'resource' | 'tag';
  value: number | string;
  max?: number;
  groupId: string;
  isPrimary?: boolean;
}

export interface SheetGroup {
  id: string;
  label: string;
  layout?: 'grid' | 'list';
}

export interface SheetAction {
  id: string;
  label: string;
  description?: string;
  rollFormula?: string;
}

export interface CharacterSheetView {
  id: string;
  name: string;
  portraitUrl?: string;
  groups: SheetGroup[];
  fields: SheetField[];
  actions?: SheetAction[];
}
