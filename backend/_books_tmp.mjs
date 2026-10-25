// Temporary: do the books agree with stock, customer dues, supplier dues and advances?
import mongoose from 'mongoose';
process.loadEnvFile('.env');
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const rs = (p) => (p / 100).toLocaleString('en-IN');
for (const org of await db.collection('organisations').find({}).toArray()) {
  const o = { organisationId: org._id };
  const accounts = new Map((await db.collection('accounts').find(o).toArray()).map((a) => [String(a._id), a.systemKey]));
  const bal = {};
  const party = {};
  for (const j of await db.collection('journalentries').find(o).toArray()) {
    for (const l of j.lines) {
      const key = accounts.get(String(l.accountId));
      bal[key] = (bal[key] ?? 0) + l.debitPaise - l.creditPaise;
      if (l.party?.id) {
        const pk = `${key}:${l.party.id}`;
        party[pk] = (party[pk] ?? 0) + l.debitPaise - l.creditPaise;
      }
    }
  }
  const [prod] = await db.collection('products').aggregate([{ $match: { ...o, isDeleted: false, status: { $in: ['in_stock', 'in_transit'] } } }, { $group: { _id: null, v: { $sum: { $ifNull: ['$costPricePaise', 0] } } } }]).toArray();
  const [metal] = await db.collection('metalstocks').aggregate([{ $match: o }, { $group: { _id: null, v: { $sum: '$valuePaise' } } }]).toArray();
  const stock = (prod?.v ?? 0) + (metal?.v ?? 0);
  console.log(`\n${org.name}`);
  console.log(`  inventory account ${rs(bal.inventory ?? 0)}  vs  stock value ${rs(stock)} (pieces ${rs(prod?.v ?? 0)} + metal ${rs(metal?.v ?? 0)})  ${bal.inventory === stock ? 'OK' : 'DIFF ' + rs((bal.inventory ?? 0) - stock)}`);
  const [adv] = await db.collection('orders').aggregate([{ $match: { ...o, status: { $in: ['booked', 'in_progress', 'ready'] } } }, { $group: { _id: null, v: { $sum: '$advancePaise' } } }]).toArray();
  console.log(`  customer_advances ${rs(-(bal.customer_advances ?? 0))}  vs  open order advances ${rs(adv?.v ?? 0)} (plus any general customer advances)`);
  console.log(`  sundry_debtors ${rs(bal.sundry_debtors ?? 0)}; sundry_creditors ${rs(-(bal.sundry_creditors ?? 0))}`);
  const negParty = Object.entries(party).filter(([k, v]) => k.startsWith('sundry_debtors') && v < 0);
  if (negParty.length) console.log('  customers with negative debtor balance:', negParty.length);
}
await mongoose.disconnect();
