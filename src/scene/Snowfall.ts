import * as THREE from 'three';
import { GROUND_Y } from './tree-profile';

const PADDING = 1.2;

const vertexShader = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uViewportHeight;
  uniform vec2 uDepth;
  uniform float uGround;
  attribute vec3 aDetails;
  attribute float aAge;
  varying float vAlpha;
  varying float vSoftness;
  varying float vWarmth;
  varying float vShape;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 viewPos = viewMatrix * worldPos;
    float depth = max(0.1, -viewPos.z);
    float focalPixels = uViewportHeight * projectionMatrix[1][1] * 0.5;
    float diameter = (0.045 + aDetails.x * 0.055) * focalPixels / depth;
    // A few close flakes fall out of focus; distant snow stays subpixel-fine.
    vSoftness = 1.0 - smoothstep(4.0, 18.0, depth);
    gl_PointSize = clamp(diameter + vSoftness * 4.5, 0.8, 18.0) * uPixelRatio;
    gl_Position = projectionMatrix * viewPos;
    float nearFade = smoothstep(uDepth.x, uDepth.x + 1.4, depth);
    float farFade = 1.0 - smoothstep(uDepth.y * 0.78, uDepth.y, depth);
    float groundFade = smoothstep(uGround + 0.02, uGround + 0.55, worldPos.y);
    float fineFade = clamp(diameter / 0.8, 0.18, 1.0);
    vAlpha = (0.44 + aDetails.y * 0.3) * mix(1.0, 0.24, vSoftness)
      * nearFade * farFade * groundFade * fineFade * smoothstep(0.0, 0.32, aAge);
    // Soft warm reflection near the tree, blue moonlight elsewhere. Neither
    // colour reaches HDR bloom, so snow does not turn into glowing confetti.
    vec3 toTree = worldPos.xyz - vec3(0.0, -6.0, 0.0);
    vWarmth = exp(-dot(toTree, toTree) / 260.0) * 0.7;
    vShape = aDetails.z;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uCoolColor;
  uniform vec3 uWarmColor;
  varying float vAlpha;
  varying float vSoftness;
  varying float vWarmth;
  varying float vShape;
  void main() {
    vec2 point = (gl_PointCoord - vec2(0.5)) * 2.0;
    point.x *= 1.05 + vShape * 0.3;
    float radius2 = dot(point, point);
    if (radius2 > 1.0) discard;
    float edge = 1.0 - smoothstep(0.62, 1.0, radius2);
    float profile = exp(-radius2 * mix(3.8, 2.1, vSoftness)) * edge;
    gl_FragColor = vec4(mix(uCoolColor, uWarmColor, vWarmth), profile * vAlpha);
  }
`;

function randomSource(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** Move an offscreen particle across a boundary without clamping it to an edge. */
function wrap(value: number, minimum: number, maximum: number) {
  const span = maximum - minimum;
  return minimum + ((value - minimum) % span + span) % span;
}

/**
 * A bounded pool of world-space flakes, recycled outside the camera frustum.
 * It is independent of the tree's rotation and keeps real parallax on orbit.
 * Unlike the old 50-unit cube, the pool always surrounds the current camera;
 * its projection grows with viewport aspect, including very wide screens.
 */
export function createSnow(compact: boolean) {
  const count = compact ? 480 : 960;
  const random = randomSource(0xdec028);
  const positions = new Float32Array(count * 3);
  const details = new Float32Array(count * 3);
  const ages = new Float32Array(count).fill(1);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    details[i * 3] = random();
    details[i * 3 + 1] = random();
    details[i * 3 + 2] = random();
    speeds[i] = 0.65 + random() * 0.95;
    phases[i] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const ageAttribute = new THREE.BufferAttribute(ages, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aDetails', new THREE.BufferAttribute(details, 3));
  geometry.setAttribute('aAge', ageAttribute);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uViewportHeight: { value: 800 },
      uDepth: { value: new THREE.Vector2(2.2, 120) },
      uGround: { value: GROUND_Y },
      uCoolColor: { value: new THREE.Color('#c6d6e7') },
      uWarmColor: { value: new THREE.Color('#f6e6ca') },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'world-space-snowfall';
  // A static bounding sphere cannot describe a camera-following volume.
  points.frustumCulled = false;
  const viewPoint = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  const columns = 6;
  const rows = 4;
  const cells: number[][] = Array.from({ length: columns * rows }, () => []);
  const offscreen: number[] = [];
  const minimumPerCell = compact ? 3 : 6;
  let time = 0;
  let previousWidth = 0;
  let previousHeight = 0;
  let near = 2.2;
  let far = 120;

  function update(camera: THREE.PerspectiveCamera, width: number, height: number, pixelRatio: number, delta: number) {
    const step = Math.min(Math.max(delta, 0), 0.06);
    time += step;
    camera.updateMatrixWorld();
    const tanX = 1 / camera.projectionMatrix.elements[0];
    const tanY = 1 / camera.projectionMatrix.elements[5];
    const resized = width !== previousWidth || height !== previousHeight;
    if (resized) {
      previousWidth = width;
      previousHeight = height;
      near = Math.max(2.2, camera.near * 4);
      // Keep this span fixed during wheel/pinch zoom. Translating through it
      // then wraps far flakes into the foreground instead of shrinking all
      // of the snow into the centre of the screen with the tree.
      far = Math.max(near + 20, Math.min(camera.far * 0.8, Math.max(110, camera.position.length() * 1.7 + 15)));
      material.uniforms.uDepth.value.set(near, far);
    }
    material.uniforms.uViewportHeight.value = Math.max(1, height);
    material.uniforms.uPixelRatio.value = pixelRatio;
    cells.forEach(cell => { cell.length = 0; });
    offscreen.length = 0;

    /** Place a flake on a view ray, stopping before that ray meets the ground. */
    function place(nx: number, ny: number, depth: number) {
      const matrix = camera.matrixWorld.elements;
      const rayY = matrix[1] * nx * tanX + matrix[5] * ny * tanY - matrix[9];
      const groundDepth = rayY < -0.0001 ? (camera.position.y - GROUND_Y - 0.6) / -rayY : far;
      const allowedFar = Math.max(near, Math.min(far, groundDepth));
      // Compress the available depth interval rather than clamping a whole
      // row of flakes onto the same horizontal ground surface.
      const safeDepth = near + (depth - near) / (far - near) * (allowedFar - near);
      viewPoint.set(nx * tanX * safeDepth, ny * tanY * safeDepth, -safeDepth);
      worldPoint.copy(viewPoint).applyMatrix4(camera.matrixWorld);
    }

    for (let i = 0; i < count; i++) {
      const offset = i * 3;
      if (resized) {
        // Uniform screen coverage at many actual depths, not a sheet of
        // screen-space sprites. Refill after an orientation/viewport change.
        place((random() * 2 - 1) * PADDING, (random() * 2 - 1) * PADDING, near + random() * (far - near));
        ages[i] = 1;
      } else {
        worldPoint.set(
          positions[offset] + (0.18 + Math.sin(time * 0.28 + phases[i]) * 0.12) * step,
          positions[offset + 1] - speeds[i] * step,
          positions[offset + 2] + Math.cos(time * 0.21 + phases[i]) * 0.09 * step,
        );
        viewPoint.copy(worldPoint).applyMatrix4(camera.matrixWorldInverse);
        let depth = -viewPoint.z;
        let moved = false;
        if (depth < near || depth > far) {
          depth = wrap(depth, near, far);
          viewPoint.z = -depth;
          ages[i] = step > 0 ? 0 : 1;
          moved = true;
        }
        const halfWidth = depth * tanX * PADDING;
        const halfHeight = depth * tanY * PADDING;
        if (Math.abs(viewPoint.x) > halfWidth) {
          viewPoint.x = wrap(viewPoint.x, -halfWidth, halfWidth);
          moved = true;
        }
        if (Math.abs(viewPoint.y) > halfHeight) {
          viewPoint.y = wrap(viewPoint.y, -halfHeight, halfHeight);
          moved = true;
        }
        if (moved) worldPoint.copy(viewPoint).applyMatrix4(camera.matrixWorld);
        if (worldPoint.y < GROUND_Y + 0.05) {
          // Re-enter beyond the top edge after gently fading into the snow.
          place((random() * 2 - 1) * PADDING, PADDING, near + random() * (far - near));
        }
        ages[i] = Math.min(1, ages[i] + step);
      }
      worldPoint.toArray(positions, offset);
      const nx = viewPoint.x / (-viewPoint.z * tanX);
      const ny = viewPoint.y / (-viewPoint.z * tanY);
      if (nx > -1 && nx < 1 && ny > -1 && ny < 1) {
        cells[Math.floor((ny + 1) * rows / 2) * columns + Math.floor((nx + 1) * columns / 2)].push(i);
      } else {
        offscreen.push(i);
      }
    }

    // A large dolly/orbit can bring every old flake into the centre at once.
    // Refill only sparse areas from offscreen/overcrowded ones, preserving the
    // world motion of the rest. This bounds both the pool and visible density
    // without exposing an empty border while waiting for new snow to fall in.
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cell = cells[cellIndex];
      while (cell.length < minimumPerCell) {
        let donor = offscreen;
        if (donor.length === 0) {
          donor = cells.reduce((largest, candidate) => candidate.length > largest.length ? candidate : largest, cell);
          if (donor.length <= minimumPerCell) break;
        }
        const index = donor.pop()!;
        const nx = -1 + (cellIndex % columns + random()) * 2 / columns;
        const ny = -1 + (Math.floor(cellIndex / columns) + random()) * 2 / rows;
        place(nx, ny, near + random() ** 1.5 * (far - near));
        worldPoint.toArray(positions, index * 3);
        ages[index] = step > 0 ? 0 : 1;
        cell.push(index);
      }
    }
    positionAttribute.needsUpdate = true;
    ageAttribute.needsUpdate = true;
  }

  return {
    points,
    update,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
