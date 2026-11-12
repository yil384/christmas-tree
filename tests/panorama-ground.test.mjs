import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import sharp from 'sharp';

const compiled = new Map();
async function moduleUrl(file, extra = '') {
  const key = file.href + extra;
  if (compiled.has(key)) return compiled.get(key);
  const task = (async () => {
    const source = await readFile(file, 'utf8');
    let code = ts.transpileModule(source + '\n' + extra, {
      fileName: file.pathname,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const aliases = new Map();
    for (const match of code.matchAll(/from\s+(['"])([^'"]+)\1/g)) {
      const name = match[2];
      if (aliases.has(name)) continue;
      if (!name.startsWith('.')) aliases.set(name, import.meta.resolve(name));
      else {
        let found;
        for (const extension of ['', '.ts', '.tsx', '.js']) {
          const candidate = new URL(name + extension, file);
          try { await readFile(candidate, 'utf8'); found = candidate; break; } catch {}
        }
        assert.ok(found, `resolve production dependency ${name}`);
        aliases.set(name, await moduleUrl(found));
      }
    }
    code = code.replace(/from\s+(['"])([^'"]+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(aliases.get(name))}`);
    return 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  })();
  compiled.set(key, task);
  return task;
}

const load = async (path, extra = '') => import(await moduleUrl(new URL('../src/' + path, import.meta.url), extra));
const { createProjectiveGroundMaterial, bindProjectiveGroundMaterial, setGroundCompanionContact } = await load('scene/ground-composite.ts');
const { createPanorama } = await load('scene/NightBackground.tsx', 'export { createPanorama };');
const { getCameraFraming } = await load('scene/camera-framing.ts');
const { DEFAULT_CAMERA_TARGET_Y, GROUND_Y } = await load('scene/tree-profile.ts');
const { snowHeightAt } = await load('scene/tree-base.ts');
const { CAT_GROUND_CONTACT } = await load('scene/cat-placement.ts');

function panorama(t) {
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 1;
  const sky = createPanorama(texture);
  const receiver = createProjectiveGroundMaterial();
  t.after(() => { receiver.dispose(); sky.geometry.dispose(); sky.material.dispose(); texture.dispose(); });
  return { sky, texture, receiver };
}

test('panorama contact borrows the same sky exposure, rotation and optional detail layers without mutating them', t => {
  const { sky, texture, receiver } = panorama(t);
  const details = Array.from({ length: 4 }, () => new THREE.Texture());
  t.after(() => details.forEach(detail => detail.dispose()));
  for (let i = 0; i < 4; i++) {
    sky.material.uniforms[`detail${i}`].value = details[i];
    sky.material.uniforms[`detailRect${i}`].value.set(0.12 + i * 0.21, 0.14, 0.17, 0.79);
    sky.material.uniforms[`detailReady${i}`].value = i % 2;
  }
  for (const angle of [-Math.PI * 4.7, -0.001, 0, 0.73, Math.PI * 3.2]) {
    sky.material.uniforms.skyRotation.value.setFromMatrix4(new THREE.Matrix4().makeRotationY(angle));
    sky.material.uniforms.brightness.value = 0.79 + angle * 0.005;
    assert.equal(bindProjectiveGroundMaterial(receiver, sky), true);
    assert.equal(receiver.uniforms.uPanoramaMode.value, 1);
    assert.equal(receiver.uniforms.uPhotoReady.value, 1);
    assert.strictEqual(receiver.uniforms.panorama.value, texture);
    assert.equal(receiver.uniforms.brightness.value, sky.material.uniforms.brightness.value);
    assert.deepEqual(receiver.uniforms.skyRotation.value.elements, sky.material.uniforms.skyRotation.value.elements);
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(receiver.uniforms[`detail${i}`].value, details[i]);
      assert.deepEqual(receiver.uniforms[`detailRect${i}`].value.toArray(), sky.material.uniforms[`detailRect${i}`].value.toArray());
      assert.equal(receiver.uniforms[`detailReady${i}`].value, i % 2);
    }
  }
  assert.equal(texture.wrapS, THREE.RepeatWrapping);
  assert.equal(texture.anisotropy, 1);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
});

test('the environment stays fixed and its ground shares one physical surface through camera orbits and zoom', t => {
  const { sky, receiver } = panorama(t);
  const target = new THREE.Vector3(0, DEFAULT_CAMERA_TARGET_Y, 0);
  const raycaster = new THREE.Raycaster();
  const scene = new THREE.Scene();
  sky.updateMatrixWorld();
  const matrixBefore = sky.matrixWorld.toArray();
  const captureOrigin = new THREE.Vector3().setFromMatrixPosition(sky.matrixWorld);
  assert.ok(captureOrigin.distanceTo(new THREE.Vector3(0, GROUND_Y + 20, 0)) < 1e-10);
  const points = [new THREE.Vector3(0.12, GROUND_Y, 0.13), new THREE.Vector3(12, GROUND_Y, 7), new THREE.Vector3(-24, GROUND_Y, -19)];
  let checked = 0;
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const framing = getCameraFraming(width, height);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 700);
    for (const degrees of [0, 45, 90, 180, 270, 359.9]) for (const zoom of [1, 2.5]) {
      camera.position.setFromSpherical(new THREE.Spherical(framing.defaultDistance, Math.acos(0.09), degrees * Math.PI / 180)).add(target);
      camera.zoom = zoom; camera.updateProjectionMatrix();
      camera.lookAt(target); camera.updateMatrixWorld();
      sky.onBeforeRender(null, scene, camera);
      assert.deepEqual(sky.matrixWorld.toArray(), matrixBefore, 'the environment must never follow the viewing camera');
      assert.equal(bindProjectiveGroundMaterial(receiver, sky), true);
      assert.ok(receiver.uniforms.panoramaOrigin.value.distanceTo(captureOrigin) < 1e-12);
      for (const point of points) {
        const ndc = point.clone().project(camera);
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        const hits = [];
        THREE.Mesh.prototype.raycast.call(sky, raycaster, hits);
        const hit = hits.sort((a, b) => a.distance - b.distance)[0];
        assert.ok(hit, `the fixed world must cover every ground ray: ${width}×${height}, degrees=${degrees}, zoom=${zoom}, point=${point.toArray()}`);
        assert.ok(hit.point.distanceTo(point) < 1e-4,
          `the tree ground and environment floor separated at azimuth=${degrees}, zoom=${zoom}, point=${point.toArray()}`);
        const groundSample = point.clone().sub(receiver.uniforms.panoramaOrigin.value).normalize();
        const environmentSample = hit.point.clone().sub(captureOrigin).normalize();
        assert.ok(environmentSample.distanceTo(groundSample) < 1e-5,
          'both surfaces must map the same fixed world point to the same picture sample');
        checked++;
      }
    }
  }
  assert.equal(checked, 72);
});

test('finite scenery has physical translation parallax instead of remaining glued to the camera', t => {
  const { sky } = panorama(t);
  const captureOrigin = new THREE.Vector3().setFromMatrixPosition(sky.matrixWorld);
  const landmark = new THREE.Vector3(40, 35, -280).add(captureOrigin);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 700);
  camera.position.set(0, 0, 60); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const initial = landmark.clone().project(camera);
  camera.position.x += 12; camera.updateMatrixWorld();
  const shifted = landmark.clone().project(camera);
  assert.ok(Math.abs(shifted.x - initial.x) > 0.04, 'a fixed camera orientation plus translation must move the scenery on screen');
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(sky.matrixWorld).toArray(), captureOrigin.toArray());
});

test('switching panorama, perspective and unloaded skies never retains the previous projection or owns its textures', t => {
  const { sky, texture, receiver } = panorama(t);
  const picture = new THREE.Texture();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { picture: { value: picture }, brightness: { value: 0.64 } },
  }));
  t.after(() => { picture.dispose(); plate.geometry.dispose(); plate.material.dispose(); });
  let disposals = 0;
  texture.addEventListener('dispose', () => disposals++);
  picture.addEventListener('dispose', () => disposals++);
  assert.equal(bindProjectiveGroundMaterial(receiver, sky), true);
  assert.equal(receiver.uniforms.uPanoramaMode.value, 1);
  assert.equal(bindProjectiveGroundMaterial(receiver, plate), true);
  assert.equal(receiver.uniforms.uPanoramaMode.value, 0);
  assert.strictEqual(receiver.uniforms.uPhoto.value, picture);
  assert.equal(receiver.uniforms.uPhotoBrightness.value, 0.64);
  assert.equal(bindProjectiveGroundMaterial(receiver, sky), true);
  sky.material.uniforms.panorama.value = null;
  assert.equal(bindProjectiveGroundMaterial(receiver, sky), false);
  assert.equal(receiver.uniforms.uPhotoReady.value, 0);
  assert.equal(receiver.uniforms.panorama.value, null);
  for (let i = 0; i < 4; i++) assert.equal(receiver.uniforms[`detail${i}`].value, null);
  sky.material.uniforms.panorama.value = texture;
  assert.equal(bindProjectiveGroundMaterial(receiver, sky), true);
  assert.equal(bindProjectiveGroundMaterial(receiver, null), false);
  assert.equal(receiver.uniforms.uPanoramaMode.value, 0);
  receiver.dispose();
  assert.equal(disposals, 0, 'disposing the receiver must not free sky-owned resources');
});

test('companion footprints use its actual world placement and remain independent of tree disassembly', t => {
  const { receiver } = panorama(t);
  assert.equal(receiver.uniforms.uCompanionReady.value, 0);
  const contact = CAT_GROUND_CONTACT;
  setGroundCompanionContact(receiver, contact);
  assert.equal(receiver.uniforms.uCompanionReady.value, 1);
  const model = new THREE.Matrix4().compose(new THREE.Vector3(contact.position[0], 0, contact.position[1]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), contact.yaw), new THREE.Vector3(1, 1, 1));
  const inverse = model.clone().invert();
  const boundCenter = receiver.uniforms.uCompanionCenter.value;
  const boundRotation = receiver.uniforms.uCompanionRotation.value;
  for (let i = 0; i < contact.paws.length; i++) {
    const bound = receiver.uniforms.uCompanionPaws.value[i];
    assert.deepEqual(bound.toArray(), contact.paws[i]);
    const world = new THREE.Vector3(bound.x, 0, bound.y).applyMatrix4(model);
    const offset = new THREE.Vector2(world.x, world.z).sub(boundCenter);
    const restored = new THREE.Vector2(boundRotation.x * offset.x - boundRotation.y * offset.y,
      boundRotation.y * offset.x + boundRotation.x * offset.y);
    const expected = world.applyMatrix4(inverse);
    assert.ok(restored.distanceTo(new THREE.Vector2(expected.x, expected.z)) < 1e-12);
  }
  receiver.uniforms.uGroundAssembly.value = 0;
  assert.equal(receiver.uniforms.uCompanionReady.value, 1, 'the grounded cat remains present when the tree scatters');
  setGroundCompanionContact(receiver, null);
  assert.equal(receiver.uniforms.uCompanionReady.value, 0);
  assert.equal(receiver.transparent, false, 'contact must not add another feathered translucent disc');
});

test('the production panorama keeps roots and kitten paws on its visually approved snow throughout a full orbit', async t => {
  const clearing = {
    image: 'backgrounds/storybook-castle-360.webp',
    sha256: '7b4635283c2f90abc180ff576deb41ed9b74df37997b141b3cdca1dfcc172e3f',
    minImageY: 0.55,
  };
  const config = JSON.parse(await readFile(new URL('../public/scene.json', import.meta.url), 'utf8'));
  assert.equal(config.background.projection, 'equirectangular');
  assert.equal(config.background.image, clearing.image);
  const bytes = await readFile(new URL('../public/' + clearing.image, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), clearing.sha256,
    'the source changed: visually review and annotate its complete snow ring before updating this fixture');
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, metadata.height * 2, 'a full spherical panorama must retain its native 2:1 layout');
  const sceneSource = await readFile(new URL('../src/scene/TreeScene.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('TreeScene.tsx', sceneSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fov;
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'camera'
      && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression
      && ts.isObjectLiteralExpression(node.initializer.expression)) {
      for (const property of node.initializer.expression.properties) {
        if (ts.isPropertyAssignment(property) && property.name.getText(ast) === 'fov'
          && ts.isNumericLiteral(property.initializer)) fov = Number(property.initializer.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(Number.isFinite(fov), 'resolve the production Canvas FOV if camera configuration moves');
  const contactPoints = [];
  const addGroundPoint = (x, z) => contactPoints.push(new THREE.Vector3(x, GROUND_Y + snowHeightAt(x, z), z));
  addGroundPoint(0, 0);
  for (const radius of [0.7, 1.8, 7]) for (let side = 0; side < 16; side++) {
    const angle = side * Math.PI / 8;
    addGroundPoint(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  const c = Math.cos(CAT_GROUND_CONTACT.yaw), s = Math.sin(CAT_GROUND_CONTACT.yaw);
  for (const [x, z, rx, rz] of [CAT_GROUND_CONTACT.body, ...CAT_GROUND_CONTACT.paws]) {
    for (let side = 0; side < 16; side++) {
      const angle = side * Math.PI / 8;
      const localX = x + rx * Math.cos(angle), localZ = z + rz * Math.sin(angle);
      addGroundPoint(CAT_GROUND_CONTACT.position[0] + c * localX + s * localZ,
        CAT_GROUND_CONTACT.position[1] - s * localX + c * localZ);
    }
  }
  const target = new THREE.Vector3(0, DEFAULT_CAMERA_TARGET_Y, 0);
  const skyRotation = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationY(-config.background.rotation * Math.PI / 180));
  const { sky } = panorama(t);
  const captureOrigin = new THREE.Vector3().setFromMatrixPosition(sky.matrixWorld);
  const spherical = new THREE.Spherical(), direction = new THREE.Vector3();
  let checked = 0, minimumImageY = Infinity, maximumImageY = -Infinity;
  for (const [width, height] of [[390, 844], [844, 390], [768, 1024], [1440, 900], [1920, 1080]]) {
    const framing = getCameraFraming(width, height, fov);
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 500);
    for (const distance of [framing.minDistance, framing.defaultDistance, framing.maxDistance]) {
      for (const polar of [framing.minPolarAngle, Math.acos(0.09), framing.maxPolarAngle]) {
        for (let degrees = 0; degrees < 360; degrees += 15) {
          camera.position.setFromSpherical(new THREE.Spherical(distance, polar, degrees * Math.PI / 180)).add(target);
          for (const point of contactPoints) {
            direction.copy(point).sub(captureOrigin).applyMatrix3(skyRotation).normalize();
            const imageY = spherical.setFromVector3(direction).phi / Math.PI;
            assert.ok(imageY >= clearing.minImageY && imageY <= 1,
              `a root/paw contact left the annotated snow: ${width}×${height}, azimuth=${degrees}, polar=${polar}, distance=${distance}, sourceY=${imageY}`);
            minimumImageY = Math.min(minimumImageY, imageY); maximumImageY = Math.max(maximumImageY, imageY);
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 139320);
  t.diagnostic(JSON.stringify({ sourceSha256: clearing.sha256, checked, minimumImageY, maximumImageY,
    minimumSnowMarginNativePixels: (minimumImageY - clearing.minImageY) * metadata.height }));
});
