import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { buildApiUrl, getAccessToken } from '../../../services/apiClient';
import { VttScene, VttViewMode } from '../types';
import './VttPixiStage.css';

export type VttMapTool = 'pan' | 'ping' | 'fog_reveal_rect' | 'fog_reveal_poly' | 'fog_hide_rect' | 'fog_hide_poly';

interface VttPixiStageProps {
  scene: VttScene;
  viewMode: VttViewMode;
  currentUserId: string;
  selectedTokenId?: string | null;
  mapTool?: VttMapTool;
  onTokenSelect?: (tokenId: string) => void;
  onTokenMove?: (tokenId: string, x: number, y: number) => void;
  onMapPing?: (x: number, y: number) => void;
  onFogShapePlace?: (tool: Exclude<VttMapTool, 'pan' | 'ping'>, x: number, y: number) => void;
  onFogRectangleDraw?: (tool: 'fog_reveal_rect' | 'fog_hide_rect', startX: number, startY: number, endX: number, endY: number) => void;
}

function parseColor(value: string, fallback = 0x38bdf8): number {
  const normalized = value.trim().replace(/^#/, '');
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function drawGrid(graphics: Graphics, scene: VttScene): void {
  const { grid } = scene;
  if (!grid.enabled || grid.size <= 4) return;
  const width = Math.max(scene.mapWidth || 1600, 1600);
  const height = Math.max(scene.mapHeight || 1000, 1000);
  graphics.setStrokeStyle({ width: 1, color: parseColor(grid.color), alpha: grid.opacity });
  if (grid.type === 'square') {
    for (let x = grid.offsetX % grid.size; x <= width; x += grid.size) graphics.moveTo(x, 0).lineTo(x, height);
    for (let y = grid.offsetY % grid.size; y <= height; y += grid.size) graphics.moveTo(0, y).lineTo(width, y);
    graphics.stroke();
    return;
  }
  const radius = grid.size / 2;
  const hexHeight = Math.sqrt(3) * radius;
  const horizontalStep = radius * 2 * 0.75;
  for (let col = -1; col * horizontalStep < width + grid.size; col += 1) {
    for (let row = -1; row * hexHeight < height + grid.size; row += 1) {
      const cx = grid.offsetX + col * horizontalStep;
      const cy = grid.offsetY + row * hexHeight + (col % 2 ? hexHeight / 2 : 0);
      const points = Array.from({ length: 6 }, (_, index) => {
        const angle = Math.PI / 3 * index;
        return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      });
      graphics.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
      graphics.closePath();
    }
  }
  graphics.stroke();
}

function drawFogShape(graphics: Graphics, shape: VttScene['fog']['shapes'][number], color: number, alpha: number): void {
  const points = shape.points;
  if (points.length < 2) return;
  if (shape.type === 'rectangle') {
    const [start, end] = points;
    graphics.rect(start.x, start.y, end.x - start.x, end.y - start.y).fill({ color, alpha });
    return;
  }
  if (points.length >= 3) {
    graphics.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
    graphics.closePath().fill({ color, alpha });
  }
}

function drawFogOverlay(graphics: Graphics, scene: VttScene, viewMode: VttViewMode): void {
  if (!scene.fog.enabled) return;
  const width = Math.max(scene.mapWidth || 1600, 1600);
  const height = Math.max(scene.mapHeight || 1000, 1000);
  if (viewMode === 'gm') {
    graphics.rect(0, 0, width, height).fill({ color: 0x020617, alpha: 0.16 });
    for (const shape of scene.fog.shapes) drawFogShape(graphics, shape, shape.mode === 'reveal' ? 0x22c55e : 0xef4444, 0.32);
    return;
  }
  if (scene.fog.mode === 'hidden-by-default') {
    graphics.rect(0, 0, width, height).fill({ color: 0x020617, alpha: 1 });
    for (const shape of scene.fog.shapes.filter((item) => item.mode === 'hide')) drawFogShape(graphics, shape, 0x020617, 1);
    return;
  }
  for (const shape of scene.fog.shapes.filter((item) => item.mode === 'hide')) drawFogShape(graphics, shape, 0x020617, 1);
}

function drawPings(container: Container, scene: VttScene): void {
  const now = Date.now();
  for (const ping of scene.pings ?? []) {
    const age = now - new Date(ping.createdAt).getTime();
    if (age > 15000) continue;
    const alpha = Math.max(0.15, 1 - age / 15000);
    const color = parseColor(ping.color || '#38bdf8', 0x38bdf8);
    const marker = new Container();
    marker.x = ping.x;
    marker.y = ping.y;
    marker.addChild(new Graphics().circle(0, 0, 10).fill({ color, alpha: 0.75 * alpha }));
    marker.addChild(new Graphics().circle(0, 0, 34).stroke({ color, width: 5, alpha }));
    marker.addChild(new Graphics().moveTo(-46, 0).lineTo(46, 0).moveTo(0, -46).lineTo(0, 46).stroke({ color, width: 2, alpha: 0.8 * alpha }));
    container.addChild(marker);
  }
}

async function createMapSprite(src: string): Promise<Sprite> {
  const target = buildApiUrl(src);
  const token = getAccessToken();
  const response = await fetch(target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error(`Carte VTT indisponible (${response.status})`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Image VTT illisible.')); });
    return new Sprite(Texture.from(image));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function VttPixiStage({ scene, viewMode, currentUserId, selectedTokenId, mapTool = 'pan', onTokenSelect, onTokenMove, onMapPing, onFogShapePlace, onFogRectangleDraw }: VttPixiStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onTokenMoveRef = useRef<typeof onTokenMove>(onTokenMove);
  const onTokenSelectRef = useRef<typeof onTokenSelect>(onTokenSelect);
  const onMapPingRef = useRef<typeof onMapPing>(onMapPing);
  const onFogShapePlaceRef = useRef<typeof onFogShapePlace>(onFogShapePlace);
  const onFogRectangleDrawRef = useRef<typeof onFogRectangleDraw>(onFogRectangleDraw);
  useEffect(() => { onTokenMoveRef.current = onTokenMove; }, [onTokenMove]);
  useEffect(() => { onTokenSelectRef.current = onTokenSelect; }, [onTokenSelect]);
  useEffect(() => { onMapPingRef.current = onMapPing; }, [onMapPing]);
  useEffect(() => { onFogShapePlaceRef.current = onFogShapePlace; }, [onFogShapePlace]);
  useEffect(() => { onFogRectangleDrawRef.current = onFogRectangleDraw; }, [onFogRectangleDraw]);

  useEffect(() => {
    let destroyed = false;
    let cleanup: (() => void) | null = null;
    async function mount() {
      const host = hostRef.current;
      if (!host) return;
      const app = new Application();
      await app.init({ resizeTo: host, background: '#0f172a', antialias: true });
      if (destroyed) { app.destroy(true); return; }
      host.replaceChildren(app.canvas);
      const world = new Container();
      app.stage.addChild(world);
      let mapTexture: Texture | null = null;
      if (scene.mapImageUrl) {
        try {
          const mapSprite = await createMapSprite(scene.mapImageUrl);
          mapTexture = mapSprite.texture;
          mapSprite.width = scene.mapWidth || mapSprite.width;
          mapSprite.height = scene.mapHeight || mapSprite.height;
          world.addChild(mapSprite);
        } catch {
          world.addChild(new Graphics().rect(0, 0, scene.mapWidth || 1600, scene.mapHeight || 1000).fill({ color: 0x1e293b }));
        }
      } else {
        world.addChild(new Graphics().rect(0, 0, scene.mapWidth || 1600, scene.mapHeight || 1000).fill({ color: 0x1e293b }));
      }
      const gridLayer = new Graphics();
      drawGrid(gridLayer, scene);
      world.addChild(gridLayer);
      const fogLayer = new Graphics();
      drawFogOverlay(fogLayer, scene, viewMode);
      world.addChild(fogLayer);
      if (viewMode === 'player' && scene.fog.enabled && scene.fog.mode === 'hidden-by-default' && mapTexture) {
        const revealShapes = scene.fog.shapes.filter((shape) => shape.mode === 'reveal');
        if (revealShapes.length > 0) {
          const revealedLayer = new Container();
          const revealedMap = new Sprite(mapTexture);
          revealedMap.width = scene.mapWidth || revealedMap.width;
          revealedMap.height = scene.mapHeight || revealedMap.height;
          revealedLayer.addChild(revealedMap);
          const revealedGrid = new Graphics();
          drawGrid(revealedGrid, scene);
          revealedLayer.addChild(revealedGrid);
          const mask = new Graphics();
          revealShapes.forEach((shape) => drawFogShape(mask, shape, 0xffffff, 1));
          revealedLayer.mask = mask;
          world.addChild(revealedLayer);
          world.addChild(mask);
        }
      }
      const tokenLayer = new Container();
      world.addChild(tokenLayer);
      for (const token of scene.tokens.filter((item) => viewMode === 'gm' || item.visibleToPlayers)) {
        const tokenDisplay = new Container();
        const radius = Math.max(token.width, token.height) / 2;
        if (token.imageUrl) {
          try {
            const tokenSprite = await createMapSprite(token.imageUrl);
            tokenSprite.anchor.set(0.5);
            tokenSprite.width = token.width;
            tokenSprite.height = token.height;
            tokenDisplay.addChild(tokenSprite);
          } catch {
            tokenDisplay.addChild(new Graphics().circle(0, 0, radius).fill({ color: parseColor(token.color || '#f59e0b', 0xf59e0b), alpha: 0.92 }).stroke({ color: 0xffffff, width: 2, alpha: 0.8 }));
          }
        } else {
          tokenDisplay.addChild(new Graphics().circle(0, 0, radius).fill({ color: parseColor(token.color || (token.ownerUserId === currentUserId ? '#38bdf8' : '#f59e0b'), 0xf59e0b), alpha: 0.92 }).stroke({ color: 0xffffff, width: 2, alpha: 0.8 }));
        }
        if (token.id === selectedTokenId) tokenDisplay.addChild(new Graphics().circle(0, 0, radius + 5).stroke({ color: 0x22c55e, width: 4, alpha: 0.95 }));
        tokenDisplay.x = token.x;
        tokenDisplay.y = token.y;
        tokenDisplay.eventMode = 'static';
        tokenDisplay.cursor = token.locked ? 'not-allowed' : 'grab';
        let dragging = false;
        tokenDisplay.on('pointerdown', (event) => {
          event.stopPropagation();
          onTokenSelectRef.current?.(token.id);
          if (token.locked || (viewMode !== 'gm' && token.ownerUserId !== currentUserId)) return;
          dragging = true;
          tokenDisplay.cursor = 'grabbing';
        });
        tokenDisplay.on('pointerup', () => {
          if (dragging) {
            dragging = false;
            tokenDisplay.cursor = token.locked ? 'not-allowed' : 'grab';
            onTokenMoveRef.current?.(token.id, Math.round(tokenDisplay.x), Math.round(tokenDisplay.y));
          }
        });
        tokenDisplay.on('pointerupoutside', () => { dragging = false; tokenDisplay.cursor = token.locked ? 'not-allowed' : 'grab'; });
        tokenDisplay.on('pointermove', (event) => {
          if (!dragging) return;
          const position = event.getLocalPosition(world);
          tokenDisplay.x = position.x;
          tokenDisplay.y = position.y;
        });
        tokenLayer.addChild(tokenDisplay);
      }
      const pingLayer = new Container();
      drawPings(pingLayer, scene);
      world.addChild(pingLayer);
      let isPanning = false;
      let fogRectStart: { x: number; y: number; tool: 'fog_reveal_rect' | 'fog_hide_rect' } | null = null;
      let lastPan = { x: 0, y: 0 };
      app.stage.eventMode = 'static';
      app.stage.hitArea = app.screen;
      app.stage.on('pointerdown', (event) => {
        if (event.target !== app.stage) return;
        if (mapTool === 'ping') {
          const position = event.getLocalPosition(world);
          onMapPingRef.current?.(Math.round(position.x), Math.round(position.y));
          return;
        }
        if (mapTool !== 'pan') {
          const position = event.getLocalPosition(world);
          if (mapTool === 'fog_reveal_rect' || mapTool === 'fog_hide_rect') {
            fogRectStart = { x: Math.round(position.x), y: Math.round(position.y), tool: mapTool };
            return;
          }
          onFogShapePlaceRef.current?.(mapTool, Math.round(position.x), Math.round(position.y));
          return;
        }
        isPanning = true;
        lastPan = { x: event.global.x, y: event.global.y };
      });
      app.stage.on('pointerup', (event) => {
        if (fogRectStart) {
          const position = event.getLocalPosition(world);
          onFogRectangleDrawRef.current?.(fogRectStart.tool, fogRectStart.x, fogRectStart.y, Math.round(position.x), Math.round(position.y));
          fogRectStart = null;
        }
        isPanning = false;
      });
      app.stage.on('pointerupoutside', () => { isPanning = false; fogRectStart = null; });
      app.stage.on('pointermove', (event) => {
        if (!isPanning) return;
        const next = { x: event.global.x, y: event.global.y };
        world.x += next.x - lastPan.x;
        world.y += next.y - lastPan.y;
        lastPan = next;
      });
      const wheelHandler = (event: WheelEvent) => { event.preventDefault(); const factor = event.deltaY > 0 ? 0.92 : 1.08; world.scale.set(Math.max(0.2, Math.min(4, world.scale.x * factor))); };
      host.addEventListener('wheel', wheelHandler, { passive: false });
      cleanup = () => { host.removeEventListener('wheel', wheelHandler); app.destroy(true); };
    }
    void mount();
    return () => { destroyed = true; cleanup?.(); };
  }, [currentUserId, mapTool, scene, selectedTokenId, viewMode]);

  return <div ref={hostRef} className="vtt-pixi-stage" aria-label="Table virtuelle Nexus Forge" />;
}
