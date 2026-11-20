import { describe, expect, it } from 'vitest'
import { initialState } from '../store/defaults'
import type { State, Task } from '../store/types'
import { at } from './date'
import { collectDue, dueAlarms, nextAlarm } from './engine'
import { planDay } from './planner'
import { prioritize } from './prioritize'
import { describeRecurrence, nextOccurrence } from './recurrence'

const mkTask = (p: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), title: 'T', createdAt: 0, updatedAt: 0, priority: 2, category: 'other', tags: [], completedAt: null, ...p,
})
const base = (): State => {
  const s = initialState()
  s.settings.morningBrief = null
  s.settings.eveningReview = null
  s.settings.quietStart = null
  s.settings.quietEnd = null
  s.routines.forEach((r) => (r.time = null))
  return s
}
const T = (h: number, m = 0) => new Date(2026, 10, 18, h, m).getTime() // Wed 18 Nov 2026

describe('recurrence', () => {
  it('daily / weekly / monthly / yearly', () => {
    expect(nextOccurrence({ freq: 'daily' }, '2026-11-18')).toBe('2026-11-19')
    expect(nextOccurrence({ freq: 'daily', interval: 3 }, '2026-11-18')).toBe('2026-11-21')
    expect(nextOccurrence({ freq: 'weekly', days: [1, 4] }, '2026-11-18')).toBe('2026-11-19') // Thu
    expect(nextOccurrence({ freq: 'weekly', days: [1] }, '2026-11-23')).toBe('2026-11-30')
    expect(nextOccurrence({ freq: 'monthly', day: 31 }, '2026-01-31')).toBe('2026-02-28') // clamps
    expect(nextOccurrence({ freq: 'monthly', day: 5 }, '2026-11-18')).toBe('2026-12-05')
    expect(nextOccurrence({ freq: 'yearly', month: 2, day: 29 }, '2026-03-01')).toBe('2027-02-28')
  })
  it('describes rules in Portuguese', () => {
    expect(describeRecurrence({ freq: 'weekly', days: [1, 2, 3, 4, 5] })).toBe('dias úteis')
    expect(describeRecurrence({ freq: 'monthly', day: 25 })).toBe('todo dia 25')
  })
})

describe('reminder engine', () => {
  it('fires a timed task once, not before, and dedupes', () => {
    const s = base()
    s.tasks.push(mkTask({ id: 'a', due: '2026-11-18', time: '14:00' }))
    expect(collectDue(s, T(13, 30)).filter((r) => r.kind === 'task')).toHaveLength(0)
    const r = collectDue(s, T(14, 0)).find((x) => x.kind === 'task')!
    expect(r.taskId).toBe('a')
    s.fired[r.key] = T(14, 0)
    expect(collectDue(s, T(14, 1)).filter((x) => x.kind === 'task')).toHaveLength(0)
  })
  it('sends a transition heads-up before the task', () => {
    const s = base()
    s.tasks.push(mkTask({ id: 'a', due: '2026-11-18', time: '14:00', title: 'Sair para a consulta' }))
    const r = collectDue(s, T(13, 46))
    expect(r.map((x) => x.kind)).toEqual(['headsup'])
    expect(r[0].title).toBe('Em 15 min: Sair para a consulta')
  })
  it('snooze moves the reminder', () => {
    const s = base()
    s.tasks.push(mkTask({ id: 'a', due: '2026-11-18', time: '14:00', snoozedUntil: T(14, 15) }))
    expect(collectDue(s, T(14, 5)).filter((x) => x.kind === 'task')).toHaveLength(0)
    expect(collectDue(s, T(14, 15)).filter((x) => x.kind === 'task')).toHaveLength(1)
  })
  it('persistent tasks nag up to nagMax', () => {
    const s = base()
    s.tasks.push(mkTask({ id: 'a', due: '2026-11-18', time: '14:00', persistent: true }))
    const first = collectDue(s, T(14, 0)).find((x) => x.kind === 'task')!
    s.fired[first.key] = T(14, 0)
    expect(collectDue(s, T(14, 5)).some((x) => x.kind === 'nag')).toBe(false)
    const nag = collectDue(s, T(14, 10)).find((x) => x.kind === 'nag')!
    expect(nag).toBeTruthy()
    s.fired[nag.key] = T(14, 10); s.nags[first.key] = 3
    expect(collectDue(s, T(15, 0)).some((x) => x.kind === 'nag')).toBe(false)
  })
  it('respects quiet hours except for important items', () => {
    const s = base()
    s.settings.quietStart = '23:00'; s.settings.quietEnd = '07:00'
    s.tasks.push(mkTask({ due: '2026-11-18', time: '23:30' }), mkTask({ due: '2026-11-18', time: '23:30', priority: 1 }))
    const r = collectDue(s, T(23, 30)).filter((x) => x.kind === 'task')
    expect(r).toHaveLength(1)
    expect(r[0].important).toBe(true)
  })
  it('does not fire completed or someday tasks', () => {
    const s = base()
    s.tasks.push(mkTask({ due: '2026-11-18', time: '14:00', completedAt: 1 }), mkTask({ due: '2026-11-18', time: '14:00', someday: true }))
    expect(collectDue(s, T(14, 0))).toHaveLength(0)
  })
  it('bill reminders before and on due day, none when paid', () => {
    const s = base()
    s.bills.push({ id: 'b', name: 'Internet', amount: 99.9, dueDay: 20, remindDaysBefore: 2, paid: {}, active: true })
    const r = collectDue(s, T(9, 0))
    expect(r.find((x) => x.kind === 'bill')?.title).toBe('Internet vence em 2 dias')
    s.bills[0].paid['2026-11'] = 1
    expect(collectDue(s, T(9, 0)).filter((x) => x.kind === 'bill')).toHaveLength(0)
  })
  it('morning briefing summarises the day', () => {
    const s = base()
    s.settings.morningBrief = '07:30'
    s.settings.name = 'Ana'
    s.tasks.push(mkTask({ title: 'Dentista', due: '2026-11-18', time: '10:00' }), mkTask({ due: '2026-11-18' }))
    const r = collectDue(s, T(7, 31)).find((x) => x.kind === 'morning')!
    expect(r.title).toBe('Bom dia, Ana')
    expect(r.body).toContain('2 coisas para hoje')
    expect(r.body).toContain('10:00 (Dentista)')
  })
})

describe('alarms', () => {
  it('rings on scheduled days, tolerates small delays, and snoozes', () => {
    const s = base()
    s.alarms = [{ id: 'x', label: 'Acordar', time: '07:00', days: [3], enabled: true, sound: 'suave', ramp: true, snoozeMin: 9, challenge: 'none' }]
    expect(dueAlarms(s, T(6, 59))).toHaveLength(0)
    expect(dueAlarms(s, T(7, 3))).toHaveLength(1)
    expect(dueAlarms(s, T(7, 20))).toHaveLength(0) // too late, don't surprise the user
    s.alarms[0].snoozeUntil = T(7, 9)
    expect(dueAlarms(s, T(7, 9))[0].key).toContain('alarmsnz')
  })
  it('skip-once and next alarm', () => {
    const s = base()
    s.alarms = [{ id: 'x', label: 'A', time: '07:00', days: [], enabled: true, sound: 'suave', ramp: true, snoozeMin: 9, challenge: 'none', skipDate: '2026-11-18' }]
    expect(dueAlarms(s, T(7, 0))).toHaveLength(0)
    expect(nextAlarm(s, T(6, 0))!.at).toBe(at('2026-11-19', '07:00'))
  })
})

describe('prioritize', () => {
  it('puts imminent and urgent things in RIGHT NOW, caps buckets', () => {
    const tasks = [
      mkTask({ id: 'soon', due: '2026-11-18', time: '10:30' }),
      mkTask({ id: 'urgent', due: '2026-11-18', priority: 1 }),
      mkTask({ id: 'today', due: '2026-11-18' }),
      mkTask({ id: 'evening', due: '2026-11-18', time: '20:00' }),
      mkTask({ id: 'late', due: '2026-11-16' }),
      mkTask({ id: 'nodate' }),
      ...Array.from({ length: 10 }, (_, i) => mkTask({ id: 'x' + i, due: '2026-11-18' })),
    ]
    const b = prioritize(tasks, T(10, 0))
    expect(b.now.map((t) => t.id)).toEqual(['soon', 'urgent'])
    expect(b.next).toHaveLength(4)
    expect(b.next[0].id).toBe('late')
    expect(b.overdue.map((t) => t.id)).toEqual(['late'])
    expect(b.now.length + b.next.length + b.later.length).toBeLessThanOrEqual(11)
    expect(b.hidden).toBeGreaterThan(0)
  })
})

describe('planner', () => {
  it('keeps fixed events, pads estimates, leaves room and overflows', () => {
    const tasks = [
      mkTask({ id: 'class', due: '2026-11-18', time: '14:00', durationMin: 120 }),
      ...Array.from({ length: 12 }, (_, i) => mkTask({ id: 't' + i, due: '2026-11-18', durationMin: 60 })),
    ]
    const p = planDay(tasks, T(10, 0), { dayStart: '08:00', dayEnd: '18:00', estimateMultiplier: 1.5 })
    expect(p.blocks.find((b) => b.kind === 'fixed')?.task?.id).toBe('class')
    const planned = p.blocks.filter((b) => b.kind === 'task')
    expect(planned.every((b) => b.end - b.start === 90)).toBe(true)
    expect(p.plannedMin).toBeLessThanOrEqual(p.freeMin * 0.7)
    expect(p.overflow.length).toBeGreaterThan(0)
    // nothing overlaps
    const sorted = [...p.blocks].sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end)
  })
})
