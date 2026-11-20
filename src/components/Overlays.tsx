import { useEffect, useMemo, useState } from 'react'
import type { Alarm, Reminder, Timer } from '../store/types'
import { completeTask, dismissAlarm, dismissReminder, postponeTask, removeTimer, snoozeAlarm, startTimer, snoozeTask, toggleBillPaid, addLeavingItem, removeLeavingItem } from '../store/actions'
import { useStore } from '../store/store'
import { playAlarm } from '../lib/sound'
import { closeSystem } from '../lib/notify'
import { nowHHMM, toISO } from '../lib/date'
import { Icon, Sheet, toast } from './ui'

const KIND_LABEL: Record<Reminder['kind'], string> = {
  task: 'Lembrete', headsup: 'Transição', nag: 'Ainda pendente', bill: 'Conta', morning: 'Briefing da manhã', evening: 'Revisão da noite', routine: 'Rotina', leaving: 'Saindo',
}

export function ReminderInbox({ onNavigate, onTriage, onRoutine }: { onNavigate: (r: string) => void; onTriage: () => void; onRoutine: (id: string) => void }) {
  const inbox = useStore((s) => s.inbox)
  const tasks = useStore((s) => s.tasks)
  const [expanded, setExpanded] = useState(false)
  // reminders whose task was completed/deleted elsewhere just go away
  useEffect(() => {
    inbox.forEach((r) => {
      if (!r.taskId) return
      const t = tasks.find((x) => x.id === r.taskId)
      if (!t || t.completedAt) { dismissReminder(r.key); void closeSystem(r.key) }
    })
  }, [inbox, tasks])
  // minimized until something new arrives
  const [minimizedAt, setMinimizedAt] = useState<number | null>(null)
  const newest = inbox.reduce((m, r) => Math.max(m, r.at), 0)
  const minimized = minimizedAt !== null && newest <= minimizedAt
  if (!inbox.length) return null
  const shown = expanded ? inbox : inbox.slice(-2)
  const close = (r: Reminder) => { dismissReminder(r.key); void closeSystem(r.key) }

  if (minimized) {
    return (
      <div className="inbox" role="region" aria-label="Lembretes" style={{ alignItems: 'center' }}>
        <button className="chip on" style={{ boxShadow: 'var(--shadow-lg)' }} onClick={() => setMinimizedAt(null)}><Icon name="bell" size={15} /> {inbox.length} lembrete{inbox.length > 1 ? 's' : ''}</button>
      </div>
    )
  }

  return (
    <div className="inbox" role="region" aria-label="Lembretes">
      <div className="row" style={{ justifyContent: 'center' }}>
        {inbox.length > 2 && !expanded && <button className="chip on" onClick={() => setExpanded(true)}>+{inbox.length - 2} lembretes</button>}
        <button className="chip" style={{ boxShadow: 'var(--shadow)' }} onClick={() => { setMinimizedAt(newest); setExpanded(false) }} aria-label="Minimizar lembretes">Minimizar</button>
      </div>
      {shown.map((r) => {
        const task = r.taskId ? tasks.find((t) => t.id === r.taskId) : undefined
        if (r.taskId && (!task || task.completedAt)) return null
        return (
          <div key={r.key} className={`rem ${r.important ? 'important' : ''}`} role="alertdialog" aria-label={r.title}>
            <div className="k">{KIND_LABEL[r.kind]}</div>
            <div className="t">{r.title}</div>
            <div className="b">{r.body}</div>
            <div className="acts">
              {(r.kind === 'task' || r.kind === 'nag' || r.kind === 'headsup') && task && <>
                <button className="btn primary" onClick={() => { completeTask(task.id); close(r); toast('Feito ✓', { undo: true }) }}><Icon name="check" size={17} stroke={2.5} /> Feito</button>
                {r.kind === 'headsup' ? <button className="btn" onClick={() => close(r)}>Ok, me preparando</button> : <>
                  <button className="btn" onClick={() => { snoozeTask(task.id, 5); close(r) }}>+5 min</button>
                  <button className="btn" onClick={() => { snoozeTask(task.id, 15); close(r) }}>+15 min</button>
                  <button className="btn" onClick={() => { snoozeTask(task.id, 60); close(r) }}>+1 h</button>
                  <button className="btn" onClick={() => { postponeTask(task.id, 1); close(r); toast('Reagendado para amanhã', { undo: true }) }}>Amanhã</button>
                </>}
                <button className="btn ghost" onClick={() => close(r)}>Ignorar</button>
              </>}
              {r.kind === 'bill' && r.billId && <>
                <button className="btn primary" onClick={() => { toggleBillPaid(r.billId!); close(r); toast('Marcada como paga ✓') }}>Já paguei</button>
                <button className="btn" onClick={() => { close(r); onNavigate('finance') }}>Ver contas</button>
                <button className="btn ghost" onClick={() => close(r)}>Depois</button>
              </>}
              {r.kind === 'morning' && <>
                <button className="btn primary" onClick={() => { close(r); onNavigate('today') }}>Ver meu dia</button>
                <button className="btn" onClick={() => { close(r); onNavigate('planner') }}>Planejar o dia</button>
                <button className="btn ghost" onClick={() => close(r)}>Ok</button>
              </>}
              {r.kind === 'evening' && <>
                <button className="btn primary" onClick={() => { close(r); onTriage() }}>Revisar (1 min)</button>
                <button className="btn ghost" onClick={() => close(r)}>Hoje não</button>
              </>}
              {r.kind === 'routine' && r.routineId && <>
                <button className="btn primary" onClick={() => { close(r); onRoutine(r.routineId!) }}><Icon name="play" size={16} /> Começar</button>
                <button className="btn ghost" onClick={() => close(r)}>Agora não</button>
              </>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export type Ringing = { kind: 'alarm'; alarm: Alarm } | { kind: 'timer'; timer: Timer }

export function Ringer({ ringing, onDone }: { ringing: Ringing; onDone: (startRoutine?: string | null) => void }) {
  const volume = useStore((s) => s.settings.volume)
  const [answer, setAnswer] = useState('')
  const [time, setTime] = useState(nowHHMM())
  const alarm = ringing.kind === 'alarm' ? ringing.alarm : null
  const challenge = useMemo(() => {
    if (!alarm || alarm.challenge === 'none') return null
    if (alarm.challenge === 'type') return { q: `Digite: ${alarm.label}`, a: alarm.label.trim().toLowerCase() }
    const a = 12 + Math.floor(Math.random() * 40), b = 7 + Math.floor(Math.random() * 30)
    return { q: `${a} + ${b} = ?`, a: String(a + b) }
  }, [alarm])

  useEffect(() => {
    const stop = playAlarm(alarm?.sound ?? 'sino', { volume, ramp: alarm?.ramp ?? false })
    const id = setInterval(() => setTime(nowHHMM()), 1000)
    let wake: any = null
    ;(navigator as any).wakeLock?.request('screen').then((w: any) => (wake = w)).catch(() => {})
    return () => { stop(); clearInterval(id); wake?.release?.() }
  }, [alarm, volume])

  const solved = !challenge || answer.trim().toLowerCase() === challenge.a
  const label = alarm ? alarm.label : (ringing as { timer: Timer }).timer.label || 'Timer'

  return (
    <div className="ring-screen" role="alertdialog" aria-label={`Alarme: ${label}`}>
      <div>
        <div style={{ fontSize: 14, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 800, opacity: .6 }}>{alarm ? 'Alarme' : 'Tempo esgotado'}</div>
        <div className="bigtime num">{time}</div>
        <div className="lbl">{label}</div>
      </div>
      <div className="pulse"><Icon name={alarm ? 'clock' : 'timer'} size={64} stroke={1.5} /></div>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {challenge && (
          <label>
            <div style={{ fontWeight: 700, marginBottom: 8, opacity: .8 }}>Para desligar: {challenge.q}</div>
            <input className="input" inputMode={alarm?.challenge === 'math' ? 'numeric' : 'text'} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
          </label>
        )}
        {alarm && <button className="btn snooze block" onClick={() => { snoozeAlarm(alarm.id); onDone() }}>Soneca · {alarm.snoozeMin} min</button>}
        {!alarm && <button className="btn snooze block" onClick={() => {
          const t = (ringing as { timer: Timer }).timer
          removeTimer(t.id)
          onDone()
          startTimer(5, t.label, t.kind)
        }}>+5 min</button>}
        <button className="btn stop block" disabled={!solved} onClick={() => {
          if (alarm) dismissAlarm(alarm.id)
          else removeTimer((ringing as { timer: Timer }).timer.id)
          onDone(alarm?.routineId)
        }}>{alarm ? 'Desligar' : 'Ok'}</button>
      </div>
    </div>
  )
}

export function LeavingSheet({ onClose }: { onClose: () => void }) {
  const items = useStore((s) => s.leaving)
  const tasks = useStore((s) => s.tasks)
  const [checked, setChecked] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [newItem, setNewItem] = useState('')
  const today = toISO(new Date())
  const extra = tasks.filter((t) => !t.completedAt && (t.context?.type === 'leaving' || (t.due === today && /\b(levar|trazer|bring|take|pegar|devolver|entregar)\b/i.test(t.title))))
  const total = items.length + extra.length
  const done = checked.length
  const all = total > 0 && done >= total
  const toggle = (id: string) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  return (
    <Sheet title="Vou sair de casa" onClose={onClose} actions={<button className="btn small ghost" onClick={() => setEditing(!editing)}>{editing ? 'Pronto' : 'Editar'}</button>}>
      {all ? (
        <div className="go">
          <div className="big">🎒</div>
          <h3 style={{ margin: '6px 0' }}>Tudo certo. Pode ir!</h3>
          <p className="muted small">Boa saída. {extra.length ? 'Os itens de tarefas foram marcados como feitos.' : ''}</p>
          <button className="btn primary block" onClick={() => { extra.forEach((t) => completeTask(t.id)); onClose() }}>Fechar</button>
        </div>
      ) : (
        <>
          <div className="progress" style={{ marginBottom: 12 }}><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
          {extra.length > 0 && <>
            <div className="aisle" style={{ paddingLeft: 4 }}>Hoje você também precisa</div>
            <div className="list" style={{ marginBottom: 12 }}>
              {extra.map((t) => (
                <button key={t.id} className="item" style={{ width: '100%' }} onClick={() => toggle(t.id)}>
                  <span className={`check ${checked.includes(t.id) ? 'on' : ''}`}><Icon name="check" size={16} stroke={3} /></span>
                  <span className="body"><span className="title">{t.title}</span></span>
                </button>
              ))}
            </div>
          </>}
          <div className="aisle" style={{ paddingLeft: 4 }}>Sempre</div>
          <div className="list">
            {items.map((it) => (
              <div key={it.id} className="item">
                <button className={`check ${checked.includes(it.id) ? 'on' : ''}`} aria-label={it.text} onClick={() => toggle(it.id)}><Icon name="check" size={16} stroke={3} /></button>
                <button className="body title" onClick={() => toggle(it.id)}>{it.text}</button>
                {editing && <button className="icon-btn sm" aria-label={`Remover ${it.text}`} onClick={() => removeLeavingItem(it.id)}><Icon name="trash" size={17} /></button>}
              </div>
            ))}
            {editing && (
              <form className="item" onSubmit={(e) => { e.preventDefault(); addLeavingItem(newItem); setNewItem('') }}>
                <Icon name="plus" size={18} />
                <input className="capture-input" style={{ fontSize: 16 }} placeholder="Adicionar item (ex.: guarda-chuva)" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
              </form>
            )}
          </div>
          <p className="tiny muted" style={{ textAlign: 'center', marginTop: 12 }}>{done} de {total} conferidos</p>
        </>
      )}
    </Sheet>
  )
}
