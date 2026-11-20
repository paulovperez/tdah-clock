import type { ISODate, Recurrence } from '../store/types'
import { addDays, daysInMonth, fromISO, toISO, WEEKDAYS_SHORT } from './date'

/** First occurrence strictly after `after`. */
export function nextOccurrence(rule: Recurrence, after: ISODate): ISODate {
  const base = fromISO(after)
  switch (rule.freq) {
    case 'daily':
      return toISO(addDays(base, Math.max(1, rule.interval ?? 1)))
    case 'weekly': {
      const days = rule.days.length ? rule.days : [base.getDay()]
      const interval = Math.max(1, rule.interval ?? 1)
      for (let i = 1; i <= 7 * interval + 7; i++) {
        const d = addDays(base, i)
        if (!days.includes(d.getDay())) continue
        // For interval > 1, skip weeks that are not on the cycle.
        if (interval > 1) {
          const weeks = Math.floor((startOfWeek(d).getTime() - startOfWeek(base).getTime()) / (7 * 86400000))
          if (weeks % interval !== 0) continue
        }
        return toISO(d)
      }
      return toISO(addDays(base, 7))
    }
    case 'monthly': {
      let y = base.getFullYear(), m = base.getMonth()
      const candidate = new Date(y, m, Math.min(rule.day, daysInMonth(y, m)))
      if (candidate > base) return toISO(candidate)
      m += 1
      if (m > 11) { m = 0; y += 1 }
      return toISO(new Date(y, m, Math.min(rule.day, daysInMonth(y, m))))
    }
    case 'yearly': {
      let y = base.getFullYear()
      const mk = (yy: number) => new Date(yy, rule.month - 1, Math.min(rule.day, daysInMonth(yy, rule.month - 1)))
      let c = mk(y)
      if (c <= base) c = mk(++y)
      return toISO(c)
    }
  }
}

/** First occurrence on or after `from`. */
export function firstOccurrence(rule: Recurrence, from: ISODate): ISODate {
  return nextOccurrence(rule, toISO(addDays(fromISO(from), -1)))
}

function startOfWeek(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
}

export function describeRecurrence(r: Recurrence | null | undefined): string {
  if (!r) return ''
  switch (r.freq) {
    case 'daily':
      return (r.interval ?? 1) > 1 ? `a cada ${r.interval} dias` : 'todo dia'
    case 'weekly': {
      const d = [...r.days].sort()
      if (d.join() === '1,2,3,4,5') return 'dias úteis'
      if (d.join() === '0,6') return 'fins de semana'
      if (d.length === 7) return 'todo dia'
      const names = d.map((x) => WEEKDAYS_SHORT[x]).join(', ')
      return (r.interval ?? 1) > 1 ? `a cada ${r.interval} semanas (${names})` : `toda ${names}`
    }
    case 'monthly':
      return `todo dia ${r.day}`
    case 'yearly':
      return `todo ano em ${r.day}/${r.month}`
  }
}
