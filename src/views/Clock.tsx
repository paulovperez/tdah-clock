import { useEffect, useState } from 'react'
import type { Alarm, AlarmSound, Timer } from '../store/types'
import { useStore } from '../store/store'
import { deleteAlarm, saveAlarm, startTimer, pauseTimer, resumeTimer, removeTimer, addTimerTime, stopwatchToggle, stopwatchLap, stopwatchReset } from '../store/actions'
import { formatClock, humanizeDelta, nowHHMM, toISO, WEEKDAYS_SHORT } from '../lib/date'
import { nextAlarmAt } from '../lib/engine'
import { previewSound, SOUND_LABELS, unlockAudio } from '../lib/sound'
import { DaysPicker, Empty, Icon, Ring, Seg, Sheet, Switch, toast, useNow } from '../components/ui'

type Mode = 'alarms' | 'timer' | 'focus' | 'stopwatch'

export function Clock({ initial }: { initial?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial ?? 'alarms')
  const [bedside, setBedside] = useState(false)
  return (
    <div className="page">
      <div className="topbar"><h1>Relógio</h1><button className="btn small" onClick={() => { unlockAudio(); setBedside(true) }}><Icon name="moon" size={17} /> Modo cabeceira</button></div>
      <Seg value={mode} onChange={setMode} options={[['alarms', 'Alarmes'], ['timer', 'Timer'], ['focus', 'Foco'], ['stopwatch', 'Cronômetro']]} />
      <div style={{ marginTop: 16 }}>
        {mode === 'alarms' && <Alarms />}
        {mode === 'timer' && <Timers />}
        {mode === 'focus' && <Focus />}
        {mode === 'stopwatch' && <StopwatchView />}
      </div>
      {bedside && <Bedside onClose={() => setBedside(false)} />}
    </div>
  )
}

// ---------------- alarms ----------------
function Alarms() {
  const alarms = useStore((s) => s.alarms)
  const routines = useStore((s) => s.routines)
  const now = useNow(30000)
  const [edit, setEdit] = useState<Partial<Alarm> | null>(null)
  return (
    <>
      {alarms.length === 0 ? <div className="card"><Empty icon="⏰" title="Nenhum alarme">Crie um para acordar, sair ou começar algo.</Empty></div> : (
        <div className="list">
          {alarms.map((a) => {
            const next = nextAlarmAt(a, now)
            return (
              <div key={a.id} className={`alarm ${a.enabled ? '' : 'off'}`}>
                <button className="body" style={{ flex: 1, textAlign: 'left' }} onClick={() => setEdit(a)}>
                  <div className="tm num">{a.time}</div>
                  <div className="small" style={{ fontWeight: 700, marginTop: 4 }}>{a.label}</div>
                  <div className="tiny muted">
                    {a.days.length ? (a.days.length === 7 ? 'Todo dia' : [1, 2, 3, 4, 5, 6, 0].filter((d) => a.days.includes(d)).map((d) => WEEKDAYS_SHORT[d]).join(' ')) : 'Uma vez'}
                    {a.enabled && next ? ` · toca ${humanizeDelta(next - now)}` : ''}
                    {a.challenge !== 'none' ? ' · exige ação' : ''}
                    {a.skipDate === toISO(new Date(now + 86400000)) ? ' · pulando amanhã' : ''}
                  </div>
                </button>
                <Switch label={`Ativar ${a.label}`} on={a.enabled} onChange={(v) => { unlockAudio(); saveAlarm({ id: a.id, enabled: v }); if (v && next) toast(`Toca ${humanizeDelta((nextAlarmAt({ ...a, enabled: true }, Date.now()) ?? 0) - Date.now())}`) }} />
              </div>
            )
          })}
        </div>
      )}
      <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => { unlockAudio(); setEdit({}) }}><Icon name="plus" /> Novo alarme</button>
      <p className="tiny muted" style={{ marginTop: 14, lineHeight: 1.5 }}>
        Navegadores só tocam alarmes com o app aberto (ou em segundo plano recente). Para acordar com segurança, deixe o TDAH Clock aberto no <strong>Modo cabeceira</strong> — ele mantém a tela ligada e o som pronto. Notificações do sistema também são enviadas.
      </p>
      {edit && <AlarmEditor alarm={edit} routines={routines.map((r) => [r.id, `${r.emoji} ${r.name}`])} onClose={() => setEdit(null)} />}
    </>
  )
}

function AlarmEditor({ alarm, routines, onClose }: { alarm: Partial<Alarm>; routines: [string, string][]; onClose: () => void }) {
  const volume = useStore((s) => s.settings.volume)
  const [a, setA] = useState<Partial<Alarm>>({ label: 'Alarme', time: '07:00', days: [], sound: 'suave', ramp: true, snoozeMin: 9, challenge: 'none', enabled: true, ...alarm })
  const p = (x: Partial<Alarm>) => setA((o) => ({ ...o, ...x }))
  const tomorrow = toISO(new Date(Date.now() + 86400000))
  const save = () => { saveAlarm({ ...a, enabled: true }); onClose() }
  return (
    <Sheet title={alarm.id ? 'Editar alarme' : 'Novo alarme'} onClose={onClose} actions={<button className="btn small primary" onClick={save}>Salvar</button>}>
      <div className="stack">
        <input type="time" className="input num" style={{ fontSize: 44, fontWeight: 300, textAlign: 'center', minHeight: 84 }} value={a.time} onChange={(e) => p({ time: e.target.value })} aria-label="Horário" />
        <label className="field"><span>Nome</span><input className="input" value={a.label} onChange={(e) => p({ label: e.target.value })} placeholder="Acordar, Sair para a faculdade…" /></label>
        <div className="row wrap">{['Acordar', 'Sair para a faculdade', 'Começar a estudar', 'Tirar a roupa da máquina', 'Tomar remédio'].map((l) => <button key={l} className="chip" onClick={() => p({ label: l })}>{l}</button>)}</div>
        <div className="field"><span>Repetir</span><DaysPicker days={a.days ?? []} onChange={(days) => p({ days })} /></div>
        <label className="field"><span>Som</span>
          <div className="row">
            <select className="select" value={a.sound} onChange={(e) => p({ sound: e.target.value as AlarmSound })}>
              {Object.entries(SOUND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="btn" onClick={() => { unlockAudio(); previewSound(a.sound!, volume) }}><Icon name="play" size={16} /> Ouvir</button>
          </div>
        </label>
        <div className="card stack">
          <div className="row"><div className="spacer"><strong>Volume crescente</strong><div className="tiny muted">Começa baixinho e aumenta.</div></div><Switch label="Volume crescente" on={!!a.ramp} onChange={(v) => p({ ramp: v })} /></div>
          <label className="field"><span>Soneca</span><Seg value={String(a.snoozeMin)} onChange={(v) => p({ snoozeMin: Number(v) })} options={[['5', '5 min'], ['9', '9 min'], ['15', '15 min']]} /></label>
          <label className="field"><span>Para desligar</span><Seg value={a.challenge!} onChange={(v) => p({ challenge: v })} options={[['none', 'Só tocar'], ['math', 'Conta'], ['type', 'Digitar']]} /></label>
          {routines.length > 0 && (
            <label className="field"><span>Ao desligar, começar rotina</span>
              <select className="select" value={a.routineId ?? ''} onChange={(e) => p({ routineId: e.target.value || null })}>
                <option value="">Nenhuma</option>
                {routines.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </label>
          )}
        </div>
        {alarm.id && (
          <div className="row wrap">
            {(a.days?.length ?? 0) > 0 && <button className="btn" onClick={() => { saveAlarm({ ...a, skipDate: a.skipDate === tomorrow ? null : tomorrow }); onClose(); toast(a.skipDate === tomorrow ? 'Amanhã volta a tocar' : 'Pulando só amanhã') }}>{a.skipDate === tomorrow ? 'Não pular amanhã' : 'Pular só amanhã'}</button>}
            <span className="spacer" />
            <button className="btn danger ghost" onClick={() => { deleteAlarm(alarm.id!); onClose(); toast('Alarme apagado', { undo: true }) }}><Icon name="trash" size={18} /> Apagar</button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ---------------- timers ----------------
function timerLeft(t: Timer, now: number) {
  return t.endsAt ? Math.max(0, t.endsAt - now) : t.remainingMs
}

function Timers() {
  const timers = useStore((s) => s.timers).filter((t) => t.kind === 'timer')
  const now = useNow(250)
  const [custom, setCustom] = useState('')
  const [label, setLabel] = useState('')
  const go = (m: number) => { if (m > 0) { unlockAudio(); startTimer(m, label || `Timer ${m} min`); setLabel(''); setCustom('') } }
  return (
    <>
      {timers.map((t) => {
        const left = timerLeft(t, now)
        return (
          <div key={t.id} className="card row" style={{ marginBottom: 10 }}>
            <Ring value={left / t.totalMs} size={56} stroke={6} />
            <div className="spacer"><div className="num" style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-.03em' }}>{formatClock(left)}</div><div className="tiny muted">{t.label}</div></div>
            <button className="icon-btn" aria-label="+1 minuto" onClick={() => addTimerTime(t.id, 1)}>+1</button>
            <button className="icon-btn" aria-label={t.endsAt ? 'Pausar' : 'Continuar'} onClick={() => (t.endsAt ? pauseTimer(t.id) : resumeTimer(t.id))}><Icon name={t.endsAt ? 'pause' : 'play'} /></button>
            <button className="icon-btn" aria-label="Cancelar" onClick={() => removeTimer(t.id)}><Icon name="x" /></button>
          </div>
        )
      })}
      <div className="card stack">
        <input className="input" placeholder="Para quê? (opcional — ex.: macarrão)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="presets">{[1, 3, 5, 10, 15, 20, 30, 45, 60].map((m) => <button key={m} className="btn" onClick={() => go(m)}>{m < 60 ? `${m} min` : '1 h'}</button>)}</div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); go(Number(custom)) }}>
          <input className="input" inputMode="decimal" placeholder="Minutos" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} />
          <button className="btn primary" disabled={!Number(custom)}>Iniciar</button>
        </form>
      </div>
    </>
  )
}

// ---------------- focus (visual time) ----------------
function Focus() {
  const focus = useStore((s) => s.timers.find((t) => t.kind === 'focus'))
  const tasks = useStore((s) => s.tasks)
  const now = useNow(250)
  const [what, setWhat] = useState('')
  const [custom, setCustom] = useState('')
  const today = toISO(new Date())
  const options = tasks.filter((t) => !t.completedAt && t.due && t.due <= today).slice(0, 6)
  const go = (m: number) => { if (m > 0) { unlockAudio(); startTimer(m, what || 'Foco', 'focus') } }

  if (focus) {
    const left = timerLeft(focus, now)
    const frac = left / focus.totalMs
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="big-timer" role="timer" aria-label={`Faltam ${formatClock(left)}`}>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="96" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
            {Array.from({ length: 60 }, (_, i) => {
              const a = (i / 60) * 2 * Math.PI
              const r1 = i % 5 ? 90 : 86
              return <line key={i} x1={100 + 94 * Math.sin(a)} y1={100 - 94 * Math.cos(a)} x2={100 + r1 * Math.sin(a)} y2={100 - r1 * Math.cos(a)} stroke="var(--ink-3)" strokeWidth={i % 5 ? 1 : 2} />
            })}
            <path d={pie(frac, 82)} fill="var(--accent)" opacity=".92" />
            <circle cx="100" cy="100" r="54" fill="var(--surface)" />
          </svg>
          <div><div className="val num">{formatClock(left)}</div><div className="cap">{focus.label}</div></div>
        </div>
        <p className="small muted">O vermelho some conforme o tempo passa. Olhe para ele, não para os números.</p>
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button className="btn" onClick={() => (focus.endsAt ? pauseTimer(focus.id) : resumeTimer(focus.id))}><Icon name={focus.endsAt ? 'pause' : 'play'} size={18} /> {focus.endsAt ? 'Pausar' : 'Continuar'}</button>
          <button className="btn" onClick={() => addTimerTime(focus.id, 5)}>+5 min</button>
          <button className="btn danger" onClick={() => removeTimer(focus.id)}>Encerrar</button>
        </div>
      </div>
    )
  }
  return (
    <div className="stack">
      <div className="card stack">
        <label className="field"><span>No que você vai focar?</span><input className="input" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Ex.: estudar Java" /></label>
        {options.length > 0 && <div className="row wrap">{options.map((t) => <button key={t.id} className="chip" aria-pressed={what === t.title} onClick={() => setWhat(t.title)}>{t.title}</button>)}</div>}
      </div>
      <div className="presets">
        {[15, 25, 45].map((m) => <button key={m} className="btn primary" style={{ minWidth: 96, minHeight: 64, fontSize: 18 }} onClick={() => go(m)}>{m} min</button>)}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); go(Number(custom)) }}>
        <input className="input" inputMode="numeric" placeholder="Outro tempo (min)" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} />
        <button className="btn" disabled={!Number(custom)}>Iniciar</button>
      </form>
      <p className="tiny muted">Dica: sessões curtas vencem a paralisia. 15 minutos já contam.</p>
    </div>
  )
}

function pie(frac: number, r: number) {
  const f = Math.max(0, Math.min(0.99999, frac))
  if (f <= 0) return ''
  const a = f * 2 * Math.PI
  const x = 100 + r * Math.sin(a), y = 100 - r * Math.cos(a)
  return `M100 100 L100 ${100 - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x} ${y} Z`
}

// ---------------- stopwatch ----------------
function StopwatchView() {
  const sw = useStore((s) => s.stopwatch)
  const now = useNow(50)
  const elapsed = sw.accumulatedMs + (sw.startedAt ? now - sw.startedAt : 0)
  const cs = Math.floor((elapsed % 1000) / 10)
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="num" style={{ fontSize: 'clamp(56px, 17vw, 88px)', fontWeight: 300, letterSpacing: '-.045em', margin: '20px 0' }}>
        {formatClock(elapsed)}<span style={{ fontSize: '0.45em', color: 'var(--ink-3)' }}>.{String(cs).padStart(2, '0')}</span>
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
        <button className="btn" onClick={() => (sw.startedAt ? stopwatchLap() : stopwatchReset())} disabled={!elapsed}>{sw.startedAt ? 'Volta' : 'Zerar'}</button>
        <button className="btn primary" style={{ minWidth: 130 }} onClick={stopwatchToggle}>{sw.startedAt ? 'Pausar' : elapsed ? 'Continuar' : 'Iniciar'}</button>
      </div>
      {sw.laps.length > 0 && (
        <div className="laps card" style={{ marginTop: 18, textAlign: 'left' }}>
          {sw.laps.map((l, i) => <div key={i}><span className="muted">Volta {sw.laps.length - i}</span><span>{formatClock(l)}.{String(Math.floor((l % 1000) / 10)).padStart(2, '0')}</span></div>)}
        </div>
      )}
    </div>
  )
}

// ---------------- bedside ----------------
function Bedside({ onClose }: { onClose: () => void }) {
  const now = useNow(1000)
  const alarms = useStore((s) => s.alarms)
  useEffect(() => {
    let lock: any = null
    const req = () => (navigator as any).wakeLock?.request('screen').then((l: any) => (lock = l)).catch(() => {})
    req()
    const vis = () => { if (document.visibilityState === 'visible') req() }
    document.addEventListener('visibilitychange', vis)
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => { lock?.release?.(); document.removeEventListener('visibilitychange', vis); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}) }
  }, [])
  const next = alarms.map((a) => [a, nextAlarmAt(a, now)] as const).filter(([, t]) => t).sort((x, y) => x[1]! - y[1]!)[0]
  return (
    <div className="bedside" onClick={onClose} role="dialog" aria-label="Modo cabeceira. Toque para sair.">
      <div>
        <div className="t num">{nowHHMM(new Date(now))}</div>
        <div className="s">{next ? `⏰ ${next[0].label} às ${next[0].time} · ${humanizeDelta(next[1]! - now)}` : 'Nenhum alarme ativo'}</div>
        <div className="s" style={{ marginTop: 30, opacity: .6 }}>Tela fica ligada · toque para sair</div>
      </div>
    </div>
  )
}
