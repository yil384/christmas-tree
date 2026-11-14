import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/scene/kittens/kitten-pack.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  KITTEN_IDS, KITTEN_ACTIONS, KITTEN_COATS, UNCONFIGURED_KITTEN_PACK,
  readKittenPack, isKittenAssetUrl, validateKittenAssetInspection,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

// Synthetic names deliberately have no relationship to the unprovided paid
// pack. These fixtures validate the contract; they are not runtime assets.
function fixtureModel(id) {
  return {
    id, src: `generated/characters/fluffy-kittens/test-${id}.glb`,
    normalization: { scale: 0.01, yaw: -Math.PI / 2, groundOffset: 0.04 },
    meshes: ['SyntheticBody'], materials: ['SyntheticCoatA', 'SyntheticCoatB'],
    clips: KITTEN_ACTIONS.map((action, i) => ({ name: `fixture-${action}`, duration: 0.8 + i * 0.125 })),
    actions: Object.fromEntries(KITTEN_ACTIONS.map(action => [action, `fixture-${action}`])),
    gait: { walk: 0.4, trot: 0.8, gallop: 1.4 },
  };
}

function fixture() {
  return {
    version: 1, status: 'configured', models: [fixtureModel('short'), fixtureModel('fluffy')],
    kittens: KITTEN_IDS.map((id, i) => ({
      id, coat: KITTEN_COATS[id], modelId: KITTEN_COATS[id], meshes: ['SyntheticBody'],
      materialBindings: [{ mesh: 'SyntheticBody', slot: 0, material: i % 2 ? 'SyntheticCoatA' : 'SyntheticCoatB' }],
    })),
  };
}

function inspection(model, materialSlots = 1) {
  return {
    meshes: model.meshes.map(name => ({ name, materialSlots })),
    materials: [...model.materials], clips: structuredClone(model.clips),
  };
}

function invalid(data, expectedCode) {
  const result = readKittenPack(data);
  assert.equal(result.status, 'invalid');
  assert.ok(result.issues.length > 0);
  if (expectedCode) assert.ok(result.issues.some(issue => issue.code === expectedCode), JSON.stringify(result.issues));
  return result.issues;
}

test('absent assets stay unconfigured; malformed or contradictory data never becomes a fallback cat', () => {
  for (const data of [undefined, null]) assert.deepEqual(readKittenPack(data), { status: 'unconfigured', reason: 'missing-manifest' });
  assert.deepEqual(readKittenPack(UNCONFIGURED_KITTEN_PACK), { status: 'unconfigured', reason: 'missing-assets' });
  for (const data of [{}, [], '', false, { version: 1, status: 'configured', models: [], kittens: [] }]) invalid(data);
  invalid({ ...UNCONFIGURED_KITTEN_PACK, models: [fixtureModel('old-cat')] });
  invalid({ ...UNCONFIGURED_KITTEN_PACK, version: 2 });
  invalid({ ...UNCONFIGURED_KITTEN_PACK, fallback: 'christmas-cat.glb' }, 'unexpected-key');
});

test('the selected pack has exactly the six fixed identities, four short coats and two fluffy coats', () => {
  const input = fixture();
  input.kittens.reverse();
  const result = readKittenPack(input);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.pack.kittens.map(kitten => kitten.id), KITTEN_IDS);
  assert.deepEqual(result.pack.kittens.filter(kitten => kitten.coat === 'fluffy').map(kitten => kitten.id), ['calico', 'birman']);
  assert.equal(result.pack.kittens.filter(kitten => kitten.coat === 'short').length, 4);
  assert.equal(result.pack.models.length, 2);
  for (const model of result.pack.models) assert.deepEqual(validateKittenAssetInspection(model, inspection(model), result.pack.kittens), []);
});

test('separate GLBs for all six cats and a shared model both use explicit real inventories', () => {
  const separate = fixture();
  separate.models = KITTEN_IDS.map(fixtureModel);
  separate.kittens.forEach(kitten => { kitten.modelId = kitten.id; });
  assert.equal(readKittenPack(separate).status, 'ready');
  const shared = fixture();
  shared.models = [fixtureModel('combined')];
  shared.kittens.forEach(kitten => { kitten.modelId = 'combined'; });
  assert.equal(readKittenPack(shared).status, 'ready');
});

test('missing colors, duplicate IDs, wrong coat geometry and missing model references are rejected', () => {
  const missing = fixture(); missing.kittens.pop(); invalid(missing, 'missing');
  const duplicate = fixture(); duplicate.kittens[5] = structuredClone(duplicate.kittens[0]); invalid(duplicate, 'duplicate');
  const wrong = fixture(); wrong.kittens[4].coat = 'short'; invalid(wrong, 'value');
  const invented = fixture(); invented.kittens[0].id = 'old-cat'; invalid(invented, 'value');
  const absentModel = fixture(); absentModel.kittens[0].modelId = 'missing'; invalid(absentModel, 'reference');
  const sameModelId = fixture(); sameModelId.models[1].id = 'short'; invalid(sameModelId, 'duplicate');
  const sameSource = fixture(); sameSource.models[1].src = sameSource.models[0].src; invalid(sameSource, 'duplicate');
  const unused = fixture(); unused.models.push(fixtureModel('unused')); invalid(unused, 'reference');
});

test('only generated same-site GLBs are accepted, without remote URLs, traversal, encoded names or query tricks', () => {
  for (const safe of ['generated/characters/fluffy-kittens/short.glb', 'generated/characters/fluffy-kittens/fluffy-v2.2026.glb']) {
    assert.equal(isKittenAssetUrl(safe), true);
    const data = fixture(); data.models[0].src = safe; assert.equal(readKittenPack(data).status, 'ready');
  }
  for (const unsafe of [
    'https://example.com/cat.glb', '//example.com/cat.glb', '/generated/characters/fluffy-kittens/cat.glb',
    'characters/fluffy-kittens/cat.glb', 'generated/characters/fluffy-kittens/../cat.glb',
    'generated/characters/fluffy-kittens/%2e%2e/cat.glb', 'generated/characters/fluffy-kittens/a%2fcat.glb',
    'generated/characters/fluffy-kittens/cat.glb?token=x', 'generated/characters/fluffy-kittens/cat.glb#remote',
    'generated/characters/fluffy-kittens/..\\cat.glb', 'generated/characters/fluffy-kittens/sub/cat.glb',
    'generated/characters/fluffy-kittens/cat.gltf', 'generated/characters/fluffy-kittens/cat.glb\n',
    'data:model/gltf-binary;base64,AAAA', 'blob:https://example.com/x', null,
  ]) {
    assert.equal(isKittenAssetUrl(unsafe), false, String(unsafe));
    const data = fixture(); data.models[0].src = unsafe; invalid(data, 'unsafe-url');
  }
});

test('normalization, measured gait speeds and clip durations reject invalid numeric data', () => {
  for (const bad of [NaN, Infinity, -Infinity, '1', null]) {
    for (const key of ['scale', 'yaw', 'groundOffset']) {
      const data = fixture(); data.models[0].normalization[key] = bad; invalid(data, 'value');
    }
    for (const action of ['walk', 'trot', 'gallop']) {
      const data = fixture(); data.models[0].gait[action] = bad; invalid(data, 'value');
    }
    const data = fixture(); data.models[0].clips[0].duration = bad; invalid(data, 'value');
  }
  for (const bad of [0, -1]) {
    const scale = fixture(); scale.models[0].normalization.scale = bad; invalid(scale, 'value');
    const speed = fixture(); speed.models[0].gait.walk = bad; invalid(speed, 'value');
    const duration = fixture(); duration.models[0].clips[0].duration = bad; invalid(duration, 'value');
  }
  const vectorScale = fixture(); vectorScale.models[0].normalization.scale = [1, 2, 1]; invalid(vectorScale, 'value');
});

test('every semantic action must explicitly reference an inspected clip; missing or guessed names are not filled in', () => {
  for (const action of KITTEN_ACTIONS) {
    const missing = fixture(); delete missing.models[0].actions[action]; invalid(missing, 'value');
    const guessed = fixture(); guessed.models[0].actions[action] = 'unknown-vendor-name'; invalid(guessed, 'reference');
  }
  const duplicate = fixture(); duplicate.models[0].clips.push(structuredClone(duplicate.models[0].clips[0])); invalid(duplicate, 'duplicate');
  const empty = fixture(); empty.models[0].clips = []; invalid(empty, 'value');
  const unknown = fixture(); unknown.models[0].actions.dance = 'fixture-idle'; invalid(unknown, 'unexpected-key');
});

test('material swaps cannot target unselected meshes, nonexistent materials or duplicate slots', () => {
  const absentMesh = fixture(); absentMesh.kittens[0].meshes = ['NotInGLB']; invalid(absentMesh, 'reference');
  const absentMaterial = fixture(); absentMaterial.kittens[0].materialBindings[0].material = 'UnknownCoat'; invalid(absentMaterial, 'reference');
  const unselected = fixture(); unselected.kittens[0].materialBindings[0].mesh = 'UnselectedBody'; invalid(unselected, 'reference');
  const duplicate = fixture(); duplicate.kittens[0].materialBindings.push(structuredClone(duplicate.kittens[0].materialBindings[0])); invalid(duplicate, 'duplicate');
  const missing = fixture(); missing.kittens[0].materialBindings = []; invalid(missing, 'missing');
  for (const slot of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0']) {
    const data = fixture(); data.kittens[0].materialBindings[0].slot = slot; invalid(data, 'value');
  }
});

test('loaded assets must match their full inventories and actual durations, not just a syntactically valid manifest', () => {
  const pack = readKittenPack(fixture()).pack, model = pack.models[0];
  for (const part of ['meshes', 'materials', 'clips']) {
    const absent = inspection(model); absent[part].pop();
    assert.ok(validateKittenAssetInspection(model, absent, pack.kittens).length > 0);
  }
  const extra = inspection(model); extra.meshes.push({ name: 'UnexpectedMesh', materialSlots: 1 });
  assert.ok(validateKittenAssetInspection(model, extra, pack.kittens).some(issue => issue.code === 'asset-mismatch'));
  const ambiguous = inspection(model); ambiguous.meshes.push({ ...ambiguous.meshes[0] });
  assert.ok(validateKittenAssetInspection(model, ambiguous).some(issue => issue.code === 'duplicate'));
  const duration = inspection(model); duration.clips[0].duration += 0.1;
  assert.ok(validateKittenAssetInspection(model, duration).some(issue => issue.code === 'asset-mismatch'));
  const floatRoundoff = inspection(model); floatRoundoff.clips[0].duration += 0.00001;
  assert.deepEqual(validateKittenAssetInspection(model, floatRoundoff, pack.kittens), []);
  const badDuration = inspection(model); badDuration.clips[0].duration = NaN;
  assert.ok(validateKittenAssetInspection(model, badDuration).some(issue => issue.code === 'value'));
});

test('actual GLB slot counts are authoritative and every selected slot must be bound', () => {
  const data = fixture(), pack = readKittenPack(data).pack, model = pack.models[0];
  assert.ok(validateKittenAssetInspection(model, inspection(model, 2), pack.kittens).some(issue => issue.code === 'missing'));
  const beyond = structuredClone(pack.kittens); beyond[0].materialBindings[0].slot = 3;
  assert.ok(validateKittenAssetInspection(model, inspection(model), beyond).some(issue => issue.code === 'asset-mismatch'));
  const complete = structuredClone(pack.kittens);
  complete.filter(kitten => kitten.modelId === model.id).forEach(kitten => {
    kitten.materialBindings.push({ mesh: 'SyntheticBody', slot: 1, material: 'SyntheticCoatA' });
  });
  assert.deepEqual(validateKittenAssetInspection(model, inspection(model, 2), complete), []);
});

test('unknown fields, whitespace names and inherited data cannot conceal a malformed configuration', () => {
  const unknown = fixture(); unknown.models[0].normalization.scaleY = 2; invalid(unknown, 'unexpected-key');
  const whitespace = fixture(); whitespace.models[0].meshes[0] = ' SyntheticBody'; invalid(whitespace, 'value');
  invalid(Object.create(fixture()), 'type');
  const pollution = fixture(); pollution.models[0] = { ...pollution.models[0], ...JSON.parse('{"__proto__":{"src":"https://example.com"}}') };
  invalid(pollution, 'unexpected-key');
});

test('a validated pack owns copied data, so later input mutation cannot alter verified references', () => {
  const input = fixture(), result = readKittenPack(input);
  assert.equal(result.status, 'ready');
  input.models[0].src = 'https://example.com/changed.glb';
  input.models[0].normalization.scale = 99;
  input.models[0].clips[0].name = 'changed';
  input.kittens[0].materialBindings[0].material = 'changed';
  assert.equal(result.pack.models[0].src, 'generated/characters/fluffy-kittens/test-short.glb');
  assert.equal(result.pack.models[0].normalization.scale, 0.01);
  assert.equal(result.pack.models[0].clips[0].name, 'fixture-idle');
  assert.equal(result.pack.kittens[0].materialBindings[0].material, 'SyntheticCoatB');
});
