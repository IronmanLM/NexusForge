import { describe, expect, it, vi } from 'vitest';
import { commitTokenDrag } from './tokenDrag';

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
