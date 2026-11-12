import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { assetUrl } from '../lib/content';
import { usePrincessAudio } from './usePrincessAudio';
import { usePrincessEnvironment } from './usePrincessEnvironment';
import './ConfessionPage.css';

type Chapter = 'invitation' | 'arrival' | 'crown' | 'ballroom' | 'confession' | 'finale';
type Clip = 'arrival' | 'ballroom';
type FilmStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error';
type Burst = { id: number; x: number; y: number; power?: number };
const chapterNames: Record<Chapter, string> = {
  invitation: '一份只给你的邀请', arrival: '第一站 · 城堡初见', crown: '第二站 · 公主加冕',
  ballroom: '第三站 · 午夜舞厅', confession: '这一站 · 我有话说', finale: '终点 · 为你亮起的夜空',
};
const chapterOrder: Chapter[] = ['invitation', 'arrival', 'crown', 'ballroom', 'confession', 'finale'];
let sceneImport: ReturnType<typeof importScene> | undefined;
function importScene() { return import('./CrownScene'); }
function loadScene() { return sceneImport ??= importScene(); }
const CrownScene = lazy(loadScene);

function Star({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 52 52" fill="none" aria-hidden="true"><path d="m26 3 5.5 16.7L48 26l-16.5 6.3L26 49l-5.5-16.7L4 26l16.5-6.3L26 3Z" fill="currentColor" /><path d="m26 13 3.2 9.8L39 26l-9.8 3.2L26 39l-3.2-9.8L13 26l9.8-3.2L26 13Z" fill="#fff8e9" /></svg>;
}

function SoundIcon({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />{muted ? <path d="m16 9 5 6m0-6-5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /> : <path d="M15 8c2.6 2 2.6 6 0 8M18 5c4.4 3.7 4.4 10.3 0 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />}</svg>;
}

function Arrow() {
  return <svg viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M4 11h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlaybackIcon({ playing }: { playing: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{playing ? <path d="M8 6v12M16 6v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /> : <path d="m9 5 10 7-10 7V5Z" fill="currentColor" />}</svg>;
}

class SceneBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** The small Canvas fallback needs no WebGL, textures, or downloaded library. */
function FallbackFireworks({ burst, active, reducedMotion }: { burst?: Burst; active: boolean; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<{ burst: (value: Burst) => void; activate: (value: boolean) => void } | null>(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    type Spark = { x: number; y: number; vx: number; vy: number; life: number; age: number; hue: number; size: number };
    let sparks: Spark[] = [];
    let width = 1;
    let height = 1;
    let frame = 0;
    let previous = 0;
    let enabled = true;
    const measure = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (now: number) => {
      frame = 0;
      if (!enabled || document.hidden) return;
      const elapsed = previous ? Math.min((now - previous) / 1000, 0.045) : 0.016;
      previous = now;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';
      sparks = sparks.filter(spark => spark.age < spark.life);
      sparks.forEach(spark => {
        spark.age += elapsed;
        const alpha = Math.pow(Math.max(0, 1 - spark.age / spark.life), 1.8);
        const oldX = spark.x;
        const oldY = spark.y;
        if (!reducedRef.current) {
          spark.x += spark.vx * elapsed;
          spark.y += spark.vy * elapsed;
          spark.vx *= 0.986;
          spark.vy += 24 * elapsed;
        }
        context.strokeStyle = `hsla(${spark.hue}, 85%, 78%, ${alpha})`;
        context.lineWidth = spark.size;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(oldX, oldY);
        context.lineTo(spark.x + 0.4, spark.y + 0.4);
        context.stroke();
        context.fillStyle = `hsla(${spark.hue}, 90%, 87%, ${alpha * 0.14})`;
        context.beginPath();
        context.arc(spark.x, spark.y, spark.size * 3, 0, Math.PI * 2);
        context.fill();
      });
      if (sparks.length) frame = requestAnimationFrame(draw);
    };
    const awaken = () => { if (!frame && enabled && sparks.length) frame = requestAnimationFrame(draw); };
    runtimeRef.current = {
      burst(value) {
        const power = value.power ?? 0.65;
        const count = reducedRef.current ? 15 : Math.round(62 + power * 50);
        const hue = value.id % 3 === 0 ? 327 : value.id % 3 === 1 ? 39 : 266;
        for (let index = 0; index < count; index++) {
          const angle = index / count * Math.PI * 2;
          const speed = (32 + Math.random() * 68) * (0.55 + power * 0.7);
          sparks.push({ x: value.x * width + (reducedRef.current ? Math.cos(angle) * 50 : 0), y: value.y * height + (reducedRef.current ? Math.sin(angle) * 50 : 0), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: 1.5 + Math.random() * 1.4, hue: hue + Math.random() * 14, size: 0.8 + Math.random() * 1.2 });
        }
        sparks = sparks.slice(-340);
        awaken();
      },
      activate(value) { enabled = value; previous = 0; if (!value) { cancelAnimationFrame(frame); frame = 0; } else awaken(); },
    };
    const resize = new ResizeObserver(measure);
    resize.observe(canvas);
    measure();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); runtimeRef.current = null; };
  }, []);
  useEffect(() => { runtimeRef.current?.activate(active); }, [active]);
  useEffect(() => { if (burst) runtimeRef.current?.burst(burst); }, [burst]);
  return <canvas ref={canvasRef} className="princess-fallback-fireworks" aria-hidden="true" />;
}

export default function ConfessionPage() {
  const shellRef = useRef<HTMLElement>(null);
  const journeyRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLVideoElement>(null);
  const { visible, reducedMotion } = usePrincessEnvironment(shellRef);
  const [chapter, setChapter] = useState<Chapter>('invitation');
  const chapterRef = useRef<Chapter>('invitation');
  const [started, setStarted] = useState(false);
  const [sceneEntered, setSceneEntered] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [filmStatus, setFilmStatus] = useState<FilmStatus>('idle');
  const [filmHasFrame, setFilmHasFrame] = useState(false);
  const [filmProgress, setFilmProgress] = useState(0);
  const [slowFilm, setSlowFilm] = useState(false);
  const [replay, setReplay] = useState(false);
  const clipRef = useRef<Clip | null>(null);
  const replayRef = useRef(false);
  const playToken = useRef(0);
  const [confessionReady, setConfessionReady] = useState(false);
  const [charge, setCharge] = useState(0);
  const [holding, setHolding] = useState(false);
  const chargeFrame = useRef(0);
  const holdStarted = useRef(0);
  const [burst, setBurst] = useState<Burst>();
  const burstId = useRef(0);
  const skyPress = useRef<{ at: number; x: number; y: number; pointerId: number } | null>(null);
  const ignoreSkyClick = useRef(false);
  const isFilm = chapter === 'arrival' || chapter === 'ballroom';
  const filmWantsToPlay = filmStatus === 'playing' || filmStatus === 'loading';
  const isSky = chapter === 'confession' || chapter === 'finale';
  const { muted, unlock, toggle, chime } = usePrincessAudio(chapter === 'confession' ? 'quiet' : isFilm ? 'cinematic' : chapter === 'finale' ? 'finale' : 'ambient', visible);

  const moveTo = useCallback((next: Chapter) => {
    clipRef.current = null;
    playToken.current++;
    filmRef.current?.pause();
    chapterRef.current = next;
    setChapter(next);
    setFilmStatus('idle');
    setFilmHasFrame(false);
    setCharge(0);
    setHolding(false);
    cancelAnimationFrame(chargeFrame.current);
    if (next === 'crown' || next === 'confession' || next === 'finale') setSceneEntered(true);
  }, []);

  const finishFilm = useCallback(() => {
    const clip = clipRef.current;
    if (!clip) return;
    if (replayRef.current) moveTo('finale');
    else if (clip === 'arrival') { moveTo('crown'); chime('crown'); }
    else moveTo('confession');
  }, [chime, moveTo]);

  const startFilm = useCallback((clip: Clip, asReplay = false) => {
    const film = filmRef.current;
    if (!film) return;
    unlock();
    const token = ++playToken.current;
    film.pause();
    clipRef.current = clip;
    replayRef.current = asReplay;
    chapterRef.current = clip;
    setChapter(clip);
    setStarted(true);
    setReplay(asReplay);
    setFilmStatus('loading');
    setFilmHasFrame(false);
    setFilmProgress(0);
    setSlowFilm(false);
    setCharge(0);
    setHolding(false);
    cancelAnimationFrame(chargeFrame.current);
    film.muted = muted;
    film.setAttribute('playsinline', '');
    film.setAttribute('webkit-playsinline', '');
    film.poster = assetUrl(`princess/${clip}-poster.webp`);
    film.preload = 'auto';
    film.src = assetUrl(`princess/${clip}.mp4`);
    // Keep this call in the actual user gesture. Never wait for React, an import,
    // a complete download, or a timeout before asking iOS to start the movie.
    const play = film.play();
    if (play) void play.catch(error => {
      if (playToken.current !== token || clipRef.current !== clip) return;
      setFilmStatus(error instanceof DOMException && error.name === 'NotSupportedError' ? 'error' : 'blocked');
    });
    // The first screen costs one poster. The scene only starts loading after touch.
    void loadScene().catch(() => setSceneFailed(true));
  }, [muted, unlock]);

  const toggleFilm = useCallback(() => {
    const film = filmRef.current;
    if (!film || !clipRef.current) return;
    unlock();
    if (!film.paused) { film.pause(); return; }
    const token = playToken.current;
    setFilmStatus('loading');
    void film.play().catch(() => { if (playToken.current === token) setFilmStatus('blocked'); });
  }, [unlock]);

  const sceneDidLoad = useCallback(() => setSceneReady(true), []);
  const sceneUnavailable = useCallback(() => setSceneFailed(true), []);

  useEffect(() => {
    if (!visible) {
      if (clipRef.current) filmRef.current?.pause();
      cancelAnimationFrame(chargeFrame.current);
      skyPress.current = null;
      setHolding(false);
      setCharge(0);
    }
  }, [visible]);

  useEffect(() => {
    if (chapter !== 'confession') { setConfessionReady(false); return; }
    const timer = setTimeout(() => setConfessionReady(true), 1500);
    return () => clearTimeout(timer);
  }, [chapter]);

  useEffect(() => {
    setSlowFilm(false);
    if (filmStatus !== 'loading') return;
    const timer = setTimeout(() => setSlowFilm(true), 4500);
    return () => clearTimeout(timer);
  }, [filmStatus]);

  useEffect(() => {
    const film = filmRef.current;
    film?.setAttribute('webkit-playsinline', '');
    return () => {
      cancelAnimationFrame(chargeFrame.current);
      playToken.current++;
      film?.pause();
      film?.removeAttribute('src');
      film?.load();
    };
  }, []);

  const startCharge = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    unlock();
    event.currentTarget.setPointerCapture(event.pointerId);
    holdStarted.current = performance.now();
    setHolding(true);
    cancelAnimationFrame(chargeFrame.current);
    const tick = (now: number) => {
      const value = Math.min(1, (now - holdStarted.current) / 1000);
      setCharge(value);
      if (value < 1) chargeFrame.current = requestAnimationFrame(tick);
    };
    chargeFrame.current = requestAnimationFrame(tick);
  };

  const stopCharge = (event?: ReactPointerEvent<HTMLButtonElement>) => { if (event && !event.isPrimary) return; cancelAnimationFrame(chargeFrame.current); setHolding(false); };
  const cancelCharge = (event: ReactPointerEvent<HTMLButtonElement>) => { if (!event.isPrimary) return; stopCharge(); setCharge(0); };
  const firework = useCallback((x: number, y: number, power: number) => {
    unlock();
    if (chapterRef.current === 'confession') moveTo('finale');
    setBurst({ id: ++burstId.current, x: Math.max(0.1, Math.min(0.9, x)), y: Math.max(0.15, Math.min(0.58, y)), power });
    chime('firework');
  }, [chime, moveTo, unlock]);

  const startSkyPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || (chapter === 'confession' && !confessionReady)) return;
    const bounds = journeyRef.current?.getBoundingClientRect();
    if (!bounds) return;
    unlock();
    event.currentTarget.setPointerCapture(event.pointerId);
    skyPress.current = { at: performance.now(), x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height, pointerId: event.pointerId };
    setHolding(true);
  };
  const endSkyPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = skyPress.current;
    if (!press || press.pointerId !== event.pointerId) return;
    skyPress.current = null;
    setHolding(false);
    ignoreSkyClick.current = true;
    firework(press.x, press.y, Math.min(1, 0.45 + (performance.now() - press.at) / 1200));
  };
  const restart = () => {
    moveTo('invitation');
    setBurst(undefined);
    setSceneEntered(false);
    setSceneReady(false);
    setReplay(false);
    replayRef.current = false;
  };

  return <main ref={shellRef} className={`princess-shell${reducedMotion ? ' princess-reduced-motion' : ''}${!visible ? ' princess-is-hidden' : ''}`}>
    <div ref={journeyRef} className={`princess-journey princess-chapter-${chapter}${holding ? ' princess-is-holding' : ''}`} style={{ '--princess-charge': charge } as CSSProperties}>
      <div className="princess-backdrop" aria-hidden="true">
        <img className="princess-castle-poster" src={assetUrl('princess/arrival-poster.webp')} alt="" fetchPriority="high" decoding="async" draggable="false" />
        {started && <><img className={`princess-ballroom-poster${chapter === 'crown' ? ' princess-poster-visible' : ''}`} src={assetUrl('princess/crown-room-poster.webp')} alt="" decoding="async" draggable="false" /><img className={`princess-ballroom-poster${chapter === 'ballroom' ? ' princess-poster-visible' : ''}`} src={assetUrl('princess/ballroom-poster.webp')} alt="" decoding="async" draggable="false" /></>}
      </div>

      <video ref={filmRef} className={`princess-film${isFilm && filmHasFrame && filmStatus !== 'error' ? ' princess-film-visible' : ''}`} preload="none" playsInline muted={muted} disablePictureInPicture controls={false} aria-hidden={!isFilm} aria-label={chapter === 'ballroom' ? '午夜舞厅短片' : '城堡初见短片'} tabIndex={-1}
        onPlaying={() => { if (clipRef.current) { setFilmHasFrame(true); setFilmStatus('playing'); } }}
        onWaiting={() => { if (clipRef.current) setFilmStatus('loading'); }}
        onPause={() => { if (clipRef.current && filmRef.current?.paused) setFilmStatus('paused'); }}
        onError={() => { if (clipRef.current) setFilmStatus('error'); }}
        onEnded={finishFilm}
        onTimeUpdate={() => {
          const film = filmRef.current;
          if (!film || !clipRef.current) return;
          const duration = Number.isFinite(film.duration) && film.duration > 0 ? Math.min(15, film.duration) : 15;
          setFilmProgress(Math.min(1, film.currentTime / duration));
          if (film.currentTime >= 15) finishFilm();
        }} />

      <div className="princess-atmosphere" aria-hidden="true" />
      <div className="princess-vignette" aria-hidden="true" />
      <div className="princess-stardust" aria-hidden="true">{Array.from({ length: 15 }, (_, index) => <i key={index} style={{ '--dust-x': `${7 + index * 29 % 88}%`, '--dust-y': `${12 + index * 17 % 71}%`, '--dust-delay': `${-(index * 1.67)}s`, '--dust-duration': `${7 + index % 5}s` } as CSSProperties} />)}</div>

      {sceneEntered && <div className={`princess-scene-volume${isSky ? ' princess-scene-sky' : ''}${chapter !== 'crown' && !isSky ? ' princess-scene-asleep' : ''}`}>
        {chapter === 'crown' && (!sceneReady || sceneFailed) && <div className={`princess-crown-fallback${sceneFailed ? ' princess-fallback-ready' : ''}`}><img src={assetUrl('princess/crown.webp')} alt="一顶镶着粉色宝石、珍珠与星光的金色公主王冠" draggable="false" /><span className="princess-crown-aura" aria-hidden="true" /></div>}
        {!sceneFailed && <SceneBoundary onUnavailable={sceneUnavailable}><Suspense fallback={null}><CrownScene active={visible && (chapter === 'crown' || isSky)} mode={isSky ? 'sky' : 'crown'} charge={charge} burst={burst} reducedMotion={reducedMotion} onReady={sceneDidLoad} onUnavailable={sceneUnavailable} /></Suspense></SceneBoundary>}
        {sceneFailed && isSky && <FallbackFireworks burst={burst} active={visible} reducedMotion={reducedMotion} />}
      </div>}

      <header className="princess-header">
        <div className="princess-wordmark"><Star /><span>谭陈思仪的城堡夜游</span></div>
        <button type="button" className={`princess-sound princess-icon-button${muted ? ' princess-sound-muted' : ''}`} aria-label={muted ? '打开声音' : '关闭声音'} aria-pressed={!muted} onClick={() => { const next = toggle(); if (filmRef.current) filmRef.current.muted = next; }}><SoundIcon muted={muted} /><span className="princess-sound-dot" /></button>
      </header>

      {chapter === 'invitation' && <section className="princess-invitation princess-chapter-content" aria-labelledby="princess-invitation-title">
        <div className="princess-invitation-copy"><span className="princess-overline">今晚的城堡，只为你亮灯。</span><h1 id="princess-invitation-title">思仪公主，<br /><span>今晚我想耍个帅。</span></h1><span className="princess-title-flourish" aria-hidden="true"><i /><Star /><i /></span></div>
        <div className="princess-invitation-entry"><button type="button" className="princess-star-seal princess-entry-seal" aria-label="轻触星光，进入城堡夜游" onClick={() => { startFilm('arrival'); chime('open'); }}><span className="princess-seal-orbit" /><span className="princess-seal-disc" /><Star /></button><p className="princess-touch-prompt">轻触星光 · {muted ? '悄悄入场' : '有声入场'}</p><p className="princess-entry-footnote">这次，我来当你的私人导游。</p></div>
      </section>}

      {isFilm && <section className="princess-cinema-ui princess-chapter-content" aria-label={chapterNames[chapter]}>
        <div className="princess-chapter-marker"><span>{replay ? 'REPLAY' : chapter === 'arrival' ? '01' : '03'}</span><i />{chapter === 'arrival' ? '城堡初见' : '午夜舞厅'}</div>
        {(filmStatus === 'loading' || filmStatus === 'blocked' || filmStatus === 'error' || filmStatus === 'paused') && <div className={`princess-film-message princess-film-message-${filmStatus}`} role="status">
          {filmStatus === 'loading' ? <><span className="princess-loading-star"><Star /></span><p>{slowFilm ? '这一幕还在路上，可以先去下一站。' : '星光就位中…'}</p></> : <><button type="button" className="princess-film-play princess-icon-button" aria-label={filmStatus === 'error' ? '重新载入这一幕' : '播放这一幕'} onClick={() => filmStatus === 'error' && clipRef.current ? startFilm(clipRef.current, replayRef.current) : toggleFilm()}><PlaybackIcon playing={false} /></button><p>{filmStatus === 'error' ? '这一幕暂时没打开。可以重试，也可以继续。' : filmStatus === 'blocked' ? '轻触，开始这一幕。' : '等你，多久都行。'}</p></>}
        </div>}
        <div className="princess-cinema-bottom"><h2 className="princess-film-caption">{chapter === 'arrival' ? <><span>城堡都搬来了。</span><small>现在说“路过”，是不是有点假？</small></> : <><span>先别放烟花。</span><small>我还有一句正经的。</small></>}</h2><div className="princess-film-controls"><button type="button" onClick={toggleFilm} disabled={filmStatus === 'error'} aria-label={filmWantsToPlay ? '暂停短片' : '播放短片'}><PlaybackIcon playing={filmWantsToPlay} /><span>{filmWantsToPlay ? '暂停' : '播放'}</span></button><span className="princess-film-track" role="progressbar" aria-label="短片进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(filmProgress * 100)}><i style={{ transform: `scaleX(${filmProgress})` }} /></span><button type="button" onClick={finishFilm}><span>{replay ? '回到烟花' : '下一站'}</span><Arrow /></button></div></div>
      </section>}

      {chapter === 'crown' && <section className="princess-coronation princess-chapter-content" aria-labelledby="princess-crown-title"><div className="princess-chapter-marker"><span>02</span><i />公主加冕</div><div className="princess-crown-copy"><p className="princess-overline">属于你的，不用踮脚。</p><h2 id="princess-crown-title">皇冠归你。<br /><em>紧张归我。</em></h2></div><div className="princess-crown-touch-hint">{sceneFailed ? '星光已经为你戴好' : '左右轻拨 · 看看你的皇冠'}<span aria-hidden="true">↔</span></div><div className="princess-crown-entry"><button type="button" className={`princess-star-seal princess-charge-seal${holding ? ' princess-seal-charging' : ''}`} aria-label="进入午夜舞厅。可以轻点，也可以按住一秒蓄满星光后松开。" aria-describedby="princess-crown-help" onPointerDown={startCharge} onPointerUp={stopCharge} onPointerCancel={cancelCharge} onLostPointerCapture={stopCharge} onContextMenu={event => event.preventDefault()} onClick={() => startFilm('ballroom')}><svg className="princess-charge-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" /><circle cx="50" cy="50" r="45" pathLength="100" strokeDasharray={`${charge * 100} 100`} /></svg><span className="princess-seal-disc" /><Star /></button><p className="princess-touch-prompt" id="princess-crown-help">{charge >= 1 ? '星光满了。松手，进舞厅。' : holding ? '再借一点星光…' : '按住星印蓄光 · 松手出发'}</p><button type="button" className="princess-quiet-link" onClick={() => startFilm('ballroom')}>轻点这里，也能继续 <Arrow /></button></div></section>}

      {isSky && <><button type="button" className="princess-sky-touch" disabled={chapter === 'confession' && !confessionReady} aria-label={chapter === 'confession' ? '轻触夜空，为思仪放烟花' : '轻触放烟花，长按后松开可以放更大的烟花'} onPointerDown={startSkyPress} onPointerUp={endSkyPress} onPointerCancel={event => { if (skyPress.current?.pointerId === event.pointerId) { skyPress.current = null; setHolding(false); } }} onContextMenu={event => event.preventDefault()} onClick={event => { if (ignoreSkyClick.current && event.detail !== 0) { ignoreSkyClick.current = false; return; } firework(0.5, 0.3, 0.75); }} />
        <section className={`princess-sky-copy princess-chapter-content${chapter === 'finale' || confessionReady ? ' princess-confession-revealed' : ''}`} aria-live="polite">{chapter === 'confession' ? <><span className="princess-confession-star" aria-hidden="true"><Star /></span><p className="princess-overline">绕了一个城堡，其实就为这一句。</p><h2>谭陈思仪，<br /><em>我喜欢你。</em></h2><p className="princess-signature"><span />奕辰</p><p className="princess-sky-hint">轻触夜空，替我放个烟花。</p></> : <><span className="princess-finale-note">这一晚，你是唯一的女主角。</span><h2 className="princess-finale-title">说完了。<br /><em>烟花，给我往大了放。</em></h2></>}</section>
        {chapter === 'finale' && <footer className="princess-finale-footer"><p>{holding ? '蓄着呢。这一朵要大一点。' : '轻点放烟花 · 长按，来一场大的'}</p><nav aria-label="重游城堡"><button type="button" onClick={restart}>再玩一次</button><i /><button type="button" onClick={() => startFilm('arrival', true)}>重看城堡</button><i /><button type="button" onClick={() => startFilm('ballroom', true)}>重看舞厅</button></nav></footer>}
      </>}

      <div className="princess-chapter-dots" role="img" aria-label={chapterNames[chapter]}>{chapterOrder.map(value => <span key={value} className={value === chapter ? 'princess-dot-current' : ''} />)}</div>
    </div>
  </main>;
}
