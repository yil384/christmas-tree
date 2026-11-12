export interface PhotoViewTransform { scale: number; x: number; y: number; }
export interface PhotoViewPoint { x: number; y: number; }

/** Fit without enlarging small originals; the upper limit is the native size. */
export function getPhotoViewMetrics(imageWidth: number, imageHeight: number, width: number, height: number) {
  const finiteSize = (value: number) => Number.isFinite(value) && value > 0 ? value : 1;
  const sourceWidth = finiteSize(imageWidth);
  const sourceHeight = finiteSize(imageHeight);
  const viewportWidth = finiteSize(width);
  const viewportHeight = finiteSize(height);
  const fit = Math.min(1, viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  return {
    width: viewportWidth,
    height: viewportHeight,
    fittedWidth: sourceWidth * fit,
    fittedHeight: sourceHeight * fit,
    maxScale: 1 / fit,
  };
}

export type PhotoViewMetrics = ReturnType<typeof getPhotoViewMetrics>;

export function constrainPhotoView(metrics: PhotoViewMetrics, transform: PhotoViewTransform): PhotoViewTransform {
  const finite = (value: number) => Number.isFinite(value) ? value : 0;
  const scale = Math.max(1, Math.min(metrics.maxScale, finite(transform.scale)));
  const limitX = Math.max(0, (metrics.fittedWidth * scale - metrics.width) / 2);
  const limitY = Math.max(0, (metrics.fittedHeight * scale - metrics.height) / 2);
  return {
    scale,
    x: Math.max(-limitX, Math.min(limitX, finite(transform.x))) || 0,
    y: Math.max(-limitY, Math.min(limitY, finite(transform.y))) || 0,
  };
}

/** Keep the pixel under the pointer/finger in place while changing scale. */
export function zoomPhotoAt(metrics: PhotoViewMetrics, current: PhotoViewTransform, requestedScale: number, anchor: PhotoViewPoint): PhotoViewTransform {
  const scale = constrainPhotoView(metrics, { ...current, scale: requestedScale }).scale;
  const ratio = scale / current.scale;
  return constrainPhotoView(metrics, {
    scale,
    x: anchor.x - (anchor.x - current.x) * ratio,
    y: anchor.y - (anchor.y - current.y) * ratio,
  });
}

/** A pinch can translate and change scale in the same input frame. */
export function pinchPhoto(metrics: PhotoViewMetrics, current: PhotoViewTransform, previousCenter: PhotoViewPoint, center: PhotoViewPoint, factor: number): PhotoViewTransform {
  const scale = constrainPhotoView(metrics, { ...current, scale: current.scale * factor }).scale;
  const ratio = scale / current.scale;
  return constrainPhotoView(metrics, {
    scale,
    x: center.x - (previousCenter.x - current.x) * ratio,
    y: center.y - (previousCenter.y - current.y) * ratio,
  });
}
