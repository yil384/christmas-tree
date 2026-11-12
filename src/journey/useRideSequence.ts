import { useCallback, useEffect, useRef, useState } from 'react';
import type { useRidePlayback } from './useRidePlayback';
import type { RidePlaybackStatus } from './useRidePlayback';
import { FINALE_DURATION } from './rideSequenceConfig';

type Film = ReturnType<typeof useRidePlayback>;
const CLOCK_EPSILON = 1e-6;

/** One transport spans the edited film and the original realtime finale. */
export function useRideSequence(film: Film, visible: boolean) {
  const filmRef = useRef(film);
  filmRef.current = film;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [phase, setPhase] = useState<'film' | 'finale'>('film');
  const phaseRef = useRef(phase);
  const anchorTime = useRef(0);
  const anchorMoment = useRef(0);
  const running = useRef(false);
  const [finaleTime, setFinaleTime] = useState(0);
  const [finalePlaying, setFinalePlaying] = useState(false);
  const [finaleEnded, setFinaleEnded] = useState(false);

  const readClock = useCallback(() => Math.min(FINALE_DURATION, anchorTime.current
    + (running.current ? Math.max(0, performance.now() - anchorMoment.current) / 1000 : 0)), []);
  const setClock = useCallback((time: number, play: boolean) => {
    const clamped = Math.max(0, Math.min(FINALE_DURATION, time));
    const at = FINALE_DURATION - clamped <= CLOCK_EPSILON ? FINALE_DURATION : clamped;
    anchorTime.current = at;
    anchorMoment.current = performance.now();
    running.current = play && at < FINALE_DURATION && visibleRef.current;
    setFinaleTime(at);
    setFinalePlaying(running.current);
    setFinaleEnded(at >= FINALE_DURATION);
  }, []);
  const enterFinale = useCallback((at: number, play: boolean) => {
    filmRef.current.pause();
    phaseRef.current = 'finale';
    setPhase('finale');
    setClock(at, play);
  }, [setClock]);

  useEffect(() => {
    if (film.status === 'ended' && phaseRef.current === 'film') enterFinale(0, true);
  }, [enterFinale, film.status]);
  useEffect(() => {
    if (!visible && phaseRef.current === 'finale') setClock(readClock(), false);
  }, [readClock, setClock, visible]);
  useEffect(() => {
    if (phase !== 'finale' || !finalePlaying || !visible) return;
    const timer = setInterval(() => {
      const time = readClock();
      if (time >= FINALE_DURATION) setClock(FINALE_DURATION, false);
      else setFinaleTime(time);
    }, 100);
    return () => clearInterval(timer);
  }, [finalePlaying, phase, readClock, setClock, visible]);

  const pause = useCallback(() => {
    if (phaseRef.current === 'film') filmRef.current.pause();
    else setClock(readClock(), false);
  }, [readClock, setClock]);
  const replay = useCallback(() => {
    setClock(0, false);
    phaseRef.current = 'film';
    setPhase('film');
    filmRef.current.replay();
  }, [setClock]);
  const play = useCallback((reload = false) => {
    if (phaseRef.current === 'film') filmRef.current.play(reload);
    else if (readClock() >= FINALE_DURATION) replay();
    else setClock(readClock(), true);
  }, [readClock, replay, setClock]);
  const seek = useCallback((delta: number) => {
    const current = filmRef.current;
    const inFinale = phaseRef.current === 'finale';
    const from = inFinale ? current.duration + readClock() : current.time;
    const to = Math.max(0, Math.min(current.duration + FINALE_DURATION, from + delta));
    const continuePlaying = inFinale ? running.current : current.status === 'playing' || current.status === 'loading';
    if (to >= current.duration - CLOCK_EPSILON) {
      if (inFinale) setClock(to - current.duration, continuePlaying);
      else enterFinale(to - current.duration, continuePlaying);
    } else {
      if (inFinale) {
        setClock(0, false);
        phaseRef.current = 'film';
        setPhase('film');
      }
      current.seek(to - current.time);
      if (inFinale) {
        if (continuePlaying) current.play();
        else current.pause();
      }
    }
  }, [enterFinale, readClock, setClock]);
  const finishFinale = useCallback(() => {
    if (phaseRef.current === 'finale') setClock(FINALE_DURATION, false);
  }, [setClock]);

  const status: RidePlaybackStatus = phase === 'film'
    ? film.status === 'ended' ? 'loading' : film.status
    : finaleEnded ? 'ended' : finalePlaying ? 'playing' : 'paused';
  return {
    status, phase, finaleTime, finalePlaying, finishFinale,
    started: film.started, hasFrame: film.hasFrame,
    slow: phase === 'film' && film.slow,
    time: phase === 'film' ? film.time : film.duration + finaleTime,
    duration: film.duration + FINALE_DURATION,
    bufferedTo: phase === 'film' ? film.bufferedTo : film.duration + FINALE_DURATION,
    play, pause, replay, seek,
  };
}
