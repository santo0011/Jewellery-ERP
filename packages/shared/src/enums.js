export const ORG_STATUS = Object.freeze({ ACTIVE: 'active', SUSPENDED: 'suspended' });

export const PLATFORM_ROLES = Object.freeze({ SUPER_ADMIN: 'SUPER_ADMIN' });

export const USER_STATUS = Object.freeze({ ACTIVE: 'active', DISABLED: 'disabled' });

export const BRANCH_STATUS = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' });

export const SUBSCRIPTION_STATUS = Object.freeze({
  TRIAL: 'trial',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
});

export const PLAN_KEYS = Object.freeze({ TRIAL: 'trial', BASIC: 'basic', PROFESSIONAL: 'professional', ENTERPRISE: 'enterprise' });

export const PLAN_LIMITS = Object.freeze({
  trial: { users: 5, branches: 2, products: 1000 },
  basic: { users: 5, branches: 1, products: 5000 },
  professional: { users: 25, branches: 5, products: 50000 },
  enterprise: { users: null, branches: null, products: null },
});

export const METALS = Object.freeze({ GOLD: 'gold', SILVER: 'silver', PLATINUM: 'platinum' });

export const PURITIES = Object.freeze({
  gold: [
    { fineness: 999, label: '24K (999)' },
    { fineness: 995, label: '24K (995)' },
    { fineness: 916, label: '22K (916)' },
    { fineness: 833, label: '20K (833)' },
    { fineness: 750, label: '18K (750)' },
    { fineness: 585, label: '14K (585)' },
  ],
  silver: [
    { fineness: 999, label: 'Fine silver (999)' },
    { fineness: 925, label: 'Sterling (925)' },
  ],
  platinum: [{ fineness: 950, label: 'Platinum (950)' }],
});

export const INDIAN_STATES = Object.freeze([
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
]);

export const STATE_CODES = INDIAN_STATES.map((s) => s.code);

export const stateName = (code) => INDIAN_STATES.find((s) => s.code === code)?.name ?? '';

export const TIMEZONES = Object.freeze(['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Kathmandu', 'Asia/Dhaka', 'Europe/London', 'America/New_York']);

export const CURRENCIES = Object.freeze(['INR']);

export const INVOICE_FORMATS = Object.freeze({ A4: 'a4', THERMAL_80: 'thermal80' });

export const ROUND_OFF_MODES = Object.freeze({ NONE: 'none', NEAREST_RUPEE: 'nearest_rupee', NEAREST_TEN: 'nearest_ten' });

export const WASTAGE_MODES = Object.freeze({ PERCENT: 'percent', WEIGHT: 'weight', NONE: 'none' });

export const MAKING_CHARGE_TYPES = Object.freeze({ PER_GRAM: 'per_gram', PERCENT: 'percent', FIXED: 'fixed' });

export const CASH_LIMIT_ACTIONS = Object.freeze({ WARN: 'warn', BLOCK: 'block' });

export const BARCODE_SYMBOLOGIES = Object.freeze({ CODE128: 'code128', QR: 'qr' });

export const SETTINGS_SECTIONS = Object.freeze(['invoice', 'tax', 'jewellery', 'barcode', 'approvals']);

export const AUDIT_MODULES = Object.freeze([
  'auth', 'organisation', 'branch', 'role', 'user', 'settings', 'customer', 'supplier', 'category', 'product', 'rate', 'inventory', 'approval', 'sales', 'order',
  'employee', 'attendance', 'payroll',
]);

export const AUDIT_ACTION_LABELS = Object.freeze({
  login: 'Signed in',
  login_failed: 'Failed sign-in',
  logout: 'Signed out',
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  status_change: 'Status changed',
  password_change: 'Changed password',
  password_reset: 'Password reset',
  session_revoke: 'Session revoked',
  token_reuse: 'Token reuse detected',
  submit: 'Submitted',
  approve: 'Approved',
  reject: 'Rejected',
  post: 'Posted',
  dispatch: 'Dispatched',
  receive: 'Received',
  cancel: 'Cancelled',
  return: 'Returned',
});

export const RECORD_STATUS = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' });

export const CUSTOMER_SEGMENTS = Object.freeze([
  { value: 'new', label: 'New' },
  { value: 'regular', label: 'Regular' },
  { value: 'vip', label: 'VIP' },
  { value: 'high_value', label: 'High value' },
  { value: 'inactive', label: 'Inactive' },
]);

export const KYC_DOC_TYPES = Object.freeze([
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN card' },
  { value: 'passport', label: 'Passport' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'driving_licence', label: 'Driving licence' },
]);

export const SUPPLIER_SUPPLIES = Object.freeze([
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'diamond', label: 'Diamonds' },
  { value: 'stones', label: 'Precious stones' },
  { value: 'jewellery', label: 'Finished jewellery' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'other', label: 'Other' },
]);

export const METAL_OPTIONS = Object.freeze([
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'platinum', label: 'Platinum' },
]);

export const JEWELLERY_TYPES = Object.freeze([
  { value: 'plain_gold', label: 'Plain gold' },
  { value: 'studded_gold', label: 'Studded gold' },
  { value: 'diamond', label: 'Diamond jewellery' },
  { value: 'silver', label: 'Silver jewellery' },
  { value: 'platinum', label: 'Platinum jewellery' },
  { value: 'coin_bar', label: 'Coin / bar' },
]);

export const STONE_TYPES = Object.freeze([
  { value: 'diamond', label: 'Diamond' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'sapphire', label: 'Sapphire' },
  { value: 'pearl', label: 'Pearl' },
  { value: 'polki', label: 'Polki' },
  { value: 'kundan', label: 'Kundan' },
  { value: 'cz', label: 'CZ / American diamond' },
  { value: 'beads', label: 'Beads' },
  { value: 'other', label: 'Other' },
]);

export const STOCK_TYPES = Object.freeze({ TAGGED: 'tagged', LOT: 'lot' });

export const PRICING_MODES = Object.freeze({ RATE_BASED: 'rate_based', FIXED: 'fixed' });

export const PRODUCT_STATUS = Object.freeze({
  DRAFT: 'draft',
  IN_STOCK: 'in_stock',
  RESERVED: 'reserved',
  SOLD: 'sold',
  WITH_KARIGAR: 'with_karigar',
  IN_REPAIR: 'in_repair',
  IN_TRANSIT: 'in_transit',
  RETURNED: 'returned',
  MELTED: 'melted',
  WRITTEN_OFF: 'written_off',
});

export const PRODUCT_STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  in_stock: 'In stock',
  reserved: 'Reserved',
  sold: 'Sold',
  with_karigar: 'With karigar',
  in_repair: 'In repair',
  in_transit: 'In transit',
  returned: 'Returned',
  melted: 'Melted',
  written_off: 'Written off',
});

export const METAL_POOL_KINDS = Object.freeze([
  { value: 'bullion', label: 'Bullion / fine metal' },
  { value: 'old_gold', label: 'Old gold / old metal' },
  { value: 'scrap', label: 'Scrap & filings' },
]);

export const ADJUSTMENT_REASONS = Object.freeze([
  { value: 'lost', label: 'Lost / missing' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'melted', label: 'Melted' },
  { value: 'theft', label: 'Theft' },
  { value: 'weight_correction', label: 'Weight correction' },
  { value: 'found', label: 'Found / recount' },
  { value: 'other', label: 'Other' },
]);

export const STOCK_DOC_STATUS = Object.freeze({ PENDING_APPROVAL: 'pending_approval', POSTED: 'posted', REJECTED: 'rejected' });

export const TRANSFER_STATUS = Object.freeze({ IN_TRANSIT: 'in_transit', RECEIVED: 'received', REJECTED: 'rejected' });

export const MOVEMENT_TYPE_LABELS = Object.freeze({
  opening: 'Opening stock',
  adjustment_in: 'Adjustment in',
  adjustment_out: 'Adjustment out',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  transfer_return: 'Transfer returned',
  sale: 'Sale',
  sale_cancel: 'Sale cancelled',
  sales_return: 'Sales return',
});

export const APPROVAL_STATUS = Object.freeze({ PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' });

export const DEFAULT_CATEGORIES = Object.freeze([
  { name: 'Ring', hsnCode: '7113' },
  { name: 'Necklace', hsnCode: '7113' },
  { name: 'Earrings', hsnCode: '7113' },
  { name: 'Bracelet', hsnCode: '7113' },
  { name: 'Bangles', hsnCode: '7113' },
  { name: 'Chain', hsnCode: '7113' },
  { name: 'Pendant', hsnCode: '7113' },
  { name: 'Nose Pin', hsnCode: '7113' },
  { name: 'Anklet', hsnCode: '7113' },
  { name: 'Mangalsutra', hsnCode: '7113' },
  { name: 'Diamond Jewellery', hsnCode: '7113' },
  { name: 'Silver Jewellery', hsnCode: '7113', defaultMetal: 'silver' },
  { name: 'Custom Jewellery', hsnCode: '7113' },
]);

export const PAYMENT_MODES = Object.freeze([
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'credit', label: 'Customer credit' },
]);

export const SALE_STATUS = Object.freeze({ COMPLETED: 'completed', CANCELLED: 'cancelled' });

export const ORDER_STATUS = Object.freeze({ BOOKED: 'booked', IN_PROGRESS: 'in_progress', READY: 'ready', DELIVERED: 'delivered', CANCELLED: 'cancelled' });

export const ORDER_STATUS_LABELS = Object.freeze({ booked: 'Booked', in_progress: 'In progress', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' });

/** Orders that can still be worked on or billed. */
export const OPEN_ORDER_STATUSES = Object.freeze([ORDER_STATUS.BOOKED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.READY]);

/** Money taken as an order advance (customer credit is not an advance). */
export const ADVANCE_PAYMENT_MODES = Object.freeze(['cash', 'card', 'upi', 'bank']);

// HR & payroll. Days with no attendance mark count as present; absent is unpaid, a half day is half paid.
export const ATTENDANCE_STATUSES = Object.freeze([
  { value: 'present', label: 'Present', short: 'P', paidFraction: 1 },
  { value: 'absent', label: 'Absent', short: 'A', paidFraction: 0 },
  { value: 'half_day', label: 'Half day', short: 'H', paidFraction: 0.5 },
  { value: 'paid_leave', label: 'Paid leave', short: 'L', paidFraction: 1 },
  { value: 'holiday', label: 'Holiday / week off', short: 'W', paidFraction: 1 },
]);

export const EMPLOYMENT_STATUS = Object.freeze({ ACTIVE: 'active', LEFT: 'left' });

export const PAYROLL_STATUS = Object.freeze({ DRAFT: 'draft', FINALISED: 'finalised', PAID: 'paid' });

export const SALARY_PAYMENT_MODES = Object.freeze(['cash', 'bank', 'upi']);
