export type ChatChannelKind = 'global' | 'group' | 'direct';

export interface ChatChannel {
  id: string;
  kind: ChatChannelKind;
  title: string;
  sessionId: string;
  memberUserIds: string[];
}
