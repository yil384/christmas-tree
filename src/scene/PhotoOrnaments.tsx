import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { assetUrl } from '../lib/content';
import type { Photo } from '../lib/content';
import type { HandSceneInput } from '../lib/hand-types';
import { consumeHandPhotoSelection, createHandPhotoPicker, HAND_POINTER_MAX_AGE_MS } from './hand-scene';
import { createPhotoPlacements } from './photo-layout';
import { createPrintGeometry, createPrintMaterial } from './photo-material';

interface PhotoOrnamentsProps {
  state: 'CHAOS' | 'FORMED';
  photos: Photo[];
  count: number;
  reducedMotion?: boolean;
  onPhotoPress: (index: number) => void;
  handInput?: MutableRefObject<HandSceneInput>;
  handActive?: boolean;
  onHandPhotoSelect?: (index: number | null) => void;
}

// At most 16 MiB of uncompressed atlas pixels, even for an enormous album.
// The complete album remains available in the gallery; the tree is its preview.
const MAX_ATLAS_PHOTOS = 256;
const TILE_SIZE = 128;
const GUTTER = 2;
const MAX_PARALLEL_IMAGES = 3;

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

/** Actual 3D prints, wooden clips and strings together in one instanced draw. */
export default function PhotoOrnaments({ state, photos, count, reducedMotion = false, onPhotoPress, handInput, handActive = false, onHandPhotoSelect }: PhotoOrnamentsProps) {
  const visibleCount = photos.length && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const slotCount = Math.min(photos.length, visibleCount, MAX_ATLAS_PHOTOS);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const isMoving = useRef(false);
  const handPicker = useMemo(() => handInput && handActive ? createHandPhotoPicker() : null, [handInput, handActive]);
  const handHover = useRef({ at: -Infinity, x: NaN, y: NaN });
  const handOccluders = useRef<THREE.Object3D[]>([]);
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
    const plane = createPrintGeometry();
    const rects = new Float32Array(visibleCount * 4);
    const colors = new Float32Array(visibleCount * 3);
    const anchors = new Float32Array(visibleCount * 3);
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
      placements[index].hangerEnd.toArray(anchors, index * 3);
    }
    plane.setAttribute('aPhotoRect', new THREE.InstancedBufferAttribute(rects, 4));
    plane.setAttribute('aFrameColor', new THREE.InstancedBufferAttribute(colors, 3));
    plane.setAttribute('aHangerEnd', new THREE.InstancedBufferAttribute(anchors, 3));
    return plane;
  }, [atlas, placements, slotCount, visibleCount]);
  const material = useMemo(() => createPrintMaterial(atlas.texture), [atlas]);

  useEffect(() => {
    handHover.current = { at: -Infinity, x: NaN, y: NaN };
    const input = handInput?.current;
    if (input) {
      input.hoveredPhoto = null;
      input.hoveredAt = 0;
      if (!handActive) input.selectionRequest = null;
    }
    return () => {
      if (input) {
        input.hoveredPhoto = null;
        input.hoveredAt = 0;
        input.selectionRequest = null;
      }
    };
  }, [handInput, handActive, photoIndexes]);

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

  useFrame(({ camera }, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) {
      if (handInput) {
        const selected = consumeHandPhotoSelection(handInput.current, handActive, performance.now(), () => null);
        if (selected !== undefined) onHandPhotoSelect?.(selected);
      }
      return;
    }
    const formed = state === 'FORMED';
    if (isMoving.current) {
      const delta = Math.min(rawDelta, 0.05);
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
      // Parent rotation continues on the GPU; settled cards need no CPU transforms.
      isMoving.current = !settled;
      if (!settled) invalidate();
    }

    const input = handInput?.current;
    if (!handPicker || !input) return;
    const now = performance.now();
    if (!input.enabled || !handActive) {
      input.selectionRequest = null;
      input.hoveredPhoto = null;
      input.hoveredAt = 0;
      handHover.current.at = -Infinity;
      return;
    }
    const request = input.selectionRequest;
    const cursor = request?.cursor ?? input.cursor;
    if (!request && (!cursor || input.lastInputAt <= 0 || now - input.lastInputAt > HAND_POINTER_MAX_AGE_MS)) {
      input.hoveredPhoto = null;
      input.hoveredAt = 0;
      handHover.current.at = -Infinity;
      return;
    }
    const previous = handHover.current;
    const cursorChanged = cursor && (previous.x !== cursor.x || previous.y !== cursor.y);
    if (!request && !cursorChanged && now - previous.at < 1000 / 15) return;
    const occluders = handOccluders.current;
    occluders.length = 0;
    if (formed && !isMoving.current) {
      // Tree deformation is GPU-only while assembling. Its static CPU surfaces
      // become accurate occluders once the prints and tree have settled.
      for (const name of ['evergreen-solid-boughs', 'evergreen-trunk-and-branches']) {
        const object = mesh.parent?.getObjectByName(name);
        if (object) occluders.push(object);
      }
    }
    if (request) {
      const selected = consumeHandPhotoSelection(input, handActive, now,
        anchored => handPicker(mesh, camera, anchored, photoIndexes, occluders));
      previous.at = now;
      previous.x = request.cursor.x;
      previous.y = request.cursor.y;
      if (selected !== undefined) onHandPhotoSelect?.(selected);
      return;
    }
    if (!cursor) return;
    previous.at = now;
    previous.x = cursor.x;
    previous.y = cursor.y;
    input.hoveredPhoto = handPicker(mesh, camera, cursor, photoIndexes, occluders);
    input.hoveredAt = now;
  });

  if (!visibleCount) return null;
  const pressPhoto = (event: ThreeEvent<PointerEvent>) => {
    if (event.instanceId === undefined || !event.face) return;
    // Cord vertices are generated in the shader. Only the actual front/back
    // paper surfaces record a long-press candidate; pegs and edges do not.
    if (geometry.getAttribute('aPart').getX(event.face.a) !== 0) return;
    event.stopPropagation();
    onPhotoPress(photoIndexes[event.instanceId % slotCount]);
  };

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, visibleCount]}
      frustumCulled={false}
      onPointerDown={pressPhoto}
      onPointerOver={event => {
        event.stopPropagation();
        gl.domElement.style.cursor = 'pointer';
      }}
      onPointerOut={() => { gl.domElement.style.cursor = ''; }}
    />
  );
}
