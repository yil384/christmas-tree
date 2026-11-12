export interface PanoramaDetailTile {
  src: string;
  centerU: number;
  spanU: number;
  minV: number;
  maxV: number;
}
/** A native perspective painting with its actual camera orientation and lens. */
export interface PanoramaPanel {
  src: string;
  compactSrc?: string;
  width: number;
  height: number;
  yaw: number;
  pitch: number;
  horizontalFov: number;
  verticalFov: number;
}
export interface SceneBackground {
  src: string | null;
  brightness: number;
  focus: [number, number];
  projection: 'image' | 'perspective' | 'equirectangular';
  rotation: number;
  groundColor?: string;
  detailTiles?: PanoramaDetailTile[];
  panels?: PanoramaPanel[];
}
export interface SceneCat {
  src: string | null;
  video: string | null;
}
export interface SceneConfig {
  greeting: string;
  background: SceneBackground;
  snow: boolean;
  cat: SceneCat;
}
export const defaultScene: SceneConfig = {
  greeting: '祝集美小喵【zkl】圣诞节快乐',
  background: { src: null, brightness: 0.52, focus: [0.5, 0.42], projection: 'image', rotation: 0 },
  snow: true,
  cat: { src: null, video: null },
};
const clamp = (value: unknown, fallback: number, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
export function readSceneConfig(data: unknown): SceneConfig {
  if (!data || typeof data !== 'object') return defaultScene;
  const value = data as Record<string, unknown>;
  const background = value.background && typeof value.background === 'object' ? value.background as Record<string, unknown> : {};
  const focus = Array.isArray(background.focus) ? background.focus : [];
  const cat = value.cat && typeof value.cat === 'object' ? value.cat as Record<string, unknown> : {};
  const detailTiles: PanoramaDetailTile[] = [];
  if (Array.isArray(background.detailTiles)) {
    for (const tile of background.detailTiles.slice(0, 4)) {
      if (!tile || typeof tile !== 'object' || typeof tile.src !== 'string' || !/^generated\/background\/detail-[a-f0-9]{20}\.webp$/.test(tile.src)) continue;
      const minV = clamp(tile.minV, 0.25, 0, 0.99);
      const maxV = clamp(tile.maxV, Math.max(0.75, minV + 0.01), minV + 0.01, 1);
      detailTiles.push({ src: tile.src, centerU: clamp(tile.centerU, 0.5, 0, 1), spanU: clamp(tile.spanU, 1 / 3, 0.01, 1), minV, maxV });
    }
  }
  const panels: PanoramaPanel[] = [];
  if (background.projection === 'equirectangular' && Array.isArray(background.panels)) {
    for (const panel of background.panels.slice(0, 8)) {
      if (!panel || typeof panel !== 'object' || typeof panel.src !== 'string'
        || !/^generated\/background\/panel-[a-f0-9]{20}\.webp$/.test(panel.src)) continue;
      panels.push({
        src: panel.src,
        ...(typeof panel.compactSrc === 'string' && /^generated\/background\/panel-small-[a-f0-9]{20}\.webp$/.test(panel.compactSrc)
          ? { compactSrc: panel.compactSrc } : {}),
        width: clamp(panel.width, 1254, 1, 2048),
        height: clamp(panel.height, 1254, 1, 2048),
        yaw: clamp(panel.yaw, 0, -360, 360),
        pitch: clamp(panel.pitch, -10, -60, 60),
        horizontalFov: clamp(panel.horizontalFov, 60, 30, 100),
        verticalFov: clamp(panel.verticalFov, 60, 30, 100),
      });
    }
  }
  return {
    greeting: typeof value.greeting === 'string' && value.greeting.trim() ? value.greeting.trim().slice(0, 160) : defaultScene.greeting,
    background: {
      src: typeof background.src === 'string' && /^generated\/background\/night-[a-f0-9]{20}\.webp$/.test(background.src) ? background.src : null,
      brightness: clamp(background.brightness, defaultScene.background.brightness, 0.12, 1),
      focus: [clamp(focus[0], 0.5, 0, 1), clamp(focus[1], 0.42, 0, 1)],
      projection: background.projection === 'equirectangular' ? 'equirectangular' : background.projection === 'perspective' ? 'perspective' : 'image',
      rotation: clamp(background.rotation, 0, -360, 360),
      ...(typeof background.groundColor === 'string' && /^#[a-f0-9]{6}$/i.test(background.groundColor) ? { groundColor: background.groundColor } : {}),
      ...(detailTiles.length ? { detailTiles } : {}),
      ...(panels.length ? { panels } : {}),
    },
    snow: typeof value.snow === 'boolean' ? value.snow : true,
    cat: {
      src: typeof cat.src === 'string' && /^generated\/characters\/cat-[a-f0-9]{20}\.webp$/.test(cat.src) ? cat.src : null,
      video: typeof cat.video === 'string' && /^generated\/videos\/transformation-[a-f0-9]{20}\.mp4$/.test(cat.video) ? cat.video : null,
    },
  };
}
