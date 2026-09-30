export interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  email: string;
  displayName: string;
  roles: string[];
  isEmailVerified?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | string;
  isActive?: boolean;
  hasTotpEnabled?: boolean;
  isProtectedRootAdmin?: boolean;
  failedLoginCount?: number;
  lockoutLevel?: number;
  lockedUntil?: number | null;
  avatarUrl?: string | null;
  avatarResourceId?: string | null;
  discordAccount?: {
    id: string;
    username?: string | null;
    globalName?: string | null;
    avatarUrl?: string | null;
    linkedAt?: string | null;
  } | null;
  createdAt: string;
}
