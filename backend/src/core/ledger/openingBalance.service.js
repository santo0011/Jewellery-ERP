import { todayContext } from '../../utils/businessDate.js';
import { postJournal, reverseJournalsFor } from './posting.service.js';

const CONFIG = {
  customer: { docType: 'customer_opening', account: 'sundry_debtors', positiveIsDebit: true },
  supplier: { docType: 'supplier_opening', account: 'sundry_creditors', positiveIsDebit: false },
};

/**
 * Customers: positive = receivable (Dr debtors / Cr opening equity); negative = advance held.
 * Suppliers: positive = payable (Dr opening equity / Cr creditors); negative = advance paid.
 */
export async function syncOpeningBalance({ partyType, partyId, code, amountPaise, previousPaise = 0 }, { session }) {
  if (amountPaise === previousPaise) return;
  const cfg = CONFIG[partyType];
  const today = await todayContext();
  const source = { docType: cfg.docType, docId: partyId, docNo: code };
  const when = { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear };

  if (previousPaise) await reverseJournalsFor(source, { ...when, narration: `Opening balance revised for ${code}` }, { session });
  if (!amountPaise) return;

  const amount = Math.abs(amountPaise);
  const partyDebit = (amountPaise > 0) === cfg.positiveIsDebit;
  const party = { type: partyType, id: partyId };
  await postJournal(
    {
      voucherType: 'opening_balance',
      ...when,
      narration: `Opening balance ${code}`,
      source,
      lines: partyDebit
        ? [{ account: cfg.account, debit: amount, party }, { account: 'opening_equity', credit: amount }]
        : [{ account: 'opening_equity', debit: amount }, { account: cfg.account, credit: amount, party }],
    },
    { session },
  );
}
