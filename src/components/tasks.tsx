import { useMemo, useState } from 'react'
import type { Category, Priority, Task } from '../store/types'
import { addDaysISO, at, formatDuration, humanizeDelta, relativeDay, toISO } from '../lib/date'
import { describeRecurrence } from '../lib/recurrence'
import { completeTask, deleteTask, moveToSomeday, postponeTask, startTask, toggleStep, uncompleteTask, updateTask } from '../store/actions'
import { DaysPicker, Icon, Sheet, Switch, toast } from './ui'
import { uid } from '../lib/id'

export const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: 'personal', label: 'Pessoal', emoji: '🙂' },
  { id: 'work', label: 'Trabalho', emoji: '💼' },
  { id: 'study', label: 'Estudos', emoji: '📚' },
  { id: 'home', label: 'Casa', emoji: '🏠' },
  { id: 'shopping', label: 'Compras', emoji: '🛒' },
  { id: 'health', label: 'Saúde', emoji: '💊' },
  { id: 'financial', label: 'Finanças', emoji: '💳' },
  { id: 'appointment', label: 'Compromissos', emoji: '📍' },
  { id: 'other', label: 'Outros', emoji: '•' },
]
export const catOf = (c: Category) => CATEGORIES.find((x) => x.id === c) ?? CATEGORIES[8]

export function TaskMeta({ t, now = Date.now() }: { t: Task; now?: number }) {
  const today = toISO(new Date(now))
  const late = t.due && (t.due < today || (t.time && t.due === today && at(t.due, t.time) < now - 30 * 60000))
  const timed = t.due && t.time ? at(t.due, t.time) : null
  return (
    <div className="meta">
      {t.due && (
        <span className={late ? 'late' : ''}>
          {relativeDay(t.due, today)}{t.time ? ` · ${t.time}` : ''}
          {timed && t.due === today && timed > now && timed - now < 3 * 3600000 ? ` (${humanizeDelta(timed - now)})` : ''}
        </span>
      )}
      {t.snoozedUntil && t.snoozedUntil > now && <span><Icon name="snooze" size={12} /> {humanizeDelta(t.snoozedUntil - now)}</span>}
      {t.durationMin ? <span>⏱ {formatDuration(t.durationMin)}</span> : null}
      {t.recurrence && <span><Icon name="repeat" size={12} /> {describeRecurrence(t.recurrence)}</span>}
      {t.context?.type === 'leaving' && <span>🚪 ao sair de casa</span>}
      {t.context?.type === 'place' && <span>📍 {t.context.place}</span>}
      {t.steps?.length ? <span>☑ {t.steps.filter((s) => s.done).length}/{t.steps.length}</span> : null}
      {t.category !== 'other' && <span>{catOf(t.category).emoji} {catOf(t.category).label}</span>}
      {t.tags.map((g) => <span key={g}>#{g}</span>)}
    </div>
  )
}

export function TaskRow({ t, now, onOpen, compact }: { t: Task; now?: number; onOpen: (t: Task) => void; compact?: boolean }) {
  const done = !!t.completedAt
  return (
    <div className={`item ${done ? 'done' : ''}`}>
      {t.priority === 1 && !done && <span className="prio" aria-label="Importante" />}
      <button className={`check ${done ? 'on' : ''}`} aria-label={done ? 'Marcar como não feita' : `Concluir ${t.title}`}
        onClick={() => {
          if (done) uncompleteTask(t.id)
          else { completeTask(t.id); toast(t.recurrence ? 'Feito! Próxima já agendada ✓' : 'Feito ✓', { undo: true }) }
        }}>
        <Icon name="check" size={16} stroke={3} />
      </button>
      <button className="body" onClick={() => onOpen(t)}>
        <div className="title">{t.title}</div>
        {!compact && <TaskMeta t={t} now={now} />}
        {compact && (t.time || t.durationMin) ? <div className="meta">{t.time && <span>{t.time}</span>}{t.durationMin ? <span>⏱ {formatDuration(t.durationMin)}</span> : null}</div> : null}
      </button>
    </div>
  )
}

const QUICK_DATES: [string, (today: string) => string | null][] = [
  ['Hoje', (d) => d], ['Amanhã', (d) => addDaysISO(d, 1)], ['+1 semana', (d) => addDaysISO(d, 7)], ['Sem data', () => null],
]

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const [t, setT] = useState<Task>(task)
  const [step, setStep] = useState('')
  const today = toISO(new Date())
  const patch = (p: Partial<Task>) => setT((x) => ({ ...x, ...p }))
  const save = () => { updateTask(task.id, t); onClose() }
  const recurrenceKind = t.recurrence?.freq ?? 'none'

  return (
    <Sheet title="Tarefa" onClose={save} actions={<button className="btn small primary" onClick={save}>Salvar</button>}>
      <div className="stack">
        <input className="input" style={{ fontSize: 19, fontWeight: 700 }} value={t.title} onChange={(e) => patch({ title: e.target.value })} aria-label="Título" />

        <div className="row wrap">
          {QUICK_DATES.map(([l, f]) => {
            const v = f(today)
            return <button key={l} className="chip" aria-pressed={(t.due ?? null) === v && !t.someday} onClick={() => patch({ due: v, someday: false })}>{l}</button>
          })}
          <button className="chip" aria-pressed={!!t.someday} onClick={() => patch({ someday: !t.someday, due: null, time: null })}>Algum dia</button>
        </div>

        <div className="grid2">
          <label className="field"><span>Data</span><input type="date" className="input" value={t.due ?? ''} onChange={(e) => patch({ due: e.target.value || null, someday: false })} /></label>
          <label className="field"><span>Hora</span><input type="time" className="input" value={t.time ?? ''} onChange={(e) => patch({ time: e.target.value || null, due: t.due ?? (e.target.value ? today : null) })} /></label>
        </div>

        <div className="grid2">
          <label className="field"><span>Duração estimada</span>
            <select className="select" value={t.durationMin ?? ''} onChange={(e) => patch({ durationMin: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {[5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
            </select>
          </label>
          <label className="field"><span>Prioridade</span>
            <select className="select" value={t.priority} onChange={(e) => patch({ priority: Number(e.target.value) as Priority })}>
              <option value={1}>Importante</option><option value={2}>Normal</option><option value={3}>Sem pressa</option>
            </select>
          </label>
        </div>

        <label className="field"><span>Categoria</span>
          <div className="row wrap">
            {CATEGORIES.map((c) => <button key={c.id} className="chip" aria-pressed={t.category === c.id} onClick={() => patch({ category: c.id })}>{c.emoji} {c.label}</button>)}
          </div>
        </label>

        <label className="field"><span>Repetir</span>
          <select className="select" value={recurrenceKind} onChange={(e) => {
            const v = e.target.value
            const d = t.due ? new Date(t.due + 'T12:00') : new Date()
            patch({
              recurrence: v === 'none' ? null : v === 'daily' ? { freq: 'daily' } : v === 'weekly' ? { freq: 'weekly', days: [d.getDay()] } : v === 'monthly' ? { freq: 'monthly', day: d.getDate() } : { freq: 'yearly', month: d.getMonth() + 1, day: d.getDate() },
              due: t.due ?? today,
            })
          }}>
            <option value="none">Não repete</option><option value="daily">Todo dia</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option>
          </select>
        </label>
        {t.recurrence?.freq === 'weekly' && <DaysPicker days={t.recurrence.days} onChange={(days) => patch({ recurrence: { freq: 'weekly', days } })} />}

        <div className="card stack">
          <div className="row"><div className="spacer"><strong>Lembrete insistente</strong><div className="tiny muted">Repete até você marcar como feito (com limite).</div></div><Switch label="Lembrete insistente" on={!!t.persistent} onChange={(v) => patch({ persistent: v })} /></div>
          <div className="row"><div className="spacer"><strong>Lembrar quando eu sair de casa</strong><div className="tiny muted">Aparece no checklist "Vou sair".</div></div><Switch label="Ao sair de casa" on={t.context?.type === 'leaving'} onChange={(v) => patch({ context: v ? { type: 'leaving' } : null })} /></div>
          {t.time && (
            <label className="field"><span>Aviso antes</span>
              <div className="row wrap">
                {[5, 15, 30, 60].map((m) => {
                  const on = t.remindBeforeMin?.includes(m)
                  return <button key={m} className="chip" aria-pressed={!!on} onClick={() => patch({ remindBeforeMin: on ? t.remindBeforeMin!.filter((x) => x !== m) : [...(t.remindBeforeMin ?? []), m] })}>{m < 60 ? `${m} min` : '1 h'}</button>
                })}
              </div>
            </label>
          )}
        </div>

        <div className="field"><span>Passos pequenos (ajuda a começar)</span>
          <div className="list">
            {(t.steps ?? []).map((s) => (
              <div className="item" key={s.id} style={{ minHeight: 48 }}>
                <button className={`check sq ${s.done ? 'on' : ''}`} aria-label={s.text} onClick={() => { patch({ steps: t.steps!.map((x) => x.id === s.id ? { ...x, done: !x.done } : x) }); toggleStep(t.id, s.id) }}><Icon name="check" size={14} stroke={3} /></button>
                <div className="body">{s.text}</div>
                <button className="icon-btn sm" aria-label="Remover passo" onClick={() => patch({ steps: t.steps!.filter((x) => x.id !== s.id) })}><Icon name="x" size={16} /></button>
              </div>
            ))}
            <form className="item" style={{ minHeight: 48 }} onSubmit={(e) => { e.preventDefault(); if (!step.trim()) return; patch({ steps: [...(t.steps ?? []), { id: uid(), text: step.trim(), done: false }] }); setStep('') }}>
              <Icon name="plus" size={18} />
              <input className="capture-input" style={{ fontSize: 15.5, minHeight: 36 }} placeholder="Qual o primeiro passo minúsculo?" value={step} onChange={(e) => setStep(e.target.value)} />
            </form>
          </div>
        </div>

        <label className="field"><span>Notas</span><textarea className="textarea" style={{ minHeight: 80 }} value={t.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} /></label>

        {t.spentSec ? <div className="small muted">Tempo já dedicado: {formatDuration(Math.max(1, Math.round(t.spentSec / 60)))}</div> : null}

        <div className="row wrap">
          {!t.completedAt && <button className="btn" onClick={() => { updateTask(task.id, t); startTask(task.id); onClose(); toast('Cronômetro iniciado — foco nisso') }}><Icon name="play" size={18} /> Começar agora</button>}
          {!t.completedAt && <button className="btn" onClick={() => { postponeTask(task.id, 1); onClose(); toast('Para amanhã. Tudo bem 🙂', { undo: true }) }}>Amanhã</button>}
          {!t.completedAt && !t.someday && <button className="btn" onClick={() => { moveToSomeday(task.id); onClose(); toast('Guardada em "Algum dia"', { undo: true }) }}>Algum dia</button>}
          <span className="spacer" />
          <button className="btn danger ghost" onClick={() => { deleteTask(task.id); onClose(); toast('Tarefa apagada', { undo: true }) }}><Icon name="trash" size={18} /> Apagar</button>
        </div>
      </div>
    </Sheet>
  )
}

/** Gentle triage for overdue things: no red alarms, just choices. */
export function TriageSheet({ tasks, onClose }: { tasks: Task[]; onClose: () => void }) {
  const [gone, setGone] = useState<string[]>([])
  const left = useMemo(() => tasks.filter((t) => !gone.includes(t.id)), [tasks, gone])
  const act = (id: string, f: () => void) => { f(); setGone((g) => [...g, id]) }
  return (
    <Sheet title="Coisas que ficaram para trás" onClose={onClose}>
      <p className="small muted" style={{ marginTop: -4 }}>Sem culpa. Decida uma de cada vez: fazer hoje, mover ou deixar ir.</p>
      {left.length === 0 ? <div className="go"><div className="big">🌿</div><strong>Tudo decidido. Mente mais leve.</strong></div> : (
        <div className="stack">
          {left.map((t) => (
            <div className="card" key={t.id}>
              <div style={{ fontWeight: 750, fontSize: 17 }}>{t.title}</div>
              <TaskMeta t={t} />
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn small primary" onClick={() => act(t.id, () => updateTask(t.id, { due: toISO(new Date()), time: null, snoozedUntil: null }))}>Hoje</button>
                <button className="btn small" onClick={() => act(t.id, () => postponeTask(t.id, 1))}>Amanhã</button>
                <button className="btn small" onClick={() => act(t.id, () => postponeTask(t.id, 7))}>Semana que vem</button>
                <button className="btn small" onClick={() => act(t.id, () => moveToSomeday(t.id))}>Algum dia</button>
                <button className="btn small" onClick={() => act(t.id, () => completeTask(t.id))}>✓ Já fiz</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
