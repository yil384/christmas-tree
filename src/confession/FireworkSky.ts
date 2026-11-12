import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage,
  PerspectiveCamera, Points, ShaderMaterial, Vector3,
} from 'three';

export interface FireworkBurst {
  id: number;
  /** Canvas coordinates, 0…1. */
  x: number;
  y: number;
  power?: number;
}

type Rocket = {
  start: Vector3;
  target: Vector3;
  previous: Vector3;
  age: number;
  duration: number;
  power: number;
  color: Color;
};

const CAPACITY = 1600;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const palette = [new Color('#ffd9a1'), new Color('#f4a9d2'), new Color('#bedfff')];

/** One draw call and a fixed pool; tapping repeatedly cannot grow GPU memory. */
export function makeFireworkSky() {
  const positions = new Float32Array(CAPACITY * 3);
  const velocities = new Float32Array(CAPACITY * 3);
  const colors = new Float32Array(CAPACITY * 3);
  const sizes = new Float32Array(CAPACITY);
  const alphas = new Float32Array(CAPACITY);
  const life = new Float32Array(CAPACITY);
  const duration = new Float32Array(CAPACITY);
  const gravity = new Float32Array(CAPACITY);
  const drag = new Float32Array(CAPACITY);
  const geometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const colorAttribute = new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage);
  const sizeAttribute = new BufferAttribute(sizes, 1).setUsage(DynamicDrawUsage);
  const alphaAttribute = new BufferAttribute(alphas, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('particleColor', colorAttribute);
  geometry.setAttribute('particleSize', sizeAttribute);
  geometry.setAttribute('particleAlpha', alphaAttribute);
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: { uDpr: { value: 1 } },
    vertexShader: `
      attribute vec3 particleColor;
      attribute float particleSize;
      attribute float particleAlpha;
      uniform float uDpr;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vColor = particleColor;
        vAlpha = particleAlpha;
        gl_PointSize = clamp(particleSize * uDpr * 12.0 / max(1.0, -p.z), 1.0, 25.0 * uDpr);
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 p = (gl_PointCoord - 0.5) * 2.0;
        float r = dot(p, p);
        if (r > 1.0 || vAlpha < 0.005) discard;
        float glow = exp(-r * 6.5);
        float core = exp(-r * 29.0);
        gl_FragColor = vec4(mix(vColor, vec3(1.0, 0.97, 0.9), core * 0.48), (glow * 0.62 + core * 0.55) * vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const object = new Points(geometry, material);
  object.frustumCulled = false;
  const rockets: Rocket[] = [];
  const temp = new Vector3();
  const origin = new Vector3();
  let cursor = 0;
  let alive = 0;
  let elapsed = 0;
  let colorDirty = false;

  const particle = (
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color: Color, size: number, seconds: number, fall: number, resistance: number,
  ) => {
    const i = cursor;
    cursor = (cursor + 1) % CAPACITY;
    const j = i * 3;
    positions[j] = x; positions[j + 1] = y; positions[j + 2] = z;
    velocities[j] = vx; velocities[j + 1] = vy; velocities[j + 2] = vz;
    colors[j] = color.r; colors[j + 1] = color.g; colors[j + 2] = color.b;
    sizes[i] = size;
    life[i] = seconds;
    duration[i] = seconds;
    gravity[i] = fall;
    drag[i] = resistance;
    alphas[i] = 0;
    colorDirty = true;
  };

  const explode = (target: Vector3, power: number, color: Color, reduced: boolean) => {
    const count = Math.round(reduced ? 75 + power * 25 : 180 + power * 140);
    const spread = 1.05 + power * 0.82;
    // A Fibonacci sphere gives an even, full chrysanthemum in genuine 3D.
    for (let i = 0; i < count; i++) {
      const latitude = 1 - 2 * (i + 0.5) / count;
      const ringRadius = Math.sqrt(Math.max(0, 1 - latitude * latitude));
      const azimuth = i * 2.399963 + Math.random() * 0.1;
      const dx = Math.cos(azimuth) * ringRadius;
      const dy = latitude;
      const dz = Math.sin(azimuth) * ringRadius;
      const speed = spread * (0.77 + Math.random() * 0.28);
      const pearl = i % 9 === 0 ? palette[0] : color;
      if (reduced) {
        // Reduced motion is a slow, static constellation: no launch or flash.
        particle(target.x + dx * spread * 0.72, target.y + dy * spread * 0.72, target.z + dz * spread * 0.72,
          0, 0, 0, pearl, 3.7 + Math.random() * 2.3, 3.4 + Math.random() * 1.2, 0, 0);
      } else {
        particle(target.x, target.y, target.z, dx * speed, dy * speed + 0.32, dz * speed,
          pearl, 3.1 + Math.random() * 3.2, 2.6 + Math.random() * 1.45, 0.48, 0.29);
      }
    }
  };

  const launch = (burst: FireworkBurst, camera: PerspectiveCamera, reduced: boolean) => {
    const power = clamp(burst.power ?? 0.45, 0, 1);
    const depth = -1.6 - Math.random() * 2.7;
    temp.set(clamp(burst.x, 0.04, 0.96) * 2 - 1, 1 - clamp(burst.y, 0.06, 0.84) * 2, 0.5).unproject(camera);
    temp.sub(camera.position).normalize();
    const travel = (depth - camera.position.z) / temp.z;
    const target = camera.position.clone().addScaledVector(temp, travel);
    const color = palette[Math.abs(Math.floor(burst.id)) % palette.length];
    if (reduced) {
      explode(target, power, color, true);
      alive = 1;
      return;
    }
    const halfHeight = Math.tan(camera.fov * Math.PI / 360) * (camera.position.z - depth);
    const start = new Vector3(target.x * 0.32 + (Math.random() - 0.5) * 0.85, -halfHeight * 1.04, depth + 0.6);
    // Only four launches may be airborne; subsequent taps replace the oldest.
    if (rockets.length >= 4) rockets.shift();
    rockets.push({ start, target, previous: start.clone(), age: 0, duration: 0.88 + power * 0.25, power, color });
  };

  const update = (delta: number, reduced: boolean) => {
    elapsed += delta;
    for (let i = rockets.length - 1; i >= 0; i--) {
      const rocket = rockets[i];
      rocket.age += delta;
      if (rocket.age >= rocket.duration || reduced) {
        explode(rocket.target, rocket.power, rocket.color, reduced);
        rockets.splice(i, 1);
        continue;
      }
      const fraction = rocket.age / rocket.duration;
      const ease = 1 - Math.pow(1 - fraction, 1.45);
      origin.lerpVectors(rocket.start, rocket.target, ease);
      // Eight overlapping embers per frame make a tapered, continuous launch trail.
      for (let j = 0; j < 8; j++) {
        temp.lerpVectors(rocket.previous, origin, (j + 1) / 8);
        particle(temp.x, temp.y, temp.z, (Math.random() - 0.5) * 0.1, -0.15, 0,
          palette[0], 2.8 + (j / 8) * 3.8, 0.18 + j * 0.019, 0.18, 0.9);
      }
      rocket.previous.copy(origin);
    }

    alive = 0;
    for (let i = 0; i < CAPACITY; i++) {
      if (life[i] <= 0) { alphas[i] = 0; continue; }
      life[i] -= delta;
      if (life[i] <= 0) { alphas[i] = 0; continue; }
      alive++;
      const j = i * 3;
      if (!reduced) {
        const resistance = Math.exp(-drag[i] * delta);
        velocities[j] *= resistance;
        velocities[j + 1] = velocities[j + 1] * resistance - gravity[i] * delta;
        velocities[j + 2] *= resistance;
        positions[j] += velocities[j] * delta;
        positions[j + 1] += velocities[j + 1] * delta;
        positions[j + 2] += velocities[j + 2] * delta;
      }
      const age = duration[i] - life[i];
      const fadeIn = Math.min(1, age / (reduced ? 0.65 : 0.075));
      const fadeOut = Math.min(1, life[i] / (reduced ? 1.55 : 1.2));
      const shimmer = reduced ? 0.78 : 0.91 + 0.09 * Math.sin(elapsed * 1.9 + i * 0.71);
      alphas[i] = fadeIn * fadeOut * shimmer;
    }
    positionAttribute.needsUpdate = true;
    alphaAttribute.needsUpdate = true;
    if (colorDirty) {
      colorAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
      colorDirty = false;
    }
    return rockets.length > 0 || alive > 0;
  };

  return { object, launch, update, setDpr: (value: number) => { material.uniforms.uDpr.value = value; } };
}
