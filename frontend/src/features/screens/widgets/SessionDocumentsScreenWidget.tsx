import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import AuthenticatedImage from '../../../components/AuthenticatedImage';
import Button from '../../../components/Button';
import ResourcePreview from '../../../components/ResourcePreview';
import { resourceRepository, sessionRepository } from '../../../data/repositories';
import { openOfflineCapableResourceInNewTab } from '../../../services/offlineResourceAccessService';
import { ResourceFolder, ResourceItem } from '../../../types/resource';
import { SessionResourceAudience } from '../../../types/resource';
import { Session, SessionRuntimeConnection } from '../../../types/session';
import { User } from '../../../types/user';
import {
  buildResourceFolderPath,
  flattenResourceFolders,
  formatResourceBytes,
  formatResourceUpdatedAt,
  getResourceKindLabel,
  getResourceScopeLabel,
  getResourceSessionAudienceLabel
} from '../../resources/utils/resourceExplorer';
import { RuntimeTargetDescriptor, writeRuntimeTargetState } from '../runtimeTargets';

type SessionDocumentsScreenWidgetProps = {
  currentUser: User;
  currentSession: Session;
  role: 'gm' | 'player';
  templateId: string;
  scope?: string;
  allowUpload?: boolean;
  runtimeTargets?: RuntimeTargetDescriptor[];
};

function inferMimeType(file: File): string {
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

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',').pop() || '' : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Erreur de lecture fichier'));
    reader.readAsDataURL(file);
  });
}

export default function SessionDocumentsScreenWidget({
  currentUser,
  currentSession,
  role,
  templateId,
  scope = 'all',
  allowUpload = true,
  runtimeTargets = []
}: SessionDocumentsScreenWidgetProps) {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [folders, setFolders] = useState<ResourceFolder[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [isPublishingToSession, setIsPublishingToSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runtimeConnections, setRuntimeConnections] = useState<SessionRuntimeConnection[]>([]);
  const [selectedRecipientUserIds, setSelectedRecipientUserIds] = useState<string[]>([]);

  const loadResources = async () => {
    try {
      const [sessionResources, accountResources, folderItems] = await Promise.all([
        resourceRepository.list({ scopeType: 'session', scopeRefId: currentSession.id }),
        resourceRepository.list({ scopeType: 'account' }),
        resourceRepository.listFolders()
      ]);
      const merged = [...sessionResources, ...accountResources].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      setResources(merged);
      setFolders(folderItems);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les ressources.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession.id, currentUser.id]);

  useEffect(() => {
    if (role !== 'gm') {
      setRuntimeConnections([]);
      return () => undefined;
    }

    let active = true;
    const loadConnections = async () => {
      const items = await sessionRepository.listRuntimeConnections(currentSession.id).catch(() => []);
      if (active) {
        setRuntimeConnections(items);
      }
    };

    void loadConnections();
    const interval = window.setInterval(() => {
      void loadConnections();
    }, 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentSession.id, role]);

  const filteredResources = useMemo(() => {
    let items = resources;
    if (scope === 'session_shared') {
      items = items.filter((resource) => resource.scopeType === 'session' && resource.scopeRefId === currentSession.id);
    } else if (scope === 'user_private') {
      items = items.filter((resource) => resource.scopeType === 'account' && resource.ownerUserId === currentUser.id);
    }

    if (selectedFolderId) {
      items = items.filter((resource) => resource.folderId === selectedFolderId);
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery) {
      items = items.filter((resource) =>
        [
          resource.name,
          resource.originalName,
          resource.ownerNickname,
          getResourceScopeLabel(resource),
          getResourceSessionAudienceLabel(resource) ?? '',
          buildResourceFolderPath(resource.folderId ?? null, folders).join(' / ')
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery))
      );
    }

    return [...items].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }, [currentSession.id, currentUser.id, folders, resources, scope, searchQuery, selectedFolderId]);

  const selectedResource = useMemo(
    () => filteredResources.find((resource) => resource.id === selectedResourceId) ?? null,
    [filteredResources, selectedResourceId]
  );

  const visibleFolders = useMemo(() => {
    if (scope === 'session_shared') {
      return folders.filter((folder) => folder.scopeType === 'session' && folder.scopeRefId === currentSession.id);
    }
    if (scope === 'user_private') {
      return folders.filter((folder) => folder.scopeType === 'account' && folder.ownerUserId === currentUser.id);
    }
    return folders.filter(
      (folder) =>
        (folder.scopeType === 'session' && folder.scopeRefId === currentSession.id) ||
        (folder.scopeType === 'account' && folder.ownerUserId === currentUser.id)
    );
  }, [currentSession.id, currentUser.id, folders, scope]);

  const flattenedFolders = useMemo(() => flattenResourceFolders(visibleFolders), [visibleFolders]);
  const selectedFolderPath = useMemo(() => buildResourceFolderPath(selectedFolderId || null, visibleFolders), [selectedFolderId, visibleFolders]);

  const sessionParticipants = useMemo(() => {
    const seen = new Set<string>();
    return (currentSession.participants || [])
      .filter((participant) => participant.userId && !seen.has(participant.userId))
      .map((participant) => {
        seen.add(participant.userId);
        return {
          id: participant.userId,
          nickname: participant.nickname || participant.displayName || participant.userId
        };
      });
  }, [currentSession.participants]);

  const canManageSelectedResource = Boolean(
    selectedResource &&
      selectedResource.scopeType === 'session' &&
      (selectedResource.ownerUserId === currentUser.id || role === 'gm')
  );

  const overlayTargets = useMemo(
    () => runtimeTargets.filter((target) => target.widgetType === 'open_target_overlay'),
    [runtimeTargets]
  );

  const playerRuntimeRecipients = useMemo(() => {
    return runtimeConnections
      .filter((entry) => entry.role === 'player' && entry.active)
      .map((entry) => ({
        ...entry,
        overlayTarget:
          entry.availableOverlayTargets?.find((target) => (target.channelKey || 'primary') === 'primary') ??
          entry.availableOverlayTargets?.[0] ??
          null
      }))
      .filter((entry) => Boolean(entry.overlayTarget));
  }, [runtimeConnections]);

  useEffect(() => {
    if (role !== 'gm') {
      setSelectedRecipientUserIds([]);
      return;
    }
    setSelectedRecipientUserIds((current) => current.filter((userId) => playerRuntimeRecipients.some((entry) => entry.userId === userId)));
  }, [playerRuntimeRecipients, role]);

  useEffect(() => {
    const resourceIds = new Set(filteredResources.map((resource) => resource.id));
    setSelectedResourceId((current) => {
      if (current && resourceIds.has(current)) {
        return current;
      }
      return filteredResources[0]?.id || '';
    });
  }, [filteredResources]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    try {
      const base64 = await readFileAsBase64(file);
      await resourceRepository.create({
        name: file.name.replace(/\.[^.]+$/, ''),
        originalName: file.name,
        mimeType: inferMimeType(file),
        scopeType: scope === 'user_private' ? 'account' : 'session',
        scopeRefId: scope === 'user_private' ? null : currentSession.id,
        visibility: scope === 'user_private' ? 'private' : role === 'gm' ? 'public' : 'shared',
        sessionAudience: scope === 'user_private' ? undefined : role === 'gm' ? 'session_all' : 'session_member',
        sessionMemberUserIds: scope === 'user_private' ? undefined : role === 'gm' ? [] : [currentUser.id],
        contentBase64: base64
      });
      await loadResources();
      event.target.value = '';
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'envoyer le document.");
    } finally {
      setIsUploading(false);
    }
  };

  const updateSelectedResourceLocal = (patch: Partial<ResourceItem>) => {
    if (!selectedResource) {
      return;
    }
    setResources((current) => current.map((resource) => (resource.id === selectedResource.id ? { ...resource, ...patch } : resource)));
  };

  const handleSaveShare = async () => {
    if (!selectedResource || selectedResource.scopeType !== 'session' || !canManageSelectedResource) {
      return;
    }
    setIsSavingShare(true);
    setErrorMessage(null);
    try {
      const updated = await resourceRepository.update(selectedResource.id, {
        folderId: selectedResource.folderId ?? null,
        sessionAudience: (selectedResource.sessionAudience ?? 'session_all') as SessionResourceAudience,
        sessionMemberUserIds: selectedResource.sessionMemberUserIds ?? [],
        canReshareInSession: selectedResource.canReshareInSession !== false
      });
      setResources((current) => current.map((resource) => (resource.id === updated.id ? updated : resource)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de mettre à jour le partage.');
    } finally {
      setIsSavingShare(false);
    }
  };

  const handlePublishToSession = async () => {
    if (!selectedResource || selectedResource.scopeType !== 'account') {
      return;
    }
    setIsPublishingToSession(true);
    setErrorMessage(null);
    try {
      const published = await resourceRepository.publishToSession({
        resourceId: selectedResource.id,
        sessionId: currentSession.id,
        sessionAudience: role === 'gm' ? 'session_all' : 'session_member',
        sessionMemberUserIds: role === 'gm' ? [] : [currentUser.id],
        canReshareInSession: true
      });
      await loadResources();
      setSelectedResourceId(published.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de publier ce document dans la partie.');
    } finally {
      setIsPublishingToSession(false);
    }
  };

  const handleOpenResource = async (resource: ResourceItem) => {
    if (!resource.contentUrl) {
      return;
    }
    setErrorMessage(null);
    try {
      await openOfflineCapableResourceInNewTab({ resourceId: resource.id, src: resource.contentUrl });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'ouvrir le document.");
    }
  };

  const handleOpenOnRecipients = (resource: ResourceItem) => {
    const targets = playerRuntimeRecipients.filter((entry) => selectedRecipientUserIds.includes(entry.userId) && entry.overlayTarget);
    if (!targets.length) {
      setErrorMessage('Sélectionne au moins un joueur connecté disposant d un overlay principal.');
      return;
    }
    targets.forEach((entry) => {
      const overlayTarget = entry.overlayTarget;
      if (!overlayTarget || !entry.templateId) {
        return;
      }
      writeRuntimeTargetState({
        sessionId: currentSession.id,
        templateId: entry.templateId,
        targetId: overlayTarget.targetId,
        state: {
          visible: true,
          content: {
            kind: 'resource',
            title: resource.name,
            resource
          },
          updatedAt: new Date().toISOString()
        }
      });
    });
    setErrorMessage(null);
  };

  return (
    <div style={{ display: 'grid', gap: '0.7rem', height: '100%', alignContent: 'start', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Documents</strong>
        {allowUpload ? (
          <label className="button secondary" style={{ cursor: isUploading ? 'progress' : 'pointer' }}>
            {isUploading ? 'Upload...' : 'Ajouter'}
            <input type="file" style={{ display: 'none' }} onChange={(event) => void handleUpload(event)} disabled={isUploading} />
          </label>
        ) : null}
      </div>

      {role === 'gm' ? (
        <section className="card" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>Écrans joueurs connectés</strong>
            <small>{playerRuntimeRecipients.length} cible(s) disponible(s)</small>
          </div>
          {playerRuntimeRecipients.length ? (
            <>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <Button type="button" variant="secondary" onClick={() => setSelectedRecipientUserIds(playerRuntimeRecipients.map((entry) => entry.userId))}>
                  Tous les joueurs
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSelectedRecipientUserIds([])}>
                  Tout désélectionner
                </Button>
              </div>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {playerRuntimeRecipients.map((entry) => (
                  <label key={entry.userId} className="checkbox-row" style={{ alignItems: 'start' }}>
                    <input
                      type="checkbox"
                      checked={selectedRecipientUserIds.includes(entry.userId)}
                      onChange={(event) =>
                        setSelectedRecipientUserIds((current) =>
                          event.target.checked ? Array.from(new Set([...current, entry.userId])) : current.filter((value) => value !== entry.userId)
                        )
                      }
                    />
                    <span>
                      <strong>{entry.nickname || entry.displayName || entry.userId}</strong>
                      <small style={{ display: 'block', color: '#cbd5e1' }}>
                        {[entry.templateName, entry.setName, entry.screenName].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p style={{ margin: 0 }}>Aucun écran joueur connecté avec un overlay principal disponible.</p>
          )}
        </section>
      ) : null}

      {isLoading ? <p style={{ margin: 0 }}>Chargement des documents...</p> : null}
      {errorMessage ? <p style={{ margin: 0, color: '#fca5a5' }}>{errorMessage}</p> : null}
      {!isLoading && filteredResources.length === 0 ? <p style={{ margin: 0 }}>Aucun document visible dans cette vue.</p> : null}

      <div className="session-documents-widget session-documents-widget--explorer">
        <aside className="card session-documents-widget__sidebar" style={{ margin: 0 }}>
          <div className="session-documents-widget__sidebar-header">
            <strong>Navigation</strong>
            <small>{flattenedFolders.length} dossier(s)</small>
          </div>
          <label className="session-documents-widget__search">
            <span>Recherche</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Nom, dossier, portée..."
            />
          </label>
          <div className="resource-folder-list session-documents-widget__folders">
            <button type="button" className={!selectedFolderId ? 'is-active' : ''} onClick={() => setSelectedFolderId('')}>
              {selectedFolderPath.length > 0 ? 'Racine' : 'Tous les fichiers'}
            </button>
            {flattenedFolders.map((folder) => (
              <button key={folder.id} type="button" className={selectedFolderId === folder.id ? 'is-active' : ''} onClick={() => setSelectedFolderId(folder.id)}>
                <span className="resource-folder-button__content">
                  <span className="resource-folder-button__name" style={{ paddingLeft: `${folder.depth * 0.95}rem` }}>
                    {folder.depth > 0 ? '↳ ' : ''}
                    {folder.name}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="card session-documents-widget__content" style={{ margin: 0 }}>
          <div className="resource-content-header">
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Explorateur</h3>
              <small>{selectedFolderPath.length > 0 ? `Dossier : ${selectedFolderPath.join(' / ')}` : 'Dossier : Racine'}</small>
            </div>
            <small>{filteredResources.length} fichier(s)</small>
          </div>
          <div className="resource-breadcrumbs" aria-label="Chemin courant">
            <span className="resource-breadcrumb">Documents</span>
            {(selectedFolderPath.length > 0 ? selectedFolderPath : ['Racine']).map((label) => (
              <span key={label} className="resource-breadcrumb">
                {label}
              </span>
            ))}
          </div>
          {!isLoading && filteredResources.length > 0 ? (
            <div className="resource-list-surface session-documents-widget__list">
              <div className="resource-list resource-list--thumbnail_l resource-list--widget-gallery">
                {filteredResources.map((resource) => {
                  const folderPath = buildResourceFolderPath(resource.folderId ?? null, visibleFolders);
                  return (
                    <article
                      key={resource.id}
                      className={`resource-list-item${selectedResourceId === resource.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedResourceId(resource.id)}
                      onDoubleClick={() => void handleOpenResource(resource)}
                    >
                      <div className="resource-list-item__selector">
                        <span className="resource-kind-pill">{getResourceKindLabel(resource.kind)}</span>
                      </div>
                      <div className="resource-list-item__preview">
                        {resource.kind === 'image' && (resource.thumbnailUrl || resource.contentUrl) ? (
                          <AuthenticatedImage
                            src={resource.thumbnailUrl || resource.contentUrl || ''}
                            resourceId={resource.id}
                            alt={resource.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span>{getResourceKindLabel(resource.kind)}</span>
                        )}
                      </div>
                      <div className="resource-list-item__main" data-label="Nom">
                        <strong>{resource.name}</strong>
                        <div className="resource-list-item__secondary">
                          {folderPath.length > 0 ? <small>{folderPath.join(' / ')}</small> : <small>Racine</small>}
                        </div>
                      </div>
                      <div className="resource-list-item__meta" data-label="Infos">
                        <small>{formatResourceBytes(resource.sizeBytes)}</small>
                      </div>
                      <div className="resource-list-item__badges" data-label="État">
                        {resource.ownerNickname ? <span className="offline-cache-badge">@{resource.ownerNickname}</span> : null}
                      </div>
                      <div className="resource-list-item__actions" data-label="Action">
                        {resource.contentUrl ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleOpenResource(resource);
                            }}
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

        <aside className="card session-documents-widget__detail" style={{ margin: 0, padding: '0.75rem', display: 'grid', gap: '0.75rem', alignContent: 'start' }}>
          {!selectedResource ? <p style={{ margin: 0 }}>Sélectionne un document pour le prévisualiser ou ajuster son partage.</p> : null}
          {selectedResource ? (
            <>
              <strong>{selectedResource.name}</strong>
              <ResourcePreview resource={selectedResource} alt={selectedResource.name} minHeight="220px" />
              <div className="sync-status-stack">
                <small>{getResourceKindLabel(selectedResource.kind)} · {formatResourceBytes(selectedResource.sizeBytes)}</small>
                <small>{formatResourceUpdatedAt(selectedResource.updatedAt)}</small>
                <small>{getResourceScopeLabel(selectedResource)}</small>
              </div>
              {selectedResource.contentUrl ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button type="button" variant="secondary" onClick={() => void handleOpenResource(selectedResource)}>
                    Ouvrir
                  </Button>
                  {overlayTargets.length ? (
                    <details className="screen-runtime-open-in-details">
                      <summary className="button secondary">Ouvrir dans</summary>
                      <div className="screen-runtime-open-in-menu">
                        {overlayTargets.map((target) => (
                          <button
                            key={target.id}
                            type="button"
                            className="screen-runtime-open-in-menu__item"
                            onClick={() =>
                              writeRuntimeTargetState({
                                sessionId: currentSession.id,
                                templateId,
                                targetId: target.id,
                                state: {
                                  visible: true,
                                  content: {
                                    kind: 'resource',
                                    title: selectedResource.name,
                                    resource: selectedResource
                                  },
                                  updatedAt: new Date().toISOString()
                                }
                              })
                            }
                          >
                            {target.title} · {target.screenName}
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {role === 'gm' && playerRuntimeRecipients.length ? (
                    <Button type="button" variant="secondary" onClick={() => handleOpenOnRecipients(selectedResource)}>
                      Ouvrir chez les joueurs sélectionnés
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {selectedResource.scopeType === 'session' ? (
                <>
                  <label style={{ display: 'grid', gap: '0.35rem' }}>
                    <span>Audience</span>
                    <select
                      value={selectedResource.sessionAudience ?? 'session_all'}
                      onChange={(event) => updateSelectedResourceLocal({ sessionAudience: event.target.value as SessionResourceAudience })}
                      disabled={!canManageSelectedResource}
                    >
                      <option value="session_all">Commun</option>
                      <option value="session_gm">MJ uniquement</option>
                      <option value="session_member">Joueur(s) ciblé(s)</option>
                      <option value="private">Privé</option>
                    </select>
                  </label>
                  {selectedResource.sessionAudience === 'session_member' ? (
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Joueurs ciblés</span>
                      <select
                        multiple
                        value={selectedResource.sessionMemberUserIds ?? []}
                        onChange={(event) =>
                          updateSelectedResourceLocal({
                            sessionMemberUserIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                          })
                        }
                        disabled={!canManageSelectedResource}
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
                      disabled={!canManageSelectedResource}
                    />
                    <span>Repartage autorisé dans la partie</span>
                  </label>
                  {canManageSelectedResource ? (
                    <Button type="button" onClick={() => void handleSaveShare()} disabled={isSavingShare}>
                      {isSavingShare ? 'Enregistrement...' : 'Enregistrer le partage'}
                    </Button>
                  ) : (
                    <small>Tu peux consulter ce document, mais pas modifier son partage.</small>
                  )}
                </>
              ) : (
                <>
                  <small>Document personnel. Tu peux le publier dans cette partie pour le partager ensuite avec les membres autorisés.</small>
                  <Button type="button" onClick={() => void handlePublishToSession()} disabled={isPublishingToSession}>
                    {isPublishingToSession ? 'Publication...' : 'Publier dans la partie'}
                  </Button>
                </>
              )}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
