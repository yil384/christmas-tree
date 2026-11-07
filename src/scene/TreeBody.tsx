import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FOLIAGE_BOTTOM, FOLIAGE_TOP, TRUNK_BOTTOM, foliageRadiusAt } from './tree-profile';

interface TreeBodyProps {
  state: 'CHAOS' | 'FORMED';
  reducedMotion: boolean;
}

interface Part {
  pivot: THREE.Vector3;
  displacement: THREE.Vector3;
  axis: THREE.Vector3;
  angle: number;
  scatteredScale: number;
}

interface AssemblyUniform { value: number }

/** Build each piece once; one uniform moves all of its vertices during reassembly. */
class GeometryBuilder {
  positions: number[] = [];
  colors: number[] = [];
  pivots: number[] = [];
  displacements: number[] = [];
  axes: number[] = [];
  scales: number[] = [];
  indices: number[] = [];

  vertex(position: THREE.Vector3, color: THREE.Color, part: Part) {
    const index = this.positions.length / 3;
    this.positions.push(position.x, position.y, position.z);
    this.colors.push(color.r, color.g, color.b);
    this.pivots.push(part.pivot.x, part.pivot.y, part.pivot.z);
    this.displacements.push(part.displacement.x, part.displacement.y, part.displacement.z, part.angle);
    this.axes.push(part.axis.x, part.axis.y, part.axis.z);
    this.scales.push(part.scatteredScale);
    return index;
  }

  triangle(a: number, b: number, c: number) { this.indices.push(a, b, c); }

  geometry(lines = false) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('aPartPivot', new THREE.Float32BufferAttribute(this.pivots, 3));
    geometry.setAttribute('aPartMotion', new THREE.Float32BufferAttribute(this.displacements, 4));
    geometry.setAttribute('aPartAxis', new THREE.Float32BufferAttribute(this.axes, 3));
    geometry.setAttribute('aPartScale', new THREE.Float32BufferAttribute(this.scales, 1));
    if (!lines) {
      geometry.setIndex(this.indices);
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingBox();
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80);
    return geometry;
  }
}

function randomSource() {
  let seed = 0xb0a6d202;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makePart(pivot: THREE.Vector3, random: () => number, scatteredScale = 0.42): Part {
  return {
    pivot,
    displacement: new THREE.Vector3((random() - 0.5) * 48, (random() - 0.5) * 42, (random() - 0.5) * 48),
    axis: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(),
    angle: (random() - 0.5) * Math.PI * 3,
    scatteredScale,
  };
}

/** All green surfaces stay inside the envelope also used by the hanging photos. */
function containFoliage(position: THREE.Vector3) {
  position.y = Math.max(FOLIAGE_BOTTOM, Math.min(FOLIAGE_TOP, position.y));
  const radius = Math.hypot(position.x, position.z);
  const limit = foliageRadiusAt(position.y);
  if (radius > limit && radius > 0) {
    const factor = limit / radius;
    position.x *= factor;
    position.z *= factor;
  }
  return position;
}

function connectRings(builder: GeometryBuilder, rings: number[][]) {
  const sides = rings[0].length;
  for (let row = 0; row < rings.length - 1; row++) {
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides;
      builder.triangle(rings[row][side], rings[row + 1][side], rings[row + 1][next]);
      builder.triangle(rings[row][side], rings[row + 1][next], rings[row][next]);
    }
  }
}

function appendBark(
  builder: GeometryBuilder,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startRadius: number,
  endRadius: number,
  part: Part,
  random: () => number,
  trunk = false,
) {
  const direction = new THREE.Vector3().subVectors(end, start).normalize();
  const horizontal = Math.abs(direction.y) > 0.95
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
  // The left-handed ring basis matches connectRings' outward triangle winding.
  const vertical = new THREE.Vector3().crossVectors(horizontal, direction).normalize();
  const segments = trunk ? 18 : 7;
  const steps = trunk ? 18 : 3;
  const rings: number[][] = [];
  const center = new THREE.Vector3();
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  const bark = new THREE.Color(trunk ? '#845331' : '#704329');
  const phase = random() * Math.PI * 2;

  for (let row = 0; row <= steps; row++) {
    const fraction = row / steps;
    center.lerpVectors(start, end, fraction);
    if (trunk) {
      center.x += Math.sin(fraction * 4.5) * 0.09;
      center.z += Math.sin(fraction * 7) * 0.06;
    }
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, fraction);
    const ring: number[] = [];
    for (let side = 0; side < segments; side++) {
      const angle = side / segments * Math.PI * 2;
      const ridge = 1 + 0.09 * Math.sin(angle * 7 + phase + fraction * 1.4) + 0.035 * Math.cos(angle * 13);
      point.copy(center)
        .addScaledVector(horizontal, Math.cos(angle) * radius * ridge)
        .addScaledVector(vertical, Math.sin(angle) * radius * ridge);
      if (!trunk) containFoliage(point);
      const stripe = 0.72 + 0.2 * Math.sin(angle * 5 + phase) + random() * 0.12;
      color.copy(bark).multiplyScalar(stripe);
      ring.push(builder.vertex(point, color, part));
    }
    rings.push(ring);
  }
  connectRings(builder, rings);
  const bottom = builder.vertex(start, bark, part);
  const top = builder.vertex(center, bark, part);
  for (let side = 0; side < segments; side++) {
    const next = (side + 1) % segments;
    builder.triangle(bottom, rings[0][side], rings[0][next]);
    builder.triangle(top, rings[steps][next], rings[steps][side]);
  }
}

/** A dark inner crown gives the tree real volume between its individual boughs. */
function appendInnerCrown(builder: GeometryBuilder, part: Part) {
  const rings: number[][] = [];
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  const base = new THREE.Color('#155d36');
  const segments = 56;
  const rows = 40;
  for (let row = 0; row <= rows; row++) {
    const y = FOLIAGE_BOTTOM + (FOLIAGE_TOP - FOLIAGE_BOTTOM) * row / rows;
    const ring: number[] = [];
    for (let side = 0; side < segments; side++) {
      const theta = side / segments * Math.PI * 2;
      const furrow = 0.65 + 0.055 * Math.sin(y * 2.8 + theta * 0.8)
        + 0.045 * Math.sin(theta * 7 + y * 0.6) + 0.022 * Math.cos(theta * 17 - y);
      const radius = foliageRadiusAt(y) * furrow;
      point.set(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
      color.copy(base).multiplyScalar(0.82 + 0.12 * Math.sin(theta * 7 + y * 2));
      ring.push(builder.vertex(point, color, part));
    }
    rings.push(ring);
  }
  connectRings(builder, rings);
  const bottom = builder.vertex(new THREE.Vector3(0, FOLIAGE_BOTTOM, 0), base, part);
  for (let side = 0; side < segments; side++) {
    builder.triangle(bottom, rings[0][side], rings[0][(side + 1) % segments]);
  }
}

/** Uneven, drooping branch sprays make the silhouette a fir rather than stacked cones. */
function appendBough(
  builder: GeometryBuilder,
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  width: number,
  part: Part,
  random: () => number,
  small = false,
) {
  const sideDirection = new THREE.Vector3(-direction.z, 0, direction.x);
  const point = new THREE.Vector3();
  const center = new THREE.Vector3();
  const color = new THREE.Color();
  const base = new THREE.Color(small ? '#2d8048' : '#1b6e3d');
  const phase = random() * Math.PI * 2;
  const rows = small ? 4 : 8;
  const segments = small ? 5 : 9;
  const rings: number[][] = [];
  for (let row = 0; row <= rows; row++) {
    const fraction = row / rows;
    center.copy(start).addScaledVector(direction, length * fraction);
    center.y += (small ? 0.16 : 0.25) * Math.sin(fraction * Math.PI) - fraction * (small ? 0.14 : 0.48);
    const spread = (0.025 + Math.pow(Math.sin(fraction * Math.PI), 0.72)) * width;
    const ring: number[] = [];
    for (let side = 0; side < segments; side++) {
      const angle = side / segments * Math.PI * 2;
      const fringe = 0.9 + 0.14 * Math.sin(angle * 3 + row * 1.8 + phase) + random() * 0.09;
      point.copy(center).addScaledVector(sideDirection, Math.cos(angle) * spread * fringe);
      point.y += Math.sin(angle) * spread * (small ? 0.38 : 0.52);
      containFoliage(point);
      // Brighter upper needle tips and darker undersides provide depth without a texture.
      const shade = 0.7 + Math.max(0, Math.sin(angle)) * 0.3 + fraction * 0.17 + random() * 0.08;
      color.copy(base).multiplyScalar(shade);
      ring.push(builder.vertex(point, color, part));
    }
    rings.push(ring);
  }
  connectRings(builder, rings);
  const capColor = base.clone().multiplyScalar(0.8);
  const firstCenter = builder.vertex(containFoliage(start.clone()), capColor, part);
  const lastCenter = builder.vertex(containFoliage(center.clone()), capColor, part);
  for (let side = 0; side < segments; side++) {
    const next = (side + 1) % segments;
    builder.triangle(firstCenter, rings[0][side], rings[0][next]);
    builder.triangle(lastCenter, rings[rows][next], rings[rows][side]);
  }
}

function appendNeedles(
  builder: GeometryBuilder,
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  part: Part,
  random: () => number,
) {
  const tangent = new THREE.Vector3(-direction.z, 0, direction.x);
  const point = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const baseColor = new THREE.Color('#1b6737');
  const tipColor = new THREE.Color('#438d54');
  const color = new THREE.Color();
  const count = Math.max(7, Math.ceil(length * 5));
  for (let needle = 0; needle < count; needle++) {
    const fraction = 0.08 + 0.88 * needle / Math.max(1, count - 1);
    for (const sign of [-1, 1]) {
      point.copy(start).addScaledVector(direction, fraction * length);
      point.y += 0.25 * Math.sin(fraction * Math.PI) - fraction * 0.48 + 0.1;
      point.addScaledVector(tangent, sign * (0.1 + random() * 0.14));
      containFoliage(point);
      tip.copy(point).addScaledVector(direction, 0.13 + random() * 0.2)
        .addScaledVector(tangent, sign * (0.24 + random() * 0.28));
      tip.y += 0.04 + random() * 0.16;
      containFoliage(tip);
      color.copy(tipColor).multiplyScalar(0.7 + random() * 0.3);
      builder.vertex(point, baseColor, part);
      builder.vertex(tip, color, part);
    }
  }
}

function applyPartMotion(material: THREE.MeshStandardMaterial | THREE.LineBasicMaterial, assembly: AssemblyUniform) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uTreeAssembly = assembly;
    shader.vertexShader = /* glsl */ `
      uniform float uTreeAssembly;
      attribute vec3 aPartPivot;
      attribute vec4 aPartMotion;
      attribute vec3 aPartAxis;
      attribute float aPartScale;
      vec3 treePartRotate(vec3 value) {
        float angle = (1.0 - uTreeAssembly) * aPartMotion.w;
        float sine = sin(angle);
        float cosine = cos(angle);
        return value * cosine + cross(aPartAxis, value) * sine
          + aPartAxis * dot(aPartAxis, value) * (1.0 - cosine);
      }
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nobjectNormal = treePartRotate(objectNormal);',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
        #include <begin_vertex>
        float treePartSize = mix(aPartScale, 1.0, uTreeAssembly);
        transformed = treePartRotate(transformed - aPartPivot) * treePartSize
          + aPartPivot + aPartMotion.xyz * (1.0 - uTreeAssembly);
      `,
    );
  };
  material.customProgramCacheKey = () => 'evergreen-body-parts-v1';
}

function createTreeBody(assembly: AssemblyUniform) {
  const random = randomSource();
  const wood = new GeometryBuilder();
  const greenery = new GeometryBuilder();
  const needles = new GeometryBuilder();
  const trunkPart: Part = {
    pivot: new THREE.Vector3(0, TRUNK_BOTTOM, 0),
    displacement: new THREE.Vector3(0, -0.6, 0),
    axis: new THREE.Vector3(0, 1, 0),
    angle: 0,
    scatteredScale: 0.001,
  };
  appendBark(wood, new THREE.Vector3(0, TRUNK_BOTTOM, 0), new THREE.Vector3(0, 10.8, 0), 0.65, 0.075, trunkPart, random, true);
  const crownPart: Part = {
    ...trunkPart,
    pivot: new THREE.Vector3(0, -2, 0),
    displacement: new THREE.Vector3(0, -3, 0),
  };
  appendInnerCrown(greenery, crownPart);

  // Irregular whorls; the main stem remains visible beneath the lowest sprays.
  for (let layer = 0; layer < 11; layer++) {
    const y = -10.05 + layer * 1.86;
    const count = 12 - Math.floor(layer / 3);
    const offset = layer * 2.399963;
    for (let branch = 0; branch < count; branch++) {
      const angle = branch / count * Math.PI * 2 + offset + (random() - 0.5) * 0.22;
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const start = new THREE.Vector3(direction.x * 0.12, y + 0.43 + (random() - 0.5) * 0.2, direction.z * 0.12);
      const length = foliageRadiusAt(y - 0.06) * (0.93 + random() * 0.065);
      const width = Math.min(1.38, 0.25 + length * 0.19);
      const part = makePart(start.clone().addScaledVector(direction, length * 0.36), random);
      const end = start.clone().addScaledVector(direction, length);
      end.y -= 0.48;
      containFoliage(end);
      appendBark(wood, start, end, Math.min(0.14, length * 0.022), 0.018, part, random);
      appendBough(greenery, start, direction, length, width, part, random);
      appendNeedles(needles, start, direction, length, part, random);

      // Side sprays break up the broad branches into the layered outline of a fir.
      for (const fraction of [0.4, 0.68]) {
        for (const sign of [-1, 1]) {
          const sideAngle = angle + sign * (0.62 + random() * 0.15);
          const sideDirection = new THREE.Vector3(Math.cos(sideAngle), 0, Math.sin(sideAngle));
          const origin = start.clone().addScaledVector(direction, length * fraction);
          origin.y += 0.25 * Math.sin(fraction * Math.PI) - fraction * 0.48 + 0.04;
          const sideLength = Math.max(0.3, length * (1 - fraction) * 0.55);
          appendBough(greenery, origin, sideDirection, sideLength, width * 0.42, part, random, true);
        }
      }
    }
  }

  const barkMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    emissive: '#3a2111',
    emissiveIntensity: 0.2,
  });
  const foliageMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.02,
    emissive: '#123e24',
    emissiveIntensity: 0.25,
  });
  const needleMaterial = new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false });
  for (const material of [barkMaterial, foliageMaterial, needleMaterial]) applyPartMotion(material, assembly);

  const stem = new THREE.Mesh(wood.geometry(), barkMaterial);
  const crown = new THREE.Mesh(greenery.geometry(), foliageMaterial);
  const tips = new THREE.LineSegments(needles.geometry(true), needleMaterial);
  stem.name = 'evergreen-trunk-and-branches';
  crown.name = 'evergreen-solid-boughs';
  tips.name = 'evergreen-needles';
  // Needle lines do not occlude photo picking; the solid boughs and wood do.
  tips.raycast = () => {};
  const objects = [stem, crown, tips];
  return {
    objects,
    dispose() {
      for (const object of objects) {
        object.geometry.dispose();
        object.material.dispose();
      }
    },
  };
}

/** Solid trunk and evergreen branches underneath the photographs: three draw batches. */
export default function TreeBody({ state, reducedMotion }: TreeBodyProps) {
  const group = useRef<THREE.Group>(null);
  const assembly = useRef<AssemblyUniform>({ value: state === 'FORMED' ? 1 : 0 });
  const invalidate = useThree(root => root.invalidate);

  useLayoutEffect(() => {
    const parent = group.current;
    if (!parent) return;
    const body = createTreeBody(assembly.current);
    parent.add(...body.objects);
    invalidate();
    return () => {
      parent.remove(...body.objects);
      body.dispose();
    };
  }, [invalidate]);

  useLayoutEffect(() => {
    if (reducedMotion) assembly.current.value = state === 'FORMED' ? 1 : 0;
    invalidate();
  }, [state, reducedMotion, invalidate]);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const target = state === 'FORMED' ? 1 : 0;
    const before = assembly.current.value;
    if (before === target) return;
    const next = THREE.MathUtils.damp(before, target, 2.1, Math.min(delta, 0.05));
    assembly.current.value = Math.abs(next - target) < 0.0005 ? target : next;
    invalidate();
  });

  return <group ref={group} dispose={null} onPointerDown={event => {
    // The un-deformed CPU mesh is only an occluder after assembly. During scatter,
    // its GPU positions differ, so it must not hide otherwise visible photo picks.
    if (assembly.current.value > 0.985) event.stopPropagation();
  }} />;
}
