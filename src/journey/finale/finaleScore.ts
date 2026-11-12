export type FireworkShape = 'peony' | 'willow' | 'ring' | 'palm';
export interface FireworkCue {
  at: number;
  x: number;
  y: number;
  z: number;
  size: number;
  shape: FireworkShape;
  color: number;
  seed: number;
  count: number;
}

/** One-way choreography. These are distinct cues, not a repeated animation loop. */
export const FIREWORK_SCORE: readonly FireworkCue[] = [
  { at: 55.8, x: .34, y: .32, z: -9, size: 1.65, shape: 'peony', color: 0, seed: 101, count: 94 },
  { at: 57.7, x: .66, y: .26, z: -12, size: 1.8, shape: 'peony', color: 1, seed: 102, count: 104 },
  { at: 60.0, x: .49, y: .19, z: -8, size: 2.0, shape: 'ring', color: 2, seed: 103, count: 112 },
  { at: 62.1, x: .29, y: .31, z: -11, size: 1.65, shape: 'palm', color: 0, seed: 104, count: 94 },
  { at: 63.7, x: .69, y: .30, z: -7, size: 1.65, shape: 'peony', color: 3, seed: 105, count: 104 },
  { at: 65.8, x: .50, y: .21, z: -13, size: 2.25, shape: 'willow', color: 0, seed: 106, count: 124 },
  { at: 68.0, x: .31, y: .24, z: -8, size: 1.8, shape: 'ring', color: 1, seed: 107, count: 104 },
  { at: 69.3, x: .67, y: .22, z: -11, size: 1.95, shape: 'peony', color: 2, seed: 108, count: 106 },
  { at: 71.5, x: .23, y: .32, z: -12, size: 1.55, shape: 'palm', color: 0, seed: 109, count: 84 },
  { at: 71.7, x: .75, y: .32, z: -12, size: 1.55, shape: 'palm', color: 0, seed: 110, count: 84 },
  { at: 73.6, x: .50, y: .16, z: -10, size: 2.2, shape: 'peony', color: 1, seed: 111, count: 124 },
  { at: 75.6, x: .30, y: .26, z: -8, size: 1.95, shape: 'willow', color: 0, seed: 112, count: 108 },
  { at: 76.0, x: .68, y: .24, z: -10, size: 1.95, shape: 'willow', color: 2, seed: 113, count: 108 },
  { at: 78.2, x: .47, y: .14, z: -12, size: 2.3, shape: 'ring', color: 0, seed: 114, count: 126 },
  { at: 79.3, x: .24, y: .31, z: -9, size: 1.7, shape: 'peony', color: 1, seed: 115, count: 94 },
  { at: 79.7, x: .74, y: .29, z: -9, size: 1.7, shape: 'peony', color: 2, seed: 116, count: 94 },
  { at: 81.7, x: .49, y: .19, z: -7, size: 2.45, shape: 'willow', color: 0, seed: 117, count: 154 },
  { at: 82.5, x: .30, y: .30, z: -11, size: 1.85, shape: 'peony', color: 1, seed: 118, count: 114 },
  { at: 82.8, x: .69, y: .28, z: -11, size: 1.85, shape: 'peony', color: 0, seed: 119, count: 114 },
];

/** A delicate butterfly-shaped star map above the castle's highest spire. */
const leftWing = [
  [.5, .29], [.45, .235], [.405, .19], [.34, .165], [.285, .18],
  [.265, .215], [.30, .255], [.37, .29], [.455, .315],
  [.375, .325], [.30, .345], [.285, .38], [.33, .395], [.415, .365], [.5, .32],
] as const;
export const CONSTELLATION_POINTS: ReadonlyArray<readonly [number, number]> = [
  ...leftWing,
  ...leftWing.slice(1).map(([x, y]) => [1 - x, y] as const),
  [.5, .25], [.5, .35], [.484, .23], [.516, .23],
];
export const CONSTELLATION_EDGES: ReadonlyArray<readonly [number, number]> = [
  ...leftWing.slice(1).map((_, i) => [i, i + 1] as const),
  [0, 15], ...leftWing.slice(2).map((_, i) => [15 + i, 16 + i] as const),
  [29, 0], [0, 30], [29, 31], [29, 32],
];

/** Existing lamp bulbs in the approved plate, never invented floating posts. */
export const GARDEN_LIGHTS: ReadonlyArray<readonly [number, number]> = [
  [.065, .658], [.935, .658], [.113, .665], [.886, .665],
  [.182, .657], [.814, .657], [.273, .672], [.730, .672],
  [.460, .674], [.548, .674],
];

export const unit = (seed: number) => {
  const result = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return result - Math.floor(result);
};
export const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
export const smooth = (start: number, end: number, value: number) => {
  const x = clamp((value - start) / (end - start));
  return x * x * (3 - 2 * x);
};
