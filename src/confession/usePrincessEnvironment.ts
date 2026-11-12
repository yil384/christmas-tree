import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** The WebView, rather than a guessed iPhone toolbar height, owns our viewport. */
export function usePrincessEnvironment(host: RefObject<HTMLElement>) {
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const element = host.current;
    const viewport = window.visualViewport;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Do not compress the composition when someone uses accessibility zoom.
        if (viewport && Math.abs(viewport.scale - 1) > 0.02) return;
        element?.style.setProperty('--princess-viewport-height', `${Math.round(viewport?.height ?? window.innerHeight)}px`);
      });
    };
    const onVisibility = () => setVisible(!document.hidden);
    const onPreference = () => setReducedMotion(preference.matches);
    measure();
    window.addEventListener('resize', measure, { passive: true });
    viewport?.addEventListener('resize', measure, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    preference.addEventListener('change', onPreference);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', onVisibility);
      preference.removeEventListener('change', onPreference);
    };
  }, [host]);

  return { visible, reducedMotion };
}
