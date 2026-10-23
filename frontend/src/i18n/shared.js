/**
 * The app's view of @jerp/shared (vite.config.js points `@jerp/shared` here): everything as it is, except the lists
 * and names shown on screen, which come in the app's language. Values and keys stay the same, so saving and comparing
 * work as before. Only `label` / `short` / `name` texts change.
 */
import * as shared from '../../../packages/shared/src/index.js';
import { t } from './index.js';

export * from '../../../packages/shared/src/index.js';

const options = (list) => Object.freeze(list.map((o) => Object.freeze({ ...o, ...(o.label && { label: t(o.label) }), ...(o.short && o.short.length > 1 && { short: t(o.short) }) })));
const labels = (map) => Object.freeze(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, t(v)])));

// stateName() reads the English list inside the shared package; its result is shown in the app's language.
export const stateName = (code) => t(shared.stateName(code));

export const PURITIES = Object.freeze(Object.fromEntries(Object.entries(shared.PURITIES).map(([metal, list]) => [metal, options(list)])));
export const INDIAN_STATES = Object.freeze(shared.INDIAN_STATES.map((s) => Object.freeze({ ...s, name: t(s.name) })));
export const AUDIT_ACTION_LABELS = labels(shared.AUDIT_ACTION_LABELS);
export const CUSTOMER_SEGMENTS = options(shared.CUSTOMER_SEGMENTS);
export const KYC_DOC_TYPES = options(shared.KYC_DOC_TYPES);
export const SUPPLIER_SUPPLIES = options(shared.SUPPLIER_SUPPLIES);
export const METAL_OPTIONS = options(shared.METAL_OPTIONS);
export const JEWELLERY_TYPES = options(shared.JEWELLERY_TYPES);
export const STONE_TYPES = options(shared.STONE_TYPES);
export const PRODUCT_STATUS_LABELS = labels(shared.PRODUCT_STATUS_LABELS);
export const METAL_POOL_KINDS = options(shared.METAL_POOL_KINDS);
export const ADJUSTMENT_REASONS = options(shared.ADJUSTMENT_REASONS);
export const MOVEMENT_TYPE_LABELS = labels(shared.MOVEMENT_TYPE_LABELS);
export const EXPENSE_PAY_MODES = options(shared.EXPENSE_PAY_MODES);
export const PAYMENT_MODES = options(shared.PAYMENT_MODES);
export const ORDER_STATUS_LABELS = labels(shared.ORDER_STATUS_LABELS);
export const ATTENDANCE_STATUSES = options(shared.ATTENDANCE_STATUSES);
// Role editor: module and permission names (the module `group` stays as the key it is grouped by).
export const PERMISSION_MODULES = shared.PERMISSION_MODULES.map((m) => ({ ...m, label: t(m.label), actions: labels(m.actions) }));
