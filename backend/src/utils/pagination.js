export async function paginate(query, countQuery, { page, limit }) {
  const [items, total] = await Promise.all([query.skip((page - 1) * limit).limit(limit).lean(), countQuery]);
  return { items, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function searchFilter(q, fields) {
  if (!q) return {};
  const rx = new RegExp(escapeRegex(q), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}

export const toDate = (iso) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
export const fromDate = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);
