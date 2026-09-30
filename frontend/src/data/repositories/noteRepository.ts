import { db, ensureDatabaseIsInitialized } from '../db';
import { Note } from '../../types/note';
import { isBackendEnabled, requestJson } from '../../services/apiClient';

export const noteRepository = {
  async listForSession(params: {
    sessionId: string;
    currentUserId: string;
    role: 'gm' | 'player';
  }): Promise<Note[]> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ items?: Note[] }>({
          path: `/api/sessions/${params.sessionId}/notes`,
          method: 'GET',
          withAuth: true
        });
        const items = Array.isArray(payload.items) ? payload.items : [];
        await db.transaction('rw', db.notes, async () => {
          const existing = await db.notes.where('scopeRefId').equals(params.sessionId).primaryKeys();
          if (existing.length > 0) {
            await db.notes.bulkDelete(existing);
          }
          if (items.length > 0) {
            await db.notes.bulkPut(items);
          }
        });
      } catch {
        // fallback local cache
      }
    }

    const notes = await db.notes.where('scopeRefId').equals(params.sessionId).toArray();
    return notes
      .filter((note) => {
        if (note.type === 'public') {
          return true;
        }

        if (note.type === 'gm_private') {
          return params.role === 'gm';
        }

        return note.ownerUserId === params.currentUserId || note.createdByUserId === params.currentUserId;
      })
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
  },

  async create(note: Note): Promise<Note> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled() && note.sessionId) {
      try {
        const payload = await requestJson<{ item?: Note }>({
          path: `/api/sessions/${note.sessionId}/notes`,
          method: 'POST',
          withAuth: true,
          body: note
        });
        const created = payload.item ?? note;
        await db.notes.put(created);
        return created;
      } catch {
        // fallback local only
      }
    }
    await db.notes.put(note);
    return note;
  },

  async update(note: Note): Promise<Note> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled() && note.sessionId) {
      try {
        const payload = await requestJson<{ item?: Note }>({
          path: `/api/sessions/${note.sessionId}/notes/${note.id}`,
          method: 'PATCH',
          withAuth: true,
          body: note
        });
        const updated = payload.item ?? note;
        await db.notes.put(updated);
        return updated;
      } catch {
        // fallback local only
      }
    }
    await db.notes.put(note);
    return note;
  },

  async remove(params: { sessionId: string; noteId: string }): Promise<void> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        await requestJson<void>({
          path: `/api/sessions/${params.sessionId}/notes/${params.noteId}`,
          method: 'DELETE',
          withAuth: true
        });
      } catch {
        // fallback local only
      }
    }
    await db.notes.delete(params.noteId);
  }
};
