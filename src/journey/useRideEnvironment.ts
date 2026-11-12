import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

export function useRideEnvironment(shell: RefObject<HTMLElement>, stage: RefObject<HTMLElement>) {
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [bounds, setBounds] = useState({ width: 440, height: 956 });

  useEffect(() => {
    const viewport = window.visualViewport;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Respect accessibility zoom instead of shrinking the entire scene.
        if (!viewport || Math.abs(viewport.scale - 1) < 0.02) {
          shell.current?.style.setProperty('--ride-viewport-height', `${Math.round(viewport?.height ?? window.innerHeight)}px`);
        }
        const rect = stage.current?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          setBounds(previous => Math.abs(previous.width - rect.width) < 0.5 && Math.abs(previous.height - rect.height) < 0.5
            ? previous : { width: rect.width, height: rect.height });
        }
      });
    };
    const onVisibility = () => setVisible(!document.hidden);
    const onPreference = () => setReducedMotion(preference.matches);
    const observer = new ResizeObserver(measure);
    if (stage.current) observer.observe(stage.current);
    measure();
    window.addEventListener('resize', measure, { passive: true });
    viewport?.addEventListener('resize', measure, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    preference.addEventListener('change', onPreference);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', onVisibility);
      preference.removeEventListener('change', onPreference);
    };
  }, [shell, stage]);

  return { visible, reducedMotion, bounds };
}
