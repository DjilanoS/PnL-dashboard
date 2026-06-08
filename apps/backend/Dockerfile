# syntax=docker/dockerfile:1
# Fastify API. Built from the repo ROOT (workspace deps live in the root
# node_modules and @pnl/types is a workspace package) — see docker-compose.yml.

# --- deps: install workspace dependencies with Bun (honors bun.lock) ---
FROM oven/bun:1 AS deps
WORKDIR /app
# Copy every workspace manifest so the frozen lockfile resolves identically.
COPY package.json bun.lock ./
COPY packages/types/package.json packages/types/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN bun install --frozen-lockfile

# --- runner: Node + tsx, matching the app's documented runtime ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=development
# node_modules (incl. tsx + the @pnl/* workspace symlinks) and the source it points to.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
EXPOSE 3000
WORKDIR /app/apps/backend
# tsx transpiles the TS ESM entry on the fly (same loader the test script uses).
CMD ["node", "--import", "tsx", "src/server.ts"]
