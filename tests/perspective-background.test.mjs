import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const resolveImports = (code, aliases = {}) => code.replace(/from\s+(['"])([^'"]+)\1/g,
  (_match, _quote, name) => `from ${JSON.stringify(aliases[name] ?? import.meta.resolve(name))}`);
const paths = ['scene/camera-framing.ts', 'scene/camera-orbit.ts', 'scene/tree-profile.ts',
  'scene/perspective-background.ts', 'lib/content.ts', 'scene/NightBackground.tsx'];
const sources = await Promise.all(paths.map(path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')));
const framingUrl = moduleUrl(compile(sources[0]));
const orbitUrl = moduleUrl(resolveImports(compile(sources[1])));
const profileUrl = moduleUrl(compile(sources[2]));
const placementUrl = moduleUrl(resolveImports(compile(sources[3]), {
  './camera-framing': framingUrl, './camera-orbit': orbitUrl, './tree-profile': profileUrl,
}));
const { getCameraFraming } = await import(framingUrl);
const { PERSPECTIVE_CAMERA_LIMITS, createCameraArcController } = await import(orbitUrl);
const { DEFAULT_CAMERA_TARGET_Y, GROUND_Y, TREE_RADIUS, TREE_OFFSET_Y, FOLIAGE_BOTTOM } = await import(profileUrl);
const { getPerspectiveBackgroundPlacement, PERSPECTIVE_BACKGROUND_Z } = await import(placementUrl);
const compositeUrl = moduleUrl(resolveImports(compile(await readFile(
  new URL('../src/scene/ground-composite.ts', import.meta.url), 'utf8',
))));
const contentUrl = moduleUrl(compile(sources[4]));
const panelsUrl = moduleUrl(resolveImports(compile(await readFile(
  new URL('../src/scene/panorama-panels.ts', import.meta.url), 'utf8',
)), { '../lib/content': contentUrl, './ground-composite': compositeUrl }));
// Exercise the actual plane factory, with its real render callback, without a
// GPU or React mount. As in the existing scene tests, expose the private helper.
const { createPerspectiveBackground } = await import(moduleUrl(resolveImports(
  compile(`${sources[5]}\nexport { createPerspectiveBackground };`),
  { '../lib/content': contentUrl, './perspective-background': placementUrl,
    './ground-composite': compositeUrl, './panorama-panels': panelsUrl, './tree-profile': profileUrl },
)));

const IMAGE_WIDTH = 1774;
const IMAGE_HEIGHT = 887;
const IMAGE_ASPECT = IMAGE_WIDTH / IMAGE_HEIGHT;
// Preserve the last visually approved perspective fixture. The production
// scene now uses a true 360-degree panorama with a different framing model.
const FOCUS = [0.83, 0.20];
const ORDINARY_VIEWPORTS = [[390, 844], [844, 390], [768, 1024], [1440, 900], [1920, 1080]];
const VIEWPORTS = [[390, 844], [844, 390], [768, 1024], [1024, 768], [1440, 900],
  [1920, 1080], [2560, 1080], [5120, 1440], [1000, 1000], [1774, 887], [200, 1000], [5000, 1000]];
const UNUSUAL_VIEWPORTS = [[100, 1000], [6000, 1000]];
const target = new THREE.Vector3(0, DEFAULT_CAMERA_TARGET_Y, 0);
const initialPolar = Math.acos(0.09);

function cameraFor(width, height, distance, azimuth = 0, polar = initialPolar) {
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
  camera.position.setFromSpherical(new THREE.Spherical(distance, polar, azimuth)).add(target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

function intersectPicture(camera, placement, ndcX, ndcY) {
  // Independent of the fitter's trigonometry: obtain the ray from Three's
  // actual projection and world matrices, then intersect the world Z plane.
  const ray = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
  const travel = (placement.z - camera.position.z) / ray.z;
  assert.ok(Number.isFinite(travel) && travel > 0, 'the picture must be in front of every allowed view ray');
  const world = camera.position.clone().addScaledVector(ray, travel);
  return new THREE.Vector2((world.x - placement.x) / placement.width + 0.5,
    (world.y - placement.y) / placement.height + 0.5);
}

function placedPicture(t, width, height, focus = FOCUS) {
  const texture = new THREE.Texture();
  const picture = createPerspectiveBackground(texture);
  const placement = getPerspectiveBackgroundPlacement(width, height, IMAGE_ASPECT, focus);
  picture.position.set(placement.x, placement.y, placement.z);
  picture.scale.set(placement.width, placement.height, 1);
  picture.updateMatrixWorld();
  t.after(() => { picture.geometry.dispose(); picture.material.dispose(); texture.dispose(); });
  return { picture, placement };
}

test('all allowed viewport corners stay inside the picture at boundary and off-grid camera poses', () => {
  const limits = PERSPECTIVE_CAMERA_LIMITS;
  const azimuthFractions = [0, 0.003, 0.081, 0.233, 0.487, 0.5, 0.697, 0.911, 0.997, 1];
  const polarFractions = [0, 0.007, 0.193, 0.377,
    (initialPolar - limits.minPolarAngle) / (limits.maxPolarAngle - limits.minPolarAngle), 0.691, 0.923, 0.999, 1];
  for (const [width, height] of [...VIEWPORTS, ...UNUSUAL_VIEWPORTS]) {
    const placement = getPerspectiveBackgroundPlacement(width, height, IMAGE_ASPECT, FOCUS);
    const framing = getCameraFraming(width, height);
    const distances = [framing.minDistance, framing.defaultDistance, framing.maxDistance,
      framing.minDistance * 0.413 + framing.maxDistance * 0.587];
    for (const a of azimuthFractions) for (const p of polarFractions) for (const distance of distances) {
      const azimuth = THREE.MathUtils.lerp(limits.minAzimuthAngle, limits.maxAzimuthAngle, a);
      const polar = THREE.MathUtils.lerp(limits.minPolarAngle, limits.maxPolarAngle, p);
      const camera = cameraFor(width, height, distance, azimuth, polar);
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        const uv = intersectPicture(camera, placement, x, y);
        assert.ok(uv.x > 0 && uv.x < 1 && uv.y > 0 && uv.y < 1,
          `${width}×${height}, azimuth=${azimuth}, polar=${polar}, distance=${distance}, corner=(${x},${y}): UV=${uv.toArray()}`);
      }
    }
  }
});

test('all focus endpoints retain corner coverage without stretching the native picture', t => {
  for (const [width, height] of [[390, 844], [1440, 900], [200, 1000], [5000, 1000], ...UNUSUAL_VIEWPORTS]) {
    for (const focus of [[0, 0], [0, 1], [1, 0], [1, 1], FOCUS]) {
      const { picture, placement } = placedPicture(t, width, height, focus);
      assert.equal(placement.width / placement.height, IMAGE_ASPECT);
      assert.equal(placement.width / IMAGE_WIDTH, placement.height / IMAGE_HEIGHT,
        'each source pixel has the same world scale horizontally and vertically');
      assert.equal(placement.z, PERSPECTIVE_BACKGROUND_Z);
      const origin = picture.localToWorld(new THREE.Vector3(-0.5, -0.5, 0));
      const right = picture.localToWorld(new THREE.Vector3(0.5, -0.5, 0));
      const top = picture.localToWorld(new THREE.Vector3(-0.5, 0.5, 0));
      assert.ok(Math.abs(origin.distanceTo(right) / origin.distanceTo(top) - IMAGE_ASPECT) < 1e-12);
      for (const distance of [getCameraFraming(width, height).minDistance, getCameraFraming(width, height).maxDistance]) {
        for (const azimuth of [PERSPECTIVE_CAMERA_LIMITS.minAzimuthAngle, PERSPECTIVE_CAMERA_LIMITS.maxAzimuthAngle]) {
          for (const polar of [PERSPECTIVE_CAMERA_LIMITS.minPolarAngle, PERSPECTIVE_CAMERA_LIMITS.maxPolarAngle]) {
            const camera = cameraFor(width, height, distance, azimuth, polar);
            for (const x of [-1, 1]) for (const y of [-1, 1]) {
              const uv = intersectPicture(camera, placement, x, y);
              assert.ok(uv.x > 0 && uv.x < 1 && uv.y > 0 && uv.y < 1,
                `${width}×${height}, focus=${focus}: UV=${uv.toArray()}`);
            }
          }
        }
      }
    }
  }
});

test('moving, pitching and dollying the camera never moves or billboards the world picture', t => {
  const { picture, placement } = placedPicture(t, 390, 844);
  const scene = new THREE.Scene();
  scene.add(picture);
  scene.updateMatrixWorld(true);
  const transform = picture.matrixWorld.toArray();
  const framing = getCameraFraming(390, 844);
  for (const azimuth of [0, -0.071, 0.123, PERSPECTIVE_CAMERA_LIMITS.minAzimuthAngle, PERSPECTIVE_CAMERA_LIMITS.maxAzimuthAngle]) {
    for (const polar of [1.42, initialPolar, 1.54]) for (const distance of [framing.minDistance, framing.maxDistance]) {
      const camera = cameraFor(390, 844, distance, azimuth, polar);
      picture.onBeforeRender(null, scene, camera, picture.geometry, picture.material, null);
      scene.updateMatrixWorld(true);
      assert.deepEqual(picture.matrixWorld.toArray(), transform);
      assert.deepEqual(getPerspectiveBackgroundPlacement(390, 844, IMAGE_ASPECT, FOCUS), placement,
        'refitting the same viewport must not use the current camera pose');
    }
  }
});

test('straight source-image lines stay straight through the actual perspective camera', t => {
  const lines = [[[0.1, 0.2], [0.9, 0.2]], [[0.765, 0.15], [0.765, 0.9]], [[0.2, 0.15], [0.9, 0.85]]];
  for (const [width, height] of [[390, 844], [1440, 900], [200, 1000], [5000, 1000], ...UNUSUAL_VIEWPORTS]) {
    const { picture } = placedPicture(t, width, height);
    const framing = getCameraFraming(width, height);
    for (const [azimuth, polar] of [[0, initialPolar], [-0.133, 1.423], [0.127, 1.537]]) {
      for (const distance of [framing.minDistance, framing.defaultDistance, framing.maxDistance]) {
        const camera = cameraFor(width, height, distance, azimuth, polar);
        const projectUv = uv => picture.localToWorld(new THREE.Vector3(uv[0] - 0.5, uv[1] - 0.5, 0)).project(camera);
        for (const [from, to] of lines) {
          const start = projectUv(from);
          const end = projectUv(to);
          const length = Math.hypot(end.x - start.x, end.y - start.y);
          for (const fraction of [0.07, 0.19, 0.37, 0.5, 0.71, 0.93]) {
            const point = projectUv([THREE.MathUtils.lerp(from[0], to[0], fraction), THREE.MathUtils.lerp(from[1], to[1], fraction)]);
            const distanceFromLine = Math.abs((end.x - start.x) * (point.y - start.y)
              - (end.y - start.y) * (point.x - start.x)) / length;
            assert.ok(distanceFromLine < 1e-11, 'a straight architectural edge must not curve under camera movement');
          }
        }
      }
    }
  }
});

test('the initial view retains the main spire and most source-image height on ordinary screens', () => {
  for (const [width, height] of ORDINARY_VIEWPORTS) {
    const placement = getPerspectiveBackgroundPlacement(width, height, IMAGE_ASPECT, FOCUS);
    const camera = cameraFor(width, height, getCameraFraming(width, height).defaultDistance);
    // Visually measured tip in castle-courtyard-grounded.webp. The earlier
    // (0.765, 0.6) coordinate was neither this image's tip nor its new framing.
    // UV uses the image's bottom edge: source top-origin y is about 0.154.
    const spire = new THREE.Vector3(placement.x + (0.732 - 0.5) * placement.width,
      placement.y + (0.846 - 0.5) * placement.height, placement.z).project(camera);
    assert.ok(Math.abs(spire.x) <= 0.98 && Math.abs(spire.y) <= 0.98,
      `${width}×${height}: the actual spire tip needs a small margin inside the initial view`);
    if (width / height <= 2) {
      const bottom = intersectPicture(camera, placement, 0, -1);
      const top = intersectPicture(camera, placement, 0, 1);
      assert.ok(top.y - bottom.y > 0.65,
        `${width}×${height}: vertical framing should show most of the photo, not the old quarter-height spherical crop`);
    }
  }
});

test('background flow near the root stays comparable to front-canopy flow under the same camera motion', t => {
  // This checks perceived motion near the tree. Off-axis architecture can
  // legitimately move at a different screen speed under perspective.
  for (const [width, height] of ORDINARY_VIEWPORTS) {
    const { picture, placement } = placedPicture(t, width, height);
    const camera = cameraFor(width, height, getCameraFraming(width, height).defaultDistance);
    const root = new THREE.Vector3(0, GROUND_Y, 0);
    const frontCanopy = new THREE.Vector3(0, TREE_OFFSET_Y + FOLIAGE_BOTTOM, TREE_RADIUS);
    // Select the actual background pixel lying behind the root in the initial
    // view, then leave it fixed in world space for the entire camera movement.
    const ray = root.clone().sub(camera.position);
    const backgroundPoint = camera.position.clone()
      .addScaledVector(ray, (placement.z - camera.position.z) / ray.z);
    const sourcePoint = picture.worldToLocal(backgroundPoint.clone());
    assert.ok(Math.abs(sourcePoint.x) < 0.5 && Math.abs(sourcePoint.y) < 0.5,
      'the motion sample must belong to the actual picture');
    const relativeScreenX = point => (point.clone().project(camera).x - root.clone().project(camera).x) * width / 2;
    const beforeBackground = relativeScreenX(backgroundPoint);
    const beforeCanopy = relativeScreenX(frontCanopy);
    const controller = createCameraArcController();
    for (let frame = 0; frame < 120; frame++) {
      controller.update(camera, target, 1 / 60, true);
      camera.updateMatrixWorld();
    }
    const backgroundTravel = Math.abs(relativeScreenX(backgroundPoint) - beforeBackground);
    const canopyTravel = Math.abs(relativeScreenX(frontCanopy) - beforeCanopy);
    assert.ok(backgroundTravel > 0 && canopyTravel > 0, 'both samples must respond to the same moving camera');
    const disparity = backgroundTravel / canopyTravel;
    assert.ok(disparity >= 0.5 && disparity <= 2,
      `${width}×${height}: nearby background/foliage motion ratio ${disparity} recreates the visibly detached background drift`);
  }
});
