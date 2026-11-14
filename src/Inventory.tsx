import { useState } from 'react'
import { displayName, money, qtyText } from './agent'
import { STR } from './i18n'
import { norm } from './parser/text'
import { productStats, todayISO, type ProductStats } from './stats'
import { doAction, type Data, type Shop } from './store'
import type { Lang, Product } from './types'
import { Badge, Banner, Button, EmptyState, Icon, Modal, PageHeader, cx, inputCls, shortDate } from './ui'

type Draft = Omit<Product, 'id' | 'created_at'>
const BLANK: Draft = { name: '', aliases: [], quantity: 0, unit: 'unit', buy_price: 0, mrp: 0, expiry: null, shelf: null, low_stock_threshold: 0 }
const round = (n: number) => String(Math.round(n * 10) / 10)
type Filter = 'all' | 'low' | 'expiring'
const isExpiring = (s: ProductStats) => s.expiresIn !== null && s.expiresIn <= 7

export default function Inventory({ data, lang, shop, reload }: { data: Data; lang: Lang; shop: Shop; reload: () => Promise<void> }) {
  const { ui } = STR[lang]
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<string | null>(null) // product id, or 'new'
  const [error, setError] = useState<string | null>(null)
  const today = todayISO()
  const q = norm(search.trim())
  const all = data.products.map((p) => ({ p, s: productStats(p, data.movements, today) }))
  const counts = { all: all.length, low: all.filter((x) => x.s.low).length, expiring: all.filter((x) => isExpiring(x.s)).length }
  const list = all
    .filter(({ s }) => filter === 'all' || (filter === 'low' ? s.low : isExpiring(s)))
    .filter(({ p }) => !q || [p.name, ...p.aliases].some((k) => norm(k).includes(q)))
  const editProduct = data.products.find((p) => p.id === editing)

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

  const FILTERS: [Filter, string][] = [
    ['all', ui.all],
    ['low', ui.lowStock],
    ['expiring', ui.expiring],
  ]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title={ui.inventory} note={ui.productCount(data.products.length)}>
        <Button onClick={() => setEditing('new')} className="max-sm:hidden">
          <Icon name="plus" />
          {ui.addProduct}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{ui.search}</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ui.search} className={cx(inputCls, 'pl-11')} />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label={ui.filter}>
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={cx(
                'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[15px] font-semibold transition-colors',
                filter === id ? 'border-ink bg-ink text-white' : 'border-line-2/60 bg-card text-ink hover:border-ink',
              )}
            >
              {id === 'low' && <Icon name="alert" className={cx('h-4 w-4', filter !== id && 'text-low')} />}
              {id === 'expiring' && <Icon name="hourglass" className={cx('h-4 w-4', filter !== id && 'text-exp')} />}
              {label}
              <span className={cx('tabular-nums', filter === id ? 'text-white/75' : 'text-ink-3')}>{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && !editing && <Banner>{ui.error}: {error}</Banner>}

      {!list.length ? (
        <div className="rounded-card border border-dashed border-line-2/50 bg-card/60">
          {data.products.length ? (
            <EmptyState icon="search">{ui.noMatch}</EmptyState>
          ) : (
            <EmptyState icon="box" action={<Button onClick={() => setEditing('new')}><Icon name="plus" />{ui.addProduct}</Button>}>
              {ui.noProducts}
            </EmptyState>
          )}
        </div>
      ) : (
        <>
          {/* Phone and tablet: cards */}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden">
            {list.map(({ p, s }) => (
              <li key={p.id}>
                <article className="min-w-0 rounded-card border border-line bg-card p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold leading-snug">{displayName(p, lang)}</h2>
                      {p.aliases.length > 0 && <p className="truncate text-sm text-ink-3">{p.aliases.join(' · ')}</p>}
                    </div>
                    <EditButton label={`${ui.edit}: ${displayName(p, lang)}`} onClick={() => setEditing(p.id)} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className={cx('figure text-[1.75rem]', s.low && 'text-low')}>{qtyText(p.quantity, p.unit, lang)}</span>
                    <StatusBadges s={s} lang={lang} />
                  </div>
                  <StockBar p={p} low={s.low} />
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 text-sm">
                    <Row k={`${ui.buyPrice} / ${ui.mrp}`} v={`${money(p.buy_price)} / ${money(p.mrp)}`} />
                    <Row k={`${ui.margin} (${ui.perUnit})`} v={`${money(s.margin)} · ${round(s.marginPct)}%`} strong={s.margin < 0 ? 'out' : 'in'} />
                    <Row k={ui.potentialProfit} v={money(s.potential)} />
                    <Row k={ui.realisedProfit} v={money(s.realised)} />
                    <Row k={ui.shelf} v={p.shelf ?? '—'} />
                    <Row k={ui.expiry} v={p.expiry ? shortDate(p.expiry, lang, true) : '—'} />
                    <div className="col-span-2">
                      <Row k={ui.forecast} v={forecast(p, s, lang)} />
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-card shadow-card lg:block">
            <table className="w-full text-left text-[15px]">
              <thead className="border-b border-line bg-paper/60 text-[13px] font-bold text-ink-2">
                <tr>
                  <th scope="col" className="px-5 py-3">{ui.product}</th>
                  <th scope="col" className="px-3 py-3">{ui.quantity}</th>
                  <th scope="col" className="px-3 py-3 text-right">{ui.buyPrice} / {ui.mrp}</th>
                  <th scope="col" className="px-3 py-3 text-right">{ui.margin}</th>
                  <th scope="col" className="px-3 py-3 text-right">{ui.potentialProfit}</th>
                  <th scope="col" className="px-3 py-3">{ui.forecast}</th>
                  <th scope="col" className="px-3 py-3"><span className="sr-only">{ui.edit}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map(({ p, s }) => (
                  <tr key={p.id} className="align-top transition-colors hover:bg-paper/50">
                    <td className="px-5 py-3.5">
                      <div className="font-bold">{displayName(p, lang)}</div>
                      <div className="mt-0.5 text-sm text-ink-3">
                        {[p.shelf && `${ui.shelf} ${p.shelf}`, p.expiry && `${ui.expiry} ${shortDate(p.expiry, lang, true)}`].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="w-56 px-3 py-3.5">
                      <div className={cx('figure text-lg', s.low && 'text-low')}>{qtyText(p.quantity, p.unit, lang)}</div>
                      <StockBar p={p} low={s.low} />
                      <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadges s={s} lang={lang} quiet /></div>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">
                      <div className="text-ink-2">{money(p.buy_price)}</div>
                      <div className="font-semibold">{money(p.mrp)}</div>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">
                      <div className={cx('font-bold', s.margin < 0 ? 'text-out' : 'text-in')}>{money(s.margin)}</div>
                      <div className="text-sm text-ink-3">{round(s.marginPct)}%</div>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">
                      <div className="font-semibold">{money(s.potential)}</div>
                      <div className="text-sm text-ink-3">{ui.realisedProfit} {money(s.realised)}</div>
                    </td>
                    <td className="max-w-56 px-3 py-3.5 text-sm text-ink-2">{forecast(p, s, lang)}</td>
                    <td className="px-3 py-3 text-right">
                      <EditButton label={`${ui.edit}: ${displayName(p, lang)}`} onClick={() => setEditing(p.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Floating add button on phones, above the bottom navigation */}
      <button
        onClick={() => setEditing('new')}
        aria-label={ui.addProduct}
        className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white shadow-pop transition-transform active:scale-95 sm:hidden"
      >
        <Icon name="plus" className="h-7 w-7" />
      </button>
      <div className="h-16 sm:hidden" aria-hidden />

      {(editing === 'new' || editProduct) && (
        <Modal title={editProduct ? `${ui.edit}: ${displayName(editProduct, lang)}` : ui.addProduct} closeLabel={ui.cancel} onClose={() => (setEditing(null), setError(null))}>
          {error && <div className="mb-4"><Banner>{ui.error}: {error}</Banner></div>}
          <Form lang={lang} initial={editProduct ?? BLANK} onCancel={() => setEditing(null)} onSave={(d) => save(editProduct ?? null, d)} />
        </Modal>
      )}
    </div>
  )
}

const forecast = (p: Product, s: ProductStats, lang: Lang) => {
  const ui = STR[lang].ui
  return s.perDay
    ? `${round(s.perDay)}${ui.perDay} · ${ui.daysLeft(Math.floor(s.daysLeft!))}${s.reorder ? ` · ${ui.reorder} ${qtyText(s.reorder, p.unit, lang)}` : ''}`
    : ui.noSales
}

function StatusBadges({ s, lang, quiet }: { s: ProductStats; lang: Lang; quiet?: boolean }) {
  const ui = STR[lang].ui
  const expired = s.expiresIn !== null && s.expiresIn < 0
  const soon = s.expiresIn !== null && s.expiresIn >= 0 && s.expiresIn <= 7
  return (
    <>
      {s.low ? <Badge tone="low" icon="alert">{ui.lowStock}</Badge> : !quiet && <Badge tone="in" icon="check">{ui.inStock}</Badge>}
      {expired && <Badge tone="late" icon="alert">{ui.expiredAgo(-s.expiresIn!)}</Badge>}
      {soon && <Badge tone="exp" icon="hourglass">{ui.expiresIn(s.expiresIn!)}</Badge>}
    </>
  )
}

/** Stock relative to three times its low-stock alert level; the tick marks the alert level. */
function StockBar({ p, low }: { p: Product; low: boolean }) {
  if (!p.low_stock_threshold) return null
  const full = p.low_stock_threshold * 3
  return (
    <div aria-hidden className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
      <div className={cx('h-full rounded-full transition-[width] duration-500', low ? 'bg-low' : 'bg-in')} style={{ width: `${Math.min(100, (p.quantity / full) * 100)}%` }} />
      <div className="absolute top-0 h-full w-0.5 bg-ink/40" style={{ left: '33.33%' }} />
    </div>
  )
}

const EditButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick} aria-label={label} title={label} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line-2/50 text-ink-2 transition-colors hover:border-ink hover:bg-paper hover:text-ink">
    <Icon name="edit" className="h-[18px] w-[18px]" />
  </button>
)

const Row = ({ k, v, strong }: { k: string; v: string; strong?: 'in' | 'out' }) => (
  <div className="min-w-0">
    <dt className="text-ink-3">{k}</dt>
    <dd className={cx('font-semibold tabular-nums', strong === 'in' && 'text-in', strong === 'out' && 'text-out')}>{v}</dd>
  </div>
)

function Form({ lang, initial, onSave, onCancel }: { lang: Lang; initial: Draft; onSave: (d: Draft) => Promise<void>; onCancel: () => void }) {
  const ui = STR[lang].ui
  const [d, setD] = useState({ ...initial, aliasText: initial.aliases.join(', ') })
  const [busy, setBusy] = useState(false)
  const field = (label: string, key: 'name' | 'aliasText' | 'quantity' | 'buy_price' | 'mrp' | 'expiry' | 'shelf' | 'low_stock_threshold', type = 'text', wide = false) => (
    <label className={cx('block min-w-0', wide && 'col-span-2')}>
      <span className="mb-1 block text-sm font-semibold text-ink-2">{label}</span>
      <input
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        step="any"
        min={type === 'number' ? 0 : undefined}
        required={key === 'name'}
        autoFocus={key === 'name'}
        value={d[key] ?? ''}
        onChange={(e) => setD({ ...d, [key]: type === 'number' ? (e.target.value === '' ? 0 : +e.target.value) : e.target.value || (key === 'expiry' || key === 'shelf' ? null : '') })}
        className={inputCls}
      />
    </label>
  )
  return (
    <form
      className="grid grid-cols-2 gap-x-3 gap-y-4"
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
      <label className="block min-w-0">
        <span className="mb-1 block text-sm font-semibold text-ink-2">{ui.unit}</span>
        <select value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value })} className={inputCls}>
          {Object.entries(ui.units).map(([u, label]) => (
            <option key={u} value={u}>{label}</option>
          ))}
        </select>
      </label>
      {field(ui.buyPrice, 'buy_price', 'number')}
      {field(ui.mrp, 'mrp', 'number')}
      {field(ui.expiry, 'expiry', 'date')}
      {field(ui.shelf, 'shelf')}
      {field(ui.threshold, 'low_stock_threshold', 'number', true)}
      <div className="col-span-2 mt-1 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="quiet" onClick={onCancel}>{ui.cancel}</Button>
        <Button type="submit" disabled={busy}>
          <Icon name="check" />
          {busy ? ui.loading : ui.save}
        </Button>
      </div>
    </form>
  )
}
