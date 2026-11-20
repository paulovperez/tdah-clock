import { useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react'
import { undo } from '../store/store'
import { WEEKDAYS_SHORT } from '../lib/date'

// ---------------- icons ----------------
const P: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  tasks: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" /></>,
  clock: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M5 3 2 6M19 3l3 3" /></>,
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6.2" /></>,
  memory: <><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4" />,
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  door: <><path d="M14 3H6v18h8M14 3l5 2v14l-5 2V3Z" /><path d="M11 12h.01" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  repeat: <path d="M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 21h4" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  wallet: <><path d="M3 7a2 2 0 0 1 2-2h13v4" /><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Z" /><circle cx="16" cy="14.5" r="1.2" /></>,
  brain: <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 4 3V3ZM15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-4 3V3Z" />,
  routine: <><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /><path d="m9 12 2 2 4-4" /></>,
  planner: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M7 9h6M7 13h10M7 17h4" /></>,
  timer: <><circle cx="12" cy="14" r="7" /><path d="M12 14V10M10 3h4" /></>,
  focus: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  flag: <path d="M5 21V4h11l-2 4 2 4H5" />,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  snooze: <path d="M4 4h6l-6 7h6M14 12h6l-6 8h6" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  undo: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  stopwatch: <><circle cx="12" cy="14" r="7" /><path d="M12 14l3-3M10 3h4M12 3v4" /></>,
  bed: <path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-8v5M7 11.5a1.5 1.5 0 1 0 0-.01" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v1M12 20v1M3 12h1M20 12h1M5.6 5.6l.7.7M17.7 17.7l.7.7M5.6 18.4l.7-.7M17.7 6.3l.7-.7" /></>,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  download: <path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" />,
  upload: <path d="M12 21V9m0 0-4 4m4-4 4 4M4 5h16" />,
}

export function Icon({ name, size = 22, stroke = 2 }: { name: keyof typeof P | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  )
}

// ---------------- time hook ----------------
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    const vis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [intervalMs])
  return now
}

// ---------------- sheet ----------------
export function Sheet({ title, onClose, children, actions }: { title?: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  // keep the latest onClose without re-running the mount effect on every render
  // (re-running it stole focus back to the first field on each keystroke)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() } }
    window.addEventListener('keydown', key)
    const first = ref.current?.querySelector<HTMLElement>('[autofocus], input, textarea, button')
    first?.focus({ preventScroll: true })
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus?.({ preventScroll: true }) }
  }, [])
  const onClose_ = () => closeRef.current()
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose_() }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} ref={ref}>
        <div className="grab" />
        {title !== undefined && (
          <div className="sheet-head">
            <h3>{title}</h3>
            {actions}
            <button className="icon-btn sm" onClick={onClose_} aria-label="Fechar"><Icon name="x" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ---------------- toast (global) ----------------
type ToastMsg = { id: number; text: string; undo?: boolean }
let toastListener: ((t: ToastMsg) => void) | null = null
let toastId = 0
export function toast(text: string, opts: { undo?: boolean } = {}) {
  toastListener?.({ id: ++toastId, text, undo: opts.undo })
}

export function ToastHost() {
  const [t, setT] = useState<ToastMsg | null>(null)
  useEffect(() => {
    toastListener = (m) => setT(m)
    return () => { toastListener = null }
  }, [])
  useEffect(() => {
    if (!t) return
    const id = setTimeout(() => setT(null), t.undo ? 5000 : 2600)
    return () => clearTimeout(id)
  }, [t])
  if (!t) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{t.text}</span>
      {t.undo && <button onClick={() => { undo(); setT(null) }}>Desfazer</button>}
    </div>
  )
}

// ---------------- small controls ----------------
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}

export function DaysPicker({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  const order = [1, 2, 3, 4, 5, 6, 0]
  return (
    <div className="days" role="group" aria-label="Dias da semana">
      {order.map((d) => (
        <button key={d} aria-pressed={days.includes(d)} aria-label={WEEKDAYS_SHORT[d]}
          onClick={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}>
          {WEEKDAYS_SHORT[d][0].toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big" aria-hidden="true">{icon}</div>
      <strong>{title}</strong>
      {children && <div className="small">{children}</div>}
    </div>
  )
}

/** Circular progress (used for countdowns and the focus timer). */
export function Ring({ value, size = 54, stroke = 6, color = 'var(--accent)', track = 'var(--surface-2)', children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .6s' }} />
      {children}
    </svg>
  )
}

// ---------------- time & duration pickers (minute-by-minute, second-by-second) ----------------

/** Repeats `fn` while the button is held (tap = one step). */
function useHold(fn: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  const start = () => {
    stop()
    fnRef.current()
    let delay = 380
    const loop = () => { fnRef.current(); delay = Math.max(45, delay * 0.8); timer.current = setTimeout(loop, delay) }
    timer.current = setTimeout(loop, delay)
  }
  useEffect(() => stop, [])
  return {
    onPointerDown: (e: RPointerEvent) => { e.preventDefault(); start() },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
    onKeyDown: (e: RKeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fnRef.current() } },
  }
}

/** A big 2-digit number you can step with ▲▼ (hold to go fast), type into, or scroll. */
export function NumField({ value, min, max, onChange, label, wrap = true, step = 1 }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; wrap?: boolean; step?: number }) {
  const [text, setText] = useState<string | null>(null)
  const valRef = useRef(value)
  valRef.current = value
  const bump = (d: number) => {
    setText(null) // stepping ends any in-progress typing (its value was already applied live)
    let v = valRef.current + d
    if (v > max) v = wrap ? min : max
    if (v < min) v = wrap ? max : min
    valRef.current = v
    onChange(v)
  }
  const up = useHold(() => bump(step))
  const down = useHold(() => bump(-step))
  // typed digits apply immediately, so tapping ▲, Salvar, etc. right after typing never loses them
  const type = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(-2) // last two digits win, like a digital clock
    setText(digits)
    const n = parseInt(digits, 10)
    if (!isNaN(n)) { const v = Math.min(max, Math.max(min, n)); valRef.current = v; onChange(v) }
  }
  const commit = () => setText(null)
  return (
    <div className="numfield">
      <button type="button" className="nf-btn" aria-label={`Aumentar ${label}`} {...up}>▲</button>
      <input className="nf-val num" inputMode="numeric" aria-label={label}
        value={text ?? String(value).padStart(2, '0')}
        onFocus={(e) => { setText(''); e.target.select() }}
        onClick={(e) => { if (text === null) { setText(''); e.currentTarget.select() } }}
        onChange={(e) => type(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(step) }
          if (e.key === 'ArrowDown') { e.preventDefault(); bump(-step) }
        }}
        onWheel={(e) => { if (document.activeElement === e.currentTarget) bump(e.deltaY < 0 ? step : -step) }} />
      <button type="button" className="nf-btn" aria-label={`Diminuir ${label}`} {...down}>▼</button>
    </div>
  )
}

/** HH:MM picker with 1-minute precision. */
export function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = (value || '07:00').split(':').map(Number)
  const set = (hh: number, mm: number) => onChange(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
  return (
    <div className="picker" role="group" aria-label="Horário">
      <NumField label="hora" value={h} min={0} max={23} onChange={(v) => set(v, m)} />
      <span className="picker-sep">:</span>
      <NumField label="minutos" value={m} min={0} max={59} onChange={(v) => set(h, v)} />
    </div>
  )
}

/** Hours / minutes / seconds picker. Value in seconds. */
export function DurationPicker({ seconds, onChange }: { seconds: number; onChange: (s: number) => void }) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60
  const set = (hh: number, mm: number, ss: number) => onChange(hh * 3600 + mm * 60 + ss)
  return (
    <div className="picker" role="group" aria-label="Duração">
      <div className="picker-col"><NumField label="horas" value={h} min={0} max={23} wrap={false} onChange={(v) => set(v, m, s)} /><span>h</span></div>
      <span className="picker-sep">:</span>
      <div className="picker-col"><NumField label="minutos" value={m} min={0} max={59} onChange={(v) => set(h, v, s)} /><span>min</span></div>
      <span className="picker-sep">:</span>
      <div className="picker-col"><NumField label="segundos" value={s} min={0} max={59} onChange={(v) => set(h, m, v)} /><span>seg</span></div>
    </div>
  )
}

/** Compact time field: shows "07:30"; tap to open an inline minute-precise picker. */
export function TimeField({ value, onChange, label, allowClear }: { value: string | null; onChange: (v: string | null) => void; label: string; allowClear?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="timefield">
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="tf-btn num" aria-label={`${label}: ${value ?? 'sem horário'}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {value ?? '— : —'}
        </button>
        {allowClear && value && <button type="button" className="icon-btn sm" aria-label={`Remover ${label}`} onClick={() => { onChange(null); setOpen(false) }}><Icon name="x" size={16} /></button>}
      </div>
      {open && (
        <div className="tf-pop">
          <TimePicker value={value ?? nowRounded()} onChange={onChange} />
          <button type="button" className="btn small primary block" onClick={() => { if (!value) onChange(nowRounded()); setOpen(false) }}>Ok</button>
        </div>
      )}
    </div>
  )
}

function nowRounded() {
  const d = new Date(Date.now() + 60 * 60000)
  return `${String(d.getHours()).padStart(2, '0')}:00`
}
