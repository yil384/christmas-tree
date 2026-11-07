import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import TreeCanvas from './components/TreeCanvas';
import { Icon } from './components/Icon';
import { Dialog } from './components/Dialog';
import { useMusic } from './hooks/useMusic';
import { assetUrl, defaultGift, readGift, readPhotos } from './lib/content';
import type { Gift, Photo } from './lib/content';
import './App.css';

const PhotoGallery = lazy(() => import('./components/PhotoGallery'));
const ShareGift = lazy(() => import('./components/ShareGift'));
type OpenPanel = 'letter' | 'photos' | 'share' | null;

export default function App() {
  const [gift, setGift] = useState<Gift>(defaultGift);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoStatus, setPhotoStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lit, setLit] = useState(false);
  const [scattered, setScattered] = useState(false);
  const [snow, setSnow] = useState(true);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState<OpenPanel>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [toast, setToast] = useState('');
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const notify = useCallback((message: string) => setToast(message), []);
  const music = useMusic(gift.music, notify);

  useEffect(() => {
    const controller = new AbortController();
    fetch(assetUrl('gift.json'), { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Gift unavailable'); return response.json(); })
      .then(data => setGift(readGift(data)))
      .catch(() => { /* The complete default greeting remains available if config cannot be read. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPhotoStatus('loading');
    fetch(assetUrl('generated/photo-manifest.json'), { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Photos unavailable'); return response.json(); })
      .then(data => { setPhotos(readPhotos(data)); setPhotoStatus('ready'); })
      .catch(() => { if (!controller.signal.aborted) setPhotoStatus('error'); });
    return () => controller.abort();
  }, [photoAttempt]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => { document.title = `${gift.recipient}，圣诞快乐 ✧`; }, [gift.recipient]);
  const closePanel = useCallback(() => setPanel(null), []);
  const openPhotos = (index = 0) => { setLit(true); setPhotoIndex(index); setPanel('photos'); };
  const illuminate = () => { if (!lit) setLit(true); else setScattered(previous => !previous); };
  // Only a few thumbnails decorate the tree; the full collection lives in the gallery.
  const ornaments = photos.slice(0, 5);

  return (
    <div className={`gift-app${lit ? ' is-lit' : ''}${scattered ? ' is-scattered' : ''}${paused ? ' is-paused' : ''}`}>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="site-header">
        <a className="wordmark" href="#" aria-label="圣诞礼物首页" onClick={event => { event.preventDefault(); closePanel(); }}>
          <span className="brand-star"><Icon name="sparkle" /></span>
          <span>A LITTLE CHRISTMAS<span className="wordmark-sub">一份冬日的心意</span></span>
        </a>
        <div className="header-actions">
          <span className="edition">WINTER · {gift.year}</span>
          <button className={`icon-button ${music.playing ? 'active' : ''}`} aria-label={music.playing ? '关闭音乐' : '播放音乐'} aria-pressed={music.playing} onClick={music.toggle} title={music.playing ? '关闭音乐' : '播放音乐'}><Icon name={music.playing ? 'sound' : 'muted'} /></button>
          <button className="icon-button" aria-label="分享这份礼物" title="分享这份礼物" onClick={() => setPanel('share')}><Icon name="share" /></button>
        </div>
      </header>

      <main className="gift-main">
        <section className="greeting" aria-labelledby="gift-title">
          <p className="overline"><span /> FOR YOU, AND ONLY YOU</p>
          <p className="recipient">致，{gift.recipient}</p>
          <h1 id="gift-title">{gift.headline[0]}<br /><em>{gift.headline[1]}</em></h1>
          <p className="greeting-copy">{gift.subtitle}</p>
          <div className="greeting-actions">
            <button className="primary-button" onClick={illuminate}><Icon name="sparkle" /><span>{!lit ? '点亮你的圣诞树' : scattered ? '让星光回到树上' : '让星光散开'}</span><Icon name="arrow" /></button>
            <button className="letter-link" onClick={() => setPanel('letter')}><Icon name="letter" /><span>还有一封信，想给你</span><span className="small-arrow">↗</span></button>
          </div>
          <div className="tiny-note"><span className="tiny-note-line" /><span>{lit ? '这一刻，星光为你而亮。' : '轻轻一点，让这个冬天亮起来。'}</span></div>
        </section>

        <section className="tree-stage" aria-label="你的圣诞树">
          <div className="tree-halo" aria-hidden="true" />
          <div className="tree-caption" aria-hidden="true"><span>MAKE A LITTLE WISH</span><span className="caption-dash" /></div>
          <div className="tree-canvas-wrap"><TreeCanvas lit={lit} scattered={scattered} snow={snow} paused={paused || panel !== null} /></div>
          {lit && !scattered && ornaments.length > 0 && <div className="photo-ornaments">{ornaments.map((photo, index) => <button key={photo.id} className={`photo-ornament ornament-${index}`} style={{ '--photo-delay': `${index * 110}ms` } as CSSProperties} aria-label={`打开${photo.alt}`} onClick={() => openPhotos(index)}><img src={assetUrl(photo.thumbnail)} alt="" width="96" height="106" decoding="async" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /><span className="photo-mark" aria-hidden="true">✧</span></button>)}</div>}
          <div className="tree-floor" aria-hidden="true"><span /><i /><span /></div>
          <p className="tree-hint"><Icon name="hand" /> 轻轻拖动，换个角度看星光</p>
        </section>

        <aside className="memory-entry" aria-label="回忆相册"><button className="memory-button" onClick={() => openPhotos()}><span className="memory-symbol"><Icon name="photos" /></span><span className="memory-text"><strong>把瞬间，挂在树上</strong><span>{photoStatus === 'loading' ? '正在收集小小的回忆' : photoStatus === 'error' ? '相册暂时没打开 · 点此重试' : photos.length ? `${photos.length} 张照片，藏着小小的美好` : '有些美好，正在路上'}</span></span><span className="memory-arrow"><Icon name="arrow" /></span></button></aside>
      </main>

      <footer className="site-footer"><p>MAY YOUR DAYS BE MERRY & BRIGHT <span>✦</span></p><div className="scene-controls" aria-label="画面设置"><button onClick={() => setSnow(previous => !previous)} aria-pressed={snow}><Icon name="snow" /><span>{snow ? '雪落着' : '下点雪'}</span><span className={`status-dot ${snow ? 'on' : ''}`} /></button><span className="control-divider" /><button onClick={() => setPaused(previous => !previous)} aria-pressed={paused}><Icon name={paused ? 'play' : 'pause'} /><span>{paused ? '继续动画' : '静静欣赏'}</span></button></div></footer>
      <div className="sr-only" role="status" aria-live="polite">{lit ? scattered ? '圣诞树已散开成星光' : '圣诞树已经点亮' : '圣诞树等你点亮'}</div>
      {toast && <div className="toast" role="status">{toast}</div>}

      {panel === 'letter' && <Dialog title="一封冬日来信" onClose={closePanel} className="letter-dialog"><div className="letter-paper"><div className="letter-topline"><span>A NOTE FOR YOU</span><Icon name="sparkle" /></div><p className="letter-date">DECEMBER · {gift.year}</p><h2>愿你的冬天，<br />有光，也有温暖。</h2><p className="letter-to">{gift.recipient}：</p><div className="letter-body">{gift.letter.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><div className="letter-signature"><span>圣诞快乐</span><strong>{gift.signature}</strong><Icon name="sparkle" /></div></div></Dialog>}
      {panel === 'photos' && <Dialog title="树上的回忆" onClose={closePanel} className="gallery-dialog">{photoStatus === 'loading' ? <div className="panel-state"><Icon name="sparkle" /><h2>正在打开回忆…</h2><p>圣诞树会在这里陪你。</p></div> : photoStatus === 'error' ? <div className="panel-state"><Icon name="photos" /><h2>照片暂时没打开</h2><p>再试一次，看看回忆有没有到。</p><button className="primary-button" onClick={() => setPhotoAttempt(previous => previous + 1)}>重新打开</button></div> : <Suspense fallback={<div className="panel-state">正在打开相册…</div>}><PhotoGallery photos={photos} initialIndex={photoIndex} /></Suspense>}</Dialog>}
      {panel === 'share' && <Dialog title="分享这份礼物" onClose={closePanel} className="share-dialog"><Suspense fallback={<div className="panel-state">正在准备礼物卡…</div>}><ShareGift recipient={gift.recipient} year={gift.year} notify={notify} /></Suspense></Dialog>}
    </div>
  );
}
