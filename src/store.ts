// Supabase access and the one hook that loads a shop's data.
import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import type { Action, Debt, Message, Movement, Op, Product, ShopState } from './types'

export type Shop = 'main' | 'demo'
export interface Data extends ShopState {
  messages: Message[]
  undone: Set<string> // ids of actions that were undone
  actions: Action[] // newest first
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = Boolean(url && key)
const sb = configured ? createClient(url!, key!) : null!

async function load(shop: Shop): Promise<Data> {
  const [s, p, d, m, msg, a] = await Promise.all([
    sb.from('shops').select('cash,seeded_at').eq('id', shop).single(),
    sb.from('products').select('*').eq('shop_id', shop).order('name'),
    sb.from('debts').select('*').eq('shop_id', shop).order('due_date', { nullsFirst: false }),
    // ponytail: newest 1000 movements only (PostgREST page cap); move profit/forecast sums into SQL when a shop outgrows it
    sb.from('stock_movements').select('*').eq('shop_id', shop).order('created_at', { ascending: false }).limit(1000),
    sb.from('messages').select('*').eq('shop_id', shop).order('seq', { ascending: false }).limit(200),
    sb.from('action_log').select('id,summary,undone,created_at').eq('shop_id', shop).order('seq', { ascending: false }).limit(500),
  ])
  const err = [s, p, d, m, msg, a].find((r) => r.error)?.error
  if (err) throw err
  // Keep the demo "live": reseed when it was last seeded on an earlier day.
  if (shop === 'demo' && new Date(s.data!.seeded_at).toDateString() !== new Date().toDateString()) {
    await resetDemo()
    return load(shop)
  }
  return {
    cash: s.data!.cash,
    products: p.data as Product[],
    debts: d.data as Debt[],
    movements: m.data as Movement[],
    messages: (msg.data as Message[]).reverse(),
    undone: new Set((a.data as Action[]).filter((x) => x.undone).map((x) => x.id)),
    actions: a.data as Action[],
  }
}

const unwrap = <T,>(r: { data: T | null; error: unknown }): T => {
  if (r.error) throw r.error
  return r.data as T
}

export const doAction = async (shop: Shop, kind: string, summary: string, ops: Op[]) =>
  unwrap<Action>(await sb.rpc('do_action', { p_shop: shop, p_kind: kind, p_summary: summary, p_ops: ops }))
export const undoAction = async (shop: Shop, id?: string) =>
  unwrap<Action>(await sb.rpc('undo_action', { p_shop: shop, p_action: id ?? null }))
export const addMessages = async (shop: Shop, rows: { role: 'user' | 'agent'; text: string; action_id?: string | null }[]) =>
  unwrap(await sb.from('messages').insert(rows.map((r) => ({ ...r, shop_id: shop }))))
export const resetDemo = async () => unwrap(await sb.rpc('reset_demo'))

export function useShop(shop: Shop) {
  const [state, setState] = useState<{ shop: Shop; data: Data } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      const data = await load(shop)
      setState({ shop, data })
      setError(null)
    } catch (e) {
      setError((e as Error).message ?? String(e))
    }
  }, [shop])
  useEffect(() => {
    if (configured) void reload()
  }, [reload])
  return { data: state?.shop === shop ? state.data : null, error, reload }
}

export function useStored<T extends string>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => (localStorage.getItem(key) as T | null) ?? initial)
  return [v, (next: T) => (localStorage.setItem(key, next), setV(next))] as const
}
