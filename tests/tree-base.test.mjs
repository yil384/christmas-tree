import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

// Check the actual wood and receiver surfaces together in world space.
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const paths = ['tree-profile.ts', 'tree-base.ts', 'TreeBody.tsx', 'SnowGround.tsx'];
const sources = await Promise.all(paths.map(path => readFile(new URL(`../src/scene/${path}`, import.meta.url), 'utf8')));
const profileUrl = moduleUrl(compile(sources[0]));
const rewrite = (code, aliases) => code.replace(/from\s+(['"])([^'"]+)\1/g,
  (_match, _quote, name) => `from ${JSON.stringify(aliases[name] ?? import.meta.resolve(name))}`);
const baseUrl = moduleUrl(rewrite(compile(sources[1]), { './tree-profile': profileUrl }));
const compositeUrl = moduleUrl(rewrite(compile(await readFile(new URL('../src/scene/ground-composite.ts', import.meta.url), 'utf8')), {}));
const catPlacementUrl = moduleUrl(compile(await readFile(new URL('../src/scene/cat-placement.ts', import.meta.url), 'utf8')));
const aliases = { './tree-profile': profileUrl, './tree-base': baseUrl, './ground-composite': compositeUrl, './cat-placement': catPlacementUrl };
const { createTreeBody } = await import(moduleUrl(rewrite(compile(`${sources[2]}\nexport {createTreeBody};`), aliases)));
const { createProjectiveSnowGround } = await import(moduleUrl(rewrite(compile(`${sources[3]}\nexport {createProjectiveSnowGround};`), aliases)));
const { GROUND_Y, TREE_OFFSET_Y, TRUNK_BOTTOM } = await import(profileUrl);
const body = createTreeBody({ value: 1 });
const wood = body.objects.find(object => object.name === 'evergreen-trunk-and-branches');
const ground = createProjectiveSnowGround();
ground.mesh.updateMatrixWorld();
after(() => { body.dispose(); ground.dispose(); });
const position = wood.geometry.getAttribute('position');
const partScale = wood.geometry.getAttribute('aPartScale');
const trunkVertices = Array.from({ length: position.count }, (_, index) => index).filter(index => partScale.getX(index) < 0.01);

test('the flared trunk stays one closed, outward-facing wooden surface in the three tree batches', () => {
  assert.equal(body.objects.length, 3);
  const indices = wood.geometry.index.array;
  const edges = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3(), edge = new THREE.Vector3(), radial = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    if (triangle.some(index => partScale.getX(index) >= 0.01)) continue;
    a.fromBufferAttribute(position, triangle[0]);
    b.fromBufferAttribute(position, triangle[1]);
    c.fromBufferAttribute(position, triangle[2]);
    normal.subVectors(b, a).cross(edge.subVectors(c, a));
    assert.ok(normal.lengthSq() > 1e-10, 'A collapsed root triangle appeared');
    volume += a.dot(edge.crossVectors(b, c)) / 6;
    normal.normalize();
    // The upper stem bends away from the origin; radial orientation about the
    // world axis is only a valid outward reference for this root-collar region.
    if (Math.abs(normal.y) < 0.99 && Math.max(a.y, b.y, c.y) < TRUNK_BOTTOM + 3) {
      radial.copy(a).add(b).add(c).setY(0).normalize();
      assert.ok(normal.dot(radial) > 0, 'A root side points inward');
    }
    for (let side = 0; side < 3; side++) {
      const x = triangle[side], y = triangle[(side + 1) % 3];
      const key = x < y ? `${x},${y}` : `${y},${x}`;
      const value = edges.get(key) ?? { count: 0, direction: 0 };
      value.count++;
      value.direction += x < y ? 1 : -1;
      edges.set(key, value);
    }
  }
  assert.ok(volume > 5, 'The load-bearing base lost its volume');
  assert.ok([...edges.values()].every(edge => edge.count === 2 && edge.direction === 0), 'The root collar has an open or reversed seam');
});

test('the collar has irregular buttresses that narrow smoothly into the original stem', () => {
  const foot = trunkVertices.filter(index => Math.abs(position.getY(index) - TRUNK_BOTTOM) < 1e-5)
    .map(index => Math.hypot(position.getX(index), position.getZ(index))).filter(radius => radius > 0.1);
  const upper = trunkVertices.filter(index => position.getY(index) > TRUNK_BOTTOM + 1.7 && position.getY(index) < TRUNK_BOTTOM + 2.3)
    .map(index => Math.hypot(position.getX(index), position.getZ(index)));
  assert.ok(Math.max(...foot) > Math.max(...upper) * 1.6, 'The stem still ends as a straight pole');
  assert.ok(Math.max(...foot) - Math.min(...foot) > 0.35, 'The base is a circular pedestal instead of buttressed roots');
  assert.ok(Math.max(...foot) < 2.2, 'Roots overwhelm the tree silhouette');
});

test('the ground physically buries every root end and leaves part of the collar visible', () => {
  const ray = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  let buried = 0, exposed = 0, bottomCount = 0;
  for (const index of trunkVertices) {
    const y = position.getY(index);
    if (y > TRUNK_BOTTOM + 1.31) continue;
    origin.set(position.getX(index), GROUND_Y + 3, position.getZ(index));
    ray.set(origin, down);
    ray.far = 5;
    const hit = ray.intersectObject(ground.mesh, false)[0];
    assert.ok(hit, 'There is a hole in the snow beneath a root');
    const clearance = y + TREE_OFFSET_Y - hit.point.y;
    if (clearance < -0.02) buried++;
    if (clearance > 0.04) exposed++;
    if (Math.abs(y - TRUNK_BOTTOM) < 1e-5) {
      assert.ok(clearance < -0.15, 'The capped root end is visible above the snow');
      bottomCount++;
    }
  }
  assert.ok(bottomCount > 20);
  assert.ok(buried > 30 && exposed > 30, 'The root collar needs both buried and exposed surfaces');
});

test('local snow deposits are real upward-facing relief without extra draw batches', () => {
  const geometry = ground.geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const nearHeights = [];
  for (const attribute of Object.values(geometry.attributes)) {
    assert.equal(attribute.count, positions.count);
    assert.ok(Array.from(attribute.array).every(Number.isFinite));
  }
  for (let i = 0; i < positions.count; i++) {
    assert.ok(normals.getY(i) > 0, 'A snow surface faces downward');
    const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
    assert.ok(Math.abs(length - 1) < 1e-6);
    if (Math.hypot(positions.getX(i), positions.getZ(i)) < 3) nearHeights.push(positions.getY(i));
  }
  assert.ok(nearHeights.length > 1000, 'The root region is still too coarse to carry snow relief');
  assert.ok(Math.max(...nearHeights) - Math.min(...nearHeights) > 0.2, 'The snow collar is only a painted plane');
  assert.ok(Math.max(...nearHeights) < 0.6, 'The snow mound hides too much of the stem');
  assert.ok(geometry.index.count / 3 < 12000, 'Local detail needlessly increased the ground budget');
  assert.ok(!Array.isArray(ground.mesh.material));
});

test('contact shade is shallow and localized instead of a broad black disc', () => {
  const positions = ground.geometry.getAttribute('position');
  const contact = ground.geometry.getAttribute('aSnowContact');
  let strong = 0;
  for (let i = 0; i < contact.count; i++) {
    const amount = contact.getX(i);
    const radius = Math.hypot(positions.getX(i), positions.getZ(i));
    assert.ok(amount >= 0 && amount <= 0.431);
    if (amount > 0.2) strong++;
    if (radius > 5) assert.ok(amount < 0.015, 'Contact shade spreads into a visible flat disc');
  }
  assert.ok(strong > 0, 'The root has no local contact shading');
});
