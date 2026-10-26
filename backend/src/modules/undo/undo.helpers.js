import { deleteCheck, deleteRecord } from '../records/record.deletion.js';
import { changedFields, inputOf, sameValues } from './undo.snapshot.js';

export { metalShortfall, piecesGone } from './undo.checks.js';
export { changedFields, editSnapshot, inputOf, sameValues } from './undo.snapshot.js';

/*
 * Building blocks for undo handlers. A handler is
 *   { type, title, mode, permission, check(entry), run(entry, { reason }) }
 *   type        the key an action is registered under (entry.type)
 *   title       what the action was, for people ("Customer added")
 *   mode        'undo' — the record is put back as it was; 'reversal' — a reversing entry is made (money, stock)
 *   permission  what the person undoing needs (a string or a list, all needed)
 *   check       { ok: true, effect } | { ok: false, reason } | { superseded: true, reason } — superseded: it was
 *               already taken back some other way, so the stack moves past it
 *   run         takes the action back, inside the undo's transaction; may return a result to keep ({ docNo } …)
 *
 * The factories below cover records people add, edit, switch on/off and delete. They take the action back
 * through the module's own functions (same checks, ledger postings and audit trail as doing it by hand).
 */

const humanise = (field) => field.replace(/Paise$|Mg$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/**
 * "Added X" — undone by deleting X while nothing uses it yet, with the same rules as the Delete button
 * (records.deletion: who may, what blocks it, what is tidied up). `exists(id)` is false once it is gone.
 */
export function undoCreate({ type, title, deleteType, permission, exists }) {
  return {
    type,
    title,
    mode: 'undo',
    permission,
    async check(entry) {
      if (!(await exists(entry.recordId))) return { superseded: true, reason: 'Already deleted' };
      const c = await deleteCheck(deleteType, entry.recordId);
      if (!c.deletable) return { ok: false, reason: c.message };
      return { ok: true, effect: `Deletes ${c.name}. Nothing uses it yet.` };
    },
    run: async (entry) => {
      await deleteRecord(deleteType, entry.recordId);
    },
  };
}

/**
 * "Edited X" — undone by saving X again with the values it had before, through the module's own update. Refused if
 * it was changed again since (the change would be lost) or if the edit moved money (`moneyFields`): putting a
 * balance back by hand is safer than an automatic refund.
 *   load(id)        the record as its edit form loads it, or null when it is gone
 *   apply(id, input) the module's update
 *   guard(entry)    a reason the module's update would refuse it now, or null
 */
export function undoEdit({ type, title, permission, schema, load, apply, moneyFields = [], guard }) {
  return {
    type,
    title,
    mode: 'undo',
    permission,
    async check(entry) {
      const current = await load(entry.recordId);
      if (!current) return { superseded: true, reason: 'It was deleted' };
      const { before, after } = entry.data ?? {};
      if (!before || !after) return { ok: false, reason: 'What it was before this edit was not kept.' };
      if (!sameValues(inputOf(schema, current), after)) return { ok: false, reason: `${entry.label ?? 'It'} was changed again after this edit. Change it back by hand instead.` };
      const money = moneyFields.filter((f) => !sameValues(before[f], after[f]));
      if (money.length) return { ok: false, reason: `This edit changed ${money.map(humanise).join(' and ')} — money already moved. Edit it back by hand so the books stay right.` };
      const refused = await guard?.(entry);
      if (refused) return { ok: false, reason: refused };
      const fields = changedFields(before, after).map(humanise);
      return { ok: true, effect: fields.length ? `Puts back what it was before: ${fields.join(', ')}.` : 'Puts it back as it was.' };
    },
    run: async (entry) => {
      await apply(entry.recordId, schema.parse(entry.data.before));
    },
  };
}

/**
 * "Switched X on / off" — undone by setting the earlier status again. data: { from, to }.
 *   status(id)        its current status, or null when it is gone
 *   apply(id, status) the module's status change
 */
export function undoStatus({ type, title, permission, status, apply, describe = (s) => s }) {
  return {
    type,
    title,
    mode: 'undo',
    permission,
    async check(entry) {
      const now = await status(entry.recordId);
      if (now == null) return { superseded: true, reason: 'It was deleted' };
      if (now === entry.data?.from) return { superseded: true, reason: 'Its status is already back' };
      if (now !== entry.data?.to) return { ok: false, reason: 'Its status was changed again since.' };
      return { ok: true, effect: `Sets it back to ${describe(entry.data.from)}.` };
    },
    run: async (entry) => {
      await apply(entry.recordId, entry.data.from);
    },
  };
}

/**
 * "Deleted X" — undone by bringing X back. Soft-deleted records (customers, suppliers, products) are only hidden,
 * so they are shown again; others come back from the copy kept when they were deleted (entry.data.snapshot) —
 * files deleted with them (photos, images) cannot come back. `clash(doc)` names a record that took its place
 * (same mobile, same name …), which blocks bringing it back.
 */
export function undoDelete({ type, title, permission, model, soft = false, clash, prepare = (d) => d, restoreSet = {} }) {
  return {
    type,
    title,
    mode: 'undo',
    permission,
    async check(entry) {
      const doc = await model.findOne({ _id: entry.recordId }).lean();
      if (soft ? !doc || !doc.isDeleted : doc) return { superseded: true, reason: 'It is back already' };
      if (!soft && !entry.data?.snapshot) return { ok: false, reason: 'No copy was kept when it was deleted.' };
      const other = await clash?.(soft ? doc : entry.data.snapshot);
      if (other) return { ok: false, reason: other };
      return { ok: true, effect: soft ? `Brings ${entry.label} back.` : `Brings ${entry.label} back as it was when deleted${entry.data.lostFiles ? ' (its photos were deleted with it and do not come back)' : ''}.` };
    },
    run: async (entry) => {
      if (soft) await model.updateOne({ _id: entry.recordId }, { $set: { isDeleted: false, ...restoreSet } });
      else await model.create([prepare(entry.data.snapshot)]);
    },
  };
}
