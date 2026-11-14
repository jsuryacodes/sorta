import { useState } from 'react'
import Chat from './Chat'
import Dashboard from './Dashboard'
import Debts from './Debts'
import { LANG_NAMES, STR } from './i18n'
import Inventory from './Inventory'
import { configured, resetDemo, useShop, useStored, type Shop } from './store'
import type { Lang } from './types'

const TABS = [
  ['chat', '💬'],
  ['dashboard', '📊'],
  ['inventory', '📦'],
  ['debts', '🤝'],
] as const
type Tab = (typeof TABS)[number][0]

export default function App() {
  const [lang, setLang] = useStored<Lang>('sorta.lang', 'en')
  const [shop, setShop] = useStored<Shop>('sorta.shop', 'main')
  const [tab, setTab] = useStored<Tab>('sorta.tab', 'chat')
  const [resetting, setResetting] = useState(false)
  const { data, error, reload } = useShop(shop)
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

  const screen = { lang, shop, reload }
  return (
    <div className="flex h-dvh flex-col bg-stone-100 text-stone-900" lang={lang}>
      <header className="flex items-center gap-2 bg-emerald-700 px-3 py-2 text-white">
        <h1 className="mr-auto text-xl font-bold tracking-tight">Sorta</h1>
        <select
          aria-label="Language"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="rounded-lg bg-emerald-800 px-2 py-2 text-sm font-medium"
        >
          {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
            <option key={l} value={l}>{LANG_NAMES[l]}</option>
          ))}
        </select>
        <button
          role="switch"
          aria-checked={demo}
          onClick={() => setShop(demo ? 'main' : 'demo')}
          className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${demo ? 'bg-amber-400 text-stone-900' : 'bg-emerald-800'}`}
        >
          <span className={`relative h-5 w-9 rounded-full ${demo ? 'bg-stone-900' : 'bg-emerald-950/60'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${demo ? 'left-4.5' : 'left-0.5'}`} />
          </span>
          {ui.demoShop}
        </button>
      </header>

      {demo && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-3 py-2 text-sm text-amber-950">
          <span>{ui.demoOn}</span>
          <button onClick={reset} disabled={resetting} className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-stone-900 disabled:opacity-50">
            {resetting ? ui.loading : ui.resetDemo}
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto">
          {!configured ? (
            <p className="p-4 text-red-700">{ui.notConfigured}</p>
          ) : error && !data ? (
            <p className="p-4 text-red-700">{ui.error}: {error}</p>
          ) : !data ? (
            <p className="p-4 text-stone-500">{ui.loading}</p>
          ) : tab === 'chat' ? (
            <Chat data={data} {...screen} />
          ) : tab === 'dashboard' ? (
            <Dashboard data={data} lang={lang} />
          ) : tab === 'inventory' ? (
            <Inventory data={data} {...screen} />
          ) : (
            <Debts data={data} {...screen} />
          )}
        </main>
        <nav className="flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:order-first md:w-44 md:flex-col md:border-r md:border-t-0 md:p-2">
          {TABS.map(([id, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium md:flex-none md:flex-row md:gap-3 md:rounded-xl md:px-3 md:py-3 md:text-base ${
                tab === id ? 'text-emerald-700 md:bg-emerald-50' : 'text-stone-500'
              }`}
            >
              <span className="text-xl" aria-hidden>{icon}</span>
              {ui[id]}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
