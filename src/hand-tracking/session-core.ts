import {
  HandTrackingError,
  cameraError,
  type HandTrackingDependencies,
  type HandTrackingOptions,
  type HandTrackingSession,
  type HandWorkerReply,
} from './types';

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'user' },
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 24, max: 30 },
  },
};

export const MODEL_TIMEOUT_MS = 45_000;
export const FRAME_TIMEOUT_MS = 8_000;
export const MAX_FRAME_AGE_MS = 500;

interface Flight { id: number; timestamp: number; timeout: number }
interface Run {
  abort: AbortController;
  timers: Set<number>;
  stream?: MediaStream;
  worker?: Worker;
  unlistenExit?: () => void;
  unlistenTracks?: () => void;
  promise: Promise<void>;
  running: boolean;
  flight?: Flight;
  sequence: number;
  lastVideoTime: number;
  lastVideoActivityAt: number;
  nextCaptureAt: number;
  averageCost: number;
  interval: number;
}

const cancelled = () => new DOMException('Hand tracking was stopped.', 'AbortError');
const stopTracks = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop());

export function createSessionWithDependencies(
  options: HandTrackingOptions,
  dependencies: HandTrackingDependencies,
): HandTrackingSession {
  const { video } = options;
  let current: Run | null = null;
  const active = (run: Run) => current === run && !run.abort.signal.aborted;

  function setTimer(run: Run, callback: () => void, delay: number) {
    const timer = dependencies.setTimer(() => {
      run.timers.delete(timer);
      if (active(run)) callback();
    }, Math.max(0, delay));
    run.timers.add(timer);
    return timer;
  }

  function clearTimer(run: Run, timer: number) {
    dependencies.clearTimer(timer);
    run.timers.delete(timer);
  }

  /** Cancels the wait even when the browser's permission prompt cannot itself be cancelled. */
  function waitFor<T>(run: Run, promise: Promise<T>, timeout?: number, error?: HandTrackingError): Promise<T> {
    return new Promise((resolve, reject) => {
      let timer: number | undefined;
      const cleanup = () => {
        if (timer !== undefined) clearTimer(run, timer);
        run.abort.signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => { cleanup(); reject(cancelled()); };
      if (!active(run)) {
        // Observe a late rejection, as well as resolving the cancellation promptly.
        void promise.catch(() => undefined);
        reject(cancelled());
        return;
      }
      run.abort.signal.addEventListener('abort', onAbort, { once: true });
      if (timeout !== undefined) {
        timer = setTimer(run, () => { cleanup(); reject(error ?? new HandTrackingError('tracking-failed')); }, timeout);
      }
      promise.then(value => { cleanup(); resolve(value); }, failure => { cleanup(); reject(failure); });
    });
  }

  function release(run: Run) {
    run.abort.abort();
    run.unlistenExit?.();
    run.unlistenTracks?.();
    for (const timer of run.timers) dependencies.clearTimer(timer);
    run.timers.clear();
    if (run.worker) {
      run.worker.onmessage = null;
      run.worker.onerror = null;
      run.worker.onmessageerror = null;
      // Termination also cancels pending model fetch/compilation and releases the WASM heap.
      run.worker.terminate();
      run.worker = undefined;
    }
    if (run.stream) {
      stopTracks(run.stream);
      if (video.srcObject === run.stream) {
        video.pause();
        video.srcObject = null;
      }
    }
    run.flight = undefined;
  }

  function stopRun(run: Run, message = '摄像头已关闭') {
    if (!active(run)) return;
    current = null;
    release(run);
    options.onFrame({ timestamp: dependencies.now(), hands: [] });
    options.onStatus?.('stopped', message);
  }

  function fail(run: Run, error: HandTrackingError) {
    if (!active(run)) return;
    current = null;
    release(run);
    options.onFrame({ timestamp: dependencies.now(), hands: [] });
    options.onStatus?.('error', error.message);
    options.onError?.(error);
  }

  function schedule(run: Run) {
    if (!active(run) || !run.running || run.flight) return;
    setTimer(run, () => { void capture(run); }, run.nextCaptureAt - dependencies.now());
  }

  function finishFrame(run: Run, message?: Extract<HandWorkerReply, { type: 'result' }>) {
    const flight = run.flight;
    if (!active(run) || !flight) return;
    clearTimer(run, flight.timeout);
    run.flight = undefined;
    const now = dependencies.now();
    const elapsed = Math.max(0, now - flight.timestamp);
    run.averageCost = run.averageCost === 0 ? elapsed : run.averageCost * 0.7 + elapsed * 0.3;
    // A slower device gets breathing room between inferences, never a queue of old frames.
    run.nextCaptureAt = flight.timestamp + Math.max(run.interval, Math.min(500, run.averageCost * 1.5));
    const fresh = message && message.timestamp === flight.timestamp && elapsed <= MAX_FRAME_AGE_MS;
    options.onFrame(fresh ? { timestamp: flight.timestamp, hands: message.hands } : { timestamp: now, hands: [] });
    schedule(run);
  }

  async function capture(run: Run) {
    if (!active(run) || !run.running || run.flight) return;
    const now = dependencies.now();
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || video.currentTime === run.lastVideoTime) {
      if (now - run.lastVideoActivityAt > FRAME_TIMEOUT_MS) {
        fail(run, new HandTrackingError('camera-failed'));
        return;
      }
      run.nextCaptureAt = now + run.interval;
      schedule(run);
      return;
    }
    run.lastVideoTime = video.currentTime;
    run.lastVideoActivityAt = now;
    const flight: Flight = {
      id: ++run.sequence,
      timestamp: now,
      timeout: setTimer(run, () => fail(run, new HandTrackingError('tracking-failed')), FRAME_TIMEOUT_MS),
    };
    // Reserve the one slot BEFORE createImageBitmap resolves, including the capture stage.
    run.flight = flight;
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await dependencies.capture(video);
      if (!active(run) || run.flight !== flight) {
        bitmap.close();
        return;
      }
      if (dependencies.now() - flight.timestamp > MAX_FRAME_AGE_MS) {
        bitmap.close();
        finishFrame(run);
        return;
      }
      run.worker!.postMessage({ type: 'frame', id: flight.id, timestamp: flight.timestamp, bitmap }, [bitmap]);
      // Ownership moved to the worker, which closes it in a finally block.
      bitmap = undefined;
    } catch {
      bitmap?.close();
      fail(run, new HandTrackingError('tracking-failed'));
    }
  }

  async function loadWorker(run: Run) {
    let assets;
    try { assets = await dependencies.readAssets(run.abort.signal); }
    catch (error) {
      if (!active(run)) throw cancelled();
      throw error instanceof HandTrackingError ? error : new HandTrackingError('model-load-failed');
    }
    if (!active(run)) throw cancelled();
    let worker: Worker;
    try { worker = dependencies.createWorker(assets.workerUrl); }
    catch { throw new HandTrackingError('unsupported-browser'); }
    run.worker = worker;
    await new Promise<void>((resolve, reject) => {
      const workerFailed = (error: HandTrackingError) => {
        if (!active(run)) return;
        if (run.running) fail(run, error);
        else reject(error);
      };
      worker.onmessage = event => {
        if (!active(run)) return;
        const message = event.data as HandWorkerReply | undefined;
        if (message?.type === 'ready') resolve();
        else if (message?.type === 'error') {
          const code = message.code === 'unsupported-browser' ? 'unsupported-browser' : run.running ? 'tracking-failed' : 'model-load-failed';
          workerFailed(new HandTrackingError(code));
        } else if (message?.type === 'result' && run.running && message.id === run.flight?.id) {
          finishFrame(run, message);
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        workerFailed(new HandTrackingError(run.running ? 'tracking-failed' : 'model-load-failed'));
      };
      worker.onmessageerror = () => workerFailed(new HandTrackingError('tracking-failed'));
      worker.postMessage({ type: 'init', runtimeUrl: assets.runtimeUrl, wasmBaseUrl: assets.wasmBaseUrl, modelUrl: assets.modelUrl });
    });
  }

  async function initialize(run: Run) {
    try {
      if (!dependencies.isSecure()) throw new HandTrackingError('insecure-context');
      if (!dependencies.isSupported()) throw new HandTrackingError('unsupported-browser');
      if (dependencies.isHidden()) { stopRun(run, '页面已离开，摄像头已关闭'); return; }
      run.unlistenExit = dependencies.onExit(message => stopRun(run, message));
      options.onStatus?.('requesting-camera', '等待摄像头授权…');
      const camera = dependencies.requestCamera(CAMERA_CONSTRAINTS).then(stream => {
        // getUserMedia is not abortable. A permission decision after stop must close its tracks.
        if (!active(run)) { stopTracks(stream); throw cancelled(); }
        run.stream = stream;
        return stream;
      });
      const stream = await waitFor(run, camera);
      const tracks = stream.getVideoTracks();
      if (tracks.length === 0 || tracks.every(track => track.readyState === 'ended')) throw new HandTrackingError('camera-ended');
      const ended = () => fail(run, new HandTrackingError('camera-ended'));
      for (const track of tracks) track.addEventListener('ended', ended);
      run.unlistenTracks = () => { for (const track of tracks) track.removeEventListener('ended', ended); };
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;
      await waitFor(run, Promise.resolve(video.play()), 10_000, new HandTrackingError('camera-failed'));
      if (!active(run)) return;
      options.onStatus?.('loading-model', '正在准备手势识别…');
      await waitFor(run, loadWorker(run), MODEL_TIMEOUT_MS, new HandTrackingError('worker-timeout'));
      if (!active(run)) return;
      run.running = true;
      run.lastVideoActivityAt = run.nextCaptureAt = dependencies.now();
      options.onStatus?.('running', '手势魔法已开启');
      schedule(run);
    } catch (error) {
      if (!active(run)) return;
      const friendly = cameraError(error);
      fail(run, friendly);
      throw friendly;
    }
  }

  return {
    start() {
      if (current) return current.promise;
      const run: Run = {
        abort: new AbortController(), timers: new Set(), promise: Promise.resolve(), running: false,
        sequence: 0, lastVideoTime: -1, lastVideoActivityAt: 0, nextCaptureAt: 0, averageCost: 0,
        interval: dependencies.isMobile() ? 100 : 1000 / 15,
      };
      current = run;
      run.promise = initialize(run);
      return run.promise;
    },
    stop() { if (current) stopRun(current); },
  };
}
