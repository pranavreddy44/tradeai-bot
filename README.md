# TradeAI Bot

AI-powered trading signal scanner for Telegram. It watches the Telegram channels you select, understands trading signals from **text messages and chart images** (including traced patterns), combines them with **market sentiment from news**, and assigns a **confidence score** to every signal.

Signals are generated only when you ask — there is no broker integration and no auto-trading. You review the signals and execute trades manually in your own account.

## Features

- **Telegram channel monitoring** — connect via your Telegram account (GramJS userbot, works with private channels), pick channels, and scan them on demand.
- **Text signal parsing** — extracts symbol, action (BUY/SELL), entry, target, and stop-loss from Telegram messages using AI with a rule-based fallback.
- **Image / chart signal parsing** — Vision-language model (VLM) reads chart screenshots, detects the chart pattern, traces support/resistance/trend lines, and validates against real technical indicators (EMA, RSI, MACD, Bollinger Bands).
- **News sentiment fusion** — scans financial news, scores sentiment per symbol, and boosts a signal's confidence when Telegram and news agree ("convergence").
- **Confidence scoring** — 0–100 score weighted by channel source performance and fusion agreement.
- **Manual signal generation** — nothing is created automatically; click **Scan All** / **Generate** to produce signals, then execute them yourself.
- **Instrument resolution** — resolves stock names/symbols from the public NSE instrument list.
- **Live prices** — Yahoo Finance quotes used to normalize entry/target/SL to the current market price.

## Architecture

Two processes run together:

| Process | Port | Description |
|---------|------|-------------|
| Main Next.js app | `3000` | Web UI, AI engine, signal/news APIs, database |
| Telegram listener mini-service | `3002` | GramJS userbot that connects to Telegram and forwards messages for analysis |

The main app talks to the listener at `http://localhost:3002`.

## Tech Stack

- **Frontend / API:** Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Database:** SQLite via Prisma
- **AI:** OmniRoute gateway (auto-fallback across 268+ providers, zero-config) + Groq as a second provider, with rule-based fallback
- **Telegram:** GramJS (MTProto userbot)
- **Indicators:** `technicalindicators`
- **Prices:** Yahoo Finance public API
- **Instruments:** NSE public instrument CSV

## Getting Started

### Prerequisites

- Node.js 20+ and [Bun](https://bun.sh) (used by the Telegram listener)

### Install

```bash
npm install
cd mini-services/telegram-listener && bun install && cd ../..
npm run db:generate
npm run db:push
```

### Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

At minimum configure:

```dotenv
DATABASE_URL="file:./dev.db"
# OmniRoute (default AI provider) — zero-config on http://localhost:20128
OMNIROUTE_BASE_URL="http://localhost:20128/v1/chat/completions"
# OMNIROUTE_KEY=""
# OMNIROUTE_MODEL="auto"
# OMNIROUTE_JSON_MODEL="oc/nemotron-3-ultra-free"
# Groq (fallback / second provider)
# GROQ_API_KEY=""
```

Telegram credentials (API ID, API hash, phone) and channels are configured in the UI → **Setup** tab, then stored in the database. Live Telegram messages are analyzed in real time but **do not** auto-create signals.

### Run Locally

Option A — process manager (auto-restarts both processes):

```bash
node process-manager.js dev
```

Option B — two terminals:

```bash
npm run dev
```

```bash
cd mini-services/telegram-listener
bun index.ts
```

Then open http://localhost:3000.

## How It Works

1. **Setup** — In the Setup tab, enter your Telegram API ID/hash/phone, complete the login code/2FA, and add the channels you want to monitor.
2. **Scan All** — Clicking **Scan All** fetches recent messages (text + images) from all active channels, runs them through the AI engine (with rule-based fallback), and creates trade signals.
3. **Review** — Each signal card shows symbol, action, entry/target/stop-loss, confidence, and reasoning.
4. **Execute** — You execute trades manually in your brokerage account. The app can mark signals as executed for tracking (local only).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite database path, e.g. `file:./dev.db` |
| `OMNIROUTE_BASE_URL` | Optional | OmniRoute endpoint (default `http://localhost:20128/v1/chat/completions`) |
| `OMNIROUTE_KEY` | Optional | OmniRoute API key (leave blank for zero-config) |
| `OMNIROUTE_MODEL` | Optional | OmniRoute model alias (default `auto`) |
| `OMNIROUTE_JSON_MODEL` | Optional | Fixed model for structured JSON parsing (default `oc/nemotron-3-ultra-free`; overrides combos that may return broken JSON) |
| `OMNIROUTE_VISION_MODEL` | Optional | Vision model for Telegram chart/image parsing (default `oc/mimo-v2.5-free`; combos like `auto` can land on text-only models) |
| `GROQ_API_KEY` | Optional | Groq key for the second AI provider |
| `PORT` | Optional | Web server port (default `3000`) |

## Database

The schema lives in `prisma/schema.prisma`. Key models: `TradeSignal`, `Position`, `AIDecision`, `NewsItem`, `BotSetting`, `TelegramChannel`, `WatchlistItem`, `Strategy`, `TradeJournal`, `ChatMessage`.

```bash
npm run db:generate   # generate Prisma client
npm run db:push       # sync database with schema
```

To load demo data (optional):

```bash
curl -X POST http://localhost:3000/api/seed
```

## Verification

```bash
npm run lint
curl http://localhost:3000/api/telegram?action=service-status
curl http://localhost:3002/health
```

Expected Telegram status when configured:

```json
{ "online": true, "auth": "connected" }
```

## Project Structure

```
├── src/
│   ├── app/api/          # Next.js API routes (signals, news, telegram, ai, settings, ...)
│   ├── components/       # React UI (dashboards, signal feed, setup panels)
│   └── lib/
│       ├── ai-engine.ts            # AI parsing + rule-based fallback
│       ├── broker/live-prices.ts   # Yahoo Finance live prices
│       ├── market/instrument-resolver.ts  # NSE instrument resolution
│       ├── chart/technical-analysis.ts   # indicator-based signal validation
│       ├── signals/fusion-engine.ts      # Telegram + news convergence boost
│       └── telegram/userbot.ts           # Telegram message processing
├── mini-services/
│   └── telegram-listener/ # Bun + GramJS userbot service (port 3002)
├── prisma/schema.prisma   # Database schema
└── process-manager.js     # Dev/prod process runner
```

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/telegram` (`action: scan-messages`) | Scan all channels and generate signals |
| `POST /api/ai/telegram-analyze` | Analyze a Telegram message (signals created unless `live: true`) |
| `POST /api/telegram/userbot` (`action: test-image-signal`) | Analyze a chart image and create signals |
| `GET/POST /api/signals` | List and manage trade signals |
| `GET/POST /api/news` + `/api/news/scan` | News scanning and sentiment analysis |
| `GET/PUT /api/settings` | Bot settings |

## Notes

- No broker credentials are stored and no orders are ever placed — this is a signal generator, not an auto-trader.
- AI providers may hit rate limits; the rule-based fallback keeps scans working and labels such signals accordingly.
- The `Groww`/broker integration was intentionally removed.
