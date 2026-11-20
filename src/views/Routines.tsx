import { useState } from 'react'
import type { Routine } from '../store/types'
import { useStore } from '../store/store'
import { deleteRoutine, saveRoutine, startTimer, toggleRoutineStep } from '../store/actions'
import { addDaysISO, toISO, WEEKDAYS_SHORT } from '../lib/date'
import { uid } from '../lib/id'
import { DaysPicker, Empty, Icon, Sheet, toast } from '../components/ui'

export function Routines({ onPlay }: { onPlay: (id: string) => void }) {
  const routines = useStore((s) => s.routines)
  const [edit, setEdit] = useState<Partial<Routine> | null>(null)
  const today = toISO(new Date())
  return (
    <div className="page">
      <div className="topbar"><h1>Rotinas</h1><button className="btn small primary" onClick={() => setEdit({ name: '', emoji: '✨', steps: [], days: [], time: null })}><Icon name="plus" size={18} /> Nova</button></div>
      <p className="small muted" style={{ margin: '0 2px 14px' }}>Rotinas são trilhos, não provas. Perdeu um dia? Sem problema — nada de sequência para quebrar.</p>
      {routines.length === 0 ? <div className="card"><Empty icon="🔁" title="Nenhuma rotina" /></div> : (
        <div className="stack">
          {routines.map((r) => {
            const done = r.log[today]?.length ?? 0
            const total = r.steps.reduce((a, s) => a + (s.minutes ?? 0), 0)
            return (
              <div key={r.id} className="card">
                <div className="routine-card">
                  <span className="emo">{r.emoji}</span>
                  <div className="spacer" style={{ minWidth: 0 }}>
                    <strong>{r.name}</strong>
                    <div className="tiny muted">{r.steps.length} passos{total ? ` · ~${total} min` : ''}{r.time ? ` · ${r.time}` : ''} · {r.days.length ? r.days.map((d) => WEEKDAYS_SHORT[d]).join(' ') : 'todo dia'}</div>
                  </div>
                  <button className="icon-btn" aria-label={`Editar ${r.name}`} onClick={() => setEdit(r)}><Icon name="edit" size={19} /></button>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <WeekDots r={r} />
                  <span className="spacer" />
                  <span className="tiny muted">{done}/{r.steps.length} hoje</span>
                  <button className="btn small primary" onClick={() => onPlay(r.id)}><Icon name="play" size={16} /> {done ? 'Continuar' : 'Começar'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {edit && <RoutineEditor r={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

/** Last 7 days, shown kindly: partial days count as partial, not as failure. */
function WeekDots({ r }: { r: Routine }) {
  const today = toISO(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6))
  return (
    <div className="week-dots" aria-label="Últimos 7 dias">
      {days.map((d) => {
        const n = r.log[d]?.length ?? 0
        return <span key={d} className={n >= r.steps.length && n ? 'on' : n ? 'part' : ''} title={d} />
      })}
    </div>
  )
}

function RoutineEditor({ r, onClose }: { r: Partial<Routine>; onClose: () => void }) {
  const [x, setX] = useState<Partial<Routine>>({ steps: [], days: [], ...r })
  const [step, setStep] = useState('')
  const [mins, setMins] = useState('')
  const save = () => { if (!x.name?.trim()) { toast('Dê um nome à rotina'); return } saveRoutine(x); onClose() }
  return (
    <Sheet title={r.id ? 'Editar rotina' : 'Nova rotina'} onClose={onClose} actions={<button className="btn small primary" onClick={save}>Salvar</button>}>
      <div className="stack">
        <div className="row">
          <input className="input" style={{ width: 64, textAlign: 'center', fontSize: 24 }} value={x.emoji} onChange={(e) => setX({ ...x, emoji: e.target.value })} aria-label="Emoji" />
          <input className="input" placeholder="Nome (ex.: Antes de dormir)" value={x.name ?? ''} onChange={(e) => setX({ ...x, name: e.target.value })} aria-label="Nome" />
        </div>
        <div className="field"><span>Dias (vazio = todo dia)</span><DaysPicker days={x.days ?? []} onChange={(days) => setX({ ...x, days })} /></div>
        <label className="field"><span>Lembrar às</span><input type="time" className="input" value={x.time ?? ''} onChange={(e) => setX({ ...x, time: e.target.value || null })} /></label>
        <div className="field"><span>Passos</span>
          <div className="list">
            {(x.steps ?? []).map((s, i) => (
              <div className="item" key={s.id} style={{ minHeight: 50 }}>
                <span className="muted num" style={{ width: 20 }}>{i + 1}</span>
                <input className="capture-input" style={{ fontSize: 15.5, minHeight: 36 }} value={s.text} onChange={(e) => setX({ ...x, steps: x.steps!.map((y) => (y.id === s.id ? { ...y, text: e.target.value } : y)) })} aria-label={`Passo ${i + 1}`} />
                {s.minutes ? <span className="tiny muted">{s.minutes}m</span> : null}
                <button className="icon-btn sm" aria-label="Subir" disabled={i === 0} onClick={() => { const st = [...x.steps!]; [st[i - 1], st[i]] = [st[i], st[i - 1]]; setX({ ...x, steps: st }) }}>↑</button>
                <button className="icon-btn sm" aria-label="Remover" onClick={() => setX({ ...x, steps: x.steps!.filter((y) => y.id !== s.id) })}><Icon name="x" size={16} /></button>
              </div>
            ))}
            <form className="item" onSubmit={(e) => { e.preventDefault(); if (!step.trim()) return; setX({ ...x, steps: [...(x.steps ?? []), { id: uid(), text: step.trim(), minutes: Number(mins) || undefined }] }); setStep(''); setMins('') }}>
              <Icon name="plus" size={18} />
              <input className="capture-input" style={{ fontSize: 15.5, minHeight: 36 }} placeholder="Novo passo" value={step} onChange={(e) => setStep(e.target.value)} />
              <input className="input" style={{ width: 70, minHeight: 38 }} placeholder="min" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ''))} aria-label="Minutos" />
            </form>
          </div>
        </div>
        {r.id && <button className="btn danger ghost" onClick={() => { deleteRoutine(r.id!); onClose(); toast('Rotina apagada', { undo: true }) }}><Icon name="trash" size={18} /> Apagar rotina</button>}
      </div>
    </Sheet>
  )
}

/** One step at a time — big, calm, impossible to get lost in. */
export function RoutinePlayer({ id, onClose }: { id: string; onClose: () => void }) {
  const r = useStore((s) => s.routines.find((x) => x.id === id))
  const today = toISO(new Date())
  if (!r) return null
  const done = new Set(r.log[today] ?? [])
  const current = r.steps.find((s) => !done.has(s.id))
  const idx = current ? r.steps.indexOf(current) : r.steps.length
  return (
    <Sheet title={`${r.emoji} ${r.name}`} onClose={onClose}>
      <div className="progress"><div style={{ width: `${(done.size / Math.max(1, r.steps.length)) * 100}%` }} /></div>
      {current ? (
        <div className="player">
          <div className="tiny muted" style={{ fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Passo {idx + 1} de {r.steps.length}</div>
          <div className="step">{current.text}</div>
          {current.minutes ? <div className="muted small">~{current.minutes} min</div> : null}
          <div className="stack" style={{ marginTop: 24 }}>
            <button className="btn primary block" style={{ minHeight: 60, fontSize: 18 }} onClick={() => toggleRoutineStep(r.id, current.id)}><Icon name="check" stroke={2.5} /> Feito</button>
            <div className="row">
              {current.minutes ? <button className="btn block" onClick={() => { startTimer(current.minutes!, current.text); toast(`Timer de ${current.minutes} min`) }}><Icon name="timer" size={18} /> Timer</button> : null}
              <button className="btn block" onClick={() => toggleRoutineStep(r.id, current.id)}>Pular</button>
            </div>
          </div>
          {idx + 1 < r.steps.length && <p className="tiny muted" style={{ marginTop: 18 }}>Depois: {r.steps[idx + 1].text}</p>}
        </div>
      ) : (
        <div className="go">
          <div className="big">🌟</div>
          <h3 style={{ margin: '6px 0' }}>Rotina concluída</h3>
          <p className="muted small">Isso é cuidar de você.</p>
          <button className="btn primary block" onClick={onClose}>Fechar</button>
        </div>
      )}
      <div className="list" style={{ marginTop: 18 }}>
        {r.steps.map((s) => (
          <button key={s.id} className={`item ${done.has(s.id) ? 'done' : ''}`} style={{ width: '100%', minHeight: 48 }} onClick={() => toggleRoutineStep(r.id, s.id)}>
            <span className={`check sq ${done.has(s.id) ? 'on' : ''}`}><Icon name="check" size={14} stroke={3} /></span>
            <span className="body"><span className="title" style={{ fontSize: 15 }}>{s.text}</span></span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
