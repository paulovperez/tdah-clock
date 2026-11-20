import type { Task } from '../store/types'
import { at, toISO, addDaysISO } from './date'

export interface Buckets { now: Task[]; next: Task[]; later: Task[]; hidden: number; overdue: Task[] }

const CAP = { now: 3, next: 4, later: 4 }

/**
 * Splits open tasks into RIGHT NOW / NEXT / LATER. Keeps each bucket tiny on purpose —
 * the full list lives in the Tasks tab.
 */
export function prioritize(tasks: Task[], nowMs: number): Buckets {
  const today = toISO(new Date(nowMs))
  const soon = addDaysISO(today, 3)
  const now: [number, Task][] = [], next: [number, Task][] = [], later: [number, Task][] = []
  const overdue: Task[] = []

  for (const t of tasks) {
    if (t.completedAt || t.someday) continue
    if (t.snoozedUntil && t.snoozedUntil > nowMs) { later.push([500, t]); continue }
    const timed = t.due && t.time ? at(t.due, t.time) : null
    const isOverdue = !!t.due && (t.due < today || (timed !== null && timed < nowMs - 30 * 60000))
    if (isOverdue) overdue.push(t)

    if (timed !== null && t.due === today) {
      const mins = (timed - nowMs) / 60000
      if (mins <= 60) now.push([mins, t])
      else if (mins <= 240) next.push([mins, t])
      else later.push([mins, t])
      continue
    }
    if (t.due && t.due < today) {
      ;(t.priority === 1 ? now : next).push([t.priority * 100 - 50, t])
      continue
    }
    if (t.due === today) {
      ;(t.priority === 1 ? now : next).push([t.priority * 100 + (t.durationMin ?? 30) / 10, t])
      continue
    }
    if (t.due && t.due <= soon) { later.push([t.priority * 100 + 200, t]); continue }
    if (!t.due && t.priority === 1 && !t.context) later.push([150, t])
  }

  const sort = (a: [number, Task][]) => a.sort((x, y) => x[0] - y[0]).map((x) => x[1])
  const N = sort(now), X = sort(next), L = sort(later)
  // overflow from a full bucket flows down instead of piling up at the top
  const nowCut = N.slice(0, CAP.now)
  const nextAll = [...N.slice(CAP.now), ...X]
  const nextCut = nextAll.slice(0, CAP.next)
  const laterAll = [...nextAll.slice(CAP.next), ...L]
  const laterCut = laterAll.slice(0, CAP.later)
  return { now: nowCut, next: nextCut, later: laterCut, hidden: laterAll.length - laterCut.length, overdue }
}

/** The single best thing to do now, skipping ids the user said "not now" to. */
export function suggestNow(b: Buckets, skip: string[] = []): Task | null {
  return [...b.now, ...b.next, ...b.later].find((t) => !skip.includes(t.id)) ?? null
}
