import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/hand-gestures.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { createHandGestureInterpreter, HAND_GESTURE_THRESHOLDS: limits } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

// Anatomically arranged, finite camera landmarks. Tests move these actual
// coordinates rather than injecting the interpreter's internal measurements.
const shape = [
  [0, .08], [-.045, .05], [-.08, .025], [-.11, 0], [-.14, -.02],
  [-.055, 0], [-.055, -.06], [-.055, -.12], [-.055, -.18],
  [-.015, -.015], [-.015, -.085], [-.015, -.15], [-.015, -.215],
  [.025, -.01], [.025, -.07], [.025, -.125], [.025, -.18],
  [.06, .01], [.07, -.04], [.075, -.085], [.08, -.13],
];
function hand(gesture = 'None', options = {}) {
  const { x = .5, y = .52, scale = 1, score = .98, handedness = 'Right', pinchRatio, tipShift = 0 } = options;
  const landmarks = shape.map(([dx, dy]) => ({ x: x + dx * scale, y: y + dy * scale, z: 0 }));
  landmarks[8].x += tipShift;
  if (pinchRatio !== undefined) {
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const palm = (d(landmarks[5], landmarks[17]) + d(landmarks[0], landmarks[9])) / 2;
    landmarks[4] = { x: landmarks[8].x + pinchRatio * palm, y: landmarks[8].y, z: 0 };
  }
  return { gesture, gestureScore: score, handedness, landmarks };
}
function foldedFist() {
  const fist = hand('Closed_Fist');
  for (const base of [5, 9, 13, 17]) {
    const mcp = fist.landmarks[base];
    fist.landmarks[base + 1] = { x: mcp.x, y: mcp.y - .035, z: 0 };
    fist.landmarks[base + 2] = { x: mcp.x, y: mcp.y + .005, z: -.015 };
    fist.landmarks[base + 3] = { x: mcp.x + .005, y: mcp.y + .025, z: -.01 };
  }
  // Thumb rests on the folded index tip: contact alone is a false positive.
  fist.landmarks[4] = { ...fist.landmarks[8], x: fist.landmarks[8].x + .008 };
  return fist;
}
function setup(view = 'scene', overrides = {}) {
  const interpreter = createHandGestureInterpreter(overrides);
  let now = 0;
  const events = [];
  const updates = [];
  const at = (time, hands, nextView = view) => {
    now = time; view = nextView;
    const update = interpreter.update({ timestamp: time, hands }, { view });
    updates.push(update);
    for (const command of update.commands) events.push({ at: time, ...command });
    assert.ok(Number.isFinite(update.feedback.progress) && update.feedback.progress >= 0 && update.feedback.progress <= 1);
    if (update.cursor) assert.ok(Object.values(update.cursor).every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    return update;
  };
  const through = (end, hands, step = 50) => { while (now + step <= end) at(now + step, typeof hands === 'function' ? hands(now + step) : hands); };
  return { interpreter, at, through, events, updates };
}
const types = rig => rig.events.map(({ type }) => type);
const pair = (separation, reverse = false) => {
  const hands = [hand('Open_Palm', { x: .5 - separation / 2, handedness: 'Left' }), hand('Open_Palm', { x: .5 + separation / 2 })];
  return reverse ? hands.reverse() : hands;
};
function armPoint(rig, end = 200) {
  rig.at(0, [hand('Pointing_Up')]);
  rig.through(end, [hand('Pointing_Up')]);
}

for (const [gesture, expected, view] of [
  ['Victory', 'scatter', 'scene'], ['Closed_Fist', 'gather', 'scene'],
  ['Thumb_Up', 'toggle-rotation', 'scene'], ['ILoveYou', 'magic', 'scene'],
  ['Closed_Fist', 'close-gallery', 'gallery'],
]) {
  test(`${gesture} in ${view} requires a complete dwell and emits only once while held`, () => {
    const rig = setup(view);
    rig.at(0, [hand(gesture)]);
    rig.through(600, [hand(gesture)]);
    assert.deepEqual(types(rig), []);
    rig.at(limits.holdMs, [hand(gesture)]);
    assert.deepEqual(types(rig), [expected]);
    rig.through(3000, [hand(gesture)]);
    assert.deepEqual(types(rig), [expected]);
  });
}

test('a physical release rearms an event; low-confidence classification flicker does not', () => {
  const rig = setup();
  rig.at(0, [hand('Victory')]);
  rig.through(650, [hand('Victory')]);
  rig.through(2000, [hand('None', { score: .1 })]);
  rig.through(2800, [hand('Victory')]);
  assert.deepEqual(types(rig), ['scatter']);
  rig.through(3150, []);
  rig.through(3900, [hand('Victory')]);
  assert.deepEqual(types(rig), ['scatter', 'scatter']);
});

test('a different gesture cannot queue a delayed action through the global cooldown', () => {
  const rig = setup();
  rig.at(0, [hand('Victory')]); rig.through(650, [hand('Victory')]);
  rig.through(2150, [hand('Closed_Fist')]);
  assert.deepEqual(types(rig), ['scatter']);
  rig.at(2200, [hand('Closed_Fist')]);
  assert.deepEqual(types(rig), ['scatter', 'gather']);
});

test('an interrupted or travelling held gesture starts a new dwell', () => {
  const rig = setup();
  rig.at(0, [hand('Victory')]); rig.through(600, [hand('Victory')]);
  rig.at(650, [hand('Victory', { score: .4 })]);
  rig.through(1300, [hand('Victory')]);
  assert.deepEqual(types(rig), []);
  rig.at(1350, [hand('Victory')]);
  assert.deepEqual(types(rig), ['scatter']);
  const moving = setup();
  moving.at(0, [hand('Victory')]); moving.through(550, [hand('Victory')]);
  moving.at(600, [hand('Victory', { x: .64 })]);
  moving.through(1200, [hand('Victory', { x: .64 })]);
  assert.deepEqual(types(moving), []);
  moving.at(1250, [hand('Victory', { x: .64 })]);
  assert.deepEqual(types(moving), ['scatter']);
});

test('single palm motion uses mirrored deltas and has an acquisition baseline', () => {
  const rig = setup();
  rig.at(0, [hand('Open_Palm')]); rig.through(200, [hand('Open_Palm')]);
  assert.deepEqual(types(rig), []);
  for (let i = 1; i <= 8; i++) rig.at(200 + 50 * i, [hand('Open_Palm', { x: .5 - .012 * i, y: .52 + .006 * i })]);
  assert.ok(rig.events.length >= 4);
  assert.ok(rig.events.every(event => event.type === 'orbit' && event.dx > 0 && event.dy > 0));
  assert.ok(rig.events.every(event => Math.abs(event.dx) <= limits.maxOrbitDelta && Math.abs(event.dy) <= limits.maxOrbitDelta));
});

test('sub-pixel-like jitter does not rotate the tree and larger valid deltas are bounded', () => {
  const rig = setup();
  rig.at(0, [hand('Open_Palm')]);
  rig.through(2000, time => [hand('Open_Palm', { x: .5 + Math.sin(time) * .0008, y: .52 + Math.cos(time) * .0008 })]);
  assert.deepEqual(types(rig), []);
  rig.at(2100, [hand('Open_Palm', { x: .7 })]);
  assert.equal(rig.events.at(-1).type, 'orbit');
  assert.ok(Math.abs(rig.events.at(-1).dx) <= limits.maxOrbitDelta);
});

test('two open palms take priority; separation zooms in and convergence zooms out', () => {
  const rig = setup();
  rig.at(0, pair(.32)); rig.through(200, pair(.32));
  for (let i = 1; i <= 8; i++) rig.at(200 + i * 50, pair(.32 + i * .025, i % 2 === 0));
  assert.ok(rig.events.length >= 4);
  assert.ok(rig.events.every(event => event.type === 'zoom' && event.factor < 1));
  assert.ok(rig.events.every(event => event.factor >= Math.exp(-limits.maxZoomLogDelta)));
  rig.through(1000, pair(.52));
  const before = rig.events.length;
  for (let i = 1; i <= 8; i++) rig.at(1000 + i * 50, pair(.52 - i * .025, i % 2 !== 0));
  const contraction = rig.events.slice(before);
  assert.ok(contraction.length >= 4 && contraction.every(event => event.type === 'zoom' && event.factor > 1));
  assert.ok(contraction.every(event => event.factor <= Math.exp(limits.maxZoomLogDelta)));
});

test('model hand ordering and parallel translation do not cause zoom', () => {
  const rig = setup();
  rig.at(0, pair(.4));
  rig.through(1800, time => pair(.4, time % 100 === 0).map(h => ({ ...h, landmarks: h.landmarks.map(p => ({ ...p, y: p.y + Math.sin(time / 600) * .04 })) })));
  assert.deepEqual(types(rig), []);
});

test('mixed, uncertain, overlapping, or extra hands suppress conflicting actions', () => {
  for (const hands of [
    [hand('Open_Palm', { x: .3, handedness: 'Left' }), hand('Closed_Fist', { x: .7 })],
    [hand('Victory', { x: .3, handedness: 'Left' }), hand('Victory', { x: .7 })],
    [hand('Open_Palm', { x: .3, handedness: 'Left' }), hand('Open_Palm', { x: .7, score: .2 })],
    pair(.1), [...pair(.4), hand('Thumb_Up')],
  ]) {
    const rig = setup(); rig.at(0, hands); rig.through(1800, hands);
    assert.deepEqual(types(rig), []);
    assert.ok(rig.updates.every(update => update.cursor === null));
  }
});

test('point then geometry-only pinch selects the anchored cursor once, even if the model changes label', () => {
  const rig = setup(); armPoint(rig);
  const cursor = rig.updates.at(-1).cursor;
  const contact = hand('None', { score: 0, pinchRatio: .12, tipShift: .08 });
  assert.deepEqual(rig.at(250, [contact]).cursor, cursor);
  assert.deepEqual(rig.at(300, [contact]).commands, []);
  const selected = rig.at(350, [contact]);
  assert.deepEqual(selected.commands, [{ type: 'select-photo' }]);
  assert.deepEqual(selected.cursor, cursor);
  rig.through(2200, [hand('Closed_Fist', { pinchRatio: .16, tipShift: .1 })]);
  assert.deepEqual(types(rig), ['select-photo']);
  assert.ok(rig.updates.slice(5).every(update => JSON.stringify(update.cursor) === JSON.stringify(cursor)));
});


test('a real folded fist after pointing never selects a photo despite thumb/index contact', () => {
  const rig = setup(); armPoint(rig);
  rig.through(1500, [foldedFist()]);
  assert.deepEqual(types(rig), ['gather']);
  assert.ok(rig.events[0].at >= 200 + limits.pointLatchMs + limits.holdMs);
});

test('folding an incomplete pinch into the palm cancels its pending selection', () => {
  const rig = setup(); armPoint(rig);
  rig.at(250, [hand('None', { pinchRatio: .1 })]);
  rig.at(300, [foldedFist()]);
  rig.through(1100, [foldedFist()]);
  assert.deepEqual(types(rig), []);
  rig.through(1500, [foldedFist()]);
  assert.deepEqual(types(rig), ['gather']);
});

test('opening a gallery preserves the held-pinch guard until fingers are released', () => {
  const rig = setup(); armPoint(rig);
  rig.through(350, [hand('Closed_Fist', { pinchRatio: .12 })]);
  assert.deepEqual(types(rig), ['select-photo']);
  rig.at(400, [hand('Closed_Fist', { pinchRatio: .12 })], 'gallery');
  rig.through(1700, [hand('Closed_Fist', { pinchRatio: .12 })]);
  assert.deepEqual(types(rig), ['select-photo']);
  assert.equal(rig.updates.at(-1).cursor, null);
  rig.through(1900, [hand('None', { pinchRatio: .65 })]);
  rig.through(2900, [foldedFist()]);
  assert.deepEqual(types(rig), ['select-photo', 'close-gallery']);
});

test('a brief tracking dropout cannot turn the same held pinch into gallery-close', () => {
  const rig = setup(); armPoint(rig);
  const contact = hand('Closed_Fist', { pinchRatio: .12 });
  rig.through(350, [contact]);
  rig.at(400, [contact], 'gallery');
  rig.at(450, []);
  rig.through(2100, [contact]);
  assert.deepEqual(types(rig), ['select-photo']);
  // A genuinely folded fist remains available after reacquisition.
  rig.through(2800, [foldedFist()]);
  assert.deepEqual(types(rig), ['select-photo', 'close-gallery']);
});

test('pinch needs a recent, confident, open pointing pose and cannot arm already closed', () => {
  for (const gesture of ['None', 'Pointing_Up']) {
    const rig = setup();
    const closed = hand(gesture, { pinchRatio: .12 });
    rig.at(0, [closed]); rig.through(1500, [closed]);
    assert.deepEqual(types(rig), []);
  }
  const weak = setup(); weak.at(0, [hand('Pointing_Up', { score: .1 })]);
  weak.through(200, [hand('Pointing_Up', { score: .1 })]);
  weak.through(500, [hand('None', { pinchRatio: .12 })]);
  assert.deepEqual(types(weak), []);
  const expired = setup(); armPoint(expired);
  expired.through(750, [hand('None')]);
  assert.equal(expired.updates.at(-1).cursor, null);
  expired.through(1200, [hand('None', { pinchRatio: .12 })]);
  assert.deepEqual(types(expired), []);
});

test('pinch hysteresis ignores partial openings and requires a fresh point after a full release', () => {
  const rig = setup(); armPoint(rig);
  rig.through(350, [hand('None', { pinchRatio: .15 })]);
  rig.through(1500, time => [hand('None', { pinchRatio: [.2, .32, .4][Math.floor(time / 50) % 3] })]);
  rig.at(1550, [hand('None', { pinchRatio: .6 })]);
  rig.at(1600, [hand('None', { pinchRatio: .1 })]);
  rig.through(2000, [hand('None', { pinchRatio: .15 })]);
  assert.deepEqual(types(rig), ['select-photo']);
  rig.through(2200, [hand('None', { pinchRatio: .7 })]);
  rig.through(2400, [hand('None', { pinchRatio: .1 })]);
  assert.deepEqual(types(rig), ['select-photo']);
  rig.through(2650, [hand('Pointing_Up')]);
  rig.through(2800, [hand('None', { pinchRatio: .15 })]);
  assert.deepEqual(types(rig), ['select-photo', 'select-photo']);
});

test('depth-separated fingertips cannot select merely because they overlap in the image', () => {
  const rig = setup(); armPoint(rig);
  const projectedContact = hand('None', { pinchRatio: 0 });
  projectedContact.landmarks[4].z = .2;
  rig.through(500, [projectedContact]);
  assert.deepEqual(types(rig), []);
});

test('confidence gating uses gestureScore and rejects non-finite or out-of-range scores', () => {
  for (const score of [.2, limits.gestureConfidence - .001, NaN, Infinity, 1.1]) {
    const rig = setup();
    const weak = { ...hand('Victory', { score }), handednessScore: 1 };
    rig.at(0, [weak]); rig.through(1300, [weak]);
    assert.deepEqual(types(rig), []);
  }
});

test('invalid landmarks and implausible palms cannot produce gestures or cursors', () => {
  const malformed = [];
  const short = hand('Pointing_Up'); short.landmarks.pop(); malformed.push(short);
  const nan = hand('Pointing_Up'); nan.landmarks[8].x = NaN; malformed.push(nan);
  const depth = hand('Pointing_Up'); depth.landmarks[2].z = Infinity; malformed.push(depth);
  const collapsed = hand('Victory'); collapsed.landmarks = collapsed.landmarks.map(() => ({ x: .5, y: .5 })); malformed.push(collapsed);
  malformed.push(hand('Victory', { scale: .05 }), hand('Victory', { scale: 9 }));
  const outside = hand('Victory'); outside.landmarks[10].x = 2; malformed.push(outside);
  for (const h of malformed) {
    const rig = setup(); rig.at(0, [h]); rig.through(1500, [h]);
    assert.deepEqual(types(rig), []);
    assert.ok(rig.updates.every(update => update.cursor === null));
  }
  const edge = setup(); const update = edge.at(0, [hand('Pointing_Up', { x: 1.1, y: .15 })]);
  assert.deepEqual(update.cursor, { x: 0, y: 0 });
});


test('pointing maps its smaller camera region to every viewport edge, mirrors, and clamps', () => {
  for (const [tipX, tipY, expectedX, expectedY] of [
    [.1, .06, 1, 0], [.9, .8, 0, 1], [.5, .43, .5, .5],
    [0, 0, 1, 0], [1.05, .95, 0, 1],
  ]) {
    const rig = setup();
    const update = rig.at(0, [hand('Pointing_Up', { x: tipX + .055, y: tipY + .18 })]);
    assert.ok(update.cursor);
    assert.ok(Math.abs(update.cursor.x - expectedX) < 1e-10 && Math.abs(update.cursor.y - expectedY) < 1e-10);
  }
  const custom = setup('scene', { cursorMinX: 0, cursorMaxX: 1, cursorMinY: 0, cursorMaxY: 1 });
  const update = custom.at(0, [hand('Pointing_Up')]);
  assert.ok(Math.abs(update.cursor.x - .555) < 1e-10 && Math.abs(update.cursor.y - .34) < 1e-10);
});

test('cursor active-region settings never amplify palm navigation', () => {
  const regular = setup();
  const narrow = setup('scene', { cursorMinX: .3, cursorMaxX: .7, cursorMinY: .2, cursorMaxY: .6 });
  for (const rig of [regular, narrow]) {
    rig.at(0, [hand('Open_Palm')]); rig.through(200, [hand('Open_Palm')]);
    for (let i = 1; i <= 6; i++) rig.at(200 + i * 50, [hand('Open_Palm', { x: .5 + i * .015 })]);
  }
  assert.deepEqual(regular.events, narrow.events);
});

test('missing hands reset dwell, pointing, and motion without reacquisition jumps', () => {
  const rig = setup();
  rig.at(0, [hand('Victory')]); rig.through(600, [hand('Victory')]);
  rig.at(650, []); rig.through(1300, [hand('Victory')]);
  assert.deepEqual(types(rig), []);
  rig.at(1350, [hand('Victory')]); assert.deepEqual(types(rig), ['scatter']);
  const orbit = setup(); orbit.at(0, [hand('Open_Palm')]); orbit.through(200, [hand('Open_Palm')]);
  orbit.at(250, []); assert.deepEqual(orbit.at(300, [hand('Open_Palm', { x: .7 })]).commands, []);
  orbit.through(600, [hand('Open_Palm', { x: .7 })]); assert.deepEqual(types(orbit), []);
  const point = setup(); armPoint(point); point.at(250, []);
  point.through(500, [hand('None', { pinchRatio: .1 })]); assert.deepEqual(types(point), []);
});

test('large frame gaps, backwards clocks, and invalid clocks restart acquisition', () => {
  for (const discontinuity of [1500, 50, NaN]) {
    const rig = setup(); rig.at(0, [hand('Victory')]); rig.through(600, [hand('Victory')]);
    const out = rig.at(discontinuity, [hand('Victory')]); assert.deepEqual(out.commands, []);
    const next = Number.isFinite(discontinuity) ? discontinuity + 50 : 650;
    rig.at(next, [hand('Victory')]); rig.through(next + 500, [hand('Victory')]);
    assert.deepEqual(types(rig), []);
  }
  const rig = setup(); rig.at(0, [hand('Victory')]); rig.through(650, [hand('Victory')]);
  for (let i = 0; i < 5; i++) rig.at(650, [hand('Victory')]);
  assert.deepEqual(types(rig), ['scatter']);
});

test('valid 200 ms inferences at 300 ms capture cadence can hold, orbit, and zoom', () => {
  // Timestamps refer to the captured image, as in session-core. A constant
  // 200 ms inference latency changes delivery time, not their 300 ms spacing.
  const held = setup();
  for (const time of [0, 300, 600]) held.at(time, [hand('Victory')]);
  assert.deepEqual(types(held), []);
  held.at(900, [hand('Victory')]);
  assert.deepEqual(types(held), ['scatter']);

  const orbit = setup();
  orbit.at(0, [hand('Open_Palm')]); orbit.at(300, [hand('Open_Palm')]);
  orbit.at(600, [hand('Open_Palm', { x: .47 })]);
  orbit.at(900, [hand('Open_Palm', { x: .44 })]);
  assert.ok(orbit.events.length === 2 && orbit.events.every(event => event.type === 'orbit' && event.dx > 0));

  const zoom = setup();
  zoom.at(0, pair(.3)); zoom.at(300, pair(.3));
  zoom.at(600, pair(.36)); zoom.at(900, pair(.42));
  assert.ok(zoom.events.length === 2 && zoom.events.every(event => event.type === 'zoom' && event.factor < 1));
});

test('500 ms capture cadence can acquire a point and complete its next-frame pinch', () => {
  const rig = setup();
  rig.at(0, [hand('Pointing_Up')]);
  const armed = rig.at(500, [hand('Pointing_Up')]);
  assert.equal(armed.feedback.progress, 1);
  const contact = hand('None', { pinchRatio: .12, score: 0 });
  rig.at(1000, [contact]);
  assert.deepEqual(types(rig), []);
  rig.at(1500, [contact]);
  assert.deepEqual(types(rig), ['select-photo']);
  assert.deepEqual(rig.updates.at(-1).cursor, armed.cursor);

  const stale = setup();
  stale.at(0, [hand('Pointing_Up')]); stale.at(500, [hand('Pointing_Up')]);
  stale.at(1000, [hand('None')]);
  stale.at(1500, [contact]); stale.at(2000, [contact]);
  assert.deepEqual(types(stale), []);
});

test('a gap over 600 ms cannot join two incomplete holds or reuse a pointing latch', () => {
  const rig = setup();
  for (const time of [0, 300, 600, 1201, 1501, 1801]) rig.at(time, [hand('Victory')]);
  assert.deepEqual(types(rig), []);
  rig.at(2101, [hand('Victory')]);
  assert.deepEqual(types(rig), ['scatter']);

  const point = setup(); point.at(0, [hand('Pointing_Up')]); point.at(300, [hand('Pointing_Up')]);
  point.at(901, [hand('None', { pinchRatio: .1 })]); point.at(1201, [hand('None', { pinchRatio: .1 })]);
  assert.deepEqual(types(point), []);
  assert.equal(point.updates.at(-1).cursor, null);
});

test('acquisition counts distinct confident observations, not elapsed time or duplicate frames', () => {
  const held = setup('scene', { holdMs: 100 });
  held.at(0, [hand('Thumb_Up')]); held.at(300, [hand('Thumb_Up')]);
  for (let i = 0; i < 4; i++) held.at(300, [hand('Thumb_Up')]);
  assert.deepEqual(types(held), []);
  held.at(600, [hand('Thumb_Up')]);
  assert.deepEqual(types(held), ['toggle-rotation']);

  const interrupted = setup('scene', { holdMs: 100 });
  interrupted.at(0, [hand('Victory')]); interrupted.at(300, [hand('Victory', { score: .2 })]);
  interrupted.at(600, [hand('Victory')]); interrupted.at(900, [hand('Victory')]);
  assert.deepEqual(types(interrupted), []);
  interrupted.at(1200, [hand('Victory')]);
  assert.deepEqual(types(interrupted), ['scatter']);

  const point = setup();
  point.at(0, [hand('Pointing_Up')]);
  point.at(500, [hand('None', { pinchRatio: .1 })]);
  point.at(1000, [hand('None', { pinchRatio: .1 })]);
  assert.deepEqual(types(point), []);
});

test('identity changes reset dwell and pointing even at the same screen position', () => {
  const rig = setup(); rig.at(0, [hand('Victory', { handedness: 'Left' })]);
  rig.through(600, [hand('Victory', { handedness: 'Left' })]);
  rig.at(650, [hand('Victory')]); rig.through(1250, [hand('Victory')]);
  assert.deepEqual(types(rig), []);
  rig.at(1300, [hand('Victory')]); assert.deepEqual(types(rig), ['scatter']);
  const point = setup(); armPoint(point);
  point.through(500, [hand('None', { handedness: 'Left', pinchRatio: .1 })]);
  assert.deepEqual(types(point), []);
  const jump = setup(); jump.at(0, [hand('Open_Palm', { x: .25 })]); jump.through(200, [hand('Open_Palm', { x: .25 })]);
  assert.deepEqual(jump.at(250, [hand('Open_Palm', { x: .75 })]).commands, []);
  jump.through(500, [hand('Open_Palm', { x: .75 })]); assert.deepEqual(types(jump), []);
});

for (const [cameraDirection, expected] of [[1, 1], [-1, -1]]) {
  test(`gallery palm swipe gives direction ${expected} once and never orbits`, () => {
    const rig = setup('gallery'); rig.at(0, [hand('Open_Palm')]); rig.through(200, [hand('Open_Palm')]);
    for (let i = 1; i <= 7; i++) rig.at(200 + i * 50, [hand('Open_Palm', { x: .5 + cameraDirection * i * .04 })]);
    rig.through(1800, [hand('Open_Palm', { x: .5 + cameraDirection * .28 })]);
    assert.deepEqual(rig.events.map(({ type, direction }) => ({ type, direction })), [{ type: 'gallery-step', direction: expected }]);
    assert.ok(rig.updates.every(update => update.cursor === null));
  });
}

test('gallery ignores slow drift, diagonal motion, two-hand zoom, and scene-only poses', () => {
  for (const move of [
    time => [hand('Open_Palm', { x: .4 + time / 10000 })],
    time => [hand('Open_Palm', { x: .4 + time / 5000, y: .42 + time / 2500 })],
    time => pair(.3 + time / 4000),
  ]) {
    const rig = setup('gallery'); rig.at(0, move(0)); rig.through(650, move); assert.deepEqual(types(rig), []);
  }
  for (const gesture of ['Victory', 'Thumb_Up', 'ILoveYou', 'Pointing_Up']) {
    const rig = setup('gallery'); rig.at(0, [hand(gesture)]); rig.through(1300, [hand(gesture)]);
    assert.deepEqual(types(rig), []); assert.equal(rig.updates.at(-1).cursor, null);
  }
});

test('view transitions preserve event release locks and reset navigation baselines', () => {
  const rig = setup(); rig.at(0, [hand('Closed_Fist')]); rig.through(650, [hand('Closed_Fist')]);
  rig.at(700, [hand('Closed_Fist')], 'gallery'); rig.through(2500, [hand('Closed_Fist')]);
  assert.deepEqual(types(rig), ['gather']);
  const nav = setup(); nav.at(0, [hand('Open_Palm')]); nav.through(200, [hand('Open_Palm')]);
  assert.deepEqual(nav.at(250, [hand('Open_Palm', { x: .6 })], 'gallery').commands, []);
  nav.through(600, [hand('Open_Palm', { x: .6 })]); assert.deepEqual(types(nav), []);
});

test('reset removes pending gestures and old clock/locks; thresholds are configurable and validated', () => {
  const rig = setup(); rig.at(0, [hand('Victory')]); rig.through(650, [hand('Victory')]);
  rig.interpreter.reset(); rig.at(0, [hand('Victory')]); rig.through(650, [hand('Victory')]);
  assert.deepEqual(types(rig), ['scatter', 'scatter']);
  const fast = setup('scene', { holdMs: 300 }); fast.at(0, [hand('Thumb_Up')]); fast.through(300, [hand('Thumb_Up')]);
  assert.deepEqual(types(fast), ['toggle-rotation']);
  for (const invalid of [{ holdMs: NaN }, { smoothingMs: 0 }, { gestureConfidence: 2 }, { pinchEnterRatio: .8 }, { minPalmSize: .6 }]) {
    assert.throws(() => createHandGestureInterpreter(invalid), RangeError);
  }
});
