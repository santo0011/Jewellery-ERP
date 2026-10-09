// Demo data for development: one organisation with two branches, suppliers, customers, stock,
// 30 days of metal rates, sales and attendance, and customer orders at different stages.
//
// Usage: npm run seed:demo        (MongoDB must be running, e.g. via `npm run dev`)
//
// Everything goes through the real API in-process, so stock, invoices and ledgers stay consistent.
// To spread activity over past days the script moves its own clock back; nothing else is affected.

process.env.NODE_ENV = 'test'; // skips the HTTP rate limiters and request logging for this in-process run

const { default: request } = await import('supertest');
const { env } = await import('../src/config/env.js');
const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { User } = await import('../src/modules/users/user.model.js');

const DEMO = { email: 'owner@demo-jewellers.example.com', password: 'Demo@1234' };
const DAYS = 30;

// ---------------------------------------------------------------- clock

const RealDate = Date;
let offsetMs = 0;
class ShiftedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offsetMs);
    else super(...args);
  }
  static now() {
    return RealDate.now() + offsetMs;
  }
}
globalThis.Date = ShiftedDate;
/** Moves the clock to `daysAgo` days before today, at the given hour (IST). */
const travelTo = (daysAgo, hour = 11) => {
  offsetMs = 0;
  const target = new RealDate(RealDate.now() - daysAgo * 86400000);
  const ist = new RealDate(target.getTime() + 330 * 60000);
  ist.setUTCHours(hour, Math.floor(Math.random() * 60), 0, 0);
  offsetMs = Math.min(ist.getTime() - 330 * 60000, RealDate.now() - 60000) - RealDate.now();
};
const isoDaysAgo = (n) => new RealDate(RealDate.now() + 330 * 60000 - n * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- helpers

let seed = 20261009;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => Math.round(min + rand() * (max - min));
const shuffle = (list) => [...list].sort(() => rand() - 0.5);
const huid = () => Array.from({ length: 6 }, () => pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789')).join('');
const mobile = (() => {
  const used = new Set();
  return () => {
    let m;
    do m = `${pick(['98', '97', '96', '90', '83', '70'])}${between(10000000, 99999999)}`;
    while (used.has(m));
    used.add(m);
    return m;
  };
})();

const app = createApp();
let token = null;
async function call(method, url, body) {
  const res = await request(app)[method](`/api/v1${url}`).set(token ? { Authorization: `Bearer ${token}` } : {}).send(body);
  if (res.status >= 400) throw new Error(`${method.toUpperCase()} ${url} -> ${res.status} ${JSON.stringify(res.body.error ?? res.body)}`);
  return res.body.data;
}
const post = (url, body) => call('post', url, body);
const login = async (email, password) => {
  token = null;
  token = (await post('/auth/login', { email, password })).accessToken;
};
const step = (msg) => console.log(`  • ${msg}`);

// ---------------------------------------------------------------- data

const FIRST = ['Rupa', 'Ananya', 'Sourav', 'Debasish', 'Priya', 'Moumita', 'Arijit', 'Sunita', 'Rahul', 'Tanushree', 'Subhajit', 'Payel', 'Abhijit', 'Rina', 'Sayan', 'Madhumita', 'Kaushik', 'Sharmila', 'Indrani', 'Partha', 'Neha', 'Amit', 'Swati', 'Rajesh', 'Mitali'];
const LAST = ['Sen', 'Das', 'Ghosh', 'Bose', 'Chatterjee', 'Mukherjee', 'Banerjee', 'Dutta', 'Roy', 'Saha', 'Paul', 'Mondal', 'Biswas', 'Sarkar', 'Chakraborty'];
const CITIES = [['Kolkata', '700029'], ['Kolkata', '700091'], ['Howrah', '711101'], ['Barasat', '700124'], ['Salt Lake', '700064'], ['Dum Dum', '700028']];

// base rate per gram (paise) 30 days ago; moves a little every day
const BASE_RATES = { 'gold:916': 1214000, 'gold:750': 994000, 'silver:999': 15200, 'silver:925': 14100 };

const CATALOGUE = [
  // [name, category, type, metal, purity, gross g min, max, making /g (₹), wastage %, stones?]
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
  ['Gold coin 8 g', 'Custom Jewellery', 'coin_bar', 'gold', 916, 8, 8, 100, 0],
  ['Silver anklet (pair)', 'Anklet', 'silver', 'silver', 925, 30, 60, 30, 5],
  ['Silver bracelet', 'Bracelet', 'silver', 'silver', 925, 15, 30, 35, 5],
  ['Silver coin 20 g', 'Silver Jewellery', 'coin_bar', 'silver', 999, 20, 20, 5, 0],
];

const rupees = (r) => r * 100;

// ---------------------------------------------------------------- run

console.log('\nSeeding demo data...');
await connectDb();
if (await User.exists({ email: DEMO.email }).setOptions({ skipTenant: true })) {
  console.log(`\nDemo data already exists (${DEMO.email}). To start over: npm run db:reset, then npm run seed:demo.\n`);
  await disconnectDb();
  process.exit(0);
}
if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
  console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in backend/.env first (the demo organisation is created through the Super Admin).');
  process.exit(1);
}

try {
  // Organisation (created "now" so its trial is current), then everything else happens in the past.
  await login(env.SUPER_ADMIN_EMAIL, env.SUPER_ADMIN_PASSWORD);
  await post('/platform/organisations', { organisationName: 'Sonar Bangla Jewellers', ownerName: 'Rakesh Saha', email: DEMO.email, mobile: '9830012345', stateCode: '19', password: 'Temp@1234', branchLimit: 3 });
  await login(DEMO.email, 'Temp@1234');
  token = (await post('/auth/change-password', { currentPassword: 'Temp@1234', newPassword: DEMO.password })).accessToken;
  step('Organisation: Sonar Bangla Jewellers');

  travelTo(DAYS + 5);
  await login(DEMO.email, DEMO.password);
  const me = await call('get', '/auth/me');
  const ho = me.branches[0].id;
  const slk = (await post('/branches', { code: 'SLK', name: 'Salt Lake', address: { line1: 'DC Block, Sector 1', city: 'Salt Lake', stateCode: '19', pincode: '700064' } }))._id;
  const branches = [ho, ho, ho, slk]; // head office gets most of the activity
  step('Branches: Head Office, Salt Lake');

  const categories = Object.fromEntries((await call('get', '/categories')).map((c) => [c.name, c.id]));

  const supplierIds = [];
  for (const [companyName, supplies] of [['Kolkata Bullion Co', ['gold']], ['Bowbazar Ornaments', ['jewellery', 'gold']], ['Surat Diamond House', ['diamond', 'stones']], ['Burrabazar Silver Mart', ['silver']]]) {
    supplierIds.push((await post('/suppliers', { companyName, mobile: mobile(), address: { city: 'Kolkata', stateCode: '19' }, supplies })).id);
  }
  step(`Suppliers: ${supplierIds.length}`);

  const customers = [];
  for (let i = 0; i < 30; i += 1) {
    const [city, pincode] = pick(CITIES);
    const name = `${FIRST[i % FIRST.length]} ${pick(LAST)}`;
    const body = { name, mobile: mobile(), address: { line1: `${between(1, 220)}, ${pick(['Lake Road', 'Rash Behari Avenue', 'Jessore Road', 'GT Road', 'Park Street'])}`, city, stateCode: '19', pincode } };
    if (i % 3 === 0) body.pan = `${pick(['ABCPS', 'BXDPD', 'CQKPG', 'AHTPB'])}${between(1000, 9999)}${pick(['F', 'K', 'L', 'M'])}`;
    customers.push(await post('/customers', body));
  }
  const withPan = customers.filter((c) => c.pan);
  step(`Customers: ${customers.length}`);

  // Rates for the first day, then stock priced against them.
  const rates = { ...BASE_RATES };
  const postRates = () => post('/rates', { rates: Object.entries(rates).map(([k, ratePerGramPaise]) => ({ metal: k.split(':')[0], purity: Number(k.split(':')[1]), ratePerGramPaise })) });
  await postRates();

  const stock = { [ho]: [], [slk]: [] };
  for (let n = 0; n < 60; n += 1) {
    const [name, category, jewelleryType, metal, purity, gMin, gMax, makingPerG, wastagePct, stone] = CATALOGUE[n % CATALOGUE.length];
    const branchId = n % 4 === 3 ? slk : ho;
    const grossWeightMg = between(gMin * 1000, gMax * 1000);
    const stones = stone ? [{ type: stone, count: between(1, 12), weight: stone === 'diamond' ? between(10, 60) : between(200, 1500), weightUnit: stone === 'diamond' ? 'ct' : 'g', ratePaise: stone === 'diamond' ? rupees(between(450, 900)) : rupees(between(5, 40)) }] : [];
    const metalCost = Math.round((grossWeightMg / 1000) * rates[`${metal}:${purity}`] * 0.93);
    const product = await post('/products', {
      name,
      categoryId: categories[category],
      jewelleryType,
      metal,
      purity,
      grossWeightMg,
      stones,
      wastage: wastagePct ? { mode: 'percent', value: wastagePct * 100 } : { mode: 'none', value: 0 },
      making: { type: 'per_gram', value: rupees(makingPerG) },
      costPricePaise: metalCost,
      huid: huid(),
      supplierId: pick(supplierIds),
      branchId,
    });
    stock[branchId].push(product.id);
  }
  for (const branchId of [ho, slk]) await post('/inventory/opening', { branchId, productIds: stock[branchId] });
  step(`Products in stock: ${stock[ho].length} at Head Office, ${stock[slk].length} at Salt Lake`);

  const staff = [];
  for (const [name, designation, branchId, basic] of [['Bimal Pal', 'Store manager', ho, 32000], ['Asha Roy', 'Sales executive', ho, 18000], ['Tapas Dey', 'Sales executive', ho, 17000], ['Mousumi Kar', 'Cashier', ho, 16000], ['Ratan Shil', 'Karigar', ho, 22000], ['Joyita Nandi', 'Branch in-charge', slk, 26000], ['Sumon Hazra', 'Sales executive', slk, 16500]]) {
    staff.push({ ...(await post('/hr/employees', { name, mobile: mobile(), designation, branchId, joiningDate: '2024-04-01', basicPaise: rupees(basic), allowancePaise: rupees(Math.round(basic * 0.2)) })), branchId });
  }
  step(`Employees: ${staff.length}`);

  // Day by day: rates, sales, orders and attendance.
  let sales = 0;
  const orders = [];
  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo -= 1) {
    travelTo(daysAgo, 10);
    await login(DEMO.email, DEMO.password);
    for (const key of Object.keys(rates)) rates[key] = Math.round(rates[key] * (1 + (rand() - 0.45) * 0.012));
    await postRates();

    const date = isoDaysAgo(daysAgo);
    const sunday = new RealDate(`${date}T00:00:00Z`).getUTCDay() === 0;
    if (daysAgo > 0 && !sunday) {
      for (const branchId of [ho, slk]) {
        const entries = staff.filter((e) => e.branchId === branchId).map((e) => ({ employeeId: e.id, status: rand() < 0.9 ? 'present' : pick(['absent', 'half_day']) }));
        await call('put', '/hr/attendance', { branchId, date, entries });
      }
    }

    const todaysSales = sunday ? between(2, 5) : between(1, 4);
    for (let s = 0; s < todaysSales; s += 1) {
      const branchId = pick(branches);
      if (stock[branchId].length < 3) continue;
      travelTo(daysAgo, between(11, 20));
      await login(DEMO.email, DEMO.password);
      const items = stock[branchId].splice(0, rand() < 0.25 ? 2 : 1).map((productId) => ({ productId }));
      let customerId = rand() < 0.8 ? pick(customers).id : undefined;
      let quote = await post('/sales/quote', { branchId, customerId, items });
      if (quote.compliance?.panRequired) {
        customerId = pick(withPan).id;
        quote = await post('/sales/quote', { branchId, customerId, items });
      }
      const total = quote.totals.grandTotalPaise;
      const credit = customerId ? pick([0, 0, 0, 0, 0, 0.5, 1]) : 0; // some customers buy on credit, fully or in part
      const creditPaise = Math.round(total * credit);
      const payments = creditPaise ? [{ mode: 'credit', amountPaise: creditPaise }, ...(total - creditPaise ? [{ mode: 'upi', amountPaise: total - creditPaise }] : [])] : total > 15000000 ?[{ mode: pick(['upi', 'card', 'bank']), amountPaise: total }] : rand() < 0.5 ? [{ mode: 'cash', amountPaise: total }] : [{ mode: 'cash', amountPaise: Math.round(total * 0.4) }, { mode: 'upi', amountPaise: total - Math.round(total * 0.4) }];
      await post('/sales', { branchId, customerId, items, payments });
      sales += 1;
    }

    if (daysAgo % 4 === 2) {
      const [description, category, grams, estimate] = pick([['22K bridal necklace set', 'Necklace', 40, 520000], ['Pair of Kolkata bala', 'Bangles', 20, 260000], ['Custom name pendant', 'Pendant', 4, 52000], ['22K wedding ring, size 16', 'Ring', 6, 78000], ['Mangalsutra with black beads', 'Mangalsutra', 12, 155000]]);
      const customer = pick(customers);
      const order = await post('/orders', {
        branchId: ho,
        customerId: customer.id,
        items: [{ description, categoryId: categories[category], metal: 'gold', purity: 916, approxWeightMg: grams * 1000, estimatedPaise: rupees(estimate) }],
        advance: { mode: pick(['cash', 'upi']), amountPaise: rupees(Math.round(estimate * 0.25)) },
      });
      orders.push({ ...order, customerId: customer.id, grams });
    }
  }
  step(`Metal rates: ${DAYS + 1} days`);
  step(`Sales invoices: ${sales}`);

  // Move orders along: oldest delivered, then ready, in progress, the newest stay booked.
  travelTo(0, 12);
  await login(DEMO.email, DEMO.password);
  for (const [i, order] of orders.entries()) {
    const stage = i < 2 ? 'delivered' : i < 4 ? 'ready' : i < 6 ? 'in_progress' : 'booked';
    if (stage === 'booked') continue;
    await call('patch', `/orders/${order.id}/status`, { status: 'in_progress', note: 'Sent to karigar' });
    if (stage === 'in_progress') continue;
    const finished = await post(`/orders/${order.id}/items/0/finish`, { grossWeightMg: Math.round(order.grams * 1000 * (0.97 + rand() * 0.06)), huid: huid(), wastage: { mode: 'percent', value: 800 }, making: { type: 'per_gram', value: rupees(550) } });
    await call('patch', `/orders/${order.id}/status`, { status: 'ready' });
    if (stage === 'ready') continue;
    const items = [{ productId: finished.items[0].product.id }];
    const quote = await post('/sales/quote', { branchId: ho, customerId: order.customerId, orderId: order.id, items });
    const due = quote.payablePaise ?? quote.totals.grandTotalPaise;
    await post('/sales', { branchId: ho, customerId: order.customerId, orderId: order.id, items, payments: [{ mode: due > 15000000 ? 'bank' : 'upi', amountPaise: due }] });
  }
  step(`Customer orders: ${orders.length} (booked, in progress, ready and delivered)`);

  await post('/hr/advances', { employeeId: staff[1].id, amountPaise: rupees(10000), installmentPaise: rupees(2500), mode: 'cash' });
  step('Salary advance: 1');

  console.log(`\nDone. Sign in at http://localhost:5173 as\n  ${DEMO.email}\n  ${DEMO.password}\n`);
} catch (err) {
  console.error(`\nDemo seeding stopped: ${err.message}\n`);
  process.exitCode = 1;
} finally {
  offsetMs = 0;
  await disconnectDb();
}
