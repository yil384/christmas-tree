/** Fit the initial composition; zoom uses the shared camera projection below. */
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

export const CAMERA_ZOOM_LIMITS = { min: 1, max: 4 } as const;

/** Optical zoom magnifies the tree, castle and contact ground together. */
export function clampCameraZoom(value: number) {
  if (!Number.isFinite(value)) return value === Infinity ? CAMERA_ZOOM_LIMITS.max : CAMERA_ZOOM_LIMITS.min;
  return Math.min(CAMERA_ZOOM_LIMITS.max, Math.max(CAMERA_ZOOM_LIMITS.min, value));
}

export function setCameraOpticalZoom(camera: { zoom: number; updateProjectionMatrix: () => void }, value: number) {
  const zoom = clampCameraZoom(value);
  if (camera.zoom !== zoom) {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }
  return zoom;
}

/** Clamp a dolly gesture even when its scale is zero, huge, or invalid. */
export function clampCameraDistance(value: number, minDistance: number, maxDistance: number) {
  if (!Number.isFinite(value)) return value === Infinity ? maxDistance : minDistance;
  return Math.min(maxDistance, Math.max(minDistance, value));
}
