import { describe, expect, it } from 'vitest'
import { parse, splitDump } from './parser'

// Wednesday, 18 Nov 2026, 10:00
const now = new Date(2026, 10, 18, 10, 0)
const p = (s: string) => parse(s, { now, workEnd: '18:00' })

describe('parser — English examples from the spec', () => {
  it('Buy shampoo → shopping item', () => {
    const r = p('Buy shampoo')
    expect(r.kind).toBe('shopping')
    expect(r.items[0].name).toBe('Shampoo')
    expect(r.items[0].aisle).toBe('Higiene')
  })
  it('Buy shampoo tomorrow', () => {
    const r = p('Buy shampoo tomorrow')
    expect(r.kind).toBe('shopping')
    expect(r.due).toBe('2026-11-19')
    expect(r.items.map((i) => i.name)).toEqual(['Shampoo'])
  })
  it('Pay electricity bill tomorrow', () => {
    const r = p('Pay electricity bill tomorrow')
    expect(r.title).toBe('Pay electricity bill')
    expect(r.due).toBe('2026-11-19')
    expect(r.category).toBe('financial')
  })
  it('Take my car to the mechanic on Friday at 8 AM', () => {
    const r = p('Take my car to the mechanic on Friday at 8 AM')
    expect(r.title).toBe('Take my car to the mechanic')
    expect(r.due).toBe('2026-11-20')
    expect(r.time).toBe('08:00')
    expect(r.category).toBe('appointment')
    expect(r.persistent).toBe(true)
  })
  it('Remember to bring my charger when I leave home', () => {
    const r = p('Remember to bring my charger when I leave home')
    expect(r.context).toEqual({ type: 'leaving' })
    expect(r.title).toBe('Bring my charger')
  })
  it('Buy toothpaste next time I go to the pharmacy', () => {
    const r = p('Buy toothpaste next time I go to the pharmacy')
    expect(r.kind).toBe('shopping')
    expect(r.store).toBe('farmacia')
    expect(r.items[0].name).toBe('Toothpaste')
  })
  it('Call my mother this weekend', () => {
    const r = p('Call my mother this weekend')
    expect(r.due).toBe('2026-11-21')
    expect(r.category).toBe('personal')
    expect(r.title).toBe('Call my mother')
  })
  it('Study databases for 30 minutes tonight', () => {
    const r = p('Study databases for 30 minutes tonight')
    expect(r.title).toBe('Study databases')
    expect(r.durationMin).toBe(30)
    expect(r.due).toBe('2026-11-18')
    expect(r.time).toBe('20:00')
    expect(r.category).toBe('study')
  })
  it('Pay credit card on the 25th', () => {
    const r = p('Pay credit card on the 25th')
    expect(r.due).toBe('2026-11-25')
    expect(r.title).toBe('Pay credit card')
  })
  it('Go to the supermarket after work', () => {
    const r = p('Go to the supermarket after work')
    expect(r.title).toBe('Go to the supermarket')
    expect(r.time).toBe('18:15')
    expect(r.due).toBe('2026-11-18')
    expect(r.category).toBe('shopping')
  })
  it('Remind me to take the documents when I leave home', () => {
    const r = p('Remind me to take the documents when I leave home')
    expect(r.title).toBe('Take the documents')
    expect(r.context?.type).toBe('leaving')
  })
  it('Buy dog food when I go to the pet store', () => {
    const r = p('Buy dog food when I go to the pet store')
    expect(r.kind).toBe('shopping')
    expect(r.store).toBe('petshop')
    expect(r.items[0].name).toBe('Dog food')
  })
  it('Study Java for 40 minutes tonight', () => {
    const r = p('Study Java for 40 minutes tonight')
    expect(r.durationMin).toBe(40)
    expect(r.title).toBe('Study Java')
  })
  it('Remind me at 7 PM', () => {
    const r = p('Check the oven at 7 PM')
    expect(r.time).toBe('19:00')
    expect(r.due).toBe('2026-11-18')
  })
  it('every Monday', () => {
    const r = p('Take out the trash every Monday')
    expect(r.recurrence).toEqual({ freq: 'weekly', days: [1] })
    expect(r.due).toBe('2026-11-23')
    expect(r.title).toBe('Take out the trash')
  })
  it('in 20 minutes', () => {
    const r = p('Take clothes out of the washing machine in 20 minutes')
    expect(r.time).toBe('10:20')
    expect(r.title).toBe('Take clothes out of the washing machine')
  })
  it('urgent priority', () => {
    expect(p('Renew passport !').priority).toBe(1)
    expect(p('Renew passport urgent').title).toBe('Renew passport')
  })
})

describe('parser — Português', () => {
  it('Comprar shampoo amanhã', () => {
    const r = p('Comprar shampoo amanhã')
    expect(r.kind).toBe('shopping')
    expect(r.due).toBe('2026-11-19')
  })
  it('Levar o carro no mecânico sexta às 8h', () => {
    const r = p('Levar o carro no mecânico sexta às 8h')
    expect(r.title).toBe('Levar o carro no mecânico')
    expect(r.due).toBe('2026-11-20')
    expect(r.time).toBe('08:00')
    expect(r.category).toBe('appointment')
  })
  it('Pagar cartão dia 25', () => {
    const r = p('Pagar cartão dia 25')
    expect(r.due).toBe('2026-11-25')
    expect(r.title).toBe('Pagar cartão')
    expect(r.category).toBe('financial')
  })
  it('Pagar aluguel todo dia 5 R$ 1.200,00 → bill', () => {
    const r = p('Pagar aluguel todo dia 5 R$ 1.200,00')
    expect(r.kind).toBe('bill')
    expect(r.recurrence).toEqual({ freq: 'monthly', day: 5 })
    expect(r.amount).toBe(1200)
    expect(r.title).toBe('Pagar aluguel')
  })
  it('Estudar banco de dados por 40 min hoje à noite', () => {
    const r = p('Estudar banco de dados por 40 min hoje à noite')
    expect(r.durationMin).toBe(40)
    expect(r.time).toBe('20:00')
    expect(r.title).toBe('Estudar banco de dados')
    expect(r.category).toBe('study')
  })
  it('às 7 da noite', () => {
    expect(p('Ligar pra mãe às 7 da noite').time).toBe('19:00')
    expect(p('Ligar pra mãe às 19h30').time).toBe('19:30')
  })
  it('Comprar ração quando for no petshop', () => {
    const r = p('Comprar ração quando for no petshop')
    expect(r.store).toBe('petshop')
    expect(r.items[0].name).toBe('Ração')
  })
  it('Levar carregador quando sair de casa', () => {
    const r = p('Levar carregador quando sair de casa')
    expect(r.context?.type).toBe('leaving')
    expect(r.title).toBe('Levar carregador')
  })
  it('Tomar remédio todo dia às 8h → persistent daily', () => {
    const r = p('Tomar remédio todo dia às 8h')
    expect(r.recurrence).toEqual({ freq: 'daily' })
    expect(r.time).toBe('08:00')
    expect(r.persistent).toBe(true)
    expect(r.due).toBe('2026-11-19') // 08:00 already passed today
  })
  it('toda segunda e quarta', () => {
    expect(p('Academia toda segunda e quarta').recurrence).toEqual({ freq: 'weekly', days: [1, 3] })
  })
  it('dates 25/12 and 3 de dezembro', () => {
    expect(p('Comprar presente 25/12').due).toBe('2026-12-25')
    expect(p('Consulta 3 de dezembro').due).toBe('2026-12-03')
  })
  it('notes go to memory', () => {
    expect(p('nota: senha do wifi está atrás do roteador').kind).toBe('note')
    expect(p('Guardei o passaporte na gaveta azul').kind).toBe('note')
  })
  it('multiple shopping items with quantities', () => {
    const r = p('comprar 2kg arroz, leite e café')
    expect(r.items.map((i) => [i.name, i.qty])).toEqual([['Arroz', '2kg'], ['Leite', undefined], ['Café', undefined]])
    expect(r.items[2].aisle).toBe('Bebidas e café')
  })
  it('does not eat words that look like dates', () => {
    expect(p('Organizar o quarto').title).toBe('Organizar o quarto')
    expect(p('Set up the router').title).toBe('Set up the router')
  })
  it('someday', () => {
    const r = p('Aprender violão algum dia')
    expect(r.someday).toBe(true)
    expect(r.due).toBeNull()
  })
})

describe('brain dump', () => {
  it('splits the spec example', () => {
    const parts = splitDump('I need to buy shampoo, study for my database test, call the mechanic, pay my credit card, clean my room, buy groceries, and remember to take my documents tomorrow.')
    expect(parts).toEqual([
      'I need to buy shampoo', 'study for my database test', 'call the mechanic', 'pay my credit card',
      'clean my room', 'buy groceries', 'and remember to take my documents tomorrow',
    ])
    const tasks = parts.map((x) => p(x))
    expect(tasks[0].kind).toBe('shopping')
    expect(tasks[1].category).toBe('study')
    expect(tasks[6].due).toBe('2026-11-19')
    expect(tasks[6].title).toBe('Take my documents')
  })
  it('carries the shopping verb', () => {
    expect(splitDump('comprar pão, ovos e leite; ligar pro dentista')).toEqual(['comprar pão', 'comprar ovos e leite', 'ligar pro dentista'])
  })
  it('splits on " e " before a verb', () => {
    expect(splitDump('lavar a louça e pagar a internet')).toEqual(['lavar a louça', 'pagar a internet'])
  })
})
