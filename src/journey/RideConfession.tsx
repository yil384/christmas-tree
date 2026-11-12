import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import './RideConfession.css';

type Reply = 'yes' | 'no';

export function ConfessionSeal() {
  return <>
    <svg viewBox="0 0 48 42" fill="none" aria-hidden="true">
      <path d="M7 11h34v24H7V11Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="m7 12 17 13 17-13M7 35l13-13m21 13L28 22" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="6.5" fill="#613947" stroke="#edc697" strokeWidth=".8" />
      <path d="M24 27.4c-1.6-1.2-3.7-2.7-3.7-4.4 0-2.2 2.7-2.6 3.7-.8 1-1.8 3.7-1.4 3.7.8 0 1.7-2.1 3.2-3.7 4.4Z" fill="#f6d2a4" />
      <path d="m24 3 .9 2.7L28 7l-3.1 1.2L24 11l-.9-2.8L20 7l3.1-1.3L24 3Z" fill="currentColor" opacity=".8" />
    </svg>
    <span>给思仪</span>
  </>;
}

function Flourish() {
  return <svg className="confession-flourish" viewBox="0 0 236 52" fill="none" aria-hidden="true">
    <path d="M12 30c22 0 31-14 47-14 14 0 15 19 0 19-12 0-12-12-4-14m169 9c-22 0-31-14-47-14-14 0-15 19 0 19 12 0 12-12 4-14M70 27h25m46 0h25" stroke="currentColor" strokeWidth=".8" />
    <path d="M118 38c-5-4-13-9-13-16 0-8 10-10 13-3 3-7 13-5 13 3 0 7-8 12-13 16Z" stroke="currentColor" strokeWidth="1" />
    <path d="m118 2 1.2 4.3L124 8l-4.8 1.7L118 14l-1.2-4.3L112 8l4.8-1.7L118 2Z" fill="currentColor" opacity=".7" />
    <circle cx="4" cy="30" r="1" fill="currentColor" /><circle cx="232" cy="30" r="1" fill="currentColor" />
  </svg>;
}

/** A short, explicit confession; the reply is a local part of the experience. */
export default function RideConfession({ started, onClose, onContinue, onAnswer }: {
  started: boolean;
  onClose: () => void;
  onContinue: () => void;
  onAnswer: (reply: Reply) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [reply, setReply] = useState<Reply | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    headingRef.current?.focus({ preventScroll: true });
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  const answer = (value: Reply) => {
    setReply(value);
    onAnswer(value);
  };

  return <dialog ref={dialogRef} className={`ride-confession${reply ? ` confession-answer-${reply}` : ''}`}
    aria-labelledby="confession-title" aria-describedby="confession-name confession-question confession-memory"
    onCancel={event => { event.preventDefault(); onClose(); }} data-reply={reply ?? 'unanswered'}>
    <button type="button" className="confession-close ride-icon-control" aria-label="收起表白" onClick={onClose}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
    </button>
    <div className="confession-words">
      <Flourish />
      <p className="confession-name" id="confession-name">谭陈思仪</p>
      <h1 ref={headingRef} tabIndex={-1} className="confession-title" id="confession-title">我喜欢你。</h1>
      <p className="confession-question" id="confession-question">要不要和我在一起？</p>
      <p className="confession-memory" id="confession-memory">马来西亚那趟，我一直记着。</p>
      <div className="confession-response">
        {reply === null ? <div className="confession-choices" role="group" aria-label="回应这句表白">
          <button type="button" className="confession-yes" onClick={() => answer('yes')}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19c-3.4-2.4-8-5.8-8-9.5C4 4.8 10 4 12 8c2-4 8-3.2 8 1.5 0 3.7-4.6 7.1-8 9.5Z" stroke="currentColor" strokeWidth="1.1" /></svg>
            好呀
          </button>
          <button type="button" className="confession-no" onClick={() => answer('no')}>先不了</button>
        </div> : <div className="confession-reply" role="status" aria-live="polite">
          <p>{reply === 'yes' ? '那我先开心一下。' : '好，听你的。'}</p>
          <button type="button" className="confession-continue" onClick={onContinue}>{started ? '继续看风景' : '去逛城堡'}<span aria-hidden="true">↗</span></button>
        </div>}
      </div>
      <svg className="confession-bottom-rule" viewBox="0 0 120 16" fill="none" aria-hidden="true"><path d="M5 8h42m26 0h42m-55-5 5 5-5 5-5-5 5-5Z" stroke="currentColor" strokeWidth=".7" /></svg>
    </div>
    {reply === 'yes' && <div className="confession-celebration" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{
      '--confetti-angle': `${index * 137.5}deg`,
      '--confetti-distance': `${90 + (index % 5) * 31}px`,
      '--confetti-delay': `${(index % 6) * 0.055}s`,
    } as CSSProperties} />)}</div>}
  </dialog>;
}
