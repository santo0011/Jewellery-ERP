import { metalShortfall } from '../undo/undo.helpers.js';
import { OldGold } from './oldGold.model.js';
import { cancelOldGold } from './oldGold.service.js';

export const oldGoldUndoHandlers = [
  {
    // Cancelled, not deleted: the metal leaves Raw materials again and the payout's entry is reversed.
    type: 'oldgold.create',
    title: 'Old gold bought',
    mode: 'reversal',
    permission: 'oldgold.create',
    async check(entry) {
      const og = await OldGold.findById(entry.recordId).lean();
      if (!og || og.status !== 'completed') return { superseded: true, reason: 'Already cancelled' };
      const short = await metalShortfall(og.branchId, og.lines.map((l) => ({ metal: l.metal, purity: l.purity, kind: 'old_gold', grossWeightMg: l.netWeightMg })));
      if (short) return { ok: false, reason: short };
      return { ok: true, effect: `Cancels ${og.docNo}: the old gold leaves Raw materials and the payout entry is reversed (the money comes back).` };
    },
    run: async (entry, { reason }) => {
      await cancelOldGold(entry.recordId, { reason });
    },
  },
];
