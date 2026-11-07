import { useEffect, useRef, useState } from 'react';

/** The greeting stays visually quiet; a deliberate hold reveals the optional camera mode. */
export default function GreetingGate({ greeting, onOpen }: { greeting: string; onOpen: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef<{ id: number; x: number; y: number } | null>(null);
  const [holding, setHolding] = useState(false);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    press.current = null;
    setHolding(false);
  };

  useEffect(() => {
    const stop = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      press.current = null;
      setHolding(false);
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }, []);

  return <button
    type="button"
    className={`christmas-greeting greeting-gate${holding ? ' is-holding' : ''}`}
    aria-label={`${greeting}。长按一秒开启手势魔法，或按 H。`}
    title="长按一秒 · 手势魔法"
    onPointerDown={event => {
      if (event.button !== 0) return;
      if (press.current) { cancel(); return; }
      press.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      setHolding(true);
      timer.current = setTimeout(() => { cancel(); onOpen(); }, 1000);
    }}
    onPointerMove={event => {
      const start = press.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
    }}
    onPointerUp={cancel}
    onPointerCancel={cancel}
    onLostPointerCapture={cancel}
    onContextMenu={event => event.preventDefault()}
    onClick={event => { if (event.detail === 0) onOpen(); }}
  >{greeting}<span className="greeting-hold-line" aria-hidden="true" /></button>;
}
