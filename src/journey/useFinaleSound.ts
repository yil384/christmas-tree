import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { assetUrl } from '../lib/content';
import { FINALE_DURATION, FINALE_SCORE_URL } from './rideSequenceConfig';

type Voice = { oscillator: OscillatorNode; envelope: GainNode };

/** A quiet original celesta/pad score is available even if the file cannot play. */
function makeFallbackScore(context: AudioContext) {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  const voices = new Set<Voice>();
  const chords = [
    [48, 55, 59, 64], [45, 52, 59, 60], [41, 48, 52, 57],
    [50, 57, 60, 64], [43, 50, 57, 59], [40, 47, 54, 55],
    [41, 48, 55, 57], [38, 45, 53, 57], [43, 50, 55, 59],
    [48, 55, 59, 64], [45, 52, 59, 64], [41, 48, 52, 55],
    [43, 50, 55, 60], [43, 50, 53, 59], [48, 55, 59, 62, 67],
  ];
  let chordIndex = -1;
  let bellIndex = -1;
  let previousTime = -1;
  let previousAudio = 0;
  let enabled = false;
  const stopVoices = () => {
    const now = context.currentTime;
    for (const voice of voices) {
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0.00001, now, 0.08);
      try { voice.oscillator.stop(now + 0.3); } catch { /* Already ended. */ }
    }
  };
  const note = (midi: number, bell: boolean, offset: number) => {
    const start = context.currentTime + offset;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const voice = { oscillator, envelope };
    voices.add(voice);
    oscillator.type = 'sine';
    oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    oscillator.detune.value = bell ? 0 : (midi % 3 - 1) * 3;
    const length = bell ? 2.5 : 7.2;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(bell ? 0.18 : 0.12, start + (bell ? 0.012 : 1.1));
    if (!bell) envelope.gain.setValueAtTime(0.12, start + 5.3);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(start);
    oscillator.stop(start + length + 0.05);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); voices.delete(voice); };
  };
  return {
    sync(time: number, active: boolean, muted: boolean) {
      const now = context.currentTime;
      const jumped = previousTime >= 0 && Math.abs((time - previousTime) - (now - previousAudio)) > 0.65;
      previousTime = time;
      previousAudio = now;
      if (!active || time >= FINALE_DURATION) {
        if (enabled) stopVoices();
        enabled = false; chordIndex = -1; bellIndex = -1;
        master.gain.setTargetAtTime(0, now, 0.35);
        return;
      }
      if (jumped) { stopVoices(); chordIndex = -1; bellIndex = -1; }
      enabled = true;
      const fade = Math.min(1, Math.max(0, (FINALE_DURATION - time) / 5));
      master.gain.setTargetAtTime(muted ? 0 : 0.25 * fade, now, 0.4);
      const nextChord = Math.min(chords.length - 1, Math.floor(time / 6));
      const chord = chords[nextChord];
      if (nextChord !== chordIndex) {
        chordIndex = nextChord;
        chord.forEach((midi, index) => note(midi, false, index * 0.045));
      }
      const nextBell = Math.floor(time / 1.5);
      if (nextBell !== bellIndex && time < 86) {
        bellIndex = nextBell;
        const pitch = chord[(nextBell + nextChord) % chord.length] + 24;
        note(pitch, true, 0);
        if (time > 58 && nextBell % 2 === 0) note(pitch + 7, true, 0.22);
      }
    },
    dispose() { stopVoices(); master.disconnect(); },
  };
}

let silence: string | undefined;
function silentGestureSource() {
  if (silence) return silence;
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const data = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((letter, index) => data.setUint8(offset + index, letter.charCodeAt(0)));
  text(0, 'RIFF'); data.setUint32(4, 36 + samples, true); text(8, 'WAVE'); text(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, 8000, true); data.setUint32(28, 8000, true); data.setUint16(32, 1, true); data.setUint16(34, 8, true);
  text(36, 'data'); data.setUint32(40, samples, true); bytes.fill(128, 44);
  silence = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
  return silence;
}

export function useFinaleSound({ audioRef, getContext, started, filmTime, filmDuration, inFinale, time, playing, muted, visible }: {
  audioRef: RefObject<HTMLAudioElement>;
  getContext: () => AudioContext | null;
  started: boolean; filmTime: number; filmDuration: number;
  inFinale: boolean; time: number; playing: boolean; muted: boolean; visible: boolean;
}) {
  const [scorePlaying, setScorePlaying] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const unlocked = useRef(false);
  const preparedRef = useRef(false);
  const failed = useRef(false);
  const buffering = useRef(false);
  const pendingPlay = useRef(false);
  const scoreRequest = useRef<AbortController | null>(null);
  const scoreObjectUrl = useRef<string | null>(null);
  const fallback = useRef<ReturnType<typeof makeFallbackScore> | null>(null);
  const latest = useRef({ inFinale, time, playing, muted, visible });
  latest.current = { inFinale, time, playing, muted, visible };

  const startScore = useCallback(() => {
    const audio = audioRef.current;
    const current = latest.current;
    if (!audio || !preparedRef.current || !current.inFinale || !current.playing || !current.visible || pendingPlay.current) return;
    audio.muted = current.muted;
    if (audio.readyState >= 3 && !audio.seeking && !buffering.current && Number.isFinite(audio.duration)
      && Math.abs(audio.currentTime - current.time) > 0.4) audio.currentTime = Math.min(current.time, Math.max(0, audio.duration - 0.02));
    pendingPlay.current = true;
    void audio.play().then(() => {
      if (!latest.current.inFinale || !latest.current.playing || !latest.current.visible) {
        audio.pause();
        setScorePlaying(false);
        return;
      }
      failed.current = false;
      setScorePlaying(!buffering.current && audio.readyState >= 3);
    }).catch(error => {
      if ((error instanceof DOMException && error.name === 'AbortError')
        || !latest.current.inFinale || !latest.current.playing || !latest.current.visible) return;
      failed.current = true;
      setScorePlaying(false);
    }).finally(() => { pendingPlay.current = false; });
  }, [audioRef]);

  const unlock = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!unlocked.current && !preparedRef.current) {
      unlocked.current = true;
      audio.src = silentGestureSource();
      audio.muted = false;
      // Play a real silent source in the original tap, granting this element
      // user-initiated playback before its later, differently sourced score.
      void audio.play().then(() => { if (!preparedRef.current) audio.pause(); }).catch(() => { unlocked.current = false; });
    } else if (latest.current.inFinale) {
      failed.current = false;
      startScore();
    }
  }, [audioRef, startScore]);

  useEffect(() => {
    if (!FINALE_SCORE_URL || !started || scoreRequest.current || preparedRef.current
      || (!inFinale && filmTime < filmDuration - 20)) return;
    const audio = audioRef.current;
    if (!audio) return;
    const controller = new AbortController();
    scoreRequest.current = controller;
    const source = assetUrl(FINALE_SCORE_URL);
    // Sites can deliver the complete file without a usable HTTP seek range.
    // Keep one complete local MP4 on the same gesture-unlocked audio element.
    // Its request belongs to this hook's lifetime, not each transport update.
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      const response = await fetch(source, { signal: controller.signal, credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Finale score download failed (${response.status})`);
      const data = await response.blob();
      if (controller.signal.aborted || scoreRequest.current !== controller) return;
      if (!data.size) throw new Error('Finale score is empty');
      const objectUrl = URL.createObjectURL(new Blob([data], { type: 'audio/mp4' }));
      scoreObjectUrl.current = objectUrl;
      preparedRef.current = true;
      failed.current = false;
      buffering.current = false;
      audio.preload = 'auto';
      audio.src = objectUrl;
      audio.volume = 1;
      audio.muted = latest.current.muted;
      audio.load();
      setPrepared(true);
    }).catch(() => {
      if (controller.signal.aborted || scoreRequest.current !== controller) return;
      failed.current = true;
      setScorePlaying(false);
    });
  }, [audioRef, filmDuration, filmTime, inFinale, muted, started]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const canPlay = () => { buffering.current = false; if (!failed.current) startScore(); };
    const onPlaying = () => {
      buffering.current = false;
      if (preparedRef.current && latest.current.inFinale) setScorePlaying(true);
    };
    const stopped = () => setScorePlaying(false);
    const waiting = () => { buffering.current = true; setScorePlaying(false); };
    const stalled = () => { if (audio.readyState < 3) waiting(); };
    const error = () => { failed.current = true; setScorePlaying(false); };
    audio.addEventListener('canplay', canPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('waiting', waiting);
    audio.addEventListener('stalled', stalled);
    audio.addEventListener('pause', stopped);
    audio.addEventListener('ended', stopped);
    audio.addEventListener('error', error);
    return () => {
      audio.removeEventListener('canplay', canPlay); audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', waiting); audio.removeEventListener('stalled', stalled);
      audio.removeEventListener('pause', stopped); audio.removeEventListener('ended', stopped); audio.removeEventListener('error', error);
    };
  }, [audioRef, startScore]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    if (!inFinale || !playing || !visible || time >= FINALE_DURATION) {
      audio.pause();
      setScorePlaying(false);
      return;
    }
    if (prepared && !failed.current) {
      if (audio.readyState >= 3 && !audio.seeking && !buffering.current && Number.isFinite(audio.duration)
        && Math.abs(audio.currentTime - time) > 0.4) audio.currentTime = Math.min(time, Math.max(0, audio.duration - 0.02));
      if (audio.paused) startScore();
    }
  }, [audioRef, inFinale, muted, playing, prepared, startScore, time, visible]);

  useEffect(() => {
    const active = inFinale && playing && visible && !scorePlaying && time < FINALE_DURATION;
    const context = getContext();
    if (!fallback.current && active && context) fallback.current = makeFallbackScore(context);
    fallback.current?.sync(time, active, muted);
  }, [getContext, inFinale, muted, playing, scorePlaying, time, visible]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      scoreRequest.current?.abort();
      scoreRequest.current = null;
      preparedRef.current = false;
      fallback.current?.dispose();
      fallback.current = null;
      audio?.pause();
      audio?.removeAttribute('src');
      audio?.load();
      if (scoreObjectUrl.current) URL.revokeObjectURL(scoreObjectUrl.current);
      scoreObjectUrl.current = null;
    };
  }, [audioRef]);
  const status = muted ? 'muted' : !inFinale ? prepared ? 'ready' : 'dormant'
    : !playing || !visible ? 'paused' : scorePlaying ? 'score' : 'fallback';
  return { unlock, status };
}
