import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from 'react';
import AuthenticatedImage from '../../../components/AuthenticatedImage';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import ResourcePreview from '../../../components/ResourcePreview';
import SocialUserAutocomplete from '../../../components/SocialUserAutocomplete';
import SyncStatusBadge, { resolveEntitySyncBadgeState } from '../../../components/SyncStatusBadge';
import { useAuth } from '../../../hooks/useAuth';
import { localActionRepository, offlineResourceFileRepository, resourceRepository, sessionRepository, systemRepository } from '../../../data/repositories';
import { openOfflineCapableResourceInNewTab } from '../../../services/offlineResourceAccessService';
import { ResourceFolder, ResourceItem, ResourceKind, ResourceScopeType, ResourceVisibility, SessionResourceAudience } from '../../../types/resource';
import { GameSystem } from '../../../types/system';
import { Session } from '../../../types/session';
import { SocialUser } from '../../../types/social';
import { getSocialUserByIdService } from '../../../services/socialService';
import { LocalAction } from '../../../types/localAction';
import {
  buildResourceFolderPath,
  flattenResourceFolders,
  formatResourceBytes,
  formatResourceUpdatedAt,
  getResourceKindLabel,
  getResourceScopeLabel,
  getResourceSessionAudienceLabel
} from '../utils/resourceExplorer';

const DAY_LABELS: Record<string, string> = {
  monday: 'Lun',
  tuesday: 'Mar',
  wednesday: 'Mer',
  thursday: 'Jeu',
  friday: 'Ven',
  saturday: 'Sam',
  sunday: 'Dim'
};

type LibrarySpace = 'personal' | 'session' | 'shared';

type UploadConfig = {
  scopeType: ResourceScopeType;
  scopeRefId: string;
  folderId: string;
  visibility: ResourceVisibility;
  sessionAudience: SessionResourceAudience;
  sessionMemberUserIds: string[];
  canReshareInSession: boolean;
};

type ResourceSortMode = 'updated_desc' | 'name_asc' | 'size_desc';
type ResourceViewMode = 'thumbnail_s' | 'thumbnail_m' | 'thumbnail_l' | 'names';

function inferUploadMimeType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.md')) {
    return 'text/markdown';
  }
  if (name.endsWith('.txt')) {
    return 'text/plain';
  }
  if (name.endsWith('.json')) {
    return 'application/json';
  }
  if (name.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (name.endsWith('.png')) {
    return 'image/png';
  }
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (name.endsWith('.webp')) {
    return 'image/webp';
  }
  if (name.endsWith('.gif')) {
    return 'image/gif';
  }
  if (name.endsWith('.mp4')) {
    return 'video/mp4';
  }
  if (name.endsWith('.webm')) {
    return 'video/webm';
  }
  if (name.endsWith('.ogv')) {
    return 'video/ogg';
  }
  if (name.endsWith('.mp3')) {
    return 'audio/mpeg';
  }
  if (name.endsWith('.wav')) {
    return 'audio/wav';
  }
  if (name.endsWith('.ogg') || name.endsWith('.oga')) {
    return 'audio/ogg';
  }
  if (name.endsWith('.m4a')) {
    return 'audio/mp4';
  }
  if (file.type) {
    return file.type;
  }
  return 'application/octet-stream';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error(`Lecture invalide pour ${file.name}.`));
        return;
      }
      const content = arrayBufferToBase64(reader.result);
      if (!content) {
        reject(new Error(`Le contenu du fichier ${file.name} est vide.`));
        return;
      }
      resolve(content);
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Impossible de lire le fichier ${file.name}.`));
    reader.readAsArrayBuffer(file);
  });
}

export default function ResourcesPage() {
  const { currentUser } = useAuth();
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [folders, setFolders] = useState<ResourceFolder[]>([]);
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSpace, setCurrentSpace] = useState<LibrarySpace>('personal');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [uploadConfig, setUploadConfig] = useState<UploadConfig>({
    scopeType: 'account',
    scopeRefId: '',
    folderId: '',
    visibility: 'private',
    sessionAudience: 'session_all',
    sessionMemberUserIds: [],
    canReshareInSession: true
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<ResourceSortMode>('updated_desc');
  const [viewMode, setViewMode] = useState<ResourceViewMode>('thumbnail_l');
  const [resourceRename, setResourceRename] = useState('');
  const [shareSearch, setShareSearch] = useState('');
  const [sharedUsersById, setSharedUsersById] = useState<Record<string, SocialUser>>({});
  const [localActions, setLocalActions] = useState<LocalAction[]>([]);
  const [offlineCachedResourceIds, setOfflineCachedResourceIds] = useState<string[]>([]);

  const canManageSystems = Boolean(currentUser && (currentUser.roles.includes('gm') || currentUser.roles.includes('admin')));
  const selectedResource = useMemo(() => resources.find((item) => item.id === selectedResourceId) ?? null, [resources, selectedResourceId]);

  const loadAll = async () => {
    if (!currentUser) {
      setResources([]);
      setFolders([]);
      setSystems([]);
      setSessions([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [resourceItems, folderItems, systemItems, sessionItems, pendingActions, offlineFiles] = await Promise.all([
        resourceRepository.list(),
        resourceRepository.listFolders(),
        canManageSystems ? systemRepository.listAvailableForUser(currentUser) : Promise.resolve([]),
        sessionRepository.list({ includeArchived: false }),
        localActionRepository.listAll(),
        offlineResourceFileRepository.listAll()
      ]);
      setResources(resourceItems);
      setFolders(folderItems);
      setSystems(systemItems);
      setSessions(sessionItems);
      setLocalActions(pendingActions);
      setOfflineCachedResourceIds(offlineFiles.map((item) => item.resourceId));
      setSelectedSessionId((current) => current || sessionItems[0]?.id || '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger la bibliothèque.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [currentUser]);

  useEffect(() => {
    if (selectedResource) {
      setResourceRename(selectedResource.name);
    }
  }, [selectedResource]);

  useEffect(() => {
    const resourceIds = new Set(resources.map((item) => item.id));
    setSelectedResourceIds((current) => current.filter((id) => resourceIds.has(id)));
  }, [resources]);

  useEffect(() => {
    if (!selectedResource || selectedResource.scopeType === 'session' || (selectedResource.sharedWithUserIds || []).length === 0) {
      return;
    }
    let cancelled = false;
    void Promise.all(
      (selectedResource.sharedWithUserIds || []).map(async (userId) => {
        try {
          const user = await getSocialUserByIdService(userId);
          return [userId, user] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setSharedUsersById((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (!entry) {
            continue;
          }
          next[entry[0]] = entry[1];
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedResource]);

  useEffect(() => {
    if (currentSpace === 'personal') {
      setUploadConfig((current) => ({ ...current, scopeType: 'account', scopeRefId: '', sessionAudience: 'session_all', sessionMemberUserIds: [], visibility: 'private' }));
    } else if (currentSpace === 'session') {
      setUploadConfig((current) => ({ ...current, scopeType: 'session', scopeRefId: selectedSessionId, visibility: 'private', folderId: '', sessionAudience: 'session_all' }));
    }
    setSelectedFolderId('');
    setSelectedResourceIds([]);
  }, [currentSpace, selectedSessionId]);

  const personalFolders = useMemo(
    () => folders.filter((folder) => folder.scopeType === 'account' && folder.ownerUserId === currentUser?.id),
    [folders, currentUser?.id]
  );

  const sessionFolders = useMemo(
    () => folders.filter((folder) => folder.scopeType === 'session' && folder.scopeRefId === selectedSessionId),
    [folders, selectedSessionId]
  );

  const visibleFolders = currentSpace === 'personal' ? personalFolders : currentSpace === 'session' ? sessionFolders : [];

  const displayedResources = useMemo(() => {
    let items: ResourceItem[] = [];
    if (currentSpace === 'personal') {
      items = resources.filter((item) => item.scopeType === 'account' && item.ownerUserId === currentUser?.id);
    } else if (currentSpace === 'session') {
      items = resources.filter((item) => item.scopeType === 'session' && item.scopeRefId === selectedSessionId);
    } else {
      items = resources.filter((item) => item.ownerUserId !== currentUser?.id);
    }

    if (selectedFolderId) {
      items = items.filter((item) => item.folderId === selectedFolderId);
    }
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery) {
      items = items.filter((item) =>
        [
          item.name,
          item.originalName,
          item.ownerNickname,
          item.scopeName,
          getResourceScopeLabel(item),
          getResourceSessionAudienceLabel(item) ?? ''
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery))
      );
    }

    const sorted = [...items];
    if (sortMode === 'name_asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'fr-FR'));
      return sorted;
    }
    if (sortMode === 'size_desc') {
      sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
      return sorted;
    }
    sorted.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return sorted;
  }, [currentSpace, currentUser?.id, resources, searchQuery, selectedFolderId, selectedSessionId, sortMode]);

  const latestResourceActionById = useMemo(() => {
    const map = new Map<string, LocalAction>();
    localActions
      .filter((action) => action.entityType === 'resource')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach((action) => {
        if (!map.has(action.entityId)) {
          map.set(action.entityId, action);
        }
      });
    return map;
  }, [localActions]);

  const latestFolderActionById = useMemo(() => {
    const map = new Map<string, LocalAction>();
    localActions
      .filter((action) => action.entityType === 'resource_folder')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach((action) => {
        if (!map.has(action.entityId)) {
          map.set(action.entityId, action);
        }
      });
    return map;
  }, [localActions]);

  const offlineCachedResourceIdSet = useMemo(() => new Set(offlineCachedResourceIds), [offlineCachedResourceIds]);

  const sessionOptions = useMemo(() => {
    return sessions.map((session) => ({ value: session.id, label: session.name }));
  }, [sessions]);

  const selectedSession = useMemo(() => sessions.find((session) => session.id === selectedSessionId) ?? null, [sessions, selectedSessionId]);
  const currentSpaceLabel =
    currentSpace === 'personal'
      ? 'Mes fichiers'
      : currentSpace === 'session'
        ? `Documents de partie${selectedSession ? ` · ${selectedSession.name}` : ''}`
        : 'Partagés avec moi';
  const currentSpaceDescription =
    currentSpace === 'personal'
      ? 'Bibliothèque personnelle, disponible en ligne et exploitable hors ligne une fois synchronisée.'
      : currentSpace === 'session'
        ? 'Documents liés à une partie, avec audience et partage contrôlés.'
        : 'Fichiers que d autres comptes ont partagés avec toi.';
  const sessionParticipants = useMemo(() => {
    if (!selectedSession) {
      return [];
    }
    const seen = new Set<string>();
    return (selectedSession.participants || [])
      .filter((participant) => participant.userId && !seen.has(participant.userId))
      .map((participant) => {
        seen.add(participant.userId);
        return {
          id: participant.userId,
          nickname: participant.nickname || participant.displayName || participant.userId,
          role: participant.role
        };
      });
  }, [selectedSession]);

  const handleFilesPicked = (files: FileList | null) => {
    setSelectedFiles(files ? Array.from(files) : []);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFilesPicked(event.dataTransfer.files);
  };

  const uploadSelectedFiles = async () => {
    if (!currentUser || selectedFiles.length === 0) {
      setErrorMessage('Choisis au moins un fichier.');
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      for (const file of selectedFiles) {
        const contentBase64 = await readFileAsBase64(file);
        if (!contentBase64) {
          throw new Error(`Le fichier ${file.name} n'a pas pu être encodé pour l'envoi.`);
        }
        await resourceRepository.create({
          name: file.name.replace(/\.[^.]+$/, '') || file.name,
          originalName: file.name,
          mimeType: inferUploadMimeType(file),
          scopeType: uploadConfig.scopeType,
          scopeRefId: uploadConfig.scopeType === 'account' ? null : uploadConfig.scopeRefId || null,
          visibility: uploadConfig.visibility,
          sharedWithUserIds: selectedResource?.sharedWithUserIds ?? [],
          folderId: uploadConfig.folderId || null,
          sessionAudience: uploadConfig.scopeType === 'session' ? uploadConfig.sessionAudience : undefined,
          sessionMemberUserIds: uploadConfig.scopeType === 'session' ? uploadConfig.sessionMemberUserIds : undefined,
          canReshareInSession: uploadConfig.scopeType === 'session' ? uploadConfig.canReshareInSession : undefined,
          contentBase64
        });
      }
      setStatusMessage(
        navigator.onLine
          ? `${selectedFiles.length} fichier(s) ajouté(s).`
          : `${selectedFiles.length} fichier(s) ajouté(s) localement. Ils partiront à la reconnexion.`
      );
      setSelectedFiles([]);
      setIsUploadModalOpen(false);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Upload impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const created = await resourceRepository.createFolder({
        name: newFolderName,
        scopeType: currentSpace === 'session' ? 'session' : 'account',
        scopeRefId: currentSpace === 'session' ? selectedSessionId : null,
        parentFolderId: selectedFolderId || null,
        visibilityHint: currentSpace === 'session' ? 'all' : 'all'
      });
      setFolders((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setNewFolderName('');
      setIsFolderModalOpen(false);
      setStatusMessage(navigator.onLine ? 'Dossier créé.' : 'Dossier créé localement. Il sera synchronisé au retour en ligne.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Création de dossier impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteResource = async (item: ResourceItem) => {
    if (!window.confirm(`Supprimer « ${item.name} » ?`)) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await resourceRepository.remove(item.id);
      if (selectedResourceId === item.id) {
        setSelectedResourceId('');
      }
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveResource = async () => {
    if (!selectedResource) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updated = await resourceRepository.update(selectedResource.id, {
        name: resourceRename,
        folderId: selectedResource.folderId ?? null,
        visibility: selectedResource.visibility,
        sharedWithUserIds: selectedResource.sharedWithUserIds ?? [],
        sessionAudience: selectedResource.sessionAudience ?? undefined,
        sessionMemberUserIds: selectedResource.sessionMemberUserIds ?? [],
        canReshareInSession: selectedResource.canReshareInSession
      });
      setResources((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
      setSelectedResourceId(updated.id);
      setStatusMessage(navigator.onLine ? `Ressource mise à jour : ${updated.name}` : `Ressource mise à jour localement : ${updated.name}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Mise à jour impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSelectedResourceLocal = (patch: Partial<ResourceItem>) => {
    if (!selectedResource) {
      return;
    }
    const next = { ...selectedResource, ...patch };
    setResources((current) => current.map((item) => (item.id === next.id ? next : item)));
  };

  const addSharedUser = (user: SocialUser) => {
    if (!selectedResource || selectedResource.scopeType === 'session') {
      return;
    }
    const nextIds = Array.from(new Set([...(selectedResource.sharedWithUserIds || []), user.id]));
    updateSelectedResourceLocal({ sharedWithUserIds: nextIds, visibility: nextIds.length > 0 ? 'shared' : selectedResource.visibility });
    setShareSearch('');
  };

  const removeSharedUser = (userId: string) => {
    if (!selectedResource || selectedResource.scopeType === 'session') {
      return;
    }
    const nextIds = (selectedResource.sharedWithUserIds || []).filter((item) => item !== userId);
    updateSelectedResourceLocal({ sharedWithUserIds: nextIds, visibility: nextIds.length > 0 ? 'shared' : 'private' });
  };

  const handleOpenResource = async (resource: ResourceItem) => {
    if (!resource.contentUrl) {
      return;
    }
    setErrorMessage(null);
    try {
      await openOfflineCapableResourceInNewTab({ resourceId: resource.id, src: resource.contentUrl });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'ouvrir la ressource.");
    }
  };

  const visibleFolderTree = useMemo(() => flattenResourceFolders(visibleFolders), [visibleFolders]);
  const selectedFolderPath = buildResourceFolderPath(selectedFolderId || null, visibleFolders);
  const rootFolderLabel = currentSpace === 'shared' ? 'Tous les partages' : 'Racine';
  const batchTargetFolders = selectedResourceIds.length > 0
    ? folders.filter((folder) => {
        const reference = resources.find((item) => item.id === selectedResourceIds[0]);
        if (!reference) {
          return false;
        }
        return folder.scopeType === reference.scopeType && (folder.scopeRefId || '') === (reference.scopeRefId || '');
      })
    : [];
  const canBatchManageSelection = selectedResourceIds.length > 0 && selectedResourceIds.every((id) => {
    const item = resources.find((entry) => entry.id === id);
    return item?.ownerUserId === currentUser?.id;
  });

  const toggleResourceSelection = (resourceId: string, checked: boolean) => {
    setSelectedResourceIds((current) =>
      checked ? Array.from(new Set([...current, resourceId])) : current.filter((item) => item !== resourceId)
    );
  };

  const handleSelectAllVisible = (checked: boolean) => {
    setSelectedResourceIds(checked ? displayedResources.map((item) => item.id) : []);
  };

  const handleBatchMove = async (folderId: string) => {
    if (!canBatchManageSelection || !folderId && folderId !== '') {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await Promise.all(
        selectedResourceIds.map((resourceId) =>
          resourceRepository.update(resourceId, {
            folderId: folderId || null
          })
        )
      );
      setStatusMessage(
        navigator.onLine
          ? `${selectedResourceIds.length} fichier(s) déplacé(s).`
          : `${selectedResourceIds.length} fichier(s) déplacé(s) localement.`
      );
      setSelectedResourceIds([]);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Déplacement en lot impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!canBatchManageSelection || selectedResourceIds.length === 0) {
      return;
    }
    if (!window.confirm(`Supprimer ${selectedResourceIds.length} fichier(s) sélectionné(s) ?`)) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await Promise.all(selectedResourceIds.map((resourceId) => resourceRepository.remove(resourceId)));
      if (selectedResourceId && selectedResourceIds.includes(selectedResourceId)) {
        setSelectedResourceId('');
      }
      setStatusMessage(
        navigator.onLine
          ? `${selectedResourceIds.length} fichier(s) supprimé(s).`
          : `${selectedResourceIds.length} fichier(s) supprimé(s) localement.`
      );
      setSelectedResourceIds([]);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Suppression en lot impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <section className="card resource-page-header">
        <div>
          <p className="home-section__eyebrow" style={{ marginBottom: '0.35rem' }}>MES FICHIERS</p>
          <h1 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{currentSpaceLabel}</h1>
          <p style={{ marginTop: 0, marginBottom: '0.55rem' }}>{currentSpaceDescription}</p>
          <div className="sync-status-stack">
            <span className="offline-cache-badge">{displayedResources.length} fichier(s)</span>
            <span className="offline-cache-badge">{visibleFolders.length} dossier(s)</span>
            <small>{selectedFolderPath.length > 0 ? `Chemin : ${selectedFolderPath.join(' / ')}` : `Chemin : ${rootFolderLabel}`}</small>
          </div>
        </div>
        <div className="resource-page-header__actions">
          {currentSpace !== 'shared' ? (
            <>
              <Button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                disabled={isSaving || (currentSpace === 'session' && !selectedSessionId)}
              >
                Ajouter
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsFolderModalOpen(true)}
                disabled={isSaving || (currentSpace === 'session' && !selectedSessionId)}
              >
                Nouveau dossier
              </Button>
            </>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => void loadAll()} disabled={isLoading || isSaving}>
            Recharger
          </Button>
        </div>
      </section>

      <section className="resource-library-shell session-documents-widget session-documents-widget--explorer">
        <aside className="resource-library-sidebar card session-documents-widget__sidebar">
          <h2 style={{ marginTop: 0 }}>Navigation</h2>
          <div className="resource-space-list">
            <button type="button" className={currentSpace === 'personal' ? 'is-active' : ''} onClick={() => setCurrentSpace('personal')}>
              Mes fichiers
            </button>
            <button type="button" className={currentSpace === 'session' ? 'is-active' : ''} onClick={() => setCurrentSpace('session')}>
              Parties
            </button>
            <button type="button" className={currentSpace === 'shared' ? 'is-active' : ''} onClick={() => setCurrentSpace('shared')}>
              Partagés avec moi
            </button>
          </div>

          {currentSpace === 'session' ? (
            <label style={{ display: 'grid', gap: '0.35rem', marginTop: '1rem' }}>
              <span>Partie</span>
              <select value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
                <option value="">Choisir une partie</option>
                {sessionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Dossiers</h3>
              <small>{visibleFolders.length}</small>
            </div>
            <div className="resource-folder-list" style={{ marginTop: '0.75rem' }}>
              <button type="button" className={!selectedFolderId ? 'is-active' : ''} onClick={() => setSelectedFolderId('')}>
                {rootFolderLabel}
              </button>
              {visibleFolderTree.map((folder) => (
                <button key={folder.id} type="button" className={selectedFolderId === folder.id ? 'is-active' : ''} onClick={() => setSelectedFolderId(folder.id)}>
                  <span className="resource-folder-button__content">
                    <span className="resource-folder-button__name" style={{ paddingLeft: `${folder.depth * 0.95}rem` }}>
                      {folder.depth > 0 ? '↳ ' : ''}
                      {folder.name}
                    </span>
                    <SyncStatusBadge
                      state={resolveEntitySyncBadgeState([latestFolderActionById.get(folder.id)].filter(Boolean) as LocalAction[])}
                      title="État de synchronisation du dossier"
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="resource-library-main card session-documents-widget__content">
          {statusMessage ? <p style={{ color: '#22c55e', marginTop: 0 }}>{statusMessage}</p> : null}
          {errorMessage ? <p style={{ color: '#f87171', marginTop: 0 }}>{errorMessage}</p> : null}
          <div className="resource-content-header">
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Contenu</h3>
              <small>{selectedFolderPath.length > 0 ? `Dossier : ${selectedFolderPath.join(' / ')}` : `Dossier : ${rootFolderLabel}`}</small>
            </div>
            <div className="resource-toolbar">
              <label className="resource-toolbar__checkbox">
                <input
                  type="checkbox"
                  checked={displayedResources.length > 0 && displayedResources.every((item) => selectedResourceIds.includes(item.id))}
                  onChange={(event) => handleSelectAllVisible(event.target.checked)}
                />
                <span>Tout</span>
              </label>
              <label>
                <span>Affichage</span>
                <select value={viewMode} onChange={(event) => setViewMode(event.target.value as ResourceViewMode)}>
                  <option value="thumbnail_s">Miniature</option>
                  <option value="thumbnail_m">Moyenne</option>
                  <option value="thumbnail_l">Grande</option>
                  <option value="names">Noms</option>
                </select>
              </label>
              <label>
                <span>Recherche</span>
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Nom, dossier, portée, auteur..." />
              </label>
              <label>
                <span>Trier par</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as ResourceSortMode)}>
                  <option value="updated_desc">Plus récents</option>
                  <option value="name_asc">Nom</option>
                  <option value="size_desc">Taille</option>
                </select>
              </label>
            </div>
          </div>
          <div className="resource-breadcrumbs" aria-label="Chemin courant">
            <span className="resource-breadcrumb">Bibliothèque</span>
            <span className="resource-breadcrumb">{currentSpaceLabel}</span>
            {(selectedFolderPath.length > 0 ? selectedFolderPath : [rootFolderLabel]).map((label) => (
              <span key={label} className="resource-breadcrumb">
                {label}
              </span>
            ))}
          </div>
          {selectedResourceIds.length > 0 ? (
            <div className="resource-bulk-actions">
              <strong>{selectedResourceIds.length} sélectionné(s)</strong>
              <div className="resource-bulk-actions__controls">
                <select
                  value=""
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue) {
                      void handleBatchMove(nextValue === '__root__' ? '' : nextValue);
                    }
                    event.currentTarget.value = '';
                  }}
                  disabled={!canBatchManageSelection || isSaving}
                >
                  <option value="">Déplacer vers…</option>
                  <option value="__root__">Racine</option>
                  {batchTargetFolders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="secondary" onClick={() => setSelectedResourceIds([])} disabled={isSaving}>
                  Désélectionner
                </Button>
                <Button type="button" variant="secondary" onClick={() => void handleBatchDelete()} disabled={!canBatchManageSelection || isSaving}>
                  Supprimer
                </Button>
              </div>
            </div>
          ) : null}
          {isLoading ? <p>Chargement...</p> : null}
          {!isLoading && displayedResources.length === 0 ? <p>Aucun fichier dans cette vue.</p> : null}
          {!isLoading && displayedResources.length > 0 ? (
            <div className="resource-list-surface session-documents-widget__list">
              <div className={`resource-list resource-list--${viewMode}`.trim()}>
              {viewMode === 'names' ? (
                <div className="resource-list-head" aria-hidden="true">
                  <span />
                  <span>Nom</span>
                  <span>Infos</span>
                  <span>État</span>
                  <span>Action</span>
                </div>
              ) : null}
              {displayedResources.map((item) => {
                const folderPath = buildResourceFolderPath(item.folderId ?? null, currentSpace === 'session' ? sessionFolders : personalFolders);
                return (
                  <article
                    key={item.id}
                    className={`resource-list-item${selectedResourceId === item.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedResourceId(item.id)}
                    onDoubleClick={() => void handleOpenResource(item)}
                  >
                    <label className="resource-list-item__selector" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedResourceIds.includes(item.id)}
                        onChange={(event) => toggleResourceSelection(item.id, event.target.checked)}
                      />
                    </label>
                    <div className="resource-list-item__preview">
                      {item.kind === 'image' && (item.thumbnailUrl || item.contentUrl) ? (
                        <AuthenticatedImage src={item.thumbnailUrl || item.contentUrl || ''} resourceId={item.id} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span>{getResourceKindLabel(item.kind)}</span>
                      )}
                    </div>
                    <div className="resource-list-item__main" data-label="Nom">
                      <strong>{item.name}</strong>
                      <div className="resource-list-item__secondary">
                        <small>{getResourceScopeLabel(item)}</small>
                        {folderPath.length > 0 ? <small>{folderPath.join(' / ')}</small> : <small>{rootFolderLabel}</small>}
                      </div>
                    </div>
                    <div className="resource-list-item__meta" data-label="Infos">
                      <small>{formatResourceUpdatedAt(item.updatedAt)}</small>
                      <small>{formatResourceBytes(item.sizeBytes)}</small>
                      <small>{item.ownerNickname ? `@${item.ownerNickname}` : item.ownerUserId}</small>
                      {getResourceSessionAudienceLabel(item) ? <small>{getResourceSessionAudienceLabel(item)}</small> : null}
                    </div>
                    <div className="resource-list-item__badges" data-label="État">
                      <SyncStatusBadge
                        state={resolveEntitySyncBadgeState([latestResourceActionById.get(item.id)].filter(Boolean) as LocalAction[])}
                        title="État de synchronisation du fichier"
                      />
                      {offlineCachedResourceIdSet.has(item.id) ? <span className="offline-cache-badge">Cache local</span> : null}
                    </div>
                    <div className="resource-list-item__actions" data-label="Action">
                      {item.contentUrl ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleOpenResource(item);
                          }}
                          aria-label={`Ouvrir ${item.name}`}
                        >
                          Ouvrir
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="card session-documents-widget__detail" style={{ margin: 0, padding: '0.85rem' }}>
          <h3 style={{ marginTop: 0 }}>Détails / partage</h3>
          {!selectedResource ? <p>Sélectionne un fichier pour le renommer, le déplacer ou ajuster son partage.</p> : null}
          {selectedResource ? (
            <div className="resource-detail-panel">
                  <div className="sync-status-stack">
                    <SyncStatusBadge
                      state={resolveEntitySyncBadgeState([latestResourceActionById.get(selectedResource.id)].filter(Boolean) as LocalAction[])}
                      title="État de synchronisation du fichier"
                    />
                    {offlineCachedResourceIdSet.has(selectedResource.id) ? <span className="offline-cache-badge">Disponible hors ligne</span> : null}
                  </div>
                  <div className="resource-preview-panel">
                    <ResourcePreview resource={selectedResource} alt={selectedResource.name} minHeight="260px" />
                    {selectedResource.contentUrl ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <small>
                          {getResourceKindLabel(selectedResource.kind)} · {formatResourceBytes(selectedResource.sizeBytes)}
                        </small>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <Button type="button" variant="secondary" onClick={() => setIsPreviewModalOpen(true)}>
                            Prévisualiser en grand
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => void handleOpenResource(selectedResource)}>
                            Ouvrir dans un nouvel onglet
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <section className="resource-detail-section">
                    <strong>Organisation</strong>
                    <label>
                      <span>Nom</span>
                      <input type="text" value={resourceRename} onChange={(event) => setResourceRename(event.target.value)} />
                    </label>

                    <label>
                      <span>Dossier</span>
                      <select value={selectedResource.folderId ?? ''} onChange={(event) => updateSelectedResourceLocal({ folderId: event.target.value || null })}>
                        <option value="">Racine</option>
                        {(selectedResource.scopeType === 'session' ? folders.filter((folder) => folder.scopeType === 'session' && folder.scopeRefId === selectedResource.scopeRefId) : folders.filter((folder) => folder.scopeType === selectedResource.scopeType && (folder.scopeRefId || '') === (selectedResource.scopeRefId || ''))).map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </section>

                  {selectedResource.scopeType === 'session' ? (
                    <section className="resource-detail-section">
                      <strong>Partage de partie</strong>
                      <label>
                        <span>Audience</span>
                        <select value={selectedResource.sessionAudience ?? 'session_all'} onChange={(event) => updateSelectedResourceLocal({ sessionAudience: event.target.value as SessionResourceAudience })}>
                          <option value="session_all">Commun</option>
                          <option value="session_gm">MJ uniquement</option>
                          <option value="session_member">Joueur(s) ciblé(s)</option>
                          <option value="private">Privé</option>
                        </select>
                      </label>
                      {selectedResource.sessionAudience === 'session_member' ? (
                        <label>
                          <span>Joueurs ciblés</span>
                          <select
                            multiple
                            value={selectedResource.sessionMemberUserIds ?? []}
                            onChange={(event) =>
                              updateSelectedResourceLocal({
                                sessionMemberUserIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                              })
                            }
                          >
                            {sessionParticipants.map((participant) => (
                              <option key={participant.id} value={participant.id}>
                                {participant.nickname}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={selectedResource.canReshareInSession !== false}
                          onChange={(event) => updateSelectedResourceLocal({ canReshareInSession: event.target.checked })}
                        />
                        <span>Repartage en partie autorisé</span>
                      </label>
                    </section>
                  ) : (
                    <section className="resource-detail-section">
                      <strong>Partage</strong>
                      <label>
                        <span>Visibilité</span>
                        <select value={selectedResource.visibility} onChange={(event) => updateSelectedResourceLocal({ visibility: event.target.value as ResourceVisibility })}>
                          <option value="private">Privée</option>
                          <option value="shared">Partagée</option>
                          <option value="public">Publique</option>
                        </select>
                      </label>
                      <div style={{ display: 'grid', gap: '0.4rem' }}>
                        <span>Partagé avec</span>
                        <SocialUserAutocomplete
                          value={shareSearch}
                          onChange={setShareSearch}
                          onSelect={(user) => addSharedUser(user)}
                          placeholder="Rechercher un utilisateur"
                          filterResults={(items) =>
                            items.filter(
                              (item) =>
                                item.id !== currentUser?.id && !(selectedResource.sharedWithUserIds || []).includes(item.id)
                            )
                          }
                        />
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {(selectedResource.sharedWithUserIds || []).map((userId) => (
                            <button key={userId} type="button" className="resource-chip" onClick={() => removeSharedUser(userId)}>
                              @{sharedUsersById[userId]?.nickname || userId} ×
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  <div className="resource-detail-panel__actions">
                    <Button type="button" onClick={() => void handleSaveResource()} disabled={isSaving}>
                      Enregistrer les changements
                    </Button>
                    {selectedResource.ownerUserId === currentUser?.id ? (
                      <Button type="button" variant="secondary" onClick={() => void handleDeleteResource(selectedResource)} disabled={isSaving}>
                        Supprimer
                      </Button>
                    ) : null}
                  </div>
            </div>
          ) : null}
        </aside>
      </section>
      {isUploadModalOpen ? (
        <div className="resource-preview-modal" role="dialog" aria-modal="true" onClick={() => setIsUploadModalOpen(false)}>
          <div className="resource-preview-modal__dialog resource-action-modal" onClick={(event) => event.stopPropagation()}>
            <div className="resource-preview-modal__header">
              <div>
                <strong>Ajouter des fichiers</strong>
                <small>Choisis les fichiers, la portée et le dossier cible.</small>
              </div>
              <Button type="button" variant="secondary" onClick={() => setIsUploadModalOpen(false)}>
                Fermer
              </Button>
            </div>
            <div className="resource-preview-modal__body">
              <div
                className={`resource-dropzone${isDragging ? ' is-dragging' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <strong>Dépose tes fichiers ici</strong>
                <small>Formats acceptés : PNG, JPG, WEBP, GIF, PDF, TXT, MD, JSON, MP4</small>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <input type="file" multiple onChange={(event: ChangeEvent<HTMLInputElement>) => handleFilesPicked(event.target.files)} />
                  <Button type="button" onClick={() => void uploadSelectedFiles()} disabled={isSaving || selectedFiles.length === 0 || (uploadConfig.scopeType === 'session' && !uploadConfig.scopeRefId)}>
                    {isSaving ? 'Upload...' : `Téléverser ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}`}
                  </Button>
                </div>
                {selectedFiles.length > 0 ? (
                  <div className="resource-upload-pending">
                    <strong>{selectedFiles.length} fichier(s) prêt(s) à être envoyés</strong>
                    <ul className="resource-upload-pending__list">
                      {selectedFiles.map((file) => (
                        <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                          <span>{file.name}</span>
                          <small>{formatResourceBytes(file.size)}</small>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="resource-upload-grid">
                <label>
                  <span>Portée</span>
                  <select
                    value={uploadConfig.scopeType}
                    onChange={(event) =>
                      setUploadConfig((current) => ({
                        ...current,
                        scopeType: event.target.value as ResourceScopeType,
                        scopeRefId: event.target.value === 'session' ? selectedSessionId : '',
                        folderId: ''
                      }))
                    }
                    disabled={isSaving}
                  >
                    <option value="account">Mes fichiers</option>
                    {canManageSystems ? <option value="system">Système</option> : null}
                    <option value="session">Partie</option>
                  </select>
                </label>

                {uploadConfig.scopeType === 'system' ? (
                  <label>
                    <span>Système lié</span>
                    <select value={uploadConfig.scopeRefId} onChange={(event) => setUploadConfig((current) => ({ ...current, scopeRefId: event.target.value, folderId: '' }))} disabled={isSaving}>
                      <option value="">Choisir un système</option>
                      {systems.map((system) => (
                        <option key={system.id} value={system.id}>
                          {system.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {uploadConfig.scopeType === 'session' ? (
                  <>
                    <label>
                      <span>Partie liée</span>
                      <select value={uploadConfig.scopeRefId} onChange={(event) => setUploadConfig((current) => ({ ...current, scopeRefId: event.target.value, folderId: '' }))} disabled={isSaving}>
                        <option value="">Choisir une partie</option>
                        {sessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {session.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Audience de partie</span>
                      <select value={uploadConfig.sessionAudience} onChange={(event) => setUploadConfig((current) => ({ ...current, sessionAudience: event.target.value as SessionResourceAudience }))}>
                        <option value="session_all">Commun</option>
                        <option value="session_gm">MJ uniquement</option>
                        <option value="session_member">Joueur(s) ciblé(s)</option>
                        <option value="private">Privé</option>
                      </select>
                    </label>
                    <label>
                      <span>Dossier</span>
                      <select value={uploadConfig.folderId} onChange={(event) => setUploadConfig((current) => ({ ...current, folderId: event.target.value }))}>
                        <option value="">Racine</option>
                        {folders
                          .filter((folder) => folder.scopeType === 'session' && folder.scopeRefId === uploadConfig.scopeRefId)
                          .map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {uploadConfig.sessionAudience === 'session_member' ? (
                      <label style={{ gridColumn: '1 / -1' }}>
                        <span>Joueurs ciblés</span>
                        <select
                          multiple
                          value={uploadConfig.sessionMemberUserIds}
                          onChange={(event) =>
                            setUploadConfig((current) => ({
                              ...current,
                              sessionMemberUserIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                            }))
                          }
                        >
                          {sessionParticipants.map((participant) => (
                            <option key={participant.id} value={participant.id}>
                              {participant.nickname} ({participant.role})
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={uploadConfig.canReshareInSession}
                        onChange={(event) => setUploadConfig((current) => ({ ...current, canReshareInSession: event.target.checked }))}
                      />
                      <span>Repartage en partie autorisé</span>
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      <span>Visibilité</span>
                      <select value={uploadConfig.visibility} onChange={(event) => setUploadConfig((current) => ({ ...current, visibility: event.target.value as ResourceVisibility }))}>
                        <option value="private">Privée</option>
                        <option value="shared">Partagée</option>
                        <option value="public">Publique</option>
                      </select>
                    </label>
                    <label>
                      <span>Dossier</span>
                      <select value={uploadConfig.folderId} onChange={(event) => setUploadConfig((current) => ({ ...current, folderId: event.target.value }))}>
                        <option value="">Racine</option>
                        {folders
                          .filter((folder) => folder.scopeType === uploadConfig.scopeType && (folder.scopeRefId || '') === (uploadConfig.scopeRefId || ''))
                          .map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isFolderModalOpen ? (
        <div className="resource-preview-modal" role="dialog" aria-modal="true" onClick={() => setIsFolderModalOpen(false)}>
          <div className="resource-preview-modal__dialog resource-action-modal resource-action-modal--compact" onClick={(event) => event.stopPropagation()}>
            <div className="resource-preview-modal__header">
              <div>
                <strong>Nouveau dossier</strong>
                <small>Crée un dossier dans l’espace et le niveau courants.</small>
              </div>
              <Button type="button" variant="secondary" onClick={() => setIsFolderModalOpen(false)}>
                Fermer
              </Button>
            </div>
            <div className="resource-preview-modal__body">
              <div className="resource-folder-form">
                <label>
                  <span>Nom du dossier</span>
                  <input type="text" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Nom du dossier" disabled={isSaving || (currentSpace === 'session' && !selectedSessionId)} />
                </label>
                <div className="sync-status-stack">
                  <small>Espace : {currentSpaceLabel}</small>
                  <small>Dossier parent : {selectedFolderPath.length > 0 ? selectedFolderPath.join(' / ') : rootFolderLabel}</small>
                </div>
                <Button type="button" onClick={() => void handleCreateFolder()} disabled={!newFolderName.trim() || isSaving || (currentSpace === 'session' && !selectedSessionId)}>
                  {isSaving ? 'Création…' : 'Créer le dossier'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {selectedResource && isPreviewModalOpen ? (
        <div className="resource-preview-modal" role="dialog" aria-modal="true" onClick={() => setIsPreviewModalOpen(false)}>
          <div className="resource-preview-modal__dialog" onClick={(event) => event.stopPropagation()}>
            <div className="resource-preview-modal__header">
              <div>
                <strong>{selectedResource.name}</strong>
                <small>
                  {getResourceKindLabel(selectedResource.kind)} · {formatResourceBytes(selectedResource.sizeBytes)}
                </small>
              </div>
              <Button type="button" variant="secondary" onClick={() => setIsPreviewModalOpen(false)}>
                Fermer
              </Button>
            </div>
            <div className="resource-preview-modal__body">
              <ResourcePreview resource={selectedResource} alt={selectedResource.name} minHeight="70vh" maxTextLength={20000} />
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
