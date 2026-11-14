// The design system: icons, logo and the shared pieces every screen is built from.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { money } from './agent'
import { LANG_NAMES, STR } from './i18n'
import { daysBetween, dueDebts, todayISO } from './stats'
import type { Debt, Lang } from './types'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------- Icons (24px grid, stroke) ----------
const ICONS = {
  chat: 'M21 12a8 8 0 0 1-8 8H4l2.3-3.1A8 8 0 1 1 21 12Z',
  home: 'M4 20V10l8-6 8 6v10h-5v-6H9v6H4Z',
  box: 'M3 8l9-5 9 5v8l-9 5-9-5V8Zm0 0l9 5 9-5M12 13v8',
  ledger: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 5h6M9 12h6M9 16h3',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 5h4',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  send: 'M12 20V5m-6 6 6-6 6 6',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4.5 4.5',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0-14v5l3 2',
  alert: 'M12 4 2.5 20h19L12 4Zm0 6v4.5m0 2.7v.3',
  in: 'M17 7 7 17m0-8v8h8',
  out: 'M7 17 17 7m-8 0h8v8',
  globe: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  x: 'M6 6l12 12M18 6 6 18',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5',
  mic: 'M12 15a3 3 0 0 1-3-3V6a3 3 0 0 1 6 0v6a3 3 0 0 1-3 3Zm-6-3a6 6 0 0 0 12 0m-6 6v3',
  cash: 'M3 7h18v10H3V7Zm9 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10v4m12-4v4',
  trend: 'M3 17l6-6 4 4 8-8m-5 0h5v5',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  store: 'M4 10v10h16V10M3 4h18l-1 6H4L3 4Zm6 16v-5h6v5',
  chevron: 'm9 6 6 6-6 6',
  hourglass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9m8-18c0 5-8 5-8 9s8 4 8 9',
  lock: 'M6 11h12v10H6V11Zm2 0V8a4 4 0 0 1 8 0v3',
} as const
export type IconName = keyof typeof ICONS

export const Icon = ({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cx('shrink-0', className)}>
    <path d={ICONS[name]} />
  </svg>
)

// ---------- Logo ----------
export const LogoMark = ({ className = 'h-8 w-8' }: { className?: string }) => (
  <svg viewBox="0 0 32 32" aria-hidden className={cx('shrink-0', className)}>
    <path d="M7 3h18a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H15l-7 5v-5H7a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Z" fill="#2233b0" />
    <rect x="8" y="8" width="16" height="3" rx="1.5" fill="#fff" />
    <rect x="8" y="12.5" width="11.5" height="3" rx="1.5" fill="#fff" />
    <rect x="8" y="17" width="7" height="3" rx="1.5" fill="#ffb81c" />
  </svg>
)
export const Logo = ({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' }) => (
  <span className={cx('inline-flex items-center gap-2', className)}>
    <LogoMark className={size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'} />
    <span lang="en" className={cx('font-extrabold leading-none tracking-tight', size === 'sm' ? 'text-[1.4rem]' : 'text-[1.6rem]')}>sorta</span>
  </span>
)

// ---------- Buttons and inputs ----------
const BTN = {
  primary: 'bg-brand text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-brand-dark active:bg-brand-dark',
  secondary: 'border-2 border-ink bg-card text-ink hover:bg-paper active:bg-line',
  quiet: 'border border-line-2/60 bg-card text-ink hover:border-ink hover:bg-paper active:bg-line',
  ghost: 'text-ink-2 hover:bg-ink/5 hover:text-ink active:bg-ink/10',
  sun: 'bg-sun text-ink shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] hover:brightness-95 active:brightness-90',
}
const SIZE = { sm: 'min-h-10 px-3 text-sm', md: 'min-h-12 px-4 text-[15px]', lg: 'min-h-14 px-6 text-lg' }
export const btn = (variant: keyof typeof BTN = 'primary', size: keyof typeof SIZE = 'md') =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold leading-tight transition-[background-color,border-color,color,transform,filter] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
    BTN[variant],
    SIZE[size],
  )

export const Button = ({ variant, size, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; size?: keyof typeof SIZE }) => (
  <button type="button" {...p} className={cx(btn(variant, size), className)} />
)

export const inputCls =
  'w-full min-h-12 rounded-xl border border-line-2/70 bg-card px-3.5 text-base text-ink placeholder:text-ink-3 transition-colors hover:border-ink-2 focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand'
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, className)} />

// ---------- Surfaces ----------
export const Card = ({
  title,
  icon,
  count,
  action,
  children,
  className,
  tone,
}: {
  title?: string
  icon?: IconName
  count?: number
  action?: ReactNode
  children: ReactNode
  className?: string
  tone?: Tone
}) => (
  <section className={cx('min-w-0 rounded-card border border-line bg-card p-4 shadow-card sm:p-5', className)}>
    {title && (
      <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-bold text-ink">
        {icon && (
          <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', TONE[tone ?? 'neutral'])}>
            <Icon name={icon} className="h-[18px] w-[18px]" />
          </span>
        )}
        <span className="min-w-0 flex-1">{title}</span>
        {count !== undefined && count > 0 && <span className="rounded-full bg-paper px-2 text-sm font-bold tabular-nums text-ink-2">{count}</span>}
        {action}
      </h2>
    )}
    {children}
  </section>
)

const TONE = {
  neutral: 'bg-paper text-ink-2',
  brand: 'bg-brand-soft text-brand',
  in: 'bg-in-soft text-in',
  out: 'bg-out-soft text-out',
  low: 'bg-low-soft text-low',
  exp: 'bg-exp-soft text-exp',
  late: 'bg-late text-white',
  sun: 'bg-sun text-ink',
}
export type Tone = keyof typeof TONE
export const Badge = ({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: IconName; children: ReactNode; className?: string }) => (
  <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-bold', TONE[tone], className)}>
    {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
    {children}
  </span>
)

export const Banner = ({ tone = 'out', icon = 'alert', children, action }: { tone?: 'out' | 'sun' | 'brand'; icon?: IconName; children: ReactNode; action?: ReactNode }) => (
  <div
    role={tone === 'out' ? 'alert' : 'status'}
    className={cx(
      'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-3.5 py-3 font-semibold',
      tone === 'out' ? 'border-out/25 bg-out-soft text-out' : tone === 'sun' ? 'border-sun bg-sun-soft text-ink' : 'border-brand/20 bg-brand-soft text-brand',
    )}
  >
    <Icon name={icon} />
    <div className="min-w-0 flex-1 basis-40 text-ink">{children}</div>
    {action}
  </div>
)

export const EmptyState = ({ icon = 'check', children, action }: { icon?: IconName; children: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2.5 px-4 py-6 text-center text-ink-2">
    <span className="grid h-11 w-11 place-items-center rounded-full bg-paper text-ink-3">
      <Icon name={icon} />
    </span>
    <p className="max-w-xs">{children}</p>
    {action}
  </div>
)

export const ErrorState = ({ lang, message, onRetry }: { lang: Lang; message?: string; onRetry?: () => void }) => {
  const ui = STR[lang].ui
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-out-soft text-out">
        <Icon name="alert" className="h-7 w-7" />
      </span>
      <h2 className="text-xl font-bold">{ui.error}</h2>
      {message && <p className="break-words text-ink-2">{message}</p>}
      {onRetry && (
        <Button onClick={onRetry} className="mt-2">
          <Icon name="refresh" />
          {ui.retry}
        </Button>
      )}
    </div>
  )
}

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx('skeleton', className)} />

/** Screen header: title with an optional one-line note and actions on the right. */
export const PageHeader = ({ title, note, children }: { title: string; note?: ReactNode; children?: ReactNode }) => (
  <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
    <div className="min-w-0">
      <h1 className="display text-[1.75rem] sm:text-[2rem]">{title}</h1>
      {note && <p className="mt-1 text-ink-2">{note}</p>}
    </div>
    {children}
  </header>
)

/** A money figure that counts to its new value when the number changes. */
export function Money({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = from.current
    from.current = value
    if (start === value || matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value)
    const t0 = performance.now()
    let raf = requestAnimationFrame(function tick(t) {
      const k = Math.min(1, (t - t0) / 450)
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
      else setShown(value)
    })
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className={cx('figure', className)}>{money(shown)}</span>
}

/** Initial-letter avatar for a person. */
export const Avatar = ({ name, tone = 'neutral' }: { name: string; tone?: Tone }) => (
  <span aria-hidden className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold', TONE[tone])}>
    {[...name.trim()][0]?.toUpperCase() ?? '?'}
  </span>
)

/** Native modal dialog: focus is trapped, Escape and the backdrop close it. */
export function Modal({ title, closeLabel, onClose, children }: { title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    if (!d.open) d.showModal()
    return () => d.close()
  }, [])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => (e.preventDefault(), onClose())}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none animate-rise rounded-t-card bg-card p-0 text-ink shadow-pop sm:m-auto sm:max-w-xl sm:rounded-card"
    >
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-card px-5 py-3.5">
        <h2 id="modal-title" className="min-w-0 flex-1 text-lg font-bold">{title}</h2>
        <button onClick={onClose} aria-label={closeLabel} className="grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-paper hover:text-ink">
          <Icon name="x" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  )
}

// ---------- Navigation ----------
export const navigate = (to: string) => {
  history.pushState(null, '', to)
  dispatchEvent(new PopStateEvent('popstate'))
  scrollTo(0, 0)
}

export function LangSelect({ lang, setLang, className }: { lang: Lang; setLang: (l: Lang) => void; className?: string }) {
  return (
    <label className={cx('relative inline-flex items-center', className)}>
      <span className="sr-only">{STR[lang].ui.language}</span>
      <Icon name="globe" className="pointer-events-none absolute left-3 h-[18px] w-[18px] text-ink-2" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-line-2/60 bg-card py-1 pr-8 pl-9 text-[15px] font-semibold text-ink transition-colors hover:border-ink"
      >
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
          <option key={l} value={l} lang={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
      <Icon name="chevron" className="pointer-events-none absolute right-2.5 h-4 w-4 rotate-90 text-ink-2" />
    </label>
  )
}

// ---------- Dates ----------
export const shortDate = (iso: string, lang: Lang, year = false) =>
  new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString(STR[lang].locale, { day: 'numeric', month: 'short', ...(year && { year: 'numeric' }) })

// ---------- Debts ----------
export const dueLabel = (d: Debt, lang: Lang) => {
  const ui = STR[lang].ui
  if (!d.due_date) return ui.noDueDate
  const days = daysBetween(todayISO(), d.due_date)
  return days < 0 ? ui.overdue : days === 0 ? ui.dueToday : days === 1 ? ui.dueTomorrow : null
}
export const DueBadge = ({ d, lang }: { d: Debt; lang: Lang }) => {
  if (!d.due_date) return null
  const days = daysBetween(todayISO(), d.due_date)
  const label = dueLabel(d, lang)
  return label ? <Badge tone={days < 0 ? 'late' : 'low'} icon={days < 0 ? 'alert' : 'clock'}>{label}</Badge> : null
}

/** Debts due tomorrow, today, or overdue: shown as prominent reminder cards. */
export function Reminders({ debts, lang, compact }: { debts: Debt[]; lang: Lang; compact?: boolean }) {
  const ui = STR[lang].ui
  const due = dueDebts(debts)
  if (!due.length) return null
  return (
    <section aria-label={ui.reminders} className="overflow-hidden rounded-card border border-out/25 bg-card shadow-card">
      <h2 className="flex items-center gap-2 bg-out-soft px-4 py-2.5 text-[15px] font-bold text-out">
        <Icon name="bell" className="h-[18px] w-[18px]" />
        <span className="flex-1">{ui.reminders}</span>
        <span className="rounded-full bg-out px-2 text-sm tabular-nums text-white">{due.length}</span>
      </h2>
      <ul className={cx('divide-y divide-line', compact && 'max-h-44 overflow-y-auto')}>
        {due.map((d) => {
          const pay = d.direction === 'i_owe'
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={d.person} tone={pay ? 'out' : 'in'} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{(pay ? ui.reminderPay : ui.reminderCollect)(d.person, money(d.amount), dueLabel(d, lang)!)}</p>
              </div>
              <DueBadge d={d} lang={lang} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
