import { useMemo, useState } from 'react'
import type { ShopItem, StoreKind } from '../store/types'
import { useStore } from '../store/store'
import { addShopItem, clearPurchased, deleteShopItem, toggleShopItem, updateShopItem } from '../store/actions'
import { parse } from '../lib/parser'
import { norm } from '../lib/rx'
import { STORES } from '../lib/shoppingDict'
import { Empty, Icon, Sheet, toast } from '../components/ui'

export function Shopping() {
  const shop = useStore((s) => s.shop)
  const history = useStore((s) => s.shopHistory)
  const tasks = useStore((s) => s.tasks)
  const [store, setStore] = useState<StoreKind | 'all'>('all')
  const [text, setText] = useState('')
  const [showBought, setShowBought] = useState(false)
  const [edit, setEdit] = useState<ShopItem | null>(null)

  const inStore = (i: ShopItem) => store === 'all' || i.store === store
  const open = shop.filter((i) => !i.checked && inStore(i))
  const bought = shop.filter((i) => i.checked && inStore(i)).sort((a, b) => (b.purchasedAt ?? 0) - (a.purchasedAt ?? 0))
  const counts = Object.fromEntries(STORES.map((s) => [s.id, shop.filter((i) => !i.checked && i.store === s.id).length]))
  const placeTasks = tasks.filter((t) => !t.completedAt && t.context?.type === 'place')

  const byAisle = useMemo(() => {
    const m = new Map<string, ShopItem[]>()
    for (const i of open) m.set(i.aisle, [...(m.get(i.aisle) ?? []), i])
    return [...m.entries()].sort((a, b) => (a[0] === 'Outros' ? 1 : b[0] === 'Outros' ? -1 : a[0].localeCompare(b[0])))
  }, [open])

  const suggestions = useMemo(() => {
    const onList = new Set(shop.filter((i) => !i.checked).map((i) => norm(i.name)))
    return Object.entries(history)
      .filter(([k, h]) => !onList.has(k) && h.count > 0 && (store === 'all' || h.store === store))
      .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
      .slice(0, 10)
      .map(([, h]) => h)
  }, [history, shop, store])

  const add = () => {
    const raw = text.trim()
    if (!raw) return
    const p = parse(/^(comprar|buy)\b/i.test(raw) ? raw : `comprar ${raw}`)
    p.items.forEach((it) => addShopItem(it.name, { qty: it.qty, store: store === 'all' ? p.store ?? it.store : store, aisle: it.aisle }))
    setText('')
  }

  return (
    <div className="page">
      <div className="topbar"><h1>Compras</h1>{bought.length > 0 && <button className="btn small ghost" onClick={() => clearPurchased(store === 'all' ? undefined : store)}>Limpar comprados</button>}</div>

      <div className="chips" role="tablist" aria-label="Lojas">
        <button className="chip" aria-pressed={store === 'all'} onClick={() => setStore('all')}>Tudo <span className="count">{shop.filter((i) => !i.checked).length || ''}</span></button>
        {STORES.map((s) => <button key={s.id} className="chip" aria-pressed={store === s.id} onClick={() => setStore(s.id)}>{s.emoji} {s.label} {counts[s.id] ? <span className="count">{counts[s.id]}</span> : null}</button>)}
      </div>

      <form className="capture-bar" style={{ margin: '8px 0 14px' }} onSubmit={(e) => { e.preventDefault(); add() }}>
        <Icon name="plus" />
        <input className="capture-input" style={{ fontSize: 17 }} placeholder="Adicionar: 2 leite, café e pão…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Adicionar itens" />
        <button className="btn primary" disabled={!text.trim()}>Add</button>
      </form>

      {suggestions.length > 0 && (
        <section style={{ marginBottom: 14 }}>
          <div className="section-head"><h2>Você costuma comprar</h2></div>
          <div className="chips">{suggestions.map((h) => <button key={h.name} className="chip" onClick={() => { addShopItem(h.name, { store: h.store }); toast(`${h.name} adicionado`) }}><Icon name="plus" size={14} /> {h.name}</button>)}</div>
        </section>
      )}

      {placeTasks.length > 0 && store !== 'all' && (
        <div className="card small" style={{ marginBottom: 14 }}>
          <strong>📍 Já que você está indo:</strong> {placeTasks.map((t) => t.title).join(' · ')}
        </div>
      )}

      {open.length === 0 ? (
        <div className="card"><Empty icon="🛒" title={store === 'all' ? 'Lista vazia' : 'Nada para esta loja'}>Diga “comprar shampoo” em qualquer lugar do app e ele aparece aqui.</Empty></div>
      ) : (
        <div className="list">
          {byAisle.map(([aisle, items]) => (
            <div key={aisle}>
              <div className="aisle">{aisle}</div>
              {items.map((i) => (
                <div className="item" key={i.id}>
                  <button className="check sq" aria-label={`Comprei ${i.name}`} onClick={() => toggleShopItem(i.id)}><Icon name="check" size={16} stroke={3} /></button>
                  <button className="body" onClick={() => setEdit(i)}>
                    <span className="title">{i.name}</span>
                    {store === 'all' && <span className="meta"><span>{STORES.find((s) => s.id === i.store)?.emoji} {STORES.find((s) => s.id === i.store)?.label}</span></span>}
                  </button>
                  {i.qty && <span className="qty">{i.qty}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {bought.length > 0 && (
        <section className="section">
          <button className="section-head" style={{ width: '100%' }} onClick={() => setShowBought(!showBought)}><h2>Comprados recentemente ({bought.length})</h2><span className="link">{showBought ? 'Ocultar' : 'Mostrar'}</span></button>
          {showBought && (
            <div className="list">
              {bought.slice(0, 40).map((i) => (
                <div className="item done" key={i.id}>
                  <button className="check sq on" aria-label={`Desmarcar ${i.name}`} onClick={() => toggleShopItem(i.id)}><Icon name="check" size={16} stroke={3} /></button>
                  <div className="body"><div className="title">{i.name}</div></div>
                  <button className="btn small" onClick={() => { addShopItem(i.name, { store: i.store, qty: i.qty }); toast(`${i.name} de volta na lista`) }}>Repor</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {edit && (
        <Sheet title="Item" onClose={() => setEdit(null)}>
          <div className="stack">
            <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Nome" />
            <input className="input" value={edit.qty ?? ''} placeholder="Quantidade (ex.: 2, 1kg)" onChange={(e) => setEdit({ ...edit, qty: e.target.value })} aria-label="Quantidade" />
            <div className="row wrap">{STORES.map((s) => <button key={s.id} className="chip" aria-pressed={edit.store === s.id} onClick={() => setEdit({ ...edit, store: s.id })}>{s.emoji} {s.label}</button>)}</div>
            <div className="row">
              <button className="btn danger ghost" onClick={() => { deleteShopItem(edit.id); setEdit(null); toast('Removido', { undo: true }) }}><Icon name="trash" size={18} /> Remover</button>
              <span className="spacer" />
              <button className="btn primary" onClick={() => { updateShopItem(edit.id, { name: edit.name, qty: edit.qty || undefined, store: edit.store }); setEdit(null) }}>Salvar</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}
