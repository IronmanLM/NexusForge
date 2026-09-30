import { requestJson } from './apiClient';
import { DiscordReleaseEvent, HomeAnnouncement, HomeNewsItem, HomeStats } from '../types/home';

export async function listHomeNewsService(): Promise<HomeNewsItem[]> {
  const payload = await requestJson<{ items: HomeNewsItem[] }>({
    path: '/api/home/news',
    method: 'GET',
    withAuth: true
  });
  return payload.items ?? [];
}

export async function createHomeNewsService(params: {
  title: string;
  content: string;
  isPinned?: boolean;
  isPublished?: boolean;
}): Promise<HomeNewsItem> {
  const payload = await requestJson<{ item: HomeNewsItem }>({
    path: '/api/home/news',
    method: 'POST',
    withAuth: true,
    body: params
  });
  return payload.item;
}

export async function updateHomeNewsService(
  newsId: string,
  params: Partial<{
    title: string;
    content: string;
    isPinned: boolean;
    isPublished: boolean;
  }>
): Promise<HomeNewsItem> {
  const payload = await requestJson<{ item: HomeNewsItem }>({
    path: `/api/home/news/${newsId}`,
    method: 'PATCH',
    withAuth: true,
    body: params
  });
  return payload.item;
}

export async function deleteHomeNewsService(newsId: string): Promise<void> {
  await requestJson<void>({
    path: `/api/home/news/${newsId}`,
    method: 'DELETE',
    withAuth: true
  });
}

export async function publishDiscordReleaseService(params: {
  title: string;
  summary: string;
  platform?: string;
  version?: string;
  link?: string;
}): Promise<DiscordReleaseEvent> {
  const payload = await requestJson<{ event: DiscordReleaseEvent }>({
    path: '/api/admin/integrations/discord/releases',
    method: 'POST',
    withAuth: true,
    body: params
  });
  return payload.event;
}

export async function loadHomeStatsService(): Promise<HomeStats> {
  const payload = await requestJson<{ stats: HomeStats }>({
    path: '/api/home/stats',
    method: 'GET',
    withAuth: true
  });
  return payload.stats;
}

export async function listAnnouncementsService(params?: Partial<{
  type: HomeAnnouncement['type'];
  systemId: string;
  language: string;
  playMode: HomeAnnouncement['playMode'];
  status: HomeAnnouncement['status'];
  periodicity: NonNullable<HomeAnnouncement['periodicity']>;
  daysOfWeek: string[];
  timeSlots: string[];
  limit: number;
}>): Promise<HomeAnnouncement[]> {
  const search = new URLSearchParams();
  if (params?.type) search.set('type', params.type);
  if (params?.systemId) search.set('systemId', params.systemId);
  if (params?.language) search.set('language', params.language);
  if (params?.playMode) search.set('playMode', params.playMode);
  if (params?.status) search.set('status', params.status);
  if (params?.periodicity) search.set('periodicity', params.periodicity);
  if (params?.daysOfWeek?.length) search.set('daysOfWeek', params.daysOfWeek.join(','));
  if (params?.timeSlots?.length) search.set('timeSlots', params.timeSlots.join(','));
  if (params?.limit) search.set('limit', String(params.limit));
  const payload = await requestJson<{ items: HomeAnnouncement[] }>({
    path: `/api/home/announcements${search.size ? `?${search.toString()}` : ''}`,
    method: 'GET',
    withAuth: true
  });
  return payload.items ?? [];
}

export async function createAnnouncementService(params: {
  type: HomeAnnouncement['type'];
  systemId?: string | null;
  systemName?: string;
  language?: string;
  playMode?: HomeAnnouncement['playMode'];
  playerSlotsWanted?: number | null;
  daysOfWeek?: HomeAnnouncement['daysOfWeek'];
  timeSlots?: HomeAnnouncement['timeSlots'];
  periodicity?: HomeAnnouncement['periodicity'];
  status?: HomeAnnouncement['status'];
}): Promise<HomeAnnouncement> {
  const payload = await requestJson<{ item: HomeAnnouncement }>({
    path: '/api/home/announcements',
    method: 'POST',
    withAuth: true,
    body: params
  });
  return payload.item;
}

export async function updateAnnouncementService(
  announcementId: string,
  params: Partial<{
    type: HomeAnnouncement['type'];
    systemId: string | null;
    systemName: string;
    language: string;
    playMode: HomeAnnouncement['playMode'];
    playerSlotsWanted: number | null;
    daysOfWeek: HomeAnnouncement['daysOfWeek'];
    timeSlots: HomeAnnouncement['timeSlots'];
    periodicity: HomeAnnouncement['periodicity'];
    status: HomeAnnouncement['status'];
  }>
): Promise<HomeAnnouncement> {
  const payload = await requestJson<{ item: HomeAnnouncement }>({
    path: `/api/home/announcements/${announcementId}`,
    method: 'PATCH',
    withAuth: true,
    body: params
  });
  return payload.item;
}

export async function deleteAnnouncementService(announcementId: string): Promise<void> {
  await requestJson<void>({
    path: `/api/home/announcements/${announcementId}`,
    method: 'DELETE',
    withAuth: true
  });
}
