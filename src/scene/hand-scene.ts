import * as THREE from 'three';
import type { HandSceneInput } from '../lib/hand-types';
import { setCameraOpticalZoom } from './camera-framing';

export const HAND_INTERACTION_HOLD_MS = 1200;
export const HAND_POINTER_MAX_AGE_MS = 600;
const HAND_SELECTION_MAX_AGE_MS = 500;

/** Keep disabled or hidden scenes from replaying queued camera movements. */
export function clearHandSceneInput(input: HandSceneInput) {
  input.orbitX = 0;
  input.orbitY = 0;
  input.zoomLog = 0;
  input.cursor = null;
  input.hoveredPhoto = null;
  input.hoveredAt = 0;
  input.lastInputAt = 0;
  input.selectionRequest = null;
}

/** undefined means idle/cancelled; null means a consumed selection had no hit. */
export function consumeHandPhotoSelection(
  input: HandSceneInput,
  active: boolean,
  now: number,
  pick: (cursor: { x: number; y: number }) => number | null,
): number | null | undefined {
  const request = input.selectionRequest;
  if (!request) return undefined;
  input.selectionRequest = null;
  if (!active || !input.enabled) {
    input.hoveredPhoto = null;
    input.hoveredAt = 0;
    return undefined;
  }
  const age = now - request.requestedAt;
  // Select with the request's anchored cursor, never with the latest hover or
  // a newer recognition frame that may already point at another photograph.
  const selected = Number.isFinite(age) && age >= 0 && age <= HAND_SELECTION_MAX_AGE_MS
    ? pick(request.cursor) : null;
  input.hoveredPhoto = selected;
  input.hoveredAt = now;
  return selected;
}

interface CameraLimits {
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
}

/** Consume camera-rate messages, with a short easing tail between hand frames. */
export function createHandCameraController() {
  const offset = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  let pendingX = 0;
  let pendingY = 0;
  let pendingZoom = 0;
  const finiteDelta = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, -1, 1) : 0;
  const reset = () => { pendingX = 0; pendingY = 0; pendingZoom = 0; };

  return {
    reset,
    update(input: HandSceneInput, camera: THREE.Camera, target: THREE.Vector3, limits: CameraLimits, delta: number, active: boolean) {
      if (!active || !input.enabled) {
        reset();
        clearHandSceneInput(input);
        return false;
      }
      pendingX += finiteDelta(input.orbitX);
      pendingY += finiteDelta(input.orbitY);
      pendingZoom += finiteDelta(input.zoomLog);
      input.orbitX = 0;
      input.orbitY = 0;
      input.zoomLog = 0;
      if (Math.abs(pendingX) + Math.abs(pendingY) + Math.abs(pendingZoom) < 0.000001) {
        reset();
        return false;
      }

      const easing = -Math.expm1(-Math.min(Math.max(delta, 0), 0.05) * 20);
      const dx = pendingX * easing;
      const dy = pendingY * easing;
      const zoom = pendingZoom * easing;
      pendingX -= dx;
      pendingY -= dy;
      pendingZoom -= zoom;
      offset.copy(camera.position).sub(target);
      spherical.setFromVector3(offset);
      const azimuth = spherical.theta - dx * 3;
      spherical.theta = THREE.MathUtils.clamp(azimuth, limits.minAzimuthAngle ?? -Infinity, limits.maxAzimuthAngle ?? Infinity);
      // Discard outward easing at a hard edge so a reverse gesture moves
      // inward immediately instead of fighting the previous gesture's tail.
      if (spherical.theta !== azimuth) pendingX = 0;
      const polar = spherical.phi - dy;
      spherical.phi = THREE.MathUtils.clamp(polar, limits.minPolarAngle, limits.maxPolarAngle);
      if (spherical.phi !== polar) pendingY = 0;
      // Hand zoom uses the same projection as wheel/pinch. Keeping the orbit
      // radius fixed makes the scenery and photographs enlarge together.
      const perspective = camera as THREE.PerspectiveCamera;
      const requestedZoom = perspective.zoom * Math.exp(-zoom);
      if (setCameraOpticalZoom(perspective, requestedZoom) !== requestedZoom) pendingZoom = 0;
      spherical.makeSafe();
      camera.position.setFromSpherical(spherical).add(target);
      camera.lookAt(target);
      return true;
    },
  };
}

/** Raycast actual transformed paper triangles, retaining original album indexes. */
export function createHandPhotoPicker() {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hits: THREE.Intersection[] = [];
  const blockers: THREE.Intersection[] = [];

  return (
    mesh: THREE.InstancedMesh,
    camera: THREE.Camera,
    cursor: { x: number; y: number },
    photoIndexes: readonly number[],
    occluders: readonly THREE.Object3D[] = [],
  ): number | null => {
    if (!mesh.visible || !photoIndexes.length || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)
      || cursor.x < 0 || cursor.x > 1 || cursor.y < 0 || cursor.y > 1) return null;
    const parts = mesh.geometry.getAttribute('aPart');
    if (!parts) return null;
    // Cursor coordinates already match the mirrored preview. Do not mirror twice.
    pointer.set(cursor.x * 2 - 1, 1 - cursor.y * 2);
    camera.updateWorldMatrix(true, false);
    mesh.updateWorldMatrix(true, false);
    raycaster.near = (camera as THREE.PerspectiveCamera).near ?? 0;
    raycaster.far = (camera as THREE.PerspectiveCamera).far ?? Infinity;
    raycaster.setFromCamera(pointer, camera);
    hits.length = 0;
    raycaster.intersectObject(mesh, false, hits);
    // Procedural cords have no matching CPU positions. Pegs and paper edges
    // can occlude a print, but never become hand-selection targets themselves.
    const nearest = hits.find(hit => hit.face && hit.instanceId !== undefined && parts.getX(hit.face.a) !== 2);
    if (!nearest?.face || nearest.instanceId === undefined
      || [nearest.face.a, nearest.face.b, nearest.face.c].some(index => parts.getX(index) !== 0)) return null;

    raycaster.far = Math.max(raycaster.near, nearest.distance - 0.025);
    for (const occluder of occluders) {
      if (!occluder.visible) continue;
      occluder.updateWorldMatrix(true, false);
      blockers.length = 0;
      raycaster.intersectObject(occluder, false, blockers);
      if (blockers.length) return null;
    }
    return photoIndexes[nearest.instanceId % photoIndexes.length] ?? null;
  };
}
