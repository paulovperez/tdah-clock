/**
 * Reminder engine — pure. Given the state and "now", returns reminders that should fire
 * and have not fired yet. The app shell calls this every few seconds and on focus.
 */
import type { Alarm, Bill, Reminder, State, Task } from '../store/types'
import { at, daysInMonth, hhmmToMin, inQuietHours, monthKey, toISO, addDays } from './date'

const HOUR = 3600000
const TASK_GRACE = 12 * HOUR // after this, an un-noticed reminder just shows as "overdue"

export function taskFireTime(t: Task): number | null {
  if (t.snoozedUntil) return t.snoozedUntil
  if (t.due && t.time) return at(t.due, t.time)
  return null
}

export function taskKey(t: Task) {
  return t.snoozedUntil ? `snz:${t.id}:${t.snoozedUntil}` : `task:${t.id}:${t.due}:${t.time}`
}

export function isOpen(t: Task) {
  return !t.completedAt
}

export function billDueDate(b: Bill, ref: Date): string {
  const y = ref.getFullYear(), m = ref.getMonth()
  return toISO(new Date(y, m, Math.min(b.dueDay, daysInMonth(y, m))))
}

export function collectDue(s: State, nowMs: number): Reminder[] {
  const now = new Date(nowMs)
  const today = toISO(now)
  const out: Reminder[] = []
  const quiet = inQuietHours(now, s.settings.quietStart, s.settings.quietEnd)
  const fresh = (key: string) => !s.fired[key]
  const within = (t: number, grace: number) => nowMs >= t && nowMs - t < grace

  for (const t of s.tasks) {
    if (!isOpen(t) || t.someday) continue
    const ft = taskFireTime(t)

    // heads-up before timed tasks ("transition reminders")
    if (t.due && t.time && !t.snoozedUntil) {
      const start = at(t.due, t.time)
      const offsets = [...new Set([s.settings.transitionMin, ...(t.remindBeforeMin ?? [])])].filter((x) => x > 0)
      for (const off of offsets) {
        const key = `head:${t.id}:${t.due}:${t.time}:${off}`
        if (fresh(key) && nowMs >= start - off * 60000 && nowMs < start - 60000) {
          out.push({ key, kind: 'headsup', title: `Em ${off} min: ${t.title}`, body: transitionText(t, off), at: start, taskId: t.id })
        }
      }
    }

    if (ft) {
      const key = taskKey(t)
      if (fresh(key) && within(ft, TASK_GRACE)) {
        out.push({ key, kind: 'task', title: t.title, body: taskBody(t), at: ft, taskId: t.id, important: t.priority === 1 || t.persistent })
      }
      // persistent tasks keep nudging (bounded by nagMax)
      const fired = s.fired[key]
      if (t.persistent && fired) {
        const n = s.nags[key] ?? 0
        if (n < s.settings.nagMax && nowMs >= fired + s.settings.nagIntervalMin * 60000 * (n + 1)) {
          const nkey = `nag:${key}:${n + 1}`
          if (fresh(nkey)) out.push({ key: nkey, kind: 'nag', title: `Ainda pendente: ${t.title}`, body: 'Feito? Ou quer adiar com calma?', at: nowMs, taskId: t.id, important: true })
        }
      }
    } else if (t.due && !t.time && t.priority === 1) {
      // important deadline without a time: nudge at 09:00 on the day
      const key = `deadline:${t.id}:${t.due}`
      const time = at(t.due, '09:00')
      if (fresh(key) && within(time, TASK_GRACE)) out.push({ key, kind: 'task', title: `Hoje: ${t.title}`, body: 'Prazo importante hoje.', at: time, taskId: t.id, important: true })
    }
  }

  // bills
  const mk = monthKey(now)
  for (const b of s.bills) {
    if (!b.active || b.paid[mk] || b.autopay) continue
    const due = billDueDate(b, now)
    const before = toISO(addDays(new Date(at(due, '09:00')), -b.remindDaysBefore))
    const amount = b.amount ? ` — R$ ${b.amount.toFixed(2).replace('.', ',')}` : ''
    const kb = `bill:${b.id}:${mk}:before`
    if (b.remindDaysBefore > 0 && fresh(kb) && within(at(before, '09:00'), 3 * 24 * HOUR) && today < due) {
      out.push({ key: kb, kind: 'bill', title: `${b.name} vence em ${b.remindDaysBefore} dia${b.remindDaysBefore > 1 ? 's' : ''}`, body: `Vencimento dia ${b.dueDay}${amount}`, at: at(before, '09:00'), billId: b.id })
    }
    const kd = `bill:${b.id}:${mk}:due`
    if (fresh(kd) && within(at(due, '09:00'), 5 * 24 * HOUR)) {
      out.push({ key: kd, kind: 'bill', title: today === due ? `Hoje vence: ${b.name}` : `Conta atrasada: ${b.name}`, body: `Já pagou?${amount}`, at: at(due, '09:00'), billId: b.id, important: true })
    }
  }

  // morning briefing
  if (s.settings.morningBrief) {
    const key = `morning:${today}`
    const t = at(today, s.settings.morningBrief)
    if (fresh(key) && within(t, 4 * HOUR)) out.push({ key, kind: 'morning', title: greeting(now, s.settings.name), body: morningSummary(s, now), at: t })
  }

  // evening review (only when something is still open)
  if (s.settings.eveningReview) {
    const key = `evening:${today}`
    const t = at(today, s.settings.eveningReview)
    const open = s.tasks.filter((x) => isOpen(x) && !x.someday && x.due && x.due <= today).length
    if (open && fresh(key) && within(t, 3 * HOUR)) {
      out.push({ key, kind: 'evening', title: 'Revisão rápida da noite', body: `${open} coisa${open > 1 ? 's' : ''} ficou para trás. Tudo bem — vamos decidir juntos?`, at: t })
    }
  }

  // routines
  for (const r of s.routines) {
    if (!r.time || (r.days.length && !r.days.includes(now.getDay()))) continue
    const done = r.log[today]?.length ?? 0
    if (done >= r.steps.length && r.steps.length) continue
    const key = `routine:${r.id}:${today}`
    const t = at(today, r.time)
    if (fresh(key) && within(t, 2 * HOUR)) out.push({ key, kind: 'routine', title: `${r.emoji} ${r.name}`, body: `${r.steps.length} passos · ~${r.steps.reduce((a, x) => a + (x.minutes ?? 0), 0)} min`, at: t, routineId: r.id })
  }

  // in quiet hours only hold back the non-important ones (they fire later, inside their grace window)
  return quiet ? out.filter((r) => r.important) : out
}

function transitionText(t: Task, off: number) {
  if (t.category === 'appointment') return `Hora de se preparar para sair. Faltam ${off} minutos.`
  return `Comece a encerrar o que está fazendo. Faltam ${off} minutos.`
}

function taskBody(t: Task) {
  const parts: string[] = []
  if (t.durationMin) parts.push(`~${t.durationMin} min`)
  if (t.notes) parts.push(t.notes.slice(0, 80))
  return parts.join(' · ') || 'Hora de fazer isso.'
}

export function greeting(now: Date, name: string) {
  const h = now.getHours()
  const g = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  return name ? `${g}, ${name}` : g
}

export function morningSummary(s: State, now: Date) {
  const today = toISO(now)
  const todays = s.tasks.filter((t) => isOpen(t) && !t.someday && t.due === today)
  const overdue = s.tasks.filter((t) => isOpen(t) && !t.someday && t.due && t.due < today)
  const timed = todays.filter((t) => t.time).sort((a, b) => a.time!.localeCompare(b.time!))
  const bills = s.bills.filter((b) => b.active && !b.paid[monthKey(now)] && billDueDate(b, now) === today)
  const bits: string[] = []
  bits.push(todays.length ? `${todays.length} coisa${todays.length > 1 ? 's' : ''} para hoje` : 'Dia leve hoje')
  if (timed[0]) bits.push(`primeiro compromisso às ${timed[0].time} (${timed[0].title})`)
  if (overdue.length) bits.push(`${overdue.length} pendente${overdue.length > 1 ? 's' : ''} de antes`)
  if (bills.length) bits.push(`${bills.map((b) => b.name).join(', ')} vence hoje`)
  return bits.join(' · ') + '.'
}

// ---------------- alarms ----------------

export function alarmRingsOn(a: Alarm, date: Date) {
  if (!a.enabled) return false
  if (a.skipDate === toISO(date)) return false
  return !a.days.length || a.days.includes(date.getDay())
}

/** Alarms that should start ringing now. Missed alarms ring if we are < 10 min late. */
export function dueAlarms(s: State, nowMs: number): { alarm: Alarm; key: string }[] {
  const now = new Date(nowMs)
  const today = toISO(now)
  const out: { alarm: Alarm; key: string }[] = []
  for (const a of s.alarms) {
    if (a.snoozeUntil && nowMs >= a.snoozeUntil) {
      const key = `alarmsnz:${a.id}:${a.snoozeUntil}`
      if (!s.fired[key]) out.push({ alarm: a, key })
      continue
    }
    if (!alarmRingsOn(a, now)) continue
    const t = at(today, a.time)
    const key = `alarm:${a.id}:${today}:${a.time}`
    if (!s.fired[key] && nowMs >= t && nowMs - t < 10 * 60000) out.push({ alarm: a, key })
  }
  return out
}

export function nextAlarmAt(a: Alarm, nowMs: number): number | null {
  if (!a.enabled) return null
  if (a.snoozeUntil && a.snoozeUntil > nowMs) return a.snoozeUntil
  const now = new Date(nowMs)
  for (let i = 0; i < 8; i++) {
    const d = addDays(now, i)
    if (!alarmRingsOn(a, d)) continue
    const t = at(toISO(d), a.time)
    if (t > nowMs) return t
  }
  return null
}

export function nextAlarm(s: State, nowMs: number): { alarm: Alarm; at: number } | null {
  let best: { alarm: Alarm; at: number } | null = null
  for (const a of s.alarms) {
    const t = nextAlarmAt(a, nowMs)
    if (t && (!best || t < best.at)) best = { alarm: a, at: t }
  }
  return best
}

export function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes()
}

export { hhmmToMin }
