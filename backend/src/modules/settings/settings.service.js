import { SETTINGS_SCHEMAS } from '@jerp/shared/schemas';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { diffChanges } from '../../utils/diff.js';
import { DEFAULT_SETTINGS } from './settings.defaults.js';
import { Settings } from './settings.model.js';

const SECTIONS = Object.keys(DEFAULT_SETTINGS);

const withDefaults = (doc) =>
  Object.fromEntries(SECTIONS.map((s) => [s, { ...DEFAULT_SETTINGS[s], ...(doc?.[s] ?? {}) }]));

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
  const value = SETTINGS_SCHEMAS[section].parse(input);
  const current = await getSettings();
  const changes = diffChanges(current[section], value, Object.keys(value));
  if (!changes.length) return current;

  await Settings.findOneAndUpdate({}, { $set: { [section]: value, updatedBy: userId } }, { upsert: true, setDefaultsOnInsert: true });
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'settings', recordType: 'Settings', meta: { section }, changes });
  return getSettings();
}
