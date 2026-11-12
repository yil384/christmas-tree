import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { assetUrl, type Photo } from '../lib/content';
import { constrainPhotoView, getPhotoViewMetrics, pinchPhoto, zoomPhotoAt } from '../lib/photo-viewer';
import type { PhotoViewPoint, PhotoViewTransform } from '../lib/photo-viewer';
import { Icon } from './Icon';
import './PhotoViewer.css';

const REST: PhotoViewTransform = { scale: 1, x: 0, y: 0 };

/** Only the selected full-size image is mounted and fetched. */
export default function PhotoViewer({ photo, onStep }: { photo: Photo; onStep?: (direction: number) => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [view, setView] = useState<PhotoViewTransform>(REST);
  const viewRef = useRef(view);
  const metrics = getPhotoViewMetrics(photo.width, photo.height, viewport.width, viewport.height);
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const pointers = useRef(new Map<number, PhotoViewPoint>());
  const gesture = useRef<{ start: PhotoViewPoint; at: number; moved: boolean; multi: boolean; type: string } | null>(null);
  const lastTap = useRef<{ point: PhotoViewPoint; at: number } | null>(null);
  const lastPointerType = useRef('mouse');
  const imageUrl = new URL(assetUrl(photo.src), window.location.href);
  if (attempt) imageUrl.searchParams.set('retry', String(attempt));

  const update = useCallback((next: PhotoViewTransform) => {
    const bounded = constrainPhotoView(metricsRef.current, next);
    viewRef.current = bounded;
    setView(previous => previous.scale === bounded.scale && previous.x === bounded.x && previous.y === bounded.y ? previous : bounded);
  }, []);

  useLayoutEffect(() => {
    const element = surface.current;
    if (!element) return;
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useLayoutEffect(() => { update(viewRef.current); }, [metrics.width, metrics.height, metrics.maxScale, update]);

  const zoomTo = useCallback((scale: number, point: PhotoViewPoint = { x: 0, y: 0 }) => {
    update(zoomPhotoAt(metricsRef.current, viewRef.current, scale, point));
  }, [update]);

  const localPoint = (point: { clientX: number; clientY: number }): PhotoViewPoint => {
    const rect = surface.current!.getBoundingClientRect();
    return { x: point.clientX - rect.left - rect.width / 2, y: point.clientY - rect.top - rect.height / 2 };
  };
  const toggleZoom = (point: PhotoViewPoint) => {
    if (viewRef.current.scale > 1.01) update(REST);
    else zoomTo(Math.min(3, metricsRef.current.maxScale), point);
  };

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    let safariGestureActive = false;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (safariGestureActive) return;
      lastTap.current = null;
      const rect = element.getBoundingClientRect();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const factor = Math.exp(-Math.max(-600, Math.min(600, event.deltaY * units)) * 0.002);
      zoomTo(viewRef.current.scale * factor, { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 });
    };
    let gestureScale = 1;
    const startGesture = (event: Event) => { event.preventDefault(); gestureScale = 1; safariGestureActive = true; lastTap.current = null; };
    const changeGesture = (event: Event) => {
      event.preventDefault();
      const gestureEvent = event as Event & { scale?: number; clientX?: number; clientY?: number };
      const scale = gestureEvent.scale ?? 1;
      if (!Number.isFinite(scale) || scale <= 0) return;
      if (pointers.current.size < 2) {
        const rect = element.getBoundingClientRect();
        const anchor = {
          x: gestureEvent.clientX === undefined ? 0 : gestureEvent.clientX - rect.left - rect.width / 2,
          y: gestureEvent.clientY === undefined ? 0 : gestureEvent.clientY - rect.top - rect.height / 2,
        };
        zoomTo(viewRef.current.scale * scale / gestureScale, anchor);
      }
      gestureScale = scale;
    };
    const endGesture = (event: Event) => { event.preventDefault(); safariGestureActive = false; };
    // A native non-passive listener also handles Safari trackpad pinch-wheel.
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('gesturestart', startGesture, { passive: false });
    element.addEventListener('gesturechange', changeGesture, { passive: false });
    element.addEventListener('gestureend', endGesture, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('gesturestart', startGesture);
      element.removeEventListener('gesturechange', changeGesture);
      element.removeEventListener('gestureend', endGesture);
    };
  }, [zoomTo]);

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancelled && gesture.current) gesture.current.multi = true;
    if (pointers.current.size) return;
    const completed = gesture.current;
    gesture.current = null;
    if (!completed || cancelled || completed.multi) { lastTap.current = null; return; }
    const end = localPoint(event);
    const dx = end.x - completed.start.x;
    const dy = end.y - completed.start.y;
    const elapsed = performance.now() - completed.at;
    if (completed.type === 'touch' && viewRef.current.scale <= 1.01 && elapsed < 1000
      && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      lastTap.current = null;
      onStep?.(dx < 0 ? 1 : -1);
      return;
    }
    if (completed.type !== 'touch' || completed.moved || Math.hypot(dx, dy) > 8 || elapsed > 400) return;
    const previous = lastTap.current;
    const now = performance.now();
    if (previous && now - previous.at < 330 && Math.hypot(end.x - previous.point.x, end.y - previous.point.y) < 32) {
      lastTap.current = null;
      toggleZoom(end);
    } else lastTap.current = { point: end, at: now };
  };

  const zoomed = view.scale > 1.01;
  const percent = Math.round(view.scale / metrics.maxScale * 100);

  return <div className="photo-viewer">
    <div className="gallery-photo">
      <div ref={surface} className={`photo-viewport${zoomed ? ' is-zoomed' : ''}`} tabIndex={0} role="region"
        aria-label="高清照片。滚轮、双击或双指缩放，放大后拖动查看。" data-photo-scale={view.scale.toFixed(3)}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = localPoint(event);
          pointers.current.set(event.pointerId, point);
          lastPointerType.current = event.pointerType;
          if (pointers.current.size === 1) gesture.current = { start: point, at: performance.now(), moved: false, multi: false, type: event.pointerType };
          else if (gesture.current) { gesture.current.multi = true; lastTap.current = null; }
        }}
        onPointerMove={event => {
          const previous = pointers.current.get(event.pointerId);
          if (!previous) return;
          const before = [...pointers.current.values()];
          const point = localPoint(event);
          pointers.current.set(event.pointerId, point);
          const after = [...pointers.current.values()];
          if (gesture.current && Math.hypot(point.x - gesture.current.start.x, point.y - gesture.current.start.y) > 8) {
            gesture.current.moved = true;
            lastTap.current = null;
          }
          if (before.length === 2 && after.length === 2) {
            const distance = Math.hypot(before[1].x - before[0].x, before[1].y - before[0].y);
            const nextDistance = Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y);
            if (distance > 0 && nextDistance > 0) update(pinchPhoto(metricsRef.current, viewRef.current,
              { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 },
              { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 }, nextDistance / distance));
          } else if (after.length === 1) {
            update({ ...viewRef.current, x: viewRef.current.x + point.x - previous.x, y: viewRef.current.y + point.y - previous.y });
          }
        }}
        onPointerUp={event => finishPointer(event)}
        onPointerCancel={event => finishPointer(event, true)}
        onLostPointerCapture={event => finishPointer(event, true)}
        onDoubleClick={event => { if (lastPointerType.current !== 'touch') { event.preventDefault(); toggleZoom(localPoint(event)); } }}
        onKeyDown={event => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          if (!['+', '=', '-', '0', '1', 'Home'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === '0' || event.key === 'Home') update(REST);
          else zoomTo(event.key === '1' ? metrics.maxScale : viewRef.current.scale * (event.key === '-' ? 1 / 1.5 : 1.5));
        }}>
        {status === 'loading' && <div className="photo-loading" role="status">正在加载高清照片…</div>}
        {status === 'error' ? <div className="photo-error" role="status">
          <Icon name="photos" /><p>这张照片暂时没打开。</p>
          <button type="button" className="more-photos" onPointerDown={event => event.stopPropagation()}
            onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>再试一次</button>
        </div> : <img key={attempt} className="gallery-image" src={imageUrl.href} width={photo.width} height={photo.height}
          alt={photo.alt || '照片'} decoding="async" draggable={false} aria-busy={status === 'loading'}
          style={{ width: metrics.fittedWidth, height: metrics.fittedHeight, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
      </div>
      {onStep && <>
        <button type="button" className="gallery-nav previous" aria-label="上一张照片" onClick={() => onStep(-1)}><Icon name="left" /></button>
        <button type="button" className="gallery-nav next" aria-label="下一张照片" onClick={() => onStep(1)}><Icon name="left" /></button>
      </>}
    </div>
    <div className="photo-viewer-toolbar" aria-label="照片缩放">
      <div className="photo-zoom-buttons">
        <button type="button" aria-label="缩小照片" title="缩小照片" disabled={view.scale <= 1.001} onClick={() => zoomTo(viewRef.current.scale / 1.5)}>−</button>
        <output aria-label="相对原始尺寸">{percent}%</output>
        <button type="button" aria-label="放大照片" title="放大照片" disabled={view.scale >= metrics.maxScale - 0.001} onClick={() => zoomTo(viewRef.current.scale * 1.5)}>+</button>
      </div>
      <button type="button" className="photo-size-button" onClick={() => zoomTo(metrics.maxScale)}>原始尺寸</button>
      <button type="button" className="photo-size-button" onClick={() => update(REST)}>还原</button>
      <span className="photo-native-size">{photo.width} × {photo.height}</span>
    </div>
    <p className="photo-viewer-tip">滚轮 / 双击 / 双指放大，拖动查看细节</p>
  </div>;
}
