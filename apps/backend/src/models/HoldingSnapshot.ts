import mongoose, { Schema, type Model, type InferSchemaType } from 'mongoose';

/** A daily portfolio-value snapshot, written by the cron route. */
const holdingSnapshotSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD' (UTC)
  totalValueUsd: { type: Number, required: true },
  breakdown: {
    type: [{ asset: String, valueUsd: Number }],
    _id: false,
    default: [],
  },
});

holdingSnapshotSchema.index({ userId: 1, date: 1 }, { unique: true });

export type HoldingSnapshotDoc = InferSchemaType<typeof holdingSnapshotSchema>;

export const HoldingSnapshot: Model<HoldingSnapshotDoc> =
  (mongoose.models.HoldingSnapshot as Model<HoldingSnapshotDoc>) ??
  mongoose.model('HoldingSnapshot', holdingSnapshotSchema);
