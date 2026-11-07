import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { assetUrl } from '../lib/content';
import type { Photo } from '../lib/content';
import { createPhotoPlacements } from './photo-layout';

interface PhotoOrnamentsProps {
  state: 'CHAOS' | 'FORMED';
  photos: Photo[];
  count: number;
  reducedMotion?: boolean;
  onPhotoSelect: (index: number) => void;
}

// At most 16 MiB of uncompressed atlas pixels, even for an enormous album.
// The complete album remains available in the gallery; the tree is its preview.
const MAX_ATLAS_PHOTOS = 256;
const TILE_SIZE = 128;
const GUTTER = 2;
const MAX_PARALLEL_IMAGES = 3;

const vertexShader = /* glsl */ `
  attribute vec4 aPhotoRect;
  attribute vec3 aFrameColor;
  varying vec2 vCardUv;
  varying vec4 vPhotoRect;
  varying vec3 vFrameColor;
  void main() {
    vCardUv = uv;
    vPhotoRect = aPhotoRect;
    vFrameColor = aFrameColor;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vCardUv;
  varying vec4 vPhotoRect;
  varying vec3 vFrameColor;
  void main() {
    // The back of a real two-sided print is readable, rather than mirrored.
    vec2 cardUv = vCardUv;
    if (!gl_FrontFacing) cardUv.x = 1.0 - cardUv.x;
    // Original 1.2 × 1.5 border with a square 1 × 1 photo and a deeper lower margin.
    vec2 photoUv = (cardUv - vec2(1.0 / 12.0, 4.0 / 15.0)) / vec2(5.0 / 6.0, 2.0 / 3.0);
    float inPhoto = step(0.0, photoUv.x) * step(photoUv.x, 1.0)
                  * step(0.0, photoUv.y) * step(photoUv.y, 1.0);
    vec2 atlasUv = vPhotoRect.xy + clamp(photoUv, 0.0, 1.0) * vPhotoRect.zw;
    vec3 photograph = texture2D(uAtlas, atlasUv).rgb;
    gl_FragColor = vec4(mix(vFrameColor, photograph, inPhoto), 1.0);
    #include <colorspace_fragment>
  }
`;

function createAtlas(slotCount: number) {
  const columns = Math.ceil(Math.sqrt(Math.max(1, slotCount)));
  const size = THREE.MathUtils.ceilPowerOfTwo(columns * TILE_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create the photo atlas');
  context.fillStyle = '#16342c';
  context.fillRect(0, 0, size, size);

  // The complete shell can appear immediately, independently of image requests.
  for (let index = 0; index < Math.max(1, slotCount); index++) {
    const x = (index % columns) * TILE_SIZE;
    const y = Math.floor(index / columns) * TILE_SIZE;
    const gradient = context.createLinearGradient(x, y, x + TILE_SIZE, y + TILE_SIZE);
    gradient.addColorStop(0, '#2c493e');
    gradient.addColorStop(1, '#102b25');
    context.fillStyle = gradient;
    context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { canvas, context, texture, columns, size };
}

/** 300 actual 3D Polaroids, rendered in one draw call instead of 1,200 meshes. */
export default function PhotoOrnaments({ state, photos, count, reducedMotion = false, onPhotoSelect }: PhotoOrnamentsProps) {
  const visibleCount = photos.length && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const slotCount = Math.min(photos.length, visibleCount, MAX_ATLAS_PHOTOS);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const isMoving = useRef(false);
  const gl = useThree(root => root.gl);
  const invalidate = useThree(root => root.invalidate);
  const placements = useMemo(() => createPhotoPlacements(visibleCount), [visibleCount]);
  const matrixHelper = useMemo(() => new THREE.Object3D(), []);
  const atlas = useMemo(() => createAtlas(slotCount), [slotCount]);
  // Sample the whole album when it exceeds the atlas/card limit, retaining original indexes for clicks.
  const photoIndexes = useMemo(
    () => Array.from({ length: slotCount }, (_, index) => Math.floor(index * photos.length / slotCount)),
    [slotCount, photos.length],
  );
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1.2, 1.5);
    plane.translate(0, -0.15, 0);
    const rects = new Float32Array(visibleCount * 4);
    const colors = new Float32Array(visibleCount * 3);
    const innerSize = TILE_SIZE - GUTTER * 2;
    for (let index = 0; index < visibleCount; index++) {
      const slot = index % slotCount;
      const x = (slot % atlas.columns) * TILE_SIZE + GUTTER;
      const y = Math.floor(slot / atlas.columns) * TILE_SIZE + GUTTER;
      // Half-texel insets plus extruded gutters prevent adjacent atlas photos bleeding.
      rects.set([
        (x + 0.5) / atlas.size,
        1 - (y + innerSize - 0.5) / atlas.size,
        (innerSize - 1) / atlas.size,
        (innerSize - 1) / atlas.size,
      ], index * 4);
      placements[index].frameColor.toArray(colors, index * 3);
    }
    plane.setAttribute('aPhotoRect', new THREE.InstancedBufferAttribute(rects, 4));
    plane.setAttribute('aFrameColor', new THREE.InstancedBufferAttribute(colors, 3));
    return plane;
  }, [atlas, placements, slotCount, visibleCount]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas.texture } },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), [atlas]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // A fixed generous bound also keeps raycasts correct throughout scatter/reassembly.
    mesh.boundingSphere ??= new THREE.Sphere(new THREE.Vector3(), 75);
    const formed = state === 'FORMED';
    for (let index = 0; index < placements.length; index++) {
      const placement = placements[index];
      if (reducedMotion) {
        placement.position.copy(formed ? placement.formedPosition : placement.scatteredPosition);
        placement.rotation.copy(formed ? placement.formedRotation : placement.scatteredRotation);
      }
      matrixHelper.position.copy(placement.position);
      matrixHelper.quaternion.copy(placement.rotation);
      matrixHelper.scale.setScalar(placement.scale);
      matrixHelper.updateMatrix();
      mesh.setMatrixAt(index, matrixHelper.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    isMoving.current = !reducedMotion;
    // A demand-rendered reduced-motion scene needs exactly one complete target frame.
    invalidate();
  }, [geometry, invalidate, material, matrixHelper, placements, reducedMotion, state]);

  useEffect(() => {
    let cancelled = false;
    let nextSlot = 0;
    let uploadFrame = 0;
    const active = new Set<HTMLImageElement>();
    atlas.texture.needsUpdate = true;
    const scheduleUpload = () => {
      if (uploadFrame || cancelled) return;
      uploadFrame = requestAnimationFrame(() => {
        uploadFrame = 0;
        if (cancelled) return;
        atlas.texture.needsUpdate = true;
        invalidate();
      });
    };
    const startNext = () => {
      if (cancelled || nextSlot >= photoIndexes.length) return;
      const slot = nextSlot++;
      const photo = photos[photoIndexes[slot]];
      const image = new Image();
      image.decoding = 'async';
      active.add(image);
      const finish = () => {
        active.delete(image);
        image.onload = null;
        image.onerror = null;
        startNext();
      };
      image.onload = () => {
        if (cancelled) return;
        try {
          const width = image.naturalWidth;
          const height = image.naturalHeight;
          if (width && height) {
            const inner = TILE_SIZE - GUTTER * 2;
            const x = (slot % atlas.columns) * TILE_SIZE + GUTTER;
            const y = Math.floor(slot / atlas.columns) * TILE_SIZE + GUTTER;
            const crop = Math.min(width, height);
            const { context, canvas } = atlas;
            // Center-cover cropping preserves portrait/landscape proportions inside the square print.
            context.drawImage(image, (width - crop) / 2, (height - crop) / 2, crop, crop, x, y, inner, inner);
            context.drawImage(canvas, x, y, 1, inner, x - GUTTER, y, GUTTER, inner);
            context.drawImage(canvas, x + inner - 1, y, 1, inner, x + inner, y, GUTTER, inner);
            context.drawImage(canvas, x - GUTTER, y, TILE_SIZE, 1, x - GUTTER, y - GUTTER, TILE_SIZE, GUTTER);
            context.drawImage(canvas, x - GUTTER, y + inner - 1, TILE_SIZE, 1, x - GUTTER, y + inner, TILE_SIZE, GUTTER);
            scheduleUpload();
          }
        } catch {
          // Keep the placeholder if a decoded image cannot be drawn into the atlas.
        } finally {
          // A bad thumbnail must never stall one of the three loading lanes.
          finish();
        }
      };
      image.onerror = () => { if (!cancelled) finish(); };
      image.src = assetUrl(photo.thumbnail);
    };
    for (let index = 0; index < MAX_PARALLEL_IMAGES; index++) startNext();
    return () => {
      cancelled = true;
      cancelAnimationFrame(uploadFrame);
      active.forEach(image => {
        image.onload = null;
        image.onerror = null;
        image.src = '';
      });
      active.clear();
    };
  }, [atlas, invalidate, photoIndexes, photos]);

  // These memoized assets are ours; only replacement/unmount disposes them.
  // R3F also disposes the InstancedMesh itself, releasing its instance-matrix buffer.
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => () => { material.dispose(); }, [material]);
  useEffect(() => () => { atlas.texture.dispose(); }, [atlas]);
  useEffect(() => () => { gl.domElement.style.cursor = ''; }, [gl]);

  useFrame((_root, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!isMoving.current) return;
    const delta = Math.min(rawDelta, 0.05);
    const formed = state === 'FORMED';
    let settled = true;
    for (let index = 0; index < placements.length; index++) {
      const placement = placements[index];
      const targetPosition = formed ? placement.formedPosition : placement.scatteredPosition;
      const targetRotation = formed ? placement.formedRotation : placement.scatteredRotation;
      const damping = -Math.expm1(-delta * (formed ? 1.8 * placement.weight : 1.5));
      placement.position.lerp(targetPosition, damping);
      placement.rotation.slerp(targetRotation, damping);
      if (placement.position.distanceToSquared(targetPosition) < 0.0001 && placement.rotation.angleTo(targetRotation) < 0.002) {
        placement.position.copy(targetPosition);
        placement.rotation.copy(targetRotation);
      } else {
        settled = false;
      }
      matrixHelper.position.copy(placement.position);
      matrixHelper.quaternion.copy(placement.rotation);
      matrixHelper.scale.setScalar(placement.scale);
      matrixHelper.updateMatrix();
      mesh.setMatrixAt(index, matrixHelper.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // Parent rotation continues on the GPU; settled cards need no per-frame CPU transforms.
    isMoving.current = !settled;
    if (!settled) invalidate();
  });

  if (!visibleCount) return null;
  const selectPhoto = (event: ThreeEvent<MouseEvent>) => {
    // Orbit/drag gestures must not accidentally open a photograph on release.
    if (event.delta > 5 || event.instanceId === undefined) return;
    event.stopPropagation();
    onPhotoSelect(photoIndexes[event.instanceId % slotCount]);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, visibleCount]}
      frustumCulled={false}
      onClick={selectPhoto}
      onPointerOver={event => {
        event.stopPropagation();
        gl.domElement.style.cursor = 'pointer';
      }}
      onPointerOut={() => { gl.domElement.style.cursor = ''; }}
    />
  );
}
