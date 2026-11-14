// Derived numbers for the dashboard and inventory. Pure.
import { addDays } from './parser/dates'
import type { Debt, Movement, Product } from './types'

export const todayISO = () => new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
const localDay = (ts: string) => new Date(ts).toLocaleDateString('en-CA')
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

export function todayTotals(movements: Movement[], today = todayISO()) {
  const sales = movements.filter((m) => m.type === 'sale' && localDay(m.created_at) === today)
  return {
    count: sales.length,
    sales: sales.reduce((s, m) => s + m.price * m.quantity, 0),
    profit: sales.reduce((s, m) => s + (m.price - m.cost) * m.quantity, 0),
  }
}

export interface ProductStats {
  margin: number // rupees per unit at MRP
  marginPct: number // of MRP
  potential: number // margin on current stock
  realised: number // actual profit from recorded sales
  perDay: number // average daily sales
  daysLeft: number | null // days of stock at that rate
  reorder: number // suggested reorder quantity
  expiresIn: number | null // days; negative = expired
  low: boolean
}

const WINDOW = 14 // days of history used for the forecast
const COVER = 14 // reorder suggestion aims for this many days of stock

export function productStats(p: Product, movements: Movement[], today = todayISO()): ProductStats {
  const sales = movements.filter((m) => m.product_id === p.id && m.type === 'sale')
  const since = addDays(today, -(WINDOW - 1))
  const recent = sales.filter((m) => localDay(m.created_at) >= since)
  // Average over 7 to 14 days: a product first sold 3 days ago is still averaged over 7.
  const first = recent.reduce((min, m) => (localDay(m.created_at) < min ? localDay(m.created_at) : min), today)
  const days = Math.min(WINDOW, Math.max(7, daysBetween(first, today) + 1))
  const perDay = recent.reduce((s, m) => s + m.quantity, 0) / days
  const margin = p.mrp - p.buy_price
  return {
    margin,
    marginPct: p.mrp ? (margin / p.mrp) * 100 : 0,
    potential: margin * p.quantity,
    realised: sales.reduce((s, m) => s + (m.price - m.cost) * m.quantity, 0),
    perDay,
    daysLeft: perDay ? p.quantity / perDay : null,
    reorder: Math.max(0, Math.ceil(perDay * COVER - p.quantity)),
    expiresIn: p.expiry ? daysBetween(today, p.expiry) : null,
    low: p.quantity <= p.low_stock_threshold,
  }
}

/** Unsettled debts that need a reminder: due tomorrow, today, or overdue. */
export const dueDebts = (debts: Debt[], today = todayISO()) =>
  debts.filter((d) => !d.settled && d.due_date && daysBetween(today, d.due_date) <= 1).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
