import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

// Exercise the real geometry on every supported Node version (>=20.19),
// without depending on Node's newer native TypeScript support.
async function moduleSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  return ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const profileUrl = dataUrl(await moduleSource('../src/scene/tree-profile.ts'));
const profile = await import(profileUrl);
const layoutCode = (await moduleSource('../src/scene/photo-layout.ts'))
  .replace(/from\s+(['"])three\1/g, `from ${JSON.stringify(import.meta.resolve('three'))}`)
  .replace(/from\s+(['"])\.\/tree-profile\1/g, `from ${JSON.stringify(profileUrl)}`);
const { createPhotoPlacements } = await import(dataUrl(layoutCode));
const { FOLIAGE_BOTTOM, FOLIAGE_TOP, TREE_HEIGHT, TREE_RADIUS, foliageRadiusAt } = profile;

const COUNTS = [0, 1, 32, 90, 128, 300];
const RAYCAST_BOUND_RADIUS = 75;
const printCorners = [[-0.6, -0.9], [0.6, -0.9], [-0.6, 0.6], [0.6, 0.6]];

for (const count of COUNTS) {
  test(`${count} cards have finite transforms and independent animation state`, () => {
    const placements = createPhotoPlacements(count);
    assert.equal(placements.length, count);
    for (const [index, placement] of placements.entries()) {
      const values = [
        ...placement.formedPosition.toArray(), ...placement.scatteredPosition.toArray(),
        ...placement.position.toArray(), ...placement.formedRotation.toArray(),
        ...placement.scatteredRotation.toArray(), ...placement.rotation.toArray(),
        ...placement.attachmentPoint.toArray(), ...placement.hangerEnd.toArray(),
        ...placement.frameColor.toArray(), placement.scale, placement.weight,
      ];
      assert.ok(values.every(Number.isFinite), `Card ${index} contains an invalid value`);
      assert.ok(placement.scale >= 0.7 && placement.scale <= 1.5, `Card ${index} overwhelms the visible tree`);
      assert.ok(placement.weight > 0, `Card ${index} cannot converge during reassembly`);
      for (const rotation of [placement.formedRotation, placement.scatteredRotation, placement.rotation]) {
        assert.ok(Math.abs(rotation.length() - 1) < 1e-6, `Card ${index} has an invalid rotation`);
      }

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

for (const count of [32, 90, 128]) {
  test(`${count} cards decorate every side while leaving the trunk, crown and green boughs exposed`, () => {
    const placements = createPhotoPlacements(count);
    const heightBands = Array.from({ length: 4 }, () => []);
    const angleSectors = Array(8).fill(0);
    for (const placement of placements) {
      const { x, y, z } = placement.formedPosition;
      assert.ok(y >= FOLIAGE_BOTTOM + 1.4 && y <= FOLIAGE_TOP - 2, 'A photo obscures the bare trunk or narrow crown');
      const band = Math.min(3, Math.max(0, Math.floor((y - (FOLIAGE_BOTTOM + 1.5)) / 18.4 * 4)));
      heightBands[band].push(placement);
      const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
      angleSectors[Math.floor(angle / (Math.PI * 2) * 8)]++;
    }

    assert.ok(heightBands.every(band => band.length > 0), 'A complete vertical portion has lost all its photos');
    assert.ok(heightBands[0].length > heightBands[3].length * 2, 'The narrow crown must carry fewer cards than the broad base');
    assert.ok(angleSectors.every(amount => amount >= Math.max(1, Math.floor(count / 16))), 'Photos no longer wrap around the tree');
    const meanRadius = cards => cards.reduce((sum, card) => sum + Math.hypot(card.formedPosition.x, card.formedPosition.z), 0) / cards.length;
    assert.ok(meanRadius(heightBands[0]) > meanRadius(heightBands[3]) * 2, 'The arrangement lost the evergreen taper');

    const cardArea = placements.reduce((area, card) => area + 1.2 * 1.5 * card.scale ** 2, 0);
    const coneSurfaceArea = Math.PI * TREE_RADIUS * Math.hypot(TREE_RADIUS, TREE_HEIGHT);
    assert.ok(cardArea < coneSurfaceArea * 0.45, 'Cards have become a solid paper wall hiding the tree');
    if (count >= 90) assert.ok(cardArea > coneSurfaceArea * 0.16, 'The scene lost its substantial photo-card decoration');
  });
}

test('the whole print clears the solid foliage rather than cutting through its lower edge', () => {
  for (const count of [1, 32, 90, 128, 300]) {
    for (const [index, placement] of createPhotoPlacements(count).entries()) {
      for (const x of [-0.6, 0, 0.6]) {
        for (const y of [-0.9, 0, 0.6]) {
          const point = new THREE.Vector3(x, y, 0).multiplyScalar(placement.scale)
            .applyQuaternion(placement.formedRotation).add(placement.formedPosition);
          assert.ok(Math.hypot(point.x, point.z) >= foliageRadiusAt(point.y) + 0.15,
            `Card ${index}/${count} intersects the leaves`);
          assert.ok(point.y > FOLIAGE_BOTTOM, `Card ${index}/${count} covers the visible trunk`);
          assert.ok(point.y < FOLIAGE_TOP - 0.5, `Card ${index}/${count} hides the crown`);
        }
      }
    }
  }
});

test('each hanging string actually connects its print to the tree', () => {
  for (const placement of createPhotoPlacements(128)) {
    const anchor = placement.hangerEnd.clone().multiplyScalar(placement.scale)
      .applyQuaternion(placement.formedRotation).add(placement.formedPosition);
    assert.ok(anchor.distanceTo(placement.attachmentPoint) < 1e-8, 'The shader string endpoint misses its branch attachment');
    const top = new THREE.Vector3(0, 0.64, 0).multiplyScalar(placement.scale)
      .applyQuaternion(placement.formedRotation).add(placement.formedPosition);
    assert.ok(anchor.y > top.y + 0.2, 'The card is not suspended from above');
    const radius = Math.hypot(anchor.x, anchor.z);
    const envelope = foliageRadiusAt(anchor.y);
    assert.ok(radius > envelope * 0.3 && radius < envelope * 0.52, 'The string stops outside the continuous inner crown');
    assert.ok(anchor.distanceTo(top) < 6, 'The attachment escaped the tree instead of ending in its foliage');
  }
});

test('formed prints remain upright and face outward, including the back half of the tree', () => {
  for (const count of [1, 32, 90, 128, 300]) {
    for (const [index, placement] of createPhotoPlacements(count).entries()) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(placement.formedRotation);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(placement.formedRotation);
      const radial = placement.formedPosition.clone().setY(0).normalize();
      assert.ok(up.y > 0.98, `Card ${index}/${count} is sideways or upside down`);
      assert.ok(normal.dot(radial) > 0.98, `Card ${index}/${count} faces into the tree`);
    }
  }
});

test('scattered prints and their strings stay within the picking bound and occupy 3D space', () => {
  for (const count of [1, 32, 90, 128, 300]) {
    const placements = createPhotoPlacements(count);
    for (const [index, placement] of placements.entries()) {
      assert.ok(placement.scatteredPosition.toArray().every(value => Number.isFinite(value) && Math.abs(value) <= 35));
      const localPoints = printCorners.map(([x, y]) => new THREE.Vector3(x, y, 0));
      localPoints.push(placement.hangerEnd, new THREE.Vector3(0.065, 0.73, 0.018));
      for (const localPoint of localPoints) {
        const point = localPoint.clone().multiplyScalar(placement.scale)
          .applyQuaternion(placement.scatteredRotation).add(placement.scatteredPosition);
        assert.ok(point.length() < RAYCAST_BOUND_RADIUS, `Scattered card/string ${index}/${count} escaped its bounds`);
      }
    }
    if (count >= 32) {
      for (const axis of ['x', 'y', 'z']) {
        const coordinates = placements.map(card => card.scatteredPosition[axis]);
        assert.ok(Math.max(...coordinates) - Math.min(...coordinates) > 40, `Scatter collapsed along ${axis}`);
      }
    }
  }
});
