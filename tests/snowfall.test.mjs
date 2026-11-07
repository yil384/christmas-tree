import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

// Exercise the actual world-particle simulation without requiring WebGL.
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const profileUrl = moduleUrl(compile(await readFile(new URL('../src/scene/tree-profile.ts', import.meta.url), 'utf8')));
const { GROUND_Y, DEFAULT_CAMERA_TARGET_Y } = await import(profileUrl);
const { getCameraFraming } = await import(moduleUrl(compile(await readFile(new URL('../src/scene/camera-framing.ts', import.meta.url), 'utf8'))));
const source = compile(await readFile(new URL('../src/scene/Snowfall.ts', import.meta.url), 'utf8'));
const moduleCode = source.replace(/from\s+(['"])([^'"]+)\1/g,
  (_match, _quote, name) => `from ${JSON.stringify(name === './tree-profile' ? profileUrl : import.meta.resolve(name))}`);
const { createSnow } = await import(moduleUrl(moduleCode));
const target = new THREE.Vector3(0, DEFAULT_CAMERA_TARGET_Y, 0);

function cameraAt(camera, distance, polar, azimuth) {
  camera.position.setFromSphericalCoords(distance, polar, azimuth).add(target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

function inspect(snow, camera) {
  const positions = snow.points.geometry.getAttribute('position');
  const point = new THREE.Vector3();
  const view = new THREE.Vector3();
  const result = { visible: 0, foreground: 0, background: 0, edges: [0, 0, 0, 0] };
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    assert.ok(point.toArray().every(Number.isFinite), 'A snow position is invalid');
    assert.ok(point.y >= GROUND_Y, 'Snow has continued falling underneath the ground');
    const depth = -view.copy(point).applyMatrix4(camera.matrixWorldInverse).z;
    if (depth < 18) result.foreground++;
    if (depth > 35) result.background++;
    point.project(camera);
    if (Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && point.z >= -1 && point.z <= 1) {
      result.visible++;
      if (point.x < -0.7) result.edges[0]++;
      if (point.x > 0.7) result.edges[1]++;
      if (point.y < -0.7) result.edges[2]++;
      if (point.y > 0.7) result.edges[3]++;
    }
  }
  return result;
}

for (const [width, height] of [[320, 812], [390, 844], [768, 1024], [1440, 900], [2400, 600]]) {
  test(`snow covers the ${width} × ${height} viewport after zoom and orbit extremes`, () => {
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    const limits = getCameraFraming(width, height);
    const snow = createSnow(width < 700);
    const originalCount = snow.points.geometry.getAttribute('position').count;
    try {
      // Reuse the same pool while moving the camera. Recreating it for each
      // position would hide the original empty-border regression on dolly out.
      for (const polar of [limits.minPolarAngle, limits.maxPolarAngle]) {
        for (const azimuth of [0, 0.7, Math.PI, Math.PI * 1.8]) {
          for (const distance of [limits.minDistance, limits.maxDistance, limits.defaultDistance]) {
            cameraAt(camera, distance, polar, azimuth);
            for (let frame = 0; frame < 30; frame++) snow.update(camera, width, height, 1, 1 / 60);
            const result = inspect(snow, camera);
            const context = `distance ${distance.toFixed(2)}, polar ${polar}, azimuth ${azimuth.toFixed(2)}`;
            assert.ok(result.edges.every(count => count > 0), `An edge has lost snow at ${context}: ${result.edges}`);
            assert.ok(result.visible > originalCount / 3, `Most of the volume has left the view at ${context}`);
            assert.ok(result.foreground > 0 && result.background > 0, `Snow has collapsed to one depth at ${context}`);
            assert.equal(snow.points.geometry.getAttribute('position').count, originalCount, 'Camera movement grew the particle pool');
          }
        }
      }
    } finally {
      snow.dispose();
    }
  });
}

test('reduced motion freezes falling while a resize still fills the new view', () => {
  const camera = new THREE.PerspectiveCamera(45, 390 / 844, 0.1, 500);
  const snow = createSnow(true);
  const limits = getCameraFraming(390, 844);
  try {
    cameraAt(camera, limits.defaultDistance, limits.maxPolarAngle, 0);
    snow.update(camera, 390, 844, 1, 0);
    const positions = snow.points.geometry.getAttribute('position');
    const frozen = positions.array.slice();
    for (let frame = 0; frame < 20; frame++) snow.update(camera, 390, 844, 1, 0);
    assert.deepEqual(positions.array, frozen, 'Stationary reduced-motion frames moved the snow');

    camera.aspect = 2400 / 600;
    camera.updateProjectionMatrix();
    const wide = getCameraFraming(2400, 600);
    cameraAt(camera, wide.maxDistance, wide.minPolarAngle, Math.PI / 2);
    snow.update(camera, 2400, 600, 1, 0);
    const result = inspect(snow, camera);
    assert.ok(result.edges.every(count => count > 0), 'Frozen snow failed to refill after a viewport change');
    assert.ok(result.foreground > 0 && result.background > 0);

    const beforeFalling = positions.array.slice();
    snow.update(camera, 2400, 600, 1, 1 / 30);
    let falling = 0;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) < beforeFalling[i * 3 + 1]) falling++;
    }
    assert.ok(falling > positions.count * 0.8, 'Normal motion did not resume physical downward falling');
  } finally {
    snow.dispose();
  }
});
