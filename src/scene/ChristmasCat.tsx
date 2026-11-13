import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import kittenAssetUrl from '../assets/christmas-cat.glb?url';
import type { HandSceneInput } from '../lib/hand-types';
import { GROUND_Y } from './tree-profile';
import { snowHeightAt } from './tree-base';
import { CAT_X, CAT_Z, type CatGroundContact } from './cat-placement';
import { advanceCatTravel } from './cat-behavior';
import type { AuthoredCat } from './cat-rig';

const CAT_GROUND = GROUND_Y + snowHeightAt(CAT_X, CAT_Z);
interface Props {
  /** Kept for the existing companion configuration API. */
  src: string;
  reducedMotion: boolean;
  paused?: boolean;
  active?: boolean;
  companionContact?: MutableRefObject<CatGroundContact>;
  handInput?: MutableRefObject<HandSceneInput>;
  onPress?: () => void;
  onInteract?: () => void;
}

function createCatStars() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 0.075 : 0.18;
    if (!i) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshBasicMaterial({ color: '#ffe3ad', transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const stars = new THREE.InstancedMesh(geometry, material, 12);
  stars.visible = false; stars.frustumCulled = false; stars.raycast = () => {};
  return stars;
}

/** A single authored, skinned kitten. Its loader never holds up the first scene. */
export default function ChristmasCat({ reducedMotion, paused = false, active = true, companionContact, handInput, onPress, onInteract }: Props) {
  const { invalidate } = useThree();
  const root = useRef<THREE.Group>(null);
  const resources = useRef<{
    kitten: AuthoredCat; stars: ReturnType<typeof createCatStars>;
    sync: typeof import('./cat-rig').syncAuthoredCat;
  } | null>(null);
  const travel = useRef({ elapsed: 0, pace: 1 });
  const age = useRef(4), lastMagic = useRef(0), attention = useRef(0);
  const scratch = useRef({ matrix: new THREE.Matrix4(), position: new THREE.Vector3(), scale: new THREE.Vector3(), viewer: new THREE.Vector3() });

  useEffect(() => {
    const parent = root.current;
    if (!parent) return;
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    const contact = companionContact?.current;
    if (contact) { contact.body[2] = 0; contact.body[3] = 0; for (const paw of contact.paws) { paw[2] = 0; paw[3] = 0; } }
    void import('./cat-rig').then(async module => {
      const kitten = await module.loadAuthoredCat(kittenAssetUrl, controller.signal);
      if (controller.signal.aborted) { module.disposeAuthoredCat(kitten); return; }
      const stars = createCatStars();
      parent.add(kitten.group, stars);
      module.syncAuthoredCat(kitten, 0, 0, true, contact);
      resources.current = { kitten, stars, sync: module.syncAuthoredCat };
      lastMagic.current = handInput?.current.magic ?? 0;
      cleanup = () => {
        parent.remove(kitten.group, stars);
        module.disposeAuthoredCat(kitten); module.clearCatContact(contact);
        stars.geometry.dispose(); stars.material.dispose(); resources.current = null;
      };
      invalidate();
    }).catch(error => {
      if (!controller.signal.aborted) console.warn('The kitten could not load.', error);
    });
    return () => { controller.abort(); cleanup?.(); };
  }, [invalidate, handInput, companionContact]);

  useFrame(({ camera }, delta) => {
    const bundle = resources.current;
    if (!bundle || paused || !active) return;
    const { kitten, stars, sync } = bundle;
    if (reducedMotion) {
      travel.current = { elapsed: 0, pace: 1 }; sync(kitten, 0, 0, true, companionContact?.current);
      stars.visible = false; return;
    }
    const step = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.05) : 0;
    attention.current = Math.max(0, attention.current - step);
    const resting = attention.current > 0;
    travel.current = advanceCatTravel(travel.current.elapsed, travel.current.pace, step, resting);
    // Transform the viewer into the kitten's own frame, so an orbiting camera
    // receives the same small glance without turning a planted body in place.
    kitten.group.worldToLocal(scratch.current.viewer.copy(camera.position));
    const look = resting ? Math.atan2(scratch.current.viewer.x, scratch.current.viewer.z) : undefined;
    sync(kitten, travel.current.elapsed, step, false, companionContact?.current, resting, look);
    age.current = Math.min(4, age.current + step);
    const input = handInput?.current;
    if (input && input.magic !== lastMagic.current) {
      if (input.enabled) age.current = 0;
      lastMagic.current = input.magic;
    }
    const t = age.current, envelope = Math.sin(Math.min(1, t / 3.2) * Math.PI);
    stars.visible = t < 3.2;
    if (!stars.visible) return;
    stars.material.opacity = envelope * 0.72;
    const { matrix, position, scale } = scratch.current;
    for (let i = 0; i < stars.count; i++) {
      const turn = i * 2.399963 + t * 0.3, radius = 1.05 + (i % 4) * 0.19;
      position.set(kitten.group.position.x + Math.cos(turn) * radius,
        kitten.group.position.y + 1.2 + (i % 5) * 0.46 + t * 0.6, kitten.group.position.z + Math.sin(turn) * radius);
      scale.setScalar(0.65 + (i % 3) * 0.2);
      matrix.compose(position, camera.quaternion, scale); stars.setMatrixAt(i, matrix);
    }
    stars.instanceMatrix.needsUpdate = true;
  }, -1);

  return <group ref={root} position={[CAT_X, CAT_GROUND, CAT_Z]}
    onPointerDown={event => {
      attention.current = 2.0;
      onInteract?.(); event.stopPropagation(); event.nativeEvent.stopPropagation();
    }}
    onPointerUp={event => { event.stopPropagation(); event.nativeEvent.stopPropagation(); }}
    onClick={event => {
      event.stopPropagation(); event.nativeEvent.stopPropagation();
      if (event.delta > 6) return;
      age.current = 0; attention.current = 2.0; invalidate(); onPress?.();
    }} />;
}
