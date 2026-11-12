import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SDK_VERSION = '1.2.2';
export const HAND_MODEL = Object.freeze({
  url: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
  sha256: '97952348cf6a6a4915c2ea1496b4b37ebabc50cbbf80571435643c455f2b0482',
  bytes: 8_373_440,
  cacheName: 'gesture-recognizer-float16-v1.task',
});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function verifyHandModel(bytes) {
  if (bytes.length !== HAND_MODEL.bytes || digest(bytes) !== HAND_MODEL.sha256) {
    throw new Error('The hand model does not match the pinned version-1 SHA-256. Refusing to publish it.');
  }
  return bytes;
}

async function optionalRead(path) {
  try { return await readFile(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeAsset(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const previous = await optionalRead(path);
  if (previous && previous.equals(Buffer.from(bytes))) return;
  const temporary = path + '.tmp-' + process.pid;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function modelBytes(root, fetchImpl) {
  // node_modules is already ignored; no model binaries or caches enter source control.
  const cache = join(root, 'node_modules', '.cache', 'hand-tracking', HAND_MODEL.cacheName);
  const cached = await optionalRead(cache);
  if (cached) return verifyHandModel(cached);
  const response = await fetchImpl(HAND_MODEL.url, { signal: AbortSignal.timeout(90_000), redirect: 'error' });
  if (!response.ok) throw new Error('Cannot download the pinned hand model: HTTP ' + response.status);
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) !== HAND_MODEL.bytes) throw new Error('Unexpected hand-model download size.');
  const bytes = verifyHandModel(Buffer.from(await response.arrayBuffer()));
  await writeAsset(cache, bytes);
  return bytes;
}

/** All browser assets are same-origin and generated before dev/build, not on page load. */
export async function prepareHandTracking({ root = projectRoot, fetchImpl = fetch } = {}) {
  const sdk = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
  const metadata = JSON.parse(await readFile(join(sdk, 'package.json'), 'utf8'));
  if (metadata.version !== SDK_VERSION || metadata.license !== 'Apache-2.0') {
    throw new Error('Expected the pinned @mediapipe/tasks-vision@' + SDK_VERSION + ' package. Run npm ci.');
  }
  const source = join(root, 'src', 'hand-tracking');
  const [model, worker, license, notice] = await Promise.all([
    modelBytes(root, fetchImpl), readFile(join(source, 'worker.js')),
    readFile(join(source, 'licenses', 'mediapipe-LICENSE.txt')),
    readFile(join(source, 'licenses', 'NOTICE.txt')),
  ]);
  const destination = join(root, 'public', 'generated', 'hand-tracking');
  const sdkDirectory = 'sdk-' + SDK_VERSION;
  const workerName = 'worker-' + digest(worker).slice(0, 20) + '.js';
  const modelName = 'gesture-recognizer-float16-v1-' + HAND_MODEL.sha256.slice(0, 20) + '.task';
  const copied = [
    ['vision_bundle.js', sdkDirectory + '/vision_bundle.js'],
    ['wasm/vision_wasm_internal.js', sdkDirectory + '/wasm/vision_wasm_internal.js'],
    ['wasm/vision_wasm_internal.wasm', sdkDirectory + '/wasm/vision_wasm_internal.wasm'],
  ];
  let bytes = model.length + worker.length + license.length + notice.length;
  for (const [input, output] of copied) {
    const data = await readFile(join(sdk, input));
    await writeAsset(join(destination, output), data);
    bytes += data.length;
  }
  await Promise.all([
    writeAsset(join(destination, workerName), worker), writeAsset(join(destination, modelName), model),
    writeAsset(join(destination, 'LICENSE-MediaPipe.txt'), license), writeAsset(join(destination, 'NOTICE.txt'), notice),
  ]);
  const manifest = {
    version: 1,
    sdkVersion: SDK_VERSION,
    worker: workerName,
    runtime: sdkDirectory + '/vision_bundle.js',
    wasmBase: sdkDirectory + '/wasm',
    model: modelName,
    modelSha256: HAND_MODEL.sha256,
    modelBytes: HAND_MODEL.bytes,
    notices: ['LICENSE-MediaPipe.txt', 'NOTICE.txt'],
  };
  // Publish the manifest only after every referenced file has been verified and copied.
  await writeAsset(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const file of await readdir(destination)) {
    if ((/^worker-[a-f0-9]{20}\.js$/.test(file) && file !== workerName)
      || (/^gesture-recognizer-float16-v1-[a-f0-9]{20}\.task$/.test(file) && file !== modelName)) {
      await rm(join(destination, file));
    }
  }
  return { manifest, bytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareHandTracking().then(({ bytes }) => {
    console.log('Prepared opt-in local hand tracking: ' + (bytes / 1024 / 1024).toFixed(2) + ' MiB; model SHA-256 verified.');
  }).catch(error => {
    console.error('Hand-tracking preparation failed: ' + error.message);
    process.exitCode = 1;
  });
}
