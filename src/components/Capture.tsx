import { useEffect, useMemo, useRef, useState } from 'react'
import { parse, type Parsed } from '../lib/parser'
import { formatDuration, relativeDay } from '../lib/date'
import { describeRecurrence } from '../lib/recurrence'
import { storeLabel } from '../lib/shoppingDict'
import { captureParsed } from '../store/actions'
import { useStore } from '../store/store'
import { catOf } from './tasks'
import { Icon, Sheet } from './ui'

const EXAMPLES = [
  'Comprar shampoo amanhã',
  'Levar o carro no mecânico sexta às 8h',
  'Pagar cartão dia 25',
  'Levar documentos quando sair de casa',
  'Estudar banco de dados por 40 min hoje à noite',
  'Tomar remédio todo dia às 8h',
  'nota: a chave reserva está na gaveta azul',
]

export function ParsedChips({ p }: { p: Parsed }) {
  const chips: [string, string][] = []
  if (p.kind === 'note') chips.push(['sky', '🔖 Memória'])
  if (p.kind === 'shopping') chips.push(['amber', `🛒 ${p.items.length > 1 ? `${p.items.length} itens` : 'Compras'} · ${storeLabel(p.store ?? 'mercado')}`])
  if (p.kind === 'bill') chips.push(['sage', '💳 Conta mensal'])
  if (p.due) chips.push(['accent', `📅 ${relativeDay(p.due)}`])
  if (p.time) chips.push(['accent', `⏰ ${p.time}`])
  if (p.durationMin) chips.push(['', `⏱ ${formatDuration(p.durationMin)}`])
  if (p.recurrence) chips.push(['', `🔁 ${describeRecurrence(p.recurrence)}`])
  if (p.context?.type === 'leaving') chips.push(['', '🚪 ao sair de casa'])
  if (p.context?.type === 'place' && p.kind !== 'shopping') chips.push(['', `📍 ${p.context.place}`])
  if (p.priority === 1) chips.push(['accent', '⚑ importante'])
  if (p.persistent && p.kind === 'task') chips.push(['', '🔔 insistente'])
  if (p.someday) chips.push(['', '☁️ algum dia'])
  if (p.amount) chips.push(['sage', `R$ ${p.amount.toFixed(2).replace('.', ',')}`])
  if (p.kind === 'task' && p.category !== 'other') chips.push(['', `${catOf(p.category).emoji} ${catOf(p.category).label}`])
  p.tags.forEach((t) => chips.push(['', `#${t}`]))
  return <>{chips.map(([c, l], i) => <span key={i} className={`pill ${c}`}>{l}</span>)}</>
}

export function CaptureSheet({ onClose, onBrainDump }: { onClose: () => void; onBrainDump: () => void }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState<{ text: string; label: string }[]>([])
  const [listening, setListening] = useState(false)
  const workEnd = useStore((s) => s.settings.workEnd)
  const input = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => (text.trim() ? parse(text, { workEnd }) : null), [text, workEnd])
  const rec = useRef<any>(null)
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null

  useEffect(() => { input.current?.focus() }, [])

  const submit = () => {
    if (!parsed) return
    const r = captureParsed(parsed, text)
    setSaved((s) => [{ text: parsed.title || text, label: r.label }, ...s].slice(0, 5))
    setText('')
    input.current?.focus()
  }

  const voice = () => {
    if (!SR) return
    if (listening) { rec.current?.stop(); return }
    const r = new SR()
    r.lang = 'pt-BR'
    r.interimResults = true
    r.onresult = (e: any) => setText(Array.from(e.results).map((x: any) => x[0].transcript).join(' '))
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    r.start()
    setListening(true)
  }

  return (
    <Sheet title="O que está na sua cabeça?" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="capture-bar" style={{ boxShadow: 'none', border: '1.5px solid var(--line)', paddingLeft: 14 }}>
          <input ref={input} className="capture-input" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: pagar luz amanhã" aria-label="Capturar" enterKeyHint="done" autoComplete="off" />
          {SR && <button type="button" className="icon-btn" onClick={voice} aria-label={listening ? 'Parar de ouvir' : 'Falar'} style={listening ? { color: 'var(--accent)' } : {}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>}
          <button className="btn primary" disabled={!parsed} aria-label="Salvar"><Icon name="check" size={20} stroke={2.5} /></button>
        </div>
      </form>
      <div className="preview" aria-live="polite">
        {parsed ? <>{parsed.title && parsed.kind !== 'shopping' && <span className="pill" style={{ background: 'transparent', paddingLeft: 2 }}>“{parsed.title}”</span>}<ParsedChips p={parsed} /></> : <span className="tiny muted">Escreva do jeito que vier. Eu organizo. Enter salva.</span>}
        {parsed?.kind === 'shopping' && parsed.items.map((it) => <span key={it.name} className="pill">{it.qty ? `${it.qty} ` : ''}{it.name}</span>)}
      </div>

      {saved.length > 0 && (
        <div className="stack" style={{ margin: '8px 0 12px' }}>
          {saved.map((s, i) => <div key={i} className="row small" style={{ color: 'var(--sage)', fontWeight: 700 }}><Icon name="check" size={16} stroke={3} /> <span style={{ color: 'var(--ink)' }}>{s.text}</span> <span className="muted tiny">· {s.label}</span></div>)}
        </div>
      )}

      {!text && saved.length === 0 && (
        <div className="examples">
          <div className="tiny muted" style={{ margin: '6px 10px' }}>Experimente:</div>
          {EXAMPLES.map((e) => <button key={e} onClick={() => { setText(e); input.current?.focus() }}>{e}</button>)}
        </div>
      )}

      <button className="btn block" style={{ marginTop: 14 }} onClick={onBrainDump}><Icon name="brain" size={20} /> Muita coisa? Despejar tudo de uma vez</button>
    </Sheet>
  )
}
