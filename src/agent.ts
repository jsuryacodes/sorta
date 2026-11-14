// Turns a parsed message into a reply and (when confident) a list of ops to apply. Pure, no I/O.
import { STR } from './i18n'
import type { Parse } from './parser/parse'
import { norm } from './parser/text'
import type { Lang, Op, Product, ShopState } from './types'

export interface Plan {
  reply: string
  ops?: Op[] // present only when data should change
  kind?: string
  pending?: Parse // waiting for a yes/no
  undo?: boolean
}

export const money = (n: number) => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN')
const num = (n: number) => String(Math.round(n * 1000) / 1000)

const SCRIPT: Record<Lang, RegExp> = { en: /^[\x20-\x7e]+$/, hi: /[ऀ-ॿ]/, te: /[ఀ-౿]/ }
/** Product name in the reply language when an alias in that script exists. */
export const displayName = (p: Product, lang: Lang) => (lang === 'en' ? p.name : (p.aliases.find((a) => SCRIPT[lang].test(a)) ?? p.name))
export const qtyText = (q: number, unit: string, lang: Lang) => `${num(q)} ${STR[lang].ui.units[unit] ?? unit}`
export const dateText = (iso: string, lang: Lang) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(STR[lang].locale, { day: 'numeric', month: 'short', year: 'numeric' })

export function plan(p: Parse, s: ShopState, pending?: Parse): Plan {
  const lang = p.lang
  const r = STR[lang].r
  const now = new Date().toISOString()
  const id = () => crypto.randomUUID()

  switch (p.intent) {
    case 'undo':
      return { reply: '', undo: true }
    case 'no':
      return { reply: pending ? r.cancelled : r.nothingPending }
    case 'yes':
      if (pending?.intent === 'purchase') return newProduct({ ...pending, lang }, true)
      return { reply: r.nothingPending }
    case 'cash_query':
      return { reply: r.cash(money(s.cash)) }
    case 'cash_set':
      return { reply: r.cashSet(money(p.amount)), kind: 'cash_set', ops: [{ op: 'cash', set: p.amount, reason: 'cash counted' }] }
    case 'trade_unclear':
      return { reply: r.sellOrBuy(displayName(p.product, lang)) }
    case 'unknown':
      return { reply: r.unknown }

    case 'stock_query': {
      const miss = missingProduct(p)
      if (miss) return { reply: miss }
      const pr = p.product!
      const low = pr.quantity <= pr.low_stock_threshold
      const name = displayName(pr, lang)
      const q = qtyText(pr.quantity, pr.unit, lang)
      return { reply: r.stock(name, q, pr.shelf) + (low ? ' ' + r.lowStock(name, q) : '') }
    }

    case 'sale': {
      const miss = missingProduct(p)
      if (miss) return { reply: miss }
      const pr = p.product!
      const name = displayName(pr, lang)
      if (!p.qty) return { reply: r.askQty(name) }
      if (p.qty > pr.quantity) return { reply: r.notEnough(name, qtyText(pr.quantity, pr.unit, lang)) }
      const total = p.total ?? pr.mrp * p.qty // business rule: no stated price means sold at MRP
      if (!total) return { reply: r.askPrice(name) }
      const left = pr.quantity - p.qty
      const reply =
        r.sold(qtyText(p.qty, pr.unit, lang), name, money(total), money(total / p.qty)) +
        (left <= pr.low_stock_threshold ? ' ' + r.lowStock(name, qtyText(left, pr.unit, lang)) : '')
      return {
        reply,
        kind: 'sale',
        ops: [
          { op: 'stock', id: pr.id, delta: -p.qty },
          { op: 'insert', table: 'stock_movements', row: { id: id(), product_id: pr.id, type: 'sale', quantity: p.qty, price: total / p.qty, cost: pr.buy_price, created_at: now } },
          { op: 'cash', delta: total, reason: `sale: ${num(p.qty)} ${pr.name}` },
        ],
      }
    }

    case 'purchase': {
      if (!p.product) {
        if (p.candidates) return { reply: r.whichProduct(p.candidates.map((c) => displayName(c, lang)).join(', ')) }
        return p.productText ? newProduct(p, false) : { reply: r.askProduct }
      }
      const pr = p.product
      const name = displayName(pr, lang)
      if (!p.qty) return { reply: r.askQty(name) }
      const each = p.unitPrice ?? pr.buy_price
      const total = p.total ?? each * p.qty
      const patch: Record<string, unknown> = {}
      // ponytail: latest buy price replaces the old one; switch to weighted average if mixed-cost stock matters
      if (p.unitPrice !== undefined && p.unitPrice !== pr.buy_price) patch.buy_price = p.unitPrice
      if (p.mrp !== undefined) patch.mrp = p.mrp
      if (p.expiry) patch.expiry = p.expiry
      if (p.shelf) patch.shelf = p.shelf
      const ops: Op[] = [
        { op: 'stock', id: pr.id, delta: p.qty },
        { op: 'insert', table: 'stock_movements', row: { id: id(), product_id: pr.id, type: 'purchase', quantity: p.qty, price: each, cost: each, created_at: now } },
        { op: 'cash', delta: -total, reason: `purchase: ${num(p.qty)} ${pr.name}` },
      ]
      if (Object.keys(patch).length) ops.push({ op: 'update', table: 'products', id: pr.id, patch })
      return { reply: r.bought(qtyText(p.qty, pr.unit, lang), name, money(total), money(each)), kind: 'purchase', ops }
    }

    case 'debt_add': {
      if (!p.person) return { reply: r.askPerson }
      if (!p.amount) return { reply: r.askAmount }
      if (!p.direction) return { reply: r.askDirection(p.person) }
      const due = p.due ? dateText(p.due, lang) : null
      return {
        reply: (p.direction === 'i_owe' ? r.iOweAdded : r.theyOweAdded)(p.person, money(p.amount), due),
        kind: 'debt_add',
        ops: [{ op: 'insert', table: 'debts', row: { id: id(), person: p.person, amount: p.amount, direction: p.direction, due_date: p.due ?? null, settled: false, created_at: now } }],
      }
    }

    case 'debt_settle': {
      if (!p.person) return { reply: r.askPerson }
      const person = p.person
      let open = s.debts.filter((d) => !d.settled && norm(d.person) === norm(person))
      const dirs = new Set(open.map((d) => d.direction))
      if (!p.direction && dirs.size > 1) return { reply: r.askDirection(person) }
      const dir = p.direction ?? open[0]?.direction
      open = open.filter((d) => d.direction === dir)
      if (!open.length) return { reply: r.noDebt(person) }
      const debt = open.find((d) => d.amount === p.amount) ?? (open.length === 1 ? open[0] : undefined)
      if (!debt) return { reply: r.whichDebt(person) }
      const amount = p.amount ?? debt.amount
      if (amount > debt.amount) return { reply: r.tooMuch(person, money(debt.amount)) }
      const rest = debt.amount - amount
      const iPay = dir === 'i_owe'
      return {
        reply: (iPay ? r.paid : r.received)(debt.person, money(amount)) + ' ' + (rest ? r.debtRemaining(money(rest)) : r.debtCleared),
        kind: 'debt_settle',
        ops: [
          { op: 'update', table: 'debts', id: debt.id, patch: rest ? { amount: rest } : { settled: true } },
          { op: 'cash', delta: iPay ? -amount : amount, reason: `${iPay ? 'paid' : 'received from'} ${debt.person}` },
        ],
      }
    }
  }

  function missingProduct(q: { product?: Product; candidates?: Product[]; productText?: string }): string | null {
    if (q.product) return null
    if (q.candidates) return r.whichProduct(q.candidates.map((c) => displayName(c, lang)).join(', '))
    return q.productText ? r.unknownProduct(q.productText) : r.askProduct
  }

  /** Unknown product in a purchase: ask for the details, then for a yes, and only then create it. */
  function newProduct(q: Extract<Parse, { intent: 'sale' | 'purchase' }>, confirmed: boolean): Plan {
    const text = q.productText!
    if (!q.qty || q.unitPrice === undefined || q.mrp === undefined) return { reply: r.newNeeds(text) }
    const unit = q.unit ?? 'unit'
    if (!confirmed) return { reply: r.confirmNew(text, qtyText(q.qty, unit, lang), money(q.unitPrice), money(q.mrp)), pending: q }
    const pid = id()
    const name = /^[a-z\s]+$/.test(text) ? text.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : text
    const total = q.total ?? q.unitPrice * q.qty
    return {
      reply: r.bought(qtyText(q.qty, unit, lang), name, money(total), money(q.unitPrice)),
      kind: 'purchase_new',
      ops: [
        {
          op: 'insert', table: 'products',
          row: { id: pid, name, aliases: [], quantity: q.qty, unit, buy_price: q.unitPrice, mrp: q.mrp, expiry: q.expiry ?? null, shelf: q.shelf ?? null, low_stock_threshold: Math.max(1, Math.round(q.qty * 0.2)), created_at: now },
        },
        { op: 'insert', table: 'stock_movements', row: { id: id(), product_id: pid, type: 'purchase', quantity: q.qty, price: q.unitPrice, cost: q.unitPrice, created_at: now } },
        { op: 'cash', delta: -total, reason: `purchase: ${num(q.qty)} ${name}` },
      ],
    }
  }
}
