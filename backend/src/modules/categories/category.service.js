import mongoose from 'mongoose';
import { DEFAULT_CATEGORIES } from '@jerp/shared';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { diffChanges } from '../../utils/diff.js';
import { Product } from '../products/product.model.js';
import { Category } from './category.model.js';

const serialize = (c, counts) => ({
  id: c._id,
  name: c.name,
  parentId: c.parentId,
  defaultMetal: c.defaultMetal,
  hsnCode: c.hsnCode,
  sortOrder: c.sortOrder,
  isSystem: c.isSystem,
  productCount: counts?.get(String(c._id)) ?? 0,
});

async function productCounts() {
  const rows = await Product.aggregate([
    { $match: { isDeleted: false } },
    { $project: { ids: { $setUnion: [['$categoryId'], { $cond: [{ $ifNull: ['$subcategoryId', false] }, ['$subcategoryId'], []] }] } } },
    { $unwind: '$ids' },
    { $group: { _id: '$ids', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

async function findCategory(id) {
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category');
  return category;
}

async function assertParent(parentId, selfId) {
  if (!parentId) return;
  if (selfId && String(parentId) === String(selfId)) throw ApiError.badRequest('A category cannot be its own parent', [{ path: 'parentId', message: 'Choose another parent' }], 'VALIDATION_ERROR');
  const parent = await Category.findById(parentId).lean();
  if (!parent) throw ApiError.badRequest('Parent category not found', [{ path: 'parentId', message: 'Parent not found' }], 'VALIDATION_ERROR');
  if (parent.parentId) throw ApiError.badRequest('Subcategories cannot have their own subcategories', [{ path: 'parentId', message: 'Choose a top-level category' }], 'VALIDATION_ERROR');
  if (selfId && (await Category.exists({ parentId: selfId }))) {
    throw ApiError.badRequest('This category has subcategories, so it must stay top-level', [{ path: 'parentId', message: 'Has subcategories' }], 'VALIDATION_ERROR');
  }
}

const duplicateName = (err) => {
  if (err?.code === 11000) throw ApiError.conflict('A category with this name already exists here', 'DUPLICATE', [{ path: 'name', message: 'Name already used' }]);
  throw err;
};

export async function listCategories() {
  const [categories, counts] = await Promise.all([Category.find({}).sort({ sortOrder: 1, name: 1 }).lean(), productCounts()]);
  return categories.map((c) => serialize(c, counts));
}

export async function createCategory(input) {
  await assertParent(input.parentId);
  const category = await Category.create({ ...input, createdBy: requireContext().userId }).catch(duplicateName);
  await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'category', recordType: 'Category', recordId: category._id, meta: { name: category.name } });
  return serialize(category.toObject());
}

export async function updateCategory(id, input) {
  const category = await findCategory(id);
  await assertParent(input.parentId, category._id);
  const before = category.toObject();
  category.set(input);
  const changes = diffChanges(before, category.toObject(), ['name', 'parentId', 'defaultMetal', 'hsnCode', 'sortOrder']);
  if (!changes.length) return serialize(before);
  await category.save().catch(duplicateName);
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'category', recordType: 'Category', recordId: category._id, meta: { name: category.name }, changes });
  return serialize(category.toObject());
}

export async function deleteCategory(id) {
  const category = await findCategory(id);
  if (await Category.exists({ parentId: category._id })) throw ApiError.conflict('Delete or move its subcategories first', 'IN_USE');
  const oid = new mongoose.Types.ObjectId(String(id));
  const used = await Product.countDocuments({ isDeleted: false, $or: [{ categoryId: oid }, { subcategoryId: oid }] });
  if (used) throw ApiError.conflict(`${used} product(s) use this category. Move them first.`, 'IN_USE');
  await category.deleteOne();
  await recordAudit({ action: AUDIT_ACTIONS.DELETE, module: 'category', recordType: 'Category', recordId: category._id, meta: { name: category.name } });
}

export async function addDefaultCategories({ session } = {}) {
  const existing = await Category.find({ parentId: null }).select('name').collation({ locale: 'en', strength: 2 }).session(session ?? null).lean();
  const names = new Set(existing.map((c) => c.name.toLowerCase()));
  const missing = DEFAULT_CATEGORIES.filter((c) => !names.has(c.name.toLowerCase()));
  if (!missing.length) return 0;
  await Category.create(
    missing.map((c, i) => ({ ...c, sortOrder: (i + 1) * 10, isSystem: true })),
    { session, ordered: true },
  );
  return missing.length;
}
