import type { Parsed } from '../lib/parser'
import { capitalize } from '../lib/parser'
import { addDays, addDaysISO, at, monthKey, toISO } from '../lib/date'
import { uid } from '../lib/id'
import { nextOccurrence } from '../lib/recurrence'
import { norm } from '../lib/rx'
import { classifyItem } from '../lib/shoppingDict'
import { getState, set } from './store'
import type { Alarm, Bill, MemoryNote, Reminder, Routine, Settings, ShopItem, StoreKind, Task } from './types'

// ---------------- capture ----------------

export type CaptureResult = { kind: Parsed['kind']; label: string; taskId?: string }

/** Persist whatever the parser understood. Never fails: worst case it is a plain task. */
export function captureParsed(p: Parsed, raw: string): CaptureResult {
  const now = Date.now()
  if (p.kind === 'note') {
    addNote(p.title || raw, p.tags)
    return { kind: 'note', label: 'Guardado na Memória' }
  }
  if (p.kind === 'shopping' && p.items.length) {
    p.items.forEach((it) => addShopItem(it.name, { qty: it.qty, store: it.store, aisle: it.aisle }))
    // a dated/contextual purchase also gets a task so it shows up in the day
    if (p.due || p.time) {
      const id = addTask({ ...taskFromParsed(p), title: p.title, category: 'shopping' })
      return { kind: 'shopping', label: `Na lista de compras + lembrete`, taskId: id }
    }
    return { kind: 'shopping', label: p.items.length > 1 ? `${p.items.length} itens na lista de compras` : `"${p.items[0].name}" na lista de compras` }
  }
  if (p.kind === 'bill' && p.recurrence?.freq === 'monthly') {
    addBill({ name: p.title || raw, amount: p.amount, dueDay: p.recurrence.day, remindDaysBefore: 2 })
    return { kind: 'bill', label: 'Conta mensal criada' }
  }
  const id = addTask({ ...taskFromParsed(p), title: p.title || capitalize(raw.trim()), createdAt: now })
  return { kind: 'task', label: 'Tarefa salva', taskId: id }
}

export function taskFromParsed(p: Parsed): Partial<Task> {
  return {
    title: p.title,
    due: p.due,
    time: p.time,
    durationMin: p.durationMin,
    priority: p.priority,
    category: p.category,
    tags: p.tags,
    recurrence: p.recurrence,
    context: p.context,
    someday: p.someday,
    persistent: p.persistent,
    notes: p.amount ? `Valor: R$ ${p.amount.toFixed(2).replace('.', ',')}` : undefined,
  }
}

// ---------------- tasks ----------------

export function addTask(t: Partial<Task>): string {
  const id = uid()
  const now = Date.now()
  set((s) => {
    s.tasks.unshift({
      id, title: 'Nova tarefa', createdAt: now, updatedAt: now, priority: 2, category: 'other', tags: [],
      completedAt: null, ...t,
    } as Task)
  })
  return id
}

export function updateTask(id: string, patch: Partial<Task>) {
  set((s) => {
    const t = s.tasks.find((x) => x.id === id)
    if (!t) return
    const scheduleChanged = 'due' in patch || 'time' in patch
    Object.assign(t, patch, { updatedAt: Date.now() })
    if (scheduleChanged) clearFiredFor(s, id)
  })
}

function clearFiredFor(s: ReturnType<typeof getState>, id: string) {
  for (const k of Object.keys(s.fired)) if (k.includes(id)) delete s.fired[k]
  for (const k of Object.keys(s.nags)) if (k.includes(id)) delete s.nags[k]
  s.inbox = s.inbox.filter((r) => r.taskId !== id)
}

/** Complete a task. Recurring tasks roll forward to their next occurrence. */
export function completeTask(id: string) {
  set((s) => {
    const t = s.tasks.find((x) => x.id === id)
    if (!t) return
    const now = Date.now()
    clearFiredFor(s, id)
    if (s.active?.taskId === id) {
      t.spentSec = (t.spentSec ?? 0) + Math.round((now - s.active.startedAt) / 1000)
      s.active = null
    }
    if (t.recurrence) {
      t.history = [...(t.history ?? []), now]
      const from = t.due && t.due > toISO(new Date()) ? t.due : (t.due ?? toISO(new Date()))
      // never schedule into the past: skip occurrences already behind us
      let next = nextOccurrence(t.recurrence, from)
      const today = toISO(new Date())
      while (next < today) next = nextOccurrence(t.recurrence, next)
      if (next === today && t.time && at(next, t.time) < now) next = nextOccurrence(t.recurrence, next)
      t.due = next
      t.snoozedUntil = null
      t.steps = t.steps?.map((x) => ({ ...x, done: false }))
    } else {
      t.completedAt = now
    }
    t.updatedAt = now
  }, 'Tarefa concluída')
}

export function uncompleteTask(id: string) {
  set((s) => {
    const t = s.tasks.find((x) => x.id === id)
    if (t) { t.completedAt = null; t.updatedAt = Date.now() }
  })
}

export function deleteTask(id: string) {
  set((s) => {
    s.tasks = s.tasks.filter((t) => t.id !== id)
    clearFiredFor(s, id)
    if (s.active?.taskId === id) s.active = null
  }, 'Tarefa apagada')
}

export function snoozeTask(id: string, minutes: number) {
  set((s) => {
    const t = s.tasks.find((x) => x.id === id)
    if (!t) return
    clearFiredFor(s, id)
    t.snoozedUntil = Date.now() + minutes * 60000
    t.persistent = t.persistent // keep
  })
}

/** Move to another day without guilt. days = 1 → tomorrow. */
export function postponeTask(id: string, days: number) {
  set((s) => {
    const t = s.tasks.find((x) => x.id === id)
    if (!t) return
    clearFiredFor(s, id)
    const today = toISO(new Date())
    t.due = addDaysISO(today, days)
    t.snoozedUntil = null
    t.someday = false
  }, 'Tarefa adiada')
}

export function moveToSomeday(id: string) {
  set((s) => {
    const t = s.tasks.find((x) => x.id === id)
    if (!t) return
    clearFiredFor(s, id)
    Object.assign(t, { someday: true, due: null, time: null, snoozedUntil: null })
  }, 'Movida para "Algum dia"')
}

export function startTask(id: string) {
  set((s) => {
    const now = Date.now()
    if (s.active && s.active.taskId !== id) {
      const prev = s.tasks.find((x) => x.id === s.active!.taskId)
      if (prev) prev.spentSec = (prev.spentSec ?? 0) + Math.round((now - s.active.startedAt) / 1000)
    }
    s.active = { taskId: id, startedAt: now }
  })
}

export function stopActiveTask() {
  set((s) => {
    if (!s.active) return
    const t = s.tasks.find((x) => x.id === s.active!.taskId)
    if (t) t.spentSec = (t.spentSec ?? 0) + Math.round((Date.now() - s.active.startedAt) / 1000)
    s.active = null
  })
}

export function toggleStep(taskId: string, stepId: string) {
  set((s) => {
    const st = s.tasks.find((x) => x.id === taskId)?.steps?.find((x) => x.id === stepId)
    if (st) st.done = !st.done
  })
}

// ---------------- inbox (actionable reminders) ----------------

export function pushReminder(r: Reminder) {
  set((s) => {
    s.fired[r.key] = Date.now()
    if (!s.inbox.some((x) => x.key === r.key)) s.inbox.push(r)
    // keep it calm: never more than 6 cards waiting
    if (s.inbox.length > 6) s.inbox = s.inbox.slice(-6)
  })
}

export function markFired(key: string) {
  set((s) => { s.fired[key] = Date.now() })
}

export function dismissReminder(key: string) {
  set((s) => { s.inbox = s.inbox.filter((r) => r.key !== key) })
}

export function bumpNag(taskKey: string) {
  set((s) => { s.nags[taskKey] = (s.nags[taskKey] ?? 0) + 1 })
}

/** Drop very old dedupe keys so storage stays small. */
export function pruneFired() {
  const cutoff = Date.now() - 3 * 86400000
  set((s) => {
    for (const [k, v] of Object.entries(s.fired)) if (v < cutoff) delete s.fired[k]
  })
}

// ---------------- shopping ----------------

export function addShopItem(name: string, opt: { qty?: string; store?: StoreKind; aisle?: string } = {}) {
  const clean = capitalize(name.trim())
  if (!clean) return
  const c = classifyItem(clean)
  set((s) => {
    const existing = s.shop.find((x) => !x.checked && norm(x.name) === norm(clean))
    if (existing) { if (opt.qty) existing.qty = opt.qty; return }
    const hist = s.shopHistory[norm(clean)]
    s.shop.unshift({
      id: uid(), name: clean, qty: opt.qty, store: opt.store ?? hist?.store ?? c.store, aisle: opt.aisle ?? c.aisle,
      checked: false, addedAt: Date.now(), purchasedAt: null,
    })
  })
}

export function toggleShopItem(id: string) {
  set((s) => {
    const it = s.shop.find((x) => x.id === id)
    if (!it) return
    it.checked = !it.checked
    it.purchasedAt = it.checked ? Date.now() : null
    const k = norm(it.name)
    if (it.checked) {
      const h = s.shopHistory[k] ?? { name: it.name, store: it.store, count: 0, last: 0 }
      s.shopHistory[k] = { ...h, store: it.store, count: h.count + 1, last: Date.now() }
    } else if (s.shopHistory[k]) {
      s.shopHistory[k].count = Math.max(0, s.shopHistory[k].count - 1)
    }
  })
}

export function updateShopItem(id: string, patch: Partial<ShopItem>) {
  set((s) => { const it = s.shop.find((x) => x.id === id); if (it) Object.assign(it, patch) })
}

export function deleteShopItem(id: string) {
  set((s) => { s.shop = s.shop.filter((x) => x.id !== id) }, 'Item removido')
}

export function clearPurchased(store?: StoreKind) {
  set((s) => { s.shop = s.shop.filter((x) => !(x.checked && (!store || x.store === store))) }, 'Comprados limpos')
}

// ---------------- notes ----------------

export function addNote(text: string, tags: string[] = []) {
  const found = [...text.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)].map((m) => m[2].toLowerCase())
  const clean = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, '$1').trim()
  set((s) => {
    s.notes.unshift({ id: uid(), text: clean || text, createdAt: Date.now(), tags: [...new Set([...tags, ...found])] })
  })
}

export function updateNote(id: string, patch: Partial<MemoryNote>) {
  set((s) => { const n = s.notes.find((x) => x.id === id); if (n) Object.assign(n, patch) })
}

export function deleteNote(id: string) {
  set((s) => { s.notes = s.notes.filter((x) => x.id !== id) }, 'Nota apagada')
}

// ---------------- alarms ----------------

export function saveAlarm(a: Partial<Alarm> & { id?: string }) {
  set((s) => {
    const existing = a.id ? s.alarms.find((x) => x.id === a.id) : null
    if (existing) Object.assign(existing, a, { skipDate: a.skipDate ?? existing.skipDate })
    else s.alarms.push({
      id: uid(), label: 'Alarme', time: '07:00', days: [], enabled: true, sound: 'suave', ramp: true,
      snoozeMin: 9, challenge: 'none', routineId: null, ...a,
    } as Alarm)
    s.alarms.sort((x, y) => x.time.localeCompare(y.time))
  })
}

export function deleteAlarm(id: string) {
  set((s) => { s.alarms = s.alarms.filter((x) => x.id !== id) }, 'Alarme apagado')
}

export function snoozeAlarm(id: string) {
  set((s) => {
    const a = s.alarms.find((x) => x.id === id)
    if (a) a.snoozeUntil = Date.now() + a.snoozeMin * 60000
  })
}

export function dismissAlarm(id: string) {
  set((s) => {
    const a = s.alarms.find((x) => x.id === id)
    if (!a) return
    a.snoozeUntil = null
    if (!a.days.length) a.enabled = false // one-shot alarms switch off
  })
}

// ---------------- timers & stopwatch ----------------

export function startTimer(minutes: number, label: string, kind: 'timer' | 'focus' = 'timer') {
  const ms = Math.round(minutes * 60000)
  set((s) => {
    if (kind === 'focus') s.timers = s.timers.filter((t) => t.kind !== 'focus')
    s.timers.push({ id: uid(), label, totalMs: ms, remainingMs: ms, endsAt: Date.now() + ms, kind })
  })
}

export function pauseTimer(id: string) {
  set((s) => {
    const t = s.timers.find((x) => x.id === id)
    if (!t || !t.endsAt) return
    t.remainingMs = Math.max(0, t.endsAt - Date.now())
    t.endsAt = null
  })
}

export function resumeTimer(id: string) {
  set((s) => { const t = s.timers.find((x) => x.id === id); if (t && !t.endsAt) t.endsAt = Date.now() + t.remainingMs })
}

export function addTimerTime(id: string, minutes: number) {
  set((s) => {
    const t = s.timers.find((x) => x.id === id)
    if (!t) return
    t.totalMs += minutes * 60000
    if (t.endsAt) t.endsAt += minutes * 60000
    else t.remainingMs += minutes * 60000
  })
}

export function removeTimer(id: string) {
  set((s) => { s.timers = s.timers.filter((x) => x.id !== id) })
}

export function stopwatchToggle() {
  set((s) => {
    const w = s.stopwatch
    if (w.startedAt) { w.accumulatedMs += Date.now() - w.startedAt; w.startedAt = null }
    else w.startedAt = Date.now()
  })
}

export function stopwatchLap() {
  set((s) => {
    const w = s.stopwatch
    const elapsed = w.accumulatedMs + (w.startedAt ? Date.now() - w.startedAt : 0)
    w.laps.unshift(elapsed)
  })
}

export function stopwatchReset() {
  set((s) => { s.stopwatch = { startedAt: null, accumulatedMs: 0, laps: [] } })
}

// ---------------- routines ----------------

export function toggleRoutineStep(routineId: string, stepId: string, date = toISO(new Date())) {
  set((s) => {
    const r = s.routines.find((x) => x.id === routineId)
    if (!r) return
    const done = new Set(r.log[date] ?? [])
    done.has(stepId) ? done.delete(stepId) : done.add(stepId)
    r.log[date] = [...done]
    // keep ~60 days of history
    const keys = Object.keys(r.log).sort()
    while (keys.length > 60) delete r.log[keys.shift()!]
  })
}

export function saveRoutine(r: Partial<Routine> & { id?: string }) {
  set((s) => {
    const ex = r.id ? s.routines.find((x) => x.id === r.id) : null
    if (ex) Object.assign(ex, r)
    else s.routines.push({ id: uid(), name: 'Nova rotina', emoji: '✨', steps: [], days: [], time: null, log: {}, ...r } as Routine)
  })
}

export function deleteRoutine(id: string) {
  set((s) => { s.routines = s.routines.filter((x) => x.id !== id) }, 'Rotina apagada')
}

// ---------------- bills ----------------

export function addBill(b: Partial<Bill>) {
  set((s) => {
    s.bills.push({ id: uid(), name: 'Conta', amount: null, dueDay: 10, remindDaysBefore: 2, paid: {}, active: true, ...b } as Bill)
    s.bills.sort((x, y) => x.dueDay - y.dueDay)
  })
}

export function updateBill(id: string, patch: Partial<Bill>) {
  set((s) => { const b = s.bills.find((x) => x.id === id); if (b) Object.assign(b, patch); s.bills.sort((x, y) => x.dueDay - y.dueDay) })
}

export function deleteBill(id: string) {
  set((s) => { s.bills = s.bills.filter((x) => x.id !== id) }, 'Conta apagada')
}

export function toggleBillPaid(id: string, month = monthKey(new Date())) {
  set((s) => {
    const b = s.bills.find((x) => x.id === id)
    if (!b) return
    if (b.paid[month]) delete b.paid[month]
    else b.paid[month] = Date.now()
    s.inbox = s.inbox.filter((r) => r.billId !== id)
  })
}

// ---------------- leaving checklist ----------------

export function addLeavingItem(text: string) {
  if (!text.trim()) return
  set((s) => { s.leaving.push({ id: uid(), text: capitalize(text.trim()) }) })
}

export function removeLeavingItem(id: string) {
  set((s) => { s.leaving = s.leaving.filter((x) => x.id !== id) })
}

// ---------------- settings ----------------

export function updateSettings(patch: Partial<Settings>) {
  set((s) => { Object.assign(s.settings, patch) })
}

// ---------------- planner ----------------

export function applyPlan(assign: { taskId: string; time: string }[], postpone: string[]) {
  set((s) => {
    const today = toISO(new Date())
    for (const a of assign) {
      const t = s.tasks.find((x) => x.id === a.taskId)
      if (t) { t.due = today; t.time = a.time; clearFiredFor(s, t.id) }
    }
    const tomorrow = toISO(addDays(new Date(), 1))
    for (const id of postpone) {
      const t = s.tasks.find((x) => x.id === id)
      if (t) { t.due = tomorrow; t.time = null; clearFiredFor(s, t.id) }
    }
  }, 'Plano aplicado')
}
