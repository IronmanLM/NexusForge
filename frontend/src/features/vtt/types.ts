export type VttGridType = 'square' | 'hex';
export type VttFogShapeType = 'rectangle' | 'polygon';
export type VttFogShapeMode = 'reveal' | 'hide';

export interface VttPoint {
  x: number;
  y: number;
}

export interface VttGridConfig {
  enabled: boolean;
  type: VttGridType;
  size: number;
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
}

export interface VttFogShape {
  id: string;
  type: VttFogShapeType;
  mode: VttFogShapeMode;
  points: VttPoint[];
}

export interface VttPing {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

export interface VttToken {
  id: string;
  name: string;
  characterId: string | null;
  imageResourceId: string | null;
  imageUrl: string | null;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  ownerUserId: string | null;
  visibleToPlayers: boolean;
  locked: boolean;
}

export interface VttScene {
  id: string;
  name: string;
  mapResourceId: string | null;
  mapImageUrl: string | null;
  mapWidth: number;
  mapHeight: number;
  grid: VttGridConfig;
  fog: {
    enabled: boolean;
    mode: 'hidden-by-default' | 'visible-by-default';
    shapes: VttFogShape[];
  };
  tokens: VttToken[];
  pings: VttPing[];
  permissions: {
    playersCanMoveOwnTokens: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface VttState {
  scenes: VttScene[];
  activeSceneId: string | null;
  updatedAt: string;
}

export type VttViewMode = 'gm' | 'player';
