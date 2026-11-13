import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAT_AUTHORED_WALK_SPEED, catBlink, catWalkBlend } from './cat-behavior';
import { CAT_GROUND_CONTACT, CAT_X, CAT_Z, sampleCatRoute, type CatGroundContact } from './cat-placement';
import { GROUND_Y } from './tree-profile';
import { snowHeightAt } from './tree-base';

export const CAT_GROUND = GROUND_Y + snowHeightAt(CAT_X, CAT_Z);
const FOOT_BONES = ['Bone016', 'Bone019', 'Bone013', 'Bone010'] as const;
/** Original sole-to-ankle height with the revised kitten's 0.92 height scale. */
export const PAW_ANKLE_HEIGHT = 0.01932;
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0), FORWARD = new THREE.Vector3(0, 0, 1);

/** The source clip's last pose differs from the first. Close the small seam
 * before looping, using quaternion interpolation rather than a pose snap. */
function seamlessClip(source: THREE.AnimationClip) {
  const clip = source.clone(), blendTime = Math.min(0.20, clip.duration * 0.16);
  const from = new THREE.Quaternion(), to = new THREE.Quaternion();
  for (const track of clip.tracks) {
    const stride = track.getValueSize(), first = track.values.slice(0, stride), interpolant = track.createInterpolant();
    // Optimized source tracks can end much earlier than the clip. Add actual
    // end keys instead of assuming that their final key is at clip.duration.
    const times = [...new Set([...track.times, ...Array.from({ length: 7 }, (_, i) => clip.duration - blendTime + blendTime * i / 6)])].sort((a, b) => a - b);
    const values = new Float32Array(times.length * stride);
    for (let i = 0; i < times.length; i++) {
      values.set(interpolant.evaluate(times[i]), i * stride);
      const blend = THREE.MathUtils.smoothstep(times[i], clip.duration - blendTime, clip.duration);
      if (!blend) continue;
      if (track instanceof THREE.QuaternionKeyframeTrack) {
        from.fromArray(values, i * stride); to.fromArray(first);
        from.slerp(to, blend).toArray(values, i * stride);
      } else for (let j = 0; j < stride; j++) values[i * stride + j] = THREE.MathUtils.lerp(values[i * stride + j], first[j], blend);
    }
    track.times = new Float32Array(times); track.values = values;
  }
  return clip;
}

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
  const idle = mixer.clipAction(seamlessClip(idleClip)).play();
  const walk = mixer.clipAction(seamlessClip(walkClip)).play();
  idle.setEffectiveWeight(1); walk.setEffectiveWeight(0);
  mixer.update(0);
  const authoredPose: { bone: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[] = [];
  scene.traverse(bone => { if (bone instanceof THREE.Bone) authoredPose.push({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() }); });
  return {
    group, scene, mixer, idle, walk, meshes, feet,
    authoredPose,
    clock: 0, walkWeight: 0, reduced: false, previousElapsed: 0,
    previousPosition: new THREE.Vector2(CAT_X, CAT_Z), sampled: false,
    head: scene.getObjectByName('Bone003'), neck: scene.getObjectByName('Bone002'),
    tail: ['Bone005', 'Bone006', 'Bone007'].map(name => scene.getObjectByName(name)),
    lookYaw: 0, attentionAge: -1, attending: false,
    plants: feet.map(() => ({ anchor: new THREE.Vector3(), weight: 0, planted: false, height: 0 })),
    legJoints: feet.map(foot => [foot.parent!, foot.parent!.parent!]),
    localFeet: feet.map(() => new THREE.Vector3()),
    inverseWorld: new THREE.Matrix4(),
    scratch: {
      position: new THREE.Vector3(), target: new THREE.Vector3(), pivot: new THREE.Vector3(),
      from: new THREE.Vector3(), to: new THREE.Vector3(), axis: new THREE.Vector3(),
      rotation: new THREE.Quaternion(), limitedRotation: new THREE.Quaternion(), parentRotation: new THREE.Quaternion(), footRotation: new THREE.Quaternion(),
      inverse: new THREE.Matrix4(),
    },
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
  contact?: CatGroundContact, resting = false, viewerYaw?: number,
) {
  const step = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.05) : 0;
  const route = sampleCatRoute(reducedMotion ? 0 : elapsed);
  const discontinuity = !kitten.sampled || elapsed < kitten.previousElapsed || elapsed - kitten.previousElapsed > 0.1;
  // Gait advances by the distance actually travelled, including the easing
  // after a click; the route's nominal speed is wrong while it is slowing down.
  const distance = Math.hypot(route.position[0] - kitten.previousPosition.x, route.position[1] - kitten.previousPosition.y);
  const speed = step > 0 && !discontinuity && !reducedMotion ? distance / step : 0;
  kitten.previousPosition.set(...route.position); kitten.previousElapsed = elapsed; kitten.sampled = true;
  if (discontinuity || reducedMotion) for (const plant of kitten.plants) { plant.planted = false; plant.weight = 0; }
  // AnimationMixer omits unchanged property writes. Undo the previous frame's
  // post-animation offsets before mixing, or static bones accumulate IK/glance
  // rotations and drift even while standing still.
  for (const pose of kitten.authoredPose) {
    pose.bone.position.copy(pose.position); pose.bone.quaternion.copy(pose.quaternion); pose.bone.scale.copy(pose.scale);
  }
  if (reducedMotion) {
    kitten.clock = 0; kitten.walkWeight = 0;
    kitten.lookYaw = 0; kitten.attentionAge = -1; kitten.attending = false;
    kitten.idle.time = 0; kitten.walk.time = 0;
    kitten.idle.setEffectiveWeight(1); kitten.walk.setEffectiveWeight(0);
    kitten.mixer.update(0);
  } else {
    kitten.clock += step;
    const targetWeight = catWalkBlend(speed);
    kitten.walkWeight = THREE.MathUtils.damp(kitten.walkWeight, targetWeight, 9, step);
    kitten.idle.setEffectiveWeight(1 - kitten.walkWeight).setEffectiveTimeScale(0.6);
    kitten.walk.setEffectiveWeight(kitten.walkWeight).setEffectiveTimeScale(speed / CAT_AUTHORED_WALK_SPEED);
    kitten.mixer.update(step);
  }
  for (const pose of kitten.authoredPose) {
    pose.position.copy(pose.bone.position); pose.quaternion.copy(pose.bone.quaternion); pose.scale.copy(pose.bone.scale);
  }
  if (!reducedMotion) {
    kitten.attentionAge = resting && !kitten.attending ? 0 : kitten.attentionAge < 0 ? -1 : kitten.attentionAge + step;
    kitten.attending = resting;
    const curious = (1 - kitten.walkWeight) * (Math.sin(kitten.clock * 0.39) * 0.13 + Math.sin(kitten.clock * 0.17) * 0.08);
    const look = resting && viewerYaw !== undefined ? THREE.MathUtils.clamp(viewerYaw, -0.50, 0.50) : curious;
    kitten.lookYaw = THREE.MathUtils.damp(kitten.lookYaw, look, 3.5, step);
    // Small rotations on the real head/neck bones. Paws and body remain planted.
    rotateInCatFrame(kitten, kitten.neck, UP, kitten.lookYaw * 0.24);
    rotateInCatFrame(kitten, kitten.head, UP, kitten.lookYaw * 0.76);
    rotateInCatFrame(kitten, kitten.head, RIGHT, (resting ? -0.055 : Math.sin(kitten.clock * 0.7) * 0.018) * (1 - kitten.walkWeight * 0.65));
    rotateInCatFrame(kitten, kitten.head, FORWARD, Math.sin(kitten.clock * 0.47) * 0.022 * (1 - kitten.walkWeight));
    for (let i = 0; i < kitten.tail.length; i++) {
      rotateInCatFrame(kitten, kitten.tail[i], FORWARD, Math.sin(kitten.clock * 0.95 - i * 0.65) * (0.035 + i * 0.012));
    }
  }
  kitten.reduced = reducedMotion;
  for (const mesh of kitten.meshes) {
    const index = mesh.morphTargetDictionary?.Blink;
    if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = reducedMotion ? 0 : catBlink(kitten.clock, kitten.attentionAge);
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
  kitten.group.updateWorldMatrix(true, true);
  if (!reducedMotion) plantPaws(kitten, step, speed);
  // Re-sample after IK. Contact marks follow the rendered paws, not a duplicate
  // approximation of the old animation. A final small vertical fit keeps the
  // lowest supporting paw on the same snow surface as the visible receiver.
  let finalClearance = Infinity;
  for (const foot of kitten.feet) {
    const paw = foot.getWorldPosition(kitten.scratch.position);
    finalClearance = Math.min(finalClearance, paw.y - (GROUND_Y + snowHeightAt(paw.x, paw.z)) - PAW_ANKLE_HEIGHT);
  }
  kitten.group.position.y -= THREE.MathUtils.clamp(finalClearance, -0.12, 0.12);
  kitten.group.updateWorldMatrix(true, true);
  kitten.inverseWorld.copy(kitten.group.matrixWorld).invert();
  for (let i = 0; i < kitten.feet.length; i++) kitten.feet[i].getWorldPosition(kitten.localFeet[i]).applyMatrix4(kitten.inverseWorld);
  if (contact) {
    contact.position[0] = route.position[0]; contact.position[1] = route.position[1]; contact.yaw = route.yaw;
    for (let j = 0; j < 4; j++) contact.body[j] = CAT_GROUND_CONTACT.body[j];
    for (let i = 0; i < kitten.localFeet.length; i++) {
      const paw = kitten.localFeet[i], rest = CAT_GROUND_CONTACT.paws[i];
      const x = route.position[0] + paw.x * c + paw.z * s, z = route.position[1] - paw.x * s + paw.z * c;
      const aboveSnow = CAT_GROUND + kitten.group.position.y + paw.y - (GROUND_Y + snowHeightAt(x, z)) - PAW_ANKLE_HEIGHT;
      const weight = 1 - THREE.MathUtils.smoothstep(aboveSnow, 0.025, 0.12);
      contact.paws[i][0] = paw.x; contact.paws[i][1] = paw.z;
      contact.paws[i][2] = rest[2] * weight; contact.paws[i][3] = rest[3] * weight;
    }
  }
  return route;
}

/** Compose actual local rotations. matrixWorld.decompose is not a rotation
 * round-trip here: the GLB's ancestor has nonuniform scale and rotated bones
 * introduce shear. Keeping a common rig frame preserves the ankle orientation. */
function rotationInCatFrame(bone: THREE.Object3D | null, group: THREE.Group, result: THREE.Quaternion) {
  result.identity();
  for (let object = bone; object && object !== group; object = object.parent) result.premultiply(object.quaternion);
  return result.normalize();
}

function rotateInCatFrame(kitten: AuthoredCat, bone: THREE.Object3D | undefined, axis: THREE.Vector3, angle: number) {
  if (!bone?.parent) return;
  const scratch = kitten.scratch;
  rotationInCatFrame(bone.parent, kitten.group, scratch.parentRotation).invert();
  scratch.axis.copy(axis).applyQuaternion(scratch.parentRotation).normalize();
  bone.quaternion.premultiply(scratch.rotation.setFromAxisAngle(scratch.axis, angle)).normalize();
  bone.updateWorldMatrix(false, true);
}

/** A bounded two-joint correction retains the authored bend and ankle pose.
 * Only stance paws are held; a lifted paw follows the original animation. */
function plantPaws(kitten: AuthoredCat, step: number, speed: number) {
  const scratch = kitten.scratch;
  for (let i = 0; i < kitten.feet.length; i++) {
    const foot = kitten.feet[i], plant = kitten.plants[i];
    foot.getWorldPosition(scratch.position);
    const ground = GROUND_Y + snowHeightAt(scratch.position.x, scratch.position.z) + PAW_ANKLE_HEIGHT;
    const height = scratch.position.y - ground;
    const rising = height > plant.height + step * 0.04;
    const far = Math.hypot(scratch.position.x - plant.anchor.x, scratch.position.z - plant.anchor.z) > 0.16;
    if (plant.planted && (height > 0.055 || far)) plant.planted = false;
    if (!plant.planted && plant.weight < 0.03 && height < 0.035 && (!rising || speed < 0.02)) {
      plant.planted = true; plant.anchor.copy(scratch.position); plant.anchor.y = ground;
    }
    plant.height = height;
    plant.weight = THREE.MathUtils.damp(plant.weight, plant.planted ? 1 : 0, plant.planted ? 24 : 4.5, step);
    if (plant.weight < 0.005) continue;
    scratch.target.copy(scratch.position).lerp(plant.anchor, plant.weight);
    if (!plant.planted) scratch.target.y = scratch.position.y;
    // A release fades over several frames; never teleport back to the source
    // pose or immediately recapture the same slipping paw in a single frame.
    scratch.from.copy(scratch.target).sub(scratch.position);
    if (scratch.from.length() > 0.22) scratch.target.copy(scratch.position).add(scratch.from.setLength(0.22));
    if (scratch.target.distanceToSquared(scratch.position) < 1e-10) continue;
    rotationInCatFrame(foot, kitten.group, scratch.footRotation);
    for (let iteration = 0; iteration < 5; iteration++) {
      for (const joint of kitten.legJoints[i]) {
        if (!joint?.parent) continue;
        scratch.inverse.copy(joint.parent.matrixWorld).invert();
        scratch.pivot.copy(joint.position);
        foot.getWorldPosition(scratch.from).applyMatrix4(scratch.inverse).sub(scratch.pivot).normalize();
        scratch.to.copy(scratch.target).applyMatrix4(scratch.inverse).sub(scratch.pivot).normalize();
        scratch.rotation.setFromUnitVectors(scratch.from, scratch.to);
        // Five small corrections converge without flipping a near-straight knee.
        const angle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(scratch.rotation.w), 0, 1));
        if (angle > 0.10) {
          scratch.limitedRotation.copy(scratch.rotation);
          scratch.rotation.identity().slerp(scratch.limitedRotation, 0.10 / angle);
        }
        joint.quaternion.premultiply(scratch.rotation).normalize(); joint.updateWorldMatrix(false, true);
      }
    }
    rotationInCatFrame(foot.parent, kitten.group, scratch.parentRotation).invert();
    foot.quaternion.copy(scratch.parentRotation.multiply(scratch.footRotation)).normalize(); foot.updateWorldMatrix(false, true);
  }
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
