import { displayName, money, qtyText } from './agent'
import { STR } from './i18n'
import { daysBetween, productStats, todayISO, todayTotals } from './stats'
import type { Data } from './store'
import type { Lang } from './types'
import { Avatar, Badge, Card, DueBadge, EmptyState, Icon, Money, PageHeader, Reminders, cx, shortDate, type IconName } from './ui'

type Tab = 'chat' | 'dashboard' | 'inventory' | 'debts'

export default function Dashboard({ data, lang, goTo }: { data: Data; lang: Lang; goTo: (t: Tab) => void }) {
  const { ui, locale } = STR[lang]
  const today = todayISO()
  const open = data.debts.filter((d) => !d.settled)
  const sum = (dir: string) => open.filter((d) => d.direction === dir).reduce((s, d) => s + d.amount, 0)
  const totals = todayTotals(data.movements, today)
  const stats = data.products.map((p) => ({ p, s: productStats(p, data.movements, today) }))
  const low = stats.filter((x) => x.s.low)
  const expiring = stats.filter((x) => x.s.expiresIn !== null && x.s.expiresIn <= 7).sort((a, b) => a.s.expiresIn! - b.s.expiresIn!)
  const dueSoon = open.filter((d) => d.due_date && daysBetween(today, d.due_date) <= 7)

  const seeAll = (t: Tab) => (
    <button onClick={() => goTo(t)} className="inline-flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-brand hover:bg-brand-soft">
      {ui.seeAll}
      <Icon name="chevron" className="h-4 w-4" />
    </button>
  )

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title={ui.dashboard} note={new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })} />

      <Reminders debts={data.debts} lang={lang} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <section className="col-span-2 flex flex-col justify-between gap-6 overflow-hidden rounded-card bg-brand p-5 text-white shadow-card lg:row-span-2 lg:p-7">
          <div className="flex items-center gap-2 font-semibold text-white/85">
            <Icon name="cash" />
            {ui.cashInHand}
          </div>
          <Money value={data.cash} className="block text-[2.75rem] break-all sm:text-6xl lg:text-7xl" />
          <span aria-hidden className="h-1.5 w-16 rounded-full bg-sun" />
        </section>
        <Stat icon="trend" label={ui.todaySales} value={totals.sales} note={ui.salesCount(totals.count)} />
        <Stat icon="cash" label={ui.todayProfit} value={totals.profit} tone={totals.profit < 0 ? 'out' : 'in'} />
        <Stat icon="out" label={ui.iOwe} value={sum('i_owe')} tone="out" note={ui.openCount(open.filter((d) => d.direction === 'i_owe').length)} />
        <Stat icon="in" label={ui.owedToMe} value={sum('they_owe')} tone="in" note={ui.openCount(open.filter((d) => d.direction === 'they_owe').length)} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        <Card title={ui.debtsDueSoon} icon="bell" tone="out" count={dueSoon.length} action={seeAll('debts')}>
          {dueSoon.length ? (
            <ul className="-mx-1 divide-y divide-line">
              {dueSoon.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-1 py-2.5">
                  <Avatar name={d.person} tone={d.direction === 'i_owe' ? 'out' : 'in'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{d.person}</div>
                    <div className="text-sm text-ink-2">{d.direction === 'i_owe' ? ui.iOwe : ui.owedToMe} · {shortDate(d.due_date!, lang)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cx('figure text-lg', d.direction === 'i_owe' ? 'text-out' : 'text-in')}>{money(d.amount)}</span>
                    <DueBadge d={d} lang={lang} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>{ui.allClear}</EmptyState>
          )}
        </Card>

        <Card title={ui.lowStock} icon="box" tone="low" count={low.length} action={seeAll('inventory')}>
          {low.length ? (
            <ul className="-mx-1 divide-y divide-line">
              {low.map(({ p, s }) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-1 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{displayName(p, lang)}</div>
                    {s.reorder > 0 && <div className="text-sm text-ink-2">{ui.reorder} {qtyText(s.reorder, p.unit, lang)}</div>}
                  </div>
                  <Badge tone="low" icon="alert">{qtyText(p.quantity, p.unit, lang)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>{ui.allClear}</EmptyState>
          )}
        </Card>

        <Card title={ui.expiring} icon="hourglass" tone="exp" count={expiring.length} className="md:col-span-2 lg:col-span-1">
          {expiring.length ? (
            <ul className="-mx-1 divide-y divide-line">
              {expiring.map(({ p, s }) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-1 py-2.5">
                  <span className="min-w-0 truncate font-semibold">{displayName(p, lang)}</span>
                  <Badge tone={s.expiresIn! < 0 ? 'late' : 'exp'} icon={s.expiresIn! < 0 ? 'alert' : 'hourglass'} className="whitespace-normal text-right">
                    {s.expiresIn! < 0 ? ui.expiredAgo(-s.expiresIn!) : ui.expiresIn(s.expiresIn!)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>{ui.allClear}</EmptyState>
          )}
        </Card>
      </div>

      <Card title={ui.recentActivity} icon="clock" tone="brand">
        {data.actions.length ? (
          <ol className="-mx-1 divide-y divide-line">
            {data.actions.slice(0, 8).map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-1 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                <time className="w-36 shrink-0 text-sm tabular-nums text-ink-3">
                  {new Date(a.created_at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </time>
                <span className={cx('min-w-0 flex-1', a.undone && 'text-ink-3 line-through')}>{a.summary}</span>
                {a.undone && (
                  <Badge icon="undo" className="self-start">
                    {ui.undone}
                  </Badge>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon="chat" action={<button onClick={() => goTo('chat')} className="font-semibold text-brand underline-offset-4 hover:underline">{ui.chat}</button>}>
            {ui.noActivity}
          </EmptyState>
        )}
      </Card>
    </div>
  )
}

const Stat = ({ icon, label, value, tone, note }: { icon: IconName; label: string; value: number; tone?: 'in' | 'out'; note?: string }) => (
  <section className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-card p-4 shadow-card lg:p-5">
    <div className={cx('flex items-center gap-1.5 text-sm font-semibold', tone === 'in' ? 'text-in' : tone === 'out' ? 'text-out' : 'text-ink-2')}>
      <Icon name={icon} className="h-4 w-4" />
      <span className="min-w-0">{label}</span>
    </div>
    <Money value={value} className={cx('text-[1.6rem] break-all lg:text-[1.9rem]', tone === 'in' ? 'text-in' : tone === 'out' ? 'text-out' : 'text-ink')} />
    {note && <div className="text-sm text-ink-2">{note}</div>}
  </section>
)
