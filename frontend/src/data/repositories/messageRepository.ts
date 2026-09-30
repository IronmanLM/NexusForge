import { db, ensureDatabaseIsInitialized } from '../db';
import { Message } from '../../types/message';
import { isBackendEnabled, requestJson } from '../../services/apiClient';

export const messageRepository = {
  async listForSession(sessionId: string): Promise<Message[]> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ items?: Message[] }>({
          path: `/api/sessions/${sessionId}/messages`,
          method: 'GET',
          withAuth: true
        });
        const items = Array.isArray(payload.items) ? payload.items : [];
        await db.transaction('rw', db.messages, async () => {
          const existing = await db.messages.where('sessionId').equals(sessionId).primaryKeys();
          if (existing.length > 0) {
            await db.messages.bulkDelete(existing);
          }
          if (items.length > 0) {
            await db.messages.bulkPut(items);
          }
        });
      } catch {
        // fallback local cache
      }
    }
    return db.messages
      .where('sessionId')
      .equals(sessionId)
      .sortBy('createdAt');
  },

  async create(message: Message): Promise<Message> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ item?: Message }>({
          path: `/api/sessions/${message.sessionId}/messages`,
          method: 'POST',
          withAuth: true,
          body: message
        });
        const created = payload.item ?? message;
        await db.messages.put(created);
        return created;
      } catch {
        // fallback local only
      }
    }
    await db.messages.put(message);
    return message;
  }
};
