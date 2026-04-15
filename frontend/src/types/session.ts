export type SessionState = 'planned' | 'running' | 'paused' | 'finished';

export interface SessionSettings {
  allowPlayerToEditCharacterOffline?: boolean;
  allowPlayerToPlayerChat?: boolean;
  allowPlayerToPlayerDocuments?: boolean;
  silenceMode?: 'off' | 'noGlobal' | 'playersToPlayersBlocked' | 'full';
}

export interface SessionParticipant {
  userId: string;
  role: 'gm' | 'player' | 'observer';
  displayName?: string;
  nickname?: string | null;
  characterId?: string | null;
  isConnected?: boolean;
  lastSeenAt?: string | null;
}

export interface SessionRuntimeOverlayTarget {
  targetId: string;
  title: string;
  screenName: string;
  tabName: string;
  channelKey?: string | null;
}

export interface SessionRuntimeConnection {
  userId: string;
  role: 'gm' | 'player';
  active: boolean;
  lastSeenAt: string | null;
  displayName?: string;
  nickname?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  setId?: string | null;
  setName?: string | null;
  detachedScreenId?: string | null;
  screenName?: string | null;
  availableOverlayTargets?: SessionRuntimeOverlayTarget[];
}

export interface SessionInvitation {
  id: string;
  userId: string;
  role: 'gm' | 'player' | 'observer';
  invitedByUserId: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'declined';
  displayName?: string;
  nickname?: string | null;
  invitedByDisplayName?: string;
  invitedByNickname?: string | null;
}

export interface SessionActivityEntry {
  id: string;
  type:
    | 'session_created'
    | 'session_updated'
    | 'invitation_sent'
    | 'invitation_cancelled'
    | 'invitation_resent'
    | 'invitation_accepted'
    | 'invitation_declined'
    | 'participant_removed'
    | 'participant_left'
    | 'character_created'
    | 'character_cloned'
    | 'character_updated'
    | 'character_removed_from_session'
    | 'character_deleted';
  actorUserId?: string | null;
  actorNickname?: string | null;
  message: string;
  createdAt: string;
}

export interface SessionInitiativeEntry {
  id: string;
  type: 'character' | 'group' | 'other';
  name: string;
  initiative: number;
  characterId?: string | null;
  isActive?: boolean;
}

export type SessionInitiativeMode = 'system_default' | 'combat_once' | 'round_recalc' | 'gm_fixed' | 'manual_turn';

export interface SessionInitiativeConfig {
  mode: SessionInitiativeMode;
  formula?: string | null;
}

export interface SessionInitiativeState {
  round: number;
  turnIndex: number;
  isInCombat: boolean;
  entries: SessionInitiativeEntry[];
  config?: SessionInitiativeConfig;
}

export interface SessionScreenTemplateAssignments {
  gmTemplateId?: string | null;
  playerTemplateId?: string | null;
}

export interface SessionScreenTemplateUserSelection {
  gmTemplateId?: string | null;
  playerTemplateId?: string | null;
}

export interface SessionDiscordIntegration {
  guildId?: string | null;
  guildName?: string | null;
  categoryId?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  status?: 'link_requested' | 'active' | 'archived' | 'deleted' | string;
  linkedAt?: string | null;
  linkedByUserId?: string | null;
  lastSyncedAt?: string | null;
}

export interface Session {
  id: string;
  systemId: string;
  campaignId?: string | null;
  name: string;
  description?: string;
  ownerUserId?: string;
  gmUserId: string;
  gmUserIds?: string[];
  archivedAt?: string | null;
  state: SessionState;
  settings?: SessionSettings;
  participants?: SessionParticipant[];
  invitations?: SessionInvitation[];
  activityLog?: SessionActivityEntry[];
  initiative?: SessionInitiativeState;
  screenTemplateAssignments?: SessionScreenTemplateAssignments;
  screenTemplateSelections?: Record<string, SessionScreenTemplateUserSelection>;
  runtimeConnections?: SessionRuntimeConnection[];
  discordIntegration?: SessionDiscordIntegration | null;
  createdAt: string;
  updatedAt: string;
}
