import { displayName, money, qtyText } from './agent'
import { STR } from './i18n'
import { daysBetween, productStats, todayISO, todayTotals } from './stats'
import type { Data } from './store'
import type { Lang } from './types'
import { Card, Reminders, dueLabel } from './ui'

export default function Dashboard({ data, lang }: { data: Data; lang: Lang }) {
  const ui = STR[lang].ui
  const today = todayISO()
  const open = data.debts.filter((d) => !d.settled)
  const sum = (dir: string) => open.filter((d) => d.direction === dir).reduce((s, d) => s + d.amount, 0)
  const totals = todayTotals(data.movements, today)
  const stats = data.products.map((p) => ({ p, s: productStats(p, data.movements, today) }))
  const low = stats.filter((x) => x.s.low)
  const expiring = stats.filter((x) => x.s.expiresIn !== null && x.s.expiresIn <= 7).sort((a, b) => a.s.expiresIn! - b.s.expiresIn!)
  const dueSoon = open.filter((d) => d.due_date && daysBetween(today, d.due_date) <= 7)
  const date = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString(STR[lang].locale, { day: 'numeric', month: 'short' })

  const Stat = ({ label, value, tone = 'text-stone-900' }: { label: string; value: string; tone?: string }) => (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="text-sm text-stone-500">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  )
  const Empty = () => <p className="text-stone-400">{ui.nothing}</p>

  return (
    <div className="space-y-3 p-3">
      <Reminders debts={data.debts} lang={lang} />
      <div className="rounded-2xl bg-emerald-700 p-4 text-white shadow-sm">
        <div className="text-sm opacity-80">{ui.cashInHand}</div>
        <div className="text-4xl font-bold">{money(data.cash)}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={ui.todaySales} value={money(totals.sales)} />
        <Stat label={ui.todayProfit} value={money(totals.profit)} tone="text-emerald-700" />
        <Stat label={ui.iOwe} value={money(sum('i_owe'))} tone="text-red-700" />
        <Stat label={ui.owedToMe} value={money(sum('they_owe'))} tone="text-emerald-700" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card title={ui.debtsDueSoon}>
          {dueSoon.length ? (
            <ul className="divide-y divide-stone-100">
              {dueSoon.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{d.person}</span>
                    <span className="block text-sm text-stone-500">
                      {d.direction === 'i_owe' ? ui.iOwe : ui.owedToMe} · {dueLabel(d, lang) ?? date(d.due_date!)}
                    </span>
                  </span>
                  <span className={`font-semibold ${d.direction === 'i_owe' ? 'text-red-700' : 'text-emerald-700'}`}>{money(d.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </Card>
        <Card title={ui.lowStock}>
          {low.length ? (
            <ul className="divide-y divide-stone-100">
              {low.map(({ p, s }) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="font-medium">{displayName(p, lang)}</span>
                  <span className="text-right">
                    <span className="font-semibold text-amber-700">{qtyText(p.quantity, p.unit, lang)}</span>
                    {s.reorder > 0 && <span className="block text-sm text-stone-500">{ui.reorder} {qtyText(s.reorder, p.unit, lang)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </Card>
        <Card title={ui.expiring}>
          {expiring.length ? (
            <ul className="divide-y divide-stone-100">
              {expiring.map(({ p, s }) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="font-medium">{displayName(p, lang)}</span>
                  <span className={`text-right text-sm font-semibold ${s.expiresIn! < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                    {s.expiresIn! < 0 ? ui.expiredAgo(-s.expiresIn!) : ui.expiresIn(s.expiresIn!)}
                  </span>
                </li>
              ))}
            </ul>
          ) : <Empty />}
        </Card>
      </div>
    </div>
  )
}
