# PnL Dashboard

A private dashboard to track buy/sell PnL for **native SOL and SUI** across CEXs and on-chain trades.

## Features

- **PnL tracking** for native SOL & SUI — total, realized, unrealized, ROI, and average buy/sell prices.
- **Log orders** three ways: auto-scanned from connected wallet history, parsed from an explorer transaction link, or entered manually.
- **Dashboard** — PnL summary cards, a portfolio-value (NAV) chart with a gold total line plus toggleable per-chain SOL/SUI breakdown lines, an allocation donut, and a holdings table.
- **Wallets & settings** — connect and add Solana/Sui wallets per chain (ownership proven by signing a nonce); each address links out to Solscan/Suiscan, and you can point balance/transaction lookups at your own RPC endpoints.
- **Transaction history** with per-trade explorer links.

## Stack

- **Monorepo:** Bun workspaces
- **Frontend** (`apps/frontend`): Vue 3 + Vite + TypeScript + Vue Router, Tailwind v4, shadcn-vue, `lightweight-charts`. State via module-level reactive singletons (no Pinia).
- **Backend** (`apps/backend`): Node + Fastify + Mongoose (MongoDB).
- **Shared** (`packages/types`): type-only DTOs imported by both apps.
- **Deploy:** Vercel — two projects from one repo (static frontend + Node serverless backend).

## Develop

```bash
bun install            # at repo root

bun run dev:api        # Fastify on http://localhost:3000
bun run dev:web        # Vite on   http://localhost:5173
```

Copy `apps/backend/.env.example` → `apps/backend/.env` and fill in the values
(`MONGODB_URI`, `JWT_SECRET`, `HELIUS_API_KEY`, …). The frontend reads
`VITE_API_URL` from `apps/frontend/.env` (defaults to `http://localhost:3000`).

## Run with Docker

A full local stack (MongoDB + API + static frontend) via Docker Compose — no
local Bun/Mongo needed:

```bash
docker compose up --build
# Frontend → http://localhost:5173   API → http://localhost:3000
```

It boots with dev defaults and an empty database (persisted in the `mongo-data`
volume). Secrets are optional — to enable Discord login or a Helius RPC, create a
root `.env` (gitignored) that Compose substitutes:

```bash
DISCORD_CLIENT_ID=...        # register redirect http://localhost:3000/auth/discord/callback
DISCORD_CLIENT_SECRET=...
HELIUS_API_KEY=...
```

`NODE_ENV` defaults to `development` so it runs against `localhost` out of the
box. For a real deployment set `NODE_ENV=production`, supply Discord credentials
with non-localhost callback URLs, set a strong `JWT_SECRET`, and rebuild the
frontend with `VITE_API_URL` pointing at your public API. See
[`DEPLOY.md`](./DEPLOY.md) for the Vercel path.

## Layout

```
apps/frontend   Vue dashboard (Vercel project A — static)
apps/backend    Fastify API   (Vercel project B — Node function)
packages/types  Shared TypeScript DTOs
```

See [`DEPLOY.md`](./DEPLOY.md) and the `.env.example` files for configuration and deployment notes.
