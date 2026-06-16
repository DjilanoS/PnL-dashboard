import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { User } from '../../models/User';
import { Wallet, toWalletDTO } from '../../models/Wallet';
import { discordDisplayName, fetchDiscordUser } from '../../services/discord';
import { ErrorSchema, MeResponseSchema } from '../../schemas';
import type { AppConfig } from '../../config/env';

const authRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const config = app.config as AppConfig;

  // GET /auth/discord (the authorize redirect) is registered by the discordOAuth plugin.

  // OAuth callback: @fastify/oauth2 validates the CSRF `state` cookie, then we
  // exchange the code, upsert the Discord user, mint a JWT, and hand it to the
  // SPA via the URL fragment (fragments aren't sent to servers / logged).
  app.get('/discord/callback', async (req, reply) => {
    try {
      const { token } = await app.discordOAuth2.getAccessTokenFromAuthorizationCodeFlow(req);
      const profile = await fetchDiscordUser(token.access_token);

      const user = await User.findOneAndUpdate(
        { discordId: profile.id },
        {
          discordId: profile.id,
          discordUsername: discordDisplayName(profile),
          discordAvatar: profile.avatar ?? null,
        },
        { upsert: true, new: true },
      );
      if (!user) throw new Error('user_upsert_failed');

      const jwt = await reply.jwtSign({ sub: String(user._id) });
      return reply.redirect(`${config.FRONTEND_AUTH_CALLBACK}#token=${encodeURIComponent(jwt)}`);
    } catch (err) {
      app.log.error({ err }, 'discord oauth callback failed');
      return reply.redirect(`${config.FRONTEND_AUTH_CALLBACK}#error=discord_auth_failed`);
    }
  });

  // Current identity + tracked wallets. The SPA calls this to hydrate after
  // login and on reload (localStorage is only a fast-paint hint).
  app.get(
    '/me',
    { onRequest: app.authenticate, schema: { response: { 200: MeResponseSchema, 401: ErrorSchema } } },
    async (req, reply) => {
      // Independent reads (Wallet keys on the JWT sub) → run them concurrently.
      const [user, wallets] = await Promise.all([
        User.findById(req.user.sub),
        Wallet.find({ userId: req.user.sub }).sort({ createdAt: 1 }),
      ]);
      if (!user) return reply.code(401).send({ error: 'unauthorized' });

      // Slide the session forward: an actively-used app re-hydrates via /auth/me,
      // so mint a fresh JWT each call to reset the 7-day expiry. Returned in a
      // header (not the body) to keep the MeResponse contract identity-only.
      reply.header('x-refreshed-token', await reply.jwtSign({ sub: String(user._id) }));

      return {
        user: {
          discordId: user.discordId ?? '',
          discordUsername: user.discordUsername ?? '',
          discordAvatar: user.discordAvatar ?? null,
        },
        wallets: {
          sol: wallets.filter((w) => w.chain === 'sol').map(toWalletDTO),
          sui: wallets.filter((w) => w.chain === 'sui').map(toWalletDTO),
        },
      };
    },
  );
};

export default authRoutes;
