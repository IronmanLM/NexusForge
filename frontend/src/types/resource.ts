export type ResourceKind = 'image' | 'pdf' | 'text' | 'video' | 'audio';
export type ResourceScopeType = 'account' | 'system' | 'session';
export type ResourceVisibility = 'private' | 'shared' | 'public';
export type SessionResourceAudience = 'private' | 'session_all' | 'session_gm' | 'session_member';
export type ResourceFolderVisibilityHint = 'all' | 'gm' | 'participant';

export interface ResourceFolder {
  id: string;
  ownerUserId: string;
  scopeType: ResourceScopeType;
  scopeRefId?: string | null;
  parentFolderId?: string | null;
  name: string;
  visibilityHint: ResourceFolderVisibilityHint;
  defaultType?: string | null;
  sessionMemberUserId?: string | null;
  scopeName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceItem {
  id: string;
  name: string;
  originalName?: string;
  kind: ResourceKind;
  mimeType: string;
  sizeBytes: number;
  ownerUserId: string;
  ownerNickname?: string | null;
  scopeType: ResourceScopeType;
  scopeRefId?: string | null;
  scopeName?: string | null;
  visibility: ResourceVisibility;
  sharedWithUserIds?: string[];
  folderId?: string | null;
  folderName?: string | null;
  sessionAudience?: SessionResourceAudience | null;
  sessionMemberUserIds?: string[];
  canReshareInSession?: boolean;
  storagePath?: string | null;
  contentUrl?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}
