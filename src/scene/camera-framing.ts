/** Framing limits are proportional to the viewport, not one huge fixed range. */
export function getCameraFraming(width: number, height: number, fov = 45) {
  const aspect = Math.max(0.2, Math.min(5, width / Math.max(1, height)));
  const tangent = Math.tan(Math.max(20, Math.min(80, fov)) * Math.PI / 360);
  // Includes the top star, visible trunk, hanging card corners and perspective
  // depth of the front boughs. The closest view still shows the whole tree.
  const fittedDistance = Math.max(15.6 / tangent, 11.2 / (tangent * aspect)) + 10.8;
  return {
    minDistance: fittedDistance,
    defaultDistance: fittedDistance * 1.08,
    maxDistance: fittedDistance * 1.38,
    minPolarAngle: 1.24,
    maxPolarAngle: 1.52,
  };
}

/** Clamp a dolly gesture even when its scale is zero, huge, or invalid. */
export function clampCameraDistance(value: number, minDistance: number, maxDistance: number) {
  if (!Number.isFinite(value)) return value === Infinity ? maxDistance : minDistance;
  return Math.min(maxDistance, Math.max(minDistance, value));
}
