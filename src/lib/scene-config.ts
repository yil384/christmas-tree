export interface SceneBackground {
  src: string | null;
  brightness: number;
  focus: [number, number];
}
export interface SceneConfig {
  greeting: string;
  background: SceneBackground;
  snow: boolean;
}
export const defaultScene: SceneConfig = {
  greeting: '祝集美小喵【zkl】圣诞节快乐',
  background: { src: null, brightness: 0.52, focus: [0.5, 0.42] },
  snow: true,
};
const clamp = (value: unknown, fallback: number, low: number, high: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
export function readSceneConfig(data: unknown): SceneConfig {
  if (!data || typeof data !== 'object') return defaultScene;
  const value = data as Record<string, unknown>;
  const background = value.background && typeof value.background === 'object' ? value.background as Record<string, unknown> : {};
  const focus = Array.isArray(background.focus) ? background.focus : [];
  return {
    greeting: typeof value.greeting === 'string' && value.greeting.trim() ? value.greeting.trim().slice(0, 160) : defaultScene.greeting,
    background: {
      src: typeof background.src === 'string' && /^generated\/background\/night-[a-f0-9]{20}\.webp$/.test(background.src) ? background.src : null,
      brightness: clamp(background.brightness, defaultScene.background.brightness, 0.12, 1),
      focus: [clamp(focus[0], 0.5, 0, 1), clamp(focus[1], 0.42, 0, 1)],
    },
    snow: typeof value.snow === 'boolean' ? value.snow : true,
  };
}
