import { useState } from 'react'
import { displayName, money, qtyText } from './agent'
import { STR } from './i18n'
import { norm } from './parser/text'
import { productStats, todayISO } from './stats'
import { doAction, type Data, type Shop } from './store'
import type { Lang, Product } from './types'

type Draft = Omit<Product, 'id' | 'created_at'>
const BLANK: Draft = { name: '', aliases: [], quantity: 0, unit: 'unit', buy_price: 0, mrp: 0, expiry: null, shelf: null, low_stock_threshold: 0 }
const round = (n: number) => String(Math.round(n * 10) / 10)

export default function Inventory({ data, lang, shop, reload }: { data: Data; lang: Lang; shop: Shop; reload: () => Promise<void> }) {
  const { ui, locale } = STR[lang]
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null) // product id, or 'new'
  const [error, setError] = useState<string | null>(null)
  const today = todayISO()
  const q = norm(search.trim())
  const list = data.products.filter((p) => !q || [p.name, ...p.aliases].some((k) => norm(k).includes(q)))

  const save = async (old: Product | null, d: Draft) => {
    setError(null)
    try {
      if (!old) {
        await doAction(shop, 'manual_add', `+ ${d.name}`, [{ op: 'insert', table: 'products', row: { ...d, id: crypto.randomUUID(), created_at: new Date().toISOString() } }])
      } else {
        const patch = Object.fromEntries(Object.entries(d).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(old[k as keyof Draft])))
        if (Object.keys(patch).length) await doAction(shop, 'manual_edit', `✎ ${d.name}`, [{ op: 'update', table: 'products', id: old.id, patch }])
      }
      setEditing(null)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ui.search} aria-label={ui.search} className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base" />
        <button onClick={() => setEditing('new')} className="rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white">+ {ui.addProduct}</button>
      </div>
      {error && <p className="text-red-700">{ui.error}: {error}</p>}
      {editing === 'new' && <Form lang={lang} initial={BLANK} onCancel={() => setEditing(null)} onSave={(d) => save(null, d)} />}
      {!list.length && <p className="text-stone-400">{ui.nothing}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map((p) => {
          if (editing === p.id) return <Form key={p.id} lang={lang} initial={p} onCancel={() => setEditing(null)} onSave={(d) => save(p, d)} />
          const s = productStats(p, data.movements, today)
          const expired = s.expiresIn !== null && s.expiresIn < 0
          const soon = s.expiresIn !== null && s.expiresIn >= 0 && s.expiresIn <= 7
          return (
            <article key={p.id} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">{displayName(p, lang)}</h3>
                  {p.aliases.length > 0 && <p className="truncate text-sm text-stone-500">{p.aliases.join(' · ')}</p>}
                </div>
                <button onClick={() => setEditing(p.id)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold">{ui.edit}</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`text-2xl font-bold ${s.low ? 'text-amber-700' : ''}`}>{qtyText(p.quantity, p.unit, lang)}</span>
                {s.low && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{ui.lowStock}</span>}
                {expired && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{ui.expiredAgo(-s.expiresIn!)}</span>}
                {soon && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{ui.expiresIn(s.expiresIn!)}</span>}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <Row k={ui.shelf} v={p.shelf ?? '—'} />
                <Row k={ui.expiry} v={p.expiry ? new Date(p.expiry + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                <Row k={ui.buyPrice} v={money(p.buy_price)} />
                <Row k={ui.mrp} v={money(p.mrp)} />
                <Row k={`${ui.margin} (${ui.perUnit})`} v={`${money(s.margin)} · ${round(s.marginPct)}%`} />
                <Row k={ui.potentialProfit} v={money(s.potential)} />
                <Row k={ui.realisedProfit} v={money(s.realised)} />
                <Row
                  k={ui.forecast}
                  v={s.perDay ? `${round(s.perDay)}${ui.perDay} · ${ui.daysLeft(Math.floor(s.daysLeft!))}${s.reorder ? ` · ${ui.reorder} ${qtyText(s.reorder, p.unit, lang)}` : ''}` : ui.noSales}
                />
              </dl>
            </article>
          )
        })}
      </div>
    </div>
  )
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="min-w-0">
    <dt className="text-stone-500">{k}</dt>
    <dd className="font-medium">{v}</dd>
  </div>
)

function Form({ lang, initial, onSave, onCancel }: { lang: Lang; initial: Draft; onSave: (d: Draft) => Promise<void>; onCancel: () => void }) {
  const ui = STR[lang].ui
  const [d, setD] = useState({ ...initial, aliasText: initial.aliases.join(', ') })
  const [busy, setBusy] = useState(false)
  const field = (label: string, key: 'name' | 'aliasText' | 'quantity' | 'buy_price' | 'mrp' | 'expiry' | 'shelf' | 'low_stock_threshold', type = 'text', wide = false) => (
    <label className={`block text-sm ${wide ? 'col-span-2' : ''}`}>
      <span className="text-stone-600">{label}</span>
      <input
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        step="any"
        min={type === 'number' ? 0 : undefined}
        required={key === 'name'}
        value={d[key] ?? ''}
        onChange={(e) => setD({ ...d, [key]: type === 'number' ? (e.target.value === '' ? 0 : +e.target.value) : e.target.value || (key === 'expiry' || key === 'shelf' ? null : '') })}
        className="mt-0.5 w-full rounded-lg border border-stone-300 px-2.5 py-2 text-base"
      />
    </label>
  )
  return (
    <form
      className="grid grid-cols-2 gap-3 rounded-2xl border-2 border-emerald-600 bg-white p-4 shadow-sm"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const { aliasText, ...rest } = d
        await onSave({
          name: rest.name.trim(), quantity: rest.quantity, unit: rest.unit, buy_price: rest.buy_price, mrp: rest.mrp,
          expiry: rest.expiry, shelf: rest.shelf, low_stock_threshold: rest.low_stock_threshold,
          aliases: aliasText.split(',').map((a) => a.trim()).filter(Boolean),
        })
        setBusy(false)
      }}
    >
      {field(ui.name, 'name', 'text', true)}
      {field(ui.aliases, 'aliasText', 'text', true)}
      {field(ui.quantity, 'quantity', 'number')}
      <label className="block text-sm">
        <span className="text-stone-600">{ui.unit}</span>
        <select value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-base">
          {Object.entries(ui.units).map(([u, label]) => (
            <option key={u} value={u}>{label}</option>
          ))}
        </select>
      </label>
      {field(ui.buyPrice, 'buy_price', 'number')}
      {field(ui.mrp, 'mrp', 'number')}
      {field(ui.expiry, 'expiry', 'date')}
      {field(ui.shelf, 'shelf')}
      {field(ui.threshold, 'low_stock_threshold', 'number')}
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-stone-300 px-4 py-2.5 font-semibold">{ui.cancel}</button>
        <button type="submit" disabled={busy} className="rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{ui.save}</button>
      </div>
    </form>
  )
}
