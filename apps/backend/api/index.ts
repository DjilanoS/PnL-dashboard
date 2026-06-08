import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app';

/**
 * Vercel serverless entrypoint. The Fastify instance is built once per warm
 * container and reused across invocations (Fluid compute keeps it warm; the
 * Mongoose connection is cached on globalThis). All paths are routed here via
 * the rewrite in vercel.json, so Fastify sees the original request URL.
 */
let appPromise: ReturnType<typeof initApp> | null = null;

async function initApp() {
  const app = await buildApp();
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await (appPromise ??= initApp());
  app.server.emit('request', req, res);
}
