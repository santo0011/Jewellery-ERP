const MODULE_LABELS = { auth: 'Sign-in & security', organisation: 'Organisation', branch: 'Branches', role: 'Roles', user: 'Users', settings: 'Settings', customer: 'Customers', supplier: 'Suppliers', category: 'Categories', product: 'Products', rate: 'Metal rates', inventory: 'Inventory', approval: 'Approvals' };

export const moduleLabel = (module) => MODULE_LABELS[module] ?? module;

const SECTION_LABELS = { invoice: 'invoice', tax: 'tax & GST', jewellery: 'jewellery', barcode: 'barcode' };

export function describeEntry(e) {
  const name = e.meta?.name ? ` “${e.meta.name}”` : '';
  switch (`${e.module}.${e.action}`) {
    case 'auth.login':
      return 'Signed in';
    case 'auth.login_failed':
      return e.meta?.locked ? 'Wrong password — account locked temporarily' : 'Wrong password entered';
    case 'auth.logout':
      return 'Signed out';
    case 'auth.session_revoke':
      return e.meta?.all ? 'Signed out of all devices' : 'Signed out a device';
    case 'auth.password_change':
      return 'Changed own password';
    case 'auth.password_reset':
      return 'Reset password using email link';
    case 'auth.token_reuse':
      return 'A reused sign-in token was blocked and the session ended';
    case 'user.password_reset':
      return 'Set a temporary password for a user';
    case 'settings.update':
      return `Updated ${SECTION_LABELS[e.meta?.section] ?? ''} settings`;
    case 'rate.create':
      return `Updated ${e.meta?.count ?? ''} metal rate(s)`;
    case 'organisation.create':
      return 'Organisation created';
    default:
      return `${recordLabel(e)}${name}`;
  }
}

const RECORD_LABELS = { User: 'User', Branch: 'Branch', Role: 'Role', Organisation: 'Organisation', Settings: 'Settings', Session: 'Session', Customer: 'Customer', Supplier: 'Supplier', Category: 'Category', Product: 'Product', MetalRate: 'Metal rates', StockEntry: 'Stock entry', StockTransfer: 'Transfer', ApprovalRequest: 'Approval' };

export const recordLabel = (e) => RECORD_LABELS[e.recordType] ?? moduleLabel(e.module);

const FIELD_LABELS = { roleIds: 'roles', defaultBranchId: 'default branch', branchAccess: 'branch access', stateCode: 'state', logo: 'logo', categoryId: 'category', subcategoryId: 'subcategory', supplierId: 'supplier', branchId: 'branch', huid: 'HUID', pan: 'PAN', gstin: 'GSTIN' };

export function fieldLabel(field) {
  const last = field.split('.').pop();
  if (FIELD_LABELS[last]) return FIELD_LABELS[last];
  return last
    .replace(/(Paise|Bps|Mm)$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
}
