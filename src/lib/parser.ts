/**
 * Natural-language capture parser (pt-BR + English). Pure, deterministic, offline.
 * Extracts: title, date, time, duration, priority, category, recurrence, context, tags,
 * amount, and decides whether the input is a task, shopping item(s) or a memory note.
 */
import type { Category, HHMM, ISODate, Priority, Recurrence, StoreKind, TaskContext } from '../store/types'
import { addDays, hhmmToMin, minToHHMM, nextMonthDay, toISO } from './date'
import { rx } from './rx'
import { classifyItem, PLACE_WORDS, placeToStore } from './shoppingDict'

export interface ParsedItem { name: string; qty?: string; store: StoreKind; aisle: string }

export interface Parsed {
  kind: 'task' | 'shopping' | 'note' | 'bill'
  title: string
  due: ISODate | null
  time: HHMM | null
  durationMin: number | null
  priority: Priority
  category: Category
  tags: string[]
  recurrence: Recurrence | null
  context: TaskContext | null
  someday: boolean
  persistent: boolean
  amount: number | null
  items: ParsedItem[]
  store: StoreKind | null
}

export interface ParseOptions { now?: Date; workEnd?: HHMM }

const DAY = String.raw`(domingo|segunda(?:-feira)?|ter[çc]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[áa]bado|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat|dom|seg|ter|qua|qui|sex|s[áa]b)`

function dayIndex(word: string): number {
  const w = word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const map: [string, number][] = [
    ['dom', 0], ['sun', 0], ['seg', 1], ['mon', 1], ['ter', 2], ['tue', 2], ['qua', 3], ['wed', 3],
    ['qui', 4], ['thu', 4], ['sex', 5], ['fri', 5], ['sab', 6], ['sat', 6],
  ]
  for (const [p, i] of map) if (w.startsWith(p)) return i
  return -1
}

const MONTHS: Record<string, number> = {
  jan: 1, janeiro: 1, january: 1, fev: 2, fevereiro: 2, feb: 2, february: 2, mar: 3, marco: 3, março: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4, mai: 5, maio: 5, may: 5, jun: 6, junho: 6, june: 6, jul: 7, julho: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8, set: 9, setembro: 9, sep: 9, sept: 9, september: 9, out: 10, outubro: 10,
  oct: 10, october: 10, nov: 11, novembro: 11, november: 11, dez: 12, dezembro: 12, dec: 12, december: 12,
}
const MONTH_RE = String.raw`(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|january|february|march|april|may|june|july|august|september|october|november|december|jan|fev|feb|mar|abr|apr|mai|jun|jul|ago|aug|set|sept|sep|out|oct|nov|dez|dec)`

const SHOP_VERB = rx(String.raw`^(?:buy|get|purchase|pick up|comprar|compra|compre|repor)\s+`)
const NOTE_PREFIX = rx(String.raw`^(?:nota|note|anotar|anota[çc][ãa]o|ideia|idea|lembrar que|remember that|info)\s*[:\-–]?\s+`)
const NOTE_HINT = rx(String.raw`^(?:guardei|deixei|coloquei|a senha|senha d[oa]|o c[óo]digo|i put|i left|i stored|i keep|the password|wifi|wi-fi)\b`)

const CATEGORY_RULES: [RegExp, Category][] = [
  [rx(String.raw`\b(pagar|paguei|pay|bill|conta de|boleto|fatura|cart[ãa]o de cr[ée]dito|credit card|aluguel|rent|internet|energia|luz|electricity|[áa]gua e esgoto|imposto|tax(es)?|ipva|iptu|parcela|installment|seguro|insurance|assinatura|subscription|pix|transferir|transfer)\b`), 'financial'],
  [rx(String.raw`\b(mec[âa]nico|mechanic|oficina|m[ée]dic[oa]|doctor|dentista|dentist|consulta|appointment|exame|cabeleireir[oa]|barbeiro|haircut|psic[óo]log[oa]|therapist|terapia|vet\b|veterin[áa]rio|cart[óo]rio|entrevista|interview)\b`), 'appointment'],
  [rx(String.raw`\b(rem[ée]dio|medica[çc][ãa]o|medicamento|medication|medicine|pills?|comprimido|vitamina|academia|gym|treino|workout|correr|run(ning)?|caminhar|walk|beber [áa]gua|drink water|dormir|sleep|meditar|meditate)\b`), 'health'],
  [rx(String.raw`\b(estudar|study|studying|revisar|review|prova|exam|test|homework|li[çc][ãa]o|tarefa de casa|trabalho da faculdade|faculdade|university|universidade|aula|class|curso|course|ler o cap[íi]tulo|read chapter|apostila|tcc|fatec|java|python|banco de dados|databases?)\b`), 'study'],
  [rx(String.raw`\b(reuni[ãa]o|meeting|e-?mail|relat[óo]rio|report|cliente|client|chefe|boss|deploy|planilha|spreadsheet|apresenta[çc][ãa]o|presentation|trabalho|work|projeto|project|jira|standup)\b`), 'work'],
  [rx(String.raw`\b(limpar|clean|arrumar|tidy|organizar|organi[sz]e|lavar|laundry|wash|roupas?|clothes|lou[çc]a|dishes|lixo|trash|varrer|sweep|cozinhar|cook|m[áa]quina de lavar|washing machine|quarto|bedroom|casa|apartment|apartamento|regar|water the plants|plantas)\b`), 'home'],
  [rx(String.raw`\b(ligar|call|m[ãa]e|mother|mom|pai|father|dad|amig[oa]s?|friends?|anivers[áa]rio|birthday|mensagem|message|responder|reply|whatsapp|presente|gift|namorad[oa]|av[óo])\b`), 'personal'],
]

const PRIORITY_RE = rx(String.raw`(\s!{1,3}\s*$|^\s*!{1,3}\s*|\b(urgente|urgent|important[e]?|asap|prioridade|priority|n[ãa]o pode esquecer|cr[íi]tico|critical)\b)`)
const LOW_PRIORITY_RE = rx(String.raw`\b(sem pressa|no rush|quando der|whenever|se der tempo|if i have time)\b`)

export function parse(input: string, opts: ParseOptions = {}): Parsed {
  const now = opts.now ?? new Date()
  const workEnd = opts.workEnd ?? '18:00'
  const today = toISO(now)
  let s = ' ' + input.trim().replace(/\s+/g, ' ') + ' '

  const out: Parsed = {
    kind: 'task', title: '', due: null, time: null, durationMin: null, priority: 2, category: 'other',
    tags: [], recurrence: null, context: null, someday: false, persistent: false, amount: null, items: [], store: null,
  }

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(re)
    if (!m || m.index === undefined) return false
    if (fn(m) === false) return false
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)
    return true
  }

  // ---- memory note
  const trimmed = s.trim()
  if (NOTE_PREFIX.test(trimmed) || NOTE_HINT.test(trimmed)) {
    out.kind = 'note'
    out.title = trimmed.replace(NOTE_PREFIX, '').trim()
    collectTags()
    return out
  }

  // ---- filler prefixes ("remind me to", "me lembra de", "preciso")
  take(rx(String.raw`^\s*(?:and |e |also |também |then |depois )?(?:hey,? )?(?:please )?(?:remind me (?:to )?|remember to |don'?t forget (?:to )?|dont forget (?:to )?|i need to |i have to |i must |need to |have to |me lembr[ae] de |me lembr[ae] |lembre-me de |lembrar de |lembra de |n[ãa]o esquecer de |n[ãa]o esque[çc]a de |preciso |eu preciso |tenho que |tem que )`), () => {})

  // ---- tags
  collectTags()

  // ---- amount (R$ 120,50 / $40)
  take(rx(String.raw`(?:R\$|\$|US\$)\s?(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`), (m) => {
    let v = m[1].replace(/\s/g, '')
    if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.')
    else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '')
    out.amount = Number(v)
  })

  // ---- priority
  if (take(PRIORITY_RE, () => {})) out.priority = 1
  else if (take(LOW_PRIORITY_RE, () => {})) out.priority = 3

  // ---- someday
  take(rx(String.raw`\b(someday|some day|eventually|one day|algum dia|um dia desses|qualquer dia|futuramente)\b`), () => { out.someday = true })

  // ---- recurrence
  parseRecurrence()

  // ---- relative time ("in 20 minutes", "daqui a 2 horas")
  take(rx(String.raw`\b(?:in|em|daqui a|daqui|dentro de)\s+(\d+|uma|um|meia|an|a|half an?)\s*(minutos?|minutes?|mins?|min|horas?|hours?|hrs?|h)\b`), (m) => {
    const raw = m[1].toLowerCase()
    let n = /^\d+$/.test(raw) ? Number(raw) : raw.startsWith('mei') || raw.startsWith('half') ? 0.5 : 1
    const unit = m[2].toLowerCase()
    const mins = unit.startsWith('h') ? n * 60 : n
    const t = new Date(now.getTime() + mins * 60000)
    out.due = toISO(t)
    out.time = minToHHMM(t.getHours() * 60 + t.getMinutes())
  })

  // ---- duration ("for 30 minutes", "por 1h30", "40 min")
  take(rx(String.raw`\b(?:for|por|durante)\s+(?:(\d+)\s*h(?:oras?|ours?|rs?)?\s*(\d{1,2})?\s*(?:min(?:utos?|utes?)?)?|(\d+)\s*(minutos?|minutes?|mins?|min|m)|(uma|um|an|a|half an?|meia)\s*(hora|hour))\b`), (m) => {
    if (m[1]) out.durationMin = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0)
    else if (m[3]) out.durationMin = Number(m[3])
    else if (m[5]) out.durationMin = /mei|half/i.test(m[5]) ? 30 : 60
  })
  if (out.durationMin == null) {
    take(rx(String.raw`\b(\d+)\s*(minutos|minutes|mins|min)\b`), (m) => { out.durationMin = Number(m[1]) })
  }
  if (out.durationMin == null) {
    // "estudar 1h" → duration if small; "19h" stays a time
    take(rx(String.raw`(?<!(?:at|às|as|@)\s*)\b([1-4])\s*h(?:oras?|ours?)?\b(?!\s*\d)`), (m) => {
      if (/\b(?:at|às|as)\s*$/iu.test(s.slice(0, m.index))) return false
      out.durationMin = Number(m[1]) * 60
    })
  }

  // ---- time of day
  parseTime()

  // ---- date
  parseDate()

  // ---- context: leaving home
  take(rx(String.raw`\b(?:when (?:i )?(?:leave|leaving)(?: the)?(?: home| house)?|before (?:i )?(?:leave|leaving)(?: home| the house)?|on my way out|quando (?:eu )?(?:sair|for sair)(?: de casa)?|ao sair(?: de casa)?|antes de sair(?: de casa)?|na sa[íi]da)\b`), () => {
    out.context = { type: 'leaving' }
  })

  // ---- context: at a place
  take(rx(String.raw`\b(?:when (?:i'?m|i am) (?:at|in)|when i (?:go|get) to|next time (?:i'?m |i am )?(?:i )?(?:go to|at|in)|the next time i go to|quando (?:eu )?(?:for|estiver|passar|chegar|ir)(?: (?:no|na|ao|à|a|em|pela|pelo|até o|até a))?|na pr[óo]xima vez que (?:eu )?(?:for|passar|estiver|ir)(?: (?:no|na|ao|à|a|em|pela|pelo))?|da pr[óo]xima vez que (?:eu )?(?:for|passar|ir)(?: (?:no|na|ao|à|a|em))?)\s+(?:the\s+|o\s+|a\s+)?([\p{L}'-]+(?:\s[\p{L}'-]+){0,2})`), (m) => {
    const phrase = m[1]
    let place = phrase.split(' ')[0]
    for (const [re, , label] of PLACE_WORDS) { if (re.test(phrase)) { place = label; break } }
    out.context = { type: 'place', place }
    out.store = placeToStore(place)
    // give back words that are not part of the place
    const used = phrase.match(PLACE_WORDS.find(([re]) => re.test(phrase))?.[0] ?? /^\S+/u)
    if (used && used.index !== undefined) {
      const rest = (phrase.slice(0, used.index) + ' ' + phrase.slice(used.index + used[0].length)).trim()
      if (rest) { s = s.replace(m[0], ' ' + rest + ' '); return false }
    }
  })

  // ---- "go to the supermarket" (a trip, not a context)
  const goTo = s.match(rx(String.raw`\b(?:go to|ir a[oà]?|ir na|ir no|passar n[oa])\b`))
  if (goTo && !out.store) {
    for (const [re, store] of PLACE_WORDS) if (re.test(s)) { out.store = store; out.category = 'shopping'; break }
  }

  // ---- shopping?
  const body = s.replace(/\s+/g, ' ').trim()
  if (SHOP_VERB.test(body)) {
    const rest = body.replace(SHOP_VERB, '')
    const items = splitItems(cleanTitle(rest))
    if (items.length) {
      out.kind = 'shopping'
      out.category = 'shopping'
      out.items = items.map((it) => {
        const c = classifyItem(it.name)
        return { ...it, aisle: c.aisle, store: out.store ?? c.store }
      })
      out.title = cleanTitle(body)
      if (!out.store) out.store = out.items[0].store
      return finish()
    }
  }

  out.title = cleanTitle(body)

  // ---- category
  if (out.category === 'other') {
    for (const [re, cat] of CATEGORY_RULES) if (re.test(out.title)) { out.category = cat; break }
  }
  if (out.context?.type === 'place' && out.category === 'other') out.category = out.store ? 'shopping' : 'personal'

  // medication & appointments deserve persistence
  if (/\b(rem[ée]dio|medica|medication|medicine|pills?|comprimido)/iu.test(out.title)) { out.category = 'health'; out.persistent = true }
  if (out.category === 'appointment' && out.time) out.persistent = true
  if (out.priority === 1) out.persistent = true

  // monthly payments become bills
  if (out.category === 'financial' && out.recurrence?.freq === 'monthly') out.kind = 'bill'

  return finish()

  // ---------- helpers ----------
  function finish(): Parsed {
    if (out.time && !out.due && !out.recurrence) {
      out.due = hhmmToMin(out.time) > now.getHours() * 60 + now.getMinutes() ? today : toISO(addDays(now, 1))
    }
    if (out.recurrence && !out.due) {
      out.due = firstFor(out.recurrence, today, out.time, now)
    }
    if (out.someday) { out.due = null; out.time = null }
    return out
  }

  function collectTags() {
    s = s.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_, sp, t) => { out.tags.push(t.toLowerCase()); return sp })
    if (out.kind === 'note') out.title = out.title.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, '$1').trim()
  }

  function parseRecurrence() {
    // monthly on day N: "todo dia 25", "every 25th", "on the 5th of every month"
    if (take(rx(String.raw`\b(?:todo(?:s os)? (?:dia|mês(?: no dia)?|mes(?: no dia)?)\s+(\d{1,2})|every (?:month on the )?(\d{1,2})(?:st|nd|rd|th)(?: of (?:the|each|every) month)?|(?:on )?the (\d{1,2})(?:st|nd|rd|th)? of (?:each|every) month|dia (\d{1,2}) de todo m[êe]s)\b`), (m) => {
      const day = Number(m[1] ?? m[2] ?? m[3] ?? m[4])
      if (day < 1 || day > 31) return false
      out.recurrence = { freq: 'monthly', day }
    })) return
    if (take(rx(String.raw`\b(?:a cada|every)\s+(\d+)\s+(?:dias|days)\b`), (m) => { out.recurrence = { freq: 'daily', interval: Number(m[1]) } })) return
    if (take(rx(String.raw`\b(?:dias [úu]teis|every weekday|weekdays|de segunda a sexta|on weekdays|seg a sex)\b`), () => { out.recurrence = { freq: 'weekly', days: [1, 2, 3, 4, 5] } })) return
    if (take(rx(String.raw`\b(?:todo fim de semana|todos os fins de semana|every weekend|on weekends|nos fins de semana)\b`), () => { out.recurrence = { freq: 'weekly', days: [0, 6] } })) return
    const listRe = rx(String.raw`\b(?:every|each|toda|todo|todas as|todos os|às|nas|aos)\s+${DAY}s?((?:\s*(?:,|and|e)\s*${DAY}s?)*)\b`)
    if (take(listRe, (m) => {
      const words = (m[0].match(rx(DAY, 'g')) ?? [])
      const days = [...new Set(words.map(dayIndex).filter((d) => d >= 0))]
      // "às 8" etc. must not be treated as a weekday list
      if (!days.length) return false
      if (/^(?:às|nas|aos)/iu.test(m[0].trim()) && !/s\b/iu.test(m[0])) return false
      out.recurrence = { freq: 'weekly', days }
    })) return
    if (take(rx(String.raw`\b(?:every ?day|daily|todo(?:s os)? dias?|diariamente|every morning|toda manh[ãa]|todas as manh[ãa]s|every night|every evening|toda noite|todas as noites)\b`), (m) => {
      out.recurrence = { freq: 'daily' }
      if (/morning|manh/iu.test(m[0])) out.time = out.time ?? '08:00'
      if (/night|evening|noite/iu.test(m[0])) out.time = out.time ?? '21:00'
    })) return
    if (take(rx(String.raw`\b(?:every week|weekly|toda semana|todas as semanas|semanalmente)\b`), () => { out.recurrence = { freq: 'weekly', days: [] } })) return
    if (take(rx(String.raw`\b(?:every month|monthly|todo m[êe]s|todos os meses|mensalmente|mensal)\b`), () => { out.recurrence = { freq: 'monthly', day: 0 } })) return
    take(rx(String.raw`\b(?:every year|yearly|annually|todo ano|todos os anos|anualmente)\b`), () => { out.recurrence = { freq: 'yearly', month: 0, day: 0 } })
  }

  function setTime(h: number, m: number, mer?: string, ctx?: string) {
    mer = mer?.toLowerCase()
    if (mer === 'pm' && h < 12) h += 12
    if (mer === 'am' && h === 12) h = 0
    if (ctx && /tarde|noite|afternoon|evening|night|pm/iu.test(ctx) && h < 12) h += 12
    if (!mer && !ctx && h >= 1 && h <= 6) h += 12 // "at 5" means 17:00 for most people
    if (h > 23 || m > 59) return false
    out.time = minToHHMM(h * 60 + m)
    return true
  }

  function parseTime() {
    const PERIOD = String.raw`(?:\s*(da manh[ãa]|da tarde|da noite|de manh[ãa]|in the morning|in the afternoon|in the evening|at night))?`
    if (take(rx(String.raw`\b(?:at |às |as |ao |a )?(noon|midday|meio[- ]dia|midnight|meia[- ]noite)\b`), (m) => {
      out.time = /mid?night|meia/iu.test(m[1]) ? '00:00' : '12:00'
    })) return
    if (take(rx(String.raw`(?:\b(?:at|às|as|@|a partir das|até as|até às|by)\s*)?\b(\d{1,2})(?::|h|\.)(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?\b` + PERIOD), (m) => setTime(Number(m[1]), Number(m[2]), m[3]?.replace(/\./g, ''), m[4]))) return
    if (take(rx(String.raw`\b(?:at|às|as|@|a partir das|até as|até às|by)\s*(\d{1,2})\s*(am|pm|h|horas|hrs|o'?clock)?\b` + PERIOD), (m) => setTime(Number(m[1]), 0, /am|pm/i.test(m[2] ?? '') ? m[2] : undefined, m[3] ?? (m[2] && /h|horas|hrs|clock/i.test(m[2]) ? 'h' : undefined)))) return
    if (take(rx(String.raw`\b(\d{1,2})\s*(am|pm)\b` + PERIOD), (m) => setTime(Number(m[1]), 0, m[2], m[3]))) return
    take(rx(String.raw`\b(\d{1,2})\s*h\b(?!\s*\d)` + PERIOD), (m) => {
      const h = Number(m[1])
      if (h < 5 && !m[2]) return false
      return setTime(h, 0, undefined, m[2] ?? 'h')
    })
  }

  function parseDate() {
    const setDue = (d: Date) => { out.due = toISO(d) }
    // parts of day — also imply today if no date
    const partOfDay = (re: string, time: HHMM) =>
      take(rx(re), () => { if (!out.time) out.time = time })
    if (take(rx(String.raw`\b(?:depois de amanh[ãa]|the day after tomorrow|day after tomorrow)\b`), () => setDue(addDays(now, 2)))) { /* */ }
    else if (take(rx(String.raw`\b(?:tomorrow|amanh[ãa])(?:\s+(?:morning|night|evening|afternoon|de manh[ãa]|cedo|à tarde|a tarde|de tarde|à noite|a noite|de noite))?\b`), (m) => {
      setDue(addDays(now, 1))
      if (/morning|manh|cedo/iu.test(m[0]) && !out.time) out.time = '08:00'
      if (/afternoon|tarde/iu.test(m[0]) && !out.time) out.time = '15:00'
      if (/night|evening|noite/iu.test(m[0]) && !out.time) out.time = '20:00'
    })) { /* */ }
    else if (take(rx(String.raw`\b(?:tonight|hoje à noite|hoje a noite|hoje de noite|essa noite|esta noite|this evening)\b`), () => { setDue(now); if (!out.time) out.time = '20:00' })) { /* */ }
    else if (take(rx(String.raw`\b(?:this morning|hoje de manh[ãa]|hoje cedo)\b`), () => { setDue(now); if (!out.time) out.time = '09:00' })) { /* */ }
    else if (take(rx(String.raw`\b(?:this afternoon|hoje à tarde|hoje a tarde|hoje de tarde)\b`), () => { setDue(now); if (!out.time) out.time = '15:00' })) { /* */ }
    else if (take(rx(String.raw`\b(?:today|hoje)\b`), () => setDue(now))) { /* */ }

    if (take(rx(String.raw`\b(?:after work|after my shift|depois do trabalho|ap[óo]s o trabalho|depois do expediente|saindo do trabalho)\b`), () => {
      if (!out.time) out.time = minToHHMM(hhmmToMin(workEnd) + 15)
      if (!out.due) setDue(now)
    })) { /* */ }

    if (!out.due) {
      take(rx(String.raw`\b(?:this weekend|on the weekend|weekend|neste fim de semana|nesse fim de semana|este fim de semana|esse fim de semana|no fim de semana|fim de semana|final de semana)\b`), () => {
        const dow = now.getDay()
        setDue(dow === 6 || dow === 0 ? now : addDays(now, 6 - dow))
      })
    }
    if (!out.due) {
      take(rx(String.raw`\b(?:next week|semana que vem|pr[óo]xima semana|na outra semana)\b`), () => {
        const dow = now.getDay()
        setDue(addDays(now, ((8 - dow) % 7) || 7))
      })
    }
    if (!out.due) {
      take(rx(String.raw`\b(?:this week|esta semana|essa semana|nesta semana|nessa semana)\b`), () => {
        const dow = now.getDay()
        setDue(dow >= 5 || dow === 0 ? now : addDays(now, 5 - dow))
      })
    }
    if (!out.due) {
      take(rx(String.raw`\b(?:next month|m[êe]s que vem|pr[óo]ximo m[êe]s)\b`), () => setDue(new Date(now.getFullYear(), now.getMonth() + 1, 1)))
    }
    if (!out.due) {
      take(rx(String.raw`\b(?:in|em|daqui a|dentro de)\s+(\d+|uma|um|two|duas|dois|a)\s+(days?|dias?|weeks?|semanas?|months?|m[êe]s(?:es)?)\b`), (m) => {
        const n = /^\d+$/.test(m[1]) ? Number(m[1]) : /two|duas|dois/i.test(m[1]) ? 2 : 1
        const u = m[2].toLowerCase()
        if (u.startsWith('d')) setDue(addDays(now, n))
        else if (u.startsWith('w') || u.startsWith('s')) setDue(addDays(now, n * 7))
        else setDue(new Date(now.getFullYear(), now.getMonth() + n, now.getDate()))
      })
    }
    if (!out.due) {
      // 25/12, 25/12/2026, 25-12
      take(rx(String.raw`\b(?:on |em |no dia |dia |até |by )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b`), (m) => {
        let d = Number(m[1]), mo = Number(m[2])
        if (mo > 12 && d <= 12) [d, mo] = [mo, d]
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
        let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : now.getFullYear()
        let date = new Date(y, mo - 1, d)
        if (!m[3] && toISO(date) < today) date = new Date(y + 1, mo - 1, d)
        setDue(date)
      })
    }
    if (!out.due) {
      // "25 de dezembro", "dec 25", "December 25th"
      take(rx(String.raw`\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+(?:de\s+)?${MONTH_RE}|${MONTH_RE}\s+(\d{1,2})(?:st|nd|rd|th)?)\b`), (m) => {
        const d = Number(m[1] ?? m[4])
        const mname = (m[2] ?? m[3]).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const mo = MONTHS[mname] ?? MONTHS[(m[2] ?? m[3]).toLowerCase()]
        if (!mo || d < 1 || d > 31) return false
        let date = new Date(now.getFullYear(), mo - 1, d)
        if (toISO(date) < today) date = new Date(now.getFullYear() + 1, mo - 1, d)
        setDue(date)
      })
    }
    if (!out.due) {
      // "on the 25th", "dia 25", "até o dia 10"
      take(rx(String.raw`\b(?:on the|by the|until the|before the|no dia|até o dia|até dia|dia|the)\s+(\d{1,2})(?:st|nd|rd|th)?\b`), (m) => {
        const day = Number(m[1])
        if (day < 1 || day > 31) return false
        setDue(nextMonthDay(now, day))
      })
    }
    if (!out.due && !out.recurrence) {
      // weekday: "on Friday", "next monday", "sexta", "na sexta-feira"
      take(rx(String.raw`\b(?:(next|this|on|na|no|nesta|neste|nessa|nesse|pr[óo]xima|pr[óo]ximo|essa|esse|até|by)\s+)?${DAY}(?:\s+(que vem))?\b`), (m) => {
        const idx = dayIndex(m[2])
        if (idx < 0) return false
        // bare short forms like "sex"/"set"/"sat" are risky without a preposition
        if (!m[1] && m[2].length <= 3) return false
        let diff = (idx - now.getDay() + 7) % 7
        if ((m[1] && /next|pr[óo]xim/iu.test(m[1])) || m[3]) diff = diff === 0 ? 7 : diff
        setDue(addDays(now, diff))
      })
    }
    // "morning/afternoon/night" alone
    partOfDay(String.raw`\b(?:de manh[ãa]|pela manh[ãa]|in the morning)\b`, '09:00')
    partOfDay(String.raw`\b(?:à tarde|de tarde|in the afternoon)\b`, '15:00')
    partOfDay(String.raw`\b(?:à noite|de noite|in the evening|at night)\b`, '20:00')
  }

  function splitItems(text: string): { name: string; qty?: string }[] {
    return text
      .split(rx(String.raw`\s*(?:,|;|\+|\band\b|\be\b)\s*`))
      .map((x) => x.trim())
      .filter(Boolean)
      .map((raw) => {
        let name = raw, qty: string | undefined
        const lead = raw.match(rx(String.raw`^(\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|un|unidades?|pcts?|pacotes?|latas?|caixas?|d[úu]zias?|packs?|bottles?|garrafas?|rolos?|sacos?)?)\s+(?:de\s+|of\s+)?(.+)$`))
        const trail = raw.match(rx(String.raw`^(.+?)\s*x\s*(\d+)$`))
        if (lead) { qty = lead[1].trim(); name = lead[2] }
        else if (trail) { qty = trail[2]; name = trail[1] }
        name = name.replace(rx(String.raw`^(?:some|more|a|an|the|um|uma|mais)\s+`), '').trim()
        return { name: capitalize(name), qty }
      })
      .filter((x) => x.name.length > 0)
  }
}

function firstFor(r: Recurrence, today: ISODate, time: HHMM | null, now: Date): ISODate {
  const d = new Date(now)
  const passed = time ? hhmmToMin(time) <= now.getHours() * 60 + now.getMinutes() : false
  if (r.freq === 'daily') return passed ? toISO(addDays(d, 1)) : today
  if (r.freq === 'weekly') {
    const days = r.days.length ? r.days : [d.getDay()]
    for (let i = 0; i < 8; i++) {
      const c = addDays(d, i)
      if (days.includes(c.getDay()) && !(i === 0 && passed)) return toISO(c)
    }
  }
  if (r.freq === 'monthly') {
    if (!r.day) (r as any).day = d.getDate()
    return toISO(nextMonthDay(d, r.day))
  }
  if (r.freq === 'yearly') {
    if (!r.month) { (r as any).month = d.getMonth() + 1; (r as any).day = d.getDate() }
    return today
  }
  return today
}

const TRAILING = rx(String.raw`(?:\s+(?:on|at|by|in|the|to|for|until|before|no|na|nos|nas|dia|para|pra|de|do|da|e|and|até|antes|às|as|em|o|a|that|que|when|quando|com|with))+$`)
const LEADING = rx(String.raw`^(?:(?:and|e|then|depois|also|também|to)\s+)+`)

export function cleanTitle(s: string): string {
  let t = s.replace(/\s+/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim()
  t = t.replace(/^[,.;:\-–\s]+|[,;:\-–\s]+$/g, '')
  for (let i = 0; i < 3; i++) t = t.replace(TRAILING, '').replace(LEADING, '').trim()
  t = t.replace(/[,;:\-–\s]+$/g, '')
  return capitalize(t)
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// ---------------- Brain dump ----------------

const VERBS = String.raw`(?:buy|comprar|compra|study|estudar|call|ligar|pay|pagar|clean|limpar|take|levar|tomar|go|ir|send|enviar|mandar|reply|responder|fix|consertar|schedule|marcar|agendar|book|remember|lembrar|write|escrever|read|ler|cook|cozinhar|wash|lavar|organize|organizar|arrumar|prepare|preparar|check|verificar|ver|cancel|cancelar|renew|renovar|return|devolver|pick up|buscar|pegar|fazer|do|make|finish|terminar|start|começar|email|talk|falar|visit|visitar|need|preciso|tenho|get|trocar|change|ask|perguntar|print|imprimir|bring|trazer|water|regar|walk|passear|deixar|drop off|entregar|deliver|sign|assinar|update|atualizar|tirar|colocar|guardar)`

/** Split a free-form brain dump into individual task phrases. */
export function splitDump(text: string): string[] {
  const parts = text
    .split(/\n+|;\s*|\.\s+|•|(?:^|\s)-\s+|,\s*/u)
    .flatMap((p) => p.split(rx(String.raw`\s+(?:and|e|and then|e depois|then|depois|also|também)\s+(?=(?:also |também |then |to |de )?${VERBS}\b)`)))
    .map((p) => p.trim().replace(/[.!]+$/, ''))
    .filter((p) => p.length > 1)

  // carry the verb forward: "buy shampoo, toothpaste and coffee"
  const out: string[] = []
  let lastShopVerb: string | null = null
  const startsWithVerb = rx(String.raw`^(?:(?:i need to|i have to|need to|have to|preciso|tenho que|remember to|lembrar de|não esquecer de|nao esquecer de|e|and|also|também|to)\s+)*${VERBS}\b`)
  for (const p of parts) {
    const verbMatch = p.match(SHOP_VERB)
    if (verbMatch) { lastShopVerb = verbMatch[0].trim(); out.push(p); continue }
    if (!startsWithVerb.test(p) && lastShopVerb && p.split(' ').length <= 4) { out.push(`${lastShopVerb} ${p.replace(rx(String.raw`^(?:and|e)\s+`), '')}`); continue }
    lastShopVerb = null
    out.push(p)
  }
  return out
}
