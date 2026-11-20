// ---------- Core data model (local-first, JSON-serializable) ----------

export type ISODate = string // 'YYYY-MM-DD' (local)
export type HHMM = string // 'HH:MM' (24h, local)

export type Category =
  | 'personal' | 'work' | 'study' | 'home' | 'shopping'
  | 'health' | 'financial' | 'appointment' | 'other'

export type Priority = 1 | 2 | 3 // 1 = high, 2 = normal, 3 = low

export type Recurrence =
  | { freq: 'daily'; interval?: number }
  | { freq: 'weekly'; days: number[]; interval?: number } // 0 = Sunday
  | { freq: 'monthly'; day: number } // day of month (clamped)
  | { freq: 'yearly'; month: number; day: number }

export type TaskContext =
  | { type: 'leaving' } // remind when leaving home
  | { type: 'place'; place: string } // remind when at a place (e.g. "farmácia")

export interface Step { id: string; text: string; done: boolean }

export interface Task {
  id: string
  title: string
  notes?: string
  createdAt: number
  updatedAt: number
  completedAt?: number | null
  due?: ISODate | null
  time?: HHMM | null
  durationMin?: number | null
  priority: Priority
  category: Category
  tags: string[]
  recurrence?: Recurrence | null
  context?: TaskContext | null
  someday?: boolean
  persistent?: boolean // keep nagging until done
  remindBeforeMin?: number[] // extra heads-up reminders, e.g. [15]
  snoozedUntil?: number | null // epoch ms
  steps?: Step[]
  /** history of completions for recurring tasks (epoch ms) */
  history?: number[]
  /** seconds actually spent (time awareness) */
  spentSec?: number
}

export type StoreKind = 'mercado' | 'farmacia' | 'petshop' | 'construcao' | 'outros'

export interface ShopItem {
  id: string
  name: string
  qty?: string
  store: StoreKind
  aisle: string
  checked: boolean
  addedAt: number
  purchasedAt?: number | null
}

/** Purchase history used for "frequent" suggestions. key = normalized name */
export interface ShopHistory { [key: string]: { name: string; store: StoreKind; count: number; last: number } }

export type AlarmSound = 'suave' | 'classico' | 'sino' | 'digital' | 'passaros'

export interface Alarm {
  id: string
  label: string
  time: HHMM
  days: number[] // empty = one-shot
  enabled: boolean
  sound: AlarmSound
  ramp: boolean // gradually increase volume
  snoozeMin: number
  challenge: 'none' | 'math' | 'type' // action required to dismiss
  /** ISO date this alarm is skipped once */
  skipDate?: ISODate | null
  /** epoch ms of a pending snooze ring */
  snoozeUntil?: number | null
  routineId?: string | null // start a routine after dismissing
}

export interface RoutineStep { id: string; text: string; minutes?: number }

export interface Routine {
  id: string
  name: string
  emoji: string
  steps: RoutineStep[]
  days: number[] // days it is suggested; empty = any day
  time?: HHMM | null // reminder time
  /** date -> step ids done that day */
  log: Record<ISODate, string[]>
}

export interface MemoryNote {
  id: string
  text: string
  createdAt: number
  pinned?: boolean
  tags: string[]
}

export interface Bill {
  id: string
  name: string
  amount?: number | null
  dueDay: number // day of month
  remindDaysBefore: number
  /** 'YYYY-MM' -> paid timestamp */
  paid: Record<string, number>
  autopay?: boolean
  active: boolean
}

export interface LeavingItem { id: string; text: string }

export interface Settings {
  name: string
  theme: 'system' | 'light' | 'dark'
  morningBrief: HHMM | null
  eveningReview: HHMM | null
  dayStart: HHMM // planner window
  dayEnd: HHMM
  workEnd: HHMM // "after work"
  quietStart: HHMM | null
  quietEnd: HHMM | null
  nagIntervalMin: number
  nagMax: number
  transitionMin: number // heads-up before timed tasks
  estimateMultiplier: number // learned/assumed padding for estimates
  volume: number // 0..1
  systemNotifications: boolean
  onboarded: boolean
}

export interface Timer { id: string; label: string; endsAt: number | null; remainingMs: number; totalMs: number; kind: 'timer' | 'focus' }

export interface Stopwatch { startedAt: number | null; accumulatedMs: number; laps: number[] }

export interface ActiveTask { taskId: string; startedAt: number }

export interface State {
  version: number
  tasks: Task[]
  shop: ShopItem[]
  shopHistory: ShopHistory
  alarms: Alarm[]
  routines: Routine[]
  notes: MemoryNote[]
  bills: Bill[]
  leaving: LeavingItem[]
  settings: Settings
  timers: Timer[]
  stopwatch: Stopwatch
  active: ActiveTask | null
  /** keys of reminders already fired (dedupe), value = epoch ms fired */
  fired: Record<string, number>
  /** nag counters for persistent reminders */
  nags: Record<string, number>
  /** actionable reminders waiting for a decision (survive reloads) */
  inbox: Reminder[]
}

export type ReminderKind = 'task' | 'headsup' | 'nag' | 'bill' | 'morning' | 'evening' | 'routine' | 'leaving'

export interface Reminder {
  key: string
  kind: ReminderKind
  title: string
  body: string
  at: number
  taskId?: string
  billId?: string
  routineId?: string
  important?: boolean
}
