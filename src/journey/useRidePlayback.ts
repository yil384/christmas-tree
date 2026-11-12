import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type Hls from 'hls.js';
import { assetUrl } from '../lib/content';
import { RIDE_DURATION } from './rideHotspots';

export type RidePlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked' | 'error' | 'ended';
type RideDiagnostics = {
  engine: string; lastEvent: string; hlsError: string; fatalError: string;
  mediaError: string; recoveryCount: string; level: string; events: string;
};
let hlsImport: Promise<typeof import('hls.js')> | undefined;
const loadHls = () => hlsImport ??= import('hls.js').catch(error => { hlsImport = undefined; throw error; });

function hasMediaSource() {
  return Boolean(window.MediaSource || (window as Window & { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource);
}

function prefersAppleNativePlayback() {
  const agent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/i.test(agent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari\//i.test(agent) && !/Chrome|Chromium|CriOS|Edg|OPR|Android|FxiOS/i.test(agent);
  return ios || safari;
}

/** One original-speed stream owns the entire ride clock. Interactions never advance it. */
export function useRidePlayback(videoRef: RefObject<HTMLVideoElement>, visible: boolean, muted: boolean) {
  const [status, commitStatus] = useState<RidePlaybackStatus>('idle');
  const [started, setStarted] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(RIDE_DURATION);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [bufferedTo, setBufferedTo] = useState(0);
  const [diagnostics, setDiagnostics] = useState<RideDiagnostics>({
    engine: 'idle', lastEvent: 'idle', hlsError: '', fatalError: '', mediaError: '',
    recoveryCount: 'network=0,media=0', level: '', events: '',
  });
  const hlsRef = useRef<Hls | null>(null);
  const attachingRef = useRef<Promise<void> | null>(null);
  const generation = useRef(0);
  const wanted = useRef(false);
  const visibleRef = useRef(visible);
  const mutedRef = useRef(muted);
  const startedRef = useRef(false);
  const statusRef = useRef(status);
  const pendingSeek = useRef<number | null>(null);
  const nativeRef = useRef(false);
  const forceMse = useRef(false);
  const resumeAfterRecovery = useRef(false);
  const recoveryCount = useRef({ network: 0, media: 0 });
  const source = assetUrl('journey/film/index-birdfree-r1.m3u8');
  const setStatus = useCallback((next: RidePlaybackStatus) => {
    statusRef.current = next;
    commitStatus(next);
  }, []);
  visibleRef.current = visible;
  mutedRef.current = muted;
  const trace = useCallback((event: string, detail: Partial<RideDiagnostics> = {}) => {
    const at = videoRef.current?.currentTime ?? 0;
    const record = `${Number.isFinite(at) ? at.toFixed(3) : '?'}:${event}`;
    setDiagnostics(previous => ({ ...previous, ...detail, lastEvent: record,
      recoveryCount: `network=${recoveryCount.current.network},media=${recoveryCount.current.media}`,
      events: [...previous.events.split(' | ').filter(Boolean), record].slice(-10).join(' | '),
    }));
  }, [videoRef]);

  const tryPlay = useCallback((token: number) => {
    const video = videoRef.current;
    if (!video || !wanted.current || !visibleRef.current) return;
    video.muted = mutedRef.current;
    video.playbackRate = 1;
    const result = video.play();
    if (result) void result.catch(error => {
      if (generation.current !== token || !wanted.current) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      trace('play-rejected', { fatalError: `${error?.name ?? 'Error'}:${String(error?.message ?? error).slice(0, 400)}` });
      setStatus(error instanceof DOMException && error.name === 'NotSupportedError' ? 'error' : 'blocked');
    });
  }, [setStatus, trace, videoRef]);

  const attach = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const token = ++generation.current;
    video.muted = mutedRef.current;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    // Chromium can advertise HLS while its native demuxer cannot play the file.
    // iOS/WebKit keeps the synchronous native path; MSE-capable Chromium uses hls.js.
    nativeRef.current = !forceMse.current && Boolean(video.canPlayType('application/vnd.apple.mpegurl'))
      && (prefersAppleNativePlayback() || !hasMediaSource());
    resumeAfterRecovery.current = false;
    recoveryCount.current = { network: 0, media: 0 };
    trace('attach', { engine: nativeRef.current ? 'native-hls' : 'hls.js-mse' });
    if (nativeRef.current) {
      // Native Safari HLS is assigned and played within the original click.
      video.src = source;
      tryPlay(token);
      return;
    }
    video.disableRemotePlayback = true;
    const operation = loadHls().then(({ default: HlsClass }) => {
      if (generation.current !== token) return;
      if (!HlsClass.isSupported()) { trace('mse-unsupported', { engine: 'unsupported' }); setStatus('error'); return; }
      const hls = new HlsClass({
        enableWorker: true,
        autoStartLoad: false,
        maxBufferLength: 18,
        maxMaxBufferLength: 30,
        backBufferLength: 12,
        capLevelToPlayerSize: true,
      });
      hlsRef.current = hls;
      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
        trace('manifest-parsed');
        if (generation.current !== token || !wanted.current || !visibleRef.current) return;
        hls.startLoad(pendingSeek.current ?? -1);
        tryPlay(token);
      });
      hls.on(HlsClass.Events.LEVEL_SWITCHED, (_event, data) => {
        const level = hls.levels[data.level];
        trace('level-switched', { level: `${data.level}:${level?.width ?? '?'}x${level?.height ?? '?'}` });
      });
      hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (generation.current !== token) return;
        const description = JSON.stringify({ type: data.type, details: data.details, fatal: data.fatal,
          reason: data.reason, message: data.error?.message, code: data.response?.code, fragment: data.frag?.sn }).slice(0, 900);
        trace(data.fatal ? 'hls-fatal' : 'hls-warning', { hlsError: description, ...(data.fatal ? { fatalError: description } : {}) });
        if (!data.fatal) return;
        const manifestFailure = data.details === HlsClass.ErrorDetails.MANIFEST_LOAD_ERROR
          || data.details === HlsClass.ErrorDetails.MANIFEST_LOAD_TIMEOUT
          || data.details === HlsClass.ErrorDetails.MANIFEST_PARSING_ERROR;
        if (manifestFailure) {
          // startLoad() cannot fetch a failed manifest; a user retry reattaches it.
          hls.stopLoad();
          wanted.current = false;
          setStatus('error');
        } else if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR && recoveryCount.current.network < 2 && wanted.current && visibleRef.current) {
          recoveryCount.current.network++;
          trace('recover-network');
          setStatus('loading');
          hls.startLoad(Number.isFinite(video.currentTime) ? video.currentTime : -1);
        } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR && recoveryCount.current.media < 1 && wanted.current && visibleRef.current) {
          recoveryCount.current.media++;
          trace('recover-media');
          resumeAfterRecovery.current = true;
          if (Number.isFinite(video.currentTime)) pendingSeek.current = video.currentTime;
          setStatus('loading');
          hls.recoverMediaError();
        } else {
          hls.stopLoad();
          wanted.current = false;
          setStatus('error');
        }
      });
      hls.loadSource(source);
      hls.attachMedia(video);
    }).catch(error => {
      if (generation.current === token) { trace('attach-rejected', { fatalError: String(error?.message ?? error).slice(0, 400) }); wanted.current = false; setStatus('error'); }
    }).finally(() => {
      if (generation.current === token) attachingRef.current = null;
    });
    attachingRef.current = operation;
  }, [setStatus, source, trace, tryPlay, videoRef]);

  const retryNativeWithMse = useCallback(() => {
    const video = videoRef.current;
    if (!video || !nativeRef.current || forceMse.current || !hasMediaSource() || !wanted.current) return false;
    forceMse.current = true;
    pendingSeek.current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    generation.current++;
    setStatus('loading');
    trace('native-to-mse');
    video.pause();
    video.removeAttribute('src');
    video.load();
    attach();
    return true;
  }, [attach, setStatus, trace, videoRef]);

  const play = useCallback((reload = false) => {
    const video = videoRef.current;
    if (!video) return;
    startedRef.current = true;
    setStarted(true);
    wanted.current = true;
    video.muted = mutedRef.current;
    if (video.ended) { pendingSeek.current = null; video.currentTime = 0; setTime(0); }
    const failed = reload || statusRef.current === 'error';
    setAttempt(previous => previous + 1);
    setSlow(false);
    setStatus('loading');
    if (failed) {
      const at = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      pendingSeek.current = at > 0 && !video.ended ? at : 0;
      generation.current++;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      attachingRef.current = null;
      video.removeAttribute('src');
      video.load();
      attach();
    } else if (hlsRef.current) {
      hlsRef.current.startLoad(video.currentTime);
      tryPlay(generation.current);
    } else if (nativeRef.current && video.getAttribute('src')) {
      tryPlay(generation.current);
    } else if (!attachingRef.current) attach();
  }, [attach, setStatus, tryPlay, videoRef]);

  const pause = useCallback(() => {
    wanted.current = false;
    resumeAfterRecovery.current = false;
    videoRef.current?.pause();
    hlsRef.current?.stopLoad();
    if (startedRef.current && statusRef.current !== 'ended' && statusRef.current !== 'error' && statusRef.current !== 'blocked') setStatus('paused');
  }, [setStatus, videoRef]);

  const replay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    pendingSeek.current = null;
    video.currentTime = 0;
    setTime(0);
    play();
  }, [play, videoRef]);

  const seek = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const next = Math.max(0, Math.min(video.duration - 0.05, video.currentTime + delta));
    video.currentTime = next;
    setTime(next);
    if (statusRef.current === 'ended') setStatus('paused');
    if (wanted.current) hlsRef.current?.startLoad(next);
  }, [setStatus, videoRef]);

  const syncTime = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (pendingSeek.current !== null) setTime(pendingSeek.current);
    else if (Number.isFinite(video.currentTime)) setTime(video.currentTime);
    if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
    const ranges = video.buffered;
    for (let index = 0; index < ranges.length; index++) {
      if (ranges.start(index) <= video.currentTime + 0.5 && ranges.end(index) >= video.currentTime) {
        setBufferedTo(ranges.end(index));
        break;
      }
    }
  }, [videoRef]);

  const loadedMetadata = useCallback(() => {
    trace('loadedmetadata');
    const video = videoRef.current;
    if (video && pendingSeek.current !== null && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(pendingSeek.current, Math.max(0, video.duration - 0.05));
      pendingSeek.current = null;
    }
    syncTime();
  }, [syncTime, trace, videoRef]);

  const mediaError = useCallback(() => {
    if (!startedRef.current) return;
    const error = videoRef.current?.error;
    trace('media-error', { mediaError: error ? `${error.code}:${error.message || 'no browser message'}` : 'event without MediaError' });
    // Hls.js owns its bounded decoder recovery; native Safari reports directly.
    if (!nativeRef.current) return;
    if ((error?.code === 3 || error?.code === 4) && retryNativeWithMse()) return;
    wanted.current = false;
    setStatus('error');
  }, [retryNativeWithMse, setStatus, trace, videoRef]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted, videoRef]);
  useEffect(() => { if (!visible) pause(); }, [pause, visible]);
  useEffect(() => {
    setSlow(false);
    if (status !== 'loading') return;
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [attempt, status]);
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      generation.current++;
      wanted.current = false;
      attachingRef.current = null;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video?.pause();
      video?.removeAttribute('src');
      video?.load();
    };
  }, [videoRef]);

  return {
    status, started, hasFrame, time, duration, slow, bufferedTo, diagnostics, play, pause, replay, seek,
    videoEvents: {
      onLoadedMetadata: loadedMetadata,
      onDurationChange: syncTime,
      onTimeUpdate: syncTime,
      onProgress: syncTime,
      onCanPlay: () => {
        trace('canplay');
        // Decoder recovery replaces MediaSource without reparsing the manifest.
        if (resumeAfterRecovery.current) tryPlay(generation.current);
      },
      onPlaying: () => {
        trace('playing');
        if (!wanted.current || !visibleRef.current) { videoRef.current?.pause(); return; }
        resumeAfterRecovery.current = false;
        setHasFrame(true);
        setStatus('playing');
      },
      onWaiting: () => { trace('waiting'); if (wanted.current) setStatus('loading'); },
      onPause: () => {
        trace('pause');
        if (startedRef.current && videoRef.current?.paused && !videoRef.current.ended
          && statusRef.current !== 'error' && statusRef.current !== 'blocked' && !resumeAfterRecovery.current
          && (!wanted.current || statusRef.current === 'playing')) {
          wanted.current = false;
          hlsRef.current?.stopLoad();
          setStatus('paused');
        }
      },
      onEnded: () => { trace('ended'); wanted.current = false; setStatus('ended'); syncTime(); },
      onError: mediaError,
    },
  };
}
