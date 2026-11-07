import { useCallback, useEffect, useRef, useState } from 'react'
import { assetUrl } from '../lib/content'

type Voice = {
  oscillators: OscillatorNode[]
  gains: GainNode[]
}

type FileSession = {
  kind: 'file'
  audio: HTMLAudioElement
  onError: () => void
  onPause: () => void
}

type BellSession = {
  kind: 'bells'
  context: AudioContext
  master: GainNode
  voices: Set<Voice>
  timer: number | null
  onStateChange: (() => void) | null
}

type MusicSession = FileSession | BellSession

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

// An original, quiet pentatonic phrase. Times are seconds within a 12-second loop.
const MOTIF: ReadonlyArray<readonly [time: number, frequency: number, strength: number]> = [
  [0, 196.00, 0.82],
  [0.85, 261.63, 0.68],
  [2.25, 293.66, 0.62],
  [3.60, 220.00, 0.74],
  [5.25, 329.63, 0.56],
  [6.50, 261.63, 0.64],
  [8.35, 220.00, 0.60],
  [9.70, 196.00, 0.72],
]

function releaseVoice(voice: Voice) {
  for (const oscillator of voice.oscillators) {
    oscillator.onended = null
    try { oscillator.stop() } catch { /* An already-ended note is harmless. */ }
    oscillator.disconnect()
  }
  for (const gain of voice.gains) gain.disconnect()
}

function releaseSession(session: MusicSession | null) {
  if (!session) return
  if (session.kind === 'file') {
    session.audio.removeEventListener('error', session.onError)
    session.audio.removeEventListener('pause', session.onPause)
    session.audio.pause()
    session.audio.removeAttribute('src')
    session.audio.load() // Abort an in-flight download and release the media resource.
    return
  }
  if (session.timer !== null) window.clearTimeout(session.timer)
  if (session.onStateChange) session.context.removeEventListener('statechange', session.onStateChange)
  for (const voice of session.voices) releaseVoice(voice)
  session.voices.clear()
  session.master.disconnect()
  if (session.context.state !== 'closed') void session.context.close().catch(() => undefined)
}

function scheduleBell(session: BellSession, start: number, frequency: number, strength: number) {
  const { context, master } = session
  const envelope = context.createGain()
  const partialGain = context.createGain()
  const fundamental = context.createOscillator()
  const partial = context.createOscillator()
  const voice: Voice = { oscillators: [fundamental, partial], gains: [envelope, partialGain] }
  session.voices.add(voice)

  fundamental.type = 'sine'
  fundamental.frequency.value = frequency
  partial.type = 'sine'
  partial.frequency.value = frequency * 2.002
  partialGain.gain.value = 0.065
  fundamental.connect(envelope)
  partial.connect(partialGain)
  partialGain.connect(envelope)
  envelope.connect(master)

  envelope.gain.setValueAtTime(0, start)
  envelope.gain.linearRampToValueAtTime(0.12 * strength, start + 0.028)
  envelope.gain.exponentialRampToValueAtTime(0.018 * strength, start + 0.8)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + 3.2)
  envelope.gain.linearRampToValueAtTime(0, start + 3.3)

  fundamental.onended = () => {
    releaseVoice(voice)
    session.voices.delete(voice)
  }
  fundamental.start(start)
  partial.start(start)
  fundamental.stop(start + 3.35)
  partial.stop(start + 3.35)
}

/** Nothing is loaded or played until toggle() is called by the music button. */
export function useMusic(source: string | null, notify: (message: string) => void): {
  playing: boolean
  toggle: () => Promise<void>
} {
  const [playing, setPlaying] = useState(false)
  const sessionRef = useRef<MusicSession | null>(null)
  const intendedPlaying = useRef(false)
  const mounted = useRef(false)
  const operation = useRef(0)
  const notifyRef = useRef(notify)

  useEffect(() => { notifyRef.current = notify }, [notify])

  const stop = useCallback(() => {
    operation.current += 1
    intendedPlaying.current = false
    const session = sessionRef.current
    sessionRef.current = null
    releaseSession(session)
    if (mounted.current) setPlaying(false)
  }, [])

  useEffect(() => {
    mounted.current = true
    const onVisibilityChange = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }, [stop])

  useEffect(() => { stop() }, [source, stop])

  const toggle = useCallback(async () => {
    if (!mounted.current || document.hidden) return
    if (intendedPlaying.current) {
      stop()
      return
    }

    const currentOperation = ++operation.current
    intendedPlaying.current = true
    const isCurrent = () => mounted.current && intendedPlaying.current && operation.current === currentOperation && !document.hidden
    const fail = (message: string) => {
      if (!isCurrent()) return
      stop()
      notifyRef.current(message)
    }

    try {
      if (source?.trim()) {
        const audio = new Audio()
        audio.preload = 'none'
        audio.loop = true
        audio.volume = 0.25
        const onError = () => fail('这段音乐暂时没有加载成功，可以稍后再试。')
        const onPause = () => { if (isCurrent()) stop() }
        const session: FileSession = { kind: 'file', audio, onError, onPause }
        sessionRef.current = session
        audio.addEventListener('error', onError)
        audio.addEventListener('pause', onPause)
        audio.src = /^https?:\/\//i.test(source) ? source : assetUrl(source)
        // Call play before the first await, retaining the button's user activation.
        await audio.play()
        if (!isCurrent() || sessionRef.current !== session) return
        setPlaying(true)
        return
      }

      const AudioContextClass = window.AudioContext || (window as AudioWindow).webkitAudioContext
      if (!AudioContextClass) {
        fail('这个浏览器暂不支持音乐，仍然可以点亮和欣赏圣诞树。')
        return
      }
      const context = new AudioContextClass()
      let master: GainNode
      try {
        master = context.createGain()
        master.gain.value = 0.36
        master.connect(context.destination)
      } catch (error: unknown) {
        void context.close().catch(() => undefined)
        throw error
      }
      const session: BellSession = {
        kind: 'bells', context, master, voices: new Set(), timer: null, onStateChange: null,
      }
      sessionRef.current = session
      // AudioContext creation and resume both happen directly in the click callback.
      await context.resume()
      if (!isCurrent() || sessionRef.current !== session) return
      if (context.state !== 'running') {
        fail('音乐暂时无法播放，可以再点一次音乐按钮试试。')
        return
      }

      let nextPhrase = context.currentTime + 0.04
      const schedulePhrase = () => {
        if (!isCurrent() || sessionRef.current !== session) return false
        try {
          const start = Math.max(nextPhrase, context.currentTime + 0.025)
          for (const [time, frequency, strength] of MOTIF) {
            scheduleBell(session, start + time, frequency, strength)
          }
          nextPhrase = start + 12
          session.timer = window.setTimeout(schedulePhrase, Math.max(0, (nextPhrase - context.currentTime - 0.25) * 1000))
          return true
        } catch {
          fail('音乐暂时无法播放，可以稍后再试。')
          return false
        }
      }
      session.onStateChange = () => {
        // An OS/audio-route interruption also resets the button; never auto-resume.
        if (isCurrent() && context.state !== 'running') stop()
      }
      context.addEventListener('statechange', session.onStateChange)
      if (!schedulePhrase()) return
      setPlaying(true)
    } catch (error: unknown) {
      const blocked = error instanceof DOMException && error.name === 'NotAllowedError'
      fail(blocked
        ? '请再点一次音乐按钮；也可以在手机浏览器中打开。'
        : '音乐暂时无法播放，可以稍后再试。')
    }
  }, [source, stop])

  return { playing, toggle }
}

export default useMusic
