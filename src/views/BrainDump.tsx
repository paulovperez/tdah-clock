import { useMemo, useState } from 'react'
import { parse, splitDump, type Parsed } from '../lib/parser'
import { captureParsed } from '../store/actions'
import { useStore } from '../store/store'
import { ParsedChips } from '../components/Capture'
import { Icon, toast } from '../components/ui'

interface Row { id: number; raw: string; p: Parsed; on: boolean }

export function BrainDump({ onDone }: { onDone: () => void }) {
  const workEnd = useStore((s) => s.settings.workEnd)
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)

  const organize = () => {
    const parts = splitDump(text)
    setRows(parts.map((raw, i) => ({ id: i, raw, p: parse(raw, { workEnd }), on: true })))
  }
  const count = useMemo(() => rows?.filter((r) => r.on).length ?? 0, [rows])

  const confirm = () => {
    rows?.filter((r) => r.on).forEach((r) => captureParsed(r.p, r.raw))
    toast(`${count} ${count === 1 ? 'item organizado' : 'itens organizados'}. Mente mais leve 🌿`)
    setRows(null); setText(''); onDone()
  }

  return (
    <div className="page">
      <div className="topbar"><h1>Despejo mental</h1></div>
      {!rows ? (
        <>
          <p className="small muted" style={{ margin: '0 2px 12px' }}>Escreva tudo que está ocupando sua cabeça, do jeito que vier. Separe por vírgulas, linhas ou “e”. Eu transformo em tarefas, compras e notas — você só confirma.</p>
          <textarea className="textarea" style={{ minHeight: 220, fontSize: 17 }} autoFocus value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Preciso comprar shampoo, estudar para a prova de banco de dados, ligar pro mecânico, pagar o cartão dia 25, limpar o quarto e levar os documentos amanhã…" aria-label="Despejo mental" />
          <button className="btn primary block" style={{ marginTop: 12, minHeight: 56 }} disabled={!text.trim()} onClick={organize}><Icon name="sparkle" /> Organizar para mim</button>
        </>
      ) : (
        <>
          <p className="small muted" style={{ margin: '0 2px 12px' }}>Encontrei {rows.length} {rows.length === 1 ? 'coisa' : 'coisas'}. Desmarque o que não quer e ajuste os textos se precisar.</p>
          <div className="list">
            {rows.map((r) => (
              <div key={r.id} className="item" style={{ alignItems: 'flex-start', opacity: r.on ? 1 : .5 }}>
                <button className={`check sq ${r.on ? 'on' : ''}`} style={{ marginTop: 6 }} aria-label={r.on ? 'Não incluir' : 'Incluir'} onClick={() => setRows(rows.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)))}><Icon name="check" size={14} stroke={3} /></button>
                <div className="body">
                  <input className="capture-input" style={{ fontSize: 16, minHeight: 36, padding: 0 }} value={r.raw} aria-label="Texto"
                    onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, raw: e.target.value, p: parse(e.target.value, { workEnd }) } : x)))} />
                  <div className="preview" style={{ margin: '4px 0 0', minHeight: 0 }}>
                    {r.p.kind === 'shopping' ? r.p.items.map((it) => <span key={it.name} className="pill amber">🛒 {it.name}</span>) : r.p.title.toLowerCase() !== r.raw.trim().toLowerCase() && <span className="pill" style={{ background: 'transparent', paddingLeft: 0 }}>→ {r.p.title}</span>}
                    <ParsedChips p={r.p} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setRows(null)}>Voltar</button>
            <button className="btn primary" style={{ flex: 1 }} disabled={!count} onClick={confirm}>Adicionar {count}</button>
          </div>
        </>
      )}
    </div>
  )
}
