// Text normalisation, tokenising, number words and fuzzy helpers shared by the parser.

/** Canonical form used for all comparisons: NFC, lowercase, ASCII digits, no nukta / zero-width chars. */
export const norm = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[​-‍़]/g, '')
    .replace(/ँ/g, 'ं')
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966))
    .replace(/[౦-౯]/g, (d) => String(d.charCodeAt(0) - 0xc66))

const isTelugu = (s: string) => /[ఀ-౿]/.test(s)

export interface Tokens {
  t: string[] // normalised
  raw: string[] // as typed (for person names)
  ord: boolean[] // number had an ordinal suffix: "16th"
  question: boolean
}

export function tokenize(text: string, keep: Set<string>): Tokens {
  const s = text
    .normalize('NFC')
    .replace(/[​-‍]/g, '')
    .replace(/₹/g, ' rs ')
    .replace(/@/g, ' at ')
    .replace(/(\d),(?=\d{2,3}(\D|$))/g, '$1') // 4,500 and 1,00,000
    .replace(/[^\p{L}\p{M}\p{N}.\s]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/(\p{N})(?=[\p{L}\p{M}])/gu, '$1 ')
    .replace(/([\p{L}\p{M}])(?=\p{N})/gu, '$1 ')
  const out: Tokens = { t: [], raw: [], ord: [], question: /[?？]/.test(text) }
  const push = (raw: string) => {
    out.t.push(norm(raw))
    out.raw.push(raw)
    out.ord.push(false)
  }
  for (const raw of s.split(/\s+/).filter(Boolean)) {
    const t = norm(raw)
    const last = out.t.length - 1
    if (/^(st|nd|rd|th)$/.test(t) && last >= 0 && /^\d+$/.test(out.t[last])) {
      out.ord[last] = true
      continue
    }
    // Telugu dative suffix is glued to the noun: రమేష్కి -> రమేష్ + కి
    const m = isTelugu(t) && !keep.has(t) && t.length >= 4 ? /^(.+?)(కి|కు)$/.exec(raw.normalize('NFC')) : null
    if (m) {
      push(m[1])
      push(m[2])
    } else push(raw)
  }
  return out
}

// ---- numbers ---------------------------------------------------------------

const NUM: Record<string, number> = {}
const NUM_LANG: Record<string, 'en' | 'hi' | 'te'> = {}
const nums = (lang: 'en' | 'hi' | 'te', s: string) =>
  s.trim().split(/\s+/).forEach((p) => {
    const [w, v] = p.split(':')
    NUM[norm(w)] = +v
    NUM_LANG[norm(w)] = lang
  })
export const numLang = (t: string) => NUM_LANG[t]

// English
nums('en', `zero:0 one:1 two:2 three:3 four:4 five:5 six:6 seven:7 eight:8 nine:9 ten:10 eleven:11 twelve:12
 thirteen:13 fourteen:14 fifteen:15 sixteen:16 seventeen:17 eighteen:18 nineteen:19 twenty:20 thirty:30
 forty:40 fourty:40 fifty:50 sixty:60 seventy:70 eighty:80 ninety:90 hundred:100 thousand:1000 lakh:100000 half:0.5`)
// Hindi, romanised
nums('hi', `ek:1 do:2 teen:3 char:4 chaar:4 paanch:5 panch:5 chhe:6 chheh:6 chah:6 chhah:6 saat:7 aath:8 nau:9
 das:10 dus:10 gyarah:11 gyaarah:11 barah:12 baarah:12 terah:13 chaudah:14 pandrah:15 solah:16 satrah:17
 atharah:18 attharah:18 unnis:19 bees:20 bis:20 ikkis:21 baees:22 bais:22 teis:23 chaubis:24 pachees:25
 pachis:25 pacchis:25 chhabbis:26 sattais:27 atthais:28 untees:29 tees:30 paintees:35 chalis:40 chaalis:40
 paintalis:45 pachas:50 pachaas:50 saath:60 sattar:70 pachattar:75 assi:80 nabbe:90 sau:100 hazar:1000
 hazaar:1000 hajar:1000 hajaar:1000 laakh:100000 aadha:0.5 adha:0.5 dedh:1.5 dhai:2.5 adhai:2.5 paav:0.25`)
// Hindi, Devanagari
nums('hi', `एक:1 दो:2 तीन:3 चार:4 पांच:5 पाँच:5 छह:6 छः:6 छे:6 सात:7 आठ:8 नौ:9 दस:10 ग्यारह:11 बारह:12 तेरह:13
 चौदह:14 पंद्रह:15 पन्द्रह:15 सोलह:16 सत्रह:17 अठारह:18 उन्नीस:19 बीस:20 इक्कीस:21 बाईस:22 तेईस:23 चौबीस:24
 पच्चीस:25 तीस:30 पैंतीस:35 चालीस:40 पैंतालीस:45 पचास:50 साठ:60 सत्तर:70 पचहत्तर:75 अस्सी:80 नब्बे:90 सौ:100
 हजार:1000 लाख:100000 आधा:0.5 डेढ:1.5 ढाई:2.5 पाव:0.25`)
// Telugu, romanised
nums('te', `okati:1 oka:1 rendu:2 moodu:3 mudu:3 naalugu:4 nalugu:4 aidu:5 ayidu:5 aaru:6 edu:7 yedu:7 enimidi:8
 tommidi:9 padi:10 padakondu:11 pannendu:12 padamoodu:13 padnalugu:14 padihenu:15 padaharu:16 padihedu:17
 paddenimidi:18 pandommidi:19 iravai:20 muppai:30 nalabhai:40 nalabai:40 yabhai:50 yabai:50 aravai:60
 debbhai:70 debbai:70 enabhai:80 enabai:80 tombhai:90 tombai:90 vanda:100 vandala:100 nooru:100 veyyi:1000
 veyi:1000 velu:1000 vela:1000 laksha:100000 sagam:0.5`)
// Telugu script
nums('te', `ఒకటి:1 ఒక:1 రెండు:2 మూడు:3 నాలుగు:4 ఐదు:5 అయిదు:5 ఆరు:6 ఏడు:7 ఎనిమిది:8 తొమ్మిది:9 పది:10 పదకొండు:11
 పన్నెండు:12 పదమూడు:13 పద్నాలుగు:14 పదిహేను:15 పదహారు:16 పదిహేడు:17 పద్దెనిమిది:18 పందొమ్మిది:19 ఇరవై:20
 ముప్పై:30 నలభై:40 యాభై:50 అరవై:60 డెబ్బై:70 ఎనభై:80 తొంభై:90 వంద:100 వందల:100 వందలు:100 నూరు:100 వెయ్యి:1000
 వేలు:1000 వేల:1000 లక్ష:100000 సగం:0.5`)

// "saadhe char" = 4.5, "sava sau" = 125, "paune do" = 1.75
const MOD: Record<string, number> = {}
;[['saadhe sadhe sade साढे', 0.5], ['sava sawa सवा', 0.25], ['paune पौने', -0.25]].forEach(([ws, v]) =>
  (ws as string).split(' ').forEach((w) => (MOD[norm(w)] = v as number)),
)
export const isNumberWord = (t: string) => t in NUM || t in MOD
const PRONOUN = new Set(['i', 'we', 'you', 'they', 'not'])

/** Reads a number (digits or number words, possibly several tokens) starting at index i. */
export function readNumber(toks: string[], i: number): { value: number; len: number } | null {
  let total = 0
  let cur = 0
  let len = 0
  let seen = false
  let digit = false
  let mod = 0
  for (let j = i; j < toks.length; j++) {
    const t = toks[j]
    if (t in MOD && !seen && !mod) {
      mod = MOD[t]
      continue
    }
    if (/^\d+(\.\d+)?$/.test(t)) {
      if (seen) break
      cur = +t + mod
      mod = 0
      digit = seen = true
      len = 1
      continue
    }
    const v = NUM[t]
    // "do" is Hindi for 2 but also English: "how much cash do I have"
    if (v === undefined || (t === 'do' && PRONOUN.has(toks[j + 1]))) break
    if (v >= 1000) {
      total += (cur || 1) * v
      cur = 0
    } else if (v === 100) {
      cur = (cur || 1 + mod) * 100
      mod = 0
    } else {
      if (digit) break
      const afterHundreds = cur % 100 === 0 && (cur > 0 || total > 0)
      const afterTens = cur % 10 === 0 && cur % 100 >= 20 && v < 10
      if (seen && !afterHundreds && !afterTens) break // "five ten" is two numbers
      cur += v + mod
      mod = 0
    }
    seen = true
    len = j - i + 1
  }
  return seen ? { value: total + cur, len } : null
}

// ---- fuzzy matching --------------------------------------------------------

export function levenshtein(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  let prev = y.map((_, i) => i + 1)
  prev.unshift(0)
  for (let i = 1; i <= x.length; i++) {
    const row = [i]
    for (let j = 1; j <= y.length; j++)
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[y.length]
}

/** Edits tolerated for a word of this length. Short words must match exactly. */
export const allowedEdits = (len: number) => (len < 4 ? 0 : len < 7 ? 1 : 2)

/** Plural / suffix variants of a token to try for exact matches. */
export const variants = (t: string) => {
  const v = [t]
  for (const suf of ['es', 's', 'లు', 'lu']) if (t.length > suf.length + 2 && t.endsWith(suf)) v.push(t.slice(0, -suf.length))
  return v
}

const CONS: Record<string, string> = {}
;`कk खk गg घg चc छc जj झj टt ठt डd ढd णn तt थt दd धd नn पp फf बb भb मm यy रr लl वv शs षs सs हh ङn ञn ंn
కk ఖk గg ఘg చc ఛc జj ఝj టt ఠt డd ఢd ణn తt థt దd ధd నn పp ఫf బb భb మm యy రr లl వv శs షs సs హh ళl ఱr ంn`
  .split(/\s+/)
  .forEach((p) => (CONS[p[0]] = p[1]))

/** Consonant skeleton, so "Ramesh", "रमेश" and "రమేష్" all compare equal (rms). Rough by design. */
export function skeleton(s: string): string {
  const n = norm(s)
  let out = ''
  if (/[a-z]/.test(n)) {
    out = n
      .replace(/sh/g, 's').replace(/ch/g, 'c').replace(/([tdpbkg])h/g, '$1').replace(/ph/g, 'f')
      .replace(/w/g, 'v').replace(/z/g, 'j').replace(/x/g, 'ks').replace(/q/g, 'k')
      .replace(/[^bcdfghjklmnprstvy]/g, '')
  } else for (const ch of n) out += CONS[ch] ?? ''
  return out.replace(/(.)\1+/g, '$1').replace(/f/g, 'p')
}
