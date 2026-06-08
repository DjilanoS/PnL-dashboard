import { buildApp } from './app';

/**
 * Local-dev + Vercel entrypoint. Vercel's Fastify support detects an entry
 * that calls `.listen()`; locally this is what `bun run dev` (tsx watch) runs.
 */
const app = await buildApp();
await app.ready();

try {
  await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
