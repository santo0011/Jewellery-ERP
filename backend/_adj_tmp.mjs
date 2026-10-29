import { MongoClient } from 'mongodb';
const c = await MongoClient.connect('mongodb://127.0.0.1:27018/jewellery_erp?replicaSet=rs0');
const db = c.db();
const ents = await db.collection('stockentries').find({ type: 'adjustment' }).toArray();
const br = new Map((await db.collection('branches').find().toArray()).map(b => [String(b._id), b.name]));
for (const e of ents) console.log(String(e.organisationId), e.docNo, br.get(String(e.branchId)), e.status, e.reason, e.businessDate, 'pieces', e.productIds.length, 'metal', e.metalLines.length, e.totals.valuePaise/100);
await c.close();
