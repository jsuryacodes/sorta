import { useState } from 'react'
import { money } from './agent'
import { STR } from './i18n'
import { daysBetween, todayISO } from './stats'
import { doAction, type Data, type Shop } from './store'
import type { Debt, Dir, Lang } from './types'
import { Card, Reminders, dueLabel } from './ui'

export default function Debts({ data, lang, shop, reload }: { data: Data; lang: Lang; shop: Shop; reload: () => Promise<void> }) {
  const { ui, r, locale } = STR[lang]
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = todayISO()

  // Same effect as telling the chat "paid X" / "X gave back": settles the debt and moves cash.
  const settle = async (d: Debt) => {
    setBusy(d.id)
    setError(null)
    try {
      const iPay = d.direction === 'i_owe'
      await doAction(shop, 'debt_settle', `${(iPay ? r.paid : r.received)(d.person, money(d.amount))} ${r.debtCleared}`, [
        { op: 'update', table: 'debts', id: d.id, patch: { settled: true } },
        { op: 'cash', delta: iPay ? -d.amount : d.amount, reason: `${iPay ? 'paid' : 'received from'} ${d.person}` },
      ])
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const section = (dir: Dir, title: string, tone: string) => {
    const list = data.debts.filter((d) => d.direction === dir && !d.settled)
    return (
      <Card title={`${title} · ${money(list.reduce((s, d) => s + d.amount, 0))}`}>
        {list.length ? (
          <ul className="divide-y divide-stone-100">
            {list.map((d) => {
              const urgent = d.due_date && daysBetween(today, d.due_date) <= 1
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{d.person}</div>
                    <div className={`text-sm ${urgent ? 'font-semibold text-red-700' : 'text-stone-500'}`}>
                      {d.due_date
                        ? `${ui.due}: ${new Date(d.due_date + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}${dueLabel(d, lang) ? ` · ${dueLabel(d, lang)}` : ''}`
                        : ui.noDueDate}
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${tone}`}>{money(d.amount)}</div>
                  <button onClick={() => settle(d)} disabled={busy !== null} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {busy === d.id ? ui.loading : ui.markSettled}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-stone-400">{ui.nothing}</p>
        )}
      </Card>
    )
  }

  const settled = data.debts.filter((d) => d.settled)
  return (
    <div className="space-y-3 p-3">
      <Reminders debts={data.debts} lang={lang} />
      {error && <p className="text-red-700">{ui.error}: {error}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {section('i_owe', ui.iOwe, 'text-red-700')}
        {section('they_owe', ui.owedToMe, 'text-emerald-700')}
      </div>
      {settled.length > 0 && (
        <Card title={ui.settled}>
          <ul className="divide-y divide-stone-100 text-stone-500">
            {settled.map((d) => (
              <li key={d.id} className="flex justify-between py-2">
                <span>{d.person} · {d.direction === 'i_owe' ? ui.iOwe : ui.owedToMe}</span>
                <span className="line-through">{money(d.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
