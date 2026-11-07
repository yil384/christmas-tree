import type { HandFrame, TrackedHand } from '../lib/hand-types';

export type HandTrackingPhase = 'idle' | 'requesting-camera' | 'loading-model' | 'running' | 'stopped' | 'error';

export type HandTrackingErrorCode =
  | 'insecure-context'
  | 'unsupported-browser'
  | 'permission-denied'
  | 'camera-not-found'
  | 'camera-busy'
  | 'camera-failed'
  | 'camera-ended'
  | 'model-load-failed'
  | 'worker-timeout'
  | 'tracking-failed';

const messages: Record<HandTrackingErrorCode, string> = {
  'insecure-context': '手势魔法需要安全连接，请通过 HTTPS 链接打开这个页面。',
  'unsupported-browser': '当前浏览器暂不支持手势魔法，你仍可用鼠标或触屏操作。',
  'permission-denied': '摄像头权限未开启。你可以在浏览器设置中允许摄像头后重试，或继续用鼠标和触屏操作。',
  'camera-not-found': '没有找到可用的摄像头，你仍可用鼠标或触屏操作。',
  'camera-busy': '摄像头暂时无法使用，可能被其他应用占用。关闭其他摄像头应用后可以重试。',
  'camera-failed': '摄像头未能启动，已停止手势魔法。请检查设备后重试。',
  'camera-ended': '摄像头已断开，手势魔法已停止。',
  'model-load-failed': '手势识别组件加载失败，摄像头已关闭。请检查网络后重试。',
  'worker-timeout': '手势识别启动超时，摄像头已关闭。你可以稍后重试。',
  'tracking-failed': '手势识别暂时中断，摄像头已关闭。你仍可用鼠标或触屏操作。',
};

export class HandTrackingError extends Error {
  readonly code: HandTrackingErrorCode;

  constructor(code: HandTrackingErrorCode, message = messages[code]) {
    super(message);
    this.name = 'HandTrackingError';
    this.code = code;
  }
}

export function cameraError(error: unknown): HandTrackingError {
  if (error instanceof HandTrackingError) return error;
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return new HandTrackingError('permission-denied');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return new HandTrackingError('camera-not-found');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') return new HandTrackingError('camera-busy');
  return new HandTrackingError('camera-failed');
}

export interface HandTrackingOptions {
  video: HTMLVideoElement;
  onFrame: (frame: HandFrame) => void;
  onStatus?: (phase: HandTrackingPhase, message?: string) => void;
  onError?: (error: HandTrackingError) => void;
}

export interface HandTrackingSession {
  /** Resolves when running or cancelled; rejects a reported HandTrackingError on failure. */
  start(): Promise<void>;
  /** Synchronously releases tracks, timers and the worker. Safe to call repeatedly. */
  stop(): void;
}

export interface HandTrackingAssets {
  workerUrl: string;
  runtimeUrl: string;
  wasmBaseUrl: string;
  modelUrl: string;
}

export type HandWorkerReply =
  | { type: 'ready' }
  | { type: 'error'; code: 'unsupported-browser' | 'model-load-failed' | 'tracking-failed' }
  | { type: 'result'; id: number; timestamp: number; duration: number; hands: TrackedHand[] };

/** Browser boundaries are injectable so cancellation and backpressure use real state-machine tests. */
export interface HandTrackingDependencies {
  isSecure(): boolean;
  isSupported(): boolean;
  isHidden(): boolean;
  isMobile(): boolean;
  now(): number;
  requestCamera(constraints: MediaStreamConstraints): Promise<MediaStream>;
  readAssets(signal: AbortSignal): Promise<HandTrackingAssets>;
  createWorker(url: string): Worker;
  capture(video: HTMLVideoElement): Promise<ImageBitmap>;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(timer: number): void;
  onExit(callback: (message: string) => void): () => void;
}
