import { t } from '../../i18n/index.js';
const MODULE_LABELS = { auth: t('Sign-in & security'), organisation: t('Organisation'), branch: t('Branches'), role: t('Roles'), user: t('Users'), settings: t('Settings'), customer: t('Customers'), supplier: t('Suppliers'), category: t('Categories'), product: t('Products'), rate: t('Metal rates'), inventory: t('Inventory'), approval: t('Approvals'), oldgold: t('Old gold') };

export const moduleLabel = (module) => MODULE_LABELS[module] ?? module;

const SECTION_LABELS = { invoice: 'invoice', tax: t('tax & GST'), jewellery: 'jewellery', barcode: 'barcode', print: 'print' };

export function describeEntry(e) {
  const name = e.meta?.name ? ` “${e.meta.name}”` : '';
  switch (`${e.module}.${e.action}`) {
    case 'auth.login':
      return t('Signed in');
    case 'auth.login_failed':
      return e.meta?.locked ? t('Wrong password — account locked temporarily') : t('Wrong password entered');
    case 'auth.logout':
      return t('Signed out');
    case 'auth.session_revoke':
      return e.meta?.all ? t('Signed out of all devices') : t('Signed out a device');
    case 'auth.password_change':
      return t('Changed own password');
    case 'auth.password_reset':
      return t('Reset password using email link');
    case 'auth.token_reuse':
      return t('A reused sign-in token was blocked and the session ended');
    case 'user.password_reset':
      return t('Set a temporary password for a user');
    case 'settings.update':
      return t('Updated {{value}} settings', { value: SECTION_LABELS[e.meta?.section] ?? '' });
    case 'rate.create':
      return t('Updated {{value}} metal rate(s)', { value: e.meta?.count ?? '' });
    case 'organisation.create':
      return t('Organisation created');
    default:
      return `${recordLabel(e)}${name}`;
  }
}

const RECORD_LABELS = { User: t('User'), Branch: t('Branch'), Role: t('Role'), Organisation: t('Organisation'), Settings: t('Settings'), Session: t('Session'), Customer: t('Customer'), Supplier: t('Supplier'), Category: t('Category'), Product: t('Product'), MetalRate: t('Metal rates'), StockEntry: t('Stock entry'), StockTransfer: t('Transfer'), ApprovalRequest: t('Approval'), OldGold: t('Old gold') };

export const recordLabel = (e) => RECORD_LABELS[e.recordType] ?? moduleLabel(e.module);

const FIELD_LABELS = { roleIds: 'roles', defaultBranchId: t('default branch'), branchAccess: t('branch access'), stateCode: 'state', logo: 'logo', categoryId: 'category', subcategoryId: 'subcategory', supplierId: 'supplier', branchId: 'branch', huid: 'HUID', pan: 'PAN', gstin: 'GSTIN' };

export function fieldLabel(field) {
  const last = field.split('.').pop();
  if (FIELD_LABELS[last]) return t(FIELD_LABELS[last]);
  return t(
    last
      .replace(/(Paise|Bps|Mm)$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase(),
  );
}
