// Clears the business data of every organisation in the local database and fills it again with a small, realistic
// set of sample data for every module: masters, stock, raw metal, purchases, sales, orders, old gold, HR, expenses
// and payments. Each list gets about five records (one per day over the last five days), enough to try every screen
// without wading through pages of data.
//
// Usage: npm run seed:reset-sample -- --yes        (local MongoDB only)
//
// Kept as they are: organisations, branches, users, roles, settings, plans, subscriptions, the chart of accounts,
// categories, expense categories, the organisation logo and the platform (super admin) side.
// Everything new goes through the real API in-process, so stock, invoices, ledgers and journals stay consistent.
// To spread activity over past days the script moves its own clock back; nothing else is affected.

process.env.NODE_ENV = 'test'; // skips the HTTP rate limiters and request logging for this in-process run

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { env } = await import('../src/config/env.js');
const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { signAccessToken, createRefreshSecret } = await import('../src/modules/auth/token.service.js');

const DAYS = 4; // days 4 … 0: five days of activity

if (!process.argv.includes('--yes')) {
  console.error('\nThis deletes all business data (customers, stock, bills, journals …) of every organisation.\nRun again with --yes to go ahead:  npm run seed:reset-sample -- --yes\n');
  process.exit(1);
}
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.MONGODB_URI)) {
  console.error('\nRefusing: MONGODB_URI is not a local database. This script is for development data only.\n');
  process.exit(1);
}

// Business data: cleared for every organisation. Anything not listed here is left alone.
const CLEAR = [
  'approvalrequests', 'attendances', 'auditlogs', 'counters', 'customerreceipts', 'customers', 'employees', 'expenses',
  'items', 'journalentries', 'metalrates', 'metalstocks', 'oldgolds', 'orders', 'payrollruns', 'productions', 'products',
  'purchaseorders', 'purchases', 'salaryadvances', 'sales', 'salesreturns', 'stockentries', 'stockmovements',
  'stocktransfers', 'supplierpayments', 'suppliers',
];

// ---------------------------------------------------------------- clock

const RealDate = Date;
let offsetMs = 0;
// A proxy, not a subclass: `new Date()` still makes a real Date, so dates saved in loosely typed (Mixed) fields stay
// dates in the database (a subclass instance is stored there as a number).
globalThis.Date = new Proxy(RealDate, {
  construct: (target, args) => (args.length ? new target(...args) : new target(RealDate.now() + offsetMs)),
  apply: () => new RealDate(RealDate.now() + offsetMs).toString(),
  get: (target, prop) => (prop === 'now' ? () => RealDate.now() + offsetMs : Reflect.get(target, prop)),
});
/** Moves the clock to `daysAgo` days before today, at the given hour (IST). */
const travelTo = (daysAgo, hour = 11) => {
  offsetMs = 0;
  const target = new RealDate(RealDate.now() - daysAgo * 86400000);
  const ist = new RealDate(target.getTime() + 330 * 60000);
  ist.setUTCHours(hour, Math.floor(rand() * 60), 0, 0);
  offsetMs = Math.min(ist.getTime() - 330 * 60000, RealDate.now() - 60000) - RealDate.now();
};
const isoDaysAgo = (n) => new RealDate(RealDate.now() + 330 * 60000 - n * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- helpers

let seed = 20261025;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => Math.round(min + rand() * (max - min));
const rupees = (r) => r * 100;
const usedHuids = new Set();
const huid = () => {
  let h;
  do h = Array.from({ length: 6 }, () => pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789')).join('');
  while (usedHuids.has(h));
  usedHuids.add(h);
  return h;
};
const usedMobiles = new Set();
const mobile = () => {
  let m;
  do m = `${pick(['98', '97', '96', '90', '83', '70', '91', '89'])}${between(10000000, 99999999)}`;
  while (usedMobiles.has(m));
  usedMobiles.add(m);
  return m;
};
const pan = () => `${pick(['ABCPS', 'BXDPD', 'CQKPG', 'AHTPB', 'DKRPM', 'EJSPB'])}${between(1000, 9999)}${pick(['F', 'K', 'L', 'M', 'R'])}`;

const app = createApp();
let auth = null; // { user, sessionId }
let token = null;
let branchHeader = null;
/** A fresh access token on the current (shifted) clock, for the organisation owner being seeded. */
const resign = () => {
  token = signAccessToken({ userId: auth.user._id, organisationId: auth.user.organisationId, sessionId: auth.sessionId, tokenVersion: auth.user.tokenVersion });
};
async function call(method, url, body) {
  resign();
  const headers = { Authorization: `Bearer ${token}`, ...(branchHeader && { 'X-Branch-Id': branchHeader }) };
  const res = await request(app)[method](`/api/v1${url}`).set(headers).send(body);
  if (res.status >= 400) throw new Error(`${method.toUpperCase()} ${url} -> ${res.status} ${JSON.stringify(res.body.error ?? res.body)}`);
  return res.body.data;
}
const get = (url) => call('get', url);
const post = (url, body) => call('post', url, body);
const put = (url, body) => call('put', url, body);
const patch = (url, body) => call('patch', url, body);
/** Tries a step that may be refused by a business rule (e.g. not enough stock): logs it and carries on. */
const attempt = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    console.log(`    (skipped ${label}: ${err.message.slice(0, 160)})`);
    return null;
  }
};
const step = (msg) => console.log(`  • ${msg}`);

// ---------------------------------------------------------------- data

const FIRST = ['Rupa', 'Ananya', 'Sourav', 'Debasish', 'Priya', 'Moumita', 'Arijit', 'Sunita', 'Rahul', 'Tanushree', 'Subhajit', 'Payel', 'Abhijit', 'Rina', 'Sayan', 'Madhumita', 'Kaushik', 'Sharmila', 'Indrani', 'Partha', 'Neha', 'Amit', 'Swati', 'Rajesh', 'Mitali', 'Soma', 'Pritam', 'Laboni'];
const LAST = ['Sen', 'Das', 'Ghosh', 'Bose', 'Chatterjee', 'Mukherjee', 'Banerjee', 'Dutta', 'Roy', 'Saha', 'Paul', 'Mondal', 'Biswas', 'Sarkar', 'Chakraborty', 'Nandi', 'Kundu'];
const CITIES = [['Kolkata', '700029'], ['Kolkata', '700091'], ['Howrah', '711101'], ['Barasat', '700124'], ['Bongaon', '743235'], ['Dum Dum', '700028'], ['Habra', '743263']];
const STREETS = ['Lake Road', 'Rash Behari Avenue', 'Jessore Road', 'GT Road', 'Station Road', 'Bazar Para', 'College Street'];

// Base rate per gram (paise) 30 days ago; moves a little every day.
const BASE_RATES = { 'gold:916': 1214000, 'gold:750': 994000, 'silver:999': 15200, 'silver:925': 14100 };

const CATALOGUE = [
  // [name, category, type, metal, purity, gross g min, max, making /g (₹), wastage %, stone?]
  ['Plain gold ring', 'Ring', 'plain_gold', 'gold', 916, 3, 6, 450, 8],
  ['Bridal ring', 'Ring', 'studded_gold', 'gold', 916, 4, 7, 600, 10, 'cz'],
  ['Diamond solitaire ring', 'Ring', 'diamond', 'gold', 750, 3, 5, 900, 10, 'diamond'],
  ['Rope chain', 'Chain', 'plain_gold', 'gold', 916, 8, 16, 380, 6],
  ['Box chain', 'Chain', 'plain_gold', 'gold', 916, 6, 12, 380, 6],
  ['Kolkata bala', 'Bangles', 'plain_gold', 'gold', 916, 12, 22, 520, 10],
  ['Machine bangles (pair)', 'Bangles', 'plain_gold', 'gold', 916, 14, 24, 350, 6],
  ['Jhumka earrings', 'Earrings', 'studded_gold', 'gold', 916, 5, 10, 650, 12, 'pearl'],
  ['Stud earrings', 'Earrings', 'plain_gold', 'gold', 916, 2, 4, 500, 8],
  ['Diamond studs', 'Earrings', 'diamond', 'gold', 750, 2, 4, 900, 10, 'diamond'],
  ['Om pendant', 'Pendant', 'plain_gold', 'gold', 916, 2, 5, 480, 8],
  ['Choker necklace', 'Necklace', 'studded_gold', 'gold', 916, 18, 30, 700, 12, 'kundan'],
  ['Sita haar', 'Necklace', 'plain_gold', 'gold', 916, 20, 35, 650, 10],
  ['Mangalsutra', 'Mangalsutra', 'studded_gold', 'gold', 916, 8, 14, 550, 8, 'beads'],
  ['Nose pin', 'Nose Pin', 'plain_gold', 'gold', 916, 1, 2, 400, 6],
  ['Silver anklet (pair)', 'Anklet', 'silver', 'silver', 925, 30, 60, 30, 5],
  ['Silver bracelet', 'Bracelet', 'silver', 'silver', 925, 15, 30, 35, 5],
];
// Designs saved as catalogue items: picked on purchases, purchase orders and when making jewellery.
const ITEM_NAMES = ['Plain gold ring', 'Rope chain', 'Kolkata bala', 'Stud earrings', 'Silver anklet (pair)'];
// Opening pieces (rows of CATALOGUE): ring, bala, jhumka, choker, and a silver anklet for the second branch.
const OPENING_PIECES = [0, 5, 7, 11, 15];
// The sale of each day: day 3 takes old gold in exchange, day 2 is half on credit at the second branch, day 1 has two
// pieces (one comes back as a return), day 0 is cancelled later. The fifth invoice is the delivered customer order.
const SALES_PLAN = { 3: { exchange: true }, 2: { branch: 1, credit: 0.5 }, 1: { pieces: 2 }, 0: {} };
const ORDERS = [
  // [description, category, grams, estimate ₹]
  ['22K bridal necklace set', 'Necklace', 40, 520000],
  ['Pair of Kolkata bala', 'Bangles', 20, 260000],
  ['Custom name pendant', 'Pendant', 4, 52000],
  ['22K wedding ring, size 16', 'Ring', 6, 78000],
  ['Mangalsutra with black beads', 'Mangalsutra', 12, 155000],
];
// What happens to each order today, oldest first.
const ORDER_STAGES = ['delivered', 'ready', 'in_progress', 'cancelled', 'booked'];

const SUPPLIERS = [
  ['Kolkata Bullion Co', ['gold'], 0],
  ['Bowbazar Ornaments', ['jewellery', 'gold'], 85000],
  ['Surat Diamond House', ['diamond', 'stones'], 0],
  ['Burrabazar Silver Mart', ['silver'], 12000],
  ['Sinthee Karigar Works', ['jewellery'], 0],
];

const EMPLOYEES = [
  // [name, designation, branch index, basic ₹]
  ['Bimal Pal', 'Store manager', 0, 32000],
  ['Asha Roy', 'Sales executive', 0, 18000],
  ['Mousumi Kar', 'Cashier', 0, 16000],
  ['Ratan Shil', 'Karigar', 0, 22000],
  ['Joyita Nandi', 'Branch in-charge', 1, 26000],
];

const EXPENSES = [
  // [category, min ₹, max ₹, note]
  ['Electricity', 2500, 6500, 'Monthly electricity bill'],
  ['Daily shopping', 150, 600, 'Tea and snacks for customers'],
  ['Repair & maintenance', 800, 4000, 'AC servicing'],
  ['Packaging', 300, 1500, 'Jewellery boxes and bags'],
  ['Transport', 200, 1200, 'Courier to hallmark centre'],
  ['Shop rent', 18000, 18000, 'Shop rent for the month'],
];

// ---------------------------------------------------------------- clear

async function clearBusinessData() {
  const db = mongoose.connection.db;
  const present = new Set((await db.listCollections().toArray()).map((c) => c.name));
  let removed = 0;
  for (const name of CLEAR) if (present.has(name)) removed += (await db.collection(name).deleteMany({})).deletedCount;
  // Uploaded files that belonged to cleared records (bill photos, product images, employee photos); the logo stays.
  if (present.has('fileassets')) removed += (await db.collection('fileassets').deleteMany({ purpose: { $nin: ['logo', 'signature', 'stamp', 'favicon'] } })).deletedCount;
  // The seeding sessions of an earlier run.
  if (present.has('sessions')) await db.collection('sessions').deleteMany({ userAgent: 'sample-data-seed' });
  return removed;
}

// ---------------------------------------------------------------- one organisation

async function seedOrganisation(owner) {
  // A login session for the owner, written directly (no password needed); removed again at the end.
  const sessions = mongoose.connection.db.collection('sessions');
  const { insertedId: sessionId } = await sessions.insertOne({ userId: owner._id, organisationId: owner.organisationId, realm: 'tenant', tokenHash: createRefreshSecret().hash, rememberMe: false, signedInWith: 'password', userAgent: 'sample-data-seed', revokedAt: null, expiresAt: new RealDate(RealDate.now() + 86400000), createdAt: new RealDate(), updatedAt: new RealDate() });
  auth = { user: owner, sessionId };
  travelTo(DAYS + 5);

  const me = await get('/auth/me');
  console.log(`\n${me.organisation.name} (${owner.email})`);
  const branches = me.branches.map((b) => b.id);
  const ho = branches[0];
  const second = branches[1] ?? ho;
  branchHeader = ho;
  const settings = await get('/settings');
  const huidMandatory = Boolean(settings?.jewellery?.huidMandatory);
  const cashLimit = settings?.jewellery?.cashLimitPaise ?? 19999900;
  // Top-level categories only (items and pieces cannot use a sub-category). A shop without e.g. "Bangles" gets its
  // general gold / silver category instead.
  const categories = Object.fromEntries((await get('/categories')).filter((c) => !c.parentId).map((c) => [c.name, c.id]));
  const catOf = (name, metal = 'gold') => categories[name] ?? categories[metal === 'silver' ? 'Silver Jewellery' : 'Gold Jewellery'] ?? Object.values(categories)[0];

  // Masters --------------------------------------------------------
  const suppliers = [];
  for (const [companyName, supplies, oldDue] of SUPPLIERS) {
    suppliers.push(await post('/suppliers', { companyName, contactPerson: `${pick(FIRST)} ${pick(LAST)}`, mobile: mobile(), gstin: null, address: { line1: `${between(2, 180)}, ${pick(STREETS)}`, city: 'Kolkata', stateCode: '19', pincode: '700012' }, supplies, paymentTermsDays: pick([0, 7, 15, 30]), ...(oldDue && { openingBalancePaise: rupees(oldDue) }) }));
  }
  step(`Suppliers: ${suppliers.length}`);

  const customers = [];
  for (let i = 0; i < 5; i += 1) {
    const [city, pincode] = pick(CITIES);
    const body = { name: `${FIRST[i % FIRST.length]} ${pick(LAST)}`, mobile: mobile(), address: { line1: `${between(1, 220)}, ${pick(STREETS)}`, city, stateCode: '19', pincode } };
    if (i % 3 === 0) body.pan = pan();
    if (i === 4) body.openingBalancePaise = rupees(between(5, 40) * 1000); // owes from before
    customers.push(await post('/customers', body));
  }
  const withPan = customers.filter((c) => c.pan);
  step(`Customers: ${customers.length}`);

  const staff = [];
  for (const [name, designation, b, basic] of EMPLOYEES) {
    const branchId = b ? second : ho;
    staff.push({ ...(await post('/hr/employees', { name, mobile: mobile(), designation, branchId, joiningDate: pick(['2023-06-01', '2024-04-01', '2025-01-15']), basicPaise: rupees(basic), allowancePaise: rupees(Math.round(basic * 0.2)) })), branchId });
  }
  step(`Employees: ${staff.length}`);

  const items = {};
  for (const name of ITEM_NAMES) {
    const [, category, jewelleryType, metal, purity, , , makingPerG, wastagePct] = CATALOGUE.find((c) => c[0] === name);
    items[name] = await post('/items', { name, categoryId: catOf(category, metal), jewelleryType, metal, purity, wastage: { mode: 'percent', value: wastagePct * 100 }, making: { type: 'per_gram', value: rupees(makingPerG) }, description: pick([null, 'Fast seller', 'Light weight', 'Wedding season']) });
  }
  const goldItems = Object.values(items).filter((i) => i.metal === 'gold');
  step(`Catalogue items: ${Object.keys(items).length}`);

  // Rates and opening stock -----------------------------------------
  // Everything before the first day happens early on day 4, before the day's work starts.
  travelTo(DAYS, 9);
  const rates = { ...BASE_RATES };
  const postRates = () => post('/rates', { rates: Object.entries(rates).map(([k, ratePerGramPaise]) => ({ metal: k.split(':')[0], purity: Number(k.split(':')[1]), ratePerGramPaise })) });
  await postRates();

  const stock = { [ho]: [], [second]: [] };
  for (const [n, row] of OPENING_PIECES.entries()) {
    const [name, category, jewelleryType, metal, purity, gMin, gMax, makingPerG, wastagePct, stone] = CATALOGUE[row];
    const branchId = n === OPENING_PIECES.length - 1 ? second : ho;
    const grossWeightMg = between(gMin * 1000, gMax * 1000);
    const stones = stone ? [{ type: stone, count: between(1, 12), weight: stone === 'diamond' ? between(10, 60) : between(200, 1500), weightUnit: stone === 'diamond' ? 'ct' : 'g', ratePaise: stone === 'diamond' ? rupees(between(450, 900)) : rupees(between(5, 40)) }] : [];
    const product = await post('/products', {
      name,
      categoryId: catOf(category, metal),
      jewelleryType,
      metal,
      purity,
      grossWeightMg,
      stones,
      wastage: wastagePct ? { mode: 'percent', value: wastagePct * 100 } : { mode: 'none', value: 0 },
      making: { type: 'per_gram', value: rupees(makingPerG) },
      costPricePaise: Math.round((grossWeightMg / 1000) * rates[`${metal}:${purity}`] * 0.93),
      ...(metal === 'gold' || huidMandatory ? { huid: huid() } : {}),
      supplierId: pick(suppliers).id,
      branchId,
    });
    stock[branchId].push(product.id);
  }
  for (const branchId of new Set([ho, second])) await post('/inventory/opening', { branchId, productIds: stock[branchId], note: 'Stock in the shop when we started' });
  // Raw metal already in the shop: bullion, old gold and scrap.
  const opening = await post('/inventory/opening', {
    branchId: ho,
    metalLines: [
      { metal: 'gold', purity: 916, kind: 'old_gold', grossWeightMg: 65000, valuePaise: Math.round(65 * rates['gold:916'] * 0.92) },
      { metal: 'gold', purity: 916, kind: 'bullion', grossWeightMg: 100000, valuePaise: 100 * rates['gold:916'] },
      { metal: 'gold', purity: 916, kind: 'scrap', grossWeightMg: 8500, valuePaise: Math.round(8.5 * rates['gold:916'] * 0.9) },
      { metal: 'silver', purity: 999, kind: 'bullion', grossWeightMg: 750000, valuePaise: 750 * rates['silver:999'] },
    ],
    note: 'Gold and silver in the locker',
  });
  if (second !== ho) await post('/inventory/opening', { branchId: second, metalLines: [{ metal: 'gold', purity: 916, kind: 'old_gold', grossWeightMg: 22000, valuePaise: Math.round(22 * rates['gold:916'] * 0.92) }] });
  step(`Opening stock: ${stock[ho].length + stock[second].length} pieces, raw gold and silver (${opening.docNo})`);

  // Purchase orders: three stay open, one is received on day 4, one is cancelled.
  const poLine = (item, qty, grams) => ({ description: item.name, itemId: item.id, metal: item.metal, purity: item.purity, quantity: qty, weightMg: grams * 1000 * qty, amountPaise: Math.round(grams * qty * rates[`${item.metal}:${item.purity}`] * 0.95) });
  const poOpen = await post('/purchases/orders', { supplierId: suppliers[1].id, branchId: ho, lines: [poLine(items['Kolkata bala'], 2, 16), poLine(items['Rope chain'], 3, 10)], note: 'For Durga Puja' });
  await post('/purchases/orders', { supplierId: suppliers[0].id, branchId: ho, lines: [poLine(items['Plain gold ring'], 4, 4)] });
  await post('/purchases/orders', { supplierId: suppliers[1].id, branchId: ho, lines: [poLine(items['Stud earrings'], 6, 3)], note: 'Light weight designs' });
  const poReceive = await post('/purchases/orders', { supplierId: suppliers[4].id, branchId: ho, lines: [poLine(items['Stud earrings'], 4, 3), poLine(items['Plain gold ring'], 2, 4)] });
  const poCancel = await post('/purchases/orders', { supplierId: suppliers[3].id, branchId: ho, lines: [poLine(items['Silver anklet (pair)'], 6, 40)] });
  await post(`/purchases/orders/${poCancel.id}/cancel`, { reason: 'Supplier out of stock' });
  step(`Purchase orders: 5 (${poOpen.orderNo} and two more open, one to receive, one cancelled)`);

  // Branch transfers: one piece sent and received now; one piece kept back to send on the last day.
  let inTransitPiece = null;
  if (second !== ho) {
    const sent = stock[ho].splice(0, 1);
    const t1 = await attempt('transfer', () => post('/inventory/transfers', { fromBranchId: ho, toBranchId: second, productIds: sent, note: 'For the weekend rush' }));
    if (t1 && (await attempt('receive transfer', () => post(`/inventory/transfers/${t1.id}/receive`)))) stock[second].push(...sent);
    inTransitPiece = stock[ho].pop();
  }

  // Day by day: one of each kind of record a day ------------------------
  let sales = 0;
  let purchases = 0;
  let productions = 0;
  let expenses = 0;
  let oldGold = 0;
  const orders = [];
  const saleLog = [];
  const expenseCats = Object.fromEntries((await get('/expenses/categories')).map((c) => [c.name, c.id]));
  const payable = (total) => (total > cashLimit ? [{ mode: pick(['upi', 'card', 'bank']), amountPaise: total }] : rand() < 0.5 ? [{ mode: 'cash', amountPaise: total }] : [{ mode: 'cash', amountPaise: Math.round(total * 0.4) }, { mode: 'upi', amountPaise: total - Math.round(total * 0.4) }]);
  const newPiece = (item) => {
    const [, , , , , gMin, gMax] = CATALOGUE.find((c) => c[0] === item.name);
    const grossWeightMg = between(gMin * 1000, gMax * 1000);
    return { itemId: item.id, grossWeightMg, ...(item.metal === 'gold' || huidMandatory ? { huid: huid() } : {}), costPaise: Math.round((grossWeightMg / 1000) * rates[`${item.metal}:${item.purity}`] * 0.94) };
  };

  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo -= 1) {
    travelTo(daysAgo, 10);
    // The first day's rates were posted with the opening stock.
    if (daysAgo < DAYS) {
      for (const key of Object.keys(rates)) rates[key] = Math.round(rates[key] * (1 + (rand() - 0.45) * 0.012));
      await postRates();
    }

    const date = isoDaysAgo(daysAgo);
    const sunday = new RealDate(`${date}T00:00:00Z`).getUTCDay() === 0;
    if (daysAgo > 0 && !sunday) {
      for (const branchId of new Set([ho, second])) {
        const entries = staff.filter((e) => e.branchId === branchId).map((e) => ({ employeeId: e.id, status: rand() < 0.88 ? 'present' : pick(['absent', 'half_day', 'paid_leave']) }));
        await attempt('attendance', () => put('/hr/attendance', { branchId, date, entries }));
      }
    }

    // Purchase: new pieces from catalogue items, sometimes with bullion; paid in full, in part or later.
    {
      travelTo(daysAgo, 11);
      const receiving = daysAgo === DAYS;
      const supplier = receiving ? suppliers[4] : pick([suppliers[0], suppliers[1], suppliers[4]]);
      const fresh = receiving
        ? [...Array.from({ length: 4 }, () => newPiece(items['Stud earrings'])), ...Array.from({ length: 2 }, () => newPiece(items['Plain gold ring']))]
        : Array.from({ length: between(1, 2) }, () => newPiece(pick(goldItems)));
      const metalLines = !receiving && daysAgo % 2 === 1 ? [{ metal: 'gold', purity: 916, kind: 'bullion', grossWeightMg: between(20, 50) * 1000, valuePaise: 0 }] : [];
      for (const l of metalLines) l.valuePaise = Math.round((l.grossWeightMg / 1000) * rates['gold:916']);
      const goods = fresh.reduce((n, p) => n + p.costPaise, 0) + metalLines.reduce((n, l) => n + l.valuePaise, 0);
      const gstPaise = Math.round(goods * 0.03);
      const total = goods + gstPaise;
      const paid = [1, 0, 0.5, 1, 0][daysAgo];
      const bill = await attempt('purchase', () =>
        post('/purchases', {
          supplierId: supplier.id,
          branchId: ho,
          billNo: `${supplier.companyName.split(' ')[0].toUpperCase().slice(0, 4)}-${between(100, 999)}`,
          billDate: date,
          ...(receiving && { orderId: poReceive.id }),
          newPieces: fresh,
          metalLines,
          gstPaise,
          ...(paid && { paidNow: { amountPaise: Math.round(total * paid), mode: 'bank' } }),
          note: receiving ? 'Received against purchase order' : null,
        }),
      );
      if (bill) purchases += 1;
    }

    // Making jewellery from raw gold: one piece a day, put on the shelf for sale.
    {
      travelTo(daysAgo, 12);
      const item = pick([items['Plain gold ring'], items['Stud earrings']]);
      const pieces = [{ itemId: item.id, grossWeightMg: between(25, 45) * 100, ...(huidMandatory || rand() < 0.6 ? { huid: huid() } : {}) }];
      const used = pieces.reduce((n, p) => n + p.grossWeightMg, 0) + between(2, 6) * 100;
      const made = await attempt('production', () => post('/inventory/production', { branchId: ho, metalUsed: [{ metal: 'gold', purity: 916, kind: pick(['old_gold', 'bullion']), grossWeightMg: used }], pieces, makingPaise: rupees(between(4, 9) * 100), makingMode: 'cash', note: `Made by Ratan Shil` }));
      if (made) {
        productions += 1;
        stock[ho].push(...made.pieces.map((p) => p.productId));
      }
    }

    // Customer order: one a day. Order bills are large: PAN is needed on them, so orders go to customers who gave it.
    {
      travelTo(daysAgo, 13);
      const [description, category, grams, estimate] = ORDERS[DAYS - daysAgo];
      const customer = withPan[(DAYS - daysAgo) % withPan.length];
      // Every other order: the customer brings some of their own old gold towards it.
      const ownGold = daysAgo % 2 === 0 ? [{ description: pick(['Old chain', 'Old bangles', 'Broken earrings']), metal: 'gold', purity: 916, grossWeightMg: Math.round(grams * 1000 * pick([0.4, 0.6, 0.8])), lessWeightMg: between(1, 4) * 100 }] : [];
      const order = await attempt('order', () =>
        post('/orders', {
          branchId: ho,
          customerId: customer.id,
          items: [{ description, categoryId: catOf(category), metal: 'gold', purity: 916, approxWeightMg: grams * 1000, estimatedPaise: rupees(estimate) }],
          advance: { mode: pick(['cash', 'upi']), amountPaise: rupees(Math.round(estimate * (ownGold.length ? 0.1 : 0.25))) },
          customerMetal: ownGold,
          notes: pick([null, 'Customer wants it before the wedding', 'Design from the photo on WhatsApp']),
        }),
      );
      if (order) orders.push({ ...order, customerId: customer.id, grams, stage: ORDER_STAGES[DAYS - daysAgo] });
    }

    // Sale of the day (see SALES_PLAN).
    const plan = SALES_PLAN[daysAgo];
    const saleBranch = plan?.branch ? second : ho;
    if (plan && stock[saleBranch].length >= (plan.pieces ?? 1)) {
      travelTo(daysAgo, between(15, 17));
      branchHeader = saleBranch;
      const saleItems = stock[saleBranch].splice(0, plan.pieces ?? 1).map((productId) => ({ productId }));
      let customerId = pick(customers).id;
      const exchange = plan.exchange ? [{ description: pick(['Old bangle', 'Old chain', 'Broken earrings', 'Old ring']), metal: 'gold', purity: 916, grossWeightMg: between(15, 30) * 100, lessWeightMg: between(0, 2) * 100, deductionBps: 200, ratePerGramPaise: Math.round(rates['gold:916'] * 0.95) }] : undefined;
      let quote = await attempt('quote', () => post('/sales/quote', { branchId: saleBranch, customerId, items: saleItems, ...(exchange && { oldGold: exchange }) }));
      if (quote?.compliance?.panRequired) {
        customerId = pick(withPan).id;
        quote = await attempt('quote', () => post('/sales/quote', { branchId: saleBranch, customerId, items: saleItems, ...(exchange && { oldGold: exchange }) }));
      }
      if (quote) {
        const total = quote.payablePaise ?? quote.totals.grandTotalPaise;
        const creditPaise = Math.round(total * (plan.credit ?? 0));
        const payments = creditPaise ? [{ mode: 'credit', amountPaise: creditPaise }, ...(total - creditPaise ? [{ mode: 'upi', amountPaise: total - creditPaise }] : [])] : payable(total);
        const sale = await attempt('sale', () => post('/sales', { branchId: saleBranch, customerId, items: saleItems, ...(exchange && { oldGold: exchange }), payments }));
        if (sale) {
          sales += 1;
          saleLog.push({ ...sale, customerId, creditPaise, daysAgo });
        }
      }
    }
    branchHeader = ho;

    // Old gold bought from a walk-in customer (on day 3 old gold comes in as an exchange on the sale instead).
    if (daysAgo !== 3) {
      travelTo(daysAgo, 16);
      const og = await attempt('old gold', () => post('/old-gold', { branchId: ho, customerId: pick(customers).id, lines: [{ description: pick(['Old chain', 'Old bangle', 'Broken necklace']), metal: 'gold', purity: 916, grossWeightMg: between(4, 15) * 1000, lessWeightMg: between(0, 5) * 100, deductionBps: 300, ratePerGramPaise: Math.round(rates['gold:916'] * 0.94) }], payout: { mode: pick(['cash', 'upi', 'bank']) } }));
      if (og) oldGold += 1;
    }

    // Shop expense: a different kind each day, the rent on the last day.
    {
      travelTo(daysAgo, 18);
      const [cat, min, max, note] = daysAgo === 0 ? EXPENSES[5] : EXPENSES[DAYS - daysAgo];
      if (expenseCats[cat]) {
        const e = await attempt('expense', () => post('/expenses', { branchId: pick([ho, ho, second]), date, categoryId: expenseCats[cat], amountPaise: rupees(between(min, max)), mode: pick(['cash', 'cash', 'upi', 'bank']), note }));
        if (e) expenses += 1;
      }
    }
  }
  step(`Metal rates: ${DAYS + 1} days`);
  step(`Purchases: ${purchases} (one received against a purchase order)`);
  step(`Sales invoices: ${sales} (one on credit, one with old gold exchange)`);
  step(`Jewellery made from raw gold: ${productions}`);
  step(`Old gold bought: ${oldGold} (and one taken in exchange on a sale)`);
  step(`Expenses: ${expenses}`);

  // Today: settle, move orders along, returns, transfers, payroll ---------------------
  travelTo(0, 19);

  // Orders, oldest first: delivered, ready, in progress (with a second advance), cancelled, booked.
  for (const order of orders) {
    const { stage } = order;
    await attempt(`order ${order.orderNo}`, async () => {
      if (stage === 'booked') return;
      if (stage === 'cancelled') return post(`/orders/${order.id}/cancel`, { reason: 'Customer cancelled the order', refundMode: 'cash' });
      await patch(`/orders/${order.id}/status`, { status: 'in_progress', note: 'Sent to karigar' });
      if (stage === 'in_progress') return post(`/orders/${order.id}/advances`, { mode: 'upi', amountPaise: rupees(10000), reference: `UPI-${between(100, 999)}` });
      // Made from the customer's gold first, the rest from the shop's bullion; a little is lost in the making.
      const finishedMg = Math.round(order.grams * 1000 * (0.97 + rand() * 0.06));
      const needMg = Math.round(finishedMg * 1.03);
      const customerMg = Math.min(needMg, order.customerMetalBalance?.[0]?.leftMg ?? 0);
      const materials = [...(customerMg ? [{ source: 'customer', metal: 'gold', purity: 916, grossWeightMg: customerMg }] : []), ...(needMg > customerMg ? [{ source: 'shop', metal: 'gold', purity: 916, kind: 'bullion', grossWeightMg: needMg - customerMg }] : [])];
      const finished = await post(`/orders/${order.id}/items/0/finish`, { grossWeightMg: finishedMg, huid: huid(), wastage: { mode: 'percent', value: 800 }, making: { type: 'per_gram', value: rupees(550) }, materials, karigarPaise: rupees(Math.round(order.grams * 350)), karigarMode: 'cash' });
      await patch(`/orders/${order.id}/status`, { status: 'ready' });
      if (stage === 'ready') return;
      const lines = [{ productId: finished.items[0].product.id }];
      const quote = await post('/sales/quote', { branchId: ho, customerId: order.customerId, orderId: order.id, items: lines });
      const due = quote.payablePaise ?? quote.totals.grandTotalPaise;
      await post('/sales', { branchId: ho, customerId: order.customerId, orderId: order.id, items: lines, payments: [{ mode: due > cashLimit ? 'bank' : 'upi', amountPaise: due }] });
    });
  }
  step(`Customer orders: ${orders.length} (delivered, ready, in progress, cancelled and booked)`);

  // Collect some credit, return one piece, cancel one bill.
  const onCredit = saleLog.filter((s) => s.creditPaise > 0);
  for (const s of onCredit.slice(0, Math.ceil(onCredit.length / 2))) {
    await attempt('collect due', () => post(`/customers/${s.customerId}/payments`, { branchId: s.branch?.id ?? ho, mode: pick(['cash', 'upi']), amountPaise: Math.min(s.creditPaise, rupees(between(5, 30) * 1000)) }));
  }
  const returnable = saleLog.find((s) => s.daysAgo === 1 && s.items?.length);
  if (returnable) await attempt('sales return', () => post(`/sales/${returnable.id}/returns`, { productIds: [returnable.items[0].productId], refundMode: 'cash', reason: 'Size does not fit' }));
  const cancellable = saleLog.findLast((s) => s.daysAgo === 0 && !s.creditPaise && s.id !== returnable?.id);
  if (cancellable) await attempt('sale cancel', () => post(`/sales/${cancellable.id}/cancel`, { reason: 'Wrong item billed' }));
  step(`Customer dues collected: ${Math.ceil(onCredit.length / 2)}; 1 sales return; 1 bill cancelled`);

  // Supplier side: pay off the old balance and a bill.
  await attempt('supplier payment', () => post(`/suppliers/${suppliers[1].id}/payments`, { branchId: ho, amountPaise: rupees(50000), mode: 'bank', reference: `NEFT${between(10000, 99999)}` }));
  const unpaid = (await get('/purchases?limit=20')).find?.((p) => p.duePaise > 0);
  if (unpaid) await attempt('bill payment', () => post(`/purchases/${unpaid.id}/payments`, { amountPaise: Math.round(unpaid.duePaise / 2), mode: 'bank' }));
  step('Supplier payments: 2');

  // The piece kept back on day one goes to the other branch today and stays in transit.
  if (inTransitPiece) {
    await attempt('transfer', () => post('/inventory/transfers', { fromBranchId: ho, toBranchId: second, productIds: [inTransitPiece], note: 'Customer asked to see it there' }));
    step('Branch transfers: 2 (one received, one in transit)');
  }
  // A stock adjustment waits for approval.
  await attempt('adjustment', () => post('/inventory/adjustments', { branchId: ho, reason: 'weight_correction', metalLines: [{ metal: 'gold', purity: 916, kind: 'scrap', direction: 'out', grossWeightMg: 600 }], note: 'Scrap weighed again on the new scale' }));
  step('Stock adjustment: 1 waiting for approval');

  // HR: last month's payroll (finalised and paid) and a salary advance.
  const lastMonth = isoDaysAgo(new RealDate(RealDate.now() + 330 * 60000).getUTCDate() + 1).slice(0, 7);
  const run = await attempt('payroll', () => post('/hr/payroll', { branchId: ho, month: lastMonth }));
  if (run) {
    await attempt('finalise payroll', () => post(`/hr/payroll/${run.id}/finalise`));
    await attempt('pay payroll', () => post(`/hr/payroll/${run.id}/pay`, { mode: 'bank', reference: `SAL-${lastMonth}` }));
  }
  await attempt('advance', () => post('/hr/advances', { employeeId: staff[1].id, amountPaise: rupees(10000), installmentPaise: rupees(2500), mode: 'cash' }));
  step(`Payroll: ${lastMonth} paid; salary advance: 1`);

  await sessions.deleteOne({ _id: sessionId });
  branchHeader = null;
}

// ---------------------------------------------------------------- run

console.log('\nResetting sample data...');
await connectDb();
try {
  const removed = await clearBusinessData();
  console.log(`  • Cleared ${removed} business records (organisations, users, settings and accounts kept)`);

  // Each organisation is filled in through its owner: the earliest active user with access to every branch.
  const owners = await mongoose.connection.db
    .collection('users')
    .aggregate([{ $match: { status: 'active', 'branchAccess.all': true } }, { $sort: { createdAt: 1 } }, { $group: { _id: '$organisationId', user: { $first: '$$ROOT' } } }])
    .toArray();
  for (const { user } of owners) {
    try {
      await seedOrganisation(user);
    } catch (err) {
      console.error(`\n  Stopped for ${user.email}: ${err.message}\n`);
      process.exitCode = 1;
    }
  }
  console.log('\nDone. Sign in with your usual accounts.\n');
} finally {
  offsetMs = 0;
  await disconnectDb();
}
