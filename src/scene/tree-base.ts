import { GROUND_Y, TREE_OFFSET_Y, TRUNK_BOTTOM } from './tree-profile';

/** The same buttresses shape the wood, the snow above them, and contact shade. */
const ROOTS = [
  { angle: 0.20, reach: 0.94, spread: 0.43, falloff: 0.76 },
  { angle: 1.18, reach: 0.72, spread: 0.48, falloff: 0.86 },
  { angle: 2.35, reach: 1.04, spread: 0.46, falloff: 0.72 },
  { angle: 3.38, reach: 0.79, spread: 0.42, falloff: 0.84 },
  { angle: 4.60, reach: 0.96, spread: 0.48, falloff: 0.74 },
  { angle: 5.55, reach: 0.68, spread: 0.44, falloff: 0.82 },
] as const;

export const TREE_GROUND_LOCAL_Y = GROUND_Y - TREE_OFFSET_Y;
export const TRUNK_BASE_HEIGHTS = [0, 0.10, 0.22, 0.40, 0.65, 0.95, 1.30, 1.75, 2.25] as const;

export function rootFlareAt(height: number, angle: number): number {
  const aboveBottom = Math.max(0, height);
  let flare = 0.10 * Math.exp(-aboveBottom / 1.25);
  for (const root of ROOTS) {
    const difference = Math.atan2(Math.sin(angle - root.angle), Math.cos(angle - root.angle));
    flare += root.reach * Math.exp(-((difference / root.spread) ** 2 + aboveBottom / root.falloff));
  }
  return flare;
}

function smoothstep(low: number, high: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

const SNOW_CLUMPS = [
  { x: -1.12, z: 0.72, sx: 0.34, sz: 0.25, height: 0.17 },
  { x: 0.82, z: 0.94, sx: 0.42, sz: 0.31, height: 0.14 },
  { x: -0.32, z: -1.42, sx: 0.51, sz: 0.29, height: 0.19 },
  { x: 1.57, z: -0.43, sx: 0.37, sz: 0.26, height: 0.12 },
  { x: -1.71, z: -0.76, sx: 0.41, sz: 0.33, height: 0.10 },
  { x: 0.27, z: 1.75, sx: 0.30, sz: 0.22, height: 0.08 },
] as const;

/** A wind-shaped drift and small rounded deposits, not a ring around the stem. */
export function snowHeightAt(x: number, z: number): number {
  const radiusSquared = x * x + z * z;
  const away = 1 - Math.exp(-radiusSquared * 0.045);
  let height = (Math.sin(x * 0.19 + z * 0.06) * 0.11 + Math.cos(z * 0.23) * 0.09) * away;
  height += 0.16 * Math.exp(-(((x + 0.35) / 1.65) ** 2 + ((z - 0.2) / 1.35) ** 2));
  height += 0.065 * Math.exp(-(((x - 0.7) / 2.5) ** 2 + ((z + 0.45) / 1.8) ** 2));
  for (const root of ROOTS) {
    const along = x * Math.cos(root.angle) + z * Math.sin(root.angle);
    const across = -x * Math.sin(root.angle) + z * Math.cos(root.angle);
    const overRoot = smoothstep(0.55, 0.95, along) * (1 - smoothstep(1.6, 2.2, along));
    height += (0.055 + root.reach * 0.035) * Math.exp(-((across / 0.29) ** 2)) * overRoot;
  }
  for (const clump of SNOW_CLUMPS) {
    height += clump.height * Math.exp(-(((x - clump.x) / clump.sx) ** 2 + ((z - clump.z) / clump.sz) ** 2));
  }
  return height;
}

/** Only short crevices beside the buried roots receive strong ambient shade. */
export function snowContactOcclusionAt(x: number, z: number, height: number): number {
  const radius = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const woodRadius = 0.64 + rootFlareAt(TREE_GROUND_LOCAL_Y + height - TRUNK_BOTTOM, angle);
  const gap = Math.max(0, radius - woodRadius);
  const rootContact = 0.34 * Math.exp(-((gap / 0.22) ** 2));
  const canopyAmbient = 0.09 * Math.exp(-(((x + 0.3) / 3.3) ** 2 + ((z - 0.2) / 2.8) ** 2));
  return Math.min(0.43, rootContact + canopyAmbient);
}
