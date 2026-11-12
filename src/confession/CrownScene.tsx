import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Material, WebGLRenderTarget } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeFireworkSky } from './FireworkSky';
import type { FireworkBurst } from './FireworkSky';

export interface CrownSceneProps {
  active: boolean;
  /** The parent's hold gesture, clamped to 0…1. */
  charge: number;
  reducedMotion: boolean;
  mode?: 'crown' | 'sky';
  burst?: FireworkBurst;
  onReady?: () => void;
  onUnavailable?: () => void;
}

type CrownRuntime = { invalidate: () => void };
type CrownModel = {
  object: Group;
  gold: MeshPhysicalMaterial;
  rose: MeshPhysicalMaterial;
  diamonds: MeshPhysicalMaterial;
  magic: ShaderMaterial;
  halo: MeshBasicMaterial;
};

const TAU = Math.PI * 2;
const bandY = -0.41;
const radiusX = 1.12;
const radiusZ = 0.69;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** The crown is deliberately a piece of jewellery, not an animated character. */
function around(angle: number, height: number, outset = 0): Vector3 {
  return new Vector3((radiusX + outset) * Math.sin(angle), height, (radiusZ + outset) * Math.cos(angle));
}

function makeGlowTexture(shadow = false): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const glow = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (shadow) {
      glow.addColorStop(0, 'rgba(29, 13, 48, 0.48)');
      glow.addColorStop(0.28, 'rgba(29, 13, 48, 0.32)');
      glow.addColorStop(0.75, 'rgba(29, 13, 48, 0.07)');
      glow.addColorStop(1, 'rgba(29, 13, 48, 0)');
    } else {
      glow.addColorStop(0, 'rgba(255, 232, 187, 0.68)');
      glow.addColorStop(0.22, 'rgba(246, 182, 203, 0.25)');
      glow.addColorStop(0.62, 'rgba(228, 151, 207, 0.065)');
      glow.addColorStop(1, 'rgba(228, 151, 207, 0)');
    }
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Flat facets remain visible at phone size, unlike a smooth transparent sphere. */
function cutGemGeometry(): BufferGeometry {
  const coordinates: number[] = [];
  const segments = 10;
  const rings = [
    { radius: 0.48, z: 0.34 },
    { radius: 1, z: 0.03 },
    { radius: 0.98, z: -0.07 },
  ];
  const ringPoint = (ring: number, segment: number) => {
    const angle = (segment / segments) * TAU + Math.PI / 2;
    const r = rings[ring];
    return [Math.cos(angle) * r.radius, Math.sin(angle) * r.radius, r.z];
  };
  const triangle = (a: number[], b: number[], c: number[]) => coordinates.push(...a, ...b, ...c);
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    triangle([0, 0, rings[0].z], ringPoint(0, i), ringPoint(0, next));
    for (let ring = 0; ring < rings.length - 1; ring++) {
      triangle(ringPoint(ring, i), ringPoint(ring + 1, i), ringPoint(ring + 1, next));
      triangle(ringPoint(ring, i), ringPoint(ring + 1, next), ringPoint(ring, next));
    }
    triangle(ringPoint(2, i), [0, 0, -0.7], ringPoint(2, next));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(coordinates), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeCrown(): CrownModel {
  const object = new Group();
  const gold = new MeshPhysicalMaterial({
    color: '#e9c38b', metalness: 1, roughness: 0.19,
    clearcoat: 0.55, clearcoatRoughness: 0.12,
    emissive: '#d78836', emissiveIntensity: 0.025,
    envMapIntensity: 1.25,
  });
  const paleGold = new MeshPhysicalMaterial({
    color: '#f8e6c7', metalness: 0.95, roughness: 0.2,
    clearcoat: 0.4, envMapIntensity: 1.1,
  });
  const rose = new MeshPhysicalMaterial({
    color: '#e9a8cd', metalness: 0.17, roughness: 0.075,
    clearcoat: 1, clearcoatRoughness: 0.035,
    ior: 2.1, specularIntensity: 1.3,
    emissive: '#d6679f', emissiveIntensity: 0.055,
    envMapIntensity: 1.35, flatShading: true,
  });
  const diamonds = new MeshPhysicalMaterial({
    color: '#f9f4f5', metalness: 0.22, roughness: 0.055,
    clearcoat: 1, clearcoatRoughness: 0.02,
    ior: 2.35, specularIntensity: 1.5,
    emissive: '#fff1d6', emissiveIntensity: 0.015,
    envMapIntensity: 1.7, flatShading: true,
  });
  const pearl = new MeshPhysicalMaterial({
    color: '#fff3e0', metalness: 0.08, roughness: 0.24,
    clearcoat: 0.85, clearcoatRoughness: 0.14,
    sheen: 0.65, sheenColor: new Color('#f3d5e6'), sheenRoughness: 0.45,
    envMapIntensity: 0.95,
  });

  const goldCurves: BufferGeometry[] = [];
  const paleCurves: BufferGeometry[] = [];
  const pearlPositions: Array<{ position: Vector3; radius: number }> = [];
  const stonePositions: Array<{ position: Vector3; angle: number; scale: Vector3 }> = [];
  const pinkPositions: Array<{ position: Vector3; angle: number; scale: Vector3 }> = [];
  const sparklePositions: Vector3[] = [];

  const tube = (points: Vector3[], radius: number, pale = false, closed = false, steps = 20) => {
    const curve = new CatmullRomCurve3(points, closed, 'centripetal');
    (pale ? paleCurves : goldCurves).push(new TubeGeometry(curve, steps, radius, 6, closed));
  };
  const wrapped = (center: number, points: Array<[number, number]>, outset = 0) => points.map(([x, y]) => around(center + x / radiusX, y + bandY, outset));
  const ring = (height: number, radius: number, outset = 0, pale = false) => {
    const points = Array.from({ length: 48 }, (_, i) => around((i / 48) * TAU, height, outset));
    tube(points, radius, pale, true, 96);
  };

  // Three narrow rails make an open, wearable circlet rather than a solid cone.
  ring(bandY, 0.025);
  ring(bandY + 0.135, 0.021, 0.008);
  ring(bandY + 0.065, 0.011, 0.018, true);
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * TAU;
    pearlPositions.push({ position: around(angle, bandY + 0.146, 0.009), radius: 0.025 });
    if (i % 2 === 0) {
      stonePositions.push({ position: around(angle, bandY + 0.066, 0.034), angle, scale: new Vector3(0.025, 0.031, 0.026) });
      tube([around(angle - 0.02, bandY + 0.02), around(angle, bandY + 0.06), around(angle + 0.02, bandY + 0.115)], 0.008, true, false, 6);
    }
  }

  // A sculpted front of five rising, looped fleurs; the highest is the centre.
  const angles = [-1.05, -0.53, 0, 0.53, 1.05];
  angles.forEach((angle, index) => {
    const height = [0.72, 0.99, 1.24, 0.99, 0.72][index];
    const width = [0.2, 0.24, 0.27, 0.24, 0.2][index];
    const base = 0.14;
    tube(wrapped(angle, [
      [0, base], [-width * 0.65, height * 0.31], [-width, height * 0.56],
      [-width * 0.55, height * 0.8], [0, height],
      [width * 0.55, height * 0.8], [width, height * 0.56],
      [width * 0.65, height * 0.31], [0, base],
    ]), 0.019, false, false, 44);
    tube(wrapped(angle, [[0, base], [0, height * 0.48], [0, height * 0.9]]), 0.012, true, false, 16);

    // Side leaves curl back toward the stem, giving the front an airy filigree.
    for (const side of [-1, 1]) {
      tube(wrapped(angle, [
        [side * width * 0.2, height * 0.36],
        [side * width * 1.18, height * 0.32],
        [side * width * 1.45, height * 0.5],
        [side * width * 1.06, height * 0.62],
        [side * width * 0.88, height * 0.52],
      ], 0.004), 0.0125, false, false, 24);
      tube(wrapped(angle, [
        [0, height * 0.73], [side * width * 0.48, height * 0.68],
        [side * width * 0.43, height * 0.57], [side * width * 0.12, height * 0.59],
      ], 0.012), 0.009, true, false, 16);
      stonePositions.push({
        position: around(angle + side * width * 0.68 / radiusX, bandY + height * 0.52, 0.028),
        angle: angle + side * width * 0.68 / radiusX,
        scale: new Vector3(0.026, 0.043, 0.027),
      });
    }

    const gemHeight = bandY + height * 0.62;
    const gemScale = index === 2 ? new Vector3(0.118, 0.176, 0.11) : new Vector3(0.077, 0.121, 0.08);
    pinkPositions.push({ position: around(angle, gemHeight, 0.051), angle, scale: gemScale });

    // A closed setting follows the shape of each oval-cut centre stone.
    const setting = Array.from({ length: 24 }, (_, i) => {
      const phase = (i / 24) * TAU;
      return around(angle + Math.cos(phase) * (gemScale.x + 0.022) / radiusX,
        gemHeight + Math.sin(phase) * (gemScale.y + 0.018), 0.041);
    });
    tube(setting, 0.01, false, true, 36);
    for (let i = 0; i < 10; i++) {
      const phase = (i / 10) * TAU;
      stonePositions.push({
        position: around(angle + Math.cos(phase) * (gemScale.x + 0.026) / radiusX,
          gemHeight + Math.sin(phase) * (gemScale.y + 0.022), 0.063),
        angle,
        scale: new Vector3(0.015, 0.018, 0.016),
      });
    }
    const tip = around(angle, bandY + height + 0.026, 0.006);
    pearlPositions.push({ position: tip, radius: index === 2 ? 0.049 : 0.035 });
    sparklePositions.push(tip.clone().add(new Vector3(0.02, 0.015, 0.04)));
    sparklePositions.push(around(angle, gemHeight + gemScale.y * 0.55, 0.12));
  });

  // The back stays low, so the tiara reads correctly when the visitor turns it.
  for (let i = 0; i < 5; i++) {
    const start = 1.2 + i * ((TAU - 2.4) / 5);
    const end = 1.2 + (i + 1) * ((TAU - 2.4) / 5);
    tube([
      around(start, bandY + 0.13), around((start + end) / 2, bandY + 0.33),
      around(end, bandY + 0.13),
    ], 0.016, false, false, 20);
    pearlPositions.push({ position: around((start + end) / 2, bandY + 0.34), radius: 0.029 });
  }

  const merge = (parts: BufferGeometry[], material: Material) => {
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (geometry) object.add(new Mesh(geometry, material));
  };
  merge(goldCurves, gold);
  merge(paleCurves, paleGold);

  const dummy = new Object3D();
  const pearls = new InstancedMesh(new SphereGeometry(1, 12, 8), pearl, pearlPositions.length);
  pearlPositions.forEach(({ position, radius }, i) => {
    dummy.position.copy(position);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(radius);
    dummy.updateMatrix();
    pearls.setMatrixAt(i, dummy.matrix);
  });
  pearls.instanceMatrix.needsUpdate = true;
  object.add(pearls);

  const addStones = (positions: typeof stonePositions, material: Material) => {
    const stones = new InstancedMesh(cutGemGeometry(), material, positions.length);
    positions.forEach(({ position, angle, scale }, i) => {
      dummy.position.copy(position);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.copy(scale);
      dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
    });
    stones.instanceMatrix.needsUpdate = true;
    object.add(stones);
  };
  addStones(stonePositions, diamonds);
  addStones(pinkPositions, rose);

  // Small shader-drawn highlights: one draw call, no giant bloom render targets.
  const sparkles = new BufferGeometry();
  sparkles.setAttribute('position', new BufferAttribute(new Float32Array(sparklePositions.flatMap(p => p.toArray())), 3));
  sparkles.setAttribute('seed', new BufferAttribute(new Float32Array(sparklePositions.map((_, i) => i * 2.391)), 1));
  const magic = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCharge: { value: 0 }, uDpr: { value: 1 } },
    vertexShader: `
      attribute float seed;
      uniform float uTime;
      uniform float uCharge;
      uniform float uDpr;
      varying float vGlow;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        float pulse = pow(max(0.0, sin(uTime * 0.72 + seed)), 9.0);
        vGlow = 0.12 + pulse * 0.7 + uCharge * 0.28;
        gl_PointSize = (5.0 + pulse * 8.0 + uCharge * 4.0) * uDpr;
        gl_Position = projectionMatrix * p;
      }
    `,
    fragmentShader: `
      varying float vGlow;
      void main() {
        vec2 p = abs(gl_PointCoord - 0.5) * 2.0;
        float core = exp(-dot(p, p) * 19.0);
        float cross = exp(-p.x * 35.0 - p.y * 4.0) + exp(-p.y * 35.0 - p.x * 4.0);
        float alpha = (core + cross * 0.52) * vGlow;
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(1.0, 0.91, 0.76, alpha);
      }
    `,
  });
  const sparklePoints = new Points(sparkles, magic);
  sparklePoints.frustumCulled = false;
  object.add(sparklePoints);

  const halo = new MeshBasicMaterial({
    map: makeGlowTexture(), transparent: true, opacity: 0.18,
    blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
  });
  const haloMesh = new Mesh(new PlaneGeometry(3.5, 3.5), halo);
  haloMesh.position.set(0, 0.13, -0.7);
  haloMesh.renderOrder = -1;
  object.add(haloMesh);
  return { object, gold, rose, diamonds, magic, halo };
}

function disposeObject(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse(child => {
    if (child instanceof Mesh || child instanceof Points) {
      geometries.add(child.geometry);
      const itemMaterials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of itemMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      }
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}

export default function CrownScene(props: CrownSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef(props);
  const runtime = useRef<CrownRuntime | null>(null);
  const lastBurstId = useRef<number | undefined>(undefined);
  settings.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLRenderer | undefined;
    let environment: WebGLRenderTarget | undefined;
    let scene: Scene | undefined;
    let frame = 0;
    let failed = false;
    let disposed = false;
    let visible = !document.hidden;
    let firstFrame = true;
    let lastFrame = 0;
    let elapsed = 0;
    let width = 0;
    let height = 0;
    let charge = clamp(settings.current.charge, 0, 1);
    let targetYaw = -0.12;
    let yaw = targetYaw;
    let velocity = 0;
    let dragging = false;
    let pointer: { id: number; x: number; y: number; previousX: number; previousTime: number } | null = null;
    const isSky = settings.current.mode === 'sky';

    const unavailable = () => {
      if (failed || disposed) return;
      failed = true;
      cancelAnimationFrame(frame);
      frame = 0;
      settings.current.onUnavailable?.();
    };

    try {
      const context = canvas.getContext('webgl2', {
        alpha: true, antialias: true, premultipliedAlpha: true,
        powerPreference: 'low-power', preserveDrawingBuffer: false,
      });
      if (!context) { unavailable(); return; }
      renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

      scene = new Scene();
      const camera = new PerspectiveCamera(isSky ? 55 : 31, 1, 0.1, 60);
      const lookAt = new Vector3(0, 0.1, 0);
      const crown = isSky ? undefined : makeCrown();
      const sky = isSky ? makeFireworkSky() : undefined;
      if (crown) {
        scene.add(crown.object);
        const room = new RoomEnvironment();
        const pmrem = new PMREMGenerator(renderer);
        try {
          environment = pmrem.fromScene(room, 0.035);
          scene.environment = environment.texture;
          scene.environmentIntensity = 0.85;
        } finally { room.dispose(); pmrem.dispose(); }
        scene.add(new AmbientLight('#e4ccf2', 0.8));
        const key = new DirectionalLight('#fff1db', 3.5);
        key.position.set(-3, 4, 5);
        scene.add(key);
        const fill = new DirectionalLight('#c7d9ff', 1.8);
        fill.position.set(3, 1.4, 2);
        scene.add(fill);
        const rim = new DirectionalLight('#ffc4dc', 2.2);
        rim.position.set(0, 2, -3);
        scene.add(rim);
        crown.object.rotation.x = 0.08;
        const contact = new Mesh(new PlaneGeometry(3.4, 2.3), new MeshBasicMaterial({
          map: makeGlowTexture(true), transparent: true, opacity: 0.5, depthWrite: false,
        }));
        contact.rotation.x = -Math.PI / 2;
        contact.position.y = -0.53;
        scene.add(contact);
      }
      if (sky) scene.add(sky.object);

      const stableCameraQuaternion = new Quaternion();
      const inverseCrownQuaternion = new Quaternion();
      const updateSize = () => {
        if (!renderer || disposed || failed) return;
        const rect = canvas.getBoundingClientRect();
        width = Math.max(0, Math.round(rect.width));
        height = Math.max(0, Math.round(rect.height));
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        if (isSky) {
          camera.position.set(0, 0, 12);
          camera.lookAt(0, 0, 0);
        } else {
          const fitHeight = Math.max(2.65, 3.3 / camera.aspect);
          const distance = fitHeight / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));
          camera.position.set(0, distance * 0.16 + 0.1, distance);
          camera.lookAt(lookAt);
        }
        stableCameraQuaternion.copy(camera.quaternion);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        if (crown) crown.magic.uniforms.uDpr.value = renderer.getPixelRatio();
        sky?.setDpr(renderer.getPixelRatio());
        invalidate();
      };

      const draw = (now: number) => {
        frame = 0;
        if (disposed || failed || !visible || !settings.current.active || !renderer || !scene) return;
        const deltaMs = lastFrame ? now - lastFrame : 34;
        if (deltaMs < 1000 / 30 - 0.5) { frame = requestAnimationFrame(draw); return; }
        const delta = Math.min(deltaMs / 1000, 0.07);
        lastFrame = now;
        const reduce = settings.current.reducedMotion;
        if (!reduce) elapsed += delta;
        if (!dragging && !reduce && Math.abs(velocity) > 0.001) {
          targetYaw += velocity * delta;
          velocity *= Math.exp(-delta * 6);
        }
        const factor = 1 - Math.exp(-delta * 10);
        yaw += (targetYaw - yaw) * (reduce ? 1 : factor);
        charge += (clamp(settings.current.charge, 0, 1) - charge) * (reduce ? 1 : factor);
        if (crown) {
          crown.object.rotation.y = yaw + (reduce || dragging ? 0 : Math.sin(elapsed * 0.34) * 0.055);
          crown.object.rotation.z = reduce ? 0 : Math.sin(elapsed * 0.43) * 0.012;
          crown.object.position.y = reduce ? 0 : Math.sin(elapsed * 0.63) * 0.014;
          crown.gold.emissiveIntensity = 0.025 + charge * 0.13;
          crown.rose.emissiveIntensity = 0.055 + charge * 0.35;
          crown.diamonds.emissiveIntensity = 0.015 + charge * 0.19;
          crown.halo.opacity = 0.13 + charge * 0.3;
          crown.magic.uniforms.uTime.value = elapsed;
          crown.magic.uniforms.uCharge.value = charge;
          const halo = crown.object.children[crown.object.children.length - 1];
          inverseCrownQuaternion.copy(crown.object.quaternion).invert();
          halo.quaternion.copy(stableCameraQuaternion).premultiply(inverseCrownQuaternion);
        }
        let skyMoving = false;
        if (sky) {
          const burst = settings.current.burst;
          if (burst && burst.id !== lastBurstId.current && width > 0 && height > 0) {
            lastBurstId.current = burst.id;
            sky.launch(burst, camera, reduce);
          }
          skyMoving = sky.update(delta, reduce);
        }
        if (width > 0 && height > 0) {
          try { renderer.render(scene, camera); }
          catch { unavailable(); return; }
          if (firstFrame) { firstFrame = false; settings.current.onReady?.(); }
        }
        if (sky ? skyMoving : !reduce || dragging || Math.abs(charge - settings.current.charge) > 0.005) frame = requestAnimationFrame(draw);
      };

      function invalidate() {
        if (!frame && !disposed && !failed && visible && settings.current.active) {
          lastFrame = 0;
          frame = requestAnimationFrame(draw);
        } else if ((!settings.current.active || !visible) && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      }
      runtime.current = { invalidate };

      const onPointerDown = (event: PointerEvent) => {
        if (isSky || !settings.current.active || !event.isPrimary) return;
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, previousX: event.clientX, previousTime: event.timeStamp };
        velocity = 0;
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!pointer || event.pointerId !== pointer.id) return;
        const horizontal = event.clientX - pointer.x;
        const vertical = event.clientY - pointer.y;
        if (!dragging && Math.abs(horizontal) > 7 && Math.abs(horizontal) > Math.abs(vertical) * 1.2) {
          dragging = true;
          canvas.setPointerCapture(event.pointerId);
        }
        if (!dragging) return;
        event.preventDefault();
        const step = event.clientX - pointer.previousX;
        targetYaw += step * 0.006;
        const delta = Math.max(8, event.timeStamp - pointer.previousTime) / 1000;
        velocity = clamp(step * 0.006 / delta, -1.3, 1.3);
        pointer.previousX = event.clientX;
        pointer.previousTime = event.timeStamp;
        invalidate();
      };
      const onPointerUp = (event: PointerEvent) => {
        if (!pointer || event.pointerId !== pointer.id) return;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        pointer = null;
        dragging = false;
        invalidate();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (isSky || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        targetYaw += event.key === 'ArrowLeft' ? -0.22 : 0.22;
        invalidate();
      };
      const onVisibility = () => { visible = !document.hidden; invalidate(); };
      const onContextLost = (event: Event) => { event.preventDefault(); unavailable(); };
      const resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(canvas);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove, { passive: false });
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      canvas.addEventListener('keydown', onKeyDown);
      canvas.addEventListener('webglcontextlost', onContextLost);
      document.addEventListener('visibilitychange', onVisibility);
      updateSize();

      return () => {
        disposed = true;
        runtime.current = null;
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('keydown', onKeyDown);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        document.removeEventListener('visibilitychange', onVisibility);
        if (scene) disposeObject(scene);
        environment?.dispose();
        renderer?.renderLists.dispose();
        renderer?.dispose();
        // Keep the canvas context reusable by React StrictMode and mode changes.
        // Renderer.dispose and the explicit geometry/material cleanup free its GPU assets.
      };
    } catch {
      unavailable();
      if (scene) disposeObject(scene);
      environment?.dispose();
      renderer?.dispose();
    }
  }, [props.mode]);

  useEffect(() => { runtime.current?.invalidate(); }, [props.active, props.charge, props.reducedMotion, props.burst?.id]);

  return <canvas ref={canvasRef}
    className="princess-crown-canvas"
    role="img"
    aria-label={props.mode === 'sky' ? '城堡上空的立体烟花。轻点夜空，为公主放一朵烟花。' : '镶嵌粉晶和珍珠的金色公主王冠，可以左右拖动旋转。键盘左右方向键也可以旋转。'}
    tabIndex={props.active && props.mode !== 'sky' ? 0 : -1}
    style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y', outlineOffset: '-4px' }}
  />;
}
