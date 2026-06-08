# Deployment

Two Vercel projects from this one GitHub repo: **frontend** (static Vite) and
**backend** (Node serverless Fastify). Plus a free **MongoDB Atlas** cluster.

## 0. Prerequisites

- A GitHub repo with this monorepo pushed to it.
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster. Create a database
  user, and under **Network Access** allow `0.0.0.0/0` (Vercel egress is
  dynamic; security is via the connection string + TLS). Grab the
  `mongodb+srv://…/pnl` connection string.
- Your Helius API key.

## 1. Push to GitHub

```bash
git remote add origin git@github.com:<you>/pnl-dashboard.git
git push -u origin main
```

## 2. Backend project (deploy first — you need its URL)

In Vercel: **New Project → import the repo**.

- **Root Directory:** `apps/backend`
- Framework preset: **Other** (the `vercel.json` + `api/index.ts` handle it).
- **Environment Variables:**
  | Key | Value |
  |---|---|
  | `MONGODB_URI` | your Atlas connection string |
  | `JWT_SECRET` | `openssl rand -hex 32` |
  | `HELIUS_API_KEY` | your Helius key |
  | `SUI_RPC_URL` | (optional) a Sui mainnet RPC; blank = public fullnode |
  | `FRONTEND_ORIGIN` | the frontend URL (fill after step 3, then redeploy) |
  | `CRON_SECRET` | `openssl rand -hex 32` (Vercel sends it to the cron) |
- After first deploy, under **Settings → Functions**, enable **Fluid compute**
  (keeps the Mongoose connection warm).
- The daily NAV snapshot cron (`/cron/snapshot`, `0 0 * * *`) is configured in
  `apps/backend/vercel.json`.

Note the backend URL, e.g. `https://pnl-api.vercel.app`.

## 3. Frontend project

**New Project → import the same repo** again.

- **Root Directory:** `apps/frontend`
- Framework preset: **Vite** (auto-detected).
- **Environment Variable:** `VITE_API_URL` = the backend URL from step 2.
- Deploy. Note the frontend URL, e.g. `https://pnl.vercel.app`.

## 4. Close the loop

- Set the backend's `FRONTEND_ORIGIN` to the frontend URL (step 3) and redeploy
  the backend so CORS allows it.

## 5. Verify

- Open the frontend URL → connect a wallet → sign in → add an order → see it on
  the dashboard.
- `GET https://<backend>/health` → `{ "status": "ok", "db": "connected" }`.

## Monorepo notes

- `bun.lock` at the repo root → Vercel runs `bun install`; functions run on
  Node. Vercel auto-skips the project whose files didn't change.
- Both apps depend on `@pnl/types` (`workspace:*`), which is **type-only**, so it
  needs no build step.
