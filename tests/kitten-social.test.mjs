import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = async file => ts.transpileModule(await readFile(new URL('../src/scene/kittens/' + file, import.meta.url), 'utf8'), {
  fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const packUrl = moduleUrl(await compile('kitten-pack.ts'));
const { KITTEN_IDS } = await import(packUrl);
const { createKittenSocialController, KITTEN_SOCIAL_DEFAULTS: defaults } = await import(moduleUrl(
  (await compile('kitten-social.ts')).replace(/from\s+(['"])\.\/kitten-pack\1/g, 'from ' + JSON.stringify(packUrl)),
));
const dt = 1 / 60;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const facingDot = (a, b) => {
  const d = distance(a.position, b.position);
  return ((b.position[0] - a.position[0]) * Math.sin(a.yaw) + (b.position[1] - a.position[1]) * Math.cos(a.yaw)) / d;
};
const advance = (controller, seconds, mode) => {
  let poses = controller.snapshot();
  for (let i = 0; i < Math.ceil(seconds / dt); i++) poses = controller.update(dt, mode);
  return poses;
};

test('all six identities start in two quiet groups with independent rest poses', () => {
  const controller = createKittenSocialController();
  const initial = controller.snapshot();
  assert.deepEqual(initial.map(cat => cat.id), KITTEN_IDS);
  assert.equal(new Set(initial.map(cat => cat.action)).size, 4);
  assert.ok(initial.every(cat => cat.speed === 0 && cat.partnerId === null));
  assert.deepEqual(advance(controller, 3).map(cat => cat.position), initial.map(cat => cat.position));
  initial[0].position[0] = 900;
  assert.notEqual(controller.snapshot()[0].position[0], 900, 'snapshots must not expose mutable controller positions');
});

test('four minutes include mutual play and chase while preserving separation, heading and bounded motion', () => {
  const controller = createKittenSocialController();
  let previous = controller.snapshot(), gallopFrames = 0, movingFrames = 0;
  const events = [];
  for (let frame = 0; frame < 240 / dt; frame++) {
    const current = controller.update(dt);
    const fast = current.filter(cat => cat.speed > defaults.walkSpeed * 1.12);
    assert.ok(fast.length <= 2, 'at most one pair can run at a time');
    gallopFrames += current.filter(cat => cat.action === 'gallop').length;
    for (let i = 0; i < current.length; i++) {
      const cat = current[i], last = previous[i];
      assert.ok([...cat.position, cat.yaw, cat.speed, cat.actionTime, cat.actionDuration].every(Number.isFinite));
      assert.ok(cat.position[0] >= defaults.bounds.minX + defaults.footprintRadius - 1e-7);
      assert.ok(cat.position[0] <= defaults.bounds.maxX - defaults.footprintRadius + 1e-7);
      assert.ok(cat.position[1] >= defaults.bounds.minZ + defaults.footprintRadius - 1e-7);
      assert.ok(cat.position[1] <= defaults.bounds.maxZ - defaults.footprintRadius + 1e-7);
      assert.ok(Math.hypot(...cat.position) >= 9.2 + defaults.footprintRadius + 0.02 - 1e-7, 'stay clear of the tree base');
      const step = distance(cat.position, last.position);
      assert.ok(step <= defaults.gallopSpeed * dt + 1e-7, 'no positional jump or overlap repair');
      for (const other of current.slice(i + 1)) {
        assert.ok(distance(cat.position, other.position) >= defaults.minimumSeparation - 1e-7, 'footprints must never overlap');
      }
      if (cat.speed > 0.1) {
        movingFrames++;
        const dot = ((cat.position[0] - last.position[0]) * Math.sin(cat.yaw) + (cat.position[1] - last.position[1]) * Math.cos(cat.yaw)) / step;
        assert.ok(dot > 0.999, 'travel must follow body heading rather than slide sideways or backwards');
      }
      if (cat.partnerId) {
        const partner = current.find(other => other.id === cat.partnerId);
        assert.notEqual(cat.id, partner.id);
        assert.equal(partner.partnerId, cat.id, 'pair assignments must be reciprocal');
      }
      if (cat.action === 'pounce' || cat.action === 'paw') {
        const partner = current.find(other => other.id === cat.partnerId);
        assert.ok(partner, 'contact play always has an identified partner');
        assert.ok(distance(cat.position, partner.position) <= defaults.playDistance + 0.3);
        assert.ok(cat.speed < 0.05 && partner.speed < 0.05, 'one-shots start only after both kittens stop');
        assert.ok(facingDot(cat, partner) > Math.cos(Math.PI / 9), 'actor must face its partner within 20 degrees');
        assert.ok(facingDot(partner, cat) > Math.cos(Math.PI / 9), 'partner must also face the actor');
        if (cat.action !== last.action) events.push({ id: cat.id, action: cat.action, time: frame * dt });
      }
    }
    previous = current;
  }
  assert.ok(movingFrames > 1000 && gallopFrames > 100, 'test must exercise actual walking and chasing');
  assert.deepEqual(events.slice(0, 4).map(({ id, action }) => [id, action]), [
    ['tuxedo-a', 'pounce'], ['tuxedo-b', 'pounce'], ['tuxedo-a', 'paw'], ['tuxedo-b', 'paw'],
  ]);
  assert.ok(events[0].time < 12 && events[3].time < 20, 'the first short interaction should be visible soon after entry');
  assert.ok(events.length >= 8, 'play must succeed in later sessions as well as the initial arrangement');
});

test('pause and reduced motion freeze the current location and resume without catch-up', () => {
  const controller = createKittenSocialController();
  let current = controller.snapshot();
  for (let frame = 0; frame < 1800 && !current.some(cat => cat.speed > 0.8); frame++) current = controller.update(dt);
  assert.ok(current.some(cat => cat.speed > 0.8));
  const stableFields = poses => poses.map(({ position, yaw, actionTime, focused }) => ({ position, yaw, actionTime, focused }));
  const paused = controller.update(300, { paused: true });
  assert.deepEqual(stableFields(paused), stableFields(current));
  assert.ok(paused.every(cat => cat.speed === 0));
  assert.deepEqual(stableFields(controller.update(300, { reducedMotion: true })), stableFields(current));
  assert.ok(controller.snapshot().every(cat => cat.speed === 0 && cat.partnerId === null && !['walk', 'trot', 'gallop', 'pounce', 'paw'].includes(cat.action)));
  const resumed = controller.update(300);
  for (let i = 0; i < resumed.length; i++) {
    assert.ok(distance(resumed[i].position, current[i].position) <= defaults.gallopSpeed * 0.05 + 1e-7);
    assert.ok(resumed[i].action !== current[i].action || resumed[i].actionTime - current[i].actionTime <= 0.05 + 1e-7);
  }
});

test('a tap gently stops a moving kitten, releases its pair and respects paused attention time', () => {
  const controller = createKittenSocialController();
  let current = controller.snapshot(), target;
  for (let frame = 0; frame < 1800 && !target; frame++) {
    current = controller.update(dt); target = current.find(cat => cat.speed > 0.8);
  }
  assert.ok(target);
  controller.focus(target.id, 3);
  let next = controller.update(dt).find(cat => cat.id === target.id);
  assert.ok(next.focused && next.partnerId === null);
  assert.ok(next.speed > 0 && next.speed < target.speed, 'focus eases motion instead of freezing in mid-stride');
  assert.ok(distance(next.position, target.position) > 0);
  next = advance(controller, 1).find(cat => cat.id === target.id);
  assert.equal(next.speed, 0); assert.equal(next.action, 'idle'); assert.equal(next.focused, true);
  const frozen = next.position;
  assert.equal(controller.update(300, { paused: true }).find(cat => cat.id === target.id).focused, true);
  assert.deepEqual(advance(controller, 0.5).find(cat => cat.id === target.id).position, frozen);
  assert.equal(advance(controller, 2).find(cat => cat.id === target.id).focused, false);
});

test('magic selects a nearby eligible pair and does not teleport kittens or interrupt held attention', () => {
  const controller = createKittenSocialController();
  advance(controller, 2.1);
  const before = controller.snapshot();
  assert.deepEqual(controller.magic([-10.6, 5.9]), ['tuxedo-a', 'tuxedo-b']);
  const after = controller.update(dt);
  assert.equal(after[0].partnerId, 'tuxedo-b'); assert.equal(after[1].partnerId, 'tuxedo-a');
  assert.ok(after.every((cat, i) => distance(cat.position, before[i].position) <= defaults.gallopSpeed * dt));
  controller.focus('tuxedo-a');
  const selected = controller.magic([-10.6, 5.9]);
  assert.ok(selected && !selected.includes('tuxedo-a'));
  assert.equal(controller.update(dt)[0].partnerId, null);
});

test('inspected clip durations protect full contact actions and long initial rest clips', () => {
  const controller = createKittenSocialController({ actionDurations: { pounce: 1.8, paw: 0.4 } });
  let current = controller.snapshot();
  for (let frame = 0; frame < 900 && current[0].action !== 'pounce'; frame++) current = controller.update(dt);
  assert.equal(current[0].action, 'pounce'); assert.equal(current[0].actionTime, 0);
  controller.setActionDurations({ pounce: 0.6 });
  let elapsed = 0;
  while (current[0].action === 'pounce' && elapsed < 3) {
    assert.equal(current[0].actionDuration, 1.8, 'new metadata must not truncate an active one-shot');
    current = controller.update(dt); elapsed += dt;
  }
  assert.ok(elapsed >= 1.8 && elapsed <= 1.8 + dt * 2);
  for (let frame = 0; frame < 240 && current[1].action !== 'pounce'; frame++) current = controller.update(dt);
  assert.equal(current[1].action, 'pounce'); assert.equal(current[1].actionDuration, 0.6);

  const longRest = createKittenSocialController({ actionDurations: { sit: 30, lie: 30, sleep: 30 } });
  const initial = longRest.snapshot();
  for (let frame = 0; frame < 31 / dt; frame++) {
    const poses = longRest.update(dt);
    for (const i of [0, 2, 4, 5]) {
      assert.deepEqual(poses[i].position, initial[i].position, 'initial rest must finish and hold for two seconds');
      assert.equal(poses[i].action, initial[i].action);
    }
  }
});
