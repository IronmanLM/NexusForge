import type { ScreenFormatPreset, ScreenOrientation } from '../features/screens/screenSetPresets';
export type ScreenTemplateScopeType = 'account' | 'system';
export type ScreenTemplateVisibility = 'private' | 'public' | 'friends';
export type ScreenTemplateRoleTarget = 'player' | 'gm' | 'both';
export type ScreenSetDevicePreset = 'desktop_1' | 'desktop_2' | 'desktop_3' | 'tablet' | 'mobile';
export type ScreenGridColumns = 12 | 24 | 36 | 48;
export type ScreenMode = 'main' | 'detached';
export type ScreenWidgetType =
  | 'character_sheet'
  | 'chat'
  | 'clock'
  | 'alert_overlay'
  | 'participant_presence'
  | 'open_target_overlay'
  | 'open_target_control'
  | 'pdf_viewer'
  | 'documents'
  | 'media_viewer'
  | 'notes'
  | 'character_list'
  | 'dice_history'
  | 'initiative'
  | 'session_journal';

export interface ScreenWidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface ScreenWidgetDefinition {
  id: string;
  type: ScreenWidgetType;
  title: string;
  layout: ScreenWidgetLayout;
  config?: Record<string, unknown>;
  dataSource?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  isVisible?: boolean;
}

export interface ScreenRuntimeTargetAudience {
  userId?: string | null;
  role?: 'gm' | 'player' | null;
}

export interface ScreenTabGroupDefinition {
  id: string;
  name: string;
  isDefault?: boolean;
  widgets: ScreenWidgetDefinition[];
}

export interface ScreenDefinition {
  id: string;
  name: string;
  mode: ScreenMode;
  order: number;
  screenFormatPreset?: ScreenFormatPreset;
  aspectRatio?: string;
  orientation?: ScreenOrientation;
  referenceWidth?: number;
  referenceHeight?: number;
  tabGroups: ScreenTabGroupDefinition[];
}

export interface ScreenSetDefinition {
  id: string;
  name: string;
  devicePreset: ScreenSetDevicePreset;
  screenFormatPreset?: ScreenFormatPreset;
  aspectRatio?: string;
  orientation?: ScreenOrientation;
  referenceWidth?: number;
  referenceHeight?: number;
  gridColumns: ScreenGridColumns;
  zoom?: number;
  screens: ScreenDefinition[];
}

export interface ScreenTemplate {
  id: string;
  name: string;
  description?: string;
  scopeType: ScreenTemplateScopeType;
  scopeRefId?: string | null;
  roleTarget: ScreenTemplateRoleTarget;
  visibility: ScreenTemplateVisibility;
  isFavorite?: boolean;
  sourceTemplateId?: string | null;
  createdBy: string;
  updatedBy?: string;
  sets: ScreenSetDefinition[];
  createdAt: string;
  updatedAt: string;
}
