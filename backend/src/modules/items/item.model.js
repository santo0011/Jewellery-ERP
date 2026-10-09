import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

/** A catalogue item: a design's fixed details, reused to create pieces on purchases without retyping them. */
const itemSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true }, // lower-cased name, for duplicate checks
    categoryId: { type: ObjectId, ref: 'Category', required: true },
    jewelleryType: { type: String, required: true },
    metal: { type: String, required: true },
    purity: { type: Number, required: true },
    wastage: { mode: { type: String, default: 'none' }, value: { type: Number, default: 0 } },
    making: { type: { type: String, default: 'per_gram' }, value: { type: Number, default: 0 } },
    hsnCode: { type: String, default: null },
    description: { type: String, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    usedCount: { type: Number, default: 0 }, // pieces made from it — most-used items come first in search
    createdBy: { type: ObjectId, ref: 'User', default: null },
    updatedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
itemSchema.plugin(tenantPlugin);
itemSchema.index({ organisationId: 1, code: 1 }, { unique: true });
itemSchema.index({ organisationId: 1, nameKey: 1, metal: 1, purity: 1 }, { unique: true });
itemSchema.index({ organisationId: 1, status: 1, usedCount: -1 });

export const Item = mongoose.model('Item', itemSchema);
