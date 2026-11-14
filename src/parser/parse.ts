// Rule-based message parser: detects intent and extracts details. Pure, no I/O.
// English, Hindi (Devanagari + romanised), Telugu (script + romanised) and mixes.
import type { Dir, Lang, Product } from '../types'
import { findDate } from './dates'
import { allowedEdits, isNumberWord, levenshtein, norm, numLang, readNumber, skeleton, tokenize, variants } from './text'

export interface ParseCtx {
  products: Product[]
  persons: string[] // names seen in debts, for matching
  today: string // YYYY-MM-DD
  fallbackLang?: Lang // used when the message itself gives no language signal
}

export type Parse = { lang: Lang } & (
  | {
      intent: 'sale' | 'purchase'
      product?: Product
      candidates?: Product[] // several products matched: ask which
      productText?: string // unmatched product words, as typed
      qty?: number
      unit?: string
      unitPrice?: number
      total?: number
      mrp?: number
      expiry?: string
      shelf?: string
    }
  | { intent: 'stock_query'; product?: Product; candidates?: Product[]; productText?: string }
  | { intent: 'trade_unclear'; product: Product } // product + number but no verb
  | { intent: 'debt_add'; person?: string; amount?: number; direction?: Dir; due?: string }
  | { intent: 'debt_settle'; person?: string; amount?: number; direction?: Dir }
  | { intent: 'cash_set'; amount: number }
  | { intent: 'cash_query' | 'undo' | 'yes' | 'no' | 'unknown' }
)

// ---- lexicons ----------------------------------------------------------------

const STOP = new Set<string>()
const LANGW: Record<string, Lang | 'x'> = {}
type Lex = string[][]

/** Comma-separated words/phrases per language. Registers every word as a stopword and a language vote. */
function lex(en: string, hi = '', te = ''): Lex {
  const out: Lex = []
  ;([['en', en], ['hi', hi], ['te', te]] as const).forEach(([lang, s]) =>
    s.split(',').map((x) => norm(x.trim())).filter(Boolean).forEach((p) => {
      const ws = p.split(/\s+/)
      out.push(ws)
      ws.forEach((w) => {
        STOP.add(w)
        LANGW[w] = LANGW[w] && LANGW[w] !== lang ? 'x' : lang
      })
    }),
  )
  return out
}

/** Index of the earliest phrase from the lexicon, or -1. */
function find(t: string[], l: Lex): number {
  let best = -1
  for (const ws of l)
    for (let i = 0; i + ws.length <= t.length && (best < 0 || i < best); i++)
      if (ws.every((w, k) => t[i + k] === w)) best = i
  return best
}

const UNDO = lex(
  'undo, mistake, revert, cancel that, cancel last, wrong entry',
  'galti, galati, galat, wapas lo, गलती, गलत, रद्द, अनडू',
  'tappu, porapatu, తప్పు, పొరపాటు, రద్దు, అన్డూ',
)
const YES = lex('yes, y, ok, okay, yeah, yep, sure, correct', 'haan, han, ji, theek, thik, sahi, हां, जी, ठीक, सही', 'avunu, sare, ఔను, అవును, సరే')
const NO = lex('no, n, nope, cancel, dont', 'nahi, nahin, mat, नहीं, मत', 'kadu, vaddu, కాదు, వద్దు')

const SALE = lex(
  'sold, sell, sale, selling',
  'becha, bech, bechi, beche, bechdiya, bika, biki, bik, बेचा, बेच, बेची, बेचे, बिका, बिकी, बिक्री',
  'ammanu, ammaanu, ammesanu, ammamu, ammindi, ammakam, ammina, అమ్మాను, అమ్మేశాను, అమ్మేసాను, అమ్మాము, అమ్మింది, అమ్మకం, అమ్మిన',
)
const BUY = lex(
  'got, bought, buy, purchased, purchase, restocked, stocked, added, add, received, arrived, came',
  'kharida, kharidi, kharide, kharid, laya, laaya, aaya, aya, aaye, mangaya, mangwaya, liya, liye, खरीदा, खरीदी, खरीदे, लाया, आया, आए, आये, आई, मंगाया, मंगवाया, लिया, लिए',
  'konnanu, konna, konnamu, techanu, tecchanu, vachindi, vacchindi, vachayi, vacchayi, కొన్నాను, కొన్నాము, తెచ్చాను, వచ్చింది, వచ్చాయి',
)
const QWORD = lex('how much, how many, what, whats', 'kitna, kitne, kitni, kya, कितना, कितने, कितनी, क्या', 'enta, entha, enni, ఎంత, ఎన్ని')
const LEFT = lex('left, remaining, stock, available', 'bacha, bachi, bache, बचा, बची, बचे, स्टॉक', 'migilindi, migili, మిగిలింది, మిగిలి, స్టాక్')
const CASH = lex(
  'cash, in hand, money, cashbox',
  'galla, galle, nakad, nagad, paisa, paise, haath mein, नकद, नगद, कैश, गल्ला, गल्ले, पैसा, पैसे',
  'nagadu, dabbu, dabbulu, chetilo, నగదు, డబ్బు, డబ్బులు, క్యాష్, చేతిలో',
)
const CUR = lex(
  'rs, rupees, rupee, inr, bucks',
  'rupaye, rupay, rupya, rupiya, rupaiye, रुपये, रुपए, रुपया, रुपयों, रु',
  'rupayalu, rupayi, rupai, rupayala, రూపాయలు, రూపాయి, రూపాయల, రూ',
)
const MRPW = lex('mrp', 'एमआरपी', 'ఎమ్మార్పీ, ఎంఆర్పీ')
const SHELFW = lex('shelf, rack', 'शेल्फ, रैक', 'షెల్ఫ్, అర, ర్యాక్')
const EXPW = lex('expiry, expires, expire, expiring, exp, expiration, best before', 'एक्सपायरी, एक्सपायर', 'gaduvu, ఎక్స్పైరీ, గడువు')
const EACH = lex(
  'each, per, apiece, a piece, rate',
  'har, ek ka, prati, hisaab, bhav, bhaav, हर, प्रति, हिसाब, भाव, एक का, रेट',
  'okkokati, okkati, chopuna, ఒక్కొక్కటి, ఒక్కటి, చొప్పున, రేటు',
)
const TOTALW = lex('total, altogether', 'kul, कुल', 'mottam, మొత్తం')
const AT = lex('at')
const FOR = lex('for')
const MEIN = lex('', 'mein, me, में, ki, की', 'ki, ku, కి, కు')
const FILL = lex('is, of, no, number, num', 'hai, नंबर', 'నంబర్, వ')

// debts
const OWES = lex('owes')
const OWE = lex('owe, owed')
const BORROW = lex('borrowed, borrow')
const LENT = lex('lent, lend, loaned')
const CREDIT = lex(
  'credit, loan, debt',
  'udhaar, udhar, udhari, karz, karza, baki, baaki, bakaya, उधार, उधारी, कर्ज, कर्जा, बाकी, बकाया',
  'appu, baki, అప్పు, బాకీ',
)
const DENA = lex('', 'dena, dene, देना, देने')
const LENA = lex('', 'lena, lene, लेना, लेने')
const IVVALI = lex('', '', 'ivvali, ivvaali, ఇవ్వాలి')
const RAAVALI = lex('', '', 'raavali, ravali, రావాలి')
const LIYA = lex('', 'liya, liye, लिया, लिए')
const DIYA = lex('', 'diya, diye, di, दिया, दिए, दिये, दी')
const MILA = lex('', 'mila, mile, mil, मिला, मिले, मिल')
const TE_GAVE_I = lex('', '', 'ichanu, icchanu, ichesanu, icchesanu, kattanu, chellinchanu, teerchanu, tirchanu, ఇచ్చాను, ఇచ్చేశాను, ఇచ్చేసాను, కట్టాను, చెల్లించాను, తీర్చాను')
const TE_GAVE_THEY = lex(
  '',
  '',
  'ichadu, icchadu, ichindi, icchindi, icharu, iccharu, ichesadu, kattadu, chellinchadu, teerchadu, tirigi, ఇచ్చాడు, ఇచ్చింది, ఇచ్చారు, ఇచ్చేశాడు, ఇచ్చేసాడు, కట్టాడు, చెల్లించాడు, తీర్చాడు, తిరిగి',
)
const TE_TOOK_I = lex('', '', 'teesukunnanu, tisukunnanu, తీసుకున్నాను')
const TE_TOOK_THEY = lex('', '', 'teesukunnadu, tisukunnadu, తీసుకున్నాడు, తీసుకున్నారు, తీసుకుంది')
const SETTLE_EN = lex('paid, repaid, returned, settled, cleared, gave, given, received')
const SETTLE_HI = lex('', 'de, दे, chuka, chukaya, chukta, wapas, vapas, lauta, lautaya, lautaye, चुका, चुकाया, चुकता, वापस, लौटा, लौटाया, लौटाए')
/** Words that mean "repaid" even next to a credit word like udhaar/appu. */
const SETTLE_BACK = lex(
  'back, returned, repaid, settled, cleared',
  'chuka, chukaya, chukta, wapas, vapas, lauta, lautaya, lautaye, चुका, चुकाया, चुकता, वापस, लौटा, लौटाया, लौटाए',
  'tirigi, teerchanu, tirchanu, teerchadu, తిరిగి, తీర్చాను, తీర్చాడు',
)
const GOT = lex('got, received')
const FROM = lex('from')
const ME = lex('me, us', 'mujhe, mujhko, hamein, मुझे, मुझको, हमें', 'naaku, naku, maaku, నాకు, మాకు')
const I = lex('i, we', 'maine, humne, मैंने, हमने', 'nenu, memu, నేను, మేము')
const KO = lex('', 'ko, को')
const NE = lex('', 'ne, ने')
const SE = lex('', 'se, से')
const PAR = lex('', 'par, pe, पर, पे')

// Words that carry no product / person information.
lex(
  `my, the, a, an, are, was, were, to, and, it, him, her, them, by, on, in, should, give, will, have, has, had, do, did,
   does, that, this, there, please, today, now, just, with, need, must, before, until, till, worth, only, more, some,
   new, our, shop, store, been, be, his, he, she, they, their, you, your, am, also, then, so, as, about, return, pay,
   due, date, item, items, yesterday, last, next, after, which, one, of, if, but, not, can, tell, show, check, how,
   much, many, still, him, back, on, off, out, up, here`,
  `mera, mere, meri, hain, tha, thi, ka, ke, aur, ho, hua, hui, gaya, gayi, gaye, kar, karo, kiya, raha, rahi, tak, bhi,
   hi, wala, abhi, hum, hamara, unko, usko, use, yeh, woh, ye, wo, rakha, rakho, mujhse, unse, usse, aaj, kal, parso,
   मेरा, मेरे, मेरी, हैं, था, थी, का, के, और, हो, हुआ, हुई, गया, गयी, गई, गए, कर, करो, किया, तक, भी, ही, हम, यह, वह, रखा`,
  `naa, na, lo, undi, unnayi, unnadi, nundi, nunchi, daggara, mariyu, ee, aa, lopu, lopala, repu, cheyi, ayindi,
   నా, లో, ఉంది, ఉన్నాయి, నుండి, నుంచి, దగ్గర, మరియు, ఈ, ఆ, లోపు, న, చేయి, అయింది`,
)

const UNIT: Record<string, { unit: string; factor: number }> = {}
const unit = (u: string, factor: number, s: string) =>
  s.split(/\s+/).map(norm).forEach((w) => {
    UNIT[w] = { unit: u, factor }
    STOP.add(w)
  })
unit('kg', 1, 'kg kgs kilo kilos kilogram kilograms किलो केजी కిలో కిలోలు కిలోల కేజీ కేజీలు')
unit('kg', 0.001, 'g gm gms gram grams ग्राम గ్రాము గ్రాములు')
unit('packet', 1, 'packet packets pack packs pkt pkts pouch pouches पैकेट पैकेट्स ప్యాకెట్ ప్యాకెట్లు ప్యాకెట్ల పాకెట్ పాకెట్లు')
unit('unit', 1, 'unit units piece pieces pcs pc nag नग पीस यूनिट పీస్ పీసులు యూనిట్ యూనిట్లు')
unit('litre', 1, 'litre litres liter liters l ltr lt लीटर లీటర్ లీటర్లు లీటర్ల')
unit('litre', 0.001, 'ml मिली')
unit('dozen', 1, 'dozen dozens darjan dajan दर्जन డజన్ డజన్లు డజన్ల')
unit('bottle', 1, 'bottle bottles बोतल సీసా')
unit('box', 1, 'box boxes डिब्बा డబ్బా')
unit('bag', 1, 'bag bags bori basta बोरी బస్తా')

// ---- helpers -----------------------------------------------------------------

function detectLang(text: string, t: string[], fallback?: Lang): Lang {
  const te = text.match(/[ఀ-౿]/g)?.length ?? 0
  const hi = text.match(/[ऀ-ॿ]/g)?.length ?? 0
  if (te || hi) return te >= hi ? 'te' : 'hi'
  const votes = { en: 0, hi: 0, te: 0 }
  for (const w of t) {
    const l = LANGW[w] ?? numLang(w)
    if (l && l !== 'x') votes[l]++
  }
  if (votes.hi > votes.te && votes.hi >= votes.en) return 'hi'
  if (votes.te > votes.hi && votes.te >= votes.en) return 'te'
  return votes.en > 0 ? 'en' : (fallback ?? 'en')
}

const productKeys = (p: Product) => [p.name, ...p.aliases].map((k) => norm(k).replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').trim()).filter(Boolean)

interface Num {
  v: number
  i: number
  len: number
  role: 'mrp' | 'shelf' | 'qty' | 'money' | 'plain'
  unit?: { unit: string; factor: number }
  kind?: 'unit' | 'total'
}

const titleCase = (s: string) => (/^[a-z\s]+$/.test(s) ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s)

// ---- the parser ----------------------------------------------------------------

export function parse(text: string, ctx: ParseCtx): Parse {
  const keys = ctx.products.map((p) => ({ p, keys: productKeys(p) }))
  const keep = new Set(STOP)
  keys.forEach((k) => k.keys.forEach((key) => key.split(/\s+/).forEach((w) => keep.add(w))))
  const tk = tokenize(text, keep)
  const t = tk.t
  const lang = detectLang(text, t, ctx.fallbackLang)
  const used = t.map(() => false)
  const has = (l: Lex) => find(t, l) >= 0
  const inLex = (w: string | undefined, l: Lex) => w !== undefined && l.some((ws) => ws.length === 1 && ws[0] === w)
  const hasDigits = t.some((w) => /^\d/.test(w))

  if (!t.length) return { lang, intent: 'unknown' }
  if (t.length <= 3 && t.every((w) => inLex(w, YES))) return { lang, intent: 'yes' }
  if (t.length <= 3 && t.every((w) => inLex(w, NO))) return { lang, intent: 'no' }
  if (has(UNDO) && t.length <= 8 && !hasDigits) return { lang, intent: 'undo' }

  // "ek ka" / "each" must be consumed before numbers ("ek" = 1)
  const each = has(EACH)
  for (const ws of EACH)
    for (let i = 0; i + ws.length <= t.length; i++)
      if (ws.every((w, k) => t[i + k] === w)) ws.forEach((_, k) => (used[i + k] = true))

  const obligation = ((): Dir | 'ask' | null => {
    if (has(OWES)) return 'they_owe'
    const o = find(t, OWE)
    if (o >= 0) return inLex(t[o + 1], ME) ? 'they_owe' : t.slice(0, o).some((w) => inLex(w, I)) ? 'i_owe' : 'ask'
    if (has(DENA) || has(IVVALI)) return has(ME) ? 'they_owe' : 'i_owe'
    if (has(LENA) || has(RAAVALI)) return 'they_owe'
    return null
  })()
  const credit = has(CREDIT) || has(BORROW) || has(LENT)
  const settleVerb =
    has(SETTLE_EN) || has(SETTLE_HI) || has(DIYA) || has(MILA) || has(TE_GAVE_I) || has(TE_GAVE_THEY) || (has(GOT) && has(FROM))
  const debtish = obligation !== null || credit || settleVerb

  // dates
  let date = findDate(t, tk.ord, ctx.today)
  if (date?.weak && !debtish) date = null // "3rd shelf" is not a date
  if (date) for (let i = date.start; i < date.end; i++) used[i] = true

  // exact product matches, longest phrase first
  const exact: { p: Product; i: number }[] = []
  for (let n = 3; n >= 1; n--)
    for (let i = 0; i + n <= t.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue
      const head = t.slice(i, i + n - 1)
      const phrases = variants(t[i + n - 1]).map((last) => [...head, last].join(' '))
      const hit = keys.find((k) => k.keys.some((key) => phrases.includes(key)))
      if (hit) {
        for (let k = i; k < i + n; k++) used[k] = true
        if (!exact.some((e) => e.p.id === hit.p.id)) exact.push({ p: hit.p, i })
      }
    }

  // numbers and what each one means
  const numbers: Num[] = []
  for (let i = 0; i < t.length; i++) {
    if (used[i]) continue
    const n = readNumber(t, i)
    if (!n) continue
    const num: Num = { v: n.value, i, len: n.len, role: 'plain' }
    const end = i + n.len
    const skip = (l: Lex[]) => (w: string | undefined) => l.some((x) => inLex(w, x))
    // nearest meaningful word before / after, skipping currency and filler words
    let b = i - 1
    while (b >= 0 && b >= i - 3 && !used[b] && skip([CUR, FILL])(t[b]) && !inLex(t[b], MEIN)) b--
    let a = end
    while (a < t.length && a <= end + 1 && !used[a] && skip([FILL])(t[a])) a++
    let c = end
    while (c < t.length && c <= end + 1 && skip([CUR])(t[c])) c++
    const before = used[b] ? undefined : t[b]
    if (inLex(before, MRPW)) num.role = 'mrp'
    else if (inLex(before, SHELFW) || (inLex(t[a], SHELFW) && !/^\d/.test(t[a + 1] ?? ''))) num.role = 'shelf'
    else if (UNIT[t[end]]) {
      num.role = 'qty'
      num.unit = UNIT[t[end]]
    } else if (inLex(t[end], CUR) || inLex(t[i - 1], CUR) || inLex(before, AT) || inLex(before, FOR) || inLex(t[c], MEIN)) {
      num.role = 'money'
      num.kind = inLex(before, AT) ? 'unit' : inLex(before, FOR) || inLex(t[c], MEIN) ? 'total' : undefined
    }
    numbers.push(num)
    for (let k = i; k < end; k++) used[k] = true
    i = end - 1
  }
  const money = numbers.find((n) => n.role === 'money')
  const plains = numbers.filter((n) => n.role === 'plain')

  // leftover words: candidate product name or person
  const freeRuns: { i: number; words: string[] }[] = []
  for (let i = 0; i < t.length; i++) {
    if (used[i] || STOP.has(t[i]) || isNumberWord(t[i]) || UNIT[t[i]]) continue
    const last = freeRuns[freeRuns.length - 1]
    if (last && last.i + last.words.length === i) last.words.push(tk.raw[i])
    else freeRuns.push({ i, words: [tk.raw[i]] })
  }

  // ---- products (fuzzy only when nothing matched exactly) ----
  const resolveProduct = (): { product?: Product; candidates?: Product[]; productText?: string } => {
    if (exact.length === 1) return { product: exact[0].p }
    if (exact.length > 1) return { candidates: exact.map((e) => e.p) }
    let best = 99
    let hits: Product[] = []
    for (const run of freeRuns) {
      const ws = run.words.map(norm)
      const grams = [...ws, ...ws.slice(1).map((w, k) => ws[k] + ' ' + w)]
      for (const g of grams)
        for (const k of keys)
          for (const key of k.keys) {
            const d = levenshtein(g, key)
            if (d > allowedEdits(Math.min([...g].length, [...key].length)) || d > best) continue
            if (d < best) hits = []
            best = d
            if (!hits.includes(k.p)) hits.push(k.p)
          }
    }
    if (hits.length === 1) return { product: hits[0] }
    if (hits.length > 1) return { candidates: hits }
    return freeRuns.length ? { productText: freeRuns[0].words.join(' ') } : {}
  }

  // ---- people ----
  const findPerson = (): { name: string; i: number } | undefined => {
    for (const name of ctx.persons) {
      const ws = norm(name).split(/\s+/)
      for (let i = 0; i < t.length; i++) {
        if (ws.every((w, k) => t[i + k] === w)) return { name, i }
      }
    }
    for (const run of freeRuns)
      for (const name of ctx.persons) {
        const first = norm(name).split(/\s+/)[0]
        const w = norm(run.words[0])
        const crossScript = /[a-z]/.test(first) !== /[a-z]/.test(w)
        if (first === w || (crossScript && skeleton(first).length >= 2 && skeleton(first) === skeleton(w))) return { name, i: run.i }
      }
    const run = freeRuns[0]
    return run ? { name: titleCase(run.words.slice(0, 3).join(' ')), i: run.i } : undefined
  }
  const debtAmount = () => (money ?? plains[0] ?? numbers[0])?.v

  const trade = (intent: 'sale' | 'purchase'): Parse => {
    const pr = resolveProduct()
    const q = numbers.find((n) => n.role === 'qty') ?? plains[0]
    const price = money ?? plains.find((n) => n !== q)
    let qty = q ? q.v * (q.unit?.factor ?? 1) : undefined
    if (qty !== undefined && q?.unit?.unit === 'dozen' && pr.product && pr.product.unit !== 'dozen') qty *= 12
    let unitPrice: number | undefined
    let total: number | undefined
    if (price && qty) {
      let kind = each ? 'unit' : has(TOTALW) ? 'total' : price.kind
      if (!kind) {
        // No "each"/"for" marker: pick the reading closer to the price we already know.
        const ref = intent === 'sale' ? pr.product?.mrp : pr.product?.buy_price
        if (ref) kind = Math.abs(Math.log(price.v / qty / ref)) < Math.abs(Math.log(price.v / ref)) ? 'total' : 'unit'
        else kind = intent === 'sale' ? 'total' : 'unit'
      }
      unitPrice = kind === 'unit' ? price.v : price.v / qty
      total = kind === 'unit' ? price.v * qty : price.v
    }
    const shelf = numbers.find((n) => n.role === 'shelf')
    return {
      lang, intent, ...pr, qty, unit: q?.unit?.unit, unitPrice, total,
      mrp: numbers.find((n) => n.role === 'mrp')?.v,
      expiry: date && has(EXPW) ? date.date : undefined,
      shelf: shelf ? String(shelf.v) : undefined,
    }
  }

  const settleDir = (person?: { i: number }): Dir | undefined => {
    if (has(TE_GAVE_THEY) || has(ME) || has(MILA) || (has(GOT) && has(FROM))) return 'they_owe'
    if (has(TE_GAVE_I) || has(I)) return 'i_owe'
    if (has(NE)) return 'they_owe'
    if (has(KO)) return 'i_owe'
    if (has(SE)) return 'they_owe'
    // English word order: "Suresh paid 500" vs "paid Ramesh 100"
    const v = find(t, SETTLE_EN)
    return v >= 0 && person ? (person.i < v ? 'they_owe' : 'i_owe') : undefined
  }
  const creditDir = (): Dir | undefined => {
    if (has(BORROW)) return has(I) ? 'i_owe' : 'they_owe'
    if (has(LENT)) return has(ME) ? 'i_owe' : 'they_owe'
    if (has(TE_TOOK_I) || has(TE_GAVE_THEY)) return 'i_owe'
    if (has(TE_TOOK_THEY) || has(TE_GAVE_I)) return 'they_owe'
    if (has(LIYA)) return has(SE) ? 'i_owe' : has(NE) && !has(I) ? 'they_owe' : undefined
    if (has(DIYA)) return has(ME) ? 'i_owe' : has(KO) ? 'they_owe' : has(NE) && !has(I) ? 'i_owe' : undefined
    if (has(PAR)) return 'they_owe'
    return undefined
  }
  const debtAdd = (direction?: Dir): Parse => ({
    lang, intent: 'debt_add', person: findPerson()?.name, amount: debtAmount(), direction, due: date?.date,
  })
  const settle = (): Parse => {
    const person = findPerson()
    return { lang, intent: 'debt_settle', person: person?.name, amount: debtAmount(), direction: settleDir(person) }
  }

  // ---- decide ----
  const question = tk.question || has(QWORD)
  if (has(SALE) && obligation === null) return trade('sale')
  if (obligation !== null) return debtAdd(obligation === 'ask' ? undefined : obligation)
  if (credit) return has(SETTLE_BACK) ? settle() : debtAdd(creditDir())
  if (settleVerb && !exact.length && !numbers.some((n) => n.unit) && !has(QWORD)) return settle()
  if (has(BUY)) return trade('purchase')
  if (has(CASH)) {
    const amounts = numbers.filter((n) => n.role === 'money' || n.role === 'plain')
    if (question || !amounts.length) return { lang, intent: 'cash_query' }
    return amounts.length === 1 ? { lang, intent: 'cash_set', amount: amounts[0].v } : { lang, intent: 'unknown' }
  }
  if (question || has(LEFT)) return { lang, intent: 'stock_query', ...resolveProduct() }
  if (exact.length === 1 && numbers.length) return { lang, intent: 'trade_unclear', product: exact[0].p }
  return { lang, intent: 'unknown' }
}
