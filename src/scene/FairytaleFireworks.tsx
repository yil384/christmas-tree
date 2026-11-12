import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface FairytaleFireworksProps {
  compact: boolean;
  paused: boolean;
  active: boolean;
  reducedMotion: boolean;
  /** Same degrees and world-Y convention as the panorama; U=.25 faces local -Z. */
  rotation?: number;
}

const CYCLE_SECONDS = 7.6;
const LAUNCH_SECONDS = 1.25;
const SPARK_SECONDS = 3.15;
const INITIAL_TIME = 1.85;

const BURSTS = [
  { azimuth: -0.205, elevation: 0.29, radius: 190, phase: 0, color: '#ffe2a3', spokes: 48 },
  { azimuth: 0.175, elevation: 0.32, radius: 210, phase: 2.5, color: '#ffd3c9', spokes: 42 },
  { azimuth: -0.015, elevation: 0.35, radius: 205, phase: 5.1, color: '#fff1ce', spokes: 54 },
] as const;

interface Particle {
  burst: number;
  kind: 'spark' | 'launch';
  velocity: [number, number, number];
  lag: number;
  gain: number;
}

const vertexShader = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uViewportHeight;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float pixels = aSize * uViewportHeight * projectionMatrix[1][1]
      / max(1.0, -viewPosition.z);
    gl_PointSize = clamp(pixels, 0.65, 3.8) * uPixelRatio;
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float radius = distance(gl_PointCoord, vec2(0.5));
    if (radius >= 0.5 || vAlpha < 0.001) discard;
    float core = 1.0 - smoothstep(0.02, 0.3, radius);
    float glow = (1.0 - smoothstep(0.12, 0.5, radius)) * 0.55;
    gl_FragColor = vec4(vColor * 1.8, vAlpha * max(core, glow));
  }
`;

function smoothstep(low: number, high: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function createFairytaleFireworks(compact: boolean, time = INITIAL_TIME) {
  const particles: Particle[] = [];
  const sizes: number[] = [];
  const colors: number[] = [];
  const centers = BURSTS.map(burst => {
    const horizontal = Math.cos(burst.elevation) * burst.radius;
    return new THREE.Vector3(
      Math.sin(burst.azimuth) * horizontal,
      Math.sin(burst.elevation) * burst.radius - 6.5,
      -Math.cos(burst.azimuth) * horizontal,
    );
  });
  let seed = 0xc41a57;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const [burstIndex, burst] of BURSTS.entries()) {
    const color = new THREE.Color(burst.color);
    const spokes = compact ? Math.round(burst.spokes * 0.625) : burst.spokes;
    const tailCount = compact ? 3 : 4;
    for (let spoke = 0; spoke < spokes; spoke++) {
      // Even directions make a round chrysanthemum in real 3D. Each tail
      // samples the same ballistic path slightly behind its leading spark.
      const vertical = 1 - 2 * (spoke + 0.5) / spokes;
      const ring = Math.sqrt(1 - vertical * vertical);
      const angle = spoke * 2.399963229728653 + burstIndex * 0.8;
      const speed = 15 + random() * 6;
      const velocity: [number, number, number] = [
        Math.cos(angle) * ring * speed,
        vertical * speed,
        Math.sin(angle) * ring * speed,
      ];
      const size = 0.21 + random() * 0.12;
      for (let tail = 0; tail < tailCount; tail++) {
        particles.push({
          burst: burstIndex, kind: 'spark', velocity,
          lag: tail * 0.075,
          gain: (tail === 0 ? 0.85 : 0.45 / tail) * (burstIndex === 1 ? 0.78 : 1),
        });
        sizes.push(size * (tail === 0 ? 1 : 0.75));
        colors.push(color.r, color.g, color.b);
      }
    }
    const launchCount = compact ? 14 : 20;
    const launchColor = new THREE.Color('#ffe9b9');
    for (let trail = 0; trail < launchCount; trail++) {
      particles.push({
        burst: burstIndex, kind: 'launch', velocity: [0, 0, 0],
        lag: trail * 0.026,
        gain: 0.68 * (1 - trail / launchCount) ** 1.2,
      });
      sizes.push(trail === 0 ? 0.30 : 0.17);
      colors.push(launchColor.r, launchColor.g, launchColor.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(particles.length * 3), 3);
  const alpha = new THREE.BufferAttribute(new Float32Array(particles.length), 1);
  positions.setUsage(THREE.DynamicDrawUsage);
  alpha.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('aAlpha', alpha);
  geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  // Covers every launch and falling spark, including between the sampled frames.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, -190), 95);
  const material = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: 1 }, uViewportHeight: { value: 900 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'castle-fireworks';
  points.raycast = () => {};
  const fireworks = { points, particles, centers, time };
  syncFireworks(fireworks);
  return fireworks;
}

type Fireworks = ReturnType<typeof createFairytaleFireworks>;

function syncFireworks(fireworks: Fireworks) {
  const { geometry } = fireworks.points;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const alpha = geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
  const phases = BURSTS.map(burst => (fireworks.time + burst.phase) % CYCLE_SECONDS);
  for (const [index, particle] of fireworks.particles.entries()) {
    const center = fireworks.centers[particle.burst];
    const phase = phases[particle.burst];
    let x = center.x;
    let y = center.y;
    let z = center.z;
    let opacity = 0;
    if (particle.kind === 'launch') {
      const age = phase - particle.lag;
      if (age >= 0 && age < LAUNCH_SECONDS) {
        const progress = 1 - (1 - age / LAUNCH_SECONDS) ** 1.65;
        y -= 36 * (1 - progress);
        opacity = particle.gain * smoothstep(0, 0.12, age)
          * (1 - smoothstep(LAUNCH_SECONDS - 0.08, LAUNCH_SECONDS, age));
      }
    } else {
      const headAge = phase - LAUNCH_SECONDS;
      const age = headAge - particle.lag;
      if (age >= 0 && headAge < SPARK_SECONDS) {
        const travel = (1 - Math.exp(-0.9 * age)) / 0.9;
        x += particle.velocity[0] * travel;
        y += particle.velocity[1] * travel - 3.1 * age * age;
        z += particle.velocity[2] * travel;
        opacity = particle.gain * smoothstep(0, 0.18, headAge)
          * (1 - headAge / SPARK_SECONDS) ** 1.45;
      }
    }
    positions.setXYZ(index, x, y, z);
    alpha.setX(index, opacity);
  }
  positions.needsUpdate = true;
  alpha.needsUpdate = true;
}

function advanceFireworks(fireworks: Fireworks, delta: number, running: boolean) {
  if (!running || !Number.isFinite(delta) || delta <= 0) return;
  fireworks.time = (fireworks.time + Math.min(delta, 0.05)) % CYCLE_SECONDS;
  syncFireworks(fireworks);
}

function disposeFireworks(fireworks: Fireworks) {
  fireworks.points.geometry.dispose();
  fireworks.points.material.dispose();
}

/** Three quiet, staggered bursts share one draw and remain anchored above the castle. */
export default function FairytaleFireworks({ compact, paused, active, reducedMotion, rotation = 0 }: FairytaleFireworksProps) {
  const group = useRef<THREE.Group>(null);
  const fireworks = useRef<Fireworks | null>(null);
  const time = useRef(INITIAL_TIME);
  const { gl, size, viewport, invalidate } = useThree();
  useLayoutEffect(() => {
    const parent = group.current;
    if (!parent) return;
    const current = createFairytaleFireworks(compact, time.current);
    fireworks.current = current;
    parent.add(current.points);
    invalidate();
    return () => {
      time.current = current.time;
      parent.remove(current.points);
      disposeFireworks(current);
      if (fireworks.current === current) fireworks.current = null;
    };
  }, [compact, invalidate]);
  useLayoutEffect(() => {
    const current = fireworks.current;
    if (!current) return;
    current.points.material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    current.points.material.uniforms.uViewportHeight.value = size.height;
    invalidate();
  }, [compact, gl, size.height, viewport.dpr, invalidate]);
  useFrame((_, delta) => {
    const current = fireworks.current;
    if (!current) return;
    advanceFireworks(current, delta, active && !paused && !reducedMotion);
    time.current = current.time;
  });
  return <group ref={group} rotation={[0, THREE.MathUtils.degToRad(Number.isFinite(rotation) ? rotation : 0), 0]} />;
}
