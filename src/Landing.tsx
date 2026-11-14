import { useEffect, type MouseEvent } from 'react'
import { money, qtyText } from './agent'
import { LANG_NAMES, STR } from './i18n'
import { useStored, type Shop } from './store'
import type { Lang } from './types'
import { Icon, LangSelect, Logo, LogoMark, btn, cx, navigate, type IconName } from './ui'

const FEATURE_ICONS: IconName[] = ['box', 'ledger', 'cash', 'bell', 'undo', 'globe']

export default function Landing() {
  const [lang, setLang] = useStored<Lang>('sorta.lang', 'en')
  const { ui, r, land } = STR[lang]
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = `Sorta · ${ui.tagline}`
  }, [lang, ui.tagline])

  const open = (shop: Shop) => (e: MouseEvent) => {
    e.preventDefault()
    localStorage.setItem('sorta.shop', shop)
    localStorage.setItem('sorta.tab', 'chat')
    navigate('/app')
  }
  const ctas = (dark = false) => (
    <div className="flex flex-col gap-3 sm:flex-row">
      <a href="/app" onClick={open('demo')} className={cx(btn(dark ? 'sun' : 'primary', 'lg'), 'group')}>
        {land.tryDemo}
        <Icon name="arrow" className="transition-transform group-hover:translate-x-0.5" />
      </a>
      <a href="/app" onClick={open('main')} className={cx(btn('secondary', 'lg'), dark && 'border-white/70 bg-transparent text-white hover:bg-white/10 active:bg-white/15')}>
        <Icon name="store" />
        {land.openShop}
      </a>
    </div>
  )

  return (
    <div lang={lang} className="min-h-full bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="mr-auto rounded-lg" aria-label="Sorta">
            <Logo />
          </a>
          <LangSelect lang={lang} setLang={setLang} className="w-[8.5rem]" />
          <a href="/app" onClick={open('main')} className={cx(btn('quiet', 'md'), 'max-sm:hidden')}>
            {land.openShop}
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-20 lg:pb-24">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-sm font-semibold text-ink-2">
              <span className="h-2 w-2 rounded-full bg-sun" aria-hidden />
              {land.eyebrow}
            </p>
            <h1 className={cx('display mt-5', lang === 'en' ? 'text-[2.6rem] sm:text-6xl lg:text-[4.25rem]' : 'text-[2.25rem] sm:text-5xl lg:text-[3.4rem]')}>{land.heroTitle}</h1>
            <p className="mt-5 max-w-xl text-lg text-ink-2 sm:text-xl">{land.heroSub}</p>
            <div className="mt-8">{ctas()}</div>
            <p className="mt-5 flex max-w-xl items-start gap-2 text-sm text-ink-2">
              <Icon name="lock" className="mt-0.5 h-4 w-4" />
              {land.preview}
            </p>
          </div>
          {demoCard()}
        </section>

        {/* Problem and solution */}
        <section className="border-y border-line bg-card">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 lg:gap-20 lg:py-24">
            <div>
              <p className="text-sm font-bold text-out">01</p>
              <h2 className="display mt-2 text-3xl sm:text-4xl">{land.problemTitle}</h2>
              <p className="mt-4 text-lg text-ink-2">{land.problemBody}</p>
            </div>
            <div>
              <p className="text-sm font-bold text-in">02</p>
              <h2 className="display mt-2 text-3xl sm:text-4xl">{land.solutionTitle}</h2>
              <p className="mt-4 text-lg text-ink-2">{land.solutionBody}</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="display max-w-2xl text-3xl sm:text-4xl">{land.featuresTitle}</h2>
          <ul className="mt-10 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {land.features.map((f, i) => (
              <li key={f.t} className="bg-card p-6 lg:p-7">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={FEATURE_ICONS[i]} className="h-[22px] w-[22px]" />
                </span>
                <h3 className="mt-4 text-lg font-bold">{f.t}</h3>
                <p className="mt-1.5 text-ink-2">{f.b}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Languages: real replies from Sorta in each language */}
        <section className="bg-ink text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <h2 className="display max-w-2xl text-3xl sm:text-4xl">{land.langTitle}</h2>
            <p className="mt-4 max-w-2xl text-lg text-white/75">{land.langBody}</p>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
                <li key={l} lang={l} className="rounded-card border border-white/15 bg-white/[0.04] p-5">
                  <p className="text-sm font-bold text-sun">{LANG_NAMES[l]}</p>
                  <p className="mt-4 ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[17px] leading-snug">{STR[l].ui.examples[2]}</p>
                  <div className="mt-3 flex items-start gap-2">
                    <LogoMark className="mt-0.5 h-7 w-7" />
                    <p className="rounded-2xl rounded-tl-md bg-card px-4 py-2.5 text-[17px] leading-snug text-ink">
                      {STR[l].r.theyOweAdded(STR[l].land.person, money(500), null)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <h2 className="display text-3xl sm:text-4xl">{land.howTitle}</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {land.steps.map((s, i) => (
              <li key={s.t} className="border-t-2 border-ink pt-5">
                <span className="figure text-4xl text-brand">{i + 1}</span>
                <h3 className="mt-3 text-xl font-bold">{s.t}</h3>
                <p className="mt-1.5 text-ink-2">{s.b}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Closing call to action */}
        <section className="px-4 pb-16 sm:px-6 lg:pb-24">
          <div className="on-dark mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] bg-brand px-6 py-12 text-white sm:px-12 lg:py-16">
            <h2 className="display max-w-2xl text-3xl sm:text-5xl">{land.ctaTitle}</h2>
            <p className="mt-4 max-w-2xl text-lg text-white/80">{land.ctaBody}</p>
            <div className="mt-8">{ctas(true)}</div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:px-6">
          <Logo size="sm" className="text-ink" />
          <p className="sm:ml-auto">{land.footer}</p>
        </div>
      </footer>
    </div>
  )

  function demoCard() {
    const q = qtyText(5, 'kg', lang)
    const rows: [IconName, string, string, string][] = [
      ['box', land.rice, `${qtyText(25, 'kg', lang)} → ${qtyText(20, 'kg', lang)}`, 'text-ink'],
      ['cash', ui.cashInHand, `+${money(300)}`, 'text-in'],
      ['trend', ui.todaySales, `+${money(300)}`, 'text-in'],
    ]
    return (
      <div className="relative mx-auto w-full max-w-md" aria-label={land.demoLabel} role="img">
        <div className="rounded-[1.75rem] border border-line bg-card p-4 shadow-pop sm:p-5">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <LogoMark className="h-7 w-7" />
            <span className="font-bold">Sorta</span>
            <span className="ml-auto text-sm text-ink-3">{ui.chat}</span>
          </div>
          <div className="space-y-3 pt-4">
            <p className="ml-auto w-fit max-w-[85%] animate-rise rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[17px] leading-snug text-white">{land.demoMsg}</p>
            <div className="flex animate-rise items-start gap-2 [animation-delay:0.5s]">
              <LogoMark className="mt-0.5 h-7 w-7" />
              <div className="overflow-hidden rounded-2xl rounded-tl-md border border-in/25 bg-card">
                <p className="flex items-center gap-1.5 px-4 pt-2.5 text-[13px] font-bold text-in">
                  <Icon name="check" className="h-4 w-4" />
                  {ui.recorded}
                </p>
                <p className="px-4 pt-1 pb-3 text-[17px] leading-snug">{r.sold(q, land.rice, money(300), money(60))}</p>
                <p className="flex items-center gap-1.5 border-t border-line bg-paper/50 px-4 py-2 text-[15px] font-semibold text-brand">
                  <Icon name="undo" className="h-[18px] w-[18px]" />
                  {ui.undo}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="ruled relative z-10 -mt-3 ml-6 animate-rise rounded-2xl border border-line bg-card p-4 pl-8 shadow-card [animation-delay:0.9s] sm:-mr-6 sm:ml-12">
          <p className="text-[13px] font-bold text-ink-2">{land.updated}</p>
          <ul className="mt-2 space-y-2">
            {rows.map(([icon, label, value, tone]) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon name={icon} className="h-[18px] w-[18px] text-ink-3" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className={cx('figure text-base', tone)}>{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }
}
