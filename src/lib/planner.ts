/**
 * Realistic day planner. Fixed (timed) items stay put; flexible tasks fill the gaps
 * with buffers, padded estimates, and a hard cap so the day keeps breathing room.
 * Anything that does not fit is offered for postponing instead of being crammed in.
 */
import type { Settings, Task } from '../store/types'
import { hhmmToMin, minToHHMM, toISO } from './date'

export interface Block { start: number; end: number; kind: 'fixed' | 'task' | 'buffer' | 'free'; task?: Task }
export interface Plan { blocks: Block[]; overflow: Task[]; freeMin: number; plannedMin: number; window: [number, number] }

const BUFFER = 10
const FILL_RATIO = 0.7 // never plan more than 70% of the free time

export function estimate(t: Task, mult: number) {
  const base = t.durationMin ?? 25
  return Math.max(10, Math.ceil((base * mult) / 5) * 5)
}

export function planDay(tasks: Task[], nowMs: number, s: Pick<Settings, 'dayStart' | 'dayEnd' | 'estimateMultiplier'>): Plan {
  const now = new Date(nowMs)
  const today = toISO(now)
  const nowMin = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5
  const start = Math.max(nowMin, hhmmToMin(s.dayStart))
  const end = hhmmToMin(s.dayEnd)
  const open = tasks.filter((t) => !t.completedAt && !t.someday)

  const fixed: Block[] = open
    .filter((t) => t.due === today && t.time && hhmmToMin(t.time) + (t.durationMin ?? 30) > start && hhmmToMin(t.time) < end)
    .map((t) => ({ start: hhmmToMin(t.time!), end: hhmmToMin(t.time!) + (t.durationMin ?? 30), kind: 'fixed' as const, task: t }))
    .sort((a, b) => a.start - b.start)

  const flexible = open
    .filter((t) => !t.time && !t.context && ((t.due && t.due <= today) || (!t.due && t.priority === 1)))
    .sort((a, b) => a.priority - b.priority || (a.due ?? '9').localeCompare(b.due ?? '9') || (a.durationMin ?? 25) - (b.durationMin ?? 25))

  // gaps between fixed blocks, keeping a buffer before each fixed item
  const gaps: [number, number][] = []
  let cursor = start
  for (const f of fixed) {
    if (f.start - BUFFER > cursor) gaps.push([cursor, f.start - BUFFER])
    cursor = Math.max(cursor, f.end + BUFFER)
  }
  if (end > cursor) gaps.push([cursor, end])

  const freeMin = gaps.reduce((a, [x, y]) => a + (y - x), 0)
  const budget = Math.floor(freeMin * FILL_RATIO)
  let used = 0
  const blocks: Block[] = [...fixed]
  const overflow: Task[] = []
  const gapCursor = gaps.map(([x]) => x)

  for (const t of flexible) {
    const dur = estimate(t, s.estimateMultiplier)
    if (used + dur > budget) { overflow.push(t); continue }
    const gi = gaps.findIndex(([, y], i) => y - gapCursor[i] >= dur)
    if (gi < 0) { overflow.push(t); continue }
    const st = gapCursor[gi]
    blocks.push({ start: st, end: st + dur, kind: 'task', task: t })
    gapCursor[gi] = st + dur + BUFFER
    used += dur
  }

  blocks.sort((a, b) => a.start - b.start)
  return { blocks, overflow, freeMin, plannedMin: used, window: [start, end] }
}

export function blockLabel(b: Block) {
  return `${minToHHMM(b.start)}–${minToHHMM(b.end)}`
}
