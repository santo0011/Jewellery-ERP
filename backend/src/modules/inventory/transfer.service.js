import { BRANCH_STATUS, TRANSFER_STATUS } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { postJournal, reverseJournalsFor } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { moveProducts } from '../../core/stock/stockLedger.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { todayContext } from '../../utils/businessDate.js';
import { searchFilter } from '../../utils/pagination.js';
import { Branch } from '../branches/branch.model.js';
import { canAccessBranch, canSeeCost, nameMaps, oid, pick, requireBranch, viewBranchFor } from './inventory.helpers.js';
import { piecesGone } from '../undo/undo.checks.js';
import { StockTransfer } from './stockTransfer.model.js';

function visibleFilter() {
  const { branchAccess } = requireContext();
  if (branchAccess?.all) return {};
  const ids = (branchAccess?.branchIds ?? []).map(oid);
  return { $or: [{ fromBranchId: { $in: ids } }, { toBranchId: { $in: ids } }] };
}

async function serialize(transfers) {
  const maps = await nameMaps({
    branchIds: transfers.flatMap((t) => [t.fromBranchId, t.toBranchId]),
    userIds: transfers.flatMap((t) => [t.dispatchedBy, t.closedBy]),
    productIds: transfers.flatMap((t) => t.productIds),
  });
  const cost = canSeeCost();
  return transfers.map((t) => ({
    id: t._id,
    docNo: t.docNo,
    status: t.status,
    fromBranch: pick(maps.branches, t.fromBranchId),
    toBranch: pick(maps.branches, t.toBranchId),
    products: t.productIds.map((id) => pick(maps.products, id)).filter(Boolean),
    totals: { ...t.totals, ...(cost ? {} : { valuePaise: undefined }) },
    businessDate: t.businessDate,
    note: t.note,
    dispatchedBy: pick(maps.users, t.dispatchedBy),
    dispatchedAt: t.dispatchedAt,
    closedBy: pick(maps.users, t.closedBy),
    closedAt: t.closedAt,
    rejectionReason: t.rejectionReason,
    canReceive: t.status === TRANSFER_STATUS.IN_TRANSIT && canAccessBranch(t.toBranchId),
  }));
}

export async function createTransfer({ fromBranchId, toBranchId, productIds, note }) {
  const { userId } = requireContext();
  const from = await requireBranch(fromBranchId, { path: 'fromBranchId' });
  const to = await Branch.findOne({ _id: toBranchId, status: BRANCH_STATUS.ACTIVE }).lean();
  if (!to) throw ApiError.badRequest('Select an active destination branch', [{ path: 'toBranchId', message: 'Branch not available' }], 'VALIDATION_ERROR');
  const today = await todayContext();

  const transfer = await withTransaction(async (session) => {
    const docNo = await nextDocumentNo({ prefix: 'TR', branchCode: from.code, financialYear: today.financialYear }, { session });
    const [doc] = await StockTransfer.create(
      [{ docNo, fromBranchId, toBranchId, productIds, status: TRANSFER_STATUS.IN_TRANSIT, businessDate: today.businessDate, note, dispatchedBy: userId, dispatchedAt: today.now }],
      { session },
    );
    const { products, totalValuePaise } = await moveProducts(
      { type: 'transfer_out', productIds, expectedBranchId: fromBranchId, source: { docType: 'stock_transfer', docId: doc._id, docNo }, businessDate: today.businessDate, note },
      { session },
    );
    doc.totals = {
      pieces: products.reduce((s, p) => s + (p.quantity ?? 1), 0),
      grossMg: products.reduce((s, p) => s + p.grossWeightMg, 0),
      fineMg: products.reduce((s, p) => s + p.fineWeightMg, 0),
      valuePaise: totalValuePaise,
    };
    await doc.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.DISPATCH, module: 'inventory', recordType: 'StockTransfer', recordId: doc._id, meta: { name: docNo, docNo, to: to.name, pieces: doc.totals.pieces }, undo: { type: 'transfer.dispatch', branchId: from._id } }, { session });
    return doc;
  });
  return (await serialize([transfer.toObject()]))[0];
}

async function closeTransfer(id, { accept, reason }) {
  const { userId } = requireContext();
  const transfer = await StockTransfer.findOne({ _id: id, ...visibleFilter() });
  if (!transfer) throw ApiError.notFound('Transfer');
  if (!canAccessBranch(transfer.toBranchId)) throw ApiError.forbidden('Only the receiving branch can accept or reject this transfer', 'BRANCH_FORBIDDEN');
  if (transfer.status !== TRANSFER_STATUS.IN_TRANSIT) throw ApiError.conflict(`This transfer is already ${transfer.status.replace('_', ' ')}`, 'INVALID_STATE');
  const today = await todayContext();
  const source = { docType: 'stock_transfer', docId: transfer._id, docNo: transfer.docNo };

  await withTransaction(async (session) => {
    const claimed = await StockTransfer.findOneAndUpdate(
      { _id: transfer._id, status: TRANSFER_STATUS.IN_TRANSIT },
      { $set: { status: accept ? TRANSFER_STATUS.RECEIVED : TRANSFER_STATUS.REJECTED, closedBy: userId, closedAt: today.now, rejectionReason: accept ? null : reason } },
      { session },
    );
    if (!claimed) throw ApiError.conflict('This transfer was already closed', 'INVALID_STATE');

    const branchId = accept ? transfer.toBranchId : transfer.fromBranchId;
    const { totalValuePaise } = await moveProducts(
      { type: accept ? 'transfer_in' : 'transfer_return', productIds: transfer.productIds, branchId, source, businessDate: today.businessDate, note: accept ? transfer.note : reason },
      { session },
    );
    if (accept) {
      await postJournal(
        {
          voucherType: 'stock_transfer',
          date: today.now,
          businessDate: today.businessDate,
          financialYear: today.financialYear,
          narration: `Stock transfer ${transfer.docNo}`,
          source,
          lines: [
            { account: 'inventory', debit: totalValuePaise, branchId: transfer.toBranchId },
            { account: 'inventory', credit: totalValuePaise, branchId: transfer.fromBranchId },
          ],
        },
        { session },
      );
    }
    await recordAudit(
      {
        action: accept ? AUDIT_ACTIONS.RECEIVE : AUDIT_ACTIONS.REJECT,
        module: 'inventory',
        recordType: 'StockTransfer',
        recordId: transfer._id,
        meta: { name: transfer.docNo, docNo: transfer.docNo, reason },
        // On the stack of the branch the pieces landed in.
        undo: { type: 'transfer.close', branchId: accept ? transfer.toBranchId : transfer.fromBranchId, data: { accepted: accept } },
      },
      { session },
    );
  });
  return getTransfer(id);
}

/** The sending branch takes back a transfer still on its way (Undo): the pieces are in its stock again. */
export async function recallTransfer(id, reason) {
  const { userId } = requireContext();
  const today = await todayContext();
  await withTransaction(async (session) => {
    const t = await StockTransfer.findOneAndUpdate(
      { _id: id, status: TRANSFER_STATUS.IN_TRANSIT },
      { $set: { status: TRANSFER_STATUS.CANCELLED, cancelledAt: today.now, cancelledBy: userId, cancelReason: reason } },
      { session },
    );
    if (!t) throw ApiError.conflict('This transfer is no longer on its way', 'INVALID_STATE');
    if (!canAccessBranch(t.fromBranchId)) throw ApiError.forbidden('Only the sending branch can recall this transfer', 'BRANCH_FORBIDDEN');
    await moveProducts({ type: 'transfer_recall', productIds: t.productIds, branchId: t.fromBranchId, source: { docType: 'stock_transfer', docId: t._id, docNo: t.docNo }, businessDate: today.businessDate, note: reason }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'inventory', recordType: 'StockTransfer', recordId: t._id, meta: { name: t.docNo, docNo: t.docNo, reason } }, { session });
  });
  return getTransfer(id);
}

/** Why a received or rejected transfer cannot go back on its way, or null: its pieces must still be where it left them. */
export async function reopenBlock(t) {
  if (![TRANSFER_STATUS.RECEIVED, TRANSFER_STATUS.REJECTED].includes(t.status)) return `It is ${t.status.replace('_', ' ')}.`;
  return piecesGone(t.productIds, t.status === TRANSFER_STATUS.RECEIVED ? t.toBranchId : t.fromBranchId);
}

/** A receive or reject taken back (Undo): the pieces are on their way again and it waits to be received. */
export async function reopenTransfer(id, reason) {
  const today = await todayContext();
  const t = await StockTransfer.findById(id).lean();
  if (!t) throw ApiError.notFound('Transfer');
  const block = await reopenBlock(t);
  if (block) throw ApiError.conflict(`${t.docNo} cannot go back on its way: ${block}`, 'INVALID_STATE');
  const landed = t.status === TRANSFER_STATUS.RECEIVED ? t.toBranchId : t.fromBranchId;
  if (!canAccessBranch(landed)) throw ApiError.forbidden('Only the branch that has the pieces can do this', 'BRANCH_FORBIDDEN');
  await withTransaction(async (session) => {
    const claimed = await StockTransfer.findOneAndUpdate({ _id: t._id, status: t.status }, { $set: { status: TRANSFER_STATUS.IN_TRANSIT, closedBy: null, closedAt: null, rejectionReason: null } }, { session });
    if (!claimed) throw ApiError.conflict('This transfer changed meanwhile', 'CONCURRENT_UPDATE');
    const source = { docType: 'stock_transfer', docId: t._id, docNo: t.docNo };
    await moveProducts({ type: 'transfer_reopen', productIds: t.productIds, expectedBranchId: landed, source, businessDate: today.businessDate, note: reason }, { session });
    // Receiving moved its value between the branches' stock: that entry is reversed.
    if (t.status === TRANSFER_STATUS.RECEIVED) await reverseJournalsFor(source, { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Transfer ${t.docNo} back in transit` }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'inventory', recordType: 'StockTransfer', recordId: t._id, meta: { name: t.docNo, docNo: t.docNo, reopened: reason } }, { session });
  });
  return getTransfer(id);
}

export const receiveTransfer = (id) => closeTransfer(id, { accept: true });
export const rejectTransfer = (id, reason) => closeTransfer(id, { accept: false, reason });

export async function listTransfers({ page, limit, q, status, branchId: chosen }) {
  const branchId = chosen ?? (await viewBranchFor('inventory')); // navbar filter: transfers in or out of the branch
  const clauses = [visibleFilter(), searchFilter(q, ['docNo', 'note'])];
  if (status) clauses.push({ status });
  if (branchId) clauses.push({ $or: [{ fromBranchId: oid(branchId) }, { toBranchId: oid(branchId) }] });
  const active = clauses.filter((c) => Object.keys(c).length);
  const filter = active.length ? { $and: active } : {};
  const [items, total] = await Promise.all([StockTransfer.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), StockTransfer.countDocuments(filter)]);
  return { items: await serialize(items), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function getTransfer(id) {
  const transfer = await StockTransfer.findOne({ _id: id, ...visibleFilter() }).lean();
  if (!transfer) throw ApiError.notFound('Transfer');
  return (await serialize([transfer]))[0];
}
