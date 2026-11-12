import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';
import sharp from 'sharp';

const source = await readFile(new URL('../src/scene/ground-composite.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  fileName: 'ground-composite.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const executable = outputText.replace(/from\s+(['"])three\1/g, `from ${JSON.stringify(import.meta.resolve('three'))}`);
const { createProjectiveGroundMaterial, bindProjectiveGroundMaterial } = await import(
  'data:text/javascript;base64,' + Buffer.from(executable).toString('base64'),
);

function photograph(t) {
  const texture = new THREE.DataTexture(new Uint8Array([
    122, 147, 191, 255, 172, 190, 218, 255,
    75, 89, 110, 255, 228, 201, 145, 255,
  ]), 2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: { picture: { value: texture }, brightness: { value: 0.92 } },
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(-65, -40, -280);
  mesh.scale.set(650, 325, 1);
  mesh.updateMatrixWorld();
  t.after(() => { geometry.dispose(); material.dispose(); texture.dispose(); });
  return { mesh, texture };
}

function receiver(t, assembly) {
  const material = createProjectiveGroundMaterial(assembly);
  t.after(() => material.dispose());
  return material;
}

test('the receiver starts gated and preserves opaque depth occlusion without scene lighting', t => {
  const assembly = { value: 0.4 };
  const material = receiver(t, assembly);
  assert.ok(material.isShaderMaterial);
  assert.equal(material.uniforms.uPhotoReady.value, 0);
  assert.equal(material.uniforms.uPhoto.value, null);
  assert.equal(material.transparent, false, 'a feathered translucent pad would reintroduce a halo');
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, true, 'the receiver must hide the buried root surfaces');
  assert.equal(material.lights, false, 'the background photograph must not receive a second exposure from scene lights');
  assert.equal(material.fog, false);
  assert.strictEqual(material.uniforms.uGroundAssembly, assembly);
  assembly.value = 0;
  assert.equal(material.uniforms.uGroundAssembly.value, 0, 'disassembly must clear contact shading without rebuilding the material');
});

test('binding borrows the exact image and exposure and follows the entire background world transform', t => {
  const { mesh, texture } = photograph(t);
  const material = receiver(t);
  const parent = new THREE.Group();
  parent.position.set(3, 7, -4);
  parent.rotation.set(0.025, -0.035, 0.01);
  parent.add(mesh);
  const referencePoints = [new THREE.Vector3(-0.4, -0.3, 0), new THREE.Vector3(0.1, 0.35, 0), new THREE.Vector3(0.33, -0.17, 2)];
  for (let pass = 0; pass < 3; pass++) {
    mesh.position.x += pass * 17;
    mesh.scale.set(650 + pass * 90, 325 + pass * 45, 1);
    mesh.material.uniforms.brightness.value = 0.92 - pass * 0.17;
    parent.updateMatrixWorld(true);
    assert.equal(bindProjectiveGroundMaterial(material, mesh), true);
    assert.equal(material.uniforms.uPhotoReady.value, 1);
    assert.strictEqual(material.uniforms.uPhoto.value, texture);
    assert.equal(material.uniforms.uPhotoBrightness.value, mesh.material.uniforms.brightness.value);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.equal(texture.anisotropy, 8);
    for (const local of referencePoints) {
      const world = mesh.localToWorld(local.clone());
      const restored = world.applyMatrix4(material.uniforms.uPhotoWorldToLocal.value);
      assert.ok(restored.distanceTo(local) < 1e-10, 'a parent transform or resized picture was omitted from the shader binding');
    }
  }
});

test('bound projection agrees with actual Three camera rays and picture UVs across ground and camera poses', t => {
  const { mesh } = photograph(t);
  const material = receiver(t);
  // These are CPU-to-shader binding tests. Ray/plane operations use Three's
  // independent geometry routines; they do not reimplement the fragment GLSL.
  const raycaster = new THREE.Raycaster();
  const localPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const localHit = new THREE.Vector3();
  const target = new THREE.Vector3(0, -6.5, 0);
  let checked = 0;
  for (const aspect of [390 / 844, 844 / 390, 1, 1.6, 32 / 9]) {
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
    for (const distance of [50, 67, 90]) for (const azimuth of [-8, -3, 0, 5, 8]) {
      for (const polar of [1.42, Math.acos(0.09), 1.54]) {
        camera.position.setFromSpherical(new THREE.Spherical(distance, polar, azimuth * Math.PI / 180)).add(target);
        camera.lookAt(target);
        camera.updateMatrixWorld();
        assert.equal(bindProjectiveGroundMaterial(material, mesh), true);
        for (const x of [-3, -1, 0, 1, 3]) for (const z of [-3, 0, 3]) {
          const point = new THREE.Vector3(x, -20.5 + 0.1 * Math.sin(x + z), z);
          const ndc = point.clone().project(camera);
          raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
          const expected = raycaster.intersectObject(mesh, false)[0];
          assert.ok(expected?.uv, 'the ground ray must intersect the actual picture geometry');
          const localRay = raycaster.ray.clone().applyMatrix4(material.uniforms.uPhotoWorldToLocal.value);
          assert.ok(localRay.intersectPlane(localPlane, localHit));
          const boundUv = new THREE.Vector2(localHit.x + 0.5, localHit.y + 0.5);
          assert.ok(boundUv.distanceTo(expected.uv) < 1e-10,
            `camera aspect=${aspect}, distance=${distance}, azimuth=${azimuth}, polar=${polar}, ground=(${x},${z})`);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, 3375);
});

test('an absent or unloaded background clears stale image bindings until a picture is ready', t => {
  const { mesh, texture } = photograph(t);
  const material = receiver(t);
  assert.equal(bindProjectiveGroundMaterial(material, null), false);
  assert.equal(material.uniforms.uPhotoReady.value, 0);
  assert.equal(bindProjectiveGroundMaterial(material, mesh), true);
  assert.strictEqual(material.uniforms.uPhoto.value, texture);
  mesh.material.uniforms.picture.value = null;
  assert.equal(bindProjectiveGroundMaterial(material, mesh), false);
  assert.equal(material.uniforms.uPhoto.value, null);
  assert.equal(material.uniforms.uPhotoReady.value, 0);
  mesh.material.uniforms.picture.value = texture;
  assert.equal(bindProjectiveGroundMaterial(material, mesh), true);
  assert.equal(material.uniforms.uPhotoReady.value, 1);
  assert.equal(bindProjectiveGroundMaterial(material, null), false);
  assert.equal(material.uniforms.uPhotoReady.value, 0);
  assert.equal(material.uniforms.uPhoto.value, null);
});

test('rebinding and disposing a receiver never disposes the borrowed background resources', t => {
  const first = photograph(t);
  const second = photograph(t);
  const material = createProjectiveGroundMaterial();
  const disposed = { textures: 0, geometries: 0, materials: 0 };
  for (const { mesh, texture } of [first, second]) {
    texture.addEventListener('dispose', () => disposed.textures++);
    mesh.geometry.addEventListener('dispose', () => disposed.geometries++);
    mesh.material.addEventListener('dispose', () => disposed.materials++);
  }
  assert.equal(bindProjectiveGroundMaterial(material, first.mesh), true);
  assert.equal(bindProjectiveGroundMaterial(material, second.mesh), true);
  assert.strictEqual(material.uniforms.uPhoto.value, second.texture);
  assert.equal(bindProjectiveGroundMaterial(material, null), false);
  material.dispose();
  assert.deepEqual(disposed, { textures: 0, geometries: 0, materials: 0 });
  assert.strictEqual(first.mesh.material.uniforms.picture.value, first.texture);
  assert.strictEqual(second.mesh.material.uniforms.picture.value, second.texture);
});

test('the retained perspective scene keeps root contacts inside its visually approved snow clearing', async t => {
  // This region was annotated after visually inspecting this exact source.
  // It is not inferred from pixel colours: replacing the image requires a new
  // visual review before its safe snow region can be trusted by this test.
  const clearing = {
    image: 'backgrounds/castle-courtyard-grounded.webp',
    sha256: 'e74966fefb69da24016e02df394a8c497d442de5d9db117f8cc1eea791bc7ade',
    minX: 0.20, maxX: 0.90, minY: 0.52, maxY: 1,
  };
  // This remains a supported legacy projection. The active 360-degree scene
  // has its own full-orbit snow-clearing validation in panorama-ground.test.
  const config = { background: { projection: 'perspective', image: clearing.image, focus: [0.83, 0.20] } };
  assert.equal(config.background.projection, 'perspective');
  assert.equal(config.background.image, clearing.image, 'inspect and annotate the replacement background before changing this fixture');
  const bytes = await readFile(new URL('../public/' + config.background.image, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), clearing.sha256,
    'the background changed; the manually verified snow bounds need a new visual review');
  const { width: imageWidth, height: imageHeight } = await sharp(bytes).metadata();
  assert.ok(imageWidth > 0 && imageHeight > 0);

  const productionModule = async (path, aliases = {}) => {
    const contents = await readFile(new URL('../src/scene/' + path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(contents, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText.replace(/from\s+(['"])([^'"]+)\1/g,
      (_match, _quote, name) => `from ${JSON.stringify(aliases[name] ?? import.meta.resolve(name))}`);
    return 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
  };
  const profileUrl = await productionModule('tree-profile.ts');
  const framingUrl = await productionModule('camera-framing.ts');
  const orbitUrl = await productionModule('camera-orbit.ts');
  const baseUrl = await productionModule('tree-base.ts', { './tree-profile': profileUrl });
  const placementUrl = await productionModule('perspective-background.ts', {
    './tree-profile': profileUrl, './camera-framing': framingUrl, './camera-orbit': orbitUrl,
  });
  const { GROUND_Y, DEFAULT_CAMERA_TARGET_Y } = await import(profileUrl);
  const { getCameraFraming } = await import(framingUrl);
  const { PERSPECTIVE_CAMERA_LIMITS: limits } = await import(orbitUrl);
  const { snowHeightAt } = await import(baseUrl);
  const { getPerspectiveBackgroundPlacement } = await import(placementUrl);
  // Read the actual Canvas field of view so changing the production camera
  // cannot silently leave this composition check on an obsolete test camera.
  const sceneSource = await readFile(new URL('../src/scene/TreeScene.tsx', import.meta.url), 'utf8');
  const sceneAst = ts.createSourceFile('TreeScene.tsx', sceneSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fov;
  const findCamera = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(sceneAst) === 'camera'
      && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && ts.isObjectLiteralExpression(node.initializer.expression)) {
      for (const property of node.initializer.expression.properties) {
        if (ts.isPropertyAssignment(property) && property.name.getText(sceneAst) === 'fov'
          && ts.isNumericLiteral(property.initializer)) fov = Number(property.initializer.text);
      }
    }
    ts.forEachChild(node, findCamera);
  };
  findCamera(sceneAst);
  assert.ok(Number.isFinite(fov), 'resolve the production camera FOV if its configuration moves');
  const contactPoints = [new THREE.Vector3(0, GROUND_Y + snowHeightAt(0, 0), 0)];
  for (const radius of [0.5, 1, 1.4, 1.8]) for (let side = 0; side < 16; side++) {
    const angle = (side + 0.13) * Math.PI * 2 / 16;
    const x = radius * Math.cos(angle), z = radius * Math.sin(angle);
    contactPoints.push(new THREE.Vector3(x, GROUND_Y + snowHeightAt(x, z), z));
  }
  const target = new THREE.Vector3(0, DEFAULT_CAMERA_TARGET_Y, 0);
  const raycaster = new THREE.Raycaster();
  const { mesh } = photograph(t);
  let checked = 0;
  for (const [width, height] of [[390, 844], [844, 390], [768, 1024], [1440, 900], [1920, 1080]]) {
    const placement = getPerspectiveBackgroundPlacement(width, height, imageWidth / imageHeight, config.background.focus, fov);
    mesh.position.set(placement.x, placement.y, placement.z);
    mesh.scale.set(placement.width, placement.height, 1);
    mesh.updateMatrixWorld();
    const framing = getCameraFraming(width, height, fov);
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 500);
    const distances = [framing.minDistance, framing.defaultDistance, framing.maxDistance,
      THREE.MathUtils.lerp(framing.minDistance, framing.maxDistance, 0.37)];
    const polars = [limits.minPolarAngle, limits.maxPolarAngle, Math.acos(0.09),
      THREE.MathUtils.lerp(limits.minPolarAngle, limits.maxPolarAngle, 0.21),
      THREE.MathUtils.lerp(limits.minPolarAngle, limits.maxPolarAngle, 0.83)];
    for (const fraction of [0, 0.17, 0.5, 0.77, 1]) for (const polar of polars) for (const distance of distances) {
      const azimuth = THREE.MathUtils.lerp(limits.minAzimuthAngle, limits.maxAzimuthAngle, fraction);
      camera.position.setFromSpherical(new THREE.Spherical(distance, polar, azimuth)).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      for (const point of contactPoints) {
        const ndc = point.clone().project(camera);
        raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        const hit = raycaster.intersectObject(mesh, false)[0];
        assert.ok(hit?.uv, 'a root contact ray escaped the actual background plane');
        const imageX = hit.uv.x, imageY = 1 - hit.uv.y; // Source image origin is its top-left corner.
        assert.ok(imageX >= clearing.minX && imageX <= clearing.maxX
          && imageY > clearing.minY && imageY <= clearing.maxY,
        `root contact landed outside snow: viewport=${width}×${height}, distance=${distance}, azimuth=${azimuth}, polar=${polar}, image=(${imageX},${imageY})`);
        checked++;
      }
    }
  }
  assert.equal(checked, 32500);
});
