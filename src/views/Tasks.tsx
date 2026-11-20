import { useMemo, useState } from 'react'
import type { Category, Task } from '../store/types'
import { useStore } from '../store/store'
import { addDaysISO, at, relativeDay, toISO } from '../lib/date'
import { norm } from '../lib/rx'
import { Empty, Icon, useNow } from '../components/ui'
import { CATEGORIES, TaskRow } from '../components/tasks'

type View = 'today' | 'tomorrow' | 'week' | 'upcoming' | 'overdue' | 'nodate' | 'context' | 'someday' | 'done'

const VIEWS: [View, string][] = [
  ['today', 'Hoje'], ['tomorrow', 'Amanhã'], ['week', 'Esta semana'], ['upcoming', 'Próximas'], ['overdue', 'Atrasadas'],
  ['nodate', 'Sem data'], ['context', 'Ao sair / lugares'], ['someday', 'Algum dia'], ['done', 'Concluídas'],
]

export function Tasks({ onOpenTask, onCapture }: { onOpenTask: (t: Task) => void; onCapture: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const now = useNow(30000)
  const [view, setView] = useState<View>('today')
  const [cat, setCat] = useState<Category | null>(null)
  const [q, setQ] = useState('')
  const today = toISO(new Date(now))
  const tomorrow = addDaysISO(today, 1)
  const weekEnd = addDaysISO(today, 7)

  const isOverdue = (t: Task) => !!t.due && (t.due < today || (!!t.time && t.due === today && at(t.due, t.time) < now - 30 * 60000))

  const match = (t: Task, v: View) => {
    const open = !t.completedAt
    switch (v) {
      case 'today': return open && !t.someday && !!t.due && t.due <= today
      case 'tomorrow': return open && t.due === tomorrow
      case 'week': return open && !!t.due && t.due >= today && t.due <= weekEnd
      case 'upcoming': return open && !!t.due && t.due > today
      case 'overdue': return open && isOverdue(t)
      case 'nodate': return open && !t.due && !t.someday && !t.context
      case 'context': return open && !!t.context
      case 'someday': return open && !!t.someday
      case 'done': return !!t.completedAt
    }
  }

  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([v]) => [v, tasks.filter((t) => match(t, v)).length])), [tasks, today]) // eslint-disable-line

  const list = useMemo(() => {
    const nq = norm(q)
    let l = q
      ? tasks.filter((t) => norm(t.title + ' ' + (t.notes ?? '') + ' ' + t.tags.join(' ')).includes(nq))
      : tasks.filter((t) => match(t, view))
    if (cat) l = l.filter((t) => t.category === cat)
    if (view === 'done' && !q) return l.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 100)
    return l.sort((a, b) =>
      (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0) ||
      (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
      (a.time ?? '99').localeCompare(b.time ?? '99') ||
      a.priority - b.priority || b.createdAt - a.createdAt)
  }, [tasks, view, cat, q, today]) // eslint-disable-line

  // group by day for date-based views
  const groups = useMemo(() => {
    if (!['week', 'upcoming'].includes(view) || q) return [['', list]] as [string, Task[]][]
    const m = new Map<string, Task[]>()
    for (const t of list) { const k = t.due ?? ''; m.set(k, [...(m.get(k) ?? []), t]) }
    return [...m.entries()]
  }, [list, view, q])

  return (
    <div className="page">
      <div className="topbar"><h1>Tarefas</h1><button className="btn small primary" onClick={onCapture}><Icon name="plus" size={18} /> Nova</button></div>

      <div className="capture-bar" style={{ minHeight: 50, margin: '6px 0 12px' }}>
        <Icon name="search" size={20} />
        <input className="capture-input" style={{ fontSize: 16, minHeight: 40 }} placeholder="Buscar em tudo…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar tarefas" />
        {q && <button className="icon-btn sm" onClick={() => setQ('')} aria-label="Limpar busca"><Icon name="x" size={18} /></button>}
      </div>

      {!q && (
        <div className="chips" role="tablist" aria-label="Visões">
          {VIEWS.map(([v, l]) => (
            <button key={v} className="chip" role="tab" aria-selected={view === v} aria-pressed={view === v} onClick={() => setView(v)}>
              {l}{counts[v] ? <span className="count">{counts[v]}</span> : null}
            </button>
          ))}
        </div>
      )}
      <div className="chips" style={{ marginTop: 2 }} aria-label="Categorias">
        {CATEGORIES.filter((c) => tasks.some((t) => t.category === c.id)).map((c) => (
          <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>{c.emoji} {c.label}</button>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        {list.length === 0 ? (
          <div className="card">
            {q ? <Empty icon="🔎" title="Nada encontrado">Tente outra palavra.</Empty>
              : view === 'today' ? <Empty icon="🌤️" title="Nada para hoje">Aproveite — ou capture algo que está na cabeça.</Empty>
              : view === 'overdue' ? <Empty icon="🌿" title="Nada atrasado">Tudo em dia. Bom trabalho.</Empty>
              : view === 'done' ? <Empty icon="✨" title="Ainda nada concluído">As tarefas concluídas ficam guardadas aqui.</Empty>
              : view === 'context' ? <Empty icon="🚪" title="Nenhum lembrete de contexto">Ex.: “levar o carregador quando sair de casa”.</Empty>
              : <Empty icon="📭" title="Vazio por aqui" />}
          </div>
        ) : groups.map(([k, items]) => (
          <section key={k || 'all'} className="section" style={{ marginTop: k ? 18 : 0 }}>
            {k && <div className="section-head"><h2>{relativeDay(k, today)}</h2></div>}
            <div className="list">{items.map((t) => <TaskRow key={t.id} t={t} now={now} onOpen={onOpenTask} />)}</div>
          </section>
        ))}
      </div>
    </div>
  )
}
