import { db, ensureDatabaseIsInitialized } from '../db';
import { ScreenTemplate } from '../../types/screenTemplate';
import { isBackendEnabled, requestJson } from '../../services/apiClient';

function migrateLegacyScreenWidgets(template: ScreenTemplate): ScreenTemplate {
  let changed = false;
  const sets = template.sets.map((set) => {
    let setChanged = false;
    const screens = set.screens.map((screen) => {
      let screenChanged = false;
      const tabGroups = screen.tabGroups.map((group) => {
        let groupChanged = false;
        const widgets = group.widgets.map((widget) => {
          const rawType = String((widget as { type?: unknown }).type ?? '');
          if (rawType !== 'pdf_viewer' && rawType !== 'media_viewer') {
            return widget;
          }
          groupChanged = true;
          const config = { ...(widget.config ?? {}) };
          return {
            ...widget,
            type: 'screen_viewer' as const,
            config: {
              ...config,
              mode: rawType === 'pdf_viewer' ? 'pdf' : typeof config.mode === 'string' ? config.mode : 'auto',
              fit: typeof config.fit === 'string' ? config.fit : 'contain',
              autoplay: typeof config.autoplay === 'boolean' ? config.autoplay : false,
              loop: typeof config.loop === 'boolean' ? config.loop : false,
              showToolbar: typeof config.showToolbar === 'boolean' ? config.showToolbar : true,
              channelKey: typeof config.channelKey === 'string' && config.channelKey ? config.channelKey : 'primary'
            }
          };
        });
        if (!groupChanged) {
          return group;
        }
        screenChanged = true;
        return { ...group, widgets };
      });
      if (!screenChanged) {
        return screen;
      }
      setChanged = true;
      return { ...screen, tabGroups };
    });
    if (!setChanged) {
      return set;
    }
    changed = true;
    return { ...set, screens };
  });
  return changed ? { ...template, sets } : template;
}

function mapApiScreenTemplate(raw: Record<string, unknown>): ScreenTemplate {
  const template = {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? 'Template ecran'),
    description: typeof raw.description === 'string' ? raw.description : '',
    scopeType: raw.scopeType === 'system' ? 'system' : 'account',
    scopeRefId: typeof raw.scopeRefId === 'string' ? raw.scopeRefId : null,
    roleTarget: raw.roleTarget === 'gm' || raw.roleTarget === 'both' ? raw.roleTarget : 'player',
    visibility: raw.visibility === 'public' || raw.visibility === 'friends' ? raw.visibility : 'private',
    isFavorite: Boolean(raw.isFavorite),
    sourceTemplateId: typeof raw.sourceTemplateId === 'string' ? raw.sourceTemplateId : null,
    createdBy: String(raw.createdBy ?? ''),
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : undefined,
    sets: Array.isArray(raw.sets) ? (raw.sets as ScreenTemplate['sets']) : [],
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString())
  } satisfies ScreenTemplate;
  return migrateLegacyScreenWidgets(template);
}

export const screenTemplateRepository = {
  async listForUser(userId: string): Promise<ScreenTemplate[]> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ items?: Record<string, unknown>[] }>({
          path: '/api/screen-templates',
          method: 'GET',
          withAuth: true
        });
        const templates = (payload.items ?? []).map(mapApiScreenTemplate);
        await db.transaction('rw', db.screenTemplates, async () => {
          await db.screenTemplates.clear();
          if (templates.length > 0) {
            await db.screenTemplates.bulkPut(templates);
          }
        });
      } catch {
        // fallback local cache
      }
    }
    const templates = await db.screenTemplates.toArray();
    return templates
      .filter(
        (template) =>
          template.createdBy === userId ||
          template.scopeType === 'system' ||
          template.visibility === 'public' ||
          template.visibility === 'friends'
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async listForSystem(systemId: string): Promise<ScreenTemplate[]> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ items?: Record<string, unknown>[] }>({
          path: `/api/screen-templates?scopeType=system&scopeRefId=${encodeURIComponent(systemId)}`,
          method: 'GET',
          withAuth: true
        });
        const templates = (payload.items ?? []).map(mapApiScreenTemplate);
        await db.screenTemplates.bulkPut(templates);
      } catch {
        // fallback local cache
      }
    }
    const templates = await db.screenTemplates.where('scopeRefId').equals(systemId).toArray();
    return templates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getById(templateId: string): Promise<ScreenTemplate | null> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const payload = await requestJson<{ item?: Record<string, unknown> }>({
          path: `/api/screen-templates/${templateId}`,
          method: 'GET',
          withAuth: true
        });
        if (payload.item) {
          const mapped = mapApiScreenTemplate(payload.item);
          await db.screenTemplates.put(mapped);
          return mapped;
        }
      } catch {
        // fallback local cache
      }
    }
    return (await db.screenTemplates.get(templateId)) ?? null;
  },

  async upsert(template: ScreenTemplate): Promise<void> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        const method = (await db.screenTemplates.get(template.id)) ? 'PATCH' : 'POST';
        const path = method === 'PATCH' ? `/api/screen-templates/${template.id}` : '/api/screen-templates';
        const payload = await requestJson<{ item: Record<string, unknown> }>({
          path,
          method,
          withAuth: true,
          body: template
        });
        await db.screenTemplates.put(mapApiScreenTemplate(payload.item));
        return;
      } catch {
        // fallback local cache
      }
    }
    await db.screenTemplates.put({
      ...template,
      updatedAt: new Date().toISOString()
    });
  },

  async delete(templateId: string): Promise<void> {
    await ensureDatabaseIsInitialized();
    if (isBackendEnabled()) {
      try {
        await requestJson<void>({
          path: `/api/screen-templates/${templateId}`,
          method: 'DELETE',
          withAuth: true
        });
      } catch {
        // fallback local cache
      }
    }
    await db.screenTemplates.delete(templateId);
  }
};
