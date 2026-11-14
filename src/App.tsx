import { useEffect, useState } from 'react'
import Chat from './Chat'
import Dashboard from './Dashboard'
import Debts from './Debts'
import { STR } from './i18n'
import Inventory from './Inventory'
import { configured, resetDemo, useShop, useStored, type Shop } from './store'
import type { Lang } from './types'
import { Button, ErrorState, Icon, LangSelect, Logo, Skeleton, cx, navigate, type IconName } from './ui'

const TABS: [Tab, IconName][] = [
  ['chat', 'chat'],
  ['dashboard', 'home'],
  ['inventory', 'box'],
  ['debts', 'ledger'],
]
type Tab = 'chat' | 'dashboard' | 'inventory' | 'debts'

export default function App() {
  const [lang, setLang] = useStored<Lang>('sorta.lang', 'en')
  const [shop, setShop] = useStored<Shop>('sorta.shop', 'main')
  const [tab, setTab] = useStored<Tab>('sorta.tab', 'chat')
  const [resetting, setResetting] = useState(false)
  const { data, error, reload } = useShop(shop)
  // Screens always show fresh numbers: reload when switching tabs and when coming back to the app.
  useEffect(() => {
    if (configured) void reload()
  }, [tab, reload])
  useEffect(() => {
    const onFocus = () => configured && void reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = `${STR[lang].ui[tab]} · Sorta`
  }, [lang, tab])
  const ui = STR[lang].ui
  const demo = shop === 'demo'

  const reset = async () => {
    setResetting(true)
    try {
      await resetDemo()
      await reload()
    } finally {
      setResetting(false)
    }
  }

  const demoSwitch = (
    <button
      role="switch"
      aria-checked={demo}
      onClick={() => setShop(demo ? 'main' : 'demo')}
      className={cx(
        'flex min-h-11 items-center gap-2.5 rounded-xl border px-3 text-[15px] font-semibold transition-colors',
        demo ? 'border-sun bg-sun-soft text-ink' : 'border-line-2/60 bg-card text-ink hover:border-ink',
      )}
    >
      <span className={cx('relative h-6 w-10 shrink-0 rounded-full transition-colors', demo ? 'bg-ink' : 'bg-line-2/50')}>
        <span className={cx('absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-200', demo ? 'left-5' : 'left-1')} />
      </span>
      <span className="whitespace-nowrap">{ui.demoShop}</span>
    </button>
  )

  const screen = { lang, shop, reload }
  return (
    <div className="flex h-dvh bg-paper text-ink" lang={lang}>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-card md:flex">
        <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))} className="rounded-lg px-5 pt-6 pb-7" aria-label="Sorta">
          <Logo />
        </a>
        <nav aria-label="Sorta" className="flex flex-col gap-1 px-3">
          {TABS.map(([id, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cx(
                'relative flex min-h-12 items-center gap-3 rounded-xl px-3.5 text-left text-base font-semibold transition-colors',
                tab === id ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-paper hover:text-ink',
              )}
            >
              {tab === id && <span aria-hidden className="absolute top-2.5 bottom-2.5 left-0 w-1 rounded-r-full bg-brand" />}
              <Icon name={icon} />
              {ui[id]}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-line p-4">
          <p className="px-1 text-sm font-semibold text-ink-2">{demo ? ui.demoShop : ui.myShop}</p>
          {demoSwitch}
          <LangSelect lang={lang} setLang={setLang} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center gap-2 border-b border-line bg-card px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
          <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))} className="mr-auto rounded-lg p-1" aria-label="Sorta">
            <Logo size="sm" />
          </a>
          <LangSelect lang={lang} setLang={setLang} className="w-[8.5rem]" />
          {demoSwitch}
        </header>

        {demo && (
          <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-sun bg-sun-soft px-4 py-2 text-sm font-semibold sm:text-[15px]">
            <Icon name="store" className="h-[18px] w-[18px] text-low" />
            <span className="min-w-0 flex-1 basis-48">{ui.demoOn}</span>
            <Button size="sm" variant="quiet" onClick={reset} disabled={resetting} className="bg-card/70">
              <Icon name="refresh" className={cx('h-4 w-4', resetting && 'animate-spin')} />
              {resetting ? ui.loading : ui.resetDemo}
            </Button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto">
          {!configured ? (
            <ErrorState lang={lang} message={ui.notConfigured} />
          ) : error && !data ? (
            <ErrorState lang={lang} message={error} onRetry={() => void reload()} />
          ) : !data ? (
            <Loading tab={tab} label={ui.loading} />
          ) : tab === 'chat' ? (
            <Chat data={data} {...screen} />
          ) : tab === 'dashboard' ? (
            <Dashboard data={data} lang={lang} goTo={setTab} />
          ) : tab === 'inventory' ? (
            <Inventory data={data} {...screen} />
          ) : (
            <Debts data={data} {...screen} />
          )}
        </main>

        {/* Mobile bottom navigation */}
        <nav aria-label="Sorta" className="grid grid-cols-4 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
          {TABS.map(([id, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cx('flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1 text-[13px] font-semibold leading-tight', tab === id ? 'text-brand' : 'text-ink-2')}
            >
              <span className={cx('grid h-8 w-14 place-items-center rounded-full transition-colors', tab === id && 'bg-brand-soft')}>
                <Icon name={icon} className="h-[22px] w-[22px]" />
              </span>
              <span className="max-w-full truncate">{ui[id]}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}

function Loading({ tab, label }: { tab: Tab; label: string }) {
  return (
    <div role="status" aria-label={label} className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
      {tab === 'chat' ? (
        <div className="mx-auto max-w-3xl space-y-4 pt-4">
          <Skeleton className="ml-auto h-12 w-2/3" />
          <Skeleton className="h-24 w-4/5" />
          <Skeleton className="ml-auto h-12 w-1/2" />
          <Skeleton className="h-20 w-3/4" />
        </div>
      ) : (
        <>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-36 w-full rounded-card" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded-card" />
        </>
      )}
    </div>
  )
}
