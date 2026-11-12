/** Shared scene placement for the authored kitten and its snow contacts. */
export const CAT_GROUND_CONTACT = {
  position: [9, 4],
  yaw: -0.28,
  body: [0, -0.15, 0.48, 1.10],
  paws: [
    [-0.29, 0.53, 0.14, 0.20],
    [0.29, 0.53, 0.14, 0.20],
    [-0.31, -0.91, 0.15, 0.21],
    [0.31, -0.91, 0.15, 0.21],
  ],
} as const;
export const [CAT_X, CAT_Z] = CAT_GROUND_CONTACT.position;
export const CAT_YAW = CAT_GROUND_CONTACT.yaw;
export const CAT_WALK_PERIOD = 46;
const ROUTE_SECTIONS = [[0, 7], [11, 18], [23, 30], [34, 41]] as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** A continuous little loop in clear snow, with four long looking-around rests. */
export function sampleCatRoute(elapsed: number) {
  const clock = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const time = clock % CAT_WALK_PERIOD;
  let angle = 0, angularSpeed = 0;
  for (const [start, end] of ROUTE_SECTIONS) {
    const phase = clamp((time - start) / (end - start));
    angle += smooth(phase) * Math.PI / 2;
    if (phase > 0 && phase < 1) angularSpeed = 30 * phase * phase * (phase - 1) ** 2 / (end - start) * Math.PI / 2;
  }
  const localX = 1.8 * (1 - Math.cos(angle)), localZ = 2.1 * Math.sin(angle);
  const dx = 1.8 * Math.sin(angle), dz = 2.1 * Math.cos(angle);
  const c = Math.cos(CAT_YAW), s = Math.sin(CAT_YAW);
  return {
    position: [CAT_X + localX * c + localZ * s, CAT_Z - localX * s + localZ * c] as [number, number],
    yaw: CAT_YAW + Math.atan2(dx, dz),
    speed: Math.hypot(dx, dz) * angularSpeed,
  };
}

/** Each scene owns its own live contacts; the loaded rig updates actual paw bones. */
export function createCatGroundContact() {
  return {
    position: [...CAT_GROUND_CONTACT.position] as [number, number],
    yaw: CAT_GROUND_CONTACT.yaw as number,
    body: [...CAT_GROUND_CONTACT.body] as [number, number, number, number],
    paws: CAT_GROUND_CONTACT.paws.map(paw => [...paw] as [number, number, number, number]),
  };
}
export type CatGroundContact = ReturnType<typeof createCatGroundContact>;
