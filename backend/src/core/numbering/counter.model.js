import mongoose from 'mongoose';
import { tenantPlugin } from '../tenancy/tenantPlugin.js';

const counterSchema = new mongoose.Schema({ key: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false });

counterSchema.plugin(tenantPlugin);
counterSchema.index({ organisationId: 1, key: 1 }, { unique: true });

export const Counter = mongoose.model('Counter', counterSchema);
