import { useMemo, useState, type ReactNode } from 'react'
import type { MemoryNote } from '../store/types'
import { useStore } from '../store/store'
import { addNote, deleteNote, updateNote } from '../store/actions'
import { norm } from '../lib/rx'
import { relativeDay, toISO } from '../lib/date'
import { Empty, Icon, Sheet, toast } from '../components/ui'

export function Memory() {
  const notes = useStore((s) => s.notes)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [edit, setEdit] = useState<MemoryNote | null>(null)

  const tags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags))].sort(), [notes])
  const list = useMemo(() => {
    const nq = norm(q)
    return notes
      .filter((n) => (!tag || n.tags.includes(tag)) && (!nq || norm(n.text + ' ' + n.tags.join(' ')).includes(nq)))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)
  }, [notes, q, tag])

  const save = () => { if (!text.trim()) return; addNote(text.trim()); setText(''); toast('Guardado. Pode esquecer 🙂') }

  return (
    <div className="page">
      <div className="topbar"><h1>Memória</h1><span className="sub">{notes.length ? `${notes.length} coisas guardadas` : ''}</span></div>
      <p className="small muted" style={{ margin: '0 2px 12px' }}>Tudo o que não é tarefa: onde guardou algo, ideias, medidas, assuntos para conversar. Não precisa organizar.</p>

      <div className="card" style={{ padding: 10 }}>
        <textarea className="textarea" style={{ border: 0, minHeight: 70, padding: 8 }} placeholder="Ex.: A chave reserva está na gaveta azul #casa" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() } }} aria-label="Nova memória" />
        <div className="row"><span className="tiny muted" style={{ paddingLeft: 8 }}>Use #tags se quiser · Ctrl+Enter salva</span><span className="spacer" /><button className="btn primary small" disabled={!text.trim()} onClick={save}>Guardar</button></div>
      </div>

      {notes.length > 0 && (
        <div className="capture-bar" style={{ minHeight: 50, margin: '14px 0 10px' }}>
          <Icon name="search" size={20} />
          <input className="capture-input" style={{ fontSize: 16, minHeight: 40 }} placeholder="Onde eu guardei…?" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar na memória" />
          {q && <button className="icon-btn sm" onClick={() => setQ('')} aria-label="Limpar"><Icon name="x" size={18} /></button>}
        </div>
      )}
      {tags.length > 0 && <div className="chips">{tags.map((t) => <button key={t} className="chip" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}</div>}

      <div style={{ marginTop: 10 }}>
        {list.length === 0 ? (
          <div className="card">{notes.length ? <Empty icon="🔎" title="Nada encontrado" /> : <Empty icon="🔖" title="Sua memória externa">Guarde aqui o que você não quer ter que lembrar.</Empty>}</div>
        ) : (
          <div className="notes">
            {list.map((n) => (
              <div key={n.id} className={`note ${n.pinned ? 'pinned' : ''}`}>
                <button style={{ textAlign: 'left', width: '100%', whiteSpace: 'pre-wrap' }} onClick={() => setEdit(n)}>{highlight(n.text, q)}</button>
                <div className="when">
                  <span>{relativeDay(toISO(new Date(n.createdAt)))}</span>
                  {n.tags.map((t) => <span key={t}>#{t}</span>)}
                  <span className="spacer" />
                  <button className="icon-btn sm" aria-label={n.pinned ? 'Desafixar' : 'Fixar'} style={n.pinned ? { color: 'var(--amber)' } : {}} onClick={() => updateNote(n.id, { pinned: !n.pinned })}><Icon name="bookmark" size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && (
        <Sheet title="Memória" onClose={() => setEdit(null)}>
          <div className="stack">
            <textarea className="textarea" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} aria-label="Texto" />
            <input className="input" value={edit.tags.join(' ')} placeholder="tags separadas por espaço" onChange={(e) => setEdit({ ...edit, tags: e.target.value.split(/[\s,#]+/).filter(Boolean).map((x) => x.toLowerCase()) })} aria-label="Tags" />
            <div className="row">
              <button className="btn danger ghost" onClick={() => { deleteNote(edit.id); setEdit(null); toast('Apagada', { undo: true }) }}><Icon name="trash" size={18} /> Apagar</button>
              <span className="spacer" />
              <button className="btn" onClick={() => { navigator.clipboard?.writeText(edit.text); toast('Copiado') }}>Copiar</button>
              <button className="btn primary" onClick={() => { updateNote(edit.id, { text: edit.text, tags: edit.tags }); setEdit(null) }}>Salvar</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function highlight(text: string, q: string): ReactNode {
  if (!q.trim()) return text
  const nt = norm(text), nq = norm(q)
  // norm() keeps length for accented latin chars (NFD + strip), so indexes line up
  const parts: ReactNode[] = []
  let i = 0, k = 0
  while (nq && (k = nt.indexOf(nq, i)) >= 0 && nt.length === text.length) {
    parts.push(text.slice(i, k), <mark key={k}>{text.slice(k, k + nq.length)}</mark>)
    i = k + nq.length
  }
  parts.push(text.slice(i))
  return parts
}
