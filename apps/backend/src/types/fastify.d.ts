import type { AppConfig } from '../config/env';
import type { onRequestHookHandler } from 'fastify';
import type { OAuth2Namespace } from '@fastify/oauth2';

/** The JWT payload we issue after Discord login. */
export interface AuthTokenPayload {
  /** User document id. */
  sub: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    /** preHandler/onRequest guard that 401s unless a valid JWT is present. */
    authenticate: onRequestHookHandler;
    /** Discord OAuth2 namespace (authorize redirect + token exchange). */
    discordOAuth2: OAuth2Namespace;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}
