import fp from 'fastify-plugin';
import mongoose from 'mongoose';

/**
 * Serverless-safe Mongoose connection: cached on `globalThis` so warm Vercel
 * (Fluid compute) instances reuse a single pool across invocations.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  legacyDropped?: boolean;
}

const globalForMongoose = globalThis as unknown as { __mongoose?: MongooseCache };
const cache: MongooseCache = (globalForMongoose.__mongoose ??= { conn: null, promise: null });

/**
 * Drop indexes from the pre-token price-cache schema. Those collections used a
 * unique index on `asset` ({asset} / {asset,dayTs}); the token-keyed rows have
 * no `asset`, so the stale unique index would reject every row after the first
 * with a duplicate-key error. Best-effort and idempotent (missing index → no-op).
 */
async function dropLegacyIndexes(conn: typeof mongoose): Promise<void> {
  const drops: [string, string][] = [
    ['pricecaches', 'asset_1'],
    ['historicalprices', 'asset_1_dayTs_1'],
  ];
  for (const [coll, index] of drops) {
    try {
      await conn.connection.db?.collection(coll).dropIndex(index);
    } catch {
      // Index already gone (fresh DB) or collection missing — ignore.
    }
  }
}

export async function connectDb(uri: string): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!uri) throw new Error('MONGODB_URI is not set');

  mongoose.set('bufferCommands', false);
  cache.promise ??= mongoose.connect(uri, {
    maxPoolSize: 5,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
  });
  cache.conn = await cache.promise;

  // One-time, best-effort cleanup of the pre-token-migration indexes.
  if (!cache.legacyDropped) {
    cache.legacyDropped = true;
    await dropLegacyIndexes(cache.conn).catch(() => {});
  }
  return cache.conn;
}

/**
 * Registers an onRequest hook that lazily ensures the DB connection. Routes
 * that don't need Mongo (e.g. /health) still work when MONGODB_URI is unset.
 */
export default fp(async (app) => {
  app.decorate('connectDb', () => connectDb(app.config.MONGODB_URI));

  app.addHook('onRequest', async () => {
    if (app.config.MONGODB_URI) await connectDb(app.config.MONGODB_URI);
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    connectDb: () => Promise<typeof mongoose>;
  }
}
