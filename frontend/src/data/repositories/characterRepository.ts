import { db, ensureDatabaseIsInitialized } from '../db';
import { Character } from '../../types/character';
import { Session } from '../../types/session';
import { GameSystem, SystemStudioViewDefinitionV2 } from '../../types/system';
import { localActionRepository } from './localActionRepository';
import { isBackendEnabled, requestJson } from '../../services/apiClient';
import { buildCharacterSheetFromStudioView } from '../../features/systems/studioCharacterSheetAdapter';

export const characterRepository = {
  async listForSession(params: {
    sessionId: string;
    role: 'gm' | 'player';
    currentUserId: string;
    assignedCharacterId?: string | null;
  }): Promise<Character[]> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled() && navigator.onLine) {
      try {
        const payload = await requestJson<{ items?: Character[] }>({
          path: `/api/sessions/${params.sessionId}/characters`,
          method: 'GET',
          withAuth: true
        });
        const items = Array.isArray(payload.items) ? payload.items : [];
        await db.transaction('rw', db.characters, async () => {
          const existing = await db.characters.where('sessionId').equals(params.sessionId).primaryKeys();
          if (existing.length > 0) {
            await db.characters.bulkDelete(existing);
          }
          if (items.length > 0) {
            await db.characters.bulkPut(items);
          }
        });
      } catch {
        // fallback local cache
      }
    }

    const all = await db.characters.where('sessionId').equals(params.sessionId).toArray();

    if (params.role === 'gm') {
      return all;
    }

    const assignedId = params.assignedCharacterId ?? null;
    return all.filter(
      (character) =>
        character.ownerUserId === params.currentUserId ||
        (assignedId && character.id === assignedId)
    );
  },

  async getById(characterId: string): Promise<Character | null> {
    await ensureDatabaseIsInitialized();
    const character = await db.characters.get(characterId);
    return character ?? null;
  },

  async createFromStudioView(params: {
    sessionId: string;
    system: GameSystem;
    view: SystemStudioViewDefinitionV2;
    ownerUserId?: string | null;
    name?: string;
  }): Promise<Character> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ character: Character }>({
          path: `/api/sessions/${params.sessionId}/characters/from-view`,
          method: 'POST',
          withAuth: true,
          body: {
            systemId: params.system.id,
            viewId: params.view.id,
            name: params.name ?? params.view.name,
            ownerUserId: params.ownerUserId ?? null
          }
        });
        await db.characters.put(payload.character);
        return payload.character;
      } catch {
        // fallback local creation
      }
    }

    const characterId = `character-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const characterName = params.name?.trim() || params.view.name || 'Nouveau personnage';

    const character: Character = {
      id: characterId,
      systemId: params.system.id,
      viewId: params.view.id,
      sessionId: params.sessionId,
      name: characterName,
      type: 'pc',
      ownerUserId: params.ownerUserId ?? null,
      createdFromViewId: params.view.id,
      sourceCharacterId: null,
      isPreGeneratedClone: false,
      initiativeMode: params.view.initiativeMode ?? null,
      initiativeFormula: params.view.initiativeFormula ?? null,
      sheet: buildCharacterSheetFromStudioView({
        view: params.view,
        system: params.system,
        characterId,
        name: characterName,
        templateContext: {
          nompj: characterName,
          nomsysteme: params.system.name,
          datecreation: new Date().toISOString().slice(0, 10)
        }
      })
    };

    await db.characters.put(character);
    await localActionRepository.enqueue({
      entityType: 'character',
      entityId: character.id,
      actionType: 'create',
      payload: character as unknown as Record<string, unknown>
    });

    return character;
  },

  async createOwnCharacter(params: {
    sessionId: string;
    system: GameSystem;
    view: SystemStudioViewDefinitionV2;
    ownerUserId: string;
    name: string;
  }): Promise<Character> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled() && navigator.onLine) {
      const payload = await requestJson<{ character: Character }>({
        path: `/api/sessions/${params.sessionId}/characters/self`,
        method: 'POST',
        withAuth: true,
        body: {
          systemId: params.system.id,
          viewId: params.view.id,
          name: params.name,
          ownerUserId: params.ownerUserId
        }
      });
      await db.characters.put(payload.character);
      return payload.character;
    }

    const created = await this.createFromStudioView(params);
    const session = await db.sessions.get(params.sessionId);
    if (session) {
      const nextSession = {
        ...session,
        participants: (session.participants ?? []).map((item) =>
          item.userId === params.ownerUserId
            ? { ...item, characterId: item.characterId || created.id }
            : item
        ),
        updatedAt: new Date().toISOString()
      };
      await db.sessions.put(nextSession);
    }
    return created;
  },

  async cloneCharacterToOwner(params: {
    sessionId: string;
    sourceCharacterId: string;
    ownerUserId: string;
    name?: string;
  }): Promise<Character> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled() && navigator.onLine) {
      const payload = await requestJson<{ character: Character; session?: unknown }>({
        path: `/api/sessions/${params.sessionId}/characters/${params.sourceCharacterId}/clone`,
        method: 'POST',
        withAuth: true,
        body: {
          ownerUserId: params.ownerUserId,
          name: params.name ?? null
        }
      });
      await db.characters.put(payload.character);
      return payload.character;
    }

    const source = await db.characters.get(params.sourceCharacterId);
    if (!source) {
      throw new Error('Personnage source introuvable.');
    }
    const cloned: Character = {
      ...source,
      id: `character-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ownerUserId: params.ownerUserId,
      name: params.name?.trim() || source.name,
      viewId: source.viewId,
      createdFromViewId: source.createdFromViewId ?? source.viewId,
      sourceCharacterId: source.id,
      isPreGeneratedClone: true
    };
    await db.characters.put(cloned);
    const session = await db.sessions.get(params.sessionId);
    if (session) {
      const nextSession = {
        ...session,
        participants: (session.participants ?? []).map((item) =>
          item.userId === params.ownerUserId
            ? { ...item, characterId: item.characterId || cloned.id }
            : item
        ),
        updatedAt: new Date().toISOString()
      };
      await db.sessions.put(nextSession);
    }
    return cloned;
  },

  async updateResource(params: { characterId: string; fieldId: string; value: number }): Promise<Character | null> {
    await ensureDatabaseIsInitialized();
    const character = await db.characters.get(params.characterId);
    if (!character || !character.sheet) {
      return null;
    }

    const nextFields = character.sheet.fields.map((field) =>
      field.id === params.fieldId && field.type === 'resource' ? { ...field, value: params.value } : field
    );

    const nextCharacter: Character = {
      ...character,
      sheet: {
        ...character.sheet,
        fields: nextFields
      }
    };

    await db.characters.put(nextCharacter);
    await localActionRepository.enqueue({
      entityType: 'character',
      entityId: character.id,
      actionType: 'update',
      payload: { fieldId: params.fieldId, value: params.value }
    });

    return nextCharacter;
  },

  async updateAttributes(params: {
    characterId: string;
    patch: Record<string, number | string | boolean | null>;
  }): Promise<Character | null> {
    await ensureDatabaseIsInitialized();
    const character = await db.characters.get(params.characterId);
    if (!character) {
      return null;
    }

    const nextCharacter: Character = {
      ...character,
      attributes: {
        ...(character.attributes ?? {}),
        ...params.patch
      }
    };

    await db.characters.put(nextCharacter);
    await localActionRepository.enqueue({
      entityType: 'character',
      entityId: character.id,
      actionType: 'update',
      payload: { attributesPatch: params.patch }
    });

    return nextCharacter;
  },

  async updateCharacter(params: {
    sessionId: string;
    characterId: string;
    patch: Partial<Pick<Character, 'name' | 'type' | 'ownerUserId'>>;
  }): Promise<Character | null> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled() && navigator.onLine) {
      try {
        const payload = await requestJson<{ character?: Character; session?: Session }>({
          path: `/api/sessions/${params.sessionId}/characters/${params.characterId}`,
          method: 'PATCH',
          withAuth: true,
          body: params.patch
        });
        if (payload.character) {
          await db.characters.put(payload.character);
          if (payload.session) {
            await db.sessions.put(payload.session);
          }
          return payload.character;
        }
      } catch {
        // fallback local
      }
    }

    const character = await db.characters.get(params.characterId);
    if (!character) {
      return null;
    }

    const nextCharacter: Character = {
      ...character,
      ...params.patch
    };

    await db.characters.put(nextCharacter);
    if (Object.prototype.hasOwnProperty.call(params.patch, 'ownerUserId')) {
      const session = await db.sessions.get(params.sessionId);
      if (session) {
        const targetOwnerUserId = params.patch.ownerUserId || null;
        await db.sessions.put({
          ...session,
          participants: (session.participants ?? []).map((participant) => {
            if (participant.characterId === character.id) {
              return { ...participant, characterId: null };
            }
            if (targetOwnerUserId && participant.userId === targetOwnerUserId) {
              return { ...participant, characterId: character.id };
            }
            return participant;
          }),
          updatedAt: new Date().toISOString()
        });
      }
    }
    await localActionRepository.enqueue({
      entityType: 'character',
      entityId: character.id,
      actionType: 'update',
      payload: { sessionId: params.sessionId, ...params.patch }
    });

    return nextCharacter;
  },

  async removeCharacter(params: { sessionId: string; characterId: string }): Promise<void> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled() && navigator.onLine) {
      try {
        await requestJson<void>({
          path: `/api/sessions/${params.sessionId}/characters/${params.characterId}`,
          method: 'DELETE',
          withAuth: true
        });
      } catch {
        // fallback local
      }
    }

    await db.characters.delete(params.characterId);
    await localActionRepository.enqueue({
      entityType: 'character',
      entityId: params.characterId,
      actionType: 'delete',
      payload: { sessionId: params.sessionId, id: params.characterId }
    });
  },

  async removeFromSession(params: { sessionId: string; characterId: string }): Promise<void> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled() && navigator.onLine) {
      try {
        await requestJson<void>({
          path: `/api/sessions/${params.sessionId}/characters/${params.characterId}/remove-from-session`,
          method: 'POST',
          withAuth: true,
          body: {}
        });
      } catch {
        // fallback local
      }
    }

    const character = await db.characters.get(params.characterId);
    if (character) {
      await db.characters.put({
        ...character,
        sessionId: null
      });
    }

    const session = await db.sessions.get(params.sessionId);
    if (session) {
      await db.sessions.put({
        ...session,
        participants: (session.participants ?? []).map((participant) =>
          participant.characterId === params.characterId ? { ...participant, characterId: null } : participant
        ),
        updatedAt: new Date().toISOString()
      });
    }

    await localActionRepository.enqueue({
      entityType: 'character',
      entityId: params.characterId,
      actionType: 'update',
      payload: { sessionId: params.sessionId, id: params.characterId, removeFromSession: true }
    });
  },

  async updateSheetFields(params: {
    sessionId: string;
    characterId: string;
    fields: NonNullable<Character['sheet']>['fields'];
    runtimeValues?: Character['runtimeValues'];
  }): Promise<Character | null> {
    await ensureDatabaseIsInitialized();

    if (isBackendEnabled() && navigator.onLine) {
      try {
        const payload = await requestJson<{ character?: Character; session?: Session }>({
          path: `/api/sessions/${params.sessionId}/characters/${params.characterId}/sheet`,
          method: 'PATCH',
          withAuth: true,
          body: { fields: params.fields, runtimeValues: params.runtimeValues ?? null }
        });
        if (payload.character) {
          await db.characters.put(payload.character);
          if (payload.session) {
            await db.sessions.put(payload.session);
          }
          return payload.character;
        }
      } catch {
        // fallback local
      }
    }

    const character = await db.characters.get(params.characterId);
    if (!character?.sheet) {
      return null;
    }
    const nextCharacter: Character = {
      ...character,
      ...(params.runtimeValues ? { runtimeValues: params.runtimeValues } : {}),
      sheet: {
        ...character.sheet,
        fields: params.fields
      }
    };
    await db.characters.put(nextCharacter);
    await localActionRepository.enqueue({
      entityType: 'character',
      entityId: params.characterId,
      actionType: 'update',
      payload: {
        sessionId: params.sessionId,
        id: params.characterId,
        sheetFields: params.fields as unknown as Record<string, unknown>,
        ...(params.runtimeValues ? { runtimeValues: params.runtimeValues as Record<string, unknown> } : {})
      }
    });
    return nextCharacter;
  }
};
