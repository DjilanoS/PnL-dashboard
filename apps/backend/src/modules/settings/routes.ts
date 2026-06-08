import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { RpcSettings } from '@pnl/types';
import { User, type UserDoc } from '../../models/User';
import { DEFAULT_SOLANA_RPC, DEFAULT_SUI_RPC } from '../../config/env';
import { assertPublicRpcUrl, pingRpc } from '../../services/rpcHealth';
import { ChainSchema, ErrorSchema, RpcHealthResponseSchema, RpcSettingsSchema } from '../../schemas';

/** Per-user RPC settings + a reachability probe. All routes require a valid JWT. */
const settingsRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('onRequest', app.authenticate);

  function toDto(user: Pick<UserDoc, 'rpcSol' | 'rpcSui'> | null): RpcSettings {
    return {
      sol: { url: user?.rpcSol ?? null, default: DEFAULT_SOLANA_RPC },
      sui: { url: user?.rpcSui ?? null, default: DEFAULT_SUI_RPC },
    };
  }

  // Read the caller's RPC settings (custom URL per chain + the defaults).
  app.get('/settings/rpc', { schema: { response: { 200: RpcSettingsSchema } } }, async (req) => {
    const user = await User.findById(req.user.sub).select('rpcSol rpcSui').lean();
    return toDto(user);
  });

  // Set (or clear, with null/'') a chain's custom RPC URL.
  app.post(
    '/settings/rpc',
    {
      schema: {
        body: Type.Object({ chain: ChainSchema, url: Type.Union([Type.String(), Type.Null()]) }),
        response: { 200: RpcSettingsSchema, 400: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { chain, url } = req.body;
      const trimmed = url?.trim() || null;
      // Allow an as-yet-unresolvable host (user may bring it online later), but
      // reject anything that resolves to an internal/metadata address.
      if (trimmed && !(await assertPublicRpcUrl(trimmed, { allowUnresolvable: true }))) {
        return reply.code(400).send({ error: 'invalid_rpc_url' });
      }
      const field = chain === 'sol' ? 'rpcSol' : 'rpcSui';
      const user = (await User.findByIdAndUpdate(
        req.user.sub,
        { [field]: trimmed },
        { new: true, select: 'rpcSol rpcSui' },
      ).lean()) as Pick<UserDoc, 'rpcSol' | 'rpcSui'> | null;
      return toDto(user);
    },
  );

  // Probe an RPC URL for the status dot (backend pings it → no browser CORS).
  app.post(
    '/rpc/health',
    {
      schema: {
        body: Type.Object({ chain: ChainSchema, url: Type.String({ minLength: 1 }) }),
        response: { 200: RpcHealthResponseSchema, 400: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { chain, url } = req.body;
      if (!(await assertPublicRpcUrl(url, { allowUnresolvable: true }))) {
        return reply.code(400).send({ error: 'invalid_rpc_url' });
      }
      return pingRpc(chain, url);
    },
  );
};

export default settingsRoutes;
