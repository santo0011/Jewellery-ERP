import mongoose from 'mongoose';
import { tenantPlugin } from '../tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const lineSchema = new mongoose.Schema(
  {
    accountId: { type: ObjectId, ref: 'Account', required: true },
    debitPaise: { type: Number, default: 0, min: 0 },
    creditPaise: { type: Number, default: 0, min: 0 },
    party: { type: { type: String, default: null }, id: { type: ObjectId, default: null } },
    branchId: { type: ObjectId, ref: 'Branch', default: null },
  },
  { _id: false },
);

const journalEntrySchema = new mongoose.Schema(
  {
    voucherNo: { type: String, required: true },
    voucherType: { type: String, required: true },
    date: { type: Date, required: true },
    businessDate: { type: String, required: true },
    lines: { type: [lineSchema], validate: [(v) => v.length >= 2, 'A journal needs at least two lines'] },
    totalPaise: { type: Number, required: true },
    narration: { type: String, default: null },
    source: { docType: { type: String, required: true }, docId: { type: ObjectId, required: true }, docNo: { type: String, default: null } },
    reversalOf: { type: ObjectId, ref: 'JournalEntry', default: null },
    reversedBy: { type: ObjectId, ref: 'JournalEntry', default: null },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

journalEntrySchema.pre('validate', function balance() {
  const debit = this.lines.reduce((s, l) => s + l.debitPaise, 0);
  const credit = this.lines.reduce((s, l) => s + l.creditPaise, 0);
  if (debit !== credit || debit <= 0) throw new Error(`Unbalanced journal: debit ${debit} vs credit ${credit}`);
  if (this.lines.some((l) => (l.debitPaise > 0) === (l.creditPaise > 0))) throw new Error('Each journal line must be either a debit or a credit');
  this.totalPaise = debit;
});

journalEntrySchema.plugin(tenantPlugin);
journalEntrySchema.index({ organisationId: 1, voucherNo: 1 }, { unique: true });
journalEntrySchema.index({ organisationId: 1, 'source.docType': 1, 'source.docId': 1 });
journalEntrySchema.index({ organisationId: 1, 'lines.accountId': 1, date: 1 });
journalEntrySchema.index({ organisationId: 1, 'lines.party.id': 1, date: 1 });

export const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);
