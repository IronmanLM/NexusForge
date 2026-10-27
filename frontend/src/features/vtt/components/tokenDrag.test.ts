import { describe, expect, it, vi } from 'vitest';
import { canDragVttToken, commitTokenDrag } from './tokenDrag';

describe('canDragVttToken', () => {
  const playerToken = { ownerUserId: 'player-1', locked: false };

  it('allows an assigned player to drag their token only when the GM enables it', () => {
    expect(canDragVttToken({ viewMode: 'player', currentUserId: 'player-1', playersCanMoveOwnTokens: true, token: playerToken })).toBe(true);
    expect(canDragVttToken({ viewMode: 'player', currentUserId: 'player-1', playersCanMoveOwnTokens: false, token: playerToken })).toBe(false);
  });

  it('does not allow a player to drag another player token or a locked token', () => {
    expect(canDragVttToken({ viewMode: 'player', currentUserId: 'player-2', playersCanMoveOwnTokens: true, token: playerToken })).toBe(false);
    expect(canDragVttToken({ viewMode: 'player', currentUserId: 'player-1', playersCanMoveOwnTokens: true, token: { ...playerToken, locked: true } })).toBe(false);
  });

  it('allows the GM to drag unlocked tokens regardless of the player permission', () => {
    expect(canDragVttToken({ viewMode: 'gm', currentUserId: 'gm-1', playersCanMoveOwnTokens: false, token: playerToken })).toBe(true);
  });
});


describe('commitTokenDrag', () => {
  it('persists the final rounded position when a drag ends', () => {
    const onMove = vi.fn();

    const committed = commitTokenDrag({
      isDragging: true,
      tokenId: 'token-1',
      x: 123.6,
      y: 456.4,
      onMove
    });

    expect(committed).toBe(true);
    expect(onMove).toHaveBeenCalledWith('token-1', 124, 456);
  });

  it('does not persist a position when no drag was active', () => {
    const onMove = vi.fn();

    const committed = commitTokenDrag({
      isDragging: false,
      tokenId: 'token-1',
      x: 123,
      y: 456,
      onMove
    });

    expect(committed).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
  });
});
