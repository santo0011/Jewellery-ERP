import { JEWELLERY_TYPES, PURITIES } from '@jerp/shared';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { nextCode } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { diffChanges } from '../../utils/diff.js';
import { paginate, searchFilter } from '../../utils/pagination.js';
import { Category } from '../categories/category.model.js';
import { getSettings } from '../settings/settings.service.js';
import { Item } from './item.model.js';

const nameKey = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');
const purityLabel = (metal, purity) => PURITIES[metal]?.find((p) => p.fineness === purity)?.label ?? String(purity);

function serialize(i, categories) {
  return {
    id: i._id,
    code: i.code,
    name: i.name,
    category: categories?.get(String(i.categoryId)) ?? { id: i.categoryId },
    jewelleryType: i.jewelleryType,
    jewelleryTypeLabel: JEWELLERY_TYPES.find((t) => t.value === i.jewelleryType)?.label ?? i.jewelleryType,
    metal: i.metal,
    purity: i.purity,
    purityLabel: purityLabel(i.metal, i.purity),
    wastage: i.wastage,
    making: i.making,
    hsnCode: i.hsnCode,
    description: i.description,
    status: i.status,
    usedCount: i.usedCount ?? 0,
    createdAt: i.createdAt,
  };
}

async function categoryMap(items) {
  const rows = await Category.find({ _id: { $in: [...new Set(items.map((i) => String(i.categoryId)))] } }).select('name').lean();
  return new Map(rows.map((c) => [String(c._id), { id: c._id, name: c.name }]));
}

async function validate(input) {
  const [category, settings] = await Promise.all([Category.findById(input.categoryId).lean(), getSettings()]);
  if (!category || category.parentId) throw ApiError.badRequest('Select a valid category', [{ path: 'categoryId', message: 'Select a category' }], 'VALIDATION_ERROR');
  if (!settings.jewellery.enabledPurities[input.metal]?.includes(input.purity)) {
    throw ApiError.badRequest('This purity is turned off in Business settings', [{ path: 'purity', message: 'Turned off in Business settings → Jewellery' }], 'VALIDATION_ERROR');
  }
  return category;
}

async function assertUnique(input, exceptId) {
  const clash = await Item.findOne({ nameKey: nameKey(input.name), metal: input.metal, purity: input.purity, ...(exceptId && { _id: { $ne: exceptId } }) }).select('code').lean();
  if (clash) throw ApiError.conflict(`“${input.name}” in this purity already exists (${clash.code})`, 'DUPLICATE', [{ path: 'name', message: `Already saved as ${clash.code}` }]);
}

/** Search for the picker and the Items page: name, code or description; most-used first when searching. */
export async function listItems({ page, limit, q, status, metal }) {
  const filter = { ...searchFilter(q, ['name', 'code', 'description', 'hsnCode']) };
  if (status) filter.status = status;
  if (metal) filter.metal = metal;
  const sort = q ? { usedCount: -1, name: 1 } : { name: 1 };
  const { items, meta } = await paginate(Item.find(filter).sort(sort), Item.countDocuments(filter), { page, limit });
  const [categories, active, total] = await Promise.all([categoryMap(items), Item.countDocuments({ status: 'active' }), Item.countDocuments({})]);
  return { items: items.map((i) => serialize(i, categories)), meta: { ...meta, summary: { total, active } } };
}

export async function getItem(id) {
  const item = await Item.findById(id).lean();
  if (!item) throw ApiError.notFound('Item');
  return serialize(item, await categoryMap([item]));
}

export async function createItem(input) {
  const { userId } = requireContext();
  const category = await validate(input);
  await assertUnique(input);
  const code = await nextCode('item', 'IT', 4);
  const doc = await Item.create({ ...input, code, nameKey: nameKey(input.name), hsnCode: input.hsnCode ?? category.hsnCode ?? null, description: input.description ?? null, createdBy: userId, updatedBy: userId });
  await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'purchase', recordType: 'Item', recordId: doc._id, meta: { name: doc.name, code } });
  return getItem(doc._id);
}

export async function updateItem(id, input) {
  const { userId } = requireContext();
  const item = await Item.findById(id);
  if (!item) throw ApiError.notFound('Item');
  await validate(input);
  await assertUnique(input, item._id);
  const before = item.toObject();
  item.set({ ...input, nameKey: nameKey(input.name), hsnCode: input.hsnCode ?? null, description: input.description ?? null, updatedBy: userId });
  await item.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'purchase', recordType: 'Item', recordId: item._id, meta: { name: item.name }, changes: diffChanges(before, item.toObject(), ['name', 'metal', 'purity', 'jewelleryType', 'hsnCode']) });
  return getItem(id);
}

export async function setItemStatus(id, { status }) {
  const item = await Item.findByIdAndUpdate(id, { $set: { status, updatedBy: requireContext().userId } }, { returnDocument: 'after' });
  if (!item) throw ApiError.notFound('Item');
  return getItem(id);
}

/** Items for new pieces on a bill, checked active; returns a map by id. */
export async function itemsForPieces(ids) {
  const items = await Item.find({ _id: { $in: [...new Set(ids.map(String))] } }).lean();
  const map = new Map(items.map((i) => [String(i._id), i]));
  for (const id of ids) {
    const i = map.get(String(id));
    if (!i) throw ApiError.badRequest('An item on the bill was not found', [{ path: 'newPieces', message: 'Unknown item' }], 'VALIDATION_ERROR');
    if (i.status !== 'active') throw ApiError.badRequest(`${i.name} is inactive`, [{ path: 'newPieces', message: `${i.name} is inactive` }], 'VALIDATION_ERROR');
  }
  return map;
}
