import { requestJson } from '../../../services/apiClient';
import { VttState } from '../types';

function mapVttState(raw: unknown): VttState {
  const fallback: VttState = { scenes: [], activeSceneId: null, updatedAt: new Date().toISOString() };
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const value = raw as Partial<VttState>;
  return {
    scenes: Array.isArray(value.scenes) ? value.scenes : [],
    activeSceneId: typeof value.activeSceneId === 'string' ? value.activeSceneId : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : fallback.updatedAt
  };
}

export const vttRepository = {
  async getState(sessionId: string): Promise<VttState> {
    const payload = await requestJson<{ vtt?: unknown }>({
      path: `/api/sessions/${sessionId}/vtt`,
      method: 'GET',
      withAuth: true
    });
    return mapVttState(payload.vtt);
  },

  async saveState(sessionId: string, state: VttState): Promise<VttState> {
    const payload = await requestJson<{ vtt?: unknown }>({
      path: `/api/sessions/${sessionId}/vtt`,
      method: 'PUT',
      withAuth: true,
      body: { vtt: state }
    });
    return mapVttState(payload.vtt);
  }
};
