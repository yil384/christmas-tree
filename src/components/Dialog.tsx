import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { PanelBoundary } from './PanelBoundary';

export function Dialog({ children, title, onClose, className = '' }: { children: ReactNode; title: string; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    let native = false;
    if (typeof dialog.showModal === 'function' && typeof dialog.close === 'function') {
      try { if (!dialog.open) dialog.showModal(); native = true; }
      catch { /* Older embedded browsers can expose an incomplete dialog API. */ }
    }
    setFallback(!native);
    if (!native) dialog.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    const trapKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    if (!native) document.addEventListener('keydown', trapKeys);
    return () => {
      document.removeEventListener('keydown', trapKeys);
      if (native) dialog.close();
      else dialog.removeAttribute('open');
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);
  return <>
    {fallback && <div className="dialog-fallback-backdrop" aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,17,13,.88)' }} />}
    <dialog ref={ref} className={`gift-dialog ${className}${fallback ? ' dialog-fallback' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      style={fallback ? { position: 'fixed', display: 'block', top: '50%', left: '50%', bottom: 'auto', right: 'auto', transform: 'translate(-50%, -50%)', margin: 0, maxHeight: '94vh', zIndex: 1001 } : undefined}
      onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-inner"><button ref={closeRef} className="dialog-close icon-button" onClick={onClose} aria-label="关闭" autoFocus><Icon name="close" /></button><PanelBoundary>{children}</PanelBoundary></div>
    </dialog>
  </>;
}
