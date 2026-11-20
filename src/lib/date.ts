import type { HHMM, ISODate } from '../store/types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
  return r
}

export function addDaysISO(s: ISODate, n: number): ISODate {
  return toISO(addDays(fromISO(s), n))
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000)
}

export function hhmmToMin(t: HHMM): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function minToHHMM(min: number): HHMM {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export function nowHHMM(d = new Date()): HHMM {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Epoch ms for a local date + time. */
export function at(date: ISODate, time: HHMM): number {
  const d = fromISO(date)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

export function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

/** Next date (>= from) that falls on the given day-of-month, clamped to month length. */
export function nextMonthDay(from: Date, day: number): Date {
  const y = from.getFullYear(), m = from.getMonth()
  const thisMonth = new Date(y, m, Math.min(day, daysInMonth(y, m)))
  if (thisMonth >= startOfDay(from)) return thisMonth
  return new Date(y, m + 1, Math.min(day, daysInMonth(y, m + 1)))
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Human label relative to today: "Hoje", "Amanhã", "sex, 24 nov". */
export function relativeDay(s: ISODate, today = toISO(new Date())): string {
  const diff = daysBetween(today, s)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  const d = fromISO(s)
  if (diff > 1 && diff < 7) return WEEKDAYS_LONG[d.getDay()]
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function longDate(d: Date): string {
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`
}

/** "em 45 min", "em 2 h 10 min", "há 5 min" */
export function humanizeDelta(ms: number): string {
  const past = ms < 0
  const total = Math.round(Math.abs(ms) / 60000)
  let s: string
  if (total < 1) return past ? 'agora há pouco' : 'agora'
  if (total < 60) s = `${total} min`
  else if (total < 60 * 24) {
    const h = Math.floor(total / 60), m = total % 60
    s = m ? `${h} h ${m} min` : `${h} h`
  } else {
    const d = Math.round(total / 1440)
    s = `${d} dia${d > 1 ? 's' : ''}`
  }
  return past ? `há ${s}` : `em ${s}`
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h${pad(m)}` : `${h}h`
}

export function formatClock(ms: number, showHours = false): string {
  const t = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  return h || showHours ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function inQuietHours(now: Date, start: HHMM | null, end: HHMM | null): boolean {
  if (!start || !end) return false
  const n = now.getHours() * 60 + now.getMinutes()
  const s = hhmmToMin(start), e = hhmmToMin(end)
  return s <= e ? n >= s && n < e : n >= s || n < e
}
