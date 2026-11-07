/** Shared outer envelope: the cards and their hangers sit just outside the evergreen. */
export const TREE_HEIGHT = 22;
export const TREE_RADIUS = 9;
export const FOLIAGE_BOTTOM = -TREE_HEIGHT / 2;
export const FOLIAGE_TOP = TREE_HEIGHT / 2;
export const TRUNK_BOTTOM = -14.8;

// Keep the viewing angle shallow enough to see the stem beneath the broad crown.
export const TREE_OFFSET_Y = -6;
export const DEFAULT_CAMERA_Y = -2;
export const DEFAULT_CAMERA_TARGET_Y = -6.5;
export const MIN_CAMERA_DISTANCE = 50;

/** Conservative radius, including the uneven tips of the solid bough geometry. */
export function foliageRadiusAt(y: number): number {
  const fraction = Math.max(0, Math.min(1, (y - FOLIAGE_BOTTOM) / TREE_HEIGHT));
  return TREE_RADIUS * (1 - fraction);
}
