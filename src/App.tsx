import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Dialog } from './components/Dialog';
import { assetUrl, readPhotos, type Photo } from './lib/content';
import { defaultScene, readSceneConfig } from './lib/scene-config';
import { useSecretInteractions } from './hooks/useSecretInteractions';
import GreetingGate from './components/GreetingGate';
import StorybookFrame from './components/StorybookFrame';
import { Icon } from './components/Icon';
import { createHandSceneInput, type HandCommand } from './lib/hand-types';
import { claimOpeningFilm, formatFilmDuration } from './lib/film-presentation';
import './App.css';

const TreeScene = lazy(() => import('./scene/TreeScene'));
const PhotoGallery = lazy(() => import('./components/PhotoGallery'));
const ShareGift = lazy(() => import('./components/ShareGift'));
const HandMagicMode = lazy(() => import('./components/HandMagicMode'));
const ChristmasFilm = lazy(() => import('./components/ChristmasFilm'));

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

class HandModeBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <Dialog title="手势魔法暂时没打开" onClose={this.props.onClose} className="share-dialog">
      <div className="panel-state" role="alert"><h2>手势魔法暂时没打开</h2><p>可以关闭后继续欣赏圣诞树，<br />或重新加载页面再试一次。</p><button type="button" className="primary-button" onClick={() => window.location.reload()}>重新加载页面</button></div>
    </Dialog>;
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
  const [panel, setPanel] = useState<'photos' | 'share' | 'film' | null>(null);
  const [openingFilm, setOpeningFilm] = useState(false);
  const [filmDuration, setFilmDuration] = useState<number | null>(null);
  const hasInteracted = useRef(false);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [notice, setNotice] = useState('');
  const [handOpen, setHandOpen] = useState(false);
  const [handRunning, setHandRunning] = useState(false);
  const [galleryNavigation, setGalleryNavigation] = useState<{ sequence: number; direction: -1 | 1 }>({ sequence: 0, direction: 1 });
  const handInput = useRef(createHandSceneInput());
  const handActive = handRunning && visible && panel === null;
  handInput.current.enabled = handActive;
  const closeHandMode = useCallback(() => {
    handInput.current.enabled = false;
    handInput.current.cursor = null;
    handInput.current.hoveredPhoto = null;
    handInput.current.selectionRequest = null;
    setHandRunning(false);
    setHandOpen(false);
  }, []);
  const openHandMode = useCallback(() => { setPanel(null); setHandOpen(true); }, []);
  const closePanel = useCallback(() => { setPanel(null); setOpeningFilm(false); }, []);
  const onCatPress = useCallback(() => {
    if (scene.cat.video) { closeHandMode(); setOpeningFilm(false); setPanel('film'); }
    else setNotice('小喵收到了你的圣诞魔法。');
  }, [closeHandMode, scene.cat.video]);
  const onTap = useCallback(() => setPaused(value => !value), []);
  const onPhotoTap = useCallback((photo: number) => { setSelectedPhoto(photo); setPanel('photos'); }, []);
  const onDoubleTap = useCallback(() => setState(value => value === 'FORMED' ? 'CHAOS' : 'FORMED'), []);
  const onLongPress = useCallback((photo: number | null) => {
    if (photo !== null) { setSelectedPhoto(photo); setPanel('photos'); }
    else { closeHandMode(); setPanel('share'); }
  }, [closeHandMode]);
  const interaction = useSecretInteractions({ onTap, onPhotoTap, onDoubleTap, onLongPress, enabled: visible && panel === null && (!handOpen || handRunning) });

  const onHandPhotoSelect = useCallback((index: number | null) => {
    if (!handRunning || !visible || panel !== null) return;
    if (index !== null && photos[index]) {
      setSelectedPhoto(index);
      setPanel('photos');
      handInput.current.cursor = null;
      handInput.current.hoveredPhoto = null;
    } else setNotice('先用食指瞄准照片，出现提示后再轻轻捏合。');
  }, [handRunning, panel, photos, visible]);

  const onHandCommand = useCallback((command: HandCommand) => {
    if (!handRunning || !visible || panel === 'share' || panel === 'film') return;
    const input = handInput.current;
    if (panel === 'photos') {
      if (command.type === 'gallery-step') setGalleryNavigation(value => ({ sequence: value.sequence + 1, direction: command.direction }));
      if (command.type === 'close-gallery') setPanel(null);
      return;
    }
    switch (command.type) {
      case 'orbit': input.orbitX += command.dx; input.orbitY += command.dy; break;
      case 'zoom': if (Number.isFinite(command.factor) && command.factor > 0) input.zoomLog += Math.log(command.factor); break;
      case 'scatter': setState('CHAOS'); setNotice('让回忆，散成一片星空。'); break;
      case 'gather': setState('FORMED'); setNotice('把心意，重新聚在一起。'); break;
      case 'toggle-rotation': setPaused(!paused); setNotice(paused ? '镜头继续轻轻环绕。' : '已暂停镜头漫游。'); break;
      case 'select-photo': {
        if (input.cursor) input.selectionRequest = { cursor: { ...input.cursor }, requestedAt: performance.now() };
        break;
      }
      case 'magic': input.magic++; setNotice('愿每一份心意，都有星光回应。'); break;
    }
  }, [handRunning, panel, paused, visible]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (panel === 'film' || event.repeat || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== 'h') return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      if (handOpen) closeHandMode(); else openHandMode();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [closeHandMode, handOpen, openHandMode, panel]);

  useEffect(() => {
    const markInteraction = () => { hasInteracted.current = true; };
    // A slow settings response must not interrupt a visitor who has already
    // started exploring by mouse, touch, scrolling, or keyboard.
    for (const name of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(name, markInteraction, { capture: true, passive: true, once: true });
    return () => {
      for (const name of ['pointerdown', 'keydown', 'wheel']) document.removeEventListener(name, markInteraction, true);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let atlasPreload: HTMLLinkElement | null = null;
    fetch(assetUrl('generated/photo-manifest.json'), { signal: controller.signal, cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error('Photo manifest unavailable'); return response.json(); })
      .then(data => {
        if (controller.signal.aborted) return;
        const nextPhotos = readPhotos(data);
        const atlas = nextPhotos[0]?.atlas?.src;
        // Start the single photo request while the lazy 3D module is still
        // loading. The texture loader reuses this same browser-cache entry.
        if (atlas) {
          atlasPreload = document.createElement('link');
          atlasPreload.rel = 'preload';
          atlasPreload.as = 'image';
          atlasPreload.href = assetUrl(atlas);
          atlasPreload.setAttribute('fetchpriority', 'high');
          document.head.appendChild(atlasPreload);
        }
        setPhotos(nextPhotos);
        setPhotoStatus('ready');
      })
      .catch(error => { if (error.name !== 'AbortError') setPhotoStatus('error'); });
    fetch(assetUrl('generated/scene.json'), { signal: controller.signal, cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error('Scene settings unavailable'); return response.json(); })
      .then(data => {
        if (controller.signal.aborted) return;
        const nextScene = readSceneConfig(data);
        setScene(nextScene);
        if (claimOpeningFilm(nextScene.cat.video, hasInteracted.current)) {
          setOpeningFilm(true);
          setPanel('film');
        }
      })
      .catch(() => { /* The default greeting, dark sky and snow remain usable. */ });
    return () => { controller.abort(); atlasPreload?.remove(); };
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
      aria-label="照片圣诞树。点击照片查看高清大图，滚轮或双指一同放大场景，点击空白或空格暂停与继续镜头漫游，双击或回车散开与聚合，长按照片也可打开。点击小猫触发魔法。按 H 开启手势魔法。"
      data-tree-state={state.toLowerCase()} data-rotation={paused ? 'paused' : 'playing'} data-motion="camera-orbit"
      aria-busy={photoStatus === 'loading'}>
      <SceneBoundary>
        <Suspense fallback={<div className="scene-message" role="status"><span className="loading-star" aria-hidden="true">★</span><span className="visually-hidden">正在加载圣诞树</span></div>}>
          {/* Keep assets and texture uploads warming behind the film. Reduced
              motion selects demand rendering, rather than running hidden animation. */}
          <TreeScene photos={photos} state={state} paused={paused || panel !== null || (handOpen && !handRunning)} reducedMotion={reducedMotion || panel === 'film'}
            active={visible && (panel === null || panel === 'film') && (!handOpen || handRunning)} onPhotoPress={interaction.onPhotoPress}
            background={scene.background} snow={scene.snow} cat={scene.cat} onCatPress={onCatPress} onCatInteract={interaction.cancel} handInput={handInput} handActive={handActive} onHandPhotoSelect={onHandPhotoSelect} />
        </Suspense>
      </SceneBoundary>
    </div>
    <StorybookFrame />
    <GreetingGate greeting={scene.greeting} onOpen={openHandMode} />
    {scene.cat.video && <button type="button" className="film-entry" onClick={onCatPress}
      aria-label={`观看圣诞故事${filmDuration ? `，${formatFilmDuration(filmDuration)}` : ''}`} aria-haspopup="dialog" aria-expanded={panel === 'film'}>
      <span className="film-entry-thumbnail" aria-hidden="true">
        <img src={assetUrl('film/starlight-return-poster.webp')} alt="" width="96" height="54" decoding="async" />
        <span className="film-entry-play"><Icon name="play" /></span>
      </span>
      <span className="film-entry-copy">
        <strong>星光归来</strong>
        <span>城堡 · 烟花 · 小喵</span>
        <span className="film-entry-duration">{formatFilmDuration(filmDuration) || '公主与小喵的奇遇'} <Icon name="arrow" /></span>
      </span>
    </button>}
    {photoStatus === 'error' && <span className="visually-hidden" role="status">照片暂时加载失败，刷新页面可重试。</span>}
    {notice && <div className="toast" role="status">{notice}</div>}
    {panel && <Dialog title={panel === 'photos' ? '相册' : panel === 'film' ? '星光归来' : '分享圣诞树'} onClose={closePanel} className={panel === 'photos' ? 'photo-dialog' : panel === 'film' ? `film-dialog${openingFilm ? ' opening-film-dialog' : ''}` : 'share-dialog'}>
      <Suspense fallback={<div className="panel-state" role="status">加载中…</div>}>
        {panel === 'photos' ? <PhotoGallery photos={photos} initialIndex={selectedPhoto} handNavigation={galleryNavigation} handMode={handRunning} onCloseHandMode={closeHandMode} />
          : panel === 'film' && scene.cat.video ? <ChristmasFilm key={scene.cat.video} src={scene.cat.video} poster="film/starlight-return-poster.webp" opening={openingFilm} onEnter={closePanel} onDuration={setFilmDuration} />
            : <ShareGift notify={setNotice} greeting={scene.greeting} catSrc={scene.cat.src} />}
      </Suspense>
    </Dialog>}
    {handOpen && <HandModeBoundary onClose={closeHandMode}><Suspense fallback={<Dialog title="手势魔法" onClose={closeHandMode}><div className="panel-state" role="status">正在打开手势图鉴…</div></Dialog>}>
      <HandMagicMode input={handInput} view={panel === 'photos' ? 'gallery' : panel ? 'blocked' : 'scene'} onCommand={onHandCommand} onRunningChange={setHandRunning} onClose={closeHandMode} />
    </Suspense></HandModeBoundary>}
  </main>;
}
