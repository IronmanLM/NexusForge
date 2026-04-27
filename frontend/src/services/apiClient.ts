const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

const ACCESS_TOKEN_STORAGE_KEY = 'nexusforge.auth.accessToken';
const REFRESH_TOKEN_STORAGE_KEY = 'nexusforge.auth.refreshToken';
const ACCESS_TOKEN_SESSION_STORAGE_KEY = 'nexusforge.auth.sessionAccessToken';
let inMemoryAccessToken: string | null = null;

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path;
}

export function buildApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const normalizedPath = normalizePath(path);
  if (!API_BASE_URL) {
    return normalizedPath;
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${normalizedPath}`;
}

export function isBackendEnabled(): boolean {
  const explicit = (import.meta.env.VITE_BACKEND_ENABLED as string | undefined)?.toLowerCase();
  if (explicit === 'true') {
    return true;
  }
  if (explicit === 'false') {
    return false;
  }
  return Boolean(API_BASE_URL);
}

export function getAccessToken(): string | null {
  if (inMemoryAccessToken) {
    return inMemoryAccessToken;
  }
  const sessionToken = window.sessionStorage.getItem(ACCESS_TOKEN_SESSION_STORAGE_KEY);
  if (sessionToken) {
    inMemoryAccessToken = sessionToken;
    return sessionToken;
  }
  const legacyLocalToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (legacyLocalToken) {
    inMemoryAccessToken = legacyLocalToken;
    window.sessionStorage.setItem(ACCESS_TOKEN_SESSION_STORAGE_KEY, legacyLocalToken);
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    return legacyLocalToken;
  }
  return null;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function persistTokens(params: { accessToken: string; refreshToken?: string | null }): void {
  inMemoryAccessToken = params.accessToken;
  window.sessionStorage.setItem(ACCESS_TOKEN_SESSION_STORAGE_KEY, params.accessToken);
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  if (params.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, params.refreshToken);
  } else if (params.refreshToken === null) {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
}

export function clearStoredTokens(): void {
  inMemoryAccessToken = null;
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(ACCESS_TOKEN_SESSION_STORAGE_KEY);
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return text || null;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearStoredTokens();
    return false;
  }

  const response = await fetch(buildApiUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  const payload = await parseResponsePayload(response);
  if (!response.ok || typeof payload !== 'object' || payload === null || !('token' in payload) || typeof (payload as { token?: unknown }).token !== 'string') {
    clearStoredTokens();
    return false;
  }

  const nextToken = (payload as { token: string; refreshToken?: string }).token;
  const nextRefreshToken = typeof (payload as { refreshToken?: unknown }).refreshToken === 'string'
    ? ((payload as { refreshToken?: string }).refreshToken ?? null)
    : refreshToken;
  persistTokens({ accessToken: nextToken, refreshToken: nextRefreshToken });
  return true;
}

export async function openProtectedUrlInNewTab(src: string): Promise<void> {
  const target = buildApiUrl(src);
  const token = getAccessToken();
  const response = await fetch(target, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      const payloadMessage =
        typeof payload === 'object' && payload !== null
          ? ((payload as { error?: { message?: string } }).error?.message ?? null)
          : null;
      if (payloadMessage) {
        message = payloadMessage;
      }
    }
    throw new ApiError(message, response.status, null);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 60_000);
}

export async function requestJson<T>(params: {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  withAuth?: boolean;
  headers?: Record<string, string>;
}): Promise<T> {
  const method = params.method ?? 'GET';
  const execute = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(params.headers ?? {})
    };

    if (params.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (params.withAuth !== false) {
      const token = getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    return fetch(buildApiUrl(params.path), {
      method,
      headers,
      body: params.body !== undefined ? JSON.stringify(params.body) : undefined
    });
  };

  let response = await execute();
  if ((response.status === 401 || response.status === 403) && params.withAuth !== false) {
    const refreshed = await refreshAccessToken().catch(() => false);
    if (refreshed) {
      response = await execute();
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    const messageFromPayload =
      typeof payload === 'object' && payload !== null
        ? ((payload as { error?: { message?: string } }).error?.message ?? null)
        : null;
    throw new ApiError(messageFromPayload ?? `HTTP ${response.status}`, response.status, payload);
  }

  return payload as T;
}

export async function apiClient<T>(mockData: T, delay = 100): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(mockData), delay);
  });
}
