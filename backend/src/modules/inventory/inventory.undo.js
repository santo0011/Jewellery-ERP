import { APPROVAL_STATUS, STOCK_DOC_STATUS, TRANSFER_STATUS } from '@jerp/shared';
import { approvalHandlerFor, reopenRequest, withdrawRequest } from '../../core/approvals/approval.service.js';
import { ApprovalRequest } from '../../core/approvals/approvalRequest.model.js';
import { metalShortfall, sameValues } from '../undo/undo.helpers.js';
import { adjustmentReverseBlock, cancelOpeningStock, openingCancelBlock, reverseAdjustment, updateOpeningMetal } from './inventory.service.js';
import { Production } from './production.model.js';
import { cancelProduction, productionCancelBlock } from './production.service.js';
import { StockEntry } from './stockEntry.model.js';
import { StockTransfer } from './stockTransfer.model.js';
import { recallTransfer, reopenBlock, reopenTransfer } from './transfer.service.js';

const lineOf = (l) => ({ metal: l.metal, purity: l.purity, kind: l.kind, grossWeightMg: l.grossWeightMg, valuePaise: l.valuePaise });
const pieces = (n) => `${n} piece${n === 1 ? '' : 's'}`;

export const inventoryUndoHandlers = [
  {
    type: 'stock.opening',
    title: 'Opening stock added',
    mode: 'reversal',
    permission: 'inventory.adjust',
    async check(entry) {
      const e = await StockEntry.findById(entry.recordId).lean();
      if (!e || e.status === STOCK_DOC_STATUS.CANCELLED) return { superseded: true, reason: 'Already cancelled' };
      const block = await openingCancelBlock(e);
      if (block) return { ok: false, reason: block };
      return { ok: true, effect: `Cancels ${e.docNo}: ${[e.productIds.length && `${pieces(e.productIds.length)} back to draft`, e.metalLines.length && 'its gold leaves the metal stock'].filter(Boolean).join(', ')}, and its entry is reversed.` };
    },
    run: (entry, { reason }) => cancelOpeningStock(entry.recordId, reason),
  },
  {
    type: 'stock.openingEdit',
    title: 'Opening gold corrected',
    mode: 'undo',
    permission: 'inventory.adjust',
    async check(entry) {
      const e = await StockEntry.findById(entry.recordId).lean();
      if (!e || e.status !== STOCK_DOC_STATUS.POSTED) return { superseded: true, reason: 'The entry was cancelled' };
      if (!sameValues(e.metalLines.map(lineOf), entry.data.after)) return { ok: false, reason: 'It was corrected again since.' };
      const short = await metalShortfall(e.branchId, entry.data.after);
      if (short) return { ok: false, reason: short };
      return { ok: true, effect: `Puts the gold on ${e.docNo} back as it was (its entry is reposted).` };
    },
    run: (entry) => updateOpeningMetal(entry.recordId, { metalLines: entry.data.before, note: entry.data.note }),
  },
  {
    type: 'stock.adjustment',
    title: 'Stock adjustment posted',
    mode: 'reversal',
    permission: 'inventory.adjust',
    async check(entry) {
      const e = await StockEntry.findById(entry.recordId).lean();
      if (!e || e.status === STOCK_DOC_STATUS.CANCELLED) return { superseded: true, reason: 'Already reversed' };
      const block = await adjustmentReverseBlock(e);
      if (block) return { ok: false, reason: block };
      return { ok: true, effect: `Reverses ${e.docNo}: ${[e.productIds.length && `${pieces(e.productIds.length)} back in stock`, e.metalLines.length && 'its metal lines the other way'].filter(Boolean).join(', ')}, and its entries are reversed.` };
    },
    run: (entry, { reason }) => reverseAdjustment(entry.recordId, reason),
  },
  {
    type: 'approval.request',
    title: 'Sent for approval',
    mode: 'undo',
    permission: [],
    async check(entry) {
      const r = await ApprovalRequest.findById(entry.recordId).lean();
      if (!r || r.status !== APPROVAL_STATUS.PENDING) return { superseded: true, reason: 'It was decided already' };
      return { ok: true, effect: `Withdraws ${r.docNo}: the request is closed as withdrawn.` };
    },
    run: (entry, { reason }) => withdrawRequest(entry.recordId, reason),
  },
  {
    type: 'approval.reject',
    title: 'Approval request rejected',
    mode: 'undo',
    permission: 'inventory.approve',
    async check(entry) {
      const r = await ApprovalRequest.findById(entry.recordId).lean();
      if (!r || r.status !== APPROVAL_STATUS.REJECTED) return { superseded: true, reason: 'It is no longer rejected' };
      if (!approvalHandlerFor(r.docType)?.reopen) return { ok: false, reason: 'This kind of request cannot be reopened.' };
      return { ok: true, effect: `Reopens ${r.docNo}: it waits for a decision again.` };
    },
    run: (entry, { reason }) => reopenRequest(entry.recordId, reason),
  },
  {
    type: 'transfer.dispatch',
    title: 'Stock sent to another branch',
    mode: 'reversal',
    permission: 'inventory.transfer',
    async check(entry) {
      const t = await StockTransfer.findById(entry.recordId).lean();
      if (!t || t.status === TRANSFER_STATUS.CANCELLED) return { superseded: true, reason: 'Already recalled' };
      if (t.status !== TRANSFER_STATUS.IN_TRANSIT) return { ok: false, reason: `It was ${t.status} by the other branch — undo that there first.` };
      return { ok: true, effect: `Recalls ${t.docNo}: ${pieces(t.productIds.length)} back in stock here.` };
    },
    run: (entry, { reason }) => recallTransfer(entry.recordId, reason),
  },
  {
    type: 'transfer.close',
    title: 'Transfer received / rejected',
    mode: 'reversal',
    permission: 'inventory.transfer',
    async check(entry) {
      const t = await StockTransfer.findById(entry.recordId).lean();
      if (!t || t.status === TRANSFER_STATUS.IN_TRANSIT || t.status === TRANSFER_STATUS.CANCELLED) return { superseded: true, reason: 'It is no longer closed' };
      const block = await reopenBlock(t);
      if (block) return { ok: false, reason: block };
      return { ok: true, effect: `Puts ${t.docNo} back on its way: ${pieces(t.productIds.length)} leave stock here until it is received again.` };
    },
    run: (entry, { reason }) => reopenTransfer(entry.recordId, reason),
  },
  {
    type: 'production.create',
    title: 'Jewellery made',
    mode: 'reversal',
    permission: 'inventory.adjust',
    async check(entry) {
      const d = await Production.findById(entry.recordId).lean();
      if (!d || d.status === 'cancelled') return { superseded: true, reason: 'Already cancelled' };
      const block = await productionCancelBlock(d);
      if (block) return { ok: false, reason: block };
      return { ok: true, effect: `Cancels ${d.productionNo}: ${pieces(d.pieces.length)} leave stock, the metal goes back to Raw materials${d.makingPaise ? ' and the making charge paid is reversed' : ''}.` };
    },
    run: (entry, { reason }) => cancelProduction(entry.recordId, reason),
  },
];
