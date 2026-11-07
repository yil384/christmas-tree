import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

// Load the real scene helpers and geometry, using the same Node 20-compatible
// transpilation as the tree tests. No renderer, DOM, or copied picking math.
const paths = ['scene/camera-framing.ts', 'lib/hand-types.ts', 'scene/hand-scene.ts',
  'scene/tree-profile.ts', 'scene/photo-material.ts', 'scene/HandMagic.tsx'];
const sources = await Promise.all(paths.map(path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')));
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const resolveImports = (code, aliases = {}) => code.replace(/from\s+(['"])([^'"]+)\1/g,
  (_match, _quote, name) => `from ${JSON.stringify(aliases[name] ?? import.meta.resolve(name))}`);
const framingUrl = moduleUrl(compile(sources[0]));
const { getCameraFraming } = await import(framingUrl);
const { createHandSceneInput } = await import(moduleUrl(compile(sources[1])));
const { createHandCameraController, createHandPhotoPicker, consumeHandPhotoSelection, clearHandSceneInput } = await import(
  moduleUrl(resolveImports(compile(sources[2]), { './camera-framing': framingUrl })),
);
const profileUrl = moduleUrl(compile(sources[3]));
const { DEFAULT_CAMERA_TARGET_Y } = await import(profileUrl);
const { createPrintGeometry } = await import(moduleUrl(resolveImports(compile(sources[4]))));
const { createMagicParticles } = await import(moduleUrl(resolveImports(
  compile(`${sources[5]}\nexport { createMagicParticles };`), { './tree-profile': profileUrl },
)));

function cameraFixture() {
  const limits = getCameraFraming(1440, 900, 45);
  const target = new THREE.Vector3(0, DEFAULT_CAMERA_TARGET_Y, 0);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 500);
  const start = new THREE.Spherical(limits.defaultDistance, Math.acos(0.09), 0);
  camera.position.setFromSpherical(start).add(target);
  camera.lookAt(target);
  const controller = createHandCameraController();
  const input = createHandSceneInput();
  input.enabled = true;
  const tick = () => controller.update(input, camera, target, limits, 1 / 60, true);
  const settle = () => { for (let frame = 0; frame < 90; frame++) tick(); };
  const position = () => new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
  return { limits, camera, start, controller, input, tick, settle, position };
}

test('hand camera deltas are consumed in one frame', () => {
  const fixture = cameraFixture();
  Object.assign(fixture.input, { orbitX: 0.08, orbitY: -0.03, zoomLog: Math.log(1.1) });
  fixture.tick();
  assert.deepEqual([fixture.input.orbitX, fixture.input.orbitY, fixture.input.zoomLog], [0, 0, 0]);
});

test('horizontal hand travel retains its complete rotation after easing', () => {
  const fixture = cameraFixture();
  fixture.input.orbitX = 0.08;
  fixture.settle();
  assert.ok(Math.abs(fixture.position().theta + 0.24) < 0.00001);
});

test('vertical hand travel retains its complete rotation after easing', () => {
  const fixture = cameraFixture();
  fixture.input.orbitY = -0.03;
  fixture.settle();
  assert.ok(Math.abs(fixture.position().phi - fixture.start.phi - 0.03) < 0.00001);
});

test('logarithmic zoom retains its complete scale after easing', () => {
  const fixture = cameraFixture();
  fixture.input.zoomLog = Math.log(1.1);
  fixture.settle();
  assert.ok(Math.abs(fixture.position().radius / fixture.start.radius - 1.1) < 0.00001);
});

test('repeated hand zoom cannot leave the existing camera distance limits', () => {
  const fixture = cameraFixture();
  for (const direction of [-1, 1]) {
    for (let frame = 0; frame < 60; frame++) {
      fixture.input.zoomLog = direction;
      fixture.tick();
      const { radius } = fixture.position();
      assert.ok(radius >= fixture.limits.minDistance - 1e-8 && radius <= fixture.limits.maxDistance + 1e-8);
    }
  }
});

test('repeated hand orbit cannot leave the existing camera polar limits', () => {
  const fixture = cameraFixture();
  for (const direction of [-1, 1]) {
    for (let frame = 0; frame < 60; frame++) {
      fixture.input.orbitY = direction;
      fixture.tick();
      const { phi } = fixture.position();
      assert.ok(phi >= fixture.limits.minPolarAngle - 1e-8 && phi <= fixture.limits.maxPolarAngle + 1e-8);
    }
  }
});

test('disabled camera input clears movement, hover and selection but preserves the magic sequence', () => {
  const fixture = cameraFixture();
  Object.assign(fixture.input, {
    enabled: false, orbitX: 0.5, orbitY: 0.1, zoomLog: 0.2, cursor: { x: 0.5, y: 0.5 },
    hoveredPhoto: 17, hoveredAt: 50, lastInputAt: 50, magic: 3,
    selectionRequest: { cursor: { x: 0.5, y: 0.5 }, requestedAt: 50 },
  });
  fixture.tick();
  assert.deepEqual(fixture.input, { ...createHandSceneInput(), magic: 3 });
});

test('disabling hands cancels the easing tail before the next activation', () => {
  const fixture = cameraFixture();
  fixture.input.orbitX = 0.5;
  fixture.tick();
  fixture.input.enabled = false;
  fixture.tick();
  const stopped = fixture.camera.position.clone();
  fixture.input.enabled = true;
  fixture.settle();
  assert.ok(fixture.camera.position.equals(stopped));
});

test('nonfinite hand deltas cannot corrupt the camera', () => {
  const fixture = cameraFixture();
  Object.assign(fixture.input, { orbitX: NaN, orbitY: Infinity, zoomLog: -Infinity });
  assert.equal(fixture.tick(), false);
  assert.ok(fixture.camera.position.toArray().every(Number.isFinite));
});

function photoFixture(t) {
  const geometry = createPrintGeometry();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, 3);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 75);
  const parent = new THREE.Group();
  parent.position.y = -6;
  parent.add(mesh);
  const matrix = new THREE.Matrix4();
  const place = (index, x, y, z) => mesh.setMatrixAt(index, matrix.makeTranslation(x, y, z));
  place(0, 0, 0, 0); place(1, 0, 0, -3); place(2, 3, 0, 0);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 500);
  camera.position.set(0, -6, 20);
  camera.lookAt(0, -6, 0);
  camera.updateMatrixWorld();
  const cursor = (x, y = -6.15, z = 0) => {
    const projected = new THREE.Vector3(x, y, z).project(camera);
    return { x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 };
  };
  const picker = createHandPhotoPicker();
  const pick = (pointer, occluders = []) => picker(mesh, camera, pointer, [5, 17], occluders);
  t.after(() => { geometry.dispose(); material.dispose(); mesh.dispose(); });
  return { parent, mesh, camera, place, cursor, pick };
}

test('the nearest real paper triangle returns its original album index', t => {
  const fixture = photoFixture(t);
  assert.equal(fixture.pick(fixture.cursor(0)), 5);
});

test('photo selection follows updated instance transforms', t => {
  const fixture = photoFixture(t);
  fixture.place(0, 0, 0, -4); fixture.place(1, 0, 0, 0);
  assert.equal(fixture.pick(fixture.cursor(0)), 17);
});

test('a repeated atlas slot maps to the original photograph', t => {
  const fixture = photoFixture(t);
  assert.equal(fixture.pick(fixture.cursor(3)), 5);
});

test('wooden pegs do not become selectable photographs', t => {
  const fixture = photoFixture(t);
  assert.equal(fixture.pick(fixture.cursor(0, -5.28, 0.09)), null);
});

test('empty space does not invent a photo hit', t => {
  assert.equal(photoFixture(t).pick({ x: 0, y: 0 }), null);
});

test('invalid and outside cursors do not select edge photographs', t => {
  const fixture = photoFixture(t);
  assert.equal(fixture.pick({ x: NaN, y: 0.5 }), null);
  assert.equal(fixture.pick({ x: 1.1, y: 0.5 }), null);
});

test('photo picking refreshes rotated parent, moving instance and camera matrices', t => {
  const fixture = photoFixture(t);
  fixture.parent.position.set(2, -4, 1);
  fixture.parent.rotation.y = 1.02;
  fixture.place(0, -1, 2, 1); fixture.place(1, 20, 0, -4); fixture.place(2, -20, 0, -4);
  const target = new THREE.Vector3(-1, 1.85, 1).applyQuaternion(fixture.parent.quaternion).add(fixture.parent.position);
  fixture.camera.position.set(2, -4, 20);
  fixture.camera.lookAt(target);
  assert.equal(fixture.pick({ x: 0.5, y: 0.5 }), 5);
});

function blockerFixture(t, position) {
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial());
  blocker.position.copy(position);
  t.after(() => { blocker.geometry.dispose(); blocker.material.dispose(); });
  return blocker;
}

test('a nearer opaque surface blocks hidden paper', t => {
  const fixture = photoFixture(t);
  const blocker = blockerFixture(t, new THREE.Vector3(0, -6, 10));
  assert.equal(fixture.pick(fixture.cursor(0), [blocker]), null);
});

test('a surface behind a photograph does not block its selection', t => {
  const fixture = photoFixture(t);
  const blocker = blockerFixture(t, new THREE.Vector3(0, -6, -6));
  assert.equal(fixture.pick(fixture.cursor(0), [blocker]), 5);
});

test('the back paper surface remains selectable', t => {
  const fixture = photoFixture(t);
  fixture.place(1, 20, 0, -4); fixture.place(2, -20, 0, -4);
  fixture.camera.position.set(0, -6, -20);
  fixture.camera.lookAt(0, -6.15, 0);
  assert.equal(fixture.pick({ x: 0.5, y: 0.5 }), 5);
});

test('magic uses one small points batch and starts with no draw', () => {
  const points = createMagicParticles();
  try {
    assert.ok(points.isPoints && !Array.isArray(points.material));
    assert.ok(points.geometry.getAttribute('position').count >= 80 && points.geometry.getAttribute('position').count <= 120);
    assert.equal(points.visible, false);
  } finally { points.geometry.dispose(); points.material.dispose(); }
});

test('magic particle attributes are finite and cover the same pool', () => {
  const points = createMagicParticles();
  try {
    const count = points.geometry.getAttribute('position').count;
    for (const attribute of Object.values(points.geometry.attributes)) {
      assert.equal(attribute.count, count);
      assert.ok(Array.from(attribute.array).every(Number.isFinite));
    }
  } finally { points.geometry.dispose(); points.material.dispose(); }
});

test('queued selection uses its anchored cursor even when current cursor and fresh hover change', t => {
  const fixture = photoFixture(t);
  fixture.place(0, -2, 0, 0); fixture.place(1, 2, 0, 0); fixture.place(2, 20, 0, 0);
  const input = createHandSceneInput();
  input.enabled = true;
  input.selectionRequest = { cursor: fixture.cursor(-2), requestedAt: 1000 };
  input.cursor = fixture.cursor(2);
  input.hoveredPhoto = 17;
  input.hoveredAt = 1020;
  assert.equal(consumeHandPhotoSelection(input, true, 1050, fixture.pick), 5);
  assert.equal(input.hoveredPhoto, 5);
  assert.equal(input.hoveredAt, 1050);
});

test('queued selection raycasts current geometry instead of reusing a recent hover', t => {
  const fixture = photoFixture(t);
  const input = createHandSceneInput();
  input.enabled = true;
  input.selectionRequest = { cursor: fixture.cursor(0), requestedAt: 1000 };
  input.hoveredPhoto = 5;
  input.hoveredAt = 1000;
  fixture.place(0, 12, 0, 0); fixture.place(1, 0, 0, 0);
  assert.equal(consumeHandPhotoSelection(input, true, 1020, fixture.pick), 17);
});

test('a queued photo selection is consumed only once', t => {
  const fixture = photoFixture(t);
  const input = createHandSceneInput();
  input.enabled = true;
  input.selectionRequest = { cursor: fixture.cursor(0), requestedAt: 1000 };
  let calls = 0;
  const pick = cursor => { calls++; return fixture.pick(cursor); };
  assert.equal(consumeHandPhotoSelection(input, true, 1010, pick), 5);
  assert.equal(input.selectionRequest, null);
  assert.equal(consumeHandPhotoSelection(input, true, 1020, pick), undefined);
  assert.equal(calls, 1);
});

test('expired selection returns a miss without raycasting an old pointer', () => {
  const input = createHandSceneInput();
  input.enabled = true;
  input.selectionRequest = { cursor: { x: 0.5, y: 0.5 }, requestedAt: 1000 };
  input.hoveredPhoto = 17;
  let called = false;
  assert.equal(consumeHandPhotoSelection(input, true, 1501, () => { called = true; return 17; }), null);
  assert.equal(called, false);
  assert.equal(input.hoveredPhoto, null);
  assert.equal(input.hoveredAt, 1501);
});

test('the 500 ms selection boundary is accepted even without a current pointer', t => {
  const fixture = photoFixture(t);
  const input = createHandSceneInput();
  input.enabled = true;
  input.selectionRequest = { cursor: fixture.cursor(0), requestedAt: 1000 };
  assert.equal(input.cursor, null);
  assert.equal(consumeHandPhotoSelection(input, true, 1500, fixture.pick), 5);
});

test('hidden or disabled scenes cancel pending selections without a callback result', () => {
  for (const [active, enabled] of [[false, true], [true, false]]) {
    const input = createHandSceneInput();
    Object.assign(input, { enabled, hoveredPhoto: 17, hoveredAt: 1000,
      selectionRequest: { cursor: { x: 0.5, y: 0.5 }, requestedAt: 1000 } });
    let called = false;
    assert.equal(consumeHandPhotoSelection(input, active, 1010, () => { called = true; return 17; }), undefined);
    assert.equal(called, false);
    assert.equal(input.selectionRequest, null);
    assert.equal(input.hoveredPhoto, null);
    assert.equal(input.hoveredAt, 0);
  }
});

test('clearing a cancelled hand session removes its queued selection', () => {
  const input = createHandSceneInput();
  input.enabled = true;
  input.selectionRequest = { cursor: { x: 0.5, y: 0.5 }, requestedAt: 1000 };
  clearHandSceneInput(input);
  assert.equal(input.selectionRequest, null);
  assert.equal(consumeHandPhotoSelection(input, true, 1010, () => assert.fail('Cancelled request was replayed')), undefined);
});
