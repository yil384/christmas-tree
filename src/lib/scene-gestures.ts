export const SCENE_GESTURE_TIMING = {
  tapDelay: 330,
  longPressDelay: 650,
  dragDistance: 8,
  doubleTapDistance: 32,
} as const;

export interface GesturePoint {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  button?: number;
}

export interface SceneGestureCallbacks {
  onTap: () => void;
  onDoubleTap: () => void;
  onLongPress: (photoIndex: number | null) => void;
}

/** A clock is injected so pointer sequences can be checked without a browser. */
export interface GestureClock {
  now: () => number;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timer: number) => void;
}

interface CompletedTap {
  x: number;
  y: number;
  time: number;
  pointerType: string;
  timer: number | null;
}

interface Press {
  id: number;
  x: number;
  y: number;
  pointerType: string;
  cancelled: boolean;
  held: boolean;
  photoIndex: number | null;
  previousTap: CompletedTap | null;
}

const squaredDistance = (x: number, y: number, otherX: number, otherY: number) => (x - otherX) ** 2 + (y - otherY) ** 2;
const dragDistanceSquared = SCENE_GESTURE_TIMING.dragDistance ** 2;
const doubleTapDistanceSquared = SCENE_GESTURE_TIMING.doubleTapDistance ** 2;

/**
 * Owns only gesture intent. It never prevents pointer events or captures a
 * pointer, so OrbitControls can keep handling drag and two-finger zoom.
 */
export function createSceneGestureController(callbacks: SceneGestureCallbacks, clock: GestureClock) {
  const pointers = new Set<number>();
  let press: Press | null = null;
  let holdTimer: number | null = null;
  let pendingTap: CompletedTap | null = null;

  const clearHold = () => {
    if (holdTimer !== null) clock.clearTimeout(holdTimer);
    holdTimer = null;
  };
  const clearTap = () => {
    if (pendingTap?.timer !== null && pendingTap?.timer !== undefined) clock.clearTimeout(pendingTap.timer);
    pendingTap = null;
  };
  const cancel = () => {
    clearHold();
    clearTap();
    press = null;
    pointers.clear();
  };
  const cancelPress = () => {
    clearHold();
    clearTap();
    if (press) {
      press.cancelled = true;
      press.previousTap = null;
    }
  };
  const deferTap = (point: GesturePoint) => {
    const tap: CompletedTap = {
      x: point.clientX,
      y: point.clientY,
      time: clock.now(),
      pointerType: point.pointerType,
      timer: null,
    };
    pendingTap = tap;
    tap.timer = clock.setTimeout(() => {
      if (pendingTap !== tap) return;
      pendingTap = null;
      callbacks.onTap();
    }, SCENE_GESTURE_TIMING.tapDelay);
  };

  return {
    pointerDown(point: GesturePoint) {
      if ((point.button ?? 0) !== 0) { cancel(); return; }
      if (pointers.has(point.pointerId)) return;
      pointers.add(point.pointerId);
      if (pointers.size !== 1) { cancelPress(); return; }

      const current: Press = {
        id: point.pointerId,
        x: point.clientX,
        y: point.clientY,
        pointerType: point.pointerType,
        cancelled: false,
        held: false,
        photoIndex: null,
        previousTap: null,
      };
      press = current;

      if (pendingTap) {
        const elapsed = clock.now() - pendingTap.time;
        const near = squaredDistance(point.clientX, point.clientY, pendingTap.x, pendingTap.y) <= doubleTapDistanceSquared;
        const previous = pendingTap;
        clearTap();
        if (near && elapsed >= 0 && elapsed <= SCENE_GESTURE_TIMING.tapDelay && point.pointerType === previous.pointerType) {
          // Wait for the second release before choosing double-tap. In particular,
          // a hold or drag after the first tap must not also toggle rotation.
          current.previousTap = previous;
        } else {
          callbacks.onTap();
        }
      }

      holdTimer = clock.setTimeout(() => {
        holdTimer = null;
        if (press !== current || current.cancelled || current.held || pointers.size !== 1) return;
        current.held = true;
        current.previousTap = null;
        clearTap();
        callbacks.onLongPress(current.photoIndex);
      }, SCENE_GESTURE_TIMING.longPressDelay);
    },

    pointerMove(point: GesturePoint) {
      if (!press || press.id !== point.pointerId || press.cancelled) return;
      if (squaredDistance(point.clientX, point.clientY, press.x, press.y) > dragDistanceSquared) cancelPress();
    },

    pointerUp(point: GesturePoint) {
      pointers.delete(point.pointerId);
      if (!press || press.id !== point.pointerId) return;
      const completed = press;
      press = null;
      clearHold();
      if (completed.cancelled || completed.held || pointers.size || squaredDistance(point.clientX, point.clientY, completed.x, completed.y) > dragDistanceSquared) return;

      const previous = completed.previousTap;
      if (previous) {
        const elapsed = clock.now() - previous.time;
        const near = squaredDistance(point.clientX, point.clientY, previous.x, previous.y) <= doubleTapDistanceSquared;
        if (elapsed >= 0 && elapsed <= SCENE_GESTURE_TIMING.tapDelay && near) {
          callbacks.onDoubleTap();
          return;
        }
        callbacks.onTap();
      }
      deferTap(point);
    },

    pointerLeave(pointerId: number) {
      // A normal leave after release must not swallow the pending single tap.
      if (press?.id === pointerId && pointers.has(pointerId)) cancel();
    },

    pointerCancel(pointerId: number) {
      pointers.delete(pointerId);
      cancelPress();
      if (press?.id === pointerId || pointers.size === 0) press = null;
      // Keep other live contacts registered: cancelling one finger of a pinch
      // does not turn the remaining fingers into a fresh single-finger hold.
    },

    pickPhoto(index: number) {
      if (press && !press.cancelled && !press.held && pointers.size === 1 && Number.isInteger(index) && index >= 0) press.photoIndex = index;
    },

    cancel,
  };
}
