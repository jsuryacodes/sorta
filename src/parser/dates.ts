// Date expressions in English, Hindi and Telugu. All dates are plain 'YYYY-MM-DD' strings.
import { norm, readNumber } from './text'

const words = (s: string) => s.trim().split(/\s+/).map(norm)
const table = (rows: string[]) => {
  const m: Record<string, number> = {}
  rows.forEach((r, i) => words(r).forEach((w) => (m[w] = i)))
  return m
}

const MONTH = table([
  'january jan जनवरी జనవరి',
  'february feb फरवरी ఫిబ్రవరి',
  'march mar मार्च మార్చి మార్చ్',
  'april apr अप्रैल ఏప్రిల్',
  'may मई మే',
  'june jun जून జూన్',
  'july jul जुलाई జూలై',
  'august aug अगस्त ఆగస్టు ఆగస్ట్',
  'september sep sept सितंबर सितम्बर సెప్టెంబర్ సెప్టెంబరు',
  'october oct अक्टूबर अक्तूबर అక్టోబర్ అక్టోబరు',
  'november nov नवंबर नवम्बर నవంబర్ నవంబరు',
  'december dec दिसंबर दिसम्बर డిసెంబర్ డిసెంబరు',
])

const WEEKDAY = table([
  'sunday sun ravivar raviwar itvar itwar रविवार इतवार adivaram aadivaram ఆదివారం',
  'monday mon somvar somwar सोमवार somavaram సోమవారం',
  'tuesday tue tues mangalvar mangalwar मंगलवार mangalavaram మంగళవారం',
  'wednesday wed budhvar budhwar बुधवार budhavaram బుధవారం',
  'thursday thu thur thurs guruvar guruwar गुरुवार बृहस्पतिवार guruvaram గురువారం',
  'friday fri shukravar shukrawar शुक्रवार sukravaram shukravaram శుక్రవారం',
  'saturday sat shanivar shaniwar शनिवार sanivaram shanivaram శనివారం',
])

const REL: Record<string, number> = {}
const rel = (n: number, s: string) => words(s).forEach((w) => (REL[w] = n))
rel(0, 'today aaj आज ivala ఇవాళ eeroju ఈరోజు')
rel(1, 'tomorrow tmrw kal कल repu రేపు')
rel(2, 'parso parson परसों ellundi ఎల్లుండి overmorrow')

const DAY_WORD = new Set(words('day days din दिन roju rojulu rojullo రోజు రోజులు రోజుల్లో'))
const WEEK_WORD = new Set(words('week weeks hafta hafte हफ्ता हफ्ते saptah vaaram varam vaaralu వారం వారాలు'))
const MONTH_WORD = new Set(words('month mahina mahine महीना महीने nela నెల'))
const NEXT = new Set(words('next agle agla agli अगले अगला अगली vachche vache వచ్చే coming this is'))
const DATE_WORD = new Set(words('tarikh tareekh तारीख tedi tedhi తేదీ తేది'))

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const at = (iso: string) => new Date(iso + 'T00:00:00Z')
export const addDays = (iso: string, n: number) => {
  const d = at(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return fmt(d)
}

/** Next upcoming day/month on or after today. */
function upcoming(today: string, day: number, month: number): string | null {
  const y = at(today).getUTCFullYear()
  for (const year of [y, y + 1]) {
    const d = new Date(Date.UTC(year, month, day))
    if (d.getUTCMonth() !== month) return null // 31 Feb
    if (fmt(d) >= today) return fmt(d)
  }
  return null
}

/** Next upcoming day-of-month ("the 16th"), on or after today. */
function upcomingDay(today: string, day: number): string | null {
  const t = at(today)
  for (let k = 0; k < 3; k++) {
    const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + k, day))
    if (d.getUTCDate() === day && fmt(d) >= today) return fmt(d)
  }
  return null
}

export interface DateHit {
  date: string
  start: number
  end: number // exclusive
  weak?: boolean // bare ordinal like "16th" with no month or date word
}

/** Finds the first date expression in the tokens. `ord[i]` marks numbers typed like "16th". */
export function findDate(t: string[], ord: boolean[], today: string): DateHit | null {
  const dayNum = (i: number) => (/^\d{1,2}$/.test(t[i] ?? '') && +t[i] >= 1 && +t[i] <= 31 ? +t[i] : null)
  let fallback: DateHit | null = null
  for (let i = 0; i < t.length; i++) {
    const w = t[i]
    // "day after tomorrow"
    if (w === 'day' && t[i + 1] === 'after' && t[i + 2] === 'tomorrow') return { date: addDays(today, 2), start: i, end: i + 3 }
    if (w in REL) return { date: addDays(today, REL[w]), start: i, end: i + 1 }
    if (w in WEEKDAY && w !== 'sun' && w !== 'sat') {
      // strictly after today: "Monday" said on a Monday means next week
      const diff = (WEEKDAY[w] - at(today).getUTCDay() + 7) % 7 || 7
      const start = NEXT.has(t[i - 1]) ? i - 1 : i
      return { date: addDays(today, diff), start, end: i + 1 }
    }
    if (NEXT.has(w) && w !== 'this' && w !== 'is') {
      if (WEEK_WORD.has(t[i + 1])) return { date: addDays(today, 7), start: i, end: i + 2 }
      if (MONTH_WORD.has(t[i + 1])) {
        const d = at(today)
        d.setUTCMonth(d.getUTCMonth() + 1)
        return { date: fmt(d), start: i, end: i + 2 }
      }
    }
    // "16 [of] November [2027]" / "November 16"
    if (w in MONTH) {
      const month = MONTH[w]
      let start = i
      let end = i + 1
      let day = dayNum(i - 1)
      if (day !== null) start = i - 1
      else if (t[i - 1] === 'of' && dayNum(i - 2) !== null) {
        day = dayNum(i - 2)
        start = i - 2
      } else if (dayNum(i + 1) !== null) {
        day = dayNum(i + 1)
        end = i + 2
      }
      if (day === null) continue // "may" the verb, or a bare month
      if (/^20\d\d$/.test(t[end] ?? '')) {
        const d = new Date(Date.UTC(+t[end], month, day))
        return { date: fmt(d), start, end: end + 1 }
      }
      const date = upcoming(today, day, month)
      if (date) return { date, start, end }
      continue
    }
    // "in 3 days" / "3 din mein" / "2 weeks"
    const n = readNumber(t, i)
    if (n) {
      const unit = t[i + n.len]
      const mult = DAY_WORD.has(unit) ? 1 : WEEK_WORD.has(unit) ? 7 : 0
      if (mult) return { date: addDays(today, Math.round(n.value * mult)), start: i, end: i + n.len + 1 }
    }
    // "16 tarikh" / "the 16th" / "16వ తేదీ" — day of month with no month named
    const day = dayNum(i)
    if (day !== null && !fallback) {
      const hasDateWord = DATE_WORD.has(t[i + 1]) || (t[i + 1] === 'వ' && DATE_WORD.has(t[i + 2]))
      if (hasDateWord || ord[i]) {
        const date = upcomingDay(today, day)
        const end = hasDateWord ? (t[i + 1] === 'వ' ? i + 3 : i + 2) : i + 1
        // keep scanning: "16th November" should win over a bare "16th"
        if (date && !(t[i + 1] in MONTH) && !(t[i + 1] === 'of' && t[i + 2] in MONTH)) fallback = { date, start: i, end, weak: !hasDateWord }
      }
    }
  }
  return fallback
}
