import { Component, Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Dialog } from './components/Dialog';
import { Icon } from './components/Icon';
import { assetUrl, readPhotos, type Photo } from './lib/content';
import './App.css';

const TreeScene = lazy(() => import('./scene/TreeScene'));
const PhotoGallery = lazy(() => import('./components/PhotoGallery'));
const ShareGift = lazy(() => import('./components/ShareGift'));

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="scene-message" role="status">
      <p>这个浏览器暂时无法显示 3D 圣诞树。</p>
      <span>可以用系统浏览器打开，或先查看下方相册。</span>
      <button className="small-button" onClick={() => window.location.reload()}>重新加载</button>
    </div>;
  }
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoStatus, setPhotoStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const [state, setState] = useState<'CHAOS' | 'FORMED'>('FORMED');
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [panel, setPanel] = useState<'photos' | 'share' | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [notice, setNotice] = useState('');
  const closePanel = useCallback(() => setPanel(null), []);
  const openPhoto = useCallback((index: number) => { setSelectedPhoto(index); setPanel('photos'); }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPhotoStatus('loading');
    fetch(assetUrl('generated/photo-manifest.json'), { signal: controller.signal, cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error('Photo manifest unavailable'); return response.json(); })
      .then(data => { setPhotos(readPhotos(data)); setPhotoStatus('ready'); })
      .catch(error => { if (error.name !== 'AbortError') setPhotoStatus('error'); });
    return () => controller.abort();
  }, [photoAttempt]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = () => setReducedMotion(preference.matches);
    const onVisibility = () => setVisible(!document.hidden);
    preference.addEventListener('change', onPreference);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { preference.removeEventListener('change', onPreference); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return <main className="tree-app">
    <div className="tree-stage" aria-label="可旋转的 3D 照片圣诞树">
      <SceneBoundary>
        <Suspense fallback={<div className="scene-message" role="status"><span className="loading-star">★</span><p>正在加载圣诞树…</p></div>}>
          <TreeScene photos={photos} state={state} paused={paused || panel !== null} reducedMotion={reducedMotion} active={visible && panel === null} onPhotoSelect={openPhoto} />
        </Suspense>
      </SceneBoundary>
    </div>
    <footer className="tree-controls">
      <div className="tree-hint"><span className="hint-desktop">拖动旋转 · 滚轮缩放</span><span className="hint-mobile">滑动旋转 · 双指缩放</span>{photos.length > 0 && <span>点照片放大</span>}</div>
      <nav className="toolbar" aria-label="圣诞树操作">
        <button type="button" className="tree-toggle" onClick={() => setState(value => value === 'FORMED' ? 'CHAOS' : 'FORMED')} aria-label={state === 'FORMED' ? '散开圣诞树' : '聚合圣诞树'}><Icon name="sparkle" /><span>{state === 'FORMED' ? '散开' : '聚合'}</span></button>
        <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused || reducedMotion ? '开始旋转' : '暂停旋转'} aria-pressed={paused || reducedMotion} disabled={reducedMotion} title={reducedMotion ? '已按系统设置减少动态效果' : undefined}><Icon name={paused || reducedMotion ? 'play' : 'pause'} /><span>{paused || reducedMotion ? '旋转' : '暂停'}</span></button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button type="button" onClick={() => openPhoto(0)}><Icon name="photos" /><span>相册</span></button>
        <button type="button" onClick={() => setPanel('share')}><Icon name="share" /><span>分享</span></button>
      </nav>
    </footer>
    {photoStatus === 'error' && <div className="photo-load-notice" role="status">照片暂时加载失败 <button onClick={() => setPhotoAttempt(value => value + 1)}>重试</button></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
    {panel && <Dialog title={panel === 'photos' ? '相册' : '分享圣诞树'} onClose={closePanel} className={panel === 'photos' ? 'photo-dialog' : 'share-dialog'}>
      <Suspense fallback={<div className="panel-state" role="status">加载中…</div>}>
        {panel === 'photos' ? <PhotoGallery photos={photos} initialIndex={selectedPhoto} /> : <ShareGift notify={setNotice} />}
      </Suspense>
    </Dialog>}
  </main>;
}
