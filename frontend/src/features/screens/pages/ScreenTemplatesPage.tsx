import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import { screenTemplateRepository, systemRepository } from '../../../data/repositories';
import { useAuth } from '../../../hooks/useAuth';
import { GameSystem } from '../../../types/system';
import { ScreenDefinition, ScreenGridColumns, ScreenSetDefinition, ScreenTabGroupDefinition, ScreenTemplate, ScreenTemplateRoleTarget, ScreenTemplateScopeType, ScreenTemplateVisibility } from '../../../types/screenTemplate';
import { applyScreenFormatPreset, applyScreenFormatPresetToScreen, ensureScreenFormatForScreen, ensureScreenSetFormat, getDefaultScreenFormatPreset, SCREEN_FORMAT_PRESETS, screenFormatSummary, screenOrientationLabel, type ScreenFormatPreset } from '../screenSetPresets';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function screenCountForPreset(devicePreset: ScreenSetDefinition['devicePreset']): number {
  switch (devicePreset) {
    case 'desktop_3':
      return 3;
    case 'desktop_2':
      return 2;
    case 'tablet':
    case 'mobile':
    case 'desktop_1':
    default:
      return 1;
  }
}

function buildScreensForPreset(devicePreset: ScreenSetDefinition['devicePreset'], screenFormatPreset?: ScreenFormatPreset): ScreenDefinition[] {
  const screenCount = screenCountForPreset(devicePreset);
  const resolvedPreset = screenFormatPreset ?? getDefaultScreenFormatPreset(devicePreset);
  return Array.from({ length: screenCount }, (_, index) => makeDefaultScreen(index + 1, resolvedPreset));
}

function syncScreensWithPreset(screens: ScreenDefinition[], devicePreset: ScreenSetDefinition['devicePreset'], screenFormatPreset?: ScreenFormatPreset): ScreenDefinition[] {
  const targetCount = screenCountForPreset(devicePreset);
  const nextScreens = screens.slice(0, targetCount).map((screen, index) => ({
    ...screen,
    order: index + 1,
    mode: index === 0 ? 'main' as const : 'detached' as const,
    name: screen.name || (index === 0 ? 'Ecran principal' : `Ecran ${index + 1}`)
  }));

  for (let index = nextScreens.length; index < targetCount; index += 1) {
    nextScreens.push(makeDefaultScreen(index + 1, screenFormatPreset ?? getDefaultScreenFormatPreset(devicePreset)));
  }

  return nextScreens;
}

function makeDefaultSet(name: string, devicePreset: ScreenSetDefinition['devicePreset'], gridColumns: ScreenGridColumns): ScreenSetDefinition {
  const screenFormatPreset = getDefaultScreenFormatPreset(devicePreset);
  return applyScreenFormatPreset({
    id: makeId('screen_set'),
    name,
    devicePreset,
    gridColumns,
    zoom: 1,
    screens: buildScreensForPreset(devicePreset, screenFormatPreset)
  }, screenFormatPreset);
}

function makeDefaultScreen(order: number, screenFormatPreset: ScreenFormatPreset = 'desktop_full_hd'): ScreenDefinition {
  return applyScreenFormatPresetToScreen({
    id: makeId('screen'),
    name: order === 1 ? 'Ecran principal' : `Ecran ${order}`,
    mode: order === 1 ? 'main' : 'detached',
    order,
    tabGroups: [
      {
        id: makeId('screen_tab'),
        name: 'Resume',
        isDefault: true,
        widgets: []
      }
    ]
  }, screenFormatPreset);
}

function makeDefaultTabGroup(name = 'Nouvel onglet'): ScreenTabGroupDefinition {
  return {
    id: makeId('screen_tab'),
    name,
    isDefault: false,
    widgets: []
  };
}

export default function ScreenTemplatesPage() {
  const { currentUser } = useAuth();
  const [templates, setTemplates] = useState<ScreenTemplate[]>([]);
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopeType, setScopeType] = useState<ScreenTemplateScopeType>('account');
  const [scopeRefId, setScopeRefId] = useState('');
  const [roleTarget, setRoleTarget] = useState<ScreenTemplateRoleTarget>('player');
  const [visibility, setVisibility] = useState<ScreenTemplateVisibility>('private');
  const [devicePreset, setDevicePreset] = useState<ScreenSetDefinition['devicePreset']>('desktop_1');
  const [screenFormatPreset, setScreenFormatPreset] = useState<ScreenFormatPreset>('desktop_full_hd');
  const [gridColumns, setGridColumns] = useState<ScreenGridColumns>(24);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<ScreenTemplate | null>(null);

  const canUseSystemScope = Boolean(currentUser && (currentUser.roles.includes('gm') || currentUser.roles.includes('admin')));

  const ownedTemplates = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    return templates.filter((template) => template.createdBy === currentUser.id);
  }, [currentUser, templates]);

  const reloadAll = async () => {
    if (!currentUser) {
      setTemplates([]);
      setSystems([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [loadedTemplates, loadedSystems] = await Promise.all([
        screenTemplateRepository.listForUser(currentUser.id),
        canUseSystemScope ? systemRepository.listAvailableForUser(currentUser) : Promise.resolve([])
      ]);
      setTemplates(loadedTemplates);
      setSystems(loadedSystems);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les templates d ecran.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reloadAll();
  }, [currentUser]);

  const handleCreate = async () => {
    if (!currentUser) {
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Nom du template requis.');
      return;
    }
    if (scopeType === 'system' && !scopeRefId) {
      setErrorMessage('Selectionne un systeme pour un template lie a un systeme.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const now = new Date().toISOString();
      const template: ScreenTemplate = {
        id: makeId('screen_tpl'),
        name: name.trim(),
        description: description.trim(),
        scopeType,
        scopeRefId: scopeType === 'system' ? scopeRefId : null,
        roleTarget,
        visibility,
        isFavorite: ownedTemplates.length === 0,
        sourceTemplateId: null,
        createdBy: currentUser.id,
        updatedBy: currentUser.id,
        sets: [applyScreenFormatPreset(makeDefaultSet(devicePresetLabel(devicePreset), devicePreset, gridColumns), screenFormatPreset)],
        createdAt: now,
        updatedAt: now
      };
      await screenTemplateRepository.upsert(template);
      setStatusMessage(`Template cree: ${template.name}`);
      setName('');
      setDescription('');
      setScopeType('account');
      setScopeRefId('');
      setRoleTarget('player');
      setVisibility('private');
      setDevicePreset('desktop_1');
      setScreenFormatPreset('desktop_full_hd');
      setGridColumns(24);
      await reloadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Creation impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (template: ScreenTemplate) => {
    setEditingTemplateId(template.id);
    setEditingDraft({
      ...template,
      sets: template.sets.map((set) => ({
        ...ensureScreenSetFormat(set),
        screens: set.screens.map((screen) => ({
          ...screen,
          tabGroups: screen.tabGroups.map((group) => ({ ...group, widgets: [...group.widgets] }))
        }))
      }))
    });
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleSaveEdit = async () => {
    if (!editingDraft) {
      return;
    }
    if (!editingDraft.name.trim()) {
      setErrorMessage('Nom du template requis.');
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await screenTemplateRepository.upsert({
        ...editingDraft,
        name: editingDraft.name.trim(),
        description: editingDraft.description?.trim() || ''
      });
      setStatusMessage(`Template mis a jour: ${editingDraft.name}`);
      setEditingTemplateId(null);
      setEditingDraft(null);
      await reloadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Mise a jour impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (template: ScreenTemplate) => {
    if (!window.confirm(`Supprimer le template d ecran "${template.name}" ?`)) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await screenTemplateRepository.delete(template.id);
      setStatusMessage(`Template supprime: ${template.name}`);
      if (editingTemplateId === template.id) {
        setEditingTemplateId(null);
        setEditingDraft(null);
      }
      await reloadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateEditingDraft = (updater: (draft: ScreenTemplate) => ScreenTemplate) => {
    setEditingDraft((current) => (current ? updater(current) : current));
  };

  const addSetToEditingDraft = () => {
    updateEditingDraft((draft) => ({
      ...draft,
      sets: [...draft.sets, makeDefaultSet(`Nouveau set ${draft.sets.length + 1}`, 'desktop_1', 24)]
    }));
  };

  const removeSetFromEditingDraft = (setId: string) => {
    updateEditingDraft((draft) => ({
      ...draft,
      sets: draft.sets.filter((set) => set.id !== setId)
    }));
  };

  const updateSetInEditingDraft = (setId: string, updater: (set: ScreenSetDefinition) => ScreenSetDefinition) => {
    updateEditingDraft((draft) => ({
      ...draft,
      sets: draft.sets.map((set) => (set.id === setId ? updater(set) : set))
    }));
  };

  const addScreenToSet = (setId: string) => {
    updateSetInEditingDraft(setId, (set) => ({
      ...set,
      screens: [...set.screens, makeDefaultScreen(set.screens.length + 1, set.screenFormatPreset ?? getDefaultScreenFormatPreset(set.devicePreset))]
    }));
  };

  const removeScreenFromSet = (setId: string, screenId: string) => {
    updateSetInEditingDraft(setId, (set) => ({
      ...set,
      screens: set.screens.filter((screen) => screen.id !== screenId).map((screen, index) => ({ ...screen, order: index + 1 }))
    }));
  };

  const updateScreenInSet = (setId: string, screenId: string, updater: (screen: ScreenDefinition) => ScreenDefinition) => {
    updateSetInEditingDraft(setId, (set) => ({
      ...set,
      screens: set.screens.map((screen) => (screen.id === screenId ? updater(screen) : screen))
    }));
  };

  const addTabGroupToScreen = (setId: string, screenId: string) => {
    updateScreenInSet(setId, screenId, (screen) => ({
      ...screen,
      tabGroups: [...screen.tabGroups, makeDefaultTabGroup(`Onglet ${screen.tabGroups.length + 1}`)]
    }));
  };

  const removeTabGroupFromScreen = (setId: string, screenId: string, tabGroupId: string) => {
    updateScreenInSet(setId, screenId, (screen) => {
      const nextGroups = screen.tabGroups.filter((group) => group.id !== tabGroupId);
      const hasDefault = nextGroups.some((group) => group.isDefault);
      return {
        ...screen,
        tabGroups: nextGroups.map((group, index) => ({ ...group, isDefault: hasDefault ? group.isDefault : index === 0 }))
      };
    });
  };

  const updateTabGroupInScreen = (
    setId: string,
    screenId: string,
    tabGroupId: string,
    updater: (group: ScreenTabGroupDefinition, groups: ScreenTabGroupDefinition[]) => ScreenTabGroupDefinition
  ) => {
    updateScreenInSet(setId, screenId, (screen) => {
      const nextGroups = screen.tabGroups.map((group) => (group.id === tabGroupId ? updater(group, screen.tabGroups) : group));
      const hasDefault = nextGroups.some((group) => group.isDefault);
      return {
        ...screen,
        tabGroups: nextGroups.map((group, index) => ({ ...group, isDefault: hasDefault ? group.isDefault : index === 0 }))
      };
    });
  };

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginTop: 0 }}>Studio Ecrans</h1>
        <p style={{ marginBottom: 0 }}>
          Catalogue des interfaces de partie V1. Chaque template peut etre lie a ton compte ou a un systeme, puis adapte a plusieurs contextes materiels.
        </p>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Creer un template</h2>
        <div className="grid">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Nom</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="MJ double ecran" />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Description</span>
            <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Base de travail pour une partie SteamShadows" />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Portee</span>
            <select value={scopeType} onChange={(event) => { setScopeType(event.target.value as ScreenTemplateScopeType); setScopeRefId(''); }} disabled={!canUseSystemScope && scopeType === 'account' ? false : !canUseSystemScope && scopeType !== 'account'}>
              <option value="account">Compte</option>
              {canUseSystemScope ? <option value="system">Systeme</option> : null}
            </select>
          </label>
          {scopeType === 'system' ? (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Systeme lie</span>
              <select value={scopeRefId} onChange={(event) => setScopeRefId(event.target.value)}>
                <option value="">Choisir un systeme</option>
                {systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Role cible</span>
            <select value={roleTarget} onChange={(event) => setRoleTarget(event.target.value as ScreenTemplateRoleTarget)}>
              <option value="player">Joueur</option>
              <option value="gm">MJ</option>
              <option value="both">Les deux</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Visibilite</span>
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as ScreenTemplateVisibility)}>
              <option value="private">Prive</option>
              <option value="public">Public</option>
              <option value="friends">Amis (reserve)</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Preset initial</span>
            <select value={devicePreset} onChange={(event) => setDevicePreset(event.target.value as ScreenSetDefinition['devicePreset'])}>
              <option value="desktop_1">PC 1 ecran</option>
              <option value="desktop_2">PC 2 ecrans</option>
              <option value="desktop_3">PC 3 ecrans</option>
              <option value="tablet">Tablette</option>
              <option value="mobile">Telephone mobile</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Format d écran</span>
            <select value={screenFormatPreset} onChange={(event) => setScreenFormatPreset(event.target.value as ScreenFormatPreset)}>
              {SCREEN_FORMAT_PRESETS.map((preset) => (
                <option key={preset.preset} value={preset.preset}>
                  {preset.label} · {preset.aspectRatio} · {screenOrientationLabel(preset.orientation)}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Grille</span>
            <select value={String(gridColumns)} onChange={(event) => setGridColumns(Number(event.target.value) as ScreenGridColumns)}>
              <option value="12">12 colonnes</option>
              <option value="24">24 colonnes</option>
              <option value="36">36 colonnes</option>
              <option value="48">48 colonnes</option>
            </select>
          </label>
        </div>
        <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Button type="button" onClick={() => void handleCreate()} disabled={isSaving}>
            Creer le template
          </Button>
          <Button type="button" variant="secondary" onClick={() => void reloadAll()} disabled={isSaving}>
            Recharger
          </Button>
        </div>
        <p style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.9rem', opacity: 0.8 }}>
          Référence de travail : {screenFormatSummary({
            screenFormatPreset,
            aspectRatio: SCREEN_FORMAT_PRESETS.find((preset) => preset.preset === screenFormatPreset)?.aspectRatio,
            orientation: SCREEN_FORMAT_PRESETS.find((preset) => preset.preset === screenFormatPreset)?.orientation,
            referenceWidth: SCREEN_FORMAT_PRESETS.find((preset) => preset.preset === screenFormatPreset)?.referenceWidth,
            referenceHeight: SCREEN_FORMAT_PRESETS.find((preset) => preset.preset === screenFormatPreset)?.referenceHeight
          })}
        </p>
        {statusMessage ? <p style={{ color: '#067647', marginBottom: 0 }}>{statusMessage}</p> : null}
        {errorMessage ? <p style={{ color: '#b42318', marginBottom: 0 }}>{errorMessage}</p> : null}
      </section>

      <section className="card" style={{ order: -1, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Mes templates</h2>
            <p style={{ margin: 0 }}>Total visible: {templates.length}</p>
          </div>
        </div>
        {isLoading ? <p>Chargement...</p> : null}
        {!isLoading && templates.length === 0 ? <p>Aucun template d ecran pour le moment.</p> : null}
        <div className="grid">
          {templates.map((template) => {
            const isEditing = editingTemplateId === template.id && editingDraft;
            const setCount = template.sets.length;
            const screenCount = template.sets.reduce((count, set) => count + set.screens.length, 0);
            return (
              <article key={template.id} className="card">
                {isEditing ? (
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Nom</span>
                      <input type="text" value={editingDraft.name} onChange={(event) => setEditingDraft({ ...editingDraft, name: event.target.value })} disabled={isSaving} />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Description</span>
                      <textarea rows={3} value={editingDraft.description ?? ''} onChange={(event) => setEditingDraft({ ...editingDraft, description: event.target.value })} disabled={isSaving} />
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Role cible</span>
                      <select value={editingDraft.roleTarget} onChange={(event) => setEditingDraft({ ...editingDraft, roleTarget: event.target.value as ScreenTemplateRoleTarget })} disabled={isSaving}>
                        <option value="player">Joueur</option>
                        <option value="gm">MJ</option>
                        <option value="both">Les deux</option>
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                      <span>Visibilite</span>
                      <select value={editingDraft.visibility} onChange={(event) => setEditingDraft({ ...editingDraft, visibility: event.target.value as ScreenTemplateVisibility })} disabled={isSaving}>
                        <option value="private">Prive</option>
                        <option value="public">Public</option>
                        <option value="friends">Amis (reserve)</option>
                      </select>
                    </label>
                    <div className="studio-properties__section" style={{ marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>Sets et ecrans</strong>
                        <Button type="button" variant="secondary" onClick={addSetToEditingDraft} disabled={isSaving}>
                          Ajouter un set
                        </Button>
                      </div>
                      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                        {editingDraft.sets.map((set) => (
                          <div key={set.id} className="studio-properties__section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                              <strong>{set.name || 'Set sans nom'}</strong>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <Button type="button" variant="secondary" onClick={() => addScreenToSet(set.id)} disabled={isSaving}>
                                  Ajouter un ecran
                                </Button>
                                <Button type="button" variant="danger" onClick={() => removeSetFromEditingDraft(set.id)} disabled={isSaving || editingDraft.sets.length <= 1}>
                                  Supprimer set
                                </Button>
                              </div>
                            </div>
                            <div className="grid" style={{ marginTop: '0.75rem' }}>
                              <label style={{ display: 'grid', gap: '0.35rem' }}>
                                <span>Nom du set</span>
                                <input type="text" value={set.name} onChange={(event) => updateSetInEditingDraft(set.id, (item) => ({ ...item, name: event.target.value }))} disabled={isSaving} />
                              </label>
                              <label style={{ display: 'grid', gap: '0.35rem' }}>
                                <span>Preset</span>
                                <select
                                  value={set.devicePreset}
                                  onChange={(event) =>
                                    updateSetInEditingDraft(set.id, (item) => {
                                      const nextPreset = event.target.value as ScreenSetDefinition['devicePreset'];
                                      return applyScreenFormatPreset({
                                        ...item,
                                        devicePreset: nextPreset,
                                        screens: syncScreensWithPreset(item.screens, nextPreset, item.screenFormatPreset ?? getDefaultScreenFormatPreset(nextPreset))
                                      }, item.screenFormatPreset ?? getDefaultScreenFormatPreset(nextPreset));
                                    })
                                  }
                                  disabled={isSaving}
                                >
                                  <option value="desktop_1">PC 1 ecran</option>
                                  <option value="desktop_2">PC 2 ecrans</option>
                                  <option value="desktop_3">PC 3 ecrans</option>
                                  <option value="tablet">Tablette</option>
                                  <option value="mobile">Telephone mobile</option>
                                </select>
                              </label>
                              <label style={{ display: 'grid', gap: '0.35rem' }}>
                                <span>Grille</span>
                                <select value={String(set.gridColumns)} onChange={(event) => updateSetInEditingDraft(set.id, (item) => ({ ...item, gridColumns: Number(event.target.value) as ScreenGridColumns }))} disabled={isSaving}>
                                  <option value="12">12 colonnes</option>
                                  <option value="24">24 colonnes</option>
                                  <option value="36">36 colonnes</option>
                                  <option value="48">48 colonnes</option>
                                </select>
                              </label>
                            </div>
                            <small style={{ display: 'block', marginTop: '0.4rem', opacity: 0.8 }}>
                              Format par défaut pour les nouveaux écrans : {screenFormatSummary(ensureScreenSetFormat(set))}
                            </small>
                            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                              {set.screens.map((screen) => (
                                <div key={screen.id} className="studio-properties__section studio-properties__section--plain">
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <strong>{screen.name || `Ecran ${screen.order}`}</strong>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                      <Button type="button" variant="secondary" onClick={() => addTabGroupToScreen(set.id, screen.id)} disabled={isSaving}>
                                        Ajouter un onglet
                                      </Button>
                                      <Button type="button" variant="danger" onClick={() => removeScreenFromSet(set.id, screen.id)} disabled={isSaving || set.screens.length <= 1}>
                                        Supprimer ecran
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="grid" style={{ marginTop: '0.75rem' }}>
                                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                                      <span>Nom de l ecran</span>
                                      <input type="text" value={screen.name} onChange={(event) => updateScreenInSet(set.id, screen.id, (item) => ({ ...item, name: event.target.value }))} disabled={isSaving} />
                                    </label>
                                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                                      <span>Mode</span>
                                      <select value={screen.mode} onChange={(event) => updateScreenInSet(set.id, screen.id, (item) => ({ ...item, mode: event.target.value as ScreenDefinition['mode'] }))} disabled={isSaving}>
                                        <option value="main">Principal</option>
                                        <option value="detached">Detache</option>
                                      </select>
                                    </label>
                                    <label style={{ display: 'grid', gap: '0.35rem' }}>
                                      <span>Format d écran</span>
                                      <select
                                        value={ensureScreenFormatForScreen(screen, set).screenFormatPreset}
                                        onChange={(event) =>
                                          updateScreenInSet(set.id, screen.id, (item) =>
                                            applyScreenFormatPresetToScreen(ensureScreenFormatForScreen(item, set), event.target.value as ScreenFormatPreset)
                                          )
                                        }
                                        disabled={isSaving}
                                      >
                                        {SCREEN_FORMAT_PRESETS.map((preset) => (
                                          <option key={preset.preset} value={preset.preset}>
                                            {preset.label} · {preset.aspectRatio} · {screenOrientationLabel(preset.orientation)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                  <small style={{ display: 'block', marginTop: '0.4rem', opacity: 0.8 }}>
                                    Format : {screenFormatSummary(ensureScreenFormatForScreen(screen, set))}
                                  </small>
                                  <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
                                    {screen.tabGroups.map((group) => (
                                      <div key={group.id} className="studio-properties__section--plain" style={{ border: '1px dashed rgba(148, 163, 184, 0.35)', borderRadius: '0.9rem', padding: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                          <strong>{group.name || 'Onglet sans nom'}</strong>
                                          <Button type="button" variant="danger" onClick={() => removeTabGroupFromScreen(set.id, screen.id, group.id)} disabled={isSaving || screen.tabGroups.length <= 1}>
                                            Supprimer onglet
                                          </Button>
                                        </div>
                                        <div className="grid" style={{ marginTop: '0.6rem' }}>
                                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                                            <span>Nom de l onglet</span>
                                            <input
                                              type="text"
                                              value={group.name}
                                              onChange={(event) =>
                                                updateTabGroupInScreen(set.id, screen.id, group.id, (item) => ({
                                                  ...item,
                                                  name: event.target.value
                                                }))
                                              }
                                              disabled={isSaving}
                                            />
                                          </label>
                                          <label style={{ display: 'grid', gap: '0.35rem' }}>
                                            <span>Onglet par defaut</span>
                                            <select
                                              value={String(Boolean(group.isDefault))}
                                              onChange={(event) =>
                                                updateScreenInSet(set.id, screen.id, (item) => ({
                                                  ...item,
                                                  tabGroups: item.tabGroups.map((tab) => ({
                                                    ...tab,
                                                    isDefault: tab.id === group.id ? event.target.value === 'true' : false
                                                  }))
                                                }))
                                              }
                                              disabled={isSaving}
                                            >
                                              <option value="false">Non</option>
                                              <option value="true">Oui</option>
                                            </select>
                                          </label>
                                        </div>
                                        <small style={{ display: 'block', marginTop: '0.4rem', opacity: 0.8 }}>
                                          Widgets: {group.widgets.length}. Le placement visuel viendra dans l etape suivante du studio ecran.
                                        </small>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 style={{ marginTop: 0, marginBottom: '0.4rem' }}>{template.name}</h3>
                    <p style={{ marginTop: 0, marginBottom: '0.4rem' }}>{template.description || 'Aucune description'}</p>
                    <p style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                      Portee: {template.scopeType === 'system' ? `Systeme${template.scopeRefId ? ` (${template.scopeRefId})` : ''}` : 'Compte'}
                    </p>
                    <p style={{ marginTop: 0, marginBottom: '0.4rem', fontSize: '0.85rem' }}>
                      Role: {template.roleTarget} | Visibilite: {template.visibility}
                    </p>
                    <p style={{ marginTop: 0, marginBottom: '0.7rem', fontSize: '0.85rem' }}>
                      Sets: {setCount} | Ecrans: {screenCount} | MAJ: {new Date(template.updatedAt).toLocaleString()}
                    </p>
                    <p style={{ marginTop: 0, marginBottom: '0.7rem', fontSize: '0.85rem' }}>
                      {template.sets.map((set) => `${set.name} · ${set.screens.length} écran(s)`).join(' | ')}
                    </p>
                  </>
                )}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <Link className="button secondary" to={`/screen-templates/${template.id}/studio`}>
                    Ouvrir le studio
                  </Link>
                  {isEditing ? (
                    <>
                      <Button type="button" onClick={() => void handleSaveEdit()} disabled={isSaving}>
                        Enregistrer
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => { setEditingTemplateId(null); setEditingDraft(null); }} disabled={isSaving}>
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="secondary" onClick={() => startEditing(template)} disabled={isSaving || template.createdBy !== currentUser?.id}>
                      Modifier
                    </Button>
                  )}
                  <Button type="button" variant="danger" onClick={() => void handleDelete(template)} disabled={isSaving || template.createdBy !== currentUser?.id}>
                    Supprimer
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      </div>
    </Layout>
  );
}

function devicePresetLabel(devicePreset: ScreenSetDefinition['devicePreset']): string {
  switch (devicePreset) {
    case 'desktop_2':
      return 'PC 2 ecrans';
    case 'desktop_3':
      return 'PC 3 ecrans';
    case 'tablet':
      return 'Tablette';
    case 'mobile':
      return 'Telephone mobile';
    default:
      return 'PC 1 ecran';
  }
}
