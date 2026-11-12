import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAT_AUTHORED_WALK_SPEED, catBlink, catWalkBlend } from './cat-behavior';
import { CAT_GROUND_CONTACT, CAT_X, CAT_Z, sampleCatRoute, type CatGroundContact } from './cat-placement';
import { GROUND_Y } from './tree-profile';
import { snowHeightAt } from './tree-base';

export const CAT_GROUND = GROUND_Y + snowHeightAt(CAT_X, CAT_Z);
const FOOT_BONES = ['Bone016', 'Bone019', 'Bone013', 'Bone010'] as const;
const PAW_ANKLE_HEIGHT = 0.021;

export function createAuthoredCat(asset: GLTF) {
  const scene = asset.scene;
  const group = new THREE.Group();
  group.name = 'authored-christmas-kitten';
  group.add(scene);
  const feet = FOOT_BONES.map(name => {
    const bone = scene.getObjectByName(name);
    if (!bone) throw new Error(`Kitten paw bone is missing: ${name}`);
    return bone;
  });
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    object.frustumCulled = false;
    object.castShadow = true;
    meshes.push(object);
  });
  const idleClip = THREE.AnimationClip.findByName(asset.animations, 'Idle');
  const walkClip = THREE.AnimationClip.findByName(asset.animations, 'Walking');
  if (!idleClip || !walkClip || !meshes.length) throw new Error('The kitten needs its authored skin, idle and walk.');
  const mixer = new THREE.AnimationMixer(scene);
  const idle = mixer.clipAction(idleClip).play();
  const walk = mixer.clipAction(walkClip).play();
  idle.setEffectiveWeight(1); walk.setEffectiveWeight(0);
  mixer.update(0);
  return {
    group, scene, mixer, idle, walk, meshes, feet,
    clock: 0, walkWeight: 0, reduced: false,
    localFeet: feet.map(() => new THREE.Vector3()),
    inverseWorld: new THREE.Matrix4(),
  };
}
export type AuthoredCat = ReturnType<typeof createAuthoredCat>;

/** A separate, low-priority request: loading the companion never suspends the tree. */
export async function loadAuthoredCat(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, priority: 'low' });
  if (!response.ok) throw new Error(`Kitten asset could not load (${response.status}).`);
  const data = await response.arrayBuffer();
  const asset = await new GLTFLoader().parseAsync(data, '');
  const kitten = createAuthoredCat(asset);
  if (signal.aborted) {
    disposeAuthoredCat(kitten);
    throw new DOMException('Kitten load cancelled', 'AbortError');
  }
  return kitten;
}

/** Mix authored bone clips, then fit the actual planted paws to the snow surface. */
export function syncAuthoredCat(
  kitten: AuthoredCat, elapsed: number, delta: number, reducedMotion: boolean,
  contact?: CatGroundContact, resting = false,
) {
  const step = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.05) : 0;
  const route = sampleCatRoute(reducedMotion ? 0 : elapsed);
  if (reducedMotion) {
    kitten.clock = 0; kitten.walkWeight = 0;
    kitten.idle.time = 0; kitten.walk.time = 0;
    kitten.idle.setEffectiveWeight(1); kitten.walk.setEffectiveWeight(0);
    kitten.mixer.update(0);
  } else {
    kitten.clock += step;
    const targetWeight = catWalkBlend(route.speed, resting);
    kitten.walkWeight = THREE.MathUtils.damp(kitten.walkWeight, targetWeight, 9, step);
    kitten.idle.setEffectiveWeight(1 - kitten.walkWeight).setEffectiveTimeScale(0.75);
    // The artist's feet move in time with distance travelled, including acceleration.
    kitten.walk.setEffectiveWeight(kitten.walkWeight).setEffectiveTimeScale(resting ? 0 : route.speed / CAT_AUTHORED_WALK_SPEED);
    kitten.mixer.update(step);
  }
  kitten.reduced = reducedMotion;
  for (const mesh of kitten.meshes) {
    const index = mesh.morphTargetDictionary?.Blink;
    if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = reducedMotion ? 0 : catBlink(kitten.clock);
  }
  const snow = GROUND_Y + snowHeightAt(...route.position);
  kitten.group.position.set(route.position[0] - CAT_X, snow - CAT_GROUND, route.position[1] - CAT_Z);
  kitten.group.rotation.set(0, route.yaw, 0);
  kitten.group.updateWorldMatrix(true, true);
  kitten.inverseWorld.copy(kitten.group.matrixWorld).invert();
  const c = Math.cos(route.yaw), s = Math.sin(route.yaw);
  let clearance = Infinity;
  for (let i = 0; i < kitten.feet.length; i++) {
    const paw = kitten.feet[i].getWorldPosition(kitten.localFeet[i]).applyMatrix4(kitten.inverseWorld);
    const x = route.position[0] + paw.x * c + paw.z * s, z = route.position[1] - paw.x * s + paw.z * c;
    clearance = Math.min(clearance, snow + paw.y - (GROUND_Y + snowHeightAt(x, z)) - PAW_ANKLE_HEIGHT);
  }
  // The source's small vertical root drift is corrected once for the whole body.
  // This leaves the artist's hip/knee/ankle movement intact instead of stretching legs.
  const correction = THREE.MathUtils.clamp(-clearance, -0.10, 0.12);
  kitten.group.position.y += correction;
  if (contact) {
    contact.position[0] = route.position[0]; contact.position[1] = route.position[1]; contact.yaw = route.yaw;
    for (let j = 0; j < 4; j++) contact.body[j] = CAT_GROUND_CONTACT.body[j];
    for (let i = 0; i < kitten.localFeet.length; i++) {
      const paw = kitten.localFeet[i], rest = CAT_GROUND_CONTACT.paws[i];
      const x = route.position[0] + paw.x * c + paw.z * s, z = route.position[1] - paw.x * s + paw.z * c;
      const aboveSnow = snow + correction + paw.y - (GROUND_Y + snowHeightAt(x, z)) - PAW_ANKLE_HEIGHT;
      const weight = 1 - THREE.MathUtils.smoothstep(aboveSnow, 0.025, 0.12);
      contact.paws[i][0] = paw.x; contact.paws[i][1] = paw.z;
      contact.paws[i][2] = rest[2] * weight; contact.paws[i][3] = rest[3] * weight;
    }
  }
  return route;
}

export function clearCatContact(contact?: CatGroundContact) {
  if (!contact) return;
  contact.body[2] = 0; contact.body[3] = 0;
  for (const paw of contact.paws) { paw[2] = 0; paw[3] = 0; }
}

export function disposeAuthoredCat(kitten: AuthoredCat) {
  kitten.mixer.stopAllAction(); kitten.mixer.uncacheRoot(kitten.scene);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), skeletons = new Set<THREE.Skeleton>();
  kitten.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
