import fp from 'fastify-plugin';
import cors from '@fastify/cors';

/** Allow the configured frontend origin (plus localhost in dev). */
export default fp(async (app) => {
  const origins = new Set([app.config.FRONTEND_ORIGIN]);
  if (app.config.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:4173');
  }

  await app.register(cors, {
    origin: [...origins],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });
});
