import { CharacterSheetView } from './characterSheet';

export interface Character {
  id: string;
  systemId: string;
  viewId: string;
  sessionId?: string | null;
  name: string;
  type?: 'pc' | 'npc' | 'monster' | 'other';
  ownerUserId?: string | null;
  createdFromViewId?: string | null;
  sourceCharacterId?: string | null;
  isPreGeneratedClone?: boolean;
  initiativeMode?: 'combat_once' | 'round_recalc' | 'gm_fixed' | 'manual_turn' | null;
  initiativeFormula?: string | null;
  attributes?: Record<string, number | string | boolean | null>;
  sheet?: CharacterSheetView;
  runtimeValues?: Record<string, unknown>;
}
