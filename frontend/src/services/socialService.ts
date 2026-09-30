import { requestJson } from './apiClient';
import { DirectConversationSummary, DirectMessage, SocialRelationSummary, SocialReport, SocialUser } from '../types/social';

export async function searchSocialUsersService(query: string): Promise<SocialUser[]> {
  const payload = await requestJson<{ items: SocialUser[] }>({
    path: `/api/social/users${query ? `?q=${encodeURIComponent(query)}` : ''}`,
    method: 'GET',
    withAuth: true
  });
  return payload.items ?? [];
}

export async function getSocialUserByIdService(userId: string): Promise<SocialUser> {
  const payload = await requestJson<{ item: SocialUser }>({
    path: `/api/social/users/${encodeURIComponent(userId)}`,
    method: 'GET',
    withAuth: true
  });
  return payload.item;
}

export async function loadSocialRelationsService(): Promise<SocialRelationSummary> {
  return requestJson<SocialRelationSummary>({
    path: '/api/social/relations',
    method: 'GET',
    withAuth: true
  });
}

export async function sendFriendRequestService(targetUserId: string): Promise<void> {
  await requestJson<{ status: string }>({
    path: '/api/social/friend-requests',
    method: 'POST',
    withAuth: true,
    body: { targetUserId }
  });
}

export async function acceptFriendRequestService(requestId: string): Promise<void> {
  await requestJson<{ status: string }>({
    path: `/api/social/friend-requests/${requestId}/accept`,
    method: 'POST',
    withAuth: true
  });
}

export async function deleteFriendRequestService(requestId: string): Promise<void> {
  await requestJson<void>({
    path: `/api/social/friend-requests/${requestId}`,
    method: 'DELETE',
    withAuth: true
  });
}

export async function ignoreUserService(targetUserId: string): Promise<void> {
  await requestJson<{ status: string }>({
    path: '/api/social/ignore',
    method: 'POST',
    withAuth: true,
    body: { targetUserId }
  });
}

export async function unignoreUserService(targetUserId: string): Promise<void> {
  await requestJson<void>({
    path: `/api/social/ignore/${targetUserId}`,
    method: 'DELETE',
    withAuth: true
  });
}

export async function createSocialReportService(params: {
  targetUserId: string;
  reason: string;
  details: string;
}): Promise<void> {
  await requestJson<{ item: SocialReport }>({
    path: '/api/social/reports',
    method: 'POST',
    withAuth: true,
    body: params
  });
}

export async function listAdminSocialReportsService(): Promise<SocialReport[]> {
  const payload = await requestJson<{ items: SocialReport[] }>({
    path: '/api/admin/social/reports',
    method: 'GET',
    withAuth: true
  });
  return payload.items ?? [];
}

export async function updateAdminSocialReportStatusService(reportId: string, status: 'open' | 'reviewing' | 'closed'): Promise<SocialReport> {
  const payload = await requestJson<{ item: SocialReport }>({
    path: `/api/admin/social/reports/${reportId}`,
    method: 'PATCH',
    withAuth: true,
    body: { status }
  });
  return payload.item;
}

export async function listDirectConversationsService(): Promise<DirectConversationSummary[]> {
  const payload = await requestJson<{ items: DirectConversationSummary[] }>({
    path: '/api/social/conversations',
    method: 'GET',
    withAuth: true
  });
  return payload.items ?? [];
}

export async function listDirectMessagesService(otherUserId: string): Promise<DirectMessage[]> {
  const payload = await requestJson<{ items: DirectMessage[] }>({
    path: `/api/social/conversations/${otherUserId}/messages`,
    method: 'GET',
    withAuth: true
  });
  return payload.items ?? [];
}

export async function sendDirectMessageService(otherUserId: string, content: string): Promise<DirectMessage> {
  const payload = await requestJson<{ item: DirectMessage }>({
    path: `/api/social/conversations/${otherUserId}/messages`,
    method: 'POST',
    withAuth: true,
    body: { content }
  });
  return payload.item;
}
