import { z } from 'zod';
import { listQuerySchema, objectIdSchema } from './common.js';

/** Why an action is being undone (or kept): always asked, kept with the action for good. */
export const undoReasonSchema = z.object({ reason: z.string().trim().min(5, 'Give a reason (at least 5 letters)').max(300) });

export const UNDO_STATUSES = ['active', 'undone', 'dismissed', 'superseded'];

export const undoHistoryQuerySchema = listQuerySchema.extend({
  scope: z.enum(['organisation', 'branch']).optional(),
  branchId: objectIdSchema.optional(),
  status: z.enum(UNDO_STATUSES).optional(),
  module: z.string().trim().max(40).optional(),
});

export const platformUndoHistoryQuerySchema = listQuerySchema.extend({ status: z.enum(UNDO_STATUSES).optional() });
