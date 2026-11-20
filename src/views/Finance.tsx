import { useState } from 'react'
import type { Bill } from '../store/types'
import { useStore } from '../store/store'
import { addBill, deleteBill, toggleBillPaid, updateBill } from '../store/actions'
import { billDueDate } from '../lib/engine'
import { monthKey, relativeDay, toISO } from '../lib/date'
import { Empty, Icon, Sheet, Switch, toast } from '../components/ui'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function Finance() {
  const bills = useStore((s) => s.bills)
  const [offset, setOffset] = useState(0)
  const [edit, setEdit] = useState<Partial<Bill> | null>(null)
  const ref = new Date(); ref.setDate(1); ref.setMonth(ref.getMonth() + offset)
  const mk = monthKey(ref)
  const today = toISO(new Date())
  const active = bills.filter((b) => b.active)
  const total = active.reduce((a, b) => a + (b.amount ?? 0), 0)
  const paid = active.filter((b) => b.paid[mk] || b.autopay).reduce((a, b) => a + (b.amount ?? 0), 0)
  const unpaidCount = active.filter((b) => !b.paid[mk] && !b.autopay).length

  return (
    <div className="page">
      <div className="topbar"><h1>Contas</h1><button className="btn small primary" onClick={() => setEdit({ name: '', dueDay: 10, remindDaysBefore: 2 })}><Icon name="plus" size={18} /> Nova</button></div>
      <p className="small muted" style={{ margin: '0 2px 12px' }}>Não é um app de finanças. É só para nunca mais esquecer de pagar.</p>

      <div className="row" style={{ justifyContent: 'center', marginBottom: 12 }}>
        <button className="icon-btn" aria-label="Mês anterior" onClick={() => setOffset(offset - 1)}><Icon name="back" /></button>
        <strong style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{MONTHS[ref.getMonth()]} {ref.getFullYear()}</strong>
        <button className="icon-btn" aria-label="Próximo mês" onClick={() => setOffset(offset + 1)}><Icon name="chevron" /></button>
      </div>

      <div className="stats">
        <div className="stat"><div className="l">Total</div><div className="v num">{brl(total)}</div></div>
        <div className="stat"><div className="l">Pago</div><div className="v num" style={{ color: 'var(--sage)' }}>{brl(paid)}</div></div>
        <div className="stat"><div className="l">Faltam</div><div className="v num" style={{ color: unpaidCount ? 'var(--accent)' : 'var(--sage)' }}>{unpaidCount}</div></div>
      </div>

      <div style={{ marginTop: 14 }}>
        {active.length === 0 ? <div className="card"><Empty icon="💳" title="Nenhuma conta">Aluguel, cartão, luz, internet, assinaturas… Ou diga “pagar aluguel todo dia 5”.</Empty></div> : (
          <div className="list">
            {active.map((b) => {
              const due = billDueDate(b, ref)
              const isPaid = !!b.paid[mk] || !!b.autopay
              const late = !isPaid && due < today
              return (
                <div key={b.id} className={`item ${isPaid ? 'done' : ''}`}>
                  <button className={`check ${isPaid ? 'on' : ''}`} aria-label={isPaid ? `Desmarcar ${b.name}` : `Marcar ${b.name} como paga`} disabled={b.autopay} onClick={() => { toggleBillPaid(b.id, mk); if (!isPaid) toast('Paga ✓') }}><Icon name="check" size={16} stroke={3} /></button>
                  <button className="body" onClick={() => setEdit(b)}>
                    <div className="title">{b.name}</div>
                    <div className="meta">
                      <span className={late ? 'late' : ''}>{late ? 'Atrasada · ' : ''}dia {b.dueDay} ({relativeDay(due, today)})</span>
                      {b.autopay && <span>débito automático</span>}
                      {b.remindDaysBefore > 0 && !isPaid && <span>🔔 {b.remindDaysBefore}d antes</span>}
                    </div>
                  </button>
                  {b.amount ? <span className="num" style={{ fontWeight: 750 }}>{brl(b.amount)}</span> : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {edit && <BillEditor b={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function BillEditor({ b, onClose }: { b: Partial<Bill>; onClose: () => void }) {
  const [x, setX] = useState<Partial<Bill>>(b)
  const [amount, setAmount] = useState(b.amount ? String(b.amount).replace('.', ',') : '')
  const save = () => {
    if (!x.name?.trim()) { toast('Dê um nome'); return }
    const v = amount ? Number(amount.replace(/\./g, '').replace(',', '.')) : null
    const data = { ...x, amount: v && !isNaN(v) ? v : null, dueDay: Math.min(31, Math.max(1, Number(x.dueDay) || 1)) }
    if (b.id) updateBill(b.id, data); else addBill(data)
    onClose()
  }
  return (
    <Sheet title={b.id ? 'Editar conta' : 'Nova conta'} onClose={onClose} actions={<button className="btn small primary" onClick={save}>Salvar</button>}>
      <div className="stack">
        <input className="input" placeholder="Nome (ex.: Internet)" value={x.name ?? ''} onChange={(e) => setX({ ...x, name: e.target.value })} aria-label="Nome" autoFocus />
        <div className="row wrap">{['Aluguel', 'Cartão de crédito', 'Luz', 'Água', 'Internet', 'Celular', 'Streaming', 'Seguro'].map((n) => <button key={n} className="chip" onClick={() => setX({ ...x, name: n })}>{n}</button>)}</div>
        <div className="grid2">
          <label className="field"><span>Valor (R$)</span><input className="input" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} /></label>
          <label className="field"><span>Vence todo dia</span><input className="input" inputMode="numeric" value={x.dueDay ?? ''} onChange={(e) => setX({ ...x, dueDay: Number(e.target.value.replace(/\D/g, '')) })} /></label>
        </div>
        <label className="field"><span>Avisar antes</span>
          <select className="select" value={x.remindDaysBefore ?? 2} onChange={(e) => setX({ ...x, remindDaysBefore: Number(e.target.value) })}>
            {[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? 'Só no dia' : `${d} dia${d > 1 ? 's' : ''} antes`}</option>)}
          </select>
        </label>
        <div className="row"><div className="spacer"><strong>Débito automático</strong><div className="tiny muted">Sem lembretes; conta como paga.</div></div><Switch label="Débito automático" on={!!x.autopay} onChange={(v) => setX({ ...x, autopay: v })} /></div>
        {b.id && <button className="btn danger ghost" onClick={() => { deleteBill(b.id!); onClose(); toast('Conta apagada', { undo: true }) }}><Icon name="trash" size={18} /> Apagar</button>}
      </div>
    </Sheet>
  )
}
