/** The authored walk travels about 0.8 world units per clip second at this size. */
export const CAT_AUTHORED_WALK_SPEED = 0.8;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Close softly, hold briefly, then reopen; no moving eyeball objects. */
export function catBlink(elapsed: number) {
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) % 6.8;
  return smooth(4.25, 4.40, time) * (1 - smooth(4.48, 4.70, time));
}

export function catWalkBlend(speed: number, resting = false) {
  return resting ? 0 : smooth(0.025, 0.26, Math.max(0, speed));
}

/** Paused / hidden scenes do not accumulate time, and resuming never catches up. */
export function advanceCatClock(elapsed: number, delta: number, running: boolean) {
  if (!running || !Number.isFinite(delta)) return elapsed;
  return elapsed + Math.max(0, Math.min(0.05, delta));
}
