export type Lang = 'en' | 'hi' | 'te'
export type Dir = 'i_owe' | 'they_owe'

export interface Product {
  id: string
  name: string
  aliases: string[]
  quantity: number
  unit: string
  buy_price: number
  mrp: number
  expiry: string | null
  shelf: string | null
  low_stock_threshold: number
  created_at: string
}

export interface Movement {
  id: string
  product_id: string
  type: 'sale' | 'purchase'
  quantity: number
  price: number
  cost: number
  created_at: string
}

export interface Debt {
  id: string
  person: string
  amount: number
  direction: Dir
  due_date: string | null
  settled: boolean
  created_at: string
}

export interface Message {
  seq: number
  role: 'user' | 'agent'
  text: string
  action_id: string | null
  created_at: string
}

export interface Action {
  id: string
  summary: string | null
  undone: boolean
}

/** Primitive ops understood by the apply_ops() SQL function. */
export type Op =
  | { op: 'stock'; id: string; delta: number }
  | { op: 'cash'; delta?: number; set?: number; reason: string }
  | { op: 'insert'; table: 'products' | 'stock_movements' | 'debts'; row: Record<string, unknown> }
  | { op: 'update'; table: 'products' | 'debts'; id: string; patch: Record<string, unknown> }

export interface ShopState {
  cash: number
  products: Product[]
  debts: Debt[]
  movements: Movement[]
}
