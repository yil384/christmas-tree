import { useCallback, useEffect, useRef, useState } from 'react';
import type { RideEffectKind } from './rideTypes';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Tiny responsive accents sit underneath the movie's authored soundtrack. */
export function useRideChimes(visible: boolean) {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const visibleRef = useRef(visible);
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const lastChime = useRef(0);

  const unlock = useCallback(() => {
    try {
      if (!contextRef.current) {
        const Constructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
        if (!Constructor) return;
        const context = new Constructor({ latencyHint: 'interactive' });
        const gain = context.createGain();
        gain.gain.value = mutedRef.current ? 0 : 0.075;
        gain.connect(context.destination);
        contextRef.current = context;
        gainRef.current = gain;
      }
      // This is deliberately called synchronously by the original gesture.
      void contextRef.current.resume().catch(() => {});
    } catch { /* The cinema still works without Web Audio. */ }
  }, []);

  const chime = useCallback((kind: RideEffectKind, power = 0.65) => {
    const context = contextRef.current;
    const master = gainRef.current;
    const now = performance.now();
    if (!context || !master || mutedRef.current || !visibleRef.current || now - lastChime.current < 190) return;
    lastChime.current = now;
    const patterns: Record<RideEffectKind, number[]> = {
      fireflies: [880, 1174.66], ripple: [392, 587.33, 783.99], butterflies: [659.25, 880, 1318.51],
      lanterns: [440, 659.25, 880], notes: [523.25, 659.25, 783.99, 1046.5], pages: [587.33, 880],
      crystal: [783.99, 1174.66, 1567.98], petals: [349.23, 523.25, 698.46],
      stars: [659.25, 987.77, 1318.51], fireworks: [523.25, 783.99, 1046.5],
    };
    patterns[kind].forEach((frequency, index) => {
      const start = context.currentTime + index * 0.105;
      const envelope = context.createGain();
      const oscillator = context.createOscillator();
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.12 + Math.min(1, power) * 0.1, start + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 1.35);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(start);
      oscillator.stop(start + 1.4);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    });
  }, []);

  const toggle = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    unlock();
    const context = contextRef.current;
    if (context && gainRef.current) gainRef.current.gain.setTargetAtTime(next ? 0 : 0.075, context.currentTime, 0.04);
    return next;
  }, [unlock]);

  const getContext = useCallback(() => contextRef.current, []);

  useEffect(() => {
    visibleRef.current = visible;
    if (!visible) void contextRef.current?.suspend().catch(() => {});
    // Returning to the app does not unexpectedly resume sound.
  }, [visible]);

  useEffect(() => () => {
    const context = contextRef.current;
    contextRef.current = null;
    gainRef.current = null;
    if (context) void context.close().catch(() => {});
  }, []);

  return { muted, unlock, toggle, chime, getContext };
}
