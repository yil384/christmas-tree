import { getCameraFraming } from './camera-framing';
import { PERSPECTIVE_CAMERA_LIMITS } from './camera-orbit';
import { DEFAULT_CAMERA_TARGET_Y } from './tree-profile';

// A normal camera photograph belongs on a rectilinear plane, not on a sphere.
// Keep this plane fixed while the camera moves; only a viewport resize refits it.
// A nearby, world-fixed staging plane keeps its camera-driven screen motion
// comparable to the tree. A distant plane exaggerated the background drift
// while the foreground remained almost still during the same camera arc.
export const PERSPECTIVE_BACKGROUND_Z = -18;

export function getPerspectiveBackgroundPlacement(
  viewportWidth: number,
  viewportHeight: number,
  imageAspect: number,
  focus: readonly [number, number],
  fov = 45,
) {
  // Use the actual camera aspect, including a narrow split view or a short
  // landscape window; tree framing's distance clamp is not a viewport clamp.
  const aspect = Math.max(0.01, viewportWidth / Math.max(1, viewportHeight));
  const sourceAspect = Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 2;
  const framing = getCameraFraming(viewportWidth, viewportHeight, fov);
  const tangent = Math.tan(fov * Math.PI / 360);
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const limits = PERSPECTIVE_CAMERA_LIMITS;

  // Find the union of the allowed camera frusta at the photograph's plane.
  // Interior samples also cover the small coupled pitch/azimuth extrema.
  for (let horizontal = 0; horizontal <= 16; horizontal++) {
    const theta = limits.minAzimuthAngle + (limits.maxAzimuthAngle - limits.minAzimuthAngle) * horizontal / 16;
    for (let vertical = 0; vertical <= 12; vertical++) {
      const phi = limits.minPolarAngle + (limits.maxPolarAngle - limits.minPolarAngle) * vertical / 12;
      const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
      const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
      for (const distance of [framing.minDistance, framing.maxDistance]) {
        const cameraX = distance * sinPhi * sinTheta;
        const cameraY = DEFAULT_CAMERA_TARGET_Y + distance * cosPhi;
        const cameraZ = distance * sinPhi * cosTheta;
        for (const x of [-1, 1]) for (const y of [-1, 1]) {
          const rayX = -sinPhi * sinTheta + x * tangent * aspect * cosTheta - y * tangent * cosPhi * sinTheta;
          const rayY = -cosPhi + y * tangent * sinPhi;
          const rayZ = -sinPhi * cosTheta - x * tangent * aspect * sinTheta - y * tangent * cosPhi * cosTheta;
          const travel = (PERSPECTIVE_BACKGROUND_Z - cameraZ) / rayZ;
          const worldX = cameraX + travel * rayX;
          const worldY = cameraY + travel * rayY;
          bounds.minX = Math.min(bounds.minX, worldX);
          bounds.maxX = Math.max(bounds.maxX, worldX);
          bounds.minY = Math.min(bounds.minY, worldY);
          bounds.maxY = Math.max(bounds.maxY, worldY);
        }
      }
    }
  }

  // Uniform sizing preserves every architectural proportion. The 0.2% guard
  // only prevents subpixel edge gaps; it is not a fabricated detail enlargement.
  const requiredWidth = (bounds.maxX - bounds.minX) * 1.002;
  const requiredHeight = (bounds.maxY - bounds.minY) * 1.002;
  const width = Math.max(requiredWidth, requiredHeight * sourceAspect);
  const height = width / sourceAspect;
  const focusX = Math.min(1, Math.max(0, focus[0]));
  const focusY = Math.min(1, Math.max(0, focus[1]));
  return {
    width,
    height,
    x: (bounds.minX + bounds.maxX) / 2 + (width - requiredWidth) * (0.5 - focusX),
    y: (bounds.minY + bounds.maxY) / 2 + (height - requiredHeight) * (focusY - 0.5),
    z: PERSPECTIVE_BACKGROUND_Z,
  };
}
