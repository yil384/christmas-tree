import { useEffect, useRef, useState } from 'react';
import { assetUrl, type Photo } from '../lib/content';
import { Icon } from './Icon';
import PhotoViewer from './PhotoViewer';

const PAGE_SIZE = 18;

type PhotoGalleryProps = {
  photos: Photo[];
  initialIndex: number;
  handNavigation?: { sequence: number; direction: -1 | 1 };
  handMode?: boolean;
  onCloseHandMode?: () => void;
};

function startIndex(index: number, count: number) {
  return Number.isFinite(index) ? Math.max(0, Math.min(Math.trunc(index), count - 1)) : 0;
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

export default function PhotoGallery({ photos, initialIndex, handNavigation, handMode, onCloseHandMode }: PhotoGalleryProps) {
  const [index, setIndex] = useState(() => startIndex(initialIndex, photos.length));
  const previousNavigation = useRef(handNavigation?.sequence ?? 0);
  const count = photos.length;
  const currentIndex = count ? ((index % count) + count) % count : 0;

  useEffect(() => { setIndex(startIndex(initialIndex, count)); }, [initialIndex, count]);

  useEffect(() => {
    if (!handNavigation || previousNavigation.current === handNavigation.sequence) return;
    previousNavigation.current = handNavigation.sequence;
    if (count > 1) setIndex(value => (value + handNavigation.direction + count) % count);
  }, [handNavigation, count]);

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
        <h2>暂无照片</h2>
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
        <h2>高清照片</h2>
        <span className="gallery-count" aria-live="polite" aria-atomic="true">
          {String(currentIndex + 1).padStart(2, '0')} <i>/ {String(count).padStart(2, '0')}</i>
        </span>
      </div>

      {handMode && <div className="gallery-hand-bar"><span><span className="camera-dot" /> 摄像头已开启 · 左右挥掌翻页，握拳返回</span><button type="button" onClick={onCloseHandMode}>关闭摄像头</button></div>}

      <PhotoViewer key={`${photo.id}:${photo.src}`} photo={photo} onStep={count > 1 ? move : undefined} />

      <>{photo.caption && <p className="photo-caption">{photo.caption}</p>}</>

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
