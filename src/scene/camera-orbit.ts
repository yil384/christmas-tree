import * as THREE from 'three';

/** A calm, continuous two-minute turn, with no reversal. */
export const CAMERA_ORBIT_PERIOD_SECONDS = 120;
export const CAMERA_ORBIT_RADIANS_PER_SECOND = Math.PI * 2 / CAMERA_ORBIT_PERIOD_SECONDS;
export const CAMERA_RESUME_DELAY_MS = 1800;

/** A perspective plate covers a small front arc, never a full world rotation. */
export const PERSPECTIVE_CAMERA_LIMITS = {
  minAzimuthAngle: -Math.PI * 8 / 180,
  maxAzimuthAngle: Math.PI * 8 / 180,
  minPolarAngle: 1.42,
  maxPolarAngle: 1.54,
} as const;
export const CAMERA_ARC_PERIOD_SECONDS = 30;

/** Rock gently in front of a world-fixed backdrop, slowing at each end. */
export function createCameraArcController() {
  const amplitude = PERSPECTIVE_CAMERA_LIMITS.maxAzimuthAngle;
  const angularSpeed = Math.PI * 2 / CAMERA_ARC_PERIOD_SECONDS;
  let phase = 0;
  let lastAzimuth: number | null = null;

  return {
    update(camera: THREE.Camera, target: THREE.Vector3, delta: number, enabled: boolean) {
      if (!enabled || !Number.isFinite(delta) || delta <= 0) return;
      const x = camera.position.x - target.x;
      const z = camera.position.z - target.z;
      const azimuth = Math.atan2(x, z);
      // Pointer and hand controls may have moved while automatic motion was
      // held. Start again at that pose, retaining the prior travel direction.
      // Disabled time never advances the phase, including a hidden tab.
      if (lastAzimuth === null || Math.abs(azimuth - lastAzimuth) > 1e-8) {
        const aligned = Math.asin(THREE.MathUtils.clamp(azimuth / amplitude, -1, 1));
        phase = Math.cos(phase) < 0 ? Math.PI - aligned : aligned;
      }
      phase = (phase + Math.min(delta, 0.05) * angularSpeed) % (Math.PI * 2);
      const nextAzimuth = amplitude * Math.sin(phase);
      const radius = Math.hypot(x, z);
      camera.position.x = target.x + radius * Math.sin(nextAzimuth);
      camera.position.z = target.z + radius * Math.cos(nextAzimuth);
      camera.lookAt(target);
      lastAzimuth = nextAzimuth;
    },
  };
}

export function advanceCameraOrbit(
  camera: THREE.Camera,
  target: THREE.Vector3,
  delta: number,
  enabled: boolean,
) {
  if (!enabled || !Number.isFinite(delta) || delta <= 0) return;
  // Rotate the camera offset about the shared world Y axis. Its height, radius,
  // look target, and every scene object's transform stay unchanged.
  const angle = Math.min(delta, 0.05) * CAMERA_ORBIT_RADIANS_PER_SECOND;
  const x = camera.position.x - target.x;
  const z = camera.position.z - target.z;
  camera.position.x = target.x + x * Math.cos(angle) - z * Math.sin(angle);
  camera.position.z = target.z + x * Math.sin(angle) + z * Math.cos(angle);
  camera.lookAt(target);
}
