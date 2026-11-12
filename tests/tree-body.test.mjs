import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

// Execute the actual geometry factory without a browser or GPU. TypeScript's
// existing transpiler keeps this compatible with Node 20.19, not just Node's
// recent native TS support. The private export exists only in this test module.
const compile = source => ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const profileUrl = moduleUrl(compile(await readFile(new URL('../src/scene/tree-profile.ts', import.meta.url), 'utf8')));
const baseUrl = moduleUrl(compile(await readFile(new URL('../src/scene/tree-base.ts', import.meta.url), 'utf8'))
  .replace(/from\s+(['"])\.\/tree-profile\1/g, `from ${JSON.stringify(profileUrl)}`));
const source = await readFile(new URL('../src/scene/TreeBody.tsx', import.meta.url), 'utf8');
const moduleCode = compile(`${source}\nexport { createTreeBody };`).replace(
  /from\s+(['"])([^'"]+)\1/g,
  (_match, _quote, name) => `from ${JSON.stringify(name === './tree-profile' ? profileUrl : name === './tree-base' ? baseUrl : import.meta.resolve(name))}`,
);
const { createTreeBody } = await import(moduleUrl(moduleCode));
const {
  FOLIAGE_BOTTOM, FOLIAGE_TOP, TRUNK_BOTTOM,
  TREE_OFFSET_Y, DEFAULT_CAMERA_Y, MIN_CAMERA_DISTANCE,
  foliageRadiusAt,
} = await import(profileUrl);
const body = createTreeBody({ value: 1 });
const wood = body.objects.find(object => object.name === 'evergreen-trunk-and-branches');
const crown = body.objects.find(object => object.name === 'evergreen-solid-boughs');
const needles = body.objects.find(object => object.name === 'evergreen-needles');
body.objects.forEach(object => object.updateMatrixWorld());
after(() => body.dispose());

function signedVolume(geometry) {
  const position = geometry.getAttribute('position');
  const indices = geometry.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    a.fromBufferAttribute(position, indices[i]);
    b.fromBufferAttribute(position, indices[i + 1]);
    c.fromBufferAttribute(position, indices[i + 2]);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return volume;
}

test('the tree has finite solid wood and evergreen geometry without any photographs', () => {
  assert.ok(wood?.isMesh, 'The tree needs an actual wooden stem and branches');
  assert.ok(crown?.isMesh, 'The tree needs actual evergreen surfaces beneath the cards');
  assert.ok(needles?.isMesh, 'Needles need solid surfaces and normals to share the tree lighting');
  for (const object of body.objects) {
    const geometry = object.geometry;
    const positions = geometry.getAttribute('position');
    assert.ok(positions.count > 0, `${object.name} is empty`);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      assert.equal(attribute.count, positions.count, `${object.name}: ${name} has missing vertices`);
      assert.ok(Array.from(attribute.array).every(Number.isFinite), `${object.name}: ${name} contains invalid numbers`);
    }
    if (geometry.index) {
      assert.ok(Array.from(geometry.index.array).every(index => index >= 0 && index < positions.count));
      assert.ok(geometry.getAttribute('normal'), `${object.name} has no surface normals`);
    }
  }
  // A few thin decoration planes cannot replace a substantial wooden stem and
  // a green crown. These are broad volume constraints, not fixed mesh counts.
  assert.ok(signedVolume(wood.geometry) > 5, 'The wooden tree has lost its solid volume');
  assert.ok(signedVolume(crown.geometry) > 100, 'The evergreen has become only a thin outer decoration');
});

test('solid boughs and needles remain within the envelope used to hang photographs', () => {
  for (const object of [crown, needles]) {
    const position = object.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const radius = Math.hypot(position.getX(i), position.getZ(i));
      assert.ok(y >= FOLIAGE_BOTTOM - 1e-5 && y <= FOLIAGE_TOP + 1e-5, 'Greenery overlaps the exposed stem or star');
      assert.ok(radius <= foliageRadiusAt(y) + 1e-5, 'A solid bough can cut through the photograph envelope');
    }
  }
  const bounds = crown.geometry.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.y > 20 && size.x > 12 && size.z > 12, 'The crown no longer spans a full three-dimensional tree');
});

test('the exposed trunk has outward-facing wooden surfaces below the lowest foliage', () => {
  const geometry = wood.geometry;
  const position = geometry.getAttribute('position');
  const indices = geometry.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const radial = new THREE.Vector3();
  let sideFaces = 0;
  for (let i = 0; i < indices.length; i += 3) {
    a.fromBufferAttribute(position, indices[i]);
    b.fromBufferAttribute(position, indices[i + 1]);
    c.fromBufferAttribute(position, indices[i + 2]);
    if (Math.max(a.y, b.y, c.y) >= FOLIAGE_BOTTOM) continue;
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    if (Math.abs(normal.y) > 0.9 || normal.lengthSq() < 0.1) continue; // End caps are intentionally vertical.
    radial.copy(a).add(b).add(c);
    radial.y = 0;
    radial.normalize();
    assert.ok(normal.dot(radial) > 0.5, 'A bark surface faces inward and disappears with back-face culling');
    sideFaces++;
  }
  assert.ok(sideFaces > 12, 'There is no visible three-dimensional stem beneath the crown');
  assert.ok(geometry.boundingBox.min.y <= FOLIAGE_BOTTOM - 1.5, 'The stem is too short to emerge from the broad crown');
});

test('the default camera can see the lower stem through a full turn of the solid tree', () => {
  const cameraHeight = DEFAULT_CAMERA_Y - TREE_OFFSET_Y;
  const radial = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const camera = new THREE.Vector3();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const directions = 12;
  const sampleRows = 10;
  const sampleColumns = 3;
  for (let turn = 0; turn < directions; turn++) {
    const angle = turn / directions * Math.PI * 2;
    radial.set(Math.cos(angle), 0, Math.sin(angle));
    tangent.set(-Math.sin(angle), 0, Math.cos(angle));
    camera.copy(radial).multiplyScalar(MIN_CAMERA_DISTANCE);
    camera.y = cameraHeight;
    let visible = 0;
    for (let row = 0; row < sampleRows; row++) {
      for (let column = 0; column < sampleColumns; column++) {
        point.copy(tangent).multiplyScalar((column - 1) * 0.22);
        point.y = THREE.MathUtils.lerp(TRUNK_BOTTOM + 0.1, FOLIAGE_BOTTOM - 0.1, row / (sampleRows - 1));
        const distance = camera.distanceTo(point);
        direction.subVectors(point, camera).normalize();
        raycaster.set(camera, direction);
        raycaster.far = distance + 1;
        const first = raycaster.intersectObjects(body.objects, false)[0];
        // A near-side branch can also be brown; require the first bark hit to
        // be close to the stem's axis, not a branch several metres in front.
        if (first?.object === wood && first.distance > distance - 1) visible++;
      }
    }
    assert.ok(
      visible / (sampleRows * sampleColumns) >= 0.25,
      `The crown hides the stem at rotation ${Math.round(turn / directions * 360)}°`,
    );
  }
  // This is CPU occlusion of the solid geometry. It does not assert photo
  // occlusion, lighting, GPU shader compilation, or a browser frame rate.
});
