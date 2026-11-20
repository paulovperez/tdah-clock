import { useMemo, useState } from 'react'
import type { Task } from '../store/types'
import { useStore } from '../store/store'
import { prioritize, suggestNow } from '../lib/prioritize'
import { at, formatClock, hhmmToMin, humanizeDelta, longDate, monthKey, nowHHMM, toISO } from '../lib/date'
import { billDueDate, greeting, nextAlarm } from '../lib/engine'
import { completeTask, startTask, stopActiveTask } from '../store/actions'
import { Icon, Ring, toast, useNow } from '../components/ui'
import { TaskRow, TriageSheet } from '../components/tasks'

interface Props {
  onOpenTask: (t: Task) => void
  onCapture: () => void
  onLeaving: () => void
  onNavigate: (r: string) => void
  onRoutine: (id: string) => void
}

export function Today({ onOpenTask, onCapture, onLeaving, onNavigate, onRoutine }: Props) {
  const now = useNow(1000)
  const tasks = useStore((s) => s.tasks)
  const settings = useStore((s) => s.settings)
  const alarms = useStore((s) => s.alarms)
  const routines = useStore((s) => s.routines)
  const bills = useStore((s) => s.bills)
  const active = useStore((s) => s.active)
  const [skip, setSkip] = useState<string[]>([])
  const [triage, setTriage] = useState(false)
  const minute = Math.floor(now / 60000)
  const today = toISO(new Date(now))

  const buckets = useMemo(() => prioritize(tasks, now), [tasks, minute]) // eslint-disable-line
  const suggestion = suggestNow(buckets, skip)
  const next = nextAlarm({ alarms } as any, now)
  const activeTask = active ? tasks.find((t) => t.id === active.taskId) : null
  const upcoming = useMemo(() => tasks
    .filter((t) => !t.completedAt && t.due === today && t.time && at(t.due, t.time) > now && at(t.due, t.time) - now < 3 * 3600000)
    .sort((a, b) => a.time!.localeCompare(b.time!))[0], [tasks, minute]) // eslint-disable-line
  const todaysRoutines = routines.filter((r) => !r.days.length || r.days.includes(new Date(now).getDay()))
  const dueBills = bills.filter((b) => {
    if (!b.active || b.paid[monthKey(new Date(now))]) return false
    const d = billDueDate(b, new Date(now))
    const diff = (new Date(d + 'T00:00').getTime() - new Date(today + 'T00:00').getTime()) / 86400000
    return diff <= 5
  })
  const timedToday = tasks.filter((t) => !t.completedAt && t.due === today && t.time)
  const nothing = !buckets.now.length && !buckets.next.length && !buckets.later.length
  const d = new Date(now)

  return (
    <div className="page">
      <header className="hero">
        <div>
          <div className="greet">{greeting(d, settings.name)}</div>
          <div className="clock num" aria-label={`Agora são ${nowHHMM(d)}`}>{nowHHMM(d)}</div>
          <div className="date">{longDate(d).charAt(0).toUpperCase() + longDate(d).slice(1)}</div>
        </div>
        <DayRing now={now} start={settings.dayStart} end={settings.dayEnd} events={timedToday.map((t) => t.time!)} />
      </header>

      {activeTask && active && (
        <div className="active-banner" style={{ marginTop: 14 }}>
          <Icon name="timer" />
          <div className="spacer" style={{ minWidth: 0 }}>
            <div className="tiny" style={{ fontWeight: 800, color: 'var(--sky)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Fazendo agora</div>
            <div style={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{activeTask.title}</div>
            {activeTask.durationMin ? <div className="tiny muted">Estimado: {activeTask.durationMin} min{now - active.startedAt > activeTask.durationMin * 60000 ? ' · passou do estimado, tudo bem' : ''}</div> : null}
          </div>
          <div className="el num">{formatClock(now - active.startedAt)}</div>
          <button className="icon-btn" aria-label="Pausar" onClick={stopActiveTask}><Icon name="pause" /></button>
          <button className="icon-btn" aria-label="Concluir" onClick={() => { completeTask(activeTask.id); toast('Feito ✓', { undo: true }) }}><Icon name="check" /></button>
        </div>
      )}

      <div className="quick-row">
        <button className="quick" onClick={onLeaving}><span className="ic" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="door" size={19} /></span><span>Vou sair<small>checklist</small></span></button>
        <button className="quick" onClick={() => onNavigate('clock')}><span className="ic" style={{ background: 'var(--sky-soft)', color: 'var(--sky)' }}><Icon name="clock" size={19} /></span>
          <span>{next ? next.alarm.label : 'Alarmes'}<small>{next ? `${new Date(next.at).toTimeString().slice(0, 5)} · ${humanizeDelta(next.at - now)}` : 'nenhum ativo'}</small></span></button>
        <button className="quick" onClick={() => onNavigate('planner')}><span className="ic" style={{ background: 'var(--sage-soft)', color: 'var(--sage)' }}><Icon name="planner" size={19} /></span><span>Planejar<small>o dia, com folga</small></span></button>
        <button className="quick" onClick={() => onNavigate('dump')}><span className="ic" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><Icon name="brain" size={19} /></span><span>Despejar<small>a mente</small></span></button>
      </div>

      <button className="capture-bar" style={{ marginTop: 10 }} onClick={onCapture}>
        <Icon name="plus" /> Lembrar de algo… <span className="kbd">N</span>
      </button>

      {upcoming && <Countdown t={upcoming} now={now} transitionMin={settings.transitionMin} onOpen={onOpenTask} />}

      {suggestion && (
        <section className="section">
          <div className="focus-card">
            <svg className="hand" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="6" /><path d="M50 50V18M50 50l22 12" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></svg>
            <div className="label">O que faço agora?</div>
            <div className="what">{suggestion.title}</div>
            <div className="why">{whyNow(suggestion, now)}</div>
            <div className="actions">
              <button className="btn primary" onClick={() => { startTask(suggestion.id); toast('Valendo! O cronômetro está rodando') }}><Icon name="play" size={18} /> Começar</button>
              <button className="btn" onClick={() => { completeTask(suggestion.id); toast('Feito ✓', { undo: true }) }}>Já fiz</button>
              <button className="btn" onClick={() => setSkip((s) => [...s, suggestion.id])}>Agora não</button>
            </div>
            {suggestion.steps?.find((s) => !s.done) && <div className="tiny" style={{ marginTop: 12, opacity: .75 }}>Primeiro passo: {suggestion.steps.find((s) => !s.done)!.text}</div>}
          </div>
        </section>
      )}

      {buckets.overdue.length > 0 && (
        <section className="section">
          <button className="card row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setTriage(true)}>
            <span style={{ fontSize: 24 }}>🌱</span>
            <span className="spacer"><strong>{buckets.overdue.length} {buckets.overdue.length > 1 ? 'coisas ficaram' : 'coisa ficou'} para trás</strong><div className="small muted">Sem culpa — leva 1 minuto decidir.</div></span>
            <Icon name="chevron" />
          </button>
        </section>
      )}

      {nothing ? (
        <section className="section card">
          <div className="empty" style={{ padding: '18px 10px' }}>
            <div className="big">☀️</div>
            <strong>Nada urgente por aqui</strong>
            <div className="small">Lembrou de algo? Toque em “Lembrar de algo” e escreva do seu jeito.</div>
          </div>
        </section>
      ) : (
        <>
          <Bucket kind="now" label="Agora" tasks={buckets.now} now={now} onOpen={onOpenTask} />
          <Bucket kind="next" label="Em seguida" tasks={buckets.next} now={now} onOpen={onOpenTask} />
          <Bucket kind="later" label="Depois" tasks={buckets.later} now={now} onOpen={onOpenTask} />
          {buckets.hidden > 0 && <p className="small muted" style={{ textAlign: 'center' }}>+{buckets.hidden} guardadas para não sobrecarregar · <button className="link" style={{ color: 'var(--accent)', fontWeight: 700 }} onClick={() => onNavigate('tasks')}>ver todas</button></p>}
        </>
      )}

      {todaysRoutines.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Rotinas de hoje</h2><button className="link" onClick={() => onNavigate('routines')}>Todas</button></div>
          <div className="stack">
            {todaysRoutines.map((r) => {
              const done = r.log[today]?.length ?? 0
              const pct = r.steps.length ? done / r.steps.length : 0
              return (
                <button key={r.id} className="card routine-card" style={{ width: '100%', textAlign: 'left' }} onClick={() => onRoutine(r.id)}>
                  <span className="emo">{r.emoji}</span>
                  <span className="spacer">
                    <strong>{r.name}</strong>
                    <div className="tiny muted" style={{ margin: '2px 0 6px' }}>{pct >= 1 ? 'Concluída hoje ✓' : `${done}/${r.steps.length} passos${r.time ? ` · ${r.time}` : ''}`}</div>
                    <div className="progress"><div style={{ width: `${pct * 100}%` }} /></div>
                  </span>
                  <Icon name={pct >= 1 ? 'check' : 'play'} />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {dueBills.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Contas chegando</h2><button className="link" onClick={() => onNavigate('finance')}>Contas</button></div>
          <div className="list">
            {dueBills.map((b) => {
              const due = billDueDate(b, new Date(now))
              const late = due < today
              return (
                <button key={b.id} className="item" style={{ width: '100%' }} onClick={() => onNavigate('finance')}>
                  <span style={{ fontSize: 22 }}>💳</span>
                  <span className="body"><span className="title">{b.name}</span>
                    <span className="meta"><span className={late ? 'late' : ''}>{late ? 'Atrasada · ' : ''}dia {b.dueDay}</span>{b.amount ? <span>R$ {b.amount.toFixed(2).replace('.', ',')}</span> : null}</span></span>
                  <Icon name="chevron" />
                </button>
              )
            })}
          </div>
        </section>
      )}

      {triage && <TriageSheet tasks={buckets.overdue} onClose={() => setTriage(false)} />}
    </div>
  )
}

function whyNow(t: Task, now: number) {
  const today = toISO(new Date(now))
  if (t.due && t.time) {
    const ms = at(t.due, t.time) - now
    if (ms < -60000) return `Era para ${t.due === today ? 'hoje' : t.due} às ${t.time}. Ainda dá.`
    return `Marcado para ${t.time} — ${humanizeDelta(ms)}.`
  }
  if (t.due && t.due < today) return 'Ficou de antes. Que tal tirar do caminho?'
  if (t.priority === 1) return 'Você marcou como importante.'
  if (t.durationMin) return `Leva uns ${t.durationMin} min. Pequeno o suficiente para começar.`
  return 'Um passo de cada vez.'
}

function Bucket({ kind, label, tasks, now, onOpen }: { kind: string; label: string; tasks: Task[]; now: number; onOpen: (t: Task) => void }) {
  if (!tasks.length) return null
  return (
    <section className="section">
      <div className={`bucket ${kind}`}>
        <div className="bucket-head"><span className="bar" />{label}</div>
        {tasks.map((t) => <TaskRow key={t.id} t={t} now={now} onOpen={onOpen} />)}
      </div>
    </section>
  )
}

function Countdown({ t, now, transitionMin, onOpen }: { t: Task; now: number; transitionMin: number; onOpen: (t: Task) => void }) {
  const start = at(t.due!, t.time!)
  const ms = start - now
  const window = 3 * 3600000
  const leaveIn = t.category === 'appointment' ? ms - transitionMin * 60000 : null
  return (
    <section className="section">
      <button className="card countdown" style={{ width: '100%', textAlign: 'left' }} onClick={() => onOpen(t)}>
        <Ring value={1 - ms / window} size={58} stroke={7} />
        <div className="spacer" style={{ minWidth: 0 }}>
          <div className="tiny muted" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>Próximo · {t.time}</div>
          <div style={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{t.title}</div>
          {leaveIn !== null && <div className="small" style={{ color: leaveIn < 0 ? 'var(--danger)' : 'var(--amber)', fontWeight: 700 }}>{leaveIn < 0 ? 'Hora de sair!' : `Saia ${humanizeDelta(leaveIn)}`}</div>}
        </div>
        <div className="t num">{humanizeDelta(ms).replace('em ', '')}</div>
      </button>
    </section>
  )
}

/** The waking day as an arc: how much is gone, how much is left, and where the fixed things sit. */
function DayRing({ now, start, end, events }: { now: number; start: string; end: string; events: string[] }) {
  const d = new Date(now)
  const s = hhmmToMin(start), e = hhmmToMin(end)
  const cur = d.getHours() * 60 + d.getMinutes()
  const span = Math.max(60, e - s)
  const frac = Math.max(0, Math.min(1, (cur - s) / span))
  const left = Math.max(0, e - cur)
  const R = 54, C = 2 * Math.PI * R, ARC = 0.8 // 288° arc, gap at the bottom
  const angle = (f: number) => (-234 + f * 288) * (Math.PI / 180)
  const pt = (f: number, r = R) => [70 + r * Math.cos(angle(f)), 70 + r * Math.sin(angle(f))]
  const [hx, hy] = pt(frac)
  return (
    <svg className="dayring" viewBox="0 0 140 140" role="img" aria-label={`Restam ${Math.floor(left / 60)} horas e ${left % 60} minutos do seu dia`}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${C * ARC} ${C}`} transform="rotate(126 70 70)" />
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${C * ARC * frac} ${C}`} transform="rotate(126 70 70)" style={{ transition: 'stroke-dasharray 1s' }} />
      {events.map((t, i) => {
        const f = (hhmmToMin(t) - s) / span
        if (f < 0 || f > 1) return null
        const [x, y] = pt(f)
        return <circle key={i} cx={x} cy={y} r="4.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2" />
      })}
      <circle cx={hx} cy={hy} r="8" fill="var(--surface)" stroke="var(--accent)" strokeWidth="4" style={{ transition: "all 1s" }} />

      <text x="70" y="74" textAnchor="middle" fontSize="22" fontWeight="800" letterSpacing="-0.5" fill="var(--ink)" fontFamily="var(--font)">{cur >= e ? "fim" : `${Math.floor(left / 60)}h${String(left % 60).padStart(2, "0")}`}</text>
      <text x="70" y="91" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-3)" fontFamily="var(--font)">{cur >= e ? "descanse" : "restam hoje"}</text>
    </svg>
  )
}
