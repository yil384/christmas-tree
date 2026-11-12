import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../lib/content';
import { formatFilmDuration } from '../lib/film-presentation';
import { Icon } from './Icon';

interface Props {
  src: string;
  poster?: string;
  opening?: boolean;
  onEnter?: () => void;
  onDuration?: (duration: number) => void;
}

export default function ChristmasFilm({ src, poster, opening = false, onEnter, onDuration }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(!opening);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!opening);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [hasMedia, setHasMedia] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [muted, setMuted] = useState(opening);
  const [duration, setDuration] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const videoUrl = assetUrl(src);

  useEffect(() => {
    const video = videoRef.current;
    // Skipping the invitation must never start a multi-minute MP4 download.
    if (!video || !started) return;
    const controller = new AbortController();
    let disposed = false;
    let objectUrl: string | null = null;
    setHasMedia(false);
    setFailed(false);
    setLoading(true);
    setNeedsPlay(false);
    // Sites can deliver the whole file without exposing a usable seek range.
    // Give the video one complete local MP4, never a competing HTTP source.
    // Deferring one microtask also lets StrictMode cancel its first setup
    // before starting a redundant request.
    void Promise.resolve().then(async () => {
      if (disposed) return;
      const response = await fetch(videoUrl, { signal: controller.signal });
      if (!response.ok) throw new Error('Film download failed');
      const data = await response.blob();
      if (disposed || controller.signal.aborted) return;
      if (!data.size) throw new Error('Film is empty');
      objectUrl = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }));
      video.src = objectUrl;
      video.load();
      setHasMedia(true);
      // Downloading may outlive user activation. Offer one clear play button
      // if the browser requires another tap before playing with sound.
      await video.play().catch(() => {
        if (!disposed && !video.error) { setNeedsPlay(true); setLoading(false); }
      });
    }).catch(() => {
      if (!disposed && !controller.signal.aborted) { setFailed(true); setLoading(false); }
    });
    return () => {
      disposed = true;
      controller.abort();
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [videoUrl, attempt, started]);

  const retry = () => {
    setFailed(false);
    setLoading(true);
    setNeedsPlay(false);
    setAttempt(value => value + 1);
  };
  const play = () => {
    const video = videoRef.current;
    video?.play().catch(() => {
      if (videoRef.current === video && video.isConnected && !video.error) setNeedsPlay(true);
    });
  };
  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    // Unmuting stays inside this tap's user activation on mobile browsers.
    if (!video.muted && video.paused) play();
  };

  return <div className="christmas-film">
    <header className="film-heading"><span>一段送给小喵的圣诞奇遇</span><h2>星光归来</h2></header>
    <div className={`film-screen${failed ? ' has-error' : ''}`} style={{ aspectRatio }}>
      <video ref={videoRef} key={`${src}:${attempt}`} poster={poster ? assetUrl(poster) : undefined}
        aria-label={`星光归来${duration ? `，${formatFilmDuration(duration)}` : ''}`} aria-hidden={!started} tabIndex={hasMedia ? 0 : -1} controls={hasMedia} playsInline muted={muted} preload="metadata"
        onLoadedMetadata={event => {
          const video = event.currentTarget;
          if (Number.isFinite(video.duration) && video.duration > 0) {
            setDuration(video.duration);
            onDuration?.(video.duration);
          }
          if (video.videoWidth && video.videoHeight) setAspectRatio(video.videoWidth / video.videoHeight);
        }}
        onVolumeChange={event => setMuted(event.currentTarget.muted)}
        onEnded={opening ? onEnter : undefined}
        onLoadedData={() => setLoading(false)} onCanPlay={() => setLoading(false)}
        onPlaying={() => { setLoading(false); setNeedsPlay(false); }}
        onWaiting={() => setLoading(true)} onError={event => {
          if (event.currentTarget.getAttribute('src')) { setFailed(true); setLoading(false); }
        }} />
      {!started && <div className="film-invitation">
        <Icon name="sparkle" /><p>故事，从一场雪开始</p>
        <button type="button" className="primary-button" onClick={() => { setLoading(true); setStarted(true); }}><Icon name="play" />播放故事</button>
        <span>也可以先去看看圣诞树，随时回来观看。</span>
      </div>}
      {started && !failed && loading && <div className="film-loading" role="status"><span className="film-loading-star" aria-hidden="true">✧</span>正在打开圣诞奇遇…</div>}
      {!failed && needsPlay && <button type="button" className="film-start" onClick={play}><Icon name="play" /><span>播放故事</span></button>}
      {failed && <div className="film-error" role="alert">
        <Icon name="sparkle" /><p>短片暂时没加载出来</p><span>重新试一次，或单独打开观看。</span>
        <button type="button" className="primary-button" onClick={retry}>重新加载</button>
        <a href={videoUrl} target="_blank" rel="noopener noreferrer">单独打开视频</a>
      </div>}
    </div>
    <footer className="film-footer">
      <span>{duration ? `${formatFilmDuration(duration)} · ` : ''}城堡与烟花</span>
      <div className="film-actions">
        {hasMedia && <button type="button" className="small-button film-sound" onClick={toggleSound}><Icon name={muted ? 'muted' : 'sound'} />{muted ? '开启声音' : '关闭声音'}</button>}
        {hasMedia && <a href={videoUrl} download="集美小喵-星光归来.mp4">保存视频</a>}
        {onEnter && <button type="button" className="small-button film-enter" onClick={onEnter}>{opening ? '直接进入圣诞树' : '回到圣诞树'}<Icon name="arrow" /></button>}
      </div>
    </footer>
  </div>;
}
