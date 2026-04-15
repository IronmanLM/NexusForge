import { useEffect, useMemo, useState } from 'react';
import { resourceRepository } from '../../../data/repositories';
import { useProtectedResourceUrl } from '../../../hooks/useProtectedResourceUrl';
import { ResourceItem } from '../../../types/resource';
import { Session } from '../../../types/session';

type SessionPdfViewerWidgetProps = {
  currentSession: Session;
  resourceId?: string;
  url?: string;
  page?: number;
  showToolbar?: boolean;
};

export default function SessionPdfViewerWidget({
  currentSession,
  resourceId = '',
  url = '',
  page = 1,
  showToolbar = true
}: SessionPdfViewerWidgetProps) {
  const [resource, setResource] = useState<ResourceItem | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!resourceId) {
        setResource(null);
        return;
      }
      const all = await resourceRepository.list();
      if (active) {
        setResource(all.find((item) => item.id === resourceId && (item.scopeRefId === currentSession.id || item.scopeType === 'account' || item.scopeType === 'system')) ?? null);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [currentSession.id, resourceId]);

  const source = resource?.contentUrl || url;
  const resolvedSrc = useProtectedResourceUrl(source, resource?.id);
  const viewerUrl = useMemo(() => {
    if (!resolvedSrc) {
      return '';
    }
    const hash = `#page=${Math.max(1, page)}${showToolbar ? '' : '&toolbar=0'}`;
    return `${resolvedSrc}${hash}`;
  }, [page, resolvedSrc, showToolbar]);

  if (!viewerUrl) {
    return <p style={{ margin: 0 }}>Aucun PDF selectionne.</p>;
  }

  return <iframe title="Lecteur PDF" src={viewerUrl} style={{ border: 0, width: '100%', minHeight: '100%', background: '#fff' }} />;
}
