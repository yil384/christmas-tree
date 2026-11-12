import { useEffect, useRef } from 'react';
import type { RideBurst } from './rideTypes';
import { FINALE_DURATION } from './rideSequenceConfig';
import { clamp } from './finale/finaleScore';
import { makeCanvasFinale } from './finale/canvasFinaleRuntime';

/** The complete authored show remains available when WebGL is unavailable. */
export default function RideFinaleFallback(props: {
  time: number; active: boolean; reducedMotion: boolean; burst?: RideBurst;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef(props); settings.current = props;
  const anchor = useRef({ time: clamp(props.time, 0, FINALE_DURATION), stamp: 0, active: props.active });
  const runtimeRef = useRef<{ invalidate: () => void; clearInteractive: () => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;
    const world = makeCanvasFinale(canvas, context);
    let visible = !document.hidden;
    let disposed = false;
    let frame = 0;
    let lastFrame = 0;
    let renderedFrames = 0;
    let lastBurst: number | undefined;
    canvas.dataset.finaleRenderer = 'canvas2d';
    canvas.dataset.finaleFrameCount = '0';

    const draw = (now: number) => {
      frame = 0;
      if (disposed || !visible) return;
      const interval = lastFrame ? now - lastFrame : 34;
      if (interval < 1000 / 30 - .5) { frame = requestAnimationFrame(draw); return; }
      lastFrame = now;
      const { active, reducedMotion, burst } = settings.current;
      const clock = anchor.current;
      const interpolation = active && clock.active ? Math.min(.2, Math.max(0, (now - clock.stamp) / 1000)) : 0;
      const time = clamp(clock.time + interpolation, 0, FINALE_DURATION);
      if (active && burst && burst.id !== lastBurst) { lastBurst = burst.id; world.emit(burst); }
      const alive = world.render(time, active ? Math.min(interval / 1000, .07) : 0, reducedMotion);
      renderedFrames++;
      canvas.dataset.finaleRenderTime = time.toFixed(3);
      canvas.dataset.finaleFrameCount = String(renderedFrames);
      canvas.dataset.finalePlayback = active ? 'playing' : 'paused';
      if (active && (time < FINALE_DURATION || alive)) frame = requestAnimationFrame(draw);
    };
    const invalidate = () => {
      if (!visible || disposed) { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; return; }
      // A paused seek or resize paints one exact frame, without running a clock.
      if (!frame) { lastFrame = 0; frame = requestAnimationFrame(draw); }
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      world.resize(rect.width, rect.height, dpr);
      canvas.dataset.finaleBufferSize = `${canvas.width}x${canvas.height}`;
      invalidate();
    };
    const onVisibility = () => {
      visible = !document.hidden; lastFrame = 0;
      if (!visible) { cancelAnimationFrame(frame); frame = 0; }
      else invalidate();
    };
    runtimeRef.current = { invalidate, clearInteractive: () => world.clearInteractive() };
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', resize, { passive: true });
    resize();
    return () => {
      disposed = true; runtimeRef.current = null;
      cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize); world.dispose();
    };
  }, []);

  useEffect(() => {
    const now = performance.now(); const previous = anchor.current;
    const expected = previous.time + (previous.active ? Math.min(.2, Math.max(0, (now - previous.stamp) / 1000)) : 0);
    if (Math.abs(props.time - expected) > .65) runtimeRef.current?.clearInteractive();
    anchor.current = { time: clamp(props.time, 0, FINALE_DURATION), stamp: now, active: props.active };
    runtimeRef.current?.invalidate();
  }, [props.time, props.active]);

  useEffect(() => { runtimeRef.current?.invalidate(); }, [props.burst, props.reducedMotion]);

  return <canvas ref={canvasRef} className="ride-magic-canvas" aria-hidden="true"
    style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
