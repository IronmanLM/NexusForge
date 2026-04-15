import { User } from './user';

export type SocialUser = Pick<User, 'id' | 'displayName' | 'nickname' | 'roles'> & {
  avatarUrl?: string | null;
  isFriend: boolean;
  isIgnored: boolean;
  hasIncomingFriendRequest: boolean;
  hasOutgoingFriendRequest: boolean;
};

export type SocialRelationSummary = {
  friends: SocialUser[];
  incomingRequests: Array<{ id: string; user: SocialUser | null; createdAt: string }>;
  outgoingRequests: Array<{ id: string; user: SocialUser | null; createdAt: string }>;
  ignored: Array<{ id: string; user: SocialUser | null; createdAt: string }>;
};

export type DirectConversationSummary = {
  otherUserId: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  user: SocialUser;
};

export type DirectMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
};

export type SocialReport = {
  id: string;
  targetUserId: string;
  targetDisplayName: string;
  reportedByUserId: string;
  reportedByDisplayName: string;
  reason: string;
  details: string;
  status: 'open' | 'reviewing' | 'closed' | string;
  createdAt: string;
  updatedAt: string;
};
