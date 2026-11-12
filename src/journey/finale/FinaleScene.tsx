import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, DirectionalLight, PerspectiveCamera,
  PMREMGenerator, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import type { WebGLRenderTarget } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FINALE_DURATION } from '../rideSequenceConfig';
import { clamp } from './finaleScore';
import { FINALE_CAMERA_Z, FINALE_FOV, FINALE_SOURCE_ASPECT, makeFinaleWorld } from './finaleRuntime';
import type { FinaleSceneProps } from './finaleTypes';

export type { FinaleSceneProps } from './finaleTypes';

/** A real 3D performance above the unchanged palace plate. No sound or UI is added here. */
export default function FinaleScene(props: FinaleSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef(props);
  settings.current = props;
  const clock = useRef({ time: clamp(props.totalTime, 0, FINALE_DURATION), stamp: 0, playing: props.playing });
  const runtimeRef = useRef<{ invalidate: () => void; clearInteractive: () => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLRenderer | undefined;
    let environment: WebGLRenderTarget | undefined;
    let world: ReturnType<typeof makeFinaleWorld> | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    let failed = false;
    let visible = !document.hidden;
    let frame = 0;
    let lastFrame = 0;
    let width = 0;
    let height = 0;
    let lastBurstId: number | undefined;
    let notifiedEnd = false;
    let initializationStage = 'creating-context';
    let renderedFrames = 0;
    canvas.dataset.finaleRenderer = 'initializing';
    canvas.dataset.finaleStage = initializationStage;
    canvas.dataset.finaleFrameCount = '0';
    delete canvas.dataset.finaleError;
    delete canvas.dataset.finaleFailureStage;
    const stage = (value: string) => {
      if (failed) return;
      initializationStage = value; canvas.dataset.finaleStage = value;
    };
    const scene = new Scene();
    const camera = new PerspectiveCamera(FINALE_FOV, 1, .1, 90);
    camera.position.set(0, 0, FINALE_CAMERA_Z);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();

    const unavailable = (reason: unknown = 'WebGL rendering became unavailable') => {
      if (failed || disposed) return;
      failed = true; cancelAnimationFrame(frame); frame = 0;
      const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
      canvas.dataset.finaleRenderer = 'unavailable';
      canvas.dataset.finaleFailureStage = initializationStage;
      canvas.dataset.finaleError = message.slice(0, 1400);
      if (import.meta.env.DEV) console.warn(`[FinaleScene:${initializationStage}] ${message}`);
      settings.current.onUnavailable?.();
    };
    const draw = (now: number) => {
      frame = 0;
      if (disposed || failed || !visible || !renderer || !world) return;
      const interval = lastFrame ? now - lastFrame : 34;
      if (interval < 1000 / 30 - .5) { frame = requestAnimationFrame(draw); return; }
      lastFrame = now;
      const playing = settings.current.playing;
      const anchor = clock.current;
      // The parent publishes at 10 Hz. Interpolate just that interval, never run
      // a competing long-duration clock if parent playback stops publishing.
      const interpolation = playing && anchor.playing ? Math.min(.2, Math.max(0, (now - anchor.stamp) / 1000)) : 0;
      const time = clamp(anchor.time + interpolation, 0, FINALE_DURATION);
      const burst = settings.current.burst;
      if (playing && burst && burst.id !== lastBurstId) {
        lastBurstId = burst.id; world.emit(burst);
      }
      const alive = world.render(time, playing ? Math.min(interval / 1000, .07) : 0, settings.current.reducedMotion);
      if (width > 0 && height > 0) {
        try {
          stage('drawing');
          renderer.render(scene, camera);
          if (failed) return;
          renderedFrames++;
          canvas.dataset.finaleRenderer = playing ? 'running' : 'paused';
          canvas.dataset.finaleFrameCount = String(renderedFrames);
          canvas.dataset.finaleRenderTime = time.toFixed(3);
        } catch (error) { unavailable(error); return; }
      }
      if (settings.current.totalTime < FINALE_DURATION - .5) notifiedEnd = false;
      if (!notifiedEnd && settings.current.totalTime >= FINALE_DURATION) {
        notifiedEnd = true; settings.current.onEnd?.();
      }
      if (playing && (time < FINALE_DURATION || alive)) frame = requestAnimationFrame(draw);
    };
    const invalidate = () => {
      if (!visible || disposed || failed) { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; return; }
      // Paused seeks paint exactly one frame; they never start an animation loop.
      if (!frame) { lastFrame = 0; frame = requestAnimationFrame(draw); }
    };
    const measure = () => {
      if (!renderer || failed || disposed) return;
      const rect = canvas.getBoundingClientRect();
      width = Math.round(rect.width); height = Math.round(rect.height);
      canvas.dataset.finaleCssSize = `${width}x${height}`;
      if (width <= 0 || height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
      canvas.dataset.finaleBufferSize = `${canvas.width}x${canvas.height}`;
      camera.aspect = width / height;
      // Match object-fit: cover, including a short landscape viewport. This is
      // camera framing only: the photographic plate is never transformed.
      const crop = Math.min(1, FINALE_SOURCE_ASPECT / camera.aspect);
      camera.fov = 2 * Math.atan(Math.tan(FINALE_FOV * Math.PI / 360) * crop) * 180 / Math.PI;
      camera.updateProjectionMatrix(); world?.setDpr(dpr); invalidate();
    };
    const onVisibility = () => {
      visible = !document.hidden; lastFrame = 0;
      if (!visible) { cancelAnimationFrame(frame); frame = 0; }
      else invalidate();
    };
    const onContextLost = (event: Event) => { event.preventDefault(); stage('context-lost'); unavailable('The WebGL context was lost'); };

    try {
      const context = canvas.getContext('webgl2', {
        alpha: true, antialias: true, premultipliedAlpha: true,
        powerPreference: 'low-power', preserveDrawingBuffer: false,
      });
      if (!context) { unavailable('canvas.getContext("webgl2") returned null'); return; }
      stage('creating-renderer');
      renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
      renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
        const details = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n');
        unavailable(`Shader compilation failed: ${details}`);
      };
      renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = .92;
      stage('creating-environment');
      const room = new RoomEnvironment(); const pmrem = new PMREMGenerator(renderer);
      try {
        environment = pmrem.fromScene(room, .12);
        scene.environment = environment.texture; scene.environmentIntensity = .48;
      } finally { room.dispose(); pmrem.dispose(); }
      scene.add(new AmbientLight('#dce8ff', .7));
      const key = new DirectionalLight('#ffdfae', 1.7);
      key.position.set(-3, 7, 8); scene.add(key);
      const moon = new DirectionalLight('#dce8ff', .9);
      moon.position.set(6, 9, -6); scene.add(moon);
      stage('creating-world');
      world = makeFinaleWorld(camera); scene.add(world.object);
      runtimeRef.current = { invalidate, clearInteractive: () => world?.clearInteractive() };
      stage('measuring');
      observer = new ResizeObserver(measure); observer.observe(canvas);
      window.addEventListener('resize', measure, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      measure();
    } catch (error) { unavailable(error); }

    return () => {
      disposed = true; runtimeRef.current = null;
      cancelAnimationFrame(frame); observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      world?.dispose(); environment?.dispose(); scene.clear(); renderer?.dispose();
    };
  }, []);

  useEffect(() => {
    const now = performance.now();
    const previous = clock.current;
    const expected = previous.time + (previous.playing ? Math.min(.2, (now - previous.stamp) / 1000) : 0);
    if (Math.abs(props.totalTime - expected) > .65) runtimeRef.current?.clearInteractive();
    clock.current = { time: clamp(props.totalTime, 0, FINALE_DURATION), stamp: now, playing: props.playing };
    runtimeRef.current?.invalidate();
  }, [props.totalTime, props.playing]);

  useEffect(() => { runtimeRef.current?.invalidate(); }, [props.burst, props.reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
