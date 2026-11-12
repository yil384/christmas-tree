import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from\s+(['"])three\1/g, `from ${JSON.stringify(import.meta.resolve('three'))}`);
const url = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const groundUrl = url(compile(await readFile(new URL('../src/scene/ground-composite.ts', import.meta.url), 'utf8')));
const { createPanoramaUniforms, configurePanoramaPanel, createProjectiveGroundMaterial, bindProjectiveGroundMaterial } = await import(groundUrl);
const poolSource = compile(await readFile(new URL('../src/scene/panorama-panels.ts', import.meta.url), 'utf8'))
  .replace(/import\s*\{\s*assetUrl\s*\}\s*from\s*['"][^'"]+['"];?/, 'const assetUrl = path => path;')
  .replace(/from\s*['"]\.\/ground-composite['"]/g, `from ${JSON.stringify(groundUrl)}`);
const { createPanoramaPanelPool } = await import(url(poolSource));

const definitions = Array.from({ length: 8 }, (_, i) => ({ src: `view-${i}`, compactSrc: `small-${i}`,
  width: 1254, height: 1254, yaw: 5.4 + 45 * i, pitch: -10, horizontalFov: 60, verticalFov: 60 }));

test('perspective panel coordinates match independently projected Three camera rays around the whole sphere', () => {
  const material = new THREE.ShaderMaterial({ uniforms: createPanoramaUniforms(null) });
  const raycaster = new THREE.Raycaster();
  for (const [index, panel] of definitions.entries()) {
    configurePanoramaPanel(material, index, panel);
    const camera = new THREE.PerspectiveCamera(panel.verticalFov, 1, .1, 10);
    const theta = panel.yaw * Math.PI / 180, pitch = panel.pitch * Math.PI / 180;
    camera.lookAt(Math.sin(theta) * Math.cos(pitch), Math.sin(pitch), -Math.cos(theta) * Math.cos(pitch));
    camera.updateMatrixWorld();
    for (const x of [-.99, -.5, 0, .5, .99]) for (const y of [-.99, -.5, 0, .5, .99]) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const local = raycaster.ray.direction.clone().applyMatrix3(material.uniforms[`panelView${index}`].value);
      const lens = material.uniforms[`panelLens${index}`].value;
      const uv = new THREE.Vector2(.5 + local.x / (2 * local.z * lens.x), .5 + local.y / (2 * local.z * lens.y));
      assert.ok(uv.distanceTo(new THREE.Vector2(.5 + x / 2, .5 + y / 2)) < 1e-12,
        `the drawing's real lens or direction drifted at panel ${index}, ray (${x},${y})`);
    }
  }
  material.dispose();
});

test('ground binding changes shader variants and borrows every loaded panel without owning its texture', () => {
  const texture = new THREE.Texture();
  const sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({
    uniforms: createPanoramaUniforms(texture), defines: { USE_DIRECTIONAL_PANELS: 1 },
  }));
  const receiver = createProjectiveGroundMaterial();
  const details = definitions.map(() => new THREE.Texture());
  let disposed = 0;
  details.forEach(detail => detail.addEventListener('dispose', () => disposed++));
  definitions.forEach((panel, i) => {
    configurePanoramaPanel(sky.material, i, panel);
    sky.material.uniforms[`panel${i}`].value = details[i];
    sky.material.uniforms[`panelReady${i}`].value = i % 2;
  });
  assert.equal(bindProjectiveGroundMaterial(receiver, sky), true);
  assert.equal(receiver.defines.USE_DIRECTIONAL_PANELS, 1);
  for (let i = 0; i < 8; i++) {
    assert.strictEqual(receiver.uniforms[`panel${i}`].value, details[i]);
    assert.deepEqual(receiver.uniforms[`panelView${i}`].value.elements, sky.material.uniforms[`panelView${i}`].value.elements);
    assert.deepEqual(receiver.uniforms[`panelLens${i}`].value.toArray(), sky.material.uniforms[`panelLens${i}`].value.toArray());
    assert.equal(receiver.uniforms[`panelReady${i}`].value, i % 2);
  }
  delete sky.material.defines.USE_DIRECTIONAL_PANELS;
  bindProjectiveGroundMaterial(receiver, sky);
  assert.equal(receiver.defines.USE_DIRECTIONAL_PANELS, undefined);
  bindProjectiveGroundMaterial(receiver, null);
  for (let i = 0; i < 8; i++) assert.equal(receiver.uniforms[`panelReady${i}`].value, 0);
  receiver.dispose();
  assert.equal(disposed, 0);
  sky.geometry.dispose(); sky.material.dispose(); texture.dispose(); details.forEach(detail => detail.dispose());
});

test('moving across all eight views keeps at most four native panels resident and releases late loads', t => {
  const original = THREE.TextureLoader.prototype.load;
  const requests = [], disposed = new Set();
  THREE.TextureLoader.prototype.load = function (src, onLoad, _progress, onError) {
    const texture = new THREE.Texture();
    texture.addEventListener('dispose', () => disposed.add(texture));
    requests.push({ src, texture, onLoad, onError, done: false });
    return texture;
  };
  t.after(() => { THREE.TextureLoader.prototype.load = original; });
  const texture = new THREE.Texture(), material = new THREE.ShaderMaterial({ uniforms: createPanoramaUniforms(texture) });
  const pool = createPanoramaPanelPool(definitions, material, 2048, () => {});
  const camera = new THREE.PerspectiveCamera();
  let time = 0;
  const complete = () => {
    let request;
    while ((request = requests.find(item => !item.done))) {
      assert.ok(requests.filter(item => !item.done).length <= 2, 'decoding must have no more than two concurrent lanes');
      request.done = true; request.onLoad(request.texture);
    }
    assert.ok(definitions.filter((_, i) => material.uniforms[`panelReady${i}`].value > 0).length <= 4);
  };
  for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315, 360]) {
    camera.lookAt(Math.sin(yaw * Math.PI / 180), 0, -Math.cos(yaw * Math.PI / 180)); camera.updateMatrixWorld();
    pool.update(camera, time++); complete();
  }
  camera.lookAt(1, 0, 0); camera.updateMatrixWorld(); pool.update(camera, time++);
  pool.dispose(); complete();
  assert.ok(requests.every(request => disposed.has(request.texture)), 'unmount and late image completion must release every owned texture');
  for (let i = 0; i < 8; i++) assert.equal(material.uniforms[`panelReady${i}`].value, 0);
  texture.dispose(); material.dispose();
});
