import { useRef, useState } from 'react'
import { getState, replaceState, useStore } from '../store/store'
import { updateSettings } from '../store/actions'
import { initialState } from '../store/defaults'
import { askPermission, permission, showSystem } from '../lib/notify'
import { chime, unlockAudio } from '../lib/sound'
import { Icon, Seg, Switch, TimeField, toast } from '../components/ui'
import type { Settings as S } from '../store/types'

export function Settings() {
  const s = useStore((x) => x.settings)
  const tasks = useStore((x) => x.tasks)
  const [perm, setPerm] = useState(permission())
  const file = useRef<HTMLInputElement>(null)
  const u = (p: Partial<S>) => updateSettings(p)

  // learn how long things really take vs. the estimate
  const ratios = tasks.filter((t) => t.durationMin && t.spentSec && t.spentSec > 120).map((t) => t.spentSec! / 60 / t.durationMin!).sort((a, b) => a - b)
  const learned = ratios.length >= 3 ? Math.round(ratios[Math.floor(ratios.length / 2)] * 10) / 10 : null

  const exportData = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tdah-clock-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text())
      if (!data || !Array.isArray(data.tasks)) throw new Error('formato')
      if (!confirm('Substituir todos os dados atuais pelo backup?')) return
      replaceState(data)
      toast('Backup restaurado')
    } catch { toast('Arquivo inválido') }
  }

  const time = (label: string, key: keyof S, nullable = false) => (
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <span style={{ fontWeight: 650, paddingTop: 10 }}>{label}</span>
      <span className="row">
        {nullable && <Switch label={label} on={!!s[key]} onChange={(v) => u({ [key]: v ? (key === 'morningBrief' ? '07:30' : key === 'eveningReview' ? '21:00' : '23:00') : null } as any)} />}
        {(!nullable || s[key]) && <TimeField label={label} value={(s[key] as string) ?? null} onChange={(v) => v && u({ [key]: v } as any)} />}
      </span>
    </div>
  )

  return (
    <div className="page">
      <div className="topbar"><h1>Ajustes</h1></div>

      <section className="card stack">
        <label className="field"><span>Como posso te chamar?</span><input className="input" value={s.name} onChange={(e) => u({ name: e.target.value })} placeholder="Seu nome" /></label>
        <div className="field"><span>Tema</span><Seg value={s.theme} onChange={(v) => u({ theme: v })} options={[['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']]} /></div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Notificações e som</h2></div>
        <div className="card stack">
          <div className="row">
            <div className="spacer"><strong>Notificações do sistema</strong><div className="tiny muted">{perm === 'granted' ? 'Permitidas ✓' : perm === 'denied' ? 'Bloqueadas — libere nas configurações do navegador.' : perm === 'unsupported' ? 'Não suportadas neste navegador.' : 'Ainda não permitidas.'}</div></div>
            {perm === 'default' && <button className="btn small primary" onClick={async () => { unlockAudio(); setPerm(await askPermission()) }}>Permitir</button>}
          </div>
          <div className="row"><button className="btn small" onClick={() => { unlockAudio(); chime(s.volume, true); void showSystem({ key: 'test-' + Date.now(), title: 'Teste do TDAH Clock', body: 'Se você está vendo isso, os lembretes vão chegar.' }) }}><Icon name="bell" size={16} /> Testar lembrete</button></div>
          <label className="field"><span>Volume dos alarmes · {Math.round(s.volume * 100)}%</span><input type="range" min={0.1} max={1} step={0.05} value={s.volume} onChange={(e) => u({ volume: Number(e.target.value) })} style={{ width: '100%' }} /></label>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Ritmo do dia</h2></div>
        <div className="card stack">
          {time('Briefing da manhã', 'morningBrief', true)}
          {time('Revisão da noite', 'eveningReview', true)}
          {time('Meu dia começa', 'dayStart')}
          {time('Meu dia termina', 'dayEnd')}
          {time('Saio do trabalho/aula', 'workEnd')}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Sem exagero</h2></div>
        <div className="card stack">
          {time('Silêncio a partir de', 'quietStart', true)}
          {s.quietStart && time('Silêncio até', 'quietEnd')}
          <p className="tiny muted" style={{ margin: 0 }}>No silêncio só passam alarmes e coisas marcadas como importantes.</p>
          <label className="row" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 650 }}>Aviso antes de compromissos</span>
            <select className="select" style={{ width: 130 }} value={s.transitionMin} onChange={(e) => u({ transitionMin: Number(e.target.value) })}>{[0, 5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m ? `${m} min` : 'Nenhum'}</option>)}</select></label>
          <label className="row" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 650 }}>Insistir a cada</span>
            <select className="select" style={{ width: 130 }} value={s.nagIntervalMin} onChange={(e) => u({ nagIntervalMin: Number(e.target.value) })}>{[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
          <label className="row" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 650 }}>No máximo</span>
            <select className="select" style={{ width: 130 }} value={s.nagMax} onChange={(e) => u({ nagMax: Number(e.target.value) })}>{[1, 2, 3, 5, 8].map((m) => <option key={m} value={m}>{m}×</option>)}</select></label>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Estimativas realistas</h2></div>
        <div className="card stack">
          <label className="field"><span>Folga nas estimativas · {s.estimateMultiplier}×</span><input type="range" min={1} max={2.5} step={0.1} value={s.estimateMultiplier} onChange={(e) => u({ estimateMultiplier: Number(e.target.value) })} style={{ width: '100%' }} /></label>
          {learned ? (
            <div className="row small"><span className="spacer">Pelo seu histórico, as coisas levam <strong>{learned}×</strong> o que você estima.</span><button className="btn small" onClick={() => u({ estimateMultiplier: Math.max(1, Math.min(2.5, learned)) })}>Usar</button></div>
          ) : <p className="tiny muted" style={{ margin: 0 }}>Use “Começar” nas tarefas com duração estimada e eu aprendo quanto tempo elas realmente levam.</p>}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Seus dados</h2></div>
        <div className="card stack">
          <p className="small muted" style={{ margin: 0 }}>Tudo fica só neste aparelho. Nada é enviado para servidores. Faça backup de vez em quando.</p>
          <div className="row wrap">
            <button className="btn small" onClick={exportData}><Icon name="download" size={16} /> Exportar backup</button>
            <button className="btn small" onClick={() => file.current?.click()}><Icon name="upload" size={16} /> Restaurar</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
            <span className="spacer" />
            <button className="btn small danger ghost" onClick={() => { if (confirm('Apagar TODOS os dados deste aparelho? Isso não pode ser desfeito.')) { replaceState(initialState()); toast('Dados apagados') } }}>Apagar tudo</button>
          </div>
        </div>
      </section>

      <p className="tiny muted" style={{ textAlign: 'center', margin: '24px 0 8px' }}>TDAH Clock 1.0 · funciona offline · atalhos: <strong>N</strong> capturar, <strong>/</strong> buscar, <strong>1–5</strong> abas</p>
    </div>
  )
}
