import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { resourceRepository } from '../data/repositories';
import { ResourceItem, ResourceKind, ResourceScopeType, ResourceVisibility, SessionResourceAudience } from '../types/resource';
import Button from './Button';
import ResourcePreview from './ResourcePreview';

type ResourcePickerValue = {
  resourceId?: string;
  url?: string;
};

type ResourcePickerFieldProps = {
  label?: string;
  value: ResourcePickerValue;
  onChange: (value: ResourcePickerValue) => void;
  kinds?: ResourceKind[];
  scopeTypes?: ResourceScopeType[];
  resources?: ResourceItem[];
  disabled?: boolean;
  allowManualUrl?: boolean;
  allowUpload?: boolean;
  uploadScopeType?: ResourceScopeType;
  uploadScopeRefId?: string | null;
  uploadVisibility?: ResourceVisibility;
  uploadFolderId?: string | null;
  uploadSessionAudience?: SessionResourceAudience;
  uploadSessionMemberUserIds?: string[];
  uploadCanReshareInSession?: boolean;
  previewAlt?: string;
  urlPlaceholder?: string;
  emptyOptionLabel?: string;
};

function inferMimeType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.ogv')) return 'video/ogg';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.ogg') || name.endsWith('.oga')) return 'audio/ogg';
  if (name.endsWith('.m4a')) return 'audio/mp4';
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
      resolve(result.includes(',') ? result.split(',').slice(1).join(',') : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Impossible de lire le fichier.'));
    reader.readAsDataURL(file);
  });
}

export default function ResourcePickerField({
  label = 'Ressource',
  value,
  onChange,
  kinds = [],
  scopeTypes,
  resources,
  disabled = false,
  allowManualUrl = true,
  allowUpload = false,
  uploadScopeType = 'account',
  uploadScopeRefId = null,
  uploadVisibility = 'private',
  uploadFolderId = null,
  uploadSessionAudience = 'session_all',
  uploadSessionMemberUserIds = [],
  uploadCanReshareInSession = true,
  previewAlt = 'Ressource',
  urlPlaceholder = 'https://...',
  emptyOptionLabel = 'Aucune ressource'
}: ResourcePickerFieldProps) {
  const [loadedResources, setLoadedResources] = useState<ResourceItem[]>(resources ?? []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resources) {
      setLoadedResources(resources);
      return;
    }
    let active = true;
    async function load() {
      try {
        const items = await resourceRepository.list();
        if (active) {
          setLoadedResources(items);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les ressources.');
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [resources]);

  const filteredResources = useMemo(() => {
    return loadedResources.filter((item) => {
      if (kinds.length > 0 && !kinds.includes(item.kind)) {
        return false;
      }
      if (scopeTypes && scopeTypes.length > 0 && !scopeTypes.includes(item.scopeType)) {
        return false;
      }
      return true;
    });
  }, [kinds, loadedResources, scopeTypes]);

  const selectedResource = useMemo(
    () => filteredResources.find((item) => item.id === value.resourceId) ?? loadedResources.find((item) => item.id === value.resourceId) ?? null,
    [filteredResources, loadedResources, value.resourceId]
  );

  const handleUpload = async () => {
    if (!selectedFile || disabled) {
      return;
    }
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const created = await resourceRepository.create({
        name: selectedFile.name.replace(/\.[^.]+$/, '') || selectedFile.name,
        originalName: selectedFile.name,
        mimeType: inferMimeType(selectedFile),
        scopeType: uploadScopeType,
        scopeRefId: uploadScopeRefId,
        visibility: uploadVisibility,
        folderId: uploadFolderId,
        sessionAudience: uploadScopeType === 'session' ? uploadSessionAudience : undefined,
        sessionMemberUserIds: uploadScopeType === 'session' ? uploadSessionMemberUserIds : undefined,
        canReshareInSession: uploadScopeType === 'session' ? uploadCanReshareInSession : undefined,
        contentBase64: await readFileAsBase64(selectedFile)
      });
      setLoadedResources((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      onChange({ resourceId: created.id, url: created.contentUrl ?? '' });
      setSelectedFile(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Upload impossible.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="resource-picker-field">
      <label style={{ display: 'grid', gap: '0.35rem' }}>
        <span>{label}</span>
        <select
          value={value.resourceId ?? ''}
          onChange={(event) => {
            const resource = filteredResources.find((item) => item.id === event.target.value) ?? null;
            onChange({ resourceId: event.target.value || undefined, url: resource?.contentUrl ?? '' });
          }}
          disabled={disabled}
        >
          <option value="">{emptyOptionLabel}</option>
          {filteredResources.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.name} [{resource.scopeType}]
            </option>
          ))}
        </select>
      </label>

      {allowManualUrl ? (
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Ou URL manuelle</span>
          <input
            type="text"
            value={value.url ?? ''}
            onChange={(event) => onChange({ resourceId: undefined, url: event.target.value })}
            disabled={disabled}
            placeholder={urlPlaceholder}
          />
        </label>
      ) : null}

      <div className="resource-picker-field__preview">
        <ResourcePreview resource={selectedResource} src={!selectedResource ? value.url : selectedResource?.contentUrl} alt={previewAlt} minHeight="180px" />
      </div>

      {allowUpload ? (
        <div className="resource-picker-field__upload">
          <span>Uploader une ressource</span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedFile(event.target.files?.[0] ?? null)} disabled={disabled || isUploading} />
            <Button type="button" variant="secondary" onClick={() => void handleUpload()} disabled={disabled || !selectedFile || isUploading}>
              {isUploading ? 'Upload...' : 'Uploader'}
            </Button>
          </div>
          {errorMessage ? <small style={{ color: '#f87171' }}>{errorMessage}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
