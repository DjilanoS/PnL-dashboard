import fp from 'fastify-plugin';
import oauth2 from '@fastify/oauth2';

/**
 * Registers Discord OAuth2. Exposes `app.discordOAuth2` and the authorize-redirect
 * route at `GET /auth/discord`; the matching callback lives in the auth module.
 * @fastify/oauth2 registers @fastify/cookie itself (for the CSRF `state` cookie).
 */
export default fp(async (app) => {
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_CALLBACK_URL, FRONTEND_AUTH_CALLBACK, NODE_ENV } =
    app.config;

  // Fail fast in production rather than booting with empty credentials or the
  // localhost dev defaults (which would silently send every login to localhost).
  if (NODE_ENV === 'production') {
    const problems: string[] = [];
    if (!DISCORD_CLIENT_ID) problems.push('DISCORD_CLIENT_ID');
    if (!DISCORD_CLIENT_SECRET) problems.push('DISCORD_CLIENT_SECRET');
    if (DISCORD_CALLBACK_URL.includes('localhost')) problems.push('DISCORD_CALLBACK_URL');
    if (FRONTEND_AUTH_CALLBACK.includes('localhost')) problems.push('FRONTEND_AUTH_CALLBACK');
    if (problems.length) {
      throw new Error(`Discord OAuth misconfigured for production: set ${problems.join(', ')}`);
    }
  }

  await app.register(oauth2, {
    name: 'discordOAuth2',
    scope: ['identify'],
    credentials: {
      client: {
        id: app.config.DISCORD_CLIENT_ID,
        secret: app.config.DISCORD_CLIENT_SECRET,
      },
      auth: oauth2.DISCORD_CONFIGURATION,
    },
    startRedirectPath: '/auth/discord',
    callbackUri: app.config.DISCORD_CALLBACK_URL,
  });
});
