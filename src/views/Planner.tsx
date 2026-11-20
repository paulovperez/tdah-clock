import { useMemo, useState } from 'react'
import { useStore } from '../store/store'
import { planDay, blockLabel } from '../lib/planner'
import { formatDuration, minToHHMM, nowHHMM } from '../lib/date'
import { applyPlan } from '../store/actions'
import { Empty, Icon, TimeField, toast } from '../components/ui'

export function Planner({ onDone }: { onDone: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const settings = useStore((s) => s.settings)
  const [end, setEnd] = useState(settings.dayEnd)
  const [postpone, setPostpone] = useState<string[] | null>(null)
  const plan = useMemo(() => planDay(tasks, Date.now(), { ...settings, dayEnd: end }), [tasks, settings, end])
  const toPostpone = postpone ?? plan.overflow.map((t) => t.id)
  const flexible = plan.blocks.filter((b) => b.kind === 'task')

  const apply = () => {
    applyPlan(flexible.map((b) => ({ taskId: b.task!.id, time: minToHHMM(b.start) })), toPostpone)
    toast('Plano aplicado. Você vai receber os lembretes na hora.', { undo: true })
    onDone()
  }

  return (
    <div className="page">
      <div className="topbar"><h1>Planejar o dia</h1></div>
      <p className="small muted" style={{ margin: '0 2px 12px' }}>
        Um plano realista: compromissos ficam onde estão, as estimativas ganham folga ({settings.estimateMultiplier}×), há intervalos entre as coisas e no máximo 70% do tempo livre é ocupado.
      </p>

      <div className="card row wrap" style={{ marginBottom: 14 }}>
        <span className="small"><strong>Agora:</strong> {nowHHMM()}</span>
        <span className="spacer" />
        <div className="row small" style={{ alignItems: 'flex-start' }}><strong style={{ paddingTop: 12 }}>Meu dia termina às</strong><TimeField label="Fim do dia" value={end} onChange={(v) => setEnd(v ?? settings.dayEnd)} /></div>
      </div>

      {plan.blocks.length === 0 && plan.overflow.length === 0 ? (
        <div className="card"><Empty icon="🧘" title="Nada para planejar">Não há tarefas para hoje. Que tal descansar — ou adicionar algo?</Empty></div>
      ) : (
        <>
          <div className="row small" style={{ gap: 14, margin: '0 4px 10px' }}>
            <span><span className="pill accent">fixo</span></span><span><span className="pill sky">sugerido</span></span>
            <span className="spacer" />
            <span className="muted">{formatDuration(plan.plannedMin)} planejados de {formatDuration(plan.freeMin)} livres</span>
          </div>
          <div className="list">
            {plan.blocks.map((b, i) => (
              <div key={i} className="item">
                <span className="num small" style={{ width: 96, fontWeight: 750, color: 'var(--ink-2)' }}>{blockLabel(b)}</span>
                <span className="body"><span className="title">{b.task?.title}</span></span>
                <span className={`pill ${b.kind === 'fixed' ? 'accent' : 'sky'}`}>{b.kind === 'fixed' ? 'fixo' : formatDuration(b.end - b.start)}</span>
              </div>
            ))}
          </div>

          {plan.overflow.length > 0 && (
            <section className="section">
              <div className="section-head"><h2>Não cabe hoje — tudo bem</h2></div>
              <p className="small muted" style={{ margin: '-2px 4px 10px' }}>Dia cheio demais vira frustração. Marque o que pode ficar para amanhã.</p>
              <div className="list">
                {plan.overflow.map((t) => {
                  const on = toPostpone.includes(t.id)
                  return (
                    <button key={t.id} className="item" style={{ width: '100%' }} onClick={() => setPostpone(on ? toPostpone.filter((x) => x !== t.id) : [...toPostpone, t.id])}>
                      <span className={`check sq ${on ? 'on' : ''}`}><Icon name="check" size={14} stroke={3} /></span>
                      <span className="body"><span className="title">{t.title}</span><span className="meta">{on ? 'vai para amanhã' : 'fica para hoje, sem horário'}</span></span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}
          <button className="btn primary block" style={{ marginTop: 16, minHeight: 56 }} onClick={apply}><Icon name="check" /> Aplicar plano</button>
        </>
      )}
    </div>
  )
}
