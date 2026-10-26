type TokenMoveCallback = (tokenId: string, x: number, y: number) => void;

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
