import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { createHandGestureInterpreter } from '../lib/hand-gestures';
import type { HandCommand, HandFeedback, HandFrame, HandSceneInput } from '../lib/hand-types';
import type { HandTrackingPhase } from '../hand-tracking/session';
import './HandMagicMode.css';

type HandMagicProps = {
  input: MutableRefObject<HandSceneInput>;
  view: 'scene' | 'gallery' | 'blocked';
  onCommand: (command: HandCommand) => void;
  onRunningChange: (running: boolean) => void;
  onClose: () => void;
};

const initialFeedback: HandFeedback = { mode: 'searching', label: '把手放进画面，掌心朝向镜头', progress: 0, handCount: 0 };
const connections = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

function drawHands(canvas: HTMLCanvasElement | null, video: HTMLVideoElement | null, frame: HandFrame) {
  const context = canvas?.getContext('2d');
  if (!context || !canvas) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const ratio = Math.min(canvas.width / (video?.videoWidth || 640), canvas.height / (video?.videoHeight || 480));
  const width = (video?.videoWidth || 640) * ratio;
  const height = (video?.videoHeight || 480) * ratio;
  const left = (canvas.width - width) / 2;
  const top = (canvas.height - height) / 2;
  for (const hand of frame.hands) {
    if (hand.landmarks.length !== 21 || hand.landmarks.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
    const points = hand.landmarks.map(point => ({ x: left + (1 - point.x) * width, y: top + point.y * height }));
    context.lineWidth = 1.4;
    context.strokeStyle = '#ead7a6cc';
    context.beginPath();
    for (const [from, to] of connections) {
      context.moveTo(points[from].x, points[from].y);
      context.lineTo(points[to].x, points[to].y);
    }
    context.stroke();
    context.fillStyle = '#f8edcc';
    for (const point of points) {
      context.beginPath();
      context.arc(point.x, point.y, 2, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function GestureGuide() {
  return <div className="hand-guide">
    <div><span aria-hidden="true">✋</span><p><b>张掌移动</b><small>轻轻转动圣诞树的视角</small></p></div>
    <div><span aria-hidden="true">↔</span><p><b>双掌拉开 / 靠近</b><small>拉近 / 拉远观察</small></p></div>
    <div><span aria-hidden="true">✌️</span><p><b>比 V，停留片刻</b><small>照片与枝叶缓缓散开</small></p></div>
    <div><span aria-hidden="true">✊</span><p><b>握拳，停留片刻</b><small>聚合成树；相册中返回</small></p></div>
    <div><span aria-hidden="true">👍</span><p><b>竖起拇指</b><small>暂停 / 继续镜头漫游</small></p></div>
    <div><span aria-hidden="true">☝️</span><p><b>指向照片，再捏合</b><small>食指瞄准，拇指与食指轻合</small></p></div>
    <div><span aria-hidden="true">👋</span><p><b>相册里左右挥掌</b><small>向左下一张，向右上一张</small></p></div>
    <div><span aria-hidden="true">🤟</span><p><b>做出「我爱你」手势</b><small>拇指、食指、小指伸出，唤出星光</small></p></div>
  </div>;
}

export default function HandMagicMode({ input, view, onCommand, onRunningChange, onClose }: HandMagicProps) {
  const video = useRef<HTMLVideoElement>(null);
  const skeleton = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<HTMLDivElement>(null);
  const interpreter = useRef(createHandGestureInterpreter());
  const session = useRef<ReturnType<typeof import('../hand-tracking/session').createHandTrackingSession> | null>(null);
  const generation = useRef(0);
  const starting = useRef(false);
  const guideOpen = useRef(false);
  const latest = useRef({ view, onCommand, onRunningChange });
  latest.current = { view, onCommand, onRunningChange };
  const [phase, setPhase] = useState<HandTrackingPhase>('idle');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState(initialFeedback);
  const [showGuide, setShowGuide] = useState(false);
  const [targetFound, setTargetFound] = useState(false);
  const busy = phase === 'requesting-camera' || phase === 'loading-model';
  const running = phase === 'running';

  const clearInput = useCallback(() => {
    Object.assign(input.current, { enabled: false, orbitX: 0, orbitY: 0, zoomLog: 0, cursor: null, hoveredPhoto: null, hoveredAt: 0, selectionRequest: null, lastInputAt: 0 });
    interpreter.current.reset();
    if (pointer.current) pointer.current.hidden = true;
    latest.current.onRunningChange(false);
  }, [input]);

  const cancelSession = useCallback(() => {
    generation.current++;
    session.current?.stop();
    session.current = null;
    clearInput();
  }, [clearInput]);
  useEffect(() => cancelSession, [cancelSession]);

  useEffect(() => {
    // The interpreter owns scene/gallery transitions and preserves the pinch
    // release guard when a selected photo opens. Do not erase it here.
    if (view === 'blocked' || showGuide) interpreter.current.reset();
    input.current.cursor = null;
    input.current.hoveredPhoto = null;
    input.current.selectionRequest = null;
    if (pointer.current) pointer.current.hidden = true;
  }, [input, view, showGuide]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || view !== 'scene' || !running || showGuide) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose, running, showGuide, view]);

  const start = async () => {
    if (starting.current) return;
    starting.current = true;
    const current = ++generation.current;
    session.current?.stop();
    setMessage('请在浏览器提示中允许摄像头。');
    setPhase('requesting-camera');
    setFeedback(initialFeedback);
    setShowGuide(false);
    guideOpen.current = false;
    try {
      const { createHandTrackingSession } = await import('../hand-tracking/session');
      if (current !== generation.current || !video.current) return;
      const next = createHandTrackingSession({
        video: video.current,
        onStatus: (nextPhase, description) => {
          if (current !== generation.current) return;
          setPhase(nextPhase);
          if (description) setMessage(description);
          const active = nextPhase === 'running';
          latest.current.onRunningChange(active);
          if (!active) { clearInput(); setShowGuide(false); guideOpen.current = false; }
        },
        onError: error => {
          if (current !== generation.current) return;
          setMessage(error.message);
          setPhase('error');
          clearInput();
        },
        onFrame: frame => {
          if (current !== generation.current) return;
          drawHands(skeleton.current, video.current, frame);
          const activeView = latest.current.view;
          if (activeView === 'blocked' || guideOpen.current) { interpreter.current.reset(); return; }
          const update = interpreter.current.update(frame, { view: activeView });
          const mailbox = input.current;
          mailbox.cursor = activeView === 'scene' ? update.cursor : null;
          if (!mailbox.cursor) { mailbox.hoveredPhoto = null; mailbox.hoveredAt = 0; mailbox.selectionRequest = null; }
          if (update.feedback.mode === 'orbit' || update.feedback.mode === 'zoom' || update.cursor) mailbox.lastInputAt = performance.now();
          const hovering = mailbox.hoveredPhoto !== null && performance.now() - mailbox.hoveredAt <= 300;
          setTargetFound(hovering);
          setFeedback(update.feedback);
          if (pointer.current) {
            pointer.current.hidden = !mailbox.cursor || activeView !== 'scene';
            if (mailbox.cursor) {
              pointer.current.style.left = `${mailbox.cursor.x * 100}%`;
              pointer.current.style.top = `${mailbox.cursor.y * 100}%`;
            }
          }
          for (const command of update.commands) latest.current.onCommand(command);
        },
      });
      session.current = next;
      await next.start();
    } catch (error) {
      if (current === generation.current) {
        session.current?.stop();
        setPhase('error');
        setMessage(error instanceof Error && error.name === 'HandTrackingError'
          ? error.message : '手势模块暂时没有加载成功，请检查连接后再试一次。');
        clearInput();
      }
    } finally {
      if (current === generation.current) starting.current = false;
    }
  };

  const help = () => {
    guideOpen.current = true;
    setShowGuide(true);
    interpreter.current.reset();
    input.current.enabled = false;
    latest.current.onRunningChange(false);
  };
  const resume = useCallback(() => {
    guideOpen.current = false;
    setShowGuide(false);
    interpreter.current.reset();
    latest.current.onRunningChange(phase === 'running');
  }, [phase]);

  return <>
    <section className={`hand-hud${running && !showGuide && view !== 'gallery' ? ' is-visible' : ''}`} aria-label="手势控制" aria-hidden={!running || showGuide || view === 'gallery'}>
      <div className="hand-hud-title"><span className="camera-dot" />手势魔法<span className="hand-live-label">摄像头已开启</span></div>
      <div className="hand-camera">
        <video ref={video} autoPlay playsInline muted aria-label="仅在本机处理的摄像头预览" />
        <canvas ref={skeleton} width={320} height={240} aria-hidden="true" />
        <span className="hand-count">{feedback.handCount ? `识别到 ${feedback.handCount} 只手` : '等待你的手'}</span>
      </div>
      <p className="hand-feedback" role="status">{targetFound && feedback.mode === 'point' ? '已瞄准照片 · 轻轻捏合打开' : feedback.label}</p>
      <div className="hand-hold-meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, feedback.progress)) * 100}%` }} /></div>
      <div className="hand-hud-actions"><button type="button" onClick={help} tabIndex={running && !showGuide ? 0 : -1}>手势图鉴</button><button type="button" onClick={onClose} tabIndex={running && !showGuide ? 0 : -1}>关闭摄像头 <Icon name="close" /></button></div>
    </section>
    <div ref={pointer} className={`hand-pointer${targetFound ? ' has-photo' : ''}`} hidden aria-hidden="true"><span /><i>{targetFound ? '捏合打开' : '指向照片'}</i></div>
    {(!running || showGuide) && <Dialog title="手势魔法" onClose={showGuide ? resume : onClose} className="hand-dialog">
      <div className="hand-intro">
        <span className="hand-eyebrow">A LITTLE CHRISTMAS MAGIC</span>
        <h2>让心意，随手而动。</h2>
        <p className="hand-lead">伸出手，让镜头轻轻环绕。<br />把一张回忆，轻轻捧到眼前。</p>
        <div className="hand-guide-scroll">
          <GestureGuide />
          <div className="hand-privacy"><span aria-hidden="true">◈</span><p>画面只在你的设备上识别，不上传、不录像，也不使用麦克风。关闭模式或离开页面后，摄像头会停止。</p></div>
        </div>
        <div className="hand-dialog-actions">
          {showGuide && running && <p className="hand-guide-active"><span className="camera-dot" /> 摄像头保持开启 · 手势动作已暂时停下</p>}
          {(message && (busy || phase === 'error' || phase === 'stopped')) && <p className={`hand-session-message${phase === 'error' ? ' is-error' : ''}`} role="status">{message}</p>}
          {busy ? <div className="hand-starting"><span className="hand-loading-dot" aria-hidden="true" /><p>{phase === 'loading-model' ? '摄像头已开启 · 正在准备本地识别…' : '等待摄像头授权…'}<small>首次开启需要加载手势模型。随时可点右上角关闭。</small></p></div> : <button type="button" className="hand-start-button" onClick={showGuide ? resume : start}>{showGuide ? '继续施展魔法' : phase === 'error' || phase === 'stopped' ? '重新开启手势模式' : '开启摄像头与手势'}<span aria-hidden="true">↗</span></button>}
          {showGuide && running && <button type="button" className="hand-stop-from-guide" onClick={onClose}>关闭摄像头，回到圣诞树</button>}
          <p className="hand-footnote">手掌完整入镜、光线充足时更容易识别。<br />食指在镜头中央区域移动，就能瞄准整个画面。<br />部分微信内置浏览器可能无法开启，可用系统浏览器打开。</p>
        </div>
      </div>
    </Dialog>}
  </>;
}
