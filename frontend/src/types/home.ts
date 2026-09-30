export type HomeStats = {
  runningSessions: number;
  activePlayers: number;
  activeGms: number;
  playersLookingForGame: number;
  systemsCount: number;
  approvedUsers: number;
};

export type HomeNewsItem = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isPublished: boolean;
  createdByUserId: string;
  createdByDisplayName: string;
  createdByNickname?: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DiscordReleaseEvent = {
  id: string;
  type: 'release.published';
  createdAt: string;
  payload: {
    release: {
      id: string;
      title: string;
      summary: string;
      version: string | null;
      platform: string;
      link: string | null;
      publishedAt: string;
      createdByUserId: string;
      createdByDisplayName: string;
      createdByNickname: string | null;
    };
  };
};

export type AnnouncementType = 'player_looking_for_game' | 'gm_looking_for_players';
export type AnnouncementPlayMode = 'online' | 'onsite' | 'hybrid';
export type AnnouncementStatus = 'open' | 'closed';
export type AnnouncementDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type AnnouncementTimeSlot = 'morning' | 'midday' | 'afternoon' | 'late_afternoon' | 'evening';
export type AnnouncementPeriodicity = 'one_shot' | 'weekly' | 'biweekly' | 'monthly' | 'irregular';

export type HomeAnnouncement = {
  id: string;
  type: AnnouncementType;
  systemId: string | null;
  systemName: string;
  language: string;
  playMode: AnnouncementPlayMode;
  playerSlotsWanted: number | null;
  status: AnnouncementStatus;
  daysOfWeek: AnnouncementDay[];
  timeSlots: AnnouncementTimeSlot[];
  periodicity: AnnouncementPeriodicity | null;
  summary: string;
  authorUserId: string;
  authorDisplayName: string;
  authorNickname: string | null;
  createdAt: string;
  updatedAt: string;
};
