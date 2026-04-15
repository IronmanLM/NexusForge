const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

const ACCESS_TOKEN_STORAGE_KEY = 'nexusforge.auth.accessToken';
const REFRESH_TOKEN_STORAGE_KEY = 'nexusforge.auth.refreshToken';

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
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function persistTokens(params: { accessToken: string; refreshToken?: string | null }): void {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, params.accessToken);
  if (params.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, params.refreshToken);
  }
}

export function clearStoredTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
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

  const response = await fetch(buildApiUrl(params.path), {
    method,
    headers,
    body: params.body !== undefined ? JSON.stringify(params.body) : undefined
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    const text = await response.text();
    payload = text || null;
  }

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
