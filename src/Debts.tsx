import { useState } from 'react'
import { money } from './agent'
import { STR } from './i18n'
import { daysBetween, todayISO } from './stats'
import { doAction, type Data, type Shop } from './store'
import type { Debt, Dir, Lang } from './types'
import { Avatar, Badge, Banner, DueBadge, EmptyState, Icon, Money, PageHeader, Reminders, cx, shortDate } from './ui'

export default function Debts({ data, lang, shop, reload }: { data: Data; lang: Lang; shop: Shop; reload: () => Promise<void> }) {
  const { ui, r } = STR[lang]
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

  const section = (dir: Dir) => {
    const pay = dir === 'i_owe'
    const list = data.debts.filter((d) => d.direction === dir && !d.settled)
    const total = list.reduce((s, d) => s + d.amount, 0)
    return (
      <section aria-labelledby={`h-${dir}`} className="min-w-0 overflow-hidden rounded-card border border-line bg-card shadow-card">
        <header className={cx('border-b px-5 pt-4 pb-5', pay ? 'border-out/15 bg-out-soft' : 'border-in/15 bg-in-soft')}>
          <h2 id={`h-${dir}`} className={cx('flex items-center gap-2 font-bold', pay ? 'text-out' : 'text-in')}>
            <Icon name={pay ? 'out' : 'in'} />
            <span className="flex-1">{pay ? ui.iOwe : ui.owedToMe}</span>
            <span className="text-sm font-semibold text-ink-2">{ui.openCount(list.length)}</span>
          </h2>
          <Money value={total} className={cx('mt-2 block text-[2.4rem] break-all', pay ? 'text-out' : 'text-in')} />
          <p className="mt-1 text-sm text-ink-2">{pay ? ui.iOweNote : ui.owedToMeNote}</p>
        </header>
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((d) => {
              const late = d.due_date !== null && daysBetween(today, d.due_date) < 0
              return (
                <li key={d.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-2.5 px-5 py-4', late && 'bg-out-soft/40')}>
                  <Avatar name={d.person} tone={pay ? 'out' : 'in'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[17px] font-bold">{d.person}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="clock" className="h-3.5 w-3.5" />
                        {d.due_date ? `${ui.due} ${shortDate(d.due_date, lang, true)}` : ui.noDueDate}
                      </span>
                      <DueBadge d={d} lang={lang} />
                    </div>
                  </div>
                  <div className={cx('figure text-xl', pay ? 'text-out' : 'text-in')}>{money(d.amount)}</div>
                  <button
                    onClick={() => settle(d)}
                    disabled={busy !== null}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line-2/60 bg-card px-3.5 text-[15px] font-semibold text-ink transition-colors hover:border-in hover:bg-in-soft hover:text-in disabled:opacity-45 sm:w-auto"
                  >
                    <Icon name={busy === d.id ? 'refresh' : 'check'} className={cx('h-[18px] w-[18px]', busy === d.id && 'animate-spin')} />
                    {busy === d.id ? ui.loading : ui.markSettled}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState>{ui.allClear}</EmptyState>
        )}
      </section>
    )
  }

  const settled = data.debts.filter((d) => d.settled)
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title={ui.debts} note={ui.debtsNote} />
      <Reminders debts={data.debts} lang={lang} />
      {error && <Banner>{ui.error}: {error}</Banner>}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {section('they_owe')}
        {section('i_owe')}
      </div>
      {settled.length > 0 && (
        <details className="group rounded-card border border-line bg-card shadow-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-card px-5 font-bold [&::-webkit-details-marker]:hidden">
            <Icon name="check" className="text-in" />
            <span className="flex-1">{ui.settled}</span>
            <span className="rounded-full bg-paper px-2 text-sm tabular-nums text-ink-2">{settled.length}</span>
            <Icon name="chevron" className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-90" />
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {settled.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-ink-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-ink">{d.person}</span> · {d.direction === 'i_owe' ? ui.iOwe : ui.owedToMe}
                </span>
                <Badge icon="check" tone="neutral">{ui.settled}</Badge>
                <span className="tabular-nums line-through">{money(d.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
