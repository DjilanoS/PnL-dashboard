import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

/** Registers @fastify/jwt and an `authenticate` guard for protected routes. */
export default fp(async (app) => {
  await app.register(jwt, {
    secret: app.config.JWT_SECRET,
    sign: { expiresIn: app.config.JWT_EXPIRES_IN },
  });

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });
});
