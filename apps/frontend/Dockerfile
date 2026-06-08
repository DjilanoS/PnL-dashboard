# syntax=docker/dockerfile:1
# Vue/Vite SPA → built to static files, served by nginx.
# Built from the repo ROOT (workspace deps + @pnl/types) — see docker-compose.yml.

# --- build the static site with Vite ---
FROM oven/bun:1 AS build
WORKDIR /app
# The browser-facing API URL is inlined at build time (Vite replaces VITE_*).
ARG VITE_API_URL=http://localhost:3000
COPY package.json bun.lock ./
COPY packages/types/package.json packages/types/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN bun install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/frontend ./apps/frontend
# Vite (mode=production) reads .env.production for VITE_* values.
RUN printf 'VITE_API_URL=%s\n' "$VITE_API_URL" > apps/frontend/.env.production
RUN cd apps/frontend && bun run build-only

# --- serve the static bundle ---
FROM nginx:alpine AS runner
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
