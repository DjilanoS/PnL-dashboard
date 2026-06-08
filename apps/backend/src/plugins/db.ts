import fp from 'fastify-plugin';
import mongoose from 'mongoose';

/**
 * Serverless-safe Mongoose connection: cached on `globalThis` so warm Vercel
 * (Fluid compute) instances reuse a single pool across invocations.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as unknown as { __mongoose?: MongooseCache };
const cache: MongooseCache = (globalForMongoose.__mongoose ??= { conn: null, promise: null });

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
