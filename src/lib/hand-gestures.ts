import type { HandCommand, HandFeedback, HandFrame, HandLandmark, HandUpdate, TrackedHand } from './hand-types';

/** Times are milliseconds; distances are fractions of the camera image or palm size. */
export const HAND_GESTURE_THRESHOLDS = Object.freeze({
  gestureConfidence: 0.75,
  holdMs: 650,
  holdMinFrames: 3,
  releaseMs: 220,
  cooldownMs: 900,
  maxFrameGapMs: 600,
  motionDwellMs: 120,
  motionMinFrames: 2,
  smoothingMs: 75,
  orbitDeadZone: 0.003,
  maxOrbitDelta: 0.06,
  zoomDeadZone: 0.008,
  maxZoomLogDelta: 0.09,
  minTwoHandSeparation: 0.16,
  pointDwellMs: 120,
  pointMinFrames: 2,
  cursorMinX: 0.1,
  cursorMaxX: 0.9,
  cursorMinY: 0.06,
  cursorMaxY: 0.8,
  cursorDeadZone: 0.0025,
  pointLatchMs: 420,
  pinchEnterRatio: 0.24,
  pinchExitRatio: 0.43,
  pinchDwellMs: 90,
  pinchReleaseMs: 90,
  pinchMinIndexReach: 0.6,
  pinchMinWristReach: 1.15,
  fistGuardMs: 300,
  minPalmSize: 0.025,
  maxPalmSize: 0.5,
  identityDistance: 0.22,
  identitySpeed: 2.2,
  holdTravel: 0.12,
  swipeDistance: 0.16,
  swipeMaxMs: 650,
  swipeMinMs: 100,
  swipeSpeed: 0.3,
  swipeDominance: 1.8,
  swipeVerticalLimit: 0.12,
});

export type HandGestureThresholds = { [K in keyof typeof HAND_GESTURE_THRESHOLDS]: number };
type Point = { x: number; y: number };
type View = 'scene' | 'gallery';
type Sample = { hand: TrackedHand; center: Point; scale: number; tip: Point; pinch: number; pinchEligible: boolean; confident: boolean };
type Lock = { releasedAt: number | null };
type Motion = { mode: 'orbit' | 'swipe'; since: number; frames: number; filtered: Point; anchor: Point; history: { at: number; point: Point }[] };
type Pinch = { since: number; cursor: Point; fired: boolean; releaseAt: number | null };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const display = (p: Point): Point => ({ x: clamp(1 - p.x, 0, 1), y: clamp(p.y, 0, 1) });
const mixPoint = (a: Point, b: Point, alpha: number): Point => ({ x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha });
const isFiniteLandmark = (p: HandLandmark) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
  && p.x >= -0.25 && p.x <= 1.25 && p.y >= -0.25 && p.y <= 1.25
  && (p.z === undefined || (Number.isFinite(p.z) && Math.abs(p.z) <= 2));

function sampleHand(hand: TrackedHand, t: HandGestureThresholds): Sample | null {
  if (!hand || !Array.isArray(hand.landmarks) || hand.landmarks.length !== 21 || !hand.landmarks.every(isFiniteLandmark)) return null;
  const p = hand.landmarks;
  const width = distance(p[5], p[17]);
  const length = distance(p[0], p[9]);
  if (Math.min(width, length) < t.minPalmSize || Math.max(width, length) > t.maxPalmSize
    || length / width < 0.35 || length / width > 3.5) return null;
  const scale = (width + length) / 2;
  const center = [0, 5, 9, 13, 17].reduce((sum, i) => ({ x: sum.x + p[i].x / 5, y: sum.y + p[i].y / 5 }), { x: 0, y: 0 });
  // z is optional in the public contract. When available it helps reject fingers
  // merely overlapping in the image while separated in depth.
  const dz = p[4].z === undefined || p[8].z === undefined ? 0 : p[4].z - p[8].z;
  return {
    hand, center, scale,
    // Keep the wrist in view while reaching the lowest photos. Only pointing
    // uses this active region; palm orbit/swipe and two-hand distances do not.
    tip: {
      x: 1 - clamp((p[8].x - t.cursorMinX) / (t.cursorMaxX - t.cursorMinX), 0, 1),
      y: clamp((p[8].y - t.cursorMinY) / (t.cursorMaxY - t.cursorMinY), 0, 1),
    },
    pinch: Math.hypot(p[4].x - p[8].x, p[4].y - p[8].y, dz) / scale,
    // A closed fist can also bring these two tips together. Selection requires
    // contact in front of the palm, with the index still reaching past its MCP.
    pinchEligible: distance(p[5], p[8]) / scale >= t.pinchMinIndexReach
      && distance(p[0], p[8]) / scale >= t.pinchMinWristReach,
    confident: Number.isFinite(hand.gestureScore) && hand.gestureScore >= t.gestureConfidence && hand.gestureScore <= 1,
  };
}

/** Pure, per-session interpreter. Camera coordinates are unmirrored; deltas and
 * cursors use the mirrored display. reset() is required when camera input stops.
 * Geometry can finish a recently armed pinch even when the gesture model says
 * None: gesture confidence is never substituted for landmark geometry or vice versa.
 */
export function createHandGestureInterpreter(overrides: Partial<HandGestureThresholds> = {}) {
  const t: HandGestureThresholds = { ...HAND_GESTURE_THRESHOLDS, ...overrides };
  for (const [key, value] of Object.entries(t)) {
    const zeroAllowed = key === 'cursorMinX' || key === 'cursorMinY';
    if (!Number.isFinite(value) || (zeroAllowed ? value < 0 : value <= 0)) throw new RangeError(`Invalid hand threshold: ${key}`);
  }
  if (t.gestureConfidence > 1 || t.pinchEnterRatio >= t.pinchExitRatio || t.minPalmSize >= t.maxPalmSize
    || t.swipeMinMs >= t.swipeMaxMs || t.cursorMinX >= t.cursorMaxX || t.cursorMinY >= t.cursorMaxY
    || t.cursorMaxX > 1 || t.cursorMaxY > 1) throw new RangeError('Inconsistent hand thresholds');
  if (!Number.isInteger(t.holdMinFrames) || t.holdMinFrames < 3 || !Number.isInteger(t.motionMinFrames)
    || t.motionMinFrames < 2 || !Number.isInteger(t.pointMinFrames) || t.pointMinFrames < 2) {
    throw new RangeError('Hand acquisition requires multiple observed frames');
  }

  let timestamp: number | null = null;
  let view: View | null = null;
  let tracks: Sample[] = [];
  let motion: Motion | null = null;
  let zoom: { since: number; frames: number; filtered: number; anchor: number } | null = null;
  let hold: { gesture: string; since: number; frames: number; origin: Point } | null = null;
  let pointSince: number | null = null;
  let pointFrames = 0;
  let pointAt = -Infinity;
  let pointArmed = false;
  let pointer: Point | null = null;
  let pinch: Pinch | null = null;
  let fistGuardUntil = -Infinity;
  let lastEventAt = -Infinity;
  const locks = new Map<string, Lock>();

  function clearInteraction() {
    motion = null; zoom = null; hold = null;
    pointSince = null; pointFrames = 0; pointAt = -Infinity; pointArmed = false; pointer = null; pinch = null;
    fistGuardUntil = -Infinity;
  }
  function breakTracking() {
    tracks = [];
    clearInteraction();
  }
  function clearReleaseTimers() { for (const lock of locks.values()) lock.releasedAt = null; }
  function reset() {
    timestamp = null; view = null; lastEventAt = -Infinity; locks.clear(); breakTracking();
  }
  function result(mode: HandFeedback['mode'], label: string, handCount: number, commands: HandCommand[] = [], progress = 0, cursor: Point | null = null): HandUpdate {
    return { commands, cursor: cursor ? { ...cursor } : null, feedback: { mode, label, progress: clamp(progress, 0, 1), handCount } };
  }
  function releaseLocks(samples: Sample[], now: number) {
    // Uncertain classification cannot masquerade as a deliberate release.
    const trusted = samples.every(sample => sample.confident);
    for (const [gesture, lock] of locks) {
      if (!trusted || samples.some(sample => sample.hand.gesture === gesture)) lock.releasedAt = null;
      else {
        lock.releasedAt ??= now;
        if (now - lock.releasedAt >= t.releaseMs) locks.delete(gesture);
      }
    }
  }
  function sameTrack(a: Sample, b: Sample, delta: number) {
    const knownMismatch = a.hand.handedness !== 'Unknown' && b.hand.handedness !== 'Unknown'
      && a.hand.handedness !== b.hand.handedness;
    return !knownMismatch && distance(a.center, b.center) <= Math.min(t.identityDistance, 0.045 + t.identitySpeed * delta / 1000)
      && b.scale / a.scale >= 0.55 && b.scale / a.scale <= 1.8;
  }
  function motionFor(mode: Motion['mode'], point: Point, now: number, alpha: number): Motion {
    if (!motion || motion.mode !== mode) motion = { mode, since: now, frames: 1, filtered: point, anchor: point, history: [] };
    else { motion.filtered = mixPoint(motion.filtered, point, alpha); motion.frames++; }
    if (now - motion.since < t.motionDwellMs || motion.frames < t.motionMinFrames) {
      motion.anchor = motion.filtered;
      motion.history = [{ at: now, point: motion.filtered }];
    }
    return motion;
  }

  function update(frame: HandFrame, context: { view: View }): HandUpdate {
    const now = frame.timestamp;
    if (!Number.isFinite(now) || now < 0) {
      timestamp = null; breakTracking(); clearReleaseTimers();
      return result('uncertain', '等待稳定画面', 0);
    }
    if (timestamp !== null && now === timestamp) return result('uncertain', '等待新画面', tracks.length, [], 0, pointer);
    let delta = timestamp === null ? 0 : now - timestamp;
    if (delta < 0 || delta > t.maxFrameGapMs) {
      breakTracking(); clearReleaseTimers();
      if (delta < 0 && Number.isFinite(lastEventAt)) lastEventAt = now;
      delta = 0;
    }
    timestamp = now;
    if (view !== context.view) {
      // Opening the gallery must not reinterpret the still-held selection pinch
      // as a fresh fist. Keep its release guard, while clearing all navigation.
      const selection = view === 'scene' && context.view === 'gallery' && pinch?.fired ? pinch : null;
      view = context.view; clearInteraction(); pinch = selection;
    }
    const hands = Array.isArray(frame.hands) ? frame.hands : [];
    if (!hands.length) {
      breakTracking(); releaseLocks([], now);
      return result('searching', '将手放进画面', 0);
    }
    const sampled = hands.map(hand => sampleHand(hand, t));
    if (hands.length > 2 || sampled.some(hand => !hand)) {
      breakTracking(); clearReleaseTimers();
      return result('uncertain', '请完整展示一只或两只手', sampled.filter(Boolean).length);
    }
    let samples = sampled as Sample[];
    // Match geometry plus handedness rather than the model's array ordering.
    if (tracks.length === 2 && samples.length === 2) {
      const direct = distance(tracks[0].center, samples[0].center) + distance(tracks[1].center, samples[1].center);
      const crossed = distance(tracks[0].center, samples[1].center) + distance(tracks[1].center, samples[0].center);
      if (crossed < direct) samples = [samples[1], samples[0]];
    }
    if (tracks.length !== samples.length || samples.some((sample, i) => !sameTrack(tracks[i], sample, delta))) clearInteraction();
    tracks = samples;
    releaseLocks(samples, now);
    const alpha = delta > 0 ? 1 - Math.exp(-delta / t.smoothingMs) : 1;
    const cooling = now - lastEventAt < t.cooldownMs;

    // Every two-hand frame owns arbitration. A fist, point or uncertain second
    // hand must never leak a one-hand action underneath the zoom gesture.
    if (samples.length === 2) {
      motion = null; hold = null; pointSince = null; pointFrames = 0; pointAt = -Infinity; pointArmed = false; pointer = null; pinch = null;
      const palms = samples.every(sample => sample.confident && sample.hand.gesture === 'Open_Palm');
      const separation = distance(samples[0].center, samples[1].center);
      if (view !== 'scene' || !palms || separation < t.minTwoHandSeparation) {
        zoom = null;
        return result('uncertain', view === 'gallery' ? '用一只手翻页' : '双手都张开可缩放', 2);
      }
      if (!zoom) zoom = { since: now, frames: 1, filtered: separation, anchor: separation };
      else { zoom.filtered += (separation - zoom.filtered) * alpha; zoom.frames++; }
      if (now - zoom.since < t.motionDwellMs || zoom.frames < t.motionMinFrames) {
        zoom.anchor = zoom.filtered;
        return result('holding', '双手保持张开', 2, [], (now - zoom.since) / t.motionDwellMs);
      }
      const change = Math.log(zoom.anchor / zoom.filtered);
      const commands: HandCommand[] = [];
      if (Math.abs(change) >= t.zoomDeadZone) {
        commands.push({ type: 'zoom', factor: Math.exp(clamp(change, -t.maxZoomLogDelta, t.maxZoomLogDelta)) });
        zoom.anchor = zoom.filtered;
      }
      return result('zoom', '双手开合 · 缩放', 2, commands);
    }
    zoom = null;
    const sample = samples[0];
    const gesture = sample.confident ? sample.hand.gesture : '';
    const currentPoint = gesture === 'Pointing_Up' && view === 'scene';
    // A slow but fresh worker result can arrive every 500 ms. Preserve a point
    // from the immediately preceding valid frame across that one interval;
    // do not extend it across additional unrecognised samples or a frame gap.
    const recentPoint = now - pointAt <= Math.max(t.pointLatchMs, delta);

    // Test the contact edge before moving the cursor: closing the fingers must
    // select the photo already under the pointer, not the moving fingertip.
    if (view === 'scene' && !pinch && pointArmed && recentPoint && pointer && sample.pinchEligible && sample.pinch <= t.pinchEnterRatio) {
      pinch = { since: now, cursor: { ...pointer }, fired: cooling, releaseAt: null };
      pointArmed = false; pointSince = null; pointFrames = 0;
    }
    if (pinch && !pinch.fired && !sample.pinchEligible) {
      // Folding an incipient pinch into a fist cancels selection. A deliberately
      // held fist can act after the transition guard and its own full dwell.
      pinch = null; pointArmed = false; pointSince = null; pointFrames = 0; pointer = null;
      fistGuardUntil = now + t.fistGuardMs;
    }
    if (pinch) {
      motion = null; hold = null; pointer = view === 'scene' ? pinch.cursor : null;
      fistGuardUntil = now + t.fistGuardMs;
      if (sample.pinch >= t.pinchExitRatio) {
        pinch.releaseAt ??= now;
        if (now - pinch.releaseAt >= t.pinchReleaseMs) {
          pinch = null; pointAt = -Infinity; pointSince = null; pointFrames = 0; pointer = null;
        }
      } else pinch.releaseAt = null;
      if (pinch) {
        const progress = (now - pinch.since) / t.pinchDwellMs;
        if (!pinch.fired && pinch.releaseAt === null && progress >= 1) {
          pinch.fired = true; lastEventAt = now;
          return result('point', '已选中照片', 1, [{ type: 'select-photo' }], 1, pointer);
        }
        return result(pinch.fired ? 'cooldown' : 'point', pinch.fired ? '松开捏合再选择' : '捏合选择照片', 1, [], progress, pointer);
      }
    }
    if (currentPoint) {
      motion = null; hold = null;
      const smoothed = pointer ? mixPoint(pointer, sample.tip, alpha) : sample.tip;
      if (!pointer || distance(pointer, smoothed) >= t.cursorDeadZone) pointer = smoothed;
      if (sample.pinch >= t.pinchExitRatio) {
        if (pointSince === null) { pointSince = now; pointFrames = 1; } else pointFrames++;
        if (now - pointSince >= t.pointDwellMs && pointFrames >= t.pointMinFrames) { pointArmed = true; pointAt = now; }
      } else if (!pointArmed) { pointSince = null; pointFrames = 0; }
      return result('point', pointArmed ? '指向照片，再轻轻捏合' : '保持食指指向照片', 1, [], pointArmed ? 1 : pointSince === null ? 0 : (now - pointSince) / t.pointDwellMs, pointer);
    }
    pointSince = null; pointFrames = 0;
    if (!recentPoint) { pointArmed = false; pointer = null; }
    // A fist-like classifier output during the point -> pinch transition does
    // not gather the tree or close a newly opened gallery. The geometry guard
    // also survives a brief tracking dropout without retaining a stale identity.
    const fistLooksLikePinch = sample.pinchEligible && sample.pinch < t.pinchExitRatio;
    if (gesture === 'Closed_Fist' && (recentPoint || now < fistGuardUntil || fistLooksLikePinch)) {
      hold = null; motion = null;
      return result('point', fistLooksLikePinch ? '松开捏合后再握拳' : '松开手指后再握拳', 1, [], 0, pointer);
    }
    if (!sample.confident) {
      hold = null; motion = null;
      return result('uncertain', '保持手势，让画面更清晰', 1, [], 0, pointer);
    }

    if (gesture === 'Open_Palm') {
      hold = null; pointArmed = false; pointAt = -Infinity; pointer = null;
      const moving = motionFor(view === 'gallery' ? 'swipe' : 'orbit', display(sample.center), now, alpha);
      if (now - moving.since < t.motionDwellMs || moving.frames < t.motionMinFrames) return result('holding', '保持手掌张开', 1, [], (now - moving.since) / t.motionDwellMs);
      if (view === 'scene') {
        const dx = moving.filtered.x - moving.anchor.x;
        const dy = moving.filtered.y - moving.anchor.y;
        const commands: HandCommand[] = [];
        if (Math.hypot(dx, dy) >= t.orbitDeadZone) {
          commands.push({ type: 'orbit', dx: clamp(dx, -t.maxOrbitDelta, t.maxOrbitDelta), dy: clamp(dy, -t.maxOrbitDelta, t.maxOrbitDelta) });
          moving.anchor = moving.filtered;
        }
        return result('orbit', '移动手掌 · 转动圣诞树', 1, commands);
      }
      moving.history.push({ at: now, point: moving.filtered });
      while (moving.history.length > 1 && now - moving.history[0].at > t.swipeMaxMs) moving.history.shift();
      const start = moving.history[0];
      const elapsed = now - start.at;
      const dx = moving.filtered.x - start.point.x;
      const dy = moving.filtered.y - start.point.y;
      if (!cooling && !locks.has('Open_Palm') && elapsed >= t.swipeMinMs && elapsed <= t.swipeMaxMs
        && Math.abs(dx) >= t.swipeDistance && Math.abs(dx) / (elapsed / 1000) >= t.swipeSpeed
        && Math.abs(dx) >= Math.abs(dy) * t.swipeDominance && Math.abs(dy) <= t.swipeVerticalLimit) {
        locks.set('Open_Palm', { releasedAt: null }); lastEventAt = now;
        return result('cooldown', '放下手掌后可再次翻页', 1, [{ type: 'gallery-step', direction: dx < 0 ? 1 : -1 }]);
      }
      return result(locks.has('Open_Palm') ? 'cooldown' : 'ready', locks.has('Open_Palm') ? '放下手掌后可再次翻页' : '向左或向右挥手翻页', 1);
    }
    motion = null;
    const action: HandCommand | null = gesture === 'Closed_Fist' ? { type: view === 'gallery' ? 'close-gallery' : 'gather' }
      : view === 'gallery' ? null
        : gesture === 'Victory' ? { type: 'scatter' }
          : gesture === 'Thumb_Up' ? { type: 'toggle-rotation' }
            : gesture === 'ILoveYou' ? { type: 'magic' } : null;
    if (!action) {
      hold = null;
      return result('ready', '手势已就绪', 1, [], 0, pointer);
    }
    if (cooling || locks.has(gesture)) {
      hold = null;
      return result('cooldown', locks.has(gesture) ? '放松手势后可再次操作' : '稍等片刻再做手势', 1);
    }
    if (!hold || hold.gesture !== gesture || distance(hold.origin, sample.center) > t.holdTravel) {
      hold = { gesture, since: now, frames: 1, origin: sample.center };
    } else hold.frames++;
    const progress = (now - hold.since) / t.holdMs;
    const labels: Record<string, string> = { scatter: '保持 V 手势 · 散开', gather: '保持握拳 · 聚拢', 'close-gallery': '保持握拳 · 关闭照片', 'toggle-rotation': '保持点赞 · 切换旋转', magic: '保持爱你手势 · 星光魔法' };
    if (progress >= 1 && hold.frames >= t.holdMinFrames) {
      locks.set(gesture, { releasedAt: null }); lastEventAt = now; hold = null;
      return result('cooldown', '手势已生效，请放松手势', 1, [action], 1);
    }
    return result('holding', labels[action.type], 1, [], progress);
  }
  return { update, reset };
}
