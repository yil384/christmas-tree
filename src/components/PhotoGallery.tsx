import { useEffect, useRef, useState } from 'react';
import { assetUrl, type Photo } from '../lib/content';
import { Icon } from './Icon';

const PAGE_SIZE = 18;

type PhotoGalleryProps = { photos: Photo[]; initialIndex: number };

function startIndex(index: number, count: number) {
  return Number.isFinite(index) ? Math.max(0, Math.min(Math.trunc(index), count - 1)) : 0;
}

function PhotoImage({ photo }: { photo: Photo }) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const imageUrl = new URL(assetUrl(photo.src), window.location.href);
  if (attempt) imageUrl.searchParams.set('retry', String(attempt));

  if (status === 'error') {
    return (
      <div className="photo-error" role="status">
        <Icon name="photos" />
        <p>这张照片暂时没打开。</p>
        <button type="button" className="more-photos" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>
          再试一次
        </button>
      </div>
    );
  }

  return (
    <img
      key={attempt}
      className="gallery-image"
      src={imageUrl.href}
      width={photo.width}
      height={photo.height}
      alt={photo.alt || '珍藏的照片'}
      decoding="async"
      draggable={false}
      aria-busy={status === 'loading'}
      onLoad={() => setStatus('ready')}
      onError={() => setStatus('error')}
    />
  );
}

function Thumbnail({ photo }: { photo: Photo }) {
  const [failed, setFailed] = useState(false);
  return failed ? <Icon name="photos" /> : (
    <img
      src={assetUrl(photo.thumbnail || photo.src)}
      width={photo.width}
      height={photo.height}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export default function PhotoGallery({ photos, initialIndex }: PhotoGalleryProps) {
  const [index, setIndex] = useState(() => startIndex(initialIndex, photos.length));
  const touch = useRef<{ x: number; y: number; time: number } | null>(null);
  const count = photos.length;
  const currentIndex = count ? ((index % count) + count) % count : 0;

  useEffect(() => { setIndex(startIndex(initialIndex, count)); }, [initialIndex, count]);

  useEffect(() => {
    if (count < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setIndex(value => (value + (event.key === 'ArrowRight' ? 1 : -1) + count) % count);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [count]);

  if (!count) {
    return (
      <div className="panel-state empty-album">
        <Icon name="photos" />
        <h2>留一些位置，给以后的回忆。</h2>
        <p>照片还没挂上来，这棵树已经在等你了。</p>
      </div>
    );
  }

  const photo = photos[currentIndex];
  const page = Math.floor(currentIndex / PAGE_SIZE);
  const pages = Math.ceil(count / PAGE_SIZE);
  const move = (direction: number) => setIndex(value => (value + direction + count) % count);

  return (
    <div className="gallery-content">
      <div className="gallery-header">
        <p className="overline">LITTLE MOMENTS, BIG FEELINGS</p>
        <h2>树上的回忆</h2>
        <span className="gallery-count" aria-live="polite" aria-atomic="true">
          {String(currentIndex + 1).padStart(2, '0')} <i>/ {String(count).padStart(2, '0')}</i>
        </span>
      </div>

      <div
        className="gallery-photo"
        onTouchStart={event => {
          const point = event.touches[0];
          touch.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY, time: Date.now() } : null;
        }}
        onTouchMove={event => { if (event.touches.length !== 1) touch.current = null; }}
        onTouchCancel={() => { touch.current = null; }}
        onTouchEnd={event => {
          const start = touch.current;
          touch.current = null;
          const end = event.changedTouches[0];
          if (!start || !end || count < 2 || Date.now() - start.time > 1000) return;
          const dx = end.clientX - start.x;
          const dy = end.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.25) move(dx < 0 ? 1 : -1);
        }}
      >
        <PhotoImage key={`${photo.id}:${photo.src}`} photo={photo} />
        {count > 1 && <>
          <button type="button" className="gallery-nav previous" aria-label="上一张照片" onClick={() => move(-1)}><Icon name="left" /></button>
          <button type="button" className="gallery-nav next" aria-label="下一张照片" onClick={() => move(1)}><Icon name="left" /></button>
        </>}
      </div>

      <p className="photo-caption">{photo.caption || '一个值得被好好收藏的瞬间。'}<span aria-hidden="true">✧</span></p>

      {count > 1 && <div className="thumbnail-grid" aria-label="选择照片">
        {photos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item, offset) => {
          const photoIndex = page * PAGE_SIZE + offset;
          return (
            <button
              type="button"
              key={item.id}
              className={photoIndex === currentIndex ? 'selected' : undefined}
              aria-label={`查看第 ${photoIndex + 1} 张照片${item.alt ? `：${item.alt}` : ''}`}
              aria-pressed={photoIndex === currentIndex}
              onClick={() => setIndex(photoIndex)}
            >
              <Thumbnail photo={item} />
              <span aria-hidden="true">{String(photoIndex + 1).padStart(2, '0')}</span>
            </button>
          );
        })}
      </div>}

      {pages > 1 && <div className="gallery-pagination" aria-label="照片分页">
        <button type="button" className="more-photos" disabled={page === 0} onClick={() => setIndex((page - 1) * PAGE_SIZE)}>上一组</button>
        <span>{page + 1} / {pages} 组</span>
        <button type="button" className="more-photos" disabled={page === pages - 1} onClick={() => setIndex((page + 1) * PAGE_SIZE)}>下一组</button>
      </div>}
    </div>
  );
}
