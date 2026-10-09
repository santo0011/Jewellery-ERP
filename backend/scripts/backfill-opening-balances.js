import { connectDb, disconnectDb, withTransaction } from '../src/config/db.js';
import { runWithContext } from '../src/core/context/requestContext.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { syncOpeningBalance } from '../src/core/ledger/openingBalance.service.js';
import { ensureSystemAccounts } from '../src/core/ledger/posting.service.js';
import { Customer } from '../src/modules/customers/customer.model.js';
import { Organisation } from '../src/modules/organisations/organisation.model.js';
import { Supplier } from '../src/modules/suppliers/supplier.model.js';

await connectDb();
let posted = 0;

for (const org of await Organisation.find({}).select('_id name').lean()) {
  await runWithContext({ organisationId: String(org._id) }, async () => {
    await withTransaction((session) => ensureSystemAccounts({ session }));
    const parties = [
      ...(await Customer.find({ isDeleted: false, openingBalancePaise: { $ne: 0 } }).lean()).map((c) => ({ partyType: 'customer', docType: 'customer_opening', doc: c })),
      ...(await Supplier.find({ isDeleted: false, openingBalancePaise: { $ne: 0 } }).lean()).map((s) => ({ partyType: 'supplier', docType: 'supplier_opening', doc: s })),
    ];
    for (const { partyType, docType, doc } of parties) {
      if (await JournalEntry.exists({ 'source.docType': docType, 'source.docId': doc._id })) continue;
      await withTransaction((session) =>
        syncOpeningBalance({ partyType, partyId: doc._id, code: doc.code, amountPaise: doc.openingBalancePaise }, { session }),
      );
      posted += 1;
    }
  });
}

console.log(`Opening-balance journals posted: ${posted}`);
await disconnectDb();
