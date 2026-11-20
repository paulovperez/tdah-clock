import { useCallback, useEffect, useRef, useState } from 'react'
import type { Task } from './store/types'
import { getState, useStore } from './store/store'
import { bumpNag, completeTask, markFired, pruneFired, pushReminder, snoozeAlarm, snoozeTask, updateSettings } from './store/actions'
import { collectDue, dueAlarms } from './lib/engine'
import { askPermission, closeSystem, registerSW, requestPersistentStorage, showSystem } from './lib/notify'
import { chime, unlockAudio } from './lib/sound'
import { Icon, Sheet, ToastHost, toast } from './components/ui'
import { CaptureSheet } from './components/Capture'
import { TaskEditor } from './components/tasks'
import { LeavingSheet, ReminderInbox, Ringer, type Ringing } from './components/Overlays'
import { TriageSheet } from './components/tasks'
import { Today } from './views/Today'
import { Tasks } from './views/Tasks'
import { Clock } from './views/Clock'
import { Shopping } from './views/Shopping'
import { Memory } from './views/Memory'
import { Routines, RoutinePlayer } from './views/Routines'
import { Finance } from './views/Finance'
import { BrainDump } from './views/BrainDump'
import { Planner } from './views/Planner'
import { Settings } from './views/Settings'
import { toISO } from './lib/date'

const ICON = import.meta.env.BASE_URL + 'icon.svg'

type Route = 'today' | 'tasks' | 'clock' | 'shopping' | 'memory' | 'routines' | 'finance' | 'dump' | 'planner' | 'settings'
const ROUTES: Route[] = ['today', 'tasks', 'clock', 'shopping', 'memory', 'routines', 'finance', 'dump', 'planner', 'settings']

const TABS: [Route, string, string][] = [
  ['today', 'Hoje', 'today'], ['tasks', 'Tarefas', 'tasks'], ['clock', 'Relógio', 'clock'], ['shopping', 'Compras', 'cart'], ['memory', 'Memória', 'memory'],
]
const MORE: [Route, string, string][] = [
  ['routines', 'Rotinas', 'routine'], ['finance', 'Contas', 'wallet'], ['dump', 'Despejo mental', 'brain'], ['planner', 'Planejar o dia', 'planner'], ['settings', 'Ajustes', 'settings'],
]

const readRoute = (): Route => {
  const h = location.hash.replace('#/', '').replace('#', '') as Route
  return ROUTES.includes(h) ? h : 'today'
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [capture, setCapture] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [more, setMore] = useState(false)
  const [triage, setTriage] = useState(false)
  const [routine, setRoutine] = useState<string | null>(null)
  const [ringing, setRinging] = useState<Ringing | null>(null)
  const ringQueue = useRef<Ringing[]>([])
  const theme = useStore((s) => s.settings.theme)
  const onboarded = useStore((s) => s.settings.onboarded)
  const inboxCount = useStore((s) => s.inbox.length)
  const shopCount = useStore((s) => s.shop.filter((i) => !i.checked).length)
  const tasks = useStore((s) => s.tasks)

  const go = useCallback((r: string) => {
    const next = (ROUTES.includes(r as Route) ? r : 'today') as Route
    if (location.hash !== '#/' + next) location.hash = '/' + next
    setRoute(next)
    setMore(false)
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const f = () => setRoute(readRoute())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  // theme
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'system') el.removeAttribute('data-theme')
    else el.setAttribute('data-theme', theme)
  }, [theme])

  // ring helper: one ringing screen at a time
  const ring = useCallback((r: Ringing) => {
    setRinging((cur) => {
      if (cur) { ringQueue.current.push(r); return cur }
      return r
    })
  }, [])

  // ---------------- the heartbeat: reminders, alarms, timers ----------------
  useEffect(() => {
    const tick = () => {
      const s = getState()
      const now = Date.now()
      if (!s.settings.onboarded) return // don't greet a brand-new user with a pile of reminders
      for (const r of collectDue(s, now)) {
        pushReminder(r)
        if (r.kind === 'nag') bumpNag(r.key.replace(/^nag:/, '').replace(/:\d+$/, ''))
        chime(s.settings.volume, r.important)
        if (s.settings.systemNotifications && (document.hidden || r.important)) void showSystem(r)
      }
      for (const { alarm, key } of dueAlarms(s, now)) {
        markFired(key)
        ring({ kind: 'alarm', alarm })
        void showSystem({ key, title: `⏰ ${alarm.label}`, body: `${alarm.time} — toque para abrir`, important: true, alarm: true })
      }
      for (const t of s.timers) {
        const key = `timer:${t.id}:${t.endsAt}`
        if (t.endsAt && now >= t.endsAt && !s.fired[key]) {
          markFired(key)
          ring({ kind: 'timer', timer: t })
          void showSystem({ key, title: t.kind === 'focus' ? '🎯 Sessão de foco concluída' : '⏱ Tempo esgotado', body: t.label, important: true })
        }
      }
    }
    tick()
    const id = setInterval(tick, 5000)
    const vis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('focus', vis)
    pruneFired()
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', vis) }
  }, [ring])

  // ---------------- platform: SW, notification actions, deep links ----------------
  useEffect(() => {
    void registerSW()
    void requestPersistentStorage()
    const handle = (action: string, key?: string, taskId?: string) => {
      if (taskId && action === 'done') { completeTask(taskId); toast('Feito ✓', { undo: true }) }
      if (taskId && action === 'snooze15') { snoozeTask(taskId, 15); toast('Lembro de novo em 15 min') }
      if (action === 'snoozeAlarm') {
        const id = key?.split(':')[1]
        if (id) { snoozeAlarm(id); setRinging(null) }
      }
      if (key) void closeSystem(key)
    }
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'notification-action') handle(e.data.action, e.data.key, e.data.taskId) }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    const q = new URLSearchParams(location.search)
    if (q.get('na')) handle(q.get('na')!, q.get('key') || undefined, q.get('task') || undefined)
    if (q.get('capture')) setCapture(true)
    if (q.get('leaving')) setLeaving(true)
    if (q.toString()) history.replaceState(null, '', location.pathname + location.hash)
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: false })
    window.addEventListener('keydown', unlock, { once: false })
    return () => { navigator.serviceWorker?.removeEventListener('message', onMsg); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  }, [])

  // ---------------- keyboard ----------------
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.scrim, .ring-screen')) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setCapture(true) }
      else if (e.key === '/') { e.preventDefault(); go('tasks'); setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="Buscar tarefas"]')?.focus(), 50) }
      else if (/^[1-5]$/.test(e.key)) go(TABS[Number(e.key) - 1][0])
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [go])

  const openTask = (t: Task) => setEditing(t)
  const today = toISO(new Date())
  const todayCount = tasks.filter((t) => !t.completedAt && !t.someday && t.due && t.due <= today).length

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Navegação">
        <div className="brand"><img src={ICON} width="30" height="30" alt="" /> TDAH Clock</div>
        <button className="btn primary side-capture" onClick={() => setCapture(true)}><Icon name="plus" /> Lembrar de algo</button>
        {TABS.map(([r, l, i]) => <button key={r} className="side-link" aria-current={route === r ? 'page' : undefined} onClick={() => go(r)}><Icon name={i} /> {l}{r === 'today' && todayCount ? <span className="spacer" /> : null}{r === 'today' && todayCount ? <span className="pill">{todayCount}</span> : null}{r === 'shopping' && shopCount ? <><span className="spacer" /><span className="pill">{shopCount}</span></> : null}</button>)}
        <div className="side-sep" />
        <button className="side-link" onClick={() => setLeaving(true)}><Icon name="door" /> Vou sair de casa</button>
        {MORE.map(([r, l, i]) => <button key={r} className="side-link" aria-current={route === r ? 'page' : undefined} onClick={() => go(r)}><Icon name={i} /> {l}</button>)}
      </nav>

      <main className="main" id="main">
        <MobileHeader onMenu={() => setMore(true)} onLeaving={() => setLeaving(true)} />
        <ReminderInbox onNavigate={go} onTriage={() => setTriage(true)} onRoutine={setRoutine} />
        {route === 'today' && <Today onOpenTask={openTask} onCapture={() => setCapture(true)} onLeaving={() => setLeaving(true)} onNavigate={go} onRoutine={setRoutine} />}
        {route === 'tasks' && <Tasks onOpenTask={openTask} onCapture={() => setCapture(true)} />}
        {route === 'clock' && <Clock />}
        {route === 'shopping' && <Shopping />}
        {route === 'memory' && <Memory />}
        {route === 'routines' && <Routines onPlay={setRoutine} />}
        {route === 'finance' && <Finance />}
        {route === 'dump' && <BrainDump onDone={() => go('today')} />}
        {route === 'planner' && <Planner onDone={() => go('today')} />}
        {route === 'settings' && <Settings />}
      </main>

      <nav className="tabbar" aria-label="Abas">
        {TABS.map(([r, l, i]) => (
          <button key={r} className="tab" aria-current={route === r ? 'page' : undefined} onClick={() => go(r)}>
            <Icon name={i} size={24} />{l}
            {r === 'today' && inboxCount > 0 && <span className="dot">{inboxCount}</span>}
          </button>
        ))}
      </nav>
      <button className="fab" onClick={() => setCapture(true)} aria-label="Lembrar de algo"><Icon name="plus" size={28} stroke={2.5} /></button>


      {capture && <CaptureSheet onClose={() => setCapture(false)} onBrainDump={() => { setCapture(false); go('dump') }} />}
      {editing && <TaskEditor task={tasks.find((t) => t.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
      {leaving && <LeavingSheet onClose={() => setLeaving(false)} />}
      {triage && <TriageSheet tasks={tasks.filter((t) => !t.completedAt && !t.someday && t.due && t.due <= today)} onClose={() => setTriage(false)} />}
      {routine && <RoutinePlayer id={routine} onClose={() => setRoutine(null)} />}
      {more && (
        <Sheet title="Mais" onClose={() => setMore(false)}>
          <div className="list">
            {MORE.map(([r, l, i]) => <button key={r} className="item" style={{ width: '100%' }} onClick={() => go(r)}><Icon name={i} /><span className="body title">{l}</span><Icon name="chevron" /></button>)}
          </div>
        </Sheet>
      )}
      {!onboarded && <Onboarding />}
      {ringing && <Ringer ringing={ringing} onDone={(startRoutine) => {
        if (startRoutine) setRoutine(startRoutine)
        setRinging(ringQueue.current.shift() ?? null)
      }} />}
      <ToastHost />
    </div>
  )
}

function MobileHeader({ onMenu, onLeaving }: { onMenu: () => void; onLeaving: () => void }) {
  return (
    <div className="mobile-header">
      <div className="row" style={{ gap: 8, fontWeight: 800 }}><img src={ICON} width="26" height="26" alt="" /> TDAH Clock</div>
      <div className="row" style={{ gap: 2 }}>
        <button className="icon-btn" onClick={onLeaving} aria-label="Vou sair de casa"><Icon name="door" /></button>
        <button className="icon-btn" onClick={onMenu} aria-label="Mais opções"><Icon name="menu" /></button>
      </div>
    </div>
  )
}

function Onboarding() {
  const [name, setName] = useState('')
  const finish = async (notify: boolean) => {
    unlockAudio()
    if (notify) await askPermission()
    updateSettings({ name: name.trim(), onboarded: true })
  }
  return (
    <div className="scrim" style={{ zIndex: 90 }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Boas-vindas">
        <div style={{ textAlign: 'center', padding: '14px 4px 4px' }}>
          <img src={ICON} width="72" height="72" alt="" />
          <h2 style={{ fontSize: 28, letterSpacing: '-.02em', margin: '12px 0 6px' }}>Seu cérebro externo</h2>
          <p className="muted" style={{ margin: '0 0 18px' }}>Você lembra. O TDAH Clock guarda, organiza e te avisa na hora certa.</p>
        </div>
        <div className="stack">
          {[
            ['✍️', 'Capture em segundos', 'Escreva “pagar luz amanhã” ou “comprar shampoo”. Sem formulários.'],
            ['🔔', 'Lembretes que dá para resolver', 'Feito, +5, +15, amanhã — direto no aviso.'],
            ['🧭', 'Só o que importa agora', 'Agora · Em seguida · Depois. Nunca uma lista infinita.'],
          ].map(([e, t, d]) => (
            <div key={t} className="row card" style={{ alignItems: 'flex-start' }}><span style={{ fontSize: 26 }}>{e}</span><div><strong>{t}</strong><div className="small muted">{d}</div></div></div>
          ))}
          <label className="field" style={{ marginTop: 6 }}><span>Como posso te chamar? (opcional)</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" /></label>
          <button className="btn primary block" style={{ minHeight: 56 }} onClick={() => finish(true)}><Icon name="bell" /> Começar e permitir lembretes</button>
          <button className="btn ghost block" onClick={() => finish(false)}>Agora não</button>
        </div>
      </div>
    </div>
  )
}
