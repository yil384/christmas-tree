import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = async name => ts.transpileModule(await readFile(new URL(name, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const asURL = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const types = asURL(await compile('./types.ts'));
const { createSessionWithDependencies, MODEL_TIMEOUT_MS, FRAME_TIMEOUT_MS } = await import(asURL(
  (await compile('./session-core.ts')).replace("from './types'", 'from ' + JSON.stringify(types)),
));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function stream() {
  const track = new EventTarget();
  track.readyState = 'live';
  track.stops = 0;
  track.stop = () => { track.stops++; track.readyState = 'ended'; };
  track.end = () => { track.readyState = 'ended'; track.dispatchEvent(new Event('ended')); };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}

function harness(t, config = {}) {
  const timers = new Map();
  const cameraRequests = [], workers = [], frames = [], statuses = [], errors = [], captures = [];
  let clock = 0, timerId = 0, exit, assetCalls = 0;
  const video = {
    srcObject: null, readyState: 2, videoWidth: 640, videoHeight: 480,
    get currentTime() { return clock / 1000; },
    play: config.play ?? (() => Promise.resolve()),
    pauses: 0, pause() { this.pauses++; },
  };
  const dependencies = {
    isSecure: () => config.secure !== false,
    isSupported: () => config.supported !== false,
    isHidden: () => config.hidden === true,
    isMobile: () => config.mobile === true,
    now: () => clock,
    requestCamera(constraints) {
      const request = deferred();
      cameraRequests.push({ ...request, constraints });
      return request.promise;
    },
    readAssets(signal) {
      assetCalls++;
      if (config.readAssets) return config.readAssets(signal);
      return Promise.resolve({ workerUrl: '/worker.js', runtimeUrl: '/runtime.js', wasmBaseUrl: '/wasm', modelUrl: '/model.task' });
    },
    createWorker() {
      const worker = {
        posts: [], terminated: 0,
        postMessage(message, transfer) { this.posts.push({ message, transfer }); },
        terminate() { this.terminated++; },
        emit(message) { this.onmessage?.({ data: message }); },
      };
      workers.push(worker);
      return worker;
    },
    capture() {
      const bitmap = { closes: 0, close() { this.closes++; } };
      captures.push(bitmap);
      return config.capture ? config.capture(bitmap) : Promise.resolve(bitmap);
    },
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, { at: clock + delay, callback }); return id; },
    clearTimer(id) { timers.delete(id); },
    onExit(callback) { exit = callback; return () => { exit = undefined; }; },
  };
  const session = createSessionWithDependencies({
    video, onFrame: frame => frames.push(frame), onStatus: (phase, message) => statuses.push({ phase, message }), onError: error => errors.push(error),
  }, dependencies);
  t.after(() => session.stop());
  const advance = async duration => {
    const target = clock + duration;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      clock = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
      await flush();
    }
    clock = target;
    await flush();
  };
  const start = async () => {
    const promise = session.start();
    const media = stream();
    cameraRequests.at(-1).resolve(media);
    await flush();
    workers.at(-1).emit({ type: 'ready' });
    await promise;
    return { media, worker: workers.at(-1) };
  };
  return { session, video, cameraRequests, workers, frames, statuses, errors, captures, timers, advance, start,
    get assetCalls() { return assetCalls; }, leave: () => exit?.('页面已离开，摄像头已关闭') };
}

test('construction is inert; duplicate start shares one camera request and cancellation closes late permission', async t => {
  const h = harness(t);
  assert.equal(h.cameraRequests.length, 0);
  assert.equal(h.assetCalls, 0);
  const first = h.session.start();
  assert.equal(h.session.start(), first);
  assert.equal(h.cameraRequests.length, 1);
  assert.deepEqual(h.cameraRequests[0].constraints, {
    audio: false, video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
  });
  h.session.stop();
  await first;
  const late = stream();
  h.cameraRequests[0].resolve(late);
  await flush();
  assert.equal(late.track.stops, 1);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.assetCalls, 0);
  assert.equal(h.workers.length, 0);
  assert.equal(h.errors.length, 0);
  h.session.stop();
  assert.equal(h.statuses.filter(status => status.phase === 'stopped').length, 1);
});

test('start/stop/start isolates old permission and cannot clear or stop the new camera', async t => {
  const h = harness(t);
  const oldStart = h.session.start();
  h.session.stop();
  await oldStart;
  const { media, worker } = await h.start();
  const oldMedia = stream();
  h.cameraRequests[0].resolve(oldMedia);
  await flush();
  assert.equal(oldMedia.track.stops, 1);
  assert.equal(media.track.stops, 0);
  assert.equal(h.video.srcObject, media);
  assert.equal(worker.terminated, 0);
  h.session.stop();
  assert.equal(media.track.stops, 1);
  assert.equal(worker.terminated, 1);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.timers.size, 0);
});

test('leaving the page during permission cancels the wait and safely closes a later stream', async t => {
  const h = harness(t);
  const starting = h.session.start();
  h.leave();
  await starting;
  const late = stream();
  h.cameraRequests[0].resolve(late);
  await flush();
  assert.equal(late.track.stops, 1);
  assert.equal(h.statuses.at(-1).message, '页面已离开，摄像头已关闭');
  assert.equal(h.workers.length, 0);
});

test('stopping a model download aborts it and prevents a late worker from being constructed', async t => {
  const pending = deferred();
  let signal;
  const h = harness(t, { readAssets: abort => { signal = abort; return pending.promise; } });
  const starting = h.session.start();
  const media = stream();
  h.cameraRequests[0].resolve(media);
  await flush();
  h.session.stop();
  await starting;
  assert.equal(signal.aborted, true);
  pending.resolve({ workerUrl: '/worker.js' });
  await flush();
  assert.equal(h.workers.length, 0);
  assert.equal(media.track.stops, 1);
});

test('one bitmap slot covers capture and inference; mismatched and stale results never control the tree', async t => {
  const pending = deferred();
  const h = harness(t, { capture: bitmap => { pending.bitmap = bitmap; return pending.promise; } });
  const { worker } = await h.start();
  await h.advance(0);
  await h.advance(200);
  assert.equal(h.captures.length, 1, 'capture cannot queue another bitmap while awaiting the first');
  pending.resolve(pending.bitmap);
  await flush();
  const sent = worker.posts.find(post => post.message.type === 'frame');
  assert.equal(sent.transfer[0], pending.bitmap);
  worker.emit({ type: 'result', id: 999, timestamp: 0, hands: [{ gesture: 'Victory' }] });
  await h.advance(400);
  assert.equal(h.captures.length, 1, 'worker inference owns the same one-slot backpressure');
  worker.emit({ type: 'result', id: sent.message.id, timestamp: sent.message.timestamp, duration: 600, hands: [{ gesture: 'Victory' }] });
  assert.deepEqual(h.frames.at(-1).hands, [], 'a 600 ms old pose is discarded and input cleared');
});

test('a bitmap that finishes after stop is explicitly closed and never posted', async t => {
  const pending = deferred();
  const h = harness(t, { capture: bitmap => { pending.bitmap = bitmap; return pending.promise; } });
  const { worker } = await h.start();
  await h.advance(0);
  h.session.stop();
  pending.resolve(pending.bitmap);
  await flush();
  assert.equal(pending.bitmap.closes, 1);
  assert.equal(worker.posts.filter(post => post.message.type === 'frame').length, 0);
  assert.equal(worker.terminated, 1);
});

for (const [mobile, period] of [[false, 1000 / 15], [true, 100]]) {
  test(`inference is limited to ${mobile ? '10' : '15'} fps with fast recognizer results`, async t => {
    const h = harness(t, { mobile });
    const { worker } = await h.start();
    await h.advance(0);
    const first = worker.posts.find(post => post.message.type === 'frame').message;
    worker.emit({ type: 'result', id: first.id, timestamp: first.timestamp, duration: 0, hands: [] });
    await h.advance(period - 0.1);
    assert.equal(h.captures.length, 1);
    await h.advance(0.2);
    assert.equal(h.captures.length, 2);
  });
}

test('worker readiness timeout closes the camera and reports a localized startup error', async t => {
  const h = harness(t);
  const outcome = h.session.start().catch(error => error);
  const media = stream();
  h.cameraRequests[0].resolve(media);
  await flush();
  await h.advance(MODEL_TIMEOUT_MS + 1);
  const error = await outcome;
  assert.equal(error.code, 'worker-timeout');
  assert.match(error.message, /摄像头已关闭/);
  assert.equal(media.track.stops, 1);
  assert.equal(h.workers[0].terminated, 1);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.timers.size, 0);
});

test('200 ms inference leaves 100 ms breathing room and uses a 300 ms capture cadence', async t => {
  const h = harness(t);
  const { worker } = await h.start();
  await h.advance(0);
  const first = worker.posts.find(post => post.message.type === 'frame').message;
  await h.advance(200);
  worker.emit({ type: 'result', id: first.id, timestamp: first.timestamp, duration: 200, hands: [] });
  await h.advance(99);
  assert.equal(h.captures.length, 1);
  await h.advance(1);
  assert.equal(h.captures.length, 2);
  assert.equal(worker.posts.at(-1).message.timestamp, 300);
});

test('adaptive capture interval stays within the gesture interpreter continuity window', async t => {
  const h = harness(t);
  const { worker } = await h.start();
  await h.advance(0);
  const first = worker.posts.find(post => post.message.type === 'frame').message;
  await h.advance(400);
  worker.emit({ type: 'result', id: first.id, timestamp: first.timestamp, duration: 400, hands: [] });
  await h.advance(100);
  assert.equal(h.captures.length, 2);
  assert.equal(worker.posts.at(-1).message.timestamp, 500, 'adaptive delay is capped at 500 ms');
});

test('a stalled inference has a finite timeout and stops all resources', async t => {
  const h = harness(t);
  const { media, worker } = await h.start();
  await h.advance(0);
  await h.advance(FRAME_TIMEOUT_MS + 1);
  assert.equal(h.errors.at(-1).code, 'tracking-failed');
  assert.equal(media.track.stops, 1);
  assert.equal(worker.terminated, 1);
  assert.equal(h.timers.size, 0);
});

test('external track end closes recognition and leaving the page never auto-reopens it', async t => {
  const h = harness(t);
  const { media, worker } = await h.start();
  media.track.end();
  assert.equal(h.errors.at(-1).code, 'camera-ended');
  assert.equal(worker.terminated, 1);
  assert.equal(h.video.srcObject, null);
  h.leave();
  await h.advance(5000);
  assert.equal(h.cameraRequests.length, 1);
});

for (const [setting, code] of [['secure', 'insecure-context'], ['supported', 'unsupported-browser']]) {
  test(`${code} fails before permission or model requests`, async t => {
    const h = harness(t, { [setting]: false });
    await assert.rejects(h.session.start(), error => error.code === code);
    assert.equal(h.cameraRequests.length, 0);
    assert.equal(h.assetCalls, 0);
  });
}

for (const [name, code] of [['NotAllowedError', 'permission-denied'], ['NotFoundError', 'camera-not-found'], ['NotReadableError', 'camera-busy']]) {
  test(`camera ${name} has a friendly message without loading the model`, async t => {
    const h = harness(t);
    const starting = h.session.start();
    h.cameraRequests[0].reject(new DOMException('browser detail', name));
    await assert.rejects(starting, error => error.code === code && !error.message.includes('browser detail'));
    assert.equal(h.assetCalls, 0);
  });
}
