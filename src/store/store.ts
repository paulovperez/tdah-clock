import { useSyncExternalStore } from 'react'
import { initialState } from './defaults'
import type { State } from './types'

const KEY = 'tdah-clock:v1'

type Listener = () => void
const listeners = new Set<Listener>()

function load(): State {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (raw) return migrate(JSON.parse(raw))
  } catch (e) {
    console.warn('TDAH Clock: could not read saved data', e)
  }
  return initialState()
}

/** Fill in fields added in later versions so old saves never crash the app. */
export function migrate(s: Partial<State>): State {
  const base = initialState()
  const merged = { ...base, ...s, settings: { ...base.settings, ...(s.settings ?? {}) } } as State
  merged.inbox ??= []
  merged.fired ??= {}
  merged.nags ??= {}
  merged.timers ??= []
  merged.stopwatch ??= base.stopwatch
  return merged
}

let state: State = load()
let undoStack: { label: string; snapshot: State }[] = []
let savePending = false

/** Coalesce several set() calls in the same tick into one write — no timer window where data could be lost. */
function persist() {
  if (savePending) return
  savePending = true
  queueMicrotask(saveNow)
}

export function saveNow() {
  savePending = false
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    console.error('TDAH Clock: save failed', e)
  }
}

export function getState(): State {
  return state
}

/**
 * Mutate a draft copy of the state. Pass `undo` to make the change undoable from the toast.
 */
export function set(fn: (draft: State) => void, undo?: string) {
  if (undo) {
    undoStack.push({ label: undo, snapshot: state })
    if (undoStack.length > 20) undoStack.shift()
  }
  const draft = structuredClone(state)
  fn(draft)
  state = draft
  persist()
  listeners.forEach((l) => l())
}

export function undo(): string | null {
  const last = undoStack.pop()
  if (!last) return null
  state = last.snapshot
  persist()
  listeners.forEach((l) => l())
  return last.label
}

export function replaceState(next: State) {
  state = migrate(next)
  undoStack = []
  saveNow()
  listeners.forEach((l) => l())
}

export function subscribe(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
}

// keep tabs/windows in sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = migrate(JSON.parse(e.newValue))
        listeners.forEach((l) => l())
      } catch { /* ignore */ }
    }
  })
  window.addEventListener('pagehide', saveNow)
  window.addEventListener('beforeunload', saveNow)
}
