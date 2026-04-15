import { ResourceFolder, ResourceItem, ResourceKind } from '../../../types/resource';

export type FlattenedResourceFolder = {
  id: string;
  name: string;
  depth: number;
  path: string[];
  parentFolderId: string | null;
};

export function formatResourceBytes(value: number): string {
  if (value < 1024) {
    return `${value} o`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} Ko`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

export function getResourceKindLabel(kind: ResourceKind): string {
  if (kind === 'image') return 'Image';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'video') return 'Vidéo';
  return 'Texte';
}

export function getResourceScopeLabel(item: ResourceItem): string {
  if (item.scopeType === 'account') {
    return 'Personnel';
  }
  if (item.scopeType === 'system') {
    return `Système${item.scopeName ? ` · ${item.scopeName}` : ''}`;
  }
  return `Partie${item.scopeName ? ` · ${item.scopeName}` : ''}`;
}

export function getResourceSessionAudienceLabel(item: ResourceItem): string | null {
  if (item.scopeType !== 'session') {
    return null;
  }
  if (item.sessionAudience === 'session_gm') {
    return 'MJ uniquement';
  }
  if (item.sessionAudience === 'session_member') {
    return 'Joueurs ciblés';
  }
  if (item.sessionAudience === 'private') {
    return 'Privé';
  }
  return 'Commun';
}

export function buildResourceFolderPath(folderId: string | null, folders: ResourceFolder[]): string[] {
  if (!folderId) {
    return [];
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const labels: string[] = [];
  let cursor = folderId;
  while (cursor) {
    const folder = byId.get(cursor);
    if (!folder) {
      break;
    }
    labels.unshift(folder.name);
    cursor = folder.parentFolderId || '';
  }
  return labels;
}

export function flattenResourceFolders(folders: ResourceFolder[]): FlattenedResourceFolder[] {
  const byParent = new Map<string, ResourceFolder[]>();
  folders.forEach((folder) => {
    const key = folder.parentFolderId || '__root__';
    const items = byParent.get(key) || [];
    items.push(folder);
    byParent.set(key, items);
  });

  byParent.forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name, 'fr-FR')));

  const walk = (parentId: string | null, depth: number, parentPath: string[]): FlattenedResourceFolder[] => {
    const key = parentId || '__root__';
    const children = byParent.get(key) || [];
    return children.flatMap((folder) => {
      const path = [...parentPath, folder.name];
      return [
        {
          id: folder.id,
          name: folder.name,
          depth,
          path,
          parentFolderId: folder.parentFolderId || null
        },
        ...walk(folder.id, depth + 1, path)
      ];
    });
  };

  return walk(null, 0, []);
}

export function formatResourceUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
}
