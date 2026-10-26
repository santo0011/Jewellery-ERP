import { sameValues } from '../undo/undo.snapshot.js';
import { getBranchPrint, getSettings, updateBranchPrint, updateSection } from './settings.service.js';

export const settingsUndoHandlers = [
  {
    type: 'settings.update',
    title: 'Settings changed',
    mode: 'undo',
    permission: 'settings.edit',
    async check(entry) {
      const current = (await getSettings())[entry.data.section];
      if (!sameValues(current, entry.data.after)) return { ok: false, reason: 'These settings were changed again since.' };
      return { ok: true, effect: `Puts the ${entry.data.section} settings back as they were.` };
    },
    run: (entry) => updateSection(entry.data.section, entry.data.before),
  },
  {
    type: 'settings.branchPrint',
    title: 'Branch print layout changed',
    mode: 'undo',
    permission: 'settings.edit',
    async check(entry) {
      const { choice } = await getBranchPrint(entry.data.branchId);
      if (!sameValues(choice, entry.data.after)) return { ok: false, reason: 'The branch’s print layout was changed again since.' };
      return { ok: true, effect: entry.data.before ? 'Puts the branch’s print layout back as it was.' : 'The branch uses the organisation’s print layout again.' };
    },
    run: (entry) => updateBranchPrint(entry.data.branchId, entry.data.before),
  },
];
