import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, CylinderGeometry,
  DoubleSide, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedBufferAttribute,
  InstancedMesh, LatheGeometry, MeshBasicMaterial, MeshPhysicalMaterial, Object3D,
  PerspectiveCamera, PlaneGeometry, Points, RingGeometry, ShaderMaterial, Shape,
  ShapeGeometry, SphereGeometry, Vector2, Vector3,
} from 'three';
import type { Material, MeshPhysicalMaterialParameters } from 'three';
import type { RideBurst } from './rideTypes';

const TAU = Math.PI * 2;
const CAPACITY = 960;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : (low + high) / 2));
const palette = [new Color('#ffe2af'), new Color('#f5bfd7'), new Color('#d1eaff')];
type Actor = {
  age: number; life: number; origin: Vector3; position: Vector3; velocity: Vector3;
  phase: number; scale: number; rotation: number; accent: Color;
};
type Rocket = { origin: Vector3; target: Vector3; previous: Vector3; age: number; life: number; power: number; color: Color };

/** Fine translucent solids: per-instance opacity keeps every object in a fixed pool. */
function physical(parameters: MeshPhysicalMaterialParameters) {
  const material = new MeshPhysicalMaterial({
    transparent: true, depthWrite: false, side: DoubleSide,
    roughness: 0.23, metalness: 0.12, clearcoat: 0.8,
    ...parameters,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rideOpacity;\nvarying float vRideOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRideOpacity = rideOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRideOpacity;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vRideOpacity;');
  };
  material.customProgramCacheKey = () => 'ride-instance-opacity-v1';
  return material;
}

function wingGeometry(side: number) {
  const s = new Shape();
  s.moveTo(0, 0.08);
  s.bezierCurveTo(side * 0.22, 0.68, side * 0.98, 0.91, side * 0.86, 0.26);
  s.bezierCurveTo(side * 0.84, 0.07, side * 0.56, -0.01, side * 0.43, -0.03);
  s.bezierCurveTo(side * 0.81, -0.06, side * 0.75, -0.68, side * 0.41, -0.59);
  s.bezierCurveTo(side * 0.16, -0.48, side * 0.12, -0.14, 0, -0.1);
  s.lineTo(0, 0.08);
  const geometry = new ShapeGeometry(s, 14);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(Math.abs(p.getX(i)) * 3.1) * 0.09);
  geometry.computeVertexNormals();
  return geometry;
}

function petalGeometry() {
  const s = new Shape();
  s.moveTo(0, -0.54);
  s.bezierCurveTo(-0.63, -0.08, -0.47, 0.7, 0.03, 0.53);
  s.bezierCurveTo(0.58, 0.58, 0.57, -0.13, 0, -0.54);
  const geometry = new ShapeGeometry(s, 10);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i);
    p.setZ(i, 0.2 * x * x + 0.13 * Math.sin(y * 3.1));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function pageGeometry() {
  const geometry = new PlaneGeometry(1, 0.72, 8, 6);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, 0.14 * Math.sin(p.getX(i) * Math.PI + 0.2) + 0.04 * p.getY(i) * p.getY(i));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Demand-rendered magic. 960 glow points plus at most 112 small solid instances. */
export function makeRideMagic() {
  const root = new Group();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const dummy = new Object3D();
  const zero = new Vector3();
  const target = new Vector3();
  let elapsed = 0;
  let trailTick = -1;

  const positions = new Float32Array(CAPACITY * 3);
  const origins = new Float32Array(CAPACITY * 3);
  const velocities = new Float32Array(CAPACITY * 3);
  const colors = new Float32Array(CAPACITY * 3);
  const sizes = new Float32Array(CAPACITY);
  const alphas = new Float32Array(CAPACITY);
  const ages = new Float32Array(CAPACITY);
  const lives = new Float32Array(CAPACITY);
  const styles = new Uint8Array(CAPACITY);
  const phases = new Float32Array(CAPACITY);
  const gravity = new Float32Array(CAPACITY);
  const glowGeometry = new BufferGeometry();
  const positionAttribute = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const colorAttribute = new BufferAttribute(colors, 3).setUsage(DynamicDrawUsage);
  const sizeAttribute = new BufferAttribute(sizes, 1).setUsage(DynamicDrawUsage);
  const alphaAttribute = new BufferAttribute(alphas, 1).setUsage(DynamicDrawUsage);
  glowGeometry.setAttribute('position', positionAttribute);
  glowGeometry.setAttribute('sparkColor', colorAttribute);
  glowGeometry.setAttribute('sparkSize', sizeAttribute);
  glowGeometry.setAttribute('sparkAlpha', alphaAttribute);
  const glowMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending,
    uniforms: { uDpr: { value: 1 } },
    vertexShader: `
      attribute vec3 sparkColor; attribute float sparkSize; attribute float sparkAlpha;
      uniform float uDpr; varying vec3 vColor; varying float vAlpha;
      void main(){
        vec4 p=modelViewMatrix*vec4(position,1.0);
        vColor=sparkColor; vAlpha=sparkAlpha;
        gl_PointSize=clamp(sparkSize*uDpr*8.0/max(2.0,-p.z),1.0,22.0*uDpr);
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main(){
        vec2 p=(gl_PointCoord-.5)*2.0; float r=dot(p,p);
        if(r>1.0||vAlpha<.004)discard;
        float halo=exp(-r*5.7); float core=exp(-r*26.0);
        gl_FragColor=vec4(mix(vColor,vec3(1.0,.97,.9),core*.42),(halo*.52+core*.6)*vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const glow = new Points(glowGeometry, glowMaterial);
  glow.frustumCulled = false;
  glow.visible = false;
  root.add(glow);
  geometries.add(glowGeometry); materials.add(glowMaterial);
  let cursor = 0;
  let particlesDirty = false;

  const spark = (point: Vector3, vx: number, vy: number, vz: number, color: Color, size: number, life: number, style = 0, fall = 0) => {
    const i = cursor; cursor = (cursor + 1) % CAPACITY; const j = i * 3;
    positions[j] = origins[j] = point.x; positions[j + 1] = origins[j + 1] = point.y; positions[j + 2] = origins[j + 2] = point.z;
    velocities[j] = vx; velocities[j + 1] = vy; velocities[j + 2] = vz;
    colors[j] = color.r; colors[j + 1] = color.g; colors[j + 2] = color.b;
    sizes[i] = size; ages[i] = 0; lives[i] = life; alphas[i] = 0; styles[i] = style;
    phases[i] = Math.random() * TAU; gravity[i] = fall; particlesDirty = true;
  };

  const batch = (geometry: BufferGeometry, material: Material, capacity: number) => {
    const opacity = new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('rideOpacity', opacity);
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.visible = false;
    root.add(mesh); geometries.add(geometry); materials.add(material);
    for (let i = 0; i < capacity; i++) {
      dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(0); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, new Color('#ffffff'));
    }
    return {
      mesh,
      set(i: number, p: Vector3, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, alpha: number, color?: Color) {
        dummy.position.copy(p); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix); opacity.setX(i, alpha);
        if (color) mesh.setColorAt(i, color);
      },
      finish(visible: boolean) {
        mesh.visible = visible; mesh.instanceMatrix.needsUpdate = true; opacity.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      },
    };
  };
  const makeActors = (count: number) => Array.from({ length: count }, (): Actor => ({
    age: 9, life: 0, origin: new Vector3(), position: new Vector3(), velocity: new Vector3(),
    phase: 0, scale: 1, rotation: 0, accent: new Color('#ffffff'),
  }));
  const wingMaterial = physical({ color: '#fce9ef', metalness: 0.22, roughness: 0.16, clearcoat: 1, emissive: '#cba47f', emissiveIntensity: 0.12, envMapIntensity: 1.5 });
  const goldMaterial = physical({ color: '#efcc91', metalness: 0.88, roughness: 0.24, emissive: '#c08434', emissiveIntensity: 0.08 });
  const butterflyActors = makeActors(8);
  const leftWings = batch(wingGeometry(-1), wingMaterial, 8);
  const rightWings = batch(wingGeometry(1), wingMaterial, 8);
  const bodies = batch(new SphereGeometry(1, 8, 6), goldMaterial, 8);
  const lanternActors = makeActors(6);
  const lanternBody = batch(new LatheGeometry([
    new Vector2(0.09, -0.3), new Vector2(0.17, -0.23), new Vector2(0.2, 0),
    new Vector2(0.17, 0.23), new Vector2(0.09, 0.3),
  ], 16), physical({ color: '#fff1ce', roughness: 0.64, metalness: 0, emissive: '#ffc879', emissiveIntensity: 0.62, clearcoat: 0.15 }), 6);
  const lanternTop = batch(new CylinderGeometry(0.105, 0.12, 0.04, 12), goldMaterial, 6);
  const lanternBottom = batch(new CylinderGeometry(0.12, 0.105, 0.04, 12), goldMaterial, 6);
  const pageActors = makeActors(16);
  const pages = batch(pageGeometry(), physical({ color: '#fff0d6', roughness: 0.68, metalness: 0, clearcoat: 0.08, emissive: '#f7d8a0', emissiveIntensity: 0.06 }), 16);
  const crystalActors = makeActors(18);
  const crystals = batch(new IcosahedronGeometry(0.8, 0), physical({ color: '#e3efff', roughness: 0.08, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#b4c7e9', emissiveIntensity: 0.08, envMapIntensity: 1.8, flatShading: true }), 18);
  const petalActors = makeActors(24);
  const petals = batch(petalGeometry(), physical({ color: '#f8bed4', roughness: 0.48, metalness: 0.04, clearcoat: 0.15, emissive: '#ce7f9d', emissiveIntensity: 0.06 }), 24);
  const rippleActors = makeActors(12);
  const rippleMaterial = new MeshBasicMaterial({ color: '#ffe4ba', transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false, blending: AdditiveBlending });
  rippleMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float rideOpacity;\nvarying float vRideOpacity;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRideOpacity=rideOpacity;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRideOpacity;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a*=vRideOpacity;');
  };
  rippleMaterial.customProgramCacheKey = () => 'ride-ripple-opacity-v1';
  const ripples = batch(new RingGeometry(0.975, 1, 72), rippleMaterial, 12);
  const allActors = [butterflyActors, lanternActors, pageActors, crystalActors, petalActors, rippleActors];
  const allBatches = [leftWings, rightWings, bodies, lanternBody, lanternTop, lanternBottom, pages, crystals, petals, ripples];
  const cursors = new Map<Actor[], number>();
  const rockets: Rocket[] = [];

  const spawn = (pool: Actor[], point: Vector3, count: number, power: number, life: number, size: number, color: Color) => {
    for (let n = 0; n < count; n++) {
      const i = cursors.get(pool) ?? 0; cursors.set(pool, (i + 1) % pool.length);
      const a = pool[i]; a.age = -n * 0.065; a.life = life + Math.random() * 0.6;
      a.origin.copy(point); a.origin.x += (Math.random() - 0.5) * 0.23;
      a.origin.y += (Math.random() - 0.5) * 0.15; a.origin.z += (Math.random() - 0.5) * 0.45;
      a.position.copy(a.origin); a.phase = Math.random() * TAU; a.scale = size * (0.82 + Math.random() * 0.32) * (0.8 + power * 0.3);
      a.velocity.set((Math.random() - 0.5) * 0.55, 0.19 + Math.random() * 0.2, (Math.random() - 0.5) * 0.19);
      a.rotation = Math.random() * 0.9 - 0.45; a.accent.copy(color);
    }
  };
  const explode = (point: Vector3, power: number, color: Color, reduced: boolean) => {
    const count = Math.round(reduced ? 44 + power * 24 : 125 + power * 85);
    for (let i = 0; i < count; i++) {
      const y = 1 - 2 * (i + 0.5) / count; const radius = Math.sqrt(1 - y * y); const angle = i * 2.399963;
      const x = Math.cos(angle) * radius; const z = Math.sin(angle) * radius;
      const speed = (0.65 + power * 0.8) * (0.8 + Math.random() * 0.25);
      target.copy(point);
      if (reduced) target.addScaledVector(new Vector3(x, y, z), speed * 0.7);
      spark(target, reduced ? 0 : x * speed, reduced ? 0 : y * speed + 0.2, reduced ? 0 : z * speed,
        i % 7 ? color : palette[0], 3 + Math.random() * 2.6, reduced ? 3.5 : 2.4 + Math.random(), 0, reduced ? 0 : 0.32);
    }
  };

  const emit = (burst: RideBurst, camera: PerspectiveCamera, reduced: boolean) => {
    const power = clamp(burst.power ?? 0.65, 0.1, 1);
    const depth = 0;
    const halfHeight = Math.tan(camera.fov * Math.PI / 360) * (camera.position.z - depth);
    const point = new Vector3((clamp(burst.x, 0.03, 0.97) * 2 - 1) * halfHeight * camera.aspect, (1 - clamp(burst.y, 0.03, 0.97) * 2) * halfHeight, depth);
    const color = palette[Math.abs(Math.floor(burst.id) || 0) % palette.length];
    if (burst.kind === 'fireworks') {
      if (reduced) explode(point, power, color, true);
      else {
        if (rockets.length >= 3) rockets.shift();
        const origin = new Vector3(point.x * 0.6, -halfHeight * 1.03, -0.1);
        rockets.push({ origin, target: point, previous: origin.clone(), age: 0, life: 0.75, power, color });
      }
      return;
    }
    if (burst.kind === 'butterflies') spawn(butterflyActors, point, reduced ? 2 : 3, power, 3.3, 0.23, color);
    if (burst.kind === 'lanterns') spawn(lanternActors, point, reduced ? 1 : 3, power, 4.2, 0.6, palette[0]);
    if (burst.kind === 'pages') spawn(pageActors, point, reduced ? 3 : 6, power, 3, 0.29, new Color('#fff5df'));
    if (burst.kind === 'crystal' || burst.kind === 'stars') spawn(crystalActors, point, reduced ? 3 : burst.kind === 'stars' ? 7 : 5, power, 2.7, burst.kind === 'stars' ? 0.075 : 0.16, color);
    if (burst.kind === 'petals') spawn(petalActors, point, reduced ? 4 : 11, power, 3.3, 0.23, palette[1]);
    if (burst.kind === 'ripple') {
      spawn(rippleActors, point, 3, power, 2.3, 1, palette[0]);
      let seen = 0;
      for (const a of rippleActors) if (a.age <= 0) { a.origin.copy(point); a.position.copy(point); a.age = -seen++ * 0.2; }
    }
    const count = burst.kind === 'stars' ? 70 : burst.kind === 'notes' ? 48 : burst.kind === 'fireflies' ? 34 : 20;
    for (let i = 0; i < (reduced ? Math.ceil(count * 0.45) : count); i++) {
      target.copy(point);
      const angle = Math.random() * TAU; const radius = Math.sqrt(Math.random()) * (burst.kind === 'stars' ? 0.65 : 0.27);
      target.x += Math.cos(angle) * radius; target.y += Math.sin(angle) * radius; target.z += (Math.random() - 0.5) * 0.65;
      const style = burst.kind === 'fireflies' ? 1 : burst.kind === 'notes' ? 2 : 0;
      spark(target, Math.cos(angle) * 0.11, 0.08 + Math.random() * 0.2, Math.sin(angle) * 0.07,
        i % 4 ? color : palette[0], 2.5 + Math.random() * 3.5, 2.2 + Math.random() * 1.6, style);
    }
  };

  const tick = (delta: number, reduced: boolean) => {
    const dt = clamp(delta, 0, 0.07); elapsed += dt;
    let moving = false;
    for (let i = rockets.length - 1; i >= 0; i--) {
      const rocket = rockets[i]; rocket.age += dt;
      if (reduced || rocket.age >= rocket.life) { explode(rocket.target, rocket.power, rocket.color, reduced); rockets.splice(i, 1); continue; }
      const progress = 1 - Math.pow(1 - rocket.age / rocket.life, 1.35);
      target.lerpVectors(rocket.origin, rocket.target, progress);
      for (let j = 0; j < 6; j++) {
        zero.lerpVectors(rocket.previous, target, (j + 1) / 6);
        spark(zero, 0, -0.08, 0, palette[0], 4, 0.24 + j * 0.015);
      }
      rocket.previous.copy(target); moving = true;
    }
    const newTrailTick = Math.floor(elapsed * 8);
    const leaveTrail = newTrailTick !== trailTick; trailTick = newTrailTick;
    for (let poolId = 0; poolId < allActors.length; poolId++) {
      const pool = allActors[poolId]; let visible = false;
      for (let i = 0; i < pool.length; i++) {
        const a = pool[i]; a.age += dt;
        const live = a.age >= 0 && a.age < a.life;
        const pending = a.age < 0 && a.life > 0;
        if (live || pending) moving = true;
        const fade = live ? Math.min(1, a.age / (reduced ? 0.65 : 0.23)) * Math.min(1, (a.life - a.age) / (reduced ? 1.2 : 0.8)) : 0;
        visible ||= fade > 0.001;
        const t = Math.max(0, a.age); const phase = a.phase;
        if (!reduced && live) {
          if (poolId === 0) a.position.set(a.origin.x + Math.sin(t * 2.5 + phase) * Math.min(t, 0.4), a.origin.y + t * 0.22 + Math.sin(t * 3 + phase) * 0.12, a.origin.z + Math.sin(t * 1.9 + phase) * 0.28);
          else if (poolId === 1) a.position.set(a.origin.x + Math.sin(t * 1.4 + phase) * 0.18, a.origin.y + t * 0.42, a.origin.z - t * 0.08);
          else if (poolId === 5) a.position.copy(a.origin);
          else a.position.set(a.origin.x + a.velocity.x * t + Math.sin(t * 1.6 + phase) * 0.13, a.origin.y + a.velocity.y * t - (poolId === 4 ? 0.095 : 0.025) * t * t, a.origin.z + a.velocity.z * t);
        }
        const s = live ? a.scale : 0;
        const rotation = reduced ? a.rotation : a.rotation + t * (poolId === 3 ? 0.75 : 0.28);
        if (poolId === 0) {
          const flap = reduced ? 0.28 : 0.16 + Math.sin(t * 13 + phase) * 0.72;
          const yaw = reduced ? 0 : Math.sin(t * 1.6 + phase) * 0.3;
          leftWings.set(i, a.position, 0.1, yaw + flap, a.rotation, s, s, s, fade, a.accent);
          rightWings.set(i, a.position, 0.1, yaw - flap, a.rotation, s, s, s, fade, a.accent);
          bodies.set(i, a.position, 0.1, yaw, a.rotation, s * 0.05, s * 0.28, s * 0.045, fade);
          if (live && leaveTrail && !reduced) spark(a.position, 0, -0.05, 0, palette[0], 2.5, 0.6);
        } else if (poolId === 1) {
          lanternBody.set(i, a.position, 0.02, 0.3, reduced ? a.rotation * 0.1 : Math.sin(t + phase) * 0.1, s, s, s, fade);
          target.copy(a.position); target.y += s * 0.3;
          lanternTop.set(i, target, 0, 0.3, 0, s, s, s, fade);
          target.copy(a.position); target.y -= s * 0.3;
          lanternBottom.set(i, target, 0, 0.3, 0, s, s, s, fade);
          if (live && leaveTrail && !reduced) spark(a.position, 0, -0.1, 0, palette[0], 4.5, 0.6);
        } else if (poolId === 2) pages.set(i, a.position, reduced ? 0.12 : Math.sin(t * 1.4 + phase) * 0.7, reduced ? 0.25 : t * 0.7 + phase, rotation, s, s, s, fade);
        else if (poolId === 3) crystals.set(i, a.position, rotation * 0.6, rotation, rotation * 0.3, s, s * 1.45, s, fade, a.accent);
        else if (poolId === 4) petals.set(i, a.position, reduced ? 0.3 : t * 0.85 + phase, rotation, rotation * 1.3, s, s, s, fade, a.accent);
        else {
          const radius = live ? (reduced ? 0.32 + i % 3 * 0.12 : 0.12 + t * 0.35) : 0;
          ripples.set(i, a.position, 0.86, 0, 0, radius, radius, radius, fade * 0.6);
        }
      }
      if (poolId === 0) { leftWings.finish(visible); rightWings.finish(visible); bodies.finish(visible); }
      else if (poolId === 1) { lanternBody.finish(visible); lanternTop.finish(visible); lanternBottom.finish(visible); }
      else [pages, crystals, petals, ripples][poolId - 2].finish(visible);
    }
    let anyGlow = false;
    for (let i = 0; i < CAPACITY; i++) {
      if (ages[i] >= lives[i]) { alphas[i] = 0; continue; }
      ages[i] += dt;
      const age = ages[i]; const remaining = lives[i] - age;
      if (remaining <= 0) { alphas[i] = 0; continue; }
      const j = i * 3; moving = true; anyGlow = true;
      if (!reduced) {
        if (styles[i] === 1) {
          positions[j] = origins[j] + Math.sin(age * 2.5 + phases[i]) * Math.min(age, 0.25);
          positions[j + 1] = origins[j + 1] + age * 0.18 + Math.sin(age * 3.5 + phases[i]) * 0.1;
          positions[j + 2] = origins[j + 2] + Math.cos(age * 2 + phases[i]) * 0.15;
        } else if (styles[i] === 2) {
          positions[j] = origins[j] + Math.cos(age * 2.3 + phases[i]) * age * 0.14;
          positions[j + 1] = origins[j + 1] + age * 0.3;
          positions[j + 2] = origins[j + 2] + Math.sin(age * 2.3 + phases[i]) * age * 0.14;
        } else {
          const drag = Math.exp(-dt * 0.25);
          velocities[j] *= drag; velocities[j + 1] = velocities[j + 1] * drag - gravity[i] * dt; velocities[j + 2] *= drag;
          positions[j] += velocities[j] * dt; positions[j + 1] += velocities[j + 1] * dt; positions[j + 2] += velocities[j + 2] * dt;
        }
      }
      alphas[i] = Math.min(1, age / (reduced ? 0.65 : 0.12)) * Math.min(1, remaining / (reduced ? 1.1 : 0.85)) * (reduced ? 0.7 : 0.86 + Math.sin(age * 3 + phases[i]) * 0.1);
    }
    glow.visible = anyGlow; positionAttribute.needsUpdate = true; alphaAttribute.needsUpdate = true;
    if (particlesDirty) { colorAttribute.needsUpdate = true; sizeAttribute.needsUpdate = true; particlesDirty = false; }
    return moving;
  };

  return {
    object: root, emit, tick,
    setDpr(value: number) { glowMaterial.uniforms.uDpr.value = clamp(value, 1, 1.5); },
    clear() {
      lives.fill(0); alphas.fill(0); rockets.length = 0; glow.visible = false;
      for (const pool of allActors) for (const a of pool) { a.life = 0; a.age = 1; }
      for (const b of allBatches) b.mesh.visible = false;
      alphaAttribute.needsUpdate = true;
    },
    dispose() {
      allBatches.forEach(b => b.mesh.dispose());
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear();
    },
  };
}
