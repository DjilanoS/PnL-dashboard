import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import mongoose from 'mongoose';
import { AuthNonce } from '../../models/AuthNonce';
import { Wallet, toWalletDTO } from '../../models/Wallet';
import { addWalletMessage, generateNonce, verifyWalletSignature } from '../../services/auth';
import { ChainSchema, ErrorSchema, WalletDtoSchema, WalletsResponseSchema } from '../../schemas';

const AddressSchema = Type.String({ minLength: 32, maxLength: 100 });

/** The user's per-chain "your wallets" list. All routes require a valid JWT. */
const walletRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('onRequest', app.authenticate);

  // Issue a single-use nonce for the wallet to sign (proves ownership before add).
  app.post(
    '/nonce',
    {
      schema: {
        body: Type.Object({ chain: ChainSchema, address: AddressSchema }),
        response: { 200: Type.Object({ nonce: Type.String() }) },
      },
    },
    async (req) => {
      const { chain, address } = req.body;
      const userId = new mongoose.Types.ObjectId(req.user.sub);
      await AuthNonce.deleteMany({ userId, chain, address, purpose: 'add-wallet' });
      const nonce = generateNonce();
      await AuthNonce.create({
        userId,
        chain,
        address,
        nonce,
        purpose: 'add-wallet',
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });
      return { nonce };
    },
  );

  // Verify the signed nonce and add the wallet to the caller's list.
  app.post(
    '/',
    {
      schema: {
        body: Type.Object({
          chain: ChainSchema,
          address: AddressSchema,
          signature: Type.String(),
          nonce: Type.String(),
          label: Type.Optional(Type.String({ maxLength: 60 })),
        }),
        response: { 200: WalletDtoSchema, 401: ErrorSchema, 409: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { chain, address, signature, nonce, label } = req.body;
      const userId = new mongoose.Types.ObjectId(req.user.sub);

      const record = await AuthNonce.findOne({ userId, chain, address, nonce, purpose: 'add-wallet' });
      if (!record) return reply.code(401).send({ error: 'invalid_or_expired_nonce' });

      const ok = await verifyWalletSignature(chain, address, signature, addWalletMessage(nonce));
      await AuthNonce.deleteOne({ _id: record._id }); // single-use, success or fail
      if (!ok) return reply.code(401).send({ error: 'invalid_signature' });

      try {
        const doc = await Wallet.create({
          userId,
          chain,
          address,
          label: label?.trim() || null,
          verifiedAt: new Date(),
        });
        return toWalletDTO(doc);
      } catch (err) {
        // Unique {userId,chain,address} → already in the user's list.
        if ((err as { code?: number }).code === 11000) {
          return reply.code(409).send({ error: 'wallet_already_added' });
        }
        throw err;
      }
    },
  );

  // List the caller's wallets, grouped by chain (oldest first).
  app.get('/', { schema: { response: { 200: WalletsResponseSchema } } }, async (req) => {
    const wallets = await Wallet.find({
      userId: new mongoose.Types.ObjectId(req.user.sub),
    }).sort({ createdAt: 1 });
    return {
      sol: wallets.filter((w) => w.chain === 'sol').map(toWalletDTO),
      sui: wallets.filter((w) => w.chain === 'sui').map(toWalletDTO),
    };
  });

  // Remove a wallet from the caller's list.
  app.delete(
    '/:id',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: { 200: Type.Object({ ok: Type.Boolean() }), 404: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return reply.code(404).send({ error: 'not_found' });
      const res = await Wallet.deleteOne({
        _id: id,
        userId: new mongoose.Types.ObjectId(req.user.sub),
      });
      if (res.deletedCount === 0) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    },
  );
};

export default walletRoutes;
