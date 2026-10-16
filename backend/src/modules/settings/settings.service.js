import { PRINT_DESIGNS } from '@jerp/shared';
import { SETTINGS_SCHEMAS } from '@jerp/shared/schemas';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { diffChanges } from '../../utils/diff.js';
import { requireBranch } from '../inventory/inventory.helpers.js';
import { DEFAULT_SETTINGS } from './settings.defaults.js';
import { Settings } from './settings.model.js';

const SECTIONS = Object.keys(DEFAULT_SETTINGS);

// Before Print settings existed, the paper size was chosen under Invoice: keep that choice until Print is saved.
const legacyPrint = (doc) => {
  const size = doc?.invoice?.defaultFormat;
  return !doc?.print && PRINT_DESIGNS[size] ? { size, design: PRINT_DESIGNS[size][0] } : {};
};

const withDefaults = (doc) =>
  Object.fromEntries(SECTIONS.map((s) => [s, { ...DEFAULT_SETTINGS[s], ...(s === 'print' ? legacyPrint(doc) : {}), ...(doc?.[s] ?? {}) }]));

/** The paper size and design a branch prints invoices with: its own choice, or the organisation's. */
export function printChoiceFor(print, branchId) {
  const own = print.branches?.find((b) => String(b.branchId) === String(branchId));
  return own ? { size: own.size, design: own.design } : { size: print.size, design: print.design };
}

export async function createDefaultSettings(session) {
  await Settings.create([structuredClone(DEFAULT_SETTINGS)], { session });
}

export async function getSettings() {
  const doc = await Settings.findOne({}).lean();
  return { ...withDefaults(doc), updatedAt: doc?.updatedAt ?? null };
}

export async function getSection(section) {
  return (await getSettings())[section];
}

export async function updateSection(section, input) {
  const { userId } = requireContext();
  const current = await getSettings();
  // Print without `branches` changes only the organisation default; each branch keeps its own choice.
  const body = section === 'print' && input?.branches === undefined ? { ...input, branches: current.print.branches } : input;
  const value = SETTINGS_SCHEMAS[section].parse(body);
  const changes = diffChanges(current[section], value, Object.keys(value));
  if (!changes.length) return current;

  await Settings.findOneAndUpdate({}, { $set: { [section]: value, updatedBy: userId } }, { upsert: true, setDefaultsOnInsert: true });
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'settings', recordType: 'Settings', meta: { section }, changes });
  return getSettings();
}

/**
 * One branch's print setup, as its own users see it: its choice (null: the organisation's), the organisation's default,
 * and what Invoice settings put on the page (for the preview). Nothing else of the organisation's settings.
 */
export async function getBranchPrint(branchId) {
  const branch = await requireBranch(branchId, { active: false });
  const { print, invoice } = await getSettings();
  const own = print.branches.find((b) => String(b.branchId) === String(branch._id));
  const { copies, showHsn, showHuid, showWeightBreakup, showRateTable, signatoryLabel, terms, footerNote } = invoice;
  return {
    branch: { id: branch._id, name: branch.name },
    choice: own ? { size: own.size, design: own.design } : null,
    organisation: { size: print.size, design: print.design },
    invoice: { copies, showHsn, showHuid, showWeightBreakup, showRateTable, signatoryLabel, terms, footerNote },
  };
}

/**
 * A branch chooses its own print size and design (or goes back to the organisation's, with `choice` null). Only for
 * a branch the user can work in; the rest of Print settings stays as the organisation set it.
 */
export async function updateBranchPrint(branchId, choice) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId, { active: false });
  const { print } = await getSettings();
  const own = (p) => p.branches.find((b) => String(b.branchId) === String(branchId)) ?? null;
  const before = own(print) && { size: own(print).size, design: own(print).design };
  const changes = diffChanges({ print: before }, { print: choice }, ['print']);
  if (!changes.length) return getBranchPrint(branchId);

  const branches = [...print.branches.filter((b) => String(b.branchId) !== String(branchId)), ...(choice ? [{ branchId: String(branchId), ...choice }] : [])];
  await Settings.findOneAndUpdate({}, { $set: { print: { ...print, branches }, updatedBy: userId } }, { upsert: true, setDefaultsOnInsert: true });
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'settings', recordType: 'Settings', meta: { section: 'print', branch: branch.name }, changes });
  return getBranchPrint(branchId);
}
