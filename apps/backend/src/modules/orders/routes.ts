import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import mongoose from 'mongoose';
import { nativeTokenAddress } from '@pnl/types';
import { Order, toOrderDTO } from '../../models/Order';
import { ErrorSchema, ManualOrderSchema, OrderDtoSchema } from '../../schemas';

const orderRoutes: FastifyPluginAsyncTypebox = async (app) => {
  // Every order route requires a valid JWT.
  app.addHook('onRequest', app.authenticate);

  // List the full ledger, newest first.
  app.get('/', { schema: { response: { 200: Type.Array(OrderDtoSchema) } } }, async (req) => {
    const docs = await Order.find({ userId: req.user.sub }).sort({ timestamp: -1 });
    return docs.map(toOrderDTO);
  });

  // Create a manual order (CEX buys / off-chain trades).
  app.post('/', { schema: { body: ManualOrderSchema, response: { 200: OrderDtoSchema } } }, async (req) => {
    const b = req.body;
    const doc = await Order.create({
      userId: new mongoose.Types.ObjectId(req.user.sub),
      chain: b.chain,
      address: b.address?.trim() || nativeTokenAddress(b.chain),
      asset: b.asset,
      decimals: b.decimals ?? 9,
      tokenName: b.name,
      tokenImage: b.image,
      side: b.side,
      amount: b.amount,
      priceUsd: b.priceUsd,
      quote: b.quote ?? { symbol: 'USD', amount: b.amount * b.priceUsd },
      feeUsd: b.feeUsd,
      gasUsd: b.gasUsd,
      timestamp: new Date(b.timestamp),
      source: 'manual',
    });
    return toOrderDTO(doc);
  });

  // Delete an order from the ledger.
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
      const res = await Order.deleteOne({ _id: id, userId: req.user.sub });
      if (res.deletedCount === 0) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    },
  );
};

export default orderRoutes;
