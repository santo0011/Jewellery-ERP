import mongoose from 'mongoose';
import { BRANCH_STATUS, deriveWeights, hasPermission, PLAN_LIMITS, PRODUCT_STATUS, PURITIES } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { nextCode } from '../../core/numbering/numbering.service.js';
import { FileAsset } from '../../core/storage/fileAsset.model.js';
import { detectImageType, storage } from '../../core/storage/storage.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomToken } from '../../utils/crypto.js';
import { diffChanges } from '../../utils/diff.js';
import { fromDate, paginate, searchFilter, toDate } from '../../utils/pagination.js';
import { Branch } from '../branches/branch.model.js';
import { Category } from '../categories/category.model.js';
import { Subscription } from '../organisations/subscription.model.js';
import { getSettings } from '../settings/settings.service.js';
import { Supplier } from '../suppliers/supplier.model.js';
import { Product } from './product.model.js';

const MAX_IMAGES = 8;
const stockIdentity = (p) => ({
  metal: p.metal,
  purity: p.purity,
  stockType: p.stockType,
  quantity: p.stockType === 'tagged' ? 1 : p.quantity,
  grossWeightMg: p.grossWeightMg,
  branchId: String(p.branchId),
  stones: (p.stones ?? []).map((st) => [st.type, st.count, st.weight, st.weightUnit]),
});
const TRACKED = [
  'name', 'categoryId', 'subcategoryId', 'jewelleryType', 'metal', 'purity', 'stockType', 'quantity', 'grossWeightMg', 'stones',
  'wastage', 'making', 'otherChargePaise', 'hsnCode', 'costPricePaise', 'pricingMode', 'fixedPricePaise', 'huid', 'hallmarkCentre',
  'hallmarkDate', 'certificateNo', 'supplierId', 'branchId', 'description', 'tags',
];

const vis = () => {
  const { permissions, branchAccess } = requireContext();
  return { canSeeCost: hasPermission(permissions, 'product.viewCost'), branchAccess };
};

const branchScope = () => {
  const { branchAccess } = vis();
  return branchAccess?.all ? {} : { branchId: { $in: (branchAccess?.branchIds ?? []).map((id) => new mongoose.Types.ObjectId(id)) } };
};

async function lookups(products) {
  const ids = (key) => [...new Set(products.flatMap((p) => [p[key]]).filter(Boolean).map(String))];
  const categoryIds = [...new Set([...ids('categoryId'), ...ids('subcategoryId')])];
  const [categories, suppliers, branches] = await Promise.all([
    categoryIds.length ? Category.find({ _id: { $in: categoryIds } }).select('name').lean() : [],
    ids('supplierId').length ? Supplier.find({ _id: { $in: ids('supplierId') } }).select('companyName code').lean() : [],
    ids('branchId').length ? Branch.find({ _id: { $in: ids('branchId') } }).select('name code').lean() : [],
  ]);
  const map = (rows, fn) => new Map(rows.map((r) => [String(r._id), fn(r)]));
  return {
    categories: map(categories, (c) => ({ id: c._id, name: c.name })),
    suppliers: map(suppliers, (s) => ({ id: s._id, name: s.companyName, code: s.code })),
    branches: map(branches, (b) => ({ id: b._id, name: b.name, code: b.code })),
  };
}

function serialize(p, maps) {
  const { canSeeCost } = vis();
  const ref = (m, id) => (id ? (m.get(String(id)) ?? null) : null);
  return {
    id: p._id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    category: ref(maps.categories, p.categoryId),
    subcategory: ref(maps.categories, p.subcategoryId),
    jewelleryType: p.jewelleryType,
    metal: p.metal,
    purity: p.purity,
    stockType: p.stockType,
    quantity: p.quantity,
    grossWeightMg: p.grossWeightMg,
    stoneWeightMg: p.stoneWeightMg,
    netWeightMg: p.netWeightMg,
    fineWeightMg: p.fineWeightMg,
    stones: p.stones ?? [],
    wastage: p.wastage,
    making: p.making,
    otherChargePaise: p.otherChargePaise,
    hsnCode: p.hsnCode,
    costPricePaise: canSeeCost ? p.costPricePaise : undefined,
    pricingMode: p.pricingMode,
    fixedPricePaise: p.fixedPricePaise,
    huid: p.huid,
    hallmarkCentre: p.hallmarkCentre,
    hallmarkDate: fromDate(p.hallmarkDate),
    certificateNo: p.certificateNo,
    supplier: ref(maps.suppliers, p.supplierId),
    branch: ref(maps.branches, p.branchId),
    description: p.description,
    tags: p.tags ?? [],
    images: (p.images ?? []).map((i) => String(i.fileId)),
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const fail = (path, message) => {
  throw ApiError.badRequest(message, [{ path, message }], 'VALIDATION_ERROR');
};

async function validateReferences(input) {
  const { branchAccess } = vis();
  const [category, subcategory, supplier, branch, settings] = await Promise.all([
    Category.findById(input.categoryId).lean(),
    input.subcategoryId ? Category.findById(input.subcategoryId).lean() : null,
    input.supplierId ? Supplier.findOne({ _id: input.supplierId, isDeleted: false }).lean() : null,
    Branch.findOne({ _id: input.branchId, status: BRANCH_STATUS.ACTIVE }).lean(),
    getSettings(),
  ]);

  if (!category || category.parentId) fail('categoryId', 'Select a valid category');
  if (input.subcategoryId && (!subcategory || String(subcategory.parentId) !== String(category._id))) fail('subcategoryId', 'Subcategory does not belong to this category');
  if (input.supplierId && !supplier) fail('supplierId', 'Supplier not found');
  if (!branch || (!branchAccess?.all && !branchAccess?.branchIds?.includes(String(input.branchId)))) fail('branchId', 'Select an active branch you have access to');
  if (!PURITIES[input.metal]?.some((p) => p.fineness === input.purity)) fail('purity', 'Select a valid purity for this metal');
  if (!settings.jewellery.enabledPurities[input.metal]?.includes(input.purity)) fail('purity', 'This purity is turned off in Business settings → Jewellery');

  return { category, settings };
}

async function assertHuidFree(huid, exceptId) {
  if (!huid) return;
  const clash = await Product.findOne({ huid, isDeleted: false, ...(exceptId && { _id: { $ne: exceptId } }) }).select('sku').lean();
  if (clash) throw ApiError.conflict(`HUID already used on ${clash.sku}`, 'DUPLICATE', [{ path: 'huid', message: `Already used on ${clash.sku}` }]);
}

async function assertProductLimit() {
  const subscription = await Subscription.findOne({}).lean();
  const max = PLAN_LIMITS[subscription?.plan]?.products;
  if (max == null) return;
  if ((await Product.countDocuments({ isDeleted: false })) >= max) throw ApiError.forbidden(`Your plan allows ${max.toLocaleString('en-IN')} products. Upgrade to add more.`, 'PLAN_LIMIT_REACHED');
}

const toDocument = (input, category, settings) => ({
  ...input,
  quantity: input.stockType === 'tagged' ? 1 : input.quantity,
  hallmarkDate: toDate(input.hallmarkDate),
  hsnCode: input.hsnCode ?? category.hsnCode ?? settings.tax.hsnJewellery,
  fixedPricePaise: input.pricingMode === 'fixed' ? input.fixedPricePaise : null,
  ...deriveWeights(input),
});

async function findProduct(id) {
  const product = await Product.findOne({ _id: id, isDeleted: false, ...branchScope() });
  if (!product) throw ApiError.notFound('Product');
  return product;
}

export async function listProducts({ page, limit, q, categoryId, metal, purity, status, branchId, supplierId }) {
  const filter = { isDeleted: false, ...branchScope(), ...searchFilter(q, ['name', 'sku', 'barcode', 'huid', 'tags']) };
  if (categoryId) filter.$and = [{ $or: [{ categoryId }, { subcategoryId: categoryId }] }];
  if (metal) filter.metal = metal;
  if (purity) filter.purity = purity;
  if (status) filter.status = status;
  if (supplierId) filter.supplierId = supplierId;
  if (branchId) {
    const allowed = branchScope().branchId?.$in;
    filter.branchId = !allowed || allowed.some((b) => String(b) === branchId) ? branchId : { $in: [] };
  }

  const { items, meta } = await paginate(Product.find(filter).sort({ createdAt: -1 }), Product.countDocuments(filter), { page, limit });
  const maps = await lookups(items);
  return { items: items.map((p) => serialize(p, maps)), meta };
}

export async function getProduct(id) {
  const product = (await findProduct(id)).toObject();
  return serialize(product, await lookups([product]));
}

export async function lookupProduct(code) {
  const value = code.trim().toUpperCase();
  const product = await Product.findOne({ isDeleted: false, ...branchScope(), $or: [{ barcode: value }, { sku: value }, { huid: value }] }).lean();
  if (!product) throw ApiError.notFound('Item');
  return serialize(product, await lookups([product]));
}

export async function createProduct(input) {
  const { userId } = requireContext();
  const { category, settings } = await validateReferences(input);
  await Promise.all([assertHuidFree(input.huid), assertProductLimit()]);

  const product = await withTransaction(async (session) => {
    const sku = await nextCode('product', settings.barcode.skuPrefix, 6, { session });
    const [doc] = await Product.create([{ ...toDocument(input, category, settings), sku, barcode: sku, createdBy: userId, updatedBy: userId }], { session });
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'product', recordType: 'Product', recordId: doc._id, meta: { name: doc.name, sku } }, { session });
    return doc;
  });
  return getProduct(product._id);
}

/** Sets only the HUID (e.g. a finished order piece that reached the counter without one). */
export async function setProductHuid(id, huid) {
  const { userId } = requireContext();
  const product = await findProduct(id);
  if (product.status === PRODUCT_STATUS.SOLD) throw ApiError.conflict(`${product.sku} is already sold`, 'INVALID_STATE');
  if (product.huid === huid) return getProduct(id);
  await assertHuidFree(huid, product._id);
  const from = product.huid ?? null;
  product.huid = huid;
  product.updatedBy = userId;
  await product.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'product', recordType: 'Product', recordId: product._id, meta: { name: product.name, sku: product.sku }, changes: [{ field: 'huid', from, to: huid }] });
  return getProduct(id);
}

export async function updateProduct(id, input) {
  const { userId } = requireContext();
  const product = await findProduct(id);
  const before = product.toObject();
  const { canSeeCost } = vis();
  const next = { ...input, costPricePaise: canSeeCost ? input.costPricePaise : before.costPricePaise };

  if (product.status !== PRODUCT_STATUS.DRAFT) {
    const was = stockIdentity(before);
    const will = stockIdentity(next);
    const locked = Object.keys(was).filter((f) => JSON.stringify(was[f]) !== JSON.stringify(will[f]));
    if (locked.length) throw ApiError.conflict('Weight, metal, purity and branch of stocked items change only through stock adjustments or transfers', 'PRODUCT_LOCKED', locked.map((path) => ({ path, message: 'Locked while in stock' })));
  }

  const { category, settings } = await validateReferences(next);
  if (next.huid !== before.huid) await assertHuidFree(next.huid, product._id);

  product.set({ ...toDocument(next, category, settings), updatedBy: userId });
  const changes = diffChanges(before, product.toObject(), TRACKED);
  if (!changes.length) return getProduct(id);
  await product.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'product', recordType: 'Product', recordId: product._id, meta: { name: product.name, sku: product.sku }, changes });
  return getProduct(id);
}

export async function deleteProduct(id) {
  const product = await findProduct(id);
  if (product.status !== PRODUCT_STATUS.DRAFT) throw ApiError.conflict('Only draft products can be deleted. Stocked items leave inventory through sale, return or adjustment.', 'PRODUCT_LOCKED');
  product.set({ isDeleted: true, updatedBy: requireContext().userId });
  await product.save();
  await recordAudit({ action: AUDIT_ACTIONS.DELETE, module: 'product', recordType: 'Product', recordId: product._id, meta: { name: product.name, sku: product.sku } });
  await Promise.all(product.images.map((i) => removeAsset(i.fileId)));
}

async function removeAsset(fileId) {
  const asset = await FileAsset.findByIdAndDelete(fileId).lean();
  if (asset) await storage.remove(asset.key);
}

export async function addProductImage(id, file) {
  const { organisationId, userId } = requireContext();
  const product = await findProduct(id);
  if (product.images.length >= MAX_IMAGES) throw ApiError.badRequest(`A product can have up to ${MAX_IMAGES} images`, undefined, 'TOO_MANY_IMAGES');
  const type = detectImageType(file.buffer);
  if (!type) throw ApiError.badRequest('Images must be PNG, JPEG or WebP', undefined, 'UNSUPPORTED_FILE');

  const key = `${organisationId}/products/${product._id}/${randomToken(12)}.${type.ext}`;
  await storage.put(key, file.buffer);
  const asset = await FileAsset.create({ key, purpose: 'product_image', mimeType: type.mime, size: file.size, originalName: file.originalname?.slice(0, 200) ?? null, uploadedBy: userId });
  product.images.push({ fileId: asset._id });
  product.updatedBy = userId;
  await product.save();
  return getProduct(id);
}

export async function removeProductImage(id, fileId) {
  const product = await findProduct(id);
  const index = product.images.findIndex((i) => String(i.fileId) === String(fileId));
  if (index === -1) throw ApiError.notFound('Image');
  product.images.splice(index, 1);
  product.updatedBy = requireContext().userId;
  await product.save();
  await removeAsset(fileId);
  return getProduct(id);
}

export async function setPrimaryImage(id, fileId) {
  const product = await findProduct(id);
  const index = product.images.findIndex((i) => String(i.fileId) === String(fileId));
  if (index === -1) throw ApiError.notFound('Image');
  const [image] = product.images.splice(index, 1);
  product.images.unshift(image);
  await product.save();
  return getProduct(id);
}
