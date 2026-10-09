import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    defaultMetal: { type: String, default: null },
    hsnCode: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

categorySchema.plugin(tenantPlugin);
categorySchema.index({ organisationId: 1, parentId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Category = mongoose.model('Category', categorySchema);
