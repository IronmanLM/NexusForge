import { requestJson } from './apiClient';

export type SystemDraftSourceType = 'html' | 'html_enriched' | 'pdf';

export interface SystemDraftPayload {
  format: string;
  version: number;
  extractedAt: string;
  source: {
    type: string;
    path: string;
  };
  warnings?: string[];
  suggestedSystem?: {
    name?: string;
    studioSchemaV2?: unknown;
  };
  extraction?: {
    elements?: unknown[];
  };
}

export async function convertSourceToSystemDraft(params: {
  sourceType: SystemDraftSourceType;
  fileName: string;
  contentBase64: string;
}) {
  const payload = await requestJson<{ draft: SystemDraftPayload }>({
    path: '/api/tools/system-draft/convert',
    method: 'POST',
    withAuth: true,
    body: params
  });
  return payload.draft;
}
