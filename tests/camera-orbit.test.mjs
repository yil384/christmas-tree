import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const source = await readFile(new URL('../src/scene/camera-orbit.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  fileName: 'camera-orbit.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const executable = outputText.replace(/from\s+(['"])three\1/g, `from ${JSON.stringify(import.meta.resolve('three'))}`);
const {
  advanceCameraOrbit, CAMERA_ORBIT_RADIANS_PER_SECOND, CAMERA_ORBIT_PERIOD_SECONDS,
  createCameraArcController, CAMERA_ARC_PERIOD_SECONDS, PERSPECTIVE_CAMERA_LIMITS,
} = await import('data:text/javascript;base64,' + Buffer.from(executable).toString('base64'));

function setup() {
  const target = new THREE.Vector3(3, -7, -2);
  const camera = new THREE.PerspectiveCamera(45, 9 / 16, 0.1, 500);
  camera.position.copy(target).add(new THREE.Vector3(18, 7, 30));
  camera.lookAt(target);
  return { camera, target };
}

function close(actual, expected, label, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${label}: expected ${expected}, received ${actual}`);
}

function orbitAngle(camera, target) {
  return Math.atan2(camera.position.z - target.z, camera.position.x - target.x);
}

function angularProgress(previous, next) {
  return Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
}

test('equal elapsed time has equal orbit angle at normal frame rates and irregular short frames', () => {
  const duration = 12;
  const outcomes = [];
  for (const fps of [20, 24, 30, 60, 120, 144]) {
    const { camera, target } = setup();
    let previousAngle = orbitAngle(camera, target);
    let progress = 0;
    for (let frame = 0; frame < fps * duration; frame++) {
      advanceCameraOrbit(camera, target, 1 / fps, true);
      const angle = orbitAngle(camera, target);
      progress += angularProgress(previousAngle, angle);
      previousAngle = angle;
    }
    close(progress, duration * CAMERA_ORBIT_RADIANS_PER_SECOND, `${fps} FPS angular progress`);
    outcomes.push(camera.position.clone());
  }
  const { camera, target } = setup();
  let elapsed = 0;
  const deltas = [1 / 144, 1 / 30, 0.05, 1 / 60, 1 / 90];
  for (let frame = 0; elapsed < duration; frame++) {
    const delta = Math.min(deltas[frame % deltas.length], duration - elapsed);
    advanceCameraOrbit(camera, target, delta, true);
    elapsed += delta;
  }
  for (const position of outcomes) assert.ok(camera.position.distanceTo(position) < 1e-10);
});

test('orbit with real OrbitControls preserves radius, height, target and world object transforms', () => {
  const { camera, target } = setup();
  const scene = new THREE.Scene();
  const tree = new THREE.Group();
  const ornament = new THREE.Object3D();
  const cat = new THREE.Object3D();
  tree.position.set(0, -11.8, 0);
  ornament.position.set(2, 9, -3);
  ornament.rotation.set(0.2, 0.4, -0.1);
  cat.position.set(9, -20.58, 4);
  tree.add(ornament);
  scene.add(tree, cat, camera);
  scene.updateMatrixWorld(true);
  const worldBefore = [tree, ornament, cat].map(object => object.matrixWorld.toArray());
  const targetBefore = target.clone();
  const heightBefore = camera.position.y;
  const radiusBefore = camera.position.distanceTo(target);
  const positionBefore = camera.position.clone();
  // No DOM element means no event listeners are connected in this numeric test.
  const controls = new OrbitControls(camera);
  controls.target.copy(target);
  controls.enableDamping = false;
  controls.dampingFactor = 0.06;
  controls.update();
  for (let frame = 0; frame < 1200; frame++) {
    advanceCameraOrbit(camera, controls.target, 1 / 60, true);
    controls.update(1 / 60);
  }
  assert.ok(camera.position.distanceTo(positionBefore) > 1, 'the camera must actually travel');
  close(camera.position.y, heightBefore, 'camera height');
  close(camera.position.distanceTo(target), radiusBefore, 'camera radius');
  assert.deepEqual(target.toArray(), targetBefore.toArray());
  assert.ok(controls.target.distanceTo(targetBefore) < 1e-12, 'OrbitControls must retain the look target');
  const expectedDirection = target.clone().sub(camera.position).normalize();
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(expectedDirection) < 1e-12);
  scene.updateMatrixWorld(true);
  assert.deepEqual([tree, ornament, cat].map(object => object.matrixWorld.toArray()), worldBefore);
});

test('one calm 120-second lap returns to the initial position', () => {
  const { camera, target } = setup();
  const start = camera.position.clone();
  assert.equal(CAMERA_ORBIT_PERIOD_SECONDS, 120);
  close(CAMERA_ORBIT_RADIANS_PER_SECOND, THREE.MathUtils.degToRad(3), 'constant angular speed');
  for (let frame = 0; frame < 120 * 30; frame++) advanceCameraOrbit(camera, target, 1 / 30, true);
  assert.ok(camera.position.distanceTo(start) < 1e-8);
});

test('the shared camera keeps the same direction and speed through more than three complete turns', t => {
  const { camera, target } = setup();
  const controls = new OrbitControls(camera, pointerSurface());
  controls.target.copy(target);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.update();
  t.after(() => controls.dispose());
  const delta = 1 / 60;
  const duration = 390;
  let previousAngle = orbitAngle(camera, target);
  let progress = 0;
  let seamCrossings = 0;
  for (let frame = 0; frame < duration / delta; frame++) {
    advanceCameraOrbit(camera, controls.target, delta, true);
    controls.update(delta);
    const angle = orbitAngle(camera, target);
    if (angle < previousAngle) seamCrossings++;
    const step = angularProgress(previousAngle, angle);
    assert.ok(step > 0, `automatic motion reversed or stopped at frame ${frame}`);
    close(step, THREE.MathUtils.degToRad(3) * delta, `frame ${frame} angular step`, 1e-12);
    progress += step;
    previousAngle = angle;
  }
  assert.ok(seamCrossings >= 3, 'the test must cross the ±π angle boundary repeatedly');
  close(progress, THREE.MathUtils.degToRad(1170), 'unwrapped total rotation', 1e-9);
});

test('the continuous orbit resumes from any manually chosen side without snapping or changing direction', () => {
  for (const angle of [-Math.PI + 0.0001, -1.2, 0, 1.2, Math.PI - 0.0001]) {
    const { camera, target } = setup();
    camera.position.setFromSpherical(new THREE.Spherical(64, 1.5, angle)).add(target);
    camera.lookAt(target);
    const position = camera.position.clone();
    const rotation = camera.quaternion.clone();
    const previousAngle = orbitAngle(camera, target);
    for (const delta of [1 / 30, 1, 60, 600]) advanceCameraOrbit(camera, target, delta, false);
    assert.deepEqual(camera.position.toArray(), position.toArray());
    assert.deepEqual(camera.quaternion.toArray(), rotation.toArray());
    advanceCameraOrbit(camera, target, 1 / 60, true);
    close(angularProgress(previousAngle, orbitAngle(camera, target)), THREE.MathUtils.degToRad(0.05), 'resume step');
    close(camera.position.y, position.y, 'chosen camera height');
    close(camera.position.distanceTo(target), 64, 'chosen camera radius');
    assert.ok(camera.position.distanceTo(position) < 0.23, 'resume starts at the chosen view without a phase reset');
  }
});

test('the disabled gate used for pause, reduced motion and inactive views freezes pose without catch-up', () => {
  const { camera, target } = setup();
  const start = camera.position.clone();
  const rotation = camera.quaternion.clone();
  for (let frame = 0; frame < 600; frame++) advanceCameraOrbit(camera, target, 1 / 30, false);
  assert.deepEqual(camera.position.toArray(), start.toArray());
  assert.deepEqual(camera.quaternion.toArray(), rotation.toArray());
  const fresh = setup();
  advanceCameraOrbit(fresh.camera, fresh.target, 1 / 60, true);
  advanceCameraOrbit(camera, target, 1 / 60, true);
  assert.deepEqual(camera.position.toArray(), fresh.camera.position.toArray());
  assert.deepEqual(camera.quaternion.toArray(), fresh.camera.quaternion.toArray());
});

test('invalid and nonpositive frame deltas leave camera and target untouched', () => {
  const { camera, target } = setup();
  const start = camera.position.clone();
  const rotation = camera.quaternion.clone();
  const originalTarget = target.clone();
  for (const delta of [NaN, Infinity, -Infinity, 0, -0, -1]) {
    advanceCameraOrbit(camera, target, delta, true);
    assert.deepEqual(camera.position.toArray(), start.toArray());
    assert.deepEqual(camera.quaternion.toArray(), rotation.toArray());
    assert.deepEqual(target.toArray(), originalTarget.toArray());
  }
});

test('a stalled frame advances by at most 50 ms instead of jumping around the tree', () => {
  const expected = setup();
  advanceCameraOrbit(expected.camera, expected.target, 0.05, true);
  for (const delta of [0.1, 1, 60, Number.MAX_VALUE]) {
    const { camera, target } = setup();
    advanceCameraOrbit(camera, target, delta, true);
    assert.deepEqual(camera.position.toArray(), expected.camera.position.toArray());
    assert.deepEqual(camera.quaternion.toArray(), expected.camera.quaternion.toArray());
  }
});

function arcSetup(angle = 0) {
  const target = new THREE.Vector3(3, -7, -2);
  const camera = new THREE.PerspectiveCamera(45, 9 / 16, 0.1, 500);
  camera.position.setFromSpherical(new THREE.Spherical(52, Math.acos(0.09), angle)).add(target);
  camera.lookAt(target);
  const controller = createCameraArcController();
  const azimuth = () => Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
  const step = (delta, enabled = true) => controller.update(camera, target, delta, enabled);
  const run = (seconds, deltas = [1 / 60]) => {
    let elapsed = 0;
    for (let frame = 0; elapsed < seconds; frame++) {
      const delta = Math.min(deltas[frame % deltas.length], seconds - elapsed);
      step(delta);
      elapsed += delta;
    }
  };
  return { target, camera, controller, azimuth, step, run };
}

test('the perspective arc stays within eight degrees over repeated cycles and returns to its initial pose', () => {
  const fixture = arcSetup();
  const start = fixture.camera.position.clone();
  const { minAzimuthAngle, maxAzimuthAngle } = PERSPECTIVE_CAMERA_LIMITS;
  close(maxAzimuthAngle, 8 * Math.PI / 180, 'maximum perspective angle');
  close(minAzimuthAngle, -maxAzimuthAngle, 'minimum perspective angle');
  let smallest = Infinity;
  let largest = -Infinity;
  for (let frame = 0; frame < CAMERA_ARC_PERIOD_SECONDS * 3 * 60; frame++) {
    fixture.step(1 / 60);
    const angle = fixture.azimuth();
    smallest = Math.min(smallest, angle);
    largest = Math.max(largest, angle);
    assert.ok(angle >= minAzimuthAngle - 1e-12 && angle <= maxAzimuthAngle + 1e-12);
  }
  close(smallest, minAzimuthAngle, 'leftmost view', 1e-8);
  close(largest, maxAzimuthAngle, 'rightmost view', 1e-8);
  assert.ok(fixture.camera.position.distanceTo(start) < 1e-8);
});

test('the perspective arc slows to a smooth turn rather than bouncing at its limit', () => {
  const fixture = arcSetup();
  const delta = 1 / 60;
  fixture.step(delta);
  const middleStep = Math.abs(fixture.azimuth());
  fixture.run(CAMERA_ARC_PERIOD_SECONDS / 4 - 3 * delta);
  const angles = [fixture.azimuth()];
  for (let frame = 0; frame < 4; frame++) {
    fixture.step(delta);
    angles.push(fixture.azimuth());
  }
  const changes = angles.slice(1).map((angle, index) => angle - angles[index]);
  assert.ok(changes[0] > 0 && changes[1] > 0, 'the camera approaches the end of its arc');
  assert.ok(changes[2] < 0 && changes[3] < 0, 'the camera returns along the same arc');
  assert.ok(changes.every(change => Math.abs(change) < middleStep * 0.01), 'speed eases almost to zero before reversing');
  close(angles[2], PERSPECTIVE_CAMERA_LIMITS.maxAzimuthAngle, 'turning point', 1e-9);
});

test('the perspective arc reaches the same pose at equal elapsed time across frame rates', () => {
  const duration = CAMERA_ARC_PERIOD_SECONDS * 0.57;
  const reference = arcSetup(-0.047);
  reference.run(duration);
  for (const deltas of [[1 / 20], [1 / 30], [1 / 120], [1 / 144], [1 / 144, 0.04, 1 / 60, 1 / 90]]) {
    const fixture = arcSetup(-0.047);
    fixture.run(duration, deltas);
    assert.ok(fixture.camera.position.distanceTo(reference.camera.position) < 1e-8, `frame deltas ${deltas}`);
    assert.ok(fixture.camera.quaternion.angleTo(reference.camera.quaternion) < 1e-7);
  }
});

test('pausing the perspective arc freezes its pose and resumes without elapsed-time catch-up', () => {
  const reference = arcSetup();
  const fixture = arcSetup();
  reference.run(18);
  fixture.run(18);
  const position = fixture.camera.position.toArray();
  const rotation = fixture.camera.quaternion.toArray();
  for (const delta of [1 / 30, 1, 60, 600]) {
    fixture.step(delta, false);
    assert.deepEqual(fixture.camera.position.toArray(), position);
    assert.deepEqual(fixture.camera.quaternion.toArray(), rotation);
  }
  reference.step(1 / 60);
  fixture.step(1 / 60);
  assert.deepEqual(fixture.camera.position.toArray(), reference.camera.position.toArray());
  assert.deepEqual(fixture.camera.quaternion.toArray(), reference.camera.quaternion.toArray());
});

test('the perspective arc resumes from a manually chosen pose without snapping or reversing its travel', () => {
  const fixture = arcSetup();
  // Past the first turn, the camera is already travelling toward the left.
  fixture.run(CAMERA_ARC_PERIOD_SECONDS * 0.4);
  const chosenAngle = -0.04;
  fixture.camera.position.setFromSpherical(new THREE.Spherical(64, 1.5, chosenAngle)).add(fixture.target);
  fixture.camera.lookAt(fixture.target);
  fixture.step(0.5, false);
  const height = fixture.camera.position.y;
  fixture.step(1 / 60);
  assert.ok(fixture.azimuth() < chosenAngle, 'resume retains the previous travel direction');
  assert.ok(chosenAngle - fixture.azimuth() < 0.001, 'resume starts at the chosen pose without a phase jump');
  close(fixture.camera.position.y, height, 'chosen camera height');
  close(fixture.camera.position.distanceTo(fixture.target), 64, 'chosen camera radius');

  for (const boundary of [PERSPECTIVE_CAMERA_LIMITS.minAzimuthAngle, PERSPECTIVE_CAMERA_LIMITS.maxAzimuthAngle]) {
    fixture.camera.position.setFromSpherical(new THREE.Spherical(64, 1.5, boundary)).add(fixture.target);
    fixture.camera.lookAt(fixture.target);
    fixture.step(1, false);
    fixture.step(1 / 60);
    assert.ok(fixture.azimuth() > PERSPECTIVE_CAMERA_LIMITS.minAzimuthAngle);
    assert.ok(fixture.azimuth() < PERSPECTIVE_CAMERA_LIMITS.maxAzimuthAngle);
    assert.ok(Math.abs(fixture.azimuth() - boundary) < 0.001, 'a boundary pose eases back into the available view');
  }
});

test('the perspective arc and real OrbitControls preserve camera framing and stationary world transforms', () => {
  const fixture = arcSetup();
  const { camera, target } = fixture;
  const controls = new OrbitControls(camera);
  controls.target.copy(target);
  Object.assign(controls, PERSPECTIVE_CAMERA_LIMITS, { enableDamping: false, enablePan: false, minDistance: 40, maxDistance: 80 });
  controls.update();
  const scene = new THREE.Scene();
  const tree = new THREE.Group();
  const photo = new THREE.Object3D();
  const cat = new THREE.Object3D();
  tree.position.set(0, -6, 0);
  photo.position.set(2, 9, -3);
  photo.rotation.set(0.2, 0.4, -0.1);
  cat.position.set(9, -20.58, 4);
  tree.add(photo);
  scene.add(tree, cat, camera);
  scene.updateMatrixWorld(true);
  const worldBefore = [tree, photo, cat].map(object => object.matrixWorld.toArray());
  const targetBefore = target.toArray();
  const heightBefore = camera.position.y;
  const radiusBefore = camera.position.distanceTo(target);
  const start = camera.position.clone();
  let maxTravel = 0;
  for (let frame = 0; frame < 60 * 90; frame++) {
    fixture.step(1 / 60);
    controls.update(1 / 60);
    maxTravel = Math.max(maxTravel, camera.position.distanceTo(start));
    assert.ok(controls.getAzimuthalAngle() >= controls.minAzimuthAngle - 1e-12);
    assert.ok(controls.getAzimuthalAngle() <= controls.maxAzimuthAngle + 1e-12);
  }
  assert.ok(maxTravel > 1, 'the camera actually travels, even when complete cycles return to its initial position');
  close(camera.position.y, heightBefore, 'camera height', 1e-8);
  close(camera.position.distanceTo(target), radiusBefore, 'camera radius', 1e-8);
  assert.deepEqual(target.toArray(), targetBefore);
  assert.ok(controls.target.distanceTo(target) < 1e-12, 'OrbitControls retains the look target within floating-point precision');
  const expectedDirection = target.clone().sub(camera.position).normalize();
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(expectedDirection) < 1e-10);
  scene.updateMatrixWorld(true);
  assert.deepEqual([tree, photo, cat].map(object => object.matrixWorld.toArray()), worldBefore);
});

test('the compatible perspective arc makes a visible sweep within five seconds', () => {
  const fixture = arcSetup();
  fixture.run(5);
  const offset = fixture.camera.position.clone().sub(fixture.target);
  const angle = Math.abs(Math.atan2(offset.x, offset.z));
  assert.ok(angle >= THREE.MathUtils.degToRad(6), 'the initial camera movement is still barely visible');
  assert.ok(angle <= PERSPECTIVE_CAMERA_LIMITS.maxAzimuthAngle + 1e-12);
});

function pointerSurface() {
  const listeners = new Map();
  const root = { addEventListener() {}, removeEventListener() {} };
  return {
    clientWidth: 1440, clientHeight: 900, style: {},
    getRootNode: () => root,
    setPointerCapture() {}, releasePointerCapture() {},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, clientX, clientY = 0) {
      const event = { pointerId: 1, pointerType: 'mouse', button: 0, clientX, clientY, pageX: clientX, pageY: clientY };
      for (const listener of [...listeners.get(type) ?? []]) listener(event);
    },
  };
}

test('opposing pointer drags release without momentum and auto-resume keeps its one direction at different frame rates', t => {
  for (const fps of [20, 30, 60, 144]) {
    const { camera, target } = setup();
    const surface = pointerSurface();
    const controls = new OrbitControls(camera, surface);
    controls.target.copy(target);
    Object.assign(controls, { enableDamping: false, enablePan: false, rotateSpeed: 0.65 });
    controls.update();
    t.after(() => controls.dispose());
    const initialAngle = orbitAngle(camera, target);
    surface.emit('pointerdown', 0);
    surface.emit('pointermove', -400);
    const chosenAngle = orbitAngle(camera, target);
    assert.ok(angularProgress(initialAngle, chosenAngle) < 0, 'the manual drag opposes automatic travel');
    surface.emit('pointerup', -400);
    const releasedPosition = camera.position.clone();
    // This is the same 1.8-second release hold used by the live camera.
    for (let frame = 0; frame < Math.ceil(fps * 1.8); frame++) {
      advanceCameraOrbit(camera, controls.target, 1 / fps, false);
      controls.update(1 / fps);
    }
    assert.ok(camera.position.distanceTo(releasedPosition) < 1e-10, `${fps} FPS release has no residual momentum`);
    let previousAngle = orbitAngle(camera, target);
    for (let frame = 0; frame < fps * 2; frame++) {
      advanceCameraOrbit(camera, controls.target, 1 / fps, true);
      controls.update(1 / fps);
      const angle = orbitAngle(camera, target);
      const progress = angularProgress(previousAngle, angle);
      assert.ok(progress > 0, `${fps} FPS automatic travel reverses after release`);
      close(progress, THREE.MathUtils.degToRad(3) / fps, `${fps} FPS resumed speed`, 1e-12);
      previousAngle = angle;
    }
  }
});

test('pointer movement respects the same arc limits and reverses immediately without an outward damping tail', t => {
  const fixture = arcSetup();
  const surface = pointerSurface();
  const controls = new OrbitControls(fixture.camera, surface);
  controls.target.copy(fixture.target);
  Object.assign(controls, PERSPECTIVE_CAMERA_LIMITS, { enableDamping: false, enablePan: false, rotateSpeed: 0.28 });
  controls.update();
  t.after(() => controls.dispose());
  surface.emit('pointerdown', 0);
  surface.emit('pointermove', 1000);
  close(controls.getAzimuthalAngle(), controls.minAzimuthAngle, 'horizontal drag limit');
  surface.emit('pointermove', 3000);
  close(controls.getAzimuthalAngle(), controls.minAzimuthAngle, 'continued outward drag');
  surface.emit('pointermove', 2995);
  assert.ok(controls.getAzimuthalAngle() > controls.minAzimuthAngle, 'the first inward movement takes effect immediately');

  surface.emit('pointermove', 2995, 1000);
  close(controls.getPolarAngle(), controls.minPolarAngle, 'vertical drag limit');
  surface.emit('pointermove', 2995, 995);
  assert.ok(controls.getPolarAngle() > controls.minPolarAngle, 'vertical reversal has no outward residual');
  surface.emit('pointerup', 2995, 995);
  const stopped = fixture.camera.position.clone();
  for (let frame = 0; frame < 120; frame++) controls.update(1 / 60);
  assert.ok(fixture.camera.position.distanceTo(stopped) < 1e-10, 'no drag momentum remains after release');
});

test('invalid arc deltas leave pose and phase unchanged, and a stalled frame advances by at most 50 ms', () => {
  const fixture = arcSetup();
  const reference = arcSetup();
  fixture.run(9);
  reference.run(9);
  const position = fixture.camera.position.toArray();
  const rotation = fixture.camera.quaternion.toArray();
  for (const delta of [NaN, Infinity, -Infinity, 0, -0, -1]) {
    fixture.step(delta);
    assert.deepEqual(fixture.camera.position.toArray(), position);
    assert.deepEqual(fixture.camera.quaternion.toArray(), rotation);
  }
  fixture.step(1 / 60);
  reference.step(1 / 60);
  assert.deepEqual(fixture.camera.position.toArray(), reference.camera.position.toArray());

  const expected = arcSetup();
  expected.step(0.05);
  for (const delta of [0.1, 1, 60, Number.MAX_VALUE]) {
    const stalled = arcSetup();
    stalled.step(delta);
    assert.deepEqual(stalled.camera.position.toArray(), expected.camera.position.toArray());
    assert.deepEqual(stalled.camera.quaternion.toArray(), expected.camera.quaternion.toArray());
  }
});
