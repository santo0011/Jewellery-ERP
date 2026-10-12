import mongoose from 'mongoose';

/** Records that never make another record "in use": the audit trail, sign-in sessions, stored files and number counters. */
const NEVER_BLOCK = new Set(['AuditLog', 'PlatformAudit', 'Session', 'FileAsset', 'Counter']);

/** What a reference is called in "in use" messages. */
const LABELS = {
  Account: ['ledger account', 'ledger accounts'],
  ApprovalRequest: ['approval request', 'approval requests'],
  Attendance: ['attendance mark', 'attendance marks'],
  AttendanceCalendar: ['branch calendar', 'branch calendars'],
  Branch: ['branch', 'branches'],
  Category: ['category', 'categories'],
  Customer: ['customer', 'customers'],
  Employee: ['employee', 'employees'],
  Item: ['item', 'items'],
  JournalEntry: ['ledger entry', 'ledger entries'],
  MetalRate: ['metal rate', 'metal rates'],
  MetalStock: ['metal stock record', 'metal stock records'],
  Order: ['customer order', 'customer orders'],
  Organisation: ['organisation', 'organisations'],
  PayrollRun: ['payroll run', 'payroll runs'],
  Product: ['product', 'products'],
  Purchase: ['purchase bill', 'purchase bills'],
  PurchaseOrder: ['purchase order', 'purchase orders'],
  Role: ['role', 'roles'],
  SalaryAdvance: ['salary advance', 'salary advances'],
  Sale: ['invoice', 'invoices'],
  SalesReturn: ['sales return', 'sales returns'],
  Settings: ['settings record', 'settings records'],
  StockEntry: ['stock entry', 'stock entries'],
  StockMovement: ['stock movement', 'stock movements'],
  StockTransfer: ['stock transfer', 'stock transfers'],
  Subscription: ['subscription', 'subscriptions'],
  SubscriptionPayment: ['subscription payment', 'subscription payments'],
  Supplier: ['supplier', 'suppliers'],
  User: ['user', 'users'],
};
export const labelFor = (model, count) => {
  const [one, many] = LABELS[model] ?? [model.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(), `${model.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}s`];
  return `${count} ${count === 1 ? one : many}`;
};

/** Every ObjectId field of a schema (nested objects, sub-documents and arrays included), with the model it points to. */
function objectIdPaths(schema, prefix = '') {
  const out = [];
  schema.eachPath((path, type) => {
    if (path === '_id' || path === 'organisationId' || path === '__v') return;
    const full = `${prefix}${path}`;
    if (type.schema) {
      out.push(...objectIdPaths(type.schema, `${full}.`));
      return;
    }
    const item = type.instance === 'Array' ? (type.embeddedSchemaType ?? type.caster) : type;
    if (item?.instance === 'ObjectId') out.push({ path: full, ref: item.options?.ref ?? type.options?.ref ?? null });
  });
  return out;
}

const pathCache = new Map();
const pathsOf = (model) => {
  if (!pathCache.has(model.modelName)) pathCache.set(model.modelName, objectIdPaths(model.schema));
  return pathCache.get(model.modelName);
};

/** "invoices", "attendance marks" — a model's name in a "used by …" list without counts. */
export const pluralLabel = (model) => LABELS[model]?.[1] ?? `${model.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}s`;

/**
 * Which of many records are pointed at, and by which models: Map(id -> [modelName]). One `distinct` per field, however
 * many ids — cheap enough to run for a whole table page. Same rules as findReferences.
 */
export async function findReferencesMany(modelName, ids, { ignore = [] } = {}) {
  const oids = ids.map((id) => new mongoose.Types.ObjectId(String(id)));
  const wanted = new Set(oids.map(String));
  const skipModels = new Set(ignore.filter((x) => typeof x === 'string'));
  const skipPaths = new Map(ignore.filter((x) => typeof x === 'object').map((x) => [x.model, new Set(x.paths)]));
  const used = new Map();
  for (const name of mongoose.modelNames()) {
    if (NEVER_BLOCK.has(name) || skipModels.has(name)) continue;
    const model = mongoose.model(name);
    const paths = pathsOf(model).filter((p) => (p.ref === modelName || !p.ref) && !skipPaths.get(name)?.has(p.path));
    for (const p of paths) {
      const filter = { [p.path]: { $in: oids } };
      if (model.schema.path('isDeleted')) filter.isDeleted = { $ne: true };
      const values = await model.distinct(p.path, filter);
      for (const v of values) {
        const key = String(v);
        if (!wanted.has(key)) continue;
        const list = used.get(key) ?? [];
        if (!list.includes(name)) list.push(name);
        used.set(key, list);
      }
    }
  }
  return used;
}

/**
 * Other records that point at a record: fields declared as references to its model, plus untyped id fields
 * (ledger parties, stock and journal sources, snapshots) that hold its id. Soft-deleted records do not count.
 * `ignore` lists models, or { model, paths } for single fields, that the caller tidies up itself.
 * Runs inside the request's tenant context, so only this organisation's records are counted.
 * Returns [{ model, count, label }].
 */
export async function findReferences(modelName, id, { ignore = [] } = {}) {
  const oid = new mongoose.Types.ObjectId(String(id));
  const skipModels = new Set(ignore.filter((x) => typeof x === 'string'));
  const skipPaths = new Map(ignore.filter((x) => typeof x === 'object').map((x) => [x.model, new Set(x.paths)]));
  const found = [];
  for (const name of mongoose.modelNames()) {
    if (NEVER_BLOCK.has(name) || skipModels.has(name)) continue;
    const model = mongoose.model(name);
    const paths = pathsOf(model).filter((p) => (p.ref === modelName || !p.ref) && !skipPaths.get(name)?.has(p.path));
    if (!paths.length) continue;
    const filter = { $or: paths.map((p) => ({ [p.path]: oid })) };
    if (name === modelName) filter._id = { $ne: oid };
    if (model.schema.path('isDeleted')) filter.isDeleted = { $ne: true };
    const count = await model.countDocuments(filter);
    if (count) found.push({ model: name, count, label: labelFor(name, count) });
  }
  return found;
}
