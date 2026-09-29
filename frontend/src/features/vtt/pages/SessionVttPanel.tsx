import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/Button';
import { resourceRepository } from '../../../data/repositories';
import { ResourceItem } from '../../../types/resource';
import { Character } from '../../../types/character';
import { Session } from '../../../types/session';
import { VttFogShape, VttScene, VttState, VttToken, VttViewMode } from '../types';
import { vttRepository } from '../data/vttRepository';
import VttPixiStage, { VttMapTool } from '../components/VttPixiStage';

interface SessionVttPanelProps {
  session: Session;
  currentUserId: string;
  viewMode: VttViewMode;
  canManage: boolean;
  sessionResources: ResourceItem[];
  characters?: Character[];
  fullscreen?: boolean;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultScene(): VttScene {
  const now = nowIso();
  return {
    id: makeId('vtt_scene'),
    name: 'Scène principale',
    mapResourceId: null,
    mapImageUrl: null,
    mapWidth: 1600,
    mapHeight: 1000,
    grid: {
      enabled: true,
      type: 'square',
      size: 70,
      color: '#38bdf8',
      opacity: 0.35,
      offsetX: 0,
      offsetY: 0
    },
    fog: {
      enabled: true,
      mode: 'hidden-by-default',
      shapes: []
    },
    tokens: [],
    pings: [],
    permissions: {
      playersCanMoveOwnTokens: false
    },
    createdAt: now,
    updatedAt: now
  };
}

function ensureVttState(state: VttState | null): VttState {
  if (state && state.scenes.length > 0) {
    return state;
  }
  const scene = createDefaultScene();
  return {
    scenes: [scene],
    activeSceneId: scene.id,
    updatedAt: nowIso()
  };
}

function areVttStatesEqual(left: VttState | null, right: VttState | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',').pop() ?? '' : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

function buildMapName(file: File): string {
  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'carte';
  return `Carte VTT - ${baseName}`;
}

export default function SessionVttPanel({ session, currentUserId, viewMode, canManage, sessionResources, characters = [], fullscreen = false }: SessionVttPanelProps) {
  const [vttState, setVttState] = useState<VttState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingMap, setIsUploadingMap] = useState(false);
  const [availableResources, setAvailableResources] = useState<ResourceItem[]>(sessionResources);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [mapTool, setMapTool] = useState<VttMapTool>('pan');
  const [fogShapeSize, setFogShapeSize] = useState({ width: 420, height: 260 });
  const [pendingFogPolygon, setPendingFogPolygon] = useState<{ tool: 'fog_reveal_poly' | 'fog_hide_poly'; points: { x: number; y: number }[] } | null>(null);
  const imageResources = useMemo(() => availableResources.filter((resource) => resource.kind === 'image' && resource.contentUrl), [availableResources]);
  const activeScene = useMemo(() => {
    const state = ensureVttState(vttState);
    return state.scenes.find((scene) => scene.id === state.activeSceneId) ?? state.scenes[0];
  }, [vttState]);
  const selectedToken = useMemo(() => activeScene.tokens.find((token) => token.id === selectedTokenId) ?? null, [activeScene.tokens, selectedTokenId]);
  const characterOptions = useMemo(() => characters.filter((character) => character.sessionId === session.id), [characters, session.id]);
  const participantOptions = useMemo(() => session.participants ?? [], [session.participants]);
  const defaultGmUserId = session.gmUserIds?.[0] ?? session.gmUserId ?? session.ownerUserId ?? currentUserId;

  useEffect(() => {
    setAvailableResources(sessionResources);
  }, [sessionResources]);

  const saveState = useCallback(
    async (nextState: VttState, message?: string) => {
      setVttState(nextState);
      setIsSaving(true);
      setErrorMessage(null);
      try {
        const saved = await vttRepository.saveState(session.id, nextState);
        setVttState(ensureVttState(saved));
        setStatusMessage(message ?? 'VTT synchronisé.');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Impossible de synchroniser le VTT.');
      } finally {
        setIsSaving(false);
      }
    },
    [session.id]
  );

  const updateScene = useCallback(
    async (patch: Partial<VttScene>, message?: string) => {
      const base = ensureVttState(vttState);
      const nextScenes = base.scenes.map((scene) =>
        scene.id === activeScene.id ? { ...scene, ...patch, updatedAt: nowIso() } : scene
      );
      await saveState({ ...base, scenes: nextScenes, updatedAt: nowIso() }, message);
    },
    [activeScene.id, saveState, vttState]
  );

  useEffect(() => {
    let active = true;
    async function loadVtt() {
      try {
        const loaded = ensureVttState(await vttRepository.getState(session.id));
        if (active) {
          setVttState((current) => (areVttStatesEqual(current, loaded) ? current : loaded));
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger le VTT.');
          setVttState(ensureVttState(null));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }
    void loadVtt();
    const interval = window.setInterval(() => {
      void vttRepository.getState(session.id).then((loaded) => {
        if (active && !isSaving) {
          const nextState = ensureVttState(loaded);
          setVttState((current) => (areVttStatesEqual(current, nextState) ? current : nextState));
        }
      }).catch(() => undefined);
    }, 800);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isSaving, session.id]);

  const handleAddToken = async () => {
    if (!canManage) {
      return;
    }
    const token: VttToken = {
      id: makeId('vtt_token'),
      name: `Pion ${activeScene.tokens.length + 1}`,
      characterId: null,
      imageResourceId: null,
      imageUrl: null,
      color: '#f59e0b',
      x: 240 + activeScene.tokens.length * 40,
      y: 220 + activeScene.tokens.length * 30,
      width: 56,
      height: 56,
      rotation: 0,
      ownerUserId: defaultGmUserId,
      visibleToPlayers: true,
      locked: false
    };
    setSelectedTokenId(token.id);
    await updateScene({ tokens: [...activeScene.tokens, token] }, 'Pion ajouté.');
  };

  const handleAddFogRectangle = async (mode: 'reveal' | 'hide') => {
    if (!canManage) {
      return;
    }
    const index = activeScene.fog.shapes.length;
    const shape: VttFogShape = {
      id: makeId('vtt_fog'),
      type: 'rectangle',
      mode,
      points: [
        { x: 160 + index * 35, y: 150 + index * 35 },
        { x: 520 + index * 35, y: 390 + index * 35 }
      ]
    };
    await updateScene({ fog: { ...activeScene.fog, shapes: [...activeScene.fog.shapes, shape] } }, mode === 'reveal' ? 'Zone révélée ajoutée.' : 'Zone de brouillard ajoutée.');
  };

  const handleAddFogPolygon = async (mode: 'reveal' | 'hide') => {
    if (!canManage) {
      return;
    }
    const shape: VttFogShape = {
      id: makeId('vtt_fog'),
      type: 'polygon',
      mode,
      points: [
        { x: 760, y: 180 },
        { x: 1040, y: 260 },
        { x: 960, y: 520 },
        { x: 700, y: 420 }
      ]
    };
    await updateScene({ fog: { ...activeScene.fog, shapes: [...activeScene.fog.shapes, shape] } }, mode === 'reveal' ? 'Pièce révélée ajoutée.' : 'Polygone de brouillard ajouté.');
  };

  const handleResetFog = async () => {
    if (!canManage) {
      return;
    }
    await updateScene({ fog: { enabled: true, mode: 'hidden-by-default', shapes: [] } }, 'Brouillard remis par défaut : carte entièrement masquée.');
  };

  const handleShowAllFog = async () => {
    if (!canManage) {
      return;
    }
    await updateScene({ fog: { ...activeScene.fog, enabled: false, shapes: [] } }, 'Brouillard désactivé : tout est visible.');
  };

  const handleClearFogShapes = async () => {
    if (!canManage) {
      return;
    }
    await updateScene({ fog: { ...activeScene.fog, shapes: [] } }, 'Toutes les zones de brouillard ont été supprimées.');
  };

  const handleMapPing = async (x: number, y: number) => {
    const ping = {
      id: makeId('vtt_ping'),
      x,
      y,
      color: viewMode === 'gm' ? '#f97316' : '#38bdf8',
      label: viewMode === 'gm' ? 'Ping MJ' : 'Ping joueur',
      createdByUserId: currentUserId,
      createdAt: nowIso()
    };
    const recentPings = (activeScene.pings ?? []).filter((item) => Date.now() - new Date(item.createdAt).getTime() < 15000);
    await updateScene({ pings: [...recentPings, ping].slice(-12) }, 'Ping envoyé.');
    setMapTool('pan');
  };

  const handleFogShapePlace = async (tool: Exclude<VttMapTool, 'pan' | 'ping'>, x: number, y: number) => {
    if (!canManage) {
      return;
    }
    if (tool.endsWith('poly')) {
      const polygonTool = tool as 'fog_reveal_poly' | 'fog_hide_poly';
      setPendingFogPolygon((current) => ({
        tool: current?.tool === polygonTool ? current.tool : polygonTool,
        points: [...(current?.tool === polygonTool ? current.points : []), { x, y }]
      }));
      setStatusMessage('Point ajouté au polygone. Clique Terminer polygone quand le contour est fini.');
      return;
    }
    const mode = tool.includes('reveal') ? 'reveal' : 'hide';
    const width = Math.max(40, Math.min(4000, fogShapeSize.width));
    const height = Math.max(40, Math.min(4000, fogShapeSize.height));
    const left = Math.round(x - width / 2);
    const top = Math.round(y - height / 2);
    const right = Math.round(x + width / 2);
    const bottom = Math.round(y + height / 2);
    const shape: VttFogShape = tool.endsWith('rect')
      ? {
          id: makeId('vtt_fog'),
          type: 'rectangle',
          mode,
          points: [
            { x: left, y: top },
            { x: right, y: bottom }
          ]
        }
      : {
          id: makeId('vtt_fog'),
          type: 'polygon',
          mode,
          points: [
            { x, y: top },
            { x: right, y },
            { x, y: bottom },
            { x: left, y }
          ]
        };
    await updateScene({ fog: { ...activeScene.fog, enabled: true, shapes: [...activeScene.fog.shapes, shape] } }, mode === 'reveal' ? 'Zone révélée placée.' : 'Zone masquée placée.');
    setMapTool('pan');
  };

  const selectFogTool = (tool: Exclude<VttMapTool, 'pan' | 'ping'>) => {
    if (mapTool === tool) {
      setPendingFogPolygon(null);
      setMapTool('pan');
      return;
    }
    setPendingFogPolygon(tool.endsWith('poly') ? { tool: tool as 'fog_reveal_poly' | 'fog_hide_poly', points: [] } : null);
    setMapTool(tool);
  };

  const handleFogRectangleDraw = async (tool: 'fog_reveal_rect' | 'fog_hide_rect', startX: number, startY: number, endX: number, endY: number) => {
    if (!canManage) return;
    if (Math.abs(endX - startX) < 12 || Math.abs(endY - startY) < 12) {
      setErrorMessage('Rectangle trop petit : glisse du coin de départ au coin opposé.');
      return;
    }
    const mode = tool.includes('reveal') ? 'reveal' : 'hide';
    const shape: VttFogShape = {
      id: makeId('vtt_fog'),
      type: 'rectangle',
      mode,
      points: [
        { x: startX, y: startY },
        { x: endX, y: endY }
      ]
    };
    await updateScene({ fog: { ...activeScene.fog, enabled: true, shapes: [...activeScene.fog.shapes, shape] } }, mode === 'reveal' ? 'Rectangle révélé dessiné.' : 'Rectangle masqué dessiné.');
    setMapTool('pan');
  };

  const finishFogPolygon = async () => {
    if (!pendingFogPolygon || pendingFogPolygon.points.length < 3) {
      setErrorMessage('Un polygone doit contenir au moins 3 points.');
      return;
    }
    const mode = pendingFogPolygon.tool.includes('reveal') ? 'reveal' : 'hide';
    const shape: VttFogShape = {
      id: makeId('vtt_fog'),
      type: 'polygon',
      mode,
      points: pendingFogPolygon.points
    };
    setPendingFogPolygon(null);
    await updateScene({ fog: { ...activeScene.fog, enabled: true, shapes: [...activeScene.fog.shapes, shape] } }, mode === 'reveal' ? 'Polygone révélé dessiné.' : 'Polygone masqué dessiné.');
    setMapTool('pan');
  };

  const handleTokenMove = async (tokenId: string, x: number, y: number) => {
    const token = activeScene.tokens.find((item) => item.id === tokenId);
    if (!token) {
      return;
    }
    const allowed = canManage || (activeScene.permissions.playersCanMoveOwnTokens && (token.ownerUserId ?? defaultGmUserId) === currentUserId);
    if (!allowed) {
      return;
    }
    const nextTokens = activeScene.tokens.map((item) => (item.id === tokenId ? { ...item, x, y } : item));
    await updateScene({ tokens: nextTokens }, 'Position du pion synchronisée.');
  };

  const handleTokenPatch = async (tokenId: string, patch: Partial<VttToken>, message = 'Pion mis à jour.') => {
    if (!canManage) {
      return;
    }
    const nextTokens = activeScene.tokens.map((token) => (token.id === tokenId ? { ...token, ...patch } : token));
    await updateScene({ tokens: nextTokens }, message);
  };

  const handleTokenImageChange = async (tokenId: string, resourceId: string) => {
    const resource = imageResources.find((item) => item.id === resourceId) ?? null;
    await handleTokenPatch(
      tokenId,
      {
        imageResourceId: resource?.id ?? null,
        imageUrl: resource?.contentUrl ?? null
      },
      resource ? 'Image du pion mise à jour.' : 'Image du pion retirée.'
    );
  };

  const handleTokenCharacterChange = async (tokenId: string, characterId: string) => {
    const character = characterOptions.find((item) => item.id === characterId) ?? null;
    await handleTokenPatch(
      tokenId,
      {
        characterId: character?.id ?? null,
        ownerUserId: character?.ownerUserId ?? defaultGmUserId,
        name: character?.name || activeScene.tokens.find((token) => token.id === tokenId)?.name || 'Pion'
      },
      character ? 'Pion rattaché à la fiche personnage.' : 'Pion rattaché au MJ.'
    );
  };

  const handleDeleteToken = async (tokenId: string) => {
    if (!canManage) {
      return;
    }
    const nextTokens = activeScene.tokens.filter((token) => token.id !== tokenId);
    setSelectedTokenId(null);
    await updateScene({ tokens: nextTokens }, 'Pion supprimé.');
  };

  const handleMapResourceChange = async (resourceId: string) => {
    const resource = imageResources.find((item) => item.id === resourceId) ?? null;
    await updateScene(
      {
        mapResourceId: resource?.id ?? null,
        mapImageUrl: resource?.contentUrl ?? null,
        mapWidth: activeScene.mapWidth || 1600,
        mapHeight: activeScene.mapHeight || 1000
      },
      resource ? 'Carte VTT sélectionnée.' : 'Carte VTT retirée.'
    );
  };

  const handleActiveSceneChange = async (sceneId: string) => {
    const base = ensureVttState(vttState);
    if (!base.scenes.some((scene) => scene.id === sceneId)) {
      return;
    }
    await saveState({ ...base, activeSceneId: sceneId, updatedAt: nowIso() }, 'Carte VTT active changée.');
  };

  const handleAddScene = async () => {
    if (!canManage) {
      return;
    }
    const base = ensureVttState(vttState);
    const scene = {
      ...createDefaultScene(),
      name: `Carte VTT ${base.scenes.length + 1}`
    };
    await saveState({ ...base, scenes: [...base.scenes, scene], activeSceneId: scene.id, updatedAt: nowIso() }, 'Nouvelle carte VTT créée.');
  };

  const handleMapUpload = async (file: File | null) => {
    if (!file || !canManage) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Le fichier doit être une image.');
      return;
    }
    setIsUploadingMap(true);
    setErrorMessage(null);
    try {
      const name = buildMapName(file);
      const contentBase64 = await fileToBase64(file);
      const resource = await resourceRepository.create({
        name,
        originalName: file.name,
        mimeType: file.type || 'image/png',
        scopeType: 'session',
        scopeRefId: session.id,
        visibility: 'private',
        sessionAudience: 'session_gm',
        canReshareInSession: false,
        contentBase64
      });
      setAvailableResources((items) => [resource, ...items.filter((item) => item.id !== resource.id)]);
      await updateScene(
        {
          name,
          mapResourceId: resource.id,
          mapImageUrl: resource.contentUrl ?? null,
          mapWidth: activeScene.mapWidth || 1600,
          mapHeight: activeScene.mapHeight || 1000
        },
        'Carte importée et sélectionnée pour le VTT.'
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d’importer la carte VTT.');
    } finally {
      setIsUploadingMap(false);
    }
  };

  if (isLoading) {
    return <section className="card session-section">Chargement du VTT...</section>;
  }

  return (
    <section className={`card session-section vtt-panel${fullscreen ? ' vtt-panel--fullscreen' : ''}`}>
      <div className="session-section__header">
        <div>
          <h2>Table virtuelle</h2>
          <p>Module VTT PixiJS : carte, grille, pions et brouillard de guerre manuel.</p>
        </div>
        <div className="session-inline-actions">
          <span className="session-status-pill">Vue {viewMode === 'gm' ? 'MJ' : 'Joueur'}</span>
          {!fullscreen ? <a className="button secondary" href={`/sessions/${session.id}/vtt/fullscreen`} target="_blank" rel="noreferrer">Plein écran VTT</a> : null}
        </div>
      </div>

      {statusMessage ? <p className="home-alert home-alert--success">{statusMessage}</p> : null}
      {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}

      {canManage ? (
        <div className="vtt-toolbar">
          <label>
            <span>Carte VTT active</span>
            <select value={activeScene.id} onChange={(event) => void handleActiveSceneChange(event.target.value)} disabled={isSaving || isUploadingMap}>
              {ensureVttState(vttState).scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>{scene.name}</option>
              ))}
            </select>
          </label>
          <Button type="button" variant="secondary" onClick={() => void handleAddScene()} disabled={isSaving || isUploadingMap}>Nouvelle carte VTT</Button>
          <label>
            <span>Importer une carte MJ</span>
            <input type="file" accept="image/*" disabled={isSaving || isUploadingMap} onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.currentTarget.value = '';
              void handleMapUpload(file);
            }} />
          </label>
          <label>
            <span>Carte depuis les ressources</span>
            <select value={activeScene.mapResourceId ?? ''} onChange={(event) => void handleMapResourceChange(event.target.value)} disabled={isSaving}>
              <option value="">Aucune carte</option>
              {imageResources.map((resource) => (
                <option key={resource.id} value={resource.id}>{resource.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Grille</span>
            <select value={activeScene.grid.type} onChange={(event) => void updateScene({ grid: { ...activeScene.grid, type: event.target.value as 'square' | 'hex' } }, 'Type de grille mis à jour.')} disabled={isSaving}>
              <option value="square">Carrée</option>
              <option value="hex">Hexagonale</option>
            </select>
          </label>
          <label>
            <span>Taille grille</span>
            <input type="number" min={16} max={240} value={activeScene.grid.size} onChange={(event) => void updateScene({ grid: { ...activeScene.grid, size: Number(event.target.value) || 70 } }, 'Taille de grille mise à jour.')} disabled={isSaving} />
          </label>
          <label className="vtt-checkbox">
            <input type="checkbox" checked={activeScene.permissions.playersCanMoveOwnTokens} onChange={(event) => void updateScene({ permissions: { playersCanMoveOwnTokens: event.target.checked } }, 'Permission de déplacement joueur mise à jour.')} disabled={isSaving} />
            Joueurs autorisés à déplacer leur pion
          </label>
          <Button type="button" variant="secondary" onClick={() => setMapTool(mapTool === 'ping' ? 'pan' : 'ping')} disabled={isSaving}>{mapTool === 'ping' ? 'Clique sur la carte...' : 'Ping carte'}</Button>
          <Button type="button" variant="secondary" onClick={() => void handleAddToken()} disabled={isSaving}>Ajouter un pion</Button>
          <label className="vtt-checkbox">
            <input type="checkbox" checked={activeScene.fog.enabled} onChange={(event) => void updateScene({ fog: { ...activeScene.fog, enabled: event.target.checked } }, event.target.checked ? 'Brouillard activé.' : 'Brouillard désactivé.')} disabled={isSaving} />
            Brouillard actif
          </label>
          <label>
            <span>Mode brouillard</span>
            <select value={activeScene.fog.mode} onChange={(event) => void updateScene({ fog: { ...activeScene.fog, mode: event.target.value as 'hidden-by-default' | 'visible-by-default' } }, 'Mode de brouillard mis à jour.')} disabled={isSaving}>
              <option value="hidden-by-default">Tout masquer puis révéler les pièces</option>
              <option value="visible-by-default">Tout visible puis masquer des zones</option>
            </select>
          </label>
          <p className="session-inline-note" style={{ margin: 0 }}>Rectangle : clique et glisse du premier coin au coin opposé. Polygone : clique chaque point du contour, puis termine le polygone.</p>
          <Button type="button" variant="secondary" onClick={() => selectFogTool('fog_reveal_rect')} disabled={isSaving}>{mapTool === 'fog_reveal_rect' ? 'Glisse pour révéler rectangle' : 'Dessiner révélation rectangle'}</Button>
          <Button type="button" variant="secondary" onClick={() => selectFogTool('fog_reveal_poly')} disabled={isSaving}>{mapTool === 'fog_reveal_poly' ? 'Clique les points à révéler' : 'Dessiner révélation polygone'}</Button>
          <Button type="button" variant="secondary" onClick={() => selectFogTool('fog_hide_rect')} disabled={isSaving}>{mapTool === 'fog_hide_rect' ? 'Glisse pour cacher rectangle' : 'Dessiner cache rectangle'}</Button>
          <Button type="button" variant="secondary" onClick={() => selectFogTool('fog_hide_poly')} disabled={isSaving}>{mapTool === 'fog_hide_poly' ? 'Clique les points à cacher' : 'Dessiner cache polygone'}</Button>
          {pendingFogPolygon ? (
            <>
              <span className="session-status-pill">Polygone : {pendingFogPolygon.points.length} point(s)</span>
              <Button type="button" variant="secondary" onClick={() => void finishFogPolygon()} disabled={isSaving || pendingFogPolygon.points.length < 3}>Terminer polygone</Button>
              <Button type="button" variant="secondary" onClick={() => { setPendingFogPolygon(null); setMapTool('pan'); }} disabled={isSaving}>Annuler polygone</Button>
            </>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => void handleShowAllFog()} disabled={isSaving}>Tout afficher</Button>
          <Button type="button" variant="secondary" onClick={() => void handleClearFogShapes()} disabled={isSaving}>Supprimer zones</Button>
          <Button type="button" variant="secondary" onClick={() => void handleResetFog()} disabled={isSaving}>Brouillard par défaut</Button>
        </div>
      ) : (
        <div className="vtt-toolbar">
          <Button type="button" variant="secondary" onClick={() => setMapTool(mapTool === 'ping' ? 'pan' : 'ping')} disabled={isSaving}>{mapTool === 'ping' ? 'Clique sur la carte...' : 'Ping carte'}</Button>
        </div>
      )}

      {canManage && selectedToken ? (
        <div className="vtt-token-editor">
          <div>
            <h3>Édition du pion</h3>
            <p>{selectedToken.name} — position {Math.round(selectedToken.x)}, {Math.round(selectedToken.y)}</p>
          </div>
          <label>
            <span>Nom</span>
            <input value={selectedToken.name} onChange={(event) => void handleTokenPatch(selectedToken.id, { name: event.target.value || 'Pion' })} disabled={isSaving} />
          </label>
          <label>
            <span>Couleur</span>
            <input type="color" value={selectedToken.color || '#f59e0b'} onChange={(event) => void handleTokenPatch(selectedToken.id, { color: event.target.value })} disabled={isSaving} />
          </label>
          <label>
            <span>Taille</span>
            <input type="number" min={16} max={240} value={selectedToken.width} onChange={(event) => {
              const size = Number(event.target.value) || 56;
              void handleTokenPatch(selectedToken.id, { width: size, height: size });
            }} disabled={isSaving} />
          </label>
          <label>
            <span>Fiche personnage</span>
            <select value={selectedToken.characterId ?? ''} onChange={(event) => void handleTokenCharacterChange(selectedToken.id, event.target.value)} disabled={isSaving}>
              <option value="">Aucune — rattaché au MJ</option>
              {characterOptions.map((character) => (
                <option key={character.id} value={character.id}>{character.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Propriétaire effectif</span>
            <select value={selectedToken.ownerUserId ?? defaultGmUserId} onChange={(event) => void handleTokenPatch(selectedToken.id, { ownerUserId: event.target.value || defaultGmUserId, characterId: null })} disabled={isSaving || Boolean(selectedToken.characterId)}>
              <option value={defaultGmUserId}>MJ</option>
              {participantOptions.map((participant) => (
                <option key={participant.userId} value={participant.userId}>{participant.nickname || participant.displayName || participant.userId}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Image du pion</span>
            <select value={selectedToken.imageResourceId ?? ''} onChange={(event) => void handleTokenImageChange(selectedToken.id, event.target.value)} disabled={isSaving}>
              <option value="">Cercle couleur</option>
              {imageResources.map((resource) => (
                <option key={resource.id} value={resource.id}>{resource.name}</option>
              ))}
            </select>
          </label>
          <label className="vtt-checkbox">
            <input type="checkbox" checked={selectedToken.visibleToPlayers} onChange={(event) => void handleTokenPatch(selectedToken.id, { visibleToPlayers: event.target.checked })} disabled={isSaving} />
            Visible par les joueurs
          </label>
          <label className="vtt-checkbox">
            <input type="checkbox" checked={selectedToken.locked} onChange={(event) => void handleTokenPatch(selectedToken.id, { locked: event.target.checked })} disabled={isSaving} />
            Verrouillé
          </label>
          <Button type="button" variant="secondary" onClick={() => void handleDeleteToken(selectedToken.id)} disabled={isSaving}>Supprimer le pion</Button>
        </div>
      ) : null}

      <VttPixiStage
        scene={activeScene}
        viewMode={viewMode}
        currentUserId={currentUserId}
        selectedTokenId={selectedTokenId}
        mapTool={mapTool}
        onTokenSelect={setSelectedTokenId}
        onTokenMove={(tokenId, x, y) => void handleTokenMove(tokenId, x, y)}
        onMapPing={(x, y) => void handleMapPing(x, y)}
        onFogShapePlace={(tool, x, y) => void handleFogShapePlace(tool, x, y)}
        onFogRectangleDraw={(tool, startX, startY, endX, endY) => void handleFogRectangleDraw(tool, startX, startY, endX, endY)}
      />
      <p className="session-inline-note" style={{ marginBottom: 0 }}>
        Synchronisation VTT : sauvegarde immédiate + rafraîchissement rapide toutes les 0,8 seconde. La couche WebSocket dédiée reste prévue pour remplacer ce polling dans la suite du module.
      </p>
    </section>
  );
}
