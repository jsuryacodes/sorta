// Small shared pieces used by several screens.
import type { ReactNode } from 'react'
import { money } from './agent'
import { STR } from './i18n'
import { daysBetween, dueDebts, todayISO } from './stats'
import type { Debt, Lang } from './types'

export const Card = ({ title, children, tone = '' }: { title?: string; children: ReactNode; tone?: string }) => (
  <section className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm ${tone}`}>
    {title && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>}
    {children}
  </section>
)

export const dueLabel = (d: Debt, lang: Lang) => {
  const ui = STR[lang].ui
  if (!d.due_date) return ui.noDueDate
  const days = daysBetween(todayISO(), d.due_date)
  return days < 0 ? ui.overdue : days === 0 ? ui.dueToday : days === 1 ? ui.dueTomorrow : null
}

/** Prominent banners for debts due tomorrow, today, or overdue. */
export function Reminders({ debts, lang }: { debts: Debt[]; lang: Lang }) {
  const ui = STR[lang].ui
  const due = dueDebts(debts)
  if (!due.length) return null
  return (
    <div className="space-y-2">
      {due.map((d) => (
        <div key={d.id} role="alert" className="flex items-start gap-2 rounded-xl border-l-4 border-red-500 bg-red-50 px-3 py-2.5 font-medium text-red-900">
          <span aria-hidden>🔔</span>
          <span>{(d.direction === 'i_owe' ? ui.reminderPay : ui.reminderCollect)(d.person, money(d.amount), dueLabel(d, lang)!)}</span>
        </div>
      ))}
    </div>
  )
}
