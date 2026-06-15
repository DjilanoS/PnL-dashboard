import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import mongoose from 'mongoose';
import { CashAdjustment, toCashAdjustmentDTO } from '../../models/CashAdjustment';
import { CashAdjustmentDtoSchema, CashAdjustmentInputSchema, ErrorSchema } from '../../schemas';

/** Manual USDC balance adjustments (deposits/withdrawals that aren't trades). */
const cashRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/adjustments',
    { schema: { response: { 200: Type.Array(CashAdjustmentDtoSchema) } } },
    async (req) => {
      const docs = await CashAdjustment.find({ userId: req.user.sub }).sort({ timestamp: -1 });
      return docs.map(toCashAdjustmentDTO);
    },
  );

  app.post(
    '/adjustments',
    {
      schema: {
        body: CashAdjustmentInputSchema,
        response: { 200: CashAdjustmentDtoSchema, 400: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { amount, note, timestamp } = req.body;
      if (!Number.isFinite(amount) || amount === 0) {
        return reply.code(400).send({ error: 'amount_must_be_nonzero' });
      }
      const doc = await CashAdjustment.create({
        userId: new mongoose.Types.ObjectId(req.user.sub),
        amount,
        note: note?.trim() || undefined,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      });
      return toCashAdjustmentDTO(doc);
    },
  );

  app.delete(
    '/adjustments/:id',
    {
      schema: {
        params: Type.Object({ id: Type.String() }),
        response: { 200: Type.Object({ ok: Type.Boolean() }), 404: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return reply.code(404).send({ error: 'not_found' });
      const res = await CashAdjustment.deleteOne({ _id: id, userId: req.user.sub });
      if (res.deletedCount === 0) return reply.code(404).send({ error: 'not_found' });
      return { ok: true };
    },
  );
};

export default cashRoutes;
