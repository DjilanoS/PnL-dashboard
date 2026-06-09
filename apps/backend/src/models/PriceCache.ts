import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

/** Current-price cache, keyed per token; rows auto-expire ~60s after fetch. */
const priceCacheSchema = new Schema({
  chain: { type: String, enum: ['sol', 'sui'], required: true },
  address: { type: String, required: true },
  priceUsd: { type: Number, required: true },
  fetchedAt: { type: Date, required: true },
});

priceCacheSchema.index({ chain: 1, address: 1 }, { unique: true });
priceCacheSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 60 });

export type PriceCacheDoc = InferSchemaType<typeof priceCacheSchema>;

export const PriceCache: Model<PriceCacheDoc> =
  (mongoose.models.PriceCache as Model<PriceCacheDoc>) ??
  mongoose.model('PriceCache', priceCacheSchema);

/** Historical daily prices per token — immutable, cached forever (no TTL). */
const historicalPriceSchema = new Schema({
  chain: { type: String, enum: ['sol', 'sui'], required: true },
  address: { type: String, required: true },
  dayTs: { type: Number, required: true }, // unix seconds at UTC day start
  priceUsd: { type: Number, required: true },
});

historicalPriceSchema.index({ chain: 1, address: 1, dayTs: 1 }, { unique: true });

export type HistoricalPriceDoc = InferSchemaType<typeof historicalPriceSchema>;

export const HistoricalPrice: Model<HistoricalPriceDoc> =
  (mongoose.models.HistoricalPrice as Model<HistoricalPriceDoc>) ??
  mongoose.model('HistoricalPrice', historicalPriceSchema);
