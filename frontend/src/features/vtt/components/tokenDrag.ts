type TokenMoveCallback = (tokenId: string, x: number, y: number) => void;

type TokenDragPermissionParams = {
  viewMode: 'gm' | 'player';
  currentUserId: string | null;
  playersCanMoveOwnTokens: boolean;
  token: { ownerUserId: string | null; locked: boolean };
};

export function canDragVttToken({ viewMode, currentUserId, playersCanMoveOwnTokens, token }: TokenDragPermissionParams): boolean {
  if (token.locked) {
    return false;
  }
  if (viewMode === 'gm') {
    return true;
  }
  return playersCanMoveOwnTokens && Boolean(currentUserId) && token.ownerUserId === currentUserId;
}

export function commitTokenDrag(params: {
  isDragging: boolean;
  tokenId: string;
  x: number;
  y: number;
  onMove?: TokenMoveCallback;
}): boolean {
  if (!params.isDragging) {
    return false;
  }
  params.onMove?.(params.tokenId, Math.round(params.x), Math.round(params.y));
  return true;
}
