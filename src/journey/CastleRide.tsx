import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { assetUrl } from '../lib/content';
import { RIDE_HOTSPOTS } from './rideHotspots';
import type { RideBurst, RideEffectKind, RideHotspot } from './rideTypes';
import RideMagicFallback from './RideMagicFallback';
import RideFinaleFallback from './RideFinaleFallback';
import RideConfession, { ConfessionSeal } from './RideConfession';
import { useRideEnvironment } from './useRideEnvironment';
import { useRideChimes } from './useRideChimes';
import { useRidePlayback } from './useRidePlayback';
import { useRideSequence } from './useRideSequence';
import { useFinaleSound } from './useFinaleSound';
import './CastleRide.css';

const MagicScene = lazy(() => import('./RideMagicScene'));
let finaleImport: Promise<typeof import('./finale/FinaleScene')> | undefined;
const loadFinale = () => finaleImport ??= import('./finale/FinaleScene').catch(error => { finaleImport = undefined; throw error; });
const FinaleScene = lazy(loadFinale);
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));

function SoundIcon({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 5-4 4H3v6h3l4 4V5Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />{muted ? <path d="m15 9 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /> : <path d="M14 8c2.5 2.2 2.5 5.8 0 8m3-11c4.5 3.7 4.5 10.3 0 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />}</svg>;
}
function PlayIcon({ playing = false }: { playing?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{playing ? <path d="M8 6v12M16 6v12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /> : <path d="m9 5 10 7-10 7V5Z" fill="currentColor" />}</svg>;
}
function SeekIcon({ forward = false }: { forward?: boolean }) {
  return <svg viewBox="0 0 26 24" fill="none" aria-hidden="true" style={forward ? { transform: 'scaleX(-1)' } : undefined}><path d="m13 6-7 6 7 6m9-12-7 6 7 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 6v12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
}
function ReplayIcon() {
  return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M6.2 9A9 9 0 1 1 5 16M6 4v6h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function DiscoveryGlint() {
  return <svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><path d="m22 12 2.2 7.8L32 22l-7.8 2.2L22 32l-2.2-7.8L12 22l7.8-2.2L22 12Z" fill="currentColor" /><circle cx="8" cy="16" r=".8" fill="currentColor" /><circle cx="34" cy="29" r="1" fill="currentColor" /><circle cx="29" cy="8" r=".7" fill="currentColor" /></svg>;
}
function EntranceKey() {
  return <svg viewBox="0 0 100 124" fill="none" aria-hidden="true"><path d="M50 6c0 9-5 14-14 14 9 0 14 5 14 14 0-9 5-14 14-14-9 0-14-5-14-14Z" fill="currentColor" opacity=".8" /><path d="M32 26c-11 10-11 26 0 34 11 8 25 8 36 0 11-8 11-24 0-34M39 30c-13 8-12 23 0 29m22-29c13 8 12 23 0 29M50 67v43m0-25h10v8H50m0 10H39v-8M45 112h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /><path d="m46 36 12 8-12 8V36Z" fill="currentColor" /><path d="M26 40c-5-1-7 2-5 6 3 5 9 3 10 0m43-6c5-1 7 2 5 6-3 5-9 3-10 0" stroke="currentColor" strokeWidth=".8" opacity=".65" /><circle cx="50" cy="118" r="1.3" fill="currentColor" /></svg>;
}

class MagicBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Positions are authored against the 9:16 source; do not pin them to phone pixels. */
function placeHotspot(hotspot: RideHotspot, time: number, width: number, height: number) {
  const progress = clamp((time - hotspot.from) / (hotspot.to - hotspot.from));
  const sourceX = hotspot.x + ((hotspot.endX ?? hotspot.x) - hotspot.x) * progress;
  const sourceY = hotspot.y + ((hotspot.endY ?? hotspot.y) - hotspot.y) * progress;
  const movieWidth = Math.max(width, height * 9 / 16);
  const movieHeight = Math.max(height, width * 16 / 9);
  return {
    x: (sourceX * movieWidth - (movieWidth - width) / 2) / width,
    y: (sourceY * movieHeight - (movieHeight - height) / 2) / height,
  };
}

export default function CastleRide() {
  const shellRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { visible, reducedMotion, bounds } = useRideEnvironment(shellRef, stageRef);
  const { muted, unlock: unlockChimes, toggle, chime, getContext } = useRideChimes(visible);
  const film = useRidePlayback(videoRef, visible, muted);
  const movie = useRideSequence(film, visible);
  const inFinale = movie.phase === 'finale';
  const finaleSound = useFinaleSound({ audioRef, getContext, started: movie.started,
    filmTime: film.time, filmDuration: film.duration, inFinale,
    time: movie.finaleTime, playing: movie.finalePlaying, muted, visible });
  const unlock = useCallback(() => { unlockChimes(); finaleSound.unlock(); }, [finaleSound.unlock, unlockChimes]);
  const [magicUnavailable, setMagicUnavailable] = useState(false);
  const [finaleUnavailable, setFinaleUnavailable] = useState(false);
  const [burst, setBurst] = useState<RideBurst>();
  const burstId = useRef(0);
  const burstPhase = useRef<'film' | 'finale'>('film');
  const visibleBurst = burstPhase.current === movie.phase ? burst : undefined;
  const [awakened, setAwakened] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [discovered, setDiscovered] = useState<Set<string>>(() => new Set());
  const [confessionOpen, setConfessionOpen] = useState(false);
  const confessionSeen = useRef(false);
  const resumeAfterConfession = useRef(false);
  const press = useRef<{ pointer: number; at: number; x: number; y: number; lastTrail: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);
  const playing = movie.status === 'playing';
  const loading = movie.status === 'loading';
  const ended = movie.status === 'ended';
  const effectsActive = visible && (playing || ended);
  const interrupted = movie.status === 'paused' || movie.status === 'blocked' || movie.status === 'error';
  const showControls = movie.started && (awakened || !playing);
  const showCenterPlay = movie.started && (interrupted || (loading && movie.slow));
  const finaleSoon = movie.started && (inFinale || film.time >= film.duration - 20);

  const wakeControls = useCallback(() => {
    clearTimeout(controlsTimer.current);
    setAwakened(true);
    controlsTimer.current = setTimeout(() => setAwakened(false), 3200);
  }, []);

  useEffect(() => {
    if (playing) wakeControls();
    else { clearTimeout(controlsTimer.current); setAwakened(true); }
  }, [playing, wakeControls]);

  useEffect(() => {
    if (!visible) press.current = null;
  }, [visible]);
  useEffect(() => { if (finaleSoon) void loadFinale().catch(() => setFinaleUnavailable(true)); }, [finaleSoon]);
  useEffect(() => () => clearTimeout(controlsTimer.current), []);

  useEffect(() => {
    if (!ended || confessionSeen.current) return;
    confessionSeen.current = true;
    resumeAfterConfession.current = false;
    setConfessionOpen(true);
  }, [ended]);

  const unavailable = useCallback(() => setMagicUnavailable(true), []);
  const unavailableFinale = useCallback(() => setFinaleUnavailable(true), []);
  const emit = useCallback((kind: RideEffectKind, x: number, y: number, power = 0.65, sound = true) => {
    unlock();
    burstPhase.current = movie.phase;
    setBurst({ id: ++burstId.current, kind, x: clamp(x, 0.03, 0.97), y: clamp(y, 0.06, 0.91), power });
    if (sound) chime(kind, power);
  }, [chime, movie.phase, unlock]);

  const pointAt = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height } : { x: 0.5, y: 0.5 };
  };

  const beginTouch = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (!effectsActive) { wakeControls(); return; }
    const point = pointAt(event.clientX, event.clientY);
    unlock();
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { pointer: event.pointerId, at: performance.now(), ...point, lastTrail: 0, moved: false };
  };
  const moveTouch = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const previous = press.current;
    if (!previous || previous.pointer !== event.pointerId || reducedMotion || !effectsActive) return;
    const point = pointAt(event.clientX, event.clientY);
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const now = performance.now();
    if (distance > 0.02) previous.moved = true;
    if (previous.moved && now - previous.lastTrail > 170) {
      previous.lastTrail = now;
      emit(inFinale ? 'stars' : 'fireflies', point.x, point.y, 0.18, false);
    }
  };
  const endTouch = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const previous = press.current;
    if (!previous || previous.pointer !== event.pointerId) return;
    press.current = null;
    ignoreClick.current = true;
    const point = pointAt(event.clientX, event.clientY);
    if (!previous.moved && effectsActive) emit(inFinale ? 'fireworks' : 'fireflies', point.x, inFinale ? Math.min(0.42, point.y) : point.y, Math.min(1, 0.35 + (performance.now() - previous.at) / 1300));
    if (!ended) wakeControls();
  };

  const start = () => { unlock(); movie.play(loading && movie.slow); };
  const restart = () => { unlock(); setDiscovered(new Set()); setBurst(undefined); movie.replay(); };
  const togglePlayback = () => { unlock(); if (playing || loading) movie.pause(); else movie.play(); wakeControls(); };
  const openConfession = () => {
    unlock();
    confessionSeen.current = true;
    resumeAfterConfession.current = playing || loading;
    if (movie.started && !ended) movie.pause();
    setConfessionOpen(true);
  };
  const closeConfession = (continueJourney = false) => {
    setConfessionOpen(false);
    if (continueJourney || resumeAfterConfession.current) {
      unlock();
      if (!ended) movie.play();
    }
    resumeAfterConfession.current = false;
    wakeControls();
  };
  const activeHotspots = playing && !inFinale
    ? RIDE_HOTSPOTS.filter(hotspot => movie.time >= hotspot.from && movie.time <= hotspot.to)
    : [];
  const fraction = movie.duration > 0 ? clamp(movie.time / movie.duration) : 0;
  const bufferFraction = movie.duration > 0 ? clamp(movie.bufferedTo / movie.duration) : 0;

  return <main ref={shellRef} className={`castle-ride${reducedMotion ? ' ride-reduced-motion' : ''}${!visible ? ' ride-hidden' : ''}`} aria-label="思仪的城堡奇幻之旅"
    data-phase={movie.phase} data-status={movie.status} data-time={movie.time.toFixed(2)} data-duration={movie.duration.toFixed(2)}
    data-finale-time={movie.finaleTime.toFixed(2)} data-film-status={film.status} data-sound={finaleSound.status} data-muted={muted}
    data-media-engine={film.diagnostics.engine} data-hls-error={film.diagnostics.hlsError} data-fatal-error={film.diagnostics.fatalError}
    data-media-error={film.diagnostics.mediaError} data-recovery-count={film.diagnostics.recoveryCount}
    data-last-event={film.diagnostics.lastEvent} data-media-events={film.diagnostics.events} data-hls-level={film.diagnostics.level}
    data-confession={confessionOpen ? 'open' : confessionSeen.current ? 'seen' : 'unseen'}>
    <div ref={stageRef} className={`ride-stage ride-status-${movie.status}${showControls ? ' ride-controls-awake' : ''}`}>
      <img className={`ride-cover${movie.hasFrame ? ' ride-cover-behind' : ''}`} src={assetUrl('journey/cover.webp')} alt="" {...{ fetchpriority: 'high' }} decoding="async" draggable="false" aria-hidden="true" />
      <video ref={videoRef} className={`ride-film${movie.hasFrame ? ' ride-film-visible' : ''}`} preload="none" poster={assetUrl('journey/cover.webp')} playsInline muted={muted} controls={false} disablePictureInPicture tabIndex={-1} aria-label="城堡奇幻巡游影片" aria-hidden={!movie.started || inFinale} {...film.videoEvents} />
      <audio ref={audioRef} className="ride-score" preload="none" aria-hidden="true" />
      {finaleSoon && <div className={`ride-finale-layer${inFinale ? ' ride-finale-visible' : ''}`} aria-hidden="true">
        <img className="ride-finale-palace" src={assetUrl('journey/finale-palace.webp')} alt="" decoding="async" draggable="false" />
        {inFinale && <div className="ride-finale-magic">
          {finaleUnavailable ? <RideFinaleFallback time={movie.finaleTime} active={effectsActive} reducedMotion={reducedMotion} burst={visibleBurst} />
            : <MagicBoundary onUnavailable={unavailableFinale}><Suspense fallback={<RideFinaleFallback time={movie.finaleTime} active={effectsActive} reducedMotion={reducedMotion} burst={visibleBurst} />}>
              <FinaleScene totalTime={movie.finaleTime} playing={effectsActive} muted={muted} reducedMotion={reducedMotion} burst={visibleBurst} onEnd={movie.finishFinale} onUnavailable={unavailableFinale} />
            </Suspense></MagicBoundary>}
        </div>}
      </div>}
      <div className="ride-edge-shade" aria-hidden="true" />

      {movie.started && <>
        {!inFinale && film.hasFrame && <div className="ride-magic-layer" aria-hidden="true">
          {magicUnavailable ? <RideMagicFallback burst={visibleBurst} active={effectsActive} reducedMotion={reducedMotion} /> : <MagicBoundary onUnavailable={unavailable}><Suspense fallback={<RideMagicFallback burst={visibleBurst} active={effectsActive} reducedMotion={reducedMotion} />}><MagicScene burst={visibleBurst} active={effectsActive} reducedMotion={reducedMotion} onUnavailable={unavailable} /></Suspense></MagicBoundary>}
        </div>}
        <button type="button" className="ride-world-touch" tabIndex={ended ? 0 : -1} aria-label={ended ? '轻触夜空放烟花，长按后松开会更大' : '轻触或划过画面，唤起星光并显示播放控制'}
          onPointerDown={beginTouch} onPointerMove={moveTouch} onPointerUp={endTouch}
          onPointerCancel={() => { press.current = null; }} onLostPointerCapture={() => { press.current = null; }} onContextMenu={event => event.preventDefault()}
          onClick={event => { if (ignoreClick.current && event.detail !== 0) { ignoreClick.current = false; return; } if (effectsActive) emit(inFinale ? 'fireworks' : 'fireflies', 0.5, inFinale ? 0.3 : 0.55, 0.75); if (!ended) wakeControls(); }} />
        <div className="ride-discovery-layer">
          {activeHotspots.map(hotspot => {
            const position = placeHotspot(hotspot, movie.time, bounds.width, bounds.height);
            // A crop can legitimately place an authored object outside this phone.
            if (position.x < 0.04 || position.x > 0.96 || position.y < 0.09 || position.y > 0.84) return null;
            return <button key={hotspot.id} type="button" className={`ride-hotspot ride-hotspot-${hotspot.kind}${discovered.has(hotspot.id) ? ' ride-hotspot-found' : ''}`} style={{ '--hotspot-x': `${position.x * 100}%`, '--hotspot-y': `${position.y * 100}%` } as CSSProperties} aria-label={hotspot.label}
              onClick={event => {
                const point = event.detail === 0 ? position : pointAt(event.clientX, event.clientY);
                emit(hotspot.kind, point.x, point.y, hotspot.power ?? 0.8);
                setDiscovered(previous => new Set(previous).add(hotspot.id));
              }}><DiscoveryGlint /></button>;
          })}
        </div>
      </>}

      {!movie.started && <div className="ride-invitation">
        <button type="button" className="ride-entrance-key" aria-label="开始城堡奇幻巡游" onClick={start}><span className="ride-key-aura" /><EntranceKey /></button>
      </div>}

      <button type="button" className={`ride-sound ride-icon-control${movie.started && !showControls ? ' ride-control-resting' : ''}`} aria-label={muted ? '打开声音' : '关闭声音'} aria-pressed={!muted} onClick={() => { unlock(); const next = toggle(); if (videoRef.current) videoRef.current.muted = next; if (audioRef.current) audioRef.current.muted = next; if (movie.started) wakeControls(); }}><SoundIcon muted={muted} /></button>
      <button type="button" className={`ride-love-seal${movie.started && !showControls ? ' ride-control-resting' : ''}`} aria-label="打开给谭陈思仪的表白" onClick={openConfession}><ConfessionSeal /></button>

      {loading && !movie.slow && <div className="ride-buffering" role="status" aria-label="正在载入旅程"><span /><span /><span /></div>}
      {showCenterPlay && <div className="ride-resume"><button type="button" className="ride-resume-control" aria-label={movie.status === 'error' || movie.slow ? '重新尝试播放，并从刚才的位置继续' : '继续城堡巡游'} onClick={start}>{movie.status === 'error' || movie.slow ? <ReplayIcon /> : <PlayIcon />}</button></div>}

      {movie.started && <div className="ride-control-dock" aria-label="旅程播放控制">
        <div className="ride-playback-buttons">
          <button type="button" className="ride-icon-control" aria-label="回看十五秒" onClick={() => { unlock(); movie.seek(-15); wakeControls(); }}><SeekIcon /></button>
          <button type="button" className="ride-icon-control" aria-label={ended ? '重新游览' : playing || loading ? '暂停巡游' : '继续巡游'} onClick={ended ? restart : togglePlayback}>{ended ? <ReplayIcon /> : <PlayIcon playing={playing || loading} />}</button>
          <button type="button" className="ride-icon-control" aria-label="前进十五秒" disabled={ended} onClick={() => { unlock(); movie.seek(15); wakeControls(); }}><SeekIcon forward /></button>
        </div>
        <div className="ride-progress" role="progressbar" aria-label="旅程进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)}><i className="ride-buffered" style={{ transform: `scaleX(${bufferFraction})` }} /><i className="ride-played" style={{ transform: `scaleX(${fraction})` }} /></div>
      </div>}
      <span className="ride-sr-only" role="status" aria-live="polite">{movie.status === 'error' ? '影片暂时未能载入，可按重新播放按钮重试。' : movie.status === 'blocked' ? '请轻触播放按钮继续。' : ended ? '旅程结束。轻触夜空可以继续放烟花，或重新游览。' : ''}</span>
      {confessionOpen && <RideConfession started={movie.started} onClose={() => closeConfession()} onContinue={() => closeConfession(true)}
        onAnswer={reply => { if (reply === 'yes') emit(inFinale ? 'fireworks' : 'petals', 0.5, 0.24, 1); }} />}
    </div>
  </main>;
}
