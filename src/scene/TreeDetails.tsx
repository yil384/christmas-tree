import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type TreeState = 'CHAOS' | 'FORMED';

interface TreeDetailsProps {
  state: TreeState;
  compact: boolean;
  reducedMotion: boolean;
}

const TREE_HEIGHT = 22;
const TREE_RADIUS = 9;
const GIFT_COLORS = ['#D32F2F', '#FFD700', '#1976D2', '#2E7D32'];
const LIGHT_COLORS = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'];

/** Stable positions keep the original tree arrangement consistent on rerenders. */
function randomSource(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const foliageVertex = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uPixelRatio;
  attribute vec3 aTargetPos;
  attribute float aRandom;
  varying float vMix;
  float cubicInOut(float t) {
    float shifted = 2.0 * t - 2.0;
    return t < 0.5 ? 4.0 * t * t * t : 0.5 * shifted * shifted * shifted + 1.0;
  }
  void main() {
    vec3 noise = vec3(
      sin(uTime * 1.5 + position.x),
      cos(uTime + position.y),
      sin(uTime * 1.5 + position.z)
    ) * 0.15;
    float t = cubicInOut(uProgress);
    vec3 finalPos = mix(position, aTargetPos + noise, t);
    vec4 viewPos = modelViewMatrix * vec4(finalPos, 1.0);
    gl_PointSize = clamp(60.0 * (1.0 + aRandom) / max(1.0, -viewPos.z), 0.6, 8.0) * uPixelRatio;
    gl_Position = projectionMatrix * viewPos;
    vMix = t;
  }
`;

const foliageFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vMix;
  void main() {
    float radius = distance(gl_PointCoord, vec2(0.5));
    if (radius > 0.5) discard;
    vec3 color = mix(uColor * 0.3, uColor * 1.2, vMix);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function createFoliage(compact: boolean) {
  const count = compact ? 9000 : 15000;
  const random = randomSource(0xdec025);
  const positions = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const azimuth = random() * Math.PI * 2;
    const elevation = random() * 2 - 1;
    const radius = 25 * Math.cbrt(random());
    const ringRadius = Math.sqrt(1 - elevation * elevation) * radius;
    positions[offset] = Math.cos(azimuth) * ringRadius;
    positions[offset + 1] = elevation * radius;
    positions[offset + 2] = Math.sin(azimuth) * ringRadius;

    const height = random();
    const treeAngle = random() * Math.PI * 2;
    const treeRadius = TREE_RADIUS * (1 - height) * random();
    targets[offset] = treeRadius * Math.cos(treeAngle);
    targets[offset + 1] = height * TREE_HEIGHT - TREE_HEIGHT / 2;
    targets[offset + 2] = treeRadius * Math.sin(treeAngle);
    sizes[i] = random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aTargetPos', new THREE.BufferAttribute(targets, 3));
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(sizes, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 26);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 1 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color('#004225') },
    },
    vertexShader: foliageVertex,
    fragmentShader: foliageFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return new THREE.Points(geometry, material);
}

const lightsVertex = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uPixelRatio;
  attribute vec3 aTargetPos;
  attribute vec3 aColor;
  attribute vec2 aTiming;
  varying vec3 vColor;
  void main() {
    vec3 finalPos = mix(position, aTargetPos, uProgress);
    vec4 viewPos = modelViewMatrix * vec4(finalPos, 1.0);
    float blink = (sin(uTime * aTiming.x + aTiming.y) + 1.0) * 0.5;
    vColor = aColor * mix(0.3, 3.0 + blink * 4.0, uProgress);
    gl_PointSize = clamp(190.0 / max(1.0, -viewPos.z), 1.2, 12.0) * uPixelRatio;
    gl_Position = projectionMatrix * viewPos;
  }
`;

const lightsFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float radius = distance(gl_PointCoord, vec2(0.5));
    if (radius > 0.5) discard;
    float glow = 1.0 - smoothstep(0.16, 0.5, radius);
    gl_FragColor = vec4(vColor, glow);
  }
`;

function createFairyLights(compact: boolean) {
  const count = compact ? 280 : 400;
  const random = randomSource(0xdec026);
  const positions = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const timing = new Float32Array(count * 2);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    positions[offset] = (random() - 0.5) * 60;
    positions[offset + 1] = (random() - 0.5) * 60;
    positions[offset + 2] = (random() - 0.5) * 60;
    const height = random();
    const radius = TREE_RADIUS * (1 - height) + 0.3;
    const angle = random() * Math.PI * 2;
    targets[offset] = radius * Math.cos(angle);
    targets[offset + 1] = height * TREE_HEIGHT - TREE_HEIGHT / 2;
    targets[offset + 2] = radius * Math.sin(angle);
    color.set(LIGHT_COLORS[Math.floor(random() * LIGHT_COLORS.length)]);
    color.toArray(colors, offset);
    timing[i * 2] = 2 + random() * 3;
    timing[i * 2 + 1] = random() * 100;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aTargetPos', new THREE.BufferAttribute(targets, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aTiming', new THREE.BufferAttribute(timing, 2));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 53);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 1 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: lightsVertex,
    fragmentShader: lightsFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return new THREE.Points(geometry, material);
}

interface Decoration {
  target: THREE.Vector3;
  scattered: THREE.Vector3;
  rotation: THREE.Euler;
  speed: THREE.Vector3;
  scale: number;
  color: string;
}

interface DecorationBatch {
  mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  items: Decoration[];
}

function createDecorations(compact: boolean): DecorationBatch[] {
  const random = randomSource(0xdec027);
  const count = compact ? 120 : 200;
  const groups: Decoration[][] = [[], [], []];
  for (let i = 0; i < count; i += 1) {
    const type = i % 3;
    const height = random();
    const radius = TREE_RADIUS * (1 - height) * 0.95;
    const angle = random() * Math.PI * 2;
    groups[type].push({
      target: new THREE.Vector3(radius * Math.cos(angle), height * TREE_HEIGHT - TREE_HEIGHT / 2, radius * Math.sin(angle)),
      scattered: new THREE.Vector3((random() - 0.5) * 60, (random() - 0.5) * 60, (random() - 0.5) * 60),
      rotation: new THREE.Euler(random() * Math.PI, random() * Math.PI, random() * Math.PI),
      speed: new THREE.Vector3((random() - 0.5) * 2, (random() - 0.5) * 2, (random() - 0.5) * 2),
      scale: type === 0 ? 0.8 + random() * 0.4 : type === 1 ? 0.6 + random() * 0.4 : 0.7 + random() * 0.3,
      color: type === 2 ? (random() > 0.5 ? '#D32F2F' : '#FFFFFF') : GIFT_COLORS[Math.floor(random() * GIFT_COLORS.length)],
    });
  }

  const geometries = [
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.SphereGeometry(0.5, 12, 8),
    new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8),
  ];
  const material = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    roughness: 0.3,
    metalness: 0.4,
    emissive: '#FFFFFF',
    emissiveIntensity: 0.2,
  });
  // Match the original individually colored emissive materials in one shared material.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif',
    );
  };
  material.customProgramCacheKey = () => 'christmas-colored-decoration-emission-v1';
  const color = new THREE.Color();
  return groups.map((items, type) => {
    const mesh = new THREE.InstancedMesh(geometries[type], material, items.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    items.forEach((item, i) => mesh.setColorAt(i, color.set(item.color)));
    return { mesh, items };
  });
}

function createTopStar() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? 1.3 : 0.7;
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.4,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.1,
    bevelSegments: 3,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.2);
  // One material keeps the front and beveled sides in a single draw call.
  geometry.clearGroups();
  const material = new THREE.MeshStandardMaterial({
    color: '#FFD700',
    emissive: '#FFD700',
    emissiveIntensity: 1.5,
    roughness: 0.1,
    metalness: 1,
  });
  const star = new THREE.Mesh(geometry, material);
  star.position.y = TREE_HEIGHT / 2 + 1.8;
  return star;
}

const snowVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aRandom;
  varying float vAlpha;
  void main() {
    vec3 finalPos = position;
    finalPos.y = mod(position.y + 25.0 - uTime * (0.25 + aRandom * 0.4), 50.0) - 25.0;
    finalPos.x += sin(uTime * 0.2 + aRandom * 30.0) * 0.5;
    vec4 viewPos = modelViewMatrix * vec4(finalPos, 1.0);
    gl_PointSize = clamp(170.0 * (0.6 + aRandom * 0.8) / max(1.0, -viewPos.z), 1.0, 7.0) * uPixelRatio;
    gl_Position = projectionMatrix * viewPos;
    vAlpha = 0.16 + aRandom * 0.2;
  }
`;

const snowFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float radius = distance(gl_PointCoord, vec2(0.5));
    if (radius > 0.5) discard;
    float alpha = (1.0 - smoothstep(0.0, 0.5, radius)) * vAlpha;
    gl_FragColor = vec4(vec3(0.92, 0.94, 0.95), alpha);
  }
`;

function createSnow(compact: boolean) {
  const count = compact ? 200 : 600;
  const random = randomSource(0xdec028);
  const positions = new Float32Array(count * 3);
  const randoms = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 50;
    positions[i * 3 + 1] = (random() - 0.5) * 50;
    positions[i * 3 + 2] = (random() - 0.5) * 50;
    randoms[i] = random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 45);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: snowVertex,
    fragmentShader: snowFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return new THREE.Points(geometry, material);
}

function createStars(compact: boolean) {
  const count = compact ? 400 : 1200;
  const random = randomSource(0xdec029);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const azimuth = random() * Math.PI * 2;
    const elevation = random() * 2 - 1;
    const radius = 80 + random() * 50;
    const ringRadius = radius * Math.sqrt(1 - elevation * elevation);
    positions[i * 3] = Math.cos(azimuth) * ringRadius;
    positions[i * 3 + 1] = elevation * radius;
    positions[i * 3 + 2] = Math.sin(azimuth) * ringRadius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 130);
  const material = new THREE.PointsMaterial({
    color: '#ECEFF1',
    size: 0.11,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    toneMapped: false,
  });
  return new THREE.Points(geometry, material);
}

function createDetails(compact: boolean) {
  return {
    foliage: createFoliage(compact),
    lights: createFairyLights(compact),
    decorations: createDecorations(compact),
    star: createTopStar(),
    transform: new THREE.Object3D(),
  };
}

type Details = ReturnType<typeof createDetails>;

interface Motion {
  time: number;
  foliage: number;
  lights: number;
  decorations: number;
  star: number;
}

function syncDetails(details: Details, motion: Motion, pixelRatio: number) {
  details.foliage.material.uniforms.uTime.value = motion.time;
  details.foliage.material.uniforms.uProgress.value = motion.foliage;
  details.foliage.material.uniforms.uPixelRatio.value = pixelRatio;
  details.lights.material.uniforms.uTime.value = motion.time;
  details.lights.material.uniforms.uProgress.value = motion.lights;
  details.lights.material.uniforms.uPixelRatio.value = pixelRatio;

  const transform = details.transform;
  for (const { mesh, items } of details.decorations) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      transform.position.lerpVectors(item.scattered, item.target, motion.decorations);
      transform.rotation.set(
        item.rotation.x + motion.time * item.speed.x,
        item.rotation.y + motion.time * item.speed.y,
        item.rotation.z + motion.time * item.speed.z,
      );
      transform.scale.setScalar(item.scale);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  details.star.scale.setScalar(motion.star);
  details.star.visible = motion.star > 0.001;
  details.star.position.y = TREE_HEIGHT / 2 + 1.8 + Math.sin(motion.time * 1.2) * 0.12;
  details.star.rotation.set(Math.sin(motion.time * 0.8) * 0.06, motion.time * 0.5, 0);
}

function disposeDetails(details: Details) {
  for (const points of [details.foliage, details.lights]) {
    points.geometry.dispose();
    points.material.dispose();
  }
  details.star.geometry.dispose();
  details.star.material.dispose();
  for (const { mesh } of details.decorations) {
    mesh.geometry.dispose();
    mesh.dispose();
  }
  details.decorations[0].mesh.material.dispose();
}

function pointPixelRatio(renderer: THREE.WebGLRenderer, compact: boolean) {
  // Match Bloom's render target resolution, including its lower mobile DPR.
  return Math.min(renderer.getPixelRatio(), compact ? 1 : 1.5);
}

/** Original emerald tree, colored ornaments and gold star: six batched draws. */
export default function TreeDetails({ state, compact, reducedMotion }: TreeDetailsProps) {
  const groupRef = useRef<THREE.Group>(null);
  const detailsRef = useRef<Details | null>(null);
  const renderer = useThree((root) => root.gl);
  const invalidate = useThree((root) => root.invalidate);
  const initialProgress = state === 'FORMED' ? 1 : 0;
  const motion = useRef<Motion>({
    time: 0,
    foliage: initialProgress,
    lights: initialProgress,
    decorations: initialProgress,
    star: initialProgress,
  });

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    // Allocate inside the effect so StrictMode cleanup/setup creates fresh resources.
    const details = createDetails(compact);
    const objects = [
      details.foliage,
      ...details.decorations.map(({ mesh }) => mesh),
      details.lights,
      details.star,
    ];
    detailsRef.current = details;
    syncDetails(details, motion.current, pointPixelRatio(renderer, compact));
    group.add(...objects);
    invalidate();
    return () => {
      group.remove(...objects);
      disposeDetails(details);
      if (detailsRef.current === details) detailsRef.current = null;
    };
  }, [compact, renderer, invalidate]);

  useLayoutEffect(() => {
    if (reducedMotion) {
      const target = state === 'FORMED' ? 1 : 0;
      motion.current.foliage = target;
      motion.current.lights = target;
      motion.current.decorations = target;
      motion.current.star = target;
    }
    if (detailsRef.current) {
      syncDetails(detailsRef.current, motion.current, pointPixelRatio(renderer, compact));
    }
    invalidate();
  }, [state, compact, reducedMotion, renderer, invalidate]);

  useFrame((_, delta) => {
    const details = detailsRef.current;
    if (reducedMotion || !details) return;
    // Browser tab suspension should not produce an abrupt rotation or burst of motion.
    const step = Math.min(delta, 0.06);
    const target = state === 'FORMED' ? 1 : 0;
    const current = motion.current;
    current.time += step;
    current.foliage = THREE.MathUtils.damp(current.foliage, target, 1.5, step);
    current.lights = THREE.MathUtils.damp(current.lights, target, 2, step);
    current.decorations = THREE.MathUtils.damp(current.decorations, target, 1.5, step);
    current.star = THREE.MathUtils.damp(current.star, target, 3, step);
    syncDetails(details, current, pointPixelRatio(renderer, compact));
  });

  return <group ref={groupRef} dispose={null} />;
}

interface Atmosphere {
  snow: ReturnType<typeof createSnow>;
  stars: ReturnType<typeof createStars>;
}

/** Mount outside the rotating tree group to keep snow and background stars in place. */
export function TreeAtmosphere({ compact, reducedMotion }: Pick<TreeDetailsProps, 'compact' | 'reducedMotion'>) {
  const groupRef = useRef<THREE.Group>(null);
  const atmosphereRef = useRef<Atmosphere | null>(null);
  const elapsed = useRef(0);
  const renderer = useThree((root) => root.gl);
  const invalidate = useThree((root) => root.invalidate);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const atmosphere = { snow: createSnow(compact), stars: createStars(compact) };
    atmosphere.snow.material.uniforms.uTime.value = elapsed.current;
    atmosphere.snow.material.uniforms.uPixelRatio.value = pointPixelRatio(renderer, compact);
    atmosphereRef.current = atmosphere;
    group.add(atmosphere.snow, atmosphere.stars);
    invalidate();
    return () => {
      group.remove(atmosphere.snow, atmosphere.stars);
      atmosphere.snow.geometry.dispose();
      atmosphere.snow.material.dispose();
      atmosphere.stars.geometry.dispose();
      atmosphere.stars.material.dispose();
      if (atmosphereRef.current === atmosphere) atmosphereRef.current = null;
    };
  }, [compact, renderer, invalidate]);

  useLayoutEffect(() => {
    invalidate();
  }, [reducedMotion, invalidate]);

  useFrame((_, delta) => {
    const atmosphere = atmosphereRef.current;
    if (reducedMotion || !atmosphere) return;
    elapsed.current += Math.min(delta, 0.06);
    atmosphere.snow.material.uniforms.uTime.value = elapsed.current;
    atmosphere.snow.material.uniforms.uPixelRatio.value = pointPixelRatio(renderer, compact);
  });

  return <group ref={groupRef} dispose={null} />;
}
