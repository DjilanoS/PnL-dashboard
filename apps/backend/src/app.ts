import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import mongoose from 'mongoose';

import { envSchema } from './config/env';
import corsPlugin from './plugins/cors';
import dbPlugin from './plugins/db';
import authPlugin from './plugins/auth';
import discordOAuthPlugin from './plugins/discordOAuth';
import authRoutes from './modules/auth/routes';
import orderRoutes from './modules/orders/routes';
import txRoutes from './modules/tx/routes';
import walletRoutes from './modules/wallets/routes';
import settingsRoutes from './modules/settings/routes';
import portfolioRoutes from './modules/portfolio/routes';
import cronRoutes from './modules/cron/routes';

/**
 * Builds the Fastify app (plugins + routes) WITHOUT calling listen(), so it
 * can be unit-tested via `app.inject()` and reused by the serverless handler.
 */
export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Env first so `app.config` exists for every plugin/route that follows.
  await app.register(fastifyEnv, { schema: envSchema, dotenv: true, confKey: 'config' });

  await app.register(corsPlugin);
  await app.register(dbPlugin);
  await app.register(authPlugin);
  // Provides app.discordOAuth2 + GET /auth/discord; must precede authRoutes.
  await app.register(discordOAuthPlugin);

  app.get('/health', async () => ({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  }));

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(orderRoutes, { prefix: '/orders' });
  await app.register(txRoutes, { prefix: '/tx' });
  await app.register(walletRoutes, { prefix: '/wallets' });
  await app.register(settingsRoutes);
  await app.register(portfolioRoutes);
  await app.register(cronRoutes);

  // Feature modules registered in later milestones:
  // await app.register(holdingsRoutes, { prefix: '/holdings' });
  // await app.register(pnlRoutes, { prefix: '/pnl' });
  // await app.register(portfolioRoutes, { prefix: '/portfolio' });

  return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
