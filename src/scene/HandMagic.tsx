import { useLayoutEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HandSceneInput } from '../lib/hand-types';
import { FOLIAGE_BOTTOM, TREE_HEIGHT, TREE_OFFSET_Y, foliageRadiusAt } from './tree-profile';

interface HandMagicProps {
  handInput: MutableRefObject<HandSceneInput>;
  reducedMotion: boolean;
}

const DURATION = 2.85;
const vertexShader = /* glsl */ `
  uniform float uAge;
  uniform float uPixelRatio;
  uniform float uTurn;
  attribute vec3 aVelocity;
  attribute vec3 aColor;
  attribute float aDelay;
  attribute float aSize;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    float age = uAge - aDelay;
    float travel = clamp(age, 0.0, 2.45);
    vec3 point = position + aVelocity * travel;
    float turn = uTurn + travel * 0.045;
    point.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * point.xz;
    vec4 viewPosition = modelViewMatrix * vec4(point, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * 200.0 / max(1.0, -viewPosition.z), 1.4, 7.0) * uPixelRatio;
    vColor = aColor;
    vOpacity = smoothstep(0.0, 0.18, age) * (1.0 - smoothstep(1.15, 2.45, age)) * 0.65;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    if (radius >= 0.5 || vOpacity < 0.001) discard;
    float softness = 1.0 - smoothstep(0.04, 0.5, radius);
    gl_FragColor = vec4(vColor, vOpacity * softness * softness);
  }
`;

function createMagicParticles() {
  const count = 96;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const delays = new Float32Array(count);
  const sizes = new Float32Array(count);
  let seed = 0xdec047;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const champagne = new THREE.Color('#ffe4ae');
  const lavender = new THREE.Color('#d9c9ff');
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const y = FOLIAGE_BOTTOM + TREE_HEIGHT * (0.08 + random() * 0.87);
    const angle = i * 2.399963 + random() * 0.45;
    const radius = foliageRadiusAt(y) + 0.9 + random() * 1.3;
    positions.set([Math.cos(angle) * radius, y, Math.sin(angle) * radius], i * 3);
    velocities.set([Math.cos(angle) * 0.16, 0.3 + random() * 0.3, Math.sin(angle) * 0.16], i * 3);
    color.copy(i % 4 === 0 ? lavender : champagne).multiplyScalar(0.9 + random() * 0.2).toArray(colors, i * 3);
    delays[i] = random() * 0.35;
    sizes[i] = 0.85 + random() * 0.9;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius += 3;
  const material = new THREE.ShaderMaterial({
    uniforms: { uAge: { value: DURATION }, uPixelRatio: { value: 1 }, uTurn: { value: 0 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  points.raycast = () => {};
  return points;
}

/** Mounted only while hands are active; idle spells have no draw call. */
export default function HandMagic({ handInput, reducedMotion }: HandMagicProps) {
  const group = useRef<THREE.Group>(null);
  const particles = useRef<ReturnType<typeof createMagicParticles> | null>(null);
  const lastMagic = useRef(handInput.current.magic);
  const age = useRef(DURATION);
  useLayoutEffect(() => {
    const parent = group.current;
    if (!parent || reducedMotion) return;
    // Effect ownership keeps StrictMode remounts from reusing disposed buffers.
    const points = createMagicParticles();
    particles.current = points;
    lastMagic.current = handInput.current.magic;
    age.current = DURATION;
    parent.add(points);
    return () => {
      parent.remove(points);
      points.geometry.dispose();
      points.material.dispose();
      if (particles.current === points) particles.current = null;
    };
  }, [handInput, reducedMotion]);

  useFrame(({ gl, size }, delta) => {
    const points = particles.current;
    if (!points) return;
    const input = handInput.current;
    if (!input.enabled) {
      points.visible = false;
      age.current = DURATION;
      lastMagic.current = input.magic;
      return;
    }
    if (Number.isFinite(input.magic) && input.magic > lastMagic.current) {
      lastMagic.current = input.magic;
      age.current = 0;
      points.material.uniforms.uTurn.value = (input.magic * 2.399963) % (Math.PI * 2);
      points.visible = true;
    }
    if (!points.visible) return;
    age.current += Math.min(delta, 0.05);
    points.material.uniforms.uAge.value = age.current;
    points.material.uniforms.uPixelRatio.value = Math.min(gl.getPixelRatio(), size.width < 700 ? 1 : 1.5);
    if (age.current >= DURATION) points.visible = false;
  });

  return reducedMotion ? null : <group ref={group} position={[0, TREE_OFFSET_Y, 0]} dispose={null} />;
}
