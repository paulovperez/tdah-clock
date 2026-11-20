import type { Routine, Settings, State } from './types'
import { uid } from '../lib/id'

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  theme: 'system',
  morningBrief: '07:30',
  eveningReview: '21:00',
  dayStart: '08:00',
  dayEnd: '22:00',
  workEnd: '18:00',
  quietStart: '23:00',
  quietEnd: '07:00',
  nagIntervalMin: 10,
  nagMax: 3,
  transitionMin: 15,
  estimateMultiplier: 1.5,
  volume: 0.8,
  systemNotifications: true,
  onboarded: false,
}

const r = (name: string, emoji: string, steps: [string, number?][], days: number[], time: string | null): Routine => ({
  id: uid(), name, emoji, days, time,
  steps: steps.map(([text, minutes]) => ({ id: uid(), text, minutes })),
  log: {},
})

export function initialState(): State {
  return {
    version: 1,
    tasks: [],
    shop: [],
    shopHistory: {},
    alarms: [
      { id: uid(), label: 'Acordar', time: '07:00', days: [1, 2, 3, 4, 5], enabled: false, sound: 'suave', ramp: true, snoozeMin: 9, challenge: 'math', routineId: null },
    ],
    routines: [
      r('Rotina da manhã', '☀️', [['Levantar da cama', 1], ['Beber um copo de água', 1], ['Tomar banho', 10], ['Escovar os dentes', 3], ['Me vestir', 5], ['Tomar café da manhã', 15], ['Olhar o plano de hoje', 2]], [], '07:15'),
      r('Rotina da noite', '🌙', [['Separar a roupa de amanhã', 5], ['Colocar o celular para carregar', 1], ['Escovar os dentes', 3], ['Revisar as tarefas de amanhã', 3]], [], '22:00'),
      r('Semanal', '🗓️', [['Fazer compras do mês/semana', 60], ['Limpar o apartamento', 60], ['Lavar roupa', 30], ['Organizar as finanças', 20]], [6], '10:00'),
    ],
    notes: [],
    bills: [],
    leaving: ['Carteira', 'Chaves', 'Celular', 'Carregador', 'Documentos', 'Garrafa de água'].map((text) => ({ id: uid(), text })),
    settings: { ...DEFAULT_SETTINGS },
    timers: [],
    stopwatch: { startedAt: null, accumulatedMs: 0, laps: [] },
    active: null,
    fired: {},
    nags: {},
    inbox: [],
  }
}
