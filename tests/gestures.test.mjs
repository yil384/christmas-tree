import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/scene-gestures.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  fileName: 'scene-gestures.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { createSceneGestureController, SCENE_GESTURE_TIMING: timing } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

function setup() {
  let now = 0;
  let sequence = 0;
  const tasks = new Map();
  const events = [];
  const controller = createSceneGestureController({
    onTap: () => events.push({ type: 'tap' }),
    onPhotoTap: photo => events.push({ type: 'photo', photo }),
    onDoubleTap: () => events.push({ type: 'double' }),
    onLongPress: photo => events.push({ type: 'hold', photo }),
  }, {
    now: () => now,
    setTimeout: (callback, delay) => {
      const id = ++sequence;
      tasks.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: id => tasks.delete(id),
  });
  const advance = duration => {
    const until = now + duration;
    while (true) {
      const next = Array.from(tasks).sort((a, b) => a[1].at - b[1].at || a[0] - b[0]).find(([, task]) => task.at <= until);
      if (!next) break;
      now = next[1].at;
      tasks.delete(next[0]);
      next[1].callback();
    }
    now = until;
  };
  const point = (overrides = {}) => ({ pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100, button: 0, ...overrides });
  return { controller, events, advance, point, tasks };
}

for (const pointerType of ['mouse', 'touch']) {
  test(pointerType + ' single photo tap opens exactly the picked original without also pausing', () => {
    const { controller, events, advance, point, tasks } = setup();
    const p = point({ pointerType });
    controller.pointerDown(p);
    controller.pickPhoto(23);
    advance(40);
    controller.pointerUp(p);
    // The moving tree cannot overwrite the photo captured at pointer-down.
    controller.pickPhoto(51);
    advance(timing.tapDelay);
    assert.deepEqual(events, [{ type: 'photo', photo: 23 }]);
    assert.equal(tasks.size, 0);
  });

  test(pointerType + ' photo double tap still scatters the tree and never opens a viewer', () => {
    const { controller, events, advance, point } = setup();
    const p = point({ pointerType });
    controller.pointerDown(p);
    controller.pickPhoto(7);
    controller.pointerUp(p);
    advance(100);
    controller.pointerDown(p);
    controller.pickPhoto(7);
    controller.pointerUp(p);
    advance(timing.longPressDelay);
    assert.deepEqual(events, [{ type: 'double' }]);
  });

  test(pointerType + ' single tap waits for the double-tap window, then fires exactly once', () => {
    const { controller, events, advance, point, tasks } = setup();
    const p = point({ pointerType });
    controller.pointerDown(p);
    advance(40);
    controller.pointerUp(p);
    advance(timing.tapDelay - 1);
    assert.deepEqual(events, []);
    advance(1);
    assert.deepEqual(events, [{ type: 'tap' }]);
    advance(timing.longPressDelay * 2);
    assert.equal(events.length, 1);
    assert.equal(tasks.size, 0);
  });

  test(pointerType + ' double tap assembles/disperses without also toggling rotation', () => {
    const { controller, events, advance, point, tasks } = setup();
    const first = point({ pointerType });
    const second = point({ pointerType, pointerId: pointerType === 'touch' ? 2 : 1, clientX: 104 });
    controller.pointerDown(first);
    advance(35);
    controller.pointerUp(first);
    advance(110);
    controller.pointerDown(second);
    advance(35);
    controller.pointerUp(second);
    assert.deepEqual(events, [{ type: 'double' }]);
    advance(timing.longPressDelay * 2);
    assert.deepEqual(events, [{ type: 'double' }]);
    assert.equal(tasks.size, 0);
  });

  test(pointerType + ' cat claiming a stage press cancels tap and share hold, then a normal stage tap still works', () => {
    const { controller, events, advance, point, tasks } = setup();
    const catPress = point({ pointerType });
    // Stage capture runs first; the R3F cat hit then explicitly claims the press.
    controller.pointerDown(catPress);
    controller.cancel();
    advance(timing.longPressDelay + 100);
    // React's stage pointer-up capture can still run before the cat's handler.
    controller.pointerUp(catPress);
    advance(timing.tapDelay + 100);
    assert.deepEqual(events, []);
    assert.equal(tasks.size, 0);

    const stagePress = point({ pointerType, pointerId: pointerType === 'touch' ? 2 : 1 });
    controller.pointerDown(stagePress);
    advance(30);
    controller.pointerUp(stagePress);
    advance(timing.tapDelay);
    assert.deepEqual(events, [{ type: 'tap' }]);
    assert.equal(tasks.size, 0);
  });
}

test('dragging cancels tap and hold, even when the pointer returns to its starting position', () => {
  const { controller, events, advance, point, tasks } = setup();
  controller.pointerDown(point());
  controller.pickPhoto(3);
  controller.pointerMove(point({ clientX: 125 }));
  controller.pointerMove(point());
  advance(timing.longPressDelay + 10);
  controller.pointerUp(point());
  advance(timing.tapDelay + 10);
  assert.deepEqual(events, []);
  assert.equal(tasks.size, 0);
});

test('a distant release cannot become a tap when no intermediate move event was delivered', () => {
  const { controller, events, advance, point } = setup();
  controller.pointerDown(point());
  controller.pointerUp(point({ clientY: 150 }));
  advance(timing.longPressDelay);
  assert.deepEqual(events, []);
});

test('two-finger zoom cancels all secret actions until all contacts have ended', () => {
  const { controller, events, advance, point } = setup();
  const first = point({ pointerType: 'touch' });
  const second = point({ pointerType: 'touch', pointerId: 2, clientX: 180 });
  controller.pointerDown(first);
  controller.pickPhoto(2);
  advance(30);
  controller.pointerDown(second);
  controller.pointerUp(first);
  advance(timing.longPressDelay + 100);
  controller.pointerUp(second);
  advance(timing.tapDelay + 10);
  assert.deepEqual(events, []);
  const next = point({ pointerType: 'touch', pointerId: 3 });
  controller.pointerDown(next);
  controller.pointerUp(next);
  advance(timing.tapDelay);
  assert.deepEqual(events, [{ type: 'tap' }]);
});

test('holding a photo opens that exact photo once and does not also tap on release', () => {
  const { controller, events, advance, point, tasks } = setup();
  controller.pickPhoto(99); // A stale R3F event outside a press cannot select a photo.
  controller.pointerDown(point());
  controller.pickPhoto(7);
  controller.pickPhoto(-1);
  controller.pickPhoto(NaN);
  advance(timing.longPressDelay - 1);
  assert.deepEqual(events, []);
  advance(1);
  assert.deepEqual(events, [{ type: 'hold', photo: 7 }]);
  controller.pointerUp(point());
  advance(timing.longPressDelay);
  assert.equal(events.length, 1);
  assert.equal(tasks.size, 0);
});

test('cancelling one finger of a pinch keeps the remaining live contacts blocked', () => {
  const { controller, events, advance, point } = setup();
  const first = point({ pointerType: 'touch' });
  const second = point({ pointerType: 'touch', pointerId: 2, clientX: 180 });
  const third = point({ pointerType: 'touch', pointerId: 3, clientX: 140 });
  controller.pointerDown(first);
  controller.pointerDown(second);
  controller.pointerCancel(first.pointerId);
  controller.pointerDown(third);
  advance(timing.longPressDelay);
  controller.pointerUp(second);
  controller.pointerUp(third);
  advance(timing.tapDelay);
  assert.deepEqual(events, []);
  const next = point({ pointerType: 'touch', pointerId: 4 });
  controller.pointerDown(next);
  controller.pointerUp(next);
  advance(timing.tapDelay);
  assert.deepEqual(events, [{ type: 'tap' }]);
});

test('holding empty space is distinguishable from holding a photo', () => {
  const { controller, events, advance, point } = setup();
  controller.pointerDown(point({ pointerType: 'touch' }));
  advance(timing.longPressDelay);
  controller.pointerUp(point({ pointerType: 'touch' }));
  advance(timing.tapDelay);
  assert.deepEqual(events, [{ type: 'hold', photo: null }]);
});

test('a second press that becomes a hold takes precedence over its pending first tap', () => {
  const { controller, events, advance, point } = setup();
  controller.pointerDown(point());
  controller.pointerUp(point());
  advance(100);
  controller.pointerDown(point());
  controller.pickPhoto(4);
  advance(timing.longPressDelay);
  controller.pointerUp(point());
  advance(timing.tapDelay);
  assert.deepEqual(events, [{ type: 'hold', photo: 4 }]);
});

test('cancel on blur, hiding, disabling, or unmount clears both types of pending timers', () => {
  for (const afterRelease of [false, true]) {
    const { controller, events, advance, point, tasks } = setup();
    controller.pointerDown(point());
    if (afterRelease) controller.pointerUp(point());
    controller.cancel();
    advance(timing.longPressDelay * 2);
    assert.deepEqual(events, []);
    assert.equal(tasks.size, 0);
    // StrictMode setup after cleanup must be able to reuse the same controller.
    controller.pointerDown(point());
    controller.pointerUp(point());
    advance(timing.tapDelay);
    assert.deepEqual(events, [{ type: 'tap' }]);
  }
});

test('leaving while pressed cancels a hold; leaving after release preserves a normal single tap', () => {
  const { controller, events, advance, point } = setup();
  controller.pointerDown(point());
  controller.pointerLeave(1);
  advance(timing.longPressDelay);
  controller.pointerUp(point());
  advance(timing.tapDelay);
  assert.deepEqual(events, []);
  controller.pointerDown(point());
  controller.pointerUp(point());
  controller.pointerLeave(1);
  advance(timing.tapDelay);
  assert.deepEqual(events, [{ type: 'tap' }]);
});

test('distant or different-input taps remain two singles, not an accidental double', () => {
  for (const secondOverrides of [{ clientX: 220 }, { pointerType: 'touch', pointerId: 2 }]) {
    const { controller, events, advance, point } = setup();
    controller.pointerDown(point());
    controller.pointerUp(point());
    advance(100);
    const second = point(secondOverrides);
    controller.pointerDown(second);
    controller.pointerUp(second);
    advance(timing.tapDelay);
    assert.deepEqual(events, [{ type: 'tap' }, { type: 'tap' }]);
  }
});

test('distant photo taps retain separate photo indexes through the pending-tap queue', () => {
  const { controller, events, advance, point } = setup();
  controller.pointerDown(point());
  controller.pickPhoto(7);
  controller.pointerUp(point());
  advance(100);
  controller.pointerDown(point({ clientX: 220 }));
  controller.pickPhoto(18);
  controller.pointerUp(point({ clientX: 220 }));
  advance(timing.tapDelay);
  assert.deepEqual(events, [{ type: 'photo', photo: 7 }, { type: 'photo', photo: 18 }]);
});

test('an expired second release cannot retroactively turn the first single into a double', () => {
  const { controller, events, advance, point } = setup();
  controller.pointerDown(point());
  controller.pointerUp(point());
  advance(100);
  controller.pointerDown(point());
  advance(timing.tapDelay);
  controller.pointerUp(point());
  advance(timing.tapDelay);
  assert.deepEqual(events, [{ type: 'tap' }, { type: 'tap' }]);
});

test('right or middle mouse buttons do not trigger secret interactions', () => {
  for (const button of [1, 2]) {
    const { controller, events, advance, point } = setup();
    controller.pointerDown(point({ button }));
    advance(timing.longPressDelay);
    controller.pointerUp(point({ button }));
    advance(timing.tapDelay);
    assert.deepEqual(events, []);
  }
});
