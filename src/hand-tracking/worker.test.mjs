import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { HAND_MODEL, verifyHandModel } from '../../scripts/prepare-hand-tracking.mjs';

const source = await readFile(new URL('./worker.js', import.meta.url), 'utf8');
const base = 'https://www.weiyirao.com/preview-2026/generated/hand-tracking/';
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const plain = value => JSON.parse(JSON.stringify(value));

function worker(config = {}) {
  const requests = [], imports = [], replies = [], xhr = [], options = [];
  const result = {
    landmarks: [Array.from({ length: 21 }, (_, index) => ({ x: index / 25, y: 0.6, z: -0.05 }))],
    handedness: [[{ categoryName: 'Left' }]], gestures: [[{ categoryName: 'Open_Palm', score: 0.9 }]],
  };
  const task = {
    closes: 0, close() { this.closes++; },
    recognizeForVideo(bitmap, timestamp) {
      assert.ok(bitmap);
      assert.equal(timestamp, 123);
      if (config.inferenceError) throw new Error('recognizer failure');
      return result;
    },
  };
  const sandbox = {
    URL, Request, WebAssembly, TypeError, performance: { now: () => 10 },
    location: { href: base + 'worker-hash.js' },
    fetch: (input, init) => { requests.push({ input, init }); return Promise.resolve(new Response('asset')); },
    importScripts: (...urls) => { imports.push(...urls); },
    XMLHttpRequest: class { open(...args) { xhr.push(args); } },
    OffscreenCanvas: class { getContext() { return config.noCanvas ? null : {}; } },
    postMessage: message => replies.push(plain(message)),
    Vision: {
      FilesetResolver: { forVisionTasks: async (path, module) => { assert.equal(path, base + 'sdk-1.2.2/wasm'); assert.equal(module, false); return {}; } },
      GestureRecognizer: { createFromOptions: async (_, value) => { options.push(value); if (config.modelError) throw new Error('model missing'); return task; } },
    },
  };
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'hand-tracking-worker.js' });
  const initialize = async () => {
    sandbox.onmessage({ data: { type: 'init', runtimeUrl: base + 'sdk-1.2.2/vision_bundle.js', wasmBaseUrl: base + 'sdk-1.2.2/wasm', modelUrl: base + 'model.task' } });
    await flush();
  };
  return { sandbox, requests, imports, replies, xhr, options, result, task, initialize };
}

test('worker fetch allows local GET assets and blocks SDK metrics before native network dispatch', async () => {
  const h = worker();
  await h.sandbox.fetch(base + 'sdk-1.2.2/wasm/vision_wasm_internal.wasm', { credentials: 'include' });
  await h.sandbox.fetch('./sdk-1.2.2/wasm/../vision_bundle.js');
  await h.sandbox.fetch(new Request(base + 'model.task'));
  assert.equal(h.requests.length, 3);
  assert.ok(h.requests.every(request => request.init.credentials === 'omit' && request.init.redirect === 'error' && request.init.mode === 'same-origin'));
  const blocked = [
    ['https://odml.pa.googleapis.com/v1/log', { method: 'POST', body: 'metrics' }],
    ['https://example.org/model.task'],
    [base + 'model.task', { method: 'POST', body: 'frame' }],
    ['../photos/example.webp'],
    ['./%2e%2e/scene.json'],
    [base + 'sdk/..%2f..%2fscene.json'],
    [base + 'model.task?landmarks=private'],
    [base + 'model.task#private'],
    ['//example.org/model.task'],
    ['https://name:password@www.weiyirao.com/preview-2026/generated/hand-tracking/model.task'],
    [new Request(base + 'model.task', { method: 'POST', body: 'metrics' })],
  ];
  for (const [url, init] of blocked) await assert.rejects(h.sandbox.fetch(url, init), TypeError);
  assert.equal(h.requests.length, 3, 'no blocked request reached fetch');
});

test('the actual pinned SDK IIFE exports Vision and resolves classic self-hosted WASM paths', async () => {
  const sdk = await readFile(new URL('../../node_modules/@mediapipe/tasks-vision/vision_bundle.js', import.meta.url), 'utf8');
  const context = vm.createContext({ TextEncoder, TextDecoder });
  context.self = context;
  vm.runInContext(sdk, context, { filename: 'vision_bundle.js' });
  assert.equal(typeof context.Vision.GestureRecognizer.createFromOptions, 'function');
  const files = await context.Vision.FilesetResolver.forVisionTasks(base + 'sdk-1.2.2/wasm', false);
  assert.deepEqual(plain(files), {
    wasmLoaderPath: base + 'sdk-1.2.2/wasm/vision_wasm_internal.js',
    wasmBinaryPath: base + 'sdk-1.2.2/wasm/vision_wasm_internal.wasm',
  });
});

test('XHR and classic imports enforce the same path boundary after URL normalization', () => {
  const h = worker();
  new h.sandbox.XMLHttpRequest().open('get', './sdk-1.2.2/wasm/../vision_bundle.js');
  h.sandbox.importScripts('./sdk-1.2.2/vision_bundle.js');
  assert.equal(h.xhr[0][1], base + 'sdk-1.2.2/vision_bundle.js');
  assert.equal(h.imports[0], base + 'sdk-1.2.2/vision_bundle.js');
  for (const url of ['../elsewhere.js', './%2e%2e/elsewhere.js', 'https://example.org/script.js', './file.js?data=frame', './%2f..%2ffile.js']) {
    assert.throws(() => h.sandbox.importScripts(url), TypeError);
    assert.throws(() => new h.sandbox.XMLHttpRequest().open('GET', url), TypeError);
  }
  assert.throws(() => new h.sandbox.XMLHttpRequest().open('POST', base + 'model.task'), TypeError);
  assert.equal(h.xhr.length, 1);
  assert.equal(h.imports.length, 1);
});

test('worker initializes the CPU/video recognizer and returns normalized unmirrored plain hand frames', async () => {
  const h = worker();
  await h.initialize();
  assert.equal(h.options[0].baseOptions.delegate, 'CPU');
  assert.equal(h.options[0].runningMode, 'VIDEO');
  assert.equal(h.options[0].numHands, 2);
  assert.deepEqual(h.replies, [{ type: 'ready' }]);
  const bitmap = { closes: 0, close() { this.closes++; } };
  h.result.landmarks[0][20].x = -0.12;
  h.result.landmarks[0][20].y = 1.15;
  h.sandbox.onmessage({ data: { type: 'frame', id: 4, timestamp: 123, bitmap } });
  const frame = h.replies.at(-1);
  assert.equal(frame.type, 'result');
  assert.equal(frame.id, 4);
  assert.equal(frame.timestamp, 123);
  assert.equal(frame.hands[0].landmarks.length, 21);
  assert.equal(frame.hands[0].landmarks[0].x, 0, 'inference coordinates must not be mirrored');
  assert.equal(frame.hands[0].landmarks[20].x, -0.12, 'partial-hand geometry must not be distorted by clamping');
  assert.equal(frame.hands[0].landmarks[20].y, 1.15);
  assert.equal(frame.hands[0].handedness, 'Left');
  assert.equal(frame.hands[0].gesture, 'Open_Palm');
  assert.equal(frame.hands[0].gestureScore, 0.9);
  assert.equal(bitmap.closes, 1);
});

test('worker closes the bitmap even if recognition fails', async () => {
  const h = worker({ inferenceError: true });
  await h.initialize();
  const bitmap = { closes: 0, close() { this.closes++; } };
  h.sandbox.onmessage({ data: { type: 'frame', id: 1, timestamp: 123, bitmap } });
  assert.deepEqual(h.replies.at(-1), { type: 'error', code: 'tracking-failed' });
  assert.equal(bitmap.closes, 1);
});

test('unsupported worker canvas and missing models produce distinct startup failures', async () => {
  for (const [config, code] of [[{ noCanvas: true }, 'unsupported-browser'], [{ modelError: true }, 'model-load-failed']]) {
    const h = worker(config);
    await h.initialize();
    assert.deepEqual(h.replies, [{ type: 'error', code }]);
  }
});

test('model preparation refuses data that does not match the pinned checksum', () => {
  assert.throws(() => verifyHandModel(Buffer.from('not the official model')), /SHA-256/);
  assert.throws(() => verifyHandModel(Buffer.alloc(HAND_MODEL.bytes)), /SHA-256/, 'matching size alone must not pass verification');
});
