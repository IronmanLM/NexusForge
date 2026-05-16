import { User } from '../types/user';
import {
  ApiError,
  clearStoredTokens,
  getAccessToken,
  getRefreshToken,
  persistTokens,
  requestJson
} from './apiClient';

const CURRENT_USER_STORAGE_KEY = 'nexusforge.auth.currentUser';

type AuthLoginSuccessResponse = {
  token: string;
  refreshToken?: string;
  user: User;
};

type AuthLoginTwoFactorResponse = {
  requiresTwoFactor: true;
  challengeToken: string;
  methods: string[];
};

type AuthMeResponse = {
  user: User;
};

type DiscordLinkStartResponse = {
  authorizationUrl: string;
  state: string;
  redirectUri: string;
};

export type AdminAuditEvent = {
  id: string;
  at: string;
  actorUserId: string;
  action: string;
  targetUserId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
};

export type LoginResult =
  | {
      status: 'authenticated';
      user: User;
    }
  | {
      status: 'requires_2fa';
      challengeToken: string;
      methods: string[];
    };

function getApiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  const payload = error.payload as { error?: { code?: string } } | null;
  return payload?.error?.code ?? null;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  return error.message || fallback;
}

function persistCurrentUserCache(user: User): void {
  localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

function loadCachedCurrentUser(): User | null {
  const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as User;
  } catch {
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    return null;
  }
}

export function getCachedCurrentUser(): User | null {
  return loadCachedCurrentUser();
}

function clearCurrentUserCache(): void {
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

async function refreshCurrentUserFromStoredToken(): Promise<User | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearStoredTokens();
    clearCurrentUserCache();
    return null;
  }

  try {
    const refresh = await requestJson<{ token: string; refreshToken?: string }>({
      path: '/api/auth/refresh',
      method: 'POST',
      withAuth: false,
      body: { refreshToken }
    });
    persistTokens({ accessToken: refresh.token, refreshToken: refresh.refreshToken ?? refreshToken });
    const retried = await requestJson<AuthMeResponse>({ path: '/api/auth/me', method: 'GET', withAuth: true });
    persistCurrentUserCache(retried.user);
    return retried.user;
  } catch (refreshError) {
    if (refreshError instanceof ApiError && (refreshError.status === 401 || refreshError.status === 403)) {
      clearStoredTokens();
      clearCurrentUserCache();
      return null;
    }
    return loadCachedCurrentUser();
  }
}

export async function loginService(params: {
  email: string;
  password: string;
  totpCode?: string;
  challengeToken?: string;
}): Promise<LoginResult> {
  const payload = await requestJson<AuthLoginSuccessResponse | AuthLoginTwoFactorResponse>({
    path: '/api/auth/login',
    method: 'POST',
    withAuth: false,
    body: {
      email: params.email,
      password: params.password,
      ...(params.totpCode ? { totpCode: params.totpCode } : {}),
      ...(params.challengeToken ? { challengeToken: params.challengeToken } : {})
    }
  });

  if ('requiresTwoFactor' in payload && payload.requiresTwoFactor) {
    return {
      status: 'requires_2fa',
      challengeToken: payload.challengeToken,
      methods: payload.methods
    };
  }

  if (!('token' in payload)) {
    throw new Error('Réponse de login invalide.');
  }

  persistTokens({ accessToken: payload.token, refreshToken: payload.refreshToken ?? null });
  persistCurrentUserCache(payload.user);
  return {
    status: 'authenticated',
    user: payload.user
  };
}

export async function loadCurrentUserService(): Promise<User | null> {
  const token = getAccessToken();
  if (!token) {
    return refreshCurrentUserFromStoredToken();
  }

  try {
    const payload = await requestJson<AuthMeResponse>({
      path: '/api/auth/me',
      method: 'GET',
      withAuth: true
    });
    persistCurrentUserCache(payload.user);
    return payload.user;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return refreshCurrentUserFromStoredToken();
    }

    return loadCachedCurrentUser();
  }
}

export async function logoutService(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    await requestJson<void>({
      path: '/api/auth/logout',
      method: 'POST',
      withAuth: true,
      body: refreshToken ? { refreshToken } : {}
    });
  } catch {
    // noop: always clear local auth state.
  }

  clearStoredTokens();
  clearCurrentUserCache();
}

export async function startDiscordLinkService(): Promise<DiscordLinkStartResponse> {
  return requestJson<DiscordLinkStartResponse>({
    path: '/api/auth/discord/link/start',
    method: 'POST',
    withAuth: true,
    body: {}
  });
}

export async function completeDiscordLinkService(params: { code: string; state: string }): Promise<User> {
  const payload = await requestJson<{ user: User }>({
    path: '/api/auth/discord/link/callback',
    method: 'POST',
    withAuth: true,
    body: params
  });
  persistCurrentUserCache(payload.user);
  return payload.user;
}

export async function unlinkDiscordService(): Promise<User> {
  const payload = await requestJson<{ user: User }>({
    path: '/api/auth/discord/link',
    method: 'DELETE',
    withAuth: true
  });
  persistCurrentUserCache(payload.user);
  return payload.user;
}

export async function registerService(params: {
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
  password: string;
}): Promise<{ status: string; message: string }> {
  return requestJson<{ status: string; message: string }>({
    path: '/api/auth/register',
    method: 'POST',
    withAuth: false,
    body: params
  });
}

export async function verifyEmailService(token: string): Promise<{ status: string; approvalStatus: string }> {
  return requestJson<{ status: string; approvalStatus: string }>({
    path: '/api/auth/verify-email',
    method: 'POST',
    withAuth: false,
    body: { token }
  });
}

export async function resendVerificationService(email: string): Promise<void> {
  await requestJson<{ status: string }>({
    path: '/api/auth/resend-verification',
    method: 'POST',
    withAuth: false,
    body: { email }
  });
}

export async function forgotPasswordService(email: string): Promise<void> {
  await requestJson<{ status: string; message: string }>({
    path: '/api/auth/forgot-password',
    method: 'POST',
    withAuth: false,
    body: { email }
  });
}

export async function resetPasswordService(token: string, password: string): Promise<void> {
  await requestJson<{ status: string }>({
    path: '/api/auth/reset-password',
    method: 'POST',
    withAuth: false,
    body: { token, password }
  });
}

export async function changePasswordService(currentPassword: string, newPassword: string): Promise<void> {
  await requestJson<{ status: string }>({
    path: '/api/auth/change-password',
    method: 'POST',
    withAuth: true,
    body: { currentPassword, newPassword }
  });
}

export async function setupTotpService(): Promise<{ secret: string; otpauthUrl: string; recommended: boolean }> {
  return requestJson<{ secret: string; otpauthUrl: string; recommended: boolean }>({
    path: '/api/auth/totp/setup',
    method: 'POST',
    withAuth: true,
    body: {}
  });
}

export async function enableTotpService(code: string): Promise<void> {
  await requestJson<{ status: string }>({
    path: '/api/auth/totp/enable',
    method: 'POST',
    withAuth: true,
    body: { code }
  });
}

export async function disableTotpService(code: string): Promise<void> {
  await requestJson<{ status: string }>({
    path: '/api/auth/totp/disable',
    method: 'POST',
    withAuth: true,
    body: { code }
  });
}

export async function updateProfileService(params: {
  firstName: string;
  lastName: string;
  nickname: string;
  avatarResourceId?: string | null;
  avatarUrl?: string | null;
}): Promise<User> {
  const payload = await requestJson<{ user: User }>({
    path: '/api/auth/me',
    method: 'PATCH',
    withAuth: true,
    body: params
  });
  persistCurrentUserCache(payload.user);
  return payload.user;
}

export async function listPendingUsersService(): Promise<User[]> {
  const payload = await requestJson<{ items: User[] }>({
    path: '/api/admin/users/pending',
    method: 'GET',
    withAuth: true
  });
  return payload.items;
}

export async function approveUserService(userId: string, roles: string[]): Promise<User> {
  const payload = await requestJson<{ user: User }>({
    path: `/api/admin/users/${userId}/approve`,
    method: 'POST',
    withAuth: true,
    body: { roles }
  });
  return payload.user;
}

export async function listAdminUsersService(): Promise<User[]> {
  const payload = await requestJson<{ items: User[] }>({
    path: '/api/admin/users',
    method: 'GET',
    withAuth: true
  });
  return payload.items;
}

export async function updateAdminUserService(
  userId: string,
  params: {
    roles?: string[];
    isActive?: boolean;
  }
): Promise<User> {
  const payload = await requestJson<{ user: User }>({
    path: `/api/admin/users/${userId}`,
    method: 'PATCH',
    withAuth: true,
    body: params
  });
  return payload.user;
}

export async function unlockAdminUserService(userId: string): Promise<User> {
  const payload = await requestJson<{ user: User }>({
    path: `/api/admin/users/${userId}/unlock`,
    method: 'POST',
    withAuth: true
  });
  return payload.user;
}

export async function resetAdminUserPasswordService(userId: string, nextPassword: string): Promise<User> {
  const payload = await requestJson<{ user: User }>({
    path: `/api/admin/users/${userId}/reset-password`,
    method: 'POST',
    withAuth: true,
    body: { nextPassword }
  });
  return payload.user;
}

export async function deleteAdminUserService(
  userId: string,
  params: {
    replacementUserId?: string;
  }
): Promise<{
  status: string;
  userId: string;
  replacementUserId: string;
  migratedSystemsCount: number;
  migratedSessionsCount: number;
  migratedCharactersCount: number;
}> {
  return requestJson<{
    status: string;
    userId: string;
    replacementUserId: string;
    migratedSystemsCount: number;
    migratedSessionsCount: number;
    migratedCharactersCount: number;
  }>({
    path: `/api/admin/users/${userId}`,
    method: 'DELETE',
    withAuth: true,
    body: params
  });
}

export async function listAdminAuditEventsService(limit = 200): Promise<AdminAuditEvent[]> {
  const payload = await requestJson<{ items: AdminAuditEvent[] }>({
    path: `/api/admin/audit/events?limit=${encodeURIComponent(String(limit))}`,
    method: 'GET',
    withAuth: true
  });
  return payload.items;
}

export function mapAuthErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error);

  if (code === 'EMAIL_NOT_VERIFIED') {
    return 'Adresse email non validée. Vérifie ta boîte mail.';
  }
  if (code === 'ACCOUNT_PENDING_APPROVAL') {
    return 'Compte en attente de validation par un admin.';
  }
  if (code === 'ACCOUNT_LOCKED') {
    return 'Compte temporairement verrouillé après plusieurs échecs.';
  }
  if (code === 'ACCOUNT_DISABLED') {
    return 'Compte désactivé. Contacte un administrateur.';
  }
  if (code === 'CANNOT_DELETE_SELF') {
    return 'Tu ne peux pas supprimer ton propre compte admin.';
  }
  if (code === 'INVALID_2FA_CODE') {
    return 'Code 2FA invalide.';
  }
  if (code === 'NICKNAME_ALREADY_TAKEN') {
    return 'Ce surnom est déjà utilisé.';
  }
  if (code === 'INVALID_NICKNAME') {
    return 'Le surnom doit contenir uniquement lettres, chiffres ou underscore.';
  }
  if (code === 'INVALID_PROFILE_PAYLOAD') {
    return 'Prénom, nom et surnom sont requis.';
  }
  if (code === 'DISCORD_OAUTH_NOT_CONFIGURED') {
    return 'La liaison Discord n’est pas encore configurée côté serveur.';
  }
  if (code === 'DISCORD_OAUTH_INVALID_STATE') {
    return 'Le retour Discord a expiré ou n’est plus valide. Relance la liaison.';
  }
  if (code === 'DISCORD_OAUTH_EXCHANGE_FAILED') {
    return 'Discord a refusé l’échange OAuth2. Vérifie la configuration du portail Discord.';
  }
  if (code === 'DISCORD_ALREADY_LINKED') {
    return 'Ce compte Discord est déjà lié à un autre compte Nexus Forge.';
  }

  return getApiErrorMessage(error, 'Action impossible.');
}
