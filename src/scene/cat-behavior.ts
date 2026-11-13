/** Measured stance stride, adjusted for the revised kitten's 0.90 length scale. */
export const CAT_AUTHORED_WALK_SPEED = 0.738;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (a: number, b: number, value: number) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Unevenly spaced blinks and a slower, relaxed blink when someone pets her. */
export function catBlink(elapsed: number, attentionAge = -1) {
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) % 19.1;
  const blink = (start: number, close = 0.15, hold = 0.08, open = 0.22) =>
    smooth(start, start + close, time) * (1 - smooth(start + close + hold, start + close + hold + open, time));
  const ordinary = Math.max(blink(4.25), blink(10.8), blink(11.4, 0.12, 0.03, 0.18), blink(17.3));
  const relaxed = attentionAge < 0 ? 0 : smooth(0.45, 0.85, attentionAge) * (1 - smooth(1.15, 1.65, attentionAge));
  return Math.max(ordinary, relaxed);
}

export function catWalkBlend(speed: number) {
  return smooth(0.012, 0.16, Math.max(0, speed));
}

/** Ease both distance and gait together when a tap asks the kitten to stop. */
export function advanceCatTravel(elapsed: number, pace: number, delta: number, attending: boolean) {
  const step = Number.isFinite(delta) ? Math.max(0, Math.min(0.05, delta)) : 0;
  const previous = clamp01(Number.isFinite(pace) ? pace : 1);
  const target = attending ? 0 : 1;
  const next = target + (previous - target) * Math.exp(-(attending ? 7 : 3.5) * step);
  const speed = Math.abs(next - target) < 0.002 ? target : next;
  return { elapsed: elapsed + step * (previous + speed) / 2, pace: speed };
}

/** Paused / hidden scenes do not accumulate time, and resuming never catches up. */
export function advanceCatClock(elapsed: number, delta: number, running: boolean) {
  if (!running || !Number.isFinite(delta)) return elapsed;
  return elapsed + Math.max(0, Math.min(0.05, delta));
}
