import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const packUrl = moduleUrl(compile(await readFile(new URL('../src/scene/kittens/kitten-pack.ts', import.meta.url), 'utf8')));
const runtimeSource = compile(await readFile(new URL('../src/scene/kittens/kitten-runtime.ts', import.meta.url), 'utf8'))
  .replace(/from\s+(['"])([^'"]+)\1/g, (_match, _quote, name) => 'from ' + JSON.stringify(name === './kitten-pack' ? packUrl : import.meta.resolve(name)));
const { KITTEN_IDS, KITTEN_ACTIONS, KITTEN_COATS, readKittenPack } = await import(packUrl);
const { inspectEmbeddedKittenGlb, inspectKittenAsset, createKittenInstances, updateKittenInstance, loadKittenPack } = await import(moduleUrl(runtimeSource));

/** Explicitly synthetic test rig: a triangle, two bones, generated rotations.
 * This is not a kitten model, a paid asset, or a placeholder shipped to users. */
function fixture(materialCount = 2) {
  const scene = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.2, 0, 0, .2, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.computeVertexNormals();
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const materials = Array.from({ length: materialCount }, (_, i) => {
    const material = new THREE.MeshStandardMaterial({ color: i % 2 ? '#cf8c58' : '#e3e3df', map: texture });
    material.name = `SyntheticMaterial${i}`;
    return material;
  });
  const root = new THREE.Bone(); root.name = 'SyntheticRoot';
  const paw = new THREE.Bone(); paw.name = 'SyntheticPaw'; paw.position.y = 1;
  root.add(paw);
  const mesh = new THREE.SkinnedMesh(geometry, materials[0]); mesh.name = 'SyntheticBody';
  mesh.add(root); scene.add(mesh);
  const skeleton = new THREE.Skeleton([root, paw]); mesh.bind(skeleton);
  const animations = KITTEN_ACTIONS.map((action, i) => {
    const duration = 0.8 + i * 0.1, angle = 0.02 + i * 0.01;
    const end = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    return new THREE.AnimationClip(`synthetic-${action}`, duration, [
      new THREE.QuaternionKeyframeTrack('SyntheticPaw.quaternion', [0, duration], [0, 0, 0, 1, ...end.toArray()]),
    ]);
  });
  const gltf = { scene, scenes: [scene], animations, cameras: [], asset: { version: '2.0' },
    parser: { json: { materials: materials.map(material => ({ name: material.name })) },
      getDependencies: async () => materials, getDependency: async (_type, index) => materials[index] } };
  const data = {
    version: 1, status: 'configured',
    models: [{ id: 'synthetic', src: 'generated/characters/fluffy-kittens/synthetic-test-only.glb',
      normalization: { scale: .01, yaw: Math.PI / 2, groundOffset: .04 },
      meshes: ['SyntheticBody'], materials: materials.map(material => material.name),
      clips: animations.map(clip => ({ name: clip.name, duration: clip.duration })),
      actions: Object.fromEntries(KITTEN_ACTIONS.map(action => [action, `synthetic-${action}`])),
      gait: { walk: .4, trot: .8, gallop: 1.6 } }],
    kittens: KITTEN_IDS.map((id, i) => ({ id, coat: KITTEN_COATS[id], modelId: 'synthetic', meshes: ['SyntheticBody'],
      materialBindings: [{ mesh: 'SyntheticBody', slot: 0, material: materials[i % materials.length].name }] })),
  };
  const parsed = readKittenPack(data); assert.equal(parsed.status, 'ready');
  return { pack: parsed.pack, gltf, asset: { gltf, materials }, geometry, materials, texture, skeleton };
}

function instances(f) { return createKittenInstances(f.pack, new Map([['synthetic', f.asset]])); }
function release(f, cats = []) {
  for (const cat of cats) {
    cat.mixer.stopAllAction(); cat.mixer.uncacheRoot(cat.scene);
    for (const skeleton of new Set(cat.skeletons)) skeleton.dispose();
  }
  f.geometry.dispose(); f.materials.forEach(material => material.dispose()); f.texture.dispose(); f.skeleton.dispose();
}
function pose(cat, changes = {}) {
  return { id: cat.id, position: [12, 4], yaw: .3, speed: 0, action: 'idle', actionTime: 0, actionDuration: 1, ...changes };
}

function glb(json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] }) {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const length = Math.ceil(encoded.length / 4) * 4;
  const result = new ArrayBuffer(20 + length), view = new DataView(result);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.byteLength, true);
  view.setUint32(12, length, true); view.setUint32(16, 0x4e4f534a, true);
  const body = new Uint8Array(result, 20); body.fill(32); body.set(encoded);
  return result;
}

function recordDisposals(f) {
  const counts = { geometry: 0, materials: f.materials.map(() => 0), texture: 0 };
  f.geometry.addEventListener('dispose', () => { counts.geometry++; });
  f.materials.forEach((material, i) => material.addEventListener('dispose', () => { counts.materials[i]++; }));
  f.texture.addEventListener('dispose', () => { counts.texture++; });
  return counts;
}

/** Inject the synthetic rig at the decoder boundary; no file or network access. */
async function withSyntheticLoader(f, run, parse = async () => f.gltf) {
  const previousFetch = globalThis.fetch, previousParse = GLTFLoader.prototype.parseAsync;
  const bytes = glb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [],
    materials: f.materials.map(material => ({ name: material.name })) });
  let requests = 0;
  globalThis.fetch = async () => { requests++; return { ok: true, status: 200, arrayBuffer: async () => bytes }; };
  GLTFLoader.prototype.parseAsync = parse;
  try { return await run(() => requests); }
  finally { globalThis.fetch = previousFetch; GLTFLoader.prototype.parseAsync = previousParse; }
}

test('six instances have independent bones and mixers while sharing immutable geometry and palette materials', () => {
  const f = fixture(), cats = instances(f);
  try {
    assert.deepEqual(inspectKittenAsset(f.gltf, f.materials), {
      meshes: [{ name: 'SyntheticBody', materialSlots: 1 }],
      materials: f.materials.map(material => material.name),
      clips: f.gltf.animations.map(clip => ({ name: clip.name, duration: clip.duration })),
    });
    assert.deepEqual(cats.map(cat => cat.id), KITTEN_IDS);
    const a = cats[0].scene.getObjectByName('SyntheticBody'), b = cats[1].scene.getObjectByName('SyntheticBody');
    assert.notEqual(a.skeleton, b.skeleton); assert.notEqual(a.skeleton.bones[1], b.skeleton.bones[1]);
    assert.notEqual(a.skeleton.boneMatrices, b.skeleton.boneMatrices);
    assert.notEqual(cats[0].mixer, cats[1].mixer);
    assert.equal(a.geometry, b.geometry); assert.equal(a.geometry, f.geometry);
    assert.equal(a.material, f.materials[0]); assert.equal(b.material, f.materials[1]);
    a.skeleton.bones[1].rotation.x = .75;
    assert.ok(Math.abs(b.skeleton.bones[1].rotation.x) < 1e-12);
    assert.ok(Math.abs(f.skeleton.bones[1].rotation.x) < 1e-12);
    const normalized = cats[0].group.children[0];
    assert.deepEqual(normalized.scale.toArray(), [.01, .01, .01]);
    assert.equal(normalized.position.y, .04, 'ground offset is already in world units, after uniform scale');
  } finally { release(f, cats); }
});

test('actual missing clips, wrong duration and non-finite animation keys are rejected before use', () => {
  for (const failure of ['missing', 'duration', 'nonfinite']) {
    const f = fixture();
    if (failure === 'missing') f.gltf.animations.pop();
    if (failure === 'duration') f.gltf.animations[0].duration += .2;
    if (failure === 'nonfinite') f.gltf.animations[0].tracks[0].values[0] = NaN;
    try { assert.throws(() => instances(f), /inspection failed|non-finite/); }
    finally { release(f); }
  }
});

test('locomotion uses measured speed, caps delta, and does not move a stopped gait', () => {
  const f = fixture(), cats = instances(f), cat = cats[0];
  try {
    updateKittenInstance(cat, pose(cat, { action: 'walk', speed: .8 }), -20, 10);
    assert.equal(cat.actions.walk.getEffectiveTimeScale(), 2);
    assert.ok(Math.abs(cat.actions.walk.time - .1) < 1e-6, 'at most 50ms of world time, scaled to authored gait');
    assert.deepEqual(cat.group.position.toArray(), [12, -20, 4]);
    assert.equal(cat.group.rotation.y, .3);
    const time = cat.actions.walk.time;
    updateKittenInstance(cat, pose(cat, { action: 'walk', speed: 0, actionTime: .1 }), -20, .05);
    assert.equal(cat.actions.walk.time, time);
    assert.equal(cat.actions.walk.getEffectiveTimeScale(), 0);
  } finally { release(f, cats); }
});

test('one-shot actions match coordinator duration, clamp once, and replay on an explicit action-time reset', () => {
  const f = fixture(), cats = instances(f), cat = cats[0];
  try {
    updateKittenInstance(cat, pose(cat, { action: 'pounce', actionDuration: 2 }), -20, .05);
    const action = cat.actions.pounce;
    assert.equal(action.loop, THREE.LoopOnce); assert.equal(action.clampWhenFinished, true);
    assert.ok(Math.abs(action.getEffectiveTimeScale() - action.getClip().duration / 2) < 1e-8);
    for (let i = 1; i < 60; i++) updateKittenInstance(cat, pose(cat, { action: 'pounce', actionTime: i * .05, actionDuration: 2 }), -20, .05);
    assert.equal(action.paused, true); assert.equal(action.time, action.getClip().duration);
    updateKittenInstance(cat, pose(cat, { action: 'pounce', actionTime: 0, actionDuration: 2 }), -20, .05);
    assert.equal(action.paused, false); assert.ok(action.time < .05);
  } finally { release(f, cats); }
});

test('semantic aliases own independent action state and cannot overwrite a one-shot loop mode', () => {
  const f = fixture();
  f.pack.models[0].actions.pounce = f.pack.models[0].actions.idle;
  const cats = instances(f), cat = cats[0];
  try {
    assert.notEqual(cat.actions.pounce, cat.actions.idle);
    assert.equal(cat.actions.pounce.loop, THREE.LoopOnce);
    assert.equal(cat.actions.idle.loop, THREE.LoopRepeat);
    assert.equal(cat.actions.pounce.getClip().tracks[0], cat.actions.idle.getClip().tracks[0], 'source tracks may stay shared and immutable');
  } finally { release(f, cats); }
});

test('zero-delta pause and reduced motion freeze animation without advancing hidden time', () => {
  const f = fixture(), cats = instances(f), cat = cats[0];
  try {
    updateKittenInstance(cat, pose(cat, { action: 'walk', speed: .4, actionTime: .5 }), -20, .05);
    const walkingTime = cat.actions.walk.time;
    for (let i = 0; i < 20; i++) updateKittenInstance(cat, pose(cat, { action: 'walk', speed: .4, actionTime: .5 }), -20, 0);
    assert.equal(cat.actions.walk.time, walkingTime);
    updateKittenInstance(cat, pose(cat, { action: 'walk', speed: .4, actionTime: .5 }), -20, 5, true);
    assert.equal(cat.current, 'idle'); assert.equal(cat.actions.idle.time, 0);
    const bone = cat.scene.getObjectByName('SyntheticPaw'), frozen = bone.quaternion.toArray();
    for (let i = 0; i < 20; i++) updateKittenInstance(cat, pose(cat, { action: 'walk', speed: .4, actionTime: .5 }), -20, 5, true);
    assert.deepEqual(bone.quaternion.toArray(), frozen); assert.equal(cat.actions.idle.time, 0);
    updateKittenInstance(cat, pose(cat, { action: 'walk', speed: .4, actionTime: .55 }), -20, .05, false);
    assert.ok(cat.actions.walk.time <= .051, 'resume does not replay time while reduced');
  } finally { release(f, cats); }
});

test('ready initialization and a paused one-shot resume preserve the coordinator phase', () => {
  const f = fixture(), cats = instances(f), cat = cats[0];
  try {
    // The component evaluates a stable authored idle pose for bounds before its
    // first frame. A pre-existing pause must not consume simulation time.
    const waiting = pose(cat, { action: 'pounce', actionTime: .75, actionDuration: 2 });
    updateKittenInstance(cat, waiting, -20, 0, true);
    cat.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(cat.scene);
    assert.equal(cat.current, 'idle'); assert.equal(cat.actions.idle.time, 0);
    assert.ok(!bounds.isEmpty());
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));

    updateKittenInstance(cat, waiting, -20, 0);
    const expected = .75 * cat.actions.pounce.getClip().duration / 2;
    assert.ok(Math.abs(cat.actions.pounce.time - expected) < 1e-8);
    for (let i = 0; i < 20; i++) updateKittenInstance(cat, waiting, -20, 0);
    assert.ok(Math.abs(cat.actions.pounce.time - expected) < 1e-8);

    updateKittenInstance(cat, waiting, -20, .05, true);
    updateKittenInstance(cat, waiting, -20, 0, false);
    assert.equal(cat.current, 'pounce');
    assert.ok(Math.abs(cat.actions.pounce.time - expected) < 1e-8, 'leaving reduced motion must not replay a partially completed one-shot');
  } finally { release(f, cats); }
});

test('embedded GLB preflight rejects external resources, unsupported decoders and truncated containers', () => {
  assert.deepEqual(inspectEmbeddedKittenGlb(glb()).asset, { version: '2.0' });
  for (const json of [
    { buffers: [{ uri: 'https://example.com/remote.bin' }] },
    { images: [{ uri: 'data:image/png;base64,AAAA' }] },
    { images: [{}] },
    { extensionsUsed: ['KHR_draco_mesh_compression'] },
    { extensionsUsed: ['EXT_meshopt_compression'] },
    { extensionsUsed: ['KHR_texture_basisu'] },
  ]) assert.throws(() => inspectEmbeddedKittenGlb(glb(json)), /embed|decoder/);
  assert.throws(() => inspectEmbeddedKittenGlb(new ArrayBuffer(12)), /size/);
  const truncated = glb().slice(0, -4);
  assert.throws(() => inspectEmbeddedKittenGlb(truncated), /complete|truncated/);
});

test('load disposal releases independent skeletons and each shared geometry/material/texture exactly once', async () => {
  const f = fixture(), counts = recordDisposals(f);
  await withSyntheticLoader(f, async requests => {
    const loaded = await loadKittenPack(f.pack, new AbortController().signal, path => path);
    assert.equal(requests(), 1); assert.equal(loaded.instances.length, 6);
    const skeletonCounts = loaded.instances.flatMap(instance => instance.skeletons).map(skeleton => {
      const state = { calls: 0 }, original = skeleton.dispose.bind(skeleton);
      skeleton.dispose = () => { state.calls++; original(); };
      return state;
    });
    loaded.dispose(); loaded.dispose();
    assert.deepEqual(counts, { geometry: 1, materials: [1, 1], texture: 1 });
    assert.ok(skeletonCounts.every(state => state.calls === 1));
  });
});

test('abort before a request performs no fetch; abort after decode releases loaded resources', async () => {
  const f = fixture(), counts = recordDisposals(f), controller = new AbortController();
  const already = new AbortController(); already.abort();
  await withSyntheticLoader(f, async requests => {
    await assert.rejects(loadKittenPack(f.pack, already.signal, path => path), { name: 'AbortError' });
    assert.equal(requests(), 0);
    await assert.rejects(loadKittenPack(f.pack, controller.signal, path => path), { name: 'AbortError' });
    assert.equal(requests(), 1);
    assert.equal(counts.geometry, 1); assert.equal(counts.materials[0], 1); assert.equal(counts.texture, 1);
  }, async () => { controller.abort(); return f.gltf; });
});

test('material loading failure disposes successfully loaded unused palette entries', async () => {
  const f = fixture(3), counts = recordDisposals(f);
  f.gltf.parser.getDependencies = async () => { throw new Error('Synthetic material failure'); };
  f.gltf.parser.getDependency = async (_type, index) => {
    if (index === 2) throw new Error('Synthetic material failure');
    return f.materials[index];
  };
  await withSyntheticLoader(f, async () => {
    await assert.rejects(loadKittenPack(f.pack, new AbortController().signal, path => path), /Synthetic material failure/);
    assert.equal(counts.geometry, 1);
    assert.equal(counts.materials[0], 1);
    assert.equal(counts.materials[1], 1, 'the unused but successfully loaded second coat must not leak');
    assert.equal(counts.texture, 1);
  });
  // The deliberately failed third dependency was never transferred to loader ownership.
  f.materials[2].dispose();
});
