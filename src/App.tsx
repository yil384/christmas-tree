import { Component, Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Dialog } from './components/Dialog';
import { assetUrl, readPhotos, type Photo } from './lib/content';
import { defaultScene, readSceneConfig } from './lib/scene-config';
import { useSecretInteractions } from './hooks/useSecretInteractions';
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
      <span>请在支持 WebGL 的系统浏览器中打开。</span>
    </div>;
  }
}

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoStatus, setPhotoStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [scene, setScene] = useState(defaultScene);
  const [state, setState] = useState<'CHAOS' | 'FORMED'>('FORMED');
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [panel, setPanel] = useState<'photos' | 'share' | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [notice, setNotice] = useState('');
  const closePanel = useCallback(() => setPanel(null), []);
  const onTap = useCallback(() => setPaused(value => !value), []);
  const onDoubleTap = useCallback(() => setState(value => value === 'FORMED' ? 'CHAOS' : 'FORMED'), []);
  const onLongPress = useCallback((photo: number | null) => {
    if (photo !== null) { setSelectedPhoto(photo); setPanel('photos'); }
    else setPanel('share');
  }, []);
  const interaction = useSecretInteractions({ onTap, onDoubleTap, onLongPress, enabled: visible && panel === null });

  useEffect(() => {
    const controller = new AbortController();
    fetch(assetUrl('generated/photo-manifest.json'), { signal: controller.signal, cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error('Photo manifest unavailable'); return response.json(); })
      .then(data => { setPhotos(readPhotos(data)); setPhotoStatus('ready'); })
      .catch(error => { if (error.name !== 'AbortError') setPhotoStatus('error'); });
    fetch(assetUrl('generated/scene.json'), { signal: controller.signal, cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error('Scene settings unavailable'); return response.json(); })
      .then(data => setScene(readSceneConfig(data)))
      .catch(() => { /* The default greeting, dark sky and snow remain usable. */ });
    return () => controller.abort();
  }, []);

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
    <div className="night-backdrop" aria-hidden="true" style={{
      backgroundImage: scene.background.src ? `url("${assetUrl(scene.background.src)}")` : undefined,
      backgroundPosition: `${scene.background.focus[0] * 100}% ${scene.background.focus[1] * 100}%`,
      filter: `brightness(${Math.pow(scene.background.brightness, 1 / 2.2)})`,
    }} />
    <div className="tree-stage" {...interaction.bind}
      aria-label="照片圣诞树。单击或空格暂停与继续旋转，双击或回车散开与聚合，长按照片放大。"
      data-tree-state={state.toLowerCase()} data-rotation={paused ? 'paused' : 'playing'}
      aria-busy={photoStatus === 'loading'}>
      <SceneBoundary>
        <Suspense fallback={<div className="scene-message" role="status"><span className="loading-star" aria-hidden="true">★</span><span className="visually-hidden">正在加载圣诞树</span></div>}>
          <TreeScene photos={photos} state={state} paused={paused || panel !== null} reducedMotion={reducedMotion}
            active={visible && panel === null} onPhotoPress={interaction.onPhotoPress}
            background={scene.background} snow={scene.snow} />
        </Suspense>
      </SceneBoundary>
    </div>
    <p className="christmas-greeting">{scene.greeting}</p>
    {photoStatus === 'error' && <span className="visually-hidden" role="status">照片暂时加载失败，刷新页面可重试。</span>}
    {notice && <div className="toast" role="status">{notice}</div>}
    {panel && <Dialog title={panel === 'photos' ? '相册' : '分享圣诞树'} onClose={closePanel} className={panel === 'photos' ? 'photo-dialog' : 'share-dialog'}>
      <Suspense fallback={<div className="panel-state" role="status">加载中…</div>}>
        {panel === 'photos' ? <PhotoGallery photos={photos} initialIndex={selectedPhoto} /> : <ShareGift notify={setNotice} />}
      </Suspense>
    </Dialog>}
  </main>;
}
