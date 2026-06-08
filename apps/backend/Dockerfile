# syntax=docker/dockerfile:1
# Fastify API run directly with Bun — Bun executes the TS ESM entry natively, so
# there's no build/transpile step and no node/tsx. Built from the repo ROOT
# (workspace deps live in the root node_modules and @pnl/types is a workspace
# package) — see docker-compose.yml.

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=development
# Copy every workspace manifest first so the frozen lockfile resolves identically
# and the install layer caches independently of source changes.
COPY package.json bun.lock ./
COPY packages/types/package.json packages/types/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN bun install --frozen-lockfile
# Source: shared tsconfig + the @pnl/* workspace packages the entry points to.
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
EXPOSE 3000
WORKDIR /app/apps/backend
# Bun runs the TypeScript ESM entry on the fly — no transpile step.
CMD ["bun", "run", "src/server.ts"]
