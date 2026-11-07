/* Classic worker: copied, content-hashed and self-hosted by prepare-hand-tracking.mjs. */
'use strict';

(() => {
  const assetRoot = new URL('./', self.location.href);
  const nativeFetch = self.fetch.bind(self);
  const nativeImportScripts = self.importScripts.bind(self);

  function assetURL(value) {
    const url = new URL(String(value), assetRoot);
    if (url.origin !== assetRoot.origin || !url.pathname.startsWith(assetRoot.pathname)
      || url.pathname.slice(assetRoot.pathname.length).includes('%')
      || url.search || url.hash || url.username || url.password) {
      throw new TypeError('Hand tracking only reads its own local static assets.');
    }
    return url.href;
  }

  // MediaPipe 1.2.2 includes an automatic usage logger. Enforce privacy at the
  // worker boundary before importing it: no external requests, POSTs or telemetry.
  self.fetch = (input, init = {}) => {
    try {
      const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
      if ((init.method ?? request?.method ?? 'GET').toUpperCase() !== 'GET' || init.body != null) {
        throw new TypeError('Hand tracking does not send network data.');
      }
      assetURL(request ? request.url : input);
      return nativeFetch(input, { ...init, credentials: 'omit', mode: 'same-origin', redirect: 'error' });
    } catch (error) { return Promise.reject(error); }
  };
  self.importScripts = (...urls) => nativeImportScripts(...urls.map(assetURL));
  if (typeof self.XMLHttpRequest === 'function') {
    const NativeRequest = self.XMLHttpRequest;
    self.XMLHttpRequest = class LocalAssetRequest extends NativeRequest {
      open(method, url, async = true) {
        if (String(method).toUpperCase() !== 'GET') throw new TypeError('Hand tracking does not send network data.');
        super.open('GET', assetURL(url), async);
      }
    };
  }

  let recognizer = null;
  let initializing = false;
  let disposed = false;

  function normalizedHands(result) {
    const hands = [];
    for (let index = 0; index < Math.min(2, result.landmarks?.length ?? 0); index += 1) {
      const points = result.landmarks[index];
      if (points.length !== 21 || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
      const handedness = result.handedness?.[index]?.[0]?.categoryName;
      const gesture = result.gestures?.[index]?.[0];
      hands.push({
        landmarks: points.map(point => ({
          // Relative image coordinates can legitimately fall just outside the frame.
          // Keep that geometry intact; the gesture interpreter validates partial hands.
          x: point.x, y: point.y,
          ...(Number.isFinite(point.z) ? { z: point.z } : {}),
        })),
        handedness: handedness === 'Left' || handedness === 'Right' ? handedness : 'Unknown',
        gesture: typeof gesture?.categoryName === 'string' ? gesture.categoryName : 'None',
        gestureScore: Number.isFinite(gesture?.score) ? Math.max(0, Math.min(1, gesture.score)) : 0,
      });
    }
    return hands;
  }

  async function initialize(message) {
    if (initializing || recognizer || disposed) return;
    initializing = true;
    let code = 'model-load-failed';
    try {
      if (typeof OffscreenCanvas === 'undefined' || typeof WebAssembly === 'undefined') {
        code = 'unsupported-browser';
        throw new Error('Worker canvas is unavailable.');
      }
      const canvas = new OffscreenCanvas(1, 1);
      // CPU inference still needs MediaPipe's canvas bridge for input pixels.
      if (!(canvas.getContext('webgl2') || canvas.getContext('webgl'))) {
        code = 'unsupported-browser';
        throw new Error('Worker canvas context is unavailable.');
      }
      self.importScripts(assetURL(message.runtimeUrl));
      const fileset = await self.Vision.FilesetResolver.forVisionTasks(assetURL(message.wasmBaseUrl), false);
      const task = await self.Vision.GestureRecognizer.createFromOptions(fileset, {
        canvas,
        baseOptions: { modelAssetPath: assetURL(message.modelUrl), delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
        cannedGesturesClassifierOptions: { scoreThreshold: 0.5 },
      });
      if (disposed) { task.close(); return; }
      recognizer = task;
      self.postMessage({ type: 'ready' });
    } catch {
      if (!disposed) self.postMessage({ type: 'error', code });
    } finally { initializing = false; }
  }

  self.onmessage = event => {
    const message = event.data;
    if (message?.type === 'init') { void initialize(message); return; }
    if (message?.type === 'dispose') {
      disposed = true;
      recognizer?.close();
      recognizer = null;
      return;
    }
    if (message?.type !== 'frame') return;
    const bitmap = message.bitmap;
    try {
      if (disposed) return;
      if (!recognizer || !bitmap || !Number.isFinite(message.timestamp)) throw new Error('Worker is not ready.');
      const started = performance.now();
      const result = recognizer.recognizeForVideo(bitmap, message.timestamp);
      self.postMessage({
        type: 'result', id: message.id, timestamp: message.timestamp,
        duration: performance.now() - started, hands: normalizedHands(result),
      });
    } catch {
      if (!disposed) self.postMessage({ type: 'error', code: 'tracking-failed' });
    } finally {
      bitmap?.close();
    }
  };
})();
