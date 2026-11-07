import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

// Load the real pure-layout module on every supported Node version (>=20.19),
// without relying on Node's newer built-in TypeScript stripping or emitting files.
const source = await readFile(new URL('../src/scene/photo-layout.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  fileName: 'photo-layout.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const moduleCode = outputText.replace(/from\s+(['"])three\1/g, `from ${JSON.stringify(import.meta.resolve('three'))}`);
const { createPhotoPlacements } = await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString('base64')}`);

const COUNTS = [0, 1, 32, 150, 300];
const RAYCAST_BOUND_RADIUS = 75;

for (const count of COUNTS) {
  test(`${count} photo placements have finite positions, valid rotations and independent animation state`, () => {
    const placements = createPhotoPlacements(count);
    assert.equal(placements.length, count);
    for (const [index, placement] of placements.entries()) {
      const values = [
        ...placement.formedPosition.toArray(), ...placement.scatteredPosition.toArray(),
        ...placement.position.toArray(), ...placement.formedRotation.toArray(),
        ...placement.scatteredRotation.toArray(), ...placement.rotation.toArray(),
        ...placement.frameColor.toArray(), placement.scale, placement.weight,
      ];
      assert.ok(values.every(Number.isFinite), `Card ${index} contains an invalid numeric value`);
      assert.ok(placement.scale > 0 && placement.scale <= 3, `Card ${index} has an invalid display size`);
      assert.ok(placement.weight > 0, `Card ${index} cannot converge during reassembly`);
      for (const rotation of [placement.formedRotation, placement.scatteredRotation, placement.rotation]) {
        assert.ok(Math.abs(rotation.length() - 1) < 1e-6, `Card ${index} has an invalid rotation`);
      }

      // Interpolating animation state must not drag either destination along with it.
      const formedBefore = placement.formedPosition.clone();
      const scatteredBefore = placement.scatteredPosition.clone();
      const formedRotationBefore = placement.formedRotation.clone();
      const scatteredRotationBefore = placement.scatteredRotation.clone();
      placement.position.set(100, 200, 300);
      placement.rotation.setFromEuler(new THREE.Euler(0.3, 0.6, 0.9));
      assert.ok(placement.formedPosition.equals(formedBefore));
      assert.ok(placement.scatteredPosition.equals(scatteredBefore));
      assert.ok(placement.formedRotation.equals(formedRotationBefore));
      assert.ok(placement.scatteredRotation.equals(scatteredRotationBefore));
    }
  });
}

for (const count of [32, 300]) {
  test(`${count} formed photos wrap every side of a full-height tapered tree`, () => {
    const placements = createPhotoPlacements(count);
    const heightBands = Array.from({ length: 6 }, () => []);
    const angleSectors = Array(8).fill(0);
    const heights = [];
    for (const placement of placements) {
      const { x, y, z } = placement.formedPosition;
      const radius = Math.hypot(x, z);
      assert.ok(y >= -11 && y <= 11, 'A card escaped the original tree height');
      assert.ok(radius > 0 && radius <= 10.5, 'A card escaped the photo shell');
      heights.push(y);
      const band = Math.min(5, Math.floor((y + 11) / 22 * 6));
      heightBands[band].push(placement);
      const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
      angleSectors[Math.floor(angle / (Math.PI * 2) * 8)]++;
    }
    assert.ok(Math.min(...heights) < -10 && Math.max(...heights) > 10, 'The shell must reach both the base and tip');
    for (const band of heightBands) {
      assert.ok(band.length >= Math.max(1, Math.floor(count / 12)), 'A height band is visibly empty or sparse');
    }
    for (const sectorCount of angleSectors) {
      assert.ok(sectorCount >= Math.max(1, Math.floor(count / 16)), 'Photos cover only part of the circumference');
    }
    const meanRadius = cards => cards.reduce((sum, card) => sum + Math.hypot(card.formedPosition.x, card.formedPosition.z), 0) / cards.length;
    const baseRadius = meanRadius(heightBands[0].concat(heightBands[1]));
    const tipRadius = meanRadius(heightBands[4].concat(heightBands[5]));
    assert.ok(baseRadius > 6 && tipRadius < 3, 'The photo shell must taper instead of forming a cylinder');
    assert.ok(baseRadius > tipRadius * 2, 'The tip must be substantially narrower than the base');

    // Dense desktop trees must wrap all four sides at every height, not merely
    // satisfy the overall bounds with disconnected strips of photographs.
    if (count >= 150) {
      for (const band of heightBands) {
        const quadrants = Array(4).fill(0);
        for (const card of band) {
          const { x, z } = card.formedPosition;
          quadrants[(x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0)]++;
        }
        assert.ok(quadrants.every(amount => amount >= 2), 'A side of one height band has lost its photo wrapping');
      }
    }
  });
}

test('formed prints remain upright and face radially outward, including the back half of the tree', () => {
  for (const count of [1, 32, 150, 300]) {
    for (const [index, placement] of createPhotoPlacements(count).entries()) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(placement.formedRotation);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(placement.formedRotation);
      const radial = placement.formedPosition.clone().setY(0).normalize();
      assert.ok(up.y > 0.98, `Card ${index}/${count} rolls sideways or upside down`);
      assert.ok(normal.dot(radial) > 0.98, `Card ${index}/${count} does not face out from the cone`);
    }
  }
});

test('scattered cards remain inside the picking bound and occupy three-dimensional space', () => {
  for (const count of [1, 32, 150, 300]) {
    const placements = createPhotoPlacements(count);
    for (const [index, placement] of placements.entries()) {
      assert.ok(placement.scatteredPosition.toArray().every(value => Number.isFinite(value) && Math.abs(value) <= 35));
      // Check the actual four print corners, including its offset lower margin.
      for (const x of [-0.6, 0.6]) {
        for (const y of [-0.9, 0.6]) {
          const corner = new THREE.Vector3(x, y, 0)
            .multiplyScalar(placement.scale)
            .applyQuaternion(placement.scatteredRotation)
            .add(placement.scatteredPosition);
          assert.ok(corner.length() < RAYCAST_BOUND_RADIUS, `Scattered card ${index}/${count} falls outside the picking bound`);
        }
      }
    }
    if (count >= 32) {
      for (const axis of ['x', 'y', 'z']) {
        const coordinates = placements.map(card => card.scatteredPosition[axis]);
        assert.ok(Math.max(...coordinates) - Math.min(...coordinates) > 40, `Scatter collapsed along the ${axis} axis`);
      }
    }
  }
});
