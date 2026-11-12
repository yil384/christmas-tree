import { useEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping, AmbientLight, DirectionalLight, PerspectiveCamera,
  PMREMGenerator, Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import type { WebGLRenderTarget } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeRideMagic } from './rideMagicRuntime';
import type { RideMagicSceneProps } from './rideTypes';

/** A transparent, touch-through layer; the movie's own clock never waits for it. */
export default function RideMagicScene(props: RideMagicSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef(props);
  const runtime = useRef<{ invalidate: () => void } | null>(null);
  settings.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLRenderer | undefined;
    let environment: WebGLRenderTarget | undefined;
    let magic: ReturnType<typeof makeRideMagic> | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    let failed = false;
    let visible = !document.hidden;
    let frame = 0;
    let lastFrame = 0;
    let width = 0;
    let height = 0;
    let lastBurstId: number | undefined;
    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.1, 40);
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const unavailable = () => {
      if (failed || disposed) return;
      failed = true;
      cancelAnimationFrame(frame); frame = 0;
      settings.current.onUnavailable?.();
    };
    const draw = (now: number) => {
      frame = 0;
      if (disposed || failed || !visible || !settings.current.active || !renderer || !magic) return;
      const interval = lastFrame ? now - lastFrame : 34;
      if (interval < 1000 / 30 - 0.5) { frame = requestAnimationFrame(draw); return; }
      lastFrame = now;
      const burst = settings.current.burst;
      if (burst && burst.id !== lastBurstId && width > 0 && height > 0) {
        lastBurstId = burst.id;
        magic.emit(burst, camera, settings.current.reducedMotion);
      }
      const moving = magic.tick(Math.min(interval / 1000, 0.07), settings.current.reducedMotion);
      if (width > 0 && height > 0) {
        try { renderer.render(scene, camera); }
        catch { unavailable(); return; }
      }
      if (moving) frame = requestAnimationFrame(draw);
    };
    const invalidate = () => {
      if (!settings.current.active || !visible) {
        cancelAnimationFrame(frame); frame = 0; lastFrame = 0;
      } else if (!frame && !disposed && !failed) {
        lastFrame = 0; frame = requestAnimationFrame(draw);
      }
    };
    const measure = () => {
      if (!renderer || disposed || failed) return;
      const rect = canvas.getBoundingClientRect();
      width = Math.round(rect.width); height = Math.round(rect.height);
      if (width <= 0 || height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix();
      magic?.setDpr(dpr); invalidate();
    };
    const onVisibility = () => { visible = !document.hidden; invalidate(); };
    const onContextLost = (event: Event) => { event.preventDefault(); unavailable(); };

    try {
      const context = canvas.getContext('webgl2', {
        alpha: true, antialias: true, premultipliedAlpha: true,
        powerPreference: 'low-power', preserveDrawingBuffer: false,
      });
      if (!context) { unavailable(); return; }
      renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      const room = new RoomEnvironment();
      const pmrem = new PMREMGenerator(renderer);
      try {
        environment = pmrem.fromScene(room, 0.08);
        scene.environment = environment.texture;
        scene.environmentIntensity = 0.65;
      } finally { room.dispose(); pmrem.dispose(); }
      scene.add(new AmbientLight('#f3e4f3', 1.3));
      const key = new DirectionalLight('#fff0d5', 3.2);
      key.position.set(-3, 5, 5); scene.add(key);
      const rim = new DirectionalLight('#cee4ff', 2.3);
      rim.position.set(3, 1, -2); scene.add(rim);
      magic = makeRideMagic(); scene.add(magic.object);
      runtime.current = { invalidate };
      observer = new ResizeObserver(measure); observer.observe(canvas);
      window.addEventListener('resize', measure, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      measure();
    } catch { unavailable(); }

    return () => {
      disposed = true; runtime.current = null;
      cancelAnimationFrame(frame); observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      magic?.dispose(); environment?.dispose(); scene.clear(); renderer?.dispose();
      // Do not forceContextLoss: React StrictMode can reuse this exact canvas.
    };
  }, []);

  useEffect(() => { runtime.current?.invalidate(); }, [props.active, props.reducedMotion, props.burst]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
