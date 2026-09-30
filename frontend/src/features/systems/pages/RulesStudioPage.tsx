import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import { useAuth } from '../../../hooks/useAuth';
import { systemRepository } from '../../../data/repositories';
import { GameSystem, GameSystemVisibility } from '../../../types/system';
import { SocialUser } from '../../../types/social';
import { loadSocialRelationsService } from '../../../services/socialService';

const MAX_SYSTEM_IMPORT_CHARS = 2_000_000;
const MAX_SYSTEM_IMPORT_VIEWS = 100;
const MAX_SYSTEM_IMPORT_NODES = 5_000;
const MAX_SYSTEM_IMPORT_CATALOGS = 100;
const MAX_SYSTEM_IMPORT_CATALOG_COLUMNS = 100;
const MAX_SYSTEM_IMPORT_CATALOG_ENTRIES = 10_000;
const MAX_SYSTEM_IMPORT_ROLLS = 500;
const MAX_SYSTEM_IMPORT_DISCORD_OUTPUTS = 12;
const MAX_SYSTEM_IMPORT_CHARACTER_CREATION_POOLS = 20;
const MAX_SYSTEM_IMPORT_CHARACTER_CREATION_STEPS = 100;
const SYSTEM_IMPORT_IGNORED_FIELDS = ['id', 'ownerUserId', 'status', 'visibility', 'createdAt', 'updatedAt'] as const;

function canPublishSystem(system: GameSystem): boolean {
  return Boolean(system.studioSchemaV2?.views?.some((view) => view.isCharacterSheet));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateImportedSystemPayload(parsed: unknown): asserts parsed is Partial<GameSystem> {
  if (!isPlainObject(parsed)) {
    throw new Error("JSON invalide : la racine doit être un objet.");
  }

  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    throw new Error("JSON invalide : `name` est obligatoire.");
  }

  if (parsed.description !== undefined && typeof parsed.description !== 'string') {
    throw new Error("JSON invalide : `description` doit être une chaîne.");
  }

  if (parsed.author !== undefined && typeof parsed.author !== 'string') {
    throw new Error("JSON invalide : `author` doit être une chaîne.");
  }

  if (parsed.version !== undefined && typeof parsed.version !== 'string') {
    throw new Error("JSON invalide : `version` doit être une chaîne.");
  }

  if (parsed.tags !== undefined) {
    if (!Array.isArray(parsed.tags) || parsed.tags.some((tag) => typeof tag !== 'string')) {
      throw new Error("JSON invalide : `tags` doit être un tableau de chaînes.");
    }
  }

  if (parsed.rollDefinitions !== undefined) {
    if (!Array.isArray(parsed.rollDefinitions)) {
      throw new Error("JSON invalide : `rollDefinitions` doit être un tableau.");
    }
    if (parsed.rollDefinitions.length > MAX_SYSTEM_IMPORT_ROLLS) {
      throw new Error(`JSON trop volumineux : plus de ${MAX_SYSTEM_IMPORT_ROLLS} définitions de jets.`);
    }
  }

  if (parsed.rulesProgram !== undefined && !Array.isArray(parsed.rulesProgram)) {
    throw new Error("JSON invalide : `rulesProgram` doit être un tableau.");
  }

  if (parsed.rulesPresentation !== undefined && !isPlainObject(parsed.rulesPresentation)) {
    throw new Error("JSON invalide : `rulesPresentation` doit être un objet.");
  }

  if (parsed.studioTheme !== undefined && !isPlainObject(parsed.studioTheme)) {
    throw new Error("JSON invalide : `studioTheme` doit être un objet.");
  }

  if (parsed.studioSchemaV2 !== undefined) {
    if (!isPlainObject(parsed.studioSchemaV2)) {
      throw new Error("JSON invalide : `studioSchemaV2` doit être un objet.");
    }
    const views = parsed.studioSchemaV2.views;
    if (!Array.isArray(views)) {
      throw new Error("JSON invalide : `studioSchemaV2.views` doit être un tableau.");
    }
    if (views.length > MAX_SYSTEM_IMPORT_VIEWS) {
      throw new Error(`JSON trop volumineux : plus de ${MAX_SYSTEM_IMPORT_VIEWS} vues.`);
    }
    const totalNodes = views.reduce((count, view) => {
      if (!isPlainObject(view)) {
        throw new Error('JSON invalide : une vue Studio V2 n est pas un objet.');
      }
      if (!Array.isArray(view.nodes)) {
        throw new Error('JSON invalide : chaque vue Studio V2 doit contenir un tableau `nodes`.');
      }
      return count + view.nodes.length;
    }, 0);
    if (totalNodes > MAX_SYSTEM_IMPORT_NODES) {
      throw new Error(`JSON trop volumineux : plus de ${MAX_SYSTEM_IMPORT_NODES} noeuds Studio V2.`);
    }
  }

  if (parsed.catalogs !== undefined) {
    if (!Array.isArray(parsed.catalogs)) {
      throw new Error("JSON invalide : `catalogs` doit être un tableau.");
    }
    if (parsed.catalogs.length > MAX_SYSTEM_IMPORT_CATALOGS) {
      throw new Error(`JSON trop volumineux : plus de ${MAX_SYSTEM_IMPORT_CATALOGS} catalogues.`);
    }
    parsed.catalogs.forEach((catalog, index) => {
      if (!isPlainObject(catalog)) {
        throw new Error(`JSON invalide : le catalogue #${index + 1} n est pas un objet.`);
      }
      if (!Array.isArray(catalog.columns) || !Array.isArray(catalog.entries)) {
        throw new Error(`JSON invalide : le catalogue #${index + 1} doit contenir \`columns\` et \`entries\`.`);
      }
      if (catalog.columns.length > MAX_SYSTEM_IMPORT_CATALOG_COLUMNS) {
        throw new Error(`JSON trop volumineux : le catalogue #${index + 1} dépasse ${MAX_SYSTEM_IMPORT_CATALOG_COLUMNS} colonnes.`);
      }
      if (catalog.entries.length > MAX_SYSTEM_IMPORT_CATALOG_ENTRIES) {
        throw new Error(`JSON trop volumineux : le catalogue #${index + 1} dépasse ${MAX_SYSTEM_IMPORT_CATALOG_ENTRIES} entrées.`);
      }
    });
  }

  if (parsed.discordConfig !== undefined) {
    if (!isPlainObject(parsed.discordConfig)) {
      throw new Error("JSON invalide : `discordConfig` doit être un objet.");
    }
    if (!Array.isArray(parsed.discordConfig.outputs)) {
      throw new Error("JSON invalide : `discordConfig.outputs` doit être un tableau.");
    }
    if (parsed.discordConfig.outputs.length > MAX_SYSTEM_IMPORT_DISCORD_OUTPUTS) {
      throw new Error(`JSON trop volumineux : plus de ${MAX_SYSTEM_IMPORT_DISCORD_OUTPUTS} sorties Discord.`);
    }
  }

  if (parsed.characterCreationConfig !== undefined) {
    if (!isPlainObject(parsed.characterCreationConfig)) {
      throw new Error("JSON invalide : `characterCreationConfig` doit être un objet.");
    }
    if (!Array.isArray(parsed.characterCreationConfig.pools)) {
      throw new Error("JSON invalide : `characterCreationConfig.pools` doit être un tableau.");
    }
    if (parsed.characterCreationConfig.version === 2) {
      if (!Array.isArray(parsed.characterCreationConfig.stages)) {
        throw new Error("JSON invalide : `characterCreationConfig.stages` doit être un tableau.");
      }
      if (parsed.characterCreationConfig.stages.length > MAX_SYSTEM_IMPORT_CHARACTER_CREATION_STEPS) {
        throw new Error(`JSON trop volumineux : plus de ${MAX_SYSTEM_IMPORT_CHARACTER_CREATION_STEPS} étapes de création.`);
      }
    } else if (!Array.isArray(parsed.characterCreationConfig.steps)) {
      throw new Error("JSON invalide : `characterCreationConfig.steps` doit être un tableau.");
    }
    if (parsed.characterCreationConfig.pools.length > MAX_SYSTEM_IMPORT_CHARACTER_CREATION_POOLS) {
      throw new Error(`JSON trop volumineux : plus de ${MAX_SYSTEM_IMPORT_CHARACTER_CREATION_POOLS} réserves de création.`);
    }
    if (Array.isArray(parsed.characterCreationConfig.steps) && parsed.characterCreationConfig.steps.length > MAX_SYSTEM_IMPORT_CHARACTER_CREATION_STEPS) {
      throw new Error(`JSON trop volumineux : plus de ${MAX_SYSTEM_IMPORT_CHARACTER_CREATION_STEPS} étapes de création.`);
    }
  }
}

interface SystemImportReport {
  name: string;
  description?: string;
  version?: string;
  author?: string;
  viewCount: number;
  nodeCount: number;
  catalogCount: number;
  catalogEntryCount: number;
  rollDefinitionCount: number;
  tagsCount: number;
  characterSheetViewCount: number;
  views: Array<{ name: string; reference?: string; nodeCount: number; isCharacterSheet: boolean }>;
  catalogs: Array<{ label: string; key: string; columnCount: number; entryCount: number }>;
  importedFields: string[];
  ignoredFields: string[];
  warnings: string[];
}

function buildImportReport(parsed: Partial<GameSystem>): SystemImportReport {
  const views = parsed.studioSchemaV2?.views ?? [];
  const catalogs = parsed.catalogs ?? [];
  const nodeCount = views.reduce((count, view) => count + (view.nodes?.length ?? 0), 0);
  const catalogEntryCount = catalogs.reduce((count, catalog) => count + (catalog.entries?.length ?? 0), 0);
  const characterSheetViewCount = views.filter((view) => view.isCharacterSheet).length;
  const importedFields = [
    parsed.name ? 'name' : null,
    parsed.description !== undefined ? 'description' : null,
    parsed.version !== undefined ? 'version' : null,
    parsed.author !== undefined ? 'author' : null,
    parsed.tags !== undefined ? 'tags' : null,
    parsed.rollDefinitions !== undefined ? 'rollDefinitions' : null,
    parsed.rulesProgram !== undefined ? 'rulesProgram' : null,
    parsed.rulesPresentation !== undefined ? 'rulesPresentation' : null,
    parsed.studioTheme !== undefined ? 'studioTheme' : null,
    parsed.studioSchemaV2 !== undefined ? 'studioSchemaV2' : null,
    parsed.catalogs !== undefined ? 'catalogs' : null,
    parsed.discordConfig !== undefined ? 'discordConfig' : null,
    parsed.characterCreationConfig !== undefined ? 'characterCreationConfig' : null
  ].filter((value): value is string => Boolean(value));
  const warnings: string[] = [];

  if (views.length === 0) {
    warnings.push('Aucune vue Studio V2 détectée.');
  }
  if (views.length > 0 && characterSheetViewCount === 0) {
    warnings.push('Aucune vue n est marquée comme fiche personnage, donc le système ne sera pas publiable tel quel.');
  }
  if (catalogs.length === 0) {
    warnings.push('Aucun catalogue détecté.');
  }
  catalogs.forEach((catalog) => {
    if ((catalog.entries?.length ?? 0) === 0) {
      warnings.push(`Catalogue vide détecté : ${catalog.label || catalog.key || 'sans nom'}.`);
    }
  });
  if ((parsed.rollDefinitions?.length ?? 0) === 0) {
    warnings.push('Aucune définition de jet détectée.');
  }
  if ((parsed.discordConfig?.outputs?.length ?? 0) === 0) {
    warnings.push('Aucune sortie Discord détectée.');
  }
  if (
    parsed.characterCreationConfig?.enabled &&
    ((parsed.characterCreationConfig.version === 2
      ? parsed.characterCreationConfig.stages?.length ?? 0
      : parsed.characterCreationConfig.steps?.length ?? 0) === 0)
  ) {
    warnings.push('La création de personnage est activée mais aucune étape n est définie.');
  }

  return {
    name: parsed.name?.trim() || 'Système sans nom',
    description: parsed.description,
    version: parsed.version,
    author: parsed.author,
    viewCount: views.length,
    nodeCount,
    catalogCount: catalogs.length,
    catalogEntryCount,
    rollDefinitionCount: parsed.rollDefinitions?.length ?? 0,
    tagsCount: parsed.tags?.length ?? 0,
    characterSheetViewCount,
    views: views.map((view) => ({
      name: view.name || 'Vue sans nom',
      reference: view.reference,
      nodeCount: view.nodes?.length ?? 0,
      isCharacterSheet: Boolean(view.isCharacterSheet)
    })),
    catalogs: catalogs.map((catalog) => ({
      label: catalog.label || 'Catalogue sans nom',
      key: catalog.key || '',
      columnCount: catalog.columns?.length ?? 0,
      entryCount: catalog.entries?.length ?? 0
    })),
    importedFields,
    ignoredFields: [...SYSTEM_IMPORT_IGNORED_FIELDS],
    warnings
  };
}

export default function RulesStudioPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [blankName, setBlankName] = useState('');
  const [blankDescription, setBlankDescription] = useState('');
  const [blankVisibility, setBlankVisibility] = useState<GameSystemVisibility>('public');
  const [duplicateSourceId, setDuplicateSourceId] = useState('');
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateDescription, setDuplicateDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [importPayload, setImportPayload] = useState<string>('');
  const [importFileName, setImportFileName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVisibility, setEditVisibility] = useState<GameSystemVisibility>('private');
  const [editEditorUserIds, setEditEditorUserIds] = useState<string[]>([]);
  const [friends, setFriends] = useState<SocialUser[]>([]);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const canManage = Boolean(currentUser && (currentUser.roles.includes('gm') || currentUser.roles.includes('admin')));

  const ownedSystems = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    return systems.filter((system) => system.ownerUserId === currentUser.id || (system.editorUserIds ?? []).includes(currentUser.id));
  }, [currentUser, systems]);
  const forkableSystems = useMemo(() => {
    if (!currentUser || !canManage) {
      return [];
    }
    return systems.filter((system) => system.status === 'published');
  }, [canManage, currentUser, systems]);
  const importReport = useMemo(() => {
    if (!importPayload.trim()) {
      return null;
    }
    if (importPayload.length > MAX_SYSTEM_IMPORT_CHARS) {
      return null;
    }
    try {
      const parsed = JSON.parse(importPayload) as unknown;
      validateImportedSystemPayload(parsed);
      return buildImportReport(parsed);
    } catch {
      return null;
    }
  }, [importPayload]);

  const reloadSystems = async () => {
    if (!currentUser) {
      setSystems([]);
      return;
    }
    const available = await systemRepository.listAvailableForUser(currentUser);
    const forkable = available.filter((system) => system.status === 'published');
    setSystems(available);
    setDuplicateSourceId((current) => current || forkable[0]?.id || '');
    try {
      const relations = await loadSocialRelationsService();
      setFriends(relations.friends);
    } catch {
      setFriends([]);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        if (!currentUser) {
          return;
        }
        const available = await systemRepository.listAvailableForUser(currentUser);
        const forkable = available.filter((system) => system.status === 'published');
        let nextFriends: SocialUser[] = [];
        try {
          const relations = await loadSocialRelationsService();
          nextFriends = relations.friends;
        } catch {
          nextFriends = [];
        }
        if (!isMounted) {
          return;
        }
        setSystems(available);
        setDuplicateSourceId(forkable[0]?.id ?? '');
        setFriends(nextFriends);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les systèmes.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const handleCreateBlank = async () => {
    if (!currentUser || !canManage) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSaving(true);

    try {
      const created = await systemRepository.create({
        owner: currentUser,
        name: blankName.trim() || 'Nouveau système',
        description: blankDescription.trim(),
        visibility: blankVisibility
      });
      await reloadSystems();
      setBlankName('');
      setBlankDescription('');
      setBlankVisibility('public');
      setStatusMessage('Système vierge créé.');
      navigate(`/systems/${created.id}/studio`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer le système.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!currentUser || !canManage || !duplicateSourceId) {
      return;
    }

    const source = systems.find((system) => system.id === duplicateSourceId);

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSaving(true);

    try {
      const duplicated = await systemRepository.duplicate({
        sourceSystemId: duplicateSourceId,
        actor: currentUser,
        name: duplicateName.trim() || `${source?.name ?? 'Système'} (copie ${currentUser.displayName})`,
        description: duplicateDescription.trim()
      });
      await reloadSystems();
      setDuplicateName('');
      setDuplicateDescription('');
      setStatusMessage('Système dupliqué.');
      navigate(`/systems/${duplicated.id}/studio`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de dupliquer le système.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportSystem = (system: GameSystem) => {
    const payload = JSON.stringify(system, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${system.name.replace(/[^a-zA-Z0-9-_]+/g, '_') || 'system'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startEditingSystem = (system: GameSystem) => {
    setEditingSystemId(system.id);
    setEditName(system.name);
    setEditDescription(system.description ?? '');
    setEditVisibility(system.visibility);
    setEditEditorUserIds(system.editorUserIds ?? []);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const cancelEditingSystem = () => {
    setEditingSystemId(null);
    setEditName('');
    setEditDescription('');
    setEditVisibility('private');
    setEditEditorUserIds([]);
  };

  const handleSaveSystemMeta = async (system: GameSystem) => {
    if (!currentUser || !canManage) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSaving(true);

    try {
      await systemRepository.upsert(
        {
          ...system,
          name: editName.trim() || system.name,
          description: editDescription.trim(),
          visibility: editVisibility,
          editorUserIds: editEditorUserIds
        },
        currentUser
      );
      await reloadSystems();
      setStatusMessage(`Système mis à jour : ${editName.trim() || system.name}`);
      cancelEditingSystem();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de mettre à jour le système.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSystem = async (system: GameSystem) => {
    if (!currentUser || !canManage) {
      return;
    }
    const confirmed = window.confirm(
      `Supprimer le système "${system.name}" ?\n\nS'il est encore utilisé par des parties, il sera conservé en copie interne pour ces parties mais retiré de ta liste auteur.`
    );
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSaving(true);
    try {
      const result = await systemRepository.deleteOwned({ systemId: system.id, actor: currentUser });
      await reloadSystems();
      if (result.retainedForSessions) {
        setStatusMessage(`Système retiré de ta liste auteur et conservé pour ${result.relatedSessionsCount} partie(s).`);
      } else {
        setStatusMessage('Système supprimé.');
      }
      if (editingSystemId === system.id) {
        cancelEditingSystem();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de supprimer le système.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeSystemStatus = async (system: GameSystem, status: 'draft' | 'published') => {
    if (!currentUser || !canManage) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSaving(true);
    try {
      await systemRepository.upsert(
        {
          ...system,
          status
        },
        currentUser
      );
      await reloadSystems();
      setStatusMessage(status === 'published' ? 'Système publié.' : 'Système repassé en brouillon.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de changer le statut du système.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportSystem = async () => {
    if (!currentUser || !canManage) {
      return;
    }
    if (!importPayload.trim()) {
      setErrorMessage('Colle un JSON a importer.');
      return;
    }
    if (importPayload.length > MAX_SYSTEM_IMPORT_CHARS) {
      setErrorMessage(`JSON trop volumineux : limite fixée à ${Math.round(MAX_SYSTEM_IMPORT_CHARS / 1000)} ko.`);
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSaving(true);
    try {
      const parsed = JSON.parse(importPayload) as unknown;
      validateImportedSystemPayload(parsed);

      const created = await systemRepository.create({
        owner: currentUser,
        name: `${parsed.name} (import)`,
        description: parsed.description ?? '',
        visibility: 'private'
      });

      await systemRepository.upsert(
        {
          ...created,
          version: parsed.version ?? created.version,
          author: parsed.author ?? created.author,
          tags: parsed.tags ?? created.tags,
          rollDefinitions: parsed.rollDefinitions ?? created.rollDefinitions,
          studioSchemaV2: parsed.studioSchemaV2 ?? created.studioSchemaV2,
          rulesProgram: parsed.rulesProgram ?? created.rulesProgram,
          rulesPresentation: parsed.rulesPresentation ?? created.rulesPresentation,
          studioTheme: parsed.studioTheme ?? created.studioTheme,
          catalogs: parsed.catalogs ?? created.catalogs,
          discordConfig: parsed.discordConfig ?? created.discordConfig,
          characterCreationConfig: parsed.characterCreationConfig ?? created.characterCreationConfig
        },
        currentUser
      );

      await reloadSystems();
      setStatusMessage(`Système importé: ${created.name}`);
      setImportPayload('');
      setImportFileName('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      setImportPayload(content);
      setImportFileName(file.name);
      setErrorMessage(null);
      setStatusMessage(`Fichier chargé : ${file.name}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de lire le fichier JSON.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <Layout>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginTop: 0 }}>Studio système</h1>
        <p style={{ marginTop: 0, marginBottom: 0 }}>
          Construis les systèmes en mode visuel: palette à gauche, vue au centre, propriétés à droite.
        </p>
      </section>

      {!canManage ? (
        <section className="card">Accès réservé MJ/Admin.</section>
      ) : null}

      {canManage ? (
        <>
          {!isLoading && ownedSystems.length === 0 ? (
            <section className="card rules-studio-empty" style={{ marginBottom: '1rem' }}>
              <div className="rules-studio-empty__copy">
                <p className="rules-studio-empty__eyebrow">Base propre</p>
                <h2>Commencer un premier système</h2>
                <p>
                  Aucun système n’est enregistré pour ce compte. Le plus simple est de créer un système vierge, puis
                  d’ouvrir immédiatement le studio visuel.
                </p>
              </div>
              <div className="rules-studio-empty__actions">
                <Button type="button" onClick={() => void handleCreateBlank()} disabled={isSaving}>
                  Créer mon premier système
                </Button>
              </div>
            </section>
          ) : null}

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>1) Mes systèmes propriétaires</h2>
            {isLoading ? <p>Chargement...</p> : null}
            {!isLoading && ownedSystems.length === 0 ? <p>Aucun système propriétaire ou co-éditable.</p> : null}
            <div className="grid">
              {ownedSystems.map((system) => (
                <article key={system.id} className="card">
                  {editingSystemId === system.id ? (
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Nom du système</span>
                        <input type="text" value={editName} onChange={(event) => setEditName(event.target.value)} disabled={isSaving} />
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Résumé</span>
                        <textarea rows={3} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} disabled={isSaving} />
                      </label>
                      <label style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Visibilité</span>
                        <select value={editVisibility} onChange={(event) => setEditVisibility(event.target.value as GameSystemVisibility)} disabled={isSaving}>
                          <option value="private">Privé</option>
                          <option value="friends">Amis</option>
                          <option value="public">Public</option>
                        </select>
                      </label>
                      <div style={{ display: 'grid', gap: '0.35rem' }}>
                        <span>Co-auteurs</span>
                        {friends.length === 0 ? <small>Aucun ami disponible pour le moment.</small> : null}
                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                          {friends.map((friend) => (
                            <label key={friend.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={editEditorUserIds.includes(friend.id)}
                                onChange={(event) =>
                                  setEditEditorUserIds((current) =>
                                    event.target.checked ? [...current, friend.id] : current.filter((id) => id !== friend.id)
                                  )
                                }
                                disabled={isSaving}
                              />
                              <span>{friend.displayName}</span>
                            </label>
                          ))}
                        </div>
                        <small>Les co-auteurs peuvent modifier le système, même s'il reste privé.</small>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 style={{ marginTop: 0, marginBottom: '0.4rem' }}>{system.name}</h3>
                      <p style={{ marginTop: 0, marginBottom: '0.4rem' }}>{system.description || 'Aucune description'}</p>
                      <p style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                        Accès : <strong>{system.ownerUserId === currentUser?.id ? 'Propriétaire' : 'Co-éditeur'}</strong>
                      </p>
                      {(system.editorUserIds?.length ?? 0) > 0 ? (
                        <p style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                          Co-auteurs : <strong>{system.editorUserIds?.length}</strong>
                        </p>
                      ) : null}
                    </>
                  )}
                  {system.forkedFromSystemName ? (
                    <p style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                      Basé sur <strong>{system.forkedFromSystemName}</strong>
                    </p>
                  ) : null}
                  <p style={{ marginTop: 0, marginBottom: '0.7rem', fontSize: '0.85rem' }}>
                    Statut: {system.status === 'published' ? 'Publié' : 'Brouillon'} | Visibilité: {system.visibility} | MAJ: {new Date(system.updatedAt).toLocaleString()}
                  </p>
                  {system.status !== 'published' && !canPublishSystem(system) ? (
                    <p style={{ marginTop: 0, marginBottom: '0.7rem', fontSize: '0.85rem', color: '#f59e0b' }}>
                      Publication impossible tant qu aucune vue n est marquée comme fiche personnage.
                    </p>
                  ) : null}
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <Link to={`/systems/${system.id}/studio`}>Ouvrir le studio</Link>
                    {editingSystemId === system.id ? (
                      <>
                        <Button type="button" onClick={() => void handleSaveSystemMeta(system)} disabled={isSaving}>
                          Enregistrer
                        </Button>
                        <Button type="button" variant="secondary" onClick={cancelEditingSystem} disabled={isSaving}>
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="secondary" onClick={() => startEditingSystem(system)} disabled={isSaving}>
                        Renommer / résumé
                      </Button>
                    )}
                    <button className="button secondary" type="button" onClick={() => handleExportSystem(system)}>
                      Export JSON
                    </button>
                    {system.status === 'draft' ? (
                      <Button type="button" variant="secondary" onClick={() => void handleChangeSystemStatus(system, 'published')} disabled={isSaving || !canPublishSystem(system)}>
                        Publier
                      </Button>
                    ) : (
                      <Button type="button" variant="secondary" onClick={() => void handleChangeSystemStatus(system, 'draft')} disabled={isSaving}>
                        Repasser en brouillon
                      </Button>
                    )}
                    {system.ownerUserId === currentUser?.id || currentUser?.roles.includes('admin') ? (
                      <Button type="button" variant="secondary" onClick={() => void handleDeleteSystem(system)} disabled={isSaving}>
                        Supprimer
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>2) Dupliquer un système</h2>
            {forkableSystems.length === 0 ? (
              <p style={{ marginTop: 0 }}>La duplication sera disponible dès qu’un système publié sera accessible à un MJ.</p>
            ) : null}
            <div className="grid">
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Système source</span>
                <select
                  value={duplicateSourceId}
                  onChange={(event) => setDuplicateSourceId(event.target.value)}
                  disabled={forkableSystems.length === 0 || !canManage}
                >
                  {forkableSystems.length === 0 ? <option value="">Aucun système publiable disponible</option> : null}
                  {forkableSystems.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Nouveau nom du système</span>
                <input
                  type="text"
                  value={duplicateName}
                  onChange={(event) => setDuplicateName(event.target.value)}
                  placeholder="Nouveau nom"
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Description</span>
                <textarea
                  value={duplicateDescription}
                  onChange={(event) => setDuplicateDescription(event.target.value)}
                  placeholder="Description du fork"
                  rows={3}
                />
              </label>
              <div>
                <Button type="button" variant="secondary" onClick={() => void handleDuplicate()} disabled={isSaving || !duplicateSourceId || !canManage}>
                  Dupliquer
                </Button>
              </div>
            </div>
          </section>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>3) Nouveau système vierge</h2>
            <div className="grid">
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Nom du système</span>
                <input
                  type="text"
                  value={blankName}
                  onChange={(event) => setBlankName(event.target.value)}
                  placeholder="Nom du système"
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Description</span>
                <textarea
                  value={blankDescription}
                  onChange={(event) => setBlankDescription(event.target.value)}
                  placeholder="Description du système"
                  rows={3}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Visibilité</span>
                <select value={blankVisibility} onChange={(event) => setBlankVisibility(event.target.value as GameSystemVisibility)}>
                  <option value="public">Public</option>
                  <option value="private">Privé</option>
                  <option value="friends">Amis</option>
                </select>
              </label>
              <div>
                <Button type="button" onClick={() => void handleCreateBlank()} disabled={isSaving}>
                  Nouveau système vierge
                </Button>
              </div>
            </div>
          </section>
          <section className="card" style={{ marginBottom: '1rem' }}>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>4) Import JSON d&apos;un système</summary>
              <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.75rem' }}>
                <p style={{ margin: 0, opacity: 0.84 }}>
                  Zone avancée pour importer un système complet depuis un export JSON ou un fichier préparé à part.
                </p>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => void handleImportFileChange(event)}
                  style={{ display: 'none' }}
                />
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => importFileInputRef.current?.click()}
                    disabled={isSaving}
                  >
                    Choisir un fichier JSON
                  </Button>
                  <span style={{ opacity: 0.78 }}>
                    {importFileName ? `Fichier sélectionné : ${importFileName}` : 'Aucun fichier sélectionné'}
                  </span>
                </div>
                <label style={{ display: 'grid', gap: '0.35rem' }}>
                  <span>JSON complet du système</span>
                  <textarea
                    rows={8}
                    value={importPayload}
                    onChange={(event) => setImportPayload(event.target.value)}
                    placeholder='{"name":"Mon systeme","studioSchemaV2":{...},"catalogs":[...]}'
                  />
                </label>
                <p style={{ margin: 0, opacity: 0.84 }}>
                  Champs repris par l’import complet : nom, description, version, auteur, tags, jets, règles, thème,
                  vues Studio V2 et catalogues.
                </p>
                {importReport ? (
                  <section className="card" style={{ margin: 0, background: 'rgba(7, 22, 46, 0.45)' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '0.6rem' }}>Rapport avant import</h3>
                    <p style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                      <strong>{importReport.name}</strong>
                      {importReport.version ? ` · version ${importReport.version}` : ''}
                      {importReport.author ? ` · auteur ${importReport.author}` : ''}
                    </p>
                    {importReport.description ? <p style={{ marginTop: 0, marginBottom: '0.75rem', opacity: 0.86 }}>{importReport.description}</p> : null}
                    <div className="grid">
                      <p style={{ margin: 0 }}>Vues : <strong>{importReport.viewCount}</strong></p>
                      <p style={{ margin: 0 }}>Nœuds : <strong>{importReport.nodeCount}</strong></p>
                      <p style={{ margin: 0 }}>Fiches perso : <strong>{importReport.characterSheetViewCount}</strong></p>
                      <p style={{ margin: 0 }}>Catalogues : <strong>{importReport.catalogCount}</strong></p>
                      <p style={{ margin: 0 }}>Entrées catalogue : <strong>{importReport.catalogEntryCount}</strong></p>
                      <p style={{ margin: 0 }}>Jets : <strong>{importReport.rollDefinitionCount}</strong></p>
                      <p style={{ margin: 0 }}>Tags : <strong>{importReport.tagsCount}</strong></p>
                    </div>
                    {importReport.views.length ? (
                      <div style={{ marginTop: '0.75rem' }}>
                        <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>
                          Vues détectées :
                        </p>
                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                          {importReport.views.map((view) => (
                            <p key={`${view.reference || view.name}-${view.nodeCount}`} style={{ margin: 0, opacity: 0.9 }}>
                              <strong>{view.name}</strong>
                              {view.reference ? ` (${view.reference})` : ''}
                              {` · ${view.nodeCount} nœuds`}
                              {view.isCharacterSheet ? ' · fiche personnage' : ''}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {importReport.catalogs.length ? (
                      <div style={{ marginTop: '0.75rem' }}>
                        <p style={{ marginTop: 0, marginBottom: '0.35rem' }}>
                          Catalogues détectés :
                        </p>
                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                          {importReport.catalogs.map((catalog) => (
                            <p key={`${catalog.key}-${catalog.entryCount}`} style={{ margin: 0, opacity: 0.9 }}>
                              <strong>{catalog.label}</strong>
                              {catalog.key ? ` (${catalog.key})` : ''}
                              {` · ${catalog.columnCount} colonnes · ${catalog.entryCount} entrées`}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <p style={{ marginTop: '0.75rem', marginBottom: '0.35rem' }}>
                      Champs importés : <strong>{importReport.importedFields.join(', ')}</strong>
                    </p>
                    <p style={{ marginTop: 0, marginBottom: importReport.warnings.length ? '0.35rem' : 0 }}>
                      Champs ignorés : <strong>{importReport.ignoredFields.join(', ')}</strong>
                    </p>
                    {importReport.warnings.length ? (
                      <div style={{ color: '#f59e0b' }}>
                        {importReport.warnings.map((warning) => (
                          <p key={warning} style={{ marginTop: 0, marginBottom: '0.25rem' }}>
                            {warning}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <div>
                  <Button type="button" variant="secondary" onClick={() => void handleImportSystem()} disabled={isSaving}>
                    Importer JSON
                  </Button>
                </div>
              </div>
            </details>
          </section>
        </>
      ) : null}

      {statusMessage ? (
        <section className="card" style={{ color: '#067647' }}>
          {statusMessage}
        </section>
      ) : null}
      {errorMessage ? (
        <section className="card" style={{ color: '#b42318' }}>
          {errorMessage}
        </section>
      ) : null}
    </Layout>
  );
}
