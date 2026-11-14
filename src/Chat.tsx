import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { plan } from './agent'
import { STR } from './i18n'
import { parse, type Parse } from './parser/parse'
import { todayISO } from './stats'
import { addMessages, doAction, undoAction, type Data, type Shop } from './store'
import type { Lang, Message } from './types'
import { Icon, LogoMark, Reminders, cx, shortDate } from './ui'

type Err = { message?: string; code?: string }

export default function Chat({ data, lang, shop, reload }: { data: Data; lang: Lang; shop: Shop; reload: () => Promise<void> }) {
  const { ui, locale } = STR[lang]
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [pending, setPending] = useState<Parse | undefined>()
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (data.messages.length || sending) end.current?.scrollIntoView({ block: 'end' }) // braces matter: scrollIntoView may return a Promise
  }, [data.messages.length, sending])
  useEffect(() => setPending(undefined), [shop])
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const undoReply = async (l: Lang, id?: string) => {
    const r = STR[l].r
    try {
      const a = await undoAction(shop, id)
      return r.undone(a.summary ?? '')
    } catch (e) {
      const err = e as Err
      return err.code === '23503' ? r.cantUndo : /nothing to undo/.test(err.message ?? '') ? r.nothingToUndo : r.failed(err.message ?? '')
    }
  }

  const send = async () => {
    const msg = text.trim()
    if (!msg || busy) return
    setBusy(true)
    setText('')
    setSending(msg)
    try {
      const parsed = parse(msg, { products: data.products, persons: [...new Set(data.debts.map((d) => d.person))], today: todayISO(), fallbackLang: lang })
      const pl = plan(parsed, data, pending)
      let reply = pl.reply
      let action_id: string | null = null
      if (pl.undo) reply = await undoReply(parsed.lang)
      else if (pl.ops) {
        try {
          action_id = (await doAction(shop, pl.kind!, pl.reply, pl.ops)).id
        } catch (e) {
          reply = STR[parsed.lang].r.failed((e as Err).message ?? '')
        }
      }
      setPending(pl.pending)
      await addMessages(shop, [{ role: 'user', text: msg }, { role: 'agent', text: reply, action_id }])
      await reload()
    } finally {
      setBusy(false)
      setSending(null)
      input.current?.focus()
    }
  }

  const undo = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      await addMessages(shop, [{ role: 'agent', text: await undoReply(lang, id) }])
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const time = (m: Message) => new Date(m.created_at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  const day = (m: Message) => new Date(m.created_at).toLocaleDateString('en-CA')
  const dayLabel = (d: string) => {
    const today = todayISO()
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA')
    return d === today ? ui.today : d === yesterday ? ui.yesterday : shortDate(d, lang, true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-4 sm:px-6">
          <Reminders debts={data.debts} lang={lang} compact />

          {!data.messages.length && !sending && (
            <section className="animate-rise rounded-card border border-line bg-card p-5 shadow-card sm:p-6">
              <LogoMark className="h-11 w-11" />
              <h1 className="display mt-4 text-2xl">{ui.chatWelcome}</h1>
              <p className="mt-1.5 text-ink-2">{ui.emptyChat}</p>
              <ul className="mt-4 flex flex-col gap-2">
                {ui.examples.map((ex) => (
                  <li key={ex}>
                    <button
                      onClick={() => (setText(ex), input.current?.focus())}
                      className="group flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-paper/60 px-3.5 py-2 text-left font-medium transition-colors hover:border-brand hover:bg-brand-soft"
                    >
                      <Icon name="chat" className="h-[18px] w-[18px] text-brand" />
                      <span className="min-w-0 flex-1">{ex}</span>
                      <Icon name="arrow" className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.messages.map((m, i) => (
            <Fragment key={m.seq}>
              {(i === 0 || day(data.messages[i - 1]) !== day(m)) && (
                <div className="my-1 flex items-center gap-3 text-xs font-semibold text-ink-3" role="separator">
                  <span className="h-px flex-1 bg-line" />
                  {dayLabel(day(m))}
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              {m.role === 'user' ? (
                <Outgoing text={m.text} time={time(m)} />
              ) : (
                <Incoming time={time(m)}>
                  {m.action_id ? (
                    <div className={cx('overflow-hidden rounded-2xl rounded-tl-md border bg-card shadow-card', data.undone.has(m.action_id) ? 'border-line' : 'border-in/25')}>
                      <div className={cx('flex items-center gap-1.5 px-4 pt-2.5 text-[13px] font-bold', data.undone.has(m.action_id) ? 'text-ink-3' : 'text-in')}>
                        <Icon name={data.undone.has(m.action_id) ? 'undo' : 'check'} className="h-4 w-4" />
                        {data.undone.has(m.action_id) ? ui.undone : ui.recorded}
                      </div>
                      <p className={cx('whitespace-pre-wrap px-4 pt-1 pb-3 text-[17px] leading-snug', data.undone.has(m.action_id) && 'text-ink-3 line-through decoration-ink-3/50')}>
                        {rich(m.text)}
                      </p>
                      {!data.undone.has(m.action_id) && (
                        <div className="border-t border-line bg-paper/50 px-2 py-1.5">
                          <button
                            onClick={() => undo(m.action_id!)}
                            disabled={busy}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[15px] font-semibold text-brand transition-colors hover:bg-brand-soft disabled:opacity-45"
                          >
                            <Icon name="undo" className="h-[18px] w-[18px]" />
                            {ui.undo}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap rounded-2xl rounded-tl-md border border-line bg-card px-4 py-2.5 text-[17px] leading-snug shadow-card">{rich(m.text, false)}</p>
                  )}
                </Incoming>
              )}
            </Fragment>
          ))}

          {sending && (
            <>
              <Outgoing text={sending} pending />
              <Incoming label={ui.typing}>
                <div className="flex h-11 items-center gap-1.5 rounded-2xl rounded-tl-md border border-line bg-card px-4 shadow-card">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-2 w-2 animate-dot rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </Incoming>
            </>
          )}
          <div ref={end} />
        </div>
      </div>

      <form onSubmit={(e) => (e.preventDefault(), void send())} className="border-t border-line bg-card px-3 pt-2.5 pb-2 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={input}
            autoFocus
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void send())}
            placeholder={ui.messagePlaceholder}
            aria-label={ui.inputHint}
            className="min-h-14 flex-1 resize-none rounded-2xl border border-line-2/60 bg-paper/60 px-4 py-[0.9rem] text-[17px] leading-snug text-ink placeholder:text-ink-3 transition-colors hover:border-ink-2 focus:border-brand focus:bg-card focus:outline-2 focus:outline-offset-0 focus:outline-brand"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label={ui.send}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] transition-[background-color,transform,opacity] hover:bg-brand-dark active:scale-95 disabled:bg-line-2/40 disabled:text-ink-3 disabled:shadow-none"
          >
            <Icon name="send" className="h-6 w-6" />
          </button>
        </div>
        <p className="mx-auto mt-1.5 flex max-w-3xl items-center gap-1.5 px-1 text-xs text-ink-3">
          <Icon name="mic" className="h-3.5 w-3.5" />
          <span className="min-w-0 flex-1 truncate">{ui.inputHint}</span>
          <span className="hidden sm:inline">{ui.enterToSend}</span>
        </p>
      </form>
    </div>
  )
}

const Outgoing = ({ text, time, pending }: { text: string; time?: string; pending?: boolean }) => (
  <div className={cx('flex flex-col items-end gap-1', pending ? 'opacity-70' : 'animate-rise')}>
    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[17px] leading-snug text-white shadow-card sm:max-w-[75%]">{text}</p>
    {time && <time className="px-1 text-xs tabular-nums text-ink-3">{time}</time>}
  </div>
)

const Incoming = ({ children, time, label }: { children: ReactNode; time?: string; label?: string }) => (
  <div className="flex animate-rise items-start gap-2" aria-label={label}>
    <LogoMark className="mt-0.5 h-7 w-7" />
    <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-1 sm:max-w-[75%]">
      {children}
      {time && <time className="px-1 text-xs tabular-nums text-ink-3">{time}</time>}
    </div>
  </div>
)

/** Colours cash changes in a reply (+₹ green, −₹ red) and swaps the warning emoji for an icon.
 *  Only action replies get colours: an undo reply quotes the original change, which was reversed. */
const rich = (text: string, colour = true) =>
  text.split(/([+−]₹[\d,.]*\d|⚠️\s?)/).map((s, i) =>
    !colour && s.includes('₹') ? (
      s
    ) : s.startsWith('+₹') ? (
      <strong key={i} className="whitespace-nowrap font-bold text-in">{s}</strong>
    ) : s.startsWith('−₹') ? (
      <strong key={i} className="whitespace-nowrap font-bold text-out">{s}</strong>
    ) : s.startsWith('⚠️') ? (
      <Icon key={i} name="alert" className="mr-1 inline h-[18px] w-[18px] -translate-y-0.5 text-low" />
    ) : (
      s
    ),
  )
