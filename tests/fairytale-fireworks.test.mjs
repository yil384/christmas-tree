import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const source = `${await readFile(new URL('../src/scene/FairytaleFireworks.tsx', import.meta.url), 'utf8')}
export { createFairytaleFireworks, syncFireworks, advanceFireworks, disposeFireworks };`;
const compiled = ts.transpileModule(source, {
  fileName: 'FairytaleFireworks.tsx',
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/from\s+(['"])([^'"]+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const { createFairytaleFireworks, syncFireworks, advanceFireworks, disposeFireworks } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
);
const framing = ts.transpileModule(await readFile(new URL('../src/scene/camera-framing.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { getCameraFraming } = await import(`data:text/javascript;base64,${Buffer.from(framing).toString('base64')}`);

const snapshot = fireworks => ({
  time: fireworks.time,
  position: Array.from(fireworks.points.geometry.getAttribute('position').array),
  alpha: Array.from(fireworks.points.geometry.getAttribute('aAlpha').array),
});

test('castle fireworks stay finite, bounded and depth-tested through repeated full cycles', () => {
  for (const compact of [false, true]) {
    const fireworks = createFairytaleFireworks(compact);
    try {
      const { points } = fireworks;
      assert.ok(points.isPoints && fireworks.particles.length < 700, 'Fireworks use one bounded Points draw');
      assert.equal(points.material.depthTest, true, 'The tree must occlude distant sparks');
      assert.equal(points.material.depthWrite, false);
      const matrix = points.matrixWorld.toArray();
      const position = points.geometry.getAttribute('position');
      const alpha = points.geometry.getAttribute('aAlpha');
      const bound = points.geometry.boundingSphere;
      for (let frame = 0; frame < 320; frame++) {
        advanceFireworks(fireworks, 0.05, true);
        for (let index = 0; index < position.count; index++) {
          const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
          assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
          assert.ok(Math.hypot(x - bound.center.x, y - bound.center.y, z - bound.center.z) <= bound.radius,
            'An animated spark escaped the culling bound');
          assert.ok(alpha.getX(index) >= 0 && alpha.getX(index) <= 1);
        }
      }
      assert.deepEqual(points.matrixWorld.toArray(), matrix, 'The firework sky must not rotate independently');
    } finally { disposeFireworks(fireworks); }
  }
});

test('a firework rises, expands, falls, then clears before its next launch', () => {
  const fireworks = createFairytaleFireworks(false);
  try {
    const geometry = fireworks.points.geometry;
    const launch = fireworks.particles.findIndex(p => p.burst === 0 && p.kind === 'launch');
    const spark = fireworks.particles.findIndex(p => p.burst === 0 && p.kind === 'spark' && p.velocity[1] > 14 && p.lag === 0);
    const at = time => {
      fireworks.time = time;
      syncFireworks(fireworks);
      return geometry.getAttribute('position');
    };
    const launchHeights = [0.15, 0.6, 1.1].map(time => at(time).getY(launch));
    assert.ok(launchHeights[0] < launchHeights[1] && launchHeights[1] < launchHeights[2]);
    const center = fireworks.centers[0];
    const expanded = at(2.45);
    const peak = expanded.getY(spark);
    assert.ok(peak > center.y + 4, 'The upward sparks must visibly open above their burst center');
    assert.ok(at(4.0).getY(spark) < peak - 6, 'Gravity must arc the sparks downward');
    at(4.55);
    const alpha = geometry.getAttribute('aAlpha');
    fireworks.particles.forEach((particle, index) => {
      if (particle.burst === 0) assert.equal(alpha.getX(index), 0, 'The finished burst must fully clear');
    });
  } finally { disposeFireworks(fireworks); }
});

test('pausing fireworks freezes the exact particle pose and a stalled frame cannot catch up', () => {
  const fireworks = createFairytaleFireworks(true);
  const reference = createFairytaleFireworks(true);
  try {
    const initial = snapshot(fireworks);
    for (const delta of [0.016, 30, Infinity, NaN, -1]) advanceFireworks(fireworks, delta, false);
    for (const delta of [0, -1, Infinity, NaN]) advanceFireworks(fireworks, delta, true);
    assert.deepEqual(snapshot(fireworks), initial);
    advanceFireworks(fireworks, 20, true);
    advanceFireworks(reference, 0.05, true);
    assert.deepEqual(snapshot(fireworks), snapshot(reference));
  } finally { disposeFireworks(fireworks); disposeFireworks(reference); }
});

test('initial fireworks appear above the tree in portrait and landscape framing', () => {
  const fireworks = createFairytaleFireworks(false);
  try {
    const position = fireworks.points.geometry.getAttribute('position');
    const alpha = fireworks.points.geometry.getAttribute('aAlpha');
    for (const [width, height] of [[390, 844], [844, 390], [1440, 900]]) {
      const aspect = width / height;
      const distance = getCameraFraming(width, height).defaultDistance;
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
      camera.position.set(0, -6.5 + distance * 0.09, distance * Math.sqrt(1 - 0.09 ** 2));
      camera.lookAt(0, -6.5, 0);
      camera.updateMatrixWorld();
      let visible = 0;
      const point = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        if (alpha.getX(i) < 0.05) continue;
        point.fromBufferAttribute(position, i).project(camera);
        if (Math.abs(point.x) < 1 && point.y > 0.35 && point.y < 1 && Math.abs(point.z) < 1) visible++;
      }
      assert.ok(visible >= 12, `${width}×${height}: fireworks must be visible in the upper sky`);
    }
  } finally { disposeFireworks(fireworks); }
});
