import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { assetUrl } from '../../lib/content';
import type { HandSceneInput } from '../../lib/hand-types';
import { snowHeightAt } from '../tree-base';
import { GROUND_Y } from '../tree-profile';
import { createKittenSocialController } from './kitten-social';
import { loadKittenPack, updateKittenInstance } from './kitten-runtime';
import { KITTEN_ACTIONS } from './kitten-pack';
import type { KittenAction, KittenId, KittenPackManifest } from './kitten-pack';

interface Props {
  /** Only mount after the real purchased files have passed pack validation. */
  pack: KittenPackManifest;
  reducedMotion: boolean;
  paused: boolean;
  active: boolean;
  handInput?: MutableRefObject<HandSceneInput>;
  onInteract?: () => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
}

function createContacts() {
  const size = 32;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const index = (y * size + x) * 4;
    pixels[index + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 72);
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geometry, material, 6);
  mesh.name = 'six-kitten-snow-contacts';
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return { mesh, dispose() { texture.dispose(); geometry.dispose(); material.dispose(); } };
}

type LoadedPack = Awaited<ReturnType<typeof loadKittenPack>>;

/** Six real author-made kittens, each with its own mixer and cloned skeleton.
 * This component is intentionally not mounted until the purchased pack arrives. */
export default function FluffyKittens({ pack, reducedMotion, paused, active, handInput, onInteract, onReady, onError }: Props) {
  const root = useRef<THREE.Group>(null);
  const resources = useRef<{ loaded: LoadedPack; contacts: ReturnType<typeof createContacts>; sizes: THREE.Vector3[] } | null>(null);
  const social = useRef(createKittenSocialController());
  const callbacks = useRef({ onReady, onError, onInteract });
  callbacks.current = { onReady, onError, onInteract };
  const magic = useRef(handInput?.current.magic ?? 0);
  const { invalidate } = useThree();
  const scratch = useRef({
    matrix: new THREE.Matrix4(), position: new THREE.Vector3(), scale: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(), turn: new THREE.Quaternion(),
    flat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
    up: new THREE.Vector3(0, 1, 0),
  });
  const focusObject = (target: THREE.Object3D) => {
    let object: THREE.Object3D | null = target;
    while (object && !object.userData.kittenId) object = object.parent;
    if (object?.userData.kittenId) social.current.focus(object.userData.kittenId as KittenId);
    invalidate();
  };

  useEffect(() => {
    const parent = root.current;
    if (!parent) return;
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    social.current = createKittenSocialController();
    void loadKittenPack(pack, controller.signal, assetUrl).then(loaded => {
      if (controller.signal.aborted) { loaded.dispose(); return; }
      let contacts: ReturnType<typeof createContacts> | undefined;
      try {
        const durations = Object.fromEntries(KITTEN_ACTIONS.map(action => [action, Math.max(...loaded.instances.map(instance => instance.actions[action].getClip().duration))])) as Record<KittenAction, number>;
        social.current = createKittenSocialController({ actionDurations: durations });
        const poses = social.current.snapshot();
        const sizes = loaded.instances.map(instance => {
          const pose = poses.find(candidate => candidate.id === instance.id)!;
          updateKittenInstance(instance, pose, 0, 0, true);
          const heading = instance.group.rotation.y;
          instance.group.rotation.y = 0;
          instance.group.updateMatrixWorld(true);
          const bounds = new THREE.Box3();
          instance.scene.traverseVisible(object => { if (object instanceof THREE.Mesh) bounds.union(new THREE.Box3().setFromObject(object)); });
          if (bounds.isEmpty()) throw new Error(`Kitten has no visible body: ${instance.id}`);
          const size = bounds.getSize(new THREE.Vector3());
          instance.group.rotation.y = heading;
          return size;
        });
        contacts = createContacts();
        parent.add(...loaded.instances.map(instance => instance.group), contacts.mesh);
        resources.current = { loaded, contacts, sizes };
        cleanup = () => {
          contacts!.mesh.removeFromParent();
          contacts!.dispose();
          loaded.dispose();
          resources.current = null;
        };
        callbacks.current.onReady?.();
        invalidate();
      } catch (error) {
        contacts?.mesh.removeFromParent();
        contacts?.dispose();
        loaded.dispose();
        resources.current = null;
        cleanup = undefined;
        throw error;
      }
    }).catch(error => {
      if (!controller.signal.aborted) callbacks.current.onError?.(error);
    });
    return () => { controller.abort(); cleanup?.(); };
  }, [pack, invalidate]);

  useEffect(() => { invalidate(); }, [reducedMotion, paused, active, invalidate]);
  useFrame((_, delta) => {
    const bundle = resources.current;
    if (!bundle) return;
    const input = handInput?.current;
    if (input && magic.current !== input.magic) {
      if (input.enabled && active && !paused && !reducedMotion) social.current.magic();
      magic.current = input.magic;
    }
    const poses = social.current.update(delta, { paused: paused || !active, reducedMotion });
    for (let index = 0; index < bundle.loaded.instances.length; index++) {
      const instance = bundle.loaded.instances[index];
      const pose = poses.find(candidate => candidate.id === instance.id)!;
      const ground = GROUND_Y + snowHeightAt(...pose.position);
      updateKittenInstance(instance, pose, ground, paused || !active ? 0 : delta, reducedMotion);
      const state = scratch.current;
      state.position.set(pose.position[0], ground + 0.012, pose.position[1]);
      state.scale.set(Math.max(0.6, bundle.sizes[index].x * 1.12), Math.max(0.8, bundle.sizes[index].z * 0.9), 1);
      state.turn.setFromAxisAngle(state.up, pose.yaw);
      state.quaternion.copy(state.turn).multiply(state.flat);
      state.matrix.compose(state.position, state.quaternion, state.scale);
      bundle.contacts.mesh.setMatrixAt(index, state.matrix);
    }
    bundle.contacts.mesh.instanceMatrix.needsUpdate = true;
  }, -1);

  return <group ref={root}
    onPointerDown={event => {
      event.stopPropagation(); event.nativeEvent.stopPropagation();
      focusObject(event.object); callbacks.current.onInteract?.();
    }}
    onPointerUp={event => { event.stopPropagation(); event.nativeEvent.stopPropagation(); }}
    onClick={event => {
      event.stopPropagation(); event.nativeEvent.stopPropagation();
      if (event.delta > 6) return;
      focusObject(event.object);
    }} />;
}
