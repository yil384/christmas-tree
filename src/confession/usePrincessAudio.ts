import { useCallback, useEffect, useRef, useState } from 'react';

type Mood = 'ambient' | 'cinematic' | 'quiet' | 'finale';
type Chime = 'open' | 'crown' | 'reveal' | 'firework';
type SafariAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** A tiny original glass/harp score. No network request and no sound before a gesture. */
export function usePrincessAudio(mood: Mood, visible: boolean) {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const moodRef = useRef(mood);
  const visibleRef = useRef(visible);
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unlockedRef = useRef(false);
  const melodyRef = useRef(0);
  const lastSparkRef = useRef(0);

  const tuneVolume = useCallback(() => {
    const context = contextRef.current;
    const gain = masterRef.current?.gain;
    if (!context || !gain) return;
    const levels = { ambient: 0.16, cinematic: 0.055, quiet: 0, finale: 0.15 };
    const level = mutedRef.current || !visibleRef.current ? 0 : levels[moodRef.current];
    gain.cancelScheduledValues(context.currentTime);
    gain.setTargetAtTime(level, context.currentTime, 0.24);
  }, []);

  const note = useCallback((frequency: number, offset: number, length = 2.2, weight = 0.22) => {
    const context = contextRef.current;
    const master = masterRef.current;
    if (!context || !master || mutedRef.current || !visibleRef.current) return;
    const start = context.currentTime + offset;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(weight, start + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    envelope.connect(master);
    const fundamental = context.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.value = frequency;
    fundamental.connect(envelope);
    fundamental.start(start);
    fundamental.stop(start + length + 0.03);
    fundamental.onended = () => { fundamental.disconnect(); envelope.disconnect(); };
    // A very quiet octave makes the attack feel like glass without a sharp click.
    const harmonic = context.createOscillator();
    const harmonicGain = context.createGain();
    harmonic.type = 'sine';
    harmonic.frequency.value = frequency * 2;
    harmonicGain.gain.value = 0.065;
    harmonic.connect(harmonicGain);
    harmonicGain.connect(envelope);
    harmonic.start(start);
    harmonic.stop(start + Math.min(length, 1.1));
    harmonic.onended = () => { harmonic.disconnect(); harmonicGain.disconnect(); };
  }, []);

  const phrase = useCallback(() => {
    if (moodRef.current === 'quiet' || mutedRef.current || !visibleRef.current) return;
    const phrases = [[261.63, 392, 523.25, 659.25, 587.33], [220, 329.63, 440, 523.25, 493.88], [174.61, 261.63, 349.23, 523.25, 440]];
    const notes = phrases[melodyRef.current++ % phrases.length];
    notes.forEach((frequency, index) => note(frequency, index * 0.68, 3.1, index === 0 ? 0.16 : 0.12));
  }, [note]);

  const unlock = useCallback(() => {
    try {
      if (!contextRef.current) {
        const Audio = window.AudioContext ?? (window as SafariAudioWindow).webkitAudioContext;
        if (!Audio) return;
        const context = new Audio({ latencyHint: 'playback' });
        const master = context.createGain();
        master.gain.value = 0;
        master.connect(context.destination);
        contextRef.current = context;
        masterRef.current = master;
      }
      const context = contextRef.current;
      // resume() is invoked synchronously inside the original touch/click handler.
      void context.resume().catch(() => {});
      tuneVolume();
      if (!unlockedRef.current) {
        unlockedRef.current = true;
        phrase();
      }
      if (!timerRef.current) timerRef.current = setInterval(phrase, 8200);
    } catch {
      // The entire story remains playable when Web Audio is unavailable.
    }
  }, [phrase, tuneVolume]);

  const chime = useCallback((kind: Chime) => {
    if (!unlockedRef.current) return;
    if (kind === 'firework') {
      const now = performance.now();
      if (now - lastSparkRef.current < 420) return;
      lastSparkRef.current = now;
    }
    const notes: Record<Chime, number[]> = {
      open: [392, 523.25, 659.25],
      crown: [329.63, 440, 659.25, 880],
      reveal: [261.63, 392, 523.25],
      firework: [523.25, 659.25, 783.99],
    };
    notes[kind].forEach((frequency, index) => note(frequency, index * 0.11, 1.7, 0.13));
  }, [note]);

  const toggle = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    unlock();
    tuneVolume();
    return next;
  }, [tuneVolume, unlock]);

  useEffect(() => {
    moodRef.current = mood;
    visibleRef.current = visible;
    tuneVolume();
    const context = contextRef.current;
    if (!context) return;
    if (!visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      void context.suspend().catch(() => {});
    } else if (unlockedRef.current) {
      void context.resume().catch(() => {});
      if (!timerRef.current) timerRef.current = setInterval(phrase, 8200);
    }
  }, [mood, visible, phrase, tuneVolume]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    masterRef.current = null;
    unlockedRef.current = false;
    if (context) void context.close().catch(() => {});
  }, []);

  return { muted, toggle, unlock, chime };
}
