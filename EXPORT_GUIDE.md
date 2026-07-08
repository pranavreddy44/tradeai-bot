# TradeAI Export Guide

This project is portable as a source-code folder. The latest code is in this directory.

## What To Upload

Upload the whole project folder:

```text
workspace-1651e4ee-1ab1-4143-95de-e74219b54a1f
```

Do not upload these generated/runtime folders unless the target platform specifically asks for them:

```text
node_modules
.next
dev.log
server.log
mini-services/telegram-listener/service.log
```

## Runtime Pieces

The app has two processes:

1. Main Next.js app on port `3000`
2. Telegram listener mini-service on port `3002`

The main app calls the Telegram listener at:

```text
http://localhost:3002
```

So the new platform must support running both processes together, or you must start the Telegram listener separately.

## Install

```bash
npm install
npm run db:generate
npm run db:push
```

## Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

At minimum configure:

```text
DATABASE_URL="file:./prisma/dev.db"
HF_TOKEN="your_huggingface_token"
```

Groww credentials, Telegram credentials/session, broker settings, channels, and AI model settings are currently stored through the app/database settings. If you do not move the database, configure them again in the UI on the new platform.

## Start Locally

Option A: process manager:

```bash
node process-manager.js dev
```

Option B: two terminals:

```bash
npm run dev
```

```bash
cd mini-services/telegram-listener
bun index.ts
```

If the new platform does not have Bun, install Bun or adapt the Telegram listener to run with Node/tsx.

## Database Transfer

Current local databases:

```text
prisma/dev.db
db/custom.db
```

For a simple private handoff, include these files so settings and saved signals move with the project.

For a public or shared handoff, do not include the database because it may contain broker credentials, Telegram settings, access tokens, API keys, and private trading data. Recreate it with:

```bash
npm run db:push
```

Then reconfigure settings in the UI.

## Important Secret Checklist

Reconfigure these on the new platform:

- `HF_TOKEN`
- Groww API key / access token / TOTP settings
- Telegram API ID, API hash, phone, and session/login state
- Any saved AI model provider settings
- Static IP / broker IP restrictions if deploying to a real server

## Verification Commands

```bash
npm run lint
npx tsc --noEmit --pretty false --incremental false
curl http://localhost:3000/api/telegram?action=service-status
curl http://localhost:3002/health
```

Expected Telegram status when configured:

```json
{
  "online": true,
  "auth": "connected"
}
```

## Latest Important Code Areas

- `src/lib/market/instrument-resolver.ts`: dynamic Groww instrument resolver for Telegram stock names/symbols
- `src/lib/ai-engine.ts`: Telegram/news/image AI parsing and trusted Telegram fallback logic
- `src/app/api/telegram/route.ts`: channel scan and signal creation API
- `src/app/api/ai/telegram-analyze/route.ts`: realtime Telegram message analysis API
- `src/lib/telegram/userbot.ts`: app-side Telegram userbot processing
- `mini-services/telegram-listener/index.ts`: Telegram listener service
