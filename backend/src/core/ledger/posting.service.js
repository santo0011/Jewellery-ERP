import { requireContext } from '../context/requestContext.js';
import { nextSequence } from '../numbering/numbering.service.js';
import { Account } from './account.model.js';
import { JournalEntry } from './journalEntry.model.js';

export const SYSTEM_ACCOUNTS = Object.freeze([
  { systemKey: 'cash', code: '1000', name: 'Cash in hand', group: 'asset', subGroup: 'cash' },
  { systemKey: 'bank', code: '1100', name: 'Bank accounts', group: 'asset', subGroup: 'bank' },
  { systemKey: 'sundry_debtors', code: '1200', name: 'Sundry debtors (customers)', group: 'asset', subGroup: 'receivable' },
  { systemKey: 'inventory', code: '1300', name: 'Stock in trade', group: 'asset', subGroup: 'inventory' },
  { systemKey: 'gst_input', code: '1400', name: 'GST input credit', group: 'asset', subGroup: 'tax' },
  { systemKey: 'staff_advances', code: '1500', name: 'Staff salary advances', group: 'asset', subGroup: 'advance' },
  { systemKey: 'sundry_creditors', code: '2000', name: 'Sundry creditors (suppliers)', group: 'liability', subGroup: 'payable' },
  { systemKey: 'customer_advances', code: '2100', name: 'Customer advances', group: 'liability', subGroup: 'advance' },
  { systemKey: 'gst_output', code: '2200', name: 'GST output', group: 'liability', subGroup: 'tax' },
  { systemKey: 'salary_payable', code: '2300', name: 'Salaries payable', group: 'liability', subGroup: 'payable' },
  { systemKey: 'opening_equity', code: '3000', name: 'Opening balance equity', group: 'equity', subGroup: 'capital' },
  { systemKey: 'sales', code: '4000', name: 'Sales', group: 'income', subGroup: 'sales' },
  { systemKey: 'round_off', code: '4800', name: 'Round-off', group: 'income', subGroup: 'other_income' },
  { systemKey: 'stock_gain', code: '4900', name: 'Stock gain on adjustment', group: 'income', subGroup: 'other_income' },
  { systemKey: 'purchases', code: '5000', name: 'Purchases', group: 'expense', subGroup: 'cost_of_goods' },
  { systemKey: 'cogs', code: '5100', name: 'Cost of goods sold', group: 'expense', subGroup: 'cost_of_goods' },
  { systemKey: 'stock_loss', code: '5900', name: 'Stock loss & write-off', group: 'expense', subGroup: 'other_expense' },
  { systemKey: 'salaries', code: '6000', name: 'Salaries & wages', group: 'expense', subGroup: 'staff' },
]);

export async function ensureSystemAccounts({ session } = {}) {
  const existing = await Account.find({ systemKey: { $ne: null } }).select('systemKey').session(session ?? null).lean();
  const have = new Set(existing.map((a) => a.systemKey));
  const missing = SYSTEM_ACCOUNTS.filter((a) => !have.has(a.systemKey));
  if (missing.length) await Account.create(missing.map((a) => ({ ...a, isSystem: true })), { session, ordered: true });
}

async function accountIds(keys, session) {
  await ensureSystemAccounts({ session });
  const accounts = await Account.find({ systemKey: { $in: keys } }).select('systemKey').session(session).lean();
  return new Map(accounts.map((a) => [a.systemKey, a._id]));
}

/**
 * lines: [{ account: systemKey, debit|credit: paise, party?: {type,id}, branchId? }]
 * Zero-value postings are skipped and return null.
 */
export async function postJournal({ voucherType, date, businessDate, financialYear, narration, source, lines }, { session }) {
  const effective = lines.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0);
  if (effective.length < 2) return null;

  const ids = await accountIds([...new Set(effective.map((l) => l.account))], session);
  const seq = await nextSequence(`JV:${financialYear}`, { session });
  const [entry] = await JournalEntry.create(
    [
      {
        voucherNo: `JV/${financialYear}/${String(seq).padStart(5, '0')}`,
        voucherType,
        date,
        businessDate,
        narration,
        source,
        createdBy: requireContext().userId ?? null,
        lines: effective.map((l) => {
          if (!ids.has(l.account)) throw new Error(`Unknown system account ${l.account}`);
          return { accountId: ids.get(l.account), debitPaise: l.debit ?? 0, creditPaise: l.credit ?? 0, party: l.party ?? { type: null, id: null }, branchId: l.branchId ?? null };
        }),
      },
    ],
    { session },
  );
  return entry;
}

export async function reverseJournalsFor(source, { date, businessDate, financialYear, narration }, { session }) {
  const entries = await JournalEntry.find({ 'source.docType': source.docType, 'source.docId': source.docId, reversalOf: null, reversedBy: null }).session(session);
  for (const entry of entries) {
    const seq = await nextSequence(`JV:${financialYear}`, { session });
    const [reversal] = await JournalEntry.create(
      [
        {
          voucherNo: `JV/${financialYear}/${String(seq).padStart(5, '0')}`,
          voucherType: entry.voucherType,
          date,
          businessDate,
          narration: narration ?? `Reversal of ${entry.voucherNo}`,
          source: entry.source,
          reversalOf: entry._id,
          createdBy: requireContext().userId ?? null,
          lines: entry.lines.map((l) => ({ accountId: l.accountId, debitPaise: l.creditPaise, creditPaise: l.debitPaise, party: l.party, branchId: l.branchId })),
        },
      ],
      { session },
    );
    entry.reversedBy = reversal._id;
    await entry.save({ session });
  }
  return entries.length;
}
