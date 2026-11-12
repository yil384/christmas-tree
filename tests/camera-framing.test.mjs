import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = text => `data:text/javascript;base64,${Buffer.from(compile(text)).toString('base64')}`;
const { getCameraFraming, clampCameraDistance, CAMERA_ZOOM_LIMITS, setCameraOpticalZoom } = await import(url(await readFile(new URL('../src/scene/camera-framing.ts', import.meta.url), 'utf8')));
const { GROUND_Y, TREE_OFFSET_Y, TRUNK_BOTTOM, DEFAULT_CAMERA_TARGET_Y } = await import(url(await readFile(new URL('../src/scene/tree-profile.ts', import.meta.url), 'utf8')));

test('closest framing keeps the star, trunk and hanging-card envelope on screen in portrait and landscape', () => {
  for (const [width, height] of [[390, 844], [844, 390], [1440, 900], [280, 900], [2560, 1080]]) {
    const limits = getCameraFraming(width, height);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    const distance = limits.minDistance;
    camera.position.set(0, DEFAULT_CAMERA_TARGET_Y + distance * 0.09, distance * Math.sqrt(1 - 0.09 ** 2));
    camera.lookAt(0, DEFAULT_CAMERA_TARGET_Y, 0);
    camera.updateMatrixWorld();
    const points = [new THREE.Vector3(0, GROUND_Y, 0), new THREE.Vector3(0, 8.2, 0)];
    for (let i = 0; i < 36; i++) {
      const angle = i / 36 * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * 10.6, -15.5, Math.sin(angle) * 10.6));
    }
    for (const point of points) {
      const ndc = point.project(camera);
      assert.ok(Math.abs(ndc.x) < 0.98 && Math.abs(ndc.y) < 0.98, `${width}x${height}: cropped ${ndc.toArray()}`);
    }
    assert.ok(limits.minDistance < limits.defaultDistance && limits.defaultDistance < limits.maxDistance);
    assert.ok(limits.maxDistance / limits.minDistance <= 1.4, 'Dolly range leaves the tree as a distant speck');
    for (const requested of [-10000, 0, 1, 1e6, Infinity, NaN]) {
      const value = clampCameraDistance(requested, limits.minDistance, limits.maxDistance);
      assert.ok(Number.isFinite(value) && value >= limits.minDistance && value <= limits.maxDistance);
    }
  }
});

test('the physical stem penetrates the common snow surface with a shallow contact', () => {
  const rootWorldY = TRUNK_BOTTOM + TREE_OFFSET_Y;
  assert.ok(rootWorldY < GROUND_Y && GROUND_Y - rootWorldY < 0.25);
});

test('optical close-up enlarges foreground photos and distant castle by the same ratio without moving the camera', () => {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    const target = new THREE.Vector3(0, DEFAULT_CAMERA_TARGET_Y, 0);
    const distance = getCameraFraming(width, height).defaultDistance;
    camera.position.set(0, DEFAULT_CAMERA_TARGET_Y + distance * 0.09, distance * Math.sqrt(1 - 0.09 ** 2));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const beforePosition = camera.position.clone();
    const points = [new THREE.Vector3(2, -5, 8), new THREE.Vector3(16, 7, -120), new THREE.Vector3(1, GROUND_Y, 0)];
    const initial = points.map(point => point.clone().project(camera));
    setCameraOpticalZoom(camera, 4);
    points.forEach((point, index) => {
      const magnified = point.clone().project(camera);
      assert.ok(Math.abs(magnified.x - initial[index].x * 4) < 1e-10);
      assert.ok(Math.abs(magnified.y - initial[index].y * 4) < 1e-10);
    });
    assert.ok(camera.position.equals(beforePosition), 'zoom must not dolly closer to the tree');
    assert.equal(camera.fov, 45, 'background placement keeps its original reference FOV');
    assert.ok(camera.getEffectiveFOV() < 12, 'the close view must be meaningfully larger');
    for (const value of [-1000, 0, 1e6, Infinity, NaN]) {
      const zoom = setCameraOpticalZoom(camera, value);
      assert.ok(Number.isFinite(zoom) && zoom >= CAMERA_ZOOM_LIMITS.min && zoom <= CAMERA_ZOOM_LIMITS.max);
    }
  }
});
