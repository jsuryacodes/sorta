import { useEffect, useRef, useState } from 'react'
import { plan } from './agent'
import { STR } from './i18n'
import { parse, type Parse } from './parser/parse'
import { todayISO } from './stats'
import { addMessages, doAction, undoAction, type Data, type Shop } from './store'
import type { Lang } from './types'
import { Reminders } from './ui'

type Err = { message?: string; code?: string }

export default function Chat({ data, lang, shop, reload }: { data: Data; lang: Lang; shop: Shop; reload: () => Promise<void> }) {
  const ui = STR[lang].ui
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [pending, setPending] = useState<Parse | undefined>()
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' }) // braces matter: scrollIntoView may return a Promise
  }, [data.messages.length, sending])
  useEffect(() => setPending(undefined), [shop])

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

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <Reminders debts={data.debts} lang={lang} />
        {!data.messages.length && !sending && (
          <div className="rounded-2xl bg-white p-4 text-stone-600 shadow-sm">
            <p className="mb-2 font-medium">{ui.emptyChat}</p>
            <div className="flex flex-wrap gap-2">
              {ui.examples.map((ex) => (
                <button key={ex} onClick={() => (setText(ex), input.current?.focus())} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left text-sm text-emerald-900">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {data.messages.map((m) => (
          <div key={m.seq} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[17px] leading-snug shadow-sm ${m.role === 'user' ? 'rounded-br-md bg-emerald-700 text-white' : 'rounded-bl-md bg-white'}`}>
              {m.text}
              {m.action_id &&
                (data.undone.has(m.action_id) ? (
                  <div className="mt-1.5 text-sm font-medium text-stone-400">↩ {ui.undone}</div>
                ) : (
                  <div>
                    <button onClick={() => undo(m.action_id!)} disabled={busy} className="mt-2 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 active:bg-stone-100 disabled:opacity-50">
                      ↩ {ui.undo}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
        {sending && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-700 px-3.5 py-2.5 text-[17px] text-white opacity-70">{sending}</div>
            </div>
            <div className="text-stone-400">…</div>
          </>
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => (e.preventDefault(), void send())}
        className="flex items-end gap-2 border-t border-stone-200 bg-white p-2"
      >
        <textarea
          ref={input}
          autoFocus
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void send())}
          placeholder={ui.inputHint}
          aria-label={ui.inputHint}
          className="min-h-16 flex-1 resize-none rounded-2xl border-2 border-stone-300 bg-stone-50 px-4 py-3 text-lg outline-none focus:border-emerald-600"
        />
        <button type="submit" disabled={busy || !text.trim()} className="h-16 rounded-2xl bg-emerald-700 px-5 text-lg font-semibold text-white disabled:opacity-40">
          {ui.send}
        </button>
      </form>
    </div>
  )
}
