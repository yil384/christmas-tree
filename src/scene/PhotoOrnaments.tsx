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
import { loadPhotoAtlas } from './photo-atlas-loader';
import { createPrintGeometry, createPrintMaterial } from './photo-material';
import { createPhotoTexture, replacePhotoTexture } from './photo-texture';

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

// New albums ship one prebuilt atlas; older manifests retain a batched fallback.
// Full-resolution gallery images are never requested by the tree.
const MAX_ATLAS_PHOTOS = 256;
const PREFERRED_TILE_SIZE = 384;
const GUTTER = 8;

function createPreparedAtlas(src: string, anisotropy: number) {
  // Compile and show the tree immediately using a 1px map. The decoded atlas
  // gets a new Texture: WebGL immutable storage cannot grow this placeholder.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const texture = createPhotoTexture(canvas, anisotropy);
  return { prepared: true as const, src, texture };
}

function createAtlas(slotCount: number, maximumTextureSize: number, anisotropy: number) {
  const columns = Math.ceil(Math.sqrt(Math.max(1, slotCount)));
  const limit = Math.min(4096, maximumTextureSize);
  const tileSize = Math.min(PREFERRED_TILE_SIZE, Math.floor(limit / columns));
  const size = Math.min(limit, THREE.MathUtils.ceilPowerOfTwo(columns * tileSize));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create the photo atlas');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#16342c';
  context.fillRect(0, 0, size, size);

  // The complete shell can appear immediately, independently of image requests.
  for (let index = 0; index < Math.max(1, slotCount); index++) {
    const x = (index % columns) * tileSize;
    const y = Math.floor(index / columns) * tileSize;
    const gradient = context.createLinearGradient(x, y, x + tileSize, y + tileSize);
    gradient.addColorStop(0, '#2c493e');
    gradient.addColorStop(1, '#102b25');
    context.fillStyle = gradient;
    context.fillRect(x, y, tileSize, tileSize);
  }

  const texture = createPhotoTexture(canvas, anisotropy);
  return { prepared: false as const, canvas, context, texture, columns, size, tileSize };
}

function fallbackPhotoRect(atlas: ReturnType<typeof createAtlas>, slot: number): [number, number, number, number] {
  const innerSize = atlas.tileSize - GUTTER * 2;
  const x = (slot % atlas.columns) * atlas.tileSize + GUTTER;
  const y = Math.floor(slot / atlas.columns) * atlas.tileSize + GUTTER;
  return [(x + 0.5) / atlas.size, 1 - (y + innerSize - 0.5) / atlas.size,
    (innerSize - 1) / atlas.size, (innerSize - 1) / atlas.size];
}

/** Actual 3D prints, wooden clips and strings together in one instanced draw. */
export default function PhotoOrnaments({ state, photos, count, reducedMotion = false, onPhotoPress, handInput, handActive = false, onHandPhotoSelect }: PhotoOrnamentsProps) {
  const visibleCount = photos.length && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const slotCount = Math.min(photos.length, visibleCount, MAX_ATLAS_PHOTOS);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const isMoving = useRef(false);
  const handPicker = useMemo(() => handInput && handActive ? createHandPhotoPicker() : null, [handInput, handActive]);
  const pointerPicker = useMemo(() => createHandPhotoPicker(), []);
  const handHover = useRef({ at: -Infinity, x: NaN, y: NaN });
  const handOccluders = useRef<THREE.Object3D[]>([]);
  const gl = useThree(root => root.gl);
  const invalidate = useThree(root => root.invalidate);
  const placements = useMemo(() => createPhotoPlacements(visibleCount), [visibleCount]);
  const matrixHelper = useMemo(() => new THREE.Object3D(), []);
  const atlasSource = useMemo(() => {
    const src = photos[0]?.atlas?.src;
    return src && photos.every(photo => photo.atlas?.src === src) ? src : undefined;
  }, [photos]);
  const atlas = useMemo(() => atlasSource
    ? createPreparedAtlas(atlasSource, gl.capabilities.getMaxAnisotropy())
    : createAtlas(slotCount, gl.capabilities.maxTextureSize, gl.capabilities.getMaxAnisotropy()), [atlasSource, slotCount, gl]);
  const photoReveal = useMemo(() => ({ value: 0 }), [atlas]);
  const atlasReady = useRef(false);
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
    for (let index = 0; index < visibleCount; index++) {
      const slot = index % slotCount;
      if (atlas.prepared) {
        rects.set(photos[photoIndexes[slot]].atlas!.rect, index * 4);
      } else {
        rects.set(fallbackPhotoRect(atlas, slot), index * 4);
      }
      placements[index].frameColor.toArray(colors, index * 3);
      placements[index].hangerEnd.toArray(anchors, index * 3);
    }
    plane.setAttribute('aPhotoRect', new THREE.InstancedBufferAttribute(rects, 4));
    plane.setAttribute('aFrameColor', new THREE.InstancedBufferAttribute(colors, 3));
    plane.setAttribute('aHangerEnd', new THREE.InstancedBufferAttribute(anchors, 3));
    return plane;
  }, [atlas, photoIndexes, photos, placements, slotCount, visibleCount]);
  const material = useMemo(() => createPrintMaterial(atlas.texture, photoReveal), [atlas, photoReveal]);

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
    atlasReady.current = false;
    photoReveal.value = 0;
    const revealAll = () => {
      if (cancelled) return;
      atlas.texture.needsUpdate = true;
      atlasReady.current = true;
      invalidate();
    };
    let fallbackAtlas = atlas.prepared ? undefined : atlas;
    const cancelLoading = loadPhotoAtlas({
      atlasUrl: atlas.prepared ? assetUrl(atlas.src) : undefined,
      cardUrls: photoIndexes.map(index => {
        const photo = photos[index];
        return assetUrl(photo.ornament || photo.thumbnail || photo.src);
      }),
      onAtlas: image => {
        if (cancelled) return;
        replacePhotoTexture(atlas, material, createPhotoTexture(image, gl.capabilities.getMaxAnisotropy()));
        revealAll();
      },
      onFallbackStart: () => {
        // This canvas is allocated only for an old album or one failed atlas.
        fallbackAtlas ??= createAtlas(slotCount, gl.capabilities.maxTextureSize, gl.capabilities.getMaxAnisotropy());
      },
      onCard: (slot, image) => {
        if (!fallbackAtlas) return;
        const { tileSize, context, canvas, columns } = fallbackAtlas;
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (!width || !height) return;
        const inner = tileSize - GUTTER * 2;
        const x = (slot % columns) * tileSize + GUTTER;
        const y = Math.floor(slot / columns) * tileSize + GUTTER;
        const crop = Math.min(width, height);
        context.drawImage(image, (width - crop) / 2, (height - crop) / 2, crop, crop, x, y, inner, inner);
        context.drawImage(canvas, x, y, 1, inner, x - GUTTER, y, GUTTER, inner);
        context.drawImage(canvas, x + inner - 1, y, 1, inner, x + inner, y, GUTTER, inner);
        context.drawImage(canvas, x - GUTTER, y, tileSize, 1, x - GUTTER, y - GUTTER, tileSize, GUTTER);
        context.drawImage(canvas, x - GUTTER, y + inner - 1, tileSize, 1, x - GUTTER, y + inner, tileSize, GUTTER);
      },
      onFallbackComplete: () => {
        if (cancelled || !fallbackAtlas) return;
        if (atlas.prepared) {
          // A fallback uses local slots rather than the prebuilt album's layout.
          // Change all UVs and the map together, while every photo is still hidden.
          const rects = geometry.getAttribute('aPhotoRect');
          for (let index = 0; index < visibleCount; index++) {
            const rect = fallbackPhotoRect(fallbackAtlas, index % slotCount);
            rects.setXYZW(index, ...rect);
          }
          rects.needsUpdate = true;
          replacePhotoTexture(atlas, material, fallbackAtlas.texture);
        }
        revealAll();
      },
    });
    return () => {
      cancelled = true;
      cancelLoading();
      // Once adopted, the fallback belongs to atlas and its unmount cleanup.
      // Only an abandoned, never-installed fallback is owned by this request.
      if (atlas.prepared && fallbackAtlas && fallbackAtlas.texture !== atlas.texture) fallbackAtlas.texture.dispose();
    };
  }, [atlas, geometry, gl, invalidate, material, photoIndexes, photoReveal, photos, slotCount, visibleCount]);

  // These memoized assets are ours; only replacement/unmount disposes them.
  // R3F also disposes the InstancedMesh itself, releasing its instance-matrix buffer.
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => () => { material.dispose(); }, [material]);
  useEffect(() => () => { atlas.texture.dispose(); }, [atlas]);
  useEffect(() => () => { gl.domElement.style.cursor = ''; }, [gl]);

  useFrame(({ camera }, rawDelta) => {
    if (atlasReady.current && photoReveal.value < 1) {
      photoReveal.value = reducedMotion ? 1 : Math.min(1, photoReveal.value + Math.min(rawDelta, 0.05) / 0.45);
      invalidate();
    }
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
    const mesh = meshRef.current;
    if (!mesh || event.instanceId === undefined || !event.face) return;
    // Cord vertices are generated in the shader. Only the actual front/back
    // paper surfaces can open a photograph; pegs and edges do not.
    if (geometry.getAttribute('aPart').getX(event.face.a) !== 0) return;
    const occluders = handOccluders.current;
    occluders.length = 0;
    if (state === 'FORMED' && !isMoving.current) {
      for (const name of ['evergreen-solid-boughs', 'evergreen-trunk-and-branches']) {
        const object = mesh.parent?.getObjectByName(name);
        if (object) occluders.push(object);
      }
    }
    const selected = pointerPicker(mesh, event.camera,
      { x: (event.pointer.x + 1) / 2, y: (1 - event.pointer.y) / 2 }, photoIndexes, occluders);
    if (selected === null) return;
    event.stopPropagation();
    onPhotoPress(selected);
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
