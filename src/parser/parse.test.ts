import { describe, expect, it } from 'vitest'
import { plan } from '../agent'
import type { Debt, Product, ShopState } from '../types'
import { findDate } from './dates'
import { parse, type Parse } from './parse'
import { norm, readNumber, skeleton, tokenize } from './text'

const TODAY = '2026-11-14' // a Saturday

const prod = (name: string, aliases: string[], quantity: number, unit: string, buy_price: number, mrp: number, low = 5): Product => ({
  id: name.toLowerCase().replace(/\s/g, '-'),
  name, aliases, quantity, unit, buy_price, mrp,
  expiry: null, shelf: '1', low_stock_threshold: low, created_at: '2026-11-01T00:00:00Z',
})
const products = [
  prod('Rice', ['chawal', 'chaval', 'चावल', 'biyyam', 'బియ్యం'], 42, 'kg', 48, 60, 10),
  prod('Sugar', ['cheeni', 'चीनी', 'chakkera', 'చక్కెర'], 4, 'kg', 40, 46, 10),
  prod('Tea', ['chai', 'चाय', 'టీ'], 60, 'packet', 8, 10),
  prod('Milk', ['doodh', 'दूध', 'paalu', 'పాలు'], 12, 'packet', 26, 30),
  prod('Eggs', ['egg', 'anda', 'अंडा', 'guddu', 'గుడ్డు', 'గుడ్లు'], 9, 'dozen', 66, 84, 3),
  prod('Toor Dal', ['dal', 'arhar dal', 'दाल', 'kandi pappu', 'కంది పప్పు'], 18, 'kg', 130, 160),
  prod('Sunflower Oil', ['oil', 'tel', 'तेल', 'nune', 'నూనె'], 14, 'litre', 128, 150),
  prod('Soap', ['sabun', 'साबुन', 'sabbu', 'సబ్బు'], 22, 'unit', 28, 38),
]
const debt = (person: string, amount: number, direction: Debt['direction'], settled = false): Debt => ({
  id: `${person}-${amount}`, person, amount, direction, due_date: null, settled, created_at: '2026-11-01T00:00:00Z',
})
const debts = [debt('Ramesh Traders', 2400, 'i_owe'), debt('Ramesh Traders', 100, 'i_owe'), debt('Suresh', 500, 'they_owe'), debt('Lakshmi', 180, 'they_owe')]
const state: ShopState = { cash: 6350, products, debts, movements: [] }
const ctx = { products, persons: debts.map((d) => d.person), today: TODAY }

const p = (msg: string) => parse(msg, ctx)
/** Runs each [message, expected subset] row. Products are compared by name. */
function table(rows: [string, Record<string, unknown>][]) {
  for (const [msg, want] of rows)
    it(msg, () => {
      const got = p(msg) as Parse & { product?: Product }
      const flat = { ...got, product: got.product?.name }
      expect(flat).toMatchObject(want)
    })
}

describe('text helpers', () => {
  it('tokenizes digits, currency, ordinals and Telugu suffixes', () => {
    expect(tokenize('₹4,500 on 16th, 5kg', new Set()).t).toEqual(['rs', '4500', 'on', '16', '5', 'kg'])
    expect(tokenize('16th', new Set()).ord).toEqual([true])
    expect(tokenize('రమేష్‌కి 100', new Set()).t).toEqual(['రమేష్', 'కి', '100'])
    expect(tokenize('५ चावल', new Set()).t).toEqual(['5', 'चावल'])
    expect(tokenize('2.5 kg.', new Set()).t).toEqual(['2.5', 'kg'])
  })
  const n = (s: string) => readNumber(s.split(' ').map(norm), 0)?.value
  it.each([
    ['5', 5], ['2.5', 2.5], ['five', 5], ['twenty five', 25], ['two hundred', 200], ['five hundred fifty', 550],
    ['two thousand five hundred', 2500], ['1 lakh', 100000], ['paanch', 5], ['pachas', 50], ['do sau', 200],
    ['dedh sau', 150], ['5 sau', 500], ['do hazaar', 2000], ['पांच', 5], ['पाँच', 5], ['पाँच सौ', 500], ['डेढ़ सौ', 150],
    ['दो हज़ार', 2000], ['aidu', 5], ['iravai aidu', 25], ['aidu vandalu', undefined], ['rendu vanda', 200], ['ఐదు', 5],
    ['ఐదు వందలు', 500], ['ఇరవై ఐదు', 25], ['రెండు వేలు', 2000], ['hello', undefined],
    ['saadhe char hazaar', 4500], ['साढ़े तीन', 3.5], ['sava sau', 125], ['paune do', 1.75], ['saadhe 4 hazaar', 4500],
  ])('reads number %s', (s, v) => {
    if (s === 'aidu vandalu') expect(n(s)).toBe(5) // unknown plural: stops after "aidu"
    else expect(n(s)).toBe(v)
  })
  it('does not merge separate numbers', () => {
    expect(readNumber(['five', 'ten'], 0)).toEqual({ value: 5, len: 1 })
    expect(readNumber(['5', '240'], 0)).toEqual({ value: 5, len: 1 })
  })
  it('"do" before a pronoun is English, not 2', () => {
    expect(readNumber(['do', 'i', 'have'], 0)).toBeNull()
    expect(readNumber(['do', 'kilo'], 0)?.value).toBe(2)
  })
  it('skeleton matches names across scripts', () => {
    expect(skeleton('Ramesh')).toBe(skeleton('रमेश'))
    expect(skeleton('Ramesh')).toBe(skeleton('రమేష్'))
    expect(skeleton('Lakshmi')).toBe(skeleton('लक्ष्मी'))
    expect(skeleton('Suresh')).toBe(skeleton('సురేష్'))
    expect(skeleton('Ramesh')).not.toBe(skeleton('Rajesh'))
  })
})

describe('dates (today = Sat 14 Nov 2026)', () => {
  const d = (s: string) => {
    const tk = tokenize(s, new Set())
    return findDate(tk.t, tk.ord, TODAY)?.date
  }
  it.each([
    ['16th November', '2026-11-16'], ['16 nov', '2026-11-16'], ['November 16', '2026-11-16'], ['16th of November', '2026-11-16'],
    ['14 November', '2026-11-14'], // today still counts as upcoming
    ['12 March', '2027-03-12'], ['13 November', '2027-11-13'], ['5 jan 2028', '2028-01-05'],
    ['today', '2026-11-14'], ['tomorrow', '2026-11-15'], ['kal', '2026-11-15'], ['day after tomorrow', '2026-11-16'],
    ['parso', '2026-11-16'], ['next Monday', '2026-11-16'], ['monday', '2026-11-16'], ['saturday', '2026-11-21'],
    ['next friday', '2026-11-20'], ['in 3 days', '2026-11-17'], ['next week', '2026-11-21'], ['2 weeks', '2026-11-28'],
    ['by the 16th', '2026-11-16'], ['by the 5th', '2026-12-05'],
    ['कल', '2026-11-15'], ['परसों', '2026-11-16'], ['16 नवंबर', '2026-11-16'], ['सोमवार', '2026-11-16'], ['3 दिन', '2026-11-17'],
    ['20 tarikh', '2026-11-20'], ['teen din mein', '2026-11-17'], ['agle somvar', '2026-11-16'],
    ['రేపు', '2026-11-15'], ['ఎల్లుండి', '2026-11-16'], ['నవంబర్ 16', '2026-11-16'], ['సోమవారం', '2026-11-16'],
    ['16వ తేదీ', '2026-11-16'], ['repu', '2026-11-15'], ['somavaram', '2026-11-16'], ['3 రోజుల్లో', '2026-11-17'],
    ['no date here', undefined], ['may I pay', undefined],
  ])('%s', (s, want) => expect(d(s)).toBe(want))
})

describe('sale', () => {
  table([
    // English
    ['sold 5 units of rice', { intent: 'sale', lang: 'en', product: 'Rice', qty: 5, unitPrice: undefined }],
    ['sold 5 rice for 240', { intent: 'sale', product: 'Rice', qty: 5, total: 240, unitPrice: 48 }],
    ['Sold five kg rice', { intent: 'sale', product: 'Rice', qty: 5 }],
    ['sold 2 packets of tea at 12 each', { intent: 'sale', product: 'Tea', qty: 2, unitPrice: 12, total: 24 }],
    ['sold 3 rice @ 55', { intent: 'sale', product: 'Rice', qty: 3, unitPrice: 55 }],
    ['sold 500 grams sugar', { intent: 'sale', product: 'Sugar', qty: 0.5 }],
    ['sold 2 dozen eggs', { intent: 'sale', product: 'Eggs', qty: 2 }],
    ['sold 1 dozen soap', { intent: 'sale', product: 'Soap', qty: 12 }],
    ['sold 2.5 kg toor dal for ₹400', { intent: 'sale', product: 'Toor Dal', qty: 2.5, total: 400 }],
    ['sold 5 rice 240 rupees', { intent: 'sale', product: 'Rice', qty: 5, total: 240 }], // 48/kg is closer to MRP 60 than 240/kg
    ['sold 5 rice 55 rupees', { intent: 'sale', product: 'Rice', qty: 5, unitPrice: 55, total: 275 }],
    ['sold 5 ryce', { intent: 'sale', product: 'Rice', qty: 5 }], // typo
    ['sold 2 sunflower oil', { intent: 'sale', product: 'Sunflower Oil', qty: 2 }],
    // Hindi romanised
    ['5 chawal bech diya', { intent: 'sale', lang: 'hi', product: 'Rice', qty: 5 }],
    ['paanch kilo chawal becha', { intent: 'sale', lang: 'hi', product: 'Rice', qty: 5 }],
    ['5 chawal 240 mein becha', { intent: 'sale', product: 'Rice', qty: 5, total: 240 }],
    ['do packet chai bechi 12 rupaye ke hisaab se', { intent: 'sale', product: 'Tea', qty: 2, unitPrice: 12 }],
    ['kal 3 doodh bika', { intent: 'sale', product: 'Milk', qty: 3 }],
    // Hindi Devanagari
    ['5 चावल बेचा', { intent: 'sale', lang: 'hi', product: 'Rice', qty: 5 }],
    ['पांच किलो चावल बेच दिया', { intent: 'sale', lang: 'hi', product: 'Rice', qty: 5 }],
    ['५ चावल 240 रुपये में बेचा', { intent: 'sale', product: 'Rice', qty: 5, total: 240 }],
    ['दो दर्जन अंडे बेचे', { intent: 'sale', product: 'Eggs', qty: 2 }],
    // Telugu script
    ['5 బియ్యం అమ్మాను', { intent: 'sale', lang: 'te', product: 'Rice', qty: 5 }],
    ['ఐదు కిలోల బియ్యం అమ్మాను', { intent: 'sale', lang: 'te', product: 'Rice', qty: 5 }],
    ['5 బియ్యం 240 కి అమ్మాను', { intent: 'sale', product: 'Rice', qty: 5, total: 240 }],
    ['రెండు ప్యాకెట్లు పాలు అమ్మాను', { intent: 'sale', product: 'Milk', qty: 2 }],
    // Telugu romanised
    ['5 biyyam ammanu', { intent: 'sale', lang: 'te', product: 'Rice', qty: 5 }],
    ['aidu kilo biyyam ammanu', { intent: 'sale', lang: 'te', product: 'Rice', qty: 5 }],
    ['rendu paalu ammesanu', { intent: 'sale', lang: 'te', product: 'Milk', qty: 2 }],
    // mixed
    ['sold 5 chawal', { intent: 'sale', lang: 'en', product: 'Rice', qty: 5 }],
    ['5 rice bech diya', { intent: 'sale', lang: 'hi', product: 'Rice', qty: 5 }],
    ['5 kg బియ్యం sold', { intent: 'sale', lang: 'te', product: 'Rice', qty: 5 }],
    ['2 packet चाय sold for 20', { intent: 'sale', product: 'Tea', qty: 2, total: 20 }],
    // needs clarification
    ['sold rice', { intent: 'sale', product: 'Rice', qty: undefined }],
    ['sold 5 saffron', { intent: 'sale', product: undefined, productText: 'saffron', qty: 5 }],
    ['sold 5', { intent: 'sale', product: undefined, qty: 5 }],
  ])
  it('asks which product when two are named', () => {
    const got = p('sold 5 rice and 2 sugar')
    expect(got.intent === 'sale' && got.candidates?.map((c) => c.name)).toEqual(['Rice', 'Sugar'])
  })
})

describe('purchase', () => {
  table([
    ['got 20 packets of tea at 8 rupees each, MRP 10, expiry 12 March, shelf 3', { intent: 'purchase', lang: 'en', product: 'Tea', qty: 20, unit: 'packet', unitPrice: 8, total: 160, mrp: 10, expiry: '2027-03-12', shelf: '3' }],
    ['bought 10 kg rice for 480', { intent: 'purchase', product: 'Rice', qty: 10, total: 480, unitPrice: 48 }],
    ['received 30 packets milk', { intent: 'purchase', product: 'Milk', qty: 30, unitPrice: undefined }],
    ['got 10 kg sugar at 41', { intent: 'purchase', product: 'Sugar', qty: 10, unitPrice: 41 }],
    ['purchased 12 soap, mrp 40, shelf number 5', { intent: 'purchase', product: 'Soap', qty: 12, mrp: 40, shelf: '5' }],
    ['got 20 tea 160 rupees', { intent: 'purchase', product: 'Tea', qty: 20, total: 160, unitPrice: 8 }], // 8 each matches known cost
    ['got 5 litres oil at 130 per litre', { intent: 'purchase', product: 'Sunflower Oil', qty: 5, unitPrice: 130 }],
    ['got 20 packets of coffee at 8 rupees each, MRP 10', { intent: 'purchase', product: undefined, productText: 'coffee', qty: 20, unitPrice: 8, mrp: 10 }],
    ['20 packet chai aaya 8 rupaye ke hisaab se, MRP 10', { intent: 'purchase', lang: 'hi', product: 'Tea', qty: 20, unitPrice: 8, mrp: 10 }],
    ['10 kilo chawal kharida 480 mein', { intent: 'purchase', lang: 'hi', product: 'Rice', qty: 10, total: 480 }],
    ['20 पैकेट चाय आई 8 रुपये के भाव, एमआरपी 10, एक्सपायरी 12 मार्च, शेल्फ 3', { intent: 'purchase', lang: 'hi', product: 'Tea', qty: 20, unitPrice: 8, mrp: 10, expiry: '2027-03-12', shelf: '3' }],
    ['10 किलो चावल खरीदा 480 रुपये में', { intent: 'purchase', product: 'Rice', qty: 10, total: 480 }],
    ['20 ప్యాకెట్లు టీ వచ్చాయి ఒక్కొక్కటి 8 రూపాయలు, MRP 10, షెల్ఫ్ 3', { intent: 'purchase', lang: 'te', product: 'Tea', qty: 20, unitPrice: 8, mrp: 10, shelf: '3' }],
    ['10 కిలోల బియ్యం కొన్నాను 480 కి', { intent: 'purchase', lang: 'te', product: 'Rice', qty: 10, total: 480 }],
    ['10 kilo biyyam konnanu', { intent: 'purchase', lang: 'te', product: 'Rice', qty: 10 }],
    ['20 tea packets vachayi okkokati 8 rupayalu', { intent: 'purchase', lang: 'te', product: 'Tea', qty: 20, unitPrice: 8 }],
    ['got 10 kg chawal', { intent: 'purchase', lang: 'en', product: 'Rice', qty: 10 }],
  ])
})

describe('stock question', () => {
  table([
    ['how much rice is left?', { intent: 'stock_query', lang: 'en', product: 'Rice' }],
    ['how many eggs do we have', { intent: 'stock_query', product: 'Eggs' }],
    ['rice stock', { intent: 'stock_query', product: 'Rice' }],
    ['chawal kitna bacha hai?', { intent: 'stock_query', lang: 'hi', product: 'Rice' }],
    ['kitni chai bachi hai', { intent: 'stock_query', lang: 'hi', product: 'Tea' }],
    ['चावल कितना बचा है?', { intent: 'stock_query', lang: 'hi', product: 'Rice' }],
    ['बियर कितना बचा है', { intent: 'stock_query', lang: 'hi', product: undefined, productText: 'बियर' }],
    ['బియ్యం ఎంత ఉంది?', { intent: 'stock_query', lang: 'te', product: 'Rice' }],
    ['పాలు ఎన్ని మిగిలాయి?', { intent: 'stock_query', lang: 'te', product: 'Milk' }],
    ['biyyam enta undi', { intent: 'stock_query', lang: 'te', product: 'Rice' }],
    ['how much chawal is left', { intent: 'stock_query', lang: 'en', product: 'Rice' }],
    ['how much saffron is left?', { intent: 'stock_query', product: undefined, productText: 'saffron' }],
  ])
})

describe('debt: new', () => {
  table([
    ['I owe Ramesh 100 rupees and should give it back by 16th November', { intent: 'debt_add', lang: 'en', person: 'Ramesh Traders', amount: 100, direction: 'i_owe', due: '2026-11-16' }],
    ['Suresh owes me 500', { intent: 'debt_add', person: 'Suresh', amount: 500, direction: 'they_owe', due: undefined }],
    ['i owe gopal 250 by next monday', { intent: 'debt_add', person: 'Gopal', amount: 250, direction: 'i_owe', due: '2026-11-16' }],
    ['Anita owes me two hundred rupees, due tomorrow', { intent: 'debt_add', person: 'Anita', amount: 200, direction: 'they_owe', due: '2026-11-15' }],
    ['Kiran borrowed 300', { intent: 'debt_add', person: 'Kiran', amount: 300, direction: 'they_owe' }],
    ['I borrowed 1000 from Mohan', { intent: 'debt_add', person: 'Mohan', amount: 1000, direction: 'i_owe' }],
    ['lent Kiran 300 till the 20th', { intent: 'debt_add', person: 'Kiran', amount: 300, direction: 'they_owe', due: '2026-11-20' }],
    ['Gopal owe 100', { intent: 'debt_add', person: 'Gopal', amount: 100, direction: undefined }], // unclear who owes whom
    // Hindi
    ['Gopal ko 100 rupaye dena hai 16 November tak', { intent: 'debt_add', lang: 'hi', person: 'Gopal', amount: 100, direction: 'i_owe', due: '2026-11-16' }],
    ['Suresh se 500 lena hai', { intent: 'debt_add', lang: 'hi', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['Gopal ko mujhe 500 dena hai kal tak', { intent: 'debt_add', person: 'Gopal', amount: 500, direction: 'they_owe', due: '2026-11-15' }],
    ['Kiran ne 300 udhaar liya', { intent: 'debt_add', lang: 'hi', person: 'Kiran', amount: 300, direction: 'they_owe' }],
    ['maine Mohan se 1000 udhaar liya', { intent: 'debt_add', person: 'Mohan', amount: 1000, direction: 'i_owe' }],
    ['Kiran ko 300 udhaar diya', { intent: 'debt_add', person: 'Kiran', amount: 300, direction: 'they_owe' }],
    ['Kiran pe 300 baki hai', { intent: 'debt_add', person: 'Kiran', amount: 300, direction: 'they_owe' }],
    ['Kiran ka 300 udhaar hai', { intent: 'debt_add', person: 'Kiran', amount: 300, direction: undefined }],
    ['गोपाल को 100 रुपये देने हैं 16 नवंबर तक', { intent: 'debt_add', lang: 'hi', person: 'गोपाल', amount: 100, direction: 'i_owe', due: '2026-11-16' }],
    ['सुरेश से 500 लेना है', { intent: 'debt_add', lang: 'hi', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['किरण ने पाँच सौ रुपये उधार लिए', { intent: 'debt_add', person: 'किरण', amount: 500, direction: 'they_owe' }],
    // Telugu
    ['గోపాల్‌కి 100 రూపాయలు ఇవ్వాలి నవంబర్ 16 లోపు', { intent: 'debt_add', lang: 'te', person: 'గోపాల్', amount: 100, direction: 'i_owe', due: '2026-11-16' }],
    ['సురేష్ నాకు 500 ఇవ్వాలి', { intent: 'debt_add', lang: 'te', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['కిరణ్ నుండి 300 రావాలి రేపు', { intent: 'debt_add', lang: 'te', person: 'కిరణ్', amount: 300, direction: 'they_owe', due: '2026-11-15' }],
    ['Gopal ki 100 ivvali', { intent: 'debt_add', lang: 'te', person: 'Gopal', amount: 100, direction: 'i_owe' }],
    ['Suresh naaku 500 ivvali', { intent: 'debt_add', lang: 'te', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['Kiran ki 300 appu ichanu', { intent: 'debt_add', lang: 'te', person: 'Kiran', amount: 300, direction: 'they_owe' }],
    ['కిరణ్ కి 300 అప్పు ఇచ్చాను', { intent: 'debt_add', lang: 'te', person: 'కిరణ్', amount: 300, direction: 'they_owe' }],
  ])
})

describe('debt: settled', () => {
  table([
    ['paid Ramesh 100', { intent: 'debt_settle', lang: 'en', person: 'Ramesh Traders', amount: 100, direction: 'i_owe' }],
    ['Suresh gave back 500', { intent: 'debt_settle', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['Suresh paid 500', { intent: 'debt_settle', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['I paid Ramesh Traders 2400', { intent: 'debt_settle', person: 'Ramesh Traders', amount: 2400, direction: 'i_owe' }],
    ['received 180 from Lakshmi', { intent: 'debt_settle', person: 'Lakshmi', amount: 180, direction: 'they_owe' }],
    ['got 180 from Lakshmi', { intent: 'debt_settle', person: 'Lakshmi', amount: 180, direction: 'they_owe' }],
    ['Lakshmi paid me back', { intent: 'debt_settle', person: 'Lakshmi', amount: undefined, direction: 'they_owe' }],
    ['repaid Ramesh ₹100', { intent: 'debt_settle', person: 'Ramesh Traders', amount: 100, direction: 'i_owe' }],
    // Hindi
    ['Ramesh ko 100 de diya', { intent: 'debt_settle', lang: 'hi', person: 'Ramesh Traders', amount: 100, direction: 'i_owe' }],
    ['Suresh ne 500 wapas diya', { intent: 'debt_settle', lang: 'hi', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['Suresh se 500 mil gaye', { intent: 'debt_settle', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['Ramesh ka udhaar chuka diya', { intent: 'debt_settle', person: 'Ramesh Traders', amount: undefined }],
    ['रमेश को 100 दे दिया', { intent: 'debt_settle', lang: 'hi', person: 'Ramesh Traders', amount: 100, direction: 'i_owe' }],
    ['सुरेश ने 500 वापस दिए', { intent: 'debt_settle', lang: 'hi', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['लक्ष्मी ने 180 रुपये लौटाए', { intent: 'debt_settle', person: 'Lakshmi', amount: 180, direction: 'they_owe' }],
    // Telugu
    ['రమేష్‌కి 100 ఇచ్చాను', { intent: 'debt_settle', lang: 'te', person: 'Ramesh Traders', amount: 100, direction: 'i_owe' }],
    ['సురేష్ 500 తిరిగి ఇచ్చాడు', { intent: 'debt_settle', lang: 'te', person: 'Suresh', amount: 500, direction: 'they_owe' }],
    ['లక్ష్మి 180 ఇచ్చింది', { intent: 'debt_settle', person: 'Lakshmi', amount: 180, direction: 'they_owe' }],
    ['Ramesh ki 100 ichanu', { intent: 'debt_settle', lang: 'te', person: 'Ramesh Traders', amount: 100, direction: 'i_owe' }],
    ['Suresh 500 tirigi ichadu', { intent: 'debt_settle', lang: 'te', person: 'Suresh', amount: 500, direction: 'they_owe' }],
  ])
})

describe('cash', () => {
  table([
    ['cash in hand is 4500', { intent: 'cash_set', lang: 'en', amount: 4500 }],
    ['cash is ₹4,500', { intent: 'cash_set', amount: 4500 }],
    ['how much cash do I have?', { intent: 'cash_query', lang: 'en' }],
    ['cash?', { intent: 'cash_query' }],
    ['galle mein 4500 hai', { intent: 'cash_set', lang: 'hi', amount: 4500 }],
    ['cash 4500 hai', { intent: 'cash_set', lang: 'hi', amount: 4500 }],
    ['cash kitna hai', { intent: 'cash_query', lang: 'hi' }],
    ['गल्ले में 4500 रुपये हैं', { intent: 'cash_set', lang: 'hi', amount: 4500 }],
    ['हाथ में नकद साढ़े चार हजार', { intent: 'cash_set', amount: 4500 }],
    ['कितना कैश है?', { intent: 'cash_query', lang: 'hi' }],
    ['చేతిలో 4500 ఉంది', { intent: 'cash_set', lang: 'te', amount: 4500 }],
    ['నగదు 4500 రూపాయలు ఉంది', { intent: 'cash_set', lang: 'te', amount: 4500 }],
    ['డబ్బు ఎంత ఉంది?', { intent: 'cash_query', lang: 'te' }],
    ['naa daggara enta dabbu undi', { intent: 'cash_query', lang: 'te' }],
    ['chetilo 4500 undi', { intent: 'cash_set', lang: 'te', amount: 4500 }],
  ])
})

describe('undo, yes/no, unknown', () => {
  table([
    ['undo', { intent: 'undo', lang: 'en' }],
    ['that was a mistake', { intent: 'undo', lang: 'en' }],
    ['Undo that please', { intent: 'undo' }],
    ['galti ho gayi', { intent: 'undo', lang: 'hi' }],
    ['गलती हो गई', { intent: 'undo', lang: 'hi' }],
    ['tappu ayindi', { intent: 'undo', lang: 'te' }],
    ['తప్పు అయింది', { intent: 'undo', lang: 'te' }],
    ['yes', { intent: 'yes' }], ['haan', { intent: 'yes', lang: 'hi' }], ['हाँ', { intent: 'yes' }], ['అవును', { intent: 'yes', lang: 'te' }],
    ['no', { intent: 'no' }], ['nahi', { intent: 'no' }], ['नहीं', { intent: 'no' }], ['కాదు', { intent: 'no' }],
    ['hello there', { intent: 'unknown' }],
    ['', { intent: 'unknown' }],
    ['5 rice', { intent: 'trade_unclear', product: 'Rice' }], // sold or bought? must ask
    ['rice', { intent: 'unknown' }],
  ])
  it('falls back to the interface language when the message has no language signal', () => {
    expect(parse('5 chawal', { ...ctx, fallbackLang: 'hi' }).lang).toBe('hi')
  })
})

describe('agent: plans and safety', () => {
  const run = (msg: string, pending?: Parse) => plan(p(msg), state, pending)
  const cash = (pl: ReturnType<typeof run>) => pl.ops?.find((o) => o.op === 'cash')

  it('sale without a price sells at MRP and adds to cash', () => {
    const pl = run('sold 5 rice')
    expect(pl.ops).toMatchObject([{ op: 'stock', id: 'rice', delta: -5 }, { op: 'insert', row: { type: 'sale', quantity: 5, price: 60, cost: 48 } }, { op: 'cash', delta: 300 }])
  })
  it('sale with a stated price uses it', () => {
    expect(cash(run('sold 5 rice for 240'))).toMatchObject({ delta: 240 })
    expect(run('sold 5 rice for 240').ops?.[1]).toMatchObject({ row: { price: 48 } })
  })
  it('warns about low stock in the reply', () => {
    expect(run('sold 33 rice').reply).toContain('Low stock')
    expect(run('sold 5 rice').reply).not.toContain('Low stock')
  })
  it('refuses to sell more than is in stock', () => {
    const pl = run('sold 50 rice')
    expect(pl.ops).toBeUndefined()
    expect(pl.reply).toContain('42')
  })
  it('purchase reduces cash and updates price, MRP, expiry and shelf', () => {
    const pl = run('got 20 packets of tea at 9 rupees each, MRP 12, expiry 12 March, shelf 3')
    expect(pl.ops).toMatchObject([
      { op: 'stock', id: 'tea', delta: 20 }, { op: 'insert', row: { type: 'purchase', price: 9 } }, { op: 'cash', delta: -180 },
      { op: 'update', patch: { buy_price: 9, mrp: 12, expiry: '2027-03-12', shelf: '3' } },
    ])
  })
  it('unknown product in a purchase asks first, creates only after yes', () => {
    const ask = run('got 20 packets of coffee at 8 rupees each, MRP 10')
    expect(ask.ops).toBeUndefined()
    expect(ask.pending).toBeDefined()
    const done = run('yes', ask.pending)
    expect(done.ops).toMatchObject([{ op: 'insert', table: 'products', row: { name: 'Coffee', quantity: 20, buy_price: 8, mrp: 10 } }, { op: 'insert', table: 'stock_movements' }, { op: 'cash', delta: -160 }])
    expect(run('no', ask.pending).ops).toBeUndefined()
  })
  it('unknown product without full details only asks', () => {
    const pl = run('got 20 coffee')
    expect(pl.ops).toBeUndefined()
    expect(pl.pending).toBeUndefined()
  })
  it('new debt does not touch cash', () => {
    const pl = run('Suresh owes me 500 by 16th November')
    expect(pl.ops).toMatchObject([{ op: 'insert', table: 'debts', row: { person: 'Suresh', amount: 500, direction: 'they_owe', due_date: '2026-11-16', settled: false } }])
  })
  it('paying a debt settles it and reduces cash', () => {
    expect(run('paid Ramesh 100').ops).toMatchObject([{ op: 'update', id: 'Ramesh Traders-100', patch: { settled: true } }, { op: 'cash', delta: -100 }])
  })
  it('money received from a debtor adds to cash; partial payment keeps the rest open', () => {
    expect(run('Suresh gave back 500').ops).toMatchObject([{ op: 'update', patch: { settled: true } }, { op: 'cash', delta: 500 }])
    expect(run('Suresh gave back 200').ops).toMatchObject([{ op: 'update', patch: { amount: 300 } }, { op: 'cash', delta: 200 }])
  })
  it('does not guess between several debts, overpayment, or unknown people', () => {
    expect(run('paid Ramesh 700').ops).toBeUndefined() // two open debts, neither is 700
    expect(run('Suresh gave back 900').ops).toBeUndefined()
    expect(run('paid Gopal 100').ops).toBeUndefined()
    expect(run('paid Suresh 500').ops).toBeUndefined() // Suresh owes me, not the other way round
  })
  it('cash set and query', () => {
    expect(run('cash in hand is 4500').ops).toEqual([{ op: 'cash', set: 4500, reason: 'cash counted' }])
    expect(run('how much cash do I have?').reply).toContain('6,350')
  })
  it('never changes data on an unclear message', () => {
    for (const msg of ['hello', 'sold rice', 'sold 5 saffron', '5 rice', 'sold 5 rice and 2 sugar', 'Gopal owe 100', 'owes me 500', 'Suresh owes me', 'rice'])
      expect(run(msg).ops, msg).toBeUndefined()
  })
  it('replies in the language of the message', () => {
    expect(run('5 चावल बेचा').reply).toMatch(/चावल.*बेचा/)
    expect(run('5 బియ్యం అమ్మాను').reply).toMatch(/బియ్యం.*అమ్మారు/)
    expect(run('5 chawal bech diya').reply).toMatch(/बेचा/)
    expect(run('sold 5 chawal').reply).toMatch(/^Sold 5 kg Rice/)
    expect(run('చావల్ ఎంత ఉంది?').reply).toMatch(/తెలియదు/)
  })
  it('undo is flagged for the caller', () => {
    expect(run('undo')).toMatchObject({ undo: true })
    expect(run('galti ho gayi')).toMatchObject({ undo: true })
  })
})

describe('example chips shown in the chat', async () => {
  const { STR } = await import('../i18n')
  for (const lang of ['en', 'hi', 'te'] as const)
    for (const ex of STR[lang].ui.examples)
      it(`${lang}: ${ex}`, () => {
        const got = p(ex)
        expect(got.intent).not.toBe('unknown')
        expect(got.lang).toBe(lang)
      })
})
