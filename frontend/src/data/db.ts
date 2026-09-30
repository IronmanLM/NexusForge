import Dexie, { Table } from 'dexie';
import { Character } from '../types/character';
import { Document } from '../types/document';
import { Message } from '../types/message';
import { Note } from '../types/note';
import { ResourceFolder, ResourceItem } from '../types/resource';
import { ScreenTemplate } from '../types/screenTemplate';
import { Session } from '../types/session';
import { GameSystem } from '../types/system';
import { LocalAction } from '../types/localAction';
import { OfflineResourceFile, OfflineSessionBundle } from '../types/offline';

class NexusForgeDatabase extends Dexie {
  systems!: Table<GameSystem, string>;
  characters!: Table<Character, string>;
  sessions!: Table<Session, string>;
  notes!: Table<Note, string>;
  messages!: Table<Message, string>;
  documents!: Table<Document, string>;
  resources!: Table<ResourceItem, string>;
  resourceFolders!: Table<ResourceFolder, string>;
  localActions!: Table<LocalAction, string>;
  screenTemplates!: Table<ScreenTemplate, string>;
  offlineSessions!: Table<OfflineSessionBundle, string>;
  offlineResourceFiles!: Table<OfflineResourceFile, string>;

  constructor() {
    super('nexus-forge-db');

    this.version(1).stores({
      sessions: 'id, gmUserId, state, updatedAt'
    });

    this.version(2).stores({
      systems: 'id, updatedAt',
      characters: 'id, systemId, ownerUserId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, ownerUserId, createdAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus'
    });

    this.version(3).stores({
      systems: 'id, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, ownerUserId, createdAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      dashboardProfiles: 'id, userId, role, isFavorite, updatedAt'
    });

    this.version(4).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, ownerUserId, createdAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      dashboardProfiles: 'id, userId, role, isFavorite, updatedAt'
    });

    this.version(5).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, sessionId, ownerUserId, createdAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      dashboardProfiles: 'id, userId, role, isFavorite, updatedAt'
    });

    this.version(6).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, sessionId, ownerUserId, createdAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      dashboardProfiles: 'id, userId, role, sessionId, isFavorite, updatedAt'
    });

    this.version(7).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, sessionId, ownerUserId, createdAt',
      resources: 'id, ownerUserId, scopeType, scopeRefId, kind, updatedAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      dashboardProfiles: 'id, userId, role, sessionId, isFavorite, updatedAt'
    });

    this.version(8).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, sessionId, ownerUserId, createdAt',
      resources: 'id, ownerUserId, scopeType, scopeRefId, kind, updatedAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      dashboardProfiles: 'id, userId, role, sessionId, isFavorite, updatedAt',
      screenTemplates: 'id, createdBy, scopeType, scopeRefId, roleTarget, visibility, updatedAt'
    });

    this.version(9).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, sessionId, ownerUserId, createdAt',
      resources: 'id, ownerUserId, scopeType, scopeRefId, folderId, kind, updatedAt',
      resourceFolders: 'id, ownerUserId, scopeType, scopeRefId, parentFolderId, updatedAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      dashboardProfiles: 'id, userId, role, sessionId, isFavorite, updatedAt',
      screenTemplates: 'id, createdBy, scopeType, scopeRefId, roleTarget, visibility, updatedAt'
    });

    this.version(10).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, sessionId, ownerUserId, createdAt',
      resources: 'id, ownerUserId, scopeType, scopeRefId, folderId, kind, updatedAt',
      resourceFolders: 'id, ownerUserId, scopeType, scopeRefId, parentFolderId, updatedAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      screenTemplates: 'id, createdBy, scopeType, scopeRefId, roleTarget, visibility, updatedAt'
    });

    this.version(11).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, sessionId, ownerUserId, createdAt',
      resources: 'id, ownerUserId, scopeType, scopeRefId, folderId, kind, updatedAt',
      resourceFolders: 'id, ownerUserId, scopeType, scopeRefId, parentFolderId, updatedAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      screenTemplates: 'id, createdBy, scopeType, scopeRefId, roleTarget, visibility, updatedAt',
      offlineSessions: 'sessionId, accountUserId, status, lastHydratedAt, lastSyncAt'
    });

    this.version(12).stores({
      systems: 'id, ownerUserId, visibility, updatedAt',
      characters: 'id, systemId, ownerUserId, sessionId',
      sessions: 'id, gmUserId, state, updatedAt',
      notes: 'id, type, scope, scopeRefId, updatedAt',
      messages: 'id, sessionId, channelType, channelId, createdAt',
      documents: 'id, sessionId, ownerUserId, createdAt',
      resources: 'id, ownerUserId, scopeType, scopeRefId, folderId, kind, updatedAt',
      resourceFolders: 'id, ownerUserId, scopeType, scopeRefId, parentFolderId, updatedAt',
      localActions: 'id, entityType, entityId, createdAt, syncStatus',
      screenTemplates: 'id, createdBy, scopeType, scopeRefId, roleTarget, visibility, updatedAt',
      offlineSessions: 'sessionId, accountUserId, status, lastHydratedAt, lastSyncAt',
      offlineResourceFiles: 'resourceId, downloadedAt, updatedAt'
    });
  }
}

export const db = new NexusForgeDatabase();

let didInit = false;

export async function ensureDatabaseIsInitialized(): Promise<void> {
  if (didInit) {
    return;
  }

  await db.open();

  didInit = true;
}
