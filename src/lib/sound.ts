/**
 * Alarm & chime sounds synthesized with WebAudio — no audio files, works offline.
 * Browsers only allow audio after a user gesture, so `unlockAudio()` runs on the first tap.
 */
import type { AlarmSound } from '../store/types'

let ctx: AudioContext | null = null

export function audio(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  return ctx
}

export function unlockAudio() {
  try {
    const c = audio()
    if (c.state === 'suspended') void c.resume()
  } catch { /* no audio support */ }
}

export function audioUnlocked() {
  return !!ctx && ctx.state === 'running'
}

type Voice = (c: AudioContext, out: AudioNode, t: number) => number // returns pattern length (s)

function tone(c: AudioContext, out: AudioNode, t: number, freq: number, dur: number, type: OscillatorType = 'sine', peak = 0.6, attack = 0.01) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
  return o
}

const VOICES: Record<AlarmSound, Voice> = {
  suave: (c, out, t) => {
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, out, t + i * 0.28, f, 1.6, 'sine', 0.45, 0.04))
    return 2.6
  },
  classico: (c, out, t) => {
    for (let i = 0; i < 4; i++) tone(c, out, t + i * 0.22, 880, 0.14, 'square', 0.25)
    return 1.4
  },
  sino: (c, out, t) => {
    ;[1, 2.76, 5.4].forEach((m, i) => tone(c, out, t, 440 * m, 2.4 - i * 0.6, 'sine', 0.5 / (i + 1), 0.005))
    return 2.2
  },
  digital: (c, out, t) => {
    for (let i = 0; i < 3; i++) { tone(c, out, t + i * 0.12, 1568, 0.08, 'triangle', 0.4); tone(c, out, t + 0.5 + i * 0.12, 1568, 0.08, 'triangle', 0.4) }
    return 1.3
  },
  passaros: (c, out, t) => {
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(), g = c.createGain()
      const st = t + i * 0.35 + Math.random() * 0.1
      o.frequency.setValueAtTime(2400, st)
      o.frequency.exponentialRampToValueAtTime(3800, st + 0.08)
      o.frequency.exponentialRampToValueAtTime(2600, st + 0.16)
      g.gain.setValueAtTime(0.0001, st)
      g.gain.exponentialRampToValueAtTime(0.3, st + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.2)
      o.connect(g).connect(out); o.start(st); o.stop(st + 0.25)
    }
    return 2.0
  },
}

export const SOUND_LABELS: Record<AlarmSound, string> = {
  suave: 'Suave', classico: 'Clássico', sino: 'Sino', digital: 'Digital', passaros: 'Pássaros',
}

/** Loop an alarm sound. Returns a stop function. */
export function playAlarm(sound: AlarmSound, opts: { volume: number; ramp: boolean; rampSeconds?: number }): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const c = audio()
    void c.resume()
    const master = c.createGain()
    master.connect(c.destination)
    const v = Math.max(0.05, Math.min(1, opts.volume))
    if (opts.ramp) {
      master.gain.setValueAtTime(v * 0.08, c.currentTime)
      master.gain.linearRampToValueAtTime(v, c.currentTime + (opts.rampSeconds ?? 45))
    } else master.gain.setValueAtTime(v, c.currentTime)
    const loop = () => {
      if (stopped) return
      const len = VOICES[sound](c, master, c.currentTime + 0.05)
      timer = setTimeout(loop, (len + 0.6) * 1000)
    }
    loop()
    if ('vibrate' in navigator) navigator.vibrate?.([400, 200, 400, 200, 400])
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      master.gain.cancelScheduledValues(c.currentTime)
      master.gain.setValueAtTime(master.gain.value, c.currentTime)
      master.gain.linearRampToValueAtTime(0, c.currentTime + 0.15)
      setTimeout(() => master.disconnect(), 400)
      navigator.vibrate?.(0)
    }
  } catch {
    return () => { stopped = true }
  }
}

/** Short, friendly reminder chime. */
export function chime(volume = 0.6, important = false) {
  try {
    const c = audio()
    if (c.state !== 'running') return
    const g = c.createGain()
    g.gain.value = volume * 0.7
    g.connect(c.destination)
    const t = c.currentTime + 0.02
    tone(c, g, t, 880, 0.5, 'sine', 0.5)
    tone(c, g, t + 0.16, 1318.5, 0.8, 'sine', 0.4)
    if (important) tone(c, g, t + 0.34, 1760, 0.9, 'sine', 0.35)
    setTimeout(() => g.disconnect(), 1500)
    navigator.vibrate?.(important ? [200, 100, 200] : 120)
  } catch { /* ignore */ }
}

export function previewSound(sound: AlarmSound, volume: number) {
  const stop = playAlarm(sound, { volume, ramp: false })
  setTimeout(stop, 2500)
  return stop
}
