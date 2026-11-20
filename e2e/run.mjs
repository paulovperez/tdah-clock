// End-to-end flows against the production build, driven in the installed Microsoft Edge.
// Usage: npx vite preview --port 4173  (in another terminal), then: node e2e/run.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const URL = process.env.URL ?? 'http://localhost:4173/'
const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SHOTS = process.env.SHOTS ?? 'e2e/shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const errors = []
const check = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); if (!cond) process.exitCode = 1 }

const browser = await chromium.launch({ executablePath: EDGE, headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.clock.install({ time: new Date(2026, 10, 18, 9, 0, 0) }) // Wed 18 Nov 2026, 09:00 local
await page.goto(URL)

const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('tdah-clock:v1') || '{}'))
const advance = async (ms) => { await page.clock.fastForward(ms); await page.waitForTimeout(80) }
const capture = async (text) => {
  if (!(await page.locator('input[aria-label="Capturar"]').isVisible())) await page.keyboard.press('n')
  await page.fill('input[aria-label="Capturar"]', text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(60)
}

// 1. onboarding
await page.screenshot({ path: `${SHOTS}/00-onboarding.png` })
check('onboarding shows', await page.getByText('Seu cérebro externo').isVisible())
await page.fill('input[placeholder="Seu nome"]', 'Ana')
await page.getByRole('dialog', { name: 'Boas-vindas' }).getByRole('button', { name: 'Agora não' }).click()
check('greeting uses name', await page.getByText('Bom dia, Ana').isVisible())
check('no reminders before onboarding finished', true)
await advance(6000)
// 09:00 → the morning briefing (07:30) and morning routine (07:15) are still within their window
check('morning briefing arrives', await page.locator('.rem', { hasText: 'Bom dia, Ana' }).isVisible())
await page.screenshot({ path: `${SHOTS}/01b-briefing.png` })
await page.getByRole('button', { name: 'Minimizar lembretes' }).click()
check('reminders can be minimized', await page.getByRole('button', { name: /2 lembretes/ }).isVisible())
await page.getByRole('button', { name: /2 lembretes/ }).click()
for (let i = 0; i < 4 && (await page.locator('.rem').count()); i++) await page.locator('.rem').last().locator('.btn.ghost').click()
check('inbox cleared', (await page.locator('.rem').count()) === 0)
await page.screenshot({ path: `${SHOTS}/01-today-empty.png`, fullPage: true })

// 2. quick capture with natural language
await page.keyboard.press('n')
await page.fill('input[aria-label="Capturar"]', 'Ligar pro dentista às 9h30')
check('live preview shows time chip', await page.locator('.preview').getByText('09:30').isVisible())
await page.screenshot({ path: `${SHOTS}/02-capture-preview.png` })
await page.keyboard.press('Enter')
await capture('Comprar shampoo e pasta de dente')
await capture('nota: senha do wifi está atrás do roteador')
await capture('Levar carregador quando sair de casa')
await capture('Pagar aluguel todo dia 20 R$ 1.500,00')
await capture('Estudar banco de dados por 40 min hoje à noite')
await capture('Organizar o quarto')
await page.keyboard.press('Escape')
let s = await state()
check('tasks saved', s.tasks?.length === 4, `got ${s.tasks?.length}`)
check('shopping items saved', s.shop?.length === 2 && s.shop.some((i) => i.name === 'Pasta de dente'), JSON.stringify(s.shop?.map((i) => i.name)))
check('note saved to memory', s.notes?.length === 1)
check('monthly bill created', s.bills?.length === 1 && s.bills[0].amount === 1500 && s.bills[0].dueDay === 20)
const study = s.tasks.find((t) => t.title === 'Estudar banco de dados')
check('study task parsed', study?.durationMin === 40 && study?.time === '20:00' && study?.category === 'study')

// 3. persistence across reload
await page.reload()
await page.waitForTimeout(200)
check('data persists after reload', (await page.getByText('Ligar pro dentista').count()) > 0)
await page.screenshot({ path: `${SHOTS}/03-today.png`, fullPage: true })

// 4. transition heads-up, reminder, snooze, done
await advance(16 * 60 * 1000) // 09:16
check('heads-up 15 min before', await page.locator('.rem').getByText('Em 15 min: Ligar pro dentista').isVisible())
await page.locator('.rem').getByRole('button', { name: 'Ok, me preparando' }).click()
await advance(14 * 60 * 1000) // 09:30
const rem = page.locator('.rem', { hasText: 'Ligar pro dentista' })
check('reminder fires on time', await rem.isVisible())
await page.screenshot({ path: `${SHOTS}/04-reminder.png` })
await rem.getByRole('button', { name: '+5 min' }).click()
check('snooze hides reminder', (await page.locator('.rem', { hasText: 'Ligar pro dentista' }).count()) === 0)
await advance(2 * 60 * 1000)
check('not back before snooze ends', (await page.locator('.rem', { hasText: 'Ligar pro dentista' }).count()) === 0)
await advance(3 * 60 * 1000 + 5000)
check('reminder returns after snooze', await page.locator('.rem', { hasText: 'Ligar pro dentista' }).isVisible())
await page.locator('.rem', { hasText: 'Ligar pro dentista' }).getByRole('button', { name: 'Feito' }).click()
s = await state()
check('done from reminder completes task', !!s.tasks.find((t) => t.title === 'Ligar pro dentista')?.completedAt)

// 5. alarm: create, ring, snooze, ring again, dismiss
await page.goto(URL + '#/clock')
await page.getByRole('button', { name: 'Novo alarme' }).click()
await page.fill('input[aria-label="Horário"]', '09:50')
await page.fill('input[placeholder^="Acordar, Sair"]', 'Sair para a faculdade')
await page.locator('.sheet').getByRole('button', { name: 'Salvar' }).click()
check('alarm listed', await page.getByText('Sair para a faculdade').isVisible())
await page.screenshot({ path: `${SHOTS}/05-alarms.png`, fullPage: true })
await advance(15 * 60 * 1000) // ~09:50
check('alarm rings full-screen', await page.locator('.ring-screen').isVisible())
await page.screenshot({ path: `${SHOTS}/06-ringing.png` })
await page.getByRole('button', { name: /Soneca/ }).click()
check('snooze closes ring screen', (await page.locator('.ring-screen').count()) === 0)
await advance(9 * 60 * 1000 + 5000)
check('alarm rings again after snooze', await page.locator('.ring-screen').isVisible())
await page.getByRole('button', { name: 'Desligar' }).click()
s = await state()
check('one-shot alarm turns off after dismiss', s.alarms.find((a) => a.label === 'Sair para a faculdade')?.enabled === false)

// 6. recurring task rolls forward
await capture('Tomar remédio todo dia às 10h30')
await page.keyboard.press('Escape')
await advance(31 * 60 * 1000) // ~10:30
const med = page.locator('.rem', { hasText: 'Tomar remédio' })
check('medication reminder is important', await med.isVisible() && (await med.getAttribute('class')).includes('important'))
await med.getByRole('button', { name: 'Feito' }).click()
s = await state()
const medTask = s.tasks.find((t) => t.title === 'Tomar remédio')
check('recurring task advances to tomorrow', medTask?.due === '2026-11-19' && !medTask.completedAt && medTask.history?.length === 1, JSON.stringify(medTask))
// persistent nag
await capture('Pagar boleto urgente às 10h45')
await page.keyboard.press('Escape')
await advance(15 * 60 * 1000)
const boleto = page.locator('.rem', { hasText: 'Pagar boleto' })
check('urgent task reminder', await boleto.first().isVisible())
await advance(10 * 60 * 1000 + 5000)
check('persistent task nags again', await page.locator('.rem', { hasText: 'Ainda pendente: Pagar boleto' }).isVisible())
await page.locator('.rem', { hasText: 'Ainda pendente' }).getByRole('button', { name: 'Feito' }).click()

// 7. focus timer finishes and rings
await page.getByRole('button', { name: 'Foco' }).click()
await page.getByRole('button', { name: '15 min' }).click()
await advance(5 * 60 * 1000)
await page.screenshot({ path: `${SHOTS}/07-focus.png` })
check('focus visual timer running', await page.locator('.big-timer').isVisible())
await advance(10 * 60 * 1000 + 5000)
check('focus end rings', await page.locator('.ring-screen').getByText('Tempo esgotado').isVisible())
await page.getByRole('button', { name: 'Ok' }).click()

// 8. shopping: check off → purchased, suggestions
await page.goto(URL + '#/shopping')
await page.screenshot({ path: `${SHOTS}/08-shopping.png`, fullPage: true })
await page.getByRole('button', { name: 'Comprei Shampoo' }).click()
s = await state()
check('checked item marked purchased + history', s.shop.find((i) => i.name === 'Shampoo')?.checked === true && s.shopHistory.shampoo?.count === 1)
await page.getByRole('button', { name: 'Limpar comprados' }).click()
check('frequent suggestion offered', await page.getByText('Você costuma comprar').isVisible())

// 9. brain dump
await page.goto(URL + '#/dump')
await page.fill('textarea[aria-label="Despejo mental"]', 'Preciso comprar leite, estudar para a prova de banco de dados, ligar pro mecânico, pagar o cartão dia 25, limpar o quarto e levar os documentos amanhã')
await page.getByRole('button', { name: 'Organizar para mim' }).click()
await page.screenshot({ path: `${SHOTS}/09-braindump.png`, fullPage: true })
const n = await page.locator('.list .item').count()
check('brain dump splits into items', n === 6, `got ${n}`)
const before = (await state()).tasks.length
await page.getByRole('button', { name: /Adicionar 6/ }).click()
s = await state()
check('brain dump adds tasks', s.tasks.length === before + 5 && s.shop.some((i) => i.name === 'Leite'))

// 10. leaving home
await page.getByRole('button', { name: 'Vou sair de casa' }).first().click()
check('leaving checklist includes contextual task', await page.locator('.sheet').getByText('Levar carregador').isVisible())
await page.screenshot({ path: `${SHOTS}/10-leaving.png` })
for (const b of await page.locator('.sheet .check').all()) await b.click()
check('all checked → good to go', await page.getByText('Tudo certo. Pode ir!').isVisible())
await page.getByRole('button', { name: 'Fechar' }).last().click()

// 11. memory search, tasks views, planner, overdue triage
await page.goto(URL + '#/memory')
await page.fill('input[aria-label="Buscar na memória"]', 'roteador')
check('memory search finds note', await page.locator('.note mark').isVisible())
await page.screenshot({ path: `${SHOTS}/11-memory.png` })
await page.goto(URL + '#/tasks')
await page.getByRole('tab', { name: /Concluídas/ }).click()
check('completed tasks remain accessible', await page.getByText('Ligar pro dentista').isVisible())
await page.getByRole('tab', { name: /^Hoje/ }).click()
await page.screenshot({ path: `${SHOTS}/12-tasks.png`, fullPage: true })
await page.goto(URL + '#/planner')
await page.screenshot({ path: `${SHOTS}/13-planner.png`, fullPage: true })
check('planner renders a plan', (await page.locator('.list .item').count()) > 0)
await page.goto(URL + '#/finance')
await page.screenshot({ path: `${SHOTS}/14-finance.png`, fullPage: true })
check('finance shows bill', await page.locator('.list .title', { hasText: 'Pagar aluguel' }).isVisible())

// next day: overdue triage + morning briefing
await advance(22 * 3600 * 1000) // → next day ~08:xx
await page.goto(URL + '#/today')
await page.waitForTimeout(150)
check('morning briefing or overdue card shown', (await page.getByText(/ficaram para trás|ficou para trás/).count()) > 0)
await page.screenshot({ path: `${SHOTS}/15-next-day.png`, fullPage: true })

// 12. dark mode + desktop
await page.emulateMedia({ colorScheme: 'dark' })
await page.screenshot({ path: `${SHOTS}/16-today-dark.png`, fullPage: true })
await page.goto(URL + '#/clock')
await page.screenshot({ path: `${SHOTS}/17-clock-dark.png` })
await page.setViewportSize({ width: 1366, height: 900 })
await page.goto(URL + '#/today')
await page.screenshot({ path: `${SHOTS}/18-desktop-dark.png` })
await page.emulateMedia({ colorScheme: 'light' })
await page.screenshot({ path: `${SHOTS}/19-desktop-light.png` })
// narrow phone: no horizontal scroll
await page.setViewportSize({ width: 320, height: 640 })
for (const r of ['today', 'tasks', 'clock', 'shopping', 'memory', 'routines', 'finance', 'settings']) {
  await page.goto(URL + '#/' + r)
  await page.waitForTimeout(60)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(`no horizontal overflow at 320px: ${r}`, overflow <= 0, `overflow ${overflow}px`)
}
await page.screenshot({ path: `${SHOTS}/20-320px.png`, fullPage: true })

check('no runtime errors', errors.length === 0, errors.slice(0, 5).join(' | '))
await browser.close()
for (const [r, n, e] of results) console.log(`${r}  ${n}${e && r === 'FAIL' ? '  → ' + e : ''}`)
console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`)
