import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../types/user';

const apiMocks = vi.hoisted(() => ({
  clearStoredTokens: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  persistTokens: vi.fn(),
  refreshStoredTokens: vi.fn(),
  requestJson: vi.fn()
}));

vi.mock('./apiClient', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    payload: unknown;

    constructor(message: string, status: number, payload: unknown) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  },
  ...apiMocks
}));

import { getCachedCurrentUser, loginService, logoutService } from './authService';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const user: User = {
  id: 'user-test',
  email: 'player@example.test',
  displayName: 'Player',
  roles: ['player'],
  createdAt: '2026-01-01T00:00:00.000Z'
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('loginService', () => {
  it('persists tokens and the authenticated user', async () => {
    apiMocks.requestJson.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
      user
    });

    const result = await loginService({ email: user.email, password: 'strong-password-123' });

    expect(apiMocks.requestJson).toHaveBeenCalledWith({
      path: '/api/auth/login',
      method: 'POST',
      withAuth: false,
      body: {
        email: user.email,
        password: 'strong-password-123'
      }
    });
    expect(apiMocks.persistTokens).toHaveBeenCalledWith({
      accessToken: 'access-token',
      refreshToken: 'refresh-token'
    });
    expect(result).toEqual({ status: 'authenticated', user });
    expect(getCachedCurrentUser()).toEqual(user);
  });

  it('returns a two-factor challenge without persisting a session', async () => {
    apiMocks.requestJson.mockResolvedValue({
      requiresTwoFactor: true,
      challengeToken: 'challenge-token',
      methods: ['totp']
    });

    const result = await loginService({ email: user.email, password: 'strong-password-123' });

    expect(result).toEqual({
      status: 'requires_2fa',
      challengeToken: 'challenge-token',
      methods: ['totp']
    });
    expect(apiMocks.persistTokens).not.toHaveBeenCalled();
    expect(getCachedCurrentUser()).toBeNull();
  });
});

describe('logoutService', () => {
  it('clears local authentication even when the API request fails', async () => {
    localStorage.setItem('nexusforge.auth.currentUser', JSON.stringify(user));
    apiMocks.getRefreshToken.mockReturnValue('refresh-token');
    apiMocks.requestJson.mockRejectedValue(new Error('network unavailable'));

    await logoutService();

    expect(apiMocks.clearStoredTokens).toHaveBeenCalledOnce();
    expect(getCachedCurrentUser()).toBeNull();
  });
});
