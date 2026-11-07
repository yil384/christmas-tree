import { assetUrl } from '../lib/content';
import { createSessionWithDependencies } from './session-core';
import { HandTrackingError, type HandTrackingAssets, type HandTrackingOptions, type HandTrackingSession } from './types';

export { HandTrackingError } from './types';
export type { HandTrackingPhase, HandTrackingOptions, HandTrackingSession } from './types';

async function readAssets(signal: AbortSignal): Promise<HandTrackingAssets> {
  const base = new URL(assetUrl('generated/hand-tracking/'), window.location.href);
  const response = await fetch(new URL('manifest.json', base), { signal, cache: 'no-cache', credentials: 'same-origin' });
  if (!response.ok) throw new HandTrackingError('model-load-failed');
  const manifest = await response.json();
  if (manifest?.version !== 1 || manifest?.sdkVersion !== '1.2.2') throw new HandTrackingError('model-load-failed');
  const local = (path: unknown) => {
    if (typeof path !== 'string' || !/^[a-zA-Z0-9._/-]+$/.test(path) || path.includes('..')) throw new HandTrackingError('model-load-failed');
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new HandTrackingError('model-load-failed');
    return url.href;
  };
  return {
    workerUrl: local(manifest.worker), runtimeUrl: local(manifest.runtime),
    wasmBaseUrl: local(manifest.wasmBase), modelUrl: local(manifest.model),
  };
}

/** Constructing a session performs no requests and never asks for camera permission. */
export function createHandTrackingSession(options: HandTrackingOptions): HandTrackingSession {
  return createSessionWithDependencies(options, {
    isSecure: () => window.isSecureContext,
    isSupported: () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
      && typeof createImageBitmap === 'function' && typeof WebAssembly !== 'undefined'
      && typeof navigator.mediaDevices?.getUserMedia === 'function',
    isHidden: () => document.visibilityState === 'hidden',
    isMobile: () => window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 700,
    now: () => performance.now(),
    requestCamera: constraints => navigator.mediaDevices.getUserMedia(constraints),
    readAssets,
    // The SDK's IIFE and Emscripten loader use importScripts; deliberately a classic worker.
    createWorker: url => new Worker(url, { name: 'christmas-hand-tracking' }),
    capture: video => {
      const scale = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
      return createImageBitmap(video, {
        resizeWidth: Math.max(1, Math.round(video.videoWidth * scale)),
        resizeHeight: Math.max(1, Math.round(video.videoHeight * scale)),
        resizeQuality: 'low',
      });
    },
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: timer => window.clearTimeout(timer),
    onExit: callback => {
      const hidden = () => { if (document.visibilityState === 'hidden') callback('页面已离开，摄像头已关闭'); };
      const pagehide = () => callback('页面已离开，摄像头已关闭');
      document.addEventListener('visibilitychange', hidden);
      window.addEventListener('pagehide', pagehide);
      return () => {
        document.removeEventListener('visibilitychange', hidden);
        window.removeEventListener('pagehide', pagehide);
      };
    },
  });
}
