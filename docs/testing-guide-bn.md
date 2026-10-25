# Jewellery ERP — Testing Sequence (ধাপে ধাপে)

Organization Panel-এর Sidebar ধরে সাজানো। আগের ধাপের data পরের ধাপে লাগে, তাই **ক্রম মেনে** test করুন।

**শুরুর আগে**
- Backend ও Frontend চালু করুন (`npm run dev`)।
- পরিষ্কার data চাইলে: `backend` folder-এ `npm run seed:reset-sample -- --yes` (শুধু local database)।
- Owner account দিয়ে login করুন (যেমন `santo@yopmail.com`)।
- প্রতিটি ধাপের পর **Stock summary**, **Profit & loss** বা **Dashboard**-এ সংখ্যা মিলছে কি না দেখে নিন।

---

## ধাপ ১ — Settings (সবকিছুর ভিত্তি)

| Module | কী test করবেন |
|---|---|
| **Organisation** | নাম, GSTIN, ঠিকানা, logo সেভ হচ্ছে কি না; logo sidebar-এ দেখাচ্ছে কি না |
| **Branches** | নতুন branch যোগ, edit, inactive করা; Head Office বদলানো যায় না |
| **Business settings** | GST %, চালু purity (22K/18K…), HUID বাধ্যতামূলক, PAN limit, cash limit, stock adjustment-এ approval লাগবে কি না |
| **Print settings** | Invoice header/footer, branch অনুযায়ী আলাদা print |
| **Product categories** | Category ও sub-category যোগ; যে category-তে product আছে সেটা delete হয় না |
| **Subscription** | Plan, মেয়াদ, limit (users/branches/products) দেখাচ্ছে |

## ধাপ ২ — Users & access

| Module | কী test করবেন |
|---|---|
| **Roles & permissions** | নতুন role (যেমন "Cashier") — শুধু billing পারমিশন; duplicate role |
| (Users) | নতুন user তৈরি, একটি branch-এ সীমাবদ্ধ করুন। পরে সেই user দিয়ে login করে দেখুন অন্য branch-এর data দেখা যায় না |
| **Audit log** | পরে প্রতিটি কাজের পর এখানে entry আসছে কি না দেখবেন |

## ধাপ ৩ — Metal rates

| কী test করবেন |
|---|
| আজকের 22K, 18K, Silver রেট দিন। **এটা ছাড়া billing, order estimate, old gold, customer gold চলবে না।** |
| History-তে আগের রেট দেখাচ্ছে কি না |

## ধাপ ৪ — Purchase-এর master data

| Module | কী test করবেন |
|---|---|
| **Suppliers** | নতুন supplier (old balance সহ) — leading zero ছাড়া টাইপ হচ্ছে কি না (যেমন 25000); detail page-এ due দেখাচ্ছে |
| **Items** | Design সেভ করুন (নাম, category, purity, wastage, making)। একই নাম+purity দুবার হয় না; inactive করলে search-এ আসে না |

## ধাপ ৫ — Stock-এ মাল ঢোকানো

এই ক্রমে করুন:

1. **Products** → নতুন product (draft) তৈরি করুন (HUID, ওজন, stone, cost)।
2. **Opening stock** → সেই draft product-গুলো stock-এ তুলুন। Status "In stock" হয়েছে কি না দেখুন।
3. **Raw materials → সোনা যোগ করুন** → 22K old gold 50 g, bullion 100 g। Stock table-এ দেখাচ্ছে।
   - ✏️ Edit করে ওজন বদলান → stock ও হিসাব ঠিক হচ্ছে। পরে সেই সোনা ব্যবহারের পর Edit বন্ধ হয়ে যায় কি না দেখুন।
4. **Purchase orders** → supplier-কে order দিন (item বেছে)। একটা cancel করুন।
5. **Purchases → New purchase**
   - Purchase order থেকে receive করুন (pieces নিজে থেকে আসে)
   - নতুন pieces (Item বেছে ওজন+cost), **Loose metal** লাইন, GST, part payment
   - Save-এর আগে confirm box আসে
   - Products-এ নতুন pieces, Raw materials-এ loose metal এসেছে
6. **Suppliers → Pay** → old balance আগে কাটে, তারপর পুরনো bill।

## ধাপ ৬ — Stock-এর কাজ

| Module | কী test করবেন |
|---|---|
| **Raw materials → গয়না তৈরি করুন** | সোনা না থাকলে Save বন্ধ থাকে; সোনা থাকলে item বেছে pieces বানান, মজুরি দিন → raw stock কমে, Products-এ নতুন piece |
| **Transfers** | Head Office → অন্য branch; receive করুন; একটা reject করুন (মাল ফেরত আসে) |
| **Adjustments** | একটা piece "damaged" write-off, metal কম করা → approval-এ যায় |
| **Approvals** (Overview) | Adjustment approve / reject করুন; নিজের request নিজে approve হয় না (full admin ছাড়া) |
| **Stock summary** | মোট piece, ওজন, মূল্য — আগের ধাপের সাথে মেলে |
| **Stock ledger** | প্রতিটি আসা-যাওয়া (opening, purchase, production, transfer…) দেখাচ্ছে |

## ধাপ ৭ — Sales

1. **Customers** → নতুন customer (PAN সহ ও ছাড়া, old due সহ)।
2. **New bill** — আলাদা আলাদা bill করুন:
   - Barcode/SKU scan করে cash bill
   - Cash + UPI split payment
   - Credit (বাকি) bill
   - **Old gold exchange** সহ bill (old gold-এর দাম bill থেকে কাটে, Raw materials-এ যায়)
   - ₹2 লাখের বেশি bill → PAN ছাড়া আটকায়
   - Cash limit-এর বেশি cash → আটকায়
3. **Invoices** → print, **Return** (একটা piece ফেরত — stock-এ ফেরে), **Cancel** bill।
4. **Customers → Collect due** → বাকি টাকা জমা।
5. **Old gold** → customer-এর থেকে সরাসরি পুরনো সোনা কেনা; cancel করুন (সোনা ব্যবহার হয়ে গেলে cancel হয় না)।

## ধাপ ৮ — Customer Orders (পুরো workflow)

1. **Orders → New order**: item (ওজন, purity, making), **Calculate estimate**, নগদ advance, **কাস্টমারের নিজের সোনা** (যেমন 8 g 22K)। Book করুন।
   - Advance = নগদ + সোনার দাম দেখাচ্ছে কি না
   - Raw materials-এ "Customer gold (orders)" এসেছে
2. Order page → **Add advance**, **সোনা ও উপকরণ → Customer gold** (আরও সোনা), ভুল entry **Remove**।
3. **Start work** → **Finish item**:
   - কাস্টমারের সোনা নিজে থেকে বসে; বাকিটা দোকানের stock থেকে যোগ করুন
   - কারিগরের মজুরি দিন
   - ঘাটতি (wastage) হিসাব দেখাচ্ছে
4. "সোনা ও উপকরণ" card-এ customer/shop সোনা, wastage, production cost ঠিক আছে কি না।
5. **Products**-এ এই piece **দেখা যাবে না** — check করুন।
6. **Mark ready** → **Create bill** → advance (নগদ + সোনা) কেটে বাকি টাকা নিন → order **Delivered**।
7. আরেকটা order **Cancel** করুন → না-ব্যবহৃত সোনা ফেরত, নগদ refund।

## ধাপ ৯ — Accounts

| Module | কী test করবেন |
|---|---|
| **Expenses** | Rent, electricity ইত্যাদি (cash/bank); ভবিষ্যতের তারিখ নেয় না; edit/void |
| **Profit & loss** | Sales, purchase, expense, karigar charge মিলিয়ে লাভ-ক্ষতি; ধাপ ৫–৮-এর সংখ্যার সাথে মেলে |

## ধাপ ১০ — HR & Payroll

1. **Employees** → নতুন employee (branch, বেতন)।
2. **Attendance** → কয়েক দিনের হাজিরা (present, absent, half day)।
3. **Salary advances** → advance দিন (কিস্তি সহ)।
4. **Payroll** → গত মাসের payroll তৈরি → absent-এর বেতন কাটে, advance-এর কিস্তি কাটে → **Finalise** → **Pay**।

## ধাপ ১১ — Overview (শেষে সব মিলিয়ে)

| Module | কী test করবেন |
|---|---|
| **Dashboard** | আজকের বিক্রি, stock, বাকি, ready order — আগের ধাপের সাথে মেলে |
| **Reports** | Sales, stock, GST, customer due, old gold report — তারিখ ও branch filter |
| **Audit log** | কে কখন কী করেছে সব আছে |

## ধাপ ১২ — শেষ check

- **Branch user** দিয়ে login → শুধু নিজের branch-এর data, settings দেখা যায় না।
- **Mobile** (ফোন বা browser-এর ছোট screen): billing, order, products, customers ঠিকমতো দেখা যায় ও কাজ করে।
- ভাষা **বাংলা / हिन्दी** বদলে কয়েকটা page দেখুন।
- Product delete, category delete — যেগুলো ব্যবহার হয়েছে সেগুলো আটকায় কি না।

---

**কোনো ধাপে সমস্যা পেলে:** কোন page, কী করলেন, কী দেখালেন (screenshot) — লিখে রাখুন, তারপর পরের ধাপে যান।
