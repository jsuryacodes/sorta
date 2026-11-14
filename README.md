# Sorta

**Live:** https://sorta-iota.vercel.app

Sorta is a shop notebook for small kirana stores. Instead of tracking stock, receipts and debts on paper, the shopkeeper types (or dictates) what happened into one chat box, in English, Hindi or Telugu or a mix, and Sorta updates the records.

- **Chat** – one message box. Sorta records sales, purchases, debts and cash, answers stock and cash questions, and every change has an Undo button.
- **Dashboard** – cash in hand, what you owe, what is owed to you, debts due soon, low stock, expiring items, today's sales and profit.
- **Inventory** – every product with quantity, shelf, expiry, prices, margin, realised profit and a simple demand forecast. Products can be edited by hand.
- **Debts** – both directions, due dates, mark as settled.
- **Languages** – English / हिन्दी / తెలుగు switcher for the whole interface. Replies come in the language of the message.
- **Demo shop** – a toggle in the header switches to a seeded sample shop (20 products, two weeks of sales, debts, low-stock and near-expiry items). It is stored separately from the real shop and has a "Reset demo data" button.

There is **no AI/LLM**. All language understanding is a rule-based parser that runs in the browser (`src/parser/`). There is no microphone code either: dictate with [Wispr Flow](https://wisprflow.ai), which types into the focused text box.

## Example messages

| | English | Hindi | Telugu |
|---|---|---|---|
| Sale | `sold 5 units of rice` · `sold 5 rice for 240` | `5 chawal bech diya` · `5 चावल 240 रुपये में बेचा` | `5 బియ్యం అమ్మాను` · `5 biyyam ammanu` |
| Purchase | `got 20 packets of tea at 8 rupees each, MRP 10, expiry 12 March, shelf 3` | `20 पैकेट चाय आई 8 रुपये के भाव, एमआरपी 10, शेल्फ 3` | `20 ప్యాకెట్లు టీ వచ్చాయి ఒక్కొక్కటి 8 రూపాయలు, MRP 10` |
| Stock question | `how much rice is left?` | `chawal kitna bacha hai?` · `चावल कितना बचा है?` | `బియ్యం ఎంత ఉంది?` · `biyyam enta undi` |
| New debt | `I owe Ramesh 100 rupees and should give it back by 16th November` · `Suresh owes me 500` | `Ramesh ko 100 rupaye dena hai kal tak` · `सुरेश से 500 लेना है` | `రమేష్‌కి 100 ఇవ్వాలి నవంబర్ 16 లోపు` · `Suresh naaku 500 ivvali` |
| Debt settled | `paid Ramesh 100` · `Suresh gave back 500` | `Ramesh ko 100 de diya` · `सुरेश ने 500 वापस दिए` | `రమేష్‌కి 100 ఇచ్చాను` · `సురేష్ 500 తిరిగి ఇచ్చాడు` |
| Cash | `cash in hand is 4500` · `how much cash do I have?` | `galle mein 4500 hai` · `cash kitna hai` | `చేతిలో 4500 ఉంది` · `డబ్బు ఎంత ఉంది?` |
| Undo | `undo` · `that was a mistake` | `galti ho gayi` · `गलती हो गई` | `తప్పు అయింది` · `tappu ayindi` |

Mixed sentences work too: `sold 5 chawal`, `5 kg బియ్యం sold`.

If a message is unclear, the product is unknown, or it is not clear who owes whom, Sorta asks a short question and changes nothing.

## Business rules

- A sale with no stated price is recorded at MRP. Sales add to cash; purchases and repayments reduce it; money received from debtors adds to it.
- Margin is MRP minus wholesale price (rupees and % of MRP), plus potential profit on current stock and realised profit from actual sales.
- Low stock is flagged in the chat reply and on the dashboard when quantity is at or below the product's threshold.
- Products expiring within 7 days, or already expired, are flagged.
- Debts due tomorrow, today or overdue show a red reminder banner on the chat, dashboard and debts screens (in-app only).
- Forecast: average daily sales over the last 7–14 days, days of stock left, and a reorder quantity that covers 14 days.
- Undo: every change is applied by one Postgres function that stores the exact inverse operations in `action_log`; undo replays them in one transaction, so stock, cash and debts are restored exactly.

## Run locally

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and anon key
npm run dev
npm test                     # parser and agent unit tests
```

To use your own Supabase project:

```bash
supabase link --project-ref <your-ref>
supabase db push             # creates tables, functions and the seeded demo shop
```

## Layout

```
src/parser/      text.ts (tokens, number words, fuzzy), dates.ts, parse.ts, parse.test.ts
src/agent.ts     parsed message -> reply + operations (pure)
src/store.ts     Supabase calls and the data hook
src/i18n/        en.ts, hi.ts, te.ts — one file per language (labels and replies)
src/*.tsx        Landing page ("/") and the Chat, Dashboard, Inventory, Debts screens ("/app")
src/ui.tsx       design system: icons, logo and shared components (tokens live in src/index.css)
supabase/migrations/   schema, apply/undo functions, demo seed
```

## Known limitations

- **No login.** The app uses the Supabase anon key with open row-level-security policies, so anyone with the URL can read and change the data, and every visitor shares the same "real" shop and the same demo shop. Do not put real shop data in until auth is added.
- One product per message (`sold 5 rice and 2 sugar` asks you to split it).
- Replies to romanised Hindi/Telugu (`5 chawal bech diya`) come back in Devanagari/Telugu script, not romanised.
- After a clarifying question you resend the full message; only the yes/no for adding a new product is remembered.
- `kal` is always read as tomorrow. Hindi number words cover 1–50, the tens, sau/hazaar/lakh and saadhe/sava/paune; anything else should be typed or dictated as digits.
- Names are matched across scripts only roughly (by consonants), e.g. रमेश ↔ Ramesh.
- Products created from chat get no aliases; add Hindi/Telugu names in Inventory → Edit.
- No product delete and no form to add a debt by hand (use chat). Edits and "Mark settled" made on the screens are logged like chat actions, so a later `undo` message reverses them too.
- A purchase replaces the stored buy price with the latest one (no weighted average), and cash is allowed to go negative.
- Statistics read the most recent 1,000 stock movements.
- The demo shop reseeds itself once a day so its dates stay current.
