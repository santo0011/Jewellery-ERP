/*
 * What an edit changed, kept for Undo. No imports: services use these while saving, so they stay free of the
 * undo machinery.
 */

const plain = (v) => JSON.parse(JSON.stringify(v ?? null));
const sortDeep = (v) => (Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v);
/** Equal as stored: ids, dates and key order do not matter; missing, null and '' count as the same empty value. */
const canon = (v) => JSON.stringify(sortDeep(plain(v)), (k, x) => (x === '' || x === undefined ? null : x));
export const sameValues = (a, b) => canon(a) === canon(b);

/** The fields a form sends (the schema's keys), taken from a record as the edit form loads it. */
export const inputOf = (schema, obj) => plain(Object.fromEntries(Object.keys(schema.shape).filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]])));

/** Field names that differ between two form values. */
export const changedFields = (before, after) => [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !sameValues(before?.[k], after?.[k]));

/** For recordAudit's `undo` on an edit: the form's values before and after. */
export const editSnapshot = (schema, before, after) => ({ before: inputOf(schema, before), after: inputOf(schema, after) });
