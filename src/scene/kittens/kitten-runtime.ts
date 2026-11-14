import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { KITTEN_ACTIONS, readKittenPack, validateKittenAssetInspection } from './kitten-pack';
import type { KittenAction, KittenDefinition, KittenId, KittenModel, KittenPackManifest } from './kitten-pack';

export interface KittenPose {
  id: KittenId;
  position: readonly [number, number];
  yaw: number;
  speed: number;
  action: KittenAction;
  actionTime: number;
  actionDuration: number;
}

interface KittenAsset {
  gltf: GLTF;
  materials: THREE.Material[];
}

export interface KittenInstance {
  id: KittenId;
  group: THREE.Group;
  scene: THREE.Object3D;
  model: KittenModel;
  mixer: THREE.AnimationMixer;
  actions: Record<KittenAction, THREE.AnimationAction>;
  current: KittenAction | null;
  previousActionTime: number;
  skeletons: THREE.Skeleton[];
}

const locomotion = new Set<KittenAction>(['walk', 'trot', 'gallop']);
const once = new Set<KittenAction>(['pounce', 'paw', 'sit', 'lie']);
const MAX_MODEL_BYTES = 24 * 1024 * 1024;

/** Commercial source files stay private. Runtime GLBs must embed every buffer
 * and texture, so loading a character cannot fetch an undeclared external URL. */
export function inspectEmbeddedKittenGlb(data: ArrayBuffer) {
  if (data.byteLength < 20 || data.byteLength > MAX_MODEL_BYTES) throw new Error('Kitten GLB has an invalid size.');
  const view = new DataView(data);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== data.byteLength || view.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error('Kitten asset must be a complete glTF 2.0 binary.');
  }
  const jsonLength = view.getUint32(12, true);
  if (jsonLength > data.byteLength - 20) throw new Error('Kitten GLB JSON is truncated.');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength))) as {
    buffers?: { uri?: string }[];
    images?: { uri?: string; bufferView?: number }[];
    materials?: unknown[];
    extensionsUsed?: string[];
  };
  if (json.buffers?.some(buffer => buffer.uri !== undefined)
    || json.images?.some(image => image.uri !== undefined || !Number.isInteger(image.bufferView))) {
    throw new Error('Kitten GLB must embed its buffers and textures; external resources are not permitted.');
  }
  if (json.extensionsUsed?.some(extension => ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(extension))) {
    throw new Error('Export an ordinary embedded GLB; compressed geometry/texture decoders are not configured.');
  }
  return json;
}

export function inspectKittenAsset(gltf: GLTF, additionalMaterials: THREE.Material[] = []) {
  const materials = new Set(additionalMaterials);
  const meshes: { name: string; materialSlots: number }[] = [];
  gltf.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const slots = Array.isArray(object.material) ? object.material : [object.material];
    slots.forEach(material => materials.add(material));
    meshes.push({ name: object.name, materialSlots: slots.length });
  });
  return {
    meshes,
    materials: [...materials].map(material => material.name),
    clips: gltf.animations.map(clip => ({ name: clip.name, duration: clip.duration })),
  };
}

function instantiateKitten(definition: KittenDefinition, model: KittenModel, asset: KittenAsset): KittenInstance {
  const scene = cloneSkeleton(asset.gltf.scene);
  const selected = new Set(definition.meshes);
  const materialByName = new Map<string, THREE.Material>();
  for (const material of asset.materials) materialByName.set(material.name, material);
  asset.gltf.scene.traverse(object => {
    if (object instanceof THREE.Mesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materialByName.set(material.name, material);
    }
  });
  const skeletons: THREE.Skeleton[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.visible = selected.has(object.name);
    if (object instanceof THREE.SkinnedMesh) {
      skeletons.push(object.skeleton);
      object.frustumCulled = false;
    }
    const bindings = definition.materialBindings.filter(binding => binding.mesh === object.name);
    const slots = Array.isArray(object.material) ? [...object.material] : [object.material];
    for (const binding of bindings) slots[binding.slot] = materialByName.get(binding.material)!;
    object.material = Array.isArray(object.material) ? slots : slots[0];
  });
  const normalized = new THREE.Group();
  normalized.scale.setScalar(model.normalization.scale);
  normalized.rotation.y = model.normalization.yaw;
  normalized.position.y = model.normalization.groundOffset;
  normalized.add(scene);
  const group = new THREE.Group();
  group.name = `fluffy-beast-${definition.id}`;
  group.userData.kittenId = definition.id;
  group.add(normalized);
  const mixer = new THREE.AnimationMixer(scene);
  const actions = {} as Record<KittenAction, THREE.AnimationAction>;
  for (const kind of KITTEN_ACTIONS) {
    const clip = THREE.AnimationClip.findByName(asset.gltf.animations, model.actions[kind]);
    if (!clip) throw new Error(`Missing authored kitten animation: ${model.actions[kind]}`);
    // Two semantic roles may deliberately reference the same source clip.
    // Each still needs its own loop mode and blend weight, while immutable
    // keyframe data can remain shared between all six instances.
    const roleClip = new THREE.AnimationClip(`${definition.id}:${kind}`, clip.duration, clip.tracks, clip.blendMode);
    const action = mixer.clipAction(roleClip);
    action.setLoop(once.has(kind) ? THREE.LoopOnce : THREE.LoopRepeat, once.has(kind) ? 1 : Infinity);
    action.clampWhenFinished = once.has(kind);
    actions[kind] = action;
  }
  return { id: definition.id, group, scene, model, mixer, actions, current: null, previousActionTime: 0, skeletons };
}

/** Validate the *actual* author asset before cloning independent skeletons.
 * Geometry, texture and material resources remain shared between coats. */
export function createKittenInstances(pack: KittenPackManifest, assets: Map<string, KittenAsset>) {
  for (const model of pack.models) {
    const asset = assets.get(model.id);
    if (!asset) throw new Error(`Kitten model has not loaded: ${model.id}`);
    const issues = validateKittenAssetInspection(model, inspectKittenAsset(asset.gltf, asset.materials), pack.kittens);
    if (issues.length) throw new Error(`Kitten asset inspection failed: ${JSON.stringify(issues)}`);
    for (const kitten of pack.kittens.filter(kitten => kitten.modelId === model.id)) {
      if (!kitten.meshes.some(name => asset.gltf.scene.getObjectByName(name) instanceof THREE.SkinnedMesh)) {
        throw new Error(`Kitten needs the author's animated skeleton: ${kitten.id}`);
      }
    }
    if (!asset.gltf.animations.every(clip => clip.tracks.length > 0 && clip.tracks.every(track =>
      Array.from(track.values).every(Number.isFinite) && Array.from(track.times).every(Number.isFinite)))) {
      throw new Error('Kitten animations contain non-finite transforms.');
    }
  }
  const instances: KittenInstance[] = [];
  try {
    for (const definition of pack.kittens) {
      const model = pack.models.find(candidate => candidate.id === definition.modelId)!;
      instances.push(instantiateKitten(definition, model, assets.get(model.id)!));
    }
    return instances;
  } catch (error) {
    for (const instance of instances) {
      instance.mixer.stopAllAction();
      instance.mixer.uncacheRoot(instance.scene);
      instance.skeletons.forEach(skeleton => skeleton.dispose());
    }
    throw error;
  }
}

/** No procedural limb edits or body squash: all poses come from the purchased
 * author's baked clips. The coordinator owns only position, heading and intent. */
export function updateKittenInstance(instance: KittenInstance, pose: KittenPose, groundY: number, delta: number, reducedMotion = false) {
  const step = Number.isFinite(delta) ? Math.max(0, Math.min(0.05, delta)) : 0;
  instance.group.position.set(pose.position[0], groundY, pose.position[1]);
  instance.group.rotation.y = pose.yaw;
  const kind = reducedMotion ? 'idle' : pose.action;
  const action = instance.actions[kind];
  const restart = instance.current === kind && pose.actionTime + 0.001 < instance.previousActionTime;
  if (instance.current !== kind || restart) {
    const previous = instance.current ? instance.actions[instance.current] : null;
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (once.has(kind) && !reducedMotion) {
      const ratio = pose.actionDuration > 0 ? action.getClip().duration / pose.actionDuration : 1;
      action.time = Math.min(action.getClip().duration, Math.max(0, pose.actionTime) * ratio);
    }
    if (previous && previous !== action && !reducedMotion) {
      previous.fadeOut(0.24);
      action.fadeIn(0.24);
    } else if (reducedMotion) {
      instance.mixer.stopAllAction();
      action.reset().play();
    }
    instance.current = kind;
  }
  if (locomotion.has(kind)) {
    // These speeds must be measured from this model after its uniform scale.
    const authoredSpeed = instance.model.gait[kind as 'walk' | 'trot' | 'gallop'];
    action.setEffectiveTimeScale(Math.max(0, pose.speed) / authoredSpeed);
  } else if (once.has(kind) && pose.actionDuration > 0 && Number.isFinite(pose.actionDuration)) {
    action.setEffectiveTimeScale(action.getClip().duration / pose.actionDuration);
  } else action.setEffectiveTimeScale(1);
  instance.mixer.update(reducedMotion ? 0 : step);
  instance.previousActionTime = pose.actionTime;
  for (const candidate of new Set(Object.values(instance.actions))) {
    if (candidate !== action && candidate.isRunning() && candidate.getEffectiveWeight() < 0.0001) candidate.stop();
  }
}

function disposeAssets(assets: Map<string, KittenAsset>) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  for (const asset of new Set(assets.values())) {
    asset.materials.forEach(material => materials.add(material));
    asset.gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
      if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    });
  }
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  const images = new Set<unknown>();
  for (const texture of textures) { images.add(texture.source.data); texture.dispose(); }
  for (const bitmap of images) if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
  geometries.forEach(geometry => geometry.dispose());
  skeletons.forEach(skeleton => skeleton.dispose());
}

export async function loadKittenPack(pack: KittenPackManifest, signal: AbortSignal, resolveUrl: (path: string) => string) {
  const validation = readKittenPack(pack);
  if (validation.status !== 'ready') throw new Error('A complete, validated kitten manifest is required before loading.');
  pack = validation.pack;
  const assets = new Map<string, KittenAsset>();
  const byUrl = new Map<string, KittenAsset>();
  let instances: KittenInstance[] = [];
  const dispose = () => {
    for (const instance of instances) {
      instance.mixer.stopAllAction();
      instance.mixer.uncacheRoot(instance.scene);
      instance.skeletons.forEach(skeleton => skeleton.dispose());
      instance.group.removeFromParent();
    }
    instances = [];
    disposeAssets(assets);
    assets.clear();
  };
  try {
    // Two shared source models are loaded once. Sequential decoding bounds
    // mobile peak memory; none of these requests blocks the Christmas tree.
    for (const model of pack.models) {
      if (signal.aborted) throw new DOMException('Kitten loading cancelled', 'AbortError');
      let asset = byUrl.get(model.src);
      if (!asset) {
        const response = await fetch(resolveUrl(model.src), { signal, priority: 'low' });
        if (!response.ok) throw new Error(`Kitten model request failed (${response.status}).`);
        const data = await response.arrayBuffer();
        const inventory = inspectEmbeddedKittenGlb(data);
        const gltf = await new GLTFLoader().parseAsync(data, '');
        asset = { gltf, materials: [] };
        assets.set(model.id, asset);
        // Keep each successfully decoded coat available to cleanup even if a
        // later optional material fails or loading is cancelled mid-palette.
        for (let index = 0; index < (inventory.materials?.length ?? 0); index++) {
          if (signal.aborted) throw new DOMException('Kitten loading cancelled', 'AbortError');
          asset.materials.push(await gltf.parser.getDependency('material', index) as THREE.Material);
        }
        byUrl.set(model.src, asset);
      }
      assets.set(model.id, asset);
    }
    if (signal.aborted) throw new DOMException('Kitten loading cancelled', 'AbortError');
    instances = createKittenInstances(pack, assets);
    return { instances, dispose };
  } catch (error) { dispose(); throw error; }
}
