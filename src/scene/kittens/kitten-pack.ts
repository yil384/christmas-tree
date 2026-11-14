/** The selected six companions. These IDs describe roles, not invented assets. */
export const KITTEN_IDS = ['tuxedo-a', 'tuxedo-b', 'black', 'orange', 'calico', 'birman'] as const;
export type KittenId = typeof KITTEN_IDS[number];

export const KITTEN_ACTIONS = ['idle', 'walk', 'trot', 'gallop', 'pounce', 'paw', 'sit', 'lie', 'sleep'] as const;
export type KittenAction = typeof KITTEN_ACTIONS[number];
export type KittenCoat = 'short' | 'fluffy';
export type KittenGait = 'walk' | 'trot' | 'gallop';

export const KITTEN_COATS: Readonly<Record<KittenId, KittenCoat>> = {
  'tuxedo-a': 'short', 'tuxedo-b': 'short', black: 'short', orange: 'short',
  calico: 'fluffy', birman: 'fluffy',
};

export const KITTEN_ASSET_DIRECTORY = 'generated/characters/fluffy-kittens/';

export interface KittenClip {
  /** Exact AnimationClip name observed after loading the prepared GLB. */
  name: string;
  /** Actual inspected clip duration in seconds, not a planned duration. */
  duration: number;
}

export interface KittenModel {
  id: string;
  /** Canonical same-site URL, relative to the application base. */
  src: string;
  normalization: {
    /** A positive uniform scale; never a nonuniform XYZ scale. */
    scale: number;
    /** Forward-direction correction in radians. */
    yaw: number;
    /** World-space Y offset applied after uniform scale. */
    groundOffset: number;
  };
  /** Complete named inventories from the prepared GLB, verified again at load. */
  meshes: string[];
  materials: string[];
  clips: KittenClip[];
  /** Explicit semantic mapping. No clip names or fallbacks are synthesized. */
  actions: Record<KittenAction, string>;
  /** Measured world units/second at playback rate 1, after normalization. */
  gait: Record<KittenGait, number>;
}

export interface KittenMaterialBinding {
  mesh: string;
  /** Zero-based slot in this named mesh's material or material array. */
  slot: number;
  /** Exact named material from the same GLB. */
  material: string;
}

export interface KittenDefinition {
  id: KittenId;
  coat: KittenCoat;
  modelId: string;
  /** Only these meshes belong to this kitten instance. */
  meshes: string[];
  /** Every selected mesh slot must have an explicit binding. */
  materialBindings: KittenMaterialBinding[];
}

export interface KittenPackManifest {
  version: 1;
  status: 'configured';
  models: KittenModel[];
  kittens: KittenDefinition[];
}

export interface UnconfiguredKittenPackManifest {
  version: 1;
  status: 'unconfigured';
  models: [];
  kittens: [];
}

/** Missing commercial files are represented honestly; no old-cat fallback. */
export const UNCONFIGURED_KITTEN_PACK: UnconfiguredKittenPackManifest = {
  version: 1, status: 'unconfigured', models: [], kittens: [],
};

export interface KittenManifestIssue {
  path: string;
  code: 'type' | 'unexpected-key' | 'value' | 'duplicate' | 'missing' | 'unsafe-url' | 'reference' | 'asset-mismatch';
  message: string;
}

export type KittenPackReadResult =
  | { status: 'unconfigured'; reason: 'missing-manifest' | 'missing-assets' }
  | { status: 'invalid'; issues: KittenManifestIssue[] }
  | { status: 'ready'; pack: KittenPackManifest };

export interface KittenAssetInspection {
  meshes: { name: string; materialSlots: number }[];
  materials: string[];
  clips: KittenClip[];
}

type RecordValue = Record<string, unknown>;
type Issues = KittenManifestIssue[];
const GAITS = ['walk', 'trot', 'gallop'] as const;
const NAME_LIMIT = 240;

function record(value: unknown): value is RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(issues: Issues, path: string, code: KittenManifestIssue['code'], message: string) {
  issues.push({ path, code, message });
}

function object(value: unknown, path: string, keys: readonly string[], issues: Issues): RecordValue | undefined {
  if (!record(value)) {
    issue(issues, path, 'type', 'Expected a plain object.');
    return;
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) issue(issues, `${path}.${key}`, 'unexpected-key', 'Unknown field.');
  }
  return value;
}

function name(value: unknown, path: string, issues: Issues): string | undefined {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > NAME_LIMIT || /[\u0000-\u001f\u007f]/.test(value)) {
    issue(issues, path, 'value', 'Expected a nonempty exact asset name without surrounding whitespace or control characters.');
    return;
  }
  return value;
}

function number(value: unknown, path: string, issues: Issues, positive = false): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0)) {
    issue(issues, path, 'value', positive ? 'Expected a finite positive number.' : 'Expected a finite number.');
    return;
  }
  return value;
}

function list(value: unknown, path: string, issues: Issues, minimum = 1, maximum = 2048): unknown[] | undefined {
  if (!Array.isArray(value)) {
    issue(issues, path, 'type', 'Expected an array.');
    return;
  }
  if (value.length < minimum || value.length > maximum) {
    issue(issues, path, 'value', `Expected ${minimum}–${maximum} entries.`);
    return;
  }
  return value;
}

function names(value: unknown, path: string, issues: Issues): string[] | undefined {
  const entries = list(value, path, issues);
  if (!entries) return;
  const result: string[] = [], seen = new Set<string>();
  entries.forEach((entry, i) => {
    const parsed = name(entry, `${path}[${i}]`, issues);
    if (parsed === undefined) return;
    if (seen.has(parsed)) issue(issues, `${path}[${i}]`, 'duplicate', 'Asset names must be unique.');
    seen.add(parsed); result.push(parsed);
  });
  return result;
}

function clips(value: unknown, path: string, issues: Issues): KittenClip[] | undefined {
  const entries = list(value, path, issues, 1, 512);
  if (!entries) return;
  const result: KittenClip[] = [], seen = new Set<string>();
  entries.forEach((entry, i) => {
    const at = `${path}[${i}]`, item = object(entry, at, ['name', 'duration'], issues);
    if (!item) return;
    const clipName = name(item.name, `${at}.name`, issues);
    const duration = number(item.duration, `${at}.duration`, issues, true);
    if (clipName === undefined || duration === undefined) return;
    if (seen.has(clipName)) issue(issues, `${at}.name`, 'duplicate', 'Clip names must be unique.');
    seen.add(clipName); result.push({ name: clipName, duration });
  });
  return result;
}

/** Only flat, same-site generated GLBs; no percent-encoded or URL shortcuts. */
export function isKittenAssetUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 300 && !value.includes('..')
    && /^generated\/characters\/fluffy-kittens\/[A-Za-z0-9][A-Za-z0-9._-]*\.glb$/.test(value);
}

function model(value: unknown, path: string, issues: Issues): KittenModel | undefined {
  const before = issues.length;
  const item = object(value, path, ['id', 'src', 'normalization', 'meshes', 'materials', 'clips', 'actions', 'gait'], issues);
  if (!item) return;
  const id = name(item.id, `${path}.id`, issues);
  if (!isKittenAssetUrl(item.src)) issue(issues, `${path}.src`, 'unsafe-url', `Expected a same-site ${KITTEN_ASSET_DIRECTORY}<safe-name>.glb URL.`);
  const transform = object(item.normalization, `${path}.normalization`, ['scale', 'yaw', 'groundOffset'], issues);
  const normalization = transform && {
    scale: number(transform.scale, `${path}.normalization.scale`, issues, true),
    yaw: number(transform.yaw, `${path}.normalization.yaw`, issues),
    groundOffset: number(transform.groundOffset, `${path}.normalization.groundOffset`, issues),
  };
  const meshNames = names(item.meshes, `${path}.meshes`, issues);
  const materialNames = names(item.materials, `${path}.materials`, issues);
  const animationClips = clips(item.clips, `${path}.clips`, issues);
  const actionObject = object(item.actions, `${path}.actions`, KITTEN_ACTIONS, issues);
  const actions = {} as Record<KittenAction, string>;
  if (actionObject) for (const action of KITTEN_ACTIONS) {
    const clipName = name(actionObject[action], `${path}.actions.${action}`, issues);
    if (clipName === undefined) continue;
    actions[action] = clipName;
    if (animationClips && !animationClips.some(clip => clip.name === clipName)) {
      issue(issues, `${path}.actions.${action}`, 'reference', 'The semantic action must reference an explicitly inspected clip.');
    }
  }
  const gaitObject = object(item.gait, `${path}.gait`, GAITS, issues);
  const gait = {} as Record<KittenGait, number>;
  if (gaitObject) for (const action of GAITS) {
    const speed = number(gaitObject[action], `${path}.gait.${action}`, issues, true);
    if (speed !== undefined) gait[action] = speed;
  }
  if (issues.length !== before) return;
  return { id: id!, src: item.src as string, normalization: normalization as KittenModel['normalization'],
    meshes: meshNames!, materials: materialNames!, clips: animationClips!, actions, gait };
}

function kitten(value: unknown, path: string, issues: Issues): KittenDefinition | undefined {
  const before = issues.length;
  const item = object(value, path, ['id', 'coat', 'modelId', 'meshes', 'materialBindings'], issues);
  if (!item) return;
  const id = item.id as KittenId;
  if (!(KITTEN_IDS as readonly unknown[]).includes(id)) issue(issues, `${path}.id`, 'value', 'Expected one of the six selected kitten IDs.');
  else if (item.coat !== KITTEN_COATS[id]) issue(issues, `${path}.coat`, 'value', `This kitten requires the ${KITTEN_COATS[id]} coat.`);
  const modelId = name(item.modelId, `${path}.modelId`, issues);
  const meshNames = names(item.meshes, `${path}.meshes`, issues);
  const entries = list(item.materialBindings, `${path}.materialBindings`, issues);
  const materialBindings: KittenMaterialBinding[] = [], seen = new Set<string>();
  entries?.forEach((entry, i) => {
    const at = `${path}.materialBindings[${i}]`, binding = object(entry, at, ['mesh', 'slot', 'material'], issues);
    if (!binding) return;
    const mesh = name(binding.mesh, `${at}.mesh`, issues), material = name(binding.material, `${at}.material`, issues);
    const slot = binding.slot;
    if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 0) issue(issues, `${at}.slot`, 'value', 'Expected a nonnegative integer material slot.');
    if (mesh === undefined || material === undefined || typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 0) return;
    const key = JSON.stringify([mesh, slot]);
    if (seen.has(key)) issue(issues, at, 'duplicate', 'Each selected mesh slot may be bound once.');
    seen.add(key); materialBindings.push({ mesh, slot, material });
    if (meshNames && !meshNames.includes(mesh)) issue(issues, `${at}.mesh`, 'reference', 'A binding must belong to a selected kitten mesh.');
  });
  for (const mesh of meshNames ?? []) {
    if (!materialBindings.some(binding => binding.mesh === mesh)) issue(issues, `${path}.materialBindings`, 'missing', `No material binding for selected mesh ${mesh}.`);
  }
  if (issues.length !== before) return;
  return { id, coat: item.coat as KittenCoat, modelId: modelId!, meshes: meshNames!, materialBindings };
}

/** Parse configuration only. A ready manifest still needs GLB inspection. */
export function readKittenPack(data: unknown): KittenPackReadResult {
  if (data === undefined || data === null) return { status: 'unconfigured', reason: 'missing-manifest' };
  const issues: Issues = [];
  const root = object(data, '$', ['version', 'status', 'models', 'kittens'], issues);
  if (!root) return { status: 'invalid', issues };
  if (root.version !== 1) issue(issues, '$.version', 'value', 'Only kitten manifest version 1 is supported.');
  if (root.status !== 'configured' && root.status !== 'unconfigured') issue(issues, '$.status', 'value', 'Expected configured or unconfigured status.');
  if (root.status === 'unconfigured') {
    list(root.models, '$.models', issues, 0, 0); list(root.kittens, '$.kittens', issues, 0, 0);
    return issues.length ? { status: 'invalid', issues } : { status: 'unconfigured', reason: 'missing-assets' };
  }
  const modelEntries = list(root.models, '$.models', issues, 1, 6);
  const kittenEntries = list(root.kittens, '$.kittens', issues, 6, 6);
  const models: KittenModel[] = [], kittens: KittenDefinition[] = [];
  const modelIds = new Set<string>(), urls = new Set<string>(), kittenIds = new Set<KittenId>();
  modelEntries?.forEach((entry, i) => {
    const parsed = model(entry, `$.models[${i}]`, issues);
    if (!parsed) return;
    if (modelIds.has(parsed.id)) issue(issues, `$.models[${i}].id`, 'duplicate', 'Model IDs must be unique.');
    if (urls.has(parsed.src)) issue(issues, `$.models[${i}].src`, 'duplicate', 'Shared GLBs must use one model definition.');
    modelIds.add(parsed.id); urls.add(parsed.src); models.push(parsed);
  });
  kittenEntries?.forEach((entry, i) => {
    const parsed = kitten(entry, `$.kittens[${i}]`, issues);
    if (!parsed) return;
    if (kittenIds.has(parsed.id)) issue(issues, `$.kittens[${i}].id`, 'duplicate', 'Each kitten ID must appear exactly once.');
    kittenIds.add(parsed.id); kittens.push(parsed);
    const owner = models.find(candidate => candidate.id === parsed.modelId);
    if (!owner) issue(issues, `$.kittens[${i}].modelId`, 'reference', 'The kitten must reference a declared model.');
    else {
      for (const mesh of parsed.meshes) if (!owner.meshes.includes(mesh)) issue(issues, `$.kittens[${i}].meshes`, 'reference', `Mesh ${mesh} is not declared by this model.`);
      parsed.materialBindings.forEach((binding, j) => {
        if (!owner.materials.includes(binding.material)) issue(issues, `$.kittens[${i}].materialBindings[${j}].material`, 'reference', 'The material must belong to the kitten model.');
      });
    }
  });
  for (const id of KITTEN_IDS) if (!kittenIds.has(id)) issue(issues, '$.kittens', 'missing', `Missing selected kitten ${id}.`);
  for (const entry of models) if (!kittens.some(item => item.modelId === entry.id)) issue(issues, '$.models', 'reference', `Model ${entry.id} is not used by any selected kitten.`);
  if (issues.length) return { status: 'invalid', issues };
  return { status: 'ready', pack: { version: 1, status: 'configured', models,
    kittens: KITTEN_IDS.map(id => kittens.find(item => item.id === id)!) } };
}

/** Check real GLTFLoader inventories before cloning or exposing any companion.
 * This validates identity/duration, not whether a clip artistically depicts its
 * assigned semantic action; that assignment requires inspection of the asset. */
export function validateKittenAssetInspection(model: KittenModel, inspection: unknown, kittens: readonly KittenDefinition[] = []): KittenManifestIssue[] {
  const issues: Issues = [], path = `asset:${model.id}`;
  const actual = object(inspection, path, ['meshes', 'materials', 'clips'], issues);
  if (!actual) return issues;
  const meshEntries = list(actual.meshes, `${path}.meshes`, issues);
  const inspectedMeshes: KittenAssetInspection['meshes'] = [], meshNames = new Set<string>();
  meshEntries?.forEach((entry, i) => {
    const at = `${path}.meshes[${i}]`, item = object(entry, at, ['name', 'materialSlots'], issues);
    if (!item) return;
    const meshName = name(item.name, `${at}.name`, issues), slots = item.materialSlots;
    if (typeof slots !== 'number' || !Number.isSafeInteger(slots) || slots < 1) issue(issues, `${at}.materialSlots`, 'value', 'Expected a positive integer slot count from the loaded mesh.');
    if (meshName === undefined || typeof slots !== 'number' || !Number.isSafeInteger(slots) || slots < 1) return;
    if (meshNames.has(meshName)) issue(issues, `${at}.name`, 'duplicate', 'Loaded mesh names are ambiguous.');
    meshNames.add(meshName); inspectedMeshes.push({ name: meshName, materialSlots: slots });
  });
  const inspectedMaterials = names(actual.materials, `${path}.materials`, issues);
  const inspectedClips = clips(actual.clips, `${path}.clips`, issues);
  const matchNames = (expected: readonly string[], observed: readonly string[], at: string) => {
    const expectedSet = new Set(expected), observedSet = new Set(observed);
    for (const item of expectedSet) if (!observedSet.has(item)) issue(issues, at, 'asset-mismatch', `Declared asset name ${item} is missing from the GLB.`);
    for (const item of observedSet) if (!expectedSet.has(item)) issue(issues, at, 'asset-mismatch', `Loaded asset name ${item} is absent from the declared inventory.`);
  };
  matchNames(model.meshes, [...meshNames], `${path}.meshes`);
  if (inspectedMaterials) matchNames(model.materials, inspectedMaterials, `${path}.materials`);
  if (inspectedClips) {
    matchNames(model.clips.map(item => item.name), inspectedClips.map(item => item.name), `${path}.clips`);
    for (const expected of model.clips) {
      const found = inspectedClips.find(item => item.name === expected.name);
      if (found && Math.abs(found.duration - expected.duration) > Math.max(0.0001, found.duration * 0.00001)) {
        issue(issues, `${path}.clips.${expected.name}`, 'asset-mismatch', 'The loaded clip duration differs from its inspected manifest duration.');
      }
    }
  }
  for (const item of kittens.filter(candidate => candidate.modelId === model.id)) {
    for (const meshName of item.meshes) {
      const mesh = inspectedMeshes.find(candidate => candidate.name === meshName);
      if (!mesh) continue;
      const bindings = item.materialBindings.filter(binding => binding.mesh === meshName);
      for (let slot = 0; slot < mesh.materialSlots; slot++) {
        if (!bindings.some(binding => binding.slot === slot)) issue(issues, `kitten:${item.id}.materialBindings`, 'missing', `No explicit material for ${meshName} slot ${slot}.`);
      }
      if (bindings.some(binding => binding.slot >= mesh.materialSlots)) issue(issues, `kitten:${item.id}.materialBindings`, 'asset-mismatch', `A binding exceeds the actual slots in ${meshName}.`);
    }
  }
  return issues;
}
