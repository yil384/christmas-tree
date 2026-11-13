import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const compile = (source, fileName) => ts.transpileModule(source, {
  fileName, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = file => readFile(new URL('../src/scene/' + file, import.meta.url), 'utf8');
const imports = (source, aliases = {}) => source.replace(/from\s+(['"])([^'"]+)\1/g,
  (_match, _quote, name) => 'from ' + JSON.stringify(aliases[name] ?? import.meta.resolve(name)));
const profileUrl = moduleUrl(compile(await read('tree-profile.ts'), 'tree-profile.ts'));
const placementUrl = moduleUrl(compile(await read('cat-placement.ts'), 'cat-placement.ts'));
const behaviorUrl = moduleUrl(compile(await read('cat-behavior.ts'), 'cat-behavior.ts'));
const baseUrl = moduleUrl(imports(compile(await read('tree-base.ts'), 'tree-base.ts'), { './tree-profile': profileUrl }));
const rigUrl = moduleUrl(imports(compile(await read('cat-rig.ts'), 'cat-rig.ts'), {
  './tree-profile': profileUrl, './tree-base': baseUrl, './cat-placement': placementUrl, './cat-behavior': behaviorUrl,
}));
const { createAuthoredCat, syncAuthoredCat, disposeAuthoredCat, CAT_GROUND, PAW_ANKLE_HEIGHT } = await import(rigUrl);
const { CAT_X, CAT_Z, createCatGroundContact, sampleCatRoute, CAT_WALK_PERIOD } = await import(placementUrl);
const { advanceCatClock, advanceCatTravel, catBlink } = await import(behaviorUrl);
const { GROUND_Y } = await import(profileUrl);
const { snowHeightAt } = await import(baseUrl);
const bytes = await readFile(new URL('../src/assets/christmas-cat.glb', import.meta.url));
const parse = () => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

function rootFor(kitten) {
  const parent = new THREE.Group(); parent.position.set(CAT_X, CAT_GROUND, CAT_Z); parent.add(kitten.group); return parent;
}

test('the shipped companion is a compact self-contained licensed skin with authored idle and walk', async () => {
  assert.ok(bytes.byteLength < 500_000, 'the companion must not become a first-load bottleneck');
  const jsonLength = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  assert.equal(json.meshes.length, 1); assert.equal(json.materials.length, 1);
  assert.equal(json.meshes[0].primitives.length, 1, 'the cat costs one body draw call');
  assert.equal(json.skins[0].joints.length, 24);
  assert.equal(json.images?.length ?? 0, 0, 'the model has no external texture requests');
  assert.deepEqual(json.animations.map(a => a.name).sort(), ['Idle', 'Walking']);
  assert.ok(json.buffers.every(buffer => !buffer.uri), 'all buffers are embedded');
  const license = await readFile(new URL('../src/assets/christmas-cat.LICENSE.txt', import.meta.url), 'utf8');
  assert.match(license, /Quaternius/); assert.match(license, /CC0 1.0/); assert.match(license, /opengameart.org/);
  const kitten = createAuthoredCat(await parse());
  try {
    assert.equal(kitten.meshes.length, 1); assert.equal(kitten.feet.length, 4);
    const size = new THREE.Box3().setFromObject(kitten.group).getSize(new THREE.Vector3());
    assert.ok(size.x > 0.8 && size.x < 1.1 && size.y > 1.8 && size.y < 2.4 && size.z > 2.2 && size.z < 2.8);
    const skin = kitten.meshes[0].geometry.attributes.skinWeight;
    for (let i = 0; i < skin.count; i++) assert.ok(Math.abs(skin.getX(i) + skin.getY(i) + skin.getZ(i) + skin.getW(i) - 1) < 1e-5);
  } finally { disposeAuthoredCat(kitten); }
});

test('a real skeleton takes short strolls and blends into four long rests without a route jump', async () => {
  const kitten = createAuthoredCat(await parse()), contact = createCatGroundContact(), parent = rootFor(kitten);
  const footPositions = [], restWeights = [];
  try {
    let last = sampleCatRoute(0);
    for (let time = 0; time <= CAT_WALK_PERIOD; time += 1 / 30) {
      const route = syncAuthoredCat(kitten, time, 1 / 30, false, contact); parent.updateMatrixWorld(true);
      assert.ok(Math.hypot(...route.position) > 9.5);
      assert.ok(Math.hypot(route.position[0] - last.position[0], route.position[1] - last.position[1]) < 0.04);
      assert.deepEqual(contact.position, route.position);
      assert.ok(kitten.walkWeight >= 0 && kitten.walkWeight <= 1);
      assert.ok(kitten.walk.getEffectiveTimeScale() >= 0, 'the cat never moonwalks backwards');
      footPositions.push(kitten.feet[0].getWorldPosition(new THREE.Vector3()).y);
      if ([15, 31, 49, 66].some(rest => Math.abs(time - rest) < 0.02)) restWeights.push(kitten.walkWeight);
      for (const mesh of kitten.meshes) assert.ok(mesh.skeleton.bones.every(bone => bone.matrixWorld.elements.every(Number.isFinite)));
      last = route;
    }
    assert.ok(Math.max(...footPositions) - Math.min(...footPositions) > 0.13, 'authored walking actually lifts paws');
    assert.equal(restWeights.length, 4); assert.ok(restWeights.every(weight => weight < 0.01));
  } finally { disposeAuthoredCat(kitten); }
});

test('the cat starts quietly and spends most of its route watching rather than marching', () => {
  let moving = 0;
  for (let time = 0; time < CAT_WALK_PERIOD; time += 0.1) {
    const route = sampleCatRoute(time);
    if (time < 5) assert.equal(route.speed, 0);
    if (route.speed > 0.01) moving += 0.1;
  }
  assert.ok(moving / CAT_WALK_PERIOD < 0.4);
});

test('idle and walking loop across their seam without teleporting a paw', async () => {
  const kitten = createAuthoredCat(await parse()), parent = rootFor(kitten);
  try {
    for (const action of [kitten.idle, kitten.walk]) {
      kitten.idle.setEffectiveWeight(0); kitten.walk.setEffectiveWeight(0);
      action.setEffectiveWeight(1).setEffectiveTimeScale(1);
      const duration = action.getClip().duration;
      kitten.mixer.setTime(duration - 0.0001); parent.updateMatrixWorld(true);
      const before = kitten.feet.map(foot => foot.getWorldPosition(new THREE.Vector3()));
      kitten.mixer.setTime(duration + 0.0001); parent.updateMatrixWorld(true);
      for (let i = 0; i < kitten.feet.length; i++) {
        assert.ok(kitten.feet[i].getWorldPosition(new THREE.Vector3()).distanceTo(before[i]) < 0.002);
      }
    }
  } finally { disposeAuthoredCat(kitten); }
});

test('stance correction reduces horizontal skating while paws lift and release continuously', async () => {
  const kitten = createAuthoredCat(await parse()), parent = rootFor(kitten), previous = [], slips = [];
  let largestStep = 0;
  try {
    for (let time = 0; time < CAT_WALK_PERIOD; time += 1 / 60) {
      const route = syncAuthoredCat(kitten, time, 1 / 60, false); parent.updateMatrixWorld(true);
      for (let i = 0; i < kitten.feet.length; i++) {
        const paw = kitten.feet[i].getWorldPosition(new THREE.Vector3());
        const grounded = paw.y - GROUND_Y - snowHeightAt(paw.x, paw.z) < 0.055;
        if (previous[i]) {
          const movement = Math.hypot(paw.x - previous[i].paw.x, paw.z - previous[i].paw.z);
          largestStep = Math.max(largestStep, movement);
          if (grounded && previous[i].grounded && route.speed > 0.2) slips.push(movement);
        }
        previous[i] = { paw, grounded };
      }
    }
    slips.sort((a, b) => a - b);
    assert.ok(slips.length > 500, 'measure actual supporting paws during all four strolls');
    assert.ok(slips[Math.floor(slips.length / 2)] < 0.002, 'supporting paws should hold their snow position');
    assert.ok(largestStep < 0.065, 'walking, releasing contacts and wrapping clips must remain continuous');
  } finally { disposeAuthoredCat(kitten); }
});

test('stance IK preserves authored ankle orientation under the model’s nonuniform root scale', async () => {
  const kitten = createAuthoredCat(await parse()), parent = rootFor(kitten);
  const authored = new Map(kitten.authoredPose.map(pose => [pose.bone, pose]));
  try {
    for (let time = 0; time < CAT_WALK_PERIOD; time += 1 / 30) {
      syncAuthoredCat(kitten, time, 1 / 30, false); parent.updateMatrixWorld(true);
      for (const { bone } of kitten.authoredPose) assert.ok(Math.abs(bone.quaternion.length() - 1) < 0.00001);
      for (const foot of kitten.feet) {
        const actual = new THREE.Quaternion(), expected = new THREE.Quaternion();
        for (let bone = foot; bone && bone !== kitten.group; bone = bone.parent) {
          actual.premultiply(bone.quaternion);
          expected.premultiply(authored.get(bone)?.quaternion ?? bone.quaternion);
        }
        assert.ok(actual.normalize().angleTo(expected.normalize()) < 0.0001,
          'post-animation foot planting must not introduce a new ankle twist');
      }
    }
  } finally { disposeAuthoredCat(kitten); }
});

test('a tap slows travel and gait together, then resumes without catching up', async () => {
  const kitten = createAuthoredCat(await parse()), parent = rootFor(kitten);
  let travel = { elapsed: 7, pace: 1 }, previousPosition, beforeStop, firstStop, afterStop;
  try {
    for (let frame = 0; frame < 110; frame++) {
      const attending = frame >= 20;
      travel = advanceCatTravel(travel.elapsed, travel.pace, 1 / 60, attending);
      const route = syncAuthoredCat(kitten, travel.elapsed, 1 / 60, false, undefined, attending, 0.4);
      parent.updateMatrixWorld(true);
      if (previousPosition) {
        const speed = Math.hypot(route.position[0] - previousPosition[0], route.position[1] - previousPosition[1]) * 60;
        if (frame === 19) beforeStop = speed;
        if (frame === 20) firstStop = speed;
        if (frame === 109) afterStop = speed;
      }
      previousPosition = route.position;
    }
    assert.ok(firstStop > 0 && firstStop > beforeStop * 0.8, 'a tap must not freeze translation in one frame');
    assert.ok(afterStop < 0.002 && kitten.walkWeight < 0.01, 'body and feet settle together');
    const stoppedAt = travel.elapsed;
    travel = advanceCatTravel(travel.elapsed, travel.pace, 1 / 60, false);
    assert.ok(travel.elapsed - stoppedAt < 0.001, 'resume starts softly without replaying paused travel');
    assert.ok(catBlink(0, 1) > 0.99, 'attention includes a slow relaxed blink');
  } finally { disposeAuthoredCat(kitten); }
});

test('the contact receiver follows actual paw bones and at least one supporting paw stays on snow', async () => {
  const kitten = createAuthoredCat(await parse()), contact = createCatGroundContact(), parent = rootFor(kitten);
  try {
    let swingingContacts = 0;
    for (let time = 0; time < 16; time += 1 / 30) {
      syncAuthoredCat(kitten, time, 1 / 30, false, contact); parent.updateMatrixWorld(true);
      const clearances = kitten.feet.map((bone, i) => {
        const paw = bone.getWorldPosition(new THREE.Vector3()), [x, z, width] = contact.paws[i];
        const shadowX = contact.position[0] + x * Math.cos(contact.yaw) + z * Math.sin(contact.yaw);
        const shadowZ = contact.position[1] - x * Math.sin(contact.yaw) + z * Math.cos(contact.yaw);
        assert.ok(Math.hypot(paw.x - shadowX, paw.z - shadowZ) < 1e-7, 'a shadow must follow its own animated paw');
        const clearance = paw.y - (GROUND_Y + snowHeightAt(paw.x, paw.z)) - PAW_ANKLE_HEIGHT;
        assert.ok(clearance > -0.002, 'the foot skeleton cannot sink through snow');
        if (clearance > 0.12) { assert.equal(width, 0); swingingContacts++; }
        return clearance;
      });
      assert.ok(Math.abs(Math.min(...clearances)) < 0.002, 'support must be on the shared ground surface');
    }
    assert.ok(swingingContacts > 20, 'raised paws must lose their contact shadows');
  } finally { disposeAuthoredCat(kitten); }
});

test('the skinned volume remains tappable around the full camera orbit and has an actual blink morph', async () => {
  const kitten = createAuthoredCat(await parse()), parent = rootFor(kitten);
  try {
    syncAuthoredCat(kitten, 0, 0, true); parent.updateMatrixWorld(true);
    const center = new THREE.Vector3(CAT_X, CAT_GROUND + 1, CAT_Z);
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2, origin = center.clone().add(new THREE.Vector3(Math.sin(angle) * 5, 0, Math.cos(angle) * 5));
      assert.ok(new THREE.Raycaster(origin, center.clone().sub(origin).normalize()).intersectObject(kitten.group, true).length > 0);
    }
    const mesh = kitten.meshes[0], index = mesh.morphTargetDictionary.Blink;
    assert.equal(index, 0); assert.ok(catBlink(4.45) > 0.99); assert.equal(catBlink(5), 0);
    assert.ok(mesh.geometry.morphAttributes.position[0].array.some((value, i) => Math.abs(value - mesh.geometry.attributes.position.array[i]) > 0.01));
  } finally { disposeAuthoredCat(kitten); }
});

test('paused clocks do not catch up and reduced motion resets a grounded idle without animation drift', async () => {
  for (const delta of [0.016, 2, 200, NaN, Infinity]) assert.equal(advanceCatClock(10, delta, false), 10);
  assert.equal(advanceCatClock(10, 100, true), 10.05);
  const kitten = createAuthoredCat(await parse()), contact = createCatGroundContact(), parent = rootFor(kitten);
  try {
    for (let time = 0; time < 5; time += 0.05) syncAuthoredCat(kitten, time, 0.05, false, contact);
    let still;
    for (const time of [0, 10, 100, 1000]) {
      syncAuthoredCat(kitten, time, 0.05, true, contact); parent.updateMatrixWorld(true);
      const pose = kitten.feet.map(bone => bone.matrixWorld.toArray());
      if (still) assert.deepEqual(pose, still); else still = pose;
      assert.deepEqual(contact.position, [CAT_X, CAT_Z]); assert.equal(kitten.walkWeight, 0);
      assert.equal(kitten.meshes[0].morphTargetInfluences[0], 0);
    }
  } finally { disposeAuthoredCat(kitten); }
});
